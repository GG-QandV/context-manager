#!/usr/bin/env python3
"""Convert USAGE_GUIDE *.md → *.html with styling for Windows users."""

from markdown import markdown
from pathlib import Path

ISSUES_URL = "https://github.com/GG-QandV/context-manager/issues"

HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 880px; margin: 0 auto; padding: 20px 24px 60px;
    line-height: 1.6; color: #222;
  }}
  h1 {{ font-size: 1.6em; border-bottom: 2px solid #ddd; padding-bottom: 8px; }}
  h2 {{ font-size: 1.3em; margin-top: 1.5em; }}
  h3 {{ font-size: 1.1em; }}
  code {{ background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }}
  pre {{ background: #f4f4f4; padding: 12px; border-radius: 5px; overflow-x: auto; font-size: 0.9em; }}
  pre code {{ background: none; padding: 0; }}
  table {{ border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.9em; }}
  th, td {{ border: 1px solid #ccc; padding: 8px 10px; text-align: left; }}
  th {{ background: #eee; }}
  blockquote {{ border-left: 4px solid #4a90d9; margin: 1em 0; padding: 8px 16px; background: #f8f9fa; }}
  a {{ color: #4a90d9; }}
  .issue-banner {{
    background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px;
    padding: 12px 16px; margin-bottom: 20px; font-size: 0.95em;
  }}
  .issue-banner a {{ font-weight: bold; }}
  hr {{ border: none; border-top: 1px solid #ddd; margin: 2em 0; }}
</style>
</head>
<body>

<div class="issue-banner">
  🐛 Знайшли помилку в інструкції? Повідомте на
  <a href="{issues_url}" target="_blank">GitHub Issues</a>.
  &nbsp;|&nbsp;
  🐛 Found an error in this guide? Report at
  <a href="{issues_url}" target="_blank">GitHub Issues</a>.
</div>

{content}

<hr>
<p style="text-align:center;color:#888;font-size:0.85em">
  Context Manager &middot;
  <a href="{issues_url}" target="_blank">Report an issue</a>
</p>
</body>
</html>"""


def convert_md_to_html(md_path: Path, html_path: Path, lang: str, title: str) -> None:
    md_text = md_path.read_text(encoding="utf-8")
    html_body = markdown(
        md_text,
        extensions=["fenced_code", "tables", "codehilite"],
    )
    html = HTML_TEMPLATE.format(
        lang=lang, title=title, content=html_body, issues_url=ISSUES_URL,
    )
    html_path.write_text(html, encoding="utf-8")
    print(f"✅ {html_path.name}")


if __name__ == "__main__":
    docs = Path(__file__).parent
    convert_md_to_html(docs / "USAGE_GUIDE_EN.md", docs / "USAGE_GUIDE_EN.html", "en", "Context Manager — Usage Guide")
    convert_md_to_html(docs / "USAGE_GUIDE_UK.md", docs / "USAGE_GUIDE_UK.html", "uk", "Context Manager — Інструкція")
