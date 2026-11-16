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

"""One version for Drishti Elements: every library (core, inputs, grid, chart, data, designer, graph, tree) shares ONE semantic version,
``elements`` in elements/drishti_elements.json. No library has a version of its own; every bundle, the generated manifest, the reference,
the catalogue and the docs name that one value, and nothing names another Elements version."""
import json
import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.static   # a quick file check: the gate runs it

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "elements" / "drishti_elements.json"
RAW = json.loads(MANIFEST.read_text(encoding="utf-8"))
VERSION = RAW["elements"]
LIBS = "core|inputs|grid|chart|data|designer|graph|tree"
NAMED = re.compile(r"\bdrishti-(?:%s) (\d+\.\d+\.\d+)" % LIBS)
SCANNED = ("elements", "gallery", "tools", "tests", "docs", "css", "README.md", "CHANGELOG.md")
SKIPPED = ("tests/test_elements_version.py", "node_modules", "/vendor/", ".venv", "dist/", "gallery/drishti_catalogue.js", "docs/API.md", "CHANGELOG.md")


def test_the_version_is_one_semver_and_no_library_has_its_own():
    assert re.fullmatch(r"\d+\.\d+\.\d+", VERSION), VERSION
    assert [n for n, spec in RAW["libraries"].items() if "version" in spec] == []


def test_every_bundle_and_the_generated_manifest_carry_that_version():
    for name in RAW["libraries"]:
        short = name[len("drishti-"):]
        head = (ROOT / "elements" / name / f"drishti_{short.replace('-', '_')}.js").read_text(encoding="utf-8")[:1500]
        assert f"/* {name} {VERSION}:" in head, name
    gen = (ROOT / "elements" / "drishti-core" / "src" / "drishti_manifest.js").read_text(encoding="utf-8")
    assert f'"elements": "{VERSION}"' in gen and '"version"' not in gen


def test_the_reference_the_catalogue_and_the_changelog_say_it():
    assert (ROOT / "docs/API.md").read_text(encoding="utf-8").count(f"# Drishti Elements {VERSION}: the API reference") == 1
    assert f'"elements":"{VERSION}"' in (ROOT / "gallery" / "drishti_catalogue.js").read_text(encoding="utf-8").replace(" ", "")
    assert re.search(r"^## " + re.escape(VERSION) + r"\b", (ROOT / "CHANGELOG.md").read_text(encoding="utf-8"), re.M)


def _texts():
    for sub in SCANNED:
        base = ROOT / sub
        for f in ([base] if base.is_file() else sorted(base.rglob("*"))):
            rel = f.relative_to(ROOT).as_posix()
            if f.is_file() and f.suffix in (".js", ".mjs", ".py", ".html", ".md", ".json", ".css", ".ts", ".yaml") and not any(s in rel for s in SKIPPED):
                try:
                    yield rel, f.read_text(encoding="utf-8")
                except UnicodeDecodeError:
                    continue


def test_nothing_names_another_elements_version():
    bad = []
    for rel, text in _texts():
        for line in text.splitlines():
            bad += [f"{rel}: {m.group()}" for m in NAMED.finditer(line) if m.group(1) != VERSION]
    assert not bad, "Elements has one version (" + VERSION + "); these name another:\n" + "\n".join(bad[:30])
