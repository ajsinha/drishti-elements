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

"""The per-worker browser of the browser tests.

``Browsers`` is one Chromium for one pytest worker, started the first time a test asks and closed when the worker ends (the ``browsers``
fixture in conftest.py). It runs Playwright's async API on a thread of its own, so a test can drive several pages at once
(``browsers.run(coro)``, ``asyncio.gather`` inside) while files that use the sync API keep theirs on the main thread. Its browser
contexts are kept per viewport width and reused: a context is reset (cookies cleared, the page's storage cleared) when a test hands it
back, so the next test starts as on a fresh one but with the HTTP cache warm.

``settled(page)`` waits on the page's own signal, ``Drishti.settled()`` (tests/support/drishti_settled.js), never on a fixed pause.
``shared_once(key, make)`` computes a value once per test run for every worker (a file lock in the run's shared temporary folder).
``Phases`` records where a page's time goes when DRISHTI_BROWSER_PROFILE names a JSONL file."""
from __future__ import annotations

import asyncio
import contextlib
import json
import os
import threading
import time
from pathlib import Path

BROWSER_WAIT_MS = int(os.environ.get("DRISHTI_BROWSER_WAIT_MS", "45000"))
NETWORK_CHANGED = "ERR_NETWORK_CHANGED"


def should_reload(network, reloaded: bool) -> bool:
    """Whether a wait that timed out is worth one reload: Chromium cancels the requests in flight when the machine's network
    interfaces change, so a page can sit unstarted with ERR_NETWORK_CHANGED in its failed requests. Once per page, and only for
    that cause: any other timeout is a real failure."""
    return (not reloaded) and any(NETWORK_CHANGED in str(n) for n in (network or []))

SETTLED_JS = Path(__file__).resolve().parent / "support" / "drishti_settled.js"
CSP_JS = ("window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' "
          "+ e.blockedURI));")
SHOW_EVERYTHING: list = []                      # a host that hides parts of its screens could set a cookie here; Elements has none
# how many pages one worker drives at once: measured, more only adds CPU contention
PAGES_AT_ONCE = int(os.environ.get("DRISHTI_BROWSER_PAGES_AT_ONCE", "4"))


class Phases:
    """Seconds per named phase of one page; appended as one JSON line to DRISHTI_BROWSER_PROFILE when set."""

    OUT = os.environ.get("DRISHTI_BROWSER_PROFILE", "")

    def __init__(self, what: str):
        self.what, self.t0, self.last, self.parts = what, time.perf_counter(), time.perf_counter(), {}

    def mark(self, name: str) -> None:
        now = time.perf_counter()
        self.parts[name] = round(self.parts.get(name, 0.0) + now - self.last, 4)
        self.last = now

    def done(self) -> None:
        if not self.OUT:
            return
        row = {"what": self.what, "worker": os.environ.get("PYTEST_XDIST_WORKER", "main"), "total": round(time.perf_counter() - self.t0, 4), **self.parts}
        with open(self.OUT, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(row) + "\n")


class Browsers:
    """One Chromium for this worker, on a thread of its own, with its contexts kept per width."""

    def __init__(self):
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self.loop.run_forever, name="browsers", daemon=True)
        self.thread.start()
        self.pw = self.browser = None
        self.free: dict[tuple, list] = {}
        self.made = 0
        self.gate = None

    def run(self, coro, timeout: float | None = None):
        """Runs a coroutine on the browser's thread and returns its result (its exception raised here)."""
        return asyncio.run_coroutine_threadsafe(coro, self.loop).result(timeout)

    def start(self) -> "Browsers":
        async def go():
            from playwright.async_api import async_playwright
            self.pw = await async_playwright().start()
            # the tests serve their pages from a made-up origin through a request interceptor (route.fulfill), so nothing leaves the machine
            self.browser = await self.pw.chromium.launch()
            self.gate = asyncio.Semaphore(PAGES_AT_ONCE)
        self.run(go())
        return self

    def close(self) -> None:
        async def stop():
            for ctxs in self.free.values():
                for c in ctxs:
                    with contextlib.suppress(Exception):
                        await c.close()
            if self.browser:
                await self.browser.close()
            if self.pw:
                await self.pw.stop()
        with contextlib.suppress(Exception):
            self.run(stop(), timeout=60)
        self.loop.call_soon_threadsafe(self.loop.stop)
        self.thread.join(10)

    async def _context(self, width: int, height: int, show_everything: bool):
        key = (width, height, show_everything)
        free = self.free.setdefault(key, [])
        if free:
            return key, free.pop()
        ctx = await self.browser.new_context(viewport={"width": width, "height": height})
        await ctx.add_init_script(CSP_JS)
        await ctx.add_init_script(path=str(SETTLED_JS))   # the settled signal on every page, the made-up origin's too (init scripts pass the CSP)
        if show_everything:
            await ctx.add_cookies(SHOW_EVERYTHING)
        self.made += 1
        return key, ctx

    async def _reset(self, ctx, show_everything: bool) -> None:
        for p in list(ctx.pages):
            with contextlib.suppress(Exception):
                await p.evaluate("() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} }")
            with contextlib.suppress(Exception):
                await p.close()
        await ctx.clear_cookies()
        if show_everything:
            await ctx.add_cookies(SHOW_EVERYTHING)

    @contextlib.asynccontextmanager
    async def page(self, width: int = 1280, height: int = 900, show_everything: bool = True, route=None):
        """A page on a reused context of this width (at most PAGES_AT_ONCE at a time); the context is reset when the page is done.
        ``route``: a request handler for every request of the page (the made-up origin of the render harness)."""
        async with self.gate:
            key, ctx = await self._context(width, height, show_everything)   # new, or reset when it was handed back
            page = await ctx.new_page()
            page.errors, page.reqs, page.network = [], [], []
            page.on("pageerror", lambda e: page.errors.append(str(e)))
            page.on("request", lambda r: page.reqs.append(r.url))
            page.on("requestfailed", lambda r: page.network.append(f"request failed: {r.url} ({r.failure})"))
            if route:
                await page.route("**/*", route)
            try:
                yield page
            finally:
                try:
                    await self._reset(ctx, show_everything)
                    self.free[key].append(ctx)
                except Exception:  # noqa: BLE001 - a context that cannot be reset is dropped, never reused
                    with contextlib.suppress(Exception):
                        await ctx.close()


async def settled(page, quiet: int = 50, timeout: int = BROWSER_WAIT_MS, animations: bool = True) -> dict:
    """Waits on the page's settled signal (Drishti.settled: Browsers puts it on every page as an init script).
    ``animations=False``: a chart counts as ready once drawn, its animation not waited for (a test that reads a chart's option and the
    page's text, never its pixels)."""
    return await page.evaluate("(o) => window.Drishti.settled(o)", {"quiet": quiet, "timeout": timeout, "animations": animations})


async def open_settled(page, url: str, ready: str | None = None, phases: Phases | None = None, animations: bool = True) -> None:
    """Loads the address, waits for ``ready`` (a selector, attached) and the settled signal. A page whose requests Chromium cancelled
    because the machine's network changed (net::ERR_NETWORK_CHANGED: Docker starting or stopping a container) is loaded once more, with
    the device cookie cleared; any other failure is the page's own (should_reload)."""
    async def once():
        await page.goto(url, wait_until="load")
        if phases:
            phases.mark("load")
        if ready:
            await page.wait_for_selector(ready, state="attached", timeout=BROWSER_WAIT_MS)
            if phases:
                phases.mark("ready")
        await settled(page, animations=animations)
        if phases:
            phases.mark("settled")
    try:
        await once()
    except Exception:
        if not should_reload(page.network, False):
            raise
    if should_reload(page.network, False):
        del page.errors[:], page.reqs[:], page.network[:]
        await page.context.clear_cookies(name="drishti-device")
        await once()


def _lock(fh):
    try:
        import fcntl
        fcntl.flock(fh, fcntl.LOCK_EX)
    except ImportError:                                  # Windows
        import msvcrt
        while True:
            try:
                msvcrt.locking(fh.fileno(), msvcrt.LK_LOCK, 1)
                return
            except OSError:
                time.sleep(0.2)   # wait-ok: polling a file lock another worker holds (Windows)


def shared_once(run_dir: Path, key: str, make):
    """The value ``make()`` returns, computed by the first worker that asks and read from the run's shared folder by every other
    (JSON). ``run_dir``: a folder every worker of this run shares (the parent of a worker's basetemp)."""
    run_dir.mkdir(parents=True, exist_ok=True)
    out, lock = run_dir / f"{key}.json", run_dir / f"{key}.lock"
    with open(lock, "a+") as fh:
        _lock(fh)
        if out.exists():
            return json.loads(out.read_text(encoding="utf-8"))
        value = make()
        tmp = out.with_suffix(".tmp")
        tmp.write_text(json.dumps(value), encoding="utf-8")
        tmp.replace(out)
        return value


def run_dir(tmp_path_factory) -> Path:
    """The folder every pytest-xdist worker of this run shares: the parent of the worker's basetemp (the basetemp itself alone)."""
    base = tmp_path_factory.getbasetemp()
    return (base.parent if os.environ.get("PYTEST_XDIST_WORKER") else base) / "shared"


_CHOOSE = """([sel, value, label, index]) => {
  const el = document.querySelector(sel);
  if (!el) { throw new Error('no element ' + sel); }
  const host = el.tagName === 'DRISHTI-SELECT' ? el : (el.closest('drishti-select') || el.querySelector('drishti-select'));
  if (el.tagName === 'SELECT' || !host) {
    const s = el.tagName === 'SELECT' ? el : el.querySelector('select');
    const opts = Array.from(s.options);
    const o = index !== null ? opts[index] : opts.find((x) => (label !== null ? x.label === label : x.value === value));
    s.value = o.value;
    ['input', 'change'].forEach((t) => s.dispatchEvent(new Event(t, { bubbles: true })));
    return o.value;
  }
  const c = host.component, opts = c.options;
  const o = index !== null ? opts[index] : opts.find((x) => (label !== null ? String(x.label) === label : String(x.value) === String(value)));
  if (!o) { throw new Error('no option ' + (label !== null ? label : index !== null ? index : value) + ' in ' + sel); }
  c.setValue(o.value, true);
  return o.value;
}"""


async def choose(page, selector: str, value=None, *, label=None, index=None):
    """Picks an option of a select by value, label or index, as a person's pick does: a native <select> or drishti-inputs'
    <drishti-select> (at the selector, around it or inside it), whose pick emits its change event."""
    await page.wait_for_selector(selector, state="attached")
    return await page.evaluate(_CHOOSE, [selector, value, label, index])
