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
/* Frames of patches applied to a painted view: in sequence order (a frame whose seq is not above the last applied one is dropped), each
   frame whole, all frames that arrived since the last paint in ONE animation frame. A patch is routed by its identity (a strip index,
   a panel id) through a Map to the one node it changes: no validation, no deep copy and no re-layout on this path. The contract's
   ops: strip, panel, provenance, deleted, restored; another op is ignored and counted. While the view's subject is deleted, patches
   other than restored are ignored. */

/** The patch ops of contract 1. */
export const OPS = Object.freeze(['strip', 'panel', 'provenance', 'deleted', 'restored']);

/** Applies frames to one painted view; owned by its handle. */
export class Patcher {
  /**
   * @param {Object} view the handle's internals: vm, screen, frames, root, ctx, metrics, raf(fn)
   */
  constructor(view) {
    this.view = view;
    this.queue = [];
    this.lastSeq = null;
    this.frozen = false;
    this.scheduled = false;
  }

  /**
   * Queues a frame ({seq?, patches}) or a list of patches; drawn in the next animation frame.
   * @param {(Object|Object[])} frame
   * @returns {boolean} false when the frame was dropped as old or a duplicate
   */
  push(frame) {
    const f = Array.isArray(frame) ? { patches: frame } : frame;
    if (!f || typeof f !== 'object') { return false; }
    const m = this.view.stats;
    m.received = (m.received || 0) + 1;
    if (typeof f.seq === 'number') {
      const last = this.queue.length && typeof this.queue[this.queue.length - 1].seq === 'number' ? this.queue[this.queue.length - 1].seq : this.lastSeq;
      if (last !== null && f.seq <= last) { m.dropped = (m.dropped || 0) + 1; return false; }
    }
    this.queue.push(f);
    if (!this.scheduled) {
      this.scheduled = true;
      this.view.raf(() => this.flush());
    }
    return true;
  }

  /**
   * Applies every queued frame now (the animation frame's work); answers the patches applied.
   * @returns {number}
   */
  flush() {
    this.scheduled = false;
    const frames = this.queue.splice(0);
    const t0 = now();
    let applied = 0;
    frames.forEach((f) => {
      (Array.isArray(f.patches) ? f.patches : []).forEach((p) => { applied += this.apply(p) ? 1 : 0; });
      if (typeof f.seq === 'number') { this.lastSeq = f.seq; }
    });
    const m = this.view.stats;
    m.paints = (m.paints || 0) + 1;
    m.patches = (m.patches || 0) + applied;
    m.lastApplyMs = now() - t0;
    if (frames.length) { this.view.emit('patch', { frames: frames.length, applied: applied, seq: this.lastSeq }); }
    return applied;
  }

  apply(p) {
    const v = this.view, m = v.stats;
    if (!p || typeof p !== 'object') { m.ignored = (m.ignored || 0) + 1; return false; }
    if (this.frozen && p.op !== 'restored') { m.ignored = (m.ignored || 0) + 1; return false; }
    let done = false;
    if (p.op === 'strip' && Number.isInteger(p.index)) {
      done = v.screen.setCell(p.index, p.cell);
      if (done && Array.isArray(v.vm.strip)) { v.vm.strip[p.index] = p.cell; }
    } else if (p.op === 'panel' && p.panel && typeof p.panel === 'object') {
      const frame = v.frames.get(String(p.panel.id));
      if (frame) {
        frame.draw(p.panel);
        const i = v.vm.panels.findIndex((x) => x && String(x.id) === String(p.panel.id));
        if (i >= 0) { v.vm.panels[i] = p.panel; }
        done = true;
      }
    } else if (p.op === 'provenance' && p.provenance && typeof p.provenance === 'object') {
      v.screen.setProvenance(p.provenance);
      v.vm.provenance = p.provenance;
      done = true;
    } else if (p.op === 'deleted') {
      this.frozen = true;
      v.root.classList.add('dv-frozen');
      v.screen.setDeleted(typeof p.at === 'string' ? p.at : '');
      done = true;
    } else if (p.op === 'restored') {
      this.frozen = false;
      v.root.classList.remove('dv-frozen');
      v.screen.setDeleted(null);
      done = true;
    }
    if (!done) { m.ignored = (m.ignored || 0) + 1; }
    return done;
  }
}

function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
