/*
 * Drishti Elements
 *
 * Copyright (c) 2026 Ashutosh Sinha <ajsinha@gmail.com>.
 * All rights reserved.
 *
 * PROPRIETARY.
 *
 * This file is the proprietary property of Ashutosh Sinha.
 * Copying, use, modification or distribution of this file, via any medium,
 * is not permitted except with the express prior written permission of the
 * copyright holder.
 *
 * See the LICENSE file in the root of this repository.
 */
/* Time, in one place. Every timer, timestamp, animation frame and random number of drishti-events comes from one clock, so a test of
   "three reconnects, then a resume, then a flush" runs in microseconds and gives the same answer every time. systemClock() is the
   page's (or Node's) own; testClock({ seed }) is a clock a test moves by hand: tick(ms) runs the timers that fall due in order,
   frame() runs the animation frames asked for, runAll() runs every timer there is, and random() is seeded. Also here: the back-off
   between connection attempts and the heartbeat watchdog, both on the clock. */

/**
 * The clock every part of the library reads.
 * @typedef {Object} Clock
 * @property {function(): number} now ms since 1970
 * @property {function(Function, number): *} setTimeout
 * @property {function(*): void} clearTimeout
 * @property {function(Function): *} requestFrame the next animation frame (a timer of 16 ms where the page has none)
 * @property {function(*): void} cancelFrame
 * @property {function(): number} random a number in [0, 1)
 * @property {function(): boolean} hidden whether the page is hidden (no animation frames come then)
 */

/**
 * The page's own clock (or Node's): Date.now, setTimeout, requestAnimationFrame, Math.random and the document's visibility.
 * @param {{document: Object}} [o] the document whose visibility counts (default the page's)
 * @returns {Clock}
 */
export function systemClock(o) {
  const g = globalThis;
  const doc = (o && o.document) || (typeof document !== 'undefined' ? document : null);
  const raf = typeof g.requestAnimationFrame === 'function';
  return {
    now: () => Date.now(),
    setTimeout: (f, ms) => g.setTimeout(f, ms),
    clearTimeout: (t) => g.clearTimeout(t),
    requestFrame: (f) => (raf ? g.requestAnimationFrame(f) : { t: g.setTimeout(f, 16) }),
    cancelFrame: (h) => { if (h && typeof h === 'object' && 't' in h) { g.clearTimeout(h.t); } else if (raf && h != null) { g.cancelAnimationFrame(h); } },
    random: () => Math.random(),
    hidden: () => !!(doc && doc.visibilityState === 'hidden')
  };
}

/**
 * A seeded random function (mulberry32): the same seed, the same numbers.
 * @param {number} seed
 * @returns {function(): number}
 */
export function seededRandom(seed) {
  let a = (Number(seed) || 0) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A clock a test moves by hand.
 * @typedef {Object} TestClock
 * @property {function(): number} now
 * @property {function(Function, number): number} setTimeout
 * @property {function(*): void} clearTimeout
 * @property {function(Function): number} requestFrame
 * @property {function(*): void} cancelFrame
 * @property {function(): number} random seeded
 * @property {function(): boolean} hidden
 * @property {function(number): number} tick moves time on by ms, running every timer that falls due (in time order, timers set on the
 *   way included); answers how many ran
 * @property {function(): number} frame runs the animation frames asked for so far (time does not move); answers how many ran
 * @property {function(number): number} runAll runs timers until none is left (at most `limit`, default 100,000, so a timer that sets
 *   itself again cannot hang a test); answers how many ran
 * @property {function(boolean): void} setHidden hides or shows the page (a hidden page gets no frames)
 * @property {function(): number} pending how many timers wait
 */

/**
 * A clock for tests: time moves only when the test says.
 * @param {{seed: number, start: number}} [o] seed default 1; start: the clock's first time (default 1,794,000,000,000)
 * @returns {TestClock}
 */
export function testClock(o) {
  const opts = Object.assign({ seed: 1, start: 1794000000000 }, o);
  let time = opts.start, nextId = 1, hidden = false;
  const timers = new Map(), frames = new Map();
  const due = () => {
    let best = null;
    timers.forEach((t, id) => { if (!best || t.at < best.at || (t.at === best.at && id < best.id)) { best = { id: id, at: t.at, f: t.f }; } });
    return best;
  };
  const clock = {
    now: () => time,
    setTimeout: (f, ms) => { const id = nextId++; timers.set(id, { at: time + Math.max(0, Number(ms) || 0), f: f }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    requestFrame: (f) => { const id = nextId++; frames.set(id, f); return id; },
    cancelFrame: (id) => { frames.delete(id); },
    random: seededRandom(opts.seed),
    hidden: () => hidden,
    setHidden: (b) => { hidden = !!b; },
    pending: () => timers.size,
    tick: (ms) => {
      const end = time + Math.max(0, Number(ms) || 0);
      let n = 0;
      for (;;) {
        const t = due();
        if (!t || t.at > end) { break; }
        timers.delete(t.id);
        time = Math.max(time, t.at);
        t.f();
        n++;
      }
      time = end;
      return n;
    },
    frame: () => {
      if (hidden) { return 0; }
      const run = Array.from(frames.values());
      frames.clear();
      run.forEach((f) => f(time));
      return run.length;
    },
    runAll: (limit) => {
      const max = limit || 100000;
      let n = 0;
      while (timers.size && n < max) {
        const t = due();
        timers.delete(t.id);
        time = Math.max(time, t.at);
        t.f();
        n++;
      }
      return n;
    }
  };
  return clock;
}
