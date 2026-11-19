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
import { Connection, eventsEndpoint } from './drishti_connection.js';

export { SCOPES, OWN_TOPICS, DEFAULT_LIMITS, Events, ScopedEvents, Topic, createEvents, covers } from './drishti_events-hub.js';
export { SUBSCRIPTION_STATES, Subscription } from './drishti_subscription.js';
export { EventError, TimeoutError, AbortError, MAX_ID_LENGTH, isMessage, checkTopic, checkPattern, matches, patternsOverlap, shape } from './drishti_envelope.js';
export { systemClock, testClock, seededRandom, Backoff, Heartbeat } from './drishti_timing.js';
export { CONNECTION_STATES, SECRET_PARAMS, Connection, checkAddress, base64url } from './drishti_connection.js';
export { PROTOCOL_VERSION, SUBPROTOCOL, CLIENT_FRAMES, SERVER_FRAMES, ERROR_CODES, CLOSE_CODES, encodeFrames, decodeFrames, checkFrame } from './drishti_protocol.js';
export { parseSse, readSse } from './drishti_transport-sse.js';
export { OVERFLOW_RULES, HIDDEN_DELIVERY_MS, Conflater, GridSink } from './drishti_flow.js';
export { OUTBOX_DEFAULTS, Outbox, memoryStore, indexedDbStore } from './drishti_outbox.js';

/**
 * Encodes any text as one topic segment (drishti-core's segment): 'Bank of Canada' becomes one segment a topic can carry.
 * @param {string} text
 * @returns {string}
 */
export function segment(text) { return coreSegment(text); }

/**
 * An Events connected to a server (WebSocket for ws: and wss: addresses, Server-Sent Events otherwise), or, with no address and no
 * configured events endpoint, the page and its tabs only. Nothing has to be awaited: subscriptions are sent when the connection opens,
 * publishes wait for it, and every reconnect restores both.
 * @param {(string|function(): string|Object)} [url] the server's address, a function asked at every connect, or a provider with
 *   transport(context) (the mock server); default the endpoint configure({ endpoints: { events } }) names
 * @param {(import('./drishti_events-hub.js').EventsOptions|import('./drishti_connection.js').ConnectOptions)} [options]
 * @returns {import('./drishti_events-hub.js').Events}
 */
export function connect(url, options) {
  let address = url, o = options;
  if (url && typeof url === 'object' && typeof url.transport !== 'function' && options === undefined) { o = url; address = undefined; }
  if (address === undefined || address === null || address === '') { address = eventsEndpoint() || null; }
  const events = create(o);
  if (address) {
    try { new Connection(events, address, o); } catch (e) { events.destroy(); throw e; }
  }
  return events;
}
