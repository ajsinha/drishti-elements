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


"""drishti-views' specification (a quick file check): the ViewModel schema is a byte-for-byte copy of drishti-rachana's
spec/1/viewmodel.schema.json whose hash is its pin (and, when a drishti-rachana checkout sits beside this project, the pin is that file's
hash: one contract, one home, decision N3); the compact form the validator reads is current; the generator refuses a schema keyword
the validator does not implement, so the schema cannot outgrow its validator; the vectors name only views and frames, with stable ids;
the budgets file names every budget the tests read."""
import hashlib
import importlib.util
import json
import os
import subprocess
from pathlib import Path

import pytest

from conftest import ROOT

pytestmark = pytest.mark.static

SPEC = ROOT / "elements" / "drishti-views" / "spec"
RACHANA_DIR = Path(os.environ.get("DRISHTI_RACHANA") or ROOT.parent / "drishti-rachana")
RACHANA = RACHANA_DIR / "spec" / "1" / "viewmodel.schema.json"
HAS_RACHANA = (RACHANA_DIR / ".git").exists()
FIRE = ROOT / "tests" / "support" / "fire_cases.json"


def _git(*args: str) -> bytes:
    """Rachana's objects at a named commit or ref, never the files of whatever branch the sibling checkout has out."""
    return subprocess.run(["git", "-C", str(RACHANA_DIR), *args], capture_output=True, check=True).stdout


def _fire_hash(rev: str) -> str:
    h = hashlib.sha256()
    for name in sorted(n for n in _git("ls-tree", "--name-only", rev, "conformance/1/fire/").decode().split() if n.endswith(".yaml")):
        h.update(name.rsplit("/", 1)[1].encode() + b"\0")
        h.update(_git("show", f"{rev}:{name}"))
    return h.hexdigest()


def _gen():
    spec = importlib.util.spec_from_file_location("drishti_views_gen", ROOT / "tools" / "views" / "gen.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_the_copy_is_the_pinned_specification_and_the_compact_form_is_current(capsys):
    pin = json.loads((SPEC / "drishti_viewmodel.pin.json").read_text(encoding="utf-8"))
    assert hashlib.sha256((SPEC / "drishti_viewmodel.schema.json").read_bytes()).hexdigest() == pin["sha256"]
    assert _gen().main(["--check"]) == 0, capsys.readouterr()


@pytest.mark.skipif(not HAS_RACHANA, reason="no drishti-rachana checkout beside this project (DRISHTI_RACHANA names one)")
def test_the_pin_is_the_hash_of_the_specification_at_the_pinned_commit():
    """By the commit the pin names, never by the files of the branch the sibling checkout happens to have out."""
    pin = json.loads((SPEC / "drishti_viewmodel.pin.json").read_text(encoding="utf-8"))
    assert pin.get("commit"), "the pin names no drishti-rachana commit: python3 tools/views/gen.py --sync DIR --commit <hash>"
    got = _git("show", f"{pin['commit']}:spec/1/viewmodel.schema.json")
    assert hashlib.sha256(got).hexdigest() == pin["sha256"], (
        "the pin is not the schema at its commit " + pin["commit"] + ": python3 tools/views/gen.py --sync " + str(RACHANA_DIR) + " --commit <hash>")


def test_the_fire_cases_fixture_names_the_rachana_commit_and_the_hash_it_was_made_from():
    fx = json.loads(FIRE.read_text(encoding="utf-8"))
    assert fx.get("commit") and fx.get("ref") and len(fx.get("sha256", "")) == 64 and fx["cases"], (
        "tests/support/fire_cases.json has no pin: node tools/views/fire_fixture.mjs <drishti-rachana checkout>")


@pytest.mark.skipif(not HAS_RACHANA, reason="no drishti-rachana checkout beside this project (DRISHTI_RACHANA names one)")
def test_the_fire_cases_fixture_is_the_cases_at_its_commit_and_they_have_not_moved_since():
    fx = json.loads(FIRE.read_text(encoding="utf-8"))
    assert _fire_hash(fx["commit"]) == fx["sha256"], "the fixture's hash is not the fire cases at its commit " + fx["commit"]
    now = _fire_hash(fx["ref"])
    assert now == fx["sha256"], ("drishti-rachana's fire cases at " + fx["ref"] + " changed since the fixture was made: "
                                 "node tools/views/fire_fixture.mjs " + str(RACHANA_DIR) + " (needs its runtime bundle built) and commit the new fixture")


def test_a_keyword_the_validator_does_not_implement_is_refused():
    gen = _gen()
    with pytest.raises(gen.SpecError, match="unevaluatedProperties"):
        gen.compact({"$defs": {"A": {"type": "object", "unevaluatedProperties": False}}})
    assert gen.compact({"properties": {"description": {"type": "string", "description": "a field named like an annotation"}}}) == {
        "properties": {"description": {"type": "string"}}}


def test_the_vectors_have_stable_ids_and_the_budgets_are_named():
    vectors = json.loads((SPEC / "drishti_vectors.json").read_text(encoding="utf-8"))
    ids = [v["id"] for v in vectors["views"]] + [f["id"] for f in vectors["frames"]]
    assert len(ids) == len(set(ids))
    assert all(set(v) == {"id", "about", "view", "expect"} for v in vectors["views"])
    assert all(set(f) == {"id", "about", "frame", "expect"} for f in vectors["frames"])
    budget = json.loads((ROOT / "tests" / "views_budget.json").read_text(encoding="utf-8"))
    assert {"calibration-ms", "first-paint-ms", "ready-ms", "patch-apply-ms", "patch-to-pixel-p99-ms", "validate-200kb-ms"} <= set(budget)
