#!/usr/bin/env python3
"""
Clean .docx exported from Google Docs.

Bloat sources (Google Docs specific):
  1. Embedded fonts (word/fonts/*.ttf) — up to 90% of file
  2. Custom XML parts
  3. Thumbnails

Strategy: unzip → strip bloat → rezip. No library dependencies.
Output: ~5-15KB for a plain text docx.
"""

import re
import zipfile
import shutil
from pathlib import Path


def clean_docx(input_path: Path) -> Path:
    output_path = input_path.with_stem(input_path.stem + "_clean")
    tmp_dir = input_path.with_suffix(".tmp_unzip")

    # ── Unzip ────────────────────────────────────────────────────
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)
    with zipfile.ZipFile(input_path, "r") as z:
        z.extractall(tmp_dir)

    # ── 1. Remove embedded fonts ─────────────────────────────────
    fonts_dir = tmp_dir / "word" / "fonts"
    if fonts_dir.exists():
        shutil.rmtree(fonts_dir)

    # ── 2. Remove custom XML parts ───────────────────────────────
    custom_xml = tmp_dir / "customXML"
    if custom_xml.exists():
        shutil.rmtree(custom_xml)

    # ── 3. Remove thumbnails ─────────────────────────────────────
    for f in tmp_dir.rglob("thumbnail*"):
        f.unlink()

    # ── 4. Clean document.xml — strip run-level font refs ────────
    doc_xml = tmp_dir / "word" / "document.xml"
    if doc_xml.exists():
        xml = doc_xml.read_text("utf-8")

        # Remove w:rPr elements (run properties — font, size, color)
        xml = re.sub(r"<w:rPr>.*?</w:rPr>", "", xml, flags=re.DOTALL)

        # Normalise multiple spaces in w:t (text) elements
        xml = re.sub(r"(<w:t[^>]*>)\s+", r"\1", xml)
        xml = re.sub(r"\s+(</w:t>)", r"\1", xml)

        doc_xml.write_text(xml, "utf-8")

    # ── 5. Clean fontTable.xml — remove all entries ──────────────
    font_table = tmp_dir / "word" / "fontTable.xml"
    if font_table.exists():
        # Minimal font table — just the XML wrapper
        font_table.write_text(
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            "</w:fonts>",
            "utf-8",
        )

    # ── 6. Remove fontTable.xml.rels ─────────────────────────────
    font_rels = tmp_dir / "word" / "_rels" / "fontTable.xml.rels"
    if font_rels.exists():
        font_rels.unlink()

    # ── 7. Clean [Content_Types].xml — remove font entries ───────
    ct = tmp_dir / "[Content_Types].xml"
    if ct.exists():
        content = ct.read_text("utf-8")
        # Remove Override entries for fonts
        content = re.sub(
            r'<Override PartName="/word/fonts/[^"]+" ContentType="[^"]+"/>\s*',
            "",
            content,
        )
        content = re.sub(
            r'<Override PartName="/word/fonts/[^"]+" ContentType="[^"]+"/>',
            "",
            content,
        )
        ct.write_text(content, "utf-8")

    # ── 8. Clean .rels — remove font + customXML relationships ───
    rels_files = [
        tmp_dir / "word" / "_rels" / "document.xml.rels",
        tmp_dir / "_rels" / ".rels",
    ]
    for rfile in rels_files:
        if rfile.exists():
            content = rfile.read_text("utf-8")
            content = re.sub(
                r'<Relationship[^>]*Target="fonts/[^"]+"[^>]*/>\s*', "", content
            )
            content = re.sub(
                r'<Relationship[^>]*Target="[^"]*customXM?L?/[^"]+"[^>]*/>\s*',
                "",
                content,
                flags=re.IGNORECASE,
            )
            rfile.write_text(content, "utf-8")

    # ── 9. Re-zip ────────────────────────────────────────────────
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zout:
        for fpath in sorted(tmp_dir.rglob("*")):
            if fpath.is_file():
                arcname = str(fpath.relative_to(tmp_dir))
                zout.write(fpath, arcname)

    # ── Cleanup ──────────────────────────────────────────────────
    shutil.rmtree(tmp_dir)

    return output_path


if __name__ == "__main__":
    docs_dir = Path(__file__).parent
    for f in sorted(docs_dir.glob("*.docx")):
        if "_clean" in f.stem:
            continue
        print(f"  Cleaning: {f.name} ...", end=" ")
        out = clean_docx(f)
        kb = out.stat().st_size / 1024
        print(f"→ {out.name} ({kb:.1f} KB)")
