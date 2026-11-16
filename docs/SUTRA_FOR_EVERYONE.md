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
# Sutra for everyone: a few lines of Sutra, a terminal-grade live screen

**Status: a design for discussion. Nothing in this document is built, and nothing in it has been run.** Where a statement about a tool
rests on its documentation and not on a measurement, it says so. It builds on [VIEWS_DESIGN.md](VIEWS_DESIGN.md) (drishti-views: the open
ViewModel, the painter) and on the eventing design (drishti-events), and it **replaces section 15 of VIEWS_DESIGN.md**, which looked at
the same idea as a parked research note and reached a narrower answer.

> **Before this branch is pushed:** [Appendix P](#appendix-p-private-the-drishti-product-move-before-any-push) holds details of one
> private product. It must move to that product's repository first. The main body names the product only as "the product".

**The goal.** Someone who has never seen the product writes this, in a file or in the playground:

```yaml
rachana: 1
sutra: fx-quotes
version: 1
data:
  quotes: { topic: "prices.fx.*", key: symbol, snapshot: /api/quotes.json }
title: FX · live quotes
panels:
  - kind: grid
    rows: $.quotes
    columns:
      - { label: Pair,          bind: "@.symbol" }
      - { label: Bid,           bind: "@.bid", fmt: price4, flash: true }
      - { label: Ask,           bind: "@.ask", fmt: price4, flash: true }
      - { label: Spread (pips), bind: "(@.ask - @.bid) * 10000", fmt: amount1, tone: heat }
```

and gets a virtualised grid that ticks sixty times a second with flashing cells, a computed and heat-shaded column, sorting, filtering,
export, both themes and keyboard use, from one tag, with no framework and no build:

```html
<script type="module" src="/elements/drishti-sutra/drishti_sutra.js"></script>
<elements-sutra src="fx-quotes.v1.sutra.yaml" events="wss://example.org/events"></elements-sutra>
```

The earlier design made the *ViewModel* the public thing ("emit this JSON and we paint it"). That stays, as the layer underneath. What
changes is the front door: **people write Sutras; the ViewModel is what a Sutra compiles to.** A ViewModel is data with no logic, which
is right for a painter and wrong for an author: an author wants `(@.ask - @.bid) * 10000`, a filter, a total and a drill, and should not
need a server to get them.

Contents: [1 The language in layers](#1-the-language-in-layers) · [2 Data for people outside](#2-data-for-people-outside) ·
[3 Where the compiler runs](#3-where-the-compiler-runs) · [4 The adoption toolkit](#4-the-adoption-toolkit) ·
[5 Generative UI with Sutra](#5-generative-ui-with-sutra) · [6 Speed](#6-speed) ·
[7 Plan, risks and questions](#7-plan-risks-and-questions) ·
[Appendix P (private)](#appendix-p-private-the-drishti-product-move-before-any-push)

---

## 1. The language in layers

### 1.1 What a Sutra is today

**Rachana** is the grammar; a **Sutra** is one screen written in it: a versioned YAML file whose first key is `rachana: 1`. It holds no
code and no pixels. Its parts:

| Part | What it says |
|---|---|
| identity | `sutra`, `version`, `description`, `notes`, `doc` |
| matching | `match`: which family of records this screen is for, with a condition and a priority |
| header | `title` (a pill, an id, a "with"), `strip` (up to eight headline figures) |
| body | `panels` (twenty-two kinds: tables, ladders, key-value, tabs, twelve charts, pivot, metric, map, graph, timeline …), `layout` (named areas on a 12-column grid, a split, tabs, sections, the phone order) |
| interaction | `controls` (read as `ctl.<id>`), `emits` / `waits` / `children` (a click in one panel fills another), `keys` (function keys), `refresh`, `form` |
| reuse | `use: <fragment>@<version>` with `with:` |
| words and colour | formats (`fmt: amount0`), tones (`tone: sign`), labels |
| expressions | **Rachana-EL**: closed and side-effect free; paths (`$.legs[0].rate`), filters (`[?@.ccy == 'CAD']`), projections (`[*]`), `?:`, arithmetic, `let`, a function catalogue, templates (`"${size($.legs)} legs"`). Total: a missing field is empty, never an error page. Compiled once, with the paths each expression reads reported |

Three properties already make it a good public language: it is **strict** (an unknown key is an error with line and column), it is
**versioned in the file**, and its schema and its parser come from **the same grammar tables**, so an editor never offers what the parser
refuses.

### 1.2 What is portable, and what is bound to the product

| Portable: about a *screen* and *rows* | Bound: about one product's *data platform* |
|---|---|
| identity and prose | matching a screen to a record family (`match`), priorities, the registry and where Sutras are loaded from |
| title, strip, panels and every visual kind, layout | sources that name the product's record families, packs, virtual tables, business dates, computed parameters |
| formats, tones, labels | links to *entities* (`link(id, 'kind')`), the linked-entities panel, the "how this view was built" panel |
| controls, events, children, function keys, refresh | inference from the platform's catalogue and semantic hints |
| fragments (`use:`), given something that resolves a name | masks, row rules and reading "as the viewer"; review and governance before a Sutra goes live |
| the whole expression language over rows, and the general functions (logic, text, number, date, list, aggregate over a list) | functions that need an engine or a model (`measure`, `cell`, look-ups across tables), Explain, mnemonics and command codes, write-back |
| pivot over rows held in the browser | pivot over a model of many tables |

Most of what an author types is on the left. The right-hand column is short, and nearly all of it is one thing:
**where the data comes from and who may see it.**

### 1.3 One grammar, profiles

The rule that outranks the rest: **the grammar is not forked.** There is one Rachana, one definition of it, one parser. What differs
between runtimes is *which parts they implement*, and that has a name: a **profile**.

- **Sutra Core** (profile `core`): the left-hand column of 1.2, plus the `data:` block of section 2. Everything a browser can do alone.
- **Extension profiles**: named sets of extra keys, source types, panel kinds and functions that need a host. The product's is one
  (the right-hand column). A third party may define its own (`x-<name>`).

**One language definition.** A single machine-readable file, `rachana.lang.yaml`, lists every key, where it may appear, its type, its
default, its documentation, the panel kinds and their options, the expression grammar and precedences, every function with its
signature, every format, every problem code with its message and its fix, the size limits; and, for each, **its profile** and the
language version that introduced it (`since`). Everything else is generated from it and checked as stale in the gate:

| Generated | For |
|---|---|
| the JSON Schema, per profile | any YAML editor; the validator |
| the parser's and checker's tables | the one implementation (section 3) |
| the reference pages, the grammar card (4.7), the syntax-highlighting grammar | people, assistants, editors |
| the completion data | the language server and the in-page editor |
| the skeleton of the conformance vectors (every key and function must appear in at least one) | the gate |

**How a runtime treats another profile's key.** It knows the key (the definition lists it), so it never says "unknown key". It says what
the key is and what to do here:

```
orders.v1.sutra.yaml:5:1  RCH-2060  'match' belongs to the profile of a data platform; this runtime is Sutra Core.
  A Core screen reads its data from 'data:'. Example:   data: { orders: /data/orders.csv }
```

A file may state what it needs, `profiles: [core]` (the default) or `profiles: [core, <name>]`, so a tool can tell at a glance where it
runs; the checker verifies the claim.

**Versions.** The file's `rachana: 1` is the language's major version and changes only for an incompatible grammar. Inside a major
version the language grows by additions, each carrying `since: 1.4`. A runtime reports the minor it implements; a Sutra using a newer
key gets "this needs Rachana 1.4; this runtime is 1.2", not a puzzle. Profiles version with the language, not on their own. Nothing is
removed inside a major version; a deprecated key keeps working and the checker suggests its replacement.

### 1.4 What Core adds to the one grammar

Small, and each addition is available to every runtime, the product's included (they are additions to Rachana, not a dialect):

| Addition | Why |
|---|---|
| `data:` (section 2) | a screen that names its own sources |
| `title: "text with ${parts}"` as a shorthand for the mapping | the first line a newcomer writes |
| `flash: true` on a column or figure; `tone: heat` | the two words that make a live table look alive |
| the `grid` kind (the full virtual grid) beside `table` (a document table) | a hundred thousand rows; one sentence in the docs says which to use |
| `version` may be left out and is then `1` | one line fewer in every first Sutra (question Q9) |
| panels may be left out: the screen is then **inferred** from the data's shape (4.2) | three lines give a screen |

What Core does **not** get, deliberately: scripts, loops, style text, HTML, addresses assembled by expressions. A Sutra stays something a
person can read top to bottom, a tool can check completely, and a page can accept from somewhere it does not fully trust.

---

## 2. Data for people outside

### 2.1 `$` is the screen's record, and `data:` names its fields

In the product, `$` is the record the screen was opened on. Core keeps that meaning and lets the Sutra say what the record is made of:
each entry of `data:` becomes a field of `$`.

```yaml
data:
  orders:  /data/orders.csv                                   # $.orders is a list of rows
  summary: { url: /api/summary, as: record }                  # $.summary.booked is a value
  regions: { rows: [ { code: CA, name: Canada }, { code: IN, name: India } ] }
```

Every existing expression then works unchanged: `rows: $.orders`, `sum($.orders, 'amount')`, `$.orders[?@.region == ctl.region]`,
`first($.regions[?@.code == @.region]).name`. Nothing new to learn, and one place where a screen's inputs are listed.

### 2.2 The source types

A source written as text is an address, typed by its extension. Written as a mapping it is exactly one of:

| Type | Written | Meaning |
|---|---|---|
| **inline** | `{ rows: [...] }` or `{ record: {...} }` | data in the file; the form of every template and tutorial |
| **file or address** | `{ url, format?: json \| csv \| ndjson \| arrow, path?: "$.items" }` | read once (or on `refresh:`); `path` picks the rows out of a wrapped answer; Arrow is read in batches off the main thread |
| **pages** | `{ pages: url, size, mode: offset \| cursor }` | plain REST pages, read as the grid scrolls |
| **server** | `{ server: url }` | the server-side row model: the grid sends sort, filter, groups and pivot, the server answers. For a hundred million rows, and for figures that must not be summed in a browser |
| **topic** | `{ topic: "prices.fx.*", key: symbol, snapshot?: <another source>, window?: 5000 }` | live rows from drishti-events: each message upserts the row with that `key` (or appends, with `window`); `snapshot` fills the table first and the stream resumes from its position |
| **function** | `{ fn: loadOrders, args?: {...} }` | a function the page registered by name (`Sutra.sources.register('loadOrders', fn)`), returning rows, a promise, an Arrow table or an async iterator of changes. The escape hatch that keeps the language closed |
| **reference** | `{ ref: sales.orders, where?, limit? }` | a *name* the host resolves. **This is how one Sutra runs in two places** (2.5) |

Common keys on any of them: `key` (row identity: needed for live updates, selection and drills), `fields` (types, labels and formats when
inference is not enough), `refresh` (seconds), `as: rows | record`, `where` (2.3), `mode` (2.4).

The address rules are the painter's (VIEWS_DESIGN section 7.2): the page's origin and an allow-list, never an address built by an
expression, credentials only through the page's own `fetch` option. An extension profile adds source types of its own.

### 2.3 Parameters: controls feed sources

A source may read controls, and only controls, in a small set of places: `where:`, `args:`, and query parameters given as a mapping
(`params: { region: ctl.region }`, never spliced into the address text). When a control changes, the sources that read it are fetched
again and only the panels that depend on them repaint. A control's value can be preset from the page (`<elements-sutra ctl-region="CA">`)
or the address, so "a screen with a parameter" needs no new concept.

### 2.4 Where work happens: in the browser when cheap, on a server when big

The author does not choose a technology; the compiler plans, and says what it planned.

| Work | Up to | Done by |
|---|---|---|
| expressions per row (a computed column, a tone, a filter) | 50,000 rows on the main thread; 2,000,000 in the worker | the browser |
| sort, filter, group, pivot, totals | the same thresholds, on Arrow columns in drishti-data's worker | the browser |
| anything over a `server` source | any size | the server, through the server-side row model that already exists as a contract |
| anything over a `pages` source | sort and filter on the server when the source says so; no grouping | the server or the pages read |

`mode: client | server | auto` on a source overrides (`auto` is the default). The rule is honest in both directions:

- A panel that would need more rows in the browser than the threshold is **not silently truncated**: it shows "this needs a server
  source: 3,200,000 rows" and the checker says the same at author time when the row count is known.
- When work is pushed to a server, the row conditions travel as the **shared filter model** and, for conditions written in the expression
  language, as the expression's **syntax tree in JSON** (a specified, versioned form, limited to a *push-down subset*: comparisons,
  `&&`, `||`, `!`, `in`, arithmetic, and the functions marked `pushdown` in the definition). An expression outside the subset over a
  server source is an author-time error that names the function. No server ever receives expression text to interpret loosely.
- Totals of a server source are the server's. A Sutra never sums in the browser what the server did not send in full.

### 2.5 The same Sutra on a host that owns the data

A portable Sutra names its data by reference and leaves the "where" to whoever runs it:

```yaml
data:
  orders: { ref: sales.orders, where: "@.status == 'OPEN'" }
```

| Where it runs | How `sales.orders` resolves |
|---|---|
| a static page | a sources file beside the Sutra (`sources.yaml`: `sales.orders: /data/orders.arrow`) or `Sutra.sources.register('sales.orders', …)` |
| a team's own server | the same file, pointing at its endpoints or topics |
| a data platform (the product) | its own catalogue: the name is one of its tables or record families, read **as the viewer**, with its row rules and masks applied where the data lives (Appendix P.2) |

The screen half of the file is byte-identical in all three. That is the property to protect: a screen prototyped in the playground on a
CSV file is promoted to a governed, access-controlled screen by changing where one name points, not by rewriting it. The reverse holds
too: a Sutra of the product that uses only Core keys and references can be exported with a sample of its data and opened anywhere.

### 2.6 Live data, precisely

A `topic` source is a keyed table that messages change. The compiler knows, from the paths each expression reads, which cells depend on
which fields; a message that changes `bid` of one row re-evaluates only that row's cells that read `bid`, and emits the painter's ordinary
patches. Aggregates over a live source (`sum($.quotes, 'size')` in the strip) are maintained incrementally where the function is marked
`incremental` (sum, count, min, max, average) and recomputed at most once per animation frame otherwise. Conflation, resume, gaps and
back-pressure are drishti-events' and are not re-invented here. `flash: true` asks the painter for its tick mark; nothing else is needed.

---

## 3. Where the compiler runs

Section 15 of VIEWS_DESIGN.md asked "could one JavaScript compiler also run inside a Java server?" and stopped at a proof plan. With the
goal now being adoption of the language itself, the question is wider: **the same Sutra must mean exactly the same thing in a browser, in
Node and in the product's server, it must be fast in each, and there must be one implementation.**

### 3.1 What actually has to be shared

It helps to see the sizes. In the product's implementation today (figures in Appendix P.1), *parsing expressions* is about a twentieth of
the language; the bulk is **semantics**: evaluation rules (the null rule, text-or-number comparison, dates), a large function catalogue,
formats, the checker, the model, and the binding of a compiled Sutra to data. Any answer that shares only a parser shares the easy part.

And the two sides have opposite needs: the browser must evaluate expressions **on every tick** at interface speed; the server evaluates
them over large data inside its engines, as the viewer, at JVM speed. Neither can afford a slow bridge on that path.

### 3.2 The options

| | Option | One implementation? | Speed | Portability | Effort and risk |
|---|---|---|---|---|---|
| **a** | One JavaScript implementation; the server runs it through GraalJS | yes | browser: best. **Server: poor.** On a stock JDK the script is interpreted (many times slower than Node, per the engine's documentation); the earlier mitigation ("bind without JavaScript") does not survive this design, because binding *is* expression evaluation, and the server's engines evaluate the same expressions over millions of rows | jars only, so Windows offline is fine; a script engine inside a bank's server is a security conversation with every customer | **highest**: the proven Java implementation, with every screen and figure that depends on it, is rewritten in JavaScript and re-proven; the risk lands on the part that works today |
| **b** | The Java compiler stays; a second, hand-written JavaScript compiler for Core; shared vectors | **no**: two evaluators, two function libraries, two checkers, for ever | best on both sides | best | moderate to build, **permanent to keep**: every change to the language is made twice; vectors catch drift only where someone wrote a vector. This is the dual machinery the owner's rule forbids |
| **c** | One grammar file; parsers generated for both languages | only for parsing (about 5% of the language) | fine | fine | low, and it does not answer the question: semantics stay dual. *Its good part, one language definition, is kept (1.3)* |
| **d** | One implementation compiled to WebAssembly, run in the browser, Node and (through a WebAssembly runtime) the JVM | yes | every row and every string crosses a memory boundary on both sides; in a JVM the module is interpreted or translated by a pure-Java runtime. Slower than native on *both* sides | browsers generally refuse to fetch a `.wasm` file from `file://`, which Elements supports, so it would have to be embedded as text; needs a new source language and a native toolchain | high: a third language in the stack |
| **e** | **The existing Java implementation stays the one implementation, and is cross-compiled to JavaScript** for the browser and Node (a Java-to-JavaScript compiler such as TeaVM, a build-time tool) | **yes**, and it is the one that already exists and is already proven | **server: unchanged, native.** Browser: compiled JavaScript, not interpreted; expected within a small factor of hand-written code, **to be measured** | the output is plain JavaScript modules: browser, Node, `file://`, strict Content-Security-Policy; the build tool is pure Java, so it runs on Windows with a JDK and no executable | moderate: the language core must first be made dependency-light (no framework, no reflection-based libraries); the unknowns are size, numeric and date formatting parity, and data hand-over, all measurable in a week |

Option **e** was not on the original list; it came out of looking at **a** honestly. **a** and **e** are the same idea, one source for two
runtimes, pointed in opposite directions. **a** moves the proven code and puts the slow path inside the server. **e** moves nothing that
works, leaves the server exactly as fast and as reviewable as it is, and puts all the risk on the side that does not exist yet.

### 3.3 Recommendation

**Option e, with the language definition of option c, and option b's vectors as the gate.**

1. **`rachana-core`**: the language as a plain Java library with no host: the definition file and what is generated from it, the YAML
   reader with positions, the model, the expression language and the Core functions, formats, the checker and its teaching messages, the
   editing operations a designer uses, and the binder from (compiled Sutra, data) to (ViewModel, patches). No framework, no reflection, a
   handful of JDK packages. The product's server depends on it and adds its profile on top.
2. **The same source is cross-compiled** to two JavaScript bundles: the **runtime** (parse a plan, evaluate, bind, patch) and the **tools**
   (full parse with positions, checker, messages, completion, editing operations), the second loaded only by editors and the playground.
3. **A thin, hand-written JavaScript facade** in `drishti-sutra` (a new library over drishti-views): source loading, the worker, the hand-over of
   rows, `<elements-sutra>`. It contains no language semantics; a guard test fails if it grows a parser or an operator.
4. **Conformance vectors** (Sutra + data → ViewModel; expression + record → value and text; bad Sutra → code, position, message) run in
   the JVM, in Node and in a browser on every change, and the results must be **byte-identical**. With one source they should pass by
   construction; they exist to catch the cross-compiler's class library differing from the JDK (numbers to text, dates, sorting).

**Where the source lives** is a decision with licensing consequences (4.9, Q4): the recommendation is a small repository of its own,
`rachana`, holding the specification, the definition, the vectors, `rachana-core` and the build that produces the JavaScript bundles.
The product takes the jar; Elements vendors the bundles with their hash. Neither repository then contains the other's code.

### 3.4 The proof, before anything is committed to

A throwaway project. Take the existing expression language, checker and formats as they are, cut the dependencies by hand, cross-compile.

| # | Measure | Passes when |
|---|---|---|
| T1 | **It compiles**: which JDK classes and language features the core uses that the cross-compiler lacks, and what each costs to replace | every gap has a replacement inside the core; none needs a second code path |
| T2 | **Size**, minified and compressed, runtime and tools separately, after dead-code removal | runtime ≤ 150 KB, tools ≤ 350 KB compressed (thresholds for the owner to confirm before measuring) |
| T3 | **Start**: module evaluation to first compiled Sutra | ≤ 30 ms on the reference laptop |
| T4 | **Evaluation speed** against a small hand-written JavaScript evaluator of the same twenty expressions (the honest comparator for option b) | within 3× per evaluation, **and** the end-to-end budget of section 6 (S5) met |
| T5 | **Data hand-over**: rows as JavaScript objects and as Arrow columns into the evaluator, without copying whole tables per tick | a tick touches only the rows it changed; no allocation proportional to the table |
| T6 | **Same output**: the vectors through the JVM, Node and two browsers, with numbers, dates, rounding, sorting and regular expressions deliberately stressed | byte-identical; any difference is fixed in the core (its own formatting, no reliance on platform text), not tolerated |
| T7 | **Strict pages**: the bundle under a strict Content-Security-Policy and Trusted Types, from `file://`, in a worker | no `eval`, no dynamic code, loads everywhere Elements does |
| T8 | **Debuggability**: a failing expression in the browser | the error a person sees is the language's own teaching message with line and column, never a generated stack trace |
| T9 | **Build**: the cross-compile on Windows and Linux with only a JDK; reproducible output | same bytes from the same source |
| T10 | **The tool itself**: licence of the compiler and of the class-library code it emits into the bundle; how actively it is maintained; a second tool that could take the same source | compatible notices; a named alternative exists |

**If the proof fails** on speed or size by a wide margin, the fallback is a deliberate, stated exception and not a drift: the definition
file generates everything it can for both languages, and a hand-written JavaScript evaluator covers **Core only** (an estimated eighty functions,
not the whole catalogue), held by the vectors. That is option b made as small as it can be, and it would need the owner's explicit acceptance
of two evaluators. It should not be chosen to save the week the proof costs.

**What is unverified here:** that the cross-compiler handles this code base's use of the JDK; every number in T2 to T4. These come from
the tools' documentation and from general experience of such compilers, not from a run. The proof is step one for that reason.

---

## 4. The adoption toolkit

A language is adopted when the first five minutes produce something a person wants to show someone. Everything below serves that, in the
order a newcomer meets it.

### 4.1 The newcomer's path ("the wow path")

| Minute | They do | They see |
|---|---|---|
| 0 | open the playground from the docs' front page | a live FX blotter ticking, its Sutra (fourteen lines) beside it |
| 1 | change `fmt: price4` to `price2`, add a column `{ label: Mid, bind: "(@.bid + @.ask) / 2" }` | the screen changes as they type; a typo gets a message that says what to write |
| 3 | pick **Risk heatmap** and **World map** from the templates | two more screens, each about ten lines |
| 5 | drop their own CSV file on the page | a screen **inferred** from it (4.2): a grid with typed columns, headline figures, a chart; the three-line Sutra that made it |
| 8 | add a `pivot` panel by completion, pick fields from the list the editor offers | a pivot with totals and drill over their data |
| 10 | press **Share** | a link that reopens exactly this (4.3); **Copy as page** gives a single HTML file |
| 15 | paste the tag into their own application, point `data:` at their endpoint | their data, live, in their page |

### 4.2 Three lines give a screen: light inference

```yaml
rachana: 1
sutra: orders
data: { orders: /data/orders.csv }
```

With no `panels:`, Core infers a screen from the data's shape: a grid with typed, labelled and formatted columns (amounts, dates,
percentages, codes recognised by name and by value), up to four headline figures (row count, sums of the money-like columns), and one
chart when the shape suggests it (a date and a number: a line; a category and a number: bars). The playground shows the **full Sutra
inference wrote** with one click ("write it out"), which is how people learn the grammar: by editing a real screen. Inference is the
portable subset of the rules the product already uses; it reads only the data, never a catalogue.

### 4.3 The playground

One page of the gallery, working from `file://`, with no server:

- **Three panes**: the Sutra (the code editor with completion, hover help and problems as you type), the live screen, and a **Data** tab
  (sample rows per source, the inferred shape, the fields offered to completion; drop a file to add a source).
- **Share**: the Sutra and small inline data are compressed into the link's fragment, which never reaches a server; larger data stays
  referenced by address. A link states the language version it was made with.
- **Outputs**: copy as a tag, download as one self-contained HTML page, download the Sutra, download the compiled plan (6.1).
- **Speed bar**: compile time, first paint, frame time, shown always. Fast is part of the pitch, so it is on the glass.
- **Mock stream**: every template's live data comes from drishti-events' in-page mock, so ticking screens work offline.
- **Describe** (later, section 5): a box that turns words into a Sutra. The page is designed with the space for it.

### 4.4 The templates: ten impressive screens, about ten lines each

Each is a real Sutra with made-up data, a frame-time budget in the gate, and a one-paragraph "what to notice".

| # | Template | Shows |
|---|---|---|
| 1 | Trading blotter | a `topic` source, flashing ticks, a computed column, heat, 100,000 rows virtualised |
| 2 | Risk heatmap | `pivot` with `heat`, totals, a click that fills a detail panel |
| 3 | Pivot with drill | rows by three levels, across by one, expand, drill to the rows behind a cell |
| 4 | World map drill | `map` shaded by a value, a click on a country shows its regions and a table |
| 5 | KPI board | `metric` tiles with change and tone, a `strip`, sparklines, a 12-column layout |
| 6 | Live chart | a windowed `line` over a topic, a control choosing the series, a marker |
| 7 | Order book ladder | `ladder` with the best level lit, bid and ask depth bars |
| 8 | Master and detail | a table, `children` beside it, tabs, a control filtering both |
| 9 | Timeline and network | `timeline` of events and a `graph` of who is connected to whom |
| 10 | A million rows | Arrow from an address, sort, filter and pivot off the main thread |

Three more follow when forms exist: a ticket entry form, a what-if slider board, an approvals queue.

### 4.5 Editor support: one language service, three hosts

The checker, completion and hover are functions of the **tools bundle** (3.3), the same code the server uses:

`check(text) → problems` · `complete(text, position, shape?) → items` · `hover(text, position) → help` · `fixes(problem) → edits` ·
`format(text) → text` · `outline(text) → tree`

| Host | How |
|---|---|
| the Elements code editor (playground, any page) | calls the functions directly, in a worker; no protocol |
| VS Code | a small extension: the generated highlighting grammar, plus a language server that is the tools bundle behind the standard protocol, run by the editor's own Node. No native binary |
| IntelliJ family | the same language server through the platform's language-server support; highlighting from the same generated grammar |
| any YAML editor, today | the generated JSON Schema, by a `# yaml-language-server: $schema=…` comment: keys and enums complete with no tool of ours installed; expressions are checked only by ours |

Completion is aware of *data*: after `$.` and `@.` it offers the fields of the sources' sample rows; after `fmt:` the formats with a
sample of the current column formatted; after `kind:` the kinds with a thumbnail.

### 4.6 Errors that teach

The existing messages already have the right voice (`'**' is not Rachana: write power(x, y)`). The standard, enforced by a test over the
whole message catalogue in the definition file:

1. **Where**: file, line, column, the offending text underlined.
2. **What**, in the author's words, never the parser's ("two values with no operator between them", not "unexpected token").
3. **What to write instead**, as text that can be pasted.
4. **Did you mean**: the nearest key, function, format, kind or **field of the actual data**.
5. **A machine-readable fix** (an edit), so the editor offers a quick fix and the generative loop of section 5 can repair without a guess.
6. A stable **code** and a link to its paragraph in the reference.

A problem in one panel never takes the screen down: the panel shows its problem, the rest paints. Codes use a neutral prefix (`RCH-`); a
host may show its own prefix over the same numbers (Q8).

### 4.7 The grammar card, for assistants and for people

One generated page, small enough to paste into any assistant's context or pin beside a monitor: the top-level keys, the panel kinds with
their required options, the expression operators and the thirty most used functions, the formats and tones, the six source types, eight
short examples, and the ten mistakes most often made with their corrections. A compact form (target: under 2,500 words) and a full form
(every key and function). Both are generated from the definition file, so they are never out of date, and the wording names no vendor and
no tool. The same card is the grounding of section 5.

### 4.8 Tutorial, docs site, starters

- **The 15-minute tutorial** is the path of 4.1 written down, every step with the screen it produces, runnable from the release tree
  offline. Its Sutras are parsed and painted by the test suite, so the tutorial cannot rot.
- **The docs site** (the existing one, a new top-level section): *Start* (the tutorial), *Templates*, *Language* (generated reference:
  keys, kinds, functions, formats, problems), *Data* (section 2 as a guide with a server example per source type), *Embed*, *Speed*,
  *Specification*. Every example on the site has **Open in playground**.
- **Starter repositories**, each one screen with live data, under fifty lines of host code, and a `README` that ends in a ticking page:
  static HTML (no server), Node, Express, Flask, Spring. Each shows the same Sutra, to make the point that the screen does not care.
  They are thin by design: a route that serves rows, a route that streams, the tag.

### 4.9 Compatibility, and the licence of the specification

**Compatibility promise.** A Sutra valid under `rachana: 1` at any minor stays valid and means the same for every later minor. The
vectors of each release are kept and run against every later one. The specification is declared `1.0` only after the product's own
screens and the templates have run on it unchanged for a release; until then it is `0.9` and says so.

**Licensing** is the owner's decision; the options, with what each buys (not legal advice):

| | Specification, definition file, schema, vectors, grammar card | The runtime (bundles, `drishti-sutra`) | Buys | Costs |
|---|---|---|---|---|
| L1 | proprietary | proprietary | full control | nobody builds on a language they may not describe; assistants and editors cannot ship its grammar |
| L2 | **open** (text under a documentation licence, schema and vectors under a permissive one) | proprietary, free to use under the Elements licence | the language can be taught, quoted, highlighted and generated by anyone; the value stays in the runtime and in Elements | an independent implementation becomes possible (the vectors keep it honest; the names stay the owner's marks) |
| L3 | open | source-available (read, not redistribute) | trust for security reviewers | little over L2 |
| L4 | open | open | widest adoption | gives away the engine; hard to reverse |

**Recommended: L2**, with a short policy on the names *Rachana* and *Sutra* (anyone may say they implement the specification if they pass
the vectors). It can move to L4 later; the reverse is not possible. Whatever is chosen, the generated bundles carry the notices of the
cross-compiler's class library, under the vendored-licence guard this repository already has.

---

## 5. Generative UI with Sutra

**The end goal: a person asks in words, a model writes a Sutra, the host supplies the data, and the screen is built at run time.** This
section designs it for a later release; none of it is in the first build, and all of it rests on Sutra Core being in place.

### 5.1 Why a Sutra is the right thing for a model to write

Asking a model for HTML and JavaScript gives a program: it must be executed to be seen, sandboxed to be safe, and read line by line to be
trusted. A Sutra is a declaration.

| Property | Sutra | Generated HTML and JavaScript |
|---|---|---|
| **Small target** | one grammar card; a closed set of keys, kinds and functions | an open language and every library ever written |
| **Nothing executes** | no script, no style text, no address built by an expression; the worst a bad Sutra can do is show the wrong panel | arbitrary code in the reader's session |
| **Checked completely before it runs** | strict parser and checker: every key, every expression, every field against the catalogue | only by running it |
| **Cheap to repair** | a problem has a code, a position and a machine-readable fix; most repairs need no second call to the model | a stack trace and a guess |
| **Short** | twenty lines for a screen, so it is fast and cheap to produce and to stream | hundreds of lines |
| **Consistent** | every generated screen looks and behaves like every other screen: same grid, same keys, same themes, accessible | every answer a new design |
| **Diffable and reviewable** | a refinement is a small diff a person can read and approve | a rewrite |
| **Cacheable** | the same intent over the same catalogue gives the same file | no |
| **Data never passes through the model** | the model sees names and types; the rows go from the server to the screen | usually embedded in the answer |

The last row matters most in a bank: the model is given the *catalogue* (names, types, descriptions), never the data, and the data it
asks for is fetched afterwards under the reader's own access rights.

### 5.2 The loop

```
 words ──► ground ──► generate (streamed) ──► check ──► repair ──► compile ──► bind data ──► paint
            │              │                    │          │                      │            │
   card + schema +   a Sutra, panel by    strict parse,  fixes applied      the host's       panels appear
   examples + the    panel               field allow-   mechanically;      sources, as      as they arrive
   reader's catalogue                    list, limits   else one more call  the reader
```

1. **Ground.** The request to the model holds: the compact grammar card (4.7); a handful of templates chosen by similarity to the intent
   (few-shot); and the **data catalogue the reader may use**: source names, fields, types, short descriptions, sample *shapes* without
   values, and row-count classes (so the model picks `grid` or `server` sensibly). The catalogue is produced by the host and is already
   filtered to the reader.
2. **Generate.** The model writes a Sutra whose `data:` uses only `ref:` sources from the catalogue. The answer is streamed.
3. **Check.** The tools bundle checks the text as it grows. A Sutra is line-oriented and its panels are list items, so **a prefix that
   ends at a panel boundary is itself a valid Sutra**: each finished panel can be compiled and painted while the next is still being
   written. This property is added to the language's rules and tested.
4. **Repair.** Problems with a mechanical fix (a misspelt field with one near match, a format that does not exist with an obvious
   neighbour, a missing required option with a default) are fixed without the model. Others go back once, as the teaching message and
   the three lines around it. At most two rounds; after that the reader gets the panels that are valid, a plain statement of what could
   not be built, and the inferred screen (4.2) for the same data as a floor. **The reader never sees a broken screen.**
5. **Compile, bind, paint.** Exactly the path of every hand-written Sutra. Panels arrive in the `pending` state and fill as their data
   does; the painter's stream handles a view that arrives in pieces already.

### 5.3 Guardrails: the model is never trusted

| Guardrail | How |
|---|---|
| **Access is enforced where the data lives** | every `ref:` is resolved by the host as the reader, with its row rules and masks. A Sutra can only *ask*; a name the reader may not read answers `denied`, whoever wrote the Sutra. Nothing about security depends on what the model was told or wrote |
| **Field allow-list** | the checker runs in *catalogue mode*: a source or field not in the reader's catalogue is an error, not an empty cell |
| **No free addresses** | generated Sutras are checked under a profile restriction: only `ref:` and inline sources; `url`, `fn`, links to other origins and actions that write are refused |
| **Bounds** | panels per screen, expression size (already bounded), rows per source by class, sources per screen, total output size, time to first panel and to the whole screen; over a bound, the loop stops and says so |
| **Prompt injection through data** | descriptions in the catalogue are text from the host, not from rows; row values never enter the request. Text the reader typed is the only untrusted input and can only produce a Sutra, which is then checked like any other |
| **Marked as generated** | the screen says it was generated, from which words, when, and by which configured model; saved Sutras keep that in `doc:` |
| **Kept for audit** | intent, catalogue hash, the Sutra produced, the repairs made, who asked; no row data |

### 5.4 Provider-neutral, and nothing of it inside the language

- The language and the runtime know nothing about models. **Elements contains no provider's name, address, key or SDK.**
- What Elements offers (a small module beside the playground, later): `ground(intent, catalogue) → request parts`, the streaming checker,
  the repair step, and the progressive paint. The call to a model is **one function the host supplies**,
  `generate(parts, { signal }) → an async stream of text`. A host wires it to whatever it runs, on its own server, with its own keys.
- A host with no model configured simply has no "Describe" box. Absence turns the feature off and nothing else.
- The same loop runs on a server (Node, or the product's own) for hosts that do not want the catalogue in the browser.

### 5.5 What the reader experiences

Ask in words ("open orders by region and desk, biggest first, with a map"). Within a second the frame of the screen appears; panels fill
in one by one. Beside it, collapsed, is the Sutra. From there:

- **keep talking** ("make the map Canada only", "add yesterday's change") and get a small diff applied, with undo;
- **edit the Sutra** directly, with the same completion and messages as any author;
- **save it** as a normal Sutra: from then on it is a file like any other, versioned, reviewed where the host requires review, with no
  model in its path. A generated screen that people use becomes an ordinary, fast, cached one.

### 5.6 Evaluation: how we know it works

A fixed test set, kept in the repository and grown from real use, of **intents over known catalogues with expected screens**: not expected
text, but properties (uses these sources; has a pivot by region; the total equals this number on the sample data; no more than six
panels). Measured on every change to the card, the examples, the loop or the model configuration:

| Measure | First target |
|---|---|
| valid at first attempt (no repair at all) | ≥ 85% |
| valid after mechanical repair only | ≥ 95% |
| valid after at most one more call | ≥ 99% |
| meets the expected properties | ≥ 80%, reported by category of intent |
| refused correctly (asks for data outside the catalogue) | 100% |
| time to first panel; to the whole screen | reported per configured model; the loop's own overhead ≤ 50 ms |
| size of the request's fixed part (card and examples) | reported; kept small on purpose |

The targets are starting points to be confirmed against a first measurement; the percentages above are aims, not results.

---

## 6. Speed

The rule of VIEWS_DESIGN section 12.3 holds without exception: nothing here may make a screen paint, or a tick reach the glass, slower.
A Sutra is allowed to cost time **once**, when it is compiled. After that a Sutra screen *is* a ViewModel with a binder, and runs on the
painter's own budgets (P1 to P12).

### 6.1 How

| Rule | Mechanism |
|---|---|
| **Compile once** | text → checked model → *plan* (the ViewModel template with its datasets declared, bound cells, and the compiled expressions with the fields each reads). Cached in the page by the text's hash |
| **Or compile never, in production** | `sutra build` (Node) writes the plan as JSON beside the Sutra; a page given a plan loads only the runtime bundle and skips YAML, checking and the tools entirely |
| **No parsing per tick** | expressions are closures built at compile time; a test counts parser and compiler entries after first paint and requires zero |
| **Touch only what changed** | from the paths each expression reads: a message changing one field of one row re-evaluates only the cells that read it, and emits one patch |
| **Conflate before computing** | drishti-events delivers the latest value per key per frame; a row that changed forty times in a frame is evaluated once |
| **Aggregates incrementally** | sum, count, min, max and average over a live source are maintained by difference; others at most once per frame |
| **Big data off the main thread** | computed columns, filters, groups and pivots over more than the threshold run in drishti-data's worker on columns; the main thread receives only the rows in view |
| **Virtual everything** | a `grid` never materialises rows; the binder computes a row's cells when the grid asks for the row, and caches by row version |
| **Load only what the screen uses** | the runtime first; grid, chart and map engines by the kinds in the plan, as the painter already does |
| **Formats once** | a format is resolved to a formatter at compile time; the per-cell cost is one call |

### 6.2 Targets, added to the gate

Chromium on the reference laptop; "(t)" at 4× CPU throttling. Each is a test with a budget in `tests/views_budget.json`.

| # | What | Target |
|---|---|---|
| S1 | runtime bundle fetched, evaluated, ready | ≤ 30 ms after bytes arrive; ≤ 150 KB compressed |
| S2 | compile a 30-line Sutra (text to plan) | ≤ 10 ms warm, ≤ 40 ms the first time; a 300-line Sutra ≤ 50 ms |
| S3 | load a prebuilt plan | ≤ 3 ms |
| S4 | parser and compiler entries after first paint | 0 |
| S5 | **The Sutra tax**: the blotter template (100,000 rows, 10,000 updates a second, two computed columns, flashes) against the same screen hand-written with the ViewModel builder | worst frame and patch-to-pixel p99 within **10%** of hand-written, and inside P3 and P4 in absolute terms |
| S6 | computed cells | ≥ 2,000,000 simple evaluations a second on the main thread (a 10,000-row table with five computed columns in ≤ 25 ms) |
| S7 | browser pivot, 1,000,000 rows by three levels, in the worker | first rows ≤ 500 ms; no main-thread task over 16 ms |
| S8 | a control changes a filter over 100,000 rows | repainted in the next frame but one (≤ 50 ms) |
| S9 | checker on a keystroke in the editor (300-line Sutra), in a worker | problems ≤ 30 ms after the pause; typing never blocked |
| S10 | first paint of each template from navigation, libraries cached | ≤ 300 ms |
| S11 | a wall of 50 Sutra screens | the painter's P10, unchanged |

S5 is the one that answers the owner's requirement in a number: **writing a Sutra instead of code costs at most a tenth, and never a
frame.** If the proof of section 3.4 cannot meet it, that decides the compiler question.

---

## 7. Plan, risks and questions

### 7.1 What goes where

| Release | Theme | What of this design |
|---|---|---|
| the release before | eventing and modules | nothing; the **proof** of section 3.4 can run beside it as a throwaway, so its answer exists when the next release is planned |
| **the Views release** | drishti-views (VIEWS_DESIGN) **plus Sutra Core as a preview (0.9)** | the language definition and profiles; `rachana-core` and its bundles; `data:` with inline, address, function, reference and topic sources; the live binder; `<elements-sutra>`; light inference; teaching errors; the playground; the ten templates; the grammar card; the tutorial; the speed gate |
| the one after | Sutra tools and reach | the language server and the two editor integrations; push-down and the `server`/`pages` sources end to end; the docs site section; the five starters; the product running portable Sutras by reference; forms; the specification declared 1.0 |
| **the future AI release** | **Generative UI** (section 5) | the grounding, the streaming checker and repair, the evaluation set, "Describe" in the playground and in the product; built on Core, on the tools bundle and on the catalogue |

Two changes to the Views plan follow. Its helpers that write ViewModels from Python and Java (its steps 15 and 16, seven days) lose their
urgency, since a Sutra is now the way to author from any language and needs no helper; they move to "when asked for". And its playground
(step 17) becomes the Sutra playground, with the ViewModel as a tab of it.

### 7.2 Steps

Grades: **deep** (language, state, ordering, speed), **standard** (well-specified features), **routine** (mechanical). Builder-days.

**In the Views release (Sutra Core 0.9):**

| # | Step | Days | Grade | After |
|---|---|---|---|---|
| 0 | The proof of section 3.4 (throwaway), with the thresholds agreed first; a written result | 4 | deep | |
| 1 | The language definition file with profiles and `since`; the generators (schema per profile, tables, reference, card, highlighting grammar); the stale check | 5 | deep | 0 |
| 2 | `rachana-core`: the language lifted out as a dependency-light library; its own positional YAML reader; the Core binder; the product's server rebased on it with its own tests unchanged (Appendix P.3) | 9 | deep | 0 |
| 3 | The conformance vectors: Sutras, expressions, formats, problems; the three runners (JVM, Node, browser); byte-identity in the gate | 4 | standard | 1 |
| 4 | The cross-compile: runtime and tools bundles, the JavaScript facade's types, size budgets, notices, reproducible build, vendoring into Elements by hash | 5 | deep | 2 |
| 5 | `data:`: `$` as the screen's record; inline, address (JSON, CSV, NDJSON, Arrow), function and reference sources; the sources file; controls feeding sources; the planner's thresholds and honest refusals | 6 | deep | 2 |
| 6 | The live binder: topic sources over drishti-events, changed-cells-only, incremental aggregates, `flash`, the worker path | 6 | deep | 4, 5 |
| 7 | `drishti-sutra`: the facade, `<elements-sutra>`, `Sutra.mount`, the plan cache, `sutra build`; the no-semantics guard | 3 | standard | 4 |
| 8 | Light inference for Core, and "write it out" | 4 | standard | 5 |
| 9 | Teaching errors: the catalogue brought to the six-point standard, did-you-mean over keys, functions and data fields, machine-readable fixes, the catalogue test | 3 | standard | 1 |
| 10 | The playground: three panes, data tab and file drop, share links, outputs, the speed bar | 5 | standard | 7, 9 |
| 11 | The ten templates with made-up data and mock streams, browser tests, frame budgets | 5 | standard | 6, 10 |
| 12 | Speed: S1 to S11 as tests, the Sutra-tax benchmark page, fixes | 4 | deep | 6 |
| 13 | The grammar card (compact and full), the 15-minute tutorial with tested steps, the generated reference, the guard's word list updated for the two language names | 3 | routine | 11 |
| | **Total** | **66** | | |

With three builders, after step 0: {1, 2}, then {3, 4, 5}, then {6, 7, 9}, then {8, 10, 12}, then {11, 13}: about 24 working days, most of
it in parallel with the Views plan's own steps (the painter is needed from step 6 on). The **smallest release that still has the wow** is
steps 0 to 7, 10 and 11 with five templates: about 50 days.

**The release after (estimates, to be refined once 0.9 exists):**

| Step | Days | Grade |
|---|---|---|
| The language server over the tools bundle; the VS Code extension; the IntelliJ integration; their tests | 8 | standard |
| Push-down: the expression tree in JSON, the push-down subset, `server` and `pages` sources end to end, a reference server in two of the starters | 8 | deep |
| The product runs portable Sutras: references resolved to its catalogue as the viewer; export of a Sutra with sample data (Appendix P.2) | 6 | deep |
| Forms in Core (display, validation, submit as an action event) and the three form templates | 6 | standard |
| The five starters; the docs site section with "Open in playground" everywhere | 8 | routine |
| The specification to 1.0: review, the compatibility run over every kept vector, the licence texts as decided | 3 | standard |
| **Total** | **39** | |

**The future AI release (Generative UI):**

| Step | Days | Grade |
|---|---|---|
| The catalogue format and catalogue mode of the checker; the generated-Sutra profile restriction | 4 | deep |
| Prefix-valid Sutras: the rule, the incremental checker, progressive compile and paint | 5 | deep |
| The grounding builder and the example selector; the mechanical repair step and the repair round | 5 | standard |
| The evaluation set (about 150 intents over four catalogues), its runner and report | 6 | standard |
| "Describe" in the playground: ask, watch, refine by talking, diff, undo, save | 5 | standard |
| The product's side: the catalogue as the viewer, the model call behind its own layer, audit, the screen in its console (Appendix P.4) | 8 | deep |
| **Total** | **33** | |

### 7.3 Risks

| Risk | Why it matters | What limits it |
|---|---|---|
| The cross-compile fails on size, speed or a missing piece of the JDK | the one-implementation answer depends on it | the proof comes first and costs four days; thresholds agreed before it runs; a named, explicit fallback (3.4) |
| Numbers, dates or sort order differ between the JVM and the browser | the same Sutra would show different figures in two places: the worst possible defect for this product | the core does its own number-to-text, rounding and comparison and relies on no platform text; byte-identical vectors in the gate; the vectors stress exactly these |
| Extracting the language core disturbs the product's server | it is the most used code in the product | the extraction changes packaging, not behaviour; the product's whole existing test suite is the gate; done first, alone, before anything is built on it |
| The public language freezes too early | a published grammar is costly to change | 0.9 until proven on the product's screens and the templates; additions only inside a major version |
| Core grows towards a programming language ("just one loop") | the language's safety and its fitness for generation both rest on it being closed | the function source and registered kinds are the only escape hatches; held as a rule, with the reason written in the specification |
| Two places to compute (browser and server) give two answers | totals that disagree | one implementation of the functions; server totals are never recomputed in the browser; the planner says where each panel is computed |
| The playground's share links leak data | people paste real data | the link holds the fragment only and says so; a warning above a size; inline data is never sent anywhere by the page |
| The build tool is maintained by few people | a dependency of the release train | it is a build-time tool, pinned and vendored; T10 names an alternative that takes the same source; the worst case is the fallback of 3.4, not a rewrite of the language |
| The release is too large (Views 68.5 days plus 66) | a late release | the smallest-wow cut (about 50 days); the Views helpers deferred; three builders in parallel after step 2 |
| Generated screens are plausible but wrong | a wrong figure believed | the model never computes or sees data; figures come from the same engines as any screen; the screen is marked as generated and shows its Sutra; evaluation on properties, not looks |
| Opening the specification invites a competing implementation | loss of control | the names are marks; the vectors define conformance; the value is the runtime's speed and Elements' quality, which a specification does not give away |

### 7.4 Questions for the owner

| # | Question | Recommendation |
|---|---|---|
| Q1 | Is the public face of drishti-views now **Sutra**, with the ViewModel as the documented layer underneath (still open, still usable directly)? | Yes. One front door; the ViewModel remains for servers that want to send JSON and for the painter's contract. |
| Q2 | One grammar with **profiles** (Core, and extension profiles such as the product's), from one language definition file, never a fork? | Yes. |
| Q3 | The compiler: **the existing Java implementation as the one source, cross-compiled to JavaScript** (option e), subject to the proof; GraalJS inside the server (option a) dropped? | Yes. It is the only option that is one implementation, leaves the server untouched and is fast on both sides. Run the proof (four days) before the Views release is planned. |
| Q4 | Where does the language live: a repository of its own (`rachana`: specification, definition, vectors, the core library, the bundle build), consumed by the product as a jar and by Elements as vendored bundles? | Yes. It keeps the public repository free of the product's source, and gives the specification its own licence. |
| Q5 | If the proof fails: accept a hand-written JavaScript evaluator for Core only, as a stated exception to the one-implementation rule, or keep Sutra server-side only and publish the ViewModel alone? | Decide after the numbers. A narrow miss on size is worth fixing; a miss on S5 means the exception, small and guarded. |
| Q6 | The licence of the specification, definition, schema, vectors and card: L1 to L4 (4.9)? | L2: the language open, the runtime proprietary. Reversible towards more open, not back. |
| Q7 | May the public repository use the names **Rachana** and **Sutra** (today its guard treats product vocabulary as forbidden)? | Yes, those two words only, as the language's names; everything else of the product stays out. |
| Q8 | Problem codes: a neutral prefix (`RCH-`) in the language, with a host free to show its own prefix over the same numbers? | Yes; one numbering, one catalogue. |
| Q9 | Small additions to the grammar for first-time authors: `title:` as text, `version` defaulting to 1, panels optional (inferred), `flash`, `tone: heat`, the `grid` kind? | Yes to all; each is an addition every runtime gets. `version` defaulting is the only one that loosens a rule: keep it required for Sutras a host stores, optional in the playground and for inline use. |
| Q10 | `ref:` as the portable way to name data, resolved by a sources file outside and by the catalogue inside the product? | Yes. It is what makes "one Sutra, both places" true. |
| Q11 | The browser thresholds (50,000 rows on the main thread, 2,000,000 in the worker) and the rule "never truncate silently, never re-sum a server's figures"? | Yes; the numbers are settings a page may raise. |
| Q12 | Sutra Core 0.9, the playground and ten templates **in the Views release**, with the Views Python and Java helpers deferred to make room? | Yes. The playground and templates are the adoption; the helpers serve a path that Sutra replaces for most people. |
| Q13 | The smallest-wow cut (about 50 days, five templates) if the release must be shorter? | Hold in reserve; decide at the mid-release check. |
| Q14 | The speed gate S1 to S11, with **S5 (a Sutra costs at most 10% over hand-written, and never a frame)** as a merge blocker? | Yes. |
| Q15 | A prebuilt plan (`sutra build`) as the recommended production form, so a deployed page never parses YAML? | Yes; the playground and development pages compile in place. |
| Q16 | The playground's share links: data in the link's fragment only, nothing stored on any server of ours? | Yes for now. A hosted gallery of shared screens is a product decision for later. |
| Q17 | Editor support order: the in-page editor and JSON Schema first (in the Views release), the language server and the two editor integrations in the release after? | Yes. |
| Q18 | Generative UI as the theme of the future AI release, with **generated Sutras restricted to `ref:` sources from the reader's catalogue** and at most two repair rounds? | Yes. The restriction is what makes it safe to switch on in a bank. |
| Q19 | The model call as a single host-supplied function, with no provider named anywhere in Elements or in the language? | Yes. |
| Q20 | Should a prefix of a Sutra ending at a panel boundary be guaranteed valid (so screens build as they stream)? It constrains future grammar slightly: nothing after `panels:` may be required. | Yes; decide it now, because it is a rule of the language and cheap only if kept from the start. |

---

## Appendix P (private): the Drishti product. Move before any push

> **This appendix describes a private product. It belongs in the Drishti repository (suggested home: `docs/architecture/SUTRA_CORE.md`)
> and must be removed from this file before this branch is pushed to the public repository.** It is here only so the design can be read
> in one place while it is discussed.

### P.1 What exists today

| Fact | Detail |
|---|---|
| The implementation | `compute/drishti-rachana`: about 22,000 lines of Java in 129 files. The expression language (`el`, with its checker) is about 9,000 lines, of which the parser and lexer are about 720; the YAML side (`parse`) about 3,100; the model about 3,300; the designer's editing operations (`design/ops`) about 1,900; formats about 320 |
| Its dependencies | `drishti-common` and `drishti-api` (`DataNode`, `ErrorCode`), Jackson (databind and the YAML data format), Spring Boot (configuration properties), Caffeine (the expression cache), SLF4J. The Jackson, Spring and Caffeine uses are what step 2 replaces inside the core; none is in the language's logic |
| Binding | not in `drishti-rachana`: `kernel/drishti-engine` (`engine/bind`) builds the ViewModel; inference is its own module. The Core binder of step 2 is the portable part of `engine/bind` |
| Functions | provided through `FunctionProvider` and `ServiceLoader`; every aggregate comes from `drishti-bicompute`. In `rachana-core` the Core aggregates over a list (sum, count, min, max, average, median) need a home that does not pull in the pivot engine: the engine keeps being the provider on the server; the core carries the list forms only if the owner agrees that this is not a second implementation (they would have to be *the* implementation that the engine's provider delegates to for lists) |
| Sutras | 271 shipped files under `modules/*/packs/*/sutras` and `examples/packs/*/sutras`; they are the first source of conformance vectors (their portable parts) |
| The schema | already generated from the grammar tables (`RachanaSchema`, `GET /api/v1/rachana/schema`); the language definition file of 1.3 is those tables turned into data, with the generator reversed |
| The CLI | `tools/drishti.py sutra …` runs the Java `sutra` tool (lint and others); `sutra build` of 6.1 is the same tool's new verb, and its Node form is the tools bundle |
| **An existing second implementation** | `drishti-console/web/static/js/drishti_form-expr.js` (about 210 lines) re-implements the form rules of `FormExpr.java` in the browser "so a message shown here is the message the server gives". Under option e it is **deleted** and the console uses the bundle: the first concrete payoff of one implementation, and a standing example of why two drift |

### P.2 How the product maps a portable Sutra

- `ref: <domain>.<name>` resolves to a virtual table of that unique name (the decided `<domain>.<name>` naming), else to a kind; read
  through the normal pipeline **as the viewer**: row rules, masks (`•••` carried through expressions as today), business date and
  known-at as the source defines them. `where:` is pushed to the table layer.
- A Core Sutra has `data:` and no `match:`; it is a *screen* (reached by name), not an entity page. An entity page keeps `match:` and its
  `$` is the entity, exactly as now. Both may mix: an entity page may also declare `data:` entries, which appear as extra fields beside
  the entity under a reserved name to avoid clashing with the document's own fields (a detail to settle in the product's design).
- The product's profile keeps: `match`, `source: { kind | table | pack | as-of | params }`, `link(id, 'kind')`, the `links` and
  `provenance` kinds, `code:` mnemonics, inference from the catalogue and semantic hints, governance (proposals and review), Explain,
  `measure`/`cell`/`related`, write-back.
- Problem codes: the language's numbers are today's `DRS-2xxx` and `DRS-21xx`; the product keeps showing `DRS-`.
- Export: a Sutra that checks as `profiles: [core]` can be downloaded with a sample of its data (as the viewer sees it, masks applied) and
  opened in the playground. This needs the owner's view on data leaving the product; default off, an admin setting.

### P.3 The work on the product's side

| # | Step | Days | Grade |
|---|---|---|---|
| D1 | `rachana-core` extraction (this is step 2 of 7.2, counted there): the server depends on it; `drishti-rachana` keeps the registry, matching, the product's profile, Spring wiring and the cache | (9) | deep |
| D2 | The console drops `drishti_form-expr.js` for the bundle; the form tests are the gate | 2 | standard |
| D3 | The product profile declared in the definition file; `DRS-` over the neutral numbers; the served schema generated per profile | 2 | standard |
| D4 | `ref:` and `data:` in the server's pipeline (the release after: counted in 7.2 as six days) | (6) | deep |
| D5 | Docs: `RACHANA_REFERENCE.md` generated sections from the definition file; the configuration document; CHANGELOG | 2 | routine |

Release names: the eventing and modules release is **i7**; the Views release is **i8**; the tools-and-reach release would be **i9**;
Generative UI is the future AI release. The adoption appendix of VIEWS_DESIGN.md says "i7" for Views and should be read as i8.

### P.4 Generative UI in the product

- The product's AI layer is **switched off in i6** and returns in a future release; section 5 is designed for that release and needs
  nothing from it before then.
- The model call goes through the product's own provider abstraction (its `LLMProvider`/`LLMModel` design), on the server; the browser
  never holds a key. The `generate` function of 5.4 is, in the product, a server endpoint that streams.
- The catalogue of 5.2 is built from the data contracts per mnemonic, the virtual tables and the pack READMEs' front matter, filtered by
  the reader's roles, lens and enabled modules; mnemonics that are switched off never appear.
- The designer's existing **Describe** (rule-based today) becomes the entry point: same box, same result (a Sutra opened in Build), a
  better engine behind it when a model is configured, the rules when none is.
- A generated screen is an *ephemeral Sutra*: links intact, embedded in place, saved only through the normal proposal and review path.
- The audit record goes with the product's existing audit trail; the mark "generated" is part of the provenance panel.
- Nothing in this path prices or computes risk: figures come from the engines through the sources, as on every screen.

### P.5 Questions for the owner (product side)

| # | Question | Recommendation |
|---|---|---|
| P1 | May the list aggregates live in `rachana-core` with `drishti-bicompute`'s provider delegating to them for lists, so the browser has them without the pivot engine? | Yes, as one implementation with two callers; the grouping, measures and models stay in the engine. |
| P2 | Delete `drishti_form-expr.js` as part of the Views release (D2)? | Yes. |
| P3 | Export of a Core Sutra with sample data from the product: allowed at all? | Off by default, an admin setting, masks applied; decide before the release after i8. |
| P4 | Should entity pages be allowed `data:` entries, or only screens? | Screens first; entity pages keep `source:` until there is a need. |
| P5 | Does `rachana-core` move to its own repository (Q4) in i8, or stay a module of the product until the specification is 1.0? | Its own repository from the start, private until the licence is decided; moving later means moving history. |
