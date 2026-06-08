"""
test_cm_integration.py — verification of the mcp.integration → cm_integration namespace replacement.

Execution:
    pytest tests/test_cm_integration.py -v

The test does NOT require the cm_integration package to be installed —
static analysis is sufficient for CI and local verification.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
MCP_INTEGRATION_DIR = PROJECT_ROOT / "mcp" / "integration"

EXCLUDE_DIRS = {"__pycache__", ".venv", "venv"}


def _py_files(directory: Path) -> list[Path]:
    return [
        p for p in directory.rglob("*.py")
        if not any(ex in p.parts for ex in EXCLUDE_DIRS)
    ]


# ---------------------------------------------------------------------------
# Static checks
# ---------------------------------------------------------------------------

def test_no_old_namespace_in_imports() -> None:
    """No .py file in mcp/integration/ should use from mcp.integration."""
    violations: list[str] = []
    for path in _py_files(MCP_INTEGRATION_DIR):
        for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if "from mcp.integration" in line or "import mcp.integration" in line:
                violations.append(f"{path.relative_to(PROJECT_ROOT)}:{i}: {line.strip()}")

    assert not violations, (
        "Old namespace 'mcp.integration' found in imports:\n"
        + "\n".join(violations)
    )


def test_no_old_namespace_in_module_strings() -> None:
    """String references like '-m mcp.integration.X' must also be replaced."""
    violations: list[str] = []
    for path in _py_files(MCP_INTEGRATION_DIR):
        for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if "mcp.integration" in line:
                violations.append(f"{path.relative_to(PROJECT_ROOT)}:{i}: {line.strip()}")

    assert not violations, (
        "Old string reference 'mcp.integration' found:\n"
        + "\n".join(violations)
    )


def test_cm_integration_references_present() -> None:
    """Verify that cm_integration is actually used — the replacement is not empty."""
    found = False
    for path in _py_files(MCP_INTEGRATION_DIR):
        if "cm_integration" in path.read_text(encoding="utf-8"):
            found = True
            break
    assert found, "No 'cm_integration' references found — replacement may not have been applied"


def test_pyproject_toml_exists() -> None:
    """pyproject.toml must exist for pip install."""
    pyproject = MCP_INTEGRATION_DIR / "pyproject.toml"
    assert pyproject.exists(), f"Missing: {pyproject}"


def test_pyproject_package_name() -> None:
    """pyproject.toml must declare the cm-integration package."""
    pyproject = MCP_INTEGRATION_DIR / "pyproject.toml"
    content = pyproject.read_text(encoding="utf-8")
    assert 'name = "cm-integration"' in content, (
        "pyproject.toml must declare: name = \"cm-integration\""
    )


def test_init_py_exists() -> None:
    """__init__.py must exist — Python package marker."""
    init = MCP_INTEGRATION_DIR / "__init__.py"
    assert init.exists(), f"Missing: {init}"


def test_icons_directory_exists() -> None:
    """The icons/ directory must exist — tray_pyqt.py loads SVGs from it."""
    icons = MCP_INTEGRATION_DIR / "icons"
    assert icons.is_dir(), f"Missing icons directory: {icons}"
    svgs = list(icons.glob("*.svg"))
    assert svgs, f"No SVG files found in {icons}"


# ---------------------------------------------------------------------------
# Rename script sanity check
# ---------------------------------------------------------------------------

def test_rename_script_reports_clean() -> None:
    """scripts/rename_mcp_integration.py must return 0 (no remains found)."""
    script = PROJECT_ROOT / "scripts" / "rename_mcp_integration.py"
    result = subprocess.run(
        [sys.executable, str(script)],
        capture_output=True, text=True
    )
    assert result.returncode == 0, (
        f"Rename script found remaining occurrences of 'mcp.integration':\n"
        f"stdout: {result.stdout}\n"
        f"stderr: {result.stderr}"
    )
