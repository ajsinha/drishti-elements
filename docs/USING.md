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
| date pickers, multi-select, forms, the code editor | `inputs` |
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
