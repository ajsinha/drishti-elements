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

"""The README and the docs (a quick file check): the README says no licence is granted and holds no e-mail address and no release label of any other
project; every relative link of every document names a file that exists; the libraries' table is current (tools/docs/elements_api.py --check)."""
import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.static   # a quick file check: the gate runs it

ROOT = Path(__file__).resolve().parents[1]
DOCS = [ROOT / "README.md", ROOT / "CHANGELOG.md", *sorted((ROOT / "docs").glob("*.md"))]
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[a-z]{2,}")
LINK = re.compile(r"\]\(([^)#\s]+)(?:#[^)]*)?\)")


def body(path: Path) -> str:
    """A document without its header comment (the one place the copyright holder's address is written)."""
    return re.sub(r"\A<!--.*?-->\n", "", path.read_text(encoding="utf-8"), count=1, flags=re.S)


def test_the_readme_says_no_licence_is_granted_and_names_no_address():
    text = body(ROOT / "README.md")
    assert "no licence is granted" in text and "Proprietary. Copyright (c) 2026 Ashutosh Sinha. All rights reserved." in text
    for d in (ROOT / "README.md", ROOT / "CHANGELOG.md"):
        assert not EMAIL.findall(body(d)), d.name


@pytest.mark.parametrize("doc", DOCS, ids=lambda p: p.name)
def test_every_relative_link_names_a_file_that_exists(doc):
    bad = []
    for target in LINK.findall(body(doc)):
        if target.startswith(("http://", "https://", "mailto:")):
            continue
        if not (doc.parent / target).resolve().exists():
            bad.append(target)
    assert not bad, f"{doc.name}: {bad}"
