#!/usr/bin/env python3
# Drishti Elements
#
# Copyright (c) 2026 Ashutosh Sinha <ajsinha@gmail.com>.
# All rights reserved.
#
# PROPRIETARY.
#
# This file is the proprietary property of Ashutosh Sinha.
# Copying, use, modification or distribution of this file, via any medium,
# is not permitted except with the express prior written permission of the
# copyright holder.
#
# See the LICENSE file in the root of this repository.

"""The docs site: the release tree (the gallery with it) plus the guides and the reference as HTML, in the gallery's look.

    python3 tools/docs/render_site.py --tree dist --out _site

``--tree`` is the folder ``tools/elements/cli.py dist`` wrote (it holds ``drishti-elements-<version>/``); ``--out`` is the site folder, which holds that
tree's files, ``docs/*.html`` and an ``index.html`` that opens the gallery. Offline and Python only: a small Markdown reader (headings, paragraphs,
lists, tables, fenced code, quotes, links, emphasis, inline code), written here so that the build needs no package. This is a docs site, not a CDN:
no page tells a reader to load a script from it."""
from __future__ import annotations

import argparse
import html
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ("README", "USING", "DESIGN", "API", "CONTRACTS", "THEMING", "MOVING_FROM_AG_GRID")
FOOTER = "Proprietary. Copyright (c) 2026 Ashutosh Sinha. All rights reserved. No licence is granted: see LICENSE."
STYLE = """:root{--bg:#fff;--ink:#14202b;--mute:#52606d;--line:#d5dce3;--link:#0a5cad;--code:#f3f6f9}
@media (prefers-color-scheme:dark){:root{--bg:#0e1419;--ink:#e3e9ef;--mute:#9aa7b4;--line:#2a3640;--link:#6db3ff;--code:#17202a}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,sans-serif}
header,main,footer{max-width:62rem;margin:0 auto;padding:0 16px}
header{display:flex;gap:16px;align-items:center;padding-top:14px;padding-bottom:14px;border-bottom:1px solid var(--line);flex-wrap:wrap}
header img{height:32px}header nav{display:flex;gap:14px;flex-wrap:wrap}a{color:var(--link)}
h1,h2,h3{line-height:1.25}pre{background:var(--code);padding:12px;overflow:auto;border-radius:6px}code{background:var(--code);padding:1px 4px;border-radius:4px}
pre code{padding:0;background:none}table{border-collapse:collapse;display:block;overflow:auto}th,td{border:1px solid var(--line);padding:4px 8px;text-align:left;vertical-align:top}
blockquote{margin:1em 0;padding:0 1em;border-left:4px solid var(--line);color:var(--mute)}footer{padding-top:18px;padding-bottom:30px;color:var(--mute);border-top:1px solid var(--line);margin-top:30px;font-size:14px}"""


def inline(t: str) -> str:
    codes: list[str] = []
    t = re.sub(r"`([^`]+)`", lambda m: codes.append(m.group(1)) or f"\0{len(codes) - 1}\0", t)
    t = html.escape(t, quote=False)
    t = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", lambda m: f'<a href="{fix_link(m.group(2))}">{m.group(1)}</a>', t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![\w*])\*([^*\n]+)\*(?![\w*])", r"<em>\1</em>", t)
    return re.sub(r"\0(\d+)\0", lambda m: "<code>" + html.escape(codes[int(m.group(1))], quote=False) + "</code>", t)


def fix_link(u: str) -> str:
    if u.startswith(("http://", "https://", "#", "mailto:")):
        return u
    path, _, frag = u.partition("#")
    name = Path(path).name
    if name.endswith(".md") and name[:-3] in DOCS:
        return name[:-3] + ".html" + ("#" + frag if frag else "")
    return "../" + path if path and not path.startswith("../") and not path.startswith("docs/") else path.replace("docs/", "", 1)


def markdown(text: str) -> str:
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    out, lines, i = [], text.split("\n"), 0
    while i < len(lines):
        ln = lines[i]
        if ln.startswith("```"):
            j = i + 1
            while j < len(lines) and not lines[j].startswith("```"):
                j += 1
            out.append("<pre><code>" + html.escape("\n".join(lines[i + 1:j]), quote=False) + "</code></pre>")
            i = j + 1
        elif re.match(r"#{1,6} ", ln):
            n = len(ln) - len(ln.lstrip("#"))
            title = ln[n + 1:].strip()
            slug = re.sub(r"[^a-z0-9 -]", "", re.sub(r"`", "", title.lower())).strip().replace(" ", "-")
            out.append(f'<h{n} id="{slug}">{inline(title)}</h{n}>')
            i += 1
        elif ln.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[-:| ]+\|\s*$", lines[i + 1]):
            head = [c.strip() for c in re.split(r"(?<!\\)\|", ln.strip())[1:-1]]
            rows, i = [], i + 2
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", lines[i].strip())[1:-1]])
                i += 1
            out.append("<table><thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>"
                       + "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rows) + "</tbody></table>")
        elif re.match(r"\s*([-*]|\d+\.) ", ln):
            ordered = bool(re.match(r"\s*\d+\.", ln))
            items = []
            while i < len(lines) and (re.match(r"\s*([-*]|\d+\.) ", lines[i]) or (lines[i].startswith("  ") and items and lines[i].strip())):
                if re.match(r"\s*([-*]|\d+\.) ", lines[i]):
                    items.append(re.sub(r"^\s*([-*]|\d+\.) ", "", lines[i]))
                else:
                    items[-1] += " " + lines[i].strip()
                i += 1
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}>" + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{tag}>")
        elif ln.startswith(">"):
            block = []
            while i < len(lines) and lines[i].startswith(">"):
                block.append(lines[i].lstrip("> "))
                i += 1
            out.append("<blockquote><p>" + inline(" ".join(block)) + "</p></blockquote>")
        elif not ln.strip():
            i += 1
        else:
            para = []
            while i < len(lines) and lines[i].strip() and not re.match(r"(#{1,6} |```|\||>|\s*([-*]|\d+\.) )", lines[i]):
                para.append(lines[i].strip())
                i += 1
            out.append("<p>" + inline(" ".join(para)) + "</p>")
    return "\n".join(out)


def page(title: str, body: str, logo: str | None) -> str:
    img = f'<img src="{logo}" alt="">' if logo else ""
    nav = " ".join(f'<a href="{d}.html">{d.replace("_", " ").title() if d != "API" else "API"}</a>' for d in DOCS[1:])
    return (f'<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            f"<title>{html.escape(title)}</title><style>{STYLE}</style></head><body><header>{img}"
            f'<strong>Drishti Elements</strong><nav><a href="../gallery/drishti_gallery.html">Gallery</a> {nav}</nav></header>'
            f"<main>{body}</main><footer>{html.escape(FOOTER)}</footer></body></html>\n")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--tree", required=True, help="the folder tools/elements/cli.py dist wrote")
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    trees = sorted(Path(a.tree).glob("drishti-elements-*/"))
    trees = [t for t in trees if t.is_dir()]
    if not trees:
        raise SystemExit("render_site: no drishti-elements-<version> folder under " + a.tree)
    out = Path(a.out)
    shutil.rmtree(out, ignore_errors=True)
    shutil.copytree(trees[-1], out)
    logo = "../brand/drishti_elements-mark.svg" if (out / "brand" / "drishti_elements-mark.svg").is_file() else None
    (out / "docs").mkdir(exist_ok=True)
    for d in DOCS:
        src = ROOT / ("README.md" if d == "README" and False else f"docs/{d}.md")
        if not src.is_file():
            continue
        (out / "docs" / f"{d}.html").write_text(page(f"Drishti Elements: {d}", markdown(src.read_text(encoding="utf-8")), logo), encoding="utf-8")
    (out / "docs" / "index.html").write_text((out / "docs" / "README.html").read_text(encoding="utf-8"), encoding="utf-8")
    (out / "index.html").write_text('<!doctype html><meta charset="utf-8"><title>Drishti Elements</title><meta http-equiv="refresh" content="0; url=gallery/drishti_gallery.html">'
                                    '<p><a href="gallery/drishti_gallery.html">The gallery</a> and <a href="docs/index.html">the docs</a>.</p>'
                                    f"<footer>{html.escape(FOOTER)}</footer>\n", encoding="utf-8")
    print(f"wrote {out} ({len(DOCS)} documents)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
