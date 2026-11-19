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
# Design

How Drishti Elements is built and the rules it keeps. How to use it is [USING.md](USING.md); every option and call is in the generated
[API.md](API.md); every component is live in the gallery.

## 1. One implementation of each thing

An application that grows screen by screen collects a grid per screen, a chart wrapper per chart, a number formatter per file, each with its own
keyboard, accessibility, bugs and look. Drishti Elements is one implementation of each: eight libraries, each with one job, and a guard that stops
a second copy from growing beside them (section 9).

## 2. The eight libraries

| Library | What it is | Requires |
|---|---|---|
| **drishti-core** | formats, theme tokens and the theme switch, the API client, the event bus, accessibility helpers, resize, the keymap, dialogs, drawers, toasts, the state kit, the command palette, the dock, the filter model every library shares, the loader | none |
| **drishti-inputs** | date and range pickers with holiday calendars, the switch, the tree picker, the multi-select, the combobox, forms from a schema with four eyes, the filter bar, the code editor, the formula input | core |
| **drishti-chart** | one engine-neutral spec over the vendored ECharts, the general kinds, the maps, the card and studio modes, Explain on any mark, the data table, export, linked selection, live updates, Vega-Lite translated into the spec | core, inputs |
| **drishti-grid** | the grid and its pivot in three layouts, tree data, ranges, cell editing, the live-set mode, export, the AG Grid-style adapter | core, inputs, chart |
| **drishti-data** | one data-source contract (memory, REST pages, server-side rows, Arrow, live), the Arrow client | core |
| **drishti-events** | events in the page, across tabs and with a server (WebSocket, Server-Sent Events): topics with wildcards, publish and subscribe, request and reply, streams, routes, reconnect and resume; the one home of every connection to a server | core |
| **drishti-tree** | hierarchies in four modes of one component: the tree grid, the org chart, the sunburst, the icicle; measures with non-additive ones asked of the host; an edit mode that proposes moves; the outline of an authoring screen | core, inputs, grid |
| **drishti-graph** | networks on a canvas for thousands of nodes: force, layered, radial, circular and grouped layouts, paths, groups, selection, an adjacency table | core, inputs, grid |
| **drishti-designer** | the designer kit: the layout canvas over a layout model, palette, inspector, outline, YAML pane, undo and redo on one command stack, the designer shell | core, inputs, tree |

A library that draws a choice draws it with drishti-inputs' `Select`, so the grid, the chart, the graph and the tree require inputs. Nothing
depends on a host: a library names no host route and needs no host page (section 4).

## 3. The rules every library keeps

- **No framework required.** Each component is a **web component** (`<drishti-grid>`, `<drishti-chart>`, ...) and a **plain JavaScript class** with the
  same options (`new Grid(el, options)`); React, Angular and Vue use them as they use any custom element.
- **Plain ES modules, no build step**, readable as served; one entry per library, its style sheet, a `.d.ts` and a bundle. The bundle is written by
  `python3 tools/elements/build.py` (offline, no npm): a classic script that registers the library on `window.Drishti.elements` and is a CommonJS module
  under Node. A stale bundle fails the checks.
- **Vendored, never a CDN.** Engines (ECharts, CodeMirror, Arrow JS) and map shapes live under `vendor/` with their licences, listed in
  `vendor/VENDOR.md`.
- **Files under 2,000 lines**; object-oriented, configuration-driven, one namespace on `window` (`Drishti.elements`).
- **The theme is CSS custom properties** from drishti-core's tokens ([THEMING.md](THEMING.md)); light and dark, three **densities** (comfortable,
  compact, terminal) shared by every component. Colours come from tokens only.
- **Accessibility is part of the component**: roles, names, keyboard, focus, announcements, contrast (WCAG 2.2 AA); every drawing has a table or text
  alternative; `prefers-reduced-motion` is honoured.
- **The browser computes no figure a server owns.** The grid's client-side aggregation exists for standalone use and is switched off with
  `clientAggregation: false`; every total is then the server's, and a non-additive measure (a ratio, a distinct count, a percentile) is never a sum.
- **One chrome**: the same toolbar, menus, status bar, Explain entry and export menu on the grid, the chart and the map.
- **No bespoke UI in a host**: an authoring screen is assembled from the libraries; a need they do not meet is met by extending a library.

## 4. A library names no host

Everything that belongs to the host is an option:

- **Where the libraries are.** The loader's default folder is the folder the core bundle was loaded from; an ES module import with no script tag calls
  `configure({ base })`. The map shapes are `vendor/echarts/maps/` beside the elements folder (option `mapsBase`).
- **Where the host's server is.** `configure({ endpoints: { live, changes, pivotPage, capabilities } })`; a component that needs an address it does not
  have is off and says so in words ([CONTRACTS.md](CONTRACTS.md)).
- **Libraries that live elsewhere.** `Drishti.elements.register(name, { bundle, requires, css, scripts, module, base })` adds a library to the loader, which
  orders and refuses it by the same rules as the manifest's (`module` is the host's own grouping: a host may allow only some modules).
  `python3 tools/elements/build.py --root DIR --manifest FILE --header FILE --elements DIR` bundles them.
- **Errors and headers.** The error shape is `{ code, detail }` with any code string; the as-of header's name is `asOfHeader`.
- **Explain.** An option `explain` supplies the answer; without it a component shows no Explain action.

## 5. drishti-core

Formats (numbers, money, percentages, dates, durations, "3 min ago", with half-up rounding), the themes and the switch, the API client (cancellation,
retries, an error in words), a typed event bus, accessibility helpers (live region, focus trap, roving tab index), the one resize component, the keymap
(one registry, conflicts refused), dialogs, menus, toasts and popovers, the state kit (loading, empty, error, offline blocks), chips for list
attributes ("+N more"), the command palette, the dock, the CSV writer, typed number reading, and the loader that loads other libraries with their sheets and
engines once each.

## 6. drishti-grid

**Three layouts of one component**, chosen with `layout` (they share the grid, the pivot model, the menus, the status bar and Explain):

| `layout` | Arrangement | Best at |
|---|---|---|
| `'wells'` | one line above the grid: Rows, Columns and Filters as chips, the measures as Values, a field picker behind each well | a pivot on a page among other things |
| `'panel'` | Build (the wells as lists, pivot mode, subtotal and grand-total switches, deferred update) and Fields (search, hierarchies, folders), closing to a rail | building and changing pivots all day |
| `'terminal'` | a command line, compact wells, a dense grid, Explain in a split pane below, function keys at the foot | the keyboard |

**Features.** Virtual rows and columns (millions of rows); server-side rows in windows with prefetch and cancellation; column pinning, reorder, resize,
autosize, groups, header menus; multi-column sort, Excel-style filters and a quick filter; tree data and grouping; cell ranges with a status bar (count,
sum, average, min, max, and a warning when a range mixes measures or sums a non-additive one); copy and paste; editing with validation, undo and four
eyes; conditional formatting; a context menu extendable by the host; CSV and Excel export from the browser; the keyboard of a grid with `role="grid"` or
`treegrid` and virtual `aria-rowcount`.

**The pivot.** A pivot is a view: `rows`, `columns` (dimensions, in order), `values` (a measure with its aggregation), `filters` (members, and value
filters such as "greater than" or "top 5 by"), `totals`, `expanded`. The grid draws row groups opened lazily, pivot result columns with collapsible
column groups, totals and subtotals in the server's order, a grand total row and column, `≈` beside an approximate figure and `◆` on a non-additive
measure. Two row models: **server-side** (the grid sends the view and the window it needs and the server answers rows in display order with every total
computed: non-additive measures are right at every level) and **client-side** (rows in memory, built-in aggregations sum, count, average, min, max, first,
last, distinct count and the host's registered functions; a measure marked `aggregate: 'server'` shows no client total).

**The live-set mode.** `LiveSetGrid` draws a live result set of a server (a blotter, a form or query result): the snapshot, then the changes the server
streams, ticking cells, a record panel beside the grid and the person's tray. It decides nothing: rights, masks, versions and four eyes are the server's.

**The AG Grid-style adapter.** `createGridFromAgOptions(el, gridOptions)` takes the option shapes of AG Grid Enterprise's row grouping, pivoting,
server-side row model and tree data and builds a drishti-grid. Drishti Elements never uses AG Grid: no code, package, CSS or look; the adapter was written
from AG Grid's public documentation of its option and API shapes only. Every option not taken in full is named once in the browser's console and by
`reportUnsupported()`. The mapping's one home is the code (`AG_MAPPING` in `drishti_grid-ag-map.js`); the gallery's tab and
[MOVING_FROM_AG_GRID.md](MOVING_FROM_AG_GRID.md) are generated from it.

## 7. drishti-chart

**One engine-neutral spec above ECharts**; nothing in a spec names the engine:

```json
{ "kind": "line", "title": "Daily P&L", "data": { "source": "/data/pnl.json" },
  "x": { "field": "date", "type": "time" }, "y": { "format": "money" },
  "series": [{ "field": "hypothetical" }, { "field": "limit", "negate": true, "style": "dashed", "tone": "bad" }],
  "legend": "bottom", "zoom": { "window": [150, 250] }, "onClick": "explain", "export": ["png", "svg", "csv"], "a11y": { "table": true } }
```

Every chart gets the theme and density, drishti-core's formats on axes and tooltips, a crosshair tooltip, legend toggles, click to Explain, export (PNG at
2x, SVG, CSV, the spec), a **data-table alternative** and the grid's card chrome and status line. **Kinds**: line, area, bar (grouped, stacked,
horizontal), scatter, bubble, heatmap (sequential and diverging), waterfall, candlestick, histogram, box plot, treemap, sankey, graph, gauge,
sparkline, calendar, map, segmented, matrix, lollipop, 3D trace. A kind is a module that turns the spec into engine options; a domain library registers its own (`registerKind`) and it appears
in the gallery like the general ones.

**Maps.** `kind: "map"`: the world, then a country's first-level regions (US states and DC, Canadian provinces and territories, and every country with a
file), from the vendored Natural Earth shapes (`world-countries.json` at 1:110m, `world-points.json` for countries too small for that scale,
`regions/<ISO3>.json` at 1:10m simplified; public domain). A country's regions load when first opened and stay cached; nothing comes from a map service.
Codes are ISO 3166 (alpha-3 for countries, 3166-2 for regions). Projections: Equal Earth for the world, Albers for the USA (with Alaska and Hawaii
insets) and Canada, a conic fitted to the country otherwise. The grouping of countries into sub-regions and continents is one table,
`data/world-regions.yaml`, which a host's server may read too.

**Vega-Lite** is translated into the spec (`fromVegaLite`) and drawn by drishti-chart; Vega itself is not drawn: one drawing engine.

**More kinds and options**, each with its gallery page and Node tests; a domain library builds on them and draws nothing itself:

| Capability | Spec | For example |
|---|---|---|
| Heatmap **tracks** | `tracks: [{axis: 'x'\|'y', title, values \| field, type, tones, scale}]`, `trackSize` | a limit's status over desks, a region beside each row |
| Heatmap **category cells** | `value: {field, type: 'category', tones, order}`; `x.domain` (every column, an empty one too), `x.labels: false` | a status matrix (within, warning, breach) |
| Heatmap **overview strip** | `zoom: true` or `{window: [first, last]}`: a window over the columns, the tracks move with it | a wide date-by-row matrix on a phone |
| Scatter **segments** | `segments: {values: [{name, from, to}], tones}`: one value axis of named segments, alternate bands and tones | sessions of a trading day |
| Scatter **top labels** | `labelTop: {field, n}`: the tallest point of the top members named | the largest moves of the day |
| Scatter **surface** | `surface: {rows: [{x, y, value}], cell, scale}`: the server's grid of values under the points | a cost surface under the points |
| **Rectangle brush** | `brush: 'rect'`: the points inside are selected, told to the link's channel; event `brushed` {box, ids} | picking points on a scatter, a linked grid follows |
| **Frames** | `frames: {field, play, interval, mode: 'only'\|'upto', at, label, playText}`: a slider and Play (none with reduced motion); `setFrame`, `frame`, `play`, `pause`; event `frameChanged` | stepping the dates of a history |
| Box plot from the server's figures | `boxes: {low, q1, median, q3, high, n}` (field names; nothing computed in the page) | quantiles computed by a server |
| `segmented` kind | `x`, `y`, `segments: [{name, from, to}]`, `thresholds: [{value, label, tone}]` (the first colours the points past it), `labelTop` | moves through a day by session |
| `matrix` kind | `x: {field, domain}`, `y: {field, domain}`, `value: {field, tones, order}`, `tracks`: category cells in the given order, every column kept, the overview strip past 150 columns | a status matrix by row and day |
| `lollipop` kind | `x`, `y`, `colour` (a category's tones or a number's ramp with `legend` words), `length`, `bands` | events along a year |
| `trace3d` kind | `x`, `y`, `z`, `order`, `colour`, `selected`, `turn` (none with reduced motion), `fallback: 'flat'\|'table'`: points joined in order on the vendored ECharts GL, loaded on first use; where WebGL is off, drawn flat or its table shown | a path or a trajectory |
| drishti-core **`Tour`** | marks `data-tour-say`, `data-tour-steps`, controls `data-tour="back\|at\|next"`; `go`, `next`, `back`, `destroy` | a guided first visit of any board |

## 8. Packaging and versions

One distribution: the release tree `drishti-elements-<version>/` and its zip, built from a tag by `python3 tools/elements/cli.py dist` (offline, Python
only, reproducible). `cli.py pack` writes one JavaScript file and one style sheet for a page that wants two files. **One version for every library**:
`elements` in `elements/drishti_elements.json`; the bundles' headers, the loader's `ELEMENTS_VERSION`, the release tree's manifest, the catalogue and the
reference are generated from it. A released version never changes; a fault is fixed by the next patch version.

## 9. Documentation, the gallery and the checks

- **The reference** [API.md](API.md) is generated from the typed JSDoc by `python3 tools/docs/elements_api.py`; a public symbol without a typed comment
  fails the check, and so does a stale file. The same parse writes the gallery's catalogue and the migration guide's option table.
- **The gallery** (`gallery/drishti_gallery.html`) shows every component live with its options, its events and the code to use it, in a playground and a
  documentation mode. It is static: it runs from the file system and needs no server; its stand-in data is made up. It ships in the release tree.
- **The checks** (the gate): `python3 tools/elements/build.py --check`, `python3 tools/docs/elements_api.py --check`, `python3 tools/license_headers.py`,
  `node --test tests/elements/*.test.mjs` and `python3 -m pytest -q tests -n 8`. They include the byte budget of each bundle, the guard that the generic
  libraries hold no domain vocabulary, the guard that nothing loads from a CDN, one version everywhere, the licence guard of `vendor/`, and a real browser
  for every library (Chromium, under a strict Content-Security-Policy).
