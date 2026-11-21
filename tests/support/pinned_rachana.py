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

"""The drishti-rachana these tests use: the commit named in tests/support/rachana_host.pin.json, never whatever is checked out beside this project.

* git_source(): a repository that holds the pinned commits (the specification and fire-case pins). DRISHTI_RACHANA names one explicitly;
  else a sibling ../drishti-rachana when it holds the commit; else a cached clone of the pin's repository under target/tmp.
* host_home(): a checkout of the pinned commit with java/rachana-live built, in target/tmp/drishti-rachana-<commit> (built once, then reused;
  the build prints what it is doing). DRISHTI_RACHANA_HOME is an explicit override only: a built checkout you name, used as it is.
A missing network or tool fails the test with the command to run; nothing is skipped."""
import contextlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
PIN = json.loads(Path(__file__).with_name("rachana_host.pin.json").read_text(encoding="utf-8"))
CACHE = ROOT / "target" / "tmp"


def _say(msg: str) -> None:
    print(f"[pinned drishti-rachana] {msg}", file=sys.stderr, flush=True)


def _run(cmd, cwd=None) -> None:
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.returncode:
        pytest.fail(f"{' '.join(map(str, cmd))} failed ({r.returncode}):\n{(r.stdout + r.stderr)[-1500:]}", pytrace=False)


@contextlib.contextmanager
def _locked():
    """One process prepares the cache at a time (the browser tests run on several workers)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    try:
        import fcntl
    except ImportError:                      # Windows: no lock
        yield
        return
    with open(CACHE / "drishti-rachana.lock", "w") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def _has(repo: Path, rev: str) -> bool:
    return (repo / ".git").exists() and subprocess.run(["git", "-C", str(repo), "cat-file", "-e", rev + "^{commit}"], capture_output=True).returncode == 0


def _clone() -> Path:
    """A cached clone of the pinned repository (fetched again when it lacks the commit)."""
    c = CACHE / "drishti-rachana-source"
    if not (c / ".git").exists():
        _say(f"cloning {PIN['repo']} to {c}")
        _run(["git", "clone", "--quiet", "--no-checkout", PIN["repo"], str(c)])
    if not _has(c, PIN["commit"]):
        _run(["git", "-C", str(c), "fetch", "--quiet", "origin"])
    return c


def _git_source() -> Path:
    explicit = os.environ.get("DRISHTI_RACHANA")
    if explicit:
        return Path(explicit)
    sib = ROOT.parent / "drishti-rachana"
    return sib if _has(sib, PIN["commit"]) else _clone()


def git_source() -> Path:
    """A repository holding the pinned commits."""
    with _locked():
        return _git_source()


def _host_home() -> Path:
    override = os.environ.get("DRISHTI_RACHANA_HOME")
    if override:
        home = Path(override)
    else:
        home = CACHE / ("drishti-rachana-" + PIN["commit"][:12])
        if not (home / "checked-out.txt").is_file():
            if home.exists():
                shutil.rmtree(home)
            src = _git_source()
            _say(f"checking out {PIN['commit'][:12]} from {src} to {home}")
            _run(["git", "clone", "--quiet", "--no-checkout", str(src), str(home)])
            if not _has(home, PIN["commit"]):
                _run(["git", "-C", str(home), "fetch", "--quiet", PIN["repo"]])
            _run(["git", "-C", str(home), "checkout", "--quiet", PIN["commit"]])
            (home / "checked-out.txt").write_text(PIN["commit"] + "\n")
    t = home / "java" / "rachana-live" / "target"
    if not ((t / "runtime-classpath.txt").is_file() and list(t.glob("rachana-live-*.jar"))):
        if override:
            pytest.fail(f"DRISHTI_RACHANA_HOME={home} has no built java/rachana-live: cd java && ./mvnw -pl rachana-live -am package -DskipTests", pytrace=False)
        _say(f"building the live reference host in {home}/java (once; JDK 21)")
        _run(["./mvnw", "-B", "-q", "-pl", "rachana-live", "-am", "package", "-DskipTests"], cwd=home / "java")
    if not (home / "js/packages/rachana/src/data_client.js").is_file():
        pytest.fail(f"{home} is not a drishti-rachana checkout (js/packages/rachana/src/data_client.js missing)", pytrace=False)
    return home


def host_home() -> Path:
    """The pinned commit, checked out and built (java/rachana-live and its runtime classpath)."""
    with _locked():
        return _host_home()
