# SPDX-License-Identifier: MIT
"""UI metadata for chat connections with SVG icon filenames."""

from typing import TypedDict


class ChatMeta(TypedDict):
    label:       str
    icon:        str  # SVG icon filename
    hint:        str
    needs_token: bool


CHAT_UI_META: dict[str, ChatMeta] = {
    "perplexity": {
        "label":       "Perplexity",
        "icon":        "magnifying-glass-thin.svg",
        "hint":        "Settings → AI Plugins → MCP URL",
        "needs_token": False,
    },
    "claude": {
        "label":       "Claude.ai",
        "icon":        "robot-thin.svg",
        "hint":        "Settings → Integrations → Add Custom Connector",
        "needs_token": False,
    },
    "chatgpt": {
        "label":       "ChatGPT",
        "icon":        "chat-circle-thin.svg",
        "hint":        "Settings → Connectors → Add",
        "needs_token": False,
    },
    "grok": {
        "label":       "Grok",
        "icon":        "lightning-thin.svg",
        "hint":        "Settings → MCP Server URL + Bearer Token",
        "needs_token": True,
    },
}

_GENERIC_META: ChatMeta = {
    "label":       "",
    "icon":        "link-thin.svg",
    "hint":        "Paste URL in MCP settings",
    "needs_token": False,
}


def get_meta(client: str) -> ChatMeta:
    """Get metadata for a specific chat client."""
    if client in CHAT_UI_META:
        return CHAT_UI_META[client]
    return {**_GENERIC_META, "label": client.capitalize()}
