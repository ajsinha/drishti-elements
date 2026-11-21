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
"""drishti-views' painter side of the screen's state and effects (ViewModel contract 1.2) in a real browser.

* the `fire` conformance cases of drishti-rachana (tests/support/fire_cases.json, made by tools/views/fire_fixture.mjs from the reference
  runtime): every case's steps fired through the painter, with the next bind answered by the recorded ViewModel; the effects run, the
  refusals and the state after each step are the case's own, and only the panels the changed states' reads name are drawn again;
* the same through the page: a click on a table row, an hbar bar, a figure and a chart's point writes state and the dependent panel follows;
  notify and host effects reach the host's hooks (Elements runs none); a guard that was false at the ViewModel left its effect out."""
import json
from pathlib import Path

import pytest

from test_views_browser import ORIGIN, PAGE, READY, ROOT, ev, frame, router

pytestmark = pytest.mark.spread

CASES = json.loads((Path(__file__).resolve().parent / "support" / "fire_cases.json").read_text(encoding="utf-8"))["cases"]
BY_ID = {c["id"]: c for c in CASES}

RUN = """async (c) => {
  const H = window.__harness, queue = [], binds = [], calls = [], bound = [];
  let step = null;        // the host's check hook is the reference runtime: it answers what it answered when the case was recorded
  const host = { check: () => ((step.actual.problems || []).filter((p) => p.code === 'RCH-5003')), bind: (req) => { binds.push(req); return queue.shift(); }, run: (e, w) => calls.push(['host', e, w]), notify: (e, w) => calls.push(['notify', e, w]) };
  await H.paint(JSON.parse(JSON.stringify(c.viewModel)), { host: host });
  H.handle.on('bound', (e) => bound.push(e.detail));
  const el = (id) => { const R = document.getElementById('hx-view'); return (R.shadowRoot || R).querySelector('[data-panel=' + id + ']'); };
  const marks = new Map(c.viewModel.panels.map((p) => [p.id, el(p.id)]));
  const out = [];
  for (const st of c.steps) {
    queue.length = 0;
    queue.push(JSON.parse(JSON.stringify(st.viewModel)));
    const before = bound.length;
    step = st;
    const r = st.control ? await H.handle.change(st.control, st.value)
      : await H.handle.fire(st.panel, st.trigger, st.mark === null ? undefined : st.mark, st.values === null ? undefined : st.values);
    out.push({ effects: r.effects, problems: r.problems, state: H.handle.stateValues, bound: bound.slice(before),
      kept: c.viewModel.panels.map((p) => p.id).filter((id) => marks.get(id) === el(id)) });
  }
  return { out: out, binds: binds, calls: calls };
}"""


def drop_nulls(d):
    return {k: v for k, v in (d or {}).items() if v is not None}


def run_case(pg, case):
    return pg.evaluate(RUN, case)


def with_page(browsers, body, view="V001"):
    async def go():
        async with browsers.page(1280, 900, route=router()) as pg:
            await pg.goto(ORIGIN + PAGE + "?view=" + view)
            await pg.wait_for_function(READY, timeout=30000)
            await frame(pg)
            await body(pg)
            assert pg.errors == [], pg.errors
            assert await pg.evaluate("window.__csp") == []
    browsers.run(go(), timeout=180)


def test_the_fire_cases_of_the_specification_run_through_the_painter(browsers):
    async def body(pg):
        for case in CASES:
            got = await run_case(pg, case)
            for i, (st, r) in enumerate(zip(case["steps"], got["out"])):
                where = case["id"] + " step " + str(i)
                if st["expect"].get("effects") is not None:
                    assert r["effects"] == st["expect"].get("effects"), where
                if st["expect"].get("problems") is not None:
                    want = st["expect"].get("problems")
                    assert [p["code"] for p in r["problems"]] == [p["code"] for p in want], where
                    for p, w in zip(r["problems"], want):
                        assert (p["message"] == w["message"]) if "message" in w else p["message"].startswith(w["messageStart"]), where
                if st["expect"].get("state") is not None:
                    assert drop_nulls(r["state"]) == drop_nulls(st["expect"].get("state")), where
                refused = bool(r["problems"])
                assert (len(got["binds"]) > 0) or refused or not r["effects"] or all(e["do"] in ("host", "notify") for e in r["effects"]), where
                # only the panels the changed states' reads name were drawn again (the rest are the same elements)
                if r["bound"] and not st.get("control"):             # a control the title reads draws the whole view again
                    assert r["bound"][0]["full"] is False, where
                    changed = [p["id"] for p in case["viewModel"]["panels"] if p["id"] not in r["kept"]]
                    assert sorted(changed) == [], where + " " + str(changed)           # frames stay: a panel is drawn again inside its own frame
    with_page(browsers, body)


PAINT = """async ([c, step]) => {
  const H = window.__harness, w = window.__w = { binds: [], calls: [], bound: [], states: [] };
  const host = { bind: (req) => { w.binds.push(req); return JSON.parse(JSON.stringify(c.steps[step].viewModel)); },
    run: (e, x) => w.calls.push(['host', e, x]), notify: (e, x) => w.calls.push(['notify', e, x]) };
  await H.paint(JSON.parse(JSON.stringify(c.viewModel)), { host: host });
  H.handle.on('bound', (e) => w.bound.push(e.detail));
  H.handle.on('state-change', (e) => w.states.push(e.detail));
  window.__frames = {};
  c.viewModel.panels.forEach((p) => { window.__frames[p.id] = document.getElementById('hx-view').shadowRoot.querySelector('[data-panel=' + p.id + ']'); });
}"""
BOUND = "() => window.__w && window.__w.bound.length > 0"


async def click_then(pg, case_id, step, click, after):
    """Paints a case, clicks (a Playwright locator action), waits for the bind to be drawn, then answers the page's record."""
    await pg.evaluate(PAINT, [BY_ID[case_id], step])
    await frame(pg)
    await click(pg)
    await pg.wait_for_function(BOUND, timeout=10000)
    await frame(pg)
    return await ev(pg, after)


METRIC = "R.querySelector('[data-panel=%s] .dv-metric-value').textContent"


def test_a_click_on_a_row_a_bar_and_a_figure_writes_state_and_the_dependent_panel_follows(browsers):
    async def body(pg):
        pre = "fire/clicks/"
        got = await click_then(pg, pre + "a-row-click-writes-state-and-the-view-follows", 0,
                               lambda p: p.locator("tr[data-mark='1']").click(),
                               "({ qty: " + METRIC % "detail" + ", bound: window.__w.bound, state: window.__harness.handle.stateValues, same: window.__frames.orders === R.querySelector('[data-panel=orders]'), req: window.__w.binds[0] })")
        assert got["qty"] == "25" and got["state"] == {"order": "B", "size": 2.5} and got["same"]
        assert got["bound"] == [{"panels": ["detail"], "full": False}]                     # only the panel that reads the state was drawn again
        assert got["req"]["params"] == {"state.order": "B", "state.size": "2.5"}
        got = await click_then(pg, pre + "a-bar-click-writes-state", 0, lambda p: p.locator("[data-panel=by-desk] li[data-mark='1']").click(),
                               "({ shown: " + METRIC % "chosen" + ", state: window.__harness.handle.stateValues })")
        assert got["shown"] == "Rates" and got["state"] == {"desk": "Rates"}
        got = await click_then(pg, "fire/points/a-figure-is-one-mark", 1, lambda p: p.locator("[data-panel=fill] .dv-gauge-box").click(),
                               "({ state: window.__harness.handle.stateValues })")
        assert got["state"] == {"open": True, "last": "total"}                               # the bind answers the screen as the reference runtime had it after the step
        got = await click_then(pg, "fire/trees/a-tree-node-writes-state", 1, lambda p: p.locator("tr[data-mark='3']").click(),
                               "({ shown: " + METRIC % "chosen" + " })")
        assert got["shown"] == "Book B"                                                       # a tree's marks count depth first: Book B is the fourth
    with_page(browsers, body)


def test_notify_and_host_effects_reach_the_hooks_and_are_never_run_by_elements(browsers):
    async def body(pg):
        got = await click_then(pg, "fire/effects/when-guards-and-every-built-effect", 0, lambda p: p.locator("tr[data-mark='0']").click(),
                               "({ calls: window.__w.calls, state: window.__harness.handle.stateValues, binds: window.__w.binds.length })")
        kinds = [(c[0], c[1].get("action") or c[1].get("text")) for c in got["calls"]]
        assert kinds == [("host", "order.cancel"), ("notify", "Order A")]
        assert got["calls"][0][1]["with"] == {"id": "A", "n": 1} and got["calls"][1][1]["tone"] == "ok" and got["calls"][0][2] == {"panel": "orders", "trigger": "row-click", "mark": 0}
        assert got["state"] == {"order": "A", "detail": True} and got["binds"] == 1
        # a figure that only hands the host an action and writes a flag
        got = await click_then(pg, "fire/effects/a-figure-hands-an-action-to-the-host", 0, lambda p: p.locator("[data-panel=usage] .dv-metric").click(),
                               "({ calls: window.__w.calls.map((c) => c[1].action), state: window.__harness.handle.stateValues })")
        assert got["calls"] == ["limits.open"] and got["state"] == {"seen": True}
    with_page(browsers, body)


SLICE = """([id, i]) => {
  const R = document.getElementById('hx-view').shadowRoot, el = R.querySelector('[data-panel=' + id + '] [data-r-chart]');
  const c = window.echarts.getInstanceByDom(el), r = el.getBoundingClientRect(), l = c.getModel().getSeriesByIndex(0).getData().getItemLayout(i);
  const a = (l.startAngle + l.endAngle) / 2, d = (l.r0 + l.r) / 2;
  return { x: r.left + l.cx + Math.cos(a) * d, y: r.top + l.cy - Math.sin(a) * d, done: c.getZr().animation.isFinished() };
}"""


def test_a_click_on_a_donut_slice_fires_bar_click_on_that_bar(browsers):
    async def body(pg):
        case = json.loads(json.dumps(BY_ID["fire/clicks/a-bar-click-writes-state"]))
        case["viewModel"]["panels"][0]["data"]["shape"] = "donut"
        case["viewModel"]["panels"][0]["data"]["bars"][1]["value"] = 2          # both slices drawn
        await pg.evaluate(PAINT, [case, 0])
        await pg.wait_for_function(DRAWN, arg="by-desk", timeout=20000)
        pos = None
        for _ in range(40):
            await frame(pg)
            now = await pg.evaluate(SLICE, ["by-desk", 1])
            if pos == now and now["done"]:
                break
            pos = now
        for attempt in range(4):
            await pg.mouse.click(pos["x"], pos["y"])
            try:
                await pg.wait_for_function(BOUND, timeout=2500)
                break
            except Exception:                                                   # noqa: BLE001 - Playwright's timeout
                await frame(pg)
                pos = await pg.evaluate(SLICE, ["by-desk", 1])
        await pg.wait_for_function(BOUND, timeout=5000)
        assert await pg.evaluate("window.__w.states[0].trigger") == "bar-click"
        assert await pg.evaluate("window.__w.states[0].mark") == 1
        assert await pg.evaluate("window.__harness.handle.stateValues") == {"desk": "Rates"}
    with_page(browsers, body)


POINT = """([id, kind, series, data]) => {
  const R = document.getElementById('hx-view').shadowRoot, el = R.querySelector('[data-panel=' + id + '] [data-r-chart]');
  const c = window.echarts.getInstanceByDom(el), r = el.getBoundingClientRect(), p = c.convertToPixel({ seriesIndex: series }, data);
  return { x: r.left + p[0], y: r.top + p[1], pick: el.classList.contains('dv-pick'), done: c.getZr().animation.isFinished() && c.getWidth() === el.clientWidth && c.getHeight() === el.clientHeight };   // sized to its box
}"""
DRAWN = """(id) => { const R = document.getElementById('hx-view').shadowRoot, el = R && R.querySelector('[data-panel=' + id + '] [data-r-chart]'),
  c = el && window.echarts && window.echarts.getInstanceByDom(el); return !!c && c.getZr().animation.isFinished() && el.classList.contains('dv-pick'); }"""


def test_a_click_on_a_chart_point_fires_point_click_on_that_mark(browsers):
    async def body(pg):
        scatter = BY_ID["fire/points/a-scatter-point-writes-state"]["viewModel"]["panels"][0]["data"]["points"][1]
        line = BY_ID["fire/points/a-line-point-writes-state"]["viewModel"]["panels"][0]["data"]
        steps = BY_ID["fire/points/a-waterfall-timeline-and-candlestick-write-state"]["viewModel"]["panels"][0]["data"]["steps"][1]
        for case_id, panel, kind, at, want in (
                ("fire/points/a-scatter-point-writes-state", "cloud", "scatter", [scatter["x"], scatter["y"]], 1),
                ("fire/points/a-line-point-writes-state", "curve", "line", [line["x"][1], line["series"][0]["values"][1]], 1),
                ("fire/points/a-waterfall-timeline-and-candlestick-write-state", "walk", "waterfall", [1, (steps["from"] + steps["to"]) / 2], 1)):
            await pg.evaluate(PAINT, [BY_ID[case_id], 0])
            await pg.wait_for_function(DRAWN, arg=panel, timeout=20000)
            pos = None
            for _ in range(40):                                         # the layout settles (fonts, the resize observer): wait until the point stands still
                await frame(pg)
                now = await pg.evaluate(POINT, [panel, kind, 0, at])
                if pos == now and now["done"]:
                    break
                pos = now
            for attempt in range(4):                                    # a click that lands while the chart still moves is made again from where the point is now
                await pg.mouse.click(pos["x"], pos["y"])
                try:
                    await pg.wait_for_function(BOUND, timeout=2500)
                    break
                except Exception:                                       # noqa: BLE001 - Playwright's timeout
                    await frame(pg)
                    pos = await pg.evaluate(POINT, [panel, kind, 0, at])
            await pg.wait_for_function(BOUND, timeout=5000)
            assert await pg.evaluate("window.__w.states[0].mark") == want, case_id            # the mark clicked, by its own object or its place
            assert await pg.evaluate("window.__w.states[0].trigger") == "point-click"
    with_page(browsers, body)


UI = """async ([c, step]) => {
  const H = window.__harness, w = window.__w = { binds: [], calls: [], checks: [], bound: [], refused: [] };
  const host = { check: ({ values }) => { w.checks.push(values); return values.qty > 1000 ? [{ message: 'At most 1,000' }] : []; },    // the Rachana runtime's answer for this form's one rule
    bind: (req) => { w.binds.push(req); return JSON.parse(JSON.stringify(c.steps[step].viewModel)); },
    run: (e, x) => w.calls.push(['host', e, x]), notify: (e, x) => w.calls.push(['notify', e, x]) };
  await H.paint(JSON.parse(JSON.stringify(c.viewModel)), { host: host });
  H.handle.on('bound', (e) => w.bound.push(e.detail));
  H.handle.on('refused', (e) => w.refused.push(e.detail));
}"""
FORM = "fire/forms/submit-runs-only-after-the-rules-pass"


def test_a_form_panel_is_drawn_from_drishti_inputs_and_submits_only_when_the_rules_pass(browsers):
    async def body(pg):
        await pg.evaluate(UI, [BY_ID[FORM], 1])
        await pg.wait_for_selector("[data-panel=ticket] [data-act=submit]")
        sel = "[data-panel=ticket] "
        assert await pg.locator(sel + "[data-act=submit]").inner_text() == "Send"            # the words the ViewModel gave
        assert await pg.locator(sel + "[data-path=side] input:checked").count() == 1         # SELL: the starting value from initial: state.side
        assert await pg.locator(sel + "[data-path=book] input").input_value() == "B1"        # the field's default
        await pg.locator(sel + "[data-path=side] input[value=BUY]").check()
        await pg.locator(sel + "[data-path=qty] input").fill("2000")
        await pg.locator(sel + "[data-act=submit]").click()
        await pg.wait_for_selector(sel + ".di-form-summary:not([hidden])")
        got = await pg.evaluate("({ w: window.__w, text: document.getElementById('hx-view').shadowRoot.querySelector('[data-panel=ticket] .di-form-summary').textContent, state: window.__harness.handle.stateValues })")
        assert "At most 1,000" in got["text"] and got["w"]["binds"] == [] and got["w"]["calls"] == []     # refused: the messages shown, nothing ran
        assert got["w"]["refused"][0]["problems"] == [{"code": "RCH-5003", "message": "At most 1,000", "severity": "error"}]
        await pg.locator(sel + "[data-path=qty] input").fill("5")
        await pg.locator(sel + "[data-act=submit]").click()
        await pg.wait_for_function("() => window.__w.bound.length > 0", timeout=10000)
        got = await pg.evaluate("({ w: window.__w, state: window.__harness.handle.stateValues })")
        assert got["state"]["qty"] == 5 and got["state"]["sent"] is True
        assert got["w"]["calls"][0][1] == {"do": "host", "action": "order.place", "with": {"desk": "FX", "side": "BUY", "qty": 5}}
        await pg.locator(sel + "[data-act=cancel]").click()
        await pg.wait_for_function("() => window.__w.binds.length === 2", timeout=10000)
        assert await pg.evaluate("window.__w.binds[1].state.qty") is None and await pg.evaluate("window.__w.checks.length") == 2          # cancel asked for no check
    with_page(browsers, body)


def test_action_buttons_fire_their_effects_ask_first_with_confirm_and_a_control_change_runs_its_effects(browsers):
    async def body(pg):
        await pg.evaluate(UI, [BY_ID["fire/actions/buttons-run-their-effects"], 1])
        sel = "[data-panel=orders] .dv-panel-acts "
        assert await pg.locator(sel + "button").all_inner_texts() == ["Cancel A", "Wide", "Reset"]
        await pg.locator(sel + "[data-action=wide]").click()                                    # no confirm: runs at once
        await pg.wait_for_function("() => window.__w.bound.length > 0", timeout=10000)
        assert await pg.evaluate("window.__harness.handle.stateValues") == {"order": "A", "wide": True}
        await pg.locator(sel + "[data-action='0']").click()                                     # confirm: asks, no runs until yes
        await pg.wait_for_selector(".dv-ask [data-ask=no]")
        assert "Cancel order A?" in await pg.locator(".dv-ask p").inner_text()
        assert await pg.evaluate("window.__w.calls.length") == 0
        await pg.locator(".dv-ask [data-ask=yes]").click()
        await pg.wait_for_function("() => window.__w.calls.length === 2", timeout=10000)
        assert await pg.evaluate("window.__w.calls.map((c) => c[1].do + ':' + (c[1].action || c[1].text))") == ["host:order.cancel", "notify:Cancelled A"]
    with_page(browsers, body)
