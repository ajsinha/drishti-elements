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
"""Drishti Elements for other applications (docs/USING.md).

    python3 tools/elements/cli.py pack --libs core,grid,chart [--theme dark] [--out DIR] [--no-engines] [--maps] [--data]
    python3 tools/elements/cli.py dist [--out DIR]

pack writes one JavaScript file and one style sheet with the named libraries; dist writes the release tree and its zip.
Nothing is published anywhere: the outputs are files for an application's own folder or a release archive."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dist  # noqa: E402
import pack as packer  # noqa: E402

DEFAULT_OUT = dist.ROOT / "dist"
EXAMPLES = ("examples:\n  python3 tools/elements/cli.py pack --libs core,grid,chart --theme dark --out build/app-vendor\n"
            "  python3 tools/elements/cli.py dist --out dist\n"
            "Exit codes: 0 written, 1 refused (an unknown library), 2 usage.")


def human(n: int) -> str:
    return f"{n / 1048576:.1f} MB" if n >= 1048576 else f"{n / 1024:.0f} KB"


def cmd_pack(a) -> int:
    try:
        rec = packer.pack([x for x in a.libs.split(",") if x.strip()], Path(a.out), theme=a.theme, engines=not a.no_engines, maps=a.maps, data=a.data)
    except dist.DistError as e:
        print(f"elements pack: {e}", file=sys.stderr)
        return 1
    print("packed: " + ", ".join(f"{n} {v}" for n, v in rec["libraries"].items()) + f"; theme {rec['theme']}"
          + (f"; engines {', '.join(rec['engines'])}" if rec["engines"] else ""))
    for name in (packer.JS_NAME, packer.CSS_NAME):
        f = rec["files"][name]
        print(f"  {Path(a.out) / name}  {human(f['bytes'])}  {f['integrity']}")
    others = [p for p in rec["files"] if p not in (packer.JS_NAME, packer.CSS_NAME)]
    if others:
        print(f"  and {len(others)} file(s) the libraries read at run time under {Path(a.out) / 'vendor'}")
    return 0


def cmd_dist(a) -> int:
    try:
        made = dist.build_all(Path(a.out))
    except dist.DistError as e:
        print(f"elements dist: {e}", file=sys.stderr)
        return 1
    for p, size in made:
        print(f"{p}  {human(size)}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="elements", description=__doc__.split("\n\n")[0], epilog=EXAMPLES, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", metavar="COMMAND", required=True)
    p = sub.add_parser("pack", help="one JavaScript file and one style sheet with exactly the named libraries and what they require")
    p.set_defaults(func=cmd_pack)
    p.add_argument("--libs", required=True, help="comma list: core, inputs, grid, chart, data, tree, graph, designer (or drishti-grid ...), or all")
    p.add_argument("--theme", help="one theme on :root: dark, light or a theme's name (terminal, blue, wallstreet ...); default every theme")
    p.add_argument("--out", default=str(DEFAULT_OUT / "pack"), help="the folder to write (default dist/pack)")
    p.add_argument("--no-engines", action="store_true", help="leave the vendored engines (ECharts) out: the page loads its own first")
    p.add_argument("--maps", action="store_true", help="copy drishti-chart's map shapes (vendor/echarts/maps) beside the files")
    p.add_argument("--data", action="store_true", help="copy the shared tables a server formats with (data/formats.yaml, data/world-regions.yaml) under data/")
    d = sub.add_parser("dist", help="the release tree drishti-elements-<version>/ and its zip (SRI hashes, themes, gallery)")
    d.set_defaults(func=cmd_dist)
    d.add_argument("--out", default=str(DEFAULT_OUT), help="the folder to write (default dist)")
    a = ap.parse_args(argv)
    return a.func(a)


if __name__ == "__main__":
    sys.exit(main())
