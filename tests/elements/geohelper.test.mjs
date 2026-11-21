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
/* drishti-chart's maps under Node, on the vendored Natural Earth files themselves: the projections (Equal Earth, Albers, the fitted
/* drishti-chart's geography part (the map helper of view map panels) under Node, on the vendored Natural Earth files: the world's
   lookups (ISO alpha-2, alpha-3, names), the United States' states and Canada's provinces by code, short code and name, projection and
   bounds (Alaska and Hawaii in their insets), the ECharts option of a world choropleth, a US states map, a Canada map and a bubbles layer
   (the shapes registered once per engine), the click's code, and drawMap over the helper as a view's map panel draws. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGeoHelper, geoHelper, buildGeoOption } from '../../elements/drishti-chart/src/drishti_geohelper.js';
import { drawMap } from '../../elements/drishti-chart/src/drishti_chart-panel-draw.js';

const MAPS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'vendor', 'echarts', 'maps') + path.sep;
const read = (u) => Promise.resolve(JSON.parse(fs.readFileSync(u, 'utf8')));
const fakeEngine = () => { const maps = {}; return { maps, registerMap: (n, g) => { maps[n] = (maps[n] || 0) + 1; maps[n + ':features'] = g.features.length; } }; };
const helper = (E) => createGeoHelper({ base: MAPS, fetchJson: read, engine: E || fakeEngine() });

test('the world: countries by ISO alpha-3, alpha-2 and name; small ones as points', async () => {
  const G = helper(), w = await G.world();
  assert.equal(w.name, 'drishti-geo-world');
  assert.equal(w.by.iso3.DEU.name, 'Germany');
  assert.deepEqual(G.find(w, 'de'), { iso3: 'DEU', iso2: 'DE', name: 'Germany' });
  assert.equal(G.find(w, 'Germany').iso3, 'DEU');
  assert.equal(G.find(w, 'SGP').iso3, 'SGP', 'a small country, drawn as a point');
  assert.equal(G.find(w, 'Atlantis'), null);
  assert.equal(G.find(null, 'DEU'), null);
  assert.equal(await G.world(), w, 'cached');
  assert.deepEqual(G.loads.filter((f) => f.startsWith('world')), ['world-countries.json', 'world-points.json']);
});

test('the United States and Canada: states and provinces by code, short code and name; projection and bounds', async () => {
  const G = helper(), us = await G.region('usa'), ca = await G.region('CAN');
  assert.equal(us.name, 'drishti-geo-USA');
  assert.equal(us.projection, 'albers-usa');
  assert.ok(us.list.length >= 51);
  assert.deepEqual(G.place(us, 'CA'), { code: 'US-CA', name: 'California' });
  assert.equal(G.place(us, 'texas').code, 'US-TX');
  assert.equal(ca.projection, 'albers-canada');
  assert.ok(ca.list.length >= 13);
  assert.equal(G.place(ca, 'ON').name, 'Ontario');
  assert.equal(G.place(ca, 'QC').code, 'CA-QC');
  const b = G.bounds(us);
  assert.ok(b.fit.every(Number.isFinite) && b.all.every(Number.isFinite));
  const ak = G.project(us, -150, 61), hi = G.project(us, -157.8, 21.3), ny = G.project(us, -74, 40.7);
  const frame = (c) => us.frames.find((f) => f.code === c).box, inside = (p, box) => p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3];
  assert.ok(inside(ak, frame('US-AK')), 'Anchorage lands in the Alaska inset');
  assert.ok(inside(hi, frame('US-HI')), 'Honolulu lands in the Hawaii inset');
  assert.ok(!inside(ny, frame('US-AK')) && ny[0] > ak[0]);
  await assert.rejects(G.region('ZZZ'));
});

test('a world choropleth: shaded places, the legend, a highlight, clickable places, registered once', async () => {
  const E = fakeEngine(), G = helper(E), w = await G.world();
  const items = ['DEU', 'FR', 'United States of America', 'IND', 'BRA', 'SGP'].map((c, i) => ({ code: c, value: (i + 1) * 10 }));
  const o = G.option({ level: 'world', geo: w, items, highlight: ['DEU'], clickable: ['DEU', 'FRA'], linked: true, legend: 'Exposure', unit: 'USD m' });
  G.option({ level: 'world', geo: w, items });
  assert.equal(E.maps['drishti-geo-world'], 1, 'the shapes registered once per engine');
  assert.equal(o.geo.map, 'drishti-geo-world');
  assert.deepEqual(o.series[0].data.map((d) => d.name).sort(), ['BRA', 'DEU', 'FRA', 'IND', 'USA']);
  assert.equal(o.visualMap.min, 0);
  assert.equal(o.visualMap.max, 60);
  assert.ok(o.geo.regions.find((r) => r.name === 'DEU').label.show);
  const tip = o.tooltip.formatter({ seriesType: 'map', name: 'DEU' });
  assert.match(tip, /<b>Germany<\/b><br>Exposure: 10 USD m<br>click to open/);
  assert.match(o.tooltip.formatter({ seriesType: 'map', name: 'IND' }), /no page for this country/);
  const sg = o.series[1].data.find((d) => d.code === 'SGP');
  assert.ok(sg && sg.itemStyle.color.startsWith('rgb('), 'a small country is a dot in its shade');
  assert.equal(G.codeOf({ seriesType: 'map', name: 'DEU' }), 'DEU');
  assert.equal(G.codeOf({ seriesType: 'scatter', data: { code: 'SGP' } }), 'SGP');
  assert.equal(G.codeOf({ seriesType: 'map', name: '__frame_US-AK' }), null);
  assert.equal(G.codeOf(null), null);
});

test('a US states map and a Canada map: labelled where few, inset frames, short codes accepted', async () => {
  const E = fakeEngine(), G = helper(E), us = await G.region('USA'), ca = await G.region('CAN');
  const o = G.option({ level: 'region', geo: us, items: [{ code: 'CA', value: 5 }, { code: 'US-TX', value: 3 }, { code: 'New York', value: 4 }], width: 900, height: 500 });
  assert.equal(E.maps['drishti-geo-USA:features'], us.shapes.length + 2, 'the states and the two inset frames');
  assert.deepEqual(o.series[0].data.map((d) => d.name).sort(), ['US-CA', 'US-NY', 'US-TX']);
  assert.equal(o.geo.regions.filter((r) => r.name.startsWith('__frame_')).length, 2);
  assert.equal(o.geo.label.show, false, 'fifty states are not labelled');
  const c = G.option({ level: 'region', geo: ca, items: [{ code: 'ON', value: 9 }, { code: 'CA-BC', value: 2 }], highlight: ['QC'] });
  assert.equal(c.geo.map, 'drishti-geo-CAN');
  assert.equal(c.geo.label.show, true, 'thirteen provinces and territories are labelled');
  assert.equal(c.geo.label.formatter({ name: 'CA-ON' }), 'ON', 'labelled by the short code (the name is in the tooltip)');
  assert.ok(c.geo.regions.find((r) => r.name === 'CA-QC').itemStyle.areaColor);
  assert.ok(Number.isFinite(c.geo.zoom) && c.geo.center.every(Number.isFinite));
});

test('a bubbles layer: at a place or a longitude and latitude, sized by value', async () => {
  const G = helper(), w = await G.world(), us = await G.region('USA');
  const o = G.option({ level: 'world', geo: w, bubbles: [{ code: 'DEU', value: 100 }, { lon: 139.7, lat: 35.7, value: 25, name: 'Tokyo', text: '25 trades' }, { code: 'XXX', value: 1 }] });
  const s = o.series.find((x) => x.name === 'bubbles');
  assert.equal(s.data.length, 2, 'a bubble at no place is left out');
  assert.equal(s.data[0].name, 'Germany');
  assert.ok(s.data[0].symbolSize > s.data[1].symbolSize);
  assert.equal(o.visualMap, undefined, 'no shade, no legend');
  assert.match(o.tooltip.formatter({ seriesIndex: o.series.indexOf(s), data: s.data[1] }), /Tokyo<\/b><br>25 trades/);
  const u = G.option({ level: 'region', geo: us, bubbles: [{ lon: -150, lat: 61, value: 3, name: 'Anchorage' }] });
  const xy = u.series.find((x) => x.name === 'bubbles').data[0].value, box = us.frames.find((f) => f.code === 'US-AK').box;
  assert.ok(xy[0] >= box[0] && xy[0] <= box[2] && xy[1] >= box[1] && xy[1] <= box[3]);
});

test('one helper per maps folder; a helper without a folder or an engine says so', async () => {
  assert.equal(geoHelper({ base: '/maps/' }), geoHelper({ base: '/maps/' }));
  assert.notEqual(geoHelper({ base: '/maps/', fetchJson: read }), geoHelper({ base: '/maps/', fetchJson: read }));
  assert.throws(() => createGeoHelper({}), /maps folder/);
  const G = createGeoHelper({ base: MAPS, fetchJson: read, engine: () => null }), w = await G.world();
  assert.throws(() => G.option({ level: 'world', geo: w }), /needs ECharts/);
  assert.ok(buildGeoOption({ geo: w }).geo, 'without a register step: the option alone');
});

test('drawMap draws a view map panel with the helper: world and region modes, links and notes', async () => {
  const E = fakeEngine(), G = helper(E);
  let set = null, clicks = null;
  const chart = { setOption: (o) => { set = o; }, on: (n, f) => { clicks = f; } };
  const engine = { getInstanceByDom: () => chart, init: () => chart };
  const el = { clientWidth: 600, clientHeight: 300 }, out = [], opened = [];
  const got = await drawMap(engine, G, el, { mode: 'world', highlight: 'DE', shade: { label: 'Orders', items: [{ code: 'DEU', value: 4 }, { code: 'FR', value: 2 }] },
    link: { kind: 'country', template: 'country/{iso3}', codes: ['DEU', 'FRA'] } }, {}, (l) => opened.push(l), out);
  assert.equal(set.geo.map, 'drishti-geo-world');
  assert.deepEqual(got.places.map((p) => p.name), ['France', 'Germany']);
  assert.match(got.note, /Shaded by Orders/);
  clicks({ seriesType: 'map', name: 'FRA' });
  assert.deepEqual(opened, [{ kind: 'country', id: 'country/FRA' }]);
  await drawMap(engine, G, el, { mode: 'region', region: 'Canada', shade: { label: 'Orders', items: [{ code: 'CA-ON', value: 4 }] } }, {}, () => {}, out);
  assert.equal(set.geo.map, 'drishti-geo-CAN');
  await assert.rejects(drawMap(engine, G, el, { mode: 'region', region: 'Atlantis' }, {}, () => {}, out), /unknown country/);
});
