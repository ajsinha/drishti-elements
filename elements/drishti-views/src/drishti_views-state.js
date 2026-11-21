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
/* The painter's side of the screen's state and effects (ViewModel contract 1.2). Pure logic, no DOM: the state values the ViewModel
   carries (state[]), the marks of a panel in the order the specification counts them, the effect list a mark carries for a trigger
   (its `on`, or its `set` written as set effects), and running that list on the state. The painter never evaluates an expression:
   every value, guard and argument of an effect arrives already evaluated for its mark. What a click writes, the host reads back as
   the next bind's state.<id> parameters; notify and host effects are handed to the host, never run here. */

const list = (x) => (Array.isArray(x) ? x : []);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The trigger each kind fires: a table's rows, an hbar's bars, and the one point-click of every other mark. */
export function triggerOf(kind) {
  return kind === 'table' || kind === 'ladder' ? 'row-click' : kind === 'hbar' ? 'bar-click' : null;
}

/** The kinds whose marks fire point-click (a chart's points, steps, events or candles, a line or area's x positions, a figure or record). */
export const POINT_KINDS = Object.freeze(['line', 'area', 'scatter', 'waterfall', 'timeline', 'candlestick', 'metric', 'gauge', 'kv', 'status', 'treemap']);

/**
 * The trigger a kind's marks fire.
 * @param {string} kind
 * @returns {?string} null when it fires none
 */
export function triggerFor(kind) { return triggerOf(kind) || (POINT_KINDS.indexOf(kind) >= 0 ? 'point-click' : null); }

function rowsDepthFirst(rows, out) {
  list(rows).forEach((r) => { if (isObj(r)) { out.push(r); rowsDepthFirst(r.children, out); } });
  return out;
}

/**
 * The marks of a panel in the order the specification counts them: a table's rows (depth first through children), an hbar's bars, a
 * chart's points, steps, events or candles, a line or area chart's x positions, the one mark of a metric, gauge or fields panel.
 * Each mark is {set, on, ev} (the ViewModel's own objects, or the pieces beside x of a line or area chart).
 * @param {Object} panel
 * @returns {Object[]}
 */
export function marksOf(panel) {
  const d = panel && isObj(panel.data) ? panel.data : {}, k = panel && panel.kind;
  if (k === 'table' || k === 'ladder') { return rowsDepthFirst(d.rows, []); }
  if (k === 'hbar') { return list(d.bars).filter(isObj); }
  if (k === 'waterfall') { return list(d.steps).filter(isObj); }
  if (k === 'scatter') { return list(d.points).filter(isObj); }
  if (k === 'timeline') { return list(d.events).filter(isObj); }
  if (k === 'candlestick') { return list(d.candles).filter(isObj); }
  if (k === 'treemap') { return list(d.cells).filter(isObj); }
  if (k === 'line' || k === 'area') {
    return list(d.x).map((x, i) => ({ set: list(d.set)[i] || null, on: list(d.on)[i] || null, ev: list(d.ev)[i] }));
  }
  if (k === 'metric' || k === 'gauge' || k === 'kv' || k === 'status') { return [d]; }
  return [];
}

/**
 * The effect list a mark carries for a trigger: its `on` list when it has one, else its `set` map written as set effects.
 * @param {Object} mark
 * @param {string} trigger
 * @returns {Object[]}
 */
export function effectsOf(mark, trigger) {
  if (!isObj(mark)) { return []; }
  if (isObj(mark.on) && Array.isArray(mark.on[trigger])) { return mark.on[trigger].filter(isObj); }
  if (isObj(mark.set)) { return Object.keys(mark.set).map((id) => ({ do: 'set', state: id, value: mark.set[id] })); }
  return [];
}

/**
 * Whether a mark carries any effect (set or on) at all, for the cursor and the keyboard.
 * @param {Object} mark
 * @returns {boolean}
 */
export function hasEffects(mark) { return isObj(mark) && (isObj(mark.set) || isObj(mark.on)); }

/**
 * A value as a bind request carries it: text, a list's items joined by commas.
 * @param {*} v
 * @returns {?string} null when there is none
 */
export function requestText(v) {
  if (v === null || v === undefined) { return null; }
  return Array.isArray(v) ? v.map(String).join(',') : String(v);
}

/** The screen's state values as the ViewModel's state[] gave them and as the effects changed them. */
export class StateStore {
  /** An empty store (load fills it from the ViewModel's state[]). */
  constructor() { this.entries = new Map(); }

  /**
   * Takes the ViewModel's state[] (replacing every value: the host's bind is the truth).
   * @param {Object[]} states
   * @returns {void}
   */
  load(states) {
    this.entries.clear();
    list(states).forEach((s) => { if (isObj(s) && typeof s.id === 'string') { this.entries.set(s.id, { value: s.value === undefined ? null : s.value, url: s.url === true, reads: Array.isArray(s.reads) ? s.reads.slice() : null }); } });
  }

  /**
   * A state's value.
   * @param {string} id
   * @returns {*} its value (null when empty or unknown)
   */
  get(id) { const e = this.entries.get(id); return e ? e.value : null; }

  /**
   * Every state's value.
   * @returns {Object<string, *>} id to value, the empty ones left out
   */
  values() {
    const out = {};
    this.entries.forEach((e, id) => { if (e.value !== null) { out[id] = e.value; } });
    return out;
  }

  /**
   * The state.<id> parameters of the next bind.
   * @returns {Object<string, ?string>} without the prefix (an empty value is not carried)
   */
  request() {
    const out = {};
    this.entries.forEach((e, id) => { const t = requestText(e.value); if (t !== null) { out[id] = t; } });
    return out;
  }

  /**
   * The panels (and strip or title) that read any of the states, each once.
   * @param {string[]} ids
   * @returns {?string[]} null when one of them does not say
   */
  readers(ids) {
    const out = [];
    for (const id of ids) {
      const e = this.entries.get(id);
      if (!e || !e.reads) { return null; }
      e.reads.forEach((r) => { if (out.indexOf(r) < 0) { out.push(r); } });
    }
    return out;
  }

  /**
   * Runs an effect list on the values, in order. set, toggle and clear change them (a state the ViewModel does not hold is made); notify
   * and host change nothing and are handed back for the host. Answers the effects as run: {do, state, value} for the three, the
   * effect itself for the two.
   * @param {Object[]} effects
   * @returns {{ran: Object[], changed: string[]}}
   */
  run(effects) {
    const ran = [], changed = [];
    const touch = (id) => { if (changed.indexOf(id) < 0) { changed.push(id); } };
    list(effects).forEach((e) => {
      if (e.do === 'set' && typeof e.state === 'string') {
        this.write(e.state, e.value === undefined ? null : e.value);
        ran.push({ do: 'set', state: e.state, value: this.get(e.state) });
        touch(e.state);
      } else if (e.do === 'toggle' && typeof e.state === 'string') {
        const now = this.get(e.state) !== true;
        this.write(e.state, now);
        ran.push({ do: 'toggle', state: e.state, value: now });
        touch(e.state);
      } else if (e.do === 'clear' && typeof e.state === 'string') {
        this.write(e.state, null);
        ran.push({ do: 'clear', state: e.state, value: null });
        touch(e.state);
      } else if (e.do === 'notify' || e.do === 'host') {
        ran.push(Object.assign({}, e));
      }
    });
    return { ran: ran, changed: changed };
  }

  /** @private */
  write(id, value) {
    const e = this.entries.get(id);
    if (e) { e.value = value; } else { this.entries.set(id, { value: value, url: false, reads: null }); }
  }
}

/**
 * Checks a trigger against the screen as the specification's fire cases do. Answers the marks and the effects, or the refusal
 * (RCH-5001: a panel, trigger or mark the screen does not have; nothing runs).
 * @param {?Object} panel the panel as drawn, or null when the screen has none of that id
 * @param {string} id the panel's id as asked
 * @param {string} trigger
 * @param {number} [mark=0]
 * @returns {{problems: Object[], effects?: Object[]}}
 */
export function resolveFire(panel, id, trigger, mark) {
  const refuse = (message) => ({ problems: [{ code: 'RCH-5001', message: message }], effects: [] });
  if (!panel) { return refuse("no panel '" + id + "' on the screen"); }
  const fires = triggerFor(panel.kind);
  if (fires !== trigger) { return refuse("panel '" + id + "' (" + panel.kind + ') does not fire ' + trigger); }
  const marks = marksOf(panel), ix = mark === undefined || mark === null ? 0 : mark;
  if (!Number.isInteger(ix) || ix < 0 || ix >= marks.length) { return refuse("panel '" + id + "' shows no mark " + ix + ' (it shows ' + marks.length + ')'); }
  return { problems: [], effects: effectsOf(marks[ix], trigger) };
}

/**
 * Makes an element fire a mark's trigger when clicked (or Enter or Space on it), when the mark carries effects: the pointer cursor, a place
 * in the tab order, and data-mark (the mark's place). Answers whether the mark carries effects.
 * @param {Object} ctx the paint's context (its fire)
 * @param {HTMLElement} el
 * @param {Object} panel
 * @param {string} trigger
 * @param {number} ix the mark's place
 * @param {Object} mark
 * @returns {boolean}
 */
export function clickable(ctx, el, panel, trigger, ix, mark) {
  if (!hasEffects(mark)) { return false; }
  el.classList.add('dv-pick');
  el.setAttribute('data-mark', String(ix));
  if (!el.hasAttribute('tabindex')) { el.setAttribute('tabindex', '0'); }
  if (!el.hasAttribute('role') && el.tagName !== 'LI' && el.tagName !== 'TR') { el.setAttribute('role', 'button'); }
  const go = () => ctx.fire(String(panel.id), trigger, ix);
  el.addEventListener('click', (e) => { if (e.target && e.target.closest && e.target.closest('a, button') && e.target.closest('a, button') !== el) { return; } go(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  return true;
}
