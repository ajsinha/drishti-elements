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
"""drishti-views draws a view's controls (ViewModel.controls) with drishti-inputs' components, in a real browser under a strict CSP.

The fixture is the case of an embedded screen with controls (a trade's events filtered by leg and by date, as Drishti's embed shows it): the
controls are drawn in the shadow root (a panel's header, the strip's bar, the side bar), the values the host gives (`controls`) set them, a
pick asks the host's bind with every ctl.<id> value and only the panels that read the control are drawn again, the host hears
control-change, the multi-select and the date range work from the keyboard, every kind of the contract is drawn by its component, nothing
moves when the components arrive, and a view given by its address without a bind is read again with the values."""
import pytest

from test_views_browser import ORIGIN, PAGE, READY, frame, router

pytestmark = pytest.mark.spread

# the fixture's ViewModel, made for given control values (the host's bind answers it: the server's view built with ctl.*)
MAKE = """
window.__make = (ctl) => {
  const ROWS = [['deal', '2026-01-02', 'Trade booked'], ['1', '2026-01-15', 'Fixed coupon'], ['2', '2026-01-15', 'Float coupon'],
    ['1', '2026-07-15', 'Fixed coupon'], ['2', '2026-07-15', 'Float coupon'], ['2', '2027-01-15', 'Float coupon']];
  const legs = ctl.legs !== undefined && ctl.legs !== '' ? ctl.legs.split(',') : ['1', '2'], when = ctl.when || '', span = when.split('..');
  const rows = ROWS.filter((r) => (r[0] === 'deal' || legs.indexOf(r[0]) >= 0) && (!span[0] || r[1] >= span[0]) && (!span[1] || r[1] <= span[1]));
  const opt = (v, l) => ({ value: v, label: l || v });
  return { contract: '1.2', ref: { kind: 'trade', id: 'MX-1' }, title: { pill: 'Trade', id: 'MX-1' }, strip: [{ label: 'Legs', text: String(legs.length) }],
    keys: [], provenance: { generation: 1 }, timings: {},
    panels: [{ id: 'ticket', kind: 'kv', title: 'Ticket', data: { fields: [{ label: 'Asset class', text: ctl.asset || 'all' }] } },
      { id: 'event-list', kind: 'table', title: 'Events' + (when ? ' · ' + when : ''), data: { columns: ['Leg', 'Date', 'Event'], numeric: [false, false, false],
        rows: rows.map((r) => ({ cells: r.map((t) => ({ text: t })) })) } }],
    controls: [
      { id: 'legs', kind: 'multi-select', label: 'Legs', placement: 'header', panel: 'event-list', options: [opt('1'), opt('2')], values: legs, reads: ['event-list'] },
      { id: 'when', kind: 'date-range', label: 'When', placement: 'header', panel: 'event-list', options: [opt('2026-01-01..2026-12-31', 'This year')], value: when, reads: ['event-list'] },
      { id: 'asset', kind: 'dropdown', label: 'Asset class', placement: 'side', options: [opt('IR', 'Rates'), opt('FX')], value: ctl.asset || '', reads: ['ticket'] },
      { id: 'side', kind: 'segmented', label: 'Side', options: [opt('pay', 'Pay'), opt('rec', 'Receive'), opt('both', 'Both')], value: ctl.side || 'both', reads: ['strip'] },
      { id: 'status', kind: 'toggle', label: 'Matured', options: [opt('live', 'Live'), opt('all', 'All')], value: ctl.status || 'live', reads: ['strip'] },
      { id: 'on', kind: 'date', label: 'On', value: ctl.on || '', reads: ['strip'] },
      { id: 'notional', kind: 'number-range', label: 'Notional', min: '0', max: '1000000', value: ctl.notional || '', reads: ['strip'] },
      { id: 'tenor', kind: 'slider', label: 'Tenor', min: '0', max: '30', step: '1', range: true, value: ctl.tenor || '', reads: ['strip'] },
      { id: 'top', kind: 'top-n', label: 'Top', options: [opt('5'), opt('10')], value: ctl.top || '10', required: true, reads: ['strip'] },
      { id: 'q', kind: 'search', label: 'Event', value: ctl.q || '', reads: ['strip'] }] };
};
"""

# paints the fixture with a host whose bind answers the fixture for the request's ctl.* values, and records what the host hears
PAINT = MAKE + """
window.__paint = async (given) => {
  const H = window.__harness, w = window.__w = { binds: [], changes: [], bound: [], domChanges: [], tops: [] };
  const R = document.getElementById('hx-view');
  R.addEventListener('elements-view:control-change', (e) => w.domChanges.push(e.detail));
  const host = { bind: (req) => { w.binds.push(req); return window.__make(req.controls || {}); } };
  const first = window.__make(given ? Object.fromEntries(new URLSearchParams(given)) : {});
  const p = H.paint(first, Object.assign({ host: host, complete: true }, given ? { controls: given } : {}));
  const root = R.shadowRoot || R;
  await p;
  w.tops.push(root.querySelector('.dv-grid').getBoundingClientRect().top, root.querySelector('[data-panel=event-list] .dv-panel-b').getBoundingClientRect().top);
  H.handle.on('control-change', (e) => w.changes.push(e.detail));
  H.handle.on('bound', (e) => w.bound.push(e.detail));
  await H.handle.controls.ready;
  w.tops.push(root.querySelector('.dv-grid').getBoundingClientRect().top, root.querySelector('[data-panel=event-list] .dv-panel-b').getBoundingClientRect().top);
  w.held = !!root.querySelector('[data-ctl=legs]');
  return true;
};
"""
R = "document.getElementById('hx-view').shadowRoot"
ROWS = f"[...{R}.querySelectorAll('[data-panel=event-list] tbody tr')].filter((r) => r.cells.length > 1).map((r) => r.cells[0].textContent.trim())"


def with_page(browsers, body):
    async def go():
        async with browsers.page(1280, 900, route=router()) as pg:
            await pg.goto(ORIGIN + PAGE + "?view=V001")
            await pg.wait_for_function(READY, timeout=30000)
            await pg.evaluate("() => { " + PAINT + " }")
            await body(pg)
            assert pg.errors == [], pg.errors
            assert await pg.evaluate("window.__csp") == []               # nothing inline: the strict CSP holds
    browsers.run(go(), timeout=180)


def test_the_controls_are_drawn_in_their_places_and_the_given_values_set_them(browsers):
    async def body(pg):
        await pg.evaluate("window.__paint('legs=2')")
        got = await pg.evaluate(f"""() => ({{
            head: !!{R}.querySelector('[data-panel=event-list] .dv-panel-h [data-ctl=legs]') && !!{R}.querySelector('[data-panel=event-list] .dv-panel-h [data-ctl=when]'),
            side: !!{R}.querySelector('[data-ctl-bar=side] [data-ctl=asset]'),
            strip: [...{R}.querySelectorAll('[data-ctl-bar=strip] [data-ctl]')].map((e) => e.getAttribute('data-ctl')),
            leaked: document.querySelectorAll('[data-ctl]').length,
            chips: [...{R}.querySelectorAll('[data-ctl=legs] .di-chip-label')].map((e) => e.textContent),
            query: window.__harness.handle.controlQuery(), rows: {ROWS}, w: window.__w,
            label: {R}.querySelector('[data-ctl=asset]').getAttribute('aria-labelledby') && {R}.getElementById({R}.querySelector('[data-ctl=asset]').getAttribute('aria-labelledby')).textContent,
            kinds: {{ legs: !!{R}.querySelector('[data-ctl=legs] .di-multiselect input[role=combobox]'), when: !!{R}.querySelector('[data-ctl=when] .di-range-btn'),
              asset: !!{R}.querySelector('[data-ctl=asset] drishti-select').component, side: {R}.querySelectorAll('[data-ctl=side] .di-button-group button').length,
              status: !!{R}.querySelector('[data-ctl=status] button[role=switch]'), on: !!{R}.querySelector('[data-ctl=on] .di-date input[role=combobox]'),
              notional: {R}.querySelectorAll('[data-ctl=notional] input[type=number]').length, tenor: {R}.querySelectorAll('[data-ctl=tenor] input[type=range]').length,
              top: [...{R}.querySelector('[data-ctl=top] drishti-select').component.options.map((o) => o.value)], q: !!{R}.querySelector('[data-ctl=q] input[type=search]') }} }})""")
        assert got["head"] and got["side"] and got["leaked"] == 0
        assert got["strip"] == ["side", "status", "on", "notional", "tenor", "top", "q"]
        assert got["chips"] == ["2"] and got["query"] == "ctl.legs=2" and set(got["rows"]) == {"deal", "2"}
        assert got["label"] == "Asset class"
        assert got["kinds"] == {"legs": True, "when": True, "asset": True, "side": 3, "status": True, "on": True, "notional": 2, "tenor": 2, "top": ["5", "10"], "q": True}
        assert got["w"]["held"] and got["w"]["tops"][0:2] == got["w"]["tops"][2:4]          # held in the first paint: nothing moved when the components came
        assert got["w"]["binds"] == []                                                       # drawing asks for nothing
    with_page(browsers, body)


def test_a_pick_asks_the_bind_with_every_value_draws_only_the_panels_that_read_it_and_tells_the_host(browsers):
    async def body(pg):
        await pg.evaluate("window.__paint('')")
        await pg.evaluate(f"{R}.querySelector('[data-panel=ticket]').setAttribute('data-mark', 'kept')")
        total = len(await pg.evaluate(f"() => {ROWS}"))
        await pg.locator("#hx-view [data-ctl=legs] .di-ms-control").click()                   # its list floats in the page's body
        await pg.locator(".di-ms-pop .di-option").filter(has=pg.locator(".di-option-label", has_text="1")).first.click()
        await pg.wait_for_function("() => window.__w.bound.length > 0", timeout=10000)
        await frame(pg)
        got = await pg.evaluate(f"""() => ({{ rows: {ROWS}, w: window.__w, mark: {R}.querySelector('[data-panel=ticket]').getAttribute('data-mark'),
            status: {R}.querySelector('[data-ctl-status]').textContent, query: window.__harness.handle.controlQuery(), search: location.search }})""")
        assert set(got["rows"]) == {"deal", "2"} and len(got["rows"]) < total
        req = got["w"]["binds"][0]
        assert req["params"] == {"ctl.legs": "2"} and req["controls"] == {"legs": "2"} and req["panels"] == ["event-list"]
        assert got["w"]["bound"][0] == {"panels": ["event-list"], "full": False}
        assert got["mark"] == "kept"                                                          # the other panels did not move
        assert got["w"]["changes"][0]["control"] == "legs" and got["w"]["changes"][0]["value"] == ["2"] and got["w"]["changes"][0]["query"] == "ctl.legs=2"
        assert got["w"]["domChanges"][0]["query"] == "ctl.legs=2"                             # a composed DOM event the page may listen to
        assert got["status"] == "Events updated." and got["query"] == "ctl.legs=2" and got["search"] == "?view=V001"
        # a second control: the bind carries both values
        await pg.locator("#hx-view [data-ctl=side] button", has_text="Pay").click()
        await pg.wait_for_function("() => window.__w.binds.length === 2", timeout=10000)
        assert await pg.evaluate("window.__w.binds[1].params") == {"ctl.legs": "2", "ctl.side": "pay"}
    with_page(browsers, body)


def test_the_multi_select_and_the_date_range_work_from_the_keyboard_and_a_range_redraws_the_title(browsers):
    async def body(pg):
        await pg.evaluate("window.__paint('')")
        combo = pg.locator("#hx-view [data-ctl=legs] input[role=combobox]")
        await combo.focus()
        await pg.keyboard.press("ArrowDown")
        assert await combo.get_attribute("aria-expanded") == "true"
        await pg.keyboard.press("Escape")
        assert await combo.get_attribute("aria-expanded") == "false"
        await pg.locator("#hx-view [data-ctl=when] .di-range-btn").click()
        await pg.locator(".di-range-pop [data-end=from]").fill("2099-01-01")
        await pg.locator(".di-range-pop [data-end=from]").press("Tab")
        await pg.locator(".di-range-pop [data-act=apply]").click()
        await pg.wait_for_function("() => window.__w.bound.length > 0", timeout=10000)
        await frame(pg)
        got = await pg.evaluate(f"""() => ({{ rows: {ROWS}, title: {R}.querySelector('[data-panel=event-list] h3').textContent, query: window.__harness.handle.controlQuery(),
            inHead: !!{R}.querySelector('[data-panel=event-list] .dv-panel-h [data-ctl=when] .di-range-btn') }})""")
        assert got["rows"] == [] and got["title"] == "Events · 2099-01-01.." and got["query"] == "ctl.when=2099-01-01.." and got["inHead"]
        # a selection by keyboard on a Select (Enter opens, the arrows move, Enter picks); its panel is drawn again
        await pg.locator("#hx-view [data-ctl=asset] [role=combobox]").focus()
        await pg.keyboard.press("Enter")
        await pg.keyboard.press("ArrowDown")
        await pg.keyboard.press("Enter")
        await pg.wait_for_function("() => window.__w.bound.length > 1", timeout=10000)
        assert await pg.evaluate("window.__w.binds[1].params") == {"ctl.when": "2099-01-01..", "ctl.asset": "IR"}
        assert await pg.evaluate(f"{R}.querySelector('[data-panel=ticket]').textContent.includes('IR')")
    with_page(browsers, body)


def test_without_a_bind_a_view_given_by_its_address_is_read_again_with_the_values(browsers):
    async def body(pg):
        # the page's own fetch answers the fixture (a service worker would be the same): the view's address is a data endpoint the page serves
        await pg.evaluate("""() => {
          const f = window.fetch.bind(window);
          window.__asked = [];
          window.fetch = (u, o) => { const s = String(u && u.url || u);
            if (s.indexOf('/fixture/view.json') < 0) { return f(u, o); }
            window.__asked.push(s);
            const ctl = {}; new URL(s).searchParams.forEach((v, k) => { if (k.indexOf('ctl.') === 0) { ctl[k.slice(4)] = v; } });
            return Promise.resolve(new Response(JSON.stringify(window.__make(ctl)), { status: 200, headers: { 'content-type': 'application/json' } })); };
        }""")
        await pg.evaluate("""async () => { const H = window.__harness; window.__b = [];
          await H.paint('/fixture/view.json?x=1', { complete: true, controls: 'asset=FX', fetch: (u, o) => window.fetch(u, o) });
          H.handle.on('bound', (e) => window.__b.push(e.detail)); await H.handle.controls.ready; }""")
        assert (await pg.evaluate("window.__asked[0]")).endswith("/fixture/view.json?x=1&ctl.asset=FX")
        assert await pg.evaluate(f"{R}.querySelector('[data-panel=ticket]').textContent.includes('FX')")
        await pg.locator("#hx-view [data-ctl=q] input[type=search]").fill("coupon")
        await pg.wait_for_function("() => window.__b.length > 0", timeout=10000)
        last = await pg.evaluate("window.__asked[window.__asked.length - 1]")
        assert "ctl.asset=FX" in last and "ctl.q=coupon" in last and "x=1" in last
        assert await pg.evaluate("window.__harness.handle.controlValues") == {"asset": "FX", "q": "coupon"}
    with_page(browsers, body)



SELECTS = """
window.__sel = async (extra) => {
  const H = window.__harness, w = window.__w = { binds: [], changes: [], store: {} };
  const make = (ctl) => ({ contract: '1.2', ref: { kind: 'netting-set', id: 'NS-1' }, title: { pill: 'Netting set', id: 'NS-1' }, strip: [], keys: [],
    provenance: { generation: 1 }, timings: {},
    panels: [{ id: 'trades', kind: 'table', title: 'Trades', data: { columns: ['Trade', 'MtM'], numeric: [false, true],
        rows: [['T1', '10'], ['T2', '20']].map((r) => ({ pick: r[0], cells: r.map((t) => ({ text: t })) })) } },
      { id: 'mix', kind: 'hbar', title: 'Mix', data: { bars: [{ label: 'IR', value: 3, text: '3' }, { label: 'FX', value: 1, text: '1' }] } }],
    selects: [{ panel: 'trades', by: 'trade', filter: null }, { panel: 'mix', by: 'asset', filter: null }],
    controls: [{ id: 'trade', kind: 'dropdown', label: 'Trade', options: [{ value: 'T1', label: 'T1' }, { value: 'T2', label: 'T2' }], value: ctl.trade || '', reads: ['mix'] },
      { id: 'asset', kind: 'dropdown', label: 'Asset', options: [{ value: 'IR', label: 'IR' }, { value: 'FX', label: 'FX' }], value: ctl.asset || '', reads: ['trades'], remember: true },
      { id: 'side', kind: 'dropdown', label: 'Side', options: [{ value: 'pay', label: 'pay' }], value: ctl.side || '', reads: ['trades'], remember: true }] });
  const host = { bind: (req) => { w.binds.push(req.controls); return make(req.controls || {}); } };
  const opts = Object.assign({ host: host, complete: true }, extra || {});
  await H.paint(make({}), opts);
  H.handle.on('control-change', (e) => w.changes.push([e.detail.control, e.detail.value]));
  await H.handle.controls.ready;
  return true;
};
"""


def test_a_row_or_a_bar_click_sets_the_control_the_selects_name_and_the_same_click_clears_it(browsers):
    async def body(pg):
        await pg.evaluate("() => { " + SELECTS + " }")
        await pg.evaluate("window.__sel()")
        await pg.locator(f"#hx-view [data-panel=trades] tbody tr[data-pick=T2]").click()
        await pg.wait_for_function("() => window.__w.binds.length > 0", timeout=10000)
        assert await pg.evaluate("window.__w.binds[0]") == {"trade": "T2"}
        assert await pg.evaluate(f"{R}.querySelector('[data-panel=trades] tr[data-pick=T2]').getAttribute('aria-selected')") == "true"
        await pg.evaluate(f"{R}.querySelector('[data-panel=trades] tr[data-pick=T2]').click()")           # the same row again clears it
        await pg.wait_for_function("() => window.__w.binds.length > 1", timeout=10000)
        assert await pg.evaluate("window.__w.binds[1]") == {"trade": ""}
        await pg.evaluate(f"{R}.querySelector('[data-panel=mix] li[data-pick=FX]').click()")           # a bar sets its control to its label
        await pg.wait_for_function("() => window.__w.binds.length > 2", timeout=10000)
        assert (await pg.evaluate("window.__w.binds[2]"))["asset"] == "FX"
        assert await pg.evaluate("window.__w.changes.map((c) => c[0] + '=' + c[1])") == ["trade=T2", "trade=", "asset=FX"]
    with_page(browsers, body)


def test_a_remembered_control_is_kept_through_the_hosts_hook_and_applied_with_one_request(browsers):
    async def body(pg):
        await pg.evaluate("() => { " + SELECTS + " }")
        await pg.evaluate("""window.__sel({ remember: { get: (k) => (window.__mem || {})[k] === undefined ? null : window.__mem[k],
            set: (k, v) => { (window.__mem = window.__mem || {})[k] = v; } } })""")
        await pg.evaluate(f"{R}.querySelector('[data-panel=mix] li[data-pick=IR]').click()")
        await pg.wait_for_function("() => window.__w.binds.length > 0", timeout=10000)
        mem = await pg.evaluate("window.__mem")
        assert list(mem.values()) == ["IR"] and list(mem)[0].endswith(".asset")                      # kept by the hook; side was never picked
        await pg.evaluate("window.__mem['drishti.ctl.netting-set.side'] = 'pay'")
        await pg.evaluate("window.__sel({ remember: { get: (k) => (window.__mem || {})[k] === undefined ? null : window.__mem[k], set: () => {} } })")
        await pg.wait_for_function("() => window.__w.binds.length === 1", timeout=10000)
        assert await pg.evaluate("window.__w.binds[0]") == {"asset": "IR", "side": "pay"}              # both remembered values, one request
        # without a hook the browser's storage is used; a storage that throws is tolerated (the view still draws)
        await pg.evaluate("localStorage.setItem('drishti.ctl.netting-set.asset', 'FX')")
        await pg.evaluate("window.__sel()")
        await pg.wait_for_function("() => window.__w.binds.length === 1", timeout=10000)
        assert await pg.evaluate("window.__w.binds[0]") == {"asset": "FX"}
        await pg.evaluate("Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } })")
        assert await pg.evaluate("window.__sel()") is True
    with_page(browsers, body)
