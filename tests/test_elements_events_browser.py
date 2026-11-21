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
"""drishti-events in a real browser, against its fixture harness (elements/drishti-events/drishti_harness.html) and the gallery's Eventing
pages. The files come from a real local HTTP server (a ThreadingHTTPServer on 127.0.0.1, strict CSP on every page) rather than a request
interceptor: a SharedWorker's script and its Server-Sent Events stream are not seen by Playwright's routing. The server's /feed is a raw
SSE stream (one JSON value every 50 ms, ids for resume: Last-Event-ID or lastEventId= in the address) and counts the streams it holds open.

* the shared hub: three tabs, one stream to the server, in the SharedWorker and in the leader tab; the leader closed, the next tab leads
  and the others keep receiving over one new stream;
* the queue: five edits with the network off wait on disk, survive a reload and reach the server in order, once;
* the inspector: its names, / to the filter, Space pauses, Enter opens the message under focus, Escape closes it then the inspector;
* the status badge: Live, Reconnecting when the line is cut, Live again;
* throughput: 10,000 messages a second over 2,000 keys into a grid, conflated once a frame, the frame time's p95 bounded;
* the gallery's Eventing pages: the inspector opened from a page, the offline queue counting edits."""
import json
import threading
import time
import uuid
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

pytestmark = pytest.mark.spread

STATIC = Path(__file__).resolve().parents[1]
PAGE = "/elements/drishti-events/drishti_harness.html"
CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'"
READY = "() => window.__harness && (window.__harness.ready || window.__harness.error)"
TICK_S = 0.05


class Feed:
    """What /feed holds: the streams open now and ever opened."""

    def __init__(self):
        self.lock, self.open, self.total, self.stop = threading.Lock(), 0, 0, threading.Event()

    def stats(self):
        with self.lock:
            return {"open": self.open, "total": self.total}


class Handler(SimpleHTTPRequestHandler):
    feed: Feed = None

    def log_message(self, *a):  # noqa: D102 - quiet
        pass

    def end_headers(self):
        if self.path.split("?")[0].endswith(".html"):
            self.send_header("Content-Security-Policy", CSP)
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):  # noqa: N802 - the standard library's name
        path = self.path.split("?")[0]
        if path == "/feed":
            return self._feed()
        if path == "/stats":
            body = json.dumps(self.feed.stats()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return None
        return super().do_GET()

    def _feed(self):
        from urllib.parse import parse_qs, urlsplit
        asked = parse_qs(urlsplit(self.path).query).get("lastEventId", [None])[0]   # EventSource's first connect: the address carries it
        n = int(self.headers.get("Last-Event-ID") or asked or 0)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        f = self.feed
        with f.lock:
            f.open += 1
            f.total += 1
        try:
            self.wfile.write(b"retry: 300\n\n")
            while not f.stop.is_set():
                n += 1
                self.wfile.write(f"id: {n}\ndata: {json.dumps({'n': n})}\n\n".encode())
                self.wfile.flush()
                time.sleep(TICK_S)   # wait-ok: the feed's own pace (a value every 50 ms)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            with f.lock:
                f.open -= 1


@pytest.fixture
def site():
    """A real HTTP server on 127.0.0.1 serving the repository with /feed and /stats; its origin and its Feed."""
    feed = Feed()
    handler = type("H", (Handler,), {"feed": feed})
    srv = ThreadingHTTPServer(("127.0.0.1", 0), partial(handler, directory=str(STATIC)))
    srv.daemon_threads = True
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    try:
        yield f"http://127.0.0.1:{srv.server_address[1]}", feed
    finally:
        feed.stop.set()
        srv.shutdown()
        srv.server_close()


async def opened(ctx, url):
    pg = await ctx.new_page()
    pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    await pg.goto(url)
    await pg.wait_for_function(READY, timeout=30000)
    assert await pg.evaluate("window.__harness.error") is None
    return pg


async def until(pg, js, arg=None, timeout=15000):
    await pg.wait_for_function(js, arg=arg, timeout=timeout)


async def clean(pg):
    assert pg.errors == [], pg.errors
    assert await pg.evaluate("window.__csp") == []            # nothing inline: the strict CSP holds


def in_context(browsers, body, timeout=120):
    """body(ctx) on a fresh browser context of its own (tabs that share a SharedWorker, a Web Lock and IndexedDB), closed after."""
    async def go():
        ctx = await browsers.browser.new_context(viewport={"width": 1280, "height": 900})
        await ctx.add_init_script("window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));")
        try:
            await body(ctx)
        finally:
            await ctx.close()
    browsers.run(go(), timeout=timeout)


def stats(origin):
    import urllib.request
    with urllib.request.urlopen(origin + "/stats", timeout=5) as r:   # noqa: S310 - our own local server
        return json.loads(r.read())


def wait_stats(origin, want, timeout=10.0):
    end = time.monotonic() + timeout
    while True:
        s = stats(origin)
        if all(s[k] == v for k, v in want.items()) or time.monotonic() > end:
            return s
        time.sleep(0.1)   # wait-ok: polling the local server's own counters


@pytest.mark.parametrize("worker", ["1", "0"], ids=["shared-worker", "leader-tab"])
def test_three_tabs_share_one_stream(browsers, site, worker):
    origin, _ = site
    ns = "hub-" + uuid.uuid4().hex[:8]
    url = f"{origin}{PAGE}?mode=hub&feed=/feed&ns={ns}&worker={worker}"

    async def body(ctx):
        import asyncio
        pages = [await opened(ctx, url) for _ in range(3)]
        for pg in pages:
            await until(pg, "() => window.__harness.got >= 5")
        modes = [await pg.evaluate("window.__harness.mode()") for pg in pages]
        assert modes == (["worker"] * 3 if worker == "1" else ["leader"] * 3), modes
        s = await asyncio.get_running_loop().run_in_executor(None, wait_stats, origin, {"open": 1})
        assert s == {"open": 1, "total": 1}, s                                    # one stream for three tabs
        if worker == "0":                                                         # the leader goes: the next tab leads, one new stream
            await pages[0].close()
            rest = pages[1:]
            before = [await pg.evaluate("window.__harness.got") for pg in rest]
            for pg, b in zip(rest, before):
                await until(pg, "(b) => window.__harness.got >= b + 10", b, timeout=20000)
            s = await asyncio.get_running_loop().run_in_executor(None, wait_stats, origin, {"open": 1, "total": 2})
            assert s == {"open": 1, "total": 2}, s
            pages = rest
        for pg in pages:
            vals = await pg.evaluate("window.__harness.values")
            assert vals == sorted(vals) and len(vals) == len(set(vals)), str(vals)       # in order, each once
            await clean(pg)
    in_context(browsers, body)


def test_the_queue_survives_a_reload_and_leaves_in_order_once(browsers, site):
    origin, _ = site
    ns = "queue-" + uuid.uuid4().hex[:8]

    async def body(ctx):
        pg = await opened(ctx, f"{origin}{PAGE}?mode=queue&offline=1&ns={ns}")
        for _ in range(5):
            await pg.evaluate("window.__harness.edit()")
        await until(pg, "() => window.__harness.waiting() === 5")
        assert await pg.evaluate("window.__harness.received") == []
        await until(pg, "() => /5/.test(window.__harness.badge())")                 # the badge counts what waits
        await pg.goto(f"{origin}{PAGE}?mode=queue&ns={ns}&from=5")                  # reloaded, the network on
        await pg.wait_for_function(READY, timeout=30000)
        await until(pg, "() => window.__harness.received.length >= 5")
        await pg.wait_for_timeout(600)   # wait-ok: a second sending would arrive within the back-off
        assert await pg.evaluate("window.__harness.received") == [1, 2, 3, 4, 5]
        assert await pg.evaluate("window.__harness.waiting()") == 0
        await clean(pg)
    in_context(browsers, body)


def test_the_inspector_names_and_keys(browsers, site):
    origin, _ = site

    async def body(ctx):
        pg = await opened(ctx, f"{origin}{PAGE}?mode=inspector")
        region = pg.get_by_role("region", name="Events inspector")
        assert await region.count() == 1
        tabs = await pg.eval_on_selector_all("#hx-dock [role=tab]", "els => els.map((e) => e.textContent)")
        assert tabs == ["Messages", "Subscriptions", "Connection", "Queue", "Why"], tabs
        assert await pg.get_attribute("#hx-dock [role=tablist]", "aria-label") == "Inspector views"
        await until(pg, "() => document.querySelectorAll('#hx-dock .dei-pane-messages [role=row]').length > 3")
        await pg.click("#hx-dock [data-tab=messages]")
        await pg.keyboard.press("/")                                                 # / goes to the filter
        assert await pg.evaluate("document.activeElement.classList.contains('dei-filter')")
        await pg.keyboard.type("prices.fx.USDCAD")
        await until(pg, "() => /\\d+ messages/.test(document.querySelector('#hx-dock .dei-status').textContent)")
        await pg.click("#hx-dock .dei-pane-messages [role=gridcell]")                # a message under focus (a cell, not a button)
        await pg.keyboard.press(" ")                                                 # Space pauses
        assert await pg.get_attribute("#hx-dock .dei-pause", "aria-pressed") == "true"
        assert (await pg.text_content("#hx-dock .dei-status")).startswith("Paused")
        await pg.keyboard.press(" ")
        assert await pg.get_attribute("#hx-dock .dei-pause", "aria-pressed") == "false"
        await pg.keyboard.press("Enter")                                             # Enter opens the message under focus
        assert await pg.is_visible("#hx-dock .dei-detail")
        assert "prices.fx." in await pg.text_content("#hx-dock .dei-detail")
        await pg.keyboard.press("Escape")                                            # Escape closes the message, then the inspector
        assert not await pg.is_visible("#hx-dock .dei-detail")
        await pg.click("#hx-dock [data-tab=why]")
        await pg.fill("#hx-dock .dei-why-topic", "weather.city.Paris")
        await pg.click("#hx-dock .dei-why-go")
        assert await pg.get_attribute("#hx-dock .dei-why-answer", "data-failed")    # the first failed step is named
        await pg.click("#hx-dock [data-tab=connection]")
        await pg.keyboard.press("Escape")
        assert await pg.evaluate("window.__harness.inspector.closed") is True
        assert await pg.locator("#hx-dock > *").count() == 0
        await clean(pg)
    in_context(browsers, body)


def test_the_badge_follows_the_connection(browsers, site):
    origin, _ = site

    async def body(ctx):
        pg = await opened(ctx, f"{origin}{PAGE}?mode=inspector")
        await until(pg, "() => window.__harness.badge().startsWith('Live')")
        await pg.evaluate("window.__harness.drop()")
        await until(pg, "() => /Reconnecting|Offline|Connecting/.test(window.__harness.badge())")
        await pg.evaluate("window.__harness.restore()")
        await until(pg, "() => window.__harness.badge().startsWith('Live')")
        await clean(pg)
    in_context(browsers, body)


@pytest.mark.budget
def test_ten_thousand_a_second_into_a_grid_once_a_frame(browsers, site):
    origin, _ = site

    async def body(ctx):
        pg = await opened(ctx, f"{origin}{PAGE}?mode=ticker&rate=10000")
        await pg.wait_for_timeout(500)   # wait-ok: the grid's first frames are drawing, not measured
        await pg.evaluate("window.__harness.meter.reset()")
        await pg.wait_for_timeout(3000)  # wait-ok: three seconds of ticks measured
        s = await pg.evaluate("window.__harness.stats()")
        assert s["sent"] > 15000, s
        assert s["applied"] > 1000, s
        assert s["p95"] is not None and s["p95"] < 50, s                              # once a frame: the page stays smooth
        await clean(pg)
    in_context(browsers, body)


def test_the_gallery_eventing_pages(browsers, site):
    origin, _ = site

    async def body(ctx):
        pg = await ctx.new_page()
        pg.errors = []
        pg.on("pageerror", lambda e: pg.errors.append(str(e)))
        await pg.goto(origin + "/gallery/drishti_gallery.html")
        await pg.wait_for_function("() => window.__gallery && document.querySelector('.gx-stage')", timeout=30000)
        await pg.click(".gx-nav-item[data-c='events-ticker']")
        await pg.wait_for_selector(".gx-stage [data-figures][data-sent]")
        await pg.click(".gx-stage [data-action=inspect]")
        await pg.wait_for_selector(".drishti-events-inspector", timeout=15000)     # the inspector's part loaded and drawn
        await pg.keyboard.press("Escape")
        await pg.click(".gx-nav-item[data-c='events-offline']")
        await pg.click(".gx-stage [data-action=off]")
        await pg.click(".gx-stage [data-action=edits]")
        await until(pg, "() => /^5 waiting/.test(document.querySelector('.gx-stage [data-waiting]').textContent)")
        await pg.click(".gx-stage [data-action=on]")
        await until(pg, "() => /^0 waiting/.test(document.querySelector('.gx-stage [data-waiting]').textContent)")
        await clean(pg)
    in_context(browsers, body)
