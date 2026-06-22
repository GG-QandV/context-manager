#!/usr/bin/env python3
"""
Copy fonts from one .docx to another.

Used when source .docx has subsetted TTF fonts that render correctly,
and target .docx has unreadable ODTTF fonts from LibreOffice.

Strategy:
  - Extract TTF font files from source doc
  - Map target font names → source font names
  - Update ALL XML files with new font names
  - Create clean fontTable.xml entries
  - Create fontTable.xml.rels
  - Remove all old font files
"""

import re
import shutil
import zipfile
from pathlib import Path


def main():
    src = Path("docs/Євгеній_Нам_Офер_інтеграція_clean.docx")
    dst = Path("docs/Євгеній_Нам_Офер_навчання.docx")
    out = Path("docs/Євгеній_Нам_Офер_навчання_clean.docx")

    # Map old font names (in target doc) → new font names (in source doc)
    FONT_MAP = {
        "Nunito ExtraLight": "Nunito",
        "Oswald Light": "Oswald Light",
        "Noto Sans Symbols": "Liberation Sans",
    }

    # Which variants are actually used in the target doc?
    # From earlier analysis: Nunito ExtraLight uses regular + italic.
    # Oswald Light uses regular only.
    NEEDED_VARIANTS = {
        "Nunito": {"regular", "italic"},
        "Oswald Light": {"regular"},
    }

    tmp = dst.with_suffix(".tmp_cpfonts")
    if tmp.exists():
        shutil.rmtree(tmp)

    # ── Extract target doc ──────────────────────────────────────
    with zipfile.ZipFile(dst, "r") as z:
        z.extractall(tmp)

    # ── Extract font files + metadata from source doc ──────────
    with zipfile.ZipFile(src, "r") as z:
        src_all = {n: z.read(n) for n in z.namelist()}
        src_ft = src_all["word/fontTable.xml"].decode()
        src_rels_raw = src_all.get("word/_rels/fontTable.xml.rels", b"").decode()

    # Parse source rels: rId → target file
    rid_to_target = {}
    for m in re.finditer(r'Id="([^"]+)"[^>]*Target="([^"]+)"', src_rels_raw):
        rid_to_target[m.group(1)] = m.group(2)

    # Parse source fontTable: font_name → {variant → rId}
    src_fonts: dict[str, dict[str, str]] = {}
    for m in re.finditer(r'<w:font w:name="([^"]+)">(.*?)</w:font>', src_ft, re.DOTALL):
        name = m.group(1)
        inner = m.group(2)
        embeds = {}
        for tag, var in [("embedRegular", "regular"), ("embedBold", "bold"),
                         ("embedItalic", "italic"), ("embedBoldItalic", "boldItalic")]:
            em = re.search(f'<w:{tag}[^>]*r:id="([^"]+)"', inner)
            if em:
                embeds[var] = em.group(1)
        if embeds:
            src_fonts[name] = embeds

    print(f"Source fonts available: {list(src_fonts.keys())}")

    # ── Build mapping: new_font_name → {variant → ttf_data} ────
    fonts_to_copy: dict[str, dict[str, bytes]] = {}
    for new_name, needed_vars in NEEDED_VARIANTS.items():
        if new_name in src_fonts:
            fonts_to_copy[new_name] = {}
            src_embeds = src_fonts[new_name]
            for var in needed_vars:
                if var in src_embeds:
                    rid = src_embeds[var]
                    target = rid_to_target.get(rid, "")
                    full_path = f"word/{target}" if target else ""
                    if full_path in src_all:
                        fonts_to_copy[new_name][var] = src_all[full_path]
                        print(f"  {new_name}/{var} ← {Path(target).name}")
                    else:
                        print(f"  WARN: {new_name}/{var}: file not found for rId={rid}")
                else:
                    # Variant not available — use any available variant
                    fallback_var = next(iter(src_embeds.keys()), None)
                    if fallback_var:
                        rid = src_embeds[fallback_var]
                        target = rid_to_target.get(rid, "")
                        full_path = f"word/{target}" if target else ""
                        if full_path in src_all:
                            fonts_to_copy[new_name][var] = src_all[full_path]
                            print(f"  {new_name}/{var} ← {Path(target).name} (fallback {fallback_var})")
                    else:
                        print(f"  WARN: {new_name}/{var}: no variants available")

    # ── Remove ALL old font files ──────────────────────────────
    fonts_dir = tmp / "word" / "fonts"
    if fonts_dir.exists():
        shutil.rmtree(fonts_dir)
    fonts_dir.mkdir()

    # ── Write new font files ───────────────────────────────────
    new_rels: list[tuple[str, str]] = []  # (rid, target_path)
    next_rid = 1

    TAG_MAP = {"regular": "embedRegular", "bold": "embedBold",
               "italic": "embedItalic", "boldItalic": "embedBoldItalic"}

    for font_name, variants in fonts_to_copy.items():
        for var_name, data in variants.items():
            fname = f"font_{font_name.replace(' ', '')}_{var_name}.ttf"
            (fonts_dir / fname).write_bytes(data)
            rid = f"rId{next_rid}"
            next_rid += 1
            new_rels.append((rid, f"fonts/{fname}"))
            print(f"  COPY {fname}")

    # ── Update fontTable.xml ────────────────────────────────────
    ft_path = tmp / "word" / "fontTable.xml"
    ft_xml = ft_path.read_text("utf-8")

    # Remove ALL embed elements from LibreOffice/Google entries
    ft_xml = re.sub(r'\s*<w:(embedRegular|embedBold|embedItalic|embedBoldItalic)[^>]*/>', "", ft_xml)
    # Remove entries that became empty (had embeds, now none)
    ft_xml = re.sub(r'\s*<w:font w:name="[^"]+">\s*</w:font>', "", ft_xml)

    # Preserve system font entries (no embeds), remove the rest
    kept_entries = []
    for m in re.finditer(r'<w:font[^>]*>.*?</w:font>', ft_xml, re.DOTALL):
        entry = m.group()
        if 'embed' not in entry:
            kept_entries.append(entry)

    # Extract xmlns declaration from original
    xmlns_match = re.search(r'(<w:fonts[^>]*>)', ft_xml)
    xmlns = xmlns_match.group(1) if xmlns_match else '<w:fonts>'

    # Build new font entries with embeds
    new_entries_xml = ""
    for font_name, variants in fonts_to_copy.items():
        embeds_xml = ""
        for var_name in sorted(variants.keys()):
            tag = TAG_MAP[var_name]
            fname = f"font_{font_name.replace(' ', '')}_{var_name}.ttf"
            rid = [r for r, t in new_rels if t == f"fonts/{fname}"][0]
            embeds_xml += f'<w:{tag} w:fontKey="{{00000000-0000-0000-0000-000000000000}}" r:id="{rid}" w:subsetted="0"/>'
        new_entries_xml += f'<w:font w:name="{font_name}">{embeds_xml}</w:font>'

    # Add Liberation Sans for Noto Sans Symbols fallback
    new_entries_xml += '<w:font w:name="Liberation Sans"><w:altName w:val="Arial"/><w:charset w:val="01"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>'

    ft_xml = xmlns + "".join(kept_entries) + new_entries_xml + "</w:fonts>"
    ft_path.write_text(ft_xml)

    # ── Update fontTable.xml.rels ───────────────────────────────
    rels_path = tmp / "word" / "_rels" / "fontTable.xml.rels"
    rels_path.parent.mkdir(parents=True, exist_ok=True)
    rels_xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    rels_xml += '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
    for rid, target in new_rels:
        rels_xml += f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="{target}"/>\n'
    rels_xml += '</Relationships>'
    rels_path.write_text(rels_xml)

    # ── Rename font names in ALL XML files ──────────────────────
    for xml_path in sorted(tmp.rglob("*.xml")):
        if xml_path.stat().st_size == 0:
            continue
        text = xml_path.read_text("utf-8")
        changed = False
        for old_name, new_name in FONT_MAP.items():
            for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs", "w:font"):
                new_text = re.sub(f'{attr}="{re.escape(old_name)}"', f'{attr}="{new_name}"', text)
                if new_text != text:
                    changed = True
                    text = new_text
        if changed:
            xml_path.write_text(text)
            print(f"  RENAME in {xml_path.relative_to(tmp)}")

    # ── Re-zip ──────────────────────────────────────────────────
    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
        for fpath in sorted(tmp.rglob("*")):
            if fpath.is_file():
                zout.write(fpath, str(fpath.relative_to(tmp)))

    shutil.rmtree(tmp)
    print(f"\n✓ {out.name} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
