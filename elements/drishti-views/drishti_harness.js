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
/* The views harness (drishti_harness.html): a vector of the specification painted with the options the address names; every event of
   the handle recorded on window.__harness, which the browser test drives. A link resolves to the vector V002 (opened in place). */
(function () {
  'use strict';
  const V = window.Drishti.elements.views;
  const q = new URLSearchParams(location.search);
  const H = window.__harness = { ready: false, error: null, events: [], handle: null, vectors: null };
  if (q.get('theme')) { document.documentElement.setAttribute('data-theme', q.get('theme')); }
  document.getElementById('hx-theme').addEventListener('click', () => {
    const de = document.documentElement;
    de.setAttribute('data-theme', de.getAttribute('data-theme') === 'light' ? 'terminal' : 'light');
  });
  const el = document.getElementById('hx-view');
  if (q.get('width')) { el.style.setProperty('width', Number(q.get('width')) + 'px'); }
  H.options = {
    shadow: q.get('shadow') !== '0', density: q.get('density') || undefined, keys: true,
    links: { href: (l) => (l && l.kind === 'order' ? '#order-' + l.id : null), resolveView: () => H.vectors.views.find((v) => v.id === 'V002').view }
  };
  H.paint = (view, extra) => {
    H.handle = V.paint(el, view, Object.assign({}, H.options, extra || {}));
    ['ready', 'error', 'issues', 'link', 'key', 'patch', 'navigate'].forEach((n) => H.handle.on(n, (e) => {
      H.events.push({ type: n, code: e.detail && e.detail.code, detail: n === 'issues' ? e.detail.issues.length : (n === 'link' ? e.detail.link : (n === 'key' ? e.detail.key : null)) });
    }));
    return H.handle.ready;
  };
  fetch('spec/drishti_vectors.json').then((r) => r.json()).then((vec) => {
    H.vectors = vec;
    const pick = document.getElementById('hx-pick'), id = q.get('view') || 'V001';
    vec.views.forEach((v) => { const o = document.createElement('option'); o.value = v.id; o.textContent = v.id + ' · ' + v.about; o.selected = v.id === id; pick.appendChild(o); });
    pick.addEventListener('change', () => { location.search = '?view=' + pick.value; });
    const v = vec.views.find((x) => x.id === id);
    return H.paint(v ? v.view : null);
  }).then(() => { H.ready = true; }, (e) => { H.error = String(e && e.stack || e); H.ready = true; });
})();
