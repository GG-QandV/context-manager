# SPDX-License-Identifier: MIT
"""Tunnel state management, PID checking, port killing, and process cleaning."""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import time
from enum import Enum
from pathlib import Path
from typing import NamedTuple

from cm_integration.common import IFLOW_DIR

logger = logging.getLogger("context_manager.tunnel.state")


def _import_psutil() -> bool:
    global psutil, _PSUTIL
    try:
        import psutil
        _PSUTIL = True
    except ImportError:
        _PSUTIL = False
    return _PSUTIL


_PSUTIL = False
_import_psutil()

_URL_FILE = IFLOW_DIR / "tunnel_url"
_PID_FILE = IFLOW_DIR / "serveo_tunnel.pid"

_TUNNEL_PROCESS_NAMES: frozenset[str] = frozenset({
    "ssh",
    "ssh.exe",
    "autossh",
    "autossh.exe",
})


class TunnelState(str, Enum):
    ACTIVE  = "active"    # PID is alive and URL is obtained
    STALE   = "stale"     # PID is alive but URL is not ready yet
    DEAD    = "dead"      # No PID and no URL


class TunnelSnapshot(NamedTuple):
    state:  TunnelState
    url:    str | None
    pid:    int | None


def _is_pid_alive(pid: int) -> bool:
    """Cross-platform check if a process with PID is alive."""
    if _PSUTIL:
        return psutil.pid_exists(pid)
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False
    except PermissionError:
        return True


def read_snapshot() -> TunnelSnapshot:
    """Read tunnel state from filesystem."""
    pid: int | None = None
    pid_file_exists = _PID_FILE.exists()
    pid_alive = False

    if pid_file_exists:
        try:
            pid = int(_PID_FILE.read_text(encoding="utf-8").strip())
            pid_alive = _is_pid_alive(pid)
        except Exception:
            pid = None

    url: str | None = None
    if _URL_FILE.exists():
        try:
            raw = _URL_FILE.read_text(encoding="utf-8").strip()
            if raw:
                url = raw
        except Exception:
            pass

    if pid_alive and url:
        return TunnelSnapshot(TunnelState.ACTIVE, url, pid)

    if pid_alive:
        return TunnelSnapshot(TunnelState.STALE, None, pid)

    if pid_file_exists and not pid_alive:
        _cleanup_stale_files()
        return TunnelSnapshot(TunnelState.DEAD, None, None)

    if not pid_file_exists and url:
        return TunnelSnapshot(TunnelState.STALE, None, None)

    return TunnelSnapshot(TunnelState.DEAD, None, None)


def _cleanup_stale_files() -> None:
    for f in (_PID_FILE, _URL_FILE):
        try:
            f.unlink(missing_ok=True)
        except OSError:
            pass


def force_kill_tunnel() -> bool:
    """Terminate the tunnel process using the PID file."""
    snap = read_snapshot()
    if snap.pid is None:
        _cleanup_stale_files()
        return False
    try:
        if _PSUTIL:
            proc = psutil.Process(snap.pid)
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except psutil.TimeoutExpired:
                proc.kill()
        else:
            import signal
            if sys.platform == "win32":
                subprocess.run(
                    ["taskkill", "/F", "/PID", str(snap.pid)],
                    capture_output=True
                )
            else:
                os.kill(snap.pid, signal.SIGTERM)
                time.sleep(2)
                try:
                    os.kill(snap.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
    except Exception as e:
        logger.warning("force_kill_tunnel error: %s", e)
    finally:
        _cleanup_stale_files()
    return True


def _is_tunnel_process(name: str, cmdline: str) -> bool:
    """Check if process name or arguments match our tunnel pattern."""
    name_lower = name.lower()
    if name_lower in _TUNNEL_PROCESS_NAMES:
        return True
    if "mcp_oauth_adapter" in cmdline or "mcpoauthadapter" in cmdline:
        return True
    if "tunnel_manager" in cmdline and "start" in cmdline:
        return True
    return False


def kill_orphan_tunnel_processes() -> list[int]:
    """Find and kill all orphan SSH/autossh/adapter processes."""
    if not _import_psutil():
        logger.warning("psutil not available, skipping orphan hunt")
        return []

    killed: list[int] = []
    for proc in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            name = (proc.info.get("name") or "").lower()
            cmdline = " ".join(proc.info.get("cmdline") or []).lower()
            if _is_tunnel_process(name, cmdline):
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except psutil.TimeoutExpired:
                    proc.kill()
                killed.append(proc.pid)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    _cleanup_stale_files()
    return killed


def _kill_via_lsof(port: int) -> list[int]:
    killed: list[int] = []
    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            pids = [int(p) for p in result.stdout.strip().split()]
            for pid in pids:
                try:
                    os.kill(pid, 15)
                    killed.append(pid)
                except (OSError, ProcessLookupError):
                    pass
            time.sleep(1)
            for pid in pids:
                try:
                    os.kill(pid, 9)
                except (OSError, ProcessLookupError):
                    pass
    except (subprocess.TimeoutExpired, FileNotFoundError, ValueError):
        pass
    return killed


def _kill_via_fuser(port: int) -> list[int]:
    killed: list[int] = []
    try:
        result = subprocess.run(
            ["fuser", "-k", f"{port}/tcp"],
            capture_output=True, timeout=5
        )
        if result.returncode == 0:
            killed.append(0)
    except (subprocess.TimeoutExpired, FileNotFoundError, ValueError):
        pass
    return killed


def _kill_via_netstat(port: int) -> list[int]:
    killed: list[int] = []
    try:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.splitlines():
            if f":{port}" in line and "LISTENING" in line:
                parts = line.strip().split()
                if parts:
                    pid_str = parts[-1]
                    try:
                        pid = int(pid_str)
                        subprocess.run(
                            ["taskkill", "/F", "/PID", str(pid)],
                            capture_output=True, timeout=5
                        )
                        killed.append(pid)
                    except (ValueError, subprocess.TimeoutExpired):
                        pass
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return killed


def _kill_port_occupants(port: int) -> list[int]:
    """Kill processes holding a specific TCP port."""
    killed: list[int] = []

    if _import_psutil():
        try:
            for conn in psutil.net_connections(kind="tcp"):
                if (conn.laddr and conn.laddr.port == port
                        and conn.status == "LISTEN"):
                    try:
                        proc = psutil.Process(conn.pid)
                        proc.terminate()
                        try:
                            proc.wait(timeout=2)
                        except psutil.TimeoutExpired:
                            proc.kill()
                        killed.append(conn.pid)
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
            if killed:
                return killed
        except (psutil.AccessDenied, PermissionError):
            logger.debug("psutil.net_connections() denied, trying fallback")

    if sys.platform == "win32":
        killed = _kill_via_netstat(port)
    elif sys.platform == "darwin":
        killed = _kill_via_lsof(port)
    else:
        killed = _kill_via_fuser(port)
        if not killed:
            killed = _kill_via_lsof(port)

    return killed


def get_tunnel_url() -> str | None:
    return read_snapshot().url


def get_tunnel_token() -> str | None:
    try:
        from cm_integration.common import TOKEN
        return TOKEN
    except Exception as e:
        logger.warning("tunnel_token read error: %s", e)
        return None
