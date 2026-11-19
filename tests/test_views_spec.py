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
from pathlib import Path

import pytest

from conftest import ROOT

pytestmark = pytest.mark.static

SPEC = ROOT / "elements" / "drishti-views" / "spec"
RACHANA = Path(os.environ.get("DRISHTI_RACHANA") or ROOT.parent / "drishti-rachana") / "spec" / "1" / "viewmodel.schema.json"


def _gen():
    spec = importlib.util.spec_from_file_location("drishti_views_gen", ROOT / "tools" / "views" / "gen.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_the_copy_is_the_pinned_specification_and_the_compact_form_is_current(capsys):
    pin = json.loads((SPEC / "drishti_viewmodel.pin.json").read_text(encoding="utf-8"))
    assert hashlib.sha256((SPEC / "drishti_viewmodel.schema.json").read_bytes()).hexdigest() == pin["sha256"]
    assert _gen().main(["--check"]) == 0, capsys.readouterr()


@pytest.mark.skipif(not RACHANA.is_file(), reason="no drishti-rachana checkout beside this project (DRISHTI_RACHANA names one)")
def test_the_pin_is_the_hash_of_the_specification_in_its_home():
    pin = json.loads((SPEC / "drishti_viewmodel.pin.json").read_text(encoding="utf-8"))
    assert hashlib.sha256(RACHANA.read_bytes()).hexdigest() == pin["sha256"], (
        "drishti-rachana's ViewModel schema moved: python3 tools/views/gen.py --sync " + str(RACHANA.parents[2]))


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
