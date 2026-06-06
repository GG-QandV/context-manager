# SPDX-License-Identifier: MIT
"""MCP OAuth Adapter — single server for all chat connections.
Port: 8769
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import inspect
import json
import logging
import os
import re
import secrets
import sys
import threading
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Callable

import httpx
import uvicorn
from mcp.server import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.types import TextContent, Tool
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import (
    JSONResponse,
    RedirectResponse,
    Response,
    StreamingResponse,
)
from starlette.routing import Route

from mcp.integration.common import (
    IFLOW_DIR,
    TOKEN,
    PrivateNetworkAccessMiddleware,
    safe_cm_call,
)
from mcp.integration.mcp_sse_adapter import TOOLS as _TOOLS

logger = logging.getLogger("context_manager.integration.mcp_oauth_adapter")

# In-memory OAuth database
_clients: dict[str, dict[str, Any]] = {}
_codes:   dict[str, dict[str, Any]] = {}
_tokens:  dict[str, dict[str, Any]] = {}

MCP_SSE_UPSTREAM: str = "http://localhost:8765"
CM_UPSTREAM: str = "http://localhost:3847"

PUBLIC_URL: str = ""
OAUTH_METADATA: dict[str, Any] = {}
PROTECTED_RESOURCE_METADATA: dict[str, Any] = {}


def _validate_oauth_token(token: str) -> bool:
    return bool(token and token in _tokens and time.time() < _tokens[token]["expires"])


# ── Route config ─────────────────────────────────────────────────────────────

DEFAULT_ROUTES: dict[str, dict] = {
    "/mcp":                    {"auth": ["api_key"],          "client": "perplexity",  "transport": "proxy-mcp", "upstream": "http://localhost:8770"},
    "/sse":                    {"auth": ["oauth", "bearer"],  "client": "claude",      "transport": "sse"},
    "/messages/":              {"auth": ["oauth", "bearer"],  "client": "claude",      "transport": "sse-messages"},
    "/mcp/chatgpt":            {"auth": ["oauth", "bearer"],  "client": "chatgpt",     "transport": "proxy-mcp", "upstream": "http://localhost:8770"},
    "/mcp/grok":               {"auth": ["oauth", "bearer"],  "client": "grok",        "transport": "proxy-mcp", "upstream": "http://localhost:8770"},
    "/context-manager":        {"auth": ["bearer"],           "client": "internal",    "transport": "proxy"},
    "/context-manager/{rest:path}": {"auth": ["bearer"],      "client": "internal",    "transport": "proxy"},
}

VALID_AUTH_MODES: set[str] = {"none", "bearer", "oauth", "api_key"}


@dataclass
class WatcherConfig:
    interval: float = 2.0
    backend: str = "auto"


@dataclass
class FullRouteConfig:
    routes: dict
    watcher: WatcherConfig


def _validate_route_config(data: dict) -> None:
    for path, cfg in data.get("routes", {}).items():
        auth = cfg.get("auth")
        if not isinstance(auth, list):
            raise ValueError(f"routes[{path}].auth must be a list, got {type(auth).__name__}")
        unknown = set(auth) - VALID_AUTH_MODES
        if unknown:
            raise ValueError(f"routes[{path}].auth contains unknown modes: {unknown}")


def load_route_config(path: Path | None = None) -> FullRouteConfig:
    routes_path = path or (IFLOW_DIR / "routes.json")
    if not routes_path.exists():
        return FullRouteConfig(routes=dict(DEFAULT_ROUTES), watcher=WatcherConfig())
    try:
        data = json.loads(routes_path.read_text(encoding="utf-8"))
        _validate_route_config(data)
        wc = data.get("watcher", {})
        watcher = WatcherConfig(
            interval=wc.get("interval", 2.0),
            backend=wc.get("backend", "auto"),
        )
        merged = {**DEFAULT_ROUTES, **data.get("routes", {})}
        return FullRouteConfig(routes=merged, watcher=watcher)
    except Exception as e:
        logger.error(f"Failed to load routes.json: {e}. Falling back to default.")
        return FullRouteConfig(routes=dict(DEFAULT_ROUTES), watcher=WatcherConfig())


def _build_routes(route_cfg: dict) -> list[Route]:
    routes = [
        Route("/.well-known/oauth-authorization-server", oauth_metadata, methods=["GET"]),
        Route("/.well-known/oauth-protected-resource", protected_resource_metadata, methods=["GET"]),
        Route("/mcp/.well-known/oauth-protected-resource", protected_resource_metadata, methods=["GET"]),
        Route("/.well-known/oauth-protected-resource/mcp", protected_resource_metadata, methods=["GET"]),
        Route("/register", register, methods=["POST"]),
        Route("/authorize", authorize, methods=["GET"]),
        Route("/authorize/confirm", authorize_confirm, methods=["GET", "POST"]),
        Route("/token", token, methods=["POST"]),
        Route("/health", health, methods=["GET"]),
        Route("/mcp-config", handle_mcp_config, methods=["GET"]),
    ]
    for path, cfg in route_cfg.items():
        modes = [AuthMode(m) for m in cfg["auth"]]
        transport = cfg.get("transport", "proxy-mcp")
        if transport == "streamable-http":
            routes.append(Route(path, endpoint=ASGIAppWrapper(AuthSelector(modes).require_asgi(handle_mcp)), methods=["GET", "POST", "DELETE"]))
        elif transport == "sse":
            routes.append(Route(path, endpoint=AuthSelector(modes).require_starlette(proxy_sse), methods=["GET"]))
        elif transport == "sse-messages":
            routes.append(Route(path, endpoint=AuthSelector(modes).require_starlette(proxy_messages), methods=["POST"]))
        elif transport == "proxy":
            routes.append(Route(path, endpoint=AuthSelector(modes).require_starlette(proxy_to_cm), methods=["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH"]))
        elif transport == "proxy-mcp":
            upstream = cfg.get("upstream", "http://localhost:8770")
            handler = _make_proxy_mcp_handler(upstream)
            routes.append(Route(path, endpoint=ASGIAppWrapper(AuthSelector(modes).require_asgi(handler)), methods=["GET", "POST", "DELETE"]))
    return routes


# ── AuthMode & AuthSelector ──────────────────────────────────────────────────

class AuthMode(Enum):
    NONE    = "none"
    BEARER  = "bearer"
    OAUTH   = "oauth"
    API_KEY = "api_key"


class AuthSelector:
    def __init__(self, modes: list[AuthMode]):
        self.modes = modes

    def check(self, request: Request, scope: dict) -> bool:
        for mode in self.modes:
            if mode == AuthMode.NONE:
                return True
            if mode == AuthMode.BEARER:
                bearer = request.headers.get("Authorization", "")
                api_key_header = request.headers.get("api-key", "")
                query_token = request.query_params.get("token", "")
                api_key_param = request.query_params.get("api_key", "")
                valid_token = TOKEN
                if (
                    bearer == f"Bearer {valid_token}"
                    or api_key_header == valid_token
                    or query_token == valid_token
                    or api_key_param == valid_token
                ):
                    return True
            if mode == AuthMode.API_KEY:
                api_key_param = request.query_params.get("api_key", "")
                if not api_key_param:
                    return True  # open if absent
                if api_key_param == TOKEN:
                    return True
            if mode == AuthMode.OAUTH:
                t = scope.get("oauth_token", "")
                if _validate_oauth_token(t):
                    return True
        return False

    def require_asgi(self, handler):
        async def wrapper(scope, receive, send):
            request = Request(scope, receive)
            if not self.check(request, scope):
                response = JSONResponse({"error": "unauthorized"}, status_code=401)
                await response(scope, receive, send)
                return
            await handler(scope, receive, send)
        return wrapper

    def require_starlette(self, handler):
        async def wrapper(request: Request) -> Response:
            if not self.check(request, request.scope):
                return JSONResponse({"error": "unauthorized"}, status_code=401)
            return await handler(request)
        return wrapper


# ── OAuth Token Middleware ───────────────────────────────────────────────────

class OAuthTokenMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            headers = dict(scope.get("headers", []))
            auth = headers.get(b"authorization", b"").decode()
            if auth.startswith("Bearer "):
                scope["oauth_token"] = auth[7:]
        await self.app(scope, receive, send)


# ── MCP Server Factory (Fallback static server) ──────────────────────────────

def _make_mcp_server() -> Server:
    srv = Server("cm")

    @srv.list_tools()
    async def list_tools() -> list[Tool]:
        return [
            Tool(
                name=t["name"],
                description=t["description"],
                inputSchema=t["inputSchema"],
            )
            for t in _TOOLS
        ]

    @srv.call_tool()
    async def call_tool(name: str, arguments: dict) -> list[TextContent]:
        # Emulated call
        from mcp.integration.mcp_sse_adapter import _make_mcp_server as _make
        real_server = _make()
        return await real_server.call_tool(name, arguments)

    return srv


def _base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _pkce_verify(verifier: str, challenge: str) -> bool:
    digest: str = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return digest == challenge


class ASGIAppWrapper:
    def __init__(self, app):
        self.app = app
    async def __call__(self, scope, receive, send):
        await self.app(scope, receive, send)


# ── Local MCP handler (workaround stateless HTTP) ──────────────────────────────

async def handle_mcp(scope, receive, send):
    if scope.get("method") == "GET":
        raw_headers = dict(scope.get("headers", []))
        raw_accept = raw_headers.get(b"accept", b"*/*").decode()
        if b"text/event-stream" not in raw_accept.encode():
            response = JSONResponse(
                {"list": [
                    {"name": t["name"], "description": t["description"], "inputSchema": t["inputSchema"]}
                    for t in _TOOLS
                ]}
            )
            await response(scope, receive, send)
            return

    headers = list(scope.get("headers", []))
    accept_value = b"application/json, text/event-stream"
    has_accept = False
    for i, (k, v) in enumerate(headers):
        if k.lower() == b"accept":
            has_accept = True
            if b"application/json" not in v or b"text/event-stream" not in v:
                headers[i] = (b"accept", accept_value)
            break
    if not has_accept:
        headers.append((b"accept", accept_value))
    scope["headers"] = headers

    sm = scope["app"].state.sm if hasattr(scope["app"].state, "sm") else None
    if sm is not None and sm._task_group is not None:
        await sm.handle_request(scope, receive, send)
        return

    sm = StreamableHTTPSessionManager(
        app=_make_mcp_server(),
        event_store=None,
        json_response=True,
        stateless=True,
    )
    async with sm.run():
        await sm.handle_request(scope, receive, send)


# ── RFC 8414 — OAuth Server Metadata ─────────────────────────────────────────

async def oauth_metadata(request: Request) -> JSONResponse:
    if OAUTH_METADATA:
        return JSONResponse(OAUTH_METADATA)
    base: str = _base_url(request)
    return JSONResponse({
        "issuer": base,
        "authorization_endpoint": f"{base}/authorize",
        "token_endpoint": f"{base}/token",
        "registration_endpoint": f"{base}/register",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["client_secret_post", "none"],
    })


async def protected_resource_metadata(request: Request) -> JSONResponse:
    if PROTECTED_RESOURCE_METADATA:
        return JSONResponse(PROTECTED_RESOURCE_METADATA)
    base: str = _base_url(request)
    return JSONResponse({
        "resource": f"{base}/mcp",
        "authorization_servers": [base],
        "bearer_methods_supported": ["header"],
    })


async def register(request: Request) -> JSONResponse:
    try:
        data: dict[str, Any] = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid_request"}, status_code=400)
    client_id: str = secrets.token_urlsafe(16)
    client_secret: str = secrets.token_urlsafe(32)
    _clients[client_id] = {
        "client_secret": client_secret,
        "redirect_uris": data.get("redirect_uris", []),
    }
    return JSONResponse({
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uris": data.get("redirect_uris", []),
        "token_endpoint_auth_method": "client_secret_post",
    }, status_code=201)


async def authorize(request: Request) -> Response:
    p: dict[str, str] = dict(request.query_params)
    required: set[str] = {"client_id", "redirect_uri", "code_challenge", "response_type"}
    if not required.issubset(p):
        return JSONResponse({"error": "invalid_request"}, status_code=400)
    if p.get("code_challenge_method", "S256") != "S256":
        return JSONResponse({"error": "invalid_request", "error_description": "Only S256 supported"}, status_code=400)

    code: str = secrets.token_urlsafe(32)
    state: str = p.get("state", "")
    redirect_uri: str = p["redirect_uri"]
    _codes[code] = {
        "client_id": p["client_id"],
        "pkce_challenge": p["code_challenge"],
        "redirect_uri": redirect_uri,
        "expires": time.time() + 300,
    }

    base: str = PUBLIC_URL if PUBLIC_URL else _base_url(request)
    try:
        import webbrowser
        webbrowser.open(f"{base}/authorize/confirm?code={code}&state={state}")
    except Exception:
        pass

    return RedirectResponse(f"{redirect_uri}?code={code}&state={state}", status_code=302)


async def authorize_confirm(request: Request) -> Response:
    form_data = {}
    if request.method == "POST":
        try:
            form_data = dict(await request.form())
        except Exception:
            pass

    client_id = form_data.get("client_id") or request.query_params.get("client_id")
    redirect_uri = form_data.get("redirect_uri") or request.query_params.get("redirect_uri")
    code_challenge = form_data.get("code_challenge") or request.query_params.get("code_challenge")
    state = form_data.get("state") or request.query_params.get("state") or ""

    if not client_id or not redirect_uri or not code_challenge:
        return Response(
            "<html><body><h2>Authorization complete</h2><p>You may close this tab.</p></body></html>",
            status_code=200,
            media_type="text/html",
        )

    code = secrets.token_urlsafe(32)
    _codes[code] = {
        "client_id": client_id,
        "pkce_challenge": code_challenge,
        "redirect_uri": redirect_uri,
        "expires": time.time() + 300,
    }

    return RedirectResponse(f"{redirect_uri}?code={code}&state={state}", status_code=302)


async def token(request: Request) -> JSONResponse:
    form: Any = await request.form()
    code: str | None = form.get("code")
    verifier: str | None = form.get("code_verifier")
    if not code:
        return JSONResponse({"error": "invalid_request", "error_description": "Missing code"}, status_code=400)
    entry: dict[str, Any] | None = _codes.pop(str(code), None)
    if not entry or time.time() > entry["expires"]:
        return JSONResponse({"error": "invalid_grant"}, status_code=400)
    if not verifier or not _pkce_verify(str(verifier), entry["pkce_challenge"]):
        return JSONResponse({"error": "invalid_grant", "error_description": "PKCE verification failed"}, status_code=400)
    access_token: str = secrets.token_urlsafe(32)
    _tokens[access_token] = {
        "client_id": entry["client_id"],
        "expires": time.time() + 3600,
    }
    return JSONResponse({
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": 3600,
    })


# ── proxy-mcp: generic HTTP pass-through to upstream Node.js MCP server ──────────────

def _make_proxy_mcp_handler(upstream: str):
    _STRIP_REQ  = {"host", "content-length", "transfer-encoding"}
    _STRIP_RESP = {"content-length", "content-encoding", "transfer-encoding",
                   "connection", "keep-alive", "server", "date"}

    async def handle(scope, receive, send):
        request = Request(scope, receive)
        method  = request.method
        body    = await request.body() if method in ("POST", "PUT", "PATCH") else None
        headers = {k: v for k, v in request.headers.items() if k.lower() not in _STRIP_REQ}
        url     = upstream.rstrip("/") + "/mcp"

        async with httpx.AsyncClient(timeout=60) as client:
            upstream_resp = await client.request(
                method, url, content=body, headers=headers,
            )

        resp_headers = {k: v for k, v in upstream_resp.headers.items()
                        if k.lower() not in _STRIP_RESP}
        response = Response(
            content=upstream_resp.content,
            status_code=upstream_resp.status_code,
            headers=resp_headers,
            media_type=upstream_resp.headers.get("content-type"),
        )
        await response(scope, receive, send)

    return handle


# ── SSE Proxy → local sse adapter :8765 ──────────────────────────────────────────

def _clean_response_headers(upstream_headers: dict[str, str]) -> dict[str, str]:
    exclude = {
        "content-length", "content-encoding", "transfer-encoding",
        "connection", "keep-alive", "proxy-authenticate",
        "proxy-authorization", "te", "trailer", "upgrade", "server", "date",
    }
    return {k: v for k, v in upstream_headers.items() if k.lower() not in exclude}


async def proxy_sse(request: Request) -> Response:
    headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "authorization")}
    headers["Authorization"] = f"Bearer {TOKEN}"

    async def stream_generator() -> AsyncGenerator[bytes, None]:
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("GET", f"{MCP_SSE_UPSTREAM}/sse",
                                         headers=headers,
                                         timeout=None) as upstream:
                    async for chunk in upstream.aiter_bytes():
                        yield chunk
        except Exception as e:
            logger.error("Error in /sse proxy stream: %s", e)

    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def proxy_messages(request: Request) -> Response:
    headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "authorization", "content-length")}
    headers["Authorization"] = f"Bearer {TOKEN}"
    target = f"{MCP_SSE_UPSTREAM}/messages/"
    if request.url.query:
        target += f"?{request.url.query}"
    try:
        async with httpx.AsyncClient() as client:
            upstream = await client.request(
                method=request.method, url=target, headers=headers,
                content=await request.body(), timeout=30,
            )
        return Response(
            content=upstream.content,
            status_code=upstream.status_code,
            headers=_clean_response_headers(dict(upstream.headers)),
        )
    except Exception as e:
        logger.error("Failed to proxy /messages request: %s", e)
        return JSONResponse({"error": "bad_gateway", "message": str(e)}, status_code=502)


# ── Health status endpoint ──────────────────────────────────────────

async def health(request: Request) -> JSONResponse:
    app = request.scope.get("app", {})
    return JSONResponse({
        "status": "ok",
        "mcpConfirmed": True,
        "daemon": "ok"
    })


# ── /mcp-config — return connection metadata ────────────────────────────────────

def _read_serveo_url() -> str | None:
    p = IFLOW_DIR / "serveo_url"
    return p.read_text(encoding="utf-8").strip() if p.exists() else None


async def handle_mcp_config(request: Request) -> JSONResponse:
    serveo_url = _read_serveo_url()
    route_cfg = load_route_config()
    routes = route_cfg.routes
    routes_out = {}
    for path, cfg in routes.items():
        auth_modes = cfg.get("auth", [])
        base_url = f"{serveo_url}{path}" if serveo_url else None
        has_oauth = "oauth" in auth_modes
        has_bearer = "bearer" in auth_modes

        if has_bearer and not has_oauth and TOKEN and base_url:
            full_url = f"{base_url}?api_key={TOKEN}"
        else:
            full_url = base_url

        routes_out[path] = {
            "url": base_url,
            "fullurl": full_url,
            "auth": auth_modes,
            "client": cfg.get("client"),
            "transport": cfg.get("transport"),
            "bearer_token": TOKEN if has_bearer else None,
            "needs_token": has_bearer and not has_oauth,
        }
    return JSONResponse({
        "serveo_url": serveo_url,
        "tunnel_token": TOKEN,
        "routes": routes_out
    })


# ── Context-manager Fastify proxy ──────────────────────────

async def proxy_to_cm(request: Request) -> Response:
    path = request.url.path.removeprefix("/context-manager") or "/"
    target = f"{CM_UPSTREAM}{path}"
    if request.url.query:
        target += f"?{request.url.query}"
    try:
        async with httpx.AsyncClient() as client:
            upstream = await client.request(
                method=request.method, url=target,
                headers={k: v for k, v in request.headers.items() if k.lower() not in ("host", "authorization")},
                content=await request.body(), timeout=30,
            )
        return Response(content=upstream.content, status_code=upstream.status_code, headers=dict(upstream.headers))
    except httpx.ConnectError:
        return JSONResponse({"error": "bad_gateway", "message": "context-manager Fastify API unavailable"}, status_code=502)
    except httpx.TimeoutException:
        return JSONResponse({"error": "gateway_timeout", "message": "context-manager timeout"}, status_code=504)
    except Exception as e:
        return JSONResponse({"error": "bad_gateway", "message": str(e)}, status_code=502)


# ── Unified Lifespan ─────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: Starlette):
    sm = StreamableHTTPSessionManager(
        app=_make_mcp_server(),
        event_store=None,
        json_response=True,
        stateless=True,
    )
    async with sm.run():
        app.state.sm = sm
        yield


def make_app() -> Starlette:
    route_cfg = load_route_config()
    routes = _build_routes(route_cfg.routes)
    return Starlette(
        debug=os.getenv("CM_DEBUG", "false").lower() == "true",
        lifespan=lifespan,
        routes=routes,
        middleware=[
            Middleware(OAuthTokenMiddleware),
            Middleware(PrivateNetworkAccessMiddleware),
            Middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]),
        ]
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8769)
    parser.add_argument("--public-url", type=str, default="")
    args = parser.parse_args()

    global PUBLIC_URL
    PUBLIC_URL = args.public_url

    uvicorn.run(make_app(), host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
