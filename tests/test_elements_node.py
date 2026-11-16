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

"""Drishti Elements in Node (it starts Node, so it is not one of the gate's quick checks: test_elements.py has those):
the libraries' unit tests (tests/elements/*.test.mjs, node --test: fast, no browser) and an exported workbook a real xlsx (a zip of
well-formed parts)."""
import base64
import io
import json
import shutil
import subprocess
import zipfile
from xml.etree import ElementTree

import pytest

from conftest import ROOT

ELEMENTS = ROOT / "elements"
NODE = shutil.which("node")


@pytest.mark.skipif(NODE is None, reason="needs Node.js")
def test_the_libraries_unit_tests_pass_in_node():
    files = sorted(str(p) for p in (ROOT / "tests" / "elements").glob("*.test.mjs"))
    assert files
    run = subprocess.run([NODE, "--test", *files], capture_output=True, text=True, timeout=300)
    assert run.returncode == 0, run.stdout[-4000:] + run.stderr[-2000:]


@pytest.mark.skipif(NODE is None, reason="needs Node.js")
def test_an_exported_workbook_is_a_real_xlsx():
    grid = ELEMENTS / "drishti-grid" / "drishti_grid.js"
    code = ("const G = require(%s); const t = {columns: [{header: 'Desk', type: 'text'}, {header: 'Notional', type: 'number', format: 'amount2'},"
            " {header: 'Day', type: 'date'}], rows: [['RATES <NY> & co', 1234.5, '2026-11-06'], ['FX', -2, '2026-11-07']], levels: [0, 1], bold: [true, false]};"
            " process.stdout.write(Buffer.from(G.toXlsx(t, {sheetName: 'Trades'})).toString('base64'));") % json.dumps(str(grid))
    run = subprocess.run([NODE, "-e", code], capture_output=True, text=True, timeout=60, check=True)
    z = zipfile.ZipFile(io.BytesIO(base64.b64decode(run.stdout)))
    assert z.testzip() is None
    names = set(z.namelist())
    assert {"[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/worksheets/sheet1.xml", "xl/styles.xml"} <= names
    for n in names:
        ElementTree.fromstring(z.read(n))                                     # every part is well-formed XML
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    sheet = ElementTree.fromstring(z.read("xl/worksheets/sheet1.xml"))
    rows = sheet.findall(".//m:sheetData/m:row", ns)
    assert len(rows) == 3
    assert rows[2].get("outlineLevel") == "1"
    cells = rows[1].findall("m:c", ns)
    assert cells[0].find(".//m:t", ns).text == "RATES <NY> & co"
    assert cells[1].find("m:v", ns).text == "1234.5" and cells[1].get("t") is None
    assert ElementTree.fromstring(z.read("xl/workbook.xml")).find(".//m:sheet", ns).get("name") == "Trades"
