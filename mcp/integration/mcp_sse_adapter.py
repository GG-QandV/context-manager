# SPDX-License-Identifier: MIT
import asyncio
import json
import logging
import os
import socket
from contextlib import asynccontextmanager

import uvicorn
from mcp.server import Server
from mcp.server.sse import SseServerTransport
from mcp.types import TextContent, Tool
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from mcp.integration.common import (
    IFLOW_DIR,
    TOKEN,
    PrivateNetworkAccessMiddleware,
    safe_cm_call,
)

logger = logging.getLogger("context_manager.sse_adapter")


class ServeoHeaderMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["serveo-skip-browser-warning"] = "true"
        return response


# ── Context Manager Tools Definition ────────────────────────────────

TOOLS = [
    {
        "name": "cm_save_br",
        "description": "Save context (brief: auto-summary 200-300 chars)",
        "inputSchema": {
            "type": "object",
            "properties": {
                "content": {"type": "string"},
                "session_id": {"type": "string"},
                "agent": {"type": "string"}
            },
            "required": ["content", "agent"]
        }
    },
    {
        "name": "cm_save_im",
        "description": "Save context (important: by topics, up to 3K chars)",
        "inputSchema": {
            "type": "object",
            "properties": {
                "content": {"type": "string"},
                "topics": {"type": "string"},
                "session_id": {"type": "string"},
                "agent": {"type": "string"}
            },
            "required": ["content", "topics", "agent"]
        }
    },
    {
        "name": "cm_save_fl",
        "description": "Save context (full: complete log)",
        "inputSchema": {
            "type": "object",
            "properties": {
                "content": {"type": "string"},
                "session_id": {"type": "string"},
                "agent": {"type": "string"}
            },
            "required": ["content", "agent"]
        }
    },
    {
        "name": "cm_search",
        "description": "Semantic search in own context",
        "inputSchema": {
            "type": "object",
            "properties": {
                "q": {"type": "string"},
                "mode": {"type": "string", "enum": ["br", "im", "fl"], "default": "im"},
                "n": {"type": "number", "default": 5},
                "agent": {"type": "string"}
            },
            "required": ["q"]
        }
    },
    {
        "name": "cm_query",
        "description": "SQL-based search with filters",
        "inputSchema": {
            "type": "object",
            "properties": {
                "date": {"type": "string"},
                "agent": {"type": "string"},
                "session": {"type": "string"},
                "mode": {"type": "string", "enum": ["br", "im", "fl"], "default": "im"}
            }
        }
    },
    {
        "name": "cm_cross",
        "description": "Search in another agent context",
        "inputSchema": {
            "type": "object",
            "properties": {
                "q": {"type": "string"},
                "from": {"type": "string"},
                "mode": {"type": "string", "enum": ["br", "im", "fl"], "default": "im"},
                "n": {"type": "number", "default": 5}
            },
            "required": ["q", "from"]
        }
    },
    {
        "name": "cm_agents",
        "description": "List agents with record counts",
        "inputSchema": {"type": "object", "properties": {}}
    },
    {
        "name": "cm_stats",
        "description": "Context statistics",
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent": {"type": "string"},
                "session": {"type": "string"}
            }
        }
    },
    {
        "name": "cm_export",
        "description": "Export session to JSON",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session": {"type": "string"},
                "agent": {"type": "string"}
            },
            "required": ["session"]
        }
    },
    {
        "name": "cm_help",
        "description": "Show commands help",
        "inputSchema": {"type": "object", "properties": {}}
    }
]


# ── MCP Server Factory ──────────────────────────────────────────────

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
            for t in TOOLS
        ]

    @srv.call_tool()
    async def call_tool(name: str, arguments: dict) -> list[TextContent]:
        agent = arguments.get("agent", "perplexity")
        try:
            if name in ("cm_save_br", "cm_save_im", "cm_save_fl"):
                mode = {"cm_save_br": "brief", "cm_save_im": "important", "cm_save_fl": "full"}[name]
                await safe_cm_call("POST", "/save", {
                    "sessionId": arguments.get("session_id", "default"),
                    "contextType": "note",
                    "content": arguments.get("content"),
                    "logicalSection": "shared",
                    "agent": agent,
                    "metadata": {
                        "agent": agent,
                        "mode": mode,
                        "topics": arguments.get("topics", "")
                    }
                })
                return [TextContent(type="text", text=f"Saved ({mode})")]

            elif name == "cm_search":
                r = await safe_cm_call("POST", "/semantic-search", {
                    "query": arguments.get("q"),
                    "limit": arguments.get("n", 5),
                    "filters": {"agent": agent},
                    "mode": arguments.get("mode", "im")
                })
                results = r.get("results") or r.get("items") or []
                if not results:
                    return [TextContent(type="text", text="No results")]
                mode = arguments.get("mode", "im")
                out = []
                for i, x in enumerate(results):
                    score = int((x.get("score") or x.get("certainty") or 0) * 100)
                    content = x.get("summary") or x.get("content")[:200] if mode == "br" else (x.get("content") if mode == "fl" else x.get("content")[:500])
                    out.append(f"{i+1}. [{score}%] {content}")
                return [TextContent(type="text", text="\n\n".join(out))]

            elif name == "cm_query":
                r = await safe_cm_call("POST", "/query", {
                    "filters": {
                        "agent": agent,
                        "sessionId": arguments.get("session"),
                        "date": arguments.get("date")
                    },
                    "mode": arguments.get("mode", "im")
                })
                records = r.get("records") or r.get("items") or []
                if not records:
                    return [TextContent(type="text", text="No records")]
                out = []
                for i, x in enumerate(records):
                    ts = x.get("created_at") or x.get("createdAt") or ""
                    summary = x.get("summary") or x.get("content")[:100]
                    out.append(f"{i+1}. {ts} - {summary}")
                return [TextContent(type="text", text="\n".join(out))]

            elif name == "cm_cross":
                r = await safe_cm_call("POST", "/semantic-search", {
                    "query": arguments.get("q"),
                    "limit": arguments.get("n", 5),
                    "filters": {"agent": arguments.get("from")},
                    "mode": arguments.get("mode", "im")
                })
                results = r.get("results") or r.get("items") or []
                from_agent = arguments.get("from")
                if not results:
                    return [TextContent(type="text", text=f"No results in {from_agent}")]
                out = []
                for i, x in enumerate(results):
                    content = x.get("content")[:500]
                    out.append(f"{i+1}. [{from_agent}] {content}")
                return [TextContent(type="text", text="\n\n".join(out))]

            elif name == "cm_agents":
                r = await safe_cm_call("GET", "/agents")
                agents = r.get("agents") or r.get("items") or []
                out = []
                for a in agents:
                    out.append(f"{a.get('agent')}: {a.get('records')} records, last: {a.get('last_active')}")
                return [TextContent(type="text", text="\n".join(out) if out else "No agents")]

            elif name == "cm_stats":
                r = await safe_cm_call("GET", "/stats", params={"agent": agent, "session": arguments.get("session")})
                s = r.get("stats") or {}
                text = f"Total: {s.get('total')}\nSessions: {s.get('sessions')}\nAgents: {s.get('agents')}\nLast: {s.get('last_record')}"
                return [TextContent(type="text", text=text)]

            elif name == "cm_export":
                r = await safe_cm_call("GET", "/export", params={"session": arguments.get("session"), "agent": agent})
                return [TextContent(type="text", text=json.dumps(r, indent=2, ensure_ascii=False))]

            elif name == "cm_help":
                help_text = (
                    "cm_save_br: brief auto-summary\n"
                    "cm_save_im: important by topics\n"
                    "cm_save_fl: full log\n"
                    "cm_search: semantic search (q, mode, n)\n"
                    "cm_query: SQL filters (date, agent, session, mode)\n"
                    "cm_cross: cross-agent search (q, from, mode, n)\n"
                    "cm_agents: list agents\n"
                    "cm_stats: statistics\n"
                    "cm_export: export session JSON\n"
                    "cm_help: show this message"
                )
                return [TextContent(type="text", text=help_text)]

            return [TextContent(type="text", text="Unknown command")]
        except Exception as exc:
            logger.error(f"call_tool {name!r} failed: {exc}", exc_info=True)
            return [TextContent(type="text", text=json.dumps({"error": str(exc)}, ensure_ascii=False))]

    return srv


sse = SseServerTransport("/messages/")


class ASGIAppWrapper:
    def __init__(self, app):
        self.app = app
    async def __call__(self, scope, receive, send):
        await self.app(scope, receive, send)


def _check_auth(request: Request) -> bool:
    bearer  = request.headers.get("Authorization", "")
    api_key = request.headers.get("api-key", "")
    query   = request.query_params.get("token", "")
    return bearer == f"Bearer {TOKEN}" or api_key == TOKEN or query == TOKEN


def make_mcp_app():
    async def handle_sse(scope, receive, send):
        request = Request(scope, receive)
        if not _check_auth(request):
            await Response("Unauthorized", status_code=401)(scope, receive, send)
            return
        mcp_instance = _make_mcp_server()
        async with sse.connect_sse(scope, receive, send) as (read_stream, write_stream):
            await mcp_instance.run(
                read_stream, write_stream, mcp_instance.create_initialization_options()
            )

    async def handle_messages(scope, receive, send):
        await sse.handle_post_message(scope, receive, send)

    async def handle_health(request):
        try:
            await safe_cm_call("GET", "/health", timeout=5.0)
            return JSONResponse({"status": "ok", "mcpConfirmed": True})
        except Exception as e:
            return JSONResponse({"status": "error", "message": str(e)}, status_code=503)

    return Starlette(
        debug=os.getenv("CM_DEBUG", "false").lower() == "true",
        routes=[
            Route("/sse",       endpoint=ASGIAppWrapper(handle_sse)),
            Route("/messages/", endpoint=ASGIAppWrapper(handle_messages), methods=["POST"]),
            Route("/health",    endpoint=handle_health),
        ],
        middleware=[
            Middleware(ServeoHeaderMiddleware),
            Middleware(PrivateNetworkAccessMiddleware),
            Middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]),
        ]
    )


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((host, port)) == 0


async def run(port: int = 8765, host: str = "127.0.0.1") -> None:
    # On standalone mode, allow binding to 0.0.0.0 for external access
    mcp_host = "0.0.0.0" if host == "0.0.0.0" else "127.0.0.1"
    
    mcp_config = uvicorn.Config(
        make_mcp_app(),
        host=mcp_host,
        port=port,
        log_level="info",
    )
    server = uvicorn.Server(mcp_config)
    logger.info(f"Starting CM SSE Adapter on {mcp_host}:{port}...")
    await server.serve()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
