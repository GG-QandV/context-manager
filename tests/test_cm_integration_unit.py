"""Tests for cm_integration — static analysis and utility functions."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest import mock
import pytest

PROJECT_ROOT = Path(__file__).parent.parent
ADAPTER_PATH = PROJECT_ROOT / "mcp" / "integration" / "mcp_sse_adapter.py"


# ---------------------------------------------------------------------------
# normalize_host (test via source, no import needed)
# ---------------------------------------------------------------------------

def normalize_host(host: str | None) -> str:
    """Reimplemntation of common.normalize_host for test isolation."""
    if host and host.startswith("::ffff:"):
        return host[7:]
    return host or ""


class TestNormalizeHost:
    def test_ipv4_mapped_ipv6(self):
        assert normalize_host("::ffff:127.0.0.1") == "127.0.0.1"

    def test_plain_ipv4(self):
        assert normalize_host("192.168.1.1") == "192.168.1.1"

    def test_localhost(self):
        assert normalize_host("localhost") == "localhost"

    def test_empty_string(self):
        assert normalize_host("") == ""

    def test_none(self):
        assert normalize_host(None) == ""

    def test_ipv6_loopback(self):
        assert normalize_host("::1") == "::1"


# ---------------------------------------------------------------------------
# mcp_sse_adapter.py — cm_query body shape (#3 fix: flat fields, not filters)
# ---------------------------------------------------------------------------

class TestMcpSseAdapterCmQueryFix:
    """Verify the cm_query fix in mcp_sse_adapter.py (#3)."""

    def _cm_query_section(self) -> str:
        src = ADAPTER_PATH.read_text(encoding="utf-8")
        start = src.find('elif name == "cm_query"')
        assert start != -1, "cm_query handler not found"
        return src[start:start + 800]

    def test_uses_flat_fields_not_filters(self):
        section = self._cm_query_section()
        assert "filters" not in section, \
            "cm_query body should NOT contain 'filters' wrapper"

    def test_uses_session_id(self):
        section = self._cm_query_section()
        assert "session_id" in section, \
            "cm_query body should use 'session_id'"

    def test_uses_date_from(self):
        section = self._cm_query_section()
        assert "date_from" in section, \
            "cm_query body should use 'date_from'"

    def test_reads_results_not_records(self):
        section = self._cm_query_section()
        assert '.get("results")' in section or ".get('results')" in section, \
            "cm_query should read .get('results')"
        assert '.get("records")' not in section and ".get('records')" not in section, \
            "cm_query should NOT read .get('records')"

    def test_no_items_fallback(self):
        section = self._cm_query_section()
        assert ".get(\"items\")" not in section and ".get('items')" not in section, \
            "cm_query should not have items fallback"


# ---------------------------------------------------------------------------
# cm_http_adapter.mjs — cm_query body shape (#1, #2 fix)
# ---------------------------------------------------------------------------

class TestHttpAdapterCmQueryFix:
    """Verify the cm_query fix in cm_http_adapter.mjs (#1, #2)."""

    ADAPTER_PATH = PROJECT_ROOT / "mcp" / "cm_http_adapter.mjs"

    def _cm_query_section(self) -> str:
        src = self.ADAPTER_PATH.read_text(encoding="utf-8")
        start = src.find("if (name === 'cm_query')")
        assert start != -1, "cm_query handler not found in JS adapter"
        return src[start:start + 500]

    def test_uses_flat_fields_not_filters(self):
        section = self._cm_query_section()
        assert "filters" not in section, \
            "cm_query body should NOT contain 'filters' wrapper"

    def test_uses_session_id(self):
        section = self._cm_query_section()
        assert "session_id" in section, \
            "cm_query body should use 'session_id'"

    def test_uses_date_from(self):
        section = self._cm_query_section()
        assert "date_from" in section, \
            "cm_query body should use 'date_from'"

    def test_reads_results_not_records(self):
        section = self._cm_query_section()
        assert "r.data.results" in section, \
            "cm_query should read r.data.results"
        assert "r.data.records" not in section, \
            "cm_query should NOT read r.data.records"


# ---------------------------------------------------------------------------
# server.js — cm_query body shape (#3a fix)
# ---------------------------------------------------------------------------

class TestStdioServerCmQueryFix:
    """Verify the cm_query fix in server.js (#3a)."""

    ADAPTER_PATH = PROJECT_ROOT / "mcp" / "server.js"

    def _cm_query_section(self) -> str:
        src = self.ADAPTER_PATH.read_text(encoding="utf-8")
        start = src.find("if (name === 'cm_query')")
        assert start != -1, "cm_query handler not found in server.js"
        return src[start:start + 500]

    def test_uses_flat_fields_not_filters(self):
        section = self._cm_query_section()
        assert "filters" not in section, \
            "cm_query body should NOT contain 'filters' wrapper"

    def test_uses_session_id(self):
        section = self._cm_query_section()
        assert "session_id" in section, \
            "cm_query body should use 'session_id'"

    def test_uses_date_from(self):
        section = self._cm_query_section()
        assert "date_from" in section, \
            "cm_query body should use 'date_from'"

    def test_reads_results_not_records(self):
        section = self._cm_query_section()
        assert "res.data.results" in section, \
            "cm_query should read res.data.results"
        assert "res.data.records" not in section, \
            "cm_query should NOT read res.data.records"
