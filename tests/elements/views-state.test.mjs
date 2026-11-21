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
    let panels = live(c.viewModel), controls = c.viewModel.controls || [];
    c.steps.forEach((st, i) => {
      const wired = st.control !== null || ['submit', 'cancel', 'action'].includes(st.trigger);
      let found = st.control !== null ? V.resolveWire(null, st.control, 'change', { control: controls.find((x) => x.id === st.control) || null, value: st.value })
        : wired ? V.resolveWire(panels.get(st.panel) || null, st.panel, st.trigger, { mark: st.mark === null ? undefined : st.mark, values: st.values || undefined })
          : V.resolveFire(panels.get(st.panel) || null, st.panel, st.trigger, st.mark === null ? undefined : st.mark);
      const rules = st.trigger === 'submit' ? st.actual.problems.filter((p) => p.code === 'RCH-5003') : [];
      if (!found.problems.length && rules.length) { found = { problems: rules, effects: [] }; }    // the form's rules: the runtime's answer as recorded
      const want = st.expect;
      if (want.problems !== undefined) { assert.deepEqual(found.problems.map((p, k) => [p.code, p.message.slice(0, want.problems[k] && want.problems[k].message === undefined ? (want.problems[k].messageStart || '').length : undefined)]), want.problems.map((p) => [p.code, p.message === undefined ? p.messageStart : p.message]), c.id + ' step ' + i); }
      const ran = found.problems.length ? [] : (wired ? store.run(found.effects, found.event) : store.run(found.effects)).ran;
      if (want.effects !== undefined) { assert.deepEqual(ran, want.effects, c.id + ' step ' + i); }
      store.load(st.viewModel.state);                                                  // the next bind answers the screen
      panels = live(st.viewModel);
      controls = st.viewModel.controls || controls;
      if (want.state !== undefined) {
        const keep = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null));
        assert.deepEqual(keep(store.values()), keep(want.state), c.id + ' step ' + i);
      }
    });
  });
}

test('the donut shape of an hbar: a slice carries its bar, so a click names the bar by its own object', async () => {
  const C = await import('../../elements/drishti-chart/src/drishti_index.js');
  const bars = [{ label: 'A', value: 3, text: '3', set: { d: 'A' } }, { label: 'skipped', value: null }, { label: 'C', value: 1, text: '1', on: { 'bar-click': [{ do: 'notify', text: 'x' }] } }];
  const opt = C.panelOption('donut', { bars }, { surface: '#fff', border: '#ccc', ink: '#000', muted: '#888', mono: 'monospace', palette: ['#1', '#2'] }, null);
  const data = opt.series[0].data;
  assert.equal(data.length, 2);                                       // a bar with no value draws no slice
  assert.equal(data[1].bar, bars[2]);                                  // the slice is found again in the panel's bars (index 2, not 1)
  assert.equal(V.marksOf({ kind: 'hbar', data: { shape: 'donut', bars } }).indexOf(data[1].bar), 2);
  assert.equal(V.triggerFor('hbar'), 'bar-click');
});

test('pickEvent reads a field of the event, dotted, or the whole of it', () => {
  assert.equal(V.pickEvent({ a: { b: 3 } }, 'a.b'), 3);
  assert.deepEqual(V.pickEvent({ a: 1 }, ''), { a: 1 });
  assert.equal(V.pickEvent('EMEA', ''), 'EMEA');
  assert.equal(V.pickEvent({ a: 1 }, 'x.y'), null);
});

test('running effects with an event: set takes its field, a host effect is filled from withEvent, nothing is evaluated', () => {
  const s = new V.StateStore();
  s.load([{ id: 'qty', value: 0 }, { id: 'sent', value: false }]);
  const r = s.run([{ do: 'set', state: 'qty', event: 'qty' }, { do: 'toggle', state: 'sent' },
    { do: 'host', action: 'order.place', with: { desk: 'FX' }, withEvent: { side: 'side', all: '' } }], { side: 'BUY', qty: 5 });
  assert.deepEqual(s.values(), { qty: 5, sent: true });
  assert.deepEqual(r.ran[2], { do: 'host', action: 'order.place', with: { desk: 'FX', side: 'BUY', all: { side: 'BUY', qty: 5 } } });
  s.run([{ do: 'set', state: 'qty', event: '' }], 7);
  assert.equal(s.get('qty'), 7);                                       // a control's event is the value itself
});

test('resolveWire: submit and cancel of a form, an action by its place, a control change, and the refusals', () => {
  const form = { id: 't', kind: 'form', form: { fields: [{ id: 'qty' }, { id: 'side' }] }, data: { values: {}, on: { submit: [{ do: 'toggle', state: 'x' }], cancel: [] } },
    actions: [{ id: 'a', label: 'A', effects: [{ do: 'clear', state: 'x' }] }] };
  assert.deepEqual(V.resolveWire(form, 't', 'submit', { values: { qty: 1 } }), { problems: [], effects: [{ do: 'toggle', state: 'x' }], event: { qty: 1 } });
  assert.equal(V.resolveWire(form, 't', 'submit', { values: { extra: 1 } }).problems[0].message, "the form of panel 't' has no field 'extra'");
  assert.deepEqual(V.resolveWire(form, 't', 'cancel', { values: { extra: 1 } }).problems, []);       // cancel checks nothing
  assert.equal(V.resolveWire(form, 't', 'action', { mark: 0 }).effects.length, 1);
  assert.equal(V.resolveWire(form, 't', 'action', { mark: 1 }).problems[0].message, "panel 't' has no action 1 (it has 1)");
  assert.equal(V.resolveWire(null, 'z', 'submit').problems[0].message, "no panel 'z' on the screen");
  assert.equal(V.resolveWire({ id: 'm', kind: 'metric' }, 'm', 'submit').problems[0].code, 'RCH-5001');
  const ctl = { id: 'region', on: { change: [{ do: 'set', state: 'p', event: '' }] } };
  assert.deepEqual(V.resolveWire(null, 'region', 'change', { control: ctl, value: 'EMEA' }), { problems: [], effects: ctl.on.change, event: 'EMEA' });
  assert.equal(V.resolveWire(null, 'nothing', 'change', { control: null }).problems[0].message, "no control 'nothing' on the screen");
});

test('formSchema draws the fields as an object schema; problemsByField puts each message at its field', () => {
  const panel = { id: 't', kind: 'form', data: { values: { side: 'SELL', qty: null } }, form: { fields: [
    { id: 'side', label: 'Side', type: 'enum', required: true, options: [{ value: 'BUY', label: 'Buy' }, { value: 'SELL', label: 'Sell' }] },
    { id: 'qty', label: 'Quantity', type: 'number', required: true, min: 1 }, { id: 'book', label: 'Book' }],
    rules: [{ rule: 'qty <= 1000', message: 'At most 1,000', fields: ['qty'] }] } };
  const sc = V.formSchema(panel);
  assert.deepEqual(sc.required, ['side', 'qty']);
  assert.deepEqual(sc.properties.side.enum, ['BUY', 'SELL']);
  assert.deepEqual(sc.properties.side.enumLabels, ['Buy', 'Sell']);
  assert.equal(sc.properties.qty.type, 'number'); assert.equal(sc.properties.qty.minimum, 1); assert.equal(sc.properties.book.type, 'string');
  assert.deepEqual(V.formValues(panel), { side: 'SELL' });             // the empty ones left out
  assert.deepEqual(V.problemsByField(panel, [{ message: 'At most 1,000' }, { message: 'Side is required' }, { message: 'something else' }]),
    { qty: 'At most 1,000', side: 'Side is required; something else' });
});
