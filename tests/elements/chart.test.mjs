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
/* drishti-chart under Node, without a page: the spec and its checks, the data helpers and the condition language, the
   formats and the theme, every kind's option, table and legend, the Vega-Lite translator (the report's and the
   Python sample's specs among them), linked selection. The map loader and projections are in maps.test.mjs; the drawn
   chart is tested in a browser against the fixture harness (test_elements_chart_browser.py). */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../elements/drishti-chart/src/drishti_index.js';
import { EventBus } from '../../elements/drishti-core/src/drishti_index.js';
import * as fs from 'node:fs';

const th = C.chartTheme({ theme: 'terminal' });
const env = { theme: th, fmt: C.formatterFor('money'), xfmt: C.formatterFor() };
const build = (spec, rows) => { const s = C.normalizeSpec(spec); return C.kindOf(s.kind).build(s, rows || C.rowsOf(s.data), env); };
const DESKS = [{ id: 'r', desk: 'Rates', today: 9e6, yday: 8e6 }, { id: 'f', desk: 'FX', today: -3e6, yday: 2e6 }, { id: 'c', desk: 'Credit', today: 6e6, yday: 7e6 }];

test('the spec: checks with paths, aliases and defaults, and the readable text', () => {
  assert.deepEqual(C.checkSpec({ kind: 'nope' }).map((p) => p.path), ['$.kind']);
  const probs = C.checkSpec({ kind: 'line', legend: 'left', onClick: 'zoom', export: ['pdf'], series: [{}], annotations: [{ type: 'band', from: 1 }], marks: [{ when: 'a <' }] });
  assert.deepEqual(probs.map((p) => p.path), ['$.legend', '$.onClick', '$.export[0]', '$.series[0]', '$.annotations[0]', '$.marks[0].when']);
  assert.throws(() => C.normalizeSpec({ kind: 'nope' }), /\$\.kind: no kind nope/);
  const s = C.normalizeSpec({ kind: 'column', x: 'desk', y: 'today', color: 'region', series: 'region' });
  assert.equal(s.kind, 'bar');
  assert.deepEqual([s.x, s.y, s.colour, s.series], [{ field: 'desk' }, { field: 'today' }, { field: 'region' }, { by: 'region' }]);
  assert.deepEqual([s.legend, s.onClick, s.export, s.a11y.table], ['bottom', 'explain', ['png', 'svg', 'csv', 'spec'], true]);
  const text = C.specText({ data: { rows: [1, 2, 3, 4, 5] }, title: 't', kind: 'line', x: 'd' });
  assert.ok(text.indexOf('"kind"') < text.indexOf('"title"') && text.indexOf('"title"') < text.indexOf('"data"'));
  assert.match(text, /… 5 rows/);
  assert.match(C.specText({ kind: 'line', data: { rows: [1, 2, 3, 4] } }, { rows: true }), /4\n/);
  assert.throws(() => C.registerKind('line', { build: () => null }), /registered already/);
  assert.ok(C.kindList().length >= 21);
});

test('data: rows of every shape, bins, boxes, quantile classes', () => {
  assert.deepEqual(C.rowsOf({ columns: ['a', { name: 'b' }], rows: [[1, 2]] }), [{ a: 1, b: 2 }]);
  assert.deepEqual(C.rowsOf({ values: [{ a: 1 }] }), [{ a: 1 }]);
  assert.deepEqual(C.rowsOf([{ a: 1 }]), [{ a: 1 }]);
  const b = C.bin([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { bins: 5 });
  assert.equal(b.length, 5);
  assert.equal(b.reduce((s, x) => s + x.count, 0), 10);
  assert.deepEqual(b.map((x) => x.count), [2, 2, 2, 2, 2]);
  const box = C.boxStats([1, 2, 3, 4, 5, 6, 7, 8, 100]);
  assert.deepEqual(box.box, [1, 3, 5, 7, 8]);
  assert.deepEqual(box.outliers, [100]);
  const q = C.quantileBreaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null], 5);
  assert.deepEqual(q.breaks, [3, 5, 7, 9]);
  assert.deepEqual([C.classOf(1, q.breaks), C.classOf(3, q.breaks), C.classOf(10, q.breaks), C.classOf(null, q.breaks)], [0, 1, 4, -1]);
  assert.deepEqual(C.members([{ d: 'b' }, { d: 'a' }, { d: 'b' }], 'd', ['a']), ['a', 'b']);
});

test('the condition language: comparisons, arithmetic, datum, precedence; no calls, no eval', () => {
  const r = { hypothetical: -5, var99: 4, MTM: -1, 'P&L': 3, desk: 'FX' };
  assert.equal(C.compileCondition('hypothetical < -var99')(r), true);
  assert.equal(C.compileCondition('datum.MTM < 0')(r), true);
  assert.equal(C.compileCondition("datum['P&L'] >= 3 && desk == 'FX'")(r), true);
  assert.equal(C.compileCondition('1 + 2 * 3 == 7 || false')({}), true);
  assert.equal(C.compileCondition('!(var99 > 10)')(r), true);
  assert.equal(C.compileCondition('(MTM + var99) / 3')(r), 1);
  assert.throws(() => C.compileCondition('alert(1)'), /has more after|cannot use/);
  assert.throws(() => C.compileCondition('a = 1'), /cannot read/);
  assert.throws(() => C.compileCondition('a <'), /ends too soon/);
  assert.deepEqual(C.conditionFields('hypothetical < -var99 && datum.MTM > 0'), ['hypothetical', 'var99', 'MTM']);
});

test('formats and the theme come from drishti-core', () => {
  assert.equal(C.formatterFor('money')(-30205543.2), '−30.21m');
  assert.equal(C.formatterFor('amount0')(1234.5), '1,235');
  assert.equal(C.formatterFor('pct2')(0.01234), '1.23%');
  assert.equal(C.formatterFor()(1234567), '1.23m');
  assert.equal(C.formatterFor()(12.345), '12.35');
  assert.equal(C.formatterFor({ currency: 'USD' })(12), '$12.00');
  assert.equal(th.tokens.link, '#7fb2ff');
  assert.equal(th.palette[0], th.tokens.link);
  assert.equal(C.toneColour(th, 'bad'), th.tokens.bad);
  assert.equal(C.chartTheme({ theme: 'light' }).dark, false);
  assert.equal(C.chartTheme({ theme: 'terminal', density: 'terminal' }).size.font, 10.5);
  assert.equal(C.rampColour(['#000000', '#ffffff'], 5, 0, 10), 'rgb(128,128,128)');
});

test('line: wide series, a negated dashed one, conditional marks, annotations, ids on every item', () => {
  const rows = [{ date: '2026-01-02', hyp: 1, v: 2 }, { date: '2026-01-05', hyp: -3, v: 2 }, { date: '2026-01-06', hyp: 0.5, v: 2 }];
  const b = build({ kind: 'line', id: 'date', data: { rows }, x: { field: 'date', type: 'time' }, series: [{ field: 'hyp' }, { field: 'v', negate: true, style: 'dashed', tone: 'bad' }],
    marks: [{ when: 'hyp < -v', tone: 'bad', name: 'Exception' }], annotations: [{ type: 'line', axis: 'y', value: 0 }, { type: 'band', axis: 'x', from: '2026-01-02', to: '2026-01-05', label: 'stress' }] });
  const [hyp, v, mark] = b.option.series;
  assert.equal(b.option.xAxis.type, 'time');
  assert.deepEqual(v.data.map((d) => d.value[1]), [-2, -2, -2]);
  assert.equal(v.lineStyle.type, 'dashed');
  assert.equal(v.itemStyle.color, th.tokens.bad);
  assert.deepEqual(mark.data.map((d) => d.ids), [['2026-01-05']]);
  assert.equal(hyp.markLine.data[0].yAxis, 0);
  assert.equal(hyp.markArea.data.length, 1);
  assert.deepEqual(b.legend.map((l) => l.style), ['line', 'dash', 'dot']);
  assert.equal(b.table.rows.length, 3);
  assert.match(b.summary, /2 series, 3 points, from 2026-01-02 to 2026-01-06/);
});

test('bar: grouped, stacked to 100%, horizontal and sorted, coloured by a condition; long rows by a field', () => {
  const g = build({ kind: 'bar', data: { rows: DESKS }, x: 'desk', series: [{ field: 'today' }, { field: 'yday' }] });
  assert.deepEqual(g.option.xAxis.data, ['Rates', 'FX', 'Credit']);
  assert.equal(g.option.series.length, 2);
  const p = build({ kind: 'bar', data: { rows: DESKS }, x: 'desk', series: [{ field: 'today' }, { field: 'yday' }], stack: 'percent' });
  p.option.xAxis.data.forEach((c, i) => assert.ok(Math.abs(p.option.series.reduce((s, x) => s + Math.abs(x.data[i].value), 0) - 100) < 1e-9));
  const hz = build({ kind: 'bar', data: { rows: DESKS }, x: 'desk', y: 'today', orient: 'horizontal', sort: 'value desc', colourWhen: [{ when: 'today < 0', tone: 'bad' }] });
  assert.equal(hz.option.yAxis.type, 'category');
  assert.deepEqual(hz.option.yAxis.data, ['Rates', 'Credit', 'FX']);
  assert.equal(hz.option.series[0].data[2].itemStyle.color, th.tokens.bad);
  const long = build({ kind: 'bar', data: { rows: [{ d: 'A', r: 'x', v: 1 }, { d: 'A', r: 'y', v: 2 }, { d: 'B', r: 'x', v: 3 }] }, x: 'd', y: 'v', series: { by: 'r' }, stack: true });
  assert.deepEqual(long.option.series.map((s) => s.name), ['x', 'y']);
  assert.deepEqual(long.option.series[1].data.map((d) => d.value), [2, null]);
  assert.equal(long.option.series[0].stack, 'total');
});

test('scatter, bubble, histogram with its tail, waterfall, box plot, heatmap, candlestick', () => {
  const trades = [{ ID: 'a', v: 1, m: 5, n: 10, d: 'X' }, { ID: 'b', v: 2, m: -1, n: 40, d: 'Y' }, { ID: 'c', v: 3, m: 2, n: 0, d: 'X' }];
  const sc = build({ kind: 'bubble', id: 'ID', data: { rows: trades }, x: 'v', y: 'm', size: 'n', colour: 'd' });
  assert.deepEqual(sc.option.series.map((s) => s.name), ['X', 'Y']);
  assert.ok(sc.option.series[1].data[0].symbolSize > sc.option.series[0].data[0].symbolSize);
  assert.deepEqual(sc.option.series[0].data.map((d) => d.ids[0]), ['a', 'c']);
  const strip = build({ kind: 'scatter', data: { rows: trades }, x: { field: 'm', type: 'value' }, y: { field: 'd', type: 'category' } });
  assert.equal(strip.option.yAxis.type, 'category');
  assert.deepEqual(strip.option.series[0].data[0].value, [5, 'X']);
  const hist = build({ kind: 'histogram', data: { rows: [-5, -4, -1, 0, 1, 2, 3].map((x) => ({ p: x })) }, value: 'p', bins: 4, tail: { below: -3, tone: 'bad' } });
  const bars = hist.option.series[0].data;
  assert.equal(bars.reduce((s, d) => s + d.value[2], 0), 7);
  assert.equal(bars[0].itemStyle.color, th.tokens.bad);
  assert.notEqual(bars[3].itemStyle.color, th.tokens.bad);
  const wf = build({ kind: 'waterfall', data: { rows: [{ s: 'open', v: 10 }, { s: 'up', v: 3 }, { s: 'down', v: -5 }, { s: 'close', v: 8 }] }, category: 's', value: 'v' });
  assert.deepEqual(wf.option.series[0].data.map((d) => d.value), [0, 10, 8, 0]);
  assert.deepEqual(wf.option.series[1].data.map((d) => d.real), [10, 3, -5, 8]);
  assert.equal(wf.option.series[1].data[1].itemStyle.color, th.tokens.ok);
  const bx = build({ kind: 'boxplot', data: { rows: [1, 2, 3, 4, 50].map((x) => ({ d: 'A', v: x })) }, category: 'd', value: 'v' });
  assert.deepEqual(bx.option.series[1].data.map((d) => d.value), [['A', 50]]);
  const hm = build({ kind: 'heatmap', data: { rows: [{ x: 'a', y: 'p', v: -4 }, { x: 'b', y: 'p', v: 2 }] }, x: 'x', y: 'y', value: 'v', scale: { type: 'diverging' } });
  assert.deepEqual([hm.option.visualMap.min, hm.option.visualMap.max], [-4, 4]);
  assert.deepEqual(hm.table.rows, [['p', -4, 2]]);
  const cs = build({ kind: 'candlestick', data: { rows: [{ d: '1', open: 1, close: 2, low: 0.5, high: 2.5 }] }, x: 'd' });
  assert.deepEqual(cs.option.series[0].data[0].value, [1, 2, 0.5, 2.5]);
});

test('pie, donut with Other, gauge with bands, treemap, sankey; layers share their categories', () => {
  const rows = 'abcdefghijklmn'.split('').map((c, i) => ({ c: c, v: 14 - i }));
  const pie = build({ kind: 'donut', data: { rows }, category: 'c', value: 'v', top: 5 });
  assert.equal(pie.option.series[0].data.length, 5);
  assert.equal(pie.option.series[0].data[4].name, 'Other');
  assert.equal(pie.option.series[0].data[4].value, rows.slice(4).reduce((s, r) => s + r.v, 0));
  assert.equal(pie.option.series[0].radius[0], '52%');
  const g = build({ kind: 'gauge', data: { rows: [{ u: 0.78 }] }, value: { field: 'u' }, min: 0, max: 1, bands: [{ to: 0.7, tone: 'good' }, { to: 1, tone: 'bad' }] });
  assert.deepEqual(g.option.series[0].axisLine.lineStyle.color.map((x) => x[0]), [0.7, 1]);
  const tm = build({ kind: 'treemap', data: { rows: [{ a: 'X', b: '1', v: 2 }, { a: 'X', b: '2', v: 3 }, { a: 'Y', b: '1', v: 4 }] }, levels: ['a', 'b'], value: 'v' });
  assert.deepEqual(tm.option.series[0].data.map((n) => [n.name, n.value, n.children.length]), [['X', 5, 2], ['Y', 4, 1]]);
  const sk = build({ kind: 'sankey', data: { rows: [{ s: 'A', t: 'B', v: 1 }, { s: 'A', t: 'B', v: 2 }, { s: 'B', t: 'C', v: 1 }] }, source: 's', target: 't', value: 'v' });
  assert.deepEqual(sk.option.series[0].links.map((l) => l.value), [3, 1]);
  const layers = build({ kind: 'layer', layers: [{ kind: 'bar', data: { rows: [{ d: 'A', v: 1 }] }, x: 'd', y: 'v' }, { kind: 'line', data: { rows: [{ d: 'B', w: 2 }, { d: 'A', w: 3 }] }, x: 'd', y: 'w' }] }, []);
  assert.deepEqual(layers.option.xAxis.data, ['A', 'B']);
  assert.deepEqual(layers.option.series.map((s) => [s.type, s.layer]), [['bar', 0], ['line', 1]]);
  assert.deepEqual(layers.option.series[1].data.map((d) => d.value), [3, 2]);
});

test('Vega-Lite: the report\'s bar and the Python sample\'s layers translate whole and draw', () => {
  const bar = C.fromVegaLite({ mark: { type: 'bar', cornerRadiusEnd: 3 }, encoding: { x: { field: 'DESK', type: 'nominal', sort: '-y', title: 'Desk' }, y: { field: 'MTM', type: 'quantitative', title: 'Net MTM' },
    color: { condition: { test: 'datum.MTM < 0', value: '#b3261e' }, value: '#4f7cff' }, tooltip: [{ field: 'DESK' }, { field: 'MTM', format: ',.0f' }] } }, { rows: [{ DESK: 'FX', MTM: -3 }, { DESK: 'Rates', MTM: 5 }] });
  assert.deepEqual(bar.unsupported, []);
  assert.deepEqual([bar.spec.kind, bar.spec.sort, bar.spec.x.title, bar.spec.tone, bar.spec.colourWhen[0].tone], ['bar', 'value desc', 'Desk', 'link', 'bad']);
  const bb = build(bar.spec);
  assert.deepEqual(bb.option.xAxis.data, ['Rates', 'FX']);
  assert.equal(bb.option.series[0].data[1].itemStyle.color, th.tokens.bad);
  const py = C.fromVegaLite({ width: 'container', height: 'container', layer: [
    { data: { values: [{ desk: 'FX', pnl1d: 10 }, { desk: 'FX', pnl1d: 30 }, { desk: 'RATES', pnl1d: -5 }] }, mark: { type: 'circle', opacity: 0.6, size: 40 }, encoding: { x: { field: 'pnl1d', type: 'quantitative', title: 'One-day P&L' }, y: { field: 'desk', type: 'nominal', title: null } } },
    { data: { values: [{ desk: 'FX', median: 20 }, { desk: 'RATES', median: -5 }] }, mark: { type: 'tick', thickness: 3, size: 22, color: '#d9534f' }, encoding: { x: { field: 'median', type: 'quantitative' }, y: { field: 'desk', type: 'nominal' } } }] });
  assert.deepEqual(py.unsupported, []);
  assert.equal(py.spec.kind, 'layer');
  assert.deepEqual(py.spec.layers.map((l) => [l.kind, l.symbol, l.tone || null]), [['scatter', 'circle', null], ['scatter', 'tick-v', 'bad']]);
  const pb = build(py.spec, []);
  assert.deepEqual(pb.option.yAxis.data, ['FX', 'RATES']);
  assert.deepEqual(pb.option.series[1].symbolSize === undefined ? pb.option.series[1].data[0].symbolSize : null, [3, 20]);
});

test('Vega-Lite: aggregates, bins, arcs, rects, boxplots, temporal lines with colour, transforms, rules; the rest listed', () => {
  const rows = [{ d: 'A', r: 'x', v: 1, t: '2026-01-01' }, { d: 'A', r: 'y', v: 2, t: '2026-01-02' }, { d: 'B', r: 'x', v: 4, t: '2026-01-01' }];
  const agg = C.fromVegaLite({ mark: 'bar', encoding: { x: { field: 'd', type: 'nominal' }, y: { aggregate: 'sum', field: 'v', type: 'quantitative' } } }, { rows });
  assert.deepEqual(agg.spec.data.rows, [{ d: 'A', v: 3 }, { d: 'B', v: 4 }]);
  const cnt = C.fromVegaLite({ mark: 'bar', encoding: { x: { field: 'd', type: 'nominal' }, y: { aggregate: 'count', type: 'quantitative' } } }, { rows });
  assert.deepEqual(cnt.spec.data.rows.map((r) => r.__count), [2, 1]);
  assert.equal(C.fromVegaLite({ mark: 'bar', encoding: { x: { field: 'v', bin: { maxbins: 10 } }, y: { aggregate: 'count' } } }, { rows }).spec.kind, 'histogram');
  const arc = C.fromVegaLite({ mark: { type: 'arc', innerRadius: 50 }, encoding: { theta: { field: 'v', type: 'quantitative' }, color: { field: 'd', type: 'nominal' } } }, { rows });
  assert.deepEqual([arc.spec.kind, arc.spec.category.field], ['donut', 'd']);
  assert.equal(C.fromVegaLite({ mark: 'rect', encoding: { x: { field: 'd' }, y: { field: 'r' }, color: { field: 'v', type: 'quantitative' } } }, { rows }).spec.kind, 'heatmap');
  assert.equal(C.fromVegaLite({ mark: 'boxplot', encoding: { x: { field: 'd', type: 'nominal' }, y: { field: 'v', type: 'quantitative' } } }, { rows }).spec.kind, 'boxplot');
  const area = C.fromVegaLite({ mark: 'area', encoding: { x: { field: 't', type: 'temporal' }, y: { field: 'v', type: 'quantitative', stack: 'normalize' }, color: { field: 'r', type: 'nominal' } } }, { rows });
  assert.deepEqual([area.spec.kind, area.spec.x.type, area.spec.series.by, area.spec.stack], ['area', 'time', 'r', 'percent']);
  const tf = C.fromVegaLite({ transform: [{ filter: 'datum.v > 1' }, { calculate: 'datum.v * 2', as: 'w' }, { filter: { field: 'd', oneOf: ['A'] } }], mark: 'point', encoding: { x: { field: 'w', type: 'quantitative' }, y: { field: 'v', type: 'quantitative' } } }, { rows });
  assert.deepEqual(tf.spec.data.rows.map((r) => r.w), [4]);
  const ruled = C.fromVegaLite({ layer: [{ mark: 'line', encoding: { x: { field: 't', type: 'temporal' }, y: { field: 'v', type: 'quantitative' } } }, { mark: { type: 'rule', color: 'red' }, encoding: { y: { datum: 3 } } }] }, { rows });
  assert.deepEqual(ruled.spec.annotations, [{ type: 'line', axis: 'y', value: 3, tone: 'bad' }]);
  const rest = C.fromVegaLite({ facet: { row: { field: 'd' } }, mark: 'text', encoding: { text: { field: 'd' } } }, { rows });
  assert.equal(rest.spec, null);
  assert.deepEqual(rest.unsupported, ['$.facet', '$.encoding.text', '$.mark (text)']);
  assert.match(rest.refused, /^Not drawn: .*\$.facet: use small multiples/);
  assert.match(C.fromVegaLite({ data: { url: 'http://x' }, mark: 'bar' }).refused, /may not load anything from a URL/);
  assert.deepEqual(['#b3261e', '#4f7cff', '#2e7d32', '#e8a33a', '#888888', 'red'].map(C.colourTone), ['bad', 'link', 'good', 'accent', 'muted', 'bad']);
  assert.deepEqual([',.0f', ',.2f', '.0%', '.2%', '~s', '$,.0f', 'x'].map(C.d3Format), ['amount0', 'amount2', 'pct0', 'pct2', 'compact', 'amount0', null]);
});

test('linked selection: a grid\'s selection goes out on the bus, a chart\'s comes back in, never echoed', () => {
  const b = new EventBus(), selected = [];
  const model = { events: new EventBus(), selection: { selectAll: (ids) => { selected.push(ids.slice()); model.events.emit('selectionChanged', { ids: ids }); } } };
  const heard = [];
  b.on('ui.selection.>', (p) => heard.push([p.channel, p.ids.join(), p.source === model ? 'grid' : 'other']));
  const off = C.linkGrid({ model: model }, { channel: 'trades', bus: b });
  model.events.emit('selectionChanged', { ids: ['T1', 'T2'] });
  C.publishSelection('trades', ['T9'], { bus: b, source: 'chart' });
  C.publishSelection('other', ['T5'], { bus: b, source: 'chart' });
  assert.deepEqual(selected, [['T9']]);
  assert.deepEqual(heard, [['trades', 'T1,T2', 'grid'], ['trades', 'T9', 'other'], ['other', 'T5', 'other']]);
  off();
  C.publishSelection('trades', ['T3'], { bus: b });
  assert.equal(selected.length, 1);
  assert.throws(() => C.linkGrid({}, { channel: 'x' }), /give a drishti-grid/);
});

test('heatmap tracks and category cells: strips on either axis, aligned grids, the legend\'s keys and the table\'s rows', () => {
  const rows = [];
  ['1', '2', '3'].forEach((p) => ['A', 'C'].forEach((a) => rows.push({ id: p + a, P: p, AA: a, S: Number(p) - 2 })));
  const t = build({ kind: 'heatmap', id: 'id', data: { rows }, x: 'P', y: 'AA', value: 'S', scale: { type: 'diverging' },
    tracks: [{ axis: 'x', title: 'Burial', values: { 1: 0.1, 2: 0.9 } }, { axis: 'x', title: 'Fold', field: 'P', tones: { 1: 'accent' }, type: 'category' }, { axis: 'y', title: 'Group', values: { A: 'small' } }] });
  assert.equal(t.option.grid.length, 4);
  assert.equal(t.option.series[0].type, 'heatmap');
  assert.deepEqual(t.option.visualMap.seriesIndex, 0);
  assert.ok(t.option.series.slice(1).every((s) => s.track && s.type === 'heatmap'));
  assert.ok(t.option.grid.filter((g) => g.height).every((g) => g.left === t.option.grid[0].left && g.right === t.option.grid[0].right));
  assert.deepEqual(t.table.rows.map((r) => r[0]), ['A', 'C', 'Burial', 'Fold']);
  assert.equal(t.table.columns[t.table.columns.length - 1].header, 'Group');
  assert.ok(t.legendStatic && t.legend.some((k) => k.name === 'small'));
  const c = build({ kind: 'heatmap', data: { rows: rows.map((r) => Object.assign({}, r, { K: r.S > 0 ? 'up' : 'down' })) }, x: 'P', y: 'AA', value: { field: 'K', type: 'category', tones: { up: 'good', down: 'bad' } } });
  assert.equal(c.option.visualMap, undefined);
  const dm = build({ kind: 'heatmap', data: { rows }, x: { field: 'P', domain: ['0', '1', '2', '3'], labels: false }, y: 'AA', value: 'S' });
  assert.deepEqual(dm.option.xAxis.data, ['0', '1', '2', '3']);
  assert.equal(dm.option.xAxis.axisLabel.show, false);
  const z = build({ kind: 'heatmap', data: { rows }, x: 'P', y: 'AA', value: 'S', zoom: { window: [0, 1] }, tracks: [{ axis: 'x', title: 'T', values: { 1: 1 } }, { axis: 'y', title: 'Y', values: { A: 1 } }] });
  assert.deepEqual(z.option.dataZoom[0].xAxisIndex, [0, 2]);                 // the heatmap and its x track move together; the y track does not
  assert.deepEqual([z.option.dataZoom[0].startValue, z.option.dataZoom[0].endValue], [0, 1]);
  assert.equal(z.option.grid[0].bottom, z.option.grid[1].bottom);
  assert.deepEqual(c.legend.map((k) => k.name), ['down', 'up']);
  assert.equal(c.option.series[0].data[0].itemStyle.color, C.toneColour(th, 'bad'));
  assert.equal(C.valueText({ seriesType: 'heatmap', value: [0, 0, 'up'] }, env.fmt), 'up');
  assert.deepEqual(C.checkSpec({ kind: 'heatmap', tracks: [{ axis: 'z' }] }).map((p) => p.path), ['$.tracks[0].axis', '$.tracks[0]']);
});

test('a scatter\'s segments, top labels and surface; the rectangle brush\'s ids; precomputed boxes', () => {
  const rows = [{ ID: 'a', X: 1, Y: 2, G: 'g1' }, { ID: 'b', X: 15, Y: 9, G: 'g2' }, { ID: 'c', X: 16, Y: 3, G: 'g2' }];
  const s = build({ kind: 'scatter', id: 'ID', data: { rows }, x: 'X', y: 'Y', segments: { values: [{ name: 'one', from: 0, to: 10 }, { name: 'two', from: 10, to: 20 }] },
    labelTop: { field: 'G', n: 1 }, surface: { rows: [{ x: 1, y: 1, value: 2 }, { x: 3, y: 1, value: 4 }], cell: [2, 2] } });
  assert.deepEqual(s.option.series.map((x) => x.name), ['__surface', 'Y', '__labels']);
  assert.deepEqual(s.option.series[2].data.map((d) => d.name), ['g2']);
  assert.equal(s.option.series[1].markArea.data.length, 2);
  assert.equal(s.option.xAxis.axisLabel.show, false);
  assert.notEqual(s.option.series[1].data[0].itemStyle.color, s.option.series[1].data[1].itemStyle.color);
  assert.equal(C.segmentOf([{ from: 0, to: 10 }, { from: 10, to: 20 }], 15), 1);
  assert.deepEqual(C.idsInBox(s.option, { x: [10, 20], y: [0, 5] }), ['c']);
  const b = build({ kind: 'boxplot', data: { rows: [{ R: '1', lo: 1, q1: 2, md: 3, q3: 4, hi: 5, n: 10 }] }, category: 'R', value: 'md', boxes: { low: 'lo', q1: 'q1', median: 'md', q3: 'q3', high: 'hi', n: 'n' } });
  assert.deepEqual(b.option.series[0].data[0].value, [1, 2, 3, 4, 5]);
  assert.deepEqual(b.table.rows[0], ['1', 1, 2, 3, 4, 5, 10]);
});

test('lollipop and the 3D trace: stems and heads coloured by a number, points in order, flat where three dimensions are not available', () => {
  const l = build({ kind: 'lollipop', data: { rows: [{ P: 5, N: 2, S: -1 }, { P: 50, N: 4, S: 1 }] }, x: 'P', y: 'N', length: 100,
    colour: { field: 'S', scale: 'diverging', legend: [{ name: 'hurts', value: -1 }, { name: 'helps', value: 1 }] }, bands: [{ name: 'domain', from: 1, to: 20 }] });
  assert.deepEqual(l.option.series.map((x) => x.type), ['bar', 'scatter']);
  assert.deepEqual(l.legend.map((k) => k.name), ['hurts', 'helps']);
  assert.equal(l.option.series[1].data[0].itemStyle.color, l.legend[0].colour);
  const rows = [{ P: 2, X: 1, Y: 1, Z: 1, M: -1 }, { P: 1, X: 0, Y: 0, Z: 0, M: 1 }];
  const g = build({ kind: 'trace3d', data: { rows }, x: 'X', y: 'Y', z: 'Z', order: 'P', id: 'P', colour: { field: 'M', scale: 'diverging' }, gl: true, selected: ['2'] });
  assert.ok(g.option.grid3D && g.option.series[0].type === 'line3D' && g.option.series[1].type === 'scatter3D');
  assert.deepEqual(g.option.series[0].data, [[0, 0, 0], [1, 1, 1]]);
  assert.ok(g.option.series[1].data[1].symbolSize > g.option.series[1].data[0].symbolSize);
  const flat = build({ kind: 'trace3d', data: { rows }, x: 'X', y: 'Y', z: 'Z' });
  assert.ok(flat.flat && flat.option.series[1].type === 'scatter' && /drawn flat/.test(flat.summary));
  assert.equal(C.canDraw3d(null), false);
});

test('frames: the values in order, the rows of a frame or up to it, the checks', () => {
  const rows = [{ R: 2 }, { R: 10 }, { R: 1 }, { R: 2 }];
  assert.deepEqual(C.frameValues(rows, { field: 'R' }), [1, 2, 10]);
  assert.deepEqual(C.frameValues(rows, { field: 'R', values: [10, 2] }), [10, 2]);
  assert.deepEqual(C.frameRows(rows, { field: 'R' }, [1, 2, 10], 1), [{ R: 2 }, { R: 2 }]);
  assert.equal(C.frameRows(rows, { field: 'R', mode: 'upto' }, [1, 2, 10], 1).length, 3);
  assert.equal(C.frameRows(rows, null, [], 0), rows);
  assert.equal(C.reducedMotion(null), false);
  assert.deepEqual(C.checkSpec({ kind: 'scatter', brush: 'lasso', frames: { field: 'R', mode: 'all' } }).map((p) => p.path), ['$.brush', '$.frames.mode']);
  assert.ok(C.CHART_EVENTS.includes('brushed') && C.CHART_EVENTS.includes('frameChanged'));
});

test('the segmented scatter and the matrix: thresholds and segments; category cells in the given order with every column kept', () => {
  const rows = [{ ID: 'a', X: 1, Y: 2, G: 'p' }, { ID: 'b', X: 15, Y: 12, G: 'q' }, { ID: 'c', X: 16, Y: 7, G: 'q' }];
  const s = build({ kind: 'segmented', id: 'ID', data: { rows }, x: 'X', y: 'Y', segments: [{ name: 'Asia', from: 0, to: 10 }, { name: 'Europe', from: 10, to: 20 }],
    thresholds: [{ value: 10, label: 'alert', tone: 'bad' }, { value: 6, label: 'watch', tone: 'warn' }], labelTop: { field: 'G', n: 1 } });
  const pts = s.option.series.find((x) => x.type === 'scatter' && !x.helper);
  assert.equal(pts.markArea.data.length, 2);
  assert.deepEqual(pts.markLine.data.map((l) => l.yAxis), [10, 6]);
  assert.equal(pts.data.find((d) => d.ids[0] === 'b').itemStyle.color, C.toneColour(th, 'bad'));
  assert.deepEqual(s.legend.map((k) => k.name), ['alert', 'watch']);
  assert.match(s.summary, /2 segments, 1 at or past alert/);
  const m = build({ kind: 'matrix', data: { rows: [{ D: 'Rates', T: '02', S: 'breach' }] }, x: { field: 'T', domain: ['01', '02', '03'] }, y: { field: 'D', domain: ['Rates', 'FX'] },
    value: { field: 'S', tones: { breach: 'bad' } }, tracks: [{ title: 'Month end', values: { '03': 'yes' } }] });
  assert.deepEqual(m.option.xAxis[0].data, ['01', '02', '03']);
  assert.deepEqual(m.option.yAxis[0].data, ['Rates', 'FX']);
  assert.equal(m.option.series[0].data[0].itemStyle.color, C.toneColour(th, 'bad'));
  assert.equal(m.option.series.filter((x) => x.track).length, 1);
  assert.match(m.summary, /2 rows by 3 columns, 1 cells filled/);
  const wide = build({ kind: 'matrix', data: { rows: [] }, x: { field: 'T', domain: Array.from({ length: 200 }, (_, i) => String(i)) }, y: { field: 'D', domain: ['A'] }, value: { field: 'S' } });
  assert.ok(wide.option.dataZoom && wide.option.xAxis.axisLabel.show === false);
  const t = build({ kind: 'trace3d', data: { rows: [{ X: 0, Y: 0, Z: 0 }] }, x: 'X', y: 'Y', z: 'Z', fallback: 'table' });
  assert.ok(t.flat && t.preferTable);
});

test('a line panel of several series (contract 1.2): bars, points and areas by mark, a right axis, a legend; a click hands back the row', () => {
  const T = { link: '#1', accent: '#2', ok: '#3', neg: '#4', warn: '#5', bad: '#6', muted: '#7', ink: '#8', border: '#9', surface: '#a', mono: 'm' };
  const d = { x: ['a', 'b'], series: [{ label: 'P&L', values: [1, -2], tone: 'accent', mark: 'bar' }, { label: 'VaR', values: [3, 3], tone: 'warn', axis: 'right' },
    { label: 'Limit', values: [4, 4], mark: 'point', axis: 'right' }], ev: ['0', '1'] };
  const o = C.panelOption('line', d, T, { width: 600, height: 300 });
  assert.deepEqual(o.series.map((s) => s.type), ['bar', 'line', 'scatter']);
  assert.deepEqual(o.series.map((s) => s.yAxisIndex || 0), [0, 1, 1]);
  assert.equal(o.yAxis.length, 2);
  assert.deepEqual(o.legend, { show: false, data: ["P&L", "VaR", "Limit"] });
  assert.equal(o.xAxis.boundaryGap, true);
  assert.deepEqual(C.pointOf('line', d, { seriesIndex: 1, dataIndex: 1 }), { ev: '1', series: 'VaR' });
  const split = { x: ['1Y', '5Y'], series: [{ label: 'Today', values: [1, 2], ev: ['0', '1'] }, { label: 'Yesterday', values: [1, null], ev: ['2', null] }] };
  assert.deepEqual(C.pointOf('line', split, { seriesIndex: 1, dataIndex: 0 }), { ev: '2', series: 'Yesterday' });
  assert.equal(C.pointOf('line', split, { seriesIndex: 1, dataIndex: 1 }), null);
  assert.equal(C.pointOf('line', { x: ['a'], series: [{ values: [1] }] }, { seriesIndex: 0, dataIndex: 0 }), null);
  const one = C.panelOption('line', { x: ['a'], series: [{ label: 'x', values: [1], tone: 'link' }] }, T, {});
  assert.equal(one.legend, undefined);
  assert.equal(one.yAxis.type, 'value');
});
