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
/* drishti-events under Node, step 3 (the connection): the state machine on the test clock, the WebSocket, EventSource and fetch
/* drishti-events under Node, step 4 wired: the Sequencer behind the connection: a repeat is dropped, a gap is held and the replay frame sent,
   the range arriving frees everything in order, an unrecoverable gap is on $events.gap and delivered after the wait, a reconnect sends `after`
   and an unrecovered answer enters `recovering` with a resync notice. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../elements/drishti-events/src/drishti_index.js';
import { EventBus } from '../../elements/drishti-core/src/drishti_index.js';

const flush = async () => { for (let i = 0; i < 3; i++) { await new Promise((r) => setImmediate(r)); } };
class FakeWS extends EventTarget {
  constructor(url) { super(); this.url = url; this.sent = []; this.bufferedAmount = 0; FakeWS.all.push(this); }
  send(t) { this.sent.push(JSON.parse(t)); }
  close() {}
  open() { this.dispatchEvent(new Event('open')); }
  recv(x) { this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(x) })); }
  drop() { this.dispatchEvent(Object.assign(new Event('close'), { code: 1006 })); }
  frames(t) { return this.sent.flat().filter((f) => !t || f.t === t); }
  static last() { return FakeWS.all[FakeWS.all.length - 1]; }
}
FakeWS.all = [];
const WELCOME = { t: 'welcome', v: 1, session: 's-1', time: 1794000000000, heartbeatMs: 15000, can: ['replay', 'retained'], limits: {}, resumed: false };
const msg = (seq, extra) => Object.assign({ t: 'msg', id: 'm' + seq, topic: 'prices.fx.USDCAD', stream: 'prices.fx', seq: seq, time: 1, source: 's', data: { seq: seq } }, extra);

async function open() {
  FakeWS.all = [];
  const clock = E.testClock({ seed: 3 });
  const ev = E.connect('wss://example.org/events', { bus: new EventBus(), clock: clock, env: { WebSocket: FakeWS, window: {} } });
  const got = [], gaps = [], notices = [];
  const sub = ev.subscribe('prices.fx.*', (m) => (m.kind === 'resync' ? notices.push(m) : got.push(m.seq)));
  ev.on('$events.gap', (m) => gaps.push(m.data));
  await flush();
  const ws = FakeWS.last();
  ws.open(); ws.recv(WELCOME);
  ws.recv({ t: 'subd', id: 1, streams: { 'prices.fx': { epoch: 'a1', seq: 10 } }, recovered: true });
  return { ev, clock, got, gaps, notices, ws, sub };
}

test('a repeat is dropped; a gap is held, replay is asked, and the range frees everything in order', async () => {
  const { got, ws, clock } = await open();
  ws.recv([msg(11), msg(11), msg(14), msg(15)]);
  assert.deepEqual(got, [11]);
  assert.deepEqual(ws.frames('replay'), [{ t: 'replay', stream: 'prices.fx', epoch: 'a1', from: 12, to: 13 }]);
  ws.recv([msg(12, { replayed: true }), msg(13, { replayed: true })]);
  assert.deepEqual(got, [11, 12, 13, 14, 15]);
  assert.equal(clock.pending() >= 0, true);
});

test('a gap not filled: delivered after the wait, on $events.gap, the subscription resynced', async () => {
  const { got, gaps, notices, ws, clock, sub } = await open();
  ws.recv([msg(11), msg(14)]);
  clock.tick(2000);
  assert.deepEqual(got, [11, 14]);
  assert.deepEqual(gaps, [{ stream: 'prices.fx', from: 12, to: 13, recoverable: false }]);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].data.reason, 'timeout');
  assert.equal(sub.state, 'active');
});

test('the server\'s gap frame: unrecoverable is on $events.gap once and what follows is delivered', async () => {
  const { got, gaps, ws } = await open();
  ws.recv([msg(11), msg(15)]);
  ws.recv({ t: 'gap', stream: 'prices.fx', from: 12, to: 14, recoverable: false });
  assert.deepEqual(got, [11, 15]);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].recoverable, false);
});

test('a reconnect sends where each stream was; an unrecovered answer resyncs', async () => {
  const { ws, clock, got, notices } = await open();
  ws.recv([msg(11), msg(12)]);
  ws.drop();
  clock.runAll(3);
  await flush();
  const ws2 = FakeWS.last();
  assert.notEqual(ws2, ws);
  ws2.open(); ws2.recv(WELCOME);
  assert.deepEqual(ws2.frames('sub')[0].after, { 'prices.fx': { epoch: 'a1', seq: 12 } });
  ws2.recv({ t: 'subd', id: 1, streams: { 'prices.fx': { epoch: 'a1', seq: 40 } }, recovered: false });
  assert.equal(notices.length, 1);
  assert.equal(notices[0].data.reason, 'unrecovered');
  ws2.recv([msg(41)]);
  assert.deepEqual(got, [11, 12, 41]);
});
