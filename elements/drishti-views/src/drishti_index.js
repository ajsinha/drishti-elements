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
/* drishti-views: whole screens from a ViewModel. The open specification (contract 1.x, drishti-rachana's spec/1/viewmodel.schema.json,
   shipped as a pinned copy) and its validator; the painter, which draws a ViewModel into any element (inside a shadow root by default)
   and applies the frames of its live stream; the registry of panel kinds. It draws nothing another library draws, and computes nothing:
   every figure is the producer's text. */
export { CONTRACT, SCHEMA_SHA256 } from './drishti_views-schema.js';
export { LIMITS, FORBIDDEN_KEYS, validate, formatIssue } from './drishti_views-validate.js';
export { MESSAGES, TONES } from './drishti_views-cells.js';
export { PANEL_STATES } from './drishti_views-panels.js';
export { WIDTHS, arrange } from './drishti_views-layout.js';
export { OPS, conflate } from './drishti_views-patch.js';
export { SPECS, ViewHandle, paint } from './drishti_views-paint.js';
export { kinds } from './drishti_views-kinds.js';
import { defineKind } from './drishti_views-kinds.js';
export { inlineNodes, markupNodes, LINK_STATUS } from './drishti_views-words.js';
export { PAGE_ROWS, numberOfText } from './drishti_views-tables.js';
export { MAX_NESTING } from './drishti_views-tabs.js';
export { CHART_KINDS, chartTable } from './drishti_views-charts.js';

/**
 * Registers a panel kind's painter: a host's own kind, drawn in the frame, with the states, the layout and the patches of every kind.
 * @param {string} name a lower-case word ("seat-map")
 * @param {import('./drishti_views-kinds.js').KindPainter} def paint(body, panel, ctx) answers {update(panel), dispose()} or nothing
 * @returns {void}
 * @example registerKind('note', { paint(body, panel, ctx) { body.textContent = panel.data.text; } });
 */
export function registerKind(name, def) { defineKind(name, def); }
