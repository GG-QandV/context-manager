# SPDX-License-Identifier: MIT
import asyncio
import json
import logging
import os
import secrets
import sys
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

import httpx
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("context_manager.integration.common")


def get_iflow_dir() -> Path:
    """Get the cross-platform configuration directory for iFlow."""
    env_dir = os.environ.get("CONFIG_DIR")
    if env_dir:
        return Path(env_dir)

    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "iflow"
    elif sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        if appdata:
            return Path(appdata) / "iflow"
        return Path.home() / "AppData" / "Roaming" / "iflow"
    else:
        return Path.home() / ".config" / "iflow"


IFLOW_DIR: Path = get_iflow_dir()

# Tokens paths
TOKEN_PATH: Path = IFLOW_DIR / "sse_token"
OBSERVE_TOKEN_PATH: Path = IFLOW_DIR / "observe_token"


# ── Auth & Token (Atomic loading) ──────────────────────────────────────

def atomic_token_loader(token_path: Path, token_name: str) -> str:
    """Atomically load or create a security token to prevent race conditions.

    Uses tempfile + rename pattern and safe file permissions.
    """
    IFLOW_DIR.mkdir(parents=True, exist_ok=True)
    if not token_path.exists():
        token: str = secrets.token_urlsafe(32)
        tmp_path: Path = token_path.with_name(f"{token_path.name}.tmp")
        try:
            tmp_path.write_text(token, encoding="utf-8")
            if sys.platform != "win32":
                tmp_path.chmod(0o600)
            os.replace(str(tmp_path), str(token_path))
            logger.info(f"Generated new {token_name} in {token_path}")
            return token
        except Exception as e:
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except Exception:
                    pass
            raise RuntimeError(f"Failed to write token file {token_path}: {e}") from e
    return token_path.read_text(encoding="utf-8").strip()


TOKEN: str = atomic_token_loader(TOKEN_PATH, "SSE/HTTP token")
OBSERVE_TOKEN: str = atomic_token_loader(OBSERVE_TOKEN_PATH, "observe token")

# ── Host Normalization & Localhost Checks ──────────────────────────────

def normalize_host(host: str) -> str:
    """Normalize IPv4-mapped IPv6 address (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)."""
    if host and host.startswith("::ffff:"):
        return host[7:]
    return host or ""


def check_localhost(request: Request) -> bool:
    """Safely check if the request originates from localhost, supporting IPv6 loopback."""
    client = request.client
    if not client:
        return False
    host: str = normalize_host(client.host)
    return host in ("127.0.0.1", "localhost", "::1")


# ── Private Network Access (PNA) Middleware ────────────────────────────

class PrivateNetworkAccessMiddleware(BaseHTTPMiddleware):
    """Starlette middleware handling W3C Private Network Access (PNA) preflight queries."""

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        if request.method == "OPTIONS":
            if "access-control-request-private-network" in request.headers:
                origin: str = request.headers.get("origin", "*")
                response = Response(
                    content="",
                    status_code=200,
                    headers={
                        "Access-Control-Allow-Origin": origin,
                        "Access-Control-Allow-Methods": request.headers.get("access-control-request-method", "GET, POST, OPTIONS, DELETE"),
                        "Access-Control-Allow-Headers": request.headers.get("access-control-request-headers", "*"),
                        "Access-Control-Allow-Private-Network": "true",
                        "Access-Control-Max-Age": "86400",
                    }
                )
                return response

        response: Response = await call_next(request)
        if "origin" in request.headers:
            response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response


# ── Context Manager REST API Client ──────────────────────────────────

CM_API_BASE: str = os.environ.get("CM_API_BASE", "http://localhost:3847/api/context")


async def safe_cm_call(method: str, path: str, json_data: dict = None, params: dict = None, timeout: float = 30.0) -> Any:
    """Call the context-manager Fastify backend via HTTP REST API."""
    url = CM_API_BASE.rstrip("/") + path
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if method.upper() == "POST":
                r = await client.post(url, json=json_data, params=params)
            elif method.upper() == "GET":
                r = await client.get(url, params=params)
            else:
                r = await client.request(method, url, json=json_data, params=params)
            r.raise_for_status()
            return r.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error calling context-manager API {url}: {e.response.text}")
        raise RuntimeError(f"Context-manager API returned error: {e.response.text}")
    except Exception as e:
        logger.error(f"Failed to connect to context-manager API {url}: {e}")
        raise ConnectionError(f"Context-manager backend unavailable at {url}: {e}")
