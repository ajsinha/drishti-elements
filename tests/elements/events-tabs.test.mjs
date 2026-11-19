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
/* drishti-events under Node, step 7 (tabs): the tabs scope over a BroadcastChannel (MockTabs joins several Events as tabs), request and
   reply across tabs, sign-out told to every tab, the namespace keeping people apart, hostile frames from another tab; the shared hub
   in the leader tab (one WebSocket for three tabs, one subscription per pattern, publishes and requests relayed, the leader closing and
   the next tab resuming by sequence) and in a SharedWorker (auth asked of a tab); the fallbacks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../elements/drishti-events/src/drishti_index.js';
import { EventBus } from '../../elements/drishti-core/src/drishti_index.js';

const flush = async (n) => { for (let i = 0; i < (n || 12); i++) { await new Promise((r) => setImmediate(r)); } };

class FakeWS extends EventTarget {
  constructor(url, protocols) { super(); this.url = url; this.protocols = protocols; this.sent = []; this.bufferedAmount = 0; FakeWS.all.push(this); }
  send(t) { this.sent.push(JSON.parse(t)); }
  close(code) { this.closedWith = code || 1000; }
  open() { this.dispatchEvent(new Event('open')); }
  recv(x) { this.dispatchEvent(Object.assign(new Event('message'), { data: typeof x === 'string' ? x : JSON.stringify(x) })); }
  frames(t) { return this.sent.flat().filter((f) => !t || f.t === t); }
  static last() { return FakeWS.all[FakeWS.all.length - 1]; }
}
FakeWS.all = [];

const WELCOME = { t: 'welcome', v: 1, session: 's-1', time: 1794000000000, heartbeatMs: 15000, can: ['replay', 'retained', 'request', 'publish'], limits: {}, resumed: false };

test('the tabs scope: a selection shared to the tabs reaches the other tab (not the sender), the namespace keeps people apart, $ topics stay', async () => {
  const tabs = new E.MockTabs();
  const a = E.createEvents({ bus: new EventBus(), env: tabs.tab(), namespace: 'app.u1' });
  const b = E.createEvents({ bus: new EventBus(), env: tabs.tab(), namespace: 'app.u1' });
  const other = E.createEvents({ bus: new EventBus(), env: tabs.tab(), namespace: 'app.u2' });
  [a, b, other].forEach((ev) => ev.share('ui.selection.>', { to: 'tabs' }));
  const heard = { a: [], b: [], other: [] };
  a.on('ui.selection.>', (m) => heard.a.push(m.scope + ':' + m.data.ids.join()));
  b.on('ui.selection.>', (m) => heard.b.push(m.scope + ':' + m.data.ids.join()));
  other.on('ui.selection.>', (m) => heard.other.push(m.data.ids.join()));
  const r = await a.publish('ui.selection.grid', { ids: ['T1', 'T2'] });
  assert.deepEqual(r.to, ['page', 'tabs']);
  await flush();
  assert.deepEqual(heard.a, ['page:T1,T2']);                    // the page; the tabs scope never echoes to the sender
  assert.deepEqual(heard.b, ['tabs:T1,T2']);
  assert.deepEqual(heard.other, []);                            // another person's tabs share nothing
  assert.equal(b.metrics().tabs.channel, 'drishti-events.tabs.app.u1');
  await assert.rejects(a.tabs.publish('$events.x', 1));
  [a, b, other].forEach((ev) => ev.destroy());
});

test('the tabs scope checks what another tab sends: not JSON, another version, a bad topic, too large: dropped and counted', async () => {
  const tabs = new E.MockTabs();
  const env = tabs.tab();
  const b = E.createEvents({ bus: new EventBus(), env: tabs.tab(), limits: { frameBytes: 300 } });
  const drops = [];
  b.on('$events.drop', (m) => drops.push(m.data.reason + ':' + m.data.detail));
  const got = [];
  b.tabs.on('x.>', (m) => got.push(m.data));
  const ch = new env.BroadcastChannel('drishti-events.tabs');
  ch.postMessage('not json');
  ch.postMessage(JSON.stringify({ v: 2, t: 'msg', from: 'tab:z', m: { id: 'i', topic: 'x.y', data: 1 } }));
  ch.postMessage(JSON.stringify({ v: 1, t: 'msg', from: 'tab:z', m: { id: 'i', topic: 'bad topic', data: 1 } }));
  ch.postMessage(JSON.stringify({ v: 1, t: 'msg', from: 'tab:z', m: { id: 'i', topic: 'x.y', data: 'x'.repeat(400) } }));
  ch.postMessage({ v: 1, t: 'msg', from: 'tab:z', m: { id: 'i', topic: 'x.y', data: 1 } });   // an object, not text
  ch.postMessage(JSON.stringify({ v: 1, t: 'msg', from: 'tab:z', m: { id: 'ok1', topic: 'x.y', data: 7 } }));
  await flush();
  assert.deepEqual(got, [7]);
  assert.equal(drops.length, 5);
  assert.ok(drops.every((d) => d.startsWith('invalid:')));
  assert.equal(b.metrics().tabs.bad, 5);
  b.destroy();
});

test('request and reply across tabs: the first tab that answers, an error in words, a cancel that reaches the replier, a timeout when none answers', async () => {
  const tabs = new E.MockTabs();
  const a = E.createEvents({ bus: new EventBus(), env: tabs.tab() });
  const b = E.createEvents({ bus: new EventBus(), env: tabs.tab() });
  const c = E.createEvents({ bus: new EventBus(), env: tabs.tab() });
  b.reply('who.here', (m) => ({ tab: 'b', asked: m.data }));
  c.reply('fail.>', () => { throw new E.EventError('forbidden', 'not here'); });
  let aborted = false;
  c.reply('slow.job', (m) => new Promise((resolve) => { m.signal.addEventListener('abort', () => { aborted = true; resolve(null); }); }));
  const ans = await a.request('who.here', 'hi', { to: 'tabs' });
  assert.deepEqual(ans.data, { tab: 'b', asked: 'hi' });
  assert.equal(ans.scope, 'tabs');
  await assert.rejects(a.request('fail.x', null, { to: 'tabs' }), (e) => e.code === 'forbidden' && e.detail === 'not here');
  const ctrl = new AbortController();
  const slow = a.request('slow.job', null, { to: 'tabs', signal: ctrl.signal });
  await flush();
  ctrl.abort();
  await assert.rejects(slow, E.AbortError);
  await flush();
  assert.equal(aborted, true);
  await assert.rejects(a.request('nobody.here', null, { to: 'tabs', timeoutMs: 30 }), E.TimeoutError);
  [a, b, c].forEach((ev) => ev.destroy());
});

test('sign-out in one tab: every other tab empties its queue and forgets its stream positions', async () => {
  const tabs = new E.MockTabs();
  const a = E.createEvents({ bus: new EventBus(), env: tabs.tab() });
  const b = E.createEvents({ bus: new EventBus(), env: tabs.tab() });
  let told = 0;
  b._attach('server', { publish: () => Promise.resolve({ acked: true }), signOut: () => { told++; return Promise.resolve(); } });
  const auth = [];
  b.on('$events.auth', (m) => auth.push(m.data.reason));
  a.tabs.subscribe('any.>');                                   // the channel is open
  await a.signOut();
  await flush();
  assert.equal(told, 1);
  assert.deepEqual(auth, ['signed-out']);
  a.destroy(); b.destroy();
});

/** Three tabs sharing one connection through the leader tab. */
async function leaderTabs(n, o) {
  FakeWS.all = [];
  const tabs = new E.MockTabs({ worker: false });
  const clock = E.testClock({ seed: 5 });
  const envs = [], evs = [];
  for (let i = 0; i < n; i++) {
    const env = tabs.tab({ WebSocket: FakeWS });
    envs.push(env);
    evs.push(E.connect('wss://example.org/events', Object.assign({ bus: new EventBus(), clock: clock, env: env, share: true, namespace: 'app.u1' }, o)));
    await flush();
  }
  return { tabs, clock, envs, evs };
}

test('the shared hub in the leader tab: one WebSocket for three tabs, one subscription per pattern, every tab hears, states say shared', async () => {
  const { evs } = await leaderTabs(3);
  assert.equal(FakeWS.all.length, 1);                           // one connection for the three tabs
  const states = [];
  evs[2].on('$events.state', (m) => states.push(m.data.state + (m.data.shared ? '/shared:' + m.data.mode : '')));
  const got = [[], [], []];
  const subs = evs.map((ev, i) => ev.subscribe('prices.>', (m) => got[i].push(m.data.bid)));
  evs[1].subscribe('prices.fx.*', () => {});
  await flush();
  const ws = FakeWS.last();
  ws.open(); ws.recv(WELCOME);
  await flush();
  assert.deepEqual(states, ['open/shared:leader']);
  assert.equal(evs[2].state, 'open');
  assert.deepEqual(ws.frames('sub').map((f) => f.topic), ['prices.>', 'prices.fx.*']);   // one per pattern, not per tab
  ws.recv({ t: 'subd', id: 1, streams: { 'prices.fx': { epoch: 'e1', seq: 10 } } });
  await flush();
  assert.deepEqual(subs.map((s) => s.state), ['active', 'active', 'active']);
  ws.recv({ t: 'msg', id: 'm1', topic: 'prices.fx.USDCAD', stream: 'prices.fx', seq: 11, key: 'USDCAD', data: { bid: 1.36 } });
  await flush();
  assert.deepEqual(got, [[1.36], [1.36], [1.36]]);              // tab 1 holds two matching patterns: still once
  assert.equal(evs[1].metrics().server.mode, 'leader');
  subs[0].off(); subs[1].off();
  await flush();
  assert.equal(ws.frames('unsub').length, 0);                   // tab 2 still holds prices.>
  subs[2].off();
  await flush();
  assert.deepEqual(ws.frames('unsub'), [{ t: 'unsub', id: 1 }]);
  evs.forEach((ev) => ev.destroy());
});

test('the shared hub relays a follower\'s publishes (acknowledged) and requests (answered, cancelled); a late tab gets the retained values', async () => {
  const { evs } = await leaderTabs(2);
  const ws = FakeWS.last();
  ws.open(); ws.recv(WELCOME);
  const s0 = evs[0].subscribe('book.>', () => {}, { retained: true });
  await flush();
  ws.recv({ t: 'subd', id: 1, streams: {} });
  ws.recv({ t: 'msg', id: 'r1', topic: 'book.a', key: 'a', data: 1, retained: true });
  ws.recv({ t: 'msg', id: 'r2', topic: 'book.b', key: 'b', data: 2, retained: true });
  await flush();
  const p = evs[1].publish('chat.lobby', { text: 'hi' });
  await flush();
  const pub = ws.frames('pub')[0];
  assert.equal(pub.topic, 'chat.lobby');
  ws.recv({ t: 'ok', id: pub.id });
  assert.equal((await p).acked, true);
  const q = evs[1].request('quotes.get', { s: 'CAD' }, { timeoutMs: 5000 });
  await flush();
  const req = ws.frames('req')[0];
  ws.recv({ t: 'res', re: req.id, data: { bid: 1.3 } });
  assert.deepEqual((await q).data, { bid: 1.3 });
  const ctrl = new AbortController();
  const slow = evs[1].request('quotes.slow', {}, { signal: ctrl.signal });
  await flush();
  ctrl.abort();
  await assert.rejects(slow, E.AbortError);
  await flush();
  assert.deepEqual(ws.frames('cancel').map((f) => f.id), [ws.frames('req')[1].id]);
  const late = [];
  evs[1].subscribe('book.>', (m) => late.push(m.data + (m.retained ? 'r' : '')), { retained: true });
  await flush();
  assert.deepEqual(late, ['1r', '2r']);                          // the hub's retained values, not a second subscription
  assert.equal(ws.frames('sub').length, 1);
  s0.off();
  evs.forEach((ev) => ev.destroy());
});

test('the leader tab closes: the next tab leads, opens its own connection, resumes after the positions the tabs heard, and sends again what waited', async () => {
  const { tabs, envs, evs } = await leaderTabs(3);
  const ws1 = FakeWS.last();
  ws1.open(); ws1.recv(WELCOME);
  const got = [];
  evs[1].subscribe('prices.>', (m) => got.push(m.seq));
  await flush();
  ws1.recv({ t: 'subd', id: 1, streams: { 'prices.fx': { epoch: 'e1', seq: 10 } } });
  ws1.recv({ t: 'msg', id: 'm11', topic: 'prices.fx', stream: 'prices.fx', seq: 11, data: 1 });
  ws1.recv({ t: 'msg', id: 'm12', topic: 'prices.fx', stream: 'prices.fx', seq: 12, data: 2 });
  await flush();
  assert.deepEqual(got, [11, 12]);
  const p = evs[2].publish('chat.lobby', { text: 'while the leader goes' });
  await flush();
  const first = ws1.frames('pub')[0];
  tabs.close(envs[0]);                                           // the leader's tab is gone (its lock released)
  await flush(30);
  assert.equal(FakeWS.all.length, 2);                            // the next tab leads with a connection of its own
  const ws2 = FakeWS.last();
  ws2.open(); ws2.recv(Object.assign({}, WELCOME, { session: 's-2' }));
  await flush();
  const sub = ws2.frames('sub')[0];
  assert.equal(sub.topic, 'prices.>');
  assert.deepEqual(sub.after, { 'prices.fx': { epoch: 'e1', seq: 12 } });   // resumed by sequence from what the tabs heard
  const again = ws2.frames('pub')[0];
  assert.equal(again.id, first.id);                              // the same id: a server takes it once
  ws2.recv({ t: 'ok', id: again.id });
  assert.equal((await p).acked, true);
  ws2.recv({ t: 'subd', id: 1, streams: { 'prices.fx': { epoch: 'e1', seq: 12 } }, recovered: true });
  ws2.recv({ t: 'msg', id: 'm13', topic: 'prices.fx', stream: 'prices.fx', seq: 13, data: 3 });
  await flush();
  assert.deepEqual(got, [11, 12, 13]);
  evs.slice(1).forEach((ev) => ev.destroy());
});

test('the shared hub in a SharedWorker: one connection held off the page, auth asked of a tab, tabs leaving give their subscriptions back', async () => {
  FakeWS.all = [];
  const clock = E.testClock({ seed: 9 });
  const tabs = new E.MockTabs({ workerEnv: { WebSocket: FakeWS, window: {} }, clock: null });
  const asked = [];
  const auth = (a) => { asked.push(a.reason); return Promise.resolve({ token: 'tok-1', expiresAt: 0 }); };
  const evs = [];
  for (let i = 0; i < 2; i++) {
    evs.push(E.connect('wss://example.org/events', { bus: new EventBus(), clock: clock, env: tabs.tab(), share: true, namespace: 'app.u1', auth: auth,
      worker: '/elements/drishti-events/drishti_events-worker.js' }));
  }
  await flush(20);
  assert.equal(FakeWS.all.length, 1);
  const ws = FakeWS.last();
  ws.open();
  await flush();
  assert.equal(ws.frames('hello')[0].token, 'tok-1');            // the worker asked a tab for the token
  assert.deepEqual(asked, ['connect']);
  ws.recv(WELCOME);
  const got = [];
  evs.forEach((ev) => ev.subscribe('news.>', (m) => got.push(m.data)));
  await flush();
  assert.equal(ws.frames('sub').length, 1);
  ws.recv({ t: 'msg', id: 'n1', topic: 'news.top', data: 'x' });
  await flush();
  assert.deepEqual(got, ['x', 'x']);
  assert.equal(evs[0].metrics().server.mode, 'worker');
  assert.equal(tabs.workerHost().clients.size, 2);
  evs[0].destroy();
  await flush();
  assert.equal(tabs.workerHost().clients.size, 1);
  assert.equal(ws.frames('unsub').length, 0);
  evs[1].destroy();
  await flush();
  assert.equal(tabs.workerHost(), null);                         // the last tab gone: the worker closes its connection
  assert.equal(ws.frames('bye').length, 1);
});

test('share needs a namespace; with no worker, no locks and no channel each tab connects for itself', async () => {
  assert.throws(() => E.connect('wss://example.org/events', { bus: new EventBus(), share: true, env: { WebSocket: FakeWS, window: {} } }), (e) => e.code === 'share.namespace');
  FakeWS.all = [];
  const ev = E.connect('wss://example.org/events', { bus: new EventBus(), share: true, namespace: 'n', clock: E.testClock(), env: { WebSocket: FakeWS, window: {}, noTabs: true } });
  await flush();
  assert.equal(FakeWS.all.length, 1);
  assert.equal(ev.metrics().server.shared, undefined);
  assert.equal(ev.metrics().tabs, undefined);
  ev.destroy();
});

test('MockTabs: Web Locks are held in order and released when a tab closes', async () => {
  const tabs = new E.MockTabs();
  const a = tabs.tab(), b = tabs.tab();
  const order = [];
  let release;
  a.locks.request('L', () => { order.push('a'); return new Promise((r) => { release = r; }); });
  b.locks.request('L', () => { order.push('b'); return null; });
  await flush();
  assert.deepEqual(order, ['a']);
  tabs.close(a);
  await flush();
  assert.deepEqual(order, ['a', 'b']);
  release();
});
