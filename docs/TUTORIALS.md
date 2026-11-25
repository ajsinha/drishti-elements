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
# Tutorials

Four hands-on tutorials, each with commands you can run. They need Python 3 and Node (see [the README](../README.md#requirements)); a browser opens the pages. On Windows use `py -3.13` for `python3`.

## 1. Build the release tree and open the gallery

```bash
python3 tools/elements/cli.py dist --out dist          # writes dist/drishti-elements-<version>/ and the same as a zip, with SHA-384 hashes
cd dist/drishti-elements-*/ && python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/gallery/drishti_gallery.html`. Every component is live there: pick one in the list, change its options, read its events and the code that makes it. The PyCharm and VS Code launchers (`Elements dist`, `Elements gallery server`) run the same commands.

## 2. A page with a grid and a whole screen

Stay in the release tree of tutorial 1. First write the view with the builders, which fill in what a ViewModel requires and check the result:

```bash
mkdir app
cat > mk.cjs <<'EOF'
const fs = require('fs');
const { view, validate } = require('./elements/drishti-views/drishti_views.js');   // the bundle is a classic script that also loads under Node
const vm = view('EMEA').title('Region · Orders', 'EMEA').ref('region', 'EMEA')
  .strip([{ label: 'Booked', text: '18,420,350', emphasis: true }])
  .hbar('By country', { bars: [{ label: 'DEU', value: 40, text: '40' }, { label: 'FRA', value: 25, text: '25' }] }, { span: 4 })
  .toJSON();
fs.writeFileSync('app/orders.json', JSON.stringify(vm, null, 2));
console.log('valid:', validate(vm, { strict: true }).ok);      // valid: true
EOF
node mk.cjs
```

Then the page, `app/index.html`:

```html
<!doctype html><meta charset="utf-8"><title>Orders</title>
<link rel="stylesheet" href="../css/drishti_tokens.css">
<script src="../elements/drishti-core/drishti_core.js"></script>
<div id="orders"></div>
<div id="grid" style="height: 200px"></div>
<script>
  Drishti.elements.load('drishti-views').then(() => Drishti.elements.views.paint(document.getElementById('orders'), 'orders.json'));
  Drishti.elements.load('drishti-grid').then(() => new Drishti.elements.grid.Grid(document.getElementById('grid'), {
    columns: [{ field: 'desk', header: 'Desk' }, { field: 'pnl', header: 'P&L', type: 'number', format: 'amount0' }],
    rows: [{ desk: 'Rates', pnl: 1250000 }, { desk: 'FX', pnl: 560000 }], getRowId: (r) => r.desk }));
</script>
```

Open `http://127.0.0.1:8765/app/index.html`. The view is the painter ([VIEWS.md](VIEWS.md)), the grid a widget ([USING.md](USING.md)). A view with a hand-made `orders.json` that misses a required field is refused with the path and the fix: run `validate` on it.

## 3. Events in a script, then in a page

```bash
node -e "
const E = require('./elements/drishti-events/drishti_events.js');
const events = E.connect();                                         // no server: the page (here, the process)
events.on('prices.*.USDCAD', (m) => console.log('got', m.topic, m.data));
events.publish('prices.fx.USDCAD', { bid: 1.36 }).then(() => setTimeout(() => process.exit(0), 300));"
```

It prints `got prices.fx.USDCAD { bid: 1.36 }`. In a page the same calls work, and `connect('/events')` adds a server and `events.inspect()` opens the inspector ([EVENTS.md](EVENTS.md)). The gallery's Eventing pages run every example against a mock server.

## 4. Two files for your own application

```bash
python3 tools/elements/cli.py pack --libs grid,chart --theme dark --out web/vendor/drishti
```

It writes `drishti-elements.js`, `drishti-elements.css` and `drishti-elements-pack.json` (the SHA-384 of each), and the engine files the libraries read at run time beside them. Add `--no-engines` when the page loads ECharts itself and `--maps` to carry the map shapes. A page then needs two tags:

```html
<link rel="stylesheet" href="/vendor/drishti/drishti-elements.css">
<script src="/vendor/drishti/drishti-elements.js"></script>
```

Check the hash against `drishti-elements-pack.json` for subresource integrity ([USING.md](USING.md#versions-and-integrity)).
