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
"""drishti-views' map panels drawn out of the box in a real browser (the views harness, a strict CSP, the files served from the
repository): drishti-chart's geo part loaded only when a view has a map, with the vendored Natural Earth shapes, and only the files a
map needs; a world choropleth, a US states map and a Canada map as view panels; a click on a place opens its link; a host's own map
helper overrides the part and geo: false turns maps off in words; a bubbles layer drawn by the helper itself."""
import pytest

from test_views_browser import ROOT, ev, frame, run, shot

pytestmark = pytest.mark.spread

MAPS_VIEW = {
    "contract": "1.0", "ref": {"kind": "book", "id": "B-1"}, "title": {"pill": "Book", "id": "B-1"},
    "panels": [
        {"id": "world", "kind": "map", "title": "Exposure by country", "data": {"mode": "world", "highlight": "DE", "unit": "USD m",
         "shade": {"label": "Exposure", "items": [{"code": c, "value": v} for c, v in
                   [("USA", 420), ("CAN", 180), ("GBR", 150), ("DEU", 130), ("FRA", 95), ("JPN", 88), ("IND", 60), ("BRA", 41), ("AUS", 37), ("SGP", 22)]]},
         "link": {"kind": "country", "template": "country/{iso3}", "codes": ["USA", "DEU", "FRA"]}}},
        {"id": "us", "kind": "map", "title": "Orders by state", "data": {"mode": "region", "region": "USA",
         "shade": {"label": "Orders", "items": [{"code": c, "value": v} for c, v in [("US-CA", 90), ("US-TX", 70), ("US-NY", 65), ("US-FL", 40), ("US-AK", 12), ("US-HI", 8)]]}}},
        {"id": "ca", "kind": "map", "title": "Orders by province", "data": {"mode": "region", "region": "CAN",
         "shade": {"label": "Orders", "items": [{"code": c, "value": v} for c, v in [("CA-ON", 50), ("CA-QC", 35), ("CA-BC", 30), ("CA-AB", 22)]]}}}]}

DRAWN = "() => { const R = " + ROOT + "; return ['world', 'us', 'ca'].every((p) => R.querySelector('[data-panel=' + p + '] svg path')); }"


def test_world_us_and_canada_map_panels_draw_with_the_geo_part(browsers):
    async def body(pg):
        assert await pg.evaluate("!window.Drishti.elements.chart_geo")                       # a page of words loads no geo part
        await pg.evaluate("(v) => window.__harness.paint(v, { validate: 'off' })", MAPS_VIEW)
        await pg.wait_for_function(DRAWN, timeout=30000)
        await frame(pg)
        got = await pg.evaluate("""() => { const R = """ + ROOT + """, E = window.echarts;
          const opt = (p) => E.getInstanceByDom(R.querySelector('[data-panel=' + p + '] .dv-chart')).getOption();
          return { maps: ['world', 'us', 'ca'].map((p) => opt(p).geo[0].map), states: R.querySelector('[data-panel=world]').dataset.state,
            part: !!window.Drishti.elements.chart_geo,
            files: performance.getEntriesByType('resource').map((r) => r.name).filter((n) => n.includes('/maps/')).map((n) => n.split('/maps/')[1].split('?')[0]).sort(),
            shaded: opt('us').series[0].data.filter((d) => typeof d.value === 'number').length, legend: opt('ca').visualMap.length,
            table: [...R.querySelectorAll('[data-panel=ca] .dv-data tr')].map((r) => r.textContent) }; }""")
        assert got["maps"] == ["drishti-geo-world", "drishti-geo-USA", "drishti-geo-CAN"]
        assert got["part"] and got["states"] == "ready"
        assert got["files"] == ["regions/CAN.json", "regions/USA.json", "world-countries.json", "world-points.json"]     # only what the maps need
        assert got["shaded"] == 6 and got["legend"] == 1
        assert got["table"][1:3] == ["CA-ON50", "CA-QC35"]
        await shot(pg, "views-maps.png")
        await pg.evaluate("() => { const R = " + ROOT + "; window.echarts.getInstanceByDom(R.querySelector('[data-panel=world] .dv-chart')).trigger('click', { seriesType: 'map', name: 'FRA' }); }")
        assert {"type": "link", "code": None, "detail": {"kind": "country", "id": "country/FRA"}} in await pg.evaluate("window.__harness.events")
        await pg.evaluate("window.__harness.handle.dispose()")
    run(browsers, body, "view=V001")


def test_a_host_helper_overrides_the_part_and_geo_false_turns_maps_off(browsers):
    async def body(pg):
        await pg.evaluate("""(v) => { window.__asked = 0; return window.__harness.paint(v, { validate: 'off', geo: () => { window.__asked++;
            return window.Drishti.elements.core.loadPart('drishti-chart', 'geo').then((P) => P.createGeoHelper({ base: window.Drishti.elements.core.staticUrl('vendor/echarts/maps/') })); } }); }""",
                          {**MAPS_VIEW, "panels": MAPS_VIEW["panels"][:1]})
        await pg.wait_for_function("() => !!" + ROOT + ".querySelector('[data-panel=world] svg path')", timeout=30000)
        assert await pg.evaluate("window.__asked") >= 1
        await pg.evaluate("window.__harness.handle.dispose()")
        await pg.evaluate("(v) => window.__harness.paint(v, { validate: 'off', geo: false })", {**MAPS_VIEW, "panels": MAPS_VIEW["panels"][1:2]})
        await frame(pg)
        assert await ev(pg, "R.querySelector('[data-panel=us] .dv-chart-off').textContent") == "Maps are turned off on this page"
    run(browsers, body, "view=V001")


def test_a_bubbles_layer_drawn_by_the_helper(browsers):
    async def body(pg):
        got = await pg.evaluate("""async () => {
          const core = window.Drishti.elements.core, P = await core.loadPart('drishti-chart', 'geo');
          const G = P.geoHelper({ base: core.staticUrl('vendor/echarts/maps/') }), w = await G.world(), us = await G.region('USA');
          const box = (id) => { const d = document.createElement('div'); d.id = id; d.style.cssText = 'width:800px;height:420px'; document.body.appendChild(d); return d; };
          const cw = window.echarts.init(box('bw'), null, { renderer: 'svg' }), cu = window.echarts.init(box('bu'), null, { renderer: 'svg' });
          cw.setOption(G.option({ level: 'world', geo: w, width: 800, height: 420, bubbles: [{ code: 'USA', value: 420 }, { code: 'GBR', value: 150 }, { lon: 139.7, lat: 35.7, value: 88, name: 'Tokyo' }] }));
          cu.setOption(G.option({ level: 'region', geo: us, width: 800, height: 420, bubbles: [{ lon: -74, lat: 40.7, value: 65, name: 'New York' }, { lon: -149.9, lat: 61.2, value: 12, name: 'Anchorage' }] }));
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const pts = (c) => c.getOption().series.find((s) => s.name === 'bubbles').data.map((d) => c.convertToPixel({ geoIndex: 0 }, d.value.slice(0, 2)));
          return { world: pts(cw), us: pts(cu), paths: document.querySelectorAll('#bw path').length };
        }""")
        assert got["paths"] > 150
        assert len(got["world"]) == 3 and all(0 <= x <= 800 and 0 <= y <= 420 for x, y in got["world"])
        ny, ak = got["us"]
        assert ny[0] > ak[0] and ak[1] > ny[1]                                               # Anchorage in the inset, bottom left
        await shot(pg, "views-maps-bubbles.png")
    run(browsers, body, "view=V002")
