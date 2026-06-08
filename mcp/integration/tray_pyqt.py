# SPDX-License-Identifier: MIT
"""Context Manager Tray — PyQt6 system tray with live server health and tunnel controls.

Color legend:
  Blue   #4A90D9  — idle / waiting (all servers healthy)
  Teal   #00ACC1  — recent activity (future expansion)
  Green  #66BB6A  — processing (future expansion)
  Yellow #FFC107  — warning (Fastify OK, but Node.js MCP adapter offline)
  Red    #E53935  — error (Fastify API offline)
"""

import logging
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

from PyQt6.QtCore import QSize, QTimer
from PyQt6.QtGui import QColor, QIcon, QPainter, QPixmap
from PyQt6.QtWidgets import QApplication, QMenu, QSystemTrayIcon

from cm_integration.common import IFLOW_DIR, TOKEN
from cm_integration.tunnel_state import (
    TunnelState,
    _kill_port_occupants,
    force_kill_tunnel,
    get_tunnel_url,
    kill_orphan_tunnel_processes,
    read_snapshot,
)
from cm_integration.ui_meta import get_meta

logger = logging.getLogger("context_manager.tray")

OAUTH_PORT = 8769
_ADAPTER_READY_TIMEOUT = 8.0
_ADAPTER_POLL_INTERVAL = 0.5


def _copy(text: str) -> None:
    try:
        QApplication.clipboard().setText(text)
    except Exception as e:
        logger.warning("clipboard copy failed: %s", e)


def _run_headless(cmd: list[str]) -> None:
    kwargs: dict = {
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }
    if sys.platform == "win32":
        kwargs["creationflags"] = (
            subprocess.CREATE_NEW_PROCESS_GROUP |
            subprocess.DETACHED_PROCESS
        )
    else:
        kwargs["start_new_session"] = True
    try:
        subprocess.Popen(cmd, **kwargs)
    except Exception as e:
        logger.error("Failed to run headless cmd %s: %s", cmd, e)


def _wait_for_adapter(port: int, timeout: float = _ADAPTER_READY_TIMEOUT) -> bool:
    """Wait until OAuth adapter starts responding to /health."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1.0) as r:
                if r.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(_ADAPTER_POLL_INTERVAL)
    return False


class TunnelUrlWatcher:
    """Watch for tunnel URL changes and display system notification."""
    def __init__(self, tray_icon: QSystemTrayIcon) -> None:
        self._tray     = tray_icon
        self._last_url = get_tunnel_url()

    def check(self) -> None:
        current = get_tunnel_url()
        if current and current != self._last_url:
            self._last_url = current
            self._notify(current)
        elif not current and self._last_url is not None:
            self._last_url = None

    def _notify(self, url: str) -> None:
        short = url.replace("https://", "")[:50]
        self._tray.showMessage(
            "🌐 Tunnel Ready",
            f"Open Tray → Tunnel to copy connection links\n{short}",
            QSystemTrayIcon.MessageIcon.Information,
            6000,
        )


# ── Status constants ────────────────────────────────────────────
_ST_PROCESSING = "processing"
_ST_CONNECTED = "connected"
_ST_IDLE = "idle"
_ST_WARNING = "warning"
_ST_ERROR = "error"

_COLOURS = {
    _ST_PROCESSING: "#66BB6A",  # green
    _ST_CONNECTED: "#00ACC1",   # teal
    _ST_IDLE: "#4A90D9",        # blue
    _ST_WARNING: "#FFC107",     # yellow
    _ST_ERROR: "#E53935",       # red
}

_LABELS = {
    _ST_PROCESSING: "Context Manager: Active",
    _ST_CONNECTED: "Context Manager: Connected",
    _ST_IDLE: "Context Manager: Online",
    _ST_WARNING: "Context Manager: MCP Adapter Offline",
    _ST_ERROR: "Context Manager: API Offline",
}

_SIZE = 64
_R = 28


def _make_icon(status: str) -> QIcon:
    """Draw a status colored circle."""
    pixmap = QPixmap(QSize(_SIZE, _SIZE))
    pixmap.fill(QColor("transparent"))

    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)

    cx, cy = _SIZE // 2, _SIZE // 2
    color_hex = _COLOURS.get(status, _COLOURS[_ST_IDLE])

    # Shadow
    shadow_color = QColor(0, 0, 0, 60)
    painter.setBrush(shadow_color)
    painter.setPen(QColor("transparent"))
    painter.drawEllipse(cx - _R + 2, cy - _R + 2, _R * 2, _R * 2)

    # Main circle
    main_color = QColor(color_hex)
    painter.setBrush(main_color)
    painter.drawEllipse(cx - _R, cy - _R, _R * 2, _R * 2)

    # Highlight shine
    highlight_color = QColor(255, 255, 255, 90)
    painter.setBrush(highlight_color)
    hw = _R // 3
    painter.drawEllipse(cx - _R + 6, cy - _R + 6, hw, hw)

    painter.end()
    return QIcon(pixmap)


def _get_icon(filename: str) -> QIcon:
    """Load QIcon from local icons directory."""
    path = Path(__file__).parent / "icons" / filename
    if path.exists():
        return QIcon(str(path))
    return QIcon()


def _detect_status() -> str:
    """Check Fastify (3847) and Node.js MCP adapter (8770) health."""
    try:
        with urllib.request.urlopen("http://127.0.0.1:3847/health", timeout=1.0) as r:
            if r.status != 200:
                return _ST_ERROR
    except Exception:
        return _ST_ERROR

    try:
        with urllib.request.urlopen("http://127.0.0.1:8770/health", timeout=1.0) as r:
            if r.status == 200:
                return _ST_IDLE
    except Exception:
        return _ST_WARNING

    return _ST_IDLE


def resolve_cm_executable() -> list[str]:
    return [sys.executable, "-m", "cm_integration.tunnel_manager"]


class DaemonTrayApp(QApplication):
    def __init__(self, sys_argv):
        super().__init__(sys_argv)
        self.current_status = _ST_IDLE
        self.tray_icon = None
        self.timer = None
        self._init_tray()
        self._tunnel_watcher = TunnelUrlWatcher(self.tray_icon)

    def _check_status(self):
        status = _detect_status()
        if status != self.current_status:
            self.current_status = status
            if self.tray_icon:
                self.tray_icon.setIcon(_make_icon(status))

        if self.tray_icon:
            daemon_label = _LABELS[self.current_status]
            snap = read_snapshot()
            s = snap.state
            tooltip = f"{daemon_label}\nTunnel: {s.value.upper()}"
            if snap.url:
                tooltip += f"\n{snap.url}"

            MAX_TOOLTIP_WIN = 127
            if sys.platform == "win32" and len(tooltip) > MAX_TOOLTIP_WIN:
                tooltip = tooltip[:MAX_TOOLTIP_WIN - 1] + "…"
            self.tray_icon.setToolTip(tooltip)

        if hasattr(self, "_tunnel_watcher"):
            self._tunnel_watcher.check()

    def _show_status(self):
        status = self.current_status
        self.tray_icon.showMessage(
            "Context Manager Status",
            _LABELS[status],
            QSystemTrayIcon.MessageIcon.Information,
            5000
        )

    def _populate_tunnel_submenu(self) -> None:
        self._tunnel_submenu.clear()

        snap = read_snapshot()
        s = snap.state
        url = snap.url

        if s == TunnelState.ACTIVE:
            label = "Tunnel: ACTIVE"
            if url:
                short = url.replace("https://", "").replace("http://", "")[:35]
                label += f" ({short})"
        elif s == TunnelState.STALE:
            label = "Tunnel: Starting…"
        else:
            label = "Tunnel: Off"

        status_action = self._tunnel_submenu.addAction(label)
        status_action.setEnabled(False)
        self._tunnel_submenu.addSeparator()

        if s == TunnelState.ACTIVE and url:
            try:
                from cm_integration.mcp_oauth_adapter import load_route_config
                routes = load_route_config().routes
            except Exception as e:
                logger.warning("tray tunnel menu: failed to load routes.json: %s", e)
                routes = {}

            for path, route_cfg in routes.items():
                client = route_cfg.get("client", "")
                if not client:
                    continue

                meta      = get_meta(client)
                full_url  = f"{url}{path}"
                auth_list = route_cfg.get("auth", [])
                show_tok  = meta["needs_token"] and "bearer" in auth_list

                sub = self._tunnel_submenu.addMenu(meta['label'])
                sub.setIcon(_get_icon(meta['icon']))

                act_url = sub.addAction(_get_icon("copy-thin.svg"), "Copy URL")
                act_url.triggered.connect(lambda checked, v=full_url: _copy(v))

                if show_tok:
                    act_tok = sub.addAction(_get_icon("key-thin.svg"), "Copy Token")
                    act_tok.triggered.connect(lambda checked, t=TOKEN: _copy(t))

                hint_action = sub.addAction(meta["hint"])
                hint_action.setEnabled(False)

            self._tunnel_submenu.addSeparator()

        start = self._tunnel_submenu.addAction(_get_icon("play-thin.svg"), "Start Tunnel")
        start.setEnabled(s == TunnelState.DEAD)
        start.triggered.connect(self._on_tunnel_start)

        stop = self._tunnel_submenu.addAction(_get_icon("stop-thin.svg"), "Stop Tunnel")
        stop.setEnabled(s in (TunnelState.ACTIVE, TunnelState.STALE))
        stop.triggered.connect(self._on_tunnel_stop)

        restart = self._tunnel_submenu.addAction(_get_icon("arrows-clockwise-thin.svg"), "Restart Tunnel")
        restart.triggered.connect(self._on_tunnel_restart)

        self._tunnel_submenu.addSeparator()

        kill = self._tunnel_submenu.addAction(_get_icon("trash-thin.svg"), "Force Kill Tunnel")
        kill.triggered.connect(self._on_tunnel_force_kill)

    def _on_tunnel_start(self) -> None:
        def _do():
            _kill_port_occupants(OAUTH_PORT)
            time.sleep(0.3)
            # Run background script using pythonw (Windows) or python
            py_exec = sys.executable
            if sys.platform == "win32" and py_exec.endswith("python.exe"):
                pyw_exec = py_exec.replace("python.exe", "pythonw.exe")
                if Path(pyw_exec).exists():
                    py_exec = pyw_exec
            
            cmd = [py_exec, "-m", "cm_integration.tunnel_manager"]
            _run_headless(cmd)
            ok = _wait_for_adapter(OAUTH_PORT)
            if not ok:
                self.tray_icon.showMessage(
                    "Tunnel Start Failed",
                    f"OAuth adapter on port {OAUTH_PORT} did not respond.",
                    QSystemTrayIcon.MessageIcon.Warning,
                    5000,
                )

        threading.Thread(target=_do, daemon=True).start()

    def _on_tunnel_stop(self) -> None:
        force_kill_tunnel()
        kill_orphan_tunnel_processes()

    def _on_tunnel_restart(self) -> None:
        def _do():
            self._on_tunnel_stop()
            time.sleep(1.5)
            self._on_tunnel_start()

        threading.Thread(target=_do, daemon=True).start()

    def _on_tunnel_force_kill(self) -> None:
        force_kill_tunnel()
        orphans = kill_orphan_tunnel_processes()
        count = len(orphans)
        msg = f"Killed {count} process(es): {orphans}" if orphans else "No tunnel processes found."
        self.tray_icon.showMessage("Tunnel Force Kill", msg, QSystemTrayIcon.MessageIcon.Information, 3000)

    def _init_tray(self):
        self.tray_icon = QSystemTrayIcon(self)
        self.tray_icon.setIcon(_make_icon(_ST_IDLE))
        self.tray_icon.setToolTip("Context Manager: initializing...")

        menu = QMenu()
        menu.addAction(_get_icon("info-thin.svg"), "Status", self._show_status)
        menu.addSeparator()

        self._tunnel_submenu = QMenu("Tunnel")
        self._tunnel_submenu.setIcon(_get_icon("globe-simple-thin.svg"))
        self._tunnel_submenu.aboutToShow.connect(self._populate_tunnel_submenu)
        menu.addMenu(self._tunnel_submenu)

        menu.addSeparator()
        menu.addAction(_get_icon("power-thin.svg"), "Quit", self.quit)

        self.tray_icon.setContextMenu(menu)
        self.tray_icon.show()

        self.timer = QTimer()
        self.timer.timeout.connect(self._check_status)
        self.timer.start(3000)
        self._check_status()


def run_tray():
    app = DaemonTrayApp(sys.argv)
    sys.exit(app.exec())


if __name__ == "__main__":
    run_tray()
