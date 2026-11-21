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
# Views: the design of drishti-views and the open ViewModel

**Status: a design, being built on the branch `feature/views`. Steps 1 to 4, 6 and 7 of section 13.1 are built** (the specification,
the validator, the painter's core, every kind of contract 1); step 5 (datasets) and the kinds `grid`, `tree` and `chart` wait for the
specification: contract 1 has no `datasets` (drishti-rachana's `spec/1/VIEWMODEL.md`: additions come as 1.x minors or contract 2); on contract 1.x as decision N3 of drishti-rachana's plan set it: the specification's one home is
drishti-rachana's `spec/1/viewmodel.schema.json`, kept here as a pinned copy, and version 1 keeps the reference's field names (`contract`,
`fmt`, `ev`, `title.pill`, `provenance`, the panel fields `error`, `denied`, `empty`, `wire`, `compute`), which the painter draws as they
are. Where this document's field names differ (sections 2 to 5), contract 1.x is what is built; the differences are listed in
drishti-rachana's `spec/1/VIEWMODEL.md`. When the library is built its facts move to their homes ([DESIGN.md](DESIGN.md),
[USING.md](USING.md), [CONTRACTS.md](CONTRACTS.md), the generated [API.md](API.md)) and this file is deleted.

The aim: **anyone's server, script or page can describe a whole screen as JSON and have Drishti Elements paint it.** A screen is a
**ViewModel**: panels, a layout, formats, links, data (inline, Arrow, or paged from a server) and, when it is live, patches. The description is
an open, versioned specification with a JSON Schema; the painter is one small library over the grid, the chart, the tree, the graph and the
inputs that already exist. No framework, no build step, no CDN; it runs from `file://`.

```html
<script type="module" src="/elements/drishti-views/drishti_views.js"></script>
<elements-view src="/views/sales.json"></elements-view>
```

Contents: [1 Where it lives](#1-where-it-lives) · [2 The ViewModel specification](#2-the-viewmodel-specification-version-10) ·
[3 Panel kinds](#3-panel-kinds) · [4 Data](#4-data) · [5 Live: frames and patches](#5-live-frames-and-patches) ·
[6 States, errors and accessibility](#6-states-errors-and-accessibility) · [7 Security](#7-security) · [8 The painter](#8-the-painter) ·
[9 Builders](#9-builders) · [10 Validation, the playground and the gallery](#10-validation-the-playground-and-the-gallery) ·
[11 Compared with the alternatives](#11-compared-with-the-alternatives) · [12 Versions, budgets and speed](#12-versions-budgets-and-speed) ·
[13 Build plan, risks and questions](#13-build-plan-risks-and-questions) · [14 A library that names no host](#14-a-library-that-names-no-host) ·
[15 Research: a portable view-Sutra compiler](#15-research-a-portable-view-sutra-compiler-not-planned) ·
[Appendix A: adoption by the Drishti product](#appendix-a-adoption-by-the-drishti-product)

---

## 1. Where it lives

### 1.1 One model

Three things, each with one home:

| Thing | What it is | Home |
|---|---|---|
| **The specification** | the ViewModel as a JSON Schema (draft 2020-12), the frames and patches of a live view, and conformance vectors | `elements/drishti-views/spec/` |
| **The painter** | `paint(el, viewModel, options)` and `<elements-view>`: draws a ViewModel, applies patches, follows a stream | `elements/drishti-views/src/` |
| **The builders** | a fluent builder in JavaScript (browser and Node, one source) and thin helpers in Python and Java that write valid ViewModels | `elements/drishti-views/src/`, `helpers/` |

A ViewModel is **data, no logic**. It holds no expression, no script, no template and no style text. A client walks the JSON and draws it; a
script reads it; a test compares it; a stream patches it. That is what makes it safe to accept from a server one does not control, easy to
write from any language, and stable across versions.

### 1.2 A new library, the tenth: `drishti-views`

| Library | What it is | Requires |
|---|---|---|
| **drishti-views** | whole screens from a ViewModel: the specification and its validator, the painter (static, live and streamed), `<elements-view>`, the fluent builder, the linter | core, events; and, **loaded when a view's kinds need them**: inputs, grid, chart, data, tree, graph |

It draws nothing of its own that another library draws. A table is drishti-grid's document table, a grid is drishti-grid, every chart is
drishti-chart (the only place an engine is called), a tree is drishti-tree, a network is drishti-graph, a control is a drishti-inputs
component, a live connection is drishti-events (the library designed in `EVENTING_DESIGN.md`, built before this one). drishti-views owns only
what is about a *screen*: the frame of a panel, the layout, the header strip, the states, the application of patches, and the specification.

### 1.3 The modules

| Module | Holds |
|---|---|
| `spec/drishti_view-1.0.schema.json` | the schema, the source of truth; `spec/vectors/` the conformance vectors |
| `drishti_views-schema.js` | **generated** from the schema: the compact form the validator reads |
| `drishti_views-validate.js` | the validator (the keywords the schema uses, no dependency) and the error shape |
| `drishti_views-build.js` | the fluent builder; no DOM, so it runs in Node unchanged |
| `drishti_views-paint.js`, `-screen.js` | `paint`, the handle, the screen's state, navigation between views |
| `drishti_views-layout.js` | the 12-column flow, named areas, tabs, sections, the split, the narrow-container order |
| `drishti_views-panels.js`, `-kinds.js` | the panel frame and its states; the registry of kinds and the built-in kinds' painters |
| `drishti_views-data.js` | datasets: a data reference turned into a drishti-data source |
| `drishti_views-patch.js` | frames, patches, order, conflation, resync |
| `drishti_views-element.js` | `<elements-view>` |
| `drishti_views-lint.js` | the linter (a second file, loaded when asked for) |

---

## 2. The ViewModel specification, version 1.0

### 2.1 Principles

| Principle | What it means |
|---|---|
| **Data, no logic** | Nothing to evaluate. No expressions, no HTML, no CSS text, no script addresses. |
| **Text or value, never guessed** | A value a person reads is a [Cell](#23-the-common-types): either `text` (already formatted by the producer, printed as is) or `value` with a `format` (formatted by the painter with drishti-core's formats in the view's locale). A producer that must show the same digits everywhere sends `text`; a producer that wants it easy sends `value`. |
| **A tone is a word** | `pos`, `neg`, `ok`, `warn`, `bad`, `accent`, `muted`: the theme decides the colour and always pairs it with a sign or a glyph. A ViewModel never names a colour. |
| **Failures stay local** | A panel that cannot be filled carries its `state`; the rest of the view arrives and is drawn. |
| **Unknown is ignored** | A painter ignores a field it does not know, draws an unknown kind as a titled panel that says so, and ignores an unknown patch. Producers and painters of different minor versions work together. |
| **Structure and data are separate** | Rows live in `datasets` (or are referenced by address), so two panels can read one dataset and a patch to the rows reaches both. |
| **Every screen has a text alternative** | Every chart keeps a data table; every panel has a name; nothing is only in a picture. |

### 2.2 The top level

```json
{
  "spec": "1.0",
  "id": "sales-emea",
  "title": { "text": "Sales · EMEA", "tag": "Live", "subtitle": "Orders booked today" },
  "locale": "en-GB", "timeZone": "Europe/London", "currency": "EUR",
  "formats": { "eur0": { "type": "number", "decimals": 0, "grouping": true, "sign": "auto", "suffix": " EUR" } },
  "strip": [ { "id": "booked", "label": "Booked", "value": 18420350, "format": "eur0", "emphasis": true },
             { "id": "change", "label": "vs yesterday", "value": 0.042, "format": "pct1", "tone": "pos" } ],
  "controls": [ { "id": "region", "kind": "dropdown", "label": "Region", "value": "EMEA",
                  "options": [ { "value": "EMEA", "label": "EMEA" }, { "value": "AMER", "label": "Americas" } ] } ],
  "datasets": { "orders": { "key": "orderId", "fields": [ { "name": "orderId", "type": "string" }, { "name": "country", "type": "string" },
                                                           { "name": "amount", "type": "number", "format": "eur0" } ],
                            "rows": [ { "orderId": "O-1001", "country": "FRA", "amount": 12500 } ] } },
  "panels": [ { "id": "by-country", "kind": "grid", "title": "Orders by country", "span": 8,
                "data": { "dataset": "orders", "pivot": { "rows": ["country"], "values": [ { "field": "amount", "agg": "sum" } ] } } },
              { "id": "map", "kind": "map", "title": "Where", "span": 4,
                "data": { "mode": "world", "shade": { "dataset": "orders", "code": "country", "value": "amount", "agg": "sum" } } } ],
  "layout": { "columns": 12 },
  "live": { "topic": "views.sales-emea", "seq": 4112, "epoch": "a1" },
  "status": { "updatedAt": "2026-11-16T09:30:00Z", "source": "orders service", "stale": false },
  "a11y": { "label": "Sales for EMEA", "lang": "en", "dir": "ltr" }
}
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `spec` | string `major.minor` | yes | The specification this ViewModel speaks. A painter refuses a major it does not draw and ignores what a newer minor adds. |
| `id` | string | no | The view's name: the default live topic, the key of remembered layout, the target of a `view` link. |
| `title` | `{text, subtitle?, tag?, link?}` | no | The heading. |
| `locale`, `timeZone`, `currency` | BCP 47 tag, IANA zone, ISO 4217 | no | How `value` cells are formatted. Default: the page's (`options.locale`, else the document's `lang`, else the browser's). |
| `formats` | `{name: Format}` | no | The view's own named formats, on top of the bundled ones (section 2.4). |
| `strip` | Cell`[]` | no | The header figures, in order. A cell's `id` lets a patch address it. |
| `controls` | Control`[]` | no | Dropdowns, toggles, date ranges and the like, with their current values (section 2.6). |
| `datasets` | `{name: Dataset}` | no | Rows by name (section 4). |
| `panels` | Panel`[]` | yes | The panels, in reading order. |
| `layout` | Layout | no | Where the panels go (section 2.5). Without it they flow in a 12-column grid by `span`. |
| `keys` | Key`[]` | no | Keyboard shortcuts the view offers (`{key, label, action}`), off unless the host turns them on. |
| `live` | `{topic?, url?, seq?, epoch?}` | no | That the view is live, and the position in its stream this ViewModel is a snapshot of (section 5). |
| `status` | `{updatedAt?, source?, stale?, partial?, notes?: string[]}` | no | Freshness in words and facts; `notes` are banners drawn above the view. |
| `a11y` | `{label?, description?, lang?, dir?, headingLevel?}` | no | Section 6.3. |
| `meta` | object | no | The producer's own facts. Never drawn, never interpreted; handed back in events. |

### 2.3 The common types

**Cell**: one value a person reads.

| Field | Type | Meaning |
|---|---|---|
| `text` | string | The value, formatted by the producer. Printed as it is. Wins over `value`. |
| `value` | number, string, boolean or null | The raw value; the painter formats it with `format`. |
| `format` | string or Format | A named format or an inline one (section 2.4). |
| `label` | string | The label (a strip figure, a field). |
| `tone` | Tone | How to colour it. |
| `emphasis` | boolean | Draw it highlighted. |
| `link` | Link | What it opens. |
| `hint` | string | A longer explanation (a tooltip, read to a screen reader). |
| `id` | string | A name a patch can address. |

An empty cell is `{}`. A missing value prints as `—`. A cell with both prints `text` and keeps `value` for sorting, export and charts.

**Tone**: `pos`, `neg`, `ok`, `warn`, `bad`, `accent`, `link`, `muted`, `inactive`. A word the painter does not know is drawn untoned.

**Link**: what a click opens. Exactly one of:

| Form | Meaning |
|---|---|
| `{ "href": "https://example.org/orders/O-1001" }` | An address. Followed only when it passes the address rules of section 7.2. |
| `{ "view": "orders-detail", "params": { "orderId": "O-1001" } }` | Another view. The painter asks the host's `resolveView(view, params)` for its ViewModel or its address and paints it in place, with a back step. |
| `{ "ref": { "type": "customer", "id": "C-77" } }` | An entity of the host's, opaque to the painter. The host's `resolveLink(ref)` answers an address or handles it; with no resolver the text is drawn without a link. |

Every form may carry `label` (the accessible name) and `target` (`same`, `new`).

**Action**: something a click asks for. `{ "id": "approve", "label": "Approve", "icon": "check", "tone": "ok", "confirm": "Approve order O-1001?", "payload": {...}, "disabled": false, "why": "…" }`.
An action **does nothing by itself**: the painter raises the cancelable event `action` with `{id, payload, panel, row}` and the host decides.
With `"publish": "orders.approve"` the same object is also published on that topic through drishti-events, when the host allowed publishing
(section 7.4). Actions sit on a panel (`actions`, in its header), on a row (`rowActions`) and on the view (`actions`).

**Drill**: a panel-level rule for clicks on its rows, bars, points or places: `{ "on": "row", "sets": "region", "from": "country" }` (sets a
control), `{ "on": "row", "link": { "view": "orders-detail", "params": { "orderId": "{orderId}" } } }` (opens a link; `{field}` is replaced by
the clicked row's field, the only substitution in the specification and never evaluated), or `{ "on": "point", "emit": "explain" }` (an event
for the host).

### 2.4 Formats and locale

A **Format** is a name or an object of the shape drishti-core already reads:

```json
{ "type": "number", "decimals": 2, "grouping": true, "sign": "auto", "scale": 1, "suffix": null, "pattern": null }
```

| Field | Values |
|---|---|
| `type` | `number`, `percent`, `compact` (1.5m), `currency`, `date`, `time`, `datetime`, `duration`, `bytes`, `text`, `boolean` |
| `decimals`, `grouping`, `scale`, `suffix`, `prefix` | as named |
| `sign` | `auto` (minus only), `always` (+ and −), `parens` (accounting), `never` |
| `pattern` | for dates and times: `yyyy-MM-dd`, `dd MMM yyyy`, `HH:mm:ss` |
| `currency` | ISO 4217; default the view's |
| `nullText` | what a missing value prints (default `—`) |

- **Named formats**: the bundled table (`amount0`, `amount2`, `pct1`, `pct2`, `compact`, `price2`, `date`, `dmy`, `datetime`, …) plus the
  view's own `formats`. An unknown name prints the raw value and the linter says so.
- **Rounding** is half up, as drishti-core's formats are, so a producer that formats on its server and a painter that formats in the browser
  print the same digits.
- **Locale** decides the grouping and decimal marks, month and day names and the first day of the week, through the browser's own `Intl`
  (no data is shipped). `timeZone` decides how an instant is printed; a date without a time has no zone and is never shifted.
- **Numbers too large for a double** travel as strings with `"type": "number"` in the field's description; drishti-core's typed-number
  reader formats them without loss.
- **The painter's own words** ("No data", "Loading…", "Show data table") come from `options.messages`, with English bundled.

### 2.5 Layout

Without `layout`, panels flow left to right in a 12-column grid: `span` (1 to 12, default 12) is a panel's width and `height` its height in
rows of the grid (default: its content). With `layout`:

```json
{ "columns": 12, "rowHeight": 32, "gap": "normal",
  "areas": [ "head head", "body side" ], "widths": [ 8, 4 ],
  "place": { "kpis": { "area": "head" }, "by-country": { "area": "body" }, "map": { "area": "side", "order": 2, "collapsible": true } },
  "tabs": [ { "id": "overview", "title": "Overview", "panels": ["kpis", "by-country"] }, { "id": "detail", "title": "Detail", "panels": ["orders"] } ],
  "sections": [ { "id": "more", "title": "More", "collapsed": true, "panels": ["map"] } ],
  "split": { "between": ["body", "side"], "resizable": true },
  "sticky": ["kpis"], "arrange": false,
  "narrow": { "order": ["kpis", "by-country", "map"], "hide": ["map"] } }
```

| Key | Meaning |
|---|---|
| `areas`, `widths`, `place` | Named areas as rows of names (the notation of CSS grid areas, held as data), the columns' widths, and each panel's area and order. |
| `tabs`, `sections` | Panels grouped under tabs or folds. |
| `split` | A divider between two areas the reader may drag. |
| `sticky` | Panels that stay while the rest scrolls. |
| `arrange` | Whether the reader may rearrange and resize panels; the arrangement is remembered by the host (`options.remember`). |
| `narrow` | Below 640 px of the **container** (not the window): the order, what is hidden, and each panel's compact form. Without it the reading order is used. |
| `density` | `compact`, `normal` or `comfortable`; the page's when missing. |

The layout is data for drishti-designer's layout model, so a view can be opened in a designer built from that library and written back.

### 2.6 Controls

`{ id, kind, label, value, values?, options?: [{value, label}], placement?: "strip" | "side" | {panel}, min?, max?, step?, required?, reads?: [panel ids], optionsFrom?: DataRef }`.
Kinds: `dropdown`, `multi-select`, `cascading`, `toggle`, `segmented`, `date`, `date-range`, `number-range`, `top-n`, `search`. Each is drawn by
the drishti-inputs component of that name.

A changed control raises the cancelable event `control-change` with every control's value. What happens next is one of three, in this order:

1. **In the browser.** A control with `"filters": { "dataset": "orders", "field": "country" }` filters that dataset through drishti-core's
   shared filter model; every panel reading the dataset follows. Nothing is fetched.
2. **From the producer.** When the view was loaded from an address, the painter fetches it again with the controls as query parameters
   (`?region=AMER`; the names can be prefixed with `options.controlPrefix`) and applies the answer as a patch of the panels in `reads`.
3. **By the host.** The host's listener answers with a ViewModel or patches (`handle.update`, `handle.patch`).

---

## 3. Panel kinds

### 3.1 The common fields

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Required; unique in the view. Patches, layout and links address it. |
| `kind` | string | Required; one of the kinds below or one the host registered. Decides the shape of `data`. |
| `title`, `subtitle`, `tag`, `help` | string | The frame's words; `help` opens as a hint. |
| `span`, `height` | integer | Size in the flow (section 2.5). |
| `data` | object | The kind's content. |
| `state` | State | Why there is nothing to draw, or that more is coming (section 6.1). |
| `actions`, `rowActions`, `drill` | | Section 2.3. |
| `export` | `["csv", "png", "svg", "json"]` | The downloads the panel offers; made in the browser from what is drawn. |
| `status` | `{updatedAt?, source?, stale?}` | A panel with its own freshness. |
| `refresh` | `{everySeconds, pausable?}` | Fetch this panel's data again on a timer (a panel whose data is an address). |
| `a11y` | `{label?, description?, summary?, live?}` | Section 6.3. |
| `meta` | object | The producer's own facts; handed back in events. |

### 3.2 The kinds

Twenty-five kinds in three families. The **named** kinds take a small fixed record that any server can write by hand; `grid` and `chart` take
the full options of drishti-grid and drishti-chart for when a fixed record is not enough. They are drawn by the same code: `line` is a
`chart` with its options filled in, `table` is the grid's document table. There is one drawing of each thing.

**Words and figures**

| Kind | `data` | Drawn as |
|---|---|---|
| `kv` | `{fields: Cell[], columns?}` | label and value pairs in a grid |
| `status` | `{fields: Cell[]}` | the same, the values as status chips toned `ok`, `warn`, `bad` |
| `metric` | `{value: Cell, delta?: Cell, unit?, caption?, spark?: number[]}` | one large figure, its change, an optional sparkline |
| `kpis` | `{items: Metric[], columns?}` | a row of metric tiles; each item has an `id` a patch can address |
| `markdown` | `{text, markup?: "plain" \| "basic"}` | text. `basic` is headings, emphasis, lists, code and links, built as DOM nodes; never HTML (section 7.1) |
| `links` | `{links: [{label, text, link?, badge?, status?}]}` | a list of related things |
| `timeline` | `{events: [{date, label, detail?, status?, tone?}], more?}` | dated events, oldest first |

**Tables**

| Kind | `data` | Drawn as |
|---|---|---|
| `table` | `{columns: [{label, numeric?, width?}] \| string[], rows: Row[], total?: Row, search?, more?, expand?, levels?, emptyText?}`; a **Row** is `{key?, cells: Cell[], highlight?, children?: Row[], pick?}` | a document table of formatted cells: sort, filter box, paging, trees (`children`), drill levels. For a few hundred rows that a producer has already formatted. |
| `ladder` | as `table` | a dated schedule; `highlight` marks the current row |
| `pivot` | `{by, columns: string[], rows: [{label, cells: Cell[], values: number[], total?, path?, group?}], totals?, heat?, min?, max?, levels?, expand?, across?}` | a pivot the producer already aggregated: nested rows, column and grand totals, heat |
| `grid` | `{dataset \| DataRef, columns?: Column[], pivot?: {rows, columns, values, filters}, tree?: {path}, sort?, group?, selection?, editable?: false, layout?: "table" \| "compact" \| "cards", statusBar?}` | drishti-grid: virtual rows, typed columns, pinned columns, ranges, the pivot computed in the browser (or by the server, section 4.4), tree data, export. For data. |
| `tree` | `{dataset \| DataRef, id, parent \| path, label, measures?: [{field, agg, format}], mode?: "grid" \| "org" \| "sunburst" \| "icicle"}` | drishti-tree in one of its four modes |
| `tabs` | `{layout?: "tabs" \| "columns", tabs: [{title, fields?: Cell[], panels?: Panel[]}]}` | one tab per item, each holding fields and whole panels (nesting at most four deep) |

A **Column** of a `grid`: `{field, header?, type?: "string" | "number" | "date" | "datetime" | "boolean", format?, width?, pinned?, align?, tone?: "sign" | {field}, link?: Link, hidden?, agg?, hint?}`.
Columns left out are inferred from the dataset's `fields`.

**Charts and maps**

| Kind | `data` | Drawn as |
|---|---|---|
| `line`, `area` | `{x: string[], series: [{label, values: (number\|null)[], tone?}], mark?, markText?, limit?, limitLabel?, unit?, step?, window?}` **or** `{dataset, x, y: string[], by?}` | lines or filled areas; `window` is the most points kept when a stream appends |
| `hbar` | `{bars: [{label, value, text?, tone?, key?}], shape?: "bar" \| "donut", total?}` | bars scaled to the largest, or a ring of shares |
| `gauge` | `{value, max, min?, text?, label?, bands?: [{to, tone}]}` | a level out of a maximum |
| `surface` | `{x, y, z: number[][], min?, max?, format?, unit?, view?: "heatmap" \| "3d"}` | a heat map, or a 3D surface (its engine is loaded only then) |
| `waterfall` | `{steps: [{label, value, text?, tone?, total?}], unit?}` | floating bars; the running total is computed by the painter |
| `histogram` | `{bins: [{from, to, count, label?}], markers?: [{label, value, text?, tone?}]}` **or** `{dataset, field, bins?}` | equal-width bins with marker lines |
| `scatter` | `{points: [{x, y, size?, label?, group?, link?}], xLabel?, yLabel?, more?}` **or** `{dataset, x, y, size?, by?}` | points, coloured by group, sized when they carry a size |
| `candlestick` | `{candles: [{x, open, high, low, close, volume?}], format?, unit?}` | open, high, low, close, with volume under it |
| `graph` | `{nodes: [{id, label, group?, link?, focus?}], edges: [{from, to, label?}], layout?: "tree" \| "force" \| "radial" \| "circular"}` | drishti-graph |
| `map` | `{mode: "world" \| "region", region?, highlight?, shade?: {label, unit?, items: [{code, value, text?}]} \| {dataset, code, value, agg}, link?}` | the vendored shapes; ISO 3166 codes; nothing from a map service |
| `chart` | a drishti-chart spec (every kind it has: bar grouped and stacked, bubble, heatmap, box plot, treemap, sankey, calendar, sparkline, …), its `data` a `dataset` name or a DataRef; or `{vegaLite: {...}}`, translated by `fromVegaLite` | drishti-chart |

Every chart gets the theme, the density, the formats on its axes and tooltips, a legend that toggles, export, and a **data table** a reader or
a screen reader can open.

### 3.3 A host's own kinds

```js
import { registerKind } from '/elements/drishti-views/src/drishti_index.js';
registerKind('seat-map', { schema: {...}, paint(el, panel, ctx) { … return { update(panel) {…}, dispose() {…} }; } });
```

A registered kind gets the frame, the states, the layout, the patches (`panel` replaces it; `update` receives the new one) and the linter
(its `schema` is checked). `paint` receives `ctx`: the element maker that enforces section 7, the formats, the theme tokens, the datasets and
`open(link)`. A domain library registers its kinds this way and they appear in the gallery beside the general ones.

### 3.4 The schema

`elements/drishti-views/spec/drishti_view-1.0.schema.json`, draft 2020-12, `$id` `urn:drishti-elements:view:1.0` (a name, not an address:
nothing is fetched to validate). Its outline (the full file names every record of sections 2 to 5):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:drishti-elements:view:1.0",
  "title": "ViewModel",
  "$ref": "#/$defs/ViewModel",
  "$defs": {
    "ViewModel": {
      "type": "object", "required": ["spec", "panels"],
      "properties": {
        "spec": { "type": "string", "pattern": "^1\\.[0-9]+$" },
        "id": { "$ref": "#/$defs/Name" },
        "title": { "$ref": "#/$defs/Title" },
        "locale": { "type": "string" }, "timeZone": { "type": "string" }, "currency": { "type": "string", "pattern": "^[A-Z]{3}$" },
        "formats": { "type": "object", "additionalProperties": { "$ref": "#/$defs/Format" } },
        "strip": { "type": "array", "items": { "$ref": "#/$defs/Cell" }, "maxItems": 24 },
        "controls": { "type": "array", "items": { "$ref": "#/$defs/Control" } },
        "datasets": { "type": "object", "propertyNames": { "$ref": "#/$defs/Name" }, "additionalProperties": { "$ref": "#/$defs/Dataset" } },
        "panels": { "type": "array", "items": { "$ref": "#/$defs/Panel" }, "maxItems": 200 },
        "layout": { "$ref": "#/$defs/Layout" }, "live": { "$ref": "#/$defs/Live" }, "status": { "$ref": "#/$defs/Status" },
        "a11y": { "$ref": "#/$defs/A11y" }, "meta": { "type": "object" }
      }
    },
    "Name": { "type": "string", "pattern": "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$" },
    "Tone": { "enum": ["pos", "neg", "ok", "warn", "bad", "accent", "link", "muted", "inactive"] },
    "Cell": {
      "type": "object",
      "properties": {
        "text": { "type": "string" }, "value": { "type": ["number", "string", "boolean", "null"] },
        "format": { "anyOf": [ { "type": "string" }, { "$ref": "#/$defs/Format" } ] },
        "label": { "type": "string" }, "tone": { "$ref": "#/$defs/Tone" }, "emphasis": { "type": "boolean" },
        "link": { "$ref": "#/$defs/Link" }, "hint": { "type": "string" }, "id": { "$ref": "#/$defs/Name" }
      }
    },
    "Link": {
      "type": "object",
      "oneOf": [ { "required": ["href"] }, { "required": ["view"] }, { "required": ["ref"] } ],
      "properties": { "href": { "type": "string" }, "view": { "$ref": "#/$defs/Name" }, "params": { "type": "object" },
                      "ref": { "type": "object" }, "label": { "type": "string" }, "target": { "enum": ["same", "new"] } }
    },
    "Panel": {
      "type": "object", "required": ["id", "kind"],
      "properties": {
        "id": { "$ref": "#/$defs/Name" }, "kind": { "type": "string" }, "title": { "type": "string" },
        "span": { "type": "integer", "minimum": 1, "maximum": 12 }, "height": { "type": "integer", "minimum": 1 },
        "state": { "$ref": "#/$defs/State" }, "a11y": { "$ref": "#/$defs/PanelA11y" }
      },
      "allOf": [
        { "if": { "properties": { "kind": { "const": "kv" } } }, "then": { "properties": { "data": { "$ref": "#/$defs/Fields" } } } },
        { "if": { "properties": { "kind": { "const": "grid" } } }, "then": { "properties": { "data": { "$ref": "#/$defs/GridData" } } } },
        { "if": { "properties": { "kind": { "const": "chart" } } }, "then": { "properties": { "data": { "$ref": "#/$defs/ChartData" } } } }
      ]
    },
    "State": {
      "type": "object", "required": ["is"],
      "properties": { "is": { "enum": ["ready", "pending", "empty", "error", "denied", "stale", "computing"] },
                      "text": { "type": "string" }, "code": { "type": "string" }, "fix": { "type": "string" },
                      "progress": { "type": "number", "minimum": 0, "maximum": 1 } }
    },
    "Dataset": {
      "type": "object",
      "properties": { "key": { "anyOf": [ { "type": "string" }, { "type": "array", "items": { "type": "string" } } ] },
                      "fields": { "type": "array", "items": { "$ref": "#/$defs/Field" } },
                      "rows": { "type": "array", "items": { "type": "object" } },
                      "columns": { "type": "array", "items": { "type": "string" } }, "values": { "type": "array", "items": { "type": "array" } },
                      "arrow": { "$ref": "#/$defs/ArrowRef" }, "pages": { "$ref": "#/$defs/PagesRef" }, "server": { "$ref": "#/$defs/ServerRef" },
                      "name": { "$ref": "#/$defs/Name" } },
      "oneOf": [ { "required": ["rows"] }, { "required": ["columns", "values"] }, { "required": ["arrow"] },
                 { "required": ["pages"] }, { "required": ["server"] }, { "required": ["name"] } ]
    },
    "Frame": {
      "type": "object", "required": ["patches"],
      "properties": { "seq": { "type": "integer", "minimum": 0 }, "epoch": { "type": "string" },
                      "patches": { "type": "array", "items": { "$ref": "#/$defs/Patch" } } }
    },
    "Patch": { "type": "object", "required": ["op"], "properties": { "op": { "type": "string" } } }
  }
}
```

Rules of the schema:

- **Open by default.** Records do not say `additionalProperties: false`: an unknown field is legal and ignored (the linter reports it as a
  note, since it is usually a spelling mistake). The **strict** mode of the validator closes every record, for a producer's own tests.
- **Closed word lists** (tones, states, ops, kinds' enumerations) are checked; an unknown word is a warning in normal mode and an error in
  strict mode, and the painter falls back as section 2.1 says.
- **Bounds are in the schema**: at most 200 panels, 24 strip cells, names of 64 characters, nesting of four. Section 7.5.
- **One `if`/`then` per kind** binds `data` to the kind's record. A registered kind adds its own.
- The schema uses only `$ref`, `type`, `properties`, `required`, `additionalProperties`, `propertyNames`, `items`, `enum`, `const`, `pattern`,
  `minimum`, `maximum`, `maxItems`, `maxLength`, `anyOf`, `oneOf`, `allOf`, `if`/`then`. The bundled validator implements exactly these and a
  test fails if the schema uses another, so it cannot outgrow its validator. Any standard validator accepts the same file.

---

## 4. Data

A panel that reads rows names a dataset (`"dataset": "orders"`) or carries a data reference in place. A **Dataset** is one of six sources, plus
`key` (the field, or fields, that identify a row: needed for row patches, selection and links) and `fields`
(`{name, type, format?, label?, hint?}`; inferred from the first rows when missing).

### 4.1 Inline rows

`{"rows": [ {...}, ... ]}` (objects) or `{"columns": ["orderId", "amount"], "values": [["O-1001", 12500], ...]}` (columnar; about a third of
the bytes). Sorting, filtering, grouping and the pivot are computed in the browser by drishti-data (in its worker above a threshold). The
schema allows 50,000 inline rows by default; beyond that, use Arrow or a server.

### 4.2 Arrow

| Form | Meaning |
|---|---|
| `{"arrow": {"url": "/data/orders.arrow"}}` | An Arrow IPC stream or file read from an address (the address rules of section 7.2). Record batches are read as they arrive, so the first rows are drawn before the last byte. |
| `{"arrow": {"base64": "QVJST1cx…"}}` | The bytes inside the JSON, for a self-contained file. |
| `{"name": "orders"}` | The bytes, rows or a ready drishti-data source are handed by the page: `paint(el, vm, { data: { orders: arrayBufferOrRowsOrSource } })`. This is how a page with no server at all (a notebook export, a file opened from disk) paints a million rows. |

Column types come from the Arrow schema; `fields` adds formats and labels. Decimals and 64-bit integers are read without loss.

### 4.3 Pages from a server

`{"pages": {"url": "/api/orders", "size": 500, "mode": "offset" | "cursor", "total": 120000}}`: plain REST pages, read as the grid scrolls
(drishti-data's `restSource`). The request is `GET <url>?limit=&offset=` (or `&cursor=`), the answer `{rows, total?, next?}`. Sorting and
filtering happen on the pages read unless the reference says `"sort": "server"` / `"filter": "server"`, in which case they travel as
`&sort=field:desc&filter=<the shared filter model as JSON>`.

### 4.4 A server-side row model

`{"server": {"url": "/api/orders/query"}}`: the grid sends what it needs (`POST {startRow, endRow, sort, filter, groupBy, pivot, values}`) and
the server answers rows, group rows and totals (drishti-data's `serverSideSource`, the contract a host's server implements). This is the form
for a hundred million rows, and for any figure that must not be summed in the browser: the pivot's totals are then the server's.

### 4.5 What is the same for all

- One contract in the browser: whichever form the ViewModel names, the panel receives a drishti-data source. A grid, a chart, a tree and a
  map's shade read all six alike.
- **Derived reads**: a panel may say `"where": <filter model>`, `"sort"`, `"limit"`, `"groupBy"` and `"values": [{field, agg}]` over a
  dataset, with the aggregations drishti-data already has (`sum`, `count`, `min`, `max`, `avg`, `first`, `last`, `distinct`). That is the
  whole of the query language: no expressions. A figure that needs more is computed by the producer.
- The pages and server-side contracts go into [CONTRACTS.md](CONTRACTS.md) beside the live-set and data-capabilities contracts.

---

## 5. Live: frames and patches

### 5.1 One mechanism

A live view, a view that arrives piece by piece, and a view a page updates by hand are the same thing: a ViewModel, then **frames** of
**patches** applied in order.

```json
{ "seq": 4113, "epoch": "a1",
  "patches": [ { "op": "cell", "id": "booked", "cell": { "value": 18432850 } },
               { "op": "rows", "dataset": "orders", "update": [ { "orderId": "O-1001", "amount": 13000 } ],
                 "add": [ { "orderId": "O-1042", "country": "DEU", "amount": 9800 } ], "remove": ["O-0991"] } ] }
```

### 5.2 The patches

| `op` | Fields | Apply it by |
|---|---|---|
| `view` | `view` | Replacing the whole ViewModel and repainting (scroll position, open tabs and folds are kept where ids match). |
| `cell` | `id` or `index`, `cell` | Merging `cell` into the strip cell with that `id` (or at that index); a `text` or `value` that changed flashes once. |
| `panel` | `panel` | Replacing the panel whose `id` is `panel.id`; its place, tab, fold and size are kept. |
| `data` | `panel`, `set` | Merging the fields of `set` into the panel's `data` (a gauge's `value`, a metric's `delta`), without sending the panel again. |
| `item` | `panel`, `id`, `item` | Merging into one keyed item of a panel: a `kpis` tile, a `kv` field, an `hbar` bar. |
| `panel-add` | `panel`, `after?` | Adding a panel after the one named (or at the end); the layout is computed again. |
| `panel-remove` | `id` | Removing a panel. |
| `state` | `panel`, `state` | Setting a panel's state (`pending` with progress, `error`, `stale`), over what it shows. |
| `rows` | `dataset` (or `panel`, for a `table`), `remove?: key[]`, `update?: row[]`, `add?: row[]`, `before?: key`, `reset?: row[]` | Row changes **by key**. Within one patch: `reset` first (replaces every row), then `remove`, `update` (the fields given are merged; an unknown key is added), `add` (an existing key is updated). `add` appends, or goes before `before`; a sorted grid places rows by its sort. |
| `append` | `panel` or `dataset`, `points` or `rows`, `window?` | Adding to the end of a series and dropping from the front beyond `window`. |
| `controls` | `set: [{id, value?, options?}]` | Changing a control's value or options without an event. |
| `layout` | `layout` | Replacing the layout. |
| `status` | `status` | Replacing the view's status (and its banners). |
| `frozen` / `thawed` | `text?`, `at?` | The thing the view shows is gone or suspended: what is shown stays, greyed under a banner, and later patches are ignored until `thawed`, which asks for a `view`. |
| `done` | | A view that arrived in pieces is complete: `aria-busy` is cleared and `ready` is raised. |

These are all the ops of version 1.0. There is no path-addressed "set anything" op on purpose: every patch names a thing with an identity, so
a patch can be validated, conflated and explained.

### 5.3 Order, conflation and identity

- Frames are applied in `seq` order within an `epoch`; the patches of a frame in list order. A frame is applied whole, inside one animation
  frame, so the reader never sees half of it.
- A frame whose `seq` is not above the last applied one is dropped (a duplicate, or one older than the snapshot: the ViewModel's `live.seq`
  says where the snapshot stands).
- **Conflation.** A slow reader may be sent fewer, fuller frames: for `cell`, `panel`, `data`, `item`, `state` and `status` the newest per
  identity wins; `rows` patches of one dataset merge by key (a later `remove` cancels an earlier `add`); `append` concatenates. The painter
  conflates the same way when frames arrive faster than it paints, and paints at most once per animation frame.
- **Keys** are compared as strings; a compound key is its fields joined by `\u001f`. A key named `__proto__`, `constructor` or `prototype`
  is refused (section 7.5).
- A hidden tab applies nothing and keeps only the conflated pending state; it catches up in one paint when shown.

### 5.4 The stream, resume and resync

Frames reach a painter in one of three ways.

1. **drishti-events (the default).** The view names a topic (`live.topic`, default `views.<id>`); the painter subscribes through the page's
   `Events` (`options.events`, or one made from `live.url`) with `{ from: 'resume', onGap: 'resync', conflate: true, deliver: 'frame' }`.
   Messages carry `kind: "view"` (a whole ViewModel), `kind: "view.frame"` (a frame) or `kind: "view.piece"` (one patch, for a producer that
   streams a view piece by piece). The events wire protocol does the rest: the stream's `seq` and `epoch` are the frame's, a reconnect sends
   `after` and the server replays what was missed (`recovered: true`), and a gap that cannot be replayed is a **resync**: the painter fetches
   the ViewModel again (`src`, or the host's `resync()`), paints it, and goes on from its `live.seq`. A new `epoch` is always a resync.
2. **A plain stream.** A server that speaks no protocol sends Server-Sent Events whose event names are `view` and `frame`; the painter reads it
   through drishti-events' raw mode. Nothing is replayed: every reconnect begins with a `view`.
3. **By hand.** `handle.patch(frame)` from the page's own code: a WebSocket of the host's, a timer, a worker, a test.

A view that **arrives in pieces** (a slow producer, or one that composes the screen as it goes) is the same stream: first a `view` whose
panels are in the `pending` state, painted at once in the final layout so nothing jumps; then `panel` patches as each is ready, `panel-add`
for what was not announced, and `done`. Its end state equals a one-shot paint of the same ViewModel, and a test holds it to that.

---

## 6. States, errors and accessibility

### 6.1 A panel's state

`state: { is, text?, code?, fix?, progress? }`. A panel with no `state` is `ready`.

| `is` | Drawn as | `data` |
|---|---|---|
| `pending` | The frame, a skeleton of the kind's shape and `text` (default "Loading…"); `progress` as a bar. | not needed |
| `empty` | `text` (default "No data"), calmly: no icon of alarm. A kind also shows it by itself when its data has nothing to draw. | may be present (a table's columns) |
| `error` | `text`, with `code` and `fix` ("what to do") when given; `role="alert"`. | missing |
| `denied` | "No access" in words (`text` says to what). Never a blank panel. | missing |
| `stale` | The last data, dimmed, with `text` ("as of 09:14"). | present |
| `computing` | The last data when there is one, under a quiet progress line. | optional |

### 6.2 Errors of the view

| Where | What the reader sees | What the host gets |
|---|---|---|
| The ViewModel is not valid | A card in the container: what is wrong, the JSON path, how to fix it (the linter's message) | the event `error` with `{code: 'view.invalid', issues}` |
| A major version the painter does not draw | "This view needs a newer drishti-views (2.x)" | `view.version` |
| The address could not be read | The error contract's `"<code> <detail>"`, and a Retry button | `view.fetch` with the status |
| A dataset could not be read | That panel's `error` state; the others are drawn | `data.fetch`, with the panel |
| A kind's painter threw | That panel's `error` state ("This panel could not be drawn") | `panel.paint`, with the error |
| The stream is down | A quiet "Reconnecting…" beside the status; data stays, marked stale after `staleAfterMs` | drishti-events' own state events |
| A patch names nothing | Ignored, counted | `patch.unknown` in the metrics, and in the inspector |

Codes are the library's own dotted words; a host's codes arrive in `state.code` and are printed as they are. An error never blanks a view that
was already painted.

### 6.3 Accessibility

What the ViewModel says:

| Field | Meaning |
|---|---|
| view `a11y.label`, `description` | The region's accessible name and description (default: the title). |
| `a11y.lang`, `dir` | The language and direction of the view's text, when they differ from the page's. |
| `a11y.headingLevel` | The level of the view's heading (default 2); panels are one below. |
| panel `a11y.label`, `description` | The panel's name (default: its title) and a longer description. |
| panel `a11y.summary` | A sentence that says what a chart shows ("Orders rose 4% over the week, peaking on Thursday"). Read before the data table. |
| panel `a11y.live` | `off` (default), `polite`: changes to this panel are announced. |
| Cell `hint`, Link `label`, Action `label` | Names for what is otherwise a figure or an icon. |

What the painter does whatever the ViewModel says:

- The view is a `region`; each panel a `group` with a real heading; tabs, trees, grids and dialogs follow the ARIA patterns the other
  libraries already keep. One tab stop per panel, arrows inside; `F6` and `Shift+F6` move between panels; `Escape` leaves a panel.
- Every chart has its data table; every tone has a sign or a glyph; contrast comes from the theme tokens in both themes.
- Live changes are announced through **one** polite live region for the view, at most once every few seconds, as a sentence ("Booked
  18,432,850; 3 rows changed"); flashes stop under `prefers-reduced-motion`.
- A view in the `pending` state has `aria-busy`; an `error` state is an `alert`.
- Targets are 44 px on a coarse pointer and in a narrow container; nothing scrolls sideways except inside a table.
- The linter warns when a chart has no `summary`, a panel has no title or label, or an action has only an icon.

---

## 7. Security

A ViewModel may come from a server the page does not control, and patches arrive all day. The rule: **a ViewModel can make the painter draw
text and shapes and offer links and actions; it can never run code, load code, style the page, or reach an address the host did not allow.**

### 7.1 Strings are text

- Every string is written with `textContent` or as an attribute from drishti-core's allow-list (`attrAllowed`: never an event handler, a
  `style`, a `src`, a `srcdoc` or a `formaction`). The painter never assigns `innerHTML`, never calls `eval`, `Function`, `setTimeout` with a
  string, or `document.write`.
- `markdown` with `markup: "basic"` is parsed by a small parser of the library's own into DOM nodes: headings, emphasis, lists, code, and
  links that pass section 7.2. Raw HTML in the text is printed as text.
- No field is a template except a drill's `{field}`, which is replaced by a row's value as text and then passes section 7.2.
- A ViewModel never names a colour, a font, a class or a size in CSS units: only tones, densities and grid units. Sizes are clamped.
- No images, frames, embedded media or font addresses in version 1.0.

### 7.2 Addresses

Two allow-lists, both empty of other origins by default:

| List | Covers | Default |
|---|---|---|
| `options.links.allow` | where a link may lead | relative addresses of the page's origin, `#` and `?`; **http and https to other origins open only when their origin is listed**, or `links.allow: 'any-https'` is chosen. Never `javascript:`, `data:`, `vbscript:`, `blob:`, `file:`. |
| `options.data.allow` | where the painter may **fetch**: `src`, `arrow.url`, `pages.url`, `server.url`, `live.url`, a panel's refresh | the page's origin and the origin the ViewModel itself was loaded from |

- An address is resolved against the ViewModel's own address (or the page's), control characters are stripped, and the result's origin is
  compared; a refused address draws the text without a link, or the panel's `error` state, and is said once in the browser's console.
- Fetches use `credentials: 'same-origin'` unless the host says otherwise, and the host's `options.fetch` when it gives one (its headers,
  its tokens). A ViewModel cannot make the page send its cookies to another origin.
- A link to another origin opens with `rel="noopener noreferrer"`. `options.links.open` chooses `event` (the host decides), `follow` or
  `new-window`.

### 7.3 Content-Security-Policy and Trusted Types

- The painter runs under `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src` (the allowed data
  origins). No inline script, no inline style, no `unsafe-eval`: drawing is DOM and CSSOM, and the sheet is a constructable sheet adopted by
  the shadow root.
- Under `require-trusted-types-for 'script'` the painter needs no HTML policy at all. The one policy is the loader's (`drishti-elements`),
  used only for the addresses of the vendored engines it loads from the release tree, never for anything from a ViewModel.
- The view draws inside a shadow root by default, so a ViewModel's ids and classes cannot collide with, or be styled by, the page.

### 7.4 Actions and publishing

- An action raises an event and stops. The painter sends nothing to any server for an action unless the action says `publish` **and** the
  host passed `options.actions.publish: ['orders.>']` naming the topics a view may publish to.
- `confirm` is drawn with drishti-core's dialog; the confirmation is the reader's, never the ViewModel's.
- Controls never offer a value the ViewModel did not list (or the reader did not type).

### 7.5 Hostile and oversized input

| Bound | Default | Option |
|---|---|---|
| Size of a ViewModel | 16 MB | `limits.bytes` |
| Panels, nesting of tabs | 200, 4 | `limits.panels`, `limits.depth` |
| Inline rows of a dataset | 50,000 | `limits.rows` |
| Length of a string drawn | 20,000 characters (cut with an ellipsis; the whole on request) | `limits.text` |
| A frame | the events protocol's frame limit (1 MB) | the server's `welcome` |
| Patches applied per second | conflated to one paint per animation frame | |

Datasets and items are indexed in `Map`s; `__proto__`, `constructor` and `prototype` are refused as keys, ids and field names; JSON is read
with `JSON.parse` and never merged into live objects by a deep "assign". A ViewModel that breaks a bound is refused with the bound named.

### 7.6 What stays the producer's job

Who may see what. A ViewModel is built for one reader; values a reader may not see must be absent or masked **before** it is sent. The
painter has no rule to hide anything and no way to unmask anything.

---

## 8. The painter

### 8.1 Hello world

```js
import { paint } from '/elements/drishti-views/src/drishti_index.js';

const handle = paint(document.getElementById('sales'), '/views/sales.json');     // an address
paint(el, { spec: '1.0', panels: [{ id: 'k', kind: 'metric', data: { value: { label: 'Booked', value: 18420350, format: 'amount0' } } }] });
paint(el, view('Sales').kpis([...]).grid(rows));                                  // a builder (section 9)
```

From the bundle: `Drishti.elements.load('drishti-views')`, then `Drishti.elements.views.paint(...)`. The loader reads the ViewModel's kinds
and loads only the libraries they need.

### 8.2 The whole API

| Call | Answers | What it does |
|---|---|---|
| `paint(el, source, options?)` | `Handle` | Paints a view into an element (replacing what `paint` drew there before). `source`: a ViewModel, an address, a builder, a `Response`, or an async iterable of frames. |
| `handle.ready` | `Promise<Handle>` | The first paint is done (every panel drawn or in a state). |
| `handle.viewModel` | object | The ViewModel as it stands, patches applied. |
| `handle.update(viewModel)` | `Promise` | A new ViewModel for the same container; what kept its id keeps its state. |
| `handle.patch(frameOrPatches)` | | Applies a frame (section 5). |
| `handle.subscribe(source?)` | `off()` | Follows the view's stream: the default of section 5.4, a topic, an address, or a function `(on) => off` for a host's own channel. |
| `handle.panel(id)` | `{element, data, update(panel), state(state), component}` | One panel; `component` is the grid, chart or tree it drew, for a host that needs it. |
| `handle.controls()` / `handle.setControl(id, value)` | | The controls' values. |
| `handle.open(link)` / `handle.back()` | | Navigation between views in place. |
| `handle.export(panelId, format)` | `Promise<Blob>` | A panel's download. |
| `handle.on(name, fn)` | `off()` | The events below. |
| `handle.metrics()` | | Paint times, patches applied, conflated, ignored. |
| `handle.dispose()` | | Stops the stream, disposes every component, empties the container. |
| `validate(viewModel, options?)` | `{ok, issues}` | Section 10.1. |
| `registerKind(name, def)` | | Section 3.3. |
| `view(title?)` | `ViewBuilder` | Section 9.1. |
| `VERSION`, `SPECS` | | The library's version and the specification majors it draws (`[1]`). |

**Options** (every one has a default)

| Option | Default | Meaning |
|---|---|---|
| `shadow` | true | Draw inside a shadow root. |
| `theme`, `density` | the page's | `light`, `dark`, a named theme; `compact`, `normal`, `comfortable`. |
| `locale`, `timeZone`, `messages` | the ViewModel's, then the page's | Overrides for this reader. |
| `links` | `{allow: [], open: 'follow'}` | Section 7.2; `resolveLink(ref)`, `resolveView(view, params)`. |
| `data` | `{allow: []}` | Section 7.2; and `data.<name>`: rows, bytes or a source for a `{"name": …}` dataset. |
| `fetch` | the browser's | The host's fetch (headers, tokens, retries). |
| `events` | made from `live.url` when the view is live | The page's drishti-events `Events`. |
| `live` | true | Follow the stream when the view is live. |
| `actions` | `{publish: []}` | Section 7.4. |
| `validate` | `'warn'` | `'off'`, `'warn'` (paint, list issues in the console and the `issues` event), `'refuse'` (do not paint an invalid view). |
| `header` | `'full'` | `'full'`, `'strip'`, `'none'`: how much of the title and strip is drawn. |
| `panels` | all | Draw only these panel ids (one panel of a view inside a page of the host's). |
| `keys` | false | Turn the view's keyboard shortcuts on. |
| `remember` | none | `{get(key), set(key, value)}`: where a reader's arrangement, sort and folds are kept. |
| `explain` | none | The Explain hook of the grid and chart, passed through. |
| `limits` | section 7.5 | |
| `label` | the title | The region's accessible name. |

**Events** (on the handle, and as DOM events `elements-view:<name>` on the container; those marked * are cancelable)

`ready`, `error`, `issues`, `link`*, `action`*, `control-change`*, `select` (rows, points, places), `drill`*, `patch`, `state` (the stream's),
`resync`, `navigate`, `dispose`.

### 8.3 `<elements-view>`

```html
<elements-view src="/views/sales.json" theme="dark" density="compact" header="strip" panels="by-country,map" live></elements-view>
```

| Attribute or property | Meaning |
|---|---|
| `src` | The ViewModel's address. Changing it repaints. |
| `.viewModel` | The ViewModel as an object (a property; there is no JSON-in-an-attribute form). |
| `.options` | The options of section 8.2. |
| `live`, `theme`, `density`, `header`, `panels`, `locale`, `validate`, `label` | As the options. |
| `.handle` | The handle, once painted. |
| `<script type="application/json">` child | An inline ViewModel, for a page that is a single file. |

The tag is `elements-view` because it is the library's own and collides with no host's tag; `options.tag` of `define()` lets a host register
it under another name. It is a thin wrapper: everything goes through `paint`.

### 8.4 How a paint goes

1. Read the source (fetch, parse), check `spec`, validate (`options.validate`).
2. Load the libraries the kinds need (in parallel; the engines only when a chart is in view).
3. Build datasets as drishti-data sources; none is read yet.
4. Draw the frame, the title, the strip, the controls and every panel's frame in its place, each in the `pending` shape of its kind. This is
   the first paint and needs no data.
5. Draw panels as their data arrives, those in view first (an `IntersectionObserver`; a panel far below is drawn when scrolled near).
6. Raise `ready`; subscribe when the view is live.

A patch goes through the same painters: `panel` calls the kind's `update` (or paints again), `rows` goes to the dataset's source and from
there to every panel that reads it through the grid's and chart's own live paths.

---

## 9. Builders

### 9.1 In JavaScript, browser and Node

```js
import { view } from '/elements/drishti-views/src/drishti_index.js';

const vm = view('Sales · EMEA').id('sales-emea').locale('en-GB').currency('EUR')
  .strip([{ label: 'Booked', value: 18420350, format: 'amount0', emphasis: true }])
  .control('region', { kind: 'dropdown', options: ['EMEA', 'AMER'], value: 'EMEA' })
  .dataset('orders', rows, { key: 'orderId' })
  .kpis([{ id: 'booked', label: 'Booked', value: 18420350, format: 'amount0', delta: { value: 0.042, format: 'pct1', tone: 'pos' } },
         { id: 'count', label: 'Orders', value: 1287 }])
  .grid('orders', { title: 'Orders', span: 8, pivot: { rows: ['country'], values: [{ field: 'amount', agg: 'sum' }] } })
  .chart('orders', { kind: 'bar', title: 'By country', span: 4, x: 'country', y: { field: 'amount', agg: 'sum' } })
  .map('orders', { title: 'Where', code: 'country', value: 'amount' })
  .live({ topic: 'views.sales-emea' })
  .toJSON();
```

- One method per kind (`kv`, `status`, `metric`, `kpis`, `markdown`, `links`, `timeline`, `table`, `ladder`, `pivot`, `grid`, `tree`, `tabs`,
  `line`, `area`, `hbar`, `gauge`, `surface`, `waterfall`, `histogram`, `scatter`, `candlestick`, `graph`, `map`, `chart`), plus `panel(obj)`
  for a registered kind, `layout`, `tabs`, `section`, `dataset`, `control`, `action`, `formats`, `status`, `a11y`, `meta`.
- **It guesses the dull parts**: a panel's `id` from its title, a dataset's `fields` and a grid's columns from the first rows, `span`s that
  fill a row. `grid(rows)` with nothing else is a complete panel.
- **It fails early, in words**: every call validates what it adds and throws a `ViewError` with the path and the fix
  (`panels[2].data.pivot.values[0].agg: "summ" is not an aggregation; did you mean "sum"?`).
- `toJSON()` is the ViewModel; `paint(el)` paints it; `frame()` starts a patch builder with the same checks:
  `frame().cell('booked', { value: 18432850 }).rows('orders', { update: [...] }).toJSON()`.
- The builder module touches no DOM, so `node` runs it unchanged: an Express handler imports the same file a page does.

### 9.2 Helpers for servers: Python, Java, Node

The helpers do one thing: **write valid ViewModels and frames**. They are JSON and schema validation; they draw nothing, hold no server, and
need no dependency.

| Helper | Form | Depends on |
|---|---|---|
| **Python** `drishti_elements_views` | one package of pure Python (3.9+): `view()`, `frame()`, `validate()`, `sse()`; `from_dataframe` and `to_arrow` only when pandas or pyarrow are already installed | the standard library |
| **Java** `ElementsViews` | one source set (Java 17+): `View.of("…")`, `Frame.of()`, `Views.validate(json)`, `Views.sse(...)`; writes JSON itself, and accepts a Jackson `ObjectMapper` when the application has one | the JDK |
| **Node** | the browser's `drishti_views-build.js` and `drishti_views-validate.js`, as they are, plus `sse()` | none |

How they stay true to one specification:

- The schema is the source. A generator (`tools/views/gen.py`) writes from it: the TypeScript declarations, the Python `TypedDict`s, the
  Java records, each helper's embedded copy of the schema, and the lists of kinds, ops, tones and formats. A stale generated file fails the
  check, as the API reference does today.
- Each helper carries the same small validator (the keywords of section 3.4) and is run against the **conformance vectors**
  (`spec/vectors/`): valid and invalid ViewModels with the expected issues, and patch vectors (a ViewModel, a frame, the ViewModel after).
  The JavaScript validator, the painter's patch code and all three helpers must agree on every vector.
- The fluent layer of each helper is hand-written and small (about 300 lines): method names follow the JavaScript builder, in the language's
  own casing.
- `sse()` writes the read-only form of the events protocol over Server-Sent Events (`welcome`, `subd`, then `msg` frames with a rising
  `seq`), so a helper user gets a live view without implementing the protocol. A server that already speaks it uses its own.

They live in this repository under `helpers/python`, `helpers/java` and `helpers/node`, are versioned with the specification, and ship in
the release tree. Publishing them to package registries is the owner's decision (Q8).

### 9.3 A live dashboard in about thirty lines

The page, the same for all three:

```html
<script type="module" src="/elements/drishti-views/drishti_views.js"></script>
<elements-view src="/views/sales" live></elements-view>
```

**Python (Flask)**

```python
from flask import Flask, Response, jsonify
from drishti_elements_views import view, frame, sse
from orders import snapshot, changes, booked, history      # your data

app = Flask(__name__, static_folder="static", static_url_path="")

@app.get("/views/sales")
def sales():
    rows = snapshot()
    return jsonify(
        view("Sales today", id="sales").locale("en-GB").currency("EUR")
        .kpis([{"id": "booked", "label": "Booked", "value": booked(rows), "format": "amount0"},
               {"id": "count", "label": "Orders", "value": len(rows)}])
        .dataset("orders", rows, key="orderId")
        .grid("orders", title="Orders by country", span=8,
              pivot={"rows": ["country"], "values": [{"field": "amount", "agg": "sum"}]})
        .line(title="Booked, minute by minute", span=4, id="trend", window=240, **history())
        .live(url="/events", topic="views.sales")
        .to_dict())

@app.get("/events/stream")
def stream():
    def frames():
        for changed, total, point in changes():              # blocks until orders change
            yield (frame().rows("orders", update=changed)
                          .item("kpis", "booked", {"value": total})
                          .append("trend", points=[point]))
    return Response(sse(frames(), topic="views.sales"), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-store"})
```

**Java (Spring)**

```java
@RestController
class SalesViews {
  private final Orders orders;                               // your data
  SalesViews(Orders orders) { this.orders = orders; }

  @GetMapping(value = "/views/sales", produces = "application/json")
  String sales() {
    var rows = orders.snapshot();
    return View.of("Sales today").id("sales").locale("en-GB").currency("EUR")
        .kpis(Kpi.of("booked", "Booked", orders.booked(rows)).format("amount0"), Kpi.of("count", "Orders", rows.size()))
        .dataset("orders", rows, "orderId")
        .grid("orders", g -> g.title("Orders by country").span(8).pivotRows("country").pivotSum("amount"))
        .line("trend", l -> l.title("Booked, minute by minute").span(4).window(240).series(orders.history()))
        .live("/events", "views.sales")
        .toJson();
  }

  @GetMapping(value = "/events/stream", produces = "text/event-stream")
  SseEmitter stream() {
    var out = new SseEmitter(0L);
    var sse = Views.sse("views.sales", out::send);           // writes welcome, subd, then each frame as msg
    orders.onChange(c -> sse.send(Frame.of().rows("orders").update(c.rows())
        .item("kpis", "booked", Map.of("value", c.booked()))
        .append("trend", c.point())));
    return out;
  }
}
```

**Node (Express)**

```js
import express from 'express';
import { view, frame, sse } from './elements/drishti-views/node.js';
import { snapshot, booked, history, onChange } from './orders.js';   // your data

const app = express().use(express.static('static'));

app.get('/views/sales', (req, res) => {
  const rows = snapshot();
  res.json(view('Sales today').id('sales').locale('en-GB').currency('EUR')
    .kpis([{ id: 'booked', label: 'Booked', value: booked(rows), format: 'amount0' }, { id: 'count', label: 'Orders', value: rows.length }])
    .dataset('orders', rows, { key: 'orderId' })
    .grid('orders', { title: 'Orders by country', span: 8, pivot: { rows: ['country'], values: [{ field: 'amount', agg: 'sum' }] } })
    .line({ id: 'trend', title: 'Booked, minute by minute', span: 4, window: 240, ...history() })
    .live({ url: '/events', topic: 'views.sales' }));
});

app.get('/events/stream', (req, res) => {
  const out = sse(res, { topic: 'views.sales' });            // headers, welcome, subd, heartbeats
  const off = onChange((c) => out.send(frame().rows('orders', { update: c.rows })
    .item('kpis', 'booked', { value: c.booked }).append('trend', { points: [c.point] })));
  req.on('close', off);
});

app.listen(8080);
```

A producer with no helper at all writes the JSON by hand, or with `jq`, SQL, R or a spreadsheet macro: that is the point of a specification.

---

## 10. Validation, the playground and the gallery

### 10.1 The validator

`validate(viewModel, { strict, kinds })` answers `{ ok, issues }`; an issue is
`{ level: 'error' | 'warning' | 'note', code, path, message, fix?, near? }`. It runs in the painter (`options.validate`), in Node, and in the
helpers. It checks the schema only and is fast enough to run on every load of a view (section 12.3).

### 10.2 The linter

`lint(viewModel)` (the second file, loaded when asked for) runs the validator and then what a schema cannot say:

| Rule | Example message |
|---|---|
| ids unique; references resolve | `layout.place.mapp: no panel has the id "mapp"; did you mean "map"?` |
| datasets and fields exist | `panels[1].data.pivot.rows[0]: the dataset "orders" has no field "county" (fields: orderId, country, amount)` |
| keys present where patches need them | `datasets.orders: a live view patches rows by key; add "key": "orderId"` |
| formats known | `strip[0].format: "amont0" is not a format of this view; did you mean "amount0"?` |
| addresses allowed | `datasets.orders.arrow.url: https://other.example is not an allowed data origin (options.data.allow)` |
| sizes sensible | `panels[3]: 61,204 inline rows; send Arrow or a server source above 50,000` |
| accessibility | `panels[2] (line): add a11y.summary, one sentence that says what the chart shows` |
| layout fits | `layout.areas: "side" is named in place but is in no row of areas` |
| deprecations | `panels[0].data.fmt is deprecated since 1.2; use "format"` |

Every message is a path, what is wrong and what to write instead. As a command: `node tools/views/lint.mjs view.json` (exit code 1 on an
error; `--strict`, `--json`), and `python -m drishti_elements_views lint view.json` from the Python helper.

### 10.3 The ViewModel playground

A page of the gallery: the JSON on the left in drishti-inputs' code editor (with the schema driving completion and inline issues), the
painted screen on the right, in the gallery's existing playground frame.

- Paste or type JSON: the screen repaints as you stop typing; issues appear under the editor and, clicked, select their path.
- A **Patches** tab: paste a frame and apply it, or press "Simulate" to have the mock stream send row changes, so a live view can be seen
  without a server.
- **Examples** load the gallery's showcase views; **Builder** shows the same view as JavaScript, Python and Java builder code.
- Theme, density, locale and container width switches (to see the narrow layout).
- "Copy as file": one self-contained HTML page with the ViewModel inline.
- It runs from the file system; the pasted ViewModel is painted under the default allow-lists (no outside origin), inside the frame.

### 10.4 The gallery's Views section

Example views on made-up data, each with its JSON and its builder code:

| Example | Shows |
|---|---|
| Every kind | one panel of each of the twenty-five kinds, and each state |
| A sales dashboard | KPIs, a pivot grid, a map, a trend; controls that filter in the browser |
| A portfolio desk | a dense grid of 100,000 synthetic positions from Arrow, a nested pivot, a waterfall, a heat map, live row patches from the mock stream |
| An operations wall | status panels, a timeline, gauges; frames arriving several times a second |
| A report | tabs and sections, long tables, a narrow layout, print |
| A view that arrives in pieces | the pending layout, panels filling in, `done` |
| A page with no server | `file://`, a ViewModel inline, a million rows of Arrow handed by the page |
| A host's own kind | `registerKind` |

The catalogue, the frame-time budget per gallery page and the browser tests cover them as they cover every other component.

---

## 11. Compared with the alternatives

| | What it is | Where drishti-views is stronger | Where the other is stronger |
|---|---|---|---|
| **Vega-Lite, Vega** | a grammar of charts as JSON; Vega adds signals and expressions | whole screens, not single charts: grids, pivots, trees, maps, KPIs, layout, controls and states in one document; live patches by key with resume; no expression language to sandbox | a far richer grammar of graphics and transforms; a large community. A Vega-Lite spec is accepted inside a `chart` panel. |
| **Perspective** | a streaming pivot engine in WebAssembly with a viewer | one specification for the whole screen; no WebAssembly, so strict CSP and `file://` work; server-side pivots for figures that must not be summed in a browser; accessibility | raw in-browser speed on tens of millions of rows; its expression columns |
| **Grafana dashboard JSON** | panels bound to data-source queries, drawn by the Grafana application | no application or plug-in runtime to host: a library and a JSON file; data inline or by address rather than queries tied to data-source plug-ins; finance-grade grids and pivots; the reader's page stays the host's own | time-series tooling, alerting, a vast plug-in catalogue |
| **Streamlit, Dash, Panel** | Python scripts that become applications, with a server round-trip per interaction | any language; no long-lived Python session per reader; works offline and inside any page; a written contract that a test can hold | writing an interactive tool in twenty lines of Python with callbacks; the scientific ecosystem. Their servers can *emit* ViewModels with the Python helper. |
| **Retool-style JSON UIs** | proprietary application definitions with queries and scripts, run by a hosted builder | an open, versioned specification with a schema; no scripts in the document; no vendor runtime | forms, CRUD against many databases, a visual builder |
| **Adaptive Cards** | small cards of text, inputs and actions for chat and mail clients | data density: virtual grids, pivots, charts and maps; live updates | hosts everywhere (chat clients), templating, a mature design tool |
| **Server-driven UI (mobile-style)** | a server sends a tree of generic components the client renders | panels are *meaningful* (a pivot, a waterfall), so a producer says what to show, not how to assemble it; schema validation; patches | arbitrary layouts and flows of native components |

**What drishti-views does that none of them does in one piece**: dense, finance-grade grids, pivots, trees, charts and maps in one
specification; live patches by key with ordering, conflation and resume; a strict security model for untrusted producers; no framework, no
build, no CDN, no WebAssembly; the same file on a server, in a page of someone else's application and from a disk.

**What it deliberately does not do**

- **No expressions or scripts** in a ViewModel: no computed columns by formula, no conditional visibility by expression, no callbacks. A
  producer computes; a host handles events.
- **No arbitrary component tree**: a screen is panels in a layout. There are no nested boxes, margins or free positioning.
- **No write-back contract** in 1.0: actions are events; editing grids and forms stay the host's own code over the libraries (Q10).
- **No query language** beyond filter, sort, group and aggregate over a dataset.
- **No styling in the document**: tones, densities and themes only.
- **No images, frames or media** in 1.0.
- **It is not an application builder**: no pages, routing, users or storage.
- **It does not draw Vega**: Vega-Lite is translated, one drawing engine.

---

## 12. Versions, budgets and speed

### 12.1 The specification's version

- `spec` is `major.minor`. **Minor** versions only add: a field, a kind, a tone, an op, a format type. **Major** versions may rename, remove
  or change a meaning.
- A painter draws the majors in `SPECS`. It refuses another major in words; within a major it draws a newer minor by ignoring what it does
  not know (section 2.1) and says, once, which panels wanted something newer.
- Every kind, field and op in the schema carries `since` (and `deprecated`, `replacedBy` when it applies), so the linter can say
  "`grid.data.tree` needs 1.1; this painter draws 1.0".
- **Deprecation**: a deprecated name is drawn for the rest of its major and at least two minors, with a linter warning that names the
  replacement. It is removed only by the next major. `tools/views/migrate.mjs` rewrites a ViewModel from one major to the next.
- A painter of major *n+1* also reads major *n* for one major, by upgrading the JSON on load with the same migration code; there is one
  painter, never two.
- The schema file of a released version never changes; `spec/` keeps every released schema and its vectors.
- The library's own version is Elements' one version. The specification's version is separate and moves more slowly.
- The frames of section 5 are part of the specification and carry no version of their own; the transport's version is the events
  protocol's.

### 12.2 Bytes

Budgets are raw bytes of the bundled files, as for every library (`tests/test_elements_budget.py`), with gzip as a guide.

| File | Budget | About, gzipped |
|---|---|---|
| `drishti_views.js` (painter, kinds, patches, validator, compact schema, builder, the element) | 150,000 | 40 KB |
| `drishti_views.css` | 60,000 | 11 KB |
| `drishti_views-lint.js` (loaded when asked for) | 45,000 | 12 KB |
| `node.js` (builder, validator, `sse`; no DOM) | 60,000 | 16 KB |

What a page loads depends on the view: words and figures only (`kv`, `metric`, `kpis`, `markdown`) need core, events and views; a table adds
the grid; a chart adds the chart library and its engine, loaded when the first chart nears the screen. No library's existing budget rises
for this design.

### 12.3 Speed is the first requirement

These screens are used by people who act on what they see within a second. **Nothing in this design may make a screen paint, or a tick reach
the glass, slower than the painter a host uses today.** Three rules follow, and they outrank every feature in this document:

1. **A baseline before any code.** Before step 3 of the plan, the benchmark of section 12.4 is run against the existing painter of the
   adopting product (Appendix A) and its numbers are recorded as the baseline. Every target below is the stricter of the number written
   here and that baseline.
2. **The specification adds no work to the hot path.** Validation, the linter, the builder and the mapping of a host's contract run when a
   view is loaded, never per patch. A patch goes from the socket to the component that draws it with no schema check, no deep copy and no
   re-layout of the view.
3. **A change that misses a budget does not merge.** The budgets are tests (section 12.4), not aspirations.

Numbers are for Chromium on the reference laptop of the existing throughput tests, at 4x CPU throttling where marked (t).

| # | What | Target | How it is met | How it is tested |
|---|---|---|---|---|
| P1 | **First paint**: frames, title, strip, every panel in its pending shape, for a 12-panel view with libraries cached | 60 ms after the JSON arrives; 150 ms (t) | step 4 of section 8.4 needs no data and no engine; one sheet, adopted once; panel frames are built in one fragment and attached once | a browser test with `performance.mark` around `paint` and the first frame |
| P2 | **All panels drawn**, inline data, charts included | 400 ms; never slower than the baseline | panels in view first; engines loaded in parallel with the data; charts drawn without their entry animation on first paint | the same test, to `ready` |
| P3 | **Patch to pixel** for a live tick (`cell`, `item`, `data`, one row) | applied in under 1 ms; on the glass in the **next animation frame** after the message is received (p99 under 20 ms, including the frame wait) | the patch is routed by id through a `Map` to the one node or component; text is written to an existing text node; no validation; one `requestAnimationFrame` batch per view | a test that stamps the message on receipt and reads the paint time from a `PerformanceObserver` on the element's update; p50, p99 and the worst are recorded |
| P4 | **60 frames a second under load** | 10,000 row updates a second into a 100,000-row grid, conflated, with no frame over 16.7 ms of script and no dropped frame over 30 seconds; 50 ms worst frame (t) | conflation by key before any drawing (drishti-events' `conflate` and `deliver: 'frame'`); the grid's live path updates only rows in the viewport; off-screen rows change data only | the gallery benchmark's frame recorder (section 12.4): frame times from `requestAnimationFrame` and long-task entries |
| P5 | **Large grids are virtual** | scrolling a 1,000,000-row grid stays at 60 frames a second; the DOM holds only the visible rows plus a margin, whatever the row count | drishti-grid's virtual rows and columns; a `grid` panel never materialises rows; a `table` panel above a few hundred rows pages | a test that counts row elements at 1,000 and at 1,000,000 rows (equal) and records scroll frame times |
| P6 | **Arrow off the main thread** | no main-thread task over 16 ms while a 1,000,000-row Arrow file is fetched, decoded, sorted or pivoted; first rows within 500 ms of the first record batch | drishti-data's worker reads the stream, decodes batches and computes sort, filter and pivot; the main thread receives only the rows in view (transferred buffers, no copy) | long-task entries during the load are asserted empty; the worker's times are recorded |
| P7 | **No layout thrash** | at most one style-and-layout pass per animation frame while patches flow; a patch to one panel never lays out another | every panel is `contain: layout paint` with its size fixed by the layout grid, so its content cannot move its neighbours; reads of geometry happen before writes in one batch; sizes come from `ResizeObserver`, never from reading layout in the patch path; flashes are opacity and transform only | a Chromium trace of the load test: forced synchronous layouts counted (must be zero in the patch path) and layout events per frame (at most one) |
| P8 | **Bundles loaded lazily, per kind** | a view of words and figures downloads only core, events and views; the grid, the chart library, its engine, the tree, the graph and the 3D engine are each fetched only when a kind in the view needs them, and an engine only when its first panel nears the screen | the loader reads the ViewModel's kinds before fetching; `modulepreload` hints for what the view will need; nothing is imported at the top of drishti-views but core | a browser test that lists the requests of four views (words only, a table, a chart, everything) against an exact expected list; the byte budgets |
| P9 | **Validation is cheap** | a 200 KB ViewModel validated in under 15 ms; never run per patch | the schema is compiled once to a compact form; `options.validate: 'off'` for a host that validates on its server | a Node timing test |
| P10 | **Many views in one page** (a wall of 50) | one connection; under 4 ms of script per animation frame in total | one `requestAnimationFrame` scheduler shared by all views of a page; one drishti-events connection; hidden and off-screen views apply data only | the benchmark's wall scenario |
| P11 | **A hidden tab costs nothing** | no painting; pending state bounded by the number of identities, not of frames; caught up in one paint when shown | conflated pending state only | a test with the page hidden for a minute of load |
| P12 | **Nothing leaks** | no growth of memory, nodes or listeners over an hour of patches; `dispose()` releases every listener, observer, worker and engine instance | windows on appended series (`window`); every subscription owned by the handle | a soak test comparing heap, node and listener counts before and after |

What is deliberately *not* done, for speed: no virtual DOM and no diffing of whole views (patches name what changed); no re-validation of
patches; no re-render of a panel for a patch that a component can apply itself; no animation on data that ticks.

### 12.4 The benchmark in the gallery, and the budget the build enforces

A page of the gallery, **Views: speed**, runs the scenarios above on made-up data with the mock stream and shows, live: frames per second, the
frame-time histogram, patch-to-pixel p50 and p99, long tasks, node count and heap. A reader can change the row count, the updates per second
and the number of views, and compare two runs. It is the tool a host uses to see what its own machine does.

The same scenarios run headless as tests, and their budgets are a file, `tests/views_budget.json`:

```json
{ "first-paint-ms": 60, "ready-ms": 400, "patch-to-pixel-p99-ms": 20, "load-10k-per-s-worst-frame-ms": 16.7, "load-10k-per-s-dropped-frames": 0,
  "forced-layouts-in-patch-path": 0, "arrow-1m-long-tasks": 0, "grid-row-nodes-max": 120, "wall-50-script-ms-per-frame": 4,
  "soak-heap-growth-percent": 2 }
```

- **The gate** (the checks every change passes) runs the short form of every scenario and fails on any budget exceeded, as the byte budgets
  and the gallery's frame-time budgets do today. Timing budgets are checked as a ratio to a calibration loop run on the same machine in the
  same job, so a slow runner does not fail a good change and a fast one does not hide a bad one.
- A budget may only be loosened by a change that says why, in the same commit as the number.
- Each release records the benchmark's full results, so a slow drift across releases is seen.

---

## 13. Build plan, risks and questions

### 13.1 Steps

Grades: **deep** (the specification, state and ordering, security), **standard** (well-specified features), **routine** (mechanical). Days
are builder-days. The steps assume drishti-events' first usable release exists.

| # | Step | Days | Grade | After |
|---|---|---|---|---|
| 1 | The specification: the schema of sections 2 to 5 in full, `since` marks, the bounds; the conformance vectors (valid, invalid, patches); the generator (`tools/views/gen.py`: compact schema, declarations) | 4 | deep | |
| 2 | The validator and its error shape; strict mode; the keyword guard; Node tests over the vectors | 2 | standard | 1 |
| 3 | The painter's core: `paint`, the handle, the screen, the frame of a panel and its states, the layout (flow, areas, tabs, sections, split, narrow), the strip, the title, navigation; the sheet in both themes | 5 | deep | 1 |
| 4 | The kinds, words and tables: `kv`, `status`, `metric`, `kpis`, `markdown` and its parser, `links`, `timeline`, `table`, `ladder`, `pivot`, `tabs`; `registerKind` | 4 | standard | 3 |
| 5 | Datasets: inline, columnar, Arrow by address, bytes and name, pages, the server-side model, derived reads; the two contracts into CONTRACTS.md | 4 | deep | 3 |
| 6 | The kinds, data and charts: `grid`, `tree`, the fourteen chart kinds and `map` over drishti-chart's panel charts, `chart` and Vega-Lite, data tables, export | 5 | standard | 4, 5 |
| 7 | Patches: every op, order, conflation, the frame-per-animation-frame paint, hidden tabs, the view that arrives in pieces; the patch vectors | 4 | deep | 4, 5 |
| 8 | Live: the subscription over drishti-events, resume, resync, the plain stream through raw mode, the status and stale marks | 3 | deep | 7 |
| 9 | Security: both allow-lists, the bounds, the hostile-input tests (a corpus of malicious ViewModels and frames), the strict-CSP and Trusted Types browser tests | 3 | deep | 6, 7 |
| 10 | Controls and drills: the ten control kinds over drishti-inputs, the three ways a change is answered, drills, actions and publishing | 3 | standard | 6 |
| 11 | Accessibility: roles, the keyboard between panels, the live region, summaries, reduced motion; the automated checks and a screen-reader pass | 2.5 | standard | 6, 7 |
| 12 | `<elements-view>`, the loader's "only what the kinds need", the manifest, the budgets | 1.5 | standard | 6 |
| 13 | The fluent builder and the frame builder; the Node entry and `sse()` | 3 | standard | 2 |
| 14 | The linter and its command | 3 | standard | 2, 5 |
| 15 | The Python helper (builder, validator, `sse`, the optional data-frame and Arrow adapters) and its tests over the vectors | 3 | standard | 1, 13 |
| 16 | The Java helper (records, builder, validator, JSON writer, `sse`) and its tests over the vectors | 4 | standard | 1, 13 |
| 17 | The playground page | 3 | standard | 14 |
| 18 | The gallery's Views section: the eight examples, synthetic data, the mock stream, the catalogue, frame-time budgets, browser tests | 4 | standard | 8, 10 |
| 19 | Speed: the gallery's benchmark page, the headless scenarios and `tests/views_budget.json` in the gate, the trace and soak tests, fixes (its baseline run and the P1 to P3 tests come first, with step 3) | 5 | deep | 3, 8 |
| 20 | Docs and guards: the specification into its own reference page, USING, DESIGN, CONTRACTS, the generated API and declarations, CHANGELOG, the no-host-words guard for the new library and helpers; this file deleted | 2.5 | routine | all |
| | **Total** | **68.5** | | |

With three builders: 1, then {2, 3}, then {4, 5, 13}, then {6, 7, 14}, then {8, 10, 15}, then {9, 11, 16}, then {12, 17, 18}, then
{19, 20}; about 25 working days. A **first usable release** (steps 1 to 8, 12 and 13: the specification, the painter with every kind, data,
patches, live, the element and the builder, held to the P1 to P8 budgets from its first day) is 35.5 days, about 14 working days with three
builders. The adoption by the Drishti product
(Appendix A) is counted there, not here.

### 13.2 Risks

| Risk | Why it matters | What limits it |
|---|---|---|
| The specification is published too early and must change | a public contract is costly to break | 1.0 is declared **stable only after** the adopting product's screens and the gallery's examples run on it; until then it is `0.9` and may change (Q3) |
| Two table things (`table` and `grid`) and two chart forms (named kinds and `chart`) confuse producers | "one way per job" | one drawing of each; the docs say which to use in one sentence; the linter suggests `grid` above a few hundred rows |
| drishti-events is late | live views depend on it | `handle.patch` and a plain stream need only its first usable release; steps 1 to 7 need none of it |
| Scope: twenty-five kinds, six data forms, three helpers | 68.5 days is a large release | the first usable release is a clean cut; helpers, linter, playground and gallery follow it |
| The security model has a hole | an untrusted ViewModel is the stated use | no HTML path exists at all; one element maker; a hostile corpus in the tests; an outside review before 1.0 is declared stable (Q12) |
| Producers want expressions ("hide when", "colour if") | pressure to add logic | tones and states cover the common cases as data; anything else is the producer's computation. Held as a rule. |
| Helpers drift from the specification | three languages | generated types, embedded schema, shared vectors, a stale-file check |
| A Java build in a repository that has none | new tooling | the helper is plain source compiled and tested with the JDK's own tools in CI; no build system is added (Q9) |
| The new painter is slower than the one it replaces | speed is the first requirement (section 12.3) | the baseline is measured first; the budgets are in the gate from step 3; the adopting product's migration (Appendix A, M2) does not merge unless the benchmark is at or better than the baseline |
| Format parity between a producer and the browser | `value` and `text` could disagree | one formats table generated for every helper; rounding half up everywhere; vectors of formatted values |

### 13.3 Questions for the owner

| # | Question | Recommendation |
|---|---|---|
| Q1 | A tenth library, `drishti-views`, holding the specification, the painter and the builder? | Yes. One home for "a screen"; nothing in it draws what another library draws. |
| Q2 | The tag name `<elements-view>` (not `<drishti-view>`, which a host already uses)? | Yes, with `define({ tag })` for a host that wants another. |
| Q3 | Publish the specification as `0.9` first and declare `1.0` when the adopting product and the gallery run on it unchanged for one release? | Yes: a public contract should be proven before it is frozen. |
| Q4 | Cells carry `text` **or** `value` with a `format` (the painter formats)? | Yes, both; `text` wins. It is what makes a thirty-line producer possible while exact producers stay exact. |
| Q5 | The closed list of patch ops, with no path-addressed "set anything"? | Yes. Identity-addressed patches can be validated, conflated and explained. |
| Q6 | Links to other origins closed by default (an allow-list), data fetches limited to the page's and the ViewModel's origins? | Yes. Safe by default; one option opens it. |
| Q7 | `markdown` with a `basic` markup drawn by a small parser of our own (no dependency), or plain text only in 1.0? | The basic markup: producers ask for headings and links first, and it is small and has no HTML path. |
| Q8 | Publish the helpers to package registries (PyPI, Maven Central, npm), or ship them only in the release tree? | The release tree only while the licence is proprietary; revisit with the licence decision. |
| Q9 | The Java helper as dependency-free source for Java 17+, tested with the JDK's tools, no build system in this repository? | Yes. |
| Q10 | Write-back (editable grids, forms that submit) stays out of 1.0; actions are events? | Yes. Design it as 1.1 once the read side has settled. |
| Q11 | Images (a logo, a product picture) in 1.0? | No; 1.1, with an image allow-list. They widen the security surface for little gain now. |
| Q12 | An outside security review of the painter before 1.0 is declared stable? | Yes, since untrusted producers are the stated use. |
| Q13 | The 50,000-row limit for inline rows, with Arrow or a server source above it? | Yes; the option raises it for a page that knows its data. |
| Q14 | Ship the first usable release (35.5 days) before the helpers, linter, playground and gallery? | Yes: hosts can start writing ViewModels while the rest is built. |
| Q15 | The speed budgets of section 12.4 are part of the gate, and no change that misses one merges (a budget is loosened only by an explicit, explained change)? | Yes. |
| Q16 | A designer for views (drag panels, write the JSON) built from drishti-designer? | Later, its own design; the layout is already that library's model, so nothing here blocks it. |

---

## 14. A library that names no host

drishti-views is for anyone's page and anyone's server. It contains no address, route, header name, auth scheme, entity type, error code,
settings key, grammar or product assumption of any host. Everything a host needs is an option (`fetch`, `events`, `links.resolveLink`,
`links.resolveView`, `data`, `remember`, `messages`, `explain`), a registered kind, or an adapter that lives **in the host's own code**. The
specification is neutral; a host's server is one producer among any number.

**The guard.** The static test that keeps host words out of the generic libraries reads every file of `elements/drishti-views/`, `helpers/`,
the specification, its vectors and the gallery's Views pages, and fails on host-specific routes, header names, error-code prefixes, settings
keys and a list of host vocabulary (the gallery's made-up sample data is allowed its instrument and country names). Allowed, because they are
the library's own names: the namespace `Drishti.elements`, the `drishti_` file prefix, `drishti-views`, `drishti_elements_views` and the
copyright header. The examples in this document follow the same rule (`example.org`, `views.sales`, orders and countries).

---

## 15. Research: a portable view-Sutra compiler (not planned)

> **Superseded by [SUTRA_FOR_EVERYONE.md](SUTRA_FOR_EVERYONE.md), section 3**, which re-examines where the compiler runs and reaches a
> different recommendation. This section is kept until that design is decided, then deleted.

> **An idea, researched and written down. It is not planned.** No step of section 13 or of Appendix A builds any of it, no effort is
> counted for it, and nothing else in this document depends on it. It names one host's vocabulary (a *Sutra* is the Drishti product's
> screen definition) because the idea came from that host; if it were ever built, the Elements side would need a neutral name and would
> have to pass the guard of section 14.

### 15.1 The idea

Today a Sutra says, in one document, both *what the screen looks like* and *where its data comes from*, and one compiler in the product's
server turns it into a ViewModel. The idea is to split it:

| Layer | Holds | Would live |
|---|---|---|
| **View** | layout, panels and their visual kinds, formats, drills, the binding of fields to cells, columns, axes and shades | in Elements: portable, with no host words |
| **Data** | queries, measures, engines, access rules, Explain | in the product |

and then:

1. **One compiler**, view-Sutra to ViewModel, written once in JavaScript inside Elements. It runs in a browser and in Node. There are **no
   Python or Java copies**: other languages get the schema validator of section 9.2, never a compiler. Shared conformance vectors
   (a view-Sutra, the data's shape, the expected ViewModel) hold every runner to the same output.
2. **The product's Java server runs the same JavaScript in process**, through GraalJS (the GraalVM Polyglot API as ordinary jars inside the
   server's jar), for what must happen on a server: exports, scheduled reports, streamed screens, embedding, and trimming a view to what a
   reader may see.

### 15.2 What it would mean for the specification

Most of the split is already the shape of this design: a ViewModel whose panels name `datasets` and fields is a screen without its data.
Compiling a view-Sutra would give a **ViewModel with its datasets declared and empty**; binding is attaching rows or Arrow to those names,
which needs no JavaScript and can be done by any server per request. Two additions would be needed, both data and not logic:

- a **bound cell**, `{ "from": { "dataset": "summary", "field": "booked" }, "format": "amount0" }`, so strip figures, `kv` fields and `metric`
  values can be filled from a dataset row instead of being written in place;
- **named shapes** for a dataset (`fields` without rows), which the schema already allows.

The named kinds that take pre-digested records (`waterfall`, `pivot`, `histogram` with bins) would be bound through their `{dataset, …}`
forms. What a view-Sutra could *not* hold is anything computed: it stays a declaration.

### 15.3 Findings so far (from documentation; nothing here has been run)

| Topic | What is understood | Confidence |
|---|---|---|
| Packaging | GraalJS is published as ordinary Maven artifacts (the Polyglot API and a JavaScript language artifact with its Truffle dependencies) and runs on a stock OpenJDK 21. | high |
| Licence | The community JavaScript artifact is under UPL-1.0 (parts MIT); ICU4J comes with it under its own licence. A similarly named non-community artifact is under a different, more restrictive licence: the exact coordinates matter. | medium: to be confirmed artifact by artifact |
| Speed on stock HotSpot | Without the Graal compiler the engine interprets JavaScript (Truffle's interpreter, itself compiled by HotSpot). It is correct but many times slower than Node; it prints a one-line warning about running without runtime compilation unless an engine option turns the warning off. | high on the behaviour, **unknown on the factor for this workload** |
| The optimising runtime | Adding the Truffle runtime and compiler jars and enabling JVMCI on the JVM gives compiled JavaScript on a stock JDK. It adds flags to every launch script and more jars. | medium: flags and support on each platform to be confirmed |
| Sandboxing | A context is built with no host access, no IO, no threads, no native access, no class lookup and no environment; a resource limit can stop a runaway script. The strongest sandbox policies belong to the commercial distribution. | medium |
| Threads | A context is used by one thread at a time; an engine shared by many contexts shares parsed code. So: a pool of contexts over one engine. | high |
| Fat jars | Truffle finds languages through service files and module metadata; a merged jar must merge them correctly, and a shaded or repackaged jar can lose the language. | medium: a known source of trouble |
| The compiler's own shape | A compiler is a pure function of JSON to JSON with no DOM: the kind of JavaScript that runs anywhere. The builder of section 9.1 already has that shape. | high |

### 15.4 The proof to run before any decision

A throwaway project (not in either repository's build), with a stand-in compiler of realistic size: the builder and validator of this
design driven by 50 representative screen definitions.

| # | Measure | How | A result that would pass |
|---|---|---|---|
| R1 | **Jar size added** | the server's jar with and without the Polyglot API and the JavaScript language; again with the optimising runtime jars | an increase the owner accepts for the product's download (to be stated before measuring) |
| R2 | **Cold compile**, stock OpenJDK 21 HotSpot, interpreted | JVM start to the first ViewModel: engine creation, loading the compiler's source, the first compile | under 2 s once per process, paid at start-up and not by a reader |
| R3 | **Warm compile**, interpreted | the 50 definitions compiled 200 times each; p50, p99 after warm-up | p99 under 50 ms per definition (it happens once per definition version, section 15.5) |
| R4 | **The same with the optimising runtime jars** and JVMCI enabled | as R2 and R3 | the factor gained, to decide whether the extra jars and flags are worth having |
| R5 | **The interpreted-mode warning** | that it appears, that the engine option removes it, that nothing else is printed to the server's log | silent with one documented option |
| R6 | **Sandbox** | scripts that try to read a file, open a socket, reach a Java class, start a thread, read the environment, loop for ever, allocate without bound | every one refused or stopped, with a clear error, and the server unaffected |
| R7 | **Platforms** | R2, R3 and R6 on Windows x64, Linux x64, Linux arm64, macOS (arm64 and x64), and in a container with a small memory limit and a read-only file system | the same results everywhere, with no native file unpacked to disk and no executable placed on the machine |
| R8 | **Memory per context** | heap and off-heap after loading the compiler in 1, 4 and 16 contexts over one engine | a pool of contexts that fits beside the server's own heap budget (to be stated before measuring) |
| R9 | **The merged jar** | the language found and working from the server's real fat jar, and from its Windows launch scripts | works with the product's existing packaging, no special launcher |
| R10 | **Same output** | the conformance vectors through a browser, Node and GraalJS | byte-identical ViewModels |
| R11 | **Start-up cost to the server** | server start time with the engine created eagerly and lazily | no visible change with lazy creation |

The thresholds marked "to be stated" are the owner's to set before the proof is run, so that the result decides and is not argued with.

### 15.5 The mitigation design, should interpreted speed be the only weakness

The server would never compile per request:

- **Compile once per definition version**: when a definition is loaded or its override changes, not when a reader asks. A slow compile is
  then a start-up and deployment cost.
- **Cache the result as a ViewModel template**: the compiled ViewModel with its datasets declared and empty (section 15.2), keyed by the
  definition and its version.
- **Bind per request without JavaScript**: the server attaches rows or Arrow to the template's datasets and fills bound cells; that is
  plain JSON work in the server's own language, and it is where access trimming happens (rows and fields a reader may not see are never
  attached; panels over them take the `denied` state).
- **A small pool of contexts over one shared engine**, created lazily, each used by one thread at a time, with a resource limit; a context
  that fails is discarded.
- Streamed screens send the template's panels as `pending` and bind them one by one: no JavaScript in the stream either.

With this design the speed of the JavaScript engine never touches a reader's request, and section 12.3 is unaffected: a browser receives a
ViewModel exactly as it does today.

### 15.6 Risks

| Risk | Note |
|---|---|
| The jar grows by tens of megabytes | the engine, its regular-expression engine and ICU are large; R1 measures it |
| A language runtime inside the server is a new thing to patch, monitor and explain to a bank's security review | a sandboxed interpreter is defensible, but it is a conversation every customer will have |
| JVMCI flags or the optimising jars are not acceptable on a customer's JVM | then only interpreted mode is available, and section 15.5 must carry it |
| Splitting a Sutra is the larger work | every existing definition, its tutorials and its designer would need the two layers; the compiler is the small part |
| Bound cells invite expressions | the same rule as everywhere in this design: a binding names a field, nothing more |
| Two runtimes disagree on an edge (number formatting, regular expressions, sort order) | R10; formatting stays in one place per screen (the producer's text, or the painter) |
| The server's Java compiler and a JavaScript compiler exist side by side during a move | not acceptable as a resting state: the move would have to replace one with the other, release by release, with the vectors as the gate |

### 15.7 The fallback if the proof fails

**Nothing changes, and nothing is lost.** The design of sections 1 to 14 does not depend on this idea: the product's server goes on
compiling its definitions to ViewModels in Java, as it does today, and Elements paints them. Outside the product, people write ViewModels
directly, with the builder or the helpers.

If a portable view definition is still wanted for people outside the product, it can exist **for browsers and Node only**, as a layer over
the builder of section 9.1, with the product's server not using it. A separate Node process beside the Java server (a sidecar) is possible
but is not recommended: a second process to deploy, secure and keep alive on every customer's machine, for work the server already does.

---

## Appendix A: adoption by the Drishti product

> This appendix is about one host, the Drishti product, which will use drishti-views through its pinned, vendored copy of Drishti Elements
> in its release "i7". **Everything named here lives in the Drishti repository, not in Elements**: the adapter, the addresses, the sign-in,
> the mapping of its own ViewModel contract. It is written here only so the design can be read in one place; it belongs in the Drishti
> repository's own documents and should move there when adoption begins.

### A.1 What exists today

The product's server compiles its screen definitions (Sutras) into a ViewModel (its contract 1.x: twenty-two panel kinds, a strip, a layout,
live frames of five ops, a streamed form of six message types) and its client renderer, `drishti-renderer`, paints it: seventeen modules,
about 3,700 lines, already drawing through drishti-grid's document tables, drishti-chart's panel charts, drishti-tree, drishti-graph and
drishti-core's element maker. That renderer stayed in the product when Elements became its own project. It mixes two things: a neutral
painter, and the product's own addresses, sign-in and console behaviours.

### A.2 What moves and what stays

| Module of `drishti-renderer` | Lines | Goes to |
|---|---|---|
| `drishti_dom.js`, `drishti_cells.js` (but the entity address) | 170 | **drishti-views**: the element rules already are drishti-core's; cells become section 2.3 |
| `drishti_kinds.js` (but the provenance kind, the download menu and what the console's scripts read) | 335 | **drishti-views**: the kinds of section 3 |
| `drishti_layout.js`, `drishti_view.js` (but the as-of banners and the figure-explainer hook) | 310 | **drishti-views**: sections 2.5 and 8.4 |
| `drishti_nested.js`, `drishti_behave.js` (but the `console` behaviours) | 165 | **drishti-views**: the `pivot` kind and the panel behaviours |
| `drishti_render.js`, `drishti_screen.js` (paint, patch, the streamed messages, navigation, panel charts; but sign-in, About and fetching) | 600 | **drishti-views**: sections 5 and 8 |
| `drishti_assets.js` (the sheet, the engines) | 155 | **drishti-views** and drishti-core's loader |
| `drishti_net.js` | 160 | **stays**: the view and stream addresses, the as-of header, the code-to-fix table, fetching as the person |
| `drishti_embed.js`, `drishti_signin.js` | 355 | **stays**: the embed API, the token provider, the sign-in window, the command resolver |
| `drishti_console.js`, `drishti_about.js` | 305 | **stays**: the console's behaviours; About this page as a registered side sheet |
| `drishti_elements.js`, `drishti_index.js` | 210 | **stays**, thinner: `<drishti-view>`, `<drishti-panel>`, `<drishti-screen>` as wrappers of `paint` |
| new: `drishti_adapt.js` | about 250 | **the adapter**: the product's contract 1.x to the specification (A.3), its patches and streamed messages to frames |

About 1,700 lines leave the product for Elements (rewritten against the neutral specification, not copied), about 1,000 stay, and about 250
are new. The product's renderer becomes what its name then means: an adapter that turns a Sutra's ViewModel, the person's sign-in and the
product's addresses into a call of `paint`.

### A.3 The mapping (in the product's adapter)

| The product's contract 1.x | The specification |
|---|---|
| `contract: "1.x"` | `spec: "1.0"`; the adapter declares which contracts it maps |
| `ref {kind, id}`, `mnemonic`, `provenance.sutra`, `fingerprint`, `generation`, `timings` | `meta` (handed back in events); `id` is `<kind>/<id>`; `live.seq` from the generation |
| `title {pill, id, with}` | `title {tag, text, subtitle, link}` |
| Cell `{label, text, tone, emphasis, link, path}` | Cell, unchanged (`path` into `meta`); the server goes on formatting, so every cell is `text` |
| Link `{kind, id, mnemonic}` | `{ref: {kind, id, mnemonic}}`, resolved by the adapter's `resolveLink` to the console's route and opened in place |
| `provenance` (fetched, updated, stale, partial, missing, masked) | `status` (`updatedAt`, `source`, `stale`, `partial`, `notes`: the as-of and partial banners, "some values are hidden") |
| panel `empty`, `error`, `denied`, `wire.waits`, `compute.state` | `state.is`: `empty`, `error`, `denied`, `pending`, and `computing`, `stale`, `error` with the code and the adapter's fix text |
| the twenty-one kinds other than `provenance` | the same names and records (the specification took them as they are; a few fields are renamed: `fmt` to `format`, `ev` to `key`, `emptyLabel` to `emptyText`) |
| `provenance` kind | a kind the adapter registers (it links the Sutra and the connector) |
| `keys` (`panel`, `link`, `raw`, `impact`, `denied`) | `keys` with actions the adapter handles |
| `controls`, `selects`, `ctl.<id>` | `controls` with `controlPrefix: 'ctl.'`; `selects` become `drill` rules with `sets` |
| `layout`, `phone` | `layout`, `layout.narrow` |
| frames: `strip`, `panel`, `provenance`, `deleted`, `restored` | `cell` by index, `panel`, `status`, `frozen`, `thawed` |
| streamed: `skeleton`, `panel-add`, `panel-replace`, `patch`, `done`, `error` | `view` with pending panels, `panel-add`, `panel`, the frame's patches, `done`, `state` |
| `DRS-` codes, the fix table | stay in the adapter; they arrive in `state.code` and `state.fix` |
| the view and stream addresses, the embed API, tokens, the sign-in window | `options.fetch`, `options.events` (the product's drishti-events connection, adopted in i6), `resync` |

The mapping is a pure function of JSON and is covered by the product's existing schema tests: every real ViewModel the server's tests
produce must map to a valid ViewModel of the specification.

### A.4 The migration, so the product's pages keep working

| Step | What happens | The gate |
|---|---|---|
| M0 | The benchmark of section 12.4 is run on today's renderer and the numbers recorded. | The baseline exists. |
| M1 | drishti-views' first usable release is vendored into the product (pinned, as every Elements version is). | The product's Elements checks. |
| M2 | `drishti_adapt.js` is written; the product's `render()`, `patch()` and `subscribe()` keep their names, options and events and call `paint` through the adapter. The neutral modules of A.2 are **deleted in the same change**: there is never a flag or a second painter. | The renderer's parity suite over every pack Sutra and every edge case, unchanged; the console's own entity pages in the browser tests; the layout page walk; **the benchmark at or better than the M0 baseline on every number**. |
| M3 | The public entry `static/render/<version>/` is released as the next major of the renderer, with the same exported names, events (`drishti:*`) and tags; its integrity file is regenerated. | The embed samples (plain, React, Angular, Vue) and the embed browser tests, unchanged. |
| M4 | Live: the console's channel and the embed stream feed frames through the adapter over the product's drishti-events connection. | The live and streamed (GenUI) browser tests; a reconnect resyncs. |
| M5 | Docs: the product's ViewModel and embedding guides say that the painter is Elements' and link the specification; the code-to-fix table and addresses stay documented in the product. | The docs checks. |
| M6 (a later release) | The server writes the specification natively (its records and schema generator emit `spec`), the client mapping of A.3 is deleted, and the product's contract 1.x is retired after its deprecation period. | The server's schema tests against the Elements schema and vectors. |

What a host application embedding the product's screens sees: nothing changes in M0 to M5. The tags, the `render` call, the options, the
events and the token exchange are the same; only the files behind the public entry are different.

### A.5 The work inside i7 (the product's side)

| # | Step | Days | Grade |
|---|---|---|---|
| A1 | The adapter: the mapping of A.3 both for whole views and for frames and streamed messages; the `provenance` kind; the fix table | 4 | deep |
| A2 | `render`, the tags, sign-in, About and the console behaviours rebased on `paint`; the neutral modules deleted | 4 | deep |
| A3 | The parity suite, the embed tests and the console's page tests green; differences fixed in Elements or in the adapter | 4 | standard |
| A4 | The public entry's next major, integrity, the samples; docs | 2 | routine |
| | **Total** | **14** | |

### A.6 Questions for the owner (adoption)

| # | Question | Recommendation |
|---|---|---|
| A1 | Map the product's contract in the browser now (A.3) and have the server write the specification natively in a later release (M6)? | Yes. It keeps i7 a client-side change with the parity suite as its gate; the server change is then small and separately tested. |
| A2 | The renderer's public entry moves to a new major although its API does not change? | Yes: the files behind it change wholesale, and hosts pin by version and integrity. |
| A3 | Does the console's server-side first paint (the template macros kept as the `server` path) retire in the same release? | No; its own decision. The adapter does not touch it. |
| A4 | Should the product's pack authors be offered the `grid` and `chart` kinds (full options) from Sutras once the server writes the specification? | Yes, in the release of M6; it is the first new capability the product gains from the wider specification. |
