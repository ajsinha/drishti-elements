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
"""The guards of Drishti Elements: the generic libraries hold no domain vocabulary in their code, nothing is loaded from a CDN, and the
hand-written sources of the libraries keep one implementation of each thing (no second ECharts call, no second number formatter)."""
import re

import pytest

from conftest import ROOT

pytestmark = pytest.mark.static   # a quick file check: the gate runs it

COMMENT = re.compile(r"/\*.*?\*/|(?<![:\\'\"])//[^\n]*|\{#.*?#\}|<!--.*?-->", re.S)


# ---- the generic libraries know no domain  ----------------------------------------------------------
# Domain logic stays in its domain's pack, backend module and JS library (a host's own library). drishti-core,
# drishti-grid, drishti-chart, drishti-inputs and drishti-data carry generic hooks only (a tone, a threshold line, a server-computed
# figure, a kind a domain library registers), never a domain's words in their code: a risk measure's name, a risk kind, a regulatory
# rule. Comments and JSDoc are documentation and may use a domain's examples; so are the harness pages (the gallery's sample data). A
# threshold (`limit`, a row cap or a line a caller draws) is a generic hook and is not listed.
GENERIC = ("drishti-core", "drishti-grid", "drishti-chart", "drishti-inputs", "drishti-data", "drishti-graph", "drishti-tree", "drishti-events")
DOMAIN_WORDS = re.compile(r"\b(?:VaR|VAR|var\d\d|ES|EEPE|EPE|PFE|MTM|DV01|FRTB|SIMM|P&L|[Ee]xposures?|[Bb]acktest\w*|Basel|[Tt]raffic light"
                          r"|[Nn]etting|[Cc]ounterpart(?:y|ies)|risk\.[a-z-]+)\b")
# Documentation only: the generated manifest names every library with its title .
DOMAIN_DOCS = {"drishti-core/src/drishti_manifest.js"}


def _domain_words(text):
    code = COMMENT.sub(lambda m: "\n" * m.group(0).count("\n"), text)
    return [f"{n}: {line.strip()[:120]}" for n, line in enumerate(code.splitlines(), 1) if DOMAIN_WORDS.search(line)]


def test_the_generic_libraries_hold_no_domain_vocabulary():
    elements = ROOT / "elements"
    bad = []
    for lib in GENERIC:
        for p in sorted((elements / lib / "src").glob("*.js")) + sorted((elements / lib).glob("drishti_*.css")):
            rel = str(p.relative_to(elements))
            if rel in DOMAIN_DOCS or "harness" in p.name:
                continue
            bad += [f"{rel}:{hit}" for hit in _domain_words(p.read_text(encoding="utf-8"))]
    assert not bad, "domain words in a generic library: move the logic to the domain's library behind a generic hook\n" + "\n".join(bad)


def test_the_domain_words_check_finds_them_and_leaves_documentation_alone():
    assert _domain_words("if (k === 'risk.backtest') { zoom(); }")
    assert _domain_words("label: 'VaR 99%'")
    assert _domain_words("const exposure = rows.map(peak);")
    assert not _domain_words("/** The sum of VaR is not a VaR: a non-additive total is the server's. */\nconst total = server(cell);")
    assert not _domain_words("const limit = o.limit || 2000; const Source = o.EventSource;")
    assert all((ROOT / "elements" / d).is_file() for d in DOMAIN_DOCS)


# ---- nothing is loaded from a CDN ---------------------------------------------------------------------------------------------------
CDN = re.compile(r"cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|code\.jquery\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.tailwindcss\.com")


def test_no_source_loads_anything_from_a_cdn():
    bad = []
    for folder in ("elements", "gallery", "css", "tools"):
        for p in sorted((ROOT / folder).rglob("*")):
            if p.is_file() and p.suffix in (".js", ".css", ".html", ".py") and p.name != "drishti_catalogue.js":
                bad += [f"{p.relative_to(ROOT)}: {m.group()}" for m in CDN.finditer(p.read_text(encoding="utf-8", errors="replace"))]
    assert not bad, "\n".join(bad)


# ---- one implementation of each thing, in the libraries --------------------------------------------------------------------------------
ONE = {
    "echarts": (re.compile(r"\becharts\s*\.\s*(?:init|getInstanceByDom|registerMap|connect|dispose|use)\b"), ("drishti-chart",)),
    "live": (re.compile(r"\bnew\s+(?:[\w$.]*\.)?(?:EventSource|WebSocket|BroadcastChannel|SharedWorker)\b"), ("drishti-events",)),
}


@pytest.mark.parametrize("rule", sorted(ONE))
def test_only_the_owning_library_keeps_the_implementation(rule):
    pattern, owners = ONE[rule]
    bad = []
    for p in sorted((ROOT / "elements").glob("*/src/*.js")):
        if p.parent.parent.name in owners:
            continue
        code = COMMENT.sub(lambda m: "\n" * m.group(0).count("\n"), p.read_text(encoding="utf-8"))
        bad += [f"{p.relative_to(ROOT)}: {line.strip()[:120]}" for line in code.splitlines() if pattern.search(line)]
    assert not bad, "\n".join(bad)


# ---- every library's look is in its style sheet ------------------------------------------------------------------------------
# A library draws its parts with class names of its own prefix; nearly all of them are styled by the shipped sheets (css/ and the
# library's own). A sheet cut short or overwritten (the grid's once lost all but its last block) leaves the component drawn bare: the
# share of its class names with no rule falls far below this floor. Class names that only mark a part for code are allowed under it.
PREFIXES = {"drishti-grid": "dg", "drishti-chart": "dc", "drishti-tree": "dt", "drishti-graph": "dn", "drishti-inputs": "di", "drishti-designer": "dd"}


@pytest.mark.parametrize("library", sorted(PREFIXES))
def test_a_library_styles_the_class_names_it_draws_with(library):
    sheets = list((ROOT / "css").glob("*.css")) + [p for p in (ROOT / "elements").glob("*/drishti_*.css") if "harness" not in p.name]
    defined = set(re.findall(r"\.([a-z][a-z0-9_-]*)", "".join(p.read_text(encoding="utf-8") for p in sheets)))
    src = "".join(p.read_text(encoding="utf-8") for p in (ROOT / "elements" / library / "src").glob("*.js"))
    used = set(re.findall(r"cls: '(%s(?:-[a-z0-9-]+)?)['\s]" % PREFIXES[library], src))
    missing = sorted(used - defined)
    assert used and len(missing) <= 0.2 * len(used), f"{library}: {len(missing)} of {len(used)} class names have no rule: {missing[:20]}"
