/*
 * Drishti Elements
 *
 * Copyright (c) 2026 Ashutosh Sinha <ajsinha@gmail.com>.
 * All rights reserved.
 *
 * PROPRIETARY.
 *
 * This file is the proprietary property of Ashutosh Sinha.
 * Copying, use, modification or distribution of this file, via any medium,
 * is not permitted except with the express prior written permission of the
 * copyright holder.
 *
 * See the LICENSE file in the root of this repository.
 */
/* drishti-core under Node (node --test): formats by the server's rules, dates, theme tokens and contrast, the API client, the bus, the
   keys, roving index arithmetic, the loader's manifest, and the bundle giving the same API as the modules. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as C from '../../elements/drishti-core/src/drishti_index.js';

const require = createRequire(import.meta.url);
const M = '−';

test('numbers round half up on the decimal value, as the server (BigDecimal HALF_UP), never on the binary one', () => {
  assert.equal(C.roundHalfUp(1.005, 2), '1.01');
  assert.equal(C.roundHalfUp(2.5, 0), '3');
  assert.equal(C.roundHalfUp(9.995, 2), '10.00');
  assert.equal(C.roundHalfUp(0.125, 2), '0.13');
  assert.equal(C.plainDigits(1e-7), '0.0000001');
  assert.equal(C.plainDigits(1.5e22), '15000000000000000000000');
});

test('the server named formats: amount, signed, pct, compact, dates; null is empty; unknown names show text', () => {
  assert.equal(C.formatNamed('amount0', 1234567.5), '1,234,568');
  assert.equal(C.formatNamed('amount2', -1234.005), M + '1,234.01');
  assert.equal(C.formatNamed('signed0', 12), '+12');
  assert.equal(C.formatNamed('signed0', -0.4), '0');                     // rounds to zero: no sign
  assert.equal(C.formatNamed('pct2', 0.01234), '1.23%');
  assert.equal(C.formatNamed('pct4', 0.0123456), '1.2346%');             // level 1.2 names, Drishti's definitions
  assert.equal(C.formatNamed('bp1', 12.34), '+12.3 bp');
  assert.equal(C.formatNamed('bp1', -0.04), '0.0 bp');                    // rounds to zero: no sign
  assert.equal(C.formatNamed('df4', 0.987654), '0.9877');
  assert.equal(C.formatNamed('price4', 1234.56789), '1,234.5679');
  assert.equal(C.formatNamed('compact', 1234567), '1.2m');
  assert.equal(C.formatNamed('compact', -2.5e9), M + '2.5bn');
  assert.equal(C.formatNamed('compact', 999), '999.0');                   // the server's: one decimal below a thousand too
  assert.equal(C.formatNamed('dmy', '2026-11-07'), '07 Nov 2026');
  assert.equal(C.formatNamed('date', '2026-11-07T10:00:00Z'), '2026-11-07T10:00:00Z');
  assert.equal(C.formatNamed('amount0', null), '');
  assert.equal(C.formatNamed('amount0', 'n/a'), 'n/a');
  assert.equal(C.formatNamed('nope', 12), '12');
  assert.equal(C.formatNamed('amount0', C.MASK), C.MASK);
});

test('a pack format defined at run time is used like a bundled one (rate5 from the core pack)', () => {
  assert.equal(C.hasFormat('rate5'), false);
  C.defineFormats({ rate5: { type: 'number', decimals: 5, grouping: false } });
  assert.equal(C.formatNamed('rate5', 1234.123456), '1234.12346');
  assert.equal(C.hasFormat('bp1'), true);                                // bundled since Rachana level 1.2
  assert.equal(C.formatBasisPoints(0.0012, { scale: 10000 }), '+12.0 bp');
});

test('number options: grouping, minus, sign, prefix, max decimals, locale, empty', () => {
  assert.equal(C.formatNumber(-1234.5, { decimals: 2 }), M + '1,234.50');
  assert.equal(C.formatNumber(-1234.5, { decimals: 0, minus: '-' }), '-1,235');
  assert.equal(C.formatNumber(1.5, { decimals: 0, maxDecimals: 2 }), '1.5');
  assert.equal(C.formatNumber(1234.5, { decimals: 2, grouping: false }), '1234.50');
  assert.equal(C.formatNumber(1234.5, { decimals: 1, locale: 'de-DE' }), '1.234,5');
  assert.equal(C.formatNumber(null), '—');
  assert.equal(C.formatNumber(NaN, { empty: '' }), '');
  assert.equal(C.formatPercent(0.1234), '12.3%');
  assert.equal(C.formatCurrency(1234.5, 'USD'), '$1,234.50');
  assert.equal(C.formatCurrency(1234.5, 'JPY'), '¥1,235');
  assert.equal(C.formatCurrency(1, 'CHF'), '1.00 CHF');
});

test('compact: the server units, trims, tiers and per-unit decimals for the console screens', () => {
  assert.equal(C.formatCompact(1500000, { decimals: 2, trim: true }), '1.5m');
  assert.equal(C.formatCompact(1.2e12, { units: [['tn', 1e12], ['bn', 1e9], ['m', 1e6], ['k', 1e3]], trim: true }), '1.2tn');
  assert.equal(C.formatCompact(5000, { units: [['k', 1e3, 1e4]], decimals: 1, smallDecimals: 2, trim: true }), '5,000');
  assert.equal(C.formatCompact(150000, { decimals: (a) => (a >= 1e5 ? 0 : 1) }), '150k');
  assert.equal(C.formatCompact(-3, { decimals: 0, minus: '-' }), '-3');
  assert.equal(C.formatCompact(2e6, { prefix: '$' }), '$2.0m');
});

test('business dates: ranges, business days, holidays', () => {
  assert.equal(C.formatDateRange('2026-11-03', '2026-11-07'), '3–7 Nov 2026');
  assert.equal(C.formatDateRange('2026-10-28', '2026-11-03'), '28 Oct – 3 Nov 2026');
  assert.equal(C.formatDateRange('2025-12-28', '2026-01-03'), '28 Dec 2025 – 3 Jan 2026');
  assert.equal(C.addBusinessDays('2026-11-06', 1), '2026-11-09');                       // Friday to Monday
  assert.equal(C.addBusinessDays('2026-11-09', -1), '2026-11-06');
  assert.equal(C.addBusinessDays('2026-12-24', 1, { holidays: ['2026-12-25'] }), '2026-12-28');
  assert.equal(C.previousBusinessDay('2026-11-09'), '2026-11-06');
  assert.equal(C.businessDaysBetween('2026-11-06', '2026-11-13'), 5);
  assert.equal(C.parseDate('2026-02-30'), null);
  assert.equal(C.formatDate('2026-11-07', 'EEE d MMMM yy'), 'Sat 7 November 26');
});

test('theme tokens come from drishti_tokens.css: every theme light or dark, text 4.5:1 on every ground', () => {
  const names = C.themes().map((t) => t.name);
  assert.ok(names.includes('terminal') && names.includes('light'));
  assert.equal(C.scheme('light'), 'light');
  assert.equal(C.scheme('terminal'), 'dark');
  assert.match(C.token('ink', { theme: 'light' }), /^#/);
  names.forEach((n) => assert.deepEqual(C.contrastProblems(n), [], n));
  assert.equal(Math.round(C.contrastRatio('#000', '#fff')), 21);
  assert.equal(C.readableOn('#ffffff', ['#eeeeee', '#172440']), '#172440');
});

test('the API client: errors in words with the DRS code, retries a GET on 503, never a POST, aborts, sends the as-of date', async () => {
  const calls = [];
  const replies = [{ status: 503, body: {} }, { status: 200, body: { ok: 1 } }];
  const fake = (url, init) => { calls.push({ url, init }); const r = replies.shift(); return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status })); };
  const api = C.createClient({ fetch: fake, retryDelay: 1, asOf: '2026-11-06', base: '/api' });
  assert.deepEqual(await api.get('things'), { ok: 1 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, '/api/things');
  assert.equal(calls[0].init.headers['X-Drishti-As-Of'], '2026-11-06');
  const bad = C.createClient({ fetch: () => Promise.resolve(new Response(JSON.stringify({ code: 'E-4005', detail: 'The table has no column X' }), { status: 400 })) });
  await assert.rejects(bad.post('/x', { a: 1 }), (e) => e instanceof C.ApiError && e.message === 'E-4005 The table has no column X' && e.code === 'E-4005' && e.status === 400);
  let n = 0;
  const down = C.createClient({ fetch: () => { n++; return Promise.reject(new TypeError('fetch failed')); }, retryDelay: 1 });
  await assert.rejects(down.post('/x', {}), (e) => e.status === 0 && /could not be reached/.test(e.message));
  assert.equal(n, 1);
  const env = await down.send('GET', '/y', undefined, { retries: 0 });
  assert.equal(env.ok, false);
  assert.equal(env.status, 0);
  const ctl = new AbortController();
  const slow = C.createClient({ fetch: (u, i) => new Promise((res, rej) => i.signal.addEventListener('abort', () => rej(new Error('aborted')))) });
  const p = slow.get('/z', { signal: ctl.signal });
  ctl.abort();
  await assert.rejects(p, (e) => e.aborted === true);
  assert.equal((await C.createClient({ fetch: () => Promise.resolve(new Response(null, { status: 204 })) }).del('/a')), null);
});

test('the bus: order, once, wildcard, a failing listener does not stop the others', () => {
  const errs = [];
  const b = C.createBus({ onError: (e) => errs.push(e) });
  const seen = [];
  b.on('x', (p) => seen.push('a' + p));
  b.on('x', () => { throw new Error('boom'); });
  b.once('x', (p) => seen.push('once' + p));
  b.on('*', (p, t) => seen.push('*' + t));
  b.emit('x', 1);
  b.emit('x', 2);
  assert.deepEqual(seen, ['a1', 'once1', '*x', 'a2', '*x']);
  assert.equal(errs.length, 2);
});

test('the bus: segment wildcards (* one segment, > the rest), exact first, then patterns, then the lone *', () => {
  const b = C.createBus();
  const seen = [];
  b.on('*', (p, t) => seen.push('all:' + t));
  b.on('prices.>', (p, t) => seen.push('rest:' + t));
  b.on('prices.*.USDCAD', (p, t) => seen.push('one:' + t));
  b.on('prices.fx.USDCAD', () => seen.push('exact'));
  b.on('>', (p, t) => seen.push('any:' + t));
  b.emit('prices.fx.USDCAD', 1);
  assert.deepEqual(seen, ['exact', 'rest:prices.fx.USDCAD', 'one:prices.fx.USDCAD', 'any:prices.fx.USDCAD', 'all:prices.fx.USDCAD']);
  seen.length = 0;
  b.emit('prices', 1);                                  // '>' needs at least one more segment; 'any' needs one segment: a lone name matches '>'
  b.emit('prices.fx', 1);
  b.emit('rates.fx.USDCAD', 1);
  assert.deepEqual(seen, ['any:prices', 'all:prices', 'rest:prices.fx', 'any:prices.fx', 'all:prices.fx', 'any:rates.fx.USDCAD', 'all:rates.fx.USDCAD']);
  assert.equal(b.count('prices.>'), 1);
  b.off('prices.>');
  seen.length = 0;
  b.emit('prices.fx', 1);
  assert.deepEqual(seen, ['any:prices.fx', 'all:prices.fx']);
  const stop = b.once('a.*', () => seen.push('once'));
  b.emit('a.b'); b.emit('a.c');
  assert.equal(seen.filter((x) => x === 'once').length, 1);
  stop();
  b.clear();
  assert.equal(b.emit('prices.fx', 1), 0);
});

test('topics: the grammar, the matcher and segment()', () => {
  assert.ok(C.isTopic('prices.fx.USDCAD') && C.isTopic('a-b_c:d~e'));
  assert.ok(!C.isTopic('') && !C.isTopic('a..b') && !C.isTopic('a b') && !C.isTopic('a.*') && !C.isTopic('x'.repeat(256)));
  assert.ok(!C.isTopic(Array(17).fill('a').join('.')) && C.isTopic(Array(16).fill('a').join('.')));
  assert.ok(C.isPattern('a.*.c') && C.isPattern('a.>') && C.isPattern('>') && !C.isPattern('a.>.c') && !C.isPattern('a.b*'));
  assert.ok(C.topicMatches('a.*.c', 'a.b.c') && !C.topicMatches('a.*.c', 'a.b.c.d') && !C.topicMatches('a.*.c', 'a.c'));
  assert.ok(C.topicMatches('a.>', 'a.b') && C.topicMatches('a.>', 'a.b.c') && !C.topicMatches('a.>', 'a'));
  assert.ok(C.topicMatches('a.b', 'a.b') && !C.topicMatches('a.b', 'a.b.c'));
  for (const t of ['trades', 'My Desk / FX', 'a.b', '~', '', 'é€😀', 'x*>']) {
    const s = C.segment(t);
    assert.ok(C.isTopic(s) && !s.includes('.'), s);
    assert.equal(C.unsegment(s), t);
  }
  assert.equal(C.segment('gallery-trades'), 'gallery-trades');
  assert.equal(C.segment('a.b'), 'a~2Eb');
  assert.equal(C.selectionTopic('My Desk'), 'ui.selection.My~20Desk');
  assert.equal(C.filterTopic('trades'), 'ui.filter.trades');
});

test('linked selection and filters are topics on the shared bus', () => {
  const b = C.createBus();
  const seen = [];
  b.on('ui.selection.>', (p, t) => seen.push(t + ':' + p.ids.join(',')));
  C.publishSelection('trades', ['T1', 'T2'], { bus: b });
  C.publishSelection('other desk', ['X'], { bus: b });
  assert.deepEqual(seen, ['ui.selection.trades:T1,T2', 'ui.selection.other~20desk:X']);
  const heard = [];
  b.on(C.selectionTopic('trades'), (p) => heard.push(p.channel));
  C.publishSelection('other desk', [], { bus: b });
  assert.deepEqual(heard, []);
  C.publishSelection('trades', [], { bus: b });
  assert.deepEqual(heard, ['trades']);
});

test('keys: names, maps, and the panel keys kept for layout mode and the workbench', () => {
  assert.equal(C.keyName({ key: 'ArrowLeft', ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+ArrowLeft');
  assert.equal(C.normalizeKey('shift+left'), 'Shift+ArrowLeft');
  assert.equal(C.normalizeKey('Mod+c', { mac: true }), 'Meta+C');
  const act = C.keymap({ 'Mod+A': 'all', Space: 'toggle' });
  assert.equal(act({ key: 'a', ctrlKey: true }), 'all');
  assert.equal(act({ key: ' ' }), 'toggle');
  assert.deepEqual(C.GridKeys.interpret({ key: 'ArrowUp' }, C.GridKeys.LAYOUT), { type: 'move', step: -1 });
  assert.deepEqual(C.GridKeys.interpret({ key: 'ArrowUp' }, C.GridKeys.WORKBENCH), { type: 'select', dir: 'prev' });
  assert.equal(C.GridKeys.interpret({ key: 'z', ctrlKey: true }, 'layout'), null);
});

test('roving tabindex arithmetic: arrows by orientation, wrap, Home and End, grids by columns', () => {
  assert.equal(C.rovingIndex(0, 5, 'ArrowRight'), 1);
  assert.equal(C.rovingIndex(4, 5, 'ArrowRight'), 4);
  assert.equal(C.rovingIndex(4, 5, 'ArrowRight', { wrap: true }), 0);
  assert.equal(C.rovingIndex(2, 5, 'ArrowDown'), null);
  assert.equal(C.rovingIndex(2, 5, 'ArrowDown', { orientation: 'vertical' }), 3);
  assert.equal(C.rovingIndex(1, 9, 'ArrowDown', { columns: 3 }), 4);
  assert.equal(C.rovingIndex(3, 5, 'Home'), 0);
  assert.equal(C.rovingIndex(0, 5, 'End'), 4);
});

test('the loader: versions and requirements from the manifest; under Node it says so', async () => {
  assert.equal(C.libraryVersion('drishti-core'), C.manifest().elements);
  assert.equal(C.ELEMENTS_VERSION, C.manifest().elements);
  assert.equal(C.manifest().libraries['drishti-core'].version, undefined);
  assert.deepEqual(C.requirements('drishti-grid'), ['drishti-core', 'drishti-inputs', 'drishti-chart', 'drishti-grid']);
  assert.throws(() => C.requirements('drishti-nothing'), /no library drishti-nothing/);
  await assert.rejects(C.load('drishti-grid'), /no page to load it into|is not loaded/);
});

test('the loader: a registered library ships with its module and is refused where that module is not on for the person', async () => {
  C.register('drishti-extra', { bundle: 'drishti-extra/drishti_extra.js', requires: ['drishti-grid'], module: 'finance' });
  assert.equal(C.manifest().libraries['drishti-grid'].module, 'core');
  assert.deepEqual(C.requirements('drishti-extra'), ['drishti-core', 'drishti-inputs', 'drishti-chart', 'drishti-grid', 'drishti-extra']);
  assert.throws(() => C.register('drishti-bad', {}), /bundle .* is required/);
  assert.equal(C.refused('drishti-extra'), null);                              // nothing said (no host page): every library loads
  try {
    C.configure({ modules: ['economy'] });
    assert.match(C.refused('drishti-extra'), /drishti-extra belongs to the module 'finance', which is not available here/);
    assert.equal(C.refused('drishti-chart'), null);                            // the core's libraries load everywhere
    await assert.rejects(C.load('drishti-extra'), /module 'finance'/);         // refused before any file is asked for
    C.configure({ modules: ['finance'] });
    assert.equal(C.refused('drishti-extra'), null);
  } finally {
    C.configure({ modules: null });
  }
});

test('the loader: the host says where its server is, and a component without an address says so', () => {
  assert.equal(C.endpoint('live'), '');
  C.configure({ endpoints: { live: '/x/live' } });
  assert.equal(C.endpoint('live'), '/x/live');
  assert.equal(C.endpoint('changes'), '');
});

test('the bundle is the modules: the same names, the version from the manifest, registered on Drishti.elements', () => {
  const b = require('../../elements/drishti-core/drishti_core.js');
  const names = Object.keys(C).sort();
  assert.deepEqual(Object.keys(b).filter((k) => k !== 'library' && k !== 'version').sort(), names);
  assert.equal(b.version, C.libraryVersion('drishti-core'));
  assert.equal(globalThis.Drishti.elements.core, b);
  assert.equal(b.formatNamed('pct2', 0.5), '50.00%');
});

test('a tour: one step\'s parts shown at a time, Back and Next clamped, the step in words, everything shown again when it stops', () => {
  const el = (attrs) => ({ attrs: Object.assign({}, attrs), hidden: false, disabled: false, textContent: '', listeners: {},
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(n, f) { this.listeners[n] = f; }, removeEventListener(n) { delete this.listeners[n]; } });
  const say1 = el({ 'data-tour-say': '1' }), say2 = el({ 'data-tour-say': '2' }), card = el({ 'data-tour-steps': '2 3' }), back = el({ 'data-tour': 'back' }), next = el({ 'data-tour': 'next' }), at = el({ 'data-tour': 'at' });
  const all = [say1, say2, card, back, next, at];
  const pick = (sel) => all.filter((e) => sel.split(',').some((s) => { const m = /\[([\w-]+)(?:="([^"]*)")?\]/.exec(s.trim()); return m && m[1] in e.attrs && (m[2] === undefined || e.attrs[m[1]] === m[2]); }));
  const root = Object.assign(el({}), { querySelectorAll: pick, ownerDocument: null });
  const seen = [];
  const t = new C.Tour(root, { onStep: (n) => seen.push(n) });
  assert.equal(t.steps, 3);
  assert.deepEqual([say1.hidden, say2.hidden, card.hidden, back.disabled, at.textContent], [false, true, true, true, 'Step 1 of 3']);
  next.listeners.click();
  assert.deepEqual([say1.hidden, say2.hidden, card.hidden, root.attrs['data-tour-at']], [true, false, false, '2']);
  assert.equal(t.go(9), 3);
  assert.equal(next.disabled, true);
  assert.equal(t.back(), 2);
  assert.deepEqual(seen, [1, 2, 3, 2]);
  t.destroy();
  assert.ok(!say1.hidden && !say2.hidden && !card.hidden && !next.listeners.click);
});

test('escapeHtml: the one escape makes text and quoted attribute values safe, with hostile strings', () => {
  assert.equal(C.escapeHtml('a & b < c > d " e \' f'), 'a &amp; b &lt; c &gt; d &quot; e &#39; f');
  assert.equal(C.escapeHtml(null), '');
  assert.equal(C.escapeHtml(undefined), '');
  assert.equal(C.escapeHtml(0), '0');
  assert.equal(C.escapeHtml('&amp;'), '&amp;amp;');                      // never double-decoded, always escaped once more
  for (const hostile of ['"><script>alert(1)</script>', "' onmouseover='alert(1)", '" autofocus onfocus="x', '<img src=x onerror=alert(1)>', '</title><svg/onload=x>']) {
    const out = C.escapeHtml(hostile);
    assert.ok(!/[<>"']/.test(out), out);                                // no markup, no quote survives
    assert.equal(out.replace(/&(amp|lt|gt|quot|#39);/g, (m) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[m]), hostile);
  }
  assert.equal(require('../../elements/drishti-core/drishti_core.js').escapeHtml('"'), '&quot;');   // the bundle too
});
