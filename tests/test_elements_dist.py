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

"""Drishti Elements distributed (tools/elements/dist.py, pack.py, cli.py):

* the release tree and its zip hold what their manifest says, every file with a matching SHA-384 integrity hash, reproducibly;
* the pack tool's dependency resolution and its themes;
* the TypeScript declarations name every export of each library.

The browser half (a static page drawing a grid and a chart from the packed files) is test_elements_pack_browser.py."""
import base64
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools" / "elements"))
import cli  # noqa: E402
import dist  # noqa: E402
import pack  # noqa: E402

TRAIN = dist.Train()
ALL = list(TRAIN.libs)


def sri(b: bytes) -> str:
    return "sha384-" + base64.b64encode(hashlib.sha384(b).digest()).decode()


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    out = tmp_path_factory.mktemp("elements-dist")
    dist.build_all(out)
    return out


def zip_files(path: Path) -> dict[str, bytes]:
    with zipfile.ZipFile(path) as z:
        top = f"drishti-elements-{TRAIN.version}/"
        assert all(n.startswith(top) for n in z.namelist())
        return {n[len(top):]: z.read(n) for n in z.namelist()}


def test_the_zip_holds_every_library_with_matching_hashes(built):
    files = zip_files(built / f"drishti-elements-{TRAIN.version}.zip")
    man = json.loads(files["drishti-elements.json"])
    assert man["version"] == TRAIN.version and sorted(man["libraries"]) == sorted(ALL)
    assert set(man["files"]) == set(files) - {"drishti-elements.json"}                 # nothing unlisted, nothing missing
    for p, rec in man["files"].items():
        assert rec["bytes"] == len(files[p]) and rec["integrity"] == sri(files[p]), p
    for lib, spec in man["libraries"].items():
        assert "version" not in spec     # one version for the release, none per library
        for key in ("bundle", "entry", "types"):
            assert spec[key] in files, (lib, key)
        for c in spec["css"]:
            assert c in files, (lib, c)
        srcdir = dist.ELEMENTS / lib / "src"
        assert {p for p in files if p.startswith(f"elements/{lib}/src/")} == {f"elements/{lib}/src/{f.name}" for f in srcdir.glob("*.js")}
        assert files[spec["bundle"]] == (dist.ELEMENTS / lib / dist.bundle_name(lib)).read_bytes()
    for must in ("vendor/echarts/echarts.min.js", "vendor/echarts/LICENSE", "vendor/codemirror/codemirror.js", "vendor/VENDOR.md", "LICENSE",
                 "README.md", "CHANGELOG.md", "gallery/drishti_gallery.html", "data/world-regions.yaml", "data/formats.yaml", "tools/elements/build.py"):
        assert must in files, must
    assert any(p.startswith("vendor/echarts/maps/") for p in files) and any(p.startswith("vendor/apache-arrow/") for p in files)
    themes = dist.theme_names()
    assert set(man["themes"]) == set(themes) and all(f"themes/drishti-theme-{t}.css" in files for t in themes)
    assert files["css/drishti_tokens.css"] == (dist.ROOT / dist.TOKENS).read_bytes()
    assert not any("drishti_harness" in p or p.startswith("tests/") for p in files)            # harness pages and tests are not shipped


def test_the_tree_and_the_zip_are_the_same_bytes_and_reproducible(built, tmp_path):
    files = zip_files(built / f"drishti-elements-{TRAIN.version}.zip")
    tree = built / f"drishti-elements-{TRAIN.version}"
    assert {p.relative_to(tree).as_posix() for p in tree.rglob("*") if p.is_file()} == set(files)
    assert all((tree / p).read_bytes() == b for p, b in files.items())
    again = dist.build_all(tmp_path)
    assert (tmp_path / f"drishti-elements-{TRAIN.version}.zip").read_bytes() == (built / f"drishti-elements-{TRAIN.version}.zip").read_bytes()
    assert again


# -- the pack tool --------------------------------------------------------------------------------------------------------------------
def test_dependencies_resolve_deepest_first_each_once():
    assert TRAIN.resolve(["grid"]) == ["drishti-core", "drishti-inputs", "drishti-chart", "drishti-grid"]
    assert TRAIN.resolve(["chart", "drishti-grid", "core"]) == ["drishti-core", "drishti-inputs", "drishti-chart", "drishti-grid"]
    assert TRAIN.resolve(["designer"])[-1] == "drishti-designer" and TRAIN.resolve(["designer"])[0] == "drishti-core"
    assert sorted(TRAIN.resolve(["all"])) == sorted(ALL)
    with pytest.raises(dist.DistError, match="no library nope"):
        TRAIN.resolve(["nope"])


def test_the_pack_names_what_it_holds_and_carries_one_theme(tmp_path, capsys):
    assert cli.main(["pack", "--libs", "grid", "--theme", "light", "--out", str(tmp_path), "--no-engines"]) == 0
    said = capsys.readouterr().out
    assert said.startswith("packed: drishti-core ") and "drishti-grid" in said and "theme light" in said
    js = (tmp_path / pack.JS_NAME).read_text(encoding="utf-8")
    css = (tmp_path / pack.CSS_NAME).read_text(encoding="utf-8")
    head = js[:1500]
    assert f"drishti-core {TRAIN.version}" in head and f"drishti-grid {TRAIN.version}" in head
    assert "echarts" not in js.lower()[:5000] and js.count("PROPRIETARY") == 1
    assert js.index("drishti-core ") < js.index("/* ---- drishti-grid")
    assert re.findall(r'data-theme="([\w-]+)"', css) == ["light"]                                          # one theme, on :root
    assert "--d-accent:" in css and "drishti_grid.css" in css and css.count("PROPRIETARY") == 1
    rec = json.loads((tmp_path / pack.RECORD).read_text(encoding="utf-8"))
    assert rec["libraries"] == {n: TRAIN.version for n in ("drishti-core", "drishti-inputs", "drishti-chart", "drishti-grid")}
    assert rec["files"][pack.JS_NAME]["integrity"] == sri((tmp_path / pack.JS_NAME).read_bytes())
    assert sorted(p.name for p in (tmp_path / "vendor").iterdir()) == ["codemirror", "echarts-gl"]         # the assets: the code editor's engine, the 3D trace's
    assert "drishti-chart:geo" not in js                                                                     # no maps, no map helper


def test_a_pack_with_maps_carries_the_shapes_and_the_map_helper(tmp_path):
    assert cli.main(["pack", "--libs", "chart", "--maps", "--out", str(tmp_path), "--no-engines"]) == 0
    js = (tmp_path / pack.JS_NAME).read_text(encoding="utf-8")
    assert js.index("/* ---- drishti-chart " + TRAIN.version) < js.index("/* ---- drishti-chart:geo " + TRAIN.version)   # after its library
    assert "libs[\"drishti-chart:geo\"]" in js
    assert (tmp_path / "vendor" / "echarts" / "maps" / "regions" / "USA.json").is_file() and (tmp_path / "vendor" / "echarts" / "maps" / "world-countries.json").is_file()


def test_themes_aliases_and_a_theme_sheet_carries_every_token():
    table = dist.themes()
    names = dist.theme_names(table)
    default = next(t for t in names if table[t]["default"])
    assert dist.theme_alias("dark", table) == default and table[dist.theme_alias("light", table)]["scheme"] == "light"
    with pytest.raises(dist.DistError, match="no theme"):
        dist.theme_alias("purple", table)
    tokens = (dist.ROOT / dist.TOKENS).read_text(encoding="utf-8")
    every = set(re.findall(r"(--d-[\w-]+)\s*:", tokens))
    for t in names:
        sheet = dist.theme_css(t, table)
        assert every <= set(re.findall(r"(--d-[\w-]+)\s*:", sheet)), t
        assert ("@media print" in sheet) == ("@media print" in tokens) and "prefers-color-scheme" not in sheet


def test_the_declarations_name_every_export():
    sys.path.insert(0, str(ROOT / "tools" / "docs"))
    import elements_api
    for lib in TRAIN.libs:
        files = dist.library_tree(TRAIN, lib)
        d = files[f"elements/{lib}/drishti-{dist.short(lib)}.d.ts"].decode()
        declared = set(re.findall(r"^export (?:declare (?:function|class|const)|interface|type) ([\w$]+)", d, re.M))
        for name, _ in elements_api.exports_of((dist.ELEMENTS / lib / TRAIN.libs[lib]["entry"]).resolve()):
            assert name in declared, (lib, name)
        assert d.count("{") == d.count("}") and d.count("(") == d.count(")"), lib
        assert "undefined;" not in d and ": ;" not in d
        for part, ps in (TRAIN.libs[lib].get("parts") or {}).items():           # a part's own declarations (a worker has none)
            if ps.get("worker"):
                continue
            d = files[f"elements/{lib}/drishti-{dist.short(lib)}-{part}.d.ts"].decode()
            declared = set(re.findall(r"^export (?:declare (?:function|class|const)|interface|type) ([\w$]+)", d, re.M))
            for name, _ in elements_api.exports_of((dist.ELEMENTS / lib / ps["entry"]).resolve()):
                assert name in declared, (lib, part, name)
