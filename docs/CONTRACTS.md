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
# Contracts with a server

The libraries run with no server. A host that has one tells the libraries where it is with `configure({ endpoints })` and answers in the shapes
below. Anything a component needs and has no address for is off, and says so in words.

```js
Drishti.elements.core.configure({ endpoints: { live: '/api/live', changes: '/api/changes', pivotPage: '/pivot', capabilities: '/api/data/capabilities',
                                             events: '/events' } });
```

## The error contract

A failed call is an `ApiError` in words, never a bare status. The server answers a non-2xx status with JSON `{ "code": "<any string>", "detail": "<words>" }`
(a list `issues` names the problems of a refused form, field by field). The client's message is `"<code> <detail>"`, for example `E-1001 No trade IRS-48213 here`. A GET that meets a network
failure or a 502, 503 or 504 is tried again with a growing pause; a 401 calls `onUnauthorized`. The as-of date of a page goes with every call in the
header named by `asOfHeader` (default `X-Drishti-As-Of`).

## The live-set contract (drishti-grid, `httpLiveApi`)

`base` is the live-set address (the endpoint `live`) and `id` names one set. Every answer is JSON.

| Call | Request | Answer |
|---|---|---|
| `rows(params)` | `GET <base>/<id>/rows?limit&offset&sort&...` | the rows of the set's snapshot, in order |
| `row(entity)` | `GET <base>/<id>/rows/<entity>` | one record |
| `edit(body)` | `POST <base>/<id>/edit` | the saved record; on a conflict a non-2xx status with the error contract |
| `window(stream, body)` | `POST <base>/<id>/stream/<stream>/window` | the stream's window moved |
| `history(kind, entity)` | `GET <changes>?kind&entity&limit=50` | the change history of a record (`changesUrl`, or the endpoint `changes`) |
| `mine(kind)` | `GET <changes>?mine=true&kind&limit=100` | the signed-in person's own changes |

`pivotHref(layout, live)` links to the endpoint `pivotPage` (`?source=<kind>&lay=<layout JSON>`, and `&live=1`); with none configured it is empty and the
grid draws no Pivot link.

## The data-capabilities contract (drishti-data, `ArrowClient`)

`capabilitiesUrl` (default: the endpoint `capabilities`) answers JSON `{ "flightHttp": { "doGet": "<url>" } | null }`. When `flightHttp` is offered the
client POSTs `{ ticket }` to `doGet` and reads an Arrow stream; otherwise it reads Arrow over HTTP (`Accept: application/vnd.apache.arrow.stream`), then
JSON. With no address at all it uses Arrow or JSON over HTTP only.

## Explain

A component that offers Explain takes an option `explain` (a function from what was clicked to a promise of the answer). The answer is drishti-core's
`ExplainResult`: optional `title`, `value`, `scope`, `steps` (label and value), `parts` (label, value and text: a bar each), `partsTitle`, `scenarios`,
`trend`, `limit`, `links` (label and href) and `note`. The drawing is `renderExplain(element, { result })`.

## Pivots

A grid with `clientAggregation: false` computes no figure: its `serverPivot(request, signal, rows)` option receives `{ view }` (rows, columns, values, filters)
and answers in display order with every subtotal and total already computed. A non-additive measure (a ratio, a distinct count, a
percentile) is therefore right at every level and marked in the grid.

The request a server-side row model sends, one shape for rows, groups and pivots:

```json
{ "view": { "rows": ["desk", "book"], "columns": ["region", "currency"], "values": [{"measure": "mtm", "agg": "sum"}],
            "filters": {"trader": {"not": ["L. Duval"]}}, "valueFilters": [{"measure": "var", "op": ">", "value": 400000, "level": "leaf"}],
            "totals": {"rows": "after", "columns": "after", "grand": true} },
  "groupKeys": ["Rates"], "window": {"start": 0, "end": 200}, "sort": [{"by": "var", "column": {"region": "EMEA"}, "dir": "desc"}],
  "expandedColumns": ["Americas", "EMEA"] }
```

The answer holds the rows in display order, the pivot result column keys, the cells with values, texts and tones, the totals, the approximation marks and
the row count.

## The events contract (drishti-events, protocol version 1)

A neutral, written contract any server in any language can implement; drishti-events is one client of it and names no particular server.
The address is the one given to `connect(url)`, or the endpoint `events`. The mock server (`drishti_events-mock.js`) is the reference, and
the conformance vectors are its test: `node tools/events/conformance.mjs --url <address>` runs `tests/events/protocol-v1.json` against a
server with raw WebSocket clients (never the library's own), skipping a vector whose capability the server's `welcome.can` lacks.

### Rules

- Frames are JSON objects with a type `t`. A transport message may hold one frame or an array of frames (a batch).
- **Versioning.** The client says `v` in `hello`; the server answers the version it will speak in `welcome` or refuses with `bye` (`version`).
  Within a version, unknown fields and unknown frame types are ignored (and counted), so both sides can add. A change that breaks is a new
  version; the WebSocket sub-protocol is `events.v1` (the name is an option for a host that needs its own).
- Times are milliseconds since 1970 UTC. Ids are strings of at most 64 characters. A frame is at most 1 MB unless `welcome` says otherwise.
- Errors are `{ code, detail }`: a code string and words. The protocol's own codes are below; a server may send any other code of its own.

### Frames

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
| `msg` | `id`, `topic`, `data`, `time`, `source`, `stream?`, `seq?`, `key?`, `kind?`, `re?`, `meta?`, `retained?`, `replayed?` | a message (its fields are `Message` in [API.md](API.md#drishti-events)) |
| `ok` | `id` | a `pub` was accepted (or had been already) |
| `res` | `re`, `data` or `error` | the answer to a `req` |
| `err` | `id?`, `code`, `detail`, `retry?` | a `sub`, `pub`, `req` or `replay` failed; with no `id`, the connection's problem |
| `gap` | `stream`, `from`, `to`, `recoverable` | the server did not send these (a slow client, a trimmed log) |
| `auth` | `expiresAt` or `need: true` | the token was accepted, or a fresh one is wanted |
| `pong` | `ts`, `time` | the client's `ts` back and the server's time |
| `bye` | `code`, `detail`, `reconnect?` | the server is closing; `reconnect`: `{ "afterMs": 2000 }` or `false` |

**The protocol's codes**: `auth.required`, `auth.expired`, `forbidden`, `topic.invalid`, `topic.unknown`, `limit.subs`, `limit.rate`,
`limit.size`, `timeout`, `no.responder`, `replay.unavailable`, `version`, `slow`, `restart`, `internal`.

### Over a WebSocket

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

### Over Server-Sent Events

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

### What a server owes its streams

- `seq` rises by one per message within a stream and an epoch; a stream is a topic by default, or a family of topics the server chooses
  (`subd` and each `msg` name it).
- A new `epoch` whenever the numbering starts again (a restart without the log).
- `epoch: null` in a `sub`'s `after` or in a `replay`: the client has heard no epoch for that stream (a stream born after the subscription is
  first named by a `msg`, which carries none). The server takes it as its current epoch only when the stream began in that epoch; otherwise it
  answers `recovered: false` and the client resyncs.
- A retained value (`retained: true`) is outside the numbering: a snapshot from before the stream's position, delivered once by id.
- `recovered: true` only when every message after `after` will be sent; otherwise `false`, and the client resyncs.
- A server that cannot `replay` or retain says so in `can`; the client then resyncs on a gap instead of asking.
- A server that drops for a slow client sends `gap`.

### What a server owes a publisher

`ok` when a `pub` is accepted; the same `ok`, and no second publication, when it sees an `id` again within its window (at least two minutes,
or the session). `err` with `retry: false` when trying again cannot help.

### Raw mode: a server that does not speak the protocol

`connect(url, { protocol: 'raw' })` reads a server's own JSON over Server-Sent Events (or a WebSocket): every value is a message on the topic
`feed` (or `topicOf(value)`), its id the SSE `id:` (or `idOf`), its sequence `value.seq` (or `seqOf`), its kind the SSE event's name (or
`kindOf`). A raw connection only listens: publishing and requests need the protocol. To resume, the server reads the last id from
`Last-Event-ID` or, on a fresh `EventSource`, from `lastEventId=` in the address; with `share: true` a tab that takes over the shared
connection resumes from the id the tabs last heard.
