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

// Runs the Node tests: node tools/node_tests.mjs <pattern>...   from the repository root.
// A pattern is a path whose segments may be * (any folder name); the last segment names the folder whose *.test.mjs files run, e.g.
// tests/elements. It exists so that no shell glob is needed (Windows, Node 20): the same command runs everywhere.
import { readdirSync, existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

function folders(pattern) {
  let found = ["."];
  for (const seg of pattern.split("/").filter(Boolean)) {
    found = found.flatMap((base) => seg === "*"
      ? (existsSync(base) ? readdirSync(base).map((n) => join(base, n)).filter((p) => statSync(p).isDirectory()) : [])
      : [join(base, seg)]);
  }
  return found.filter((p) => existsSync(p) && statSync(p).isDirectory());
}

const files = process.argv.slice(2).flatMap(folders).flatMap((d) => readdirSync(d).filter((n) => n.endsWith(".test.mjs")).sort().map((n) => join(d, n)));
if (files.length === 0) { console.error("no *.test.mjs files found for: " + process.argv.slice(2).join(" ")); process.exit(2); }
// Two passes (G2 gate F18): everything but the budget tests in parallel (node's default), then the budget tests alone, one at a time. A budget test
// (a rate or a time limit, its name starts "budget:") measures this machine, so it never runs beside other work. Both passes must pass.
const run = (extra) => spawnSync(process.execPath, ["--test", ...extra, ...files], { stdio: "inherit" }).status ?? 1;
const parallel = run(["--test-skip-pattern=^budget:"]);
const serial = run(["--test-name-pattern=^budget:", "--test-concurrency=1"]);
process.exit(parallel || serial);
