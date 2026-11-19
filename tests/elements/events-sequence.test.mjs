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
/* drishti-events under Node, step 4 (the sequencer): order, repeats, gaps with replay and the wait, resume with epochs, silence, bounds,
   and a seeded property test (every message delivered once and in order whatever the arrival order and repeats), all on the test clock. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequencer, SEQUENCE_LIMITS } from '../../elements/drishti-events/src/drishti_sequence.js';
import { testClock, seededRandom } from '../../elements/drishti-events/src/drishti_timing.js';

const msg = (seq, stream, extra) => Object.assign({ id: 'm' + seq, topic: 'prices.fx', stream: stream || 'prices.fx', seq: seq }, extra);
const seqs = (list) => list.map((m) => m.seq);
function make(o) {
  const clock = testClock();
  const log = { replay: [], gap: [], resync: [], release: [], stale: [], fresh: 0 };
  const s = new Sequencer(Object.assign({ clock: clock,
    onReplay: (r) => log.replay.push(r), onGap: (g) => log.gap.push(g), onResync: (r) => log.resync.push(r),
    onRelease: (l) => log.release.push(seqs(l)), onStale: (x) => log.stale.push(x), onFresh: () => { log.fresh++; } }, o));
  return { s, clock, log };
}

test('in order, then a repeat and an old message are dropped and counted', () => {
  const { s } = make();
  assert.deepEqual(seqs(s.accept(msg(10))), [10]);                       // the first heard is where the stream begins for us
  assert.deepEqual(seqs(s.accept(msg(11))), [11]);
  assert.deepEqual(s.accept(msg(11)), []);
  assert.deepEqual(s.accept(msg(9)), []);
  assert.deepEqual(seqs(s.accept(msg(12))), [12]);
  assert.deepEqual(s.stats, { received: 5, gaps: 0, missed: 0, repeats: 2, stale: 0 });
  assert.deepEqual(s.positions(), { 'prices.fx': { epoch: null, seq: 12 } });
});

test('a gap holds what follows, asks for the range once, and delivers everything in order when it arrives', () => {
  const { s, log, clock } = make();
  s.accept(msg(1));
  assert.deepEqual(s.accept(msg(4)), []);
  assert.deepEqual(s.accept(msg(5)), []);
  assert.deepEqual(log.replay, [{ stream: 'prices.fx', epoch: null, from: 2, to: 3 }]);      // asked once, for what is missing before the first held
  assert.equal(s.held(), 2);
  assert.deepEqual(seqs(s.accept(msg(2, null, { replayed: true }))), [2]);
  assert.deepEqual(seqs(s.accept(msg(3, null, { replayed: true }))), [3, 4, 5]);
  assert.equal(s.held(), 0);
  assert.equal(clock.pending(), 0);                                                         // the wait's timer was cancelled
  assert.deepEqual(s.stats.gaps, 0);
});

test('a gap that is not filled in gapWaitMs: the held messages are delivered, the range reported, the stream resynced', () => {
  const { s, log, clock } = make({ gapWaitMs: 2000 });
  s.accept(msg(1));
  s.accept(msg(5)); s.accept(msg(6));
  clock.tick(1999);
  assert.deepEqual(log.release, []);
  clock.tick(1);
  assert.deepEqual(log.release, [[5, 6]]);
  assert.deepEqual(log.gap, [{ stream: 'prices.fx', from: 2, to: 4, recoverable: false }]);
  assert.deepEqual(log.resync, [{ stream: 'prices.fx', reason: 'timeout' }]);
  assert.deepEqual(s.stats, { received: 3, gaps: 1, missed: 3, repeats: 0, stale: 0 });
  assert.deepEqual(seqs(s.accept(msg(7))), [7]);                                              // and carries on from there
});

test('two holes: both ranges are reported when the wait ends; without replay a gap resyncs at once', () => {
  const a = make();
  a.s.accept(msg(1)); a.s.accept(msg(3)); a.s.accept(msg(6));
  a.clock.tick(2000);
  assert.deepEqual(a.log.gap.map((g) => [g.from, g.to]), [[2, 2], [4, 5]]);
  assert.deepEqual(a.log.release, [[3, 6]]);
  const b = make({ canReplay: false });
  b.s.accept(msg(1));
  assert.deepEqual(seqs(b.s.accept(msg(4))), [4]);
  assert.deepEqual(b.log.replay, []);
  assert.deepEqual(b.log.gap, [{ stream: 'prices.fx', from: 2, to: 3, recoverable: false }]);
  assert.equal(b.log.resync.length, 1);
});

test('held messages are bounded: past maxHeld they are delivered and the stream resyncs', () => {
  const { s, log } = make({ maxHeld: 3 });
  s.accept(msg(1));
  s.accept(msg(10)); s.accept(msg(11)); s.accept(msg(12));
  assert.deepEqual(log.resync, []);
  const out = s.accept(msg(13));
  assert.deepEqual(seqs(out), [10, 11, 12, 13]);
  assert.deepEqual(log.resync, [{ stream: 'prices.fx', reason: 'overflow' }]);
  assert.equal(SEQUENCE_LIMITS.held, 5000);
});

test('the server\'s gap frame: a recoverable range is asked for again; an unrecoverable one is declared lost and what follows is delivered', () => {
  const { s, log } = make();
  s.accept(msg(1));
  s.accept(msg(6));
  assert.deepEqual(s.serverGap({ stream: 'prices.fx', from: 2, to: 4, recoverable: true }), []);
  assert.deepEqual(log.replay.map((r) => [r.from, r.to]), [[2, 5], [2, 4]]);
  const out = s.serverGap({ stream: 'prices.fx', from: 2, to: 5, recoverable: false });
  assert.deepEqual(seqs(out), [6]);
  assert.deepEqual(log.gap, [{ stream: 'prices.fx', from: 2, to: 5, recoverable: false }]);
  assert.equal(s.stats.missed, 4);
});

test('messages with no seq are deduplicated by id in a window of the last 2,048', () => {
  const { s } = make({ idWindow: 3 });
  const m = (id) => ({ id: id, topic: 'a.b', data: 1 });
  assert.equal(s.accept(m('a')).length, 1);
  assert.equal(s.accept(m('a')).length, 0);
  ['b', 'c', 'd'].forEach((id) => s.accept(m(id)));            // 'a' falls out of the window of three
  assert.equal(s.accept(m('a')).length, 1);
  assert.equal(s.accept({ topic: 'a.b' }).length, 1);          // no id: nothing to deduplicate by
  assert.equal(s.stats.repeats, 1);
});

test('streams are independent, and the least recently heard of too many is forgotten', () => {
  const { s } = make({ maxStreams: 2 });
  s.accept(msg(1, 'a')); s.accept(msg(1, 'b'));
  assert.deepEqual(seqs(s.accept(msg(2, 'a'))), [2]);          // a is the most recent now
  s.accept(msg(1, 'c'));                                       // b is forgotten
  assert.deepEqual(Object.keys(s.positions()).sort(), ['a', 'c']);
  assert.deepEqual(seqs(s.accept(msg(7, 'b'))), [7]);          // b begins again, as a stream heard for the first time
});

test('resume: positions say where each stream was; the server\'s answer decides whether it is whole', () => {
  const { s, log } = make();
  s.accept(msg(41)); s.accept(msg(42));
  s.resumed({ 'prices.fx': { epoch: 'a1', seq: 42 } }, true);
  assert.deepEqual(s.positions(), { 'prices.fx': { epoch: 'a1', seq: 42 } });
  assert.deepEqual(log.resync, []);
  assert.deepEqual(seqs(s.accept(msg(43))), [43]);
  assert.deepEqual(s.resumed({ 'prices.fx': { epoch: 'a1', seq: 90 } }, false), ['prices.fx']);       // too long ago: resync from the server's position
  assert.deepEqual(log.resync, [{ stream: 'prices.fx', reason: 'unrecovered' }]);
  assert.deepEqual(seqs(s.accept(msg(91))), [91]);
  assert.deepEqual(s.resumed({ 'prices.fx': { epoch: 'b2', seq: 5 } }, true), ['prices.fx']);          // a new epoch: the numbering began again
  assert.deepEqual(log.resync[1], { stream: 'prices.fx', reason: 'epoch' });
  assert.deepEqual(seqs(s.accept(msg(6))), [6]);
});

test('resume drops the messages held for a gap of the old numbering', () => {
  const { s, clock } = make();
  s.accept(msg(1)); s.accept(msg(5));
  assert.equal(s.held(), 1);
  s.resumed({ 'prices.fx': { epoch: 'x', seq: 100 } }, false);
  assert.equal(s.held(), 0);
  assert.equal(clock.pending(), 0);
});

test('silence: stale once after staleMs, fresh when the stream speaks, stale again after more silence; a stop ends the watch', () => {
  const { s, log, clock } = make();
  const stop = s.watch('prices.fx', 1000);
  clock.tick(999);
  assert.deepEqual(log.stale, []);
  clock.tick(1);
  assert.equal(log.stale.length, 1);
  assert.equal(s.isStale('prices.fx'), true);
  clock.tick(5000);
  assert.equal(log.stale.length, 1);                            // once
  s.accept(msg(1));
  assert.equal(log.fresh, 1);
  assert.equal(s.isStale('prices.fx'), false);
  clock.tick(1000);
  assert.equal(log.stale.length, 2);
  assert.equal(s.stats.stale, 2);
  stop();
  assert.equal(clock.pending(), 0);
  assert.equal(typeof s.watch('x', 0), 'function');             // 0: not watched
});

test('property: whatever the arrival order and repeats, every message is delivered once and in order when the missing ones arrive in time', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const rnd = seededRandom(seed), { s, clock } = make({ maxHeld: 5000 });
    const n = 60, order = Array.from({ length: n }, (_, i) => i + 1);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const arrivals = order.slice(0, 0);
    order.forEach((q) => { arrivals.push(q); if (rnd() < 0.3) { arrivals.push(q); } });
    const got = [];
    const take = (l) => l.forEach((m) => got.push(m.seq));
    s.accept(msg(1)).forEach((m) => got.push(m.seq));
    arrivals.filter((q) => q !== 1).forEach((q) => take(s.accept(msg(q))));
    s.accept(msg(1));
    assert.deepEqual(got, Array.from({ length: n }, (_, i) => i + 1), 'seed ' + seed);
    assert.equal(s.held(), 0);
    assert.equal(clock.pending(), 0);
  }
});
