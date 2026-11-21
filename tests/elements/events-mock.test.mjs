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
/* drishti-events under Node, step 8 (the mock server): the real client against MockServer (connect(server), connect('mock:')), its
   requests, publishes and retained values, and each fault on purpose (lose, duplicate, reorder, slow, drop, partition, restart, refuse)
   with what the client makes of it; the conformance vectors pass against the mock. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../../elements/drishti-events/src/drishti_index.js';
import { MockServer } from '../../elements/drishti-events/src/drishti_mock.js';
import { runVectors, mockClient, frameMatches } from '../../tools/events/conformance.mjs';
import { EventBus } from '../../elements/drishti-core/src/drishti_index.js';

const flush = async (n) => { for (let i = 0; i < (n || 10); i++) { await new Promise((r) => setImmediate(r)); } };

async function setup(o) {
  const clock = E.testClock({ seed: 4 });
  const server = new MockServer(Object.assign({ clock: clock, address: null }, o && o.server));
  const ev = E.connect(server, Object.assign({ bus: new EventBus(), clock: clock, env: { window: {} } }, o && o.client));
  await flush();
  return { clock, server, ev };
}

test('the real client against the mock: subscribe, server publishes, request and reply, a publish acknowledged and heard', async () => {
  const { server, ev } = await setup();
  assert.equal(ev.state, 'open');
  server.reply('quotes.get', (m) => ({ symbol: m.data.symbol, bid: 1.3612 }));
  const got = [];
  const s = ev.subscribe('prices.fx.*', (m) => got.push(m.data.bid + '@' + m.seq));
  await s.ready;
  server.publish('prices.fx.USDCAD', { bid: 1.36 }, { key: 'USDCAD', stream: 'prices.fx' });
  server.publish('prices.fx.EURCAD', { bid: 1.49 }, { key: 'EURCAD', stream: 'prices.fx' });
  await flush();
  assert.deepEqual(got, ['1.36@1', '1.49@2']);
  const q = await ev.request('quotes.get', { symbol: 'CAD' }, { timeoutMs: 1000 });
  assert.deepEqual(q.data, { symbol: 'CAD', bid: 1.3612 });
  await assert.rejects(ev.request('nobody.here', {}), (e) => e.code === 'no.responder');
  const heard = [];
  ev.on('chat.>', (m) => heard.push(m.data.text));
  const r = await ev.publish('chat.lobby', { text: 'hello' });
  assert.equal(r.acked, true);
  await flush();
  assert.deepEqual(heard, ['hello']);
  assert.equal(server.connections, 1);
  ev.destroy();
});

test('connect(\'mock:\') finds the registered server, and says so in words when none is', async () => {
  assert.throws(() => E.connect('mock:nothing-here', { bus: new EventBus() }), (e) => e.code === 'mock.missing' && /drishti_events-mock\.js/.test(e.detail));
  const clock = E.testClock();
  const server = new MockServer({ clock: clock, address: 'mock:demo' });
  const ev = E.connect('mock:demo', { bus: new EventBus(), clock: clock, env: { window: {} } });
  await flush();
  assert.equal(ev.state, 'open');
  ev.destroy();
  server.close();
  assert.throws(() => E.connect('mock:demo', { bus: new EventBus() }), /no mock server/);
});

test('retained values for a late subscriber; lose(n) is a gap the client fills by replay, in order', async () => {
  const { server, ev } = await setup();
  server.publish('book.a', 1, { key: 'a' });
  server.publish('book.b', 2, { key: 'b' });
  const kept = [];
  await ev.subscribe('book.>', (m) => kept.push(m.data + (m.retained ? 'r' : '')), { retained: true }).ready;
  await flush();
  assert.deepEqual(kept, ['1r', '2r']);
  const got = [];
  await ev.subscribe('ticks', (m) => got.push(m.seq)).ready;
  server.publish('ticks', 1);
  server.lose(2);
  server.publish('ticks', 2); server.publish('ticks', 3);
  server.publish('ticks', 4);
  await flush(20);
  assert.deepEqual(got, [1, 2, 3, 4]);                               // 4 was held, 2 and 3 replayed, then all in order
  assert.equal(server.stats.lost, 2);
  ev.destroy();
});

test('duplicate(n) and reorder(n): the client delivers each once and in order', async () => {
  const { server, ev } = await setup();
  const got = [];
  await ev.subscribe('ticks', (m) => got.push(m.seq)).ready;
  server.duplicate(2);
  server.publish('ticks', 1); server.publish('ticks', 2); server.publish('ticks', 3);
  server.reorder(3);
  server.publish('ticks', 4); server.publish('ticks', 5); server.publish('ticks', 6);
  await flush(20);
  assert.deepEqual(got, [1, 2, 3, 4, 5, 6]);
  ev.destroy();
});

test('slow(n): the server says gap (recoverable) and the client replays what it missed', async () => {
  const { server, ev } = await setup();
  const got = [];
  await ev.subscribe('ticks', (m) => got.push(m.seq)).ready;
  server.publish('ticks', 1);
  server.slow(3);
  server.publish('ticks', 2); server.publish('ticks', 3); server.publish('ticks', 4);
  server.publish('ticks', 5);
  await flush(20);
  assert.deepEqual(got, [1, 2, 3, 4, 5]);
  ev.destroy();
});

test('drop() and partition(ms): the client reconnects after its back-off and resumes; what was missed arrives once', async () => {
  const { clock, server, ev } = await setup();
  const states = [];
  ev.on('$events.state', (m) => states.push(m.data.state));
  const got = [];
  await ev.subscribe('ticks', (m) => got.push(m.data)).ready;
  server.publish('ticks', 1);
  await flush();
  server.partition(5000);
  await flush();
  server.publish('ticks', 2);                                        // while the client is away
  clock.tick(3000);                                                  // a retry inside the partition is refused
  await flush();
  clock.tick(30000);
  await flush(20);
  assert.equal(ev.state, 'open');
  assert.deepEqual(got, [1, 2]);
  assert.ok(states.indexOf('reconnecting') >= 0);
  ev.destroy();
});

test('restart(): a new epoch; the client reconnects, its subscription resyncs, and numbering starts again', async () => {
  const { clock, server, ev } = await setup();
  const got = [];
  await ev.subscribe('ticks', (m) => got.push(m.kind === 'resync' ? 'resync' : m.seq)).ready;
  server.publish('ticks', 1); server.publish('ticks', 2);
  await flush();
  server.restart();
  await flush();
  clock.tick(30000);
  await flush(20);
  assert.equal(ev.state, 'open');
  server.publish('ticks', 'x');
  await flush();
  assert.equal(got[got.length - 1], 1);                              // the new epoch's first message
  assert.equal(server.epoch, 'e2');
  ev.destroy();
});

test('refuse(): auth (asked once more, then refused), forbidden (stops), a subscription refused, a read-only server', async () => {
  const asked = [];
  const { clock, server, ev } = await setup({ client: { auth: (a) => { asked.push(a.reason); return Promise.resolve({ token: 't' }); } } });
  server.refuse('subscribe', 'secret.>');
  const s = ev.subscribe('secret.>');
  await assert.rejects(s.ready, /forbidden/);
  server.refuse('publish');
  await assert.rejects(ev.publish('chat.x', 1), (e) => e.code === 'forbidden');
  server.refuse(null);
  server.refuse('auth');
  await flush();
  clock.tick(30000);
  await flush(20);
  assert.equal(ev.state, 'refused');
  assert.deepEqual(asked.slice(0, 2), ['connect', 'refused']);
  ev.destroy();
  const s2 = new MockServer({ clock: clock, address: null });
  s2.refuse('forbidden');
  const ev2 = E.connect(s2, { bus: new EventBus(), clock: clock, env: { window: {} } });
  await flush();
  assert.equal(ev2.state, 'refused');
  ev2.destroy();
});

test('every() ticks on the server\'s clock; close() stops it', async () => {
  const { clock, server, ev } = await setup();
  const got = [];
  await ev.subscribe('t', (m) => got.push(m.data)).ready;
  let n = 0;
  server.every(100, () => server.publish('t', ++n));
  clock.tick(350);
  await flush();
  assert.deepEqual(got, [1, 2, 3]);
  server.close();
  clock.tick(1000);
  await flush();
  assert.equal(n, 3);
  ev.destroy();
});

test('the conformance vectors pass against the mock server (the protocol\'s reference)', async () => {
  const vectors = JSON.parse(readFileSync(new URL('../events/protocol-v1.json', import.meta.url), 'utf-8')).vectors;
  const server = new MockServer({ address: null });
  const r = await runVectors(vectors, () => mockClient(server), { ms: 1000 });
  assert.deepEqual(r.failed, []);
  assert.equal(r.passed.length, vectors.length);
  assert.ok(frameMatches({ a: '<one-of:x,y>', b: '<save:k>' }, { a: 'y', b: 3 }, {}, {}));
  server.close();
});

test('a stream born after the subscription is resynced too when the server restarts (its subscription is told)', async () => {
  const { clock, server, ev } = await setup();
  const got = [];
  await ev.subscribe('views.>', (m) => got.push(m.kind === 'resync' ? 'resync' : m.seq)).ready;
  server.publish('views.a', 1, { stream: 'views.a' }); server.publish('views.a', 2, { stream: 'views.a' });
  await flush();
  server.restart();
  await flush();
  clock.tick(30000);
  await flush(20);
  assert.ok(got.indexOf('resync') > 1, JSON.stringify(got));
  ev.destroy();
});
