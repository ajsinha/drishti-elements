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
   transports (stand-ins the tests drive), the protocol's frames (hello, welcome, sub, subd, msg, pub, ok, req, res, cancel, ping, pong,
   err, bye, auth), back-off and resume, heartbeats, refusals that stop, auth and its refresh, the address guard, raw mode, parseSse and
   readSse. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../elements/drishti-events/src/drishti_index.js';
import { EventBus, configure } from '../../elements/drishti-core/src/drishti_index.js';

const flush = async (n) => { for (let i = 0; i < (n || 3); i++) { await new Promise((r) => setImmediate(r)); } };

class FakeWS extends EventTarget {
  constructor(url, protocols) { super(); this.url = url; this.protocols = protocols; this.sent = []; this.bufferedAmount = 0; FakeWS.all.push(this); }
  send(t) { this.sent.push(JSON.parse(t)); }
  close(code) { this.closedWith = code || 1000; }
  open() { this.dispatchEvent(new Event('open')); }
  recv(x) { this.dispatchEvent(Object.assign(new Event('message'), { data: typeof x === 'string' ? x : JSON.stringify(x) })); }
  drop(code) { this.dispatchEvent(Object.assign(new Event('close'), { code: code || 1006 })); }
  frames(t) { return this.sent.flat().filter((f) => !t || f.t === t); }
  static last() { return FakeWS.all[FakeWS.all.length - 1]; }
}
FakeWS.all = [];

class FakeES extends EventTarget {
  constructor(url, o) { super(); this.url = url; this.o = o; this.readyState = 0; FakeES.all.push(this); }
  close() { this.readyState = 2; this.closed = true; }
  open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
  emit(type, data, id) { this.dispatchEvent(Object.assign(new Event(type), { data: typeof data === 'string' ? data : JSON.stringify(data), lastEventId: id || '' })); }
  fail() { this.readyState = 2; this.dispatchEvent(new Event('error')); }
  static last() { return FakeES.all[FakeES.all.length - 1]; }
}
FakeES.all = [];

/** A stand-in fetch: /stream answers a stream the test writes into; /send answers 202 and records the frames. */
function fakeFetch(o) {
  const f = (url, init) => {
    const call = { url: url, init: init, body: init.body ? JSON.parse(init.body) : null };
    f.calls.push(call);
    if (/\/send$/.test(url)) { f.sent.push(...call.body); return Promise.resolve({ ok: true, status: 202 }); }
    const status = o && o.status ? o.status(call) : 200;
    if (status !== 200) { return Promise.resolve({ ok: false, status: status }); }
    let ctl;
    const body = new ReadableStream({ start: (c) => { ctl = c; } });
    const enc = new TextEncoder();
    call.write = (text) => ctl.enqueue(enc.encode(text));
    call.frame = (fr, id) => call.write((id ? 'id: ' + id + '\n' : '') + 'event: ' + fr.t + '\ndata: ' + JSON.stringify(fr) + '\n\n');
    call.end = () => ctl.close();
    if (init.signal) { init.signal.addEventListener('abort', () => { call.aborted = true; try { ctl.error(new Error('aborted')); } catch (e) { /* closed */ } }); }
    return Promise.resolve({ ok: true, status: 200, body: body });
  };
  f.calls = [];
  f.sent = [];
  f.streams = () => f.calls.filter((c) => !/\/send$/.test(c.url));
  return f;
}

const WELCOME = { t: 'welcome', v: 1, session: 's-1', time: 1794000000000, heartbeatMs: 15000, can: ['replay', 'retained', 'request', 'publish', 'batch'], limits: { frameBytes: 1048576, subs: 200 }, resumed: false };

async function wsEvents(o) {
  FakeWS.all = [];
  const clock = E.testClock({ seed: 3 });
  const states = [];
  const ev = E.connect('wss://example.org/events', Object.assign({ bus: new EventBus(), clock: clock, env: { WebSocket: FakeWS, window: {} } }, o));
  ev.on('$events.state', (m) => states.push(m.data.state + (m.data.waitMs ? '(' + m.data.waitMs + ')' : '')));
  if (!o || !o.later) { await flush(); }
  return { ev: ev, clock: clock, states: states };
}

test('the address guard: a secret in a query is refused with words; base64url', async () => {
  assert.throws(() => E.connect('wss://example.org/events?token=abc', { bus: new EventBus() }), (e) => e.code === 'address.secret' && /auth option/.test(e.detail));
  assert.throws(() => E.checkAddress('/events?x=1&KEY=2'), /secret/);
  assert.throws(() => E.checkAddress('/events?apikey=2'), /apikey=/);
  assert.equal(E.checkAddress('/events?lastEventId=7&topic=a'), '/events?lastEventId=7&topic=a');
  assert.equal(E.base64url('a?b>'), 'YT9iPg');
  assert.throws(() => E.connect('/x', { bus: new EventBus(), transport: 'pigeon' }), /no transport pigeon/);
  assert.throws(() => E.connect('/x', { bus: new EventBus(), protocol: 2 }), /protocol 1/);
});

test('connect() with no address uses the configured events endpoint, and with none is the page only', async () => {
  const page = E.connect({ bus: new EventBus() });
  assert.equal(page.state, 'idle');
  assert.deepEqual(page.routeOf('a.b'), ['page']);
  configure({ endpoints: { events: 'wss://example.org/configured' } });
  FakeWS.all = [];
  const ev = E.connect(undefined, { bus: new EventBus(), env: { WebSocket: FakeWS, window: {} }, clock: E.testClock() });
  assert.equal(ev.state, 'idle');
  await flush();
  assert.equal(FakeWS.last().url, 'wss://example.org/configured');
  assert.equal(ev.state, 'connecting');
  configure({ endpoints: { events: '' } });
  ev.destroy();
});

test('WebSocket, protocol 1: hello first, welcome opens; subscriptions made before are sent then; messages, publishes and their acknowledgements', async () => {
  const { ev, states } = await wsEvents();
  const got = [];
  const s = ev.subscribe('prices.fx.*', (m) => got.push(m), { retained: true });
  assert.equal(s.state, 'pending');
  const ws = FakeWS.last();
  assert.deepEqual(ws.protocols, ['events.v1']);
  ws.open();
  const hello = ws.frames('hello')[0];
  assert.equal(hello.v, 1);
  assert.match(hello.client, /^drishti-events\//);
  assert.equal(hello.token, undefined);
  assert.equal(ws.frames('sub').length, 0);                 // not before welcome
  ws.recv(WELCOME);
  assert.equal(ev.state, 'open');
  assert.deepEqual(ws.frames('sub'), [{ t: 'sub', id: 1, topic: 'prices.fx.*', retained: true }]);
  ws.recv({ t: 'subd', id: 1, streams: { 'prices.fx': { epoch: 'a1', seq: 48213 } }, recovered: true });
  assert.equal(await s.ready, s);
  ws.recv([{ t: 'msg', id: 'm1', topic: 'prices.fx.USDCAD', stream: 'prices.fx', seq: 48214, key: 'USDCAD', kind: 'tick', time: 1794000000120, source: 'pricing-1', data: { bid: 1.3612 } }]);
  assert.equal(got.length, 1);
  assert.equal(got[0].scope, 'server');
  assert.equal(got[0].seq, 48214);
  assert.equal(got[0].source, 'pricing-1');
  const p = ev.publish('chat.lobby', { text: 'hello' }, { key: 'k', meta: { trace: 't' } });
  await flush();
  const pub = ws.frames('pub')[0];
  assert.equal(pub.topic, 'chat.lobby');
  assert.deepEqual(pub.data, { text: 'hello' });
  assert.equal(pub.key, 'k');
  ws.recv({ t: 'ok', id: pub.id });
  const r = await p;
  assert.deepEqual(r.to, ['server']);
  assert.equal(r.acked, true);
  const noAck = await ev.publish('chat.lobby', {}, { ack: false });
  assert.equal(noAck.acked, false);
  assert.equal(ws.frames('pub')[1].ack, false);
  s.off();
  assert.deepEqual(ws.frames('unsub'), [{ t: 'unsub', id: 1 }]);
  assert.deepEqual(states, ['connecting', 'open']);
  ev.close();
  assert.equal(ws.frames('bye').length, 1);
  assert.equal(ev.state, 'closed');
});

test('WebSocket: request and reply over the server, an error answer, a cancel on abort, a refused subscription, a refused publish', async () => {
  const { ev } = await wsEvents();
  const ws = FakeWS.last();
  ws.open(); ws.recv(WELCOME);
  const q = ev.request('quotes.get', { symbol: 'CAD' }, { timeoutMs: 2000 });
  await flush();
  const req = ws.frames('req')[0];
  assert.equal(req.ttl, 2000);
  ws.recv({ t: 'res', re: req.id, data: { bid: 1.3612 } });
  const ans = await q;
  assert.deepEqual(ans.data, { bid: 1.3612 });
  assert.equal(ans.re, req.id);
  assert.equal(ans.topic, 'quotes.get');
  const bad = ev.request('quotes.get', {});
  await flush();
  ws.recv({ t: 'res', re: ws.frames('req')[1].id, error: { code: 'no.responder', detail: 'nobody answers quotes.get' } });
  await assert.rejects(bad, (e) => e.code === 'no.responder' && /nobody/.test(e.detail));
  const ctrl = new AbortController();
  const c = ev.request('quotes.slow', {}, { signal: ctrl.signal });
  await flush();
  ctrl.abort();
  await assert.rejects(c, E.AbortError);
  assert.deepEqual(ws.frames('cancel'), [{ t: 'cancel', id: ws.frames('req')[2].id }]);
  const s = ev.subscribe('secret.>');
  ws.recv({ t: 'err', id: 1, code: 'forbidden', detail: 'not for you' });
  await assert.rejects(s.ready, /forbidden: not for you/);
  assert.equal(s.state, 'refused');
  const p = ev.publish('chat.x', {});
  await flush();
  ws.recv({ t: 'err', id: ws.frames('pub')[0].id, code: 'forbidden', detail: 'read only', retry: false });
  await assert.rejects(p, (e) => e.code === 'forbidden');
  ev.destroy();
});

test('hostile or unknown input: bad JSON, a non-frame, a bad topic, an oversized frame and a binary frame are dropped and counted; unknown types ignored', async () => {
  const { ev } = await wsEvents({ limits: { frameBytes: 200 } });
  const drops = [];
  ev.on('$events.drop', (m) => drops.push(m.data.reason));
  const ws = FakeWS.last();
  ws.open(); ws.recv(WELCOME);
  ws.recv('not json');
  ws.recv('{"no":"type"}');
  ws.recv({ t: 'msg', id: 'x', topic: 'bad topic', data: 1 });
  ws.recv({ t: 'msg', id: 'y', topic: 'a.b', data: 'x'.repeat(300) });
  ws.recv({ t: 'future-frame', anything: true });
  ws.dispatchEvent(Object.assign(new Event('message'), { data: new ArrayBuffer(4) }));
  assert.deepEqual(drops, ['invalid', 'invalid', 'invalid', 'too-large', 'invalid']);
  const m = ev.metrics().server;
  assert.equal(m.unknownFrames, 1);
  assert.equal(m.badFrames, 5);
  assert.equal(ev.state, 'open');
  ev.destroy();
});

test('reconnect: back-off with jitter on the clock, the session resumed, subscriptions and unacknowledged publishes sent again in order', async () => {
  const { ev, clock, states } = await wsEvents({ backoff: { baseMs: 100, maxMs: 1000 } });
  let ws = FakeWS.last();
  ev.subscribe('a.>');
  ws.open(); ws.recv(WELCOME);
  const p1 = ev.publish('chat.x', 1);
  await flush();
  const id1 = ws.frames('pub')[0].id;
  ws.drop(1006);
  assert.equal(ev.state, 'reconnecting');
  const p2 = ev.publish('chat.x', 2);
  await assert.rejects(ev.publish('chat.x', 3, { queue: false }), /not connected/);
  assert.equal(FakeWS.all.length, 1);
  clock.tick(1000);
  ws = FakeWS.last();
  assert.equal(FakeWS.all.length, 2);
  ws.open();
  assert.equal(ws.frames('hello')[0].session, 's-1');
  ws.recv(Object.assign({}, WELCOME, { resumed: true }));
  assert.deepEqual(ws.frames('sub').map((f) => f.topic), ['a.>']);
  assert.deepEqual(ws.frames('pub').map((f) => f.data), [1, 2]);
  assert.equal(ws.frames('pub')[0].id, id1);
  ws.recv([{ t: 'ok', id: id1 }, { t: 'ok', id: ws.frames('pub')[1].id }]);
  assert.equal((await p1).acked, true);
  assert.equal((await p2).acked, true);
  assert.equal(states[2].startsWith('reconnecting('), true);
  assert.deepEqual(states.slice(3), ['connecting', 'open']);
  const m = ev.metrics().server;
  assert.equal(m.reconnects, 1);
  assert.equal(m.out.retried, 1);
  ev.destroy();
});

test('the back-off grows to its cap with full jitter, never under half the base; a server\'s advice is a floor', async () => {
  const b = new E.Backoff({ baseMs: 100, maxMs: 1000, jitter: false });
  assert.deepEqual([b.next(), b.next(), b.next(), b.next(), b.next()], [100, 200, 400, 800, 1000]);
  b.reset();
  assert.equal(b.next(5000), 5000);
  const j = new E.Backoff({ baseMs: 100, maxMs: 1000, random: () => 0 });
  assert.equal(j.next(), 50);
  const c = E.testClock();
  let fired = 0;
  const hb = new E.Heartbeat({ timeoutMs: 50, clock: c, onTimeout: () => fired++ });
  hb.beat(); c.tick(49); hb.beat(); c.tick(49);
  assert.equal(fired, 0);
  c.tick(2);
  assert.equal(fired, 1);
  hb.beat(); hb.stop(); c.tick(100);
  assert.equal(fired, 1);
});

test('heartbeats: a WebSocket pings every third of the server\'s figure and learns the round trip; silence for 1.5 times it reconnects', async () => {
  const { ev, clock } = await wsEvents();
  const ws = FakeWS.last();
  ws.open(); ws.recv(WELCOME);
  clock.tick(5000);
  const ping = ws.frames('ping')[0];
  assert.equal(ping.ts, clock.now());
  clock.tick(20);
  ws.recv({ t: 'pong', ts: ping.ts, time: ping.ts + 500 });
  const m = ev.metrics().server;
  assert.equal(m.rtt.last, 20);
  assert.equal(m.offset, 490);
  clock.tick(22499);
  assert.equal(ev.state, 'open');
  clock.tick(2);
  assert.equal(ev.state, 'reconnecting');
  ev.destroy();
});

test('refusals that trying again cannot cure stop in refused, with the reason in words; a server\'s goodbye is followed', async () => {
  for (const code of [4400, 4403]) {
    const { ev, clock } = await wsEvents();
    const ws = FakeWS.last();
    ws.open(); ws.recv(WELCOME);
    const reasons = [];
    ev.on('$events.state', (m) => reasons.push(m.data.reason));
    ws.drop(code);
    assert.equal(ev.state, 'refused');
    assert.match(reasons[0], new RegExp('close ' + code));
    clock.runAll();
    assert.equal(FakeWS.all.length, 1);
  }
  const v = await wsEvents();
  FakeWS.last().open();
  FakeWS.last().recv(Object.assign({}, WELCOME, { v: 2 }));
  assert.equal(v.ev.state, 'refused');
  const b = await wsEvents();
  FakeWS.last().open(); FakeWS.last().recv(WELCOME);
  FakeWS.last().recv({ t: 'bye', code: 'restart', detail: 'going down', reconnect: { afterMs: 7000 } });
  assert.match(b.states[2], /^reconnecting\((\d+)\)$/);
  assert.ok(Number(b.states[2].match(/\d+/)[0]) >= 7000);
  const c = await wsEvents();
  FakeWS.last().open(); FakeWS.last().recv(WELCOME);
  FakeWS.last().recv({ t: 'bye', code: 'restart', detail: 'retired', reconnect: false });
  assert.equal(c.ev.state, 'refused');
  c.ev.reconnect();
  assert.equal(c.ev.state, 'connecting');
});

test('auth: asked before connecting, the token in hello; a 4401 asks once more (refused), a second is refused; a minute before expiry a fresh token travels in an auth frame', async () => {
  const asked = [];
  let n = 0;
  const auth = async (a) => { asked.push(a.reason + ':' + a.status); n++; return { token: 'tok' + n, expiresAt: 1794000000000 + 180000 }; };
  const { ev, clock } = await wsEvents({ auth: auth });
  await flush();
  let ws = FakeWS.last();
  ws.open();
  assert.equal(ws.frames('hello')[0].token, 'tok1');
  ws.recv(Object.assign({}, WELCOME, { heartbeatMs: 1000000 }));
  clock.tick(119999);
  assert.equal(ws.frames('auth').length, 0);
  clock.tick(1);
  await flush();
  assert.deepEqual(ws.frames('auth'), [{ t: 'auth', token: 'tok2' }]);
  ws.recv({ t: 'auth', expiresAt: clock.now() + 300000 });
  ws.drop(4401);
  await flush();
  ws = FakeWS.last();
  assert.equal(FakeWS.all.length, 2);
  ws.open();
  ws.drop(4401);
  await flush();
  assert.equal(ev.state, 'refused');
  assert.deepEqual(asked, ['connect:0', 'expiring:0', 'refused:401']);
  const authEvents = [];
  const s = await wsEvents({ auth: async () => ({ token: 'a b/c' }), wsAuth: 'subprotocol' });
  s.ev.on('$events.auth', (m) => authEvents.push(m.data.reason));
  await flush();
  assert.deepEqual(FakeWS.last().protocols, ['events.v1', 'bearer.' + E.base64url('a b/c')]);
  FakeWS.last().open();
  assert.equal(FakeWS.last().frames('hello')[0].token, undefined);
  const f = await wsEvents({ auth: async () => { throw new Error('no session'); } });
  await flush();
  assert.equal(f.ev.state, 'refused');
});

test('offline: a drop while the browser is offline waits for online; a visible page tries at once', async () => {
  FakeWS.all = [];
  const win = new EventTarget();
  win.navigator = { onLine: true };
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  const clock = E.testClock();
  const ev = E.connect('ws://example.org/e', { bus: new EventBus(), clock: clock, env: { WebSocket: FakeWS, window: win, document: doc } });
  await flush();
  FakeWS.last().open(); FakeWS.last().recv(WELCOME);
  win.navigator.onLine = false;
  FakeWS.last().drop();
  assert.equal(ev.state, 'offline');
  assert.equal(clock.pending(), 0);
  win.navigator.onLine = true;
  win.dispatchEvent(new Event('online'));
  assert.equal(ev.state, 'connecting');
  assert.equal(FakeWS.all.length, 2);
  FakeWS.last().drop();
  assert.equal(ev.state, 'reconnecting');
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(FakeWS.all.length, 3);
  ev.destroy();
});

test('EventSource, protocol 1: the subscriptions and the resume position in the address, frames by event name, sending by POST <events>/send', async () => {
  FakeES.all = [];
  const fetch = fakeFetch();
  const clock = E.testClock();
  const ev = E.connect('/events', { bus: new EventBus(), clock: clock, env: { EventSource: FakeES, fetch: fetch, window: {} } });
  const got = [];
  ev.subscribe('prices.>', (m) => got.push(m.data));
  await flush();
  let es = FakeES.last();
  assert.equal(FakeES.all.length, 1);
  assert.equal(es.url, '/events/stream?topic=prices.%3E');
  es.open();
  es.emit('welcome', WELCOME);
  es.emit('subd', { t: 'subd', id: 1, streams: {}, recovered: true });
  es.emit('msg', { t: 'msg', id: 'm1', topic: 'prices.a', data: 1, seq: 1, stream: 'prices' }, 'c-1');
  assert.deepEqual(got, [1]);
  assert.equal(ev.state, 'open');
  const p = ev.publish('chat.x', { a: 1 });
  await flush();
  assert.equal(fetch.calls[0].url, '/events/send');
  assert.equal(fetch.calls[0].init.headers['Events-Session'], 's-1');
  assert.equal(fetch.sent[0].t, 'pub');
  es.emit('ok', { t: 'ok', id: fetch.sent[0].id });
  assert.equal((await p).acked, true);
  ev.subscribe('news.>');
  clock.tick(0);
  es = FakeES.last();
  assert.equal(es.url, '/events/stream?topic=prices.%3E&topic=news.%3E&lastEventId=c-1');
  es.fail();
  assert.equal(ev.state, 'reconnecting');
  ev.destroy();
});

test('fetch, protocol 1: the token in Authorization, hello and subscriptions in the body, Last-Event-ID on resume, a 401 asks auth again, a fresh token opens a new stream before the old one closes', async () => {
  const fetch = fakeFetch({ status: (c) => (c.init.headers.Authorization === 'Bearer bad' ? 401 : 200) });
  const clock = E.testClock();
  let n = 0;
  const tokens = ['bad', 't2', 't3'];
  const ev = E.connect('https://example.org/events', { bus: new EventBus(), clock: clock, env: { fetch: fetch, window: {} },
    auth: async () => ({ token: tokens[n++], expiresAt: clock.now() + 120000 }) });
  const got = [];
  ev.subscribe('prices.>', (m) => got.push(m.data));
  await flush(6);
  assert.equal(ev.state, 'connecting');
  assert.equal(fetch.streams().length, 2);                      // refused once (401), asked again
  const c = fetch.streams()[1];
  assert.equal(c.url, 'https://example.org/events/stream');
  assert.equal(c.init.method, 'POST');
  assert.equal(c.init.headers.Authorization, 'Bearer t2');
  assert.equal(c.body.hello.t, 'hello');
  assert.deepEqual(c.body.subs, [{ t: 'sub', id: 1, topic: 'prices.>' }]);
  c.frame(Object.assign({}, WELCOME, { heartbeatMs: 100000 }));
  c.write(': hb\n\n');
  c.frame({ t: 'msg', id: 'm1', topic: 'prices.a', data: 1 }, 'c-9');
  await flush(6);
  assert.equal(ev.state, 'open');
  assert.deepEqual(got, [1]);
  clock.tick(60000);
  await flush(6);
  const c2 = fetch.streams()[2];
  assert.equal(c2.init.headers.Authorization, 'Bearer t3');
  assert.equal(c2.init.headers['Last-Event-ID'], 'c-9');
  assert.equal(c.aborted, undefined);                           // the old stream stays until the new one is welcomed
  c2.frame(Object.assign({}, WELCOME, { resumed: true }));
  await flush(6);
  assert.equal(c.aborted, true);
  assert.equal(ev.state, 'open');
  c2.end();
  await flush(6);
  assert.equal(ev.state, 'reconnecting');
  ev.destroy();
});

test('raw mode: a server\'s own JSON as messages (topic feed, the event name as the kind, the event id as the resume position); publishing needs the protocol', async () => {
  FakeES.all = [];
  const clock = E.testClock();
  const ev = E.connect('/feed/x', { protocol: 'raw', bus: new EventBus(), clock: clock, events: ['message', 'rows'], heartbeatMs: 400, env: { EventSource: FakeES, window: {} } });
  const got = [];
  const s = ev.subscribe('feed', (m) => got.push(m.kind + ':' + m.data.n + ':' + m.id));
  await flush();
  FakeES.last().open();
  assert.equal(s.state, 'active');
  FakeES.last().emit('message', { n: 1 }, '7');
  FakeES.last().emit('rows', { n: 2 }, '8');
  FakeES.last().emit('message', 'not json');
  assert.deepEqual(got, ['undefined:1:7', 'rows:2:8']);
  await assert.rejects(ev.publish('feed', {}), /raw/);
  await assert.rejects(ev.request('feed', {}), /raw/);
  clock.tick(401);
  assert.equal(ev.state, 'reconnecting');
  clock.runAll(1);
  assert.equal(FakeES.last().url, '/feed/x?lastEventId=8');
  FakeWS.all = [];
  const w = E.connect('ws://example.org/raw', { protocol: 'raw', bus: new EventBus(), clock: E.testClock(), env: { WebSocket: FakeWS, window: {} },
    topicOf: (v) => 'prices.' + v.sym, keyOf: (v) => v.sym, seqOf: (v) => v.n });
  const wg = [];
  w.on('prices.*', (m) => wg.push([m.topic, m.key, m.seq]));
  await flush();
  FakeWS.last().open();
  assert.deepEqual(FakeWS.last().sent, []);
  FakeWS.last().recv({ sym: 'CAD', n: 4 });
  assert.deepEqual(wg, [['prices.CAD', 'CAD', 4]]);
  ev.destroy(); w.destroy();
});

test('a custom transport (the seam of the mock server): a provider with transport(context) speaks protocol 1 like a socket', async () => {
  const sent = [];
  let ctx = null;
  const provider = { transport: (c) => { ctx = c; return { kind: 'memory', send: (f) => { sent.push(...f); return Promise.resolve(); }, close: () => undefined, bufferedAmount: () => 0 }; } };
  const ev = E.connect(provider, { bus: new EventBus(), clock: E.testClock() });
  await flush();
  ctx.onOpen();
  assert.equal(sent[0].t, 'hello');
  ctx.onText(JSON.stringify(WELCOME), { event: 'message', id: null });
  assert.equal(ev.state, 'open');
  ev.destroy();
});

test('parseSse: names, multi-line data, ids, comments, retry, and the rest kept for the next chunk; readSse over a streamed answer', async () => {
  const P = E.parseSse('event: frame\ndata: {"seq":1}\nid: 5\n\n: keep-alive\n\nretry: 3000\n\ndata: {"a":\ndata: 2}\n\nevent: vi');
  assert.equal(P.events.length, 4);
  assert.deepEqual(P.events[0], { event: 'frame', data: '{"seq":1}', id: '5', comment: false, retry: undefined });
  assert.equal(P.events[1].comment, true);
  assert.equal(P.events[2].retry, 3000);
  assert.equal(P.events[3].data, '{"a":\n2}');
  assert.equal(P.rest, 'event: vi');
  const enc = new TextEncoder();
  const body = new ReadableStream({ start: (c) => { c.enqueue(enc.encode('event: a\ndata: 1\n\nevent: b\nda')); c.enqueue(enc.encode('ta: 2\n\n')); c.enqueue(enc.encode('data: 3')); c.close(); } });
  const out = [];
  for await (const e of E.readSse({ body: body })) { out.push(e.event + '=' + e.data); }
  assert.deepEqual(out, ['a=1', 'b=2', 'message=3']);
  await assert.rejects(async () => { for await (const e of E.readSse({})) { assert.ok(e); } }, /no body/);
});

test('the codec: one frame or a batch; sizes in bytes; frames checked before use', async () => {
  assert.equal(E.encodeFrames([{ t: 'ping', ts: 1 }]), '{"t":"ping","ts":1}');
  assert.equal(E.encodeFrames([{ t: 'a' }, { t: 'b' }]), '[{"t":"a"},{"t":"b"}]');
  assert.equal(E.decodeFrames('[{"t":"ok","id":"1"},{"t":"zzz"}]').frames[1].unknown, true);
  assert.equal(E.decodeFrames('"é"'.repeat(1), { maxBytes: 3 }).error, 'too-large');
  assert.equal(E.checkFrame({ t: 'msg', id: 'x'.repeat(65), topic: 'a' }), 'a msg frame has no id (or one longer than 64)');
  assert.equal(E.checkFrame({ t: 'res', re: 'r1' }), true);
  assert.deepEqual(E.SERVER_FRAMES.length + E.CLIENT_FRAMES.length, 20);
});
