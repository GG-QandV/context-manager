"""
ONNX Embedder — TEI replacement for Windows 10/11.
API compatible with HuggingFace TEI: POST /embed {inputs} → [[float]]

Spec: docs/SPEC_ONNX_EMBEDDER.md
"""
import os
import logging
from pathlib import Path
from typing import Union

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("embed")

MODEL_DIR = Path(os.getenv("MODEL_DIR", r"C:\context-manager\models\multilingual-e5-small_Q8\onnx"))
HOST      = os.getenv("EMBED_HOST", "127.0.0.1")
PORT      = int(os.getenv("EMBED_PORT", "8080"))
MAX_LEN   = int(os.getenv("MAX_SEQ_LEN", "512"))

app = FastAPI(title="ONNX Embedder")

# ── Global objects (initialized on startup) ─────────────────────────
_tokenizer: Tokenizer | None = None
_session: ort.InferenceSession | None = None
_input_names: list[str] = []


def _load_model() -> None:
    global _tokenizer, _session, _input_names

    tokenizer_path = MODEL_DIR / "tokenizer.json"
    if not tokenizer_path.exists():
        raise FileNotFoundError(f"tokenizer.json not found in {MODEL_DIR}")

    _tokenizer = Tokenizer.from_file(str(tokenizer_path))
    _tokenizer.enable_padding(pad_id=0, pad_token="[PAD]", length=None)
    _tokenizer.enable_truncation(max_length=MAX_LEN)

    # Try quantized/optimized model first, then the default one
    for name in ("model_optimized.onnx", "model_quantized.onnx", "model.onnx"):
        onnx_path = MODEL_DIR / name
        if onnx_path.exists():
            break
    else:
        raise FileNotFoundError(f"No .onnx model file found in {MODEL_DIR}")

    opts = ort.SessionOptions()
    opts.enable_cpu_mem_arena = False   # prevents uncontrolled RSS growth
    opts.enable_mem_pattern = False     # prevents uncontrolled RSS growth
    opts.inter_op_num_threads = int(os.getenv("ORT_INTER_THREADS", "2"))
    opts.intra_op_num_threads = int(os.getenv("ORT_INTRA_THREADS", "4"))
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

    _session = ort.InferenceSession(str(onnx_path), sess_options=opts)
    _input_names = [inp.name for inp in _session.get_inputs()]

    logger.info(f"Model loaded: {onnx_path.name}, inputs: {_input_names}")


def _mean_pool(last_hidden: np.ndarray, attention_mask: np.ndarray) -> np.ndarray:
    """Mean pooling taking mask into account (similar to TEI --pooling mean).

    Why attention_mask: padding tokens must not contribute to the average.
    Without a mask, the vector of a short text will be diluted with zeros from padding.
    """
    mask = attention_mask[..., np.newaxis].astype(np.float32)
    summed = (last_hidden * mask).sum(axis=1)
    counts = mask.sum(axis=1).clip(min=1e-9)
    return summed / counts


def _normalize(vectors: np.ndarray) -> np.ndarray:
    """L2 normalization (TEI does this by default for the /embed endpoint).

    Mandatory: without normalization, cosine similarity in Qdrant will be incorrect.
    """
    norms = np.linalg.norm(vectors, axis=1, keepdims=True).clip(min=1e-9)
    return vectors / norms


def _embed(texts: list[str]) -> list[list[float]]:
    assert _tokenizer is not None and _session is not None

    encoded = _tokenizer.encode_batch(texts)

    input_ids      = np.array([e.ids for e in encoded],            dtype=np.int64)
    attention_mask = np.array([e.attention_mask for e in encoded], dtype=np.int64)
    token_type_ids = np.zeros_like(input_ids,                      dtype=np.int64)

    # Feed only inputs expected by the model (different ONNX exports vary)
    feed: dict = {}
    if "input_ids"      in _input_names: feed["input_ids"]      = input_ids
    if "attention_mask" in _input_names: feed["attention_mask"] = attention_mask
    if "token_type_ids" in _input_names: feed["token_type_ids"] = token_type_ids

    outputs = _session.run(None, feed)
    # outputs[0] — last_hidden_state shape: (batch, seq_len, hidden_dim)
    last_hidden = outputs[0].astype(np.float32)

    pooled     = _mean_pool(last_hidden, attention_mask)
    normalized = _normalize(pooled)

    return normalized.tolist()


# ── Request model ─────────────────────────────────────────────────────────────

class EmbedRequest(BaseModel):
    inputs: Union[str, list[str]]


# ── Routes ────────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup() -> None:
    _load_model()
    logger.info(f"Embedder ready on {HOST}:{PORT}")


@app.get("/health")
async def health() -> dict:
    if _session is None:
        raise HTTPException(503, "Model not loaded")
    return {"status": "ok"}


@app.post("/embed")
async def embed(req: EmbedRequest) -> JSONResponse:
    if _session is None:
        raise HTTPException(503, "Model not loaded")
    texts = [req.inputs] if isinstance(req.inputs, str) else req.inputs
    if not texts:
        raise HTTPException(400, "inputs must not be empty")
    try:
        vectors = _embed(texts)
    except Exception as e:
        logger.error(f"Embed error: {e}", exc_info=True)
        raise HTTPException(500, str(e))
    return JSONResponse(content=vectors)


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
