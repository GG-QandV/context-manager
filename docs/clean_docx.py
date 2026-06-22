#!/usr/bin/env python3
"""
Clean .docx — remove embedded font bloat, replace rare fonts with system ones.

For files with .ttf (Google Docs): subset to document characters.
For files with .odttf (LibreOffice): replace Nunito/Oswald → Liberation Sans,
  remove all font files and embeds.
"""

import re
import shutil
import zipfile
import subprocess
from pathlib import Path


ALWAYS_KEEP = {ord(c) for c in (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"
    "абвгдеёжзийклмнопрстуфхцчшщъыьэюя"
    "ЄІЇєіїҐґ"
    "0123456789.,;:!?\"'`-–—()[]{}@#$%^&*+=/\\|<>~•· "
)}
BULLET_CHARS = {0x2022, 0x25CF, 0x25CB, 0x25A0, 0x25A1, 0x2713}

# Map of rare fonts → system equivalents
FONT_REPLACE = {
    "Nunito ExtraLight": "Liberation Sans",
    "Nunito": "Liberation Sans",
    "Nunito Light": "Liberation Sans",
    "Oswald Light": "Liberation Sans",
    "Oswald ExtraLight": "Liberation Sans",
    "Noto Sans Symbols": "Liberation Sans",
    "OpenSymbol": "Arial",
    "Liberation Serif": "Georgia",
}


def extract_chars(*xmls: str) -> set[int]:
    chars = set(ALWAYS_KEEP)
    for text in xmls:
        for m in re.finditer(r"<w:t[^>]*>([^<]+)</w:t>", text):
            chars.update(ord(c) for c in m.group(1))
        for m in re.finditer(r"w:val=\"([^\"]+)\"", text):
            chars.update(ord(c) for c in m.group(1))
        for m in re.finditer(r"w:char=\"([0-9A-Fa-f]+)\"", text):
            chars.add(int(m.group(1), 16))
    return chars


def subset_ttf(path: Path, chars: set[int]) -> bool:
    unicodes = ",".join(f"U+{c:X}" for c in sorted(chars))
    result = subprocess.run(
        ["pyftsubset", str(path), f"--unicodes={unicodes}",
         f"--output-file={str(path)}",
         "--drop-tables+=DSIG,GPOS,GSUB,GDEF,meta"],
        capture_output=True, text=True, timeout=30,
    )
    return result.returncode == 0


def replace_font_names_in_xml(xml: str) -> tuple[str, bool]:
    """Replace rare font names with system fonts in XML. Returns (new_xml, changed)."""
    changed = False
    for old, new in FONT_REPLACE.items():
        # Replace in w:ascii, w:hAnsi, w:eastAsia, w:cs, w:font, w:val attributes
        for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs", "w:font"):
            pattern = rf'{attr}="{re.escape(old)}"'
            replacement = f'{attr}="{new}"'
            new_xml = re.sub(pattern, replacement, xml)
            if new_xml != xml:
                changed = True
                xml = new_xml
        # Also replace w:name="FontName"
        pattern = rf'w:name="{re.escape(old)}"'
        replacement = f'w:name="{new}"'
        new_xml = re.sub(pattern, replacement, xml)
        if new_xml != xml:
            changed = True
            xml = new_xml
    return xml, changed


def clean_docx(input_path: Path) -> Path:
    output_path = input_path.with_stem(input_path.stem + "_clean")
    tmp_dir = input_path.with_suffix(".tmp_unzip")
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)

    with zipfile.ZipFile(input_path, "r") as z:
        z.extractall(tmp_dir)

    fonts_dir = tmp_dir / "word" / "fonts"
    if not fonts_dir.exists() or not list(fonts_dir.iterdir()):
        shutil.rmtree(tmp_dir)
        output_path.write_bytes(input_path.read_bytes())
        return output_path

    # Detect file types
    has_odttf = bool(list(fonts_dir.glob("*.odttf")))
    has_ttf = bool(list(fonts_dir.glob("*.ttf")))

    if has_ttf and not has_odttf:
        # ── Pure Google Docs (TTF) — subset only ────────────────
        doc_xml = (tmp_dir / "word" / "document.xml").read_text("utf-8")
        num_xml = (tmp_dir / "word" / "numbering.xml").read_text("utf-8") if (tmp_dir / "word" / "numbering.xml").exists() else ""
        used_chars = extract_chars(doc_xml, num_xml)

        for ttf in sorted(fonts_dir.glob("*.ttf")):
            sz = ttf.stat().st_size
            ok = subset_ttf(ttf, used_chars)
            if ok:
                print(f"      SUBSET {ttf.name} ({sz//1024}→{ttf.stat().st_size//1024}KB)")
            else:
                print(f"      FAIL   {ttf.name}")

        # Remove unused variants
        ft_path = tmp_dir / "word" / "fontTable.xml"
        ft_rels_path = tmp_dir / "word" / "_rels" / "fontTable.xml.rels"
        _remove_unused_variants(tmp_dir, ft_path, ft_rels_path)

    else:
        # ── LibreOffice (ODTTF or mixed) — replace fonts + strip ─
        print(f"      LibreOffice format detected — replacing fonts")

        # Replace font names in ALL XML files
        for xml_path in sorted(tmp_dir.rglob("*.xml")):
            if xml_path.stat().st_size == 0:
                continue
            text = xml_path.read_text("utf-8")
            new_text, changed = replace_font_names_in_xml(text)
            if changed:
                xml_path.write_text(new_text)
                print(f"      FIX   {xml_path.relative_to(tmp_dir)}")

        # Also rename fontTable.xml font entries
        ft_path = tmp_dir / "word" / "fontTable.xml"
        if ft_path.exists():
            ft_xml = ft_path.read_text("utf-8")
            ft_xml, _ = replace_font_names_in_xml(ft_xml)
            ft_path.write_text(ft_xml)

        # Remove ALL font files
        for f in list(fonts_dir.rglob("*")):
            f.unlink()
        shutil.rmtree(fonts_dir)

        # Remove fontTable.xml.rels
        ft_rels_path = tmp_dir / "word" / "_rels" / "fontTable.xml.rels"
        if ft_rels_path.exists():
            ft_rels_path.unlink()

        # Clean up fontTable.xml — remove all embed elements
        ft_xml = ft_path.read_text("utf-8")
        ft_xml = re.sub(r'\s*<w:(embedRegular|embedBold|embedItalic|embedBoldItalic)[^>]*/>', "", ft_xml)
        ft_xml = re.sub(r'\s*<w:font w:name="[^"]+">\s*</w:font>', "", ft_xml)
        ft_path.write_text(ft_xml)

    # ── Re-zip ──────────────────────────────────────────────────
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zout:
        for fpath in sorted(tmp_dir.rglob("*")):
            if fpath.is_file():
                arcname = str(fpath.relative_to(tmp_dir))
                zout.write(fpath, arcname)

    shutil.rmtree(tmp_dir)
    return output_path


def _remove_unused_variants(tmp_dir: Path, ft_path: Path, ft_rels_path: Path) -> None:
    """For TTF-based files: drop unused bold/italic variants."""
    doc_xml = (tmp_dir / "word" / "document.xml").read_text("utf-8")
    ft_xml = ft_path.read_text("utf-8")
    ft_rels = ft_rels_path.read_text("utf-8") if ft_rels_path.exists() else ""

    # Detect variant usage
    used: dict[str, set[str]] = {}
    for m in re.finditer(r"<w:rPr>.*?</w:rPr>", doc_xml, re.DOTALL):
        block = m.group()
        font = re.search(r'w:ascii="([^"]+)"', block)
        if not font:
            continue
        name = font.group(1)
        if name not in used:
            used[name] = set()
        has_b = bool(re.search(r"<w:b[ /]", block))
        has_i = bool(re.search(r"<w:i[ /]", block))
        used[name].add("boldItalic" if (has_b and has_i) else "bold" if has_b else "italic" if has_i else "regular")

    # Parse font table → rId mapping
    rids_del: set[str] = set()
    rids_keep: set[str] = set()
    for font_m in re.finditer(r'<w:font w:name="([^"]+)">(.*?)</w:font>', ft_xml, re.DOTALL):
        name = font_m.group(1)
        inner = font_m.group(2)
        needed = used.get(name, {"regular"})
        for tag, variant in [("embedRegular", "regular"), ("embedBold", "bold"),
                             ("embedItalic", "italic"), ("embedBoldItalic", "boldItalic")]:
            em = re.search(f'<w:{tag} [^>]*r:id="([^"]+)"', inner)
            if em:
                rid = em.group(1)
                if variant in needed:
                    rids_keep.add(rid)
                else:
                    rids_del.add(rid)

    if not rids_del:
        return

    # Build rId → target mapping
    rid_to_target: dict[str, str] = {}
    for rm in re.finditer(r'Id="([^"]+)"[^>]*Target="([^"]+)"', ft_rels):
        rid_to_target[rm.group(1)] = rm.group(2)

    # Delete font files for dropped rIds
    for rid in rids_del:
        target = rid_to_target.get(rid)
        if target:
            p = tmp_dir / "word" / target
            if p.exists():
                p.unlink()
                print(f"      DEL   {target}")

    # Remove from rels
    pattern = '|'.join(re.escape(rid) for rid in rids_del)
    ft_rels = re.sub(rf'\s*<Relationship[^>]*Id="(?:{pattern})"[^>]*/>', '', ft_rels)
    if re.search(r'<Relationships[^>]*>\s*</Relationships>', ft_rels):
        ft_rels_path.unlink()
    else:
        ft_rels_path.write_text(ft_rels)

    # Remove from fontTable
    for rid in rids_del:
        for tag in ["embedRegular", "embedBold", "embedItalic", "embedBoldItalic"]:
            ft_xml = re.sub(rf'\s*<w:{tag}[^>]*r:id="{re.escape(rid)}"[^>]*/>', "", ft_xml)
    ft_xml = re.sub(r'\s*<w:font w:name="[^"]+">\s*</w:font>', "", ft_xml)
    ft_path.write_text(ft_xml)


if __name__ == "__main__":
    docs_dir = Path(__file__).parent
    for f in sorted(docs_dir.glob("*.docx")):
        if "_clean" in f.stem:
            continue
        sz = f.stat().st_size
        if sz < 50_000:
            continue
        print(f"  Processing: {f.name} ({sz // 1024} KB)")
        out = clean_docx(f)
        kb = out.stat().st_size / 1024
        print(f"  → {out.name} ({kb:.1f} KB)")
