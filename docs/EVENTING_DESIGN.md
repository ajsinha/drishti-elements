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
# Eventing: the design of drishti-events

**Status: a design. Nothing in this document is built yet.** When the library is built its facts move to their homes ([DESIGN.md](DESIGN.md),
[USING.md](USING.md), [CONTRACTS.md](CONTRACTS.md), the generated [API.md](API.md)) and this file is deleted.

The aim: the easiest and most dependable way for a browser page to exchange events, with itself, with the person's other tabs and with any
server over a WebSocket or Server-Sent Events, in one small library with no dependency and no build step.

Contents: [1 Where it lives](#1-where-it-lives-and-what-it-replaces) · [2 The API](#2-the-api) · [3 Reliability](#3-reliability) ·
[4 Security](#4-security) · [5 Observability](#5-observability) · [6 Testing and the gallery](#6-testing-and-the-gallery) ·
[7 Compared with the best](#7-compared-with-the-best) · [8 The wire protocol](#8-the-wire-protocol-version-1) ·
[9 Budgets and targets](#9-budgets-support-accessibility-and-targets) · [10 Build plan](#10-build-plan-risks-and-questions) ·
[11 A library that names no host](#11-a-library-that-names-no-host) · [Appendix A: adoption by the Drishti product](#appendix-a-adoption-by-the-drishti-product)

---

## 1. Where it lives and what it replaces

### 1.1 One model

Every event is a **message on a topic**. A message travels in one or more of three **scopes**, and the calls are the same in each:

| Scope | Reaches | Carried by |
|---|---|---|
| `page` | listeners in this page | drishti-core's shared bus (in memory, synchronous) |
| `tabs` | the same application in the person's other tabs and windows | `BroadcastChannel` |
| `server` | a server and, through it, anyone | a WebSocket, Server-Sent Events (`EventSource`), or Server-Sent Events read with `fetch` |

Above the scopes sits one object, `Events`, that routes: which topics go where is configuration, so a component publishes a selection or
subscribes to prices without knowing whether the other side is in the page, in another tab or behind a server.

An optional **shared hub** lets all the tabs of one application share a single server connection (section 3.9). It changes nothing in the API.

### 1.2 A new library, the ninth: `drishti-events`

| Library | What it is | Requires |
|---|---|---|
| **drishti-events** | events in the page, across tabs and with a server (WebSocket, SSE): topics with wildcards, publish and subscribe, request and reply, streams, reconnect and resume, conflation, an offline queue, a status badge, an inspector, a mock server and a test clock | core |

Why its own library and not more of drishti-data: drishti-data is "rows for grids and charts" (sources, Arrow, the data worker); events are a
different job, used by pages that show no grid at all; drishti-data's bundle is near its byte budget; and a page that only wants a bus and a
socket should load one small file. The topic matcher is the one part that goes into **drishti-core**, because the chart, the graph and the tree
publish linked selections and require only core.

### 1.3 What moves, and what is deleted

There is one home per capability. Nothing below is kept in two places and no alias is left behind; the version becomes **3.0.0** because
drishti-data loses public names (question Q2).

| Today | After | What happens to the old |
|---|---|---|
| drishti-core `EventBus` (exact names, `*` hears all) | the same class with segment wildcards (`a.*.c`, `a.>`); a lone `*` still hears everything, so every component's own events are untouched | extended in place |
| drishti-core `bus` (the bus a page shares) | the `page` scope of `Events` is this very object: there is no second in-page bus | kept; adopted |
| drishti-core `SELECTION_EVENT` with `{channel, ids, source}`, and the grid's filter channel on the shared bus | topics `ui.selection.<channel>` and `ui.filter.<channel>`; `linkGrid` and `publishSelection` keep their names; `events.share('ui.selection.>', { to: 'tabs' })` links selections across tabs | the constant is deleted; chart, graph, tree, selection chip and grid move in one change |
| drishti-data `LiveClient`, `LIVE_STATES`, `live()` | drishti-events `Connection` behind `connect()`; the states are section 5.1 | deleted from drishti-data |
| drishti-data `Backoff`, `Heartbeat` | drishti-events, on the one injected clock (the WebSocket ping too) | moved |
| drishti-data `parseSse` | drishti-events `parseSse` and `readSse(response)` (an async iterator over a fetch answer) | moved |
| drishti-data `TransactionSink`, `pipeToGrid` | the general `Conflater` (latest value by key) and `subscription.toGrid(grid)` | folded; deleted |
| drishti-data `FeedMonitor`, `feedBadge` | fed by the library's own sequencer (nobody calls `receive` by hand); `statusBadge(el, events)` draws connection and feed together | moved and folded |
| drishti-data `liveSource(source, feed)` | unchanged: a `Subscription` is a feed (`subscribe(fn)` returning the function that stops it), so `grid.connectLive(subscription)` and `liveSource` take it as they take any feed | stays |
| drishti-grid `manualFeed()`, the live-set channel (`subscribe(handlers)`) | unchanged contracts; `subscription.byKind(handlers)` answers the live-set channel shape | stay |
| `configure({ endpoints })` | one more address, `events`; `connect()` with no address uses it, and with none says so in words | extended |
| the gallery's "Live client" page; `tests/elements/live.test.mjs` and the live part of `data.test.mjs` | the gallery's Eventing section; `tests/elements/events*.test.mjs` | replaced |

A new guard keeps it that way: outside drishti-events no library may construct a `WebSocket`, an `EventSource`, a `BroadcastChannel` or a
`SharedWorker`, or read a streamed `fetch` body as events.

### 1.4 The modules

Plain ES modules under `elements/drishti-events/src/`, each under 2,000 lines (most under 400):

| Module | Holds |
|---|---|
| `drishti_index.js` | `connect`, `createEvents`, the exports |
| `drishti_events-hub.js` | `Events`: scopes, routes, subscribe, publish, request, reply, streams |
| `drishti_envelope.js` | the message envelope, ids, topic grammar, the kinds registry and validation hooks |
| `drishti_connection.js` | the state machine: connect, authenticate, heartbeat, back-off, resume |
| `drishti_transport-ws.js`, `drishti_transport-sse.js` | the three transports and `parseSse` |
| `drishti_protocol.js` | the wire protocol, version 1 (section 8), and the `raw` mode for servers that do not speak it |
| `drishti_timing.js` | `Backoff`, `Heartbeat`, the clock and `testClock` |
| `drishti_sequence.js` | order, duplicates, gaps, replay, the feed monitor |
| `drishti_flow.js` | conflation, delivery on animation frames, bounded buffers, the grid sink, async iterators |
| `drishti_outbox.js` | the offline queue, in memory and in IndexedDB |
| `drishti_tabs.js` | the `tabs` scope and the leader tab |
| `drishti_shared-hub.js`, `drishti_events-worker.js` | the shared connection (a `SharedWorker`, else the leader tab) |
| `drishti_metrics.js`, `drishti_trace.js` | counters and histograms; the recorder and "why didn't I get it" |
| `drishti_mock.js` | the in-page mock server and its fault injection |
| `drishti_status.js`, `drishti_inspector.js` | the status badge; the inspector panel (a second file, loaded when opened) |

---

## 2. The API

### 2.1 Hello world

```js
import { connect } from '/elements/drishti-events/src/drishti_index.js';

const events = connect('wss://example.org/events');
events.on('prices.*', (m) => console.log(m.topic, m.data));
events.publish('chat.lobby', { text: 'hello' });
const quote = await events.request('quotes.get', { symbol: 'CAD' }, { timeoutMs: 2000 });
```

The same five lines work with `connect('/events')` (Server-Sent Events), `connect('mock:')` (the in-page mock server, under `file://`) and
`connect()` (no server: the page and its tabs only). From the bundle: `Drishti.elements.load('drishti-events')`, then
`Drishti.elements.events.connect(...)`.

Nothing has to be awaited before use: subscriptions made before the connection opens are sent when it does, publishes are queued (section 3.7),
and every later reconnect restores both.

### 2.2 Messages

```js
/**
 * @template T
 * @typedef {Object} Message
 * @property {string} id       unique per publisher; made by the publisher
 * @property {string} topic    'prices.fx.USDCAD'
 * @property {T} data          any JSON value
 * @property {number} time     the publisher's clock, ms since 1970
 * @property {string} source   who published: a server's name, 'page', or 'tab:<id>'
 * @property {number} [seq]    the position in its stream (a server's messages)
 * @property {string} [stream] the stream the seq counts in (default: the topic)
 * @property {string} [key]    what a later message replaces (conflation)
 * @property {string} [kind]   the name of the data's shape ('tick', 'rows')
 * @property {string} [re]     the id of the request this answers
 * @property {Object<string, string>} [meta] headers (a trace id)
 * @property {('page'|'tabs'|'server')} scope   where it came from (added on receipt)
 * @property {number} receivedAt                 this page's clock (added on receipt)
 * @property {boolean} [retained] [replayed]     a last value sent on subscribing; a message sent again after a gap
 */
```

**Topics** are segments joined by dots (`prices.fx.USDCAD`): letters, digits, `_`, `-`, `:`, `~`; at most 16 segments and 255 characters.
`segment(text)` encodes any text as one segment. **Patterns**: `*` is exactly one segment, `>` is one or more trailing segments
(`prices.*.USDCAD`, `prices.>`). Topics beginning `$` are the library's own and never leave the page.

### 2.3 The whole API

```js
const events = connect(url?, options?)         // or createEvents(options) for no server
```

| Call | Answers | What it does |
|---|---|---|
| `events.on(pattern, fn, options?)` | `off()` | hears every message matching the pattern (as `EventBus.on`) |
| `events.subscribe(pattern, fn?, options?)` | `Subscription` | the same, as an object with state, statistics and the helpers below |
| `events.once(pattern, options?)` | `Promise<Message>` | the next matching message; `timeoutMs`, `signal`, `where` |
| `events.off(pattern?, fn?)` | | stops one listener, a pattern's, or all |
| `events.publish(topic, data, options?)` | `Promise<Receipt>` | sends; resolves when delivered (the page: at once; a server: when it acknowledges) |
| `events.request(topic, data, options?)` | `Promise<Message>` | sends and waits for the one answer; rejects with a `TimeoutError` after `timeoutMs` (default 10 s) |
| `events.reply(topic, async (m) => data)` | `off()` | answers requests on a topic (page and tabs scopes; a thrown error is the requester's rejection) |
| `events.stream(pattern, options?)` | `AsyncIterable<Message>` | `for await (const m of events.stream('prices.>', { signal }))` |
| `events.topic(name, { kind, validate })` | `Topic<T>` | a typed handle: `ticks.on(fn)`, `ticks.publish(data)`, `ticks.request(data)` |
| `events.define(kind, validate)` | | registers the shape of a kind (section 2.6) |
| `events.share(pattern, { to })` | `off()` | routes a pattern to a scope (`'page'`, `'tabs'`, `'server'`, or a list) |
| `events.page`, `events.tabs`, `events.server` | the same calls | pinned to one scope, whatever the routes say |
| `events.state`, `events.reconnect()`, `events.close()`, `events.destroy()` | | the connection (section 5.1) |
| `events.flush()`, `events.clearOutbox()`, `events.signOut()` | `Promise` | the offline queue (section 3.7) |
| `events.metrics()`, `events.explain(query)`, `events.inspect(el?)` | | section 5 |

**`Subscription`**: `off()`, `ready` (a promise: the server accepted it), `state` (`pending`, `active`, `recovering`, `refused`, `closed`),
`stats`, `latest(key?)`, `subscribe(fn)` (so it is a feed for `grid.connectLive` and `liveSource`), `toGrid(grid, { getRowId })`,
`byKind({ rows: fn, resync: fn, ... })`, and `[Symbol.asyncIterator]`.

**Subscribe options**

| Option | Default | Meaning |
|---|---|---|
| `scope` | every scope the routes give | hear only `'page'`, `'tabs'` or `'server'` |
| `signal` | | an `AbortSignal` that ends it |
| `where` | | a function of the message; false drops it (recorded as `filtered`) |
| `conflate` | off | `{ key }` (a field name or a function): keep only the latest message per key until delivery; `merge(old, new)` to combine |
| `deliver` | `'now'` | `'frame'`: once per animation frame; `{ everyMs }`: at most that often |
| `batch` | false | the listener receives an array per delivery |
| `buffer` | `{ max: 10000, overflow: 'conflate' }` | the most messages held undelivered; overflow: `'conflate'`, `'drop-oldest'`, `'drop-newest'`, `'error'` |
| `retained` | false | ask the server for the last value of each matching topic first |
| `from` | `'resume'` | `'now'`: nothing missed is sent again; `'resume'`: what was missed since this page last heard the stream |
| `onGap` | `'replay'` | `'replay'`, `'resync'` (ask for the state again) or `'ignore'` (section 3.5) |

**Publish options**: `to` (a scope; default from the routes), `key`, `kind`, `meta`, `ack` (default true to a server), `queue` (`'memory'`
default, `'persist'`, or `false`: fail at once when not connected), `ttlMs` (dropped from the queue when older), `signal`.

**Routes.** `connect(url, { routes: { 'ui.>': 'page', 'ui.selection.>': ['page', 'tabs'], '>': 'server' } })`. The default: with a server,
everything goes to the server except `ui.>` (the page); without one, everything is the page. The most specific pattern wins. A listener hears
a message once, from whichever scope brought it; a message a page publishes to the server is not also echoed to it locally unless the route
names both.

**Cancellation.** Every call that waits takes an `AbortSignal`; aborting a request tells the server (`cancel`). `connect(url, { signal })`
ties a whole `Events` to a component's life.

**Errors** are `EventError` with `code` and `detail` in words (the shape of drishti-core's error contract), `TimeoutError` and
`AbortError`. A listener that throws does not stop the others; the error is published on `$events.error`.

### 2.4 The library's own events are topics too

`$events.state`, `$events.error`, `$events.gap`, `$events.drop`, `$events.subscription`, `$events.auth`, `$events.metrics` (once a
second, only while someone listens). `events.on('$events.state', (m) => ...)`. One model: no second emitter to learn.

### 2.5 Connect options

`transport` (`'websocket'`, `'sse'`, `'fetch'`; default by the address: `ws:` and `wss:` a WebSocket, else `fetch` when `auth` or headers
are given, else `sse`), `protocol` (`1` default, or `'raw'`), `auth` (section 4.1), `headers`, `credentials`, `routes`, `share` (section 3.9),
`namespace` (section 4.3), `heartbeatMs`, `backoff`, `outbox`, `limits`, `clock`, `signal`, `recorder`.

**`protocol: 'raw'`** connects to a server that only sends its own JSON (any SSE or WebSocket feed): each inbound message becomes a `Message`
by the functions `topicOf`, `seqOf`, `idOf`, `keyOf`, `kindOf` (defaults: the SSE event name as the kind, `seq` and `id` when present, one
topic `feed`). Reconnect, heartbeat, resume by last event id, conflation, the monitor and the inspector all work; request and reply and
acknowledged publishing need the protocol.

### 2.6 Typed messages and validation

Types are JSDoc, checked by the generated `.d.ts`:

```js
/** @typedef {{ symbol: string, bid: number, ask: number }} Tick */
/** @type {import('./drishti_index.js').Topic<Tick>} */
const ticks = events.topic('prices.fx.*', { kind: 'tick', validate: shape({ symbol: 'string', bid: 'number', ask: 'number' }) });
ticks.on((m) => m.data.bid);        // m is Message<Tick>
```

`validate(data, message)` answers `true` or words. `shape({...})` is a small built-in checker (types, optional `?`, arrays, nested shapes); a
page may pass any function instead (its own JSON Schema validator). An inbound message that fails is dropped and recorded as `invalid`
(`onInvalid: 'deliver'` lets it through, marked); an outbound one rejects the publish. Validation is off the hot path when no validator is given.

---

## 3. Reliability

### 3.1 Reconnect and back-off

A dropped connection is opened again after an exponential back-off with full jitter (500 ms growing to 30 s; a server's advice in `bye` or
SSE's `retry:` is a floor), at once when the browser comes back online or the tab becomes visible, and never in a hot loop: a refusal that
trying again cannot cure (bad address, version, forbidden) stops in the state `refused` with the reason in words.

### 3.2 Heartbeats

Any frame is a sign of life. With none for `heartbeatMs` (the server's figure from `welcome`, else 45 s; the watchdog allows 1.5 times) the
connection is taken as dead and opened again. On a WebSocket the client pings every third of that and the pong carries the server's time, which
gives the round-trip time and the clock offset used for latency (section 5.2). On SSE the server sends a comment line.

### 3.3 Resume and replay

A server numbers the messages of each **stream** with `seq` and names the stream's incarnation with an `epoch`. The client keeps the last
`seq` of each stream it hears (bounded: 5,000 streams, least recently heard forgotten) and, when it subscribes again after a reconnect, says
where it was. The server answers `recovered: true` and sends what was missed, or `recovered: false` (too long ago, or a new epoch): the
subscription then enters `recovering`, a `resync` notice is delivered (`byKind({ resync })`, or `m.kind === 'resync'`), retained values are
asked for when the subscription wants them, and the page shows the state again from the truth.

### 3.4 Once only, and in order

- **Inbound.** Within a stream a message whose `seq` is not above the last one delivered is a repeat and is dropped; messages with no `seq` are
  deduplicated by `id` in a window of the last 2,048 ids. Order within a stream is the server's; nothing is promised across streams.
- **Outbound.** Every publish carries an id made in the page (sortable by time, random per tab). The client sends it again until acknowledged;
  the server ignores an id it has seen (section 8.6). Together: at-least-once delivery with idempotent receipt, which is exactly-once in
  effect for as long as the server remembers ids.
- A page's own publishes to one topic leave in the order they were made, including across a reconnect and a flush of the queue.

### 3.5 Gaps

A `seq` that jumps is a gap. The messages after it are held (at most 5,000 per stream, at most `gapWaitMs`, default 2 s) while the client asks
the server to `replay` the missing range; when they arrive everything is delivered in order. If they cannot be had the held messages are
delivered, the gap is published on `$events.gap` with the range, and the subscription resyncs. The **feed monitor** is this same sequencer
seen from outside: `subscription.stats` (received, gaps, missed, repeats, stale) and the status badge's "Missed 3 updates" come from it.
`staleMs` on a subscription says how long silence is normal.

### 3.6 Backpressure, conflation and frames

Messages can arrive faster than a page can draw. Between arrival and the listener each subscription has a small pipeline:

1. **Conflate** by key: a later message replaces an earlier undelivered one with the same key (a price tick per symbol). For grid transactions
   the rule is the grid's (an add then an update is an add of the new row, an add then a remove is nothing).
2. **Hold** in a bounded buffer; the overflow rule is the subscription's, and every message dropped is counted and recorded with its reason.
3. **Deliver** now, once per animation frame, or at most every `everyMs`, optionally as one array. A hidden tab has no animation frames: the
   pipeline then delivers on a one-second timer and keeps conflating, so memory stays bounded and the page is right when shown again.

`subscription.toGrid(grid)` is this pipeline ending in `applyTransactionAsync`, with at most one batch in flight.

Toward the server: a subscription may ask the server to conflate before the wire (`conflate` in `sub`, where the server can), publishing
pauses while the socket's `bufferedAmount` is above 1 MB, and a server that had to drop for a slow client says so with `gap`.

### 3.7 The offline queue

A publish made while the connection is down is held and sent, in order, when it is back.

| | Default | |
|---|---|---|
| where | memory | `queue: 'persist'` on a publish, or `outbox: { persist: true }`, keeps it in IndexedDB so it survives a reload |
| bounds | 1,000 messages, 1 MB, 24 hours | past them a publish rejects in words (`outbox: { overflow: 'drop-oldest' }` to drop instead) |
| flush | after `welcome`, in order, each acknowledged before it is removed | one tab flushes at a time (a Web Lock), so tabs never send a queued message twice |
| requests | never queued across a reload | a request fails on its timeout; the asker is gone after a reload |

Persistence is off by default because the payloads rest on the person's disk (section 4.5). Where IndexedDB is not to be had (some private
windows) the queue is memory and `events.metrics().outbox.persisted` says `false`.

### 3.8 Memory bounds

Every store has a ceiling and a counter: undelivered messages per subscription (10,000), held messages per gap (5,000), streams remembered
(5,000), ids for duplicates (2,048), the queue (1,000 and 1 MB), the recorder (5,000 headers), pending requests (1,000), frame size (1 MB;
larger frames are dropped as `too-large`). `limits` changes any of them. With every ceiling at its default the library holds under 5 MB.

### 3.9 One connection for all tabs (the shared hub)

`connect(url, { share: true })`: the application's tabs share one server connection, which matters most for Server-Sent Events over HTTP/1.1,
where a browser opens six connections to a site and no more.

1. A `SharedWorker` holds the connection, parses, deduplicates and conflates off the page's thread, and posts each tab what its
   subscriptions want. A subscription held by several tabs is one subscription to the server; a tab that joins late is given the retained values.
2. Where there is no `SharedWorker`, the tab holding a Web Lock is the leader and relays over a `BroadcastChannel`; when it closes the next
   tab takes over and resumes by sequence.
3. Otherwise each tab connects for itself.

The worker is its own file (`drishti_events-worker.js`), same origin, no blob and no `eval`. The tabs must belong to one signed-in person:
the `namespace` (section 4.3) keeps two people's tabs apart.

### 3.10 The page's life

On `pagehide` and `freeze` the connection is closed cleanly (the page stays eligible for the browser's back-forward cache) and on `pageshow`
and `resume` it is opened and resumed. A tab hidden for longer than `idleCloseMs` (off by default) gives its subscriptions back and takes
them again when shown.

---

## 4. Security

### 4.1 Who is connecting

`auth` is one function, asked before every connect and before a token runs out:

```js
connect(url, { auth: async ({ reason, status }) => ({ token, expiresAt }) });   // reason: 'connect' | 'expiring' | 'refused'
```

| Transport | How the token travels |
|---|---|
| `fetch` (SSE) | the `Authorization: Bearer` header; any `headers` (an object or a function) |
| WebSocket, `wsAuth: 'hello'` (default) | in the first frame; the server closes a socket that has not said hello within a few seconds |
| WebSocket, `wsAuth: 'subprotocol'` | as a second sub-protocol, `bearer.<token, base64url>`, for a gateway that must decide at the handshake |
| WebSocket or `EventSource`, `wsAuth: 'cookie'` | the site's cookie; the server must check `Origin` |

**Refresh.** A minute before `expiresAt` the client asks `auth` again and hands the new token to the open connection (an `auth` frame on a
WebSocket; on `fetch` a new stream is opened and resumed before the old one is closed, with duplicates dropped by sequence), so a session
outlives its tokens without a gap. A refusal asks `auth` once with `reason: 'refused'`; a second refusal is the state `refused`, never a loop.

### 4.2 No secrets in addresses

`connect` refuses an address whose query names a secret (`token`, `access_token`, `jwt`, `key`, `apikey`, `secret`, `password`, `auth`,
`signature`) and says how to send it instead. The resume position travels in a header (`fetch`) or the `lastEventId` parameter
(`EventSource`); it is a position, not a secret. Tokens are never logged, recorded, shown in the inspector or written to the queue.

### 4.3 Tabs, frames and origins

- `BroadcastChannel`, `SharedWorker` and Web Locks are same-origin by the browser's rule. On top of that the channel's name carries the
  `namespace` the host gives (an opaque string that differs per application and per signed-in person), so a second person signed in on the
  same origin shares nothing. With `share` on and no namespace, `connect` refuses, in words.
- Every message from another tab is checked before use: protocol version, envelope shape, topic grammar, size. It is data, never code or HTML.
- Only topics routed to `tabs` leave the page; `$` topics never do.
- Embedding (a page talking to a frame it hosts) is `events.frame(target, { origin })`, later (question Q8): an exact origin both ways, never
  `*`, the sender's window checked, and a `MessageChannel` handed over after one handshake.

### 4.4 Content-Security-Policy

No `eval`, no `new Function`, no inline script or style, no blob or data workers, nothing from another origin. A page needs `connect-src`
for its server and `worker-src 'self'` for the shared hub. The library's browser tests run under a strict policy.

### 4.5 What is kept, and for how long

The queue's persisted messages are the page's own publishes; persistence is opt-in, bounded and aged (24 hours), and `events.signOut()`
clears the queue, forgets the stream positions and tells the person's other tabs to do the same. The recorder keeps headers only unless a
developer turns payloads on, and lives in memory.

### 4.6 Hostile input

Topics, kinds and sizes are validated on the way in; maps are `Map`s (no prototype tricks); a frame that is not JSON, is too large, or names
an unknown type is dropped and counted; nothing received is ever put into the page as HTML by the library (the inspector draws text).

---

## 5. Observability

### 5.1 States

```
idle ──► connecting ──► open ──► closed
              ▲           │
              │           ▼
           reconnecting ◄─┘        offline (the browser says so; waits for "online")
                                   refused (trying again cannot help; says why)
```

Each change is a message on `$events.state`: `{ state, was, attempt, waitMs, reason, transport, shared, resumed }`. Subscriptions have their
own (`pending`, `active`, `recovering`, `refused`, `closed`) on `$events.subscription`.

`statusBadge(el, events)` draws the state with drishti-core's state kit: "Live", "Reconnecting in 4 s" with a **Reconnect now** button,
"Offline: 3 changes waiting", "Missed 12 updates" with **Refresh**. It is a `role="status"` region that announces changes of state, never
each message.

### 5.2 Metrics

`events.metrics()` answers one plain object, also published on `$events.metrics`:

| Group | Figures |
|---|---|
| connection | state, transport, connects, reconnects, time connected, round trip (last, p50, p99), clock offset |
| in | messages and bytes (total, per second over 1 s and 10 s), per topic pattern; delivery latency (publisher's time to listener, p50, p99); listener time (p99, the slowest pattern) |
| out | publishes, acknowledged, retried, failed; acknowledgement time; requests (sent, answered, timed out) |
| drops | by reason: `duplicate`, `conflated`, `overflow`, `invalid`, `filtered`, `too-large`, `expired`, `unrouted`, `gap` |
| stores | undelivered, held for gaps, the queue (count, bytes, persisted), pending requests, recorder |

Histograms are fixed log-scale buckets (no dependency, constant memory). `onMetrics` hands the object to a host's own telemetry.

### 5.3 The inspector

`events.inspect()` opens the inspector in drishti-core's dock (or `events.inspect(el)` in a page's own element); the command palette has
"Open the events inspector". It is assembled from the libraries (the message list is a drishti-grid, the filter a drishti-inputs field, the
answer of "why" is drishti-core's Explain drawing) and loads only when opened.

- **Messages**: time, direction, scope, topic, kind, seq, size, latency, and what happened (delivered to 2, conflated, dropped: why); a
  filter by topic pattern, kind, direction and outcome; pause and resume; the payload as a tree; copy as JSON; "publish again" on the mock.
- **Subscriptions**: pattern, scope, state, rate, undelivered, drops, last message, latest value by key.
- **Connection**: the state timeline, reconnects with their reasons, round trip, the transport and whether the hub is shared.
- **Queue**: what waits, since when, and why.
- **Why**: section 5.4.

Keyboard: the grid's own keys in the list, `/` to filter, `Space` to pause, `Enter` to open a message, `Esc` to close; every colour has a
word or an icon beside it; light and dark from the tokens; `prefers-reduced-motion` stops the scrolling tail.

### 5.4 "Why didn't I get it?"

Every place a message can stop records a reason against its id, topic and seq in the **recorder** (a ring of the last 5,000 headers).
`events.explain({ topic, key?, id?, since? })` reads it and answers an `ExplainResult` (drishti-core's shape, drawn by `renderExplain`), a
list of steps in words, the first that failed marked:

| Step | A failing answer reads |
|---|---|
| a listener matched | "No subscription matches `prices.fx.USDCAD`. The nearest is `prices.eq.*`." |
| the route reached that scope | "`prices.>` is routed to the page only; nothing asked the server." |
| the subscription was active | "`prices.fx.*` was refused by the server at 10:42:07: forbidden." |
| the connection was open | "The connection was reconnecting from 10:41:58 to 10:42:03." |
| the message arrived | "Stream `prices.fx` jumped from 48,213 to 48,220; a replay was asked and answered `unavailable`." |
| it was valid | "Dropped as invalid: `bid` should be a number." |
| it was kept | "Conflated: replaced by seq 48,231 with the same key 8 ms later." / "Dropped: the buffer was full (10,000), rule drop-oldest." |
| the listener ran | "The listener threw: TypeError ... (see `$events.error`)." |

and when nothing failed: "Delivered at 10:42:07.118 to 2 listeners, 14 ms after it was published."

---

## 6. Testing and the gallery

### 6.1 The mock server

`connect('mock:')` talks to a `MockServer` inside the page that speaks the wire protocol of section 8 through an in-memory transport, so the
client code under test is the real client. It ships with the library because the gallery and a host's demos need it under `file://`.

```js
import { MockServer, connect } from '/elements/drishti-events/src/drishti_index.js';
const server = new MockServer({ clock });
server.reply('quotes.get', (m) => ({ symbol: m.data.symbol, bid: 1.3612 }));
server.every(100, () => server.publish('prices.fx.USDCAD', { bid: 1.3612 }, { key: 'USDCAD' }));
const events = connect(server);
```

It numbers streams, retains last values, keeps a replay log, acknowledges and deduplicates publishes, and can misbehave on purpose:
`server.drop()`, `server.partition(ms)`, `server.lose(n)`, `server.duplicate(n)`, `server.delay(ms)`, `server.reorder(n)`,
`server.refuse('auth')`, `server.restart()` (a new epoch), `server.slow()`. A `MockTabs` joins several `Events` in one page as if they were
tabs.

### 6.2 The clock

Every timer, timestamp, animation frame and random number in the library comes from one `clock` option. `testClock({ seed })` gives
`clock.tick(ms)`, `clock.frame()`, `clock.runAll()` and a seeded jitter, so a test of "three reconnects, then a resume, then a flush" runs in
microseconds and gives the same result every time.

### 6.3 The tests

- **Node** (`node --test tests/elements/events*.test.mjs`): topics and patterns, routes, the pipeline, the sequencer (repeats, gaps, replay,
  resync), the state machine on the test clock, auth and refresh, the queue (with an in-memory stand-in for IndexedDB), the tab scope and
  leader election through `MockTabs`, request and reply with timeouts and aborts, the protocol's frames, metrics, the trace, `parseSse`.
- **Conformance vectors** (`tests/events/protocol-v1.json`): scripts of frames (the client sends this, the server answers that), language
  neutral. The mock server passes them in Node; `node tools/events/conformance.mjs --url <address>` runs them against any real server.
- **Browser** (Chromium, strict policy): the gallery's Eventing pages, the shared hub with three tabs, the queue across a reload, the
  inspector's keyboard and names, the throughput target of section 9.4 as a frame-time budget.
- **Guards**: one home (section 1.3), no host words (section 11), the byte budgets, no CDN, typed JSDoc on every public symbol.

### 6.4 The gallery's Eventing section

Every page runs from the file system on the mock server; each shows the code beside it, the status badge and a link to open the inspector.

| Page | Shows |
|---|---|
| Ticker | 2,000 instruments ticking 10,000 times a second into a grid with flashing cells, conflated per frame; sliders for rate and delivery; the frame time and the drop counts live |
| Chat | publish and subscribe on a room, and request and reply ("who is here?") with a timeout and a cancel button |
| Across tabs | two panes in one page joined as two tabs: a selection or a theme chosen in one appears in the other; "open a real second tab" where the browser allows it, and words where it does not (some browsers keep `file://` pages apart) |
| Offline | switch the network off, make five edits, watch them wait, reload the page, switch it on, watch them leave in order once |
| Unreliable network | buttons for the mock's faults: drop, lose 3, duplicate, restart the server; the badge, the gaps and the replay as they happen |
| Why | a message that never arrives, and the trace that says why |
| Inspector | the panel itself, docked |

---

## 7. Compared with the best

What each does best, from its public documentation, and where this design stands.

| | Best at | We match | We go further | 
|---|---|---|---|
| **Socket.IO client** | acknowledgements with timeouts, automatic reconnect, connection state recovery, a long-polling fallback | acknowledgements, timeouts, reconnect, recovery | works with any server through a written protocol and SSE; bounded queue; conflation; no fallback transport to maintain |
| **Phoenix channels** | topics joined with a reply, pushes that answer `ok`, `error` or `timeout`, rejoin after a drop | subscribe with `ready`, request and reply, restore after reconnect | resume by sequence instead of rejoining from nothing; the same calls in the page and across tabs |
| **Ably, Pusher** | channels with continuity across a reconnect, idempotent publishing, token auth with renewal, presence, history | continuity (seq and epoch), idempotent ids, token renewal | no service needed; everything testable offline; a trace of why a message did not arrive |
| **RxJS `webSocket`** | composing a socket as a stream; multiplexing | async iterators, `AbortSignal`, multiplexing by topic | reconnect, resume and backpressure are built in rather than assembled from operators |
| **nats.ws** | subjects with `*` and `>`, request and reply with timeouts, subscriptions as async iterators | the same wildcards, request and reply, iterators | browser concerns it leaves to the page: tabs, frames, the offline queue, drawing rate |
| **MQTT.js** | quality-of-service levels, retained messages, an offline store | retained last values, acknowledged publishing, a persistent queue | no broker; one acknowledged level that is simple to reason about; conflation by key |
| **Centrifuge** | recovery by offset and epoch, token refresh callbacks, several transports | the same recovery model, the `auth` callback, WebSocket and SSE | one connection shared by all tabs; frame-paced delivery into a grid; the inspector |

**Where this design leads**

1. **One API for the page, the tabs and the server.** None of the above treats the in-page bus and the cross-tab channel as the same thing as the socket.
2. **One connection for every tab**, with parsing and conflation off the page's thread.
3. **Made for screens that tick**: conflation by key, delivery per animation frame, a grid sink with backpressure, hidden-tab behaviour, stated memory ceilings.
4. **It explains itself**: a reason recorded at every drop, "why didn't I get it" in words, an inspector that ships with the library.
5. **Testable and demonstrable offline**: a real protocol mock with fault injection, one deterministic clock, conformance vectors any server can run.

Also: first-class Server-Sent Events with headers and token renewal, no dependency, no build step, readable source, and accessibility of the
status and the inspector as part of the component.

**Left out, on purpose**

| Left out | Why |
|---|---|
| long-polling and other fallback transports | every supported browser has WebSocket, `EventSource` and streaming `fetch`; a proxy that blocks WebSocket passes SSE |
| presence, rooms, membership | a server feature; a server publishes it as an ordinary topic |
| a history query API | resume and replay cover a reconnect; history is a server's REST call |
| quality-of-service 2, transactions, consumer groups | acknowledged plus idempotent ids is enough for a browser and far simpler |
| binary encodings (MessagePack, Protobuf, delta compression) | JSON with the server's own compression is enough at the stated targets; the protocol reserves binary frames (Q7) |
| end-to-end encryption | TLS is the transport's job; payload encryption is the host's |
| a server | this is a browser library; the mock is for tests and demos only |
| an operator library | async iterators and plain functions; a page that wants operators can wrap an iterator |
| a list of servers with failover | an address may be a function asked at every connect; choosing a server is the host's or the load balancer's |

---

## 8. The wire protocol, version 1

A neutral, written contract any server in any language can implement; this library is one client of it and names no particular server. It
will live in [CONTRACTS.md](CONTRACTS.md) as "The events contract", with the conformance vectors as its test. The mock server is the reference.

### 8.1 Rules

- Frames are JSON objects with a type `t`. A transport message may hold one frame or an array of frames (a batch).
- **Versioning.** The client says `v` in `hello`; the server answers the version it will speak in `welcome` or refuses with `bye` (`version`).
  Within a version, unknown fields and unknown frame types are ignored (and counted), so both sides can add. A change that breaks is a new
  version; the WebSocket sub-protocol is `events.v1` (the name is an option for a host that needs its own).
- Times are milliseconds since 1970 UTC. Ids are strings of at most 64 characters. A frame is at most 1 MB unless `welcome` says otherwise.
- Errors are `{ code, detail }`: a code string and words. The protocol's own codes are below; a server may send any other code of its own.

### 8.2 Frames

**Client to server**

| `t` | Fields | Meaning |
|---|---|---|
| `hello` | `v`, `client`, `session?`, `token?` | first frame; `session` is the previous session when reconnecting |
| `sub` | `id`, `topic`, `after?`, `retained?`, `conflate?` | subscribe to a pattern; `after`: `{ "<stream>": { "epoch", "seq" } }` where the client was; `conflate`: `{ "key": true, "everyMs": 50 }`, a request the server may honour |
| `unsub` | `id` | |
| `pub` | `id`, `topic`, `data`, `key?`, `kind?`, `meta?`, `time`, `ack?` | publish; `id` is the message id and the idempotency key |
| `req` | `id`, `topic`, `data`, `ttl` | a request; the answer is `res` with `re` = `id` |
| `cancel` | `id` | the requester no longer waits |
| `replay` | `stream`, `epoch`, `from`, `to` | send these again |
| `auth` | `token` | a fresh token for the open connection |
| `ping` | `ts` | |
| `bye` | | closing on purpose |

**Server to client**

| `t` | Fields | Meaning |
|---|---|---|
| `welcome` | `v`, `session`, `time`, `heartbeatMs`, `can`, `limits`, `tokenExpiresAt?`, `resumed` | `can`: any of `replay`, `retained`, `conflate`, `request`, `publish`, `batch`; `limits`: `frameBytes`, `subs`, `publishPerSecond` |
| `subd` | `id`, `streams`, `recovered` | accepted; `streams`: `{ "<stream>": { "epoch", "seq" } }` now; `recovered`: whether everything after `after` will follow |
| `msg` | `id`, `topic`, `data`, `time`, `source`, `stream?`, `seq?`, `key?`, `kind?`, `re?`, `meta?`, `retained?`, `replayed?` | a message (section 2.2) |
| `ok` | `id` | a `pub` was accepted (or had been already) |
| `res` | `re`, `data` or `error` | the answer to a `req` |
| `err` | `id?`, `code`, `detail`, `retry?` | a `sub`, `pub`, `req` or `replay` failed; with no `id`, the connection's problem |
| `gap` | `stream`, `from`, `to`, `recoverable` | the server did not send these (a slow client, a trimmed log) |
| `auth` | `expiresAt` or `need: true` | the token was accepted, or a fresh one is wanted |
| `pong` | `ts`, `time` | the client's `ts` back and the server's time |
| `bye` | `code`, `detail`, `reconnect?` | the server is closing; `reconnect`: `{ "afterMs": 2000 }` or `false` |

**The protocol's codes**: `auth.required`, `auth.expired`, `forbidden`, `topic.invalid`, `topic.unknown`, `limit.subs`, `limit.rate`,
`limit.size`, `timeout`, `no.responder`, `replay.unavailable`, `version`, `slow`, `restart`, `internal`.

### 8.3 Over a WebSocket

Text frames; sub-protocol `events.v1`. The client sends `hello` first; a server closes a socket that has not within its own limit. Close
codes: 1000 and 1001 normal; 4400 a bad frame; 4401 not authenticated; 4403 forbidden; 4408 no `hello` in time; 4429 too fast; 4500 the
server's fault. The client does not try again after 4400 and 4403, asks `auth` after 4401, and backs off after the rest. Binary frames are
reserved.

```
C: {"t":"hello","v":1,"client":"drishti-events/3.0.0","token":"…"}
S: {"t":"welcome","v":1,"session":"s-81f","time":1794000000000,"heartbeatMs":15000,"can":["replay","retained","request","publish","batch"],"limits":{"frameBytes":1048576,"subs":200},"resumed":false}
C: {"t":"sub","id":1,"topic":"prices.fx.*","retained":true}
S: {"t":"subd","id":1,"streams":{"prices.fx":{"epoch":"a1","seq":48213}},"recovered":true}
S: [{"t":"msg","id":"m1","topic":"prices.fx.USDCAD","stream":"prices.fx","seq":48214,"key":"USDCAD","kind":"tick","time":1794000000120,"source":"pricing-1","data":{"bid":1.3612,"ask":1.3614}}]
C: {"t":"req","id":"r7","topic":"quotes.get","data":{"symbol":"CAD"},"ttl":2000}
S: {"t":"res","re":"r7","data":{"bid":1.3612}}
```

### 8.4 Over Server-Sent Events

Two addresses under the configured one:

- **The stream.** `POST <events>/stream` with `Accept: text/event-stream`, the token in `Authorization`, and a JSON body
  `{ "hello": {...}, "subs": [ {...}, ... ] }` (the `fetch` transport); or `GET <events>/stream?topic=<pattern>&topic=...` with the site's
  cookie (`EventSource`, which can send neither a body nor a header). Each SSE event's name is a frame's `t` and its data is the frame (or an
  array, for `batch`). `id:` is a cursor, opaque to the client. A comment line (`: hb`) every `heartbeatMs` is the heartbeat. The answer
  carries `Cache-Control: no-store` and should not be buffered by a proxy.
- **Sending.** `POST <events>/send` with the header `Events-Session: <session>` and a JSON array of client frames (`sub`, `unsub`, `pub`,
  `req`, `cancel`, `replay`, `auth`); the answer is `202` and the results arrive on the stream. A server that offers only the stream is
  read-only: subscriptions are fixed at connect and changing them reconnects with resume.
- **Resume.** The client sends the last cursor as `Last-Event-ID` (the `fetch` transport sets it; an `EventSource` sends it on its own
  reconnects, and the library adds `lastEventId=` to a fresh one) and, with `fetch`, the per-stream positions in each `sub`'s `after`.

```
event: welcome
data: {"t":"welcome","v":1,"session":"s-81f","heartbeatMs":15000,...}

id: c-9f3a
event: msg
data: {"t":"msg","id":"m1","topic":"prices.fx.USDCAD","stream":"prices.fx","seq":48214,"data":{"bid":1.3612}}

: hb
```

### 8.5 What a server owes its streams

- `seq` rises by one per message within a stream and an epoch; a stream is a topic by default, or a family of topics the server chooses
  (`subd` and each `msg` name it).
- A new `epoch` whenever the numbering starts again (a restart without the log).
- `recovered: true` only when every message after `after` will be sent; otherwise `false`, and the client resyncs.
- A server that cannot `replay` or retain says so in `can`; the client then resyncs on a gap instead of asking.
- A server that drops for a slow client sends `gap`.

### 8.6 What a server owes a publisher

`ok` when a `pub` is accepted; the same `ok`, and no second publication, when it sees an `id` again within its window (at least two minutes,
or the session). `err` with `retry: false` when trying again cannot help.

---

## 9. Budgets, support, accessibility and targets

### 9.1 Bytes

Budgets are raw bytes of the bundled files, as for every library (`tests/test_elements_budget.py`), with gzip as a guide.

| File | Budget | About, gzipped |
|---|---|---|
| `drishti_events.js` (everything but the two below) | 110,000 | 28 KB |
| `drishti_events-worker.js` (the shared hub's own code; it loads the bundle) | 8,000 | 3 KB |
| `drishti_events-inspector.js` and its sheet (loaded when opened) | 32,000 and 6,000 | 9 KB |
| drishti-core (the wildcard matcher) | unchanged at 180,000 | adds about 1 KB |
| drishti-data | lowered from 56,000 to 42,000 | what left it |

A page that only wants the page bus needs drishti-core alone.

### 9.2 Browsers

The current and previous major versions of Chrome, Edge, Firefox and Safari, desktop and mobile.

| Needs | Without it |
|---|---|
| WebSocket, `EventSource`, streaming `fetch`, `AbortController` | (all supported browsers have them) |
| `BroadcastChannel` | the `tabs` scope is off and says so |
| `SharedWorker` | the leader tab (Web Locks), else a connection per tab |
| IndexedDB | the queue is memory only |
| `file://` | page scope, mock server, queue and every gallery page work; real cross-tab and the shared worker depend on the browser and say so |

Under Node 22 or later the page scope, the mock and the WebSocket and `fetch` transports run as they are, which is how the tests run.

### 9.3 Accessibility

- The status badge is a `role="status"` live region: it speaks changes of state and counts ("Reconnecting", "Live again, 3 updates missed"),
  rate-limited to one announcement in five seconds, and never individual messages. Its button is a real button with a name.
- The inspector meets the libraries' rule (WCAG 2.2 AA): the grid's roles and keyboard, a focus trap only when it is a dialog, names on every
  control, outcomes as words and icons beside colour, tokens for light and dark and the three densities, reduced motion honoured.
- Nothing the library does steals focus or announces by itself in a host's page; flashing cells are the grid's and follow its reduced-motion rule.

### 9.4 Performance targets

Measured in the browser test on the ticker page and in a Node benchmark; a release fails the first two.

| Target | Figure |
|---|---|
| 10,000 messages a second (200-byte ticks over 2,000 keys) conflated into a 2,000-row grid | 60 frames a second; frame time p95 under 16.7 ms; the library's own work per frame under 3 ms with the shared hub, under 6 ms without; no task over 50 ms |
| a burst of 50,000 a second for 5 s | memory flat (bounded by the number of keys); every drop counted |
| page scope | publish to listener under 0.05 ms; 100,000 publishes a second; matching 10,000 subscriptions costs the number of segments, not of subscriptions |
| request and reply on the mock | under 1 ms |
| reconnect | first attempt within 1 s; 1,000 missed messages delivered within 200 ms of `welcome` |
| memory at default ceilings | under 5 MB |
| loading | the bundle parses in under 10 ms on a mid-range laptop |

---

## 10. Build plan, risks and questions

### 10.1 Steps

Grades: **deep** (state machines, concurrency, protocol), **standard** (well-specified features), **routine** (mechanical). Days are
builder-days.

| # | Step | Days | Grade | After |
|---|---|---|---|---|
| 1 | drishti-core: segment wildcards in `EventBus`; selection and filter channels become topics (chart, graph, tree, chip, grid) | 1.5 | standard | |
| 2 | The kernel: envelope, topics, `Events`, routes, the page scope, subscribe, publish, request, reply, once, streams, `AbortSignal`, kinds and validation, the clock and `testClock` | 4 | deep | 1 |
| 3 | The connection: state machine, the three transports, the protocol codec and `raw` mode, auth and refresh, the address guard; `Backoff`, `Heartbeat`, `parseSse` moved; `LiveClient` deleted from drishti-data | 5 | deep | 2 |
| 4 | Sequence: order, duplicates, gaps, replay, resume, retained, the feed monitor folded in | 3 | deep | 3 |
| 5 | Flow: conflation, frames, buffers, hidden tabs, page life, the grid sink (`TransactionSink` folded in) | 3 | deep | 2 |
| 6 | The queue: memory and IndexedDB, flush, the lock, sign-out | 2 | standard | 3 |
| 7 | Tabs: the `tabs` scope, the leader tab, the shared hub and its worker file (and the build tool's second file) | 4 | deep | 4 |
| 8 | The mock server, fault injection, `MockTabs`, the conformance vectors and runner | 3 | standard | 2 |
| 9 | Metrics, the recorder, the trace, the status badge | 3 | standard | 4, 5 |
| 10 | The inspector | 3 | standard | 9 |
| 11 | The gallery's Eventing section, the harness page, browser tests, the throughput test | 3 | standard | 5, 8, 10 |
| 12 | Docs and guards: the protocol into CONTRACTS.md, USING, DESIGN, the generated reference and `.d.ts`, CHANGELOG, the manifest, budgets, the one-home and no-host-words guards; this file deleted | 2 | routine | all |
| | **Total** | **36.5** | | |

With three builders: 2 then {3, 5, 8} then {4, 6, 9} then {7, 10} then {11, 12}; about 14 working days. A first usable release (steps 1 to 5
and 8: the API, the connection, reliability and the mock) is 19.5 days.

### 10.2 Risks

| Risk | Answer |
|---|---|
| The shared worker behaves differently per browser and is hard to debug | it is optional and third in no chain: the leader tab and a connection per tab are complete fallbacks; the worker runs the same modules as the page, so Node tests cover its logic |
| `BroadcastChannel` and workers under `file://` vary | the gallery's cross-tab page uses `MockTabs` in one page and says in words what the browser allows |
| IndexedDB is missing or slow in private windows | the queue degrades to memory and says so |
| The protocol is under-specified for a real server | the conformance vectors and runner are part of step 8, before any server work starts |
| The bundle grows past its budget | the inspector and the worker are separate files; the mock could become a third if needed |
| Removing `LiveClient` breaks hosts | a major version, a migration table in the CHANGELOG, `raw` mode so no server has to change the same day |
| Ordering across replay and conflation is subtle | one sequencer, property tests on the test clock with the mock's faults |
| Clock skew distorts latency | the offset from ping and pong; latency is marked approximate until three samples exist |
| Scope creep toward a messaging platform | the "left out" table is the line |

### 10.3 Questions for the owner

| # | Question | Recommendation |
|---|---|---|
| Q1 | A ninth library, `drishti-events`, or inside drishti-data and core? | A ninth library; only the wildcard matcher goes into core. |
| Q2 | The version: 3.0.0 with `LiveClient`, `pipeToGrid`, `FeedMonitor` and `SELECTION_EVENT` removed, no aliases? | Yes: one way, a clean major version. |
| Q3 | Wildcards as `*` (one segment) and `>` (the rest)? | Yes; the most widely known form, and a lone `*` keeps today's meaning on a component's bus. |
| Q4 | The protocol's public name and sub-protocol `events.v1`, published in CONTRACTS.md with the vectors? | Yes; neutral, with the sub-protocol's name an option. |
| Q5 | Is the shared hub on by default? | Opt-in (`share: true`) in the first release; consider `auto` for SSE later. |
| Q6 | Is the queue persisted by default? | No: memory by default, IndexedDB by choice per publish or per `Events`. |
| Q7 | Binary frames (MessagePack, Arrow) in version 1? | No; reserved. Measure first. |
| Q8 | The frame scope (`postMessage` to embedded frames) in the first release? | After it, unless an embedding host needs it at once (2 days). |
| Q9 | Presence, history and a long-polling fallback stay out? | Yes. |
| Q10 | The inspector inside drishti-events as a second file that loads the grid when opened, or a tenth library? | Inside, as a second file. |
| Q11 | Ship the first usable release (19.5 days) before the tabs, queue and inspector steps? | Yes: hosts can start adopting while the rest is built. |
| Q12 | May the request and reply calls also be offered server to client (a server asks the page)? | Not in version 1. |

---

## 11. A library that names no host

drishti-events is for anyone's page and anyone's server. It contains no address, route, header name, auth scheme, message type, topic name,
error code, settings key or product assumption of any host. Everything a host needs is an option (`url` or the `events` endpoint, `auth`,
`headers`, `routes`, `namespace`, the sub-protocol's name, `raw` mode's mapping functions) or an adapter that lives **in the host's own
code**. The wire protocol is a neutral specification; a host's server is one implementer among any number.

**The guard.** A static test (beside the existing "no domain vocabulary" guard) reads every file of `elements/drishti-events/`, the gallery's
Eventing pages and the conformance vectors and fails on host-specific words and paths: `/api/`, `/v1/` style routes, lowercase dotted
settings keys beginning `drishti.`, header names beginning `X-Drishti-`, error-code prefixes such as `DRS-`, and a list of host vocabulary
(`Sutra`, `mnemonic`, `lake`, `pack`, `blotter`, `VaR`, `trade` and the like; the gallery's made-up sample data is allowed its instrument
names). Allowed, because they are the library's own name: the namespace `Drishti.elements`, the `drishti_` file prefix, `drishti-events`,
and the copyright header. The examples in this document follow the same rule (`example.org`, `prices.fx.*`, `chat.lobby`).

---

## Appendix A: adoption by the Drishti product

> This appendix is about one host, the Drishti product, which will use drishti-events through its pinned, vendored copy of Drishti Elements
> in its release "i6". **Everything named here lives in the Drishti repository, not in Elements**: the adapters, the topic names, the Java
> endpoints. It is written here only so the design can be read in one place; it belongs in the Drishti repository's own documents and should
> be moved there before this branch is published (question A5). The list was made by a read-only search of that repository and each item
> is to be confirmed when its step starts.

### A.1 What talks live today

**In the browser (the console's own scripts)**

| Today | Lines | What it is |
|---|---|---|
| `drishti_channel.js`, `drishti_live-hub.js` | 500 | one connection per browser: a `SharedWorker`, else a Web Lock leader over a `BroadcastChannel`, over one multiplexed SSE channel with POSTs to add and remove subscriptions; its own tab-to-hub protocol; a session fingerprint |
| nine callers of `Drishti.Channel.subscribe(key, handlers)` | | views (`drishti_live.js`), alerts and discussion (`alerts`), monitors (`monitor:<name>`), live result sets (`live:<id>`), live pivots (`pivotlive:<id>`), BI report live (`bilive:<id>`), BI queue streams (`mq:<id>`), BI runs (`biruns`), compute requests (`compute:<id>`) |
| `web/embed/connection.js` and its tokens | 136 | the embed's channel: SSE read with `fetch`, a bearer token renewed on the open channel, POSTed subscriptions, back-off |
| the renderer library's `drishti_net.js` | | a view's stream through `LiveClient` |
| `drishti_pivot-switches.js` | | a hand-written SSE reader for the progressive pivot answer (a POST that streams phases) |
| timers that ask again | | cluster members (5 s), data-out streams (5 s), capacity (60 s), a module switched off (15 s), a four-eyes decision (5 s), the server-reachable probe (2 to 30 s), two admin pages |

No separate connection for news was found: news panels are view panels and ride the view streams.

**On the servers**

| Today | Where |
|---|---|
| ten SSE endpoints built on `SseEmitter`, each with its own event names, hello, heartbeat comment and (two of them) event ids | the Java server: views, alerts, monitors, live result sets, live pivots, BI report live, BI queue streams, BI runs, compute requests, and the progressive pivot answer |
| the console's relays: the multiplexed channel and its change call, per-resource stream relays, the embed channel; the session re-check; the cap of 32 subscriptions; the step that turns a view frame's panels into HTML | the console (Python today) |
| member-to-member feeds between cluster nodes | the Java server (`net`) |

No WebSocket endpoint exists on the server today.

### A.2 How each moves (and what is deleted)

**One adapter in the Drishti repository**, `drishti_events-host.js` (about 100 lines), is the only place that knows both sides: it calls
`connect()` with Drishti's address, `share: true`, the `namespace` from the session fingerprint, `auth` for the embed, and the routes; and it
owns the table from Drishti's subscription keys to topics. The library is given nothing Drishti-specific.

| Today's key or code | Topic (Drishti's own naming) | Notes |
|---|---|---|
| a view `kind/id` | `view.<kind>.<id>` | retained: the view's generation; frames by seq |
| `alerts` | `alerts.me` | already has a sequence; resume replaces the "hello" catch-up |
| `monitor:<name>` | `monitor.<name>` | conflated by row key |
| `live:<id>` | `liveset.<id>` | `byKind({ hello, rows, resync, gone })` feeds `LiveSetGrid` unchanged; the window call becomes a request |
| `pivotlive:<id>` | `pivot.live.<id>` | `patch`, `reshape`, `ended` as kinds |
| `bilive:<id>`, `mq:<id>`, `biruns` | `bi.report.<id>`, `bi.queue.<id>`, `bi.runs` | queue frames conflated: the latest state wins |
| `compute:<id>` | `compute.<id>` | `progress`, `state`, `done`, `failed` as kinds |
| the embed connection | the same `connect()` with the `fetch` transport and `auth` | `connection.js` and its renewal timer deleted |
| the renderer's `LiveClient` | `connect()` | |
| the progressive pivot reader | the library's `readSse(response)` | it is one answer that streams, not a subscription; the hand-written parser is deleted |
| the timers | topics `admin.net.members`, `admin.dataout.streams`, `admin.capacity`, `modules.state`, `approvals.<id>` | the page reads once, then listens; the timers are deleted |
| the server-reachable probe | `$events.state` plus a topic `server.state` | the banner follows the connection's state; the probe stays only for pages with no connection |

Deleted in Drishti, with nothing left beside the new way: `drishti_channel.js`, `drishti_live-hub.js`, the hub's tab protocol and its tests,
`embed/connection.js`, the hand-written SSE reader, the polling timers above, and `Drishti.Channel` itself (its nine callers move to
`events.subscribe(topic).byKind(handlers)`).

### A.3 The server side

The server implements the published protocol once, in one place, and every feed plugs into it.

| Part | What it is | Changes |
|---|---|---|
| **The events endpoint** | one endpoint that speaks section 8: `stream` and `send` for SSE, and a WebSocket handler, over one codec | new; owns `hello` and `welcome`, the session, the subscription table (wildcards), heartbeats, limits (today's cap of 32 becomes `limits.subs`), close codes |
| **Auth** | the server's existing principal on the handshake (cookie session, or bearer token for the embed), a per-topic "may this person hear this" check, the periodic session re-check | today's re-check and "end this person's channels" move here: an ended session is `bye` with `auth.expired`; a renewed token is the `auth` frame |
| **The stream log** | per stream: `seq`, `epoch`, a bounded ring for replay (for example 1,000 messages or two minutes), and the last value per key for `retained` | new; replaces each controller's own hello and catch-up logic |
| **Topic providers** | a small interface each feed implements: which topics it owns, the check, and how to open a topic for a subscriber | the nine controllers' streams become providers; their `SseEmitter` endpoints, event names and heartbeat comments are deleted |
| **Conflation** | honouring `conflate` for monitors and queue frames | the "latest state wins" throttles that exist move behind one implementation |
| **Cluster** | a topic owned by another node is opened there and forwarded | the existing node-to-node forwarding sits behind the provider; member-to-member feeds themselves do not change in i6 (question A3) |
| **The console hop** | the console (moving to Spring Boot in i6) no longer multiplexes or relays by hand | its channel, change call and per-resource relays are deleted; the frame-to-HTML step for view panels stays wherever i6 places view rendering, behind the view provider |
| **Proof** | the library's conformance vectors run against the server in its build | a failing vector fails the build |

The progressive pivot answer stays an HTTP answer that streams. Server-side ingestion (the live connectors reading Kafka, NATS or queues)
is not browser eventing and does not change.

### A.4 The order of work inside i6

| # | Step | Where | Days |
|---|---|---|---|
| 0 | Pin the Elements release that holds drishti-events into the vendored copy | Drishti | 0.5 |
| 1 | The events endpoint: codec, session, subscriptions, heartbeat, auth, limits, the SSE transport; the conformance vectors in the build | Java | 4 |
| 2 | The stream log: seq, epoch, replay ring, retained values | Java | 2 |
| 3 | The host adapter; `drishti_channel.js` and `drishti_live-hub.js` deleted; views and alerts as the first two providers and callers, end to end | Java and browser | 3 |
| 4 | The other seven providers and their callers (monitors, live result sets, live pivots, BI report, BI queues, BI runs, compute) | Java and browser | 6 |
| 5 | The WebSocket transport on the same codec | Java | 2 |
| 6 | The embed and the renderer on `connect()`; `connection.js` deleted | browser | 2 |
| 7 | Polling to push: the admin pages, modules, approvals, the server-reachable banner (new small providers) | Java and browser | 3 |
| 8 | Cluster: forwarding behind providers; failover and resume across a node restart | Java | 2 |
| 9 | Delete the old endpoints and relays; SDK clients, tests, docs, screenshots | both | 2 |
| | **Total** | | **26.5** |

Steps 1 and 2 can start as soon as the library's conformance vectors exist (library step 8), before the library is finished. With three
builders, about ten working days after that.

### A.5 Questions for the owner (adoption)

| # | Question | Recommendation |
|---|---|---|
| A1 | Delete the per-resource SSE endpoints kept "for API clients", so API clients speak the protocol too? | Yes: one way; the SDK clients are updated in step 9. |
| A2 | SSE first, WebSocket in the same release? | Yes: SSE (with `fetch`) carries everything today's console does; WebSocket follows in step 5 for fast feeds and publishing. |
| A3 | Do member-to-member feeds between cluster nodes stay as they are in i6? | Yes; they are not browser code. Moving them onto the same protocol is a later, separate decision. |
| A4 | Topic names (the table in A.2): fixed by Drishti's adapter, documented in Drishti's contracts? | Yes. |
| A5 | Move this appendix into the Drishti repository before this branch is published? | Yes: the Elements repository is public and should describe no host. |
