#!/usr/bin/env python3
"""
Clean .docx exported from Google Docs.

Problem: Google Docs embeds full TTF font files (~500KB) in the archive.
Solution: Remove only the font binary files, keep everything else intact.

What this does:
  1. Removes word/fonts/*.ttf (the actual font blobs — 90%+ of file)
  2. Removes references to font files in [Content_Types].xml
  3. Removes font file relationships from .rels files
  4. Keeps fontTable.xml, document.xml, w:rPr, all formatting — untouched

Result: Word/Mac Pages/Google Docs open the file normally,
       using system fonts as fallback. File size: 5-15 KB.
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

    # ── 1. Remove embedded font binary files ─────────────────────
    fonts_dir = tmp_dir / "word" / "fonts"
    if fonts_dir.exists():
        shutil.rmtree(fonts_dir)

    # ── 2. Remove font entries from [Content_Types].xml ──────────
    ct = tmp_dir / "[Content_Types].xml"
    if ct.exists():
        content = ct.read_text("utf-8")
        content = re.sub(
            r'<Override PartName="/word/fonts/[^"]+" ContentType="[^"]+"/>\s*',
            "",
            content,
        )
        content = re.sub(
            r'<Default Extension="ttf" ContentType="[^"]+"/>\s*',
            "",
            content,
        )
        ct.write_text(content, "utf-8")

    # ── 3. Remove font relationships from .rels files ────────────
    for rels_path in [
        tmp_dir / "word" / "_rels" / "document.xml.rels",
        tmp_dir / "_rels" / ".rels",
    ]:
        if rels_path.exists():
            content = rels_path.read_text("utf-8")
            content = re.sub(
                r'<Relationship[^>]*Target="[^"]*fonts/[^"]+"[^>]*/>\s*',
                "",
                content,
            )
            rels_path.write_text(content, "utf-8")

    # ── 4. Remove fontTable.xml.rels if exists ───────────────────
    font_rels = tmp_dir / "word" / "_rels" / "fontTable.xml.rels"
    if font_rels.exists():
        font_rels.unlink()

    # ── 5. Re-zip ────────────────────────────────────────────────
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
        pct = out.stat().st_size / f.stat().st_size * 100
        print(f"→ {out.name} ({kb:.1f} KB, {pct:.0f}% від оригіналу)")
