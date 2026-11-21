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
"""drishti-views' painter in a real browser, against its static fixture harness (elements/drishti-views/drishti_harness.html, which paints
a conformance vector): no server, the files served under a strict CSP (nothing inline), the per-worker browser only.

* the screen (VIEWS_DESIGN step 3): the title line, the strip, the freshness line and the function keys; every panel's frame with its
  header tags and its state from the contract's fields (error, denied, waiting, computing, stale, failed, empty, and a kind with no
  painter yet said in words); drawn inside a shadow root and styled there, in both themes, and into the element itself;
* a kind's painter: registered, drawn, updated in place by a panel patch, and one that throws leaves its panel in an error state;
* the layout: two columns; named areas with a tabbed area, a fold, a sticky area and a divider moved by the keyboard; the container's
  medium and narrow forms (one column in the phone order, nothing scrolling sideways);
* frames: strip, panel and provenance patches in one animation frame, old frames dropped, unknown ops ignored, deleted and restored;
* the cards drawn instead of a view (a newer major, refused as invalid, an address that could not be read, with Retry), links and
  navigation in place with a back step, the function keys from the keyboard;
* speed (P1 to P3 of the design, budgets in tests/views_budget.json as a ratio to a calibration loop run in the same page).

DRISHTI_VIEWS_SHOTS names a folder for screenshots (none are taken otherwise)."""
import json
import os
from pathlib import Path

import pytest

pytestmark = pytest.mark.spread

STATIC = Path(__file__).resolve().parents[1]
ORIGIN = "http://render.test"
PAGE = "/elements/drishti-views/drishti_harness.html"
HEADERS = {"content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:"}
TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "application/javascript", ".json": "application/json"}
SHOTS = os.environ.get("DRISHTI_VIEWS_SHOTS")
READY = "() => window.__harness && window.__harness.ready"
BUDGET = json.loads((STATIC / "tests" / "views_budget.json").read_text(encoding="utf-8"))
ROOT = "(() => { const e = document.getElementById('hx-view'); return e.shadowRoot || e; })()"


def router():
    async def route(r):
        path = r.request.url[len(ORIGIN):].split("?")[0].split("#")[0]
        f = STATIC / path[1:] if path.startswith("/") else None
        if f and f.is_file():
            headers = {"content-type": TYPES.get(f.suffix, "application/octet-stream")}
            if f.suffix == ".html":
                headers.update(HEADERS)
            return await r.fulfill(status=200, body=f.read_bytes(), headers=headers)
        return await r.fulfill(status=404, body="")
    return route


async def shot(pg, name):
    if SHOTS:
        Path(SHOTS).mkdir(parents=True, exist_ok=True)
        await pg.screenshot(path=str(Path(SHOTS) / name), full_page=True)


async def frame(pg):
    await pg.evaluate("() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))")


def run(browsers, body, query, width=1440, height=950):
    async def go():
        async with browsers.page(width, height, route=router()) as pg:
            await pg.goto(ORIGIN + PAGE + "?" + query)
            await pg.wait_for_function(READY, timeout=30000)
            assert await pg.evaluate("window.__harness.error || null") is None
            await frame(pg)
            await body(pg)
            assert pg.errors == [], pg.errors
            assert await pg.evaluate("window.__csp") == []            # nothing inline: the strict CSP holds
    browsers.run(go(), timeout=120)


def ev(pg, js):
    return pg.evaluate("() => { const R = " + ROOT + "; return (" + js + "); }")


def test_the_screen_and_every_panel_state_drawn_in_a_shadow_root_styled_in_both_themes(browsers):
    async def body(pg):
        assert await pg.evaluate("!!document.getElementById('hx-view').shadowRoot")
        head = await ev(pg, """{ pill: R.querySelector('.dv-pill').textContent, id: R.querySelector('.dv-title .dv-id').textContent,
            withText: R.querySelector('.dv-with').textContent, withLabel: R.querySelector('.dv-with-label').textContent,
            region: R.querySelector('.dv-view').getAttribute('role'), labelled: R.getElementById(R.querySelector('.dv-view').getAttribute('aria-labelledby')).tagName,
            figs: [...R.querySelectorAll('.dv-fig')].map((f) => [f.querySelector('dt').textContent, f.querySelector('dd').textContent, f.querySelector('dd').className]),
            status: [...R.querySelectorAll('.dv-status > *')].map((x) => x.textContent),
            keys: [...R.querySelectorAll('.dv-keybtn')].map((b) => b.textContent) }""")
        assert head["pill"] == "Region · Orders" and head["id"] == "EMEA"
        assert head["withText"] == "Northwind Sales" and head["withLabel"] == "Owner"
        assert head["region"] == "region" and head["labelled"] == "H2"
        assert head["figs"][0] == ["Booked", "18,420,350", "dv-cell dv-emph"]
        assert head["figs"][1] == ["vs yesterday", "+4.2%", "dv-cell dv-t-pos"]
        assert head["status"][:2] == ["live", "business date 2026-11-19"] and head["status"][-1] == "orders-service"
        assert any(s.startswith("updated ") for s in head["status"])
        assert head["keys"] == ["F3 Orders", "F9 Raw JSON"]
        panels = await ev(pg, "[...R.querySelectorAll('.dv-panel')].map((p) => [p.dataset.panel, p.dataset.state, p.querySelector('.dv-panel-title').textContent, p.querySelector('.dv-panel-b').textContent.trim()])")
        by = {p[0]: p for p in panels}
        assert len(panels) == 9
        assert by["failed"][1] == "error" and "E-2041 the capacity service did not answer" in by["failed"][3]
        assert by["hidden"][1] == "denied" and "No access" in by["hidden"][3] and "no access to team" in by["hidden"][3]
        assert by["nothing"][1] == "empty" and "No data available" in by["nothing"][3]
        assert by["summary"][1] == "ready" and "Europe, Middle East and Africa" in by["summary"][3]
        assert by["trend"][1] == "ready" and "Data table" in by["trend"][3]       # a chart, with its data table
        tags = await ev(pg, "{ code: R.querySelector('[data-panel=orders] .dv-code').textContent, key: R.querySelector('[data-panel=orders] .dv-key').textContent, inferred: R.querySelector('[data-panel=nothing] .dv-tag').getAttribute('title'), err: R.querySelector('[data-panel=failed] [role=alert]') !== null }")
        assert tags == {"code": "ORD", "key": "F3", "inferred": "a dated list was found", "err": True}
        cols = await ev(pg, "[...R.querySelectorAll('.dv-grid > .dv-area')].map((a) => [a.dataset.area, [...a.querySelectorAll('.dv-panel')].map((p) => p.dataset.panel)])")
        assert cols == [["main", ["summary", "orders", "trend"]], ["right", ["booked", "by-country", "notes", "failed", "hidden", "nothing"]]]
        look = "(() => { const p = getComputedStyle(R.querySelector('.dv-panel')); return [p.borderTopStyle, p.backgroundColor, getComputedStyle(R.querySelector('.drishti-state')).display]; })()"
        dark = await ev(pg, look)
        assert dark[0] == "solid" and dark[2] == "flex"           # the views and the states sheets reach inside the shadow root
        await shot(pg, "views-v001-dark.png")
        await pg.evaluate("document.documentElement.setAttribute('data-theme', 'light')")
        light = await ev(pg, look)
        assert light[1] != dark[1]                                 # the theme's tokens cross the shadow boundary
        await shot(pg, "views-v001-light.png")
        width = await ev(pg, "R.querySelector('[data-panel=summary]').getBoundingClientRect().width / R.querySelector('.dv-area[data-area=main]').getBoundingClientRect().width")
        assert 0.6 < width < 0.72                                   # span 8 of 12
        events = await pg.evaluate("window.__harness.events.map((e) => e.type)")
        assert "ready" in events
    run(browsers, body, "view=V001")


def test_into_the_element_itself_styled_by_the_page(browsers):
    async def body(pg):
        assert await pg.evaluate("document.getElementById('hx-view').shadowRoot") is None
        state = await pg.evaluate("[getComputedStyle(document.querySelector('#hx-view .dv-panel')).borderTopStyle, !!document.querySelector('link[href*=\"drishti_views.css\"]')]")
        assert state == ["solid", True]
    run(browsers, body, "view=V001&shadow=0")


def test_a_kind_painter_is_drawn_updated_by_a_panel_patch_and_a_throwing_one_stays_in_its_panel(browsers):
    async def body(pg):
        await pg.evaluate("""() => {
          const V = window.Drishti.elements.views, H = window.__harness;
          H.updates = 0;
          V.registerKind('kv', { paint(body, panel, ctx) {
            const ul = document.createElement('ul');
            const fill = (p) => { ul.textContent = ''; p.data.fields.forEach((c) => { const li = document.createElement('li'); li.textContent = c.label + ': ' + c.text; ul.appendChild(li); }); };
            fill(panel); body.appendChild(ul);
            return { update(p) { H.updates++; fill(p); }, dispose() {} };
          } });
          V.registerKind('metric', { paint() { throw new Error('no'); } });
          return H.paint(H.vectors.views.find((v) => v.id === 'V001').view);
        }""")
        await frame(pg)
        assert await ev(pg, "R.querySelector('[data-panel=summary]').dataset.state") == "ready"
        assert await ev(pg, "R.querySelector('[data-panel=summary] li').textContent") == "Region: Europe, Middle East and Africa"
        assert await ev(pg, "R.querySelector('[data-panel=booked]').dataset.state") == "error"
        assert await ev(pg, "R.querySelector('[data-panel=booked] .dv-panel-b').textContent.trim()") == "This panel could not be drawn"
        assert {"type": "error", "code": "panel.paint", "detail": None} in await pg.evaluate("window.__harness.events")
        node = await ev(pg, "(window.__ul = R.querySelector('[data-panel=summary] ul'), true)")
        assert node
        await pg.evaluate("""() => { const H = window.__harness, p = JSON.parse(JSON.stringify(H.handle.viewModel.panels[0]));
            p.data.fields[0].text = 'EMEA'; p.title = 'Summary (live)'; H.handle.patch({ seq: 1, patches: [{ op: 'panel', panel: p }] }); }""")
        await frame(pg)
        got = await ev(pg, "[window.__harness.updates, R.querySelector('[data-panel=summary] li').textContent, R.querySelector('[data-panel=summary] ul') === window.__ul, R.querySelector('[data-panel=summary] .dv-panel-title').textContent]")
        assert got == [1, "Region: EMEA", True, "Summary (live)"]
        await pg.evaluate("() => { const H = window.__harness, p = JSON.parse(JSON.stringify(H.handle.viewModel.panels[0])); p.error = 'E-1 it broke'; delete p.data; H.handle.patch({ seq: 2, patches: [{ op: 'panel', panel: p }] }); }")
        await frame(pg)
        assert await ev(pg, "R.querySelector('[data-panel=summary]').dataset.state") == "error"
    run(browsers, body, "view=V001")


def test_named_areas_tabs_a_fold_a_sticky_area_and_the_divider_by_keyboard(browsers):
    async def body(pg):
        grid = await ev(pg, "(() => { const g = R.querySelector('.dv-grid'); return [g.dataset.layout, g.style.getPropertyValue('grid-template-areas'), [...g.children].map((a) => a.dataset.area)]; })()")
        assert grid[0] == "areas" and grid[1] == '"head head" "body side"' and grid[2] == ["head", "body", "side"]
        assert await ev(pg, "R.querySelector('[data-area=head]').classList.contains('dv-sticky')")
        tabs = await ev(pg, "[...R.querySelectorAll('[data-area=side] [role=tab]')].map((t) => [t.textContent, t.getAttribute('aria-selected')])")
        assert tabs[0] == ["By country", "true"] and tabs[1] == ["Notes", "false"] and len(tabs) == 5    # and the right column's panels
        hidden = await ev(pg, "[...R.querySelectorAll('[data-area=side] .dv-panel')].filter((p) => !p.hidden).map((p) => p.dataset.panel)")
        assert hidden == ["by-country"]
        await pg.locator(".dv-tab").first.focus()
        await pg.keyboard.press("ArrowRight")
        assert await ev(pg, "[...R.querySelectorAll('[data-area=side] .dv-panel')].filter((p) => !p.hidden).map((p) => p.dataset.panel)") == ["notes"]
        fold = await ev(pg, "(() => { const b = R.querySelector('[data-fold=notes]'); b.click(); return [b.getAttribute('aria-expanded'), R.querySelector('[data-panel=notes] .dv-panel-b').hidden, b.getAttribute('aria-label')]; })()")
        assert fold == ["false", True, "Open Notes"]
        split = pg.locator("[role=separator]")
        assert await split.get_attribute("aria-valuenow") == "67"
        await split.focus()
        await pg.keyboard.press("ArrowLeft")
        await pg.keyboard.press("ArrowLeft")
        assert await split.get_attribute("aria-valuenow") == "58"
        assert await ev(pg, "R.querySelector('.dv-grid').style.getPropertyValue('grid-template-columns')") == "minmax(0px, 7fr) minmax(0px, 5fr)"
        await shot(pg, "views-v004-areas.png")
    run(browsers, body, "view=V004")


def test_the_containers_medium_and_narrow_forms_in_the_phone_order(browsers):
    async def medium(pg):
        g = await ev(pg, "[R.querySelector('.dv-grid').className, R.querySelector('.dv-grid').style.getPropertyValue('grid-template-areas'), !!R.querySelector('[role=separator]').hidden]")
        assert "dv-medium" in g[0] and g[1] == '"head" "body" "side"' and g[2] is True
    run(browsers, medium, "view=V004&width=800")

    async def narrow(pg):
        assert await ev(pg, "R.querySelector('.dv-grid').classList.contains('dv-narrow')")
        tops = await ev(pg, "Object.fromEntries(['booked', 'orders', 'summary', 'trend'].map((id) => [id, Math.round(R.querySelector('[data-panel=' + id + ']').getBoundingClientRect().top)]))")
        assert tops["booked"] < tops["orders"] < tops["summary"] < tops["trend"]
        widths = await ev(pg, "[...R.querySelectorAll('.dv-panel:not([hidden])')].map((p) => [p.dataset.panel, Math.round(p.getBoundingClientRect().width)])")
        widths = [w for _, w in widths]
        assert len(set(widths)) == 1                                # every panel the full width
        assert await ev(pg, "R.querySelector('.dv-view').scrollWidth <= R.querySelector('.dv-view').clientWidth")
        await shot(pg, "views-v004-narrow.png")
    run(browsers, narrow, "view=V004&width=420", width=480)


def test_frames_strip_panel_provenance_old_frames_unknown_ops_deleted_and_restored(browsers):
    async def body(pg):
        await ev(pg, "(window.__dd = R.querySelector('.dv-fig[data-index=\"0\"] dd'), true)")
        await pg.evaluate("""() => { const H = window.__harness, f = H.vectors.frames.find((x) => x.id === 'F001').frame;
            H.handle.patch(f); H.handle.patch({ seq: 4113, patches: [{ op: 'strip', index: 0, cell: { label: 'Booked', text: 'OLD' } }] });
            H.handle.patch({ seq: 4120, patches: [{ op: 'set', path: 'x' }, { op: 'strip', index: 9, cell: {} }] }); }""")
        await frame(pg)
        got = await ev(pg, """[R.querySelector('.dv-fig[data-index="0"] dd').textContent, R.querySelector('.dv-fig[data-index="0"] dd') === window.__dd,
            R.querySelector('[data-panel=notes]').dataset.state, window.__harness.handle.metrics(), window.__harness.handle.viewModel.provenance.generation]""")
        assert got[0] == "18,432,850" and got[1] is True and got[2] == "ready" and got[4] == 42
        m = got[3]
        assert m["dropped"] == 1 and m["ignored"] == 2 and m["patches"] == 3 and m["paints"] == 1
        assert any(e["type"] == "patch" for e in await pg.evaluate("window.__harness.events"))
        await pg.evaluate("() => window.__harness.handle.patch({ seq: 4121, patches: [{ op: 'provenance', provenance: Object.assign({}, window.__harness.handle.viewModel.provenance, { stale: true, partial: true, missing: ['node-b did not answer'] }) }] })")
        await frame(pg)
        assert await ev(pg, "[R.querySelector('.dv-stale-chip').textContent, R.querySelector('.dv-banner li').textContent]") == ["stale", "node-b did not answer"]
        await pg.evaluate("() => window.__harness.handle.patch(window.__harness.vectors.frames.find((x) => x.id === 'F002').frame.patches.slice(0, 1))")
        await frame(pg)
        assert await ev(pg, "[R.querySelector('.dv-view').classList.contains('dv-frozen'), R.querySelector('.dv-deleted').getAttribute('role')]") == [True, "alert"]
        await pg.evaluate("() => window.__harness.handle.patch([{ op: 'strip', index: 1, cell: { label: 'x', text: 'ignored' } }])")
        await frame(pg)
        assert await ev(pg, "R.querySelector('.dv-fig[data-index=\"1\"] dd').textContent") == "+4.2%"
        await pg.evaluate("() => window.__harness.handle.patch([{ op: 'restored' }, { op: 'strip', index: 1, cell: { label: 'vs yesterday', text: '+5.0%', tone: 'pos' } }])")
        await frame(pg)
        assert await ev(pg, "[R.querySelector('.dv-view').classList.contains('dv-frozen'), !!R.querySelector('.dv-deleted'), R.querySelector('.dv-fig[data-index=\"1\"] dd').textContent]") == [False, False, "+5.0%"]
    run(browsers, body, "view=V001")


def test_computing_stale_waiting_and_a_partial_view(browsers):
    async def body(pg):
        got = await ev(pg, """{ booked: [R.querySelector('[data-panel=booked]').dataset.state, R.querySelector('[data-panel=booked] .dv-chip').textContent],
            orders: [R.querySelector('[data-panel=orders]').classList.contains('dv-stale'), R.querySelector('[data-panel=orders] .dv-chip').getAttribute('title')],
            waits: [R.querySelector('[data-panel=by-country]').dataset.state, R.querySelector('[data-panel=by-country] .dv-panel-b').textContent.trim()],
            banner: R.querySelector('.dv-banner').textContent }""")
        assert got["booked"] == ["ready", "Computing…"]      # a result is shown under a quiet mark while it computes
        assert got["orders"] == [True, "orders-service · 2026-11-19T09:20:00Z"]
        assert got["waits"] == ["waiting", "pick a region to see its countries"]
        assert got["banner"] == "Part of this view did not answerNode-b did not answer".replace("Node", "node")
    run(browsers, body, "view=V007")


def test_cards_links_navigation_in_place_and_the_function_keys(browsers):
    async def body(pg):
        await pg.evaluate("() => { const H = window.__harness, v = JSON.parse(JSON.stringify(H.vectors.views[0].view)); v.contract = '2.1'; return H.paint(v); }")
        assert await ev(pg, "R.querySelector('.dv-problem-title').textContent") == "This view needs a newer drishti-views (2.x)"
        await pg.evaluate("() => { const H = window.__harness; return H.paint(H.vectors.views.find((v) => v.id === 'I001').view, { validate: 'refuse' }); }")
        card = await ev(pg, "[R.querySelector('.dv-problem-title').textContent, [...R.querySelectorAll('.dv-problem-issues li')].map((l) => l.textContent)]")
        assert card[0] == "This view could not be drawn" and card[1] == ['the view: has no "panels"; it is required (add "panels") [error required]']
        await pg.evaluate("() => window.__harness.paint('/no/such/view.json')")
        assert await ev(pg, "[R.querySelector('.dv-problem-detail').textContent, !!R.querySelector('.dv-retry')]") == ["404 Not Found", True]
        codes = [e["code"] for e in await pg.evaluate("window.__harness.events") if e["type"] == "error"]
        assert codes == ["view.version", "view.invalid", "view.fetch"]
        await pg.evaluate("() => { const H = window.__harness; return H.paint(H.vectors.views[0].view); }")
        href = await ev(pg, "R.querySelector('[data-panel=summary]') && null")
        assert href is None
        await pg.locator(".dv-with .dv-link").click()               # a Link the host has no address for: a button, then resolveView in place
        await pg.wait_for_function("() => { const R = " + ROOT + "; return R.querySelector('.dv-title .dv-id') && R.querySelector('.dv-title .dv-id').textContent === 'N-1'; }")
        assert await ev(pg, "!R.querySelector('.dv-back').hidden")
        await pg.locator(".dv-back").click()
        await frame(pg)
        assert await ev(pg, "[R.querySelector('.dv-title .dv-id').textContent, R.querySelector('.dv-back').hidden]") == ["EMEA", True]
        links = [e for e in await pg.evaluate("window.__harness.events") if e["type"] in ("link", "navigate")]
        assert links[0]["detail"] == {"kind": "team", "id": "T-7", "mnemonic": None} and [e["type"] for e in links] == ["link", "navigate", "navigate"]
        await pg.locator(".dv-view").evaluate("(v) => v.focus ? v.querySelector('.dv-keybtn').focus() : null")
        await pg.keyboard.press("F3")
        await frame(pg)
        assert await ev(pg, "R.activeElement && R.activeElement.dataset.panel") == "orders"
        assert {"type": "key", "code": None, "detail": "F3"} in await pg.evaluate("window.__harness.events")
    run(browsers, body, "view=V001")


def test_speed_first_paint_ready_and_patch_to_pixel_within_their_budgets(browsers):
    async def body(pg):
        r = await pg.evaluate("""async () => {
          const H = window.__harness, V = window.Drishti.elements.views;
          const cal = () => { const t = performance.now(); const d = document.createElement('div'); for (let i = 0; i < 3000; i++) { const s = document.createElement('span'); s.textContent = 'x' + i; d.appendChild(s); }
            const a = []; for (let i = 0; i < 30000; i++) { a.push((i * 7919) % 10007); } a.sort((x, y) => x - y); return performance.now() - t; };
          cal(); const c = [cal(), cal(), cal()].sort((a, b) => a - b)[1];
          const vm = JSON.parse(JSON.stringify(H.vectors.views[0].view));
          for (let i = 0; i < 3; i++) { vm.panels.push(Object.assign({}, vm.panels[0], { id: 'more-' + i, title: 'More ' + i })); }
          const runs = [];
          for (let i = 0; i < 5; i++) { await H.paint(JSON.parse(JSON.stringify(vm))); runs.push(H.handle.metrics()); }
          const first = runs.map((m) => m.firstPaintMs).sort((a, b) => a - b)[2], ready = runs.map((m) => m.readyMs).sort((a, b) => a - b)[2];
          const lag = [], apply = [];
          for (let i = 0; i < 60; i++) {
            const t = performance.now();
            await new Promise((res) => { const off = H.handle.on('patch', () => { off(); lag.push(performance.now() - t); apply.push(H.handle.metrics().lastApplyMs); res(); });
              H.handle.patch({ seq: i + 1, patches: [{ op: 'strip', index: 0, cell: { label: 'Booked', text: String(18000000 + i) } }, { op: 'strip', index: 2, cell: { label: 'Open', text: String(i) } }] }); });
          }
          lag.sort((a, b) => a - b); apply.sort((a, b) => a - b);
          return { cal: c, first: first, ready: ready, p99: lag[Math.floor(lag.length * 0.99)], apply: apply[Math.floor(apply.length / 2)], panels: vm.panels.length };
        }""")
        k = max(1.0, r["cal"] / BUDGET["calibration-ms"])
        assert r["panels"] == 12
        assert r["first"] <= BUDGET["first-paint-ms"] * k, r
        assert r["ready"] <= BUDGET["ready-ms"] * k, r
        assert r["apply"] <= BUDGET["patch-apply-ms"] * k, r
        assert r["p99"] <= BUDGET["patch-to-pixel-p99-ms"] * k, r
        print("views speed:", json.dumps(r))
    run(browsers, body, "view=V001")


KINDS_VIEW = {
    "contract": "1.0", "ref": {"kind": "account", "id": "A-7"}, "title": {"pill": "Account", "id": "A-7"},
    "panels": [
        {"id": "facts", "kind": "kv", "title": "Facts", "data": {"fields": [{"label": "Owner", "text": "Ann"}, {"label": "Since", "text": "2019"}]}},
        {"id": "health", "kind": "status", "data": {"fields": [{"label": "Feed", "text": "ok", "tone": "ok"}, {"label": "Limits", "text": "near", "tone": "warn"}]}},
        {"id": "fig", "kind": "metric", "data": {"value": {"text": "1,204.5", "emphasis": True}, "delta": {"text": "+2.1%", "tone": "pos"}, "unit": "k", "caption": "orders today"}},
        {"id": "note", "kind": "markdown", "data": {"text": "# Heading\nSome **bold** and *soft* `code` [docs](https://example.org/x) [bad](javascript:alert(1)) <b>tag</b>\n\n- one\n- two\n\n```\nraw <i>\n```"}},
        {"id": "rel", "kind": "links", "data": {"links": [{"label": "Parent", "text": "Group B", "link": {"kind": "order", "id": "B", "mnemonic": "GRP"}, "badge": "2", "status": "resolved"},
                                                        {"label": "Owner", "text": "Ops", "link": None, "badge": None, "status": "denied"}]}},
        {"id": "events", "kind": "timeline", "data": {"events": [{"date": "2026-03-01", "label": "Second"}, {"date": "2026-01-05", "label": "First", "status": "done", "tone": "ok"}], "more": 3}},
        {"id": "rows", "kind": "table", "data": {"columns": ["Name", "Amount"], "numeric": [False, True], "search": True, "expand": 0, "more": "Showing 3 of 3",
            "rows": [{"cells": [{"text": "Beta"}, {"text": "1,200"}], "highlight": False, "path": "b", "pick": "B", "children": [{"cells": [{"text": "Beta child"}, {"text": "200"}], "highlight": False, "path": "b/1"}]},
                     {"cells": [{"text": "Alpha"}, {"text": "(50)"}], "highlight": False, "path": "a"},
                     {"cells": [{"text": "Gamma"}, {"text": "9"}], "highlight": True, "path": "g"}],
            "total": {"cells": [{"text": "Total"}, {"text": "1,159"}], "highlight": False, "path": None}}},
        {"id": "sched", "kind": "ladder", "data": {"columns": ["Date", "Flow"], "rows": [{"cells": [{"text": "2026-01"}, {"text": "10"}], "highlight": False, "path": None},
                                                                                     {"cells": [{"text": "2026-02"}, {"text": "11"}], "highlight": True, "path": None}]}},
        {"id": "piv", "kind": "pivot", "data": {"by": "Region", "across": "Quarter", "columns": ["Q1", "Q2"], "heat": True,
            "rows": [{"label": "EMEA", "path": ["EMEA"], "group": True, "cells": [{"text": "10"}, {"text": "20"}], "values": [10, 20], "total": {"text": "30"}},
                     {"label": "UK", "path": ["EMEA", "UK"], "cells": [{"text": "4"}, {"text": "5"}], "values": [4, 5], "total": {"text": "9"}},
                     {"label": "APAC", "path": ["APAC"], "cells": [{"text": "1"}, {"text": "2"}], "values": [1, 2], "total": {"text": "3"}}],
            "totals": [{"text": "11"}, {"text": "22"}], "more": 4}},
        {"id": "tb", "kind": "tabs", "data": {"layout": "tabs", "tabs": [{"title": "One", "fields": [{"label": "a", "text": "1"}], "panels": [{"id": "inner", "kind": "kv", "data": {"fields": [{"label": "deep", "text": "yes"}]}}]},
                                                                      {"title": "Two", "fields": [{"label": "b", "text": "2"}]}]}}]}


def test_the_kinds_of_words_and_tables(browsers):
    async def body(pg):
        await pg.evaluate("(v) => window.__harness.paint(v)", KINDS_VIEW)
        await frame(pg)
        states = await ev(pg, "[...R.querySelectorAll('.dv-grid .dv-panel')].map((p) => p.dataset.state)")
        assert set(states) == {"ready"}, states
        got = await ev(pg, """{
          kv: [...R.querySelectorAll('[data-panel=facts] dt, [data-panel=facts] dd')].map((x) => x.textContent),
          chips: [...R.querySelectorAll('[data-panel=health] dd .dv-chip')].map((x) => x.className),
          metric: [R.querySelector('.dv-metric-value').textContent, R.querySelector('.dv-metric-delta').className, R.querySelector('.dv-metric-unit').textContent, R.querySelector('.dv-metric-caption').textContent],
          md: [R.querySelector('.dv-md h4').textContent, R.querySelector('.dv-md strong').textContent, R.querySelector('.dv-md em').textContent, R.querySelector('.dv-md p code').textContent,
               [...R.querySelectorAll('.dv-md a')].map((a) => a.getAttribute('href')), R.querySelectorAll('.dv-md b, .dv-md i').length, R.querySelectorAll('.dv-md li').length, R.querySelector('.dv-md pre').textContent],
          links: [...R.querySelectorAll('.dv-links li')].map((li) => [li.querySelector('.dv-link') ? li.querySelector('.dv-link').textContent : null, li.textContent]),
          tl: [...R.querySelectorAll('.dv-tl-label')].map((x) => x.textContent).concat([R.querySelector('[data-panel=events] .dv-more').textContent]) }""")
        assert got["kv"] == ["Owner", "Ann", "Since", "2019"]
        assert got["chips"] == ["dv-cell dv-t-ok dv-chip", "dv-cell dv-t-warn dv-chip"]
        assert got["metric"] == ["1,204.5", "dv-cell dv-t-pos dv-metric-delta", "k", "orders today"]
        md = got["md"]
        assert md[:4] == ["Heading", "bold", "soft", "code"] and md[4] == ["https://example.org/x"] and md[5] == 0 and md[6] == 2 and md[7] == "raw <i>"
        assert got["links"][0][0] == "Group B" and "no access" in got["links"][1][1] and got["links"][1][0] is None
        assert got["tl"] == ["First", "Second", "3 more events"]
        rows = "[...R.querySelectorAll('[data-panel=rows] tbody tr')].map((r) => r.textContent)"
        assert await ev(pg, rows) == ["▸Beta1,200", "Alpha(50)", "Gamma9"]
        assert await ev(pg, "R.querySelector('[data-panel=rows] tfoot').textContent") == "Total1,159"
        await ev(pg, "R.querySelectorAll('[data-panel=rows] thead .dv-sort')[1].click()")
        assert await ev(pg, rows) == ["Alpha(50)", "Gamma9", "▸Beta1,200"]                       # numeric order of the text
        assert await ev(pg, "R.querySelectorAll('[data-panel=rows] thead th')[1].getAttribute('aria-sort')") == "ascending"
        await ev(pg, "R.querySelector('[data-panel=rows] .dv-twisty').click()")
        assert await ev(pg, rows) == ["Alpha(50)", "Gamma9", "▾Beta1,200", "Beta child200"]
        await ev(pg, "(() => { const f = R.querySelector('[data-panel=rows] .dv-filter'); f.value = 'child'; f.dispatchEvent(new Event('input')); })()")
        assert await ev(pg, rows) == ["▾Beta1,200", "Beta child200"]
        await ev(pg, "R.querySelector('[data-panel=rows] tr[data-pick]').click()")
        assert {"type": "pick", "code": None, "detail": "B"} in await pg.evaluate("window.__harness.events")
        lad = await ev(pg, "[...R.querySelectorAll('[data-panel=sched] tbody tr')].map((r) => r.getAttribute('aria-current'))")
        assert lad == [None, "true"]
        piv = await ev(pg, """[[...R.querySelectorAll('[data-panel=piv] thead tr')].map((r) => r.textContent), [...R.querySelectorAll('[data-panel=piv] tbody tr')].map((r) => r.textContent),
            R.querySelector('[data-panel=piv] tfoot').textContent, R.querySelectorAll('[data-panel=piv] .dv-heat').length, R.querySelector('[data-panel=piv] .dv-more').textContent]""")
        assert piv[0] == ["Quarter", "RegionQ1Q2Total"] and piv[1] == ["▾EMEA102030", "UK459", "APAC123"] and piv[2] == "Total1122" and piv[3] == 6 and piv[4] == "4 more rows"
        await ev(pg, "R.querySelector('[data-panel=piv] .dv-twisty').click()")
        assert await ev(pg, "[...R.querySelectorAll('[data-panel=piv] tbody tr')].map((r) => r.textContent)") == ["▸EMEA102030", "APAC123"]
        tabs = await ev(pg, """[[...R.querySelectorAll('[data-panel=tb] [role=tab]')].map((t) => [t.textContent, t.getAttribute('aria-selected')]),
            R.querySelector('[data-panel=inner]').dataset.state, R.querySelector('[data-panel=inner] dd').textContent, [...R.querySelectorAll('[data-panel=tb] [role=tabpanel]')].map((p) => p.hidden)]""")
        assert tabs == [[["One", "true"], ["Two", "false"]], "ready", "yes", [False, True]]
        await ev(pg, "R.querySelector('[data-panel=tb] [role=tab]').focus()")
        await pg.keyboard.press("ArrowRight")
        assert await ev(pg, "[...R.querySelectorAll('[data-panel=tb] [role=tabpanel]')].map((p) => p.hidden)") == [True, False]
        await pg.evaluate("""() => { const H = window.__harness, p = JSON.parse(JSON.stringify(H.handle.viewModel.panels.find((x) => x.id === 'fig')));
            p.data.value.text = '1,300.0'; H.handle.patch({ seq: 1, patches: [{ op: 'panel', panel: p }] }); }""")
        await frame(pg)
        assert await ev(pg, "R.querySelector('.dv-metric-value').textContent") == "1,300.0"
        await shot(pg, "views-kinds.png")
    run(browsers, body, "view=V001")


CHARTS_VIEW = {
    "contract": "1.0", "ref": {"kind": "book", "id": "B-1"}, "title": {"pill": "Book", "id": "B-1"},
    "panels": [
        {"id": "ln", "kind": "line", "data": {"x": ["Mon", "Tue", "Wed"], "series": [{"label": "Orders", "values": [3, 5, None], "tone": None}], "unit": "k"}},
        {"id": "ar", "kind": "area", "data": {"x": ["Mon", "Tue"], "series": [{"label": "Load", "values": [1, 2], "tone": None}]}},
        {"id": "hb", "kind": "hbar", "data": {"bars": [{"label": "DEU", "value": 40, "text": "40", "tone": None}, {"label": "FRA", "value": 20, "text": "20", "tone": "warn"}], "total": "60 in all"}},
        {"id": "dn", "kind": "hbar", "data": {"shape": "donut", "bars": [{"label": "A", "value": 3, "text": "3", "tone": None}, {"label": "B", "value": 1, "text": "1", "tone": None}]}},
        {"id": "ga", "kind": "gauge", "data": {"value": 85, "max": 100, "text": "85%", "label": "Capacity"}},
        {"id": "wf", "kind": "waterfall", "data": {"steps": [{"label": "Start", "value": 10}, {"label": "Fees", "value": -3}]}},
        {"id": "hi", "kind": "histogram", "data": {"bins": [{"from": 0, "to": 1, "count": 4}, {"from": 1, "to": 2, "count": 6}]}},
        {"id": "sc", "kind": "scatter", "data": {"points": [{"x": 1, "y": 2, "label": "p"}, {"x": 2, "y": 3, "label": "q"}], "xLabel": "size", "yLabel": "cost"}},
        {"id": "cs", "kind": "candlestick", "data": {"candles": [{"x": "d1", "open": 1, "high": 3, "low": 0.5, "close": 2}]}},
        {"id": "su", "kind": "surface", "data": {"x": ["1y", "2y"], "y": ["a", "b"], "z": [[1, 2], [3, 4]]}},
        {"id": "gr", "kind": "graph", "data": {"nodes": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}], "edges": [{"from": "a", "to": "b"}]}},
        {"id": "mp", "kind": "map", "data": {"mode": "world", "shade": {"label": "Orders", "items": [{"code": "DEU", "value": 4}]}}},
        {"id": "odd", "kind": "seat-map", "data": {"rows": 3}}]}


def test_the_kinds_of_charts_load_the_chart_library_only_then(browsers):
    async def body(pg):
        assert await pg.evaluate("!window.echarts && !window.Drishti.elements.chart")          # a page of words loads no chart engine
        await pg.evaluate("(v) => window.__harness.paint(v, { validate: 'off' })", CHARTS_VIEW)
        await pg.wait_for_function("() => window.__harness.handle.panelCharts && window.__harness.handle.panelCharts.instances().length >= 8", timeout=30000)
        await pg.wait_for_function("() => !!" + ROOT + ".querySelector('[data-panel=gr] .dv-chart').__drishtiGraph", timeout=30000)   # drishti-graph, loaded for it
        states = await ev(pg, "Object.fromEntries([...R.querySelectorAll('.dv-grid .dv-panel')].map((p) => [p.dataset.panel, p.dataset.state]))")
        assert states.pop("odd") == "unknown-kind" and set(states.values()) == {"ready"}, states
        got = await ev(pg, """{
          bars: [...R.querySelectorAll('[data-panel=hb] .dv-bars li')].map((li) => [li.querySelector('.dv-bar-label').textContent, getComputedStyle(li.querySelector('.dv-bar')).getPropertyValue('--dv-share').trim(), li.querySelector('.dv-bar').className]),
          gauge: ['role', 'aria-valuenow', 'aria-valuemax', 'aria-valuetext', 'aria-label'].map((a) => R.querySelector('[data-panel=ga] .dv-gauge').getAttribute(a)),
          table: [...R.querySelectorAll('[data-panel=ln] .dv-data tr')].map((r) => r.textContent),
          graph: !!R.querySelector('[data-panel=gr] .dv-chart').__drishtiGraph,
          map: R.querySelector('[data-panel=mp] .dv-chart-off').textContent,
          img: R.querySelector('[data-panel=sc] .dv-chart').getAttribute('role') }""")
        assert got["bars"] == [["DEU", "1", "dv-bar dv-t-accent"], ["FRA", "0.5", "dv-bar dv-t-warn"]]
        assert got["gauge"] == ["meter", "85", "100", "85%", "Capacity"]
        assert got["table"] == ["Orders", "Mon3", "Tue5", "Wed"]
        assert got["graph"] and got["img"] == "img" and "map helper" in got["map"]
        await pg.evaluate("""() => { const H = window.__harness, p = JSON.parse(JSON.stringify(H.handle.viewModel.panels[0]));
            p.data.series[0].values = [3, 5, 8]; H.handle.patch({ seq: 1, patches: [{ op: 'panel', panel: p }] }); }""")
        await frame(pg)
        assert await ev(pg, "[...R.querySelectorAll('[data-panel=ln] .dv-data tr')].map((r) => r.textContent)[3]") == "Wed8"
        await shot(pg, "views-charts.png")
        await pg.evaluate("window.__harness.handle.dispose()")
        assert await pg.evaluate("window.__harness.handle.panelCharts.instances().length") == 0     # disposed with the view
    run(browsers, body, "view=V002")
