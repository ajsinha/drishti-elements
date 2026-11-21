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
/* drishti-events under Node, step 6 (the offline queue): publishes held while the connection is down and sent in order when it is back,
   each until acknowledged; the bounds (messages, bytes, age, a publish's ttl) refused in words or dropping the oldest; persistence by
   choice (a stand-in store and a stand-in IndexedDB), a reload's leftovers sent first and by one tab at a time (a stand-in Web Lock),
   clearOutbox, signOut, and the figures. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../elements/drishti-events/src/drishti_index.js';
import { EventBus } from '../../elements/drishti-core/src/drishti_index.js';

const flush = async (n) => { for (let i = 0; i < (n || 4); i++) { await new Promise((r) => setImmediate(r)); } };

class FakeWS extends EventTarget {
  constructor(url) { super(); this.url = url; this.sent = []; this.bufferedAmount = 0; FakeWS.all.push(this); }
  send(t) { this.sent.push(JSON.parse(t)); }
  close(code) { this.closedWith = code || 1000; }
  open() { this.dispatchEvent(new Event('open')); }
  recv(x) { this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(x) })); }
  drop(code) { this.dispatchEvent(Object.assign(new Event('close'), { code: code || 1006 })); }
  frames(t) { return this.sent.flat().filter((f) => !t || f.t === t); }
  static last() { return FakeWS.all[FakeWS.all.length - 1]; }
}
FakeWS.all = [];
const WELCOME = { t: 'welcome', v: 1, session: 's-1', heartbeatMs: 1000000, can: ['publish'], resumed: false };

async function make(o, env) {
  const clock = (o && o.clock) || E.testClock();
  const ev = E.connect('wss://example.org/events', Object.assign({ bus: new EventBus(), clock: clock, env: Object.assign({ WebSocket: FakeWS, window: {} }, env) }, o));
  await flush();
  return { ev: ev, clock: clock, ws: FakeWS.last() };
}
const up = (ws) => { ws.open(); ws.recv(WELCOME); };

/** A stand-in Web Lock manager: one holder per name at a time. */
function fakeLocks() {
  const tails = new Map();
  const l = { asked: [], request: (name, fn) => {
    l.asked.push(name);
    const prev = tails.get(name) || Promise.resolve();
    const run = prev.then(() => fn());
    tails.set(name, run.catch(() => undefined));
    return run;
  } };
  return l;
}

test('while the connection is down publishes wait in order; when it opens they leave in order, each acknowledged before it is removed', async () => {
  FakeWS.all = [];
  const { ev, ws } = await make();
  const done = [];
  const ps = [1, 2, 3].map((n) => ev.publish('chat.x', n).then((r) => { done.push(n); return r; }));
  const noAck = ev.publish('chat.x', 4, { ack: false });
  assert.equal(ev.metrics().outbox.count, 4);
  assert.equal(ev.metrics().outbox.persisted, false);
  up(ws);
  await flush();
  assert.deepEqual(ws.frames('pub').map((f) => f.data), [1, 2, 3, 4]);
  assert.equal((await noAck).acked, false);
  assert.equal(ev.metrics().outbox.count, 3);
  ws.recv({ t: 'ok', id: ws.frames('pub')[1].id });
  await flush();
  assert.deepEqual(done, [2]);
  ws.drop();
  ev.clock.tick(60000);
  const ws2 = FakeWS.last();
  up(ws2);
  await flush();
  assert.deepEqual(ws2.frames('pub').map((f) => f.data), [1, 3]);       // sent again, in order, the acknowledged one not
  ws2.recv([{ t: 'ok', id: ws2.frames('pub')[0].id }, { t: 'ok', id: ws2.frames('pub')[1].id }]);
  await Promise.all(ps);
  assert.equal(ev.metrics().outbox.count, 0);
  assert.equal(ev.metrics().server.out.retried, 2);
  assert.equal(await ev.flush(), 0);
  ev.destroy();
});

test('the bounds: past max messages or bytes a publish is refused in words; with drop-oldest the oldest goes (rejected, counted)', async () => {
  FakeWS.all = [];
  const a = await make({ outbox: { max: 2 } });
  a.ev.publish('chat.x', 1).catch(() => undefined);
  a.ev.publish('chat.x', 2).catch(() => undefined);
  await assert.rejects(a.ev.publish('chat.x', 3), (e) => e.code === 'limit.outbox' && /2 messages wait already \(the limit is 2\)/.test(e.detail));
  const b = await make({ outbox: { maxBytes: 200 } });
  b.ev.publish('chat.x', 'x'.repeat(80)).catch(() => undefined);
  await assert.rejects(b.ev.publish('chat.x', 'y'.repeat(80)), /would pass 200 bytes/);
  const c = await make({ outbox: { max: 2, overflow: 'drop-oldest' } });
  const drops = [];
  c.ev.on('$events.drop', (m) => drops.push(m.data.reason + ':' + m.data.topic));
  const first = c.ev.publish('chat.one', 1);
  c.ev.publish('chat.two', 2).catch(() => undefined);
  c.ev.publish('chat.three', 3).catch(() => undefined);
  await assert.rejects(first, (e) => e.code === 'dropped');
  assert.deepEqual(drops, ['overflow:chat.one']);
  assert.throws(() => E.connect('/x', { bus: new EventBus(), outbox: { overflow: 'sideways' } }), /drop-oldest/);
  [a, b, c].forEach((x) => x.ev.destroy());
});

test('age: a publish with ttlMs, or older than the queue\'s age, is dropped as expired (even while nothing else happens)', async () => {
  FakeWS.all = [];
  const { ev, clock, ws } = await make({ outbox: { maxAgeMs: 60000 } });
  const drops = [];
  ev.on('$events.drop', (m) => drops.push(m.data.reason));
  const short = ev.publish('chat.x', 1, { ttlMs: 5000 });
  const long = ev.publish('chat.x', 2);
  clock.tick(5000);
  await assert.rejects(short, (e) => e.code === 'expired');
  clock.tick(55000);
  await assert.rejects(long, (e) => e.code === 'expired' && /60 s/.test(e.detail));
  assert.deepEqual(drops, ['expired', 'expired']);
  up(ws);
  await flush();
  assert.equal(ws.frames('pub').length, 0);
  ev.destroy();
});

test('queue: false fails at once when not connected; an abort before sending takes the publish back', async () => {
  FakeWS.all = [];
  const { ev, ws } = await make();
  await assert.rejects(ev.publish('chat.x', 1, { queue: false }), /asked not to wait/);
  const ctrl = new AbortController();
  const p = ev.publish('chat.x', 2, { signal: ctrl.signal });
  ctrl.abort();
  await assert.rejects(p, (e) => e.code === 'aborted');
  up(ws);
  await flush();
  assert.equal(ws.frames('pub').length, 0);
  ev.destroy();
});

test('persisted by choice: kept in the store until acknowledged; after a reload the leftovers are sent first, by one tab at a time', async () => {
  FakeWS.all = [];
  const store = E.memoryStore();
  const locks = fakeLocks();
  const one = await make({ outbox: { store: store }, namespace: 'app.u1' }, { locks: locks });
  one.ev.publish('chat.x', 'memory only').catch(() => undefined);
  one.ev.publish('chat.x', 'kept', { queue: 'persist' }).catch(() => undefined);
  await flush();
  assert.deepEqual((await store.all()).map((r) => r.frame.data), ['kept']);
  assert.equal(one.ev.metrics().outbox.persisted, true);
  one.ev.destroy();                                                        // the page is reloaded before it was sent
  const two = await make({ outbox: { store: store, persist: true }, namespace: 'app.u1' }, { locks: locks });
  const three = await make({ outbox: { store: store }, namespace: 'app.u1' }, { locks: locks });
  two.ev.publish('chat.x', 'new').catch(() => undefined);
  up(two.ws);
  await flush(8);
  assert.deepEqual(locks.asked, ['drishti-events.outbox.app.u1']);
  assert.deepEqual(two.ws.frames('pub').map((f) => f.data), ['kept', 'new']);   // the reload's leftovers first, then this page's own
  up(three.ws);
  await flush(8);
  assert.equal(three.ws.frames('pub').length, 0);                          // the second tab waits for the lock
  two.ws.frames('pub').forEach((f) => two.ws.recv({ t: 'ok', id: f.id }));
  await flush(8);
  two.clock.tick(200);
  await flush(8);
  assert.deepEqual(await store.all(), []);
  assert.equal(three.ws.frames('pub').length, 0);                          // nothing left to send twice
  two.ev.destroy(); three.ev.destroy();
});

test('the IndexedDB store over a stand-in: put, all, delete, clear; no IndexedDB, no persistence (memory, and the figures say so)', async () => {
  const fake = fakeIndexedDB();
  const st = E.indexedDbStore({ namespace: 'app', indexedDB: fake });
  assert.equal(fake.opened, null);
  await st.put({ id: 'a', frame: { t: 'pub', id: 'a' }, at: 1 });
  await st.put({ id: 'b', frame: { t: 'pub', id: 'b' }, at: 2 });
  assert.equal(fake.opened, 'drishti-events.app');
  assert.deepEqual((await st.all()).map((r) => r.id), ['a', 'b']);
  await st.delete('a');
  assert.deepEqual((await st.all()).map((r) => r.id), ['b']);
  await st.clear();
  assert.deepEqual(await st.all(), []);
  assert.equal(E.indexedDbStore({}), null);
  FakeWS.all = [];
  const { ev, ws } = await make({ outbox: { persist: true } });
  ev.publish('chat.x', 1).catch(() => undefined);
  assert.equal(ev.metrics().outbox.persisted, false);
  assert.equal(ev.metrics().outbox.count, 1);
  up(ws);
  await flush();
  assert.deepEqual(ws.frames('pub').map((f) => f.data), [1]);           // still sent: the queue is memory here
  ev.destroy();
});

test('clearOutbox rejects what waits and empties the store; signOut also forgets the stream positions and the session', async () => {
  FakeWS.all = [];
  const store = E.memoryStore();
  const { ev, ws } = await make({ outbox: { store: store, persist: true } });
  up(ws);
  ws.recv({ t: 'msg', id: 'm1', topic: 'a.b', data: 1 });
  ws.drop();
  const p = ev.publish('chat.x', 1);
  await flush();
  assert.equal((await store.all()).length, 1);
  assert.equal(await ev.clearOutbox(), 1);
  await assert.rejects(p, (e) => e.code === 'cleared');
  assert.deepEqual(await store.all(), []);
  const q = ev.publish('chat.x', 2);
  const conn = ev._adapter('server');
  conn.lastEventId = 'c-9';
  await ev.signOut();
  await assert.rejects(q, (e) => e.code === 'cleared');
  assert.equal(conn.lastEventId, null);
  assert.equal(conn.session, null);
  ev.destroy();
});

/** A stand-in IndexedDB with one object store, enough for the queue's calls (requests answer on a later turn, as the browser's do). */
function fakeIndexedDB() {
  const data = new Map();
  const later = (f) => setImmediate(f);
  const fake = { opened: null };
  fake.open = (name) => {
    fake.opened = name;
    const r = {};
    later(() => {
      r.result = { createObjectStore: () => undefined, transaction: () => {
        const t = {};
        const req = (fn) => { const q = {}; later(() => { q.result = fn(); later(() => t.oncomplete && t.oncomplete()); }); return q; };
        t.objectStore = () => ({ put: (e) => req(() => { data.set(e.id, e); }), delete: (id) => req(() => { data.delete(id); }),
          getAll: () => req(() => Array.from(data.values())), clear: () => req(() => { data.clear(); }) });
        return t;
      } };
      if (r.onupgradeneeded) { r.onupgradeneeded(); }
      r.onsuccess();
    });
    return r;
  };
  return fake;
}
