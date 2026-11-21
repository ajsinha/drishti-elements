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
/* The painter's state and effects (ViewModel contract 1.2) as pure logic under Node: the marks of a panel in the order the specification
   counts them, the effect list of a mark, running it on the state, and the refusals of the fire cases (tests/support/fire_cases.json:
   every case's steps run on the store with no DOM, the next bind's state taken from the recorded ViewModel). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as V from '../../elements/drishti-views/src/drishti_index.js';

const CASES = JSON.parse(readFileSync(new URL('../support/fire_cases.json', import.meta.url), 'utf8')).cases;

test('marks count depth first through children, bars, points, steps, x positions and the one mark of a figure', () => {
  const tree = { kind: 'table', data: { rows: [{ set: { n: 'A' }, children: [{ set: { n: 'A1' } }, { set: { n: 'A2' }, children: [{}] }] }, { set: { n: 'B' } }] } };
  assert.deepEqual(V.marksOf(tree).map((m) => (m.set ? m.set.n : '-')), ['A', 'A1', 'A2', '-', 'B']);
  assert.equal(V.marksOf({ kind: 'hbar', data: { bars: [{}, {}, {}] } }).length, 3);
  const line = V.marksOf({ kind: 'line', data: { x: ['1Y', '5Y'], set: [{ t: '1Y' }, null], on: [null, { 'point-click': [{ do: 'notify', text: 'x' }] }] } });
  assert.equal(line.length, 2);
  assert.deepEqual(V.effectsOf(line[0], 'point-click'), [{ do: 'set', state: 't', value: '1Y' }]);
  assert.deepEqual(V.effectsOf(line[1], 'point-click'), [{ do: 'notify', text: 'x' }]);
  assert.equal(V.marksOf({ kind: 'metric', data: { value: {} } }).length, 1);
  assert.equal(V.marksOf({ kind: 'pivot', data: {} }).length, 0);
  assert.equal(V.triggerFor('table'), 'row-click');
  assert.equal(V.triggerFor('hbar'), 'bar-click');
  assert.equal(V.triggerFor('scatter'), 'point-click');
  assert.equal(V.triggerFor('markdown'), null);
});

test('a mark with an on list runs it, else its set; nothing otherwise', () => {
  assert.deepEqual(V.effectsOf({ on: { 'row-click': [{ do: 'toggle', state: 'x' }] }, set: { a: 1 } }, 'row-click'), [{ do: 'toggle', state: 'x' }]);
  assert.deepEqual(V.effectsOf({ set: { a: 1, b: 'q' } }, 'row-click'), [{ do: 'set', state: 'a', value: 1 }, { do: 'set', state: 'b', value: 'q' }]);
  assert.deepEqual(V.effectsOf({}, 'row-click'), []);
  assert.equal(V.hasEffects({}), false);
  assert.equal(V.hasEffects({ set: {} }), true);
});

test('the store runs set, toggle and clear in order and hands notify and host back untouched', () => {
  const s = new V.StateStore();
  s.load([{ id: 'open', value: false, reads: ['a'] }, { id: 'order', value: 'X', reads: ['b', 'a'] }, { id: 'list', value: ['p', 'q'], reads: [] }]);
  const r = s.run([{ do: 'toggle', state: 'open' }, { do: 'set', state: 'order', value: 'Y' }, { do: 'host', action: 'x.y', with: { n: 1 } }, { do: 'notify', text: 't', tone: 'ok' }, { do: 'toggle', state: 'open' }, { do: 'clear', state: 'order' }]);
  assert.deepEqual(r.ran.map((e) => e.do), ['toggle', 'set', 'host', 'notify', 'toggle', 'clear']);
  assert.deepEqual(r.ran.filter((e) => e.do === 'toggle').map((e) => e.value), [true, false]);
  assert.deepEqual(r.changed, ['open', 'order']);
  assert.deepEqual(s.values(), { open: false, list: ['p', 'q'] });
  assert.deepEqual(s.request(), { open: 'false', list: 'p,q' });                      // a cleared state is not carried; a list's items are joined by commas
  assert.deepEqual(s.readers(['open', 'order']), ['a', 'b']);
  assert.equal(s.readers(['ghost']), null);
});

test('the refusals carry RCH-5001 and the words of the specification', () => {
  const panel = { id: 'orders', kind: 'table', data: { rows: [{}, {}] } };
  assert.equal(V.resolveFire(null, 'ghost', 'row-click').problems[0].message, "no panel 'ghost' on the screen");
  assert.equal(V.resolveFire(panel, 'orders', 'bar-click').problems[0].message, "panel 'orders' (table) does not fire bar-click");
  assert.equal(V.resolveFire(panel, 'orders', 'row-click', 2).problems[0].message, "panel 'orders' shows no mark 2 (it shows 2)");
  assert.equal(V.resolveFire(panel, 'orders', 'row-click', 1).problems.length, 0);
  assert.equal(V.resolveFire(panel, 'orders', 'row-click').problems.length, 0);            // the mark defaults to 0
});

for (const c of CASES) {
  test('fire case ' + c.id + ' on the store', () => {
    const store = new V.StateStore(), live = (vm) => new Map(vm.panels.map((p) => [p.id, p]));
    store.load(c.viewModel.state);
    let panels = live(c.viewModel);
    c.steps.forEach((st, i) => {
      const found = V.resolveFire(panels.get(st.panel) || null, st.panel, st.trigger, st.mark === null ? undefined : st.mark);
      const want = st.expect;
      if (want.problems !== undefined) { assert.deepEqual(found.problems.map((p) => [p.code, p.message]), want.problems.map((p) => [p.code, p.message]), c.id + ' step ' + i); }
      const ran = found.problems.length ? [] : store.run(found.effects).ran;
      if (want.effects !== undefined) { assert.deepEqual(ran, want.effects, c.id + ' step ' + i); }
      store.load(st.viewModel.state);                                                  // the next bind answers the screen
      panels = live(st.viewModel);
      if (want.state !== undefined) {
        const keep = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null));
        assert.deepEqual(keep(store.values()), keep(want.state), c.id + ' step ' + i);
      }
    });
  });
}
