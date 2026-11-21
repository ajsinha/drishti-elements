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
# Using Drishti Elements in your own application

Drishti Elements are plain JavaScript and CSS: a grid with a pivot, charts and maps, inputs and forms, a data client, trees, graphs and a
designer kit. No framework and no build step are needed. Every file is one you keep inside your own organisation: a copy of the release tree
that your own web server serves. Nothing is loaded from a CDN.

## Install: the release tree

`python3 tools/elements/cli.py dist --out dist` writes `dist/drishti-elements-<version>/` and the same as a zip. Copy the folder to where
your web server serves static files, for example `/vendor/drishti/`. The loader in drishti-core finds the other libraries, the style sheets and
the engines from the folder its own bundle was loaded from, so nothing has to be configured.

```
drishti-elements-2.4.0/
  drishti-elements.json        every library and file, with each file's bytes and SHA-384 integrity hash
  LICENSE  README.md  CHANGELOG.md
  elements/<library>/src/*.js  ES modules (tree-shakable)
  elements/<library>/drishti_<name>.js   the bundle: a classic script, registers Drishti.elements.<name>
  elements/<library>/drishti_<name>.css  the component's sheet
  elements/<library>/drishti-<name>.d.ts TypeScript declarations, generated from the typed JSDoc
  css/        the design tokens (every theme) and the components' shared sheets
  themes/     one complete sheet per theme
  vendor/     the engines (ECharts, CodeMirror, Arrow JS), the map shapes, each with its licence
  gallery/    the live documentation: open gallery/drishti_gallery.html
  data/  config/  tools/elements/build.py
```

## A page with a grid

```html
<link rel="stylesheet" href="/vendor/drishti/css/drishti_tokens.css">
<script src="/vendor/drishti/elements/drishti-core/drishti_core.js"></script>
<div id="grid" style="height: 260px"></div>
<script>
  Drishti.elements.load('drishti-grid').then(() => {
    new Drishti.elements.grid.Grid(document.getElementById('grid'), {
      columns: [{ field: 'desk', header: 'Desk' }, { field: 'pnl', header: 'P&L', type: 'number', format: 'amount0' }],
      rows: [{ desk: 'Rates', pnl: 1250000 }, { desk: 'Credit', pnl: -340000 }, { desk: 'FX', pnl: 560000 }],
      getRowId: (r) => r.desk,
    });
  });
</script>
```

`Drishti.elements.load` loads a library with what it requires, its style sheets and its engine, once each. As ES modules, import only what
you use: `import { Grid } from '/vendor/drishti/elements/drishti-grid/src/drishti_index.js'`; a page that imports modules and has no core script tag
calls `configure({ base: '/vendor/drishti/elements/' })` first. As web components: `<drishti-grid>` with its options as a property. The options of every
component are in [API.md](API.md) and live in the gallery.

## Pick libraries: two files

| You want | Libraries |
|---|---|
| tables, a pivot, export | `grid` |
| charts and maps | `chart` |
| date pickers, multi-select, forms, the code editor, split panes, tabs, a searchable grouped list, a column-mapping table | `inputs` |
| paged, server-side or live rows, Arrow | `data` (with `grid`) |
| hierarchies, networks | `tree`, `graph` |
| the layout canvas, inspector and YAML pane of an editor | `designer` |

`python3 tools/elements/cli.py pack --libs grid,chart --theme dark --out web/vendor/drishti` writes `drishti-elements.js` and
`drishti-elements.css` with exactly those libraries and what they require (deepest first), and `drishti-elements-pack.json` with the SHA-384 of each.
`--no-engines` leaves ECharts out when the page loads its own first; `--maps` copies the map shapes beside the files; drishti-inputs' code editor reads
CodeMirror from `vendor/codemirror/` beside the packed files, which the pack writes when inputs is packed.

## Theme

See [THEMING.md](THEMING.md): every theme is a `data-theme` value of one sheet, one fixed theme is `themes/drishti-theme-<name>.css`, and your own is a
few tokens set after the sheet.

## Connecting to a server

The libraries compute and draw in the browser. A host with a server tells them where it is and answers in the shapes of
[CONTRACTS.md](CONTRACTS.md): live sets and their change history, a pivot page, Arrow and Flight capabilities, Explain, and server pivots whose
totals the browser never recomputes. A host that keeps its own libraries beside these registers them with `Drishti.elements.register(name, ...)`, builds
them with `python3 tools/elements/build.py --root <dir> --manifest <file> --header <file> --elements <this tree's elements/>`, and the loader refuses or
loads them by the same rules.

## drishti-events

One event model for the page, its tabs and a server: topics with wildcards (`*` one segment, `>` the rest), publish and subscribe, request and
reply, streams, typed topics, and routes that decide whether a message stays in the page, goes to the other tabs or goes to a server. The
library's own happenings are topics too (`$events.state`, `$events.error`, ...), so there is nothing else to learn.

Load it with the bundle, or import it:

```js
await Drishti.elements.load('drishti-events');
const events = Drishti.elements.events.connect();            // no server: the page and its tabs
// or: import { connect } from '/elements/drishti-events/src/drishti_index.js';
```

**1. Publish and subscribe in the page**

```js
const events = connect();
const off = events.on('prices.*.USDCAD', (m) => console.log(m.topic, m.data));   // `prices.>` hears every depth
events.publish('prices.fx.USDCAD', { bid: 1.36, ask: 1.37 });
off();
```

**2. A server over Server-Sent Events, with a status badge**

```js
const events = connect('/events');                           // ws: or wss: gives a WebSocket
events.on('$events.state', (m) => { badge.textContent = m.data.state; });   // connecting, open, reconnecting, ...
events.subscribe('prices.>', (m) => grid.applyTransaction({ update: [m.data] }));
```

Subscriptions made before the connection opens are sent when it does; a reconnect restores them and asks for what was missed.

**3. One connection for all tabs**

```js
const events = connect('/events', { share: true, namespace: 'my-app.' + userId });   // a SharedWorker holds the one connection
```

A subscription held by several tabs is one subscription to the server (it matters for SSE over HTTP/1.1, six connections per site). Where there
is no `SharedWorker`, the tab holding a Web Lock relays to the others, and when it closes the next tab takes over and resumes. `namespace` is
required with `share`: one per application and signed-in person, so two people's tabs never share a connection.

**4. The inspector**

```js
events.inspect();                                            // a drawer at the page's side; or events.inspect(element), a dock's panel
```

Messages (filter by a topic pattern such as `prices.>`, or by words in the topic, kind or outcome; pause), subscriptions, the connection
timeline, the queue, and "why didn't I get it?" (`events.explain({ topic })`). Keys: `/` to filter, `Space` to pause, `Enter` to open the
message under focus, `Esc` to close it, then the inspector. The inspector is a part of its own, loaded when opened.

**5. A queue that survives a reload, and the status badge**

```js
const events = connect('/events', { namespace: 'my-app.' + userId, outbox: { persist: true } });
events.publish('notes.edit', { text: 'edit 1' }, { queue: 'persist' });   // waits while offline, sent once and in order
Drishti.elements.events.statusBadge(document.getElementById('badge'), events);   // "Live", "Reconnecting in 4 s", "Offline: 5 changes waiting"
```

Reference: [API.md](API.md#drishti-events) (every call and option), the wire protocol for a server in
[CONTRACTS.md](CONTRACTS.md#the-events-contract-drishti-events-protocol-version-1), and how it is built in [DESIGN.md](DESIGN.md#8-drishti-events).
The gallery's Eventing pages run every example on the mock server.

## drishti-views

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

## Versions and integrity

One semantic version for every library, `elements` in `elements/drishti_elements.json`; what changed is in [../CHANGELOG.md](../CHANGELOG.md). The
same sources make the same bytes, so a hash changes only with the code. `drishti-elements.json` holds each file's integrity hash for
subresource integrity:

```html
<script src="/vendor/drishti/elements/drishti-core/drishti_core.js" integrity="sha384-..." crossorigin="anonymous"></script>
```

## Content-Security-Policy

The components draw through the DOM and the CSSOM: no inline script and no inline style are needed, and no `unsafe-eval`. The harness pages and the
tests run under `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:`.

## More

- [API.md](API.md): the reference of every library, generated from the typed JSDoc (and the `.d.ts` files).
- [DESIGN.md](DESIGN.md): how the libraries are built and the rules they keep.
- [MOVING_FROM_AG_GRID.md](MOVING_FROM_AG_GRID.md): moving an AG Grid Enterprise pivot application.
