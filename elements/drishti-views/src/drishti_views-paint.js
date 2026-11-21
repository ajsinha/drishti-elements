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
/* paint(el, source, options): a ViewModel drawn into an element, and the handle that keeps it. How a paint goes: read the source (a
   ViewModel, an address, a Response, a promise of one), refuse a major it does not draw, validate (warn by default), then draw the
   frame in ONE pass: the title line, the strip, the freshness line, the keys and every panel's frame in its place, each in its state.
   That first paint needs no engine. Then ready. A view is drawn inside a shadow root by default, so a ViewModel's names can neither
   collide with the page nor be styled by it; the theme's tokens still reach it (custom properties inherit).
   The painter computes nothing: every figure arrives as the producer's text. */
import { h, manifest, staticUrl, loadStyle } from '../../drishti-core/src/drishti_index.js';
import { CONTRACT } from './drishti_views-schema.js';
import { validate, formatIssue } from './drishti_views-validate.js';
import { MESSAGES, say, safeHref } from './drishti_views-cells.js';
import { PanelFrame } from './drishti_views-panels.js';
import { arrange, Layout } from './drishti_views-layout.js';
import { Screen, problemCard } from './drishti_views-screen.js';
import { Patcher } from './drishti_views-patch.js';

/** The contract majors this painter draws. */
export const SPECS = Object.freeze([Number(String(CONTRACT).split('.')[0])]);

const HANDLES = new WeakMap();
const EVENTS = ['ready', 'error', 'issues', 'link', 'key', 'patch', 'navigate', 'pick', 'dispose'];
const CANCELABLE = { link: true, key: true };
let counter = 0;

/**
 * @typedef {Object} PaintOptions
 * @property {boolean} [shadow=true] draw inside a shadow root (false: into the element itself, styled by the page's sheets)
 * @property {('comfortable'|'compact'|'terminal')} [density] the density of the view (default: the page's)
 * @property {Object<string, string>} [messages] the painter's own words, over the bundled English ones
 * @property {('full'|'strip'|'none')} [header='full'] how much of the header is drawn
 * @property {string[]} [panels] draw only these panel ids
 * @property {('off'|'warn'|'refuse')} [validate='warn'] warn: paint and report the issues; refuse: do not paint an invalid view
 * @property {boolean} [keys=false] the view's function keys answer the keyboard (inside the view)
 * @property {{href: function(Object): ?string, resolveView: function(Object): *}} [links] href: an address for a Link (else a link is a
 *   button that raises the link event); resolveView: a ViewModel, an address or a promise of either for a Link, painted in place with a back step
 * @property {function(string, Object): Promise<Response>} [fetch] the host's fetch, for a view given by its address
 * @property {string} [label] the region's accessible name (default: the title)
 * @property {string} [locale] how times are printed (default: the page's)
 */

function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
function isView(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) && typeof v.then !== 'function' && !(typeof Response !== 'undefined' && v instanceof Response); }

/** A painted view: what paint() answers. */
export class ViewHandle {
  /**
   * @param {HTMLElement} el the container
   * @param {PaintOptions} [options]
   */
  constructor(el, options) {
    this.el = el;
    this.options = Object.assign({ header: 'full', validate: 'warn', shadow: true }, options || {});
    this.listeners = new Map();
    this.stats = { paints: 0, patches: 0, ignored: 0, dropped: 0 };
    this.history = [];
    this.frames = new Map();
    this.vm = null;
    this.disposed = false;
    this.prefix = 'dv' + (++counter) + '-';
    this.ctx = this.context();
    this.patcher = new Patcher(this);
    this.host = this.mountRoot();
    this.root = h(this.ctx.doc, 'div', { cls: 'dv-view', attrs: { role: 'region', 'data-density': this.options.density || null } });
    this.root.addEventListener('keydown', (e) => this.onKey(e));
    this.host.appendChild(this.root);
    this.observe();
    let done;
    /** @type {Promise<ViewHandle>} the first paint is done (every panel drawn or in a state, or a card in its place) */
    this.ready = new Promise((r) => { done = r; });
    this.resolveReady = done;
  }

  /** @private */
  context() {
    const self = this, o = this.options, doc = this.el.ownerDocument;
    const messages = Object.assign({}, MESSAGES, o.messages || {});
    let timeFmt = null;
    return {
      doc: doc, messages: messages, label: o.label || '',
      uid: (s) => self.prefix + String(s).replace(/[^A-Za-z0-9_-]/g, '_'),
      hrefOf: (link) => (o.links && typeof o.links.href === 'function' ? safeHref(o.links.href(link)) : null),
      open: (link, how) => self.openLink(link, how),
      emit: (name, detail) => self.emit(name, detail),
      key: (k) => self.pressKey(k),
      back: () => self.back(),
      flash: (node) => self.flash(node),
      time: (iso) => {
        const d = new Date(iso);
        if (isNaN(d.getTime())) { return String(iso); }
        try { timeFmt = timeFmt || new Intl.DateTimeFormat(o.locale || undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }); return timeFmt.format(d); } catch (e) { return String(iso); }
      }
    };
  }

  /** @private */
  mountRoot() {
    const el = this.el;
    if (this.options.shadow !== false && typeof el.attachShadow === 'function') {
      let sr = el.shadowRoot;
      if (!sr) { try { sr = el.attachShadow({ mode: 'open' }); } catch (e) { sr = null; } }
      if (sr) {
        while (sr.firstChild) { sr.removeChild(sr.firstChild); }
        this.sheets = this.links(sr);
        return sr;
      }
    }
    this.sheets = [];
    sheetPaths().forEach((p) => loadStyle(staticUrl(p)));
    while (el.firstChild) { el.removeChild(el.firstChild); }
    return el;
  }

  /** @private */
  links(sr) {
    const doc = this.el.ownerDocument;
    return sheetPaths().map((p) => {
      const l = doc.createElement('link');
      l.rel = 'stylesheet';
      l.href = staticUrl(p);
      const loaded = new Promise((r) => { l.addEventListener('load', r, { once: true }); l.addEventListener('error', r, { once: true }); });
      sr.appendChild(l);
      return loaded;
    });
  }

  /** @private */
  observe() {
    const win = this.el.ownerDocument.defaultView;
    if (win && typeof win.ResizeObserver === 'function') {
      this.ro = new win.ResizeObserver((entries) => {
        const w = entries[entries.length - 1].contentRect.width;
        this.width = w;
        if (this.layout) { this.layout.fit(w); }
      });
      this.ro.observe(this.root);
    }
  }

  /**
   * Reads and paints a source: a ViewModel, an address, a Response or a promise of one.
   * @param {*} source
   * @returns {ViewHandle}
   */
  load(source) {
    const t0 = now();
    if (isView(source)) {                       // drawn in a microtask: listeners attached right after paint() hear its events
      Promise.resolve().then(() => { if (!this.disposed) { this.show(source, t0); } });
      return this;
    }
    let p;
    if (typeof source === 'string') {
      const f = this.options.fetch || ((u, init) => fetch(u, init));
      p = Promise.resolve().then(() => f(source, { credentials: 'same-origin', headers: { Accept: 'application/json' } })).then((r) => {
        if (!r.ok) { throw Object.assign(new Error(r.status + ' ' + (r.statusText || '')), { status: r.status }); }
        return r.json();
      });
    } else if (source && typeof source.json === 'function') {
      p = source.json();
    } else if (source && typeof source.then === 'function') {
      p = source.then((x) => (x && typeof x.json === 'function' && !isView(x) ? x.json() : x));
    } else {
      Promise.resolve().then(() => { if (!this.disposed) { this.show(source, t0); } });
      return this;
    }
    this.root.setAttribute('aria-busy', 'true');
    p.then((vm) => { if (!this.disposed) { this.show(vm, now()); } }, (e) => {
      if (this.disposed) { return; }
      this.card({ title: say(this.ctx.messages, 'viewFetch'), detail: String(e && e.message || e), retry: () => this.load(source) });
      this.emit('error', { code: 'view.fetch', status: e && e.status, error: e });
      this.settle();
    });
    return this;
  }

  /** @private */
  show(vm, t0) {
    const m = this.ctx.messages;
    if (!isView(vm)) {
      this.card({ title: say(m, 'viewInvalid'), detail: 'the view is not a JSON object' });
      this.emit('error', { code: 'view.invalid', issues: [] });
      return this.settle();
    }
    const major = typeof vm.contract === 'string' ? Number(vm.contract.split('.')[0]) : SPECS[0];
    if (SPECS.indexOf(major) < 0) {
      this.card({ title: say(m, 'viewVersion', { major: major }), detail: 'contract ' + vm.contract });
      this.emit('error', { code: 'view.version', contract: vm.contract });
      return this.settle();
    }
    if (this.options.validate !== 'off') {
      const r = validate(vm);
      if (r.issues.length) {
        this.emit('issues', { issues: r.issues });
        if (!r.ok && this.options.validate === 'refuse') {
          this.card({ title: say(m, 'viewInvalid'), issues: r.issues.filter((i) => i.level === 'error').map(formatIssue) });
          this.emit('error', { code: 'view.invalid', issues: r.issues });
          return this.settle();
        }
        if (!r.ok && typeof console !== 'undefined') { console.warn('drishti-views: the view has ' + r.issues.filter((i) => i.level === 'error').length + ' errors; it is drawn as far as it can be', r.issues.slice(0, 10).map(formatIssue)); }
      }
    }
    this.build(vm);
    this.stats.firstPaintMs = now() - t0;
    return this.settle(t0);
  }

  /** @private */
  build(vm) {
    this.clear();
    this.vm = vm;
    const ctx = this.ctx, only = Array.isArray(this.options.panels) ? this.options.panels.map(String) : null;
    const panels = (Array.isArray(vm.panels) ? vm.panels : []).filter((p) => p && typeof p === 'object' && (!only || only.indexOf(String(p.id)) >= 0));
    ctx.label = this.options.label || (vm.title && (vm.title.pill || vm.title.id)) || (vm.ref && vm.ref.id) || '';
    this.screen = new Screen(ctx, vm, this.options.header);
    panels.forEach((p) => { if (!this.frames.has(String(p.id))) { this.frames.set(String(p.id), new PanelFrame(ctx, p)); } });
    this.layout = new Layout(ctx, arrange(Object.assign({}, vm, { panels: panels })), this.frames);
    this.root.setAttribute('aria-labelledby', this.screen.title.id);
    if (this.options.label) { this.root.setAttribute('aria-label', this.options.label); this.root.removeAttribute('aria-labelledby'); }
    this.root.append(this.screen.element, this.layout.element);
    this.screen.back.hidden = !this.history.length;
    this.layout.fit(this.width || 1280);
    this.layout.mounted();
  }

  /** @private */
  card(o) {
    this.clear();
    this.root.appendChild(problemCard(this.ctx, o));
  }

  /** @private */
  settle(t0) {
    this.root.removeAttribute('aria-busy');
    const sheets = Promise.all(this.sheets || []);
    sheets.then(() => this.raf(() => {
      if (this.disposed) { return; }
      if (t0 !== undefined) { this.stats.readyMs = now() - t0; }
      this.emit('ready', {});
      this.resolveReady(this);
    }));
    return this;
  }

  /** @private */
  clear() {
    this.frames.forEach((f) => f.dispose());
    this.frames.clear();
    this.layout = null;
    this.screen = null;
    this.patcher.queue.length = 0;
    this.patcher.frozen = false;
    this.root.classList.remove('dv-frozen');
    while (this.root.firstChild) { this.root.removeChild(this.root.firstChild); }
  }

  /** @private */
  raf(fn) {
    const win = this.el.ownerDocument.defaultView;
    if (win && typeof win.requestAnimationFrame === 'function') { win.requestAnimationFrame(fn); } else { setTimeout(fn, 0); }
  }

  /**
   * The ViewModel as it stands, patches applied.
   * @returns {?Object}
   */
  get viewModel() { return this.vm; }

  /**
   * A new ViewModel (or address) for the same container.
   * @param {*} source
   * @returns {Promise<ViewHandle>}
   */
  update(source) {
    let done;
    this.ready = new Promise((r) => { done = r; });
    this.resolveReady = done;
    this.load(source);
    return this.ready;
  }

  /**
   * Applies a frame of the live stream ({seq, patches}) or a list of patches, in the next animation frame.
   * @param {(Object|Object[])} frame
   * @returns {boolean} false when the frame was dropped (not newer than the last applied)
   */
  patch(frame) { return this.disposed || !this.vm ? false : this.patcher.push(frame); }

  /**
   * One panel: its frame element, the panel as drawn, and its body.
   * @param {string} id
   * @returns {?{element: HTMLElement, body: HTMLElement, panel: Object, state: string}}
   */
  panel(id) {
    const f = this.frames.get(String(id));
    return f ? { element: f.element, body: f.body, panel: f.panel, state: f.element.getAttribute('data-state') } : null;
  }

  /**
   * Listens to the view's events: ready, error, issues, link*, key*, patch, navigate, pick (a row with a pick: {panel, pick, ev}), dispose (* cancelable). Each is also a DOM event
   * elements-view:<name> on the container.
   * @param {string} name
   * @param {function(Object): void} fn receives {type, detail, preventDefault}
   * @returns {function(): void} stops listening
   */
  on(name, fn) {
    if (EVENTS.indexOf(name) < 0) { throw new Error('drishti-views: no event ' + name + '; the events are ' + EVENTS.join(', ')); }
    if (!this.listeners.has(name)) { this.listeners.set(name, new Set()); }
    this.listeners.get(name).add(fn);
    return () => { const s = this.listeners.get(name); if (s) { s.delete(fn); } };
  }

  /** @private */
  emit(name, detail) {
    let prevented = false;
    const ev = { type: name, detail: detail, preventDefault: () => { if (CANCELABLE[name]) { prevented = true; } } };
    (this.listeners.get(name) || []).forEach((fn) => { try { fn(ev); } catch (e) { if (typeof console !== 'undefined') { console.error(e); } } });
    const win = this.el.ownerDocument.defaultView;
    if (win && typeof win.CustomEvent === 'function') {
      const de = new win.CustomEvent('elements-view:' + name, { detail: detail, bubbles: true, composed: true, cancelable: !!CANCELABLE[name] });
      if (!this.el.dispatchEvent(de)) { prevented = true; }
    }
    return !prevented;
  }

  /** @private */
  openLink(link, how) {
    if (!this.emit('link', { link: link })) { return false; }
    if (how && how.follow === false) { return true; }
    const resolve = this.options.links && this.options.links.resolveView;
    if (typeof resolve === 'function') {
      Promise.resolve(resolve(link)).then((next) => {
        if (!next || this.disposed) { return; }
        if (this.vm) { this.history.push(this.vm); }
        this.emit('navigate', { link: link, depth: this.history.length });
        this.load(next);
      }, (e) => this.emit('error', { code: 'view.fetch', error: e, link: link }));
    }
    return true;
  }

  /**
   * Opens a Link the way a click on it does: the cancelable link event, then the host's resolveView, painted in place.
   * @param {Object} link
   * @returns {boolean} false when a listener cancelled it
   */
  open(link) { return this.openLink(link); }

  /**
   * Goes back to the view before the last one opened in place.
   * @returns {boolean} whether there was one
   */
  back() {
    if (!this.history.length) { return false; }
    const vm = this.history.pop();
    this.emit('navigate', { back: true, depth: this.history.length });
    this.show(vm, now());
    return true;
  }

  /** @private */
  pressKey(k) {
    if (!this.emit('key', { key: k.key, action: k.action, panel: k.panel || null, link: k.link || null })) { return; }
    if (k.action === 'panel' && k.panel) {
      const f = this.frames.get(String(k.panel));
      if (f) { f.element.hidden = false; f.element.scrollIntoView({ block: 'nearest' }); f.element.focus({ preventScroll: true }); }
    } else if (k.action === 'link' && k.link) {
      this.openLink(k.link);
    }
  }

  /** @private */
  onKey(e) {
    if (!this.options.keys || !this.vm || !Array.isArray(this.vm.keys) || e.altKey || e.ctrlKey || e.metaKey) { return; }
    const k = this.vm.keys.find((x) => x && x.key === e.key && x.action !== 'denied');
    if (k) { e.preventDefault(); this.pressKey(k); }
  }

  /** @private */
  flash(node) {
    const win = this.el.ownerDocument.defaultView;
    if (!node.animate || (win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches)) { return; }
    node.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 450, easing: 'ease-out' });
  }

  /**
   * Paint times and counts: firstPaintMs, readyMs, paints, patches applied, ignored and dropped, lastApplyMs.
   * @returns {Object<string, number>}
   */
  metrics() { return Object.assign({}, this.stats); }

  /**
   * Stops everything, disposes every panel's drawing and empties the container.
   * @returns {void}
   */
  dispose() {
    if (this.disposed) { return; }
    this.clear();
    if (this.ro) { this.ro.disconnect(); }
    this.disposed = true;
    this.emit('dispose', {});
    this.listeners.clear();
    if (this.host !== this.el) { while (this.host.firstChild) { this.host.removeChild(this.host.firstChild); } } else if (this.root.parentNode) { this.root.remove(); }
    if (HANDLES.get(this.el) === this) { HANDLES.delete(this.el); }
  }
}

function sheetPaths() {
  const libs = manifest().libraries;
  const out = [];
  ['drishti-core', 'drishti-views'].forEach((n) => ((libs[n] && libs[n].css) || []).forEach((c) => { if (out.indexOf(c) < 0 && !/drishti_tokens\.css$/.test(c)) { out.push(c); } }));
  return out;
}

/**
 * Paints a view into an element (replacing what paint drew there before) and answers its handle.
 * @param {HTMLElement} el the container
 * @param {*} source a ViewModel, its address, a Response, or a promise of one
 * @param {PaintOptions} [options]
 * @returns {ViewHandle}
 * @example const view = paint(document.getElementById('orders'), '/views/orders.json'); view.ready.then(() => view.patch(frame));
 */
export function paint(el, source, options) {
  if (!el || typeof el.appendChild !== 'function') { throw new Error('paint: the first argument is the element to draw into'); }
  const old = HANDLES.get(el);
  if (old) { old.dispose(); }
  const handle = new ViewHandle(el, options);
  HANDLES.set(el, handle);
  return handle.load(source);
}
