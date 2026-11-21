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
/* drishti-events' fixture harness (drishti_harness.html). ?mode=
     hub        the shared hub: connect(&feed=, raw JSON over Server-Sent Events, share: true, namespace &ns=); &worker=0 for the leader tab
                instead of the SharedWorker. window.__harness.got counts the feed's values, .mode() answers 'worker' or 'leader'.
     queue      the queue kept on disk (IndexedDB) across a reload, on the mock server; &offline=1 starts with the network off. .edit()
                publishes one edit (queue: 'persist'); .received lists what the server was given, in order.
     inspector  the inspector docked in the page, the status badge, a mock ticking prices; .drop() and .restore() cut and mend the line.
     ticker     2,000 keys at &rate= messages a second (default 10,000), conflated per key and delivered once a frame into a grid; .stats()
                answers the frame time's p95, the long tasks and the counts.
   Every value is made up. window.__harness is what tests/test_elements_events_browser.py drives. */
(function () {
  'use strict';
  const D = window.Drishti.elements, EV = D.events, M = D.events_mock, core = D.core;
  const q = new URLSearchParams(location.search);
  const mode = q.get('mode') || 'inspector';
  const stage = document.getElementById('hx-stage'), note = document.getElementById('hx-note'), badgeEl = document.getElementById('hx-badge');
  const H = window.__harness = { mode: mode, ready: false, error: null };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) { e.className = cls; } if (text !== undefined) { e.textContent = text; } return e; };
  const button = (text, action, fn) => { const b = el('button', 'hx-btn', text); b.type = 'button'; b.setAttribute('data-action', action); b.addEventListener('click', fn); return b; };

  /** Frame times by requestAnimationFrame and the long tasks the browser reports. */
  function frameMeter() {
    const times = [];
    let last = 0, on = true, longTasks = 0, obs = null;
    const step = (t) => { if (!on) { return; } if (last) { times.push(t - last); if (times.length > 600) { times.shift(); } } last = t; requestAnimationFrame(step); };
    requestAnimationFrame(step);
    try { obs = new PerformanceObserver((l) => { longTasks += l.getEntries().length; }); obs.observe({ type: 'longtask', buffered: false }); } catch (e) { obs = null; }
    return {
      p95: () => { if (times.length < 20) { return null; } const s = times.slice().sort((a, b) => a - b); return s[Math.floor(s.length * 0.95)]; },
      longTasks: () => longTasks,
      reset: () => { times.length = 0; last = 0; longTasks = 0; },
      stop: () => { on = false; if (obs) { obs.disconnect(); } }
    };
  }

  const modes = {
    hub() {
      const feed = q.get('feed');
      const o = { protocol: 'raw', transport: 'sse', share: true, namespace: q.get('ns') || 'harness' };
      if (q.get('worker') === '0') { o.worker = false; }
      const events = EV.connect(feed, o);
      const last = el('output', 'hx-last', '…');
      H.got = 0;
      H.values = [];
      events.subscribe('feed', (m) => { H.got++; H.values.push(m.data.n); if (H.values.length > 200) { H.values.shift(); } last.textContent = 'value ' + m.data.n; });
      H.events = events;
      H.mode = () => { const s = events.metrics().server; return s ? s.mode || null : null; };
      H.state = () => { const s = events.metrics().server; return s ? s.state : null; };
      stage.append(el('p', 'hx-line', 'One server connection for every tab of this namespace.'), last);
      return events;
    },

    queue() {
      const server = new M.MockServer({ address: null, heartbeatMs: 30000 });
      H.received = [];
      const publish = server.publish.bind(server);
      server.publish = (topic, data, o) => { if (o && o.source === 'client') { H.received.push(data.n); } return publish(topic, data, o); };
      if (q.get('offline') === '1') { server.partition(1e12); }
      const events = EV.connect(server, { bus: new core.EventBus(), namespace: q.get('ns') || 'harness-queue', outbox: { persist: true }, backoff: { baseMs: 150, maxMs: 600 } });
      let n = Number(q.get('from') || 0);
      H.edit = () => { n++; events.publish('notes.edit', { n: n, text: 'edit ' + n }, { queue: 'persist' }).catch(() => undefined); return n; };
      H.waiting = () => { const m = events.metrics(); return (m.outbox && m.outbox.count) || 0; };
      H.online = () => { server.partition(0); events.reconnect(); };
      H.server = server;
      H.events = events;
      stage.append(el('p', 'hx-line', 'Edits wait in the queue while the network is off, and survive a reload.'),
        button('Make an edit', 'edit', H.edit), button('Network on', 'online', H.online));
      return events;
    },

    inspector() {
      const server = new M.MockServer({ address: null, heartbeatMs: 30000 });
      const events = EV.connect(server, { bus: new core.EventBus(), recorder: { payloads: true }, backoff: { baseMs: 200, maxMs: 400 } });
      const SYMBOLS = ['USDCAD', 'EURUSD', 'GBPUSD', 'USDJPY'];
      let k = 0;
      H.stopTicks = server.every(150, () => { k++; server.publish('prices.fx.' + SYMBOLS[k % 4], { bid: 1 + (k % 50) / 100 }, { key: SYMBOLS[k % 4], stream: 'prices.fx' }); });
      events.subscribe('prices.fx.*', () => undefined);
      H.drop = () => server.partition(1e12);
      H.restore = () => { server.partition(0); events.reconnect(); };
      H.server = server;
      H.events = events;
      const dock = el('section', 'hx-dock');
      dock.id = 'hx-dock';
      stage.append(dock);
      H.inspector = null;
      return events.inspect(dock, { refreshMs: 200 }).then((i) => { H.inspector = i; return events; });
    },

    ticker() {
      const rate = Number(q.get('rate') || 10000), perTick = Math.max(1, Math.round(rate / 100));
      const server = new M.MockServer({ address: null, heartbeatMs: 30000 });
      const events = EV.connect(server, { bus: new core.EventBus() });
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const ids = [], state = new Map();
      for (let i = 0; i < 2000; i++) { const id = 'I' + String(i).padStart(4, '0'); ids.push(id); state.set(id, { BID: Math.round((10 + rnd() * 90) * 100) / 100, N: 0 }); }
      const g = document.createElement('drishti-grid');
      g.setAttribute('density', 'terminal');
      g.className = 'hx-grid';
      stage.append(g);
      g.options = { columns: [{ field: 'ID', header: 'Instrument', width: 100 }, { field: 'BID', header: 'Bid', type: 'number', format: 'number2' },
        { field: 'N', header: 'Updates', type: 'number' }], rows: ids.map((id) => ({ ID: id, BID: state.get(id).BID, N: 0 })), getRowId: (r) => r.ID,
      title: 'Ticker (made-up instruments)', checkboxes: false, live: { asyncWaitMs: 0, flashMs: 300 } };
      let sent = 0, arrived = 0;
      H.stopTicks = server.every(10, () => {
        for (let i = 0; i < perTick; i++) {
          const id = ids[Math.floor(rnd() * ids.length)], s = state.get(id);
          s.BID = Math.round((s.BID + (rnd() - 0.5) / 5) * 100) / 100;
          s.N++;
          server.publish('ticks.' + id, { type: 'transaction', update: [{ ID: id, BID: s.BID, N: s.N }] }, { key: id, stream: 'ticks', retain: false });
          sent++;
        }
      });
      const sub = events.subscribe('ticks.>', null, { conflate: true, deliver: 'frame' });
      events.on('ticks.>', () => { arrived++; });
      const pipe = sub.toGrid(g.grid, { getRowId: (r) => r.ID });
      const meter = frameMeter();
      H.meter = meter;
      H.stats = () => ({ sent: sent, arrived: arrived, applied: pipe.sink.stats.applied, p95: meter.p95(), longTasks: meter.longTasks(), drops: events.metrics().drops || {} });
      H.events = events;
      return sub.ready.then(() => events);
    }
  };

  try {
    if (!modes[mode]) { throw new Error('no such mode: ' + mode); }
    note.textContent = 'mode: ' + mode;
    Promise.resolve(modes[mode]()).then((events) => {
      H.stopBadge = EV.statusBadge(badgeEl, events);
      H.badge = () => badgeEl.textContent.trim();
      H.ready = true;
    }).catch((e) => { H.error = String(e && e.stack || e); });
  } catch (e) {
    H.error = String(e && e.stack || e);
  }
}());
