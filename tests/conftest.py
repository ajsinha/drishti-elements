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

"""The browser fixture the Elements tests share: one Chromium per pytest worker, made the first time a test asks (browser_harness.Browsers)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]      # the repository's root: elements/, css/, gallery/, vendor/ are its folders
sys.path.insert(0, str(Path(__file__).resolve().parent))


@pytest.fixture(scope="session")
def browsers():
    # The browsers are REQUIRED: a missing Playwright or Chromium fails the run with the command that fixes it, never skips the browser tests
    # (a run that skipped 105 of them used to be green). The pinned version is in tests/requirements.txt.
    install = "pip install -r tests/requirements.txt && python3 -m playwright install chromium"
    try:
        import playwright.async_api  # noqa: F401
    except ImportError as e:
        pytest.fail(f"Playwright is not installed ({e}); the browser tests are required. Install: {install}", pytrace=False)
    from browser_harness import Browsers
    b = Browsers()
    try:
        b.start()
    except Exception as e:  # noqa: BLE001 - the pinned Chromium is missing: fail, with the command
        b.close()
        pytest.fail(f"the pinned Chromium is not installed or does not start ({str(e).splitlines()[0]}); the browser tests are required. Install: {install}", pytrace=False)
    yield b
    b.close()
