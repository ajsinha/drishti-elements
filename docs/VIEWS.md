<!--
  Drishti Elements

  Copyright (c) 2026 Ashutosh Sinha <ajsinha@gmail.com>.
  All rights reserved.

  PROPRIETARY.

  This file is the proprietary property of Ashutosh Sinha.
  Copying, use, modification or distribution of this file, via any medium,
  is not permitted except with the express prior written permission of the
  copyright holder.

  See the LICENSE file in the root of this repository.
-->
# Whole screens: drishti-views

Whole screens from a **ViewModel** (contract 1, its schema in [CONTRACTS.md](CONTRACTS.md#the-viewmodel-drishti-views)): a title line, a
strip of figures, panels of twenty-two kinds (label and value pairs, status chips, a metric, markdown, links, a timeline, tables, a
ladder, a pivot, tabs, lines and areas, bars, a gauge, a surface, a waterfall, a histogram, a scatter, candlesticks, a graph, a map) and a
layout. In those panels the painter computes and formats nothing: every figure is the producer's text. Contract 1.1 adds **datasets**:
rows by name, with raw values the painter formats by each field's format, read by `grid`, `tree` and `chart` panels (4 below).

**1. Paint a view**

```js
await Drishti.elements.load('drishti-views');
const handle = Drishti.elements.views.paint(document.getElementById('orders'), '/views/orders.json');   // or a ViewModel object
handle.on('link', (e) => console.log(e.detail.link));          // a link the page resolves (options.links.href makes it an address)
handle.on('pick', (e) => console.log(e.detail.pick));          // a table row with a pick
```

The view draws inside a shadow root (`shadow: false` draws into the element). A chart, a graph or a map loads drishti-chart (and
drishti-graph) the first time a view has one; a page of words and tables never loads a chart engine. A map draws out of the box (see
[Maps](#maps)).

A host that styles the view itself passes `sheets` (constructable `CSSStyleSheet`s): they are adopted by the view's shadow root, or by
the root the element is in, and the painter links no stylesheet at all, so a host page whose `style-src` refuses links still draws. The
chart engine is loaded the first time a view has a chart: the vendored copy by default, or the host's way with `engine: () => promise`
(a Trusted Types policy, say).

`tableTools: { filters: true, chart: true }` gives every table the reader's tools: a funnel on each column heading (the column's values
with their counts, a search, Select all, and on a number column a condition such as `> 1m` or `<= 250k`; the filters combine across
columns and with the filter box, survive a patch, and are cleared from the table's bar), and Chart any table: the rows as shown
(filtered, sorted) open as a chart in a dialog beside the table, never a new window, with the kind (bar, line, area, pie, scatter), what
goes across and the series to choose, and the chart card's data table and export (drishti-chart's `openTableChart`, which a page can call
on any rows). A grid's "Chart the range" (its context menu) opens the same dialog. The view raises `filter` and `chart-table` events.

A view's `controls` (filters, inputs, toggles) are drawn by the painter with drishti-inputs' components, in the bar under the title line,
a side bar or a panel's header. A pick tells the page first (`control-change`: `{control, value, values, query}`), runs the control's
effects, then asks `host.bind` with every value the reader set (`ctl.<id>`) and draws again only the panels the control reads; a view
loaded from an address and given no `bind` is read again with the values. `controls: 'legs=2'` gives the values the reader had set
(`<elements-view controls="legs=2">`); `controls: false` leaves the drawing to the page, which calls `handle.change(id, value)`.

```js
const handle = paint(el, vm, { controls: 'legs=2', host: { bind: (req) => fetch('/views/trade/MX-1?' + new URLSearchParams(req.params)).then((r) => r.json()) } });
handle.on('control-change', (e) => history.replaceState(null, '', '?' + e.detail.query));     // the page keeps its own address
```

**2. The element**

```html
<elements-view src="/views/orders.json" density="compact" panels="summary,orders"></elements-view>
```

Or set `.viewModel` (an object) and `.options`; an inline `<script type="application/json">` child is a view in a one-file page.

**3. Live**

```js
const events = Drishti.elements.events.connect('/events', { namespace: 'my-app.' + userId });
paint(el, '/views/orders.json', { live: { events: events } });            // topic views.<the view's id>
paint(el, '/views/orders.json', { live: { url: '/views/orders/stream', raw: true } });   // a plain SSE stream: events view and frame
handle.patch({ seq: 4113, generation: 0, patches: [{ op: 'strip', index: 0, cell: { label: 'Booked', text: '18,432,850' } }] });  // by hand
```

Frames that arrive faster than the page paints are conflated; a hidden page catches up in one paint when shown.

**4. Datasets: grids, trees and charts (contract 1.1)**

```js
paint(el, {
  contract: '1.1', /* ref, title, strip, keys, provenance, timings as usual */
  datasets: { trades: { key: ['id'], fields: [{ name: 'id', type: 'string' }, { name: 'desk', type: 'string', label: 'Desk' },
                                               { name: 'notional', type: 'number', fmt: 'amount0' }],
                        values: [['T-1', 'Rates', 2500000], ['T-2', 'FX', 700000]] },
              positions: { pages: { url: '/api/positions', size: 500 } },          // or server: { url }, arrow: { url }, name: 'positions'
              org: { name: 'org' } },
  panels: [{ id: 'trades', kind: 'grid', title: 'Trades', data: { dataset: 'trades', group: ['desk'], sort: [{ field: 'notional', desc: true }] } },
           { id: 'by-desk', kind: 'chart', title: 'By desk', data: { dataset: 'trades', type: 'bar', x: 'desk', y: [{ field: 'notional', agg: 'sum' }] } },
           { id: 'tree', kind: 'tree', title: 'Books', data: { dataset: 'org', node: 'id', parent: 'parent', label: 'name', mode: 'grid' } }]
}, { data: { org: rows, allow: ['https://data.example'] } });       // rows the page hands by name; origins a dataset may be read from
handle.patch({ seq: 9, patches: [{ op: 'rows', dataset: 'trades', update: [{ id: 'T-1', notional: 2600000 }], remove: ['T-2'] }] });
```

A grid draws only the rows in view (a pages or server dataset is read a window at a time), groups, sorts and pivots in the browser
(`pivot: {rows, columns, values: [{field, agg}]}`); a tree draws in its four modes (`grid`, `org`, `sunburst`, `icicle`); a chart (`bar`,
`line`, `area`, `scatter`, `pie`, `donut`, `heatmap`, `histogram`) combines the rows per `x` and `by` when a measure has an `agg`
(`sum`, `count`, `min`, `max`, `avg`, `first`, `last`, `distinct`), keeping the `limit` largest categories. Panels naming one dataset share
it, and a `rows` patch reaches all of them. Each library is loaded, and its sheets adopted into the view's shadow root, the first time a
view has such a panel. `handle.dataset(name)` answers a dataset (its fields and the rows it holds). A map panel's `points`
(`{label, lat, lon, value, text, link}`) are drawn as bubbles. The builders write datasets too: `view('Desk').dataset('trades', rows,
{ key: 'id', formats: { notional: 'amount0' } }).grid('Trades', { dataset: 'trades' })`, `frame(9).rows('trades', { update })`; a view
is stamped `1.1` only when it uses what 1.1 adds.

**5. Build a view (browser or Node)**

```js
import { view, frame, sse } from '/elements/drishti-views/src/drishti_index.js';   // under Node: require('drishti_views.js')
const vm = view('EMEA').title('Region · Orders', 'EMEA').ref('region', 'EMEA')
  .strip([{ label: 'Booked', text: '18,420,350', emphasis: true }])
  .kv('Summary', { fields: [{ label: 'Owner', text: 'Northwind Sales' }] })
  .hbar('By country', { bars: [{ label: 'DEU', value: 40, text: '40' }] }, { span: 4 })
  .toJSON();                                                     // checked; a ViewError names the path and the fix
const stream = sse((text) => res.write(text), { topic: 'views.EMEA' });   // Content-Type: text/event-stream
stream.view(vm); stream.frame(frame(1).strip(0, { label: 'Booked', text: '18,432,850' }).toJSON());
```

`validate(view, { strict })` checks any ViewModel; `registerKind(name, { paint })` adds a host's own kind.

## Maps

Maps come with Elements: the world's countries (Natural Earth 1:110m, the small ones as points) and every country's first-level regions
(Natural Earth admin-1, simplified: the United States' states with Alaska and Hawaii as insets, Canada's provinces and territories, India's
states, and so on), vendored under `vendor/echarts/maps/` (public domain, [VENDOR.md](../vendor/VENDOR.md)). Nothing comes from a tile
server or a CDN; each file is read from your own server the first time a map needs it, and cached for the page.

**A map panel in a view** draws with no setup: drishti-views loads drishti-chart's **geo part** (`drishti_chart-geohelper.js`, about 14 KB)
and only the shapes that map needs, the first time a view has a map.

```js
paint(el, { contract: '1.0', ref: { kind: 'book', id: 'B-1' }, title: { id: 'B-1' }, panels: [
  { id: 'world', kind: 'map', data: { mode: 'world', highlight: 'GB', shade: { label: 'Exposure', items: [{ code: 'USA', value: 420 }, { code: 'DEU', value: 130 }] },
    link: { kind: 'country', template: 'country/{iso3}', codes: ['USA', 'DEU'] } } },          // a click raises the link event
  { id: 'us', kind: 'map', data: { mode: 'region', region: 'USA', shade: { label: 'Orders', items: [{ code: 'US-CA', value: 90 }, { code: 'TX', value: 70 }] } } },
  { id: 'ca', kind: 'map', data: { mode: 'region', region: 'Canada', shade: { label: 'Orders', items: [{ code: 'ON', value: 50 }] } } }] });
```

A country is named by its ISO alpha-3 or alpha-2 code or its English name; a region by its ISO 3166-2 code (`US-CA`), the code without its
country (`CA` on the United States' map) or its name. The options: `mapsBase` (the shapes are elsewhere; default the static root's
`vendor/echarts/maps/`), `geo` (a function that resolves with your own map helper of the same shape: it overrides the part) and
`geo: false` (no maps: a map panel says so in words). A page that gives its libraries as modules (`libraries`) gives the part too, as
`libraries['drishti-chart:geo']`.

**The map helper itself**, for a page that draws its own maps (a choropleth and a layer of bubbles at places or at a longitude and
latitude):

```js
const P = await Drishti.elements.core.loadPart('drishti-chart', 'geo');
const G = P.geoHelper(), us = await G.region('USA');               // G.world(), G.region(iso3), G.find(world, 'DE'), G.place(us, 'CA')
echarts.init(el, null, { renderer: 'svg' }).setOption(G.option({ level: 'region', geo: us,
  items: [{ code: 'NY', value: 650 }], bubbles: [{ lon: -149.9, lat: 61.2, value: 40, name: 'Anchorage' }] }));   // Anchorage in the inset
```

`G.project(geo, lon, lat)` places a point on a level's map and `G.bounds(geo)` gives its boxes. The projections: Equal Earth for the world,
Albers for the United States and for Canada, a conic fitted to any other country. The chart's own `map` kind (`new Chart(el, { kind:
'map', ... })`, with its ranking, table and drill from the world to a country's regions) reads the same shapes. A packed page
(`cli.py pack --maps`) carries the shapes and the geo part.
