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
/* The grid's live-mode edit under Node: the write spec from a schema (no `write`: no edit), the rules in the host's words, the change with a
   ULID and the version, the reason, the host's answers read into what the screen shows, a retry reusing its id, and the editing model's
   propose hook (the row is never changed, the cell carries a mark until the patch). */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../../elements/drishti-grid/src/drishti_index.js';

const SCHEMA = { key: ['id'], rowVersion: 'v', write: { columns: { qty: { type: 'number', min: 0, required: true }, status: { type: 'enum', options: ['NEW', 'DONE'] },
  code: { type: 'string', pattern: '[A-Z]{3}' } }, reason: 'optional' } };

test('a schema without write gives no edit spec; with it, only its columns and its reason mode', () => {
  assert.equal(G.writeSpec({ key: ['id'] }), null);
  assert.equal(G.writeSpec({ write: { columns: {} } }), null);
  assert.equal(G.writeSpec(null), null);
  const s = G.writeSpec(SCHEMA);
  assert.deepEqual(Object.keys(s.columns), ['qty', 'status', 'code']);
  assert.equal(s.reason, 'optional');
  assert.equal(s.version, 'v');
  assert.deepEqual(s.columns.status.options.map((o) => o.value), ['NEW', 'DONE']);
  assert.equal(G.writeSpec({ write: { columns: { a: {} }, reason: 'nonsense' } }).reason, 'none');
  assert.deepEqual(['number', 'select', 'text'], [G.editorFor(s.columns.qty), G.editorFor(s.columns.status), G.editorFor(s.columns.code)]);
});

test('the rules are checked in the page with the host words: required, min, max, options, pattern, number', () => {
  const s = G.writeSpec(SCHEMA);
  assert.equal(G.checkRule('qty', s.columns.qty, -1), 'qty is at least 0');
  assert.equal(G.checkRule('qty', s.columns.qty, null), 'qty is required');
  assert.equal(G.checkRule('qty', s.columns.qty, 'x'), 'qty is not a number');
  assert.equal(G.checkRule('qty', s.columns.qty, 5), null);
  assert.equal(G.checkRule('status', s.columns.status, 'OLD'), 'status is not one of NEW, DONE');
  assert.equal(G.checkRule('code', s.columns.code, 'abc'), 'code does not match [A-Z]{3}');
  assert.equal(G.checkRule('code', s.columns.code, 'ABC'), null);
  assert.equal(G.checkRule('code', s.columns.code, ''), null);
  assert.deepEqual(G.checkChange(s, { qty: -3, status: 'DONE', book: 1 }, ''), { qty: 'qty is at least 0', book: 'book cannot be changed' });
  const max = G.writeSpec({ write: { columns: { q: { type: 'integer', max: 9 } } } });
  assert.equal(G.checkRule('q', max.columns.q, 10), 'q is at most 9');
  assert.equal(G.checkRule('q', max.columns.q, 1.5), 'q is not a whole number');
});

test('a reason is required when the table says so, and always for a rejection in the tray', () => {
  const req = G.writeSpec({ write: { columns: { qty: { type: 'number' } }, reason: 'required' } });
  assert.deepEqual(G.checkChange(req, { qty: 1 }, ' '), { reason: 'a reason is required' });
  assert.deepEqual(G.checkChange(req, { qty: 1 }, 'fat finger'), {});
  const tray = G.writeSpec({ key: ['change'], write: { columns: { state: { type: 'enum', options: ['released', 'rejected'] } }, reason: 'optional' } });
  assert.equal(tray.decides, true);
  assert.equal(tray.version, null);
  assert.equal(G.reasonMode(tray, { state: 'released' }), 'optional');
  assert.equal(G.reasonMode(tray, { state: 'rejected' }), 'required');
  assert.deepEqual(G.checkChange(tray, { state: 'rejected' }, ''), { reason: 'a reason is required' });
  assert.deepEqual(G.checkChange(tray, { state: 'released' }, ''), {});
});

test('the change names the key and the version the row shows (the tray: held) and carries a ULID', () => {
  const s = G.writeSpec(SCHEMA), id = G.ulid();
  assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.ok(G.ulid(1000) < G.ulid(2000000000000), 'sortable by time');
  assert.deepEqual(G.buildChange(s, { id: 'a', v: 3, qty: 1 }, { qty: 9 }, ' why ', id), { id: id, op: 'update', key: ['a'], basedOn: 3, set: { qty: 9 }, reason: 'why' });
  assert.equal('reason' in G.buildChange(s, { id: 'a', v: 3 }, { qty: 9 }, '', id), false);
  const tray = G.writeSpec({ key: ['change'], write: { columns: { state: { type: 'enum', options: ['released', 'rejected'] } } } });
  assert.deepEqual(G.buildChange(tray, { change: 'c1' }, { state: 'rejected' }, 'no', id), { id: id, op: 'update', key: ['c1'], basedOn: 'held', set: { state: 'rejected' }, reason: 'no' });
});

test('a masked cell and a locked row are never editable; only write columns are', () => {
  const s = G.writeSpec(SCHEMA);
  assert.equal(G.mayEdit(s, { qty: 1 }, 'qty', null), true);
  assert.equal(G.mayEdit(s, { qty: { $masked: true } }, 'qty', null), false);
  assert.equal(G.mayEdit(s, { qty: 1, book: 'A' }, 'book', null), false);
  assert.equal(G.mayEdit(s, { qty: 1 }, 'qty', 'no right'), false);
  assert.equal(G.mayEdit(null, { qty: 1 }, 'qty', null), false);
  assert.equal(G.isMaskedValue({ $masked: true }), true);
  assert.equal(G.isMaskedValue('•••'), false);
});

test('the host answers: states, 409 with who and when, 422 by column, 403, 405, 404, and a network failure that may retry', () => {
  assert.deepEqual(G.outcome({ change: 'c', state: 'held', message: 'waiting for a second person' }, null).kind, 'held');
  assert.equal(G.outcome({ change: 'c', state: 'queued' }, null).kind, 'queued');
  assert.equal(G.outcome({ change: 'c', state: 'applied', version: 2 }, null).kind, 'applied');
  assert.equal(G.outcome({ change: 'c', state: 'refused', message: 'no' }, null).message, 'no');
  const err = (status, e) => ({ status: status, error: e, message: e && e.message });
  const c = G.outcome(null, err(409, { code: 'rdp.write.conflict', message: 'm', current: { version: 4, by: 'bob', at: '2026-11-21T09:00:00Z' } }));
  assert.equal(c.kind, 'conflict');
  assert.equal(G.changedWords(c.current), 'Changed by bob at 2026-11-21 09:00:00');
  const i = G.outcome(null, err(422, { message: 'm', fields: [{ column: 'qty', rule: 'value', message: 'qty is at least 0' }, { column: null, rule: 'reason', message: 'a reason is required' }] }));
  assert.equal(i.kind, 'invalid');
  assert.deepEqual(i.fields.map((f) => f.column), ['qty', null]);
  assert.equal(G.outcome(null, err(403, { message: 'x' })).kind, 'forbidden');
  assert.equal(G.outcome(null, err(405, { message: 'x' })).kind, 'unsupported');
  assert.equal(G.outcome(null, err(404, { message: 'x' })).kind, 'gone');
  const net = G.outcome(null, new Error('network down'));
  assert.deepEqual([net.kind, net.retry, net.message], ['failed', true, 'network down']);
  assert.equal(G.outcome(null, err(500, { message: 'boom' })).retry, true);
  assert.equal(G.outcome(null, err(409, { message: 'm' })).retry, false);
  assert.equal(G.outcome(null, err(0, { code: 'rdp.write.conflict', message: 'm' })).kind, 'conflict', 'over a bridge the code says it');
  assert.equal(G.outcome(null, err(0, { code: 'rdp.write.invalid', message: 'm', fields: [] })).kind, 'invalid');
  assert.equal(G.outcome(null, err(0, { code: 'rdp.table.unknown', message: 'm' })).kind, 'gone');
});

test('a retry after a network failure reuses the change id; a definitive answer does not', () => {
  const p = new G.PendingChanges();
  const a = p.idFor(['a'], 1, { qty: 9 }, ''), b = p.idFor(['a'], 1, { qty: 9 }, '');
  assert.equal(a, b);
  assert.notEqual(p.idFor(['a'], 1, { qty: 8 }, ''), a);
  assert.notEqual(p.idFor(['a'], 2, { qty: 9 }, ''), a);
  p.settled(['a'], 1, { qty: 9 }, '');
  assert.notEqual(p.idFor(['a'], 1, { qty: 9 }, ''), a);
  p.mark('a', { id: a, state: 'queued', message: '', columns: ['qty'] });
  assert.equal(p.size, 1);
  assert.equal(p.arrived('a'), true);
  assert.equal(p.arrived('a'), false);
});

const COLS = [{ field: 'id', header: 'Id' }, { field: 'qty', header: 'Qty', type: 'number', editable: true }, { field: 'status', header: 'Status', editable: true }];
const grid = (propose) => G.createGridModel({ columns: COLS, rows: [{ id: 'a', qty: 1, status: 'NEW' }, { id: 'b', qty: 2, status: 'NEW' }], getRowId: (r) => r.id, editing: { propose: propose } });

test('with a propose hook the row is never changed: the hook hears the edits, the cell carries its mark until it is cleared', async () => {
  const heard = [];
  const g = grid((tx) => { heard.push(tx); });
  const r = 0, c = 1;
  assert.equal(g.editing.canEdit(r, c), true);
  const tx = await g.editing.commit([{ r: r, c: c, value: 9 }]);
  assert.equal(tx.status, 'pending');
  assert.equal(heard.length, 1);
  assert.deepEqual(heard[0].edits.map((e) => [e.rowId, e.field, e.old, e.value]), [['a', 'qty', 1, 9]]);
  assert.equal(g.rowModel.getRowById('a').qty, 1, 'the row is as it was');
  assert.equal(g.editing.history().undo, 0);
  g.editing.setMark('a', 'qty', 'queued', 'queued: on its way');
  assert.equal(g.editing.markOf('a', 'qty'), 'queued');
  assert.equal(g.editing.noteOf('a', 'qty'), 'queued: on its way');
  assert.equal(g.editing.canEdit(r, c), false, 'not edited again while it waits');
  g.editing.setMark('a', 'qty', null);
  assert.equal(g.editing.canEdit(r, c), true);
  assert.equal(g.editing.noteOf('a', 'qty'), null);
});

test('the propose hook may refuse: the edit is refused and nothing moves', async () => {
  const g = grid(() => { throw new Error('qty is at least 0'); });
  await assert.rejects(g.editing.commit([{ r: 1, c: 1, value: -4 }]), /qty is at least 0/);
  assert.equal(g.rowModel.getRowById('b').qty, 2);
});

test('without a propose hook editing is as it was: the value is in the row at once', async () => {
  const g = G.createGridModel({ columns: COLS, rows: [{ id: 'a', qty: 1, status: 'NEW' }], getRowId: (r) => r.id });
  const tx = await g.editing.commit([{ r: 0, c: 1, value: 7 }]);
  assert.equal(tx.status, 'applied');
  assert.equal(g.rowModel.getRowById('a').qty, 7);
});
