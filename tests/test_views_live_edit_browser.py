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

"""The grid's live-mode edit (drishti_live-edit.js) in Chromium, driving a live table of drishti-rachana's reference host (its
LiveReferenceServer, the one protocol_check.py --live starts) through drishti-rachana's DataClient over its test bridge, under the strict CSP.
The host is found by DRISHTI_RACHANA_HOME, else the newest sibling checkout whose java/rachana-live is built; a run without it fails (it never skips).

* a reader with no `write` sees no edit control; a masked cell is never editable;
* cells: an edit is checked in the page, sent once (a ULID, the version the row shows), the row stays as it was and the cell is marked
  queued until the table's patch arrives; Tab goes to the next editable cell;
* 409 says who changed the row and when and offers Edit again; 422 puts each message on its column; 403 makes the row read only;
* held: the maker's cell is marked held with the host's message; an approver decides it in the tray (released; a rejection needs its reason);
* beside: selecting a row opens a record panel with Save and Cancel;
* the paused banner from the schema, and "N new" when rows arrive above a scrolled page."""
import asyncio
import json
import os
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from test_views_browser import ORIGIN, PAGE, READY, STATIC, TYPES, HEADERS, frame, shot

pytestmark = pytest.mark.spread

DECL = """rachana: 1
live-table: trades
snapshot: trades
stream: trades.live
key: id
version: v
changed-by: by
changed-at: at
tray: true
columns: [ { name: id }, { name: v, type: integer }, { name: book }, { name: qty, type: integer }, { name: status }, { name: by }, { name: at, type: timestamp } ]
edit:
  fields:
    - { id: qty, bind: qty, type: number, min: 0, required: true }
    - { id: status, bind: status, type: enum, options: [NEW, DONE] }
  reason: optional
"""
ROWS = [{"id": "a", "v": 1, "book": "A", "qty": 1, "status": "NEW", "by": "system", "at": "2026-11-21T09:00:00Z"},
        {"id": "b", "v": 1, "book": "B", "qty": 2, "status": "NEW", "by": "system", "at": "2026-11-21T09:00:00Z"}]
READERS = {"bob": {"editable": ["qty", "status"]}, "viv": {}, "carol": {"approve": True, "editable": ["qty", "status"]},
           "dana": {"editable": ["qty", "status"], "masked": ["qty"], "rowFilter": {"op": "==", "args": [{"col": "book"}, {"lit": "B"}]}},
           "fred": {"editable": ["qty", "status"], "mayEdit": "a forged request: the trader's book is closed"}}
TRADE_FIELDS = [{"name": n, "type": t, "label": n.title()} for n, t in
                [("id", "string"), ("book", "string"), ("qty", "number"), ("status", "string"), ("v", "number")]]
TRAY_FIELDS = [{"name": n, "type": "string", "label": n.title()} for n in ["change", "state", "summary", "by", "message"]]


def rachana_home():
    """The drishti-rachana checkout whose live reference host is built."""
    cands = [Path(os.environ["DRISHTI_RACHANA_HOME"])] if os.environ.get("DRISHTI_RACHANA_HOME") else \
        sorted(STATIC.parent.glob("drishti-rachana*"), key=lambda p: -p.stat().st_mtime)
    for c in cands:
        t = c / "java" / "rachana-live" / "target"
        if (t / "runtime-classpath.txt").is_file() and list(t.glob("rachana-live-*.jar")) and (c / "js/packages/rachana/src/data_client.js").is_file():
            return c
    pytest.fail("drishti-rachana's built live reference host is needed (java/rachana-live/target and js/packages/rachana): set DRISHTI_RACHANA_HOME "
                "or put a built checkout beside this one", pytrace=False)


@pytest.fixture(scope="module")
def host():
    home = rachana_home()
    t = home / "java" / "rachana-live" / "target"
    jars = sorted(str(j) for j in t.glob("rachana-live-*.jar") if not j.name.endswith(("-sources.jar", "-tests.jar")))
    mp = os.pathsep.join(jars + [(t / "runtime-classpath.txt").read_text().strip()])
    p = subprocess.Popen(["java", "--add-opens=java.base/java.nio=org.apache.arrow.memory.core", "-p", mp, "-m",
                          "com.ash.rachana.live/com.ash.rachana.live.LiveReferenceServer", "--port", "0"], stdout=subprocess.PIPE, text=True)
    line = p.stdout.readline()
    if "listening on" not in line:
        p.kill()
        pytest.fail(f"the live reference server did not start: {line!r}", pytrace=False)
    h = Host(line.split("listening on", 1)[1].strip(), home)
    yield h
    p.kill()
    p.wait(timeout=10)


class Host:
    def __init__(self, base, home):
        self.base, self.home = base, home

    def call(self, method, path, body=None):
        r = urllib.request.Request(self.base + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                   headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(r, timeout=20) as x:
                return x.status, x.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def load(self, edit=None, reader="bob", rows=None, readers=None, declaration=None):
        st, _ = self.call("POST", "/_test/live", {"name": "trades", "edit": edit or {"sink": "outbox"}, "declaration": declaration or DECL, "rows": rows or ROWS,
                                                 "readers": readers or READERS})
        assert st == 204
        self.act(reader)

    def act(self, reader):
        assert self.call("POST", "/_test/as", {"reader": reader})[0] == 204

    def stream(self, body):
        assert self.call("POST", "/_test/stream", body)[0] == 204

    def flush(self):
        assert self.call("POST", "/_test/outbox", {"flush": True})[0] == 200


def view(panels, datasets):
    return {"contract": "1.2", "ref": {"kind": "desk", "id": "ALL"}, "title": {"pill": "Desk", "id": "ALL", "with": None}, "strip": [], "panels": panels,
            "keys": [], "provenance": {"layout": None, "fingerprint": None, "source": "live", "generation": 0, "fetchedAt": None, "live": True,
                                       "businessDate": "2026-11-21", "updatedAt": None, "staleAfter": None, "stale": False, "sutra": None, "masked": 0,
                                       "maskedPanels": None}, "timings": {}, "datasets": datasets}


def trades_view(edit, columns=None, table="trades", fields=None, key=None, window=50, top=False):
    live = {"table": table, "window": window, "top": top}
    if edit:
        live["edit"] = edit
    cols = columns or [{"field": f} for f in ("id", "book", "qty", "status", "v")]
    return view([{"id": "t", "kind": "live", "title": table, "span": 12, "height": 14, "data": {"dataset": "d", "columns": cols}}],
                {"d": {"key": key or ["id"], "fields": fields or TRADE_FIELDS, "live": live}})


# the page's end: drishti-rachana's DataClient over the host's test bridge (a request is a bridge message, the host's pushes are polled)
SETUP = """async (o) => {
  const mod = await import('/rachana-js/data_client.js');
  const handlers = [], sent = [];
  window.__writes = sent; window.__hold = false;
  const post = (m) => {
    if (m.t === 'write') { sent.push(m.body); if (window.__failNext) { window.__failNext = false; throw new Error('the network is down'); } }
    return send(m);
  };
  const send = async (m) => {
    const r = await fetch('/api/_test/bridge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(m) });
    const t = await r.text();
    if (t) { const x = JSON.parse(t); handlers.forEach((h) => h(x)); }
  };
  const poll = async () => {
    if (!window.__hold) { try { const r = await fetch('/api/_test/bridge/out'); const l = await r.json(); l.forEach((m) => handlers.forEach((h) => h(m))); } catch (e) { /* ends with the page */ } }
    setTimeout(poll, 40);
  };
  const client = new mod.DataClient({ bridge: { post, listen: (h) => { handlers.push(h); return () => undefined; } } });
  poll();
  const lt = mod.liveTables(client);
  window.__tables = (ref) => Object.assign({}, lt(ref), { schema: async () => { const s = await client.schema(ref.table); return o.loosen && s.write ? loosen(s) : s; } });
  function loosen(s) { const c = JSON.parse(JSON.stringify(s)); Object.values(c.write.columns).forEach((r) => { delete r.min; delete r.max; }); return c; }
  window.__harness.paint(o.view, { tables: window.__tables, liveSchemaMs: o.every || 15000 });
}"""

CELL = "[data-panel=t] .dg-row:nth-child({r}) .dg-cell:nth-child({c})"


async def serve(pg_route, host):
    static = STATIC

    async def route(r):
        url = r.request.url
        path = url[len(ORIGIN):].split("?")[0]
        if path.startswith("/api/"):
            body = r.request.post_data
            st, data = await asyncio.to_thread(host.call, r.request.method, path[4:] + (("?" + url.split("?", 1)[1]) if "?" in url else ""),
                                               json.loads(body) if body else None)
            return await r.fulfill(status=st, body=data, headers={"content-type": "application/json"})
        if path == "/rachana-js/data_client.js":
            return await r.fulfill(status=200, body=(host.home / "js/packages/rachana/src/data_client.js").read_bytes(), headers={"content-type": TYPES[".js"]})
        f = static / path[1:] if path.startswith("/") else None
        if f and f.is_file():
            headers = {"content-type": TYPES.get(f.suffix, "application/octet-stream")}
            if f.suffix == ".html":
                headers.update(HEADERS)
            return await r.fulfill(status=200, body=f.read_bytes(), headers=headers)
        return await r.fulfill(status=404, body="")
    return route


def run(browsers, host, vm, body, **opts):
    async def go():
        async with browsers.page(1440, 1100, route=await serve(None, host)) as pg:
            await pg.goto(ORIGIN + PAGE + "?view=V002")
            await pg.wait_for_function(READY, timeout=30000)
            await pg.evaluate(SETUP, dict({"view": vm}, **opts))
            await pg.wait_for_function("() => { const R = document.getElementById('hx-view'); const e = (R.shadowRoot || R).querySelector('[data-panel=t] .dv-ds'); return e && e.hasAttribute('data-drawn'); }", timeout=30000)
            await frame(pg)
            await body(pg)
            assert pg.errors == [], pg.errors
            assert await pg.evaluate("window.__csp") == []
    browsers.run(go(), timeout=180)


async def text(pg, sel):
    return await pg.locator(sel).first.inner_text()


async def cell_text(pg, r, c):
    return (await pg.locator(CELL.format(r=r, c=c)).first.inner_text()).strip()


async def edit_cell(pg, r, c, value):
    await pg.locator(CELL.format(r=r, c=c)).first.click()
    await pg.keyboard.press("Enter")
    inp = pg.locator("[data-panel=t] .dg-editor-input")
    await inp.wait_for(timeout=5000)
    await inp.fill(value)
    await pg.keyboard.press("Enter")


async def wait_cell(pg, r, c, want, timeout=30000):
    await pg.wait_for_function("([s, w]) => { const R = document.getElementById('hx-view'); const e = (R.shadowRoot || R).querySelector(s); return e && e.textContent.trim() === w; }",
                               arg=[CELL.format(r=r, c=c), want], timeout=timeout)


def test_a_reader_without_write_sees_no_edit_control_and_a_masked_cell_is_never_editable(browsers, host):
    host.load(reader="viv")

    async def read_only(pg):
        assert await pg.locator("[data-panel=t] .dg-editable").count() == 0
        assert await pg.locator("[data-panel=t] [data-live-edit-panel]:not([hidden])").count() == 0
        await pg.locator(CELL.format(r=1, c=3)).first.click()
        await pg.keyboard.press("Enter")
        assert await pg.locator("[data-panel=t] .dg-editor").count() == 0
    run(browsers, host, trades_view("cells"), read_only)
    host.load(reader="dana")

    async def masked(pg):
        assert await pg.locator("[data-panel=t] .dg-row").count() == 1
        assert await pg.locator(CELL.format(r=1, c=3) + ".dg-editable").count() == 0       # qty is masked for this reader
        assert await pg.locator(CELL.format(r=1, c=4) + ".dg-editable").count() == 1        # status is not
    run(browsers, host, trades_view("cells"), masked)


def test_a_table_whose_declaration_has_no_edit_is_not_edited_even_when_the_reader_may(browsers, host):
    host.load()

    async def body(pg):
        assert await pg.locator("[data-panel=t] .dg-editable").count() == 0
    run(browsers, host, trades_view(None), body)


def test_a_cell_edit_is_checked_in_the_page_sent_once_and_shown_only_when_the_patch_arrives(browsers, host):
    host.load()

    async def body(pg):
        assert await pg.locator(CELL.format(r=1, c=3) + ".dg-editable").count() == 1
        assert await pg.locator(CELL.format(r=1, c=2) + ".dg-editable").count() == 0       # book is not a write column
        await edit_cell(pg, 1, 3, "-5")                                                       # the rule (min 0) is checked first, in the page
        assert "qty is at least 0" in await text(pg, "[data-panel=t] .dg-editor-msg")
        assert await pg.evaluate("window.__writes.length") == 0
        await pg.keyboard.press("Escape")
        await edit_cell(pg, 1, 3, "9")
        await pg.wait_for_selector(CELL.format(r=1, c=3) + ".dg-queued", timeout=30000)
        assert await cell_text(pg, 1, 3) == "1"                                               # the row is as it was
        writes = await pg.evaluate("window.__writes")
        assert len(writes) == 1 and writes[0]["key"] == ["a"] and writes[0]["basedOn"] == 1 and writes[0]["set"] == {"qty": 9}
        assert len(writes[0]["id"]) == 26 and writes[0]["op"] == "update"
        assert await pg.locator(CELL.format(r=1, c=3)).first.get_attribute("title")           # the cell says what it waits for
        await pg.locator(CELL.format(r=1, c=3)).first.click()
        await pg.keyboard.press("Enter")
        assert await pg.locator("[data-panel=t] .dg-editor").count() == 0                     # not edited again while it waits
        host.flush()
        await wait_cell(pg, 1, 3, "9")
        assert await pg.locator(CELL.format(r=1, c=3) + ".dg-queued").count() == 0
        await shot(pg, "live-edit-cells.png")
    run(browsers, host, trades_view("cells"), body)


def test_tab_moves_to_the_next_editable_cell_and_every_editor_has_a_name(browsers, host):
    host.load()

    async def body(pg):
        await pg.locator(CELL.format(r=1, c=3)).first.click()
        await pg.keyboard.press("F2")
        inp = pg.locator("[data-panel=t] .dg-editor-input")
        await inp.wait_for(timeout=5000)
        assert "Qty" in (await inp.first.get_attribute("aria-label"))
        await pg.keyboard.press("Tab")                                                        # nothing changed: no write; the next editable cell is status
        await pg.wait_for_function("() => { const R = document.getElementById('hx-view'); const s = (R.shadowRoot || R).querySelector('[data-panel=t] .dg-scroll'); return /-r0-c3$/.test(s.getAttribute('aria-activedescendant') || ''); }", timeout=5000)
        for _ in range(8):                                                                    # Enter once the grid has the focus back: a pick list (drishti-inputs' Select)
            await pg.keyboard.press("Enter")
            try:
                await pg.locator("[data-panel=t] .dg-editor.dg-editor-select").wait_for(state="attached", timeout=1500)
                break
            except Exception:  # noqa: BLE001 - the focus was not back yet
                pass
        await pg.locator("[data-panel=t] .dg-editor.dg-editor-select").wait_for(timeout=10000)
        assert "Status" in (await pg.locator("[data-panel=t] .dg-editor [aria-label]").first.get_attribute("aria-label"))
        await pg.keyboard.press("Escape")                                                     # the open list's own, then the editor's
        await pg.keyboard.press("Escape")
        await pg.wait_for_function("() => { const R = document.getElementById('hx-view'); return !(R.shadowRoot || R).querySelector('[data-panel=t] .dg-editor'); }", timeout=5000)
        assert await pg.evaluate("window.__writes.length") == 0
    run(browsers, host, trades_view("cells"), body)


def test_a_409_says_who_changed_the_row_and_offers_to_edit_again(browsers, host):
    host.load()

    async def body(pg):
        await pg.evaluate("() => { window.__hold = true; }")                                 # the page misses the other person's change
        host.stream({"upsert": [{"id": "a", "v": 2, "book": "A", "qty": 10, "status": "NEW", "by": "carol", "at": "2026-11-21T10:00:00Z"}]})
        await edit_cell(pg, 1, 3, "7")
        await pg.wait_for_selector("[data-panel=t] [data-live-edit-alert][data-kind=conflict]", timeout=30000)
        said = await text(pg, "[data-panel=t] [data-live-edit-alert]")
        assert "Changed by carol at 2026-11-21 10:00:00" in said
        assert await cell_text(pg, 1, 3) == "1" and await pg.locator(CELL.format(r=1, c=3) + ".dg-queued").count() == 0
        await pg.evaluate("() => { window.__hold = false; }")                                # the newer row arrives: its value is told
        await pg.wait_for_function("() => { const R = document.getElementById('hx-view'); const e = (R.shadowRoot || R).querySelector('[data-panel=t] [data-live-edit-alert]'); return e && /Qty is now 10/.test(e.textContent); }", timeout=30000)
        await pg.locator("[data-panel=t] [data-act=edit-again]").click()
        inp = pg.locator("[data-panel=t] .dg-editor-input")
        await inp.wait_for(timeout=5000)
        await inp.fill("11")
        await pg.keyboard.press("Enter")
        await pg.wait_for_selector(CELL.format(r=1, c=3) + ".dg-queued", timeout=30000)
        writes = await pg.evaluate("window.__writes")
        assert [w["basedOn"] for w in writes] == [1, 2] and writes[1]["set"] == {"qty": 11}       # on the new version
        assert writes[0]["id"] != writes[1]["id"]
    run(browsers, host, trades_view("cells"), body)


def test_a_422_puts_each_message_on_its_column(browsers, host):
    host.load()

    async def body(pg):
        await edit_cell(pg, 1, 3, "-5")                                                       # the page's schema was loosened: the host refuses
        await pg.wait_for_selector(CELL.format(r=1, c=3) + ".dg-invalid", timeout=30000)
        assert "qty is at least 0" in (await pg.locator(CELL.format(r=1, c=3)).first.get_attribute("title"))
        assert "qty: qty is at least 0" in await text(pg, "[data-panel=t] [data-live-edit-alert]")
        assert await cell_text(pg, 1, 3) == "1"
    run(browsers, host, trades_view("cells"), body, loosen=True)


def test_a_403_makes_the_row_read_only(browsers, host):
    host.load(reader="fred")

    async def body(pg):
        await edit_cell(pg, 1, 3, "5")
        await pg.wait_for_selector("[data-panel=t] [data-live-edit-alert][data-kind=refused]", timeout=30000)
        assert "closed" in await text(pg, "[data-panel=t] [data-live-edit-alert]")
        await pg.wait_for_function("() => { const R = document.getElementById('hx-view'); return !(R.shadowRoot || R).querySelector('[data-panel=t] .dg-row:nth-child(1) .dg-editable'); }", timeout=30000)
        assert await pg.locator(CELL.format(r=1, c=3) + ".dg-editable").count() == 0 and await pg.locator(CELL.format(r=2, c=3) + ".dg-editable").count() == 1   # that row only
    run(browsers, host, trades_view("cells"), body)


@pytest.mark.parametrize("decision", ["released", "rejected"])
def test_a_held_change_is_marked_with_the_hosts_message_and_an_approver_decides_it_in_the_tray(browsers, host, decision):
    host.load(edit={"sink": "outbox", "hold": True}, reader="bob")

    async def maker(pg):
        await edit_cell(pg, 1, 3, "9")
        await pg.wait_for_selector(CELL.format(r=1, c=3) + ".dg-held", timeout=30000)
        assert "waiting for a second person" in (await pg.locator(CELL.format(r=1, c=3)).first.get_attribute("title"))
        assert await cell_text(pg, 1, 3) == "1"
    run(browsers, host, trades_view("cells"), maker)
    host.act("carol")
    tray = trades_view("cells", columns=[{"field": f} for f in ("change", "state", "summary", "by", "message")], table="trades.changes", fields=TRAY_FIELDS, key=["change"])

    async def approver(pg):
        await pg.wait_for_selector("[data-panel=t] .dg-row", timeout=30000)
        assert await pg.locator("[data-panel=t] .dg-row").count() == 1
        assert await pg.locator(CELL.format(r=1, c=2) + ".dg-editable").count() == 1         # the column state
        assert await pg.locator(CELL.format(r=1, c=1) + ".dg-editable").count() == 0
        await pg.locator(CELL.format(r=1, c=2)).first.click()
        await pg.keyboard.press("Enter")
        await pg.locator("[data-panel=t] .dg-editor.dg-editor-select").wait_for(timeout=5000)
        await pg.get_by_role("option", name=decision).click()
        if decision == "rejected":                                                            # a rejection needs its reason: staged until it is given
            await pg.wait_for_selector("[data-panel=t] [data-live-edit-alert][data-kind=reason]", timeout=30000)
            assert await pg.evaluate("window.__writes.length") == 0
            await pg.locator("[data-panel=t] [data-live-edit-reason]").fill("not on this desk")
            await pg.locator("[data-panel=t] [data-act=send-staged]").click()
        await pg.wait_for_function("() => window.__writes.length === 1", timeout=30000)
        w = await pg.evaluate("window.__writes[0]")
        assert w["basedOn"] == "held" and w["set"] == {"state": decision} and len(w["key"]) == 1
        assert (w.get("reason") == "not on this desk") == (decision == "rejected")
        await pg.wait_for_function("() => { const R = document.getElementById('hx-view'); return !(R.shadowRoot || R).querySelector('[data-panel=t] .dg-row'); }", timeout=30000)   # the row leaves with the patch
        host.flush()
        assert json.loads(host.call("POST", "/tables/trades/query", {"columns": ["qty"], "filter": {"op": "==", "args": [{"col": "id"}, {"lit": "a"}]}})[1])["values"] == [[9 if decision == "released" else 1]]
    run(browsers, host, tray, approver)


def test_beside_mode_opens_a_record_panel_with_save_and_cancel(browsers, host):
    host.load()

    async def body(pg):
        await pg.locator(CELL.format(r=1, c=1)).first.click()
        panel = pg.locator("[data-panel=t] [data-live-edit-panel]")
        await panel.wait_for(state="visible", timeout=30000)
        assert await pg.locator("[data-panel=t] .dg-editable").count() == 0                   # no cell editing in this mode
        qty = panel.get_by_label("Qty", exact=False).first
        await qty.fill("-3")
        await panel.get_by_role("button", name="Save").click()
        assert "at least" in (await panel.inner_text()).lower()
        assert await pg.evaluate("window.__writes.length") == 0
        await qty.fill("8")
        await panel.get_by_role("button", name="Save").click()
        await pg.wait_for_function("() => window.__writes.length === 1", timeout=30000)
        await pg.wait_for_selector("[data-panel=t] [data-panel-status]:has-text('Queued'), [data-panel=t] [data-panel-status]:has-text('Applied')", timeout=30000)
        assert await cell_text(pg, 1, 3) == "1"                                               # the row stays until the patch
        host.flush()
        await wait_cell(pg, 1, 3, "8")
        await panel.get_by_role("button", name="Cancel").click()
        await panel.wait_for(state="hidden", timeout=5000)
        await shot(pg, "live-edit-beside.png")
    run(browsers, host, trades_view("beside"), body)


def test_the_paused_banner_comes_from_the_schema_and_new_rows_are_counted_while_scrolled_down(browsers, host):
    rows = [{"id": "r%03d" % i, "v": 1, "book": "A", "qty": i, "status": "NEW", "by": "system", "at": "2026-11-21T09:%02d:00Z" % (i % 60)} for i in range(120)]
    host.load(rows=rows, declaration=DECL.replace("key: id\n", "key: id\nsort: { col: at, dir: desc }\n"))

    async def body(pg):
        assert await pg.locator("[data-panel=t] [data-live-banner]:not([hidden])").count() == 0
        host.stream({"state": {"up": False, "reason": "the broker is absent"}})
        await pg.wait_for_selector("[data-panel=t] [data-live-banner]:not([hidden])", timeout=30000)
        assert "paused: the broker is absent" in await text(pg, "[data-panel=t] [data-live-banner]")
        host.stream({"state": {"up": True}})
        await pg.wait_for_selector("[data-panel=t] [data-live-banner][hidden]", state="attached", timeout=30000)
        await pg.evaluate("() => { const R = (document.getElementById('hx-view').shadowRoot || document.getElementById('hx-view')); R.querySelector('[data-panel=t] .dv-ds').style.height = '320px'; R.querySelector('[data-panel=t] .dg-scroll').scrollTop = 600; }")
        host.stream({"upsert": [{"id": "new1", "v": 1, "book": "A", "qty": 5, "status": "NEW", "by": "x", "at": "2026-11-21T23:00:00Z"}]})
        await pg.wait_for_selector("[data-panel=t] [data-live-new]:not([hidden])", timeout=30000)
        assert (await text(pg, "[data-panel=t] [data-live-new]")).strip() == "1 new"
        await pg.locator("[data-panel=t] [data-live-new]").click()
        await pg.wait_for_selector("[data-panel=t] [data-live-new][hidden]", state="attached", timeout=30000)
    view_ = trades_view("cells", window=200, top=True)
    view_["panels"][0]["data"]["sort"] = [{"field": "at", "desc": True}]
    run(browsers, host, view_, body, every=250)


def test_a_network_failure_offers_try_again_and_the_retry_reuses_the_change_id(browsers, host):
    host.load()

    async def body(pg):
        await pg.evaluate("() => { window.__failNext = true; }")
        await edit_cell(pg, 1, 3, "9")
        await pg.wait_for_selector("[data-panel=t] [data-live-edit-alert][data-kind=failed]", timeout=30000)
        assert "the network is down" in await text(pg, "[data-panel=t] [data-live-edit-alert]")
        assert await pg.locator(CELL.format(r=1, c=3) + ".dg-sending, " + CELL.format(r=1, c=3) + ".dg-queued").count() == 0
        await pg.locator("[data-panel=t] [data-act=retry]").click()
        await pg.wait_for_selector(CELL.format(r=1, c=3) + ".dg-queued", timeout=30000)
        writes = await pg.evaluate("window.__writes")
        assert len(writes) == 2 and writes[0]["id"] == writes[1]["id"] and writes[0]["set"] == writes[1]["set"]
        host.flush()
        await wait_cell(pg, 1, 3, "9")
    run(browsers, host, trades_view("cells"), body)
