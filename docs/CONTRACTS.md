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
Drishti.elements.core.configure({ endpoints: { live: '/api/live', changes: '/api/changes', pivotPage: '/pivot', capabilities: '/api/data/capabilities' } });
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

## The ViewModel (drishti-views)

A screen a server sends to `paint(el, viewModel)` is a **ViewModel**, contract 1.x. Its one home is drishti-rachana's
`spec/1/viewmodel.schema.json`; drishti-views carries a byte-for-byte copy (`elements/drishti-views/spec/drishti_viewmodel.schema.json`)
whose hash is pinned beside it, and `python3 tools/views/gen.py --sync <drishti-rachana checkout>` takes a new one. A view's `contract`
is `major.minor`: the painter draws major 1, ignores what a newer minor adds (an unknown field, an unknown word, an unknown kind is drawn
as a titled panel that says so) and refuses another major in words. A live view's frames are `{seq, generation, patches}` with the ops
`strip`, `panel`, `provenance`, `deleted` and `restored`; frames are applied in `seq` order and an older one is dropped. The
conformance vectors (`elements/drishti-views/spec/drishti_vectors.json`) say what a validator answers for valid and invalid views and
frames.
