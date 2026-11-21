#!/usr/bin/env python3
# Drishti Elements
#
# Copyright (c) 2026 Ashutosh Sinha <ajsinha@gmail.com>.
# All rights reserved.
#
# PROPRIETARY.
#
# This file is the proprietary property of Ashutosh Sinha.
# Copying, use, modification or distribution of this file, via any medium,
# is not permitted except with the express prior written permission of the
# copyright holder.
#
# See the LICENSE file in the root of this repository.
"""The standard test command (G2 gate F18): python3 tools/run_tests.py [-n 8] [-k expr].

1. the Node tests: everything but the budget tests in parallel, then the budget tests alone, one at a time (tools/node_tests.mjs);
2. the pytest suite with `-m "not budget"` over -n workers (default 8), then the tests marked `budget` alone, in this process, no workers.

A budget test measures a rate or a time on this machine, so it never runs beside other work: parallel load cannot fail it. The run also
FAILS when any test was skipped: a skip is a missing prerequisite (Playwright and its pinned Chromium, Node, a drishti-rachana checkout
for the pins), never a pass. Exit 0 only when every pass is green with nothing skipped."""
import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(cmd: list[str], check_skips: bool = False) -> int:
    print("+ " + " ".join(cmd), flush=True)
    if not check_skips:
        return subprocess.run(cmd, cwd=ROOT).returncode
    p = subprocess.Popen(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    tail = ""
    for line in p.stdout:
        sys.stdout.write(line)
        if re.search(r"\d+ (passed|failed|deselected|skipped)", line):
            tail = line
    code = p.wait()
    if re.search(r"\b\d+ skipped\b", tail):
        print("run_tests: tests were SKIPPED: a missing prerequisite (see -rs above) is a failure: pip install -r tests/requirements.txt && "
              "python3 -m playwright install chromium", file=sys.stderr)
        return code or 1
    return code


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("-n", default="8", help="pytest workers for the parallel pass (default 8)")
    ap.add_argument("-k", help="a pytest -k expression for both passes")
    a = ap.parse_args()
    k = ["-k", a.k] if a.k else []
    base = [sys.executable, "-m", "pytest", "-q", "-rs", "tests"] + k
    steps = [([ "node", "tools/node_tests.mjs", "tests/elements"], False),
             (base + ["-n", a.n, "-m", "not budget"], True),
             (base + ["-n", "0", "-m", "budget"], True)]
    failed = [" ".join(c[:3]) for c, skips in steps if run(c, skips)]
    print("run_tests: " + ("FAILED: " + "; ".join(failed) if failed else "every pass green, nothing skipped"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
