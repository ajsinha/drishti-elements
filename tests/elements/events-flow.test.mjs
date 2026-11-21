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
/* drishti-events under Node, step 5 (flow): conflation by key with merge, bounded buffers and their four overflow rules, delivery now,
   per animation frame and at most every everyMs (lists when batched), a hidden page delivering on a one-second timer and still
   conflating, the grid sink (one batch in flight, transactions folded the grid's way, every row replaced, notices after the rows), the
   page's life (pagehide, pageshow, freeze, resume, idleCloseMs), publishing paused while a socket is full, and conflation asked of the
   server. On the test clock. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../elements/drishti-events/src/drishti_index.js';
import * as G from '../../elements/drishti-grid/src/drishti_index.js';
import { EventBus } from '../../elements/drishti-core/src/drishti_index.js';

const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));
const flush = async () => { for (let i = 0; i < 3; i++) { await new Promise((r) => setImmediate(r)); } };
const fresh = (o) => E.createEvents(Object.assign({ bus: new EventBus(), clock: E.testClock() }, o));

class FakeWS extends EventTarget {
  constructor(url, protocols) { super(); this.url = url; this.sent = []; this.bufferedAmount = 0; FakeWS.all.push(this); }
  send(t) { this.sent.push(JSON.parse(t)); }
  close(code) { this.closedWith = code || 1000; }
  open() { this.dispatchEvent(new Event('open')); }
  recv(x) { this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(x) })); }
  frames(t) { return this.sent.flat().filter((f) => !t || f.t === t); }
  static last() { return FakeWS.all[FakeWS.all.length - 1]; }
}
FakeWS.all = [];
const WELCOME = { t: 'welcome', v: 1, session: 's-1', heartbeatMs: 1000000, can: ['publish', 'conflate'], resumed: false };

test('the conflater: the latest per key in arrival order, merge, a field of the message or its data or a function, the overflow rules', () => {
  const dropped = [];
  const c = new E.Conflater({ onDrop: (m, why) => dropped.push(m.n + ':' + why) });
  [{ key: 'A', n: 1 }, { key: 'B', n: 2 }, { key: 'A', n: 3 }, { n: 4 }, { n: 5 }].forEach((m) => c.push(m));
  assert.deepEqual(c.take().map((m) => m.n), [3, 2, 4, 5]);
  assert.deepEqual(dropped, ['1:conflated']);
  const bySymbol = new E.Conflater({ key: 'symbol', merge: (a, b) => ({ data: { symbol: b.data.symbol, hi: Math.max(a.data.hi, b.data.hi) } }) });
  bySymbol.push({ data: { symbol: 'CAD', hi: 3 } });
  bySymbol.push({ data: { symbol: 'CAD', hi: 1 } });
  assert.deepEqual(bySymbol.take(), [{ data: { symbol: 'CAD', hi: 3 } }]);
  const byFn = new E.Conflater({ key: (m) => m.topic.split('.')[1] });
  byFn.push({ topic: 'p.x', n: 1 }); byFn.push({ topic: 'p.x', n: 2 }); byFn.push({ topic: 'p.y', n: 3 });
  assert.deepEqual(byFn.take().map((m) => m.n), [2, 3]);
  for (const [rule, want, accepted] of [['conflate', [2, 3, 4], true], ['drop-oldest', [2, 3, 4], true], ['drop-newest', [1, 2, 3], false], ['error', [1, 2, 3], false]]) {
    const why = [];
    const b = new E.Conflater({ max: 3, overflow: rule, onDrop: (m, w) => why.push(m.n + ':' + w) });
    [1, 2, 3].forEach((n) => b.push({ n: n }));
    assert.equal(b.push({ n: 4 }), accepted, rule);
    assert.deepEqual(b.take().map((m) => m.n), want, rule);
    assert.deepEqual(why, [(accepted ? 1 : 4) + ':overflow'], rule);
  }
  const k = new E.Conflater({ max: 2 });
  k.push({ key: 'A', n: 1 }); k.push({ key: 'B', n: 2 }); k.push({ key: 'A', n: 3 });     // full, but A is held: it is replaced
  assert.deepEqual(k.take().map((m) => m.n), [3, 2]);
  assert.throws(() => new E.Conflater({ overflow: 'sideways' }), /overflow rule/);
});

test('delivery per animation frame: 10,000 ticks over 50 keys arrive as the last of each key, once per frame; batched as one list', async () => {
  const ev = fresh();
  const got = [], lists = [];
  const s = ev.subscribe('prices.>', (m) => got.push(m), { conflate: true, deliver: 'frame' });
  ev.subscribe('prices.>', (l) => lists.push(l.length), { conflate: { key: 'symbol' }, deliver: 'frame', batch: true });
  for (let i = 0; i < 10000; i++) { ev.publish('prices.fx', { symbol: 'S' + (i % 50), px: i }, { key: 'S' + (i % 50) }); }
  assert.equal(got.length, 0);
  assert.equal(s.undelivered, 50);
  assert.equal(ev.clock.frame(), 2);
  assert.equal(got.length, 50);
  assert.equal(got.find((m) => m.key === 'S7').data.px, 9957);
  assert.deepEqual(lists, [50]);
  assert.equal(s.stats.drops.conflated, 9950);
  assert.equal(ev.clock.frame(), 0);                              // nothing held: no frame asked
  ev.publish('prices.fx', { symbol: 'S1', px: -1 }, { key: 'S1' });
  ev.clock.tick(1000);                                             // the frame never came: the one-second timer delivers
  assert.equal(got.length, 51);
});

test('a hidden page has no frames: delivery once a second, still conflating; at most every everyMs; now with batch is a list of one', () => {
  const ev = fresh();
  ev.clock.setHidden(true);
  const got = [];
  ev.subscribe('t.>', (m) => got.push(m.data), { conflate: true, deliver: 'frame' });
  for (let i = 0; i < 100; i++) { ev.publish('t.a', i, { key: 'k' }); }
  assert.equal(ev.clock.frame(), 0);
  ev.clock.tick(999);
  assert.deepEqual(got, []);
  ev.clock.tick(1);
  assert.deepEqual(got, [99]);
  ev.clock.setHidden(false);
  const every = [];
  ev.subscribe('e.>', (l) => every.push(l.map((m) => m.data)), { deliver: { everyMs: 100 }, batch: true });
  ev.publish('e.a', 1); ev.publish('e.a', 2);
  ev.clock.tick(0);
  assert.deepEqual(every, [[1, 2]]);
  ev.publish('e.a', 3);
  ev.clock.tick(99);
  assert.deepEqual(every, [[1, 2]]);
  ev.clock.tick(1);
  assert.deepEqual(every, [[1, 2], [3]]);
  const one = [];
  ev.subscribe('o.>', (l) => one.push(l), { batch: true });
  ev.publish('o.a', 1);
  assert.equal(one[0].length, 1);
  assert.throws(() => ev.subscribe('x.>', null, { deliver: 'sometimes' }), /deliver is/);
});

test('bounded buffers: drop-oldest, drop-newest and error count every drop with its reason; error also says so on $events.error', () => {
  const ev = fresh();
  const drops = [], errors = [];
  ev.on('$events.drop', (m) => drops.push(m.data.reason + ':' + m.data.detail));
  ev.on('$events.error', (m) => errors.push(m.data.code));
  const got = [];
  const a = ev.subscribe('q.>', (m) => got.push(m.data), { deliver: 'frame', buffer: { max: 3, overflow: 'drop-oldest' } });
  const b = ev.subscribe('q.>', null, { deliver: 'frame', buffer: { max: 3, overflow: 'error' } });
  for (let i = 1; i <= 5; i++) { ev.publish('q.x', i); }
  ev.clock.frame();
  assert.deepEqual(got, [3, 4, 5]);
  assert.equal(a.stats.drops.overflow, 2);
  assert.equal(b.stats.drops.overflow, 2);
  assert.ok(drops.some((d) => /^overflow:Dropped: the buffer was full \(3\), rule drop-oldest/.test(d)));
  assert.deepEqual(errors, ['limit.buffer', 'limit.buffer']);
  assert.equal(ev.metrics().counters.drops.overflow, 4);
});

test('the grid sink: one batch in the grid at a time, the rest folded by row id; adds, updates and removes fold right; rows replace', async () => {
  const applied = [];
  let release = null;
  const target = { applyTransactionAsync: (tx) => { applied.push(JSON.parse(JSON.stringify(tx))); return new Promise((r) => { release = r; }); }, setRows: (rows) => applied.push({ rows: rows.length }), dataChanged: (n) => applied.push({ notice: n.purge }) };
  const sink = new E.GridSink(target, { getRowId: (r) => r.id });
  sink.push({ type: 'transaction', update: [{ id: 'A', v: 1 }] });
  assert.equal(applied.length, 1);
  for (let i = 2; i <= 1000; i++) { sink.push({ type: 'transaction', update: [{ id: 'A', v: i }, { id: 'B', v: i }] }); }
  sink.push({ type: 'transaction', add: [{ id: 'C', v: 1 }] });
  sink.push({ type: 'transaction', remove: ['C'] });                          // added and removed while waiting: nothing
  sink.push({ type: 'transaction', remove: ['B'] });                          // updated then removed: a remove
  sink.push({ type: 'dataChanged', purge: true });
  assert.equal(applied.length, 1);                                            // the grid is still busy
  release();
  await tick(5);
  assert.deepEqual(applied[1], { add: [], update: [{ id: 'A', v: 1000 }], remove: ['B'] });
  release();
  await tick(5);
  assert.deepEqual(applied[2], { notice: true });                             // the notice after the rows
  assert.equal(sink.stats.received, 2002);
  assert.ok(sink.stats.coalesced >= 1998);
  assert.equal(sink.stats.batches, 2);
  sink.push({ type: 'rows', rows: [{ id: 'Z' }] });
  assert.deepEqual(applied[3], { rows: 1 });
  assert.throws(() => new E.GridSink({}), /applyTransactionAsync/);
});

test('subscription.toGrid into a real grid model: a burst of ticks arrives as the last value of each row, in few batches', async () => {
  const g = G.createGridModel({ columns: [{ field: 'id' }, { field: 'px', type: 'number' }], rows: [{ id: 'A', px: 0 }, { id: 'B', px: 0 }], live: { asyncWaitMs: 2 } });
  const ev = fresh();
  const stats = [];
  const link = ev.subscribe('rows.>').toGrid(g, { getRowId: (r) => r.id, onStats: (s) => stats.push(s.batches) });
  for (let i = 1; i <= 5000; i++) { ev.publish('rows.a', { type: 'transaction', update: [{ id: i % 2 ? 'A' : 'B', px: i }] }); }
  await link.sink.drained();
  assert.equal(g.rowModel.getRowById('A').px, 4999);
  assert.equal(g.rowModel.getRowById('B').px, 5000);
  assert.ok(link.sink.stats.batches <= 3, 'batches ' + link.sink.stats.batches);
  assert.ok(stats.length >= 1);
  link.stop();
  ev.publish('rows.a', { type: 'transaction', update: [{ id: 'A', px: -1 }] });
  await tick(10);
  assert.equal(g.rowModel.getRowById('A').px, 4999);
});

async function socket(o) {
  FakeWS.all = [];
  const win = new EventTarget(), doc = new EventTarget();
  doc.visibilityState = 'visible';
  const clock = E.testClock();
  const states = [];
  const ev = E.connect('wss://example.org/events', Object.assign({ bus: new EventBus(), clock: clock, env: { WebSocket: FakeWS, window: win, document: doc } }, o));
  ev.on('$events.state', (m) => states.push(m.data.state + (m.data.suspended ? '(suspended)' : '')));
  await flush();
  FakeWS.last().open();
  FakeWS.last().recv(WELCOME);
  return { ev: ev, clock: clock, win: win, doc: doc, states: states };
}

test('the page\'s life: put away (pagehide, freeze) the connection says bye and closes; shown again (pageshow, resume) it opens and resumes', async () => {
  const { ev, win, doc, states } = await socket();
  ev.subscribe('a.>');
  const first = FakeWS.last();
  win.dispatchEvent(new Event('pagehide'));
  assert.equal(ev.state, 'closed');
  assert.equal(first.frames('bye').length, 1);
  assert.equal(first.closedWith, 1000);
  const p = ev.publish('chat.x', 1);                              // waits for the page to come back
  win.dispatchEvent(new Event('pageshow'));
  assert.equal(ev.state, 'connecting');
  FakeWS.last().open();
  FakeWS.last().recv(WELCOME);
  assert.deepEqual(FakeWS.last().frames('sub').map((f) => f.topic), ['a.>']);
  const pub = FakeWS.last().frames('pub')[0];
  FakeWS.last().recv({ t: 'ok', id: pub.id });
  assert.equal((await p).acked, true);
  doc.dispatchEvent(new Event('freeze'));
  assert.equal(ev.state, 'closed');
  doc.dispatchEvent(new Event('resume'));
  assert.equal(ev.state, 'connecting');
  assert.deepEqual(states, ['connecting', 'open', 'closed(suspended)', 'connecting', 'open', 'closed(suspended)', 'connecting']);
  ev.close();
  win.dispatchEvent(new Event('pageshow'));
  assert.equal(ev.state, 'closed');                               // closed on purpose: showing the page does not open it
  ev.destroy();
});

test('idleCloseMs: a page hidden longer gives its connection back and takes it again when shown; a short hide changes nothing', async () => {
  const { ev, clock, doc } = await socket({ idleCloseMs: 60000 });
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  clock.tick(30000);
  doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  clock.tick(60000);
  assert.equal(ev.state, 'open');
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  clock.tick(60000);
  assert.equal(ev.state, 'closed');
  doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(ev.state, 'connecting');
  ev.destroy();
});

test('publishing pauses while the socket holds more than 1 MB unsent, in order, and goes on when it has room', async () => {
  const { ev, clock } = await socket();
  const ws = FakeWS.last();
  ws.bufferedAmount = 2 * 1048576;
  ev.publish('chat.x', 1).catch(() => undefined);
  ev.publish('chat.x', 2).catch(() => undefined);
  await flush();
  assert.equal(ws.frames('pub').length, 0);
  clock.tick(50);
  assert.equal(ws.frames('pub').length, 0);
  ws.bufferedAmount = 0;
  ev.publish('chat.x', 3).catch(() => undefined);
  clock.tick(50);
  assert.deepEqual(ws.frames('pub').map((f) => f.data), [1, 2, 3]);
  ev.destroy();
});

test('conflation asked of the server where its welcome offers it: the sub frame carries conflate with the delivery\'s pace', async () => {
  const { ev } = await socket();
  ev.subscribe('prices.>', null, { conflate: { server: true }, deliver: { everyMs: 50 } });
  ev.subscribe('rates.>', null, { conflate: true });
  assert.deepEqual(FakeWS.last().frames('sub'), [{ t: 'sub', id: 1, topic: 'prices.>', conflate: { key: true, everyMs: 50 } }, { t: 'sub', id: 2, topic: 'rates.>' }]);
  ev.destroy();
});
