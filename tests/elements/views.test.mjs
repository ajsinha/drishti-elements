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
/* drishti-views under Node: the validator over the conformance vectors (spec/drishti_vectors.json: every view and frame, normal and
   strict mode, issues compared as sets of {level, code, path}); the pinned copy of the specification is the one the compact schema was
   made from; the messages say where, what and what to write; a 200 KB view is validated within its budget (tests/views_budget.json);
   the bundle loads under Node with no DOM; the layout's arrangement as data (two columns, areas, sections, the phone order). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as V from '../../elements/drishti-views/src/drishti_index.js';

const require = createRequire(import.meta.url);
const SPEC = new URL('../../elements/drishti-views/spec/', import.meta.url);
const VECTORS = JSON.parse(readFileSync(new URL('drishti_vectors.json', SPEC), 'utf8'));
const BUDGET = JSON.parse(readFileSync(new URL('../views_budget.json', import.meta.url), 'utf8'));
const key = (i) => i.level + ' ' + i.code + ' ' + i.path;
const set = (list) => list.map(key).sort();

for (const v of VECTORS.views) {
  test('vector ' + v.id + ': ' + v.about, () => {
    const r = V.validate(v.view);
    assert.equal(r.ok, v.expect.ok, JSON.stringify(r.issues.map(V.formatIssue)));
    assert.deepEqual(set(r.issues), set(v.expect.issues));
    const s = V.validate(v.view, { strict: true });
    assert.equal(s.ok, v.expect.strictOk === undefined ? v.expect.ok : v.expect.strictOk, JSON.stringify(s.issues.map(V.formatIssue)));
    assert.deepEqual(set(s.issues), set(v.expect.strictIssues || v.expect.issues));
  });
}

for (const f of VECTORS.frames) {
  test('frame vector ' + f.id + ': ' + f.about, () => {
    const r = V.validate(f.frame, { as: 'frame' });
    assert.equal(r.ok, f.expect.ok, JSON.stringify(r.issues.map(V.formatIssue)));
    assert.deepEqual(set(r.issues), set(f.expect.issues));
  });
}

test('vector ids are unique and keep their families (V, I, S, F)', () => {
  const ids = VECTORS.views.map((v) => v.id).concat(VECTORS.frames.map((f) => f.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^[VISF]\d{3}$/.test(id)));
  assert.ok(VECTORS.views.every((v) => v.id[0] !== 'V' || (v.expect.ok && v.expect.strictOk)));
});

test('the compact schema was made from the pinned copy of the specification', () => {
  const pin = JSON.parse(readFileSync(new URL('drishti_viewmodel.pin.json', SPEC), 'utf8'));
  const sha = createHash('sha256').update(readFileSync(new URL('drishti_viewmodel.schema.json', SPEC))).digest('hex');
  assert.equal(sha, pin.sha256);
  assert.equal(V.SCHEMA_SHA256, pin.sha256);
  assert.equal(V.CONTRACT, pin.contract);
  assert.deepEqual(V.SPECS, [1]);
});

test('a message names the path, what is wrong and what to write; near misses are suggested', () => {
  const base = VECTORS.views.find((v) => v.id === 'V001').view;
  const vm = JSON.parse(JSON.stringify(base));
  vm.strip[1].tone = 'pso';
  vm.panels[0].titel = 'x';
  const [a, b] = V.validate(vm, { strict: true }).issues.sort((x, y) => x.path.localeCompare(y.path));
  assert.equal(a.path, 'panels[0].titel');
  assert.match(a.message, /did you mean "title"/);
  assert.equal(a.fix, 'write "title"');
  assert.equal(b.path, 'strip[1].tone');
  assert.match(V.formatIssue(b), /^strip\[1\]\.tone: "pso" is not one of .*did you mean "pos"\?.*\[error enum\]$/);
  const t = V.validate(Object.assign({}, base, { timings: 'fast' })).issues[0];
  assert.equal(t.code, 'type');
  assert.match(t.message, /is text; it should be an object/);
});

test('a bound can be set by the caller; the forbidden keys are refused wherever they are', () => {
  const vm = JSON.parse(JSON.stringify(VECTORS.views.find((v) => v.id === 'V001').view));
  assert.equal(V.validate(vm, { limits: { panels: 3 } }).issues.find((i) => i.code === 'limit').path, 'panels');
  vm.panels[0].data = JSON.parse('{"fields": [], "__proto__": {"polluted": 1}}');
  const r = V.validate(vm);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === 'key.forbidden' && i.path === 'panels[0].data.__proto__'));
  assert.equal({}.polluted, undefined);
});

test('a 200 KB view is validated within its budget, and the validator is not run per patch (it holds no state)', () => {
  const vm = JSON.parse(JSON.stringify(VECTORS.views.find((v) => v.id === 'V001').view));
  const rows = vm.panels[2].data.rows;
  while (JSON.stringify(vm).length < 200_000) { rows.push(JSON.parse(JSON.stringify(rows[rows.length % 2]))); }
  for (let i = 0; i < 5; i++) { V.validate(vm); }
  const times = [];
  for (let i = 0; i < 9; i++) { const t = performance.now(); assert.ok(V.validate(vm).ok); times.push(performance.now() - t); }
  times.sort((a, b) => a - b);
  assert.ok(times[4] <= BUDGET['validate-200kb-ms'], 'median ' + times[4].toFixed(1) + ' ms over the budget of ' + BUDGET['validate-200kb-ms']);
});

test('the bundle loads under Node with no page and offers the same API', () => {
  const B = require('../../elements/drishti-views/drishti_views.js');
  assert.equal(typeof B.paint, 'function');
  assert.equal(typeof B.validate, 'function');
  assert.equal(B.validate(VECTORS.views[0].view).ok, true);
});

test('the arrangement as data: two columns, named areas with places, sections, folds, the split and the phone order', () => {
  const base = VECTORS.views.find((v) => v.id === 'V001').view;
  const cols = V.arrange(base);
  assert.equal(cols.mode, 'columns');
  assert.deepEqual(cols.areas.map((a) => a.name), ['main', 'right']);
  assert.deepEqual(cols.areas[0].panels, ['summary', 'orders', 'trend']);
  assert.deepEqual(Object.keys(cols.phone).sort((a, b) => cols.phone[a] - cols.phone[b]).slice(0, 3), ['summary', 'orders', 'trend']);
  const areas = V.arrange(VECTORS.views.find((v) => v.id === 'V004').view);
  assert.equal(areas.mode, 'areas');
  assert.deepEqual(areas.columns, [8, 4]);
  assert.deepEqual(areas.areas.find((a) => a.name === 'side').panels.slice(0, 2), ['by-country', 'notes']);
  assert.deepEqual(areas.areas.find((a) => a.name === 'head').panels, ['summary', 'booked']);
  assert.deepEqual(areas.split, { left: 'body', right: 'side', at: 1, resizable: true });
  assert.deepEqual(areas.tabs, ['side']);
  assert.deepEqual(areas.folds, ['notes']);
  assert.equal(areas.phone.booked, 0);
  assert.equal(areas.phone.orders, 1);
  const flow = V.arrange(Object.assign({}, base, { panels: base.panels.map((p) => Object.assign({}, p, { area: 'main' })),
    layout: { sections: [{ id: 'more', title: 'More', collapsed: true }], place: { notes: { section: 'more' } } } }));
  assert.equal(flow.mode, 'sections');
  assert.deepEqual(flow.sections[0].panels, ['notes']);
  assert.equal(flow.top.indexOf('notes'), -1);
  const bad = V.arrange(Object.assign({}, base, { layout: { areas: ['a b', 'c'] } }));
  assert.notEqual(bad.mode, 'areas');
});
