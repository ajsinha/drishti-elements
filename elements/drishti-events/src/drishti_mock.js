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
/* MockTabs: several Events in one page (or one Node process) joined as if they were tabs: an in-memory BroadcastChannel, Web Locks and
   a SharedWorker for each "tab", so the tabs scope, the leader tab and the shared hub run (and are tested) without a browser. A tab
   can be closed (its channels close, its locks are released: the next tab leads). Delivery is asynchronous, as a browser's is: on the
   clock when one is given (clock.tick), else on the next microtask. */
import { serveSharedWorker } from './drishti_shared-hub.js';

/**
 * Tabs in one page.
 */
export class MockTabs {
  /**
   * @param {{clock: Object, worker: boolean}} [o] clock: delivery on its timers; worker: false leaves the SharedWorker out (the leader
   *   tab is then the hub)
   */
  constructor(o) {
    this.o = Object.assign({ worker: true }, o);
    /** @private */ this.channels = new Map();
    /** @private */ this.locks = new Map();
    /** @private */ this.workers = new Map();
    /** @type {number} how many frames crossed between tabs */
    this.posted = 0;
  }

  /** @private */
  _later(fn) {
    if (this.o.clock) { this.o.clock.setTimeout(fn, 0); } else { Promise.resolve().then(fn); }
  }

  /**
   * The environment of one more tab: give it to createEvents or connect as env.
   * @param {Object} [extra] more of the environment (a WebSocket stand-in, ...)
   * @returns {Object} env, with close() to close the tab
   */
  tab(extra) {
    const mock = this;
    const tab = { closed: false, channels: new Set(), ports: new Set() };
    class Channel {
      constructor(name) {
        this.name = String(name);
        this.onmessage = null;
        this.closed = false;
        this.tab = tab;
        tab.channels.add(this);
        if (!mock.channels.has(this.name)) { mock.channels.set(this.name, new Set()); }
        mock.channels.get(this.name).add(this);
      }
      postMessage(data) {
        if (this.closed) { throw new Error('InvalidStateError: the channel is closed'); }
        const copy = clone(data);
        mock.channels.get(this.name).forEach((c) => {
          if (c === this) { return; }
          mock.posted++;
          mock._later(() => { if (!c.closed && c.onmessage) { c.onmessage({ data: clone(copy) }); } });
        });
      }
      close() { this.closed = true; const set = mock.channels.get(this.name); if (set) { set.delete(this); } tab.channels.delete(this); }
    }
    const locks = { request: (name, a, b) => mock._lock(tab, String(name), typeof a === 'function' ? a : b) };
    const env = Object.assign({ BroadcastChannel: Channel, locks: locks, window: {} }, extra);
    if (this.o.worker) {
      env.SharedWorker = function SharedWorker(url, opts) {
        const name = (opts && opts.name) || String(url);
        const w = mock._worker(name);
        const pair = ports(mock);
        tab.ports.add(pair[0]);
        mock._later(() => w.scope.onconnect({ ports: [pair[1]] }));
        this.port = pair[0];
      };
    }
    env.close = () => mock.close(env);
    env._tab = tab;
    return env;
  }

  /** @private one in-memory SharedWorker per name */
  _worker(name) {
    let w = this.workers.get(name);
    if (!w) {
      const scope = { onconnect: null };
      w = { scope: scope, served: serveSharedWorker(scope, { clock: this.o.clock, env: this.o.workerEnv || {} }) };
      this.workers.set(name, w);
    }
    return w;
  }

  /**
   * The hub a mock SharedWorker holds (tests look inside), or null.
   * @param {string} [name] default the first worker
   * @returns {?Object}
   */
  workerHost(name) {
    const w = name ? this.workers.get(name) : this.workers.values().next().value;
    return w ? w.served.host() : null;
  }

  /** @private Web Locks: one holder per name, the rest wait in order */
  _lock(tab, name, fn) {
    let l = this.locks.get(name);
    if (!l) { l = { holder: null, queue: [] }; this.locks.set(name, l); }
    return new Promise((resolve, reject) => {
      l.queue.push({ tab: tab, fn: fn, resolve: resolve, reject: reject });
      this._grant(name);
    });
  }

  /** @private */
  _grant(name) {
    const l = this.locks.get(name);
    if (!l || l.holder) { return; }
    while (l.queue.length && l.queue[0].tab.closed) { l.queue.shift().reject(new Error('AbortError: the tab closed')); }
    const next = l.queue.shift();
    if (!next) { return; }
    l.holder = next;
    let out;
    try { out = Promise.resolve(next.fn({ name: name, mode: 'exclusive' })); } catch (e) { out = Promise.reject(e); }
    const free = () => { if (l.holder === next) { l.holder = null; this._later(() => this._grant(name)); } };
    next.free = free;
    out.then((v) => { free(); next.resolve(v); }, (e) => { free(); next.reject(e); });
  }

  /**
   * Closes a tab: its channels and ports close, its locks are released (the next tab waiting takes them).
   * @param {Object} env a tab's environment
   * @returns {void}
   */
  close(env) {
    const tab = env._tab;
    if (!tab || tab.closed) { return; }
    tab.closed = true;
    tab.channels.forEach((c) => c.close());
    tab.ports.forEach((p) => p.close());
    this.locks.forEach((l, name) => {
      if (l.holder && l.holder.tab === tab) { l.holder.free(); }
      l.queue = l.queue.filter((q) => q.tab !== tab);
      this._grant(name);
    });
  }
}

/** @private a pair of joined message ports */
function ports(mock) {
  const make = () => ({ onmessage: null, other: null, closed: false,
    postMessage(data) {
      if (this.closed || !this.other) { return; }
      const to = this.other, copy = clone(data);
      mock.posted++;
      mock._later(() => { if (!to.closed && to.onmessage) { to.onmessage({ data: copy }); } });
    },
    start() {},
    close() { this.closed = true; } });
  const a = make(), b = make();
  a.other = b; b.other = a;
  return [a, b];
}

/** @private a structured clone of plain data (what a browser's channel copies) */
function clone(v) { return v === undefined ? undefined : (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v))); }
