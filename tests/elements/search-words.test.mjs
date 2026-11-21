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
/* The quick search, read one way in every library: lower-cased words, a "quoted phrase" as one word, every word found (shared vectors). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { searchWords, hasWords, rowFilter } from '../../elements/drishti-core/src/drishti_index.js';
import { searchOptions } from '../../elements/drishti-inputs/src/drishti_index.js';
import { searchPalette } from '../../elements/drishti-designer/src/drishti_index.js';

const VECTORS = [
  ['', []], ['   ', []], [null, []], ['Desk FX', ['desk', 'fx']], ['  a   b ', ['a', 'b']],
  ['desk "New York" fx', ['desk', 'new york', 'fx']], ['"new york"', ['new york']], ['"  pad  "', ['pad']], ['"open phrase', ['open phrase']], ['""', []]
];

test('searchWords: the shared vectors', () => {
  for (const [q, words] of VECTORS) { assert.deepEqual(searchWords(q), words, JSON.stringify(q)); }
  assert.deepEqual(searchWords('Él "Ça va"', (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()), ['el', 'ca va']);
  assert.equal(hasWords('new york desk', ['new york', 'desk']), true);
  assert.equal(hasWords('new desk york', ['new york']), false);
});

test('every library reads the quick search by the same words: a quoted phrase is one word', () => {
  const places = [{ label: 'New York' }, { label: 'York New' }, { label: 'Newark' }];
  assert.deepEqual(searchOptions(places, '"new york"').map((p) => p.label), ['New York']);
  const entries = [{ label: 'Open new york', detail: '' }, { label: 'York, new', detail: '' }];
  assert.deepEqual(searchPalette(entries, '"new york"').map((e) => e.label), ['Open new york']);
  const test = rowFilter({}, '"new york"', [{ id: 'c' }], (r, c) => r[c.id]);
  assert.equal(test({ c: 'New York' }), true);
  assert.equal(test({ c: 'York New' }), false);
});
