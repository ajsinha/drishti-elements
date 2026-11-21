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

"""The Elements' performance budget (a quick file check): each library's bundle stays under its byte budget, and the style sheets of the
components under theirs. A budget is raised only with a reason in the commit; a library that grows past it is split or lazy-loaded
(drishti-core's loader), not allowed to creep. Frame time per gallery page is the browser budget of the gallery test, not here."""
from pathlib import Path

import pytest

pytestmark = pytest.mark.static

ELEMENTS = Path(__file__).resolve().parent.parent / "elements"
CSS = Path(__file__).resolve().parent.parent / "css"
# bytes; about 15% over the size when written (2026-11-16); raised the same day for the chart (more kinds, the world regions) and data (worker, feed monitor);
# the chart again for the generic kinds (segmented scatter, matrix, lollipop, 3D trace, heatmap tracks)
BUNDLES = {"drishti-core": 180_000, "drishti-inputs": 290_000, "drishti-grid": 610_000, "drishti-tree": 145_000, "drishti-designer": 170_000,
           "drishti-data": 42_000, "drishti-chart": 320_000, "drishti-graph": 165_000,
           "drishti-views": 192_000,   # drishti-views: 182,651 with contract 1.1 (datasets, grid, tree, chart, map points; the schema 13 definitions larger), plus about 5%
           "drishti-events": 200_000}  # drishti-events: 190,414 when 3.0.0 was made ready, plus about 5% (the design's 110,000 assumed far
#                                     less JSDoc and no shared hub, metrics, recorder or badge; a part of its own is the way to grow further)
SHEETS = {"drishti_states.css": 4_000, "drishti_command-palette.css": 5_000, "drishti_dock.css": 5_000, "drishti_chips.css": 5_000}


@pytest.mark.parametrize("library,budget", sorted(BUNDLES.items()))
def test_a_bundle_stays_under_its_budget(library, budget):
    f = ELEMENTS / library / ("drishti_" + library.split("-", 1)[1] + ".js")
    assert f.stat().st_size <= budget, f"{f.name} is {f.stat().st_size} bytes, over its budget of {budget}: split it or lazy-load the part"


@pytest.mark.parametrize("sheet,budget", sorted(SHEETS.items()))
def test_a_component_sheet_stays_under_its_budget(sheet, budget):
    assert (CSS / sheet).stat().st_size <= budget, sheet


def test_every_library_has_a_budget():
    import json
    libs = set(json.loads((ELEMENTS / "drishti_elements.json").read_text(encoding="utf-8"))["libraries"])
    assert libs == set(BUNDLES), sorted(libs ^ set(BUNDLES))


# a library's parts (files beside its bundle, loaded only when needed) and their sheets: bytes
# (each its size when 3.0.0 was made ready, plus about 5%)
PARTS = {"drishti-events/drishti_events-worker.js": 2_500, "drishti-events/drishti_events-mock.js": 22_500,
         "drishti-events/drishti_events-inspector.js": 18_300, "drishti-events/drishti_events-inspector.css": 3_600,
         "drishti-chart/drishti_chart-geohelper.js": 14_400}   # the geo part (the map helper of view map panels): 13,627 when written, plus about 5%


@pytest.mark.parametrize("part,budget", sorted(PARTS.items()))
def test_a_part_stays_under_its_budget(part, budget):
    assert (ELEMENTS / part).stat().st_size <= budget, part


def test_every_part_has_a_budget():
    import json
    libs = json.loads((ELEMENTS / "drishti_elements.json").read_text(encoding="utf-8"))["libraries"]
    parts = {f"{n}/{p['file']}" for n, spec in libs.items() for p in (spec.get("parts") or {}).values()}
    parts |= {c[len("elements/"):] for spec in libs.values() for p in (spec.get("parts") or {}).values() for c in p.get("css") or []}
    assert parts == set(PARTS), sorted(parts ^ set(PARTS))
