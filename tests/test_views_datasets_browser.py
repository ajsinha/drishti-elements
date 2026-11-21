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
"""drishti-views' datasets and the kinds that read them (contract 1.1, VIEWS_DESIGN step 5) in a real browser, under the strict CSP:

* a grid of 10,000 synthetic trades from an inline dataset: virtual rows (the DOM holds only the rows in view), groups and an order,
  each value formatted with its field's format, a sign tone; rows patches (update, add, remove, reset) reach the grid and a chart that
  share the dataset;
* a tree of a hierarchy given by parents, with its measures; a chart of a derived read (grouped, summed, the top categories);
* datasets by address: REST pages read a window at a time, a server-side row model, rows handed by the page by name; an address that is
  not an allowed data origin refused in words;
* a map with points (contract 1.1) drawn as the geo helper's bubbles."""
import json
import random
import pytest
from urllib.parse import parse_qs, urlparse

from test_views_browser import ORIGIN, PAGE, READY, ROOT, ev, frame, router, shot

pytestmark = pytest.mark.spread

DESKS = ["Rates", "FX", "Credit", "Equities", "Commodities"]
BOOKS = {d: [d.upper()[:3] + "-" + r for r in ("EU", "US", "AS")] for d in DESKS}
CCYS = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD"]


def trades(n, seed=7):
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        desk = DESKS[i % len(DESKS)]
        out.append({"id": "T-%05d" % (i + 1), "desk": desk, "book": rnd.choice(BOOKS[desk]), "ccy": rnd.choice(CCYS),
                    "notional": rnd.randrange(1, 500) * 100000, "pv": round(rnd.uniform(-250000, 250000), 2),
                    "traded": "2026-%02d-%02d" % (rnd.randrange(1, 12), rnd.randrange(1, 28)), "live": rnd.random() > 0.1})
    return out


FIELDS = [{"name": "id", "type": "string", "label": "Trade"}, {"name": "desk", "type": "string", "label": "Desk"},
          {"name": "book", "type": "string", "label": "Book"}, {"name": "ccy", "type": "string", "label": "Ccy"},
          {"name": "notional", "type": "number", "label": "Notional", "fmt": "amount0"}, {"name": "pv", "type": "number", "label": "PV", "fmt": "amount2"},
          {"name": "traded", "type": "date", "label": "Traded"}, {"name": "live", "type": "boolean", "label": "Live"}]


def dataset(rows, **more):
    return {"key": ["id"], "fields": FIELDS, "values": [[r[f["name"]] for f in FIELDS] for r in rows], **more}


def view(panels, datasets):
    return {"contract": "1.1", "ref": {"kind": "desk", "id": "ALL"}, "title": {"pill": "Desk", "id": "ALL", "with": None}, "strip": [], "panels": panels,
            "keys": [], "provenance": PROVENANCE, "timings": {}, "datasets": datasets}


PROVENANCE = {"layout": None, "fingerprint": None, "source": "synthetic", "generation": 0, "fetchedAt": None, "live": False, "businessDate": "2026-11-20",
              "updatedAt": None, "staleAfter": None, "stale": False, "sutra": None, "masked": 0, "maskedPanels": None}


ORG = [{"id": "GRP", "parent": "", "name": "Group"}] + [{"id": d.upper(), "parent": "GRP", "name": d} for d in DESKS] + [
    {"id": b, "parent": d.upper(), "name": b, "var": 100000 + 37000 * i, "limit": 400000} for i, (d, bs) in enumerate(BOOKS.items()) for b in bs]


def run_with(browsers, body, api=None):
    serve = router()

    async def route(r):
        if api and r.request.url.startswith(ORIGIN + "/api/"):
            return await api(r)
        return await serve(r)

    async def go():
        async with browsers.page(1440, 1100, route=route) as pg:
            await pg.goto(ORIGIN + PAGE + "?view=V002")
            await pg.wait_for_function(READY, timeout=30000)
            await frame(pg)
            await body(pg)
            assert pg.errors == [], pg.errors
            assert await pg.evaluate("window.__csp") == []
    browsers.run(go(), timeout=180)


DRAWN = "(ids) => { const R = " + ROOT + "; return ids.every((p) => { const e = R.querySelector('[data-panel=' + p + '] .dv-ds'); return e && e.hasAttribute('data-drawn'); }); }"


def test_a_grid_of_ten_thousand_rows_and_a_chart_share_a_dataset_and_follow_its_patches(browsers):
    rows = trades(10000)
    vm = view([
        {"id": "blotter", "kind": "grid", "title": "Trades", "span": 8, "height": 14,
         "data": {"dataset": "trades", "columns": [{"field": "id", "pinned": "left"}, {"field": "desk"}, {"field": "book"}, {"field": "ccy"},
                                                    {"field": "notional", "agg": "sum"}, {"field": "pv", "tone": "sign", "agg": "sum"}, {"field": "traded"}],
                  "sort": [{"field": "notional", "desc": True}]}},
        {"id": "by-desk", "kind": "chart", "title": "Notional by desk", "span": 4,
         "data": {"dataset": "trades", "type": "bar", "x": "desk", "y": [{"field": "notional", "agg": "sum", "fmt": "compact"}]}}],
        {"trades": dataset(rows)})

    async def body(pg):
        await pg.evaluate("(v) => window.__harness.paint(v)", vm)
        await pg.wait_for_function(DRAWN, arg=["blotter", "by-desk"], timeout=60000)
        await frame(pg)
        got = await ev(pg, """{ state: R.querySelector('[data-panel=blotter]').dataset.state,
            rows: R.querySelectorAll('[data-panel=blotter] .dg-row').length,
            first: [...(R.querySelector('[data-panel=blotter] .dg-row') || { children: [] }).children].map((c) => c.textContent),
            pos: R.querySelectorAll('[data-panel=blotter] .dv-t-pos').length + R.querySelectorAll('[data-panel=blotter] .dv-t-neg').length,
            bars: window.echarts.getInstanceByDom(R.querySelector('[data-panel=by-desk] .dc-canvas')).getOption().series[0].data.length,
            issues: window.__harness.events.filter((e) => e.type === 'issues').length }""")
        assert got["state"] == "ready" and got["issues"] == 0
        assert 0 < got["rows"] < 200                                  # virtual: only the rows in view (and a margin) are in the DOM
        top = max(rows, key=lambda r: r["notional"])
        assert any(t == "{:,}".format(top["notional"]) for t in got["first"]), got["first"]
        assert got["pos"] > 0 and got["bars"] == 5
        await shot(pg, "views-datasets-grid.png")
        before = await ev(pg, "window.__harness.handle.dataset('trades').held.length")
        await pg.evaluate("""() => window.__harness.handle.patch({ seq: 1, generation: 0, patches: [{ op: 'rows', dataset: 'trades',
            update: [{ id: 'T-00001', notional: 99900000000 }], add: [{ id: 'T-99999', desk: 'FX', book: 'FX-EU', ccy: 'EUR', notional: 1, pv: 0, traded: '2026-11-20', live: true }],
            remove: ['T-00002'] }] })""")
        await frame(pg)
        await frame(pg)
        after = await ev(pg, """{ n: window.__harness.handle.dataset('trades').held.length,
            first: [...R.querySelector('[data-panel=blotter] .dg-row').children].map((c) => c.textContent),
            fx: window.echarts.getInstanceByDom(R.querySelector('[data-panel=by-desk] .dc-canvas')).getOption().series[0].data.map((d) => (d && d.value !== undefined ? d.value : d)) }""")
        assert after["n"] == before                                   # one added, one removed
        assert "99,900,000,000" in after["first"]                     # the updated row sorts first
        await pg.evaluate("() => window.__harness.handle.patch({ seq: 2, generation: 0, patches: [{ op: 'rows', dataset: 'trades', reset: [{ id: 'X-1', desk: 'Rates', notional: 5, pv: 1 }] }] })")
        await frame(pg)
        await frame(pg)
        assert await ev(pg, "R.querySelectorAll('[data-panel=blotter] .dg-row').length") == 1
        assert await ev(pg, "window.__harness.handle.metrics().ignored || 0") == 0
        await pg.evaluate("window.__harness.handle.dispose()")
    run_with(browsers, body)


def test_a_tree_of_parents_and_charts_of_derived_reads(browsers):
    rows = trades(2000, seed=11)
    vm = view([
        {"id": "org", "kind": "tree", "title": "VaR by desk and book", "span": 6, "height": 12,
         "data": {"dataset": "org", "node": "id", "parent": "parent", "label": "name", "measures": [{"field": "var", "agg": "sum", "fmt": "amount0"}, {"field": "limit", "agg": "sum", "fmt": "amount0"}], "open": -1}},
        {"id": "mix", "kind": "chart", "title": "PV by book and currency", "span": 6,
         "data": {"dataset": "trades", "type": "bar", "x": "book", "y": [{"field": "pv", "agg": "sum"}], "by": "ccy", "stack": "sum", "limit": 6}},
        {"id": "share", "kind": "chart", "title": "Notional by currency", "span": 4, "data": {"dataset": "trades", "type": "donut", "x": "ccy", "y": [{"field": "notional", "agg": "sum"}]}},
        {"id": "spread", "kind": "chart", "title": "PV distribution", "span": 4, "data": {"dataset": "trades", "type": "histogram", "y": [{"field": "pv"}], "bins": 24}}],
        {"org": {"fields": [{"name": "id", "type": "string"}, {"name": "parent", "type": "string"}, {"name": "name", "type": "string"},
                            {"name": "var", "type": "number", "fmt": "amount0"}, {"name": "limit", "type": "number", "fmt": "amount0"}],
                 "values": [[r["id"], r["parent"], r["name"], r.get("var"), r.get("limit")] for r in ORG]},
         "trades": dataset(rows)})

    async def body(pg):
        await pg.evaluate("(v) => window.__harness.paint(v)", vm)
        await pg.wait_for_function(DRAWN, arg=["org", "mix", "share", "spread"], timeout=60000)
        await frame(pg)
        got = await ev(pg, """{ tree: R.querySelector('[data-panel=org] .dv-ds').textContent,
            books: new Set(window.echarts.getInstanceByDom(R.querySelector('[data-panel=mix] .dc-canvas')).getOption().xAxis[0].data).size,
            series: window.echarts.getInstanceByDom(R.querySelector('[data-panel=mix] .dc-canvas')).getOption().series.length,
            pie: window.echarts.getInstanceByDom(R.querySelector('[data-panel=share] .dc-canvas')).getOption().series[0].data.length }""")
        assert "Group" in got["tree"] and "Rates" in got["tree"] and "RAT-EU" in got["tree"]
        assert got["books"] == 6 and got["series"] == 6 and got["pie"] == 6
        await shot(pg, "views-datasets-tree-charts.png")
        await pg.evaluate("window.__harness.handle.dispose()")
    run_with(browsers, body)


def test_datasets_by_address_by_name_and_a_refused_origin(browsers):
    rows = trades(5000, seed=3)
    asked = []

    async def api(r):
        u = urlparse(r.request.url)
        if u.path == "/api/trades":
            q = parse_qs(u.query)
            off, lim = int(q.get("offset", ["0"])[0]), int(q.get("limit", ["100"])[0])
            asked.append((off, lim))
            return await r.fulfill(status=200, body=json.dumps({"rows": rows[off:off + lim], "total": len(rows)}), headers={"content-type": "application/json"})
        if u.path == "/api/query":
            req = json.loads(r.request.post_data or "{}")
            asked.append(("server", req.get("startRow"), req.get("endRow")))
            part = rows[req.get("startRow", 0):req.get("endRow", 100)]
            return await r.fulfill(status=200, body=json.dumps({"rows": part, "rowCount": len(rows)}), headers={"content-type": "application/json"})
        return await r.fulfill(status=404, body="")

    cols = {"columns": [{"field": "id"}, {"field": "desk"}, {"field": "notional", "fmt": "amount0"}]}
    vm = view([
        {"id": "paged", "kind": "grid", "title": "Pages", "span": 4, "data": {"dataset": "paged", **cols}},
        {"id": "served", "kind": "grid", "title": "Server rows", "span": 4, "data": {"dataset": "served", **cols}},
        {"id": "handed", "kind": "chart", "title": "Handed by the page", "span": 4, "data": {"dataset": "handed", "type": "pie", "x": "desk", "y": [{"field": "notional", "agg": "sum"}]}},
        {"id": "far", "kind": "grid", "title": "Elsewhere", "span": 12, "data": {"dataset": "far"}}],
        {"paged": {"key": ["id"], "fields": FIELDS, "pages": {"url": "/api/trades", "size": 200, "mode": "offset", "total": 5000}},
         "served": {"key": ["id"], "fields": FIELDS, "server": {"url": "/api/query"}},
         "handed": {"name": "local-trades"},
         "far": {"pages": {"url": "https://elsewhere.example/api/trades"}}})

    async def body(pg):
        await pg.evaluate("(a) => window.__harness.paint(a[0], { data: { 'local-trades': a[1] } })", [vm, rows[:300]])
        await pg.wait_for_function(DRAWN, arg=["paged", "served", "handed"], timeout=60000)
        await pg.wait_for_function("() => " + ROOT + ".querySelectorAll('[data-panel=paged] .dg-row').length > 0", timeout=30000)
        await frame(pg)
        got = await ev(pg, """{ paged: R.querySelectorAll('[data-panel=paged] .dg-row').length, served: R.querySelectorAll('[data-panel=served] .dg-row').length,
            far: R.querySelector('[data-panel=far]').textContent,
            pie: window.echarts.getInstanceByDom(R.querySelector('[data-panel=handed] .dc-canvas')).getOption().series[0].data.length }""")
        assert got["paged"] > 0 and got["served"] > 0 and got["pie"] == 5
        assert "The rows could not be read" in got["far"] and "not an allowed data origin" in got["far"]
        pages = [a for a in asked if a[0] != "server"]
        assert pages and max(o for o, _ in pages) < 5000 and sum(n for _, n in pages) < 5000       # a window at a time, never all
        assert any(a[0] == "server" for a in asked)
        await pg.evaluate("window.__harness.handle.dispose()")
    run_with(browsers, body, api)


def test_map_points_are_drawn_as_bubbles(browsers):
    vm = view([{"id": "hubs", "kind": "map", "title": "Trading hubs", "data": {"mode": "world", "unit": "USD bn",
               "points": [{"label": "London", "lat": 51.51, "lon": -0.13, "value": 420, "text": "420"}, {"label": "New York", "lat": 40.71, "lon": -74.0, "value": 610, "text": "610"},
                          {"label": "Tokyo", "lat": 35.68, "lon": 139.69, "value": 230, "text": "230"}, {"label": "Singapore", "lat": 1.35, "lon": 103.82, "value": 180, "text": "180",
                                                                                                         "link": {"kind": "hub", "id": "SGP", "mnemonic": None}}]}}], {})
    del vm["datasets"]

    async def body(pg):
        await pg.evaluate("(v) => window.__harness.paint(v)", vm)
        await pg.wait_for_function("() => !!" + ROOT + ".querySelector('[data-panel=hubs] svg path')", timeout=30000)
        await frame(pg)
        got = await ev(pg, """(() => { const c = window.echarts.getInstanceByDom(R.querySelector('[data-panel=hubs] .dv-chart')), s = c.getOption().series.find((x) => x.name === 'bubbles');
            return { n: s ? s.data.length : 0, names: s ? s.data.map((d) => d.name) : [], table: [...R.querySelectorAll('[data-panel=hubs] .dv-data tr')].map((r) => r.textContent) }; })()""")
        assert got["n"] == 4 and "Tokyo" in got["names"]
        assert "London420" in got["table"]
        await pg.evaluate("() => { const R = " + ROOT + "; window.echarts.getInstanceByDom(R.querySelector('[data-panel=hubs] .dv-chart')).trigger('click', { data: { bubble: true, name: 'Singapore' } }); }")
        await shot(pg, "views-map-points.png")
        await pg.evaluate("window.__harness.handle.dispose()")
    run_with(browsers, body)


def test_the_gallery_pages_of_datasets_draw_every_example_with_its_made_up_data(browsers):
    from test_elements_gallery_browser import audited, choose, frames, run as gallery_run, shot as gallery_shot

    want = {"blotter": 3, "hierarchy": 3, "charts": 6, "pivot": 1}

    async def body(pg):
        for example, n in want.items():
            await choose(pg, "[data-opt=example]", example)
            await pg.wait_for_function("(n) => document.querySelectorAll('.gx-stage .dv-ds[data-drawn]').length === n", arg=n, timeout=60000)
            assert (await audited(pg, "view-datasets"))["problems"] == []
            await frames(pg)
            await gallery_shot(pg, "drishti-gallery-datasets-" + example + ".png", True)
        assert await pg.evaluate("() => document.querySelector('.gx-stage .dv-ds-grid .dg-row') !== null")
        await choose(pg, "[data-opt=example]", "blotter")
        await pg.wait_for_function("() => document.querySelectorAll('.gx-stage .dv-ds[data-drawn]').length === 3", timeout=60000)
        pv = "() => { const c = document.querySelector('.gx-stage [data-panel=by-desk] .dc-canvas'); return c ? JSON.stringify(window.echarts.getInstanceByDom(c).getOption().series.map((x) => x.data)) : ''; }"
        await pg.wait_for_function(pv, timeout=20000)
        await pg.click("[data-opt=live]")                                               # the blotter ticks: rows patches every second
        await pg.wait_for_function("() => document.querySelectorAll('.gx-stage .dv-ds[data-drawn]').length === 3", timeout=60000)
        first = await pg.evaluate(pv)
        await pg.wait_for_function("(a) => { const now = (" + pv + ")(); return now && now !== a; }", arg=first, timeout=20000)   # the chart sharing the dataset follows
    gallery_run(browsers, body, "#c=view-datasets")
