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
/* drishti-events under Node, step 2 (the kernel): topics and patterns, routes, the page scope as drishti-core's shared bus, subscribe and
   publish, once, off, request and reply with timeouts and aborts, streams, typed topics, kinds and shape(), the library's own '$events'
   topics, and the test clock. Another scope is a stand-in adapter here (the connection's own tests are events-connection.test.mjs). */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../elements/drishti-events/src/drishti_index.js';
import { EventBus, bus as coreBus } from '../../elements/drishti-core/src/drishti_index.js';

const flush = () => new Promise((r) => setImmediate(r));
const fresh = (o) => E.createEvents(Object.assign({ bus: new EventBus(), clock: E.testClock() }, o));

/** A stand-in for another scope: remembers what it was given, hands messages in. */
function fakeScope(ev, name, o) {
  const a = { sent: [], subs: [], unsubs: [], name: name,
    publish: (m) => { a.sent.push(m); return Promise.resolve({ acked: true }); },
    request: (m) => (o && o.request ? o.request(m) : Promise.reject(new E.EventError('no.responder', 'none'))),
    subscribe: (s) => { a.subs.push(s.pattern); return !!(o && o.wait); },
    unsubscribe: (s) => { a.unsubs.push(s.pattern); },
    deliver: (topic, data, extra) => ev._receive(Object.assign({ id: 'x' + Math.random(), topic: topic, data: data, time: 1, source: name, scope: name }, extra)) };
  ev._attach(name, a);
  return a;
}

test('the test clock: timers in time order (those set on the way too), frames, runAll with a limit, seeded random', () => {
  const c = E.testClock({ seed: 7 });
  const seen = [];
  c.setTimeout(() => seen.push('b'), 20);
  c.setTimeout(() => { seen.push('a'); c.setTimeout(() => seen.push('a2'), 5); }, 10);
  const x = c.setTimeout(() => seen.push('never'), 15);
  c.clearTimeout(x);
  assert.equal(c.tick(16), 2);
  assert.deepEqual(seen, ['a', 'a2']);
  assert.equal(c.now(), 1794000000016);
  c.tick(4);
  assert.deepEqual(seen, ['a', 'a2', 'b']);
  c.requestFrame((t) => seen.push('frame@' + (t - 1794000000000)));
  c.setHidden(true);
  assert.equal(c.frame(), 0);
  c.setHidden(false);
  assert.equal(c.frame(), 1);
  assert.equal(seen.pop(), 'frame@20');
  const loop = () => c.setTimeout(loop, 1);
  loop();
  assert.equal(c.runAll(50), 50);
  const r1 = E.testClock({ seed: 7 }).random, r2 = E.testClock({ seed: 7 }).random;
  assert.deepEqual([r1(), r1(), r1()], [r2(), r2(), r2()]);
  assert.notEqual(E.testClock({ seed: 8 }).random(), E.testClock({ seed: 7 }).random());
});

test('topics and patterns: the grammar is drishti-core\'s, words for a bad one, segment() for any text, $ topics are the library\'s own', () => {
  assert.equal(E.checkTopic('prices.fx.USDCAD'), 'prices.fx.USDCAD');
  assert.throws(() => E.checkTopic('prices.*'), /is a pattern/);
  assert.throws(() => E.checkTopic('a b'), (e) => e instanceof E.EventError && e.code === 'topic.invalid' && /segment\(text\)/.test(e.detail));
  assert.throws(() => E.checkTopic('$events.state'), /library's own/);
  assert.throws(() => E.checkTopic(Array(18).fill('a').join('.')), /16 segments/);
  assert.equal(E.checkPattern('$events.*'), '$events.*');
  assert.throws(() => E.checkPattern('a.>.b'), /not a pattern/);
  assert.equal(E.segment('Bank of Canada'), 'Bank~20of~20Canada');
  assert.ok(E.matches('prices.*.USDCAD', 'prices.fx.USDCAD') && E.matches('prices.>', 'prices.fx.USDCAD') && !E.matches('prices.>', 'prices'));
  assert.ok(!E.matches('>', '$events.state') && E.matches('$events.>', '$events.state'));
  assert.ok(E.patternsOverlap('prices.*.USDCAD', 'prices.fx.>') && E.patternsOverlap('>', 'a') && !E.patternsOverlap('ui.>', 'prices.*'));
  assert.ok(!E.patternsOverlap('a.b', 'a.b.c') && E.patternsOverlap('a.*', 'a.>') && !E.patternsOverlap('a.*', 'a.*.c'));
  assert.ok(E.covers('>', 'ui.x') && E.covers('ui.>', 'ui.*.x') && !E.covers('ui.*', 'ui.>') && !E.covers('ui.x', 'ui.*'));
});

test('the page scope is drishti-core\'s shared bus itself: a component\'s plain payloads are heard as messages; publishes reach bus listeners', async () => {
  const ev = E.createEvents({ clock: E.testClock() });
  const got = [], raw = [];
  const off = ev.on('ui.selection.>', (m) => got.push(m));
  const offRaw = coreBus.on('ui.selection.>', (p, t) => raw.push(t));
  coreBus.emit('ui.selection.blotter', { channel: 'blotter', ids: ['A'], source: 'grid' });
  assert.equal(got.length, 1);
  assert.equal(got[0].topic, 'ui.selection.blotter');
  assert.deepEqual(got[0].data.ids, ['A']);
  assert.equal(got[0].scope, 'page');
  assert.equal(got[0].source, 'page');
  const r = await ev.publish('ui.selection.other', { ids: ['B'] });
  assert.deepEqual(r.to, ['page']);
  assert.equal(r.acked, true);
  assert.deepEqual(raw, ['ui.selection.blotter', 'ui.selection.other']);
  assert.equal(got[1].id, r.id);
  assert.ok(E.isMessage(got[1]));
  off(); offRaw();
  coreBus.emit('ui.selection.blotter', {});
  assert.equal(got.length, 2);
  ev.destroy();
});

test('subscribe and publish in the page: wildcards, ids that sort by time, key and kind and meta, where filters, off by pattern and by function', async () => {
  const ev = fresh();
  const a = [], b = [], all = [];
  const fa = (m) => a.push(m.data);
  ev.on('prices.*.USDCAD', fa);
  ev.on('prices.>', (m) => b.push(m.topic));
  ev.on('>', (m) => all.push(m.topic));
  const s = ev.subscribe('prices.>', null, { where: (m) => m.data.bid > 1 });
  const r1 = await ev.publish('prices.fx.USDCAD', { bid: 1.36 }, { key: 'USDCAD', kind: 'tick', meta: { trace: 't1' } });
  await ev.publish('prices.fx.EURUSD', { bid: 0.9 });
  await ev.publish('chat.lobby', { text: 'hi' });
  assert.deepEqual(a, [{ bid: 1.36 }]);
  assert.deepEqual(b, ['prices.fx.USDCAD', 'prices.fx.EURUSD']);
  assert.deepEqual(all, ['prices.fx.USDCAD', 'prices.fx.EURUSD', 'chat.lobby']);
  assert.equal(s.stats.received, 2);
  assert.equal(s.stats.delivered, 1);
  assert.equal(s.stats.drops.filtered, 1);
  assert.equal(s.latest('USDCAD').meta.trace, 't1');
  assert.equal(s.latest().topic, 'prices.fx.USDCAD');
  const ids = [];
  for (let i = 0; i < 5; i++) { ev.clock.tick(1); ids.push((await ev.publish('x.y', i)).id); }
  assert.deepEqual(ids.slice().sort(), ids);
  assert.ok(ids.every((id) => id.length <= E.MAX_ID_LENGTH));
  ev.off('prices.*.USDCAD', fa);
  await ev.publish('prices.fx.USDCAD', { bid: 2 });
  assert.equal(a.length, 1);
  ev.off('prices.>');
  ev.off();
  await ev.publish('prices.fx.USDCAD', { bid: 3 });
  assert.equal(b.length, 3);
  assert.equal(all.length, 9);
  assert.equal(s.state, 'closed');
});

test('a listener that throws does not stop the others; the error is a message on $events.error', async () => {
  const ev = fresh();
  const errs = [], heard = [];
  ev.on('$events.error', (m) => errs.push(m.data));
  ev.on('a.b', () => { throw new Error('boom'); });
  ev.on('a.b', (m) => heard.push(m.data));
  await ev.publish('a.b', 1);
  assert.deepEqual(heard, [1]);
  assert.equal(errs.length, 1);
  assert.equal(errs[0].detail, 'boom');
  assert.equal(errs[0].where, 'listener');
  assert.equal(errs[0].topic, 'a.b');
});

test('routes: the most specific pattern wins; defaults with and without a server; share() adds a scope; publishing to a missing scope says so', async () => {
  const ev = fresh();
  assert.deepEqual(ev.routeOf('prices.fx'), ['page']);
  const srv = fakeScope(ev, 'server');
  assert.deepEqual(ev.routeOf('prices.fx'), ['server']);
  assert.deepEqual(ev.routeOf('ui.theme'), ['page']);
  assert.deepEqual(ev.scopesOf('>'), ['page', 'server']);
  assert.deepEqual(ev.scopesOf('prices.*'), ['server']);
  const r = await ev.publish('prices.fx.USDCAD', { bid: 1 });
  assert.deepEqual(r.to, ['server']);
  assert.equal(srv.sent[0].topic, 'prices.fx.USDCAD');
  const ev2 = fresh({ routes: { 'ui.>': 'page', 'ui.selection.>': ['page', 'tabs'], 'chat.>': 'server' } });
  assert.deepEqual(ev2.routeOf('ui.selection.x'), ['page', 'tabs']);
  assert.deepEqual(ev2.routeOf('ui.theme'), ['page']);
  assert.deepEqual(ev2.routeOf('other'), ['page']);
  await assert.rejects(ev2.publish('chat.lobby', {}), (e) => e.code === 'unrouted' && /connect\(url\)/.test(e.detail));
  const r2 = await ev2.publish('ui.selection.x', { ids: [] });
  assert.deepEqual(r2.to, ['page']);
  assert.deepEqual(r2.unrouted, ['tabs']);
  assert.equal(ev2.counters.drops.unrouted, 2);
  const ev3 = fresh();
  const tabs = fakeScope(ev3, 'tabs');
  const heard = [];
  ev3.on('ui.selection.>', (m) => heard.push(m.scope));
  const off = ev3.share('ui.selection.>', { to: 'tabs' });
  assert.deepEqual(ev3.routeOf('ui.selection.grid'), ['page', 'tabs']);
  await ev3.publish('ui.selection.grid', { ids: ['A'] });
  assert.equal(tabs.sent.length, 1);
  tabs.deliver('ui.selection.grid', { ids: ['B'] });
  assert.deepEqual(heard, ['page', 'tabs']);
  off();
  assert.deepEqual(ev3.routeOf('ui.selection.grid'), ['page']);
  tabs.deliver('ui.selection.grid', { ids: ['C'] });
  assert.deepEqual(heard, ['page', 'tabs']);
  assert.throws(() => ev3.share('ui.>', { to: 'moon' }), /page, tabs or server/);
});

test('a message is heard once from whichever scope brought it: a page\'s publish to the page and the server is not delivered again when the server echoes it', async () => {
  const ev = fresh({ routes: { 'chat.>': ['page', 'server'] } });
  const srv = fakeScope(ev, 'server');
  const heard = [];
  ev.on('chat.>', (m) => heard.push(m.scope));
  const r = await ev.publish('chat.lobby', { text: 'hi' });
  srv.deliver('chat.lobby', { text: 'hi' }, { id: r.id });
  srv.deliver('chat.lobby', { text: 'other' });
  assert.deepEqual(heard, ['page', 'server']);
  assert.equal(ev.counters.drops.duplicate, 1);
});

test('subscriptions in a server scope: pending until the adapter says active, refused with words, sent when the server arrives, told when they end', async () => {
  const ev = fresh();
  const states = [];
  ev.on('$events.subscription', (m) => states.push(m.data.pattern + ':' + m.data.state));
  const s0 = ev.subscribe('prices.>', null, { scope: 'server' });
  assert.equal(s0.state, 'refused');
  await assert.rejects(s0.ready, /no server/);
  const ev2 = fresh({ routes: { 'prices.>': 'server' } });
  const early = ev2.subscribe('prices.>');
  assert.equal(early.state, 'active');                // no server yet: the routes name one, nothing to wait for
  const srv = fakeScope(ev2, 'server', { wait: true });
  assert.deepEqual(srv.subs, ['prices.>']);           // sent when the server arrived
  const s = ev2.subscribe('rates.>', null, { scope: 'server' });
  assert.equal(s.state, 'pending');
  s._setState('active');
  assert.equal(await s.ready, s);
  const t = ev2.subscribe('news.>', null, { scope: 'server' });
  t._setState('refused', 'forbidden');
  await assert.rejects(t.ready, /forbidden/);
  s.off();
  assert.deepEqual(srv.unsubs, ['rates.>']);
  assert.deepEqual(states, ['prices.>:refused']);
});

test('once: the next match, with where, a timeout on the clock and an abort', async () => {
  const ev = fresh();
  const p = ev.once('a.*', { where: (m) => m.data > 1 });
  await ev.publish('a.x', 1);
  await ev.publish('a.y', 2);
  assert.equal((await p).topic, 'a.y');
  const t = ev.once('never', { timeoutMs: 50 });
  ev.clock.tick(51);
  await assert.rejects(t, (e) => e instanceof E.TimeoutError && e.code === 'timeout');
  const ctrl = new AbortController();
  const q = ev.once('never', { signal: ctrl.signal });
  ctrl.abort();
  await assert.rejects(q, (e) => e instanceof E.AbortError);
  assert.equal(ev._subs.size, 0);
});

test('request and reply in the page: the first replier answers, a thrown error is the rejection, no replier says so, timeouts and aborts', async () => {
  const ev = fresh(), other = fresh();
  const off = other.reply('quotes.*', async (m) => ({ symbol: m.data.symbol, bid: 1.3612 }));
  const ans = await ev.request('quotes.get', { symbol: 'CAD' });
  assert.deepEqual(ans.data, { symbol: 'CAD', bid: 1.3612 });
  assert.ok(ans.re && ans.scope === 'page');
  const offFail = ev.reply('fails.now', () => { throw Object.assign(new Error('the book is closed'), { code: 'closed' }); });
  await assert.rejects(ev.request('fails.now', {}), (e) => e.code === 'closed' && e.detail === 'the book is closed');
  await assert.rejects(ev.request('nobody.home', {}), (e) => e.code === 'no.responder');
  const offSlow = ev.reply('slow.one', () => new Promise(() => undefined));
  const slow = ev.request('slow.one', {}, { timeoutMs: 100 });
  await flush();
  ev.clock.tick(101);
  await assert.rejects(slow, E.TimeoutError);
  assert.equal(ev.counters.timedOut, 1);
  let sawAbort = false;
  ev.reply('slow.two', (m) => new Promise(() => { m.signal.addEventListener('abort', () => { sawAbort = true; }); }));
  const ctrl = new AbortController();
  const two = ev.request('slow.two', {}, { signal: ctrl.signal });
  await flush();
  ctrl.abort();
  await assert.rejects(two, E.AbortError);
  assert.ok(sawAbort);
  off(); offFail(); offSlow();
  await assert.rejects(ev.request('quotes.get', {}), (e) => e.code === 'no.responder');
  const srv = fakeScope(ev, 'server', { request: (m) => Promise.resolve({ topic: m.topic, data: 'from server', re: m.id }) });
  assert.equal((await ev.request('quotes.get', {})).data, 'from server');
  assert.ok(srv);
  ev.destroy();
  await assert.rejects(ev.request('x.y', {}), /destroyed/);
});

test('streams: for await over a pattern, ended by an abort or by break; at most the buffer held, the oldest dropped and counted', async () => {
  const ev = fresh();
  const ctrl = new AbortController();
  const got = [];
  const done = (async () => { for await (const m of ev.stream('ticks.>', { signal: ctrl.signal })) { got.push(m.data); if (got.length === 3) { ctrl.abort(); } } })();
  for (let i = 1; i <= 5; i++) { await ev.publish('ticks.a', i); await flush(); }
  await done;
  assert.deepEqual(got, [1, 2, 3]);
  assert.equal(ev._subs.size, 0);
  const it = ev.stream('t.>', { buffer: { max: 2 } })[Symbol.asyncIterator]();
  for (let i = 1; i <= 4; i++) { await ev.publish('t.x', i); }
  assert.deepEqual([(await it.next()).value.data, (await it.next()).value.data], [3, 4]);
  assert.equal(ev.counters.drops.overflow, 2);
  await it.return();
  assert.equal(ev._subs.size, 0);
});

test('typed topics and kinds: shape() checks, invalid inbound dropped with words (or delivered marked), invalid outbound refused', async () => {
  const ev = fresh();
  const tick = E.shape({ symbol: 'string', bid: 'number', ask: 'number', venue: 'string?', legs: [{ side: 'string' }], at: { x: 'number' } });
  assert.equal(tick({ symbol: 'CAD', bid: 1, ask: 2, legs: [{ side: 'b' }], at: { x: 1 } }), true);
  assert.equal(tick({ symbol: 'CAD', bid: 'x', ask: 2, legs: [], at: { x: 1 } }), '`bid` should be a number');
  assert.equal(tick({ symbol: 'CAD', bid: 1, ask: 2, legs: [{ side: 3 }], at: { x: 1 } }), '`legs[0].side` should be a string');
  assert.equal(tick({ symbol: 'CAD', bid: 1, ask: 2, legs: [] }), '`at` is missing');
  const ticks = ev.topic('prices.fx.*', { kind: 'tick', validate: E.shape({ symbol: 'string', bid: 'number' }) });
  const got = [], drops = [];
  ticks.on((m) => got.push(m.data.bid));
  ev.on('$events.drop', (m) => drops.push(m.data.detail));
  await ticks.publish({ symbol: 'CAD', bid: 1.36 }, { topic: 'prices.fx.USDCAD' });
  await assert.rejects(ticks.publish({ symbol: 'CAD', bid: 'x' }, { topic: 'prices.fx.USDCAD' }), (e) => e.code === 'invalid' && /bid/.test(e.detail));
  await assert.rejects(ticks.publish({ symbol: 'CAD', bid: 1 }), /is a pattern/);
  await assert.rejects(ticks.publish({ symbol: 'CAD', bid: 1 }, { topic: 'rates.x' }), /not a topic of/);
  assert.deepEqual(got, [1.36]);
  const marked = [];
  ev.on('in.>', (m) => marked.push(m.invalid || 'ok'), { onInvalid: 'deliver' });
  const srv = fakeScope(ev, 'server');
  ev.on('prices.fx.*', (m) => got.push(m.data.bid));
  srv.deliver('prices.fx.EURUSD', { symbol: 'EUR', bid: 'oops' }, { kind: 'tick' });
  assert.deepEqual(got, [1.36]);
  assert.ok(drops.some((d) => /Dropped as invalid: `bid` should be a number/.test(d)));
  ev.define('row', E.shape({ id: 'string' }));
  ev.publish('in.a', { id: 1 }, { to: 'page', kind: 'row' }).catch(() => undefined);
  srv.deliver('in.b', { id: 2 }, { kind: 'row' });
  assert.deepEqual(marked, ['`id` should be a string']);   // the page's own invalid publish was refused before it was sent
  const ev2 = fresh();
  ev2.define('row', E.shape({ id: 'string' }));
  const seen = [];
  ev2.on('in.>', (m) => seen.push(m.invalid || 'ok'), { onInvalid: 'deliver' });
  ev2.page.publish('in.a', { id: 'A' }, { kind: 'row' });
  const s2 = fakeScope(ev2, 'tabs');
  ev2.share('in.>', { to: 'tabs' });
  s2.deliver('in.b', { id: 2 }, { kind: 'row' });
  assert.deepEqual(seen, ['ok', '`id` should be a string']);
  assert.throws(() => ev.define('', () => true), /a kind is a name/);
});

test('events.page, events.tabs and events.server pin a scope whatever the routes say', async () => {
  const ev = fresh();
  const srv = fakeScope(ev, 'server'), tabs = fakeScope(ev, 'tabs');
  const heard = [];
  ev.page.on('prices.>', (m) => heard.push('page:' + m.data));
  ev.tabs.on('prices.>', (m) => heard.push('tabs:' + m.data));
  await ev.page.publish('prices.a', 1);
  await ev.tabs.publish('prices.a', 2);
  await ev.server.publish('ui.theme', 'dark');
  tabs.deliver('prices.b', 3);
  srv.deliver('prices.c', 4);
  assert.deepEqual(heard, ['page:1', 'tabs:3']);
  assert.equal(tabs.sent[0].data, 2);
  assert.equal(srv.sent[0].topic, 'ui.theme');
});

test('a subscription is a feed (data to subscribe(fn)), a live-set channel (byKind), and keeps the latest per key', async () => {
  const ev = fresh();
  const s = ev.subscribe('set.>');
  const data = [], kinds = [];
  const offFeed = s.subscribe((d, m) => data.push([d, m.topic]));
  const channel = { subscribe: (h) => s.byKind(h) };
  const offKinds = channel.subscribe({ rows: (d) => kinds.push('rows:' + d.n), resync: () => kinds.push('resync'), '*': (d, m) => kinds.push('other:' + m.kind) });
  await ev.publish('set.a', { n: 1 }, { kind: 'rows', key: 'k1' });
  await ev.publish('set.a', { n: 2 }, { kind: 'rows', key: 'k2' });
  await ev.publish('set.a', { n: 3 }, { kind: 'rows', key: 'k1' });
  await ev.publish('set.a', null, { kind: 'resync' });
  await ev.publish('set.a', null, { kind: 'gone' });
  assert.deepEqual(kinds, ['rows:1', 'rows:2', 'rows:3', 'resync', 'other:gone']);
  assert.equal(data.length, 5);
  assert.equal(s.latest('k1').data.n, 3);
  assert.deepEqual(s.latestAll().map((m) => m.data.n), [2, 3]);
  offFeed(); offKinds();
  await ev.publish('set.a', {}, { kind: 'rows' });
  assert.equal(data.length, 5);
});

test('an Events ends with its signal: subscriptions closed, repliers gone, waiting requests rejected, nothing more accepted', async () => {
  const ctrl = new AbortController();
  const ev = fresh({ signal: ctrl.signal });
  const s = ev.subscribe('a.>');
  ev.reply('q.x', () => new Promise(() => undefined));
  const asked = ev.request('q.x', {});
  await flush();
  ctrl.abort();
  assert.equal(s.state, 'closed');
  await assert.rejects(asked, E.AbortError);
  await assert.rejects(fresh().request('q.x', {}), (e) => e.code === 'no.responder');
  assert.throws(() => ev.subscribe('a.>'), /destroyed/);
  assert.equal(ev.state, 'closed');
  assert.equal(fresh().state, 'idle');
});

test('connect() with no address is the page only; the metrics count publishes, deliveries and drops', async () => {
  const ev = E.connect({ bus: new EventBus(), clock: E.testClock() });
  ev.on('a.>', () => undefined, { where: () => false });
  await ev.publish('a.b', 1);
  const m = ev.metrics();
  assert.equal(m.state, 'idle');
  assert.equal(m.counters.published, 1);
  assert.equal(m.counters.drops.filtered, 1);
  assert.equal(m.subscriptions, 1);
});
