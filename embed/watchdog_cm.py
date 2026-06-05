"""
Context Manager Windows Watchdog — health-check всех сервисов + nssm restart.

Спека: docs/WIN10_ARCHITECTURE_DESIGN.md → секция "Watchdog"
nssm конфиг: nssm install cm-watchdog C:\\Python312\\python.exe
              nssm set cm-watchdog AppParameters watchdog_cm.py
              nssm set cm-watchdog AppDirectory C:\\context-manager\\embed
"""
import asyncio
import subprocess
import socket
import urllib.request
import logging
import os

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("watchdog")

# Сервисы для мониторинга.
# nssm=None означает что сервис управляется Windows напрямую (не через nssm) — рестарт не делаем.
SERVICES: list[dict] = [
    {"name": "PostgreSQL",  "nssm": None,          "port": 5432, "type": "tcp"},
    {"name": "cm-qdrant",   "nssm": "cm-qdrant",   "port": 6333, "type": "http", "path": "/health"},
    {"name": "cm-embed",    "nssm": "cm-embed",     "port": 8080, "type": "http", "path": "/health"},
    {"name": "cm-api",      "nssm": "cm-api",       "port": 3847, "type": "http", "path": "/health"},
    {"name": "cm-mcp",      "nssm": "cm-mcp",       "port": 8770, "type": "http", "path": "/mcp"},
]

INTERVAL_SEC = int(os.getenv("WD_INTERVAL", "10"))


def tcp_ok(port: int, timeout: float = 3.0) -> bool:
    """Проверяет что TCP порт принимает соединения."""
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True
    except OSError:
        return False


def http_ok(port: int, path: str, timeout: float = 3.0) -> bool:
    """Проверяет что HTTP endpoint возвращает статус < 500.

    Не проверяем конкретный body — CM возвращает {"status":"healthy"|"degraded"},
    embedder возвращает {"status":"ok"}. Оба валидны пока не 5xx.
    """
    try:
        url = f"http://127.0.0.1:{port}{path}"
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status < 500
    except Exception:
        return False


def nssm_restart(svc: str) -> None:
    """Перезапускает nssm-сервис. Логирует результат."""
    logger.warning(f"Restarting service: {svc}")
    result = subprocess.run(["nssm", "restart", svc], capture_output=True, text=True)
    if result.returncode != 0:
        logger.error(f"nssm restart {svc} failed: {result.stderr.strip()}")
    else:
        logger.info(f"nssm restart {svc} OK")


async def watch_loop() -> None:
    logger.info(f"Watchdog started. Monitoring {len(SERVICES)} services, interval={INTERVAL_SEC}s")
    while True:
        for svc in SERVICES:
            if svc["type"] == "tcp":
                ok = tcp_ok(svc["port"])
            else:
                ok = http_ok(svc["port"], svc.get("path", "/health"))

            if not ok:
                logger.error(f"{svc['name']} DOWN (port {svc['port']})")
                if svc["nssm"]:
                    nssm_restart(svc["nssm"])
            else:
                logger.debug(f"{svc['name']} OK")

        await asyncio.sleep(INTERVAL_SEC)


if __name__ == "__main__":
    asyncio.run(watch_loop())
