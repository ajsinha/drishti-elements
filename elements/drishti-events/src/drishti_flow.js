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
/* The flow between a message's arrival and its listeners. (Step 5 of the build plan adds conflation, delivery per frame, bounded buffers,
   hidden tabs and the grid sink; until then a message is delivered at once.) */

/**
 * The flow of a subscription: push(message) in, the subscription's _deliver out.
 * @param {Object} sub the subscription
 * @param {Object} o its options
 * @param {Object} events
 * @returns {{push: function(Object): void, stop: function(): void}}
 */
export function createFlow(sub, o, events) {
  return { push: (m) => sub._deliver(o.batch ? [m] : m), stop: () => undefined, events: events };
}
