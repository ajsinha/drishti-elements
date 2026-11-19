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
/* drishti-data under Node: the data sources (in memory, REST, readAll for a chart) and the Arrow client against the vendored Arrow JS
   (columns read without a copy, types, JSON the same, Flight over HTTP when offered). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as D from '../../elements/drishti-data/src/drishti_index.js';
import * as G from '../../elements/drishti-grid/src/drishti_index.js';

const require = createRequire(import.meta.url);
const Arrow = require('../../vendor/apache-arrow/21.1.0/Arrow.es2015.min.js');
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));

test('data sources: in memory (filter, sort, groups, windows), REST by POST and by GET, readAll for a chart, a live source', async () => {
  const rows = Array.from({ length: 250 }, (_, i) => ({ id: 'T' + i, desk: ['Rates', 'FX', 'Credit'][i % 3], mtm: (i % 7) - 3 }));
  const s = D.memorySource(rows);
  const a = await s.getRows({ startRow: 0, endRow: 10, filterModel: { desk: { type: 'set', values: ['FX'] } }, sortModel: [{ colId: 'mtm', sort: 'desc' }] });
  assert.equal(a.rowCount, 83);
  assert.equal(a.rows[0].mtm, 3);
  const g = await s.getRows({ rowGroupCols: ['desk'], valueCols: [{ colId: 'mtm', aggFunc: 'sum' }] });
  assert.deepEqual(g.rows.map((x) => x.desk), ['Credit', 'FX', 'Rates']);
  assert.equal(g.rows.reduce((t, x) => t + x.childCount, 0), 250);
  const lvl = await s.getRows({ rowGroupCols: ['desk'], groupKeys: ['FX'], startRow: 0, endRow: 5 });
  assert.equal(lvl.rowCount, 83);
  const all = await D.readAll(s, { filterModel: { desk: { type: 'set', values: ['Rates'] } } }, { pageSize: 30 });
  assert.equal(all.rows.length, 84);
  const calls = [];
  const fakeFetch = (url, init) => { calls.push({ url: url, init: init }); return Promise.resolve({ ok: true, text: () => Promise.resolve(JSON.stringify({ items: [{ id: 1 }], total: 99 })) }); };
  const r = await D.restSource('/api/rows', { fetch: fakeFetch, method: 'GET' }).getRows({ startRow: 20, endRow: 40, sortModel: [{ colId: 'mtm', sort: 'desc' }], quickFilter: 'fx' });
  assert.deepEqual(r, { rows: [{ id: 1 }], rowCount: 99 });
  assert.equal(calls[0].url, '/api/rows?offset=20&limit=20&sort=mtm%3Adesc&q=fx');
  await D.serverSideSource('/api/pivot/rows', { fetch: fakeFetch }).getRows({ startRow: 0, endRow: 100, rowGroupCols: ['desk'] });
  assert.equal(JSON.parse(calls[1].init.body).rowGroupCols[0], 'desk');
  const failing = (url) => Promise.resolve({ ok: false, status: 403, statusText: 'Forbidden', text: () => Promise.resolve('{"code":"E-1403","detail":"not yours"}') });
  await assert.rejects(D.restSource('/x', { fetch: failing }).getRows({}), /E-1403 not yours/);
  const live = D.liveSource(s, { subscribe: () => () => {} });
  assert.equal(live.capabilities.live, true);
  const grid = G.createGridModel({ columns: [{ field: 'id' }, { field: 'desk' }, { field: 'mtm', type: 'number' }], datasource: s, blockSize: 50 });
  await grid.rowModel.ensureRange(0, 60);
  assert.equal(grid.rowCount(), 250);                                         // a source is the grid's datasource as it is
});

function arrowBytes() {
  const t = Arrow.tableFromArrays({ ID: ['T1', 'T2', 'T3'], DESK: Arrow.vectorFromArray(['Rates', 'FX', 'Rates'], new Arrow.Dictionary(new Arrow.Utf8(), new Arrow.Int32())),
    MTM: Float64Array.from([1.5, -2, 3]), N: Int32Array.from([1, 2, 3]), DAY: Arrow.vectorFromArray([new Date(Date.UTC(2026, 10, 6)), null, new Date(Date.UTC(2026, 10, 5))], new Arrow.DateDay()),
    BIG: Arrow.vectorFromArray([1n, 2n ** 60n, null], new Arrow.Int64()), OK: [true, false, null] });
  return Arrow.tableToIPC(t, 'stream');
}

test('Arrow: columns without a copy, types for a grid, row views, plain copies, JSON the same, Flight over HTTP when offered', async () => {
  const fr = D.fromArrow(arrowBytes(), Arrow);
  assert.equal(fr.format, 'arrow');
  assert.equal(fr.length, 3);
  assert.ok(fr.column('MTM') instanceof Float64Array);
  assert.equal(fr.cols.MTM.copied, false);                                    // the Arrow buffer itself
  assert.deepEqual(fr.fields().map((f) => f.type), ['text', 'text', 'number', 'number', 'date', 'text', 'boolean']);
  const rows = fr.rows();
  assert.equal(rows[1].DESK, 'FX');
  assert.equal(rows[1].DAY, null);
  assert.equal(rows[1].BIG, '1152921504606846976');                           // past 2^53: exact text
  assert.equal(rows[0].BIG, 1);
  assert.deepEqual(Object.keys(rows[0]), ['$i']);                             // a view: one number, the values read when asked
  assert.deepEqual(rows[0].toObject(), { ID: 'T1', DESK: 'Rates', MTM: 1.5, N: 1, DAY: '2026-11-06', BIG: 1, OK: true });
  assert.equal(JSON.stringify(rows[2]), JSON.stringify(rows[2].toObject()));
  const g = fr.toGrid({ id: 'ID', formats: { MTM: 'amount2' } });
  const grid = G.createGridModel({ columns: g.columns, rows: g.rows, getRowId: g.getRowId });
  grid.setSortModel([{ colId: 'MTM', sort: 'desc' }]);
  assert.equal(grid.cellText(0, 2), '3.00');
  const js = D.fromJson([{ ID: 'T1', MTM: 1.5, DAY: '2026-11-06' }, { ID: 'T2', MTM: null, DAY: null }]);
  assert.deepEqual(js.fields().map((f) => f.type), ['text', 'number', 'date']);
  assert.equal(js.rows()[1].MTM, null);
  const bytes = arrowBytes(), asked = [];
  const response = (body, type) => ({ ok: true, status: 200, headers: { get: () => type }, arrayBuffer: () => Promise.resolve(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)), text: () => Promise.resolve(body), json: () => Promise.resolve(JSON.parse(body)) });
  const fetch = (url, init) => {
    asked.push(url + ' ' + ((init && init.method) || 'GET'));
    if (url === '/caps') { return Promise.resolve(response(JSON.stringify({ flightHttp: { doGet: '/flight/do-get' } }), 'application/json')); }
    if (url === '/nocaps') { return Promise.resolve({ ok: false, json: () => Promise.resolve({}) }); }
    return Promise.resolve(response(bytes, D.ARROW_MEDIA));
  };
  const viaFlight = await new D.ArrowClient({ capabilitiesUrl: '/caps', fetch: fetch, Arrow: Arrow }).read({ ticket: { kind: 'trades' }, url: '/rows' });
  assert.equal(viaFlight.via, 'flight-http');
  assert.equal(viaFlight.length, 3);
  const viaHttp = await new D.ArrowClient({ capabilitiesUrl: '/nocaps', fetch: fetch, Arrow: Arrow }).read({ ticket: { kind: 'trades' }, url: '/rows' });
  assert.equal(viaHttp.via, 'arrow-http');
  assert.deepEqual(asked, ['/caps GET', '/flight/do-get POST', '/nocaps GET', '/rows GET']);
  await assert.rejects(new D.ArrowClient({ flight: false, fetch: fetch }).read({ ticket: {} }), /no Flight over HTTP/);
  const src = D.arrowSource(fr);
  const page = await src.getRows({ startRow: 0, endRow: 2, sortModel: [{ colId: 'MTM', sort: 'asc' }] });
  assert.deepEqual(page.rows.map((r) => r.ID), ['T2', 'T1']);
});

test('the bundle: drishti-data is a CommonJS module under Node with every name', () => {
  const B = require('../../elements/drishti-data/drishti_data.js');
  assert.equal(B.library, 'drishti-data');
  ['ArrowClient', 'DataFrame', 'memorySource', 'restSource', 'serverSideSource', 'arrowSource', 'liveSource', 'readAll'].forEach((n) => assert.equal(typeof B[n], 'function', n));
});
