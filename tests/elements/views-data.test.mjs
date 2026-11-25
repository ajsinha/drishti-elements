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
/* drishti-views' datasets under Node (contract 1.1): the forms of a dataset, rows patches by key in their order
   (reset, remove, update, add), derived reads (groups, aggregations, the top categories), raw values formatted by the field's format with
   the mask, the data allow-list, the inline-rows bound, the minimal stamp of the builders, and the grid's columns and the chart's spec
   made from a dataset. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../../elements/drishti-views/src/drishti_index.js';

const FIELDS = [{ name: 'id', type: 'string' }, { name: 'desk', type: 'string', label: 'Desk' }, { name: 'n', type: 'number', fmt: 'amount0' }];
const ROWS = [['A', 'Rates', 10], ['B', 'FX', 5], ['C', 'Rates', 7]];

test('inline values become rows with their fields; a dataset is shared by name and reads nothing until asked', async () => {
  const sets = V.datasetsOf({ datasets: { t: { key: ['id'], fields: FIELDS, values: ROWS }, o: { rows: [{ a: 1, d: '2026-01-02' }] } } }, {});
  const t = sets.get('t');
  assert.equal(t.form, 'values');
  assert.deepEqual((await t.rows()).map((r) => r.n), [10, 5, 7]);
  assert.deepEqual(sets.get('o').fields, [{ name: 'a', type: 'number' }, { name: 'd', type: 'date' }]);
  assert.equal(sets.get('t').field('desk').label, 'Desk');
  assert.equal(V.datasetsOf({ datasets: { ['__proto__']: { values: [] } } }, {}).size, 0);
});

test('a rows patch applies reset, remove, update and add in that order, by key, and tells every listener', () => {
  const t = new V.Dataset('t', { key: ['id'], fields: FIELDS, values: ROWS }, {});
  const seen = [];
  t.on((c) => seen.push(c));
  assert.equal(t.apply({ remove: ['B'], update: [{ id: 'A', n: 11 }, { id: 'Z', desk: 'FX', n: 1 }], add: [{ id: 'C', n: 70 }, { id: 'D', desk: 'Credit', n: 3 }] }), true);
  assert.deepEqual(t.held.map((r) => [r.id, r.n]), [['A', 11], ['C', 70], ['Z', 1], ['D', 3]]);
  assert.deepEqual(seen[0].remove, ['B']);
  assert.deepEqual(seen[0].update.map((r) => r.id), ['A', 'C']);
  assert.deepEqual(seen[0].add.map((r) => r.id), ['Z', 'D']);
  t.apply({ reset: [{ id: 'X', n: 1 }], add: [{ id: 'Y', n: 2 }] });
  assert.deepEqual(t.held.map((r) => r.id), ['X', 'Y']);
  assert.equal(seen[1].reset, true);
  assert.equal(V.rowKey({ a: 'x', b: 2 }, ['a', 'b']), 'x\u001f2');
  assert.equal(new V.Dataset('p', { pages: { url: '/api/t' } }, {}).apply({ add: [{}] }), false);   // a windowed source is told by its server
});

test('derived reads: grouped per x and by, combined by each aggregation, the largest categories kept', () => {
  const rows = [{ d: 'A', c: 'x', v: 1 }, { d: 'A', c: 'y', v: 2 }, { d: 'B', c: 'x', v: 5 }, { d: 'C', c: 'x', v: -9 }, { d: 'A', c: 'x', v: { $masked: true } }];
  assert.deepEqual(V.derive(rows, { x: 'd', y: [{ field: 'v', agg: 'count' }] }), [{ d: 'A', v: 3 }, { d: 'B', v: 1 }, { d: 'C', v: 1 }]);
  assert.deepEqual(V.derive(rows.slice(0, 4), { x: 'd', by: 'c', y: [{ field: 'v', agg: 'sum' }], limit: 2 }).map((r) => r.d + r.c + r.v), ['Bx5', 'Cx-9']);   // by size: C 9, B 5, A 3
  assert.deepEqual(V.aggregate([1, 2, 6], 'avg'), 3);
  assert.deepEqual(V.aggregate([1, { $masked: true }], 'sum'), { $masked: true });
  assert.equal(V.aggregate(['a', 'b', 'a', null], 'distinct'), 2);
  assert.equal(V.derive(rows, { x: 'd', y: [{ field: 'v' }] }), rows);                 // no aggregation: the rows as they are
});

test('raw values are formatted by the field\'s format; the mask is the mask', () => {
  assert.equal(V.valueText(1234567.891, 'amount0'), '1,234,568');
  assert.equal(V.valueText({ $masked: true }, 'amount0'), '•••');
  assert.equal(V.valueText(null, 'amount0'), '');
  assert.equal(V.valueText(true), 'yes');
  assert.equal(V.valueText(12.5), '12.5');
});

test('the data allow-list: the page\'s and the view\'s origins and what the host allowed; never javascript: or a stranger', () => {
  const w = { page: 'https://app.example/desk/', view: 'https://views.example/v/1.json', allow: ['https://data.example'] };
  assert.equal(V.allowedAddress('/api/t', w), 'https://views.example/api/t');
  assert.equal(V.allowedAddress('https://app.example/x', w), 'https://app.example/x');
  assert.equal(V.allowedAddress('https://data.example/rows', w), 'https://data.example/rows');
  assert.equal(V.allowedAddress('https://other.example/rows', w), null);
  assert.equal(V.allowedAddress('javascript:alert(1)', w), null);
  assert.equal(V.allowedAddress('https://other.example/rows', { page: w.page, allow: ['any-https'] }), 'https://other.example/rows');
});

test('inline rows are bounded; a view of contract 1.1 is valid; the builders stamp the smallest minor', () => {
  const vm = V.view('Desk').dataset('t', [{ id: 'A', n: 1 }], { key: 'id', formats: { n: 'amount0' } })
    .grid('Trades', { dataset: 't', sort: [{ field: 'n', desc: true }] }).tree('Org', { dataset: 't', node: 'id' })
    .chart('By id', { dataset: 't', type: 'bar', x: 'id', y: [{ field: 'n', agg: 'sum' }] }).toJSON();
  assert.equal(vm.contract, '1.1');
  assert.equal(V.validate(vm, { strict: true }).ok, true);
  assert.equal(V.view('Words').kv('Summary', { fields: [] }).toJSON().contract, '1.0');
  assert.equal(V.stampOf({ panels: [{ kind: 'map', data: { points: [{ lat: 1, lon: 2 }] } }] }), '1.1');
  const big = { ...vm, datasets: { t: { fields: [{ name: 'a' }], values: Array.from({ length: 50001 }, () => [1]) } } };
  assert.ok(V.validate(big).issues.some((i) => i.code === 'limit' && i.path === 'datasets.t'));
  const odd = Object.assign({}, vm, { panels: [{ id: 'g', kind: 'grid', data: { dataset: 't', columns: [{ field: 'a', pinned: 'middle' }] } }] });
  assert.deepEqual(V.validate(odd).issues.map((i) => i.level + ' ' + i.code + ' ' + i.path), ['warning enum panels[0].data.columns[0].pinned']);
  assert.equal(V.validate(odd, { strict: true }).ok, false);
  assert.deepEqual(V.frame(1).rows('t', { remove: ['A'], update: [] }).toJSON().patches, [{ op: 'rows', dataset: 't', remove: ['A'] }]);
});

test('a grid\'s columns and a chart\'s spec are made from the dataset\'s fields', () => {
  const ds = new V.Dataset('t', { key: ['id'], fields: FIELDS, values: ROWS }, {});
  const cols = V.gridColumns({ columns: [{ field: 'desk' }, { field: 'n', tone: 'sign', agg: 'sum', pinned: 'left' }] }, ds);
  assert.deepEqual(cols.map((c) => [c.field, c.header, c.type, c.pinned || null, c.aggFunc || null]), [['desk', 'Desk', 'text', null, null], ['n', 'n', 'number', 'left', 'sum']]);
  assert.equal(cols[1].format(1234.5), '1,235');
  assert.equal(cols[1].cellClass(-1), 'dv-t-neg');
  assert.equal(V.gridColumns({}, ds).length, 3);
  const bar = V.chartSpec({ type: 'bar', x: 'desk', y: [{ field: 'n', agg: 'sum' }], stack: 'percent', horizontal: true }, ds, [{ desk: 'Rates', n: { $masked: true } }]);
  assert.equal(bar.kind, 'bar');
  assert.deepEqual([bar.stack, bar.orient, bar.x.title, bar.series[0].field, bar.data.rows[0].n], ['percent', 'horizontal', 'Desk', 'n', null]);
  assert.deepEqual(V.chartSpec({ type: 'bar', x: 'desk', by: 'id', y: [{ field: 'n' }] }, ds, []).series, { by: 'id' });
  assert.equal(V.chartSpec({ type: 'donut', x: 'desk', y: [{ field: 'n' }] }, ds, []).category, 'desk');
  assert.equal(V.chartSpec({ type: 'heatmap', x: 'desk', by: 'id', y: [{ field: 'n' }] }, ds, []).y, 'id');
  assert.equal(V.chartSpec({ type: 'histogram', y: [{ field: 'n' }] }, ds, []).bins, 20);
});
