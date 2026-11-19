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
/* drishti-events: events in the page, across tabs and with a server. One model: every event is a message on a topic, in the scopes
   'page' (drishti-core's shared bus), 'tabs' and 'server'; one object, Events, routes. Topics with wildcards ('prices.*', 'prices.>'),
   publish and subscribe, request and reply, streams as async iterators, typed topics and checked kinds, the library's own events as
   '$events.*' topics, and one clock for every timer (testClock in tests). */
import { segment as coreSegment } from '../../drishti-core/src/drishti_index.js';
import { createEvents as create } from './drishti_events-hub.js';

export { SCOPES, OWN_TOPICS, DEFAULT_LIMITS, Events, ScopedEvents, Topic, createEvents, covers } from './drishti_events-hub.js';
export { SUBSCRIPTION_STATES, Subscription } from './drishti_subscription.js';
export { EventError, TimeoutError, AbortError, MAX_ID_LENGTH, isMessage, checkTopic, checkPattern, matches, patternsOverlap, shape } from './drishti_envelope.js';
export { systemClock, testClock, seededRandom } from './drishti_timing.js';

/**
 * Encodes any text as one topic segment (drishti-core's segment): 'Bank of Canada' becomes one segment a topic can carry.
 * @param {string} text
 * @returns {string}
 */
export function segment(text) { return coreSegment(text); }

/**
 * An Events. With no address: the page (and its tabs) only.
 * @param {string} [url] the server's address
 * @param {import('./drishti_events-hub.js').EventsOptions} [options]
 * @returns {import('./drishti_events-hub.js').Events}
 */
export function connect(url, options) {
  if (url && typeof url === 'object' && !options && !Array.isArray(url)) { return create(url); }
  return create(options);
}
