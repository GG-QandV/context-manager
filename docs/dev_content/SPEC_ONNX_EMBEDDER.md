# SPEC: ONNX Embedder — замена TEI для Windows 10/11

> Версия: 1.0 | Статус: готово к реализации

---

## Назначение

Заменить `ghcr.io/huggingface/text-embeddings-inference` (Linux-only Docker) на нативный Python HTTP-сервер, совместимый с TEI API. Запускается как Windows Service через nssm.

---

## Контракт API (совместимость с TEI)

Context Manager вызывает TEI так (`embedding.service.ts`):

```typescript
const response = await axios.post(`${this.url}/embed`, { inputs: text });
return response.data[0];  // берёт первый элемент массива
```

**Endpoint:** `POST /embed`  
**Request:**
```json
{ "inputs": "текст для эмбеддинга" }
```
или batch:
```json
{ "inputs": ["текст 1", "текст 2"] }
```

**Response:**
```json
[[0.123, -0.456, ...]]          // single: массив из одного вектора
[[...], [...]]                   // batch: массив векторов
```

**Health check:** `GET /health` → `{"status": "ok"}` (собственный endpoint embedder'а, не Context Manager)  
**Порт:** `8080` (совпадает с TEI в docker-compose)

---

## Модель

| Параметр | Значение |
|----------|----------|
| Название | multilingual-e5-small |
| Размерность | 384 |
| Квантование | INT8 (ONNX) |
| Размер файла | ~40 MB |
| Pooling | mean (с attention_mask) |
| Нормализация | L2 (обязательно — так делает TEI) |
| Исходник | HuggingFace: `intfloat/multilingual-e5-small` |

**Путь к модели (Windows):**
```
C:\context-manager\models\multilingual-e5-small_Q8\onnx\
```
Содержимое директории (то же что монтируется в TEI контейнер):
```
model_optimized.onnx   (или model_quantized.onnx, или model.onnx — зависит от экспорта)
tokenizer.json
tokenizer_config.json
special_tokens_map.json
config.json
vocab.txt (если есть)
sentencepiece.bpe.model (если есть)
```

**Как получить модель:**
```powershell
# Вариант 1 — из существующего Docker volume (если Docker был установлен)
# docker cp tei-embeddings:/data C:\context-manager\models\multilingual-e5-small_Q8\onnx

# Вариант 2 — скачать через huggingface_hub
pip install huggingface_hub
python -c "
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id='intfloat/multilingual-e5-small',
    repo_type='model',
    local_dir=r'C:\context-manager\models\multilingual-e5-small_Q8\onnx',
    allow_patterns=['*.onnx', 'tokenizer*', 'config.json', 'special_tokens*', 'vocab*', '*.model']
)
"
```

---

## Реализация: `embed/embed_server.py`

**Путь:** `C:\context-manager\embed\embed_server.py`

```python
"""
ONNX Embedder — замена TEI для Windows.
API-совместим с HuggingFace TEI: POST /embed {inputs} → [[float]]
"""
import os
import json
import logging
import numpy as np
from pathlib import Path
from typing import Union

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

# ── Глобальные объекты (инициализируются при старте) ─────────────────
_tokenizer: Tokenizer | None = None
_session:   ort.InferenceSession | None = None
_input_names: list[str] = []


def _load_model() -> None:
    global _tokenizer, _session, _input_names

    tokenizer_path = MODEL_DIR / "tokenizer.json"
    if not tokenizer_path.exists():
        raise FileNotFoundError(f"tokenizer.json not found in {MODEL_DIR}")

    _tokenizer = Tokenizer.from_file(str(tokenizer_path))
    _tokenizer.enable_padding(pad_id=0, pad_token="[PAD]", length=None)
    _tokenizer.enable_truncation(max_length=MAX_LEN)

    # Пробуем quantized модель, потом обычную
    for name in ("model_optimized.onnx", "model_quantized.onnx", "model.onnx"):
        onnx_path = MODEL_DIR / name
        if onnx_path.exists():
            break
    else:
        raise FileNotFoundError(f"No .onnx model file found in {MODEL_DIR}")

    opts = ort.SessionOptions()
    opts.inter_op_num_threads = int(os.getenv("ORT_INTER_THREADS", "2"))
    opts.intra_op_num_threads = int(os.getenv("ORT_INTRA_THREADS", "4"))
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

    _session = ort.InferenceSession(str(onnx_path), sess_options=opts)
    _input_names = [inp.name for inp in _session.get_inputs()]

    logger.info(f"Model loaded: {onnx_path.name}, inputs: {_input_names}")


def _mean_pool(last_hidden: np.ndarray, attention_mask: np.ndarray) -> np.ndarray:
    """Mean pooling с учётом маски (как в TEI --pooling mean)."""
    mask = attention_mask[..., np.newaxis].astype(np.float32)
    summed = (last_hidden * mask).sum(axis=1)
    counts = mask.sum(axis=1).clip(min=1e-9)
    return summed / counts


def _normalize(vectors: np.ndarray) -> np.ndarray:
    """L2 нормализация (TEI делает это по умолчанию)."""
    norms = np.linalg.norm(vectors, axis=1, keepdims=True).clip(min=1e-9)
    return vectors / norms


def _embed(texts: list[str]) -> list[list[float]]:
    assert _tokenizer is not None and _session is not None

    encoded = _tokenizer.encode_batch(texts)

    input_ids      = np.array([e.ids for e in encoded],       dtype=np.int64)
    attention_mask = np.array([e.attention_mask for e in encoded], dtype=np.int64)
    token_type_ids = np.zeros_like(input_ids, dtype=np.int64)

    feed: dict = {}
    if "input_ids"      in _input_names: feed["input_ids"]      = input_ids
    if "attention_mask" in _input_names: feed["attention_mask"] = attention_mask
    if "token_type_ids" in _input_names: feed["token_type_ids"] = token_type_ids

    outputs = _session.run(None, feed)
    # outputs[0] — last_hidden_state shape (batch, seq_len, hidden)
    last_hidden = outputs[0].astype(np.float32)

    pooled     = _mean_pool(last_hidden, attention_mask)
    normalized = _normalize(pooled)

    return normalized.tolist()


# ── Request models ────────────────────────────────────────────────────

class EmbedRequest(BaseModel):
    inputs: Union[str, list[str]]


# ── Routes ───────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    _load_model()
    logger.info(f"Embedder ready on {HOST}:{PORT}")


@app.get("/health")
async def health():
    if _session is None:
        raise HTTPException(503, "Model not loaded")
    return {"status": "ok"}


@app.post("/embed")
async def embed(req: EmbedRequest):
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
```

---

## Зависимости Python

**Файл:** `embed/requirements.txt`

```
onnxruntime>=1.17.0
tokenizers>=0.19.0
fastapi>=0.111.0
uvicorn>=0.30.0
numpy>=1.26.0
pydantic>=2.0.0
```

**Установка:**
```powershell
pip install -r C:\context-manager\embed\requirements.txt
```

**Python версия:** 3.10+ (3.12 рекомендуется)

---

## nssm конфигурация

```powershell
nssm install cm-embed "C:\Python312\python.exe"
nssm set cm-embed AppParameters "-m uvicorn embed_server:app --host 127.0.0.1 --port 8080 --log-level info"
nssm set cm-embed AppDirectory "C:\context-manager\embed"
nssm set cm-embed AppEnvironmentExtra MODEL_DIR=C:\context-manager\models\multilingual-e5-small_Q8\onnx
nssm set cm-embed AppEnvironmentExtra ORT_INTER_THREADS=2
nssm set cm-embed AppEnvironmentExtra ORT_INTRA_THREADS=4
nssm set cm-embed AppStdout "C:\ProgramData\nssm\logs\cm-embed.log"
nssm set cm-embed AppStderr "C:\ProgramData\nssm\logs\cm-embed-err.log"
nssm set cm-embed AppRotateFiles 1
nssm set cm-embed AppRotateSeconds 86400
nssm set cm-embed Start SERVICE_AUTO_START
nssm start cm-embed
```

---

## Проверка работоспособности

```powershell
# Health check
curl http://127.0.0.1:8080/health

# Embed тест
curl -X POST http://127.0.0.1:8080/embed `
     -H "Content-Type: application/json" `
     -d '{"inputs": "test sentence"}'
# Ожидается: [[0.123, -0.456, ...]] — вектор из 384 float

# Batch тест
curl -X POST http://127.0.0.1:8080/embed `
     -H "Content-Type: application/json" `
     -d '{"inputs": ["sentence one", "sentence two"]}'
# Ожидается: [[...], [...]] — два вектора

# Проверить размерность
curl -X POST http://127.0.0.1:8080/embed -H "Content-Type: application/json" `
     -d '{"inputs": "x"}' | python -c "import json,sys; v=json.load(sys.stdin); print(f'dim={len(v[0])}')"
# Ожидается: dim=384
```

---

## RAM профиль

| Компонент | RAM |
|-----------|-----|
| Python runtime | ~15 MB |
| ONNX Runtime | ~15 MB |
| Model INT8 (384d) | ~40 MB |
| tokenizers library | ~5 MB |
| FastAPI + uvicorn | ~8 MB |
| **Итого** | **~83 MB** |

> TEI в Docker: ~45 MB + Docker overhead. Нативный ONNX embedder: ~83 MB.  
> Разница объясняется Python runtime. Можно снизить до ~60 MB через `onnxruntime` без лишних пакетов.

---

## Известные ограничения и решения

| Проблема | Решение |
|----------|---------|
| `token_type_ids` может отсутствовать у некоторых ONNX exports | В коде — условная подача только если есть в `_input_names` |
| Модель может быть `model.onnx` или `model_optimized.onnx` | В коде — перебор имён |
| Первый запрос медленнее (~200ms) из-за JIT в ORT | Нормально, кеш прогревается |
| Padding длины — нужна согласованность при batch | `_tokenizer.enable_padding(length=None)` — автоматический padding до longest в batch |
| Большие тексты > MAX_LEN обрезаются | `enable_truncation(max_length=512)` — как TEI `--auto-truncate` |
