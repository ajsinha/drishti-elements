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
# Changelog

Each release lists what changed, by library. One version for every library: the `elements` key of `elements/drishti_elements.json`.

## Unreleased

- **drishti-events** (eventing step E7, tabs): the `tabs` scope over a `BroadcastChannel` named by the `namespace` (frames checked before
  use; `$` topics never leave), request and reply across tabs (the first tab that answers; a cancel reaches it), `signOut()` told to every
  tab. The shared hub: `connect(url, { share: true, namespace })` gives all the tabs one server connection, held by a `SharedWorker`
  (`drishti_events-worker.js`, option `worker`) or else the leader tab (a Web Lock; the next tab takes over and resumes by sequence), else
  each tab connects for itself; one server subscription per pattern, retained values for a late tab, publishes and requests relayed,
  `auth` asked of a tab; `$events.state` says `shared` and `mode`. `MockTabs` joins several `Events` in one page as tabs (channel, locks,
  worker). The build writes a library's **parts** (files beside its bundle, from the manifest's `parts`); the release tree ships them.
- **drishti-events** (step E4): the Sequencer is wired into the connection (order, repeats, gaps with a `replay` frame, `after` on a `sub`, resume,
  `$events.gap`, a `resync` notice with the subscription `recovering`); `Sequencer` and `SEQUENCE_LIMITS` are exported.
- **drishti-data**: `FeedMonitor` and `feedBadge` are removed (the sequencer's `stats` replace the monitor; the badge returns as `statusBadge` in step 9).
- **drishti-core** (eventing step E1): `EventBus` listens to patterns over dotted topics (`*` one segment, a last `>` the rest; exact
  listeners are told first, then patterns, then a lone `*`); new topic helpers `isTopic`, `isPattern`, `topicMatches`, `segment`,
  `unsegment`, `selectionTopic`, `filterTopic`. Linked selection is the topic `ui.selection.<channel>` and the filter model the topic
  `ui.filter.<channel>`: `SELECTION_EVENT` and `FILTER_CHANNEL` are removed (no aliases); chart, graph, tree, selection chip, grid
  (`followFilters`) and filter bar (`channel` is now a channel name, default `default`) moved in the same change.
- **drishti-events** (new, the ninth library; eventing step E2, the kernel): `createEvents(options)` and `connect()` (no server yet: the
  page and its tabs), `Events` with routes (the most specific pattern wins; `share(pattern, { to })` adds a scope), the page scope as
  drishti-core's shared bus itself, `on`, `subscribe` (a `Subscription`: state, `ready`, `stats`, `latest(key)`, a feed through
  `subscribe(fn)`, `byKind(handlers)` for a live-set channel, an async iterator), `once`, `off`, `publish` (a `Receipt`), `request` and
  `reply` (timeouts, `AbortSignal`, `no.responder`), `stream`, typed `topic(name, { kind, validate })`, `define(kind, validate)` and
  `shape({...})`, `events.page` / `events.tabs` / `events.server` pinned to a scope, the library's own events as `$events.*` topics
  (`$events.error`, `$events.drop`, `$events.subscription`), `EventError`, `TimeoutError` and `AbortError`, one clock for every timer
  (`systemClock()`, `testClock({ seed })`). Budget 110,000 bytes; no domain words (the generic libraries' guard).
- **drishti-events** (eventing step E3, the connection): `connect(url, options)` opens a connection to any server that speaks the events
  protocol, version 1 (`events.v1`: hello, welcome, sub, subd, msg, pub, ok, req, res, cancel, err, gap, auth, ping, pong, bye), over a
  WebSocket, Server-Sent Events by `EventSource` (subscriptions and the resume position in the address), or Server-Sent Events read with
  `fetch` (the token in `Authorization`, hello and subscriptions in the body, `Last-Event-ID`); clients' frames over SSE go to
  `<events>/send`. `protocol: 'raw'` reads a server's own JSON (`topicOf`, `seqOf`, `idOf`, `keyOf`, `kindOf`). The state machine
  (`idle`, `connecting`, `open`, `reconnecting`, `offline`, `refused`, `closed`, each change on `$events.state`), back-off with full jitter
  on the clock (a server's advice a floor), the heartbeat watchdog and WebSocket pings (round trip and clock offset), refusals that stop
  (close 4400 and 4403, HTTP 400, 403, 404, version, `bye` without reconnect), `auth` before every connect, once more after a refusal and
  a minute before a token runs out (an `auth` frame, or a new stream resumed before the old one closes), `wsAuth` (`hello`,
  `subprotocol`, `cookie`), the address guard (no secret in a query), subscriptions sent on open and after every reconnect, publishes
  held in order while down and sent again until acknowledged, requests with `cancel`, hostile frames dropped and counted. `parseSse`
  (now with `retry:`) and `readSse(response)`; `Backoff` and `Heartbeat` on the clock. `connect()` with no address uses the endpoint
  `configure({ endpoints: { events } })` names.
- **drishti-data** (breaking, 3.0.0): `LiveClient`, `LIVE_STATES`, `live()`, `parseSse`, `Backoff` and `Heartbeat` removed: connections
  are drishti-events' (`connect(url, { protocol: 'raw' })` reads the same feeds; a subscription is a feed for `pipeToGrid`,
  `liveSource` and `grid.connectLive`). Its budget is lowered to 42,000 bytes. The guard that only one library opens a WebSocket or an
  `EventSource` now names drishti-events (and `BroadcastChannel`, `SharedWorker`). The gallery's live page is drishti-events'
  "Connection" page; the inputs harness feeds its live grid through a drishti-events connection.
- **drishti-events** (eventing step E5, flow): every subscription has a pipeline between arrival and its listeners: `conflate` (`true`:
  the message's key; `{ key, merge }`: a field of the message or of its data, or a function), a bounded `buffer` (`max`, `overflow`:
  `conflate`, `drop-oldest`, `drop-newest`, `error`), and `deliver` (`'now'`, `'frame'`, `{ everyMs }`) with `batch`; a hidden page
  delivers once a second and keeps conflating; every drop is counted with its reason. `Conflater` (the latest value by key) and
  `GridSink`; `subscription.toGrid(grid, { getRowId, onStats })` feeds a grid with at most one batch in flight (folding the grid's way).
  The page's life: `pagehide` and `freeze` close the connection cleanly (back-forward cache), `pageshow` and `resume` open and resume
  it, `idleCloseMs` gives it back while hidden. Publishing pauses while a socket holds more than 1 MB unsent. `conflate: { server: true }`
  asks a server whose welcome offers `conflate` to conflate before the wire. The bundle's budget is 150,000 bytes for now (step 12
  settles it).
- **drishti-data** (breaking): `TransactionSink` and `pipeToGrid` removed: `subscription.toGrid(grid)` (drishti-events) is the one way.
- **drishti-events** (eventing step E6, the offline queue): every publish to a server waits in `Outbox` until acknowledged (sent again
  after a reconnect, in order); bounded (`outbox: { max, maxBytes, maxAgeMs }`, defaults 1,000 messages, 1 MB, 24 hours; past a bound
  the publish is refused in words, or `overflow: 'drop-oldest'`), aged (a publish's `ttlMs`, dropped as `expired` even while nothing
  else happens); `queue: false` fails at once when not connected; an abort takes back a publish not yet sent. Persistence by choice
  (`queue: 'persist'`, `outbox: { persist: true }`): IndexedDB (`indexedDbStore`, named by the `namespace`), or `memoryStore()`;
  without IndexedDB the queue is memory and `metrics().outbox.persisted` says `false`. What a reload left is sent first, by one tab at
  a time (a Web Lock). `events.flush()`, `events.clearOutbox()` and `events.signOut()` (the queue and the disk emptied, stream positions
  and the session forgotten).
- **drishti-grid**: the grid's style sheet restored in full (a change to it had kept only its last block, so the grid, its pivot wells and
  its side panel were drawn without their look); a guard test now fails when a library's class names lose their rules.
- **drishti-core**: the loader adds a library's style sheets even when its bundle is on the page already (drishti-core by its script
  tag: the resize and chips sheets), and knows a sheet the page links by a relative address as the same sheet.
- **drishti-chart**: the map shapes are not asked for from a page opened from the file system (the browser refuses it); the map says so.
- **Gallery**: the States entry draws again (its compact switch); the documentation's Playground page works from the file system too.
- **Brand**: a light logo for dark backgrounds (`brand/drishti_elements-logo-light.svg`), used by the README in dark mode.

## 2.4.0

The first version of Drishti Elements as its own project: the libraries, the gallery, the build and the tests in one repository, one release
tree built from a tag (`python3 tools/elements/cli.py dist`).

- **drishti-core 2.4.0**: formats and the themes' tokens, the API client with its error contract, events, accessibility helpers, resize, keymap, dialogs, drawers and toasts, the state kit, the command palette and the dock, the filter model every library shares, the loader. New: `configure({ endpoints })` and `endpoint(name)` name the addresses of the host's server (live, changes, pivotPage, capabilities); `register(name, options)` adds a library that lives outside the manifest to the loader; `ApiClient` takes `asOfHeader`. The loader needs no built-in folder: it uses the folder the core bundle was loaded from, or `configure({ base })`.
- **drishti-inputs 2.4.0**: date and range pickers with holiday calendars, the multi-select, the combobox, forms from a schema with four eyes, the filter bar, the code editor over CodeMirror.
- **drishti-grid 2.4.0**: the grid and its pivot in three layouts and three densities, cell editing, the live-set mode, export, the AG Grid-style adapter. New: the live-set client and the pivot link read their addresses from the configured endpoints (`base`, `changesUrl` and `pivotPage`); without one the feature says so in words.
- **drishti-chart 2.4.0**: one engine-neutral spec over ECharts, the general kinds, the maps from the world to every country's first-level regions, Explain on any mark, export, linked selection and live updates. New: the maps folder is required when the core bundle gives no folder.
- **drishti-data 2.4.0**: one data-source contract (memory, REST pages, server-side rows, Arrow, live), the live client over SSE and WebSocket, the Arrow client. New: `capabilitiesUrl` defaults to the configured endpoint `capabilities`; with none the client uses Arrow or JSON over HTTP only.
- **drishti-tree 2.4.0**: hierarchies as an indented tree grid, an org chart, a sunburst and an icicle, with measures, search, an edit mode that proposes moves, and the outline of an authoring screen.
- **drishti-graph 2.4.0**: networks on a canvas with force, layered, radial, circular and grouped layouts, paths, groups, selection and an adjacency table.
- **drishti-designer 2.4.0**: the designer kit: the layout canvas, palette, inspector, outline, YAML pane, undo and redo, and the designer shell.

Also in 2.4.0:

- **drishti-chart**: heatmap tracks, category cells and the overview strip; a scatter's segments, top labels and surface; the
  rectangle brush; frames with a slider and Play; box plots from given figures; the kinds `segmented`, `matrix`, `lollipop` and `trace3d`
  (on the vendored ECharts GL, loaded the first time, drawn flat or as its table without WebGL). Each has a gallery page and Node tests.
- **drishti-core**: `Tour`, a page walked in steps (marks for what each step says and shows, back, at and next controls).
- **drishti-grid**: Escape closes Explain whatever came before it (a pending focus follow never reopens a closed Explain).
- **drishti-inputs**: the query builder's choices on drishti-inputs' Select; the selection chip's history as buttons.
- **Build**: a host's own libraries (`build.py --root --manifest`) require this project's bundles under Node by their path from the
  library's folder, and a host's manifest may leave the version out (this project's is used).
- **Vendor**: ECharts GL 2.1.0 (BSD-3-Clause, one local change without eval, `vendor/echarts-gl/PATCHED.md`).
- **drishti-grid**: the grid's style sheet restored in full (a change to it had kept only its last block, so the grid, its pivot wells and
  its side panel were drawn without their look); a guard test now fails when a library's class names lose their rules.
- **drishti-core**: the loader adds a library's style sheets even when its bundle is on the page already (drishti-core by its script
  tag: the resize and chips sheets), and knows a sheet the page links by a relative address as the same sheet.
- **drishti-chart**: the map shapes are not asked for from a page opened from the file system (the browser refuses it); the map says so.
- **Gallery**: the States entry draws again (its compact switch); the documentation's Playground page works from the file system too.
- **Brand**: a light logo for dark backgrounds (`brand/drishti_elements-logo-light.svg`), used by the README in dark mode.
