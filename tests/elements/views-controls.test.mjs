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
/* The painter's controls as pure logic under Node: the values a host gives (query text or an object), the query text of the values the
   reader set, a ControlView's value as text, the kinds drawn and the bundle's exports. Drawing them with drishti-inputs, the picks, the bind
   and the keyboard are tested in a browser (tests/test_views_controls_browser.py). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as V from '../../elements/drishti-views/src/drishti_index.js';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const SPEC = JSON.parse(readFileSync(new URL('../../elements/drishti-views/spec/drishti_viewmodel.schema.json', import.meta.url), 'utf8'));

test('the values a host gives: query text with or without ctl., or an object (a list joined with commas)', () => {
  assert.deepEqual(V.controlValues('legs=2&ctl.when=2026-01-01..'), { legs: '2', when: '2026-01-01..' });
  assert.deepEqual(V.controlValues('?ctl.legs=1%2C2'), { legs: '1,2' });
  assert.deepEqual(V.controlValues({ legs: ['1', '2'], 'ctl.asset': 'FX', gone: null }), { legs: '1,2', asset: 'FX', gone: '' });
  assert.deepEqual(V.controlValues(''), {});
  assert.deepEqual(V.controlValues(false), {});
  assert.deepEqual(V.controlValues(undefined), {});
});

test('the query text of the values the reader set: in order, commas and colons readable, empty values kept', () => {
  assert.equal(V.controlQuery({ legs: '1,2', when: '2099-01-01..', q: '' }), 'ctl.legs=1,2&ctl.when=2099-01-01..&ctl.q=');
  assert.equal(V.controlQuery({ a: 'x', b: 'y' }, ['b']), 'ctl.b=y');
  assert.equal(V.controlQuery({ t: '09:30', s: 'a b&c' }), 'ctl.t=09:30&ctl.s=a%20b%26c');
  assert.equal(V.controlQuery({}), '');
});

test('a control\'s value as text: a multi-select\'s values joined, else its value, else empty', () => {
  assert.equal(V.controlText({ kind: 'multi-select', values: ['1', '2'] }), '1,2');
  assert.equal(V.controlText({ kind: 'multi-select', value: '2' }), '2');
  assert.equal(V.controlText({ kind: 'date-range', value: '2026-01-01..2026-12-31' }), '2026-01-01..2026-12-31');
  assert.equal(V.controlText({ kind: 'dropdown' }), '');
});

test('every control kind of the contract is drawn, and the bundle carries the controls', () => {
  const kinds = SPEC.$defs.ControlView.properties.kind.description.split(/,\s*|\s+or\s+/).map((s) => s.trim()).filter(Boolean);
  kinds.forEach((k) => assert.ok(V.CONTROL_KINDS.includes(k), k));
  assert.ok(V.CONTROL_KINDS.includes('slider'));                       // a slider: the contract's step and range
  assert.ok(V.TYPING_PAUSE_MS > 0);
  const B = require('../../elements/drishti-views/drishti_views.js');
  ['Controls', 'controlValues', 'controlQuery', 'controlText'].forEach((n) => assert.equal(typeof B[n], 'function', n));
  assert.deepEqual(B.CONTROL_KINDS, V.CONTROL_KINDS);
});
