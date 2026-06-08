#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""
rename_mcp_integration.py — utility for auditing/verifying namespace replacement.

Checks if `mcp.integration` is completely replaced by `cm_integration`
in all project Python files (excluding node_modules, __pycache__, .git).

Usage:
    python scripts/rename_mcp_integration.py --dry-run   # show occurrences
    python scripts/rename_mcp_integration.py --apply     # apply replacement
    python scripts/rename_mcp_integration.py             # report status only
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent

EXCLUDE_DIRS = {"node_modules", "__pycache__", ".git", ".venv", "venv", "dist", "build"}
INCLUDE_EXTS = {".py", ".iss", ".toml", ".json", ".md"}

OLD = "mcp.integration"
NEW = "cm_integration"

# Catch backslash paths in ISS files as well
OLD_PATH_BACKSLASH = r"mcp\\integration"
NEW_PATH_COMMENT   = "cm_integration"

# Files intentionally ignored
SKIP_FILES = {
    "package.json",                    # Linux dev script — do not change
    "rename_mcp_integration.py",       # this script
    "test_cm_integration.py",          # test suite
}


def iter_files(root: Path) -> list[Path]:
    result = []
    for path in root.rglob("*"):
        if any(ex in path.parts for ex in EXCLUDE_DIRS):
            continue
        if path.name in SKIP_FILES:
            continue
        if path.suffix in INCLUDE_EXTS and path.is_file():
            result.append(path)
    return sorted(result)


def find_occurrences(files: list[Path]) -> dict[Path, list[tuple[int, str]]]:
    found: dict[Path, list[tuple[int, str]]] = {}
    for path in files:
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        hits = []
        for i, line in enumerate(text.splitlines(), 1):
            if OLD in line:
                hits.append((i, line.rstrip()))
        if hits:
            found[path] = hits
    return found


def apply_replacement(files: list[Path]) -> list[Path]:
    changed = []
    for path in files:
        try:
            original = path.read_text(encoding="utf-8")
        except Exception:
            continue
        updated = original.replace(OLD, NEW)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed.append(path)
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit/apply mcp.integration → cm_integration rename")
    parser.add_argument("--dry-run", action="store_true", help="Show occurrences without applying")
    parser.add_argument("--apply",   action="store_true", help="Apply the replacement")
    args = parser.parse_args()

    files = iter_files(PROJECT_ROOT)
    occurrences = find_occurrences(files)

    if not occurrences:
        print("✅ No occurrences of 'mcp.integration' found — namespace is clean.")
        return 0

    print(f"Found '{OLD}' in {len(occurrences)} file(s):\n")
    for path, hits in occurrences.items():
        rel = path.relative_to(PROJECT_ROOT)
        print(f"  {rel}:")
        for lineno, line in hits:
            print(f"    L{lineno}: {line}")
        print()

    if args.apply:
        changed = apply_replacement(files)
        print(f"Applied replacement in {len(changed)} file(s):")
        for p in changed:
            print(f"  {p.relative_to(PROJECT_ROOT)}")
        print("\nRun: pytest tests/test_cm_integration.py -v  to verify.")
        return 0

    if not args.dry_run and not args.apply:
        print("Use --apply to replace, or --dry-run to just report.")

    return 1 if occurrences else 0


if __name__ == "__main__":
    sys.exit(main())
