<!--
  Drishti Elements

  Copyright (c) 2026 Ashutosh Sinha <ajsinha@gmail.com>.
  All rights reserved.

  PROPRIETARY.

  This file is the proprietary property of Ashutosh Sinha.
  Copying, use, modification or distribution of this file, via any medium,
  is not permitted except with the express prior written permission of the
  copyright holder.

# Moving a host from Elements 2.4 to 3.0

3.0.0 is a breaking release for a host that used drishti-data's live client or the shared-bus channel names. Every removal has one
replacement; nothing is aliased. The reasons and the new library are in the CHANGELOG (3.0.0-rc.1 and 3.0.0) and in
[EVENTS](EVENTS.md) (drishti-events). 3.1.0 adds drishti-views and breaks nothing.

## Connections and feeds (drishti-data to drishti-events)

| Removed in 3.0.0 | Use instead |
|---|---|
| `LiveClient`, `LIVE_STATES`, `live(options)` | `connect(url, options)` of drishti-events; `connect(url, { protocol: 'raw' })` reads the same plain feeds as before (SSE or WebSocket); states are the subscription's `state` and `$events.state`; the status badge is `statusBadge(el, events)` |
| `parseSse(text)` | `parseSse` and `readSse(response)` now live in drishti-events (with `retry:` support); a host rarely needs them, `connect(...)` reads the stream |
| `Backoff`, `Heartbeat` | the connection's own reconnect (jittered back-off, the server's advice a floor) and heartbeat watchdog, set with the connection options; the classes are not public |
| `TransactionSink`, `pipeToGrid(feed, grid, options)` | `subscription.toGrid(grid, { getRowId, onStats })` (at most one batch in flight; conflation with the subscription's `conflate`, `buffer` and `deliver` options). `liveSource` and `grid.connectLive` take a drishti-events subscription as their feed |
| `FeedMonitor`, `feedBadge(el, monitor, options)` | the subscription's `stats`, `metrics()` and `events.explain(...)`; the badge is `statusBadge(el, events)` |
| `drishti_backpressure.js` (the file) | the subscription's flow pipeline (`conflate`, `buffer`, `deliver`, `batch`) |

The guard that only one library opens a `WebSocket` or `EventSource` now names drishti-events (and `BroadcastChannel`,
`SharedWorker`): a host that opened its own connection beside the library is not affected, but a test that scans for it moves with the
guard. An address that carries a secret in its query is refused by `connect` (use the `auth` callback).

## Linked selection and filters (drishti-core)

| Removed in 3.0.0 | Use instead |
|---|---|
| `SELECTION_EVENT` (the event `selection`) | the topic `ui.selection.<channel>`; build it with `selectionTopic(channel)`; listen with `bus.on(topic, fn)` or a pattern such as `ui.selection.*` |
| `FILTER_CHANNEL` (the event `filter`) | the topic `ui.filter.<channel>`; `filterTopic(channel)`; a filter bar's payload is unchanged (`{ model, quickFilter, source }`) |
| the filter bar's option `channel` taking an event name | `channel` is now a channel **name** (default `default`); pass `'orders'`, not `'filter'`. Grid `followFilters({ channel })` takes the same name |
| `EventBus` listening to exact event names only | patterns over dotted topics (`*` one segment, a last `>` the rest); exact names still work. Helpers `isTopic`, `isPattern`, `topicMatches`, `segment`, `unsegment`. A listener on the lone `*` still hears everything, after exact and pattern listeners |

Chart, graph, tree, selection chip, grid and the filter bar moved together: a host that wired them by the old constants only needs
the topic names above; a host that emitted `ui.selection.*` itself needs nothing.

## Budgets and files

- drishti-data's byte budget is now 42,000 bytes; drishti-events has its own bundle (budget settled in 3.0.0) and parts loaded on
  demand (`drishti_events-mock.js`, `drishti_events-worker.js`, the inspector). The release tree carries them; a host that copies
  files by name copies them too.
- `loadPart(library, part)` of drishti-core loads a part; the manifest names each library's parts.

## A checklist for a console

1. Search the host for `LiveClient`, `live(`, `parseSse`, `Backoff`, `Heartbeat`, `TransactionSink`, `pipeToGrid`, `FeedMonitor`,
   `feedBadge`, `SELECTION_EVENT`, `FILTER_CHANNEL`, `LIVE_STATES`, `drishti_live-client`, `drishti_backoff`, `drishti_feed-monitor`,
   `drishti_backpressure`.
2. Replace each with the row above; connect once with `connect(...)` and give subscriptions to the grids.
3. Pass channel names (not event names) to filter bars and `followFilters`.
4. Run the host's page tests, then `docs/API.md` (generated) for the exact signatures.
