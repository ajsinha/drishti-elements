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
/* Writes tests/support/fire_cases.json: the `fire` conformance cases of drishti-rachana (conformance/1/fire, level 1.2) with the ViewModels
   its runtime builds for them. Each case: the ViewModel before the first step, and per step the trigger, what the case expects (state,
   effects, problems: as the case file names them) and the ViewModel the host's next bind answers. The painter's browser test fires
   the same steps and compares; nothing here evaluates an expression for the painter, it only records what the reference runtime did.

     node tools/views/fire_fixture.mjs --pin <commit> [--repo ../drishti-rachana] [--only id,id]

   The one deliberate command that moves the pin: it checks <commit> out of the repository into a temporary worktree (target/tmp), builds the
   runtime bundle there (python3 tools/js/build_js.py), records the commit and the hash of its fire cases in the fixture and removes the worktree.
   Without --pin the fixture is regenerated at the commit it already names. */
import { readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const only = arg('--only') ? arg('--only').split(',') : null;
const repo = resolve(arg('--repo') || process.env.DRISHTI_RACHANA || '../drishti-rachana');
const fixture = new URL('../../tests/support/fire_cases.json', import.meta.url);
const pin = arg('--pin') || JSON.parse(readFileSync(fixture, 'utf8')).commit;
const sh = (cwd, cmd, ...a) => execFileSync(cmd, a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const full = sh(repo, 'git', 'rev-parse', '--verify', pin + '^{commit}');
const root = resolve(new URL('../../target/tmp/fire-pin-' + full.slice(0, 12), import.meta.url).pathname);
rmSync(root, { recursive: true, force: true });
mkdirSync(resolve(root, '..'), { recursive: true });
sh(repo, 'git', 'worktree', 'add', '--quiet', '--detach', root, full);
try {
  sh(root, 'python3', 'tools/js/build_js.py');
  await main();
} finally {
  try { sh(repo, 'git', 'worktree', 'remove', '--force', root); } catch (e) { rmSync(root, { recursive: true, force: true }); }
}
async function main() {
const require = createRequire(import.meta.url);
const yaml = require(join(root, 'js/vendor/js-yaml/4.1.0/js-yaml.min.js'));
const rt = await import(pathToFileURL(join(root, 'js/packages/rachana/dist/rachana.tools.js')).href);
rt.init('core', JSON.stringify([readFileSync(join(root, 'spec/1/formats.yaml'), 'utf8')]));
const dir = join(root, 'conformance/1/fire');
// The pin (G2 gate F15): the Rachana commit the cases are from and the hash of the case files (each file's name, a NUL, its bytes, in name order). tests/test_views_spec.py
// reads the same files at that commit and fails when they differ from the fixture: regenerate with `--pin <commit>`. Nothing moving is compared.
const hash = createHash('sha256');
for (const f of readdirSync(dir).filter((x) => x.endsWith('.yaml')).sort()) { hash.update(f + '\0'); hash.update(readFileSync(join(dir, f))); }
const out = { source: 'drishti-rachana conformance/1/fire', commit: full, sha256: hash.digest('hex'), cases: [] };
for (const f of readdirSync(dir).filter((x) => x.endsWith('.yaml')).sort()) {
  const doc = yaml.load(readFileSync(join(dir, f), 'utf8'));
  for (const c of doc.cases) {
    const id = doc.suite + '/' + c.id;
    if (only && !only.includes(c.id)) { continue; }
    const given = Object.assign({}, doc.given || {}, c.given || {});
    const req = { sutra: c.sutra, files: c.files, given: given, steps: c.steps, since: c.since || doc.since };
    const got = JSON.parse(rt.fire(JSON.stringify(req)));
    if (got.error) { throw new Error(id + ': ' + got.error); }
    const exp = (c.expect && c.expect.steps) || [];
    out.cases.push({ id: id, since: req.since, viewModel: got.viewModel, steps: c.steps.map((st, i) => ({
      panel: st.panel === undefined ? null : st.panel, control: st.control === undefined ? null : st.control, trigger: st.trigger,
      mark: st.mark === undefined ? null : st.mark, values: st.values === undefined ? null : st.values, value: st.value === undefined ? null : st.value,
      expect: { state: (exp[i] || {}).state, effects: (exp[i] || {}).effects, problems: (exp[i] || {}).problems },
      actual: { state: got.steps[i].state, effects: got.steps[i].effects, problems: got.steps[i].problems },
      viewModel: got.steps[i].viewModel })) });
  }
}
writeFileSync(fixture, JSON.stringify(out));
console.log(out.cases.length + ' cases at ' + full);
}
