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
/* drishti-chart's report part under Node: what each report visual draws from a server's answer (the series for the series, the marks a
   click and the keyboard reach, stacks and 100%, the second axis, the highlighted part over the faded whole, the host's conditional
   colours, small multiples, the server's bins and box figures, the rolling line), the brush's selection, a program's option made safe,
   and Chart any table's option (two axes, stacks, decals past the palette, every colour a token). The drawn charts are tested in the
   host's browser tests (Drishti's report pages). */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../elements/drishti-chart/src/drishti_chart-report.js';

const T = { ink: '#111111', muted: '#777777', border: '#dddddd', surface: '#ffffff', 'surface-2': '#f4f4f4', link: '#1f5fbf', pos: '#2e8b57', neg: '#c62828', mono: 'monospace',
  accent: '#d9822b', ok: '#2ca02c', warn: '#9467bd', bad: '#8c564b', faint: '#cccccc' };
const fmt = (v, name, masked) => (v == null ? (masked ? '•••' : '–') : name === 'pct' ? Math.round(v * 100) + '%' : String(v));
const env = (o) => Object.assign({ t: T, palette: ['#a00001', '#a00002', '#a00003'], fmt, compact: (v) => String(v), numFmt: () => null, label: (f) => f.toLowerCase() }, o || {});
const answer = (names, rows, meta) => ({ columns: names.map((name) => ({ name })), rows, meta: meta || {} });
const DESKS = answer(['desk', 'pnl', 'var'], [['FX', 10, 3], ['Rates', -4, 2], ['Credit', 7, 5]]);
const values = (s) => s.data.map((d) => (d && typeof d === 'object' && 'value' in d ? d.value : d));

test('a column chart: one series per measure, categories in the answer order, marks with their words', () => {
  const b = R.reportOption({ id: 'v', type: 'column', wells: { axis: ['desk'], values: ['pnl', 'var'] } }, DESKS, env());
  assert.deepEqual(b.option.xAxis.data, ['FX', 'Rates', 'Credit']);
  assert.deepEqual(b.option.series.map((s) => [s.name, s.type, values(s)]), [['pnl', 'bar', [10, -4, 7]], ['var', 'bar', [3, 2, 5]]]);
  assert.equal(b.marks.field, 'desk');
  assert.deepEqual(b.marks.items[1], { value: 'Rates', label: 'Rates', text: 'Rates: pnl -4, var 2' });
  assert.equal(b.marks.byName('Credit').value, 'Credit');
  assert.equal(b.option.legend.show, true);
  assert.equal(b.option.animation, false);
});

test('a bar chart is horizontal; a legend field makes one series per member; 100% stacks shares', () => {
  const long = answer(['desk', 'ccy', 'pnl'], [['FX', 'USD', 6], ['FX', 'EUR', 2], ['Rates', 'USD', 1], ['Rates', 'EUR', 3]]);
  const b = R.reportOption({ id: 'v', type: 'bar', wells: { axis: ['desk'], legend: ['ccy'], values: ['pnl'] }, format: { percent: true } }, long, env());
  assert.equal(b.option.yAxis.type, 'category');
  assert.equal(b.option.yAxis.inverse, true);
  assert.deepEqual(b.option.series.map((s) => [s.name, s.stack, values(s)]), [['USD', 'total', [0.75, 0.25]], ['EUR', 'total', [0.25, 0.75]]]);
  assert.equal(b.option.xAxis.max, 1);
});

test('a combo puts its second measures on a right axis as lines; a selection fades the rest; a highlight draws over the faded whole', () => {
  const b = R.reportOption({ id: 'v', type: 'combo', wells: { axis: ['desk'], values: ['pnl'], secondary: ['var'] } }, DESKS, env({ selected: { visual: 'v', values: ['FX'] } }));
  assert.deepEqual(b.option.series.map((s) => [s.type, s.yAxisIndex]), [['bar', 0], ['line', 1]]);
  assert.equal(b.option.yAxis.length, 2);
  assert.deepEqual(b.option.series[0].data.map((d) => d.itemStyle.opacity), [1, 0.35, 0.35]);
  const hl = Object.assign({}, DESKS, { highlight: answer(['desk', 'pnl'], [['Rates', -1]]) });
  const c = R.reportOption({ id: 'v', type: 'column', wells: { axis: ['desk'], values: ['pnl'] } }, hl, env());
  assert.deepEqual(c.option.series.map((s) => s.name), ['pnl', '__highlight']);
  assert.deepEqual(values(c.option.series[1]), [null, -1, null]);
});

test('the host colours points by its rules; the format sets axes, labels, series colours and the legend', () => {
  const styler = () => ({ point: (m, v) => (m === 'pnl' && v < 0 ? '#ff0000' : null) });
  const b = R.reportOption({ id: 'v', type: 'column', wells: { axis: ['desk'], values: ['pnl'] },
    format: { valueAxis: { min: -10, log: false, gridlines: false }, categoryAxis: { rotate: 45 }, seriesColours: { pnl: '#00aa00' }, labels: true, labelDensity: 50, legend: 'top' } }, DESKS, env({ styler }));
  assert.deepEqual(b.option.series[0].data.map((d) => d.itemStyle.color), ['#00aa00', '#ff0000', '#00aa00']);
  assert.equal(b.option.yAxis.min, -10);
  assert.equal(b.option.yAxis.splitLine.show, false);
  assert.equal(b.option.xAxis.axisLabel.rotate, 45);
  assert.deepEqual([0, 1, 2].map((i) => b.option.series[0].label.formatter({ dataIndex: i, value: 1 })), ['1', '', '1']);
  assert.equal(R.labelEvery({ labelDensity: 25 }, 10), 4);
});

test('small multiples: a grid per member of the split, shared value axis, marks over every small chart, a cut said', () => {
  const rows = [];
  ['a', 'b', 'c'].forEach((g, i) => ['FX', 'Rates'].forEach((d, j) => rows.push([g, d, i * 10 + j])));
  const b = R.reportOption({ id: 'v', type: 'column', wells: { axis: ['desk'], values: ['pnl'], split: ['grp'] }, format: { multiples: { max: 2 } } }, answer(['grp', 'desk', 'pnl'], rows), env());
  assert.equal(b.option.grid.length, 2);
  assert.deepEqual(b.option.title.map((x) => x.text), ['a', 'b']);
  assert.deepEqual([b.option.yAxis[0].min, b.option.yAxis[0].max], [0, 11]);
  assert.deepEqual(b.marks.items.map((m) => m.value), ['FX', 'Rates']);
  assert.deepEqual(b.multiples, { count: 2, split: 'grp', rows: 1, cut: { shown: 2, of: 3, words: 'grp' } });
  assert.match(b.alt, /2 small charts, one per grp/);
});

test('pie, donut, funnel, treemap, heatmap and scatter', () => {
  const pie = R.reportOption({ id: 'p', type: 'donut', wells: { axis: ['desk'], values: ['var'] } }, DESKS, env());
  assert.deepEqual(pie.option.series[0].radius, ['45%', '70%']);
  assert.deepEqual(pie.option.series[0].data.map((d) => [d.name, d.value]), [['FX', 3], ['Rates', 2], ['Credit', 5]]);
  assert.equal(pie.option.tooltip.formatter({ name: 'FX', value: 3 }), 'FX: 3 (30%)');
  const fun = R.reportOption({ id: 'f', type: 'funnel', wells: { axis: ['desk'], values: ['pnl'] } }, DESKS, env());
  assert.equal(fun.option.series[0].type, 'funnel');
  const tm = R.reportOption({ id: 't', type: 'treemap', wells: { axis: ['desk'], values: ['var'] } }, DESKS, env());
  assert.deepEqual(tm.option.series[0].data.map((d) => [d.name, d.value]), [['FX', 3], ['Rates', 2], ['Credit', 5]]);
  const hm = R.reportOption({ id: 'h', type: 'heatmap', wells: { axis: ['desk'], legend: ['ccy'], values: ['pnl'] } }, answer(['desk', 'ccy', 'pnl'], [['FX', 'USD', 4], ['Rates', 'EUR', -2]]), env());
  assert.deepEqual(hm.option.series[0].data, [[0, 0, 4], [1, 1, -2]]);
  assert.deepEqual([hm.option.visualMap.min, hm.option.visualMap.max], [-2, 4]);
  const sc = R.reportOption({ id: 's', type: 'bubble', wells: { details: ['desk'], x: ['pnl'], y: ['var'], size: ['var'] } }, DESKS, env());
  assert.deepEqual(sc.option.series[0].data.map((d) => d.value), [[10, 3], [-4, 2], [7, 5]]);
  assert.equal(sc.option.series[0].data[2].symbolSize, 36);
});

test('waterfall steps to a total; gauge to a target; no rows say so; a masked figure is the mask', () => {
  const w = R.reportOption({ id: 'w', type: 'waterfall', wells: { axis: ['desk'], values: ['pnl'] } }, DESKS, env());
  assert.deepEqual(w.option.series[0].data, [[0, 0, 10], [1, 10, 6], [2, 6, 13], [3, 0, 13]]);
  assert.deepEqual(w.option.xAxis.data, ['FX', 'Rates', 'Credit', 'Total']);
  const g = R.reportOption({ id: 'g', title: 'Use', type: 'gauge', wells: { values: ['pnl'], target: ['var'] } }, DESKS, env());
  assert.equal(g.option.series[0].max, 3.75);
  assert.equal(g.alt, 'Use: 10 of target 3');
  assert.deepEqual(R.reportOption({ id: 'e', type: 'line', wells: { axis: ['desk'], values: ['pnl'] } }, answer(['desk', 'pnl'], []), env()), { empty: R.REPORT_NO_DATA });
  assert.deepEqual(R.reportOption({ id: 'g', type: 'gauge', wells: { values: ['pnl'] } }, answer(['pnl'], [[null]], { masked: ['pnl'] }), env()), { empty: '•••' });
  assert.equal(R.reportOption({ id: 'x', type: 'table', wells: {} }, DESKS, env()), null);
});

test('the server bins a histogram and summarises a box plot; this draws them', () => {
  const h = R.reportOption({ id: 'h', type: 'histogram', wells: { values: ['pnl'] } }, answer(['bin', 'count', 'from', 'to'], [['0 to 5', 3, 0, 5], ['5 to 10', 1, 5, 10]]), env());
  assert.deepEqual(h.option.xAxis.data, ['0', '5']);
  assert.deepEqual(h.option.series[0].data, [3, 1]);
  assert.equal(h.option.tooltip.formatter([{ dataIndex: 1, value: 1 }]), '5 to 10\n1 in this band');
  const bx = R.reportOption({ id: 'b', type: 'box', wells: { axis: ['desk'], values: ['pnl'] } }, answer(['desk', 'min', 'q1', 'median', 'q3', 'max', 'count', 'outliers'], [['FX', 1, 2, 3, 4, 5, 9, '12, 14']]), env());
  assert.deepEqual(bx.option.series[0].data[0].value, [1, 2, 3, 4, 5]);
  assert.deepEqual(bx.option.series[1].data, [[0, 12], [0, 14]]);
  assert.equal(bx.marks.items[0].text, 'FX: median 3, 1 to 5, 9 members');
});

test('a live visual rolls a window of points in the host\'s store', () => {
  const store = {};
  const spec = { id: 'r', type: 'live-chart', title: 'Live', wells: { values: ['pnl'] }, format: { window: 5 } };
  let b;
  for (let i = 0; i < 7; i++) { b = R.reportOption(spec, answer(['pnl'], [[i]]), env({ rolling: store })); }
  assert.deepEqual(b.option.series[0].data, [2, 3, 4, 5, 6]);
  assert.equal(b.alt, 'Live: pnl 6');
});

test('the brush: a range of categories, of a histogram\'s values, of a scatter\'s points; nothing for a pie', () => {
  const b = R.reportOption({ id: 'v', type: 'line', wells: { axis: ['desk'], values: ['pnl'] } }, DESKS, env());
  const sel = R.reportBrush({ type: 'line', wells: {} }, b.option, b.marks, env());
  assert.deepEqual(sel(0.2, 2.4), { field: 'desk', values: ['Rates', 'Credit'], range: true, label: 'Rates to Credit' });
  const sc = R.reportOption({ id: 's', type: 'scatter', wells: { details: ['desk'], x: ['pnl'], y: ['var'] } }, DESKS, env());
  assert.deepEqual(R.reportBrush({ type: 'scatter', wells: {} }, sc.option, sc.marks, env())(0, 20), { field: 'desk', values: ['FX', 'Credit'], label: '2 points' });
  assert.equal(R.reportBrush({ type: 'pie', wells: {} }, { xAxis: null }, b.marks, env()), null);
});

test('a program\'s option: markup and code keys dropped at any depth, the theme fills what it left unsaid', () => {
  const o = R.pythonOption({ title: { text: 'x' }, tooltip: { formatter: 'function(){}' }, series: [{ type: 'bar', label: { formatter: '{b}' } }], xAxis: { type: 'category' } }, T);
  assert.equal(o.tooltip.formatter, undefined);
  assert.equal(o.series[0].label.formatter, undefined);
  assert.equal(o.title.textStyle.color, T.ink);
  assert.equal(o.xAxis.axisLine.lineStyle.color, T.border);
  assert.deepEqual([o.animation, o.backgroundColor], [false, 'transparent']);
  const m = R.measureBarsOption({ by: ['desk'], rows: [['FX', 1], [null, 2]], measure: 'n' }, 'T', T, '#123456');
  assert.deepEqual(m.xAxis.data, ['FX', '(blank)']);
  assert.deepEqual(m.series[0].data, [1, 2]);
});

const colours = (node, out) => {
  if (Array.isArray(node)) { node.forEach((v) => colours(v, out)); } else if (node && typeof node === 'object') {
    Object.keys(node).forEach((k) => { if (typeof node[k] === 'string' && /color/i.test(k)) { out.push(node[k]); } colours(node[k], out); });
  }
  return out;
};

test('Chart any table: two value axes, stacks, a pie, decals and dashes past the palette, every colour a token', () => {
  const o = { fmt: (v) => String(v), description: 'Bar chart' };
  const model = { x: ['EUR', 'USD'], xLabel: 'CURRENCY', axis: 'category', others: [false, false],
    series: [{ name: 'AMOUNT', label: 'AMOUNT', data: [250, -80], type: 'bar', axis: 'left' }, { name: 'PV', label: 'PV', data: [225, 71], type: 'line', axis: 'right' }] };
  const c = R.tableChartOption(model, { type: 'combo', x: {} }, T, o);
  assert.equal(c.yAxis.length, 2);
  assert.equal(c.yAxis[1].position, 'right');
  assert.deepEqual(c.series.map((s) => [s.type, s.yAxisIndex]), [['bar', 0], ['line', 1]]);
  assert.equal(c.aria.label.description, 'Bar chart');
  const st = R.tableChartOption(model, { type: 'bar', bars: 'stacked', percent: true, x: {} }, T, o);
  assert.equal(st.series[0].stack, 'bar-left');
  assert.equal(st.yAxis[0].max, 1);
  const pie = R.tableChartOption(model, { type: 'pie', donut: true, x: {} }, T, o);
  assert.deepEqual(pie.series[0].radius, ['45%', '70%']);
  const many = { x: ['k'], xLabel: 'K', axis: 'category', others: [false], series: Array.from({ length: 11 }, (_, i) => ({ name: 's' + i, label: 'V', data: [i], type: 'line', axis: 'left', others: i === 10 })) };
  const m = R.tableChartOption(many, { type: 'line', x: {} }, T, o);
  assert.deepEqual(m.aria.decal, { show: true });
  assert.deepEqual(m.series.slice(8, 10).map((s) => s.lineStyle.type), ['dashed', 'dashed']);
  assert.equal(m.series[10].itemStyle.color, T.faint);
  const allowed = new Set(Object.values(T));
  [c, st, pie, m].forEach((x) => { const found = colours(x, []); assert.ok(found.length && found.every((v) => allowed.has(v)), found.filter((v) => !allowed.has(v)).join(',')); });
});
