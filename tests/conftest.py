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
    pytest.importorskip("playwright.async_api", reason="needs Playwright (pip install playwright)")
    from browser_harness import Browsers
    b = Browsers()
    try:
        b.start()
    except Exception as e:  # noqa: BLE001 - no browser installed: skip
        b.close()
        pytest.skip(f"needs Playwright's Chromium: {str(e).splitlines()[0]}")
    yield b
    b.close()
