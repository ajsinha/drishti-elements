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
/* drishti-events under Node, step 10 (the inspector's data): the Messages rows (newest first, filtered by pattern, words, direction and
   outcome), the Subscriptions, Queue and Connection views. The drawn inspector is tested in the browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../elements/drishti-events/src/drishti_index.js';
import * as I from '../../elements/drishti-events/src/drishti_inspector.js';
import { EventBus } from '../../elements/drishti-core/src/drishti_index.js';

test('the inspector\'s rows: messages filtered by pattern and words, subscriptions, the connection, an empty queue without a server', async () => {
  const clock = E.testClock();
  const ev = E.createEvents({ bus: new EventBus(), clock: clock });
  ev.subscribe('prices.>', () => {});
  await ev.publish('prices.fx.USDCAD', 1, { key: 'USDCAD', kind: 'tick' });
  await ev.publish('chat.lobby', 'hi');
  const all = I.messageRows(ev);
  assert.equal(all[0].topic, 'chat.lobby');                           // newest first
  assert.deepEqual(I.messageRows(ev, { text: 'prices.>', dir: 'in' }).map((r) => r.outcome), ['delivered to 1 listener']);
  assert.deepEqual(I.messageRows(ev, { text: 'tick', dir: 'in' }).map((r) => r.topic), ['prices.fx.USDCAD']);
  assert.deepEqual(I.messageRows(ev, { dir: 'in', outcome: 'none' }).map((r) => r.topic), ['chat.lobby']);
  const subs = I.subscriptionRows(ev);
  assert.deepEqual([subs[0].pattern, subs[0].state, subs[0].received], ['prices.>', 'active', 1]);
  assert.deepEqual(I.queueRows(ev), []);
  const c = I.connectionView(ev);
  assert.equal(c.figures[0].value, 'idle');
  assert.deepEqual(I.INSPECTOR_TABS, ['messages', 'subscriptions', 'connection', 'queue', 'why']);
  assert.equal(I.inspectorCommand(ev).title, 'Open the events inspector');
  ev.destroy();
});
