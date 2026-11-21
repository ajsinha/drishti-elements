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
/* drishti-events under Node, step 9 (observability): metrics in groups (connection, in, out, drops, stores) with histograms and rates,
   $events.metrics once a second only while someone listens, onMetrics; the recorder (bounded, headers only by default); explain's
   answers for each step that can fail; the status badge's words for each state. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../elements/drishti-events/src/drishti_index.js';
import { MockServer } from '../../elements/drishti-events/src/drishti_mock.js';
import { EventBus } from '../../elements/drishti-core/src/drishti_index.js';

const flush = async (n) => { for (let i = 0; i < (n || 10); i++) { await new Promise((r) => setImmediate(r)); } };

async function setup(o) {
  const clock = E.testClock({ seed: 4 });
  const server = new MockServer({ clock: clock, address: null });
  const ev = E.connect(server, Object.assign({ bus: new EventBus(), clock: clock, env: { window: {} } }, o));
  await flush();
  return { clock, server, ev };
}

test('Histogram and Rate: log buckets give p50 and p99; rates over one and ten seconds', () => {
  const h = new E.Histogram();
  assert.equal(h.quantile(0.5), null);
  for (let i = 1; i <= 100; i++) { h.add(i); }
  const s = h.summary();
  assert.equal(s.count, 100);
  assert.ok(s.p50 >= 50 && s.p50 <= 82, s.p50);
  assert.equal(s.max, 100);
  assert.ok(s.p99 <= 100);
  const clock = E.testClock({ start: 1000000 });
  const r = new E.Rate(clock);
  r.add(5); clock.tick(1000); r.add(3); clock.tick(1000);
  const x = r.summary();
  assert.equal(x.total, 8);
  assert.equal(x.perSecond1s, 3);
});

test('metrics(): the groups of the design, counted from a real exchange with the mock', async () => {
  const { server, ev } = await setup();
  server.reply('q', () => 1);
  await ev.subscribe('p.>', () => {}).ready;
  for (let i = 0; i < 5; i++) { server.publish('p.x', i); }
  await flush();
  await ev.publish('chat.x', 1);
  await ev.request('q', null);
  await assert.rejects(ev.request('none', null));
  const m = ev.metrics();
  assert.equal(m.connection.state, 'open');
  assert.equal(m.connection.connects, 1);
  assert.equal(m.in.total, 5);
  assert.equal(m.in.byPattern['p.>'], 5);
  assert.ok(m.in.latency.count >= 5);
  assert.ok(m.in.bytes > 0);
  assert.equal(m.out.publishes, 1);
  assert.equal(m.out.acked, 1);
  assert.deepEqual(m.out.requests, { sent: 2, answered: 1, timedOut: 0 });
  assert.equal(m.stores.pendingRequests, 0);
  assert.equal(m.stores.recorder.max, 5000);
  assert.ok(m.stores.recorder.headers >= 6);
  assert.equal(typeof m.in.listenerMs.p99, 'number');
  ev.destroy();
});

test('$events.metrics once a second only while someone listens; onMetrics is told each second', async () => {
  const clock = E.testClock();
  const seen = [];
  const ev = E.createEvents({ bus: new EventBus(), clock: clock, onMetrics: (m) => seen.push(m.subscriptions) });
  clock.tick(3000);
  assert.equal(seen.length, 3);
  const heard = [];
  const off = ev.on('$events.metrics', (m) => heard.push(m.data.in.total));
  clock.tick(2000);
  assert.equal(heard.length, 2);
  off();
  clock.tick(2000);
  assert.equal(heard.length, 2);
  ev.destroy();
  const quiet = E.createEvents({ bus: new EventBus(), clock: clock });
  clock.tick(5000);
  assert.equal(clock.pending(), 0);                                  // nobody listens: no timer
  quiet.destroy();
});

test('the recorder: bounded, headers only unless payloads are asked for, off with recorder: false', async () => {
  const clock = E.testClock();
  const ev = E.createEvents({ bus: new EventBus(), clock: clock, recorder: { max: 3 } });
  for (let i = 0; i < 5; i++) { await ev.publish('a.b', { secret: i }); }
  assert.equal(ev.recorder.list.length, 3);
  assert.equal(ev.recorder.list[0].data, undefined);
  const withData = E.createEvents({ bus: new EventBus(), clock: clock, recorder: { payloads: true } });
  await withData.publish('a.b', 7);
  assert.equal(withData.recorder.find({ topic: 'a.b', dir: 'in' })[0].data, 7);
  const off = E.createEvents({ bus: new EventBus(), clock: clock, recorder: false });
  await off.publish('a.b', 1);
  assert.equal(off.recorder.list.length, 0);
  [ev, withData, off].forEach((x) => x.destroy());
});

test('explain: no subscription (the nearest named), refused, delivered with its listeners and delay', async () => {
  const { clock, server, ev } = await setup();
  await ev.subscribe('prices.eq.*', () => {}).ready;
  let r = ev.explain({ topic: 'prices.fx.USDCAD' });
  assert.equal(r.failed.label, 'A listener matched');
  assert.match(r.value, /No subscription matches `prices.fx.USDCAD`. The nearest is `prices.eq.\*`./);
  server.refuse('subscribe', 'secret.>');
  const s = ev.subscribe('secret.>');
  await assert.rejects(s.ready);
  r = ev.explain({ topic: 'secret.x' });
  assert.equal(r.failed.label, 'The subscription was active');
  assert.match(r.value, /`secret.>` was refused at \d\d:\d\d:\d\d\.\d{3}: forbidden/);
  ev.subscribe('prices.fx.*', () => {});
  ev.subscribe('prices.>', () => {});
  await flush();
  clock.tick(14);
  server.publish('prices.fx.USDCAD', { bid: 1 }, { time: clock.now() - 14 });
  await flush();
  r = ev.explain({ topic: 'prices.fx.USDCAD' });
  assert.equal(r.failed, null);
  assert.match(r.value, /^Delivered at \d\d:\d\d:\d\d\.\d{3} to 2 listeners, 14 ms after it was published\.$/);
  assert.deepEqual(r.steps.map((x) => x.ok), [true, true, true, true, true, true, true, true]);
  ev.destroy();
});

test('explain: nothing arrived (a gap said why), dropped as invalid, conflated by a later message, the listener threw', async () => {
  const { server, ev } = await setup();
  await ev.subscribe('t', () => {}).ready;
  server.publish('t', 1);
  server.lose(3);
  server.publish('t', 2); server.publish('t', 3); server.publish('t', 4);
  await flush();
  let r = ev.explain({ topic: 't', id: 'nothing-like-it' });
  assert.equal(r.failed.label, 'The message arrived');
  r = ev.explain({ topic: 'z.z' });
  assert.equal(r.failed.label, 'A listener matched');
  ev.define('tick', E.shape({ bid: 'number' }));
  await ev.subscribe('v.>', () => {}).ready;
  server.publish('v.a', { bid: 'x' }, { kind: 'tick' });
  await flush();
  r = ev.explain({ topic: 'v.a' });
  assert.equal(r.failed.label, 'It was valid');
  assert.match(r.value, /Dropped as invalid: .*bid/);
  const clock2 = E.testClock();
  const page = E.createEvents({ bus: new EventBus(), clock: clock2 });
  page.subscribe('k.>', () => {}, { conflate: true, deliver: { everyMs: 100 } });
  await page.publish('k.a', 1, { key: 'A' });                       // 1 is replaced by 2 before the delivery
  await page.publish('k.a', 2, { key: 'A' });
  clock2.tick(8);
  await page.publish('k.a', 3, { key: 'A' });
  clock2.tick(200);
  const first = page.recorder.find({ topic: 'k.a', dir: 'in' })[0];
  r = page.explain({ topic: 'k.a', id: first.id });
  assert.equal(r.failed.label, 'It was kept');
  assert.match(r.value, /^Conflated: replaced by a later message with the same key 0 ms later\.$/);
  page.subscribe('boom', () => { throw new TypeError('x is not a function'); });
  page.on('$events.error', () => {});
  await page.publish('boom', 1);
  r = page.explain({ topic: 'boom' });
  assert.equal(r.failed.label, 'The listener ran');
  assert.match(r.value, /The listener threw: x is not a function/);
  page.destroy();
  ev.destroy();
});

test('explain: the connection was down, and nothing arrived since', async () => {
  const { clock, server, ev } = await setup();
  await ev.subscribe('w', () => {}).ready;
  const since = clock.now();
  server.partition(10000);
  await flush();
  const r = ev.explain({ topic: 'w', since: since });
  assert.equal(r.failed.label, 'The connection was open');
  assert.match(r.steps.find((x) => x.label === 'The connection was open').value, /The connection was reconnecting from \d\d:\d\d:\d\d\.\d{3} until now/);
  assert.match(r.steps.find((x) => x.label === 'The message arrived').value, /Nothing on `w` arrived since/);
  ev.destroy();
});

test('the status badge\'s words: live, connecting, reconnecting in n s, offline with changes waiting, refused, paused, missed updates, page only', () => {
  const V = (st, f) => E.badgeView(st, Object.assign({ missed: 0, waiting: 0, now: 10000, server: true }, f));
  assert.deepEqual(V({ state: 'open' }), { kind: 'empty', text: 'Live', detail: null, fix: null, tone: 'good' });
  assert.equal(V({ state: 'connecting' }).text, 'Connecting');
  const re = V({ state: 'reconnecting', at: 7000, waitMs: 6200, reason: 'the connection dropped' });
  assert.equal(re.text, 'Reconnecting in 4 s');
  assert.equal(re.fix, 'reconnect');
  assert.equal(V({ state: 'offline' }, { waiting: 3 }).text, 'Offline: 3 changes waiting');
  assert.equal(V({ state: 'offline' }, { waiting: 1 }).text, 'Offline: 1 change waiting');
  assert.deepEqual([V({ state: 'refused', reason: 'forbidden' }).kind, V({ state: 'refused', reason: 'forbidden' }).detail], ['error', 'forbidden']);
  assert.equal(V({ state: 'closed', suspended: true }).text, 'Paused');
  const missed = V({ state: 'open' }, { missed: 12 });
  assert.deepEqual([missed.text, missed.fix], ['Missed 12 updates', 'refresh']);
  assert.equal(V({ state: 'idle' }, { server: false }).text, 'This page only');
});
