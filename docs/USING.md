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
drishti-elements-<version>/
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
| events in the page, across tabs and with a server | `events` ([EVENTS.md](EVENTS.md)) |
| whole screens from a ViewModel | `views` ([VIEWS.md](VIEWS.md)) |

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

## Events and whole screens

Two libraries have a guide of their own:

- **[EVENTS.md](EVENTS.md)**: drishti-events, topics, publish and subscribe, a server over SSE or WebSocket, one connection for all tabs, the inspector, a queue that survives a reload.
- **[VIEWS.md](VIEWS.md)**: drishti-views, the painter: paint a ViewModel, the `<elements-view>` element, live frames, datasets, the builders, and maps.

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
