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
/* The events protocol's conformance runner: runs the vectors (tests/events/protocol-v1.json) against any server, or the mock.

     node tools/events/conformance.mjs --url wss://example.org/events [--token T] [--vectors FILE] [--only NAME]
     node tools/events/conformance.mjs --mock

   Each vector's clients are raw WebSocket connections (Node 22 has WebSocket) speaking frames as the vectors say; nothing of
   drishti-events' client is used, so a pass says the server keeps the contract. Exit 0 when every vector passes (skipped ones say why). */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VECTORS = path.join(HERE, '..', '..', 'tests', 'events', 'protocol-v1.json');

/** @private splits a transport message into frames */
function framesOf(text) { const v = JSON.parse(text); return Array.isArray(v) ? v : [v]; }

/** @private replaces <run> and <name> in strings and keys */
function fill(v, saved) {
  if (typeof v === 'string') {
    const whole = /^<([a-z0-9_]+)>$/i.exec(v);
    if (whole && Object.prototype.hasOwnProperty.call(saved, whole[1])) { return saved[whole[1]]; }
    return v.replace(/<([a-z0-9_]+)>/gi, (m, k) => (Object.prototype.hasOwnProperty.call(saved, k) ? String(saved[k]) : m));
  }
  if (Array.isArray(v)) { return v.map((x) => fill(x, saved)); }
  if (v && typeof v === 'object') { const out = {}; Object.keys(v).forEach((k) => { out[fill(k, saved)] = fill(v[k], saved); }); return out; }
  return v;
}

/**
 * Whether a frame matches what a vector expects (every expected key; tokens match kinds of values or save them).
 * @param {*} want
 * @param {*} got
 * @param {Object} saved
 * @param {Object} found where the <save:...> values are put when it matches
 * @returns {boolean}
 */
export function frameMatches(want, got, saved, found) {
  if (typeof want === 'string') {
    if (want === '<any>') { return got !== undefined; }
    if (want === '<number>') { return typeof got === 'number'; }
    if (want === '<string>') { return typeof got === 'string'; }
    const save = /^<save:([a-z0-9_]+)>$/i.exec(want);
    if (save) { if (got === undefined) { return false; } found[save[1]] = got; return true; }
    const one = /^<one-of:(.*)>$/.exec(want);
    if (one) { return one[1].split(',').indexOf(String(got)) >= 0; }
    return want === got;
  }
  if (Array.isArray(want)) { return Array.isArray(got) && want.length === got.length && want.every((w, i) => frameMatches(w, got[i], saved, found)); }
  if (want && typeof want === 'object') {
    if (!got || typeof got !== 'object') { return false; }
    return Object.keys(want).every((k) => frameMatches(want[k], got[k], saved, found));
  }
  return want === got;
}

/**
 * Runs the vectors. open(name) gives a raw client: { send(frame), frames: [] (filled as they arrive), onFrame, close() }.
 * @param {Object[]} vectors
 * @param {function(string): Promise<Object>} open
 * @param {{ms: number, log: function(string): void, only: string}} [o]
 * @returns {Promise<{passed: string[], failed: Array<{name: string, why: string}>, skipped: Array<{name: string, why: string}>}>}
 */
export async function runVectors(vectors, open, o) {
  const opts = Object.assign({ ms: 2000, log: () => {} }, o);
  const out = { passed: [], failed: [], skipped: [] };
  let can = null;
  for (const v of vectors) {
    if (opts.only && v.name.indexOf(opts.only) < 0) { continue; }
    const saved = { run: 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36) };
    const clients = {};
    try {
      if (can === null && (v.requires || []).length) {
        const probe = await open('probe');
        probe.send({ t: 'hello', v: 1, client: 'conformance/1' });
        const w = await take(probe, { t: 'welcome' }, saved, opts.ms);
        can = Array.isArray(w.can) ? w.can : [];
        probe.close();
      }
      const missing = (v.requires || []).filter((r) => (can || []).indexOf(r) < 0);
      if (missing.length) { out.skipped.push({ name: v.name, why: 'the server does not offer ' + missing.join(', ') }); opts.log('skip  ' + v.name); continue; }
      for (const step of v.steps) {
        const who = Object.keys(step).find((k) => ['send', 'expect', 'silent', 'close'].indexOf(step[k]) >= 0);
        const what = step[who];
        if (!clients[who]) { clients[who] = await open(who); }
        const c = clients[who];
        if (what === 'send') { c.send(fill(step.frame, saved)); }
        else if (what === 'expect') { await take(c, fill(step.frame, saved), saved, step.ms || opts.ms); }
        else if (what === 'silent') { await silent(c, step.t, step.ms || 300); }
        else if (what === 'close') { c.close(); }
      }
      out.passed.push(v.name);
      opts.log('pass  ' + v.name);
    } catch (e) {
      out.failed.push({ name: v.name, why: (e && e.message) || String(e) });
      opts.log('FAIL  ' + v.name + ': ' + ((e && e.message) || e));
    } finally {
      Object.values(clients).forEach((c) => { try { c.close(); } catch (e) { /* closed */ } });
    }
  }
  return out;
}

/** @private waits for the first frame (kept or arriving) that matches; the others stay for later steps */
function take(c, want, saved, ms) {
  return new Promise((resolve, reject) => {
    const look = () => {
      for (let i = 0; i < c.frames.length; i++) {
        const found = {};
        if (frameMatches(want, c.frames[i], saved, found)) { const f = c.frames.splice(i, 1)[0]; Object.assign(saved, found); return f; }
      }
      return null;
    };
    const hit = look();
    if (hit) { resolve(hit); return; }
    const timer = setTimeout(() => { c.onFrame = null; reject(new Error('expected ' + JSON.stringify(want) + ' within ' + ms + ' ms; had ' + JSON.stringify(c.frames).slice(0, 400))); }, ms);
    c.onFrame = () => { const f = look(); if (f) { clearTimeout(timer); c.onFrame = null; resolve(f); } };
  });
}

/** @private no frame of a type within ms */
function silent(c, t, ms) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const f = c.frames.find((x) => x.t === t);
      if (f) { reject(new Error('expected no ' + t + ' frame; got ' + JSON.stringify(f).slice(0, 200))); } else { resolve(); }
    }, ms);
  });
}

/**
 * A raw client over a WebSocket.
 * @param {string} url
 * @param {{token: string}} [o]
 * @returns {Promise<Object>}
 */
export function wsClient(url, o) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, ['events.v1']);
    const c = { frames: [], onFrame: null, send: (f) => ws.send(JSON.stringify(o && o.token && f.t === 'hello' ? Object.assign({ token: o.token }, f) : f)), close: () => ws.close(1000) };
    ws.addEventListener('message', (e) => { framesOf(String(e.data)).forEach((f) => c.frames.push(f)); if (c.onFrame) { c.onFrame(); } });
    ws.addEventListener('open', () => resolve(c));
    ws.addEventListener('error', () => reject(new Error('could not connect to ' + url)));
  });
}

/**
 * A raw client of a MockServer (its in-memory transport).
 * @param {Object} server a MockServer
 * @returns {Promise<Object>}
 */
export function mockClient(server) {
  return new Promise((resolve) => {
    const c = { frames: [], onFrame: null, closed: false };
    const t = server.transport({ onOpen: () => resolve(c), onText: (text) => { framesOf(text).forEach((f) => c.frames.push(f)); if (c.onFrame) { c.onFrame(); } },
      onClose: () => { c.closed = true; }, onComment: () => {}, onRetry: () => {}, onBinary: () => {} });
    c.send = (f) => { t.send([f]); };
    c.close = () => t.close(1000);
  });
}

async function main(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const vectors = JSON.parse(readFileSync(arg('--vectors') || VECTORS, 'utf-8')).vectors;
  let open;
  if (argv.indexOf('--mock') >= 0) {
    const { MockServer } = await import('../../elements/drishti-events/src/drishti_mock.js');
    const server = new MockServer({ address: null });
    open = () => mockClient(server);
  } else if (arg('--url')) {
    open = () => wsClient(arg('--url'), { token: arg('--token') });
  } else {
    console.error('usage: node tools/events/conformance.mjs --url <ws(s)://address> [--token T] [--only NAME] | --mock');
    return 2;
  }
  const r = await runVectors(vectors, open, { log: (s) => console.log(s), only: arg('--only') });
  console.log(r.passed.length + ' passed, ' + r.failed.length + ' failed, ' + r.skipped.length + ' skipped');
  return r.failed.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
