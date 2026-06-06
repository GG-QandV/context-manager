# SPDX-License-Identifier: MIT
"""Lifecycle manager for the SSH Tunnel and OAuth Adapter."""

import asyncio
import json
import os
import signal
import sys
from pathlib import Path
from typing import Any

from mcp.integration.common import IFLOW_DIR
from mcp.integration.tunnel_providers import ServeoTunnelManager
from mcp.integration.tunnel_state import (
    _kill_port_occupants,
    get_tunnel_token,
    get_tunnel_url,
)
get_or_create_tunnel_token = lambda: get_tunnel_token()

TUNNEL_CONFIG_PATH: Path = IFLOW_DIR / "tunnel_config.json"
TUNNEL_URLS_DIR: Path = IFLOW_DIR / "tunnel_urls"
TUNNEL_TOKENS_DIR: Path = IFLOW_DIR / "tunnel_tokens"
ADAPTER_PORT: int = 8769


def _load_tunnel_config() -> dict[str, Any]:
    if TUNNEL_CONFIG_PATH.exists():
        try:
            return json.loads(TUNNEL_CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"provider": "serveo", "subdomain": None, "port": ADAPTER_PORT}


def _save_tunnel_config(config: dict[str, Any]) -> None:
    IFLOW_DIR.mkdir(parents=True, exist_ok=True)
    TUNNEL_CONFIG_PATH.write_text(json.dumps(config, indent=2), encoding="utf-8")


def _is_headless() -> bool:
    if not sys.stdin or not sys.stdin.isatty():
        return True
    if sys.platform == "win32":
        return os.environ.get("SESSIONNAME", "") == ""
    return os.environ.get("DISPLAY", "") == ""


def _get_or_ask_subdomain() -> str | None:
    config = _load_tunnel_config()
    subdomain = config.get("subdomain")

    if subdomain is None:
        if _is_headless():
            return None

        import secrets
        random_suffix = secrets.token_hex(4)
        default_subdomain = f"cm-{random_suffix}"

        try:
            raw = input(f"Subdomain for Serveo tunnel [default: {default_subdomain}]: ").strip()
            subdomain = raw if raw else default_subdomain
            config["subdomain"] = subdomain
            _save_tunnel_config(config)
            print(f"  Saved unique subdomain: {subdomain}")
        except EOFError:
            return None

    return subdomain


def _save_tunnel_url(subdomain: str | None, public_url: str) -> None:
    """Save PUBLIC_URL atomically."""
    TUNNEL_URLS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"user-{subdomain}.txt" if subdomain else "user-anonymous.txt"
    (TUNNEL_URLS_DIR / filename).write_text(public_url, encoding="utf-8")

    flat = IFLOW_DIR / "tunnel_url"
    tmp  = flat.with_suffix(".tmp")
    tmp.write_text(public_url, encoding="utf-8")
    tmp.replace(flat)


def _save_tunnel_token(subdomain: str | None, token: str) -> None:
    TUNNEL_TOKENS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"user-{subdomain}.txt" if subdomain else "user-anonymous.txt"
    token_file = TUNNEL_TOKENS_DIR / filename
    token_file.write_text(token, encoding="utf-8")


async def run(provider: str = "serveo") -> None:
    token: str = get_tunnel_token() or ""
    subdomain: str | None = _get_or_ask_subdomain()

    # 1. Start Serveo tunnel first
    print("  Starting Serveo tunnel...", end=" ", flush=True)
    tunnel_mgr = ServeoTunnelManager(port=ADAPTER_PORT, subdomain=subdomain)
    try:
        public_url = tunnel_mgr.start(timeout=15.0)
    except TimeoutError as e:
        print(f"\n✗ Failed to start tunnel: {e}")
        return
    except RuntimeError as e:
        print(f"\n✗ SSH not available: {e}")
        return
    print("✓")

    _save_tunnel_url(subdomain, public_url)
    if token:
        _save_tunnel_token(subdomain, token)

    # 2. Start OAuth adapter with PUBLIC_URL
    print("  Starting OAuth adapter...", end=" ", flush=True)
    _kill_port_occupants(ADAPTER_PORT)
    await asyncio.sleep(0.3)

    adapter_log_path = IFLOW_DIR / "adapter.log"
    adapter_log_file = open(adapter_log_path, "a", encoding="utf-8")
    
    # Resolve the python executable (pythonw.exe for Windows without console)
    py_exec = sys.executable
    if sys.platform == "win32" and py_exec.endswith("python.exe"):
        pyw_exec = py_exec.replace("python.exe", "pythonw.exe")
        if Path(pyw_exec).exists():
            py_exec = pyw_exec

    adapter_env = {**os.environ, "CONFIG_DIR": str(IFLOW_DIR)}
    adapter_proc: asyncio.subprocess.Process = await asyncio.create_subprocess_exec(
        py_exec, "-m", "mcp.integration.mcp_oauth_adapter",
        "--port", str(ADAPTER_PORT),
        "--public-url", public_url,
        env=adapter_env,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=adapter_log_file,
        stderr=adapter_log_file,
    )
    print("✓\n")

    _print_connection_guide(public_url, token)

    # 3. Wait for termination
    loop: asyncio.AbstractEventLoop = asyncio.get_running_loop()
    stop_event: asyncio.Event = asyncio.Event()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop_event.set)
        except NotImplementedError:
            pass  # Windows

    await stop_event.wait()
    adapter_log_file.close()
    await _shutdown(adapter_proc, tunnel_mgr)


async def _shutdown(adapter_proc: asyncio.subprocess.Process, tunnel_mgr: ServeoTunnelManager) -> None:
    print("\n  Stopping tunnel and adapter...")
    try:
        tunnel_mgr.stop()
    except Exception as e:
        print(f"    Warning: Failed to stop tunnel: {e}")

    try:
        adapter_proc.terminate()
        await asyncio.wait_for(adapter_proc.wait(), timeout=5)
    except Exception:
        try:
            adapter_proc.kill()
        except Exception:
            pass

    print("  ✓ Stopped.")


def _print_connection_guide(url: str, token: str) -> None:
    print(f"""  ┌─────────────────────────────────────────────────────────────┐
  │ 🌐  YOUR BASE MCP SERVER URL:                                │
  │     {url:<48}│
  └─────────────────────────────────────────────────────────────┘

  🚀 CONNECT YOUR CHATS (STEP-BY-STEP):
  
  [Phase 0] Perplexity:
    1. Log into Perplexity and open Settings
    2. Click "+ Custom connector" button
    3. Enter Name: context-manager
    4. Paste EXACT URL: {url}/mcp
    5. Select Authorization: None and Type: Streamable HTTP
    6. Press "Done" and refresh the page (F5)

  [Phase 1] Claude.ai:
    1. Open settings -> Connectors -> Customize
    2. Click the plus (+) button to add custom connector
    3. Set Name to: context-manager
    4. Paste EXACT URL: {url}/sse
    5. Click 'Add' and grant tool permissions ('Always allow')

  [Phase 2] ChatGPT:
    1. Go to ChatGPT settings -> GPTs / Integrations -> Add MCP
    2. Select Type: HTTP
    3. Paste EXACT URL: {url}/mcp

  [Phase 3] Grok:
    1. Go to Grok settings -> Connected Services -> Add MCP
    2. Select Type: SSE
    3. Paste EXACT URL: {url}/sse
    4. Paste Bearer Token: {token}

  ℹ️ To stop the tunnel at any time, stop this script or close the Tray Icon.
  📋 Adapter debug log: {IFLOW_DIR}/adapter.log
""")


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        pass
