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
/* The kinds of contract 1.1 that read a dataset: grid (drishti-grid: virtual rows, typed columns, groups, an order, a pivot computed in
   the browser, the server's windows for pages and server sources), tree (drishti-tree in its four modes) and chart (drishti-chart over
   a derived read of the rows). Each loads its library (and adopts its sheets) the first time a view has such a panel, reads its dataset
   by name and follows the dataset's rows patches: a grid by transaction (only the rows in view are drawn again), a tree and a chart by
   drawing their rows again in the next animation frame. Values are raw: each column formats them with its field's fmt. */
import { h, stateBlock } from '../../drishti-core/src/drishti_index.js';
import { defineKind } from './drishti_views-kinds.js';
import { say, toneClass } from './drishti_views-cells.js';
import { valueText, rowKey, derive, isMasked } from './drishti_views-data.js';

/** The kinds drawn from a dataset (contract 1.1). */
export const DATASET_KINDS = Object.freeze(['grid', 'tree', 'chart']);

const list = (x) => (Array.isArray(x) ? x : []);
const GRID_TYPES = { number: 'number', boolean: 'boolean', date: 'date', datetime: 'date' };

/**
 * drishti-grid's columns of a grid panel: its columns, or every field of its dataset; each formats its raw values with the field's fmt.
 * @param {Object} d the panel's data (Grid)
 * @param {Object} ds the dataset
 * @returns {Object[]}
 */
export function gridColumns(d, ds) {
  const cols = list(d.columns).length ? list(d.columns) : list(ds.fields).map((f) => ({ field: f.name }));
  return cols.filter((c) => c && typeof c.field === 'string').map((c) => {
    const f = ds.field(c.field) || { name: c.field, type: 'string' }, fmt = c.fmt || f.fmt || null;
    const col = { field: c.field, header: c.label || f.label || c.field, type: GRID_TYPES[f.type] || 'text', format: (v) => valueText(v, fmt, f.type) };
    if (c.width > 0) { col.width = c.width; }
    if (c.pinned === 'left' || c.pinned === 'right') { col.pinned = c.pinned; }
    if (c.hidden === true) { col.hidden = true; }
    if (c.agg) { col.aggFunc = c.agg; col.enableValue = true; }
    if (c.tone === 'sign') { col.cellClass = (v) => (typeof v === 'number' ? (v > 0 ? 'dv-t-pos' : v < 0 ? 'dv-t-neg' : '') : ''); } else if (c.tone) { const t = toneClass(c.tone); col.cellClass = () => t; }
    if (col.type !== 'number') { col.enableRowGroup = true; col.enablePivot = true; }
    return col;
  });
}

/**
 * drishti-chart's spec of a chart panel over rows already derived (grouped and combined).
 * @param {Object} d the panel's data (DataChart)
 * @param {Object} ds the dataset
 * @param {Object[]} rows
 * @returns {Object}
 */
export function chartSpec(d, ds, rows) {
  const y = list(d.y).filter((m) => m && m.field), m0 = y[0] || { field: '' };
  const label = (n) => { const f = ds.field(n); return (f && f.label) || n; };
  const fmt = m0.fmt || (ds.field(m0.field) || {}).fmt || 'number';
  const clean = rows.map((r) => { const o = {}; Object.keys(r).forEach((k) => { o[k] = isMasked(r[k]) ? null : r[k]; }); return o; });
  const base = { title: '', data: { rows: clean } };
  const type = d.type || 'bar';
  if (type === 'bar' || type === 'line' || type === 'area') {
    const s = Object.assign(base, { kind: type, x: { field: d.x, title: d.xLabel || label(d.x) }, y: { format: fmt, title: d.yLabel || '' } });
    if (d.by) { s.y.field = m0.field; s.series = { by: d.by }; } else { s.series = y.map((m) => ({ field: m.field, name: m.label || label(m.field) })); }
    if (d.stack === 'percent') { s.stack = 'percent'; } else if (d.stack === 'sum') { s.stack = true; }
    if (d.horizontal === true) { s.orient = 'horizontal'; }
    return s;
  }
  if (type === 'scatter') { return Object.assign(base, { kind: 'scatter', x: { field: d.x, title: d.xLabel || label(d.x) }, y: { field: m0.field, format: fmt, title: d.yLabel || label(m0.field) }, colour: d.by || undefined }); }
  if (type === 'pie' || type === 'donut') { return Object.assign(base, { kind: type, category: d.x, value: { field: m0.field, format: fmt } }); }
  if (type === 'heatmap') { return Object.assign(base, { kind: 'heatmap', x: { field: d.x, title: d.xLabel || label(d.x) }, y: d.by, value: { field: m0.field, format: fmt } }); }
  if (type === 'histogram') { return Object.assign(base, { kind: 'histogram', value: { field: m0.field, format: fmt }, bins: d.bins > 0 ? d.bins : 20 }); }
  return Object.assign(base, { kind: type, x: d.x, y: { field: m0.field, format: fmt } });
}

/** The words of a panel that cannot draw: in its body, never a blank. */
function words(body, ctx, key, vars, detail) {
  const b = stateBlock(ctx.doc, key === 'noDataset' || key === 'dataFailed' ? 'error' : 'empty', { text: say(ctx.messages, key, vars), detail: detail || null });
  body.appendChild(b);
  return { dispose() { b.remove(); } };
}

/**
 * A dataset kind's painter: finds its dataset, loads its library and its sheets, draws, follows the rows patches, and draws again when
 * the panel is replaced.
 * @param {string} lib the library
 * @param {function(Object, HTMLElement, Object, Object, Object): Object} make (lib, box, panel, ds, ctx) => {change(c), destroy()}
 */
function datasetKind(lib, make) {
  return {
    paint(body, panel, ctx) {
      const d = panel.data || {}, ds = ctx.dataset(d.dataset);
      if (!ds) { return words(body, ctx, 'noDataset', { name: String(d.dataset) }); }
      const doc = ctx.doc;
      const box = h(doc, 'div', { cls: 'dv-ds dv-ds-' + panel.kind, attrs: { 'data-dataset': ds.name, 'aria-label': panel.title || panel.id } });
      const host = h(doc, 'div', { cls: 'dv-ds-host' });          // the library's own element (a grid makes its host .dg, height 100%)
      box.appendChild(host);
      body.appendChild(box);
      const note = ds.more > 0 ? h(doc, 'p', { cls: 'dv-more', text: say(ctx.messages, 'rowsLeft', { count: ds.more.toLocaleString() }) }) : null;
      if (note) { body.appendChild(note); }
      let drawn = null, gone = false, off = null;
      Promise.all([ctx.library(lib), ctx.styles(lib)]).then(([L]) => {
        if (gone) { return null; }
        return Promise.resolve(make(L, host, panel, ds, ctx)).then((inst) => {
          if (gone) { if (inst && inst.destroy) { inst.destroy(); } return; }
          drawn = inst;
          off = ds.on((c) => { if (drawn && drawn.change) { drawn.change(c); } });
          box.setAttribute('data-drawn', '');
          ctx.emit('drawn', { panel: panel.id, kind: panel.kind });
        });
      }).catch((e) => { if (!gone) { host.textContent = ''; words(host, ctx, 'dataFailed', null, String(e && e.message || e)); } });
      return {
        /** @returns {Object} the drawing (the grid, tree or chart), for a host that needs it */
        component() { return drawn && drawn.component; },
        dispose() {
          gone = true;
          if (off) { off(); }
          if (drawn && drawn.destroy) { try { drawn.destroy(); } catch (e) { /* a library's teardown never stops the view's */ } }
          box.remove();
          if (note) { note.remove(); }
        }
      };
    }
  };
}

/** Calls fn once in the next animation frame however often it is asked. */
function later(ctx, fn) {
  let asked = false;
  return () => {
    if (asked) { return; }
    asked = true;
    const win = ctx.doc.defaultView, run = () => { asked = false; fn(); };
    if (win && win.requestAnimationFrame) { win.requestAnimationFrame(run); } else { setTimeout(run, 0); }
  };
}

const grid = datasetKind('drishti-grid', (G, box, panel, ds, ctx) => ds.source().then((src) => {
  const d = panel.data;
  const o = { columns: gridColumns(d, ds), layout: 'wells', density: ctx.density || 'compact', rowSelection: 'single',
    getRowId: (r, i) => rowKey(r, ds.key, i) };
  if (Array.isArray(src)) { o.rows = src; } else { o.datasource = src; if (ds.def.pages && ds.def.pages.size > 0) { o.blockSize = ds.def.pages.size; } }
  if (d.pivot && list(d.pivot.values).length) {
    o.pivot = { rows: list(d.pivot.rows), columns: list(d.pivot.columns), filters: [],
      values: list(d.pivot.values).map((m) => Object.assign({ colId: m.field, aggFunc: m.agg || 'sum' }, m.label ? { as: m.label } : {})) };
  }
  const g = new G.Grid(box, o);
  if (list(d.group).length) { g.model.setRowGroups(list(d.group)); }
  if (list(d.sort).length) { g.model.setSortModel(list(d.sort).map((s) => ({ colId: s.field, sort: s.desc ? 'desc' : 'asc' }))); }
  g.refresh();
  g.on('selectionChanged', () => {
    const ids = g.model.selection && g.model.selection.selectedIds ? g.model.selection.selectedIds() : [];
    ctx.emit('select', { panel: panel.id, dataset: ds.name, keys: ids });
  });
  return {
    component: g,
    change(c) { if (c.reset) { g.setRows(ds.held); } else { g.applyTransaction({ add: c.add, update: c.update, remove: c.remove }); } },
    destroy() { g.destroy(); }
  };
}));

function pathOf(v) {
  if (Array.isArray(v)) { return v.map(String); }
  return v === null || v === undefined ? [] : String(v).split('/').filter(Boolean);
}

const tree = datasetKind('drishti-tree', (T, box, panel, ds, ctx) => ds.rows().then((rows) => {
  const d = panel.data;
  const measures = list(d.measures).filter((m) => m && m.field).map((m) => {
    const f = ds.field(m.field) || {}, fmt = m.fmt || f.fmt;
    return { field: m.field, label: m.label || f.label || m.field, format: (v) => valueText(v, fmt, 'number'), additive: m.agg !== 'min' && m.agg !== 'max' && m.agg !== 'avg' };
  });
  const options = () => ({ data: { rows: ds.held || rows, idField: d.node, parentField: d.parent || 'parent', labelField: d.label || d.node,
    getPath: d.path ? (r) => pathOf(r[d.path]) : undefined, measures: measures }, mode: d.mode || 'grid', density: ctx.density || 'compact',
  title: panel.title || '', label: panel.title || panel.id, openDepth: d.open === -1 ? -1 : d.open > 0 ? d.open : 1 });
  let t = new T.Tree(box, options());
  const redraw = later(ctx, () => { const mode = t.mode; t.destroy(); box.textContent = ''; t = new T.Tree(box, Object.assign(options(), mode ? { mode: mode } : {})); });
  return { get component() { return t; }, change: redraw, destroy() { t.destroy(); } };
}));

const chart = datasetKind('drishti-chart', (C, box, panel, ds, ctx) => ds.rows().then((rows) => {
  const d = panel.data, q = { x: d.x, by: d.by, y: list(d.y), limit: d.limit || 0 };
  const win = ctx.doc.defaultView;
  if (!win.echarts) { throw new Error('no chart engine'); }
  const c = new C.Chart(box, chartSpec(d, ds, derive(ds.held || rows, q)), { density: ctx.density || 'compact', height: (panel.height || 0) > 0 ? Math.max(160, panel.height * 32) : 280 });
  const redraw = later(ctx, () => { c.setSpec(chartSpec(d, ds, derive(ds.held || rows, q))); });
  return { component: c, change: redraw, destroy() { c.destroy(); } };
}));

defineKind('grid', grid);
defineKind('tree', tree);
defineKind('chart', chart);
