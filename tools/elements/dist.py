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
"""Drishti Elements distributed: the release tree, one folder and its zip, the one form the libraries are handed over in.

``dist/drishti-elements-<version>/`` holds ``elements/<library>/`` (``src/``, the bundle, the ``.d.ts``, the library's style sheet),
``css/`` (the token sheet and the components' sheets), ``themes/`` (one complete token sheet per theme), ``vendor/`` (the engines the
libraries load, each with its licence, and ``VENDOR.md``), ``gallery/`` (the live documentation: open ``gallery/drishti_gallery.html``),
``data/`` (the two shared tables), ``config/`` and ``tools/elements/build.py`` (to bundle a host's own libraries), ``brand/`` when the
project has one, ``LICENSE``, ``README.md``, ``CHANGELOG.md`` and ``drishti-elements.json`` (the version, the libraries, and a SHA-384
integrity hash of every file). The loader of drishti-core works in it unchanged: the folder above ``elements/`` is its static root.
Harness pages and tests are not in it. Offline, Python only: no npm, no network, nothing is uploaded anywhere. The build is reproducible:
the same sources make the same bytes (fixed timestamps, sorted entries)."""
from __future__ import annotations

import base64
import hashlib
import json
import re
import zipfile
from pathlib import Path

import dts

ROOT = Path(__file__).resolve().parents[2]
ELEMENTS = ROOT / "elements"
MANIFEST = ELEMENTS / "drishti_elements.json"
TOKENS = "css/drishti_tokens.css"
HEADER_TEXT = (ROOT / "config" / "license-header.txt").read_text(encoding="utf-8").strip()
ZIP_TIME = (1980, 1, 1, 0, 0, 0)
SHIPPED = ("gallery", "data", "config", "brand")                   # folders of the repository copied into the tree as they are
SHIPPED_FILES = ("LICENSE", "README.md", "CHANGELOG.md", "vendor/VENDOR.md", "tools/elements/build.py")


class DistError(Exception):
    """A request the distribution refuses, in words (an unknown library)."""


def css_comment(text: str) -> str:
    return "/*\n" + "".join(f" * {ln}".rstrip() + "\n" for ln in text.splitlines()) + " */\n"


HEADER_CSS = css_comment(HEADER_TEXT)


def sri(data: bytes) -> str:
    return "sha384-" + base64.b64encode(hashlib.sha384(data).digest()).decode("ascii")


def short(lib: str) -> str:
    return lib[len("drishti-"):] if lib.startswith("drishti-") else lib


def bundle_name(lib: str) -> str:
    return "drishti_" + short(lib).replace("-", "_") + ".js"


# -- the libraries a request names ---------------------------------------------------------------------------------------------------
class Train:
    """The manifest (``drishti_elements.json``): every library, the one version, requirements and files."""

    def __init__(self, manifest_path: Path = MANIFEST):
        self.raw = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.version = self.raw["elements"]
        self.libs: dict[str, dict] = self.raw["libraries"]

    def name(self, given: str) -> str:
        n = given.strip()
        n = n if n.startswith("drishti-") else "drishti-" + n
        if n not in self.libs:
            raise DistError(f"there is no library {given} in this build (built: {', '.join(short(x) for x in self.libs)})")
        return n

    def resolve(self, names: list[str]) -> list[str]:
        """The libraries named (``all``: every one) and every one they require, deepest first, each once."""
        out: list[str] = []

        def visit(n: str, trail: list[str]) -> None:
            if n in trail:
                raise DistError("libraries require each other: " + " -> ".join(trail + [n]))
            for r in self.libs[n].get("requires") or []:
                visit(r, trail + [n])
            if n not in out:
                out.append(n)

        for g in names:
            if g.strip() == "all":
                for n in self.libs:
                    visit(n, [])
            elif g.strip():
                visit(self.name(g), [])
        if not out:
            raise DistError("no library named (for example --libs core,grid,chart)")
        return out


# -- the themes: drishti_tokens.css read into blocks ------------------------------------------------------------------------------------
def css_blocks(text: str) -> list[tuple[str, str]]:
    """The top-level blocks of a style sheet: (prelude, body), comments dropped; an @media block's body is its inside."""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    out, i, n = [], 0, len(text)
    while i < n:
        j = text.find("{", i)
        if j < 0:
            break
        depth, k = 0, j
        while k < n:
            if text[k] == "{":
                depth += 1
            elif text[k] == "}":
                depth -= 1
                if depth == 0:
                    break
            k += 1
        out.append((" ".join(text[i:j].split()), text[j + 1:k]))
        i = k + 1
    return out


THEME_SELECTOR = re.compile(r'^(?::root(?:\[data-theme="[\w-]+"\])?\s*,?\s*)+$')


def declarations(body: str) -> dict[str, str]:
    out = {}
    for d in body.split(";"):
        if ":" in d:
            k, v = (x.strip() for x in d.split(":", 1))
            if k:
                out[k] = " ".join(v.split())
    return out


def themes(tokens_css: str | None = None) -> dict[str, dict]:
    """Every theme of drishti_tokens.css (data-theme on <html>) with its full set of declarations (the default's, then its own), the
    default first; and the blocks every theme shares (the fixed colours, the scales, print) under the key ``""``."""
    css = tokens_css if tokens_css is not None else (ROOT / TOKENS).read_text(encoding="utf-8")
    named: dict[str, dict[str, str]] = {}
    default = None
    shared: list[str] = []
    for prelude, body in css_blocks(css):
        if THEME_SELECTOR.match(prelude) and "data-theme" in prelude:
            names = re.findall(r'data-theme="([\w-]+)"', prelude)
            if re.search(r"(^|,)\s*:root\s*(,|$)", prelude):
                default = default or names[0]
            for t in names:
                named.setdefault(t, {}).update(declarations(body))
        elif prelude.startswith("@media (prefers-color-scheme"):
            continue                                             # the no-theme fallback: a page that picks a theme does not need it
        else:
            shared.append(f"{prelude} {{{body.rstrip()}\n}}")
    if not named:
        raise DistError(f"{TOKENS} defines no theme")
    default = default or next(iter(named))
    base = named[default]
    out = {default: {"default": True, "decls": dict(base)}}
    for t, d in named.items():
        if t != default:
            out[t] = {"default": False, "decls": {**base, **d}}
    for t in out:
        out[t]["scheme"] = out[t]["decls"].get("color-scheme", "dark")
    out[""] = {"shared": shared}
    return out


def theme_names(table: dict | None = None) -> list[str]:
    return [t for t in (table or themes()) if t]


def theme_alias(name: str, table: dict | None = None) -> str:
    """``dark`` is the default theme (or the first dark one), ``light`` the first light one; any other name is a theme of the file."""
    table = table or themes()
    names = theme_names(table)
    if name in names:
        return name
    if name in ("dark", "light"):
        for t in names:
            if (table[t]["scheme"] == name) and (name == "light" or table[t]["default"]):
                return t
        for t in names:
            if table[t]["scheme"] == name:
                return t
    raise DistError(f"there is no theme {name} (themes: {', '.join(['dark', 'light'] + names)})")


def theme_css(name: str, table: dict | None = None) -> str:
    """One theme as a complete token sheet: every token on :root (so no data-theme is needed), then the shared scales and print."""
    table = table or themes()
    t = table[theme_alias(name, table)]
    lines = [HEADER_CSS, f"/* Drishti Elements theme {theme_alias(name, table)} ({t['scheme']}): every design token of drishti-core on :root.\n"
             "   An application overrides a token by setting it after this sheet (see the guide, Theming). Generated from drishti_tokens.css. */\n",
             f':root,\n:root[data-theme="{theme_alias(name, table)}"] {{\n']
    lines += [f"  {k}: {v};\n" for k, v in t["decls"].items()]
    lines.append("}\n\n")
    lines += [b + "\n\n" for b in table[""]["shared"]]
    return "".join(lines).rstrip("\n") + "\n"


# -- the files of a library, laid out as the static root -------------------------------------------------------------------------------
def owner(rel: str) -> str | None:
    m = re.match(r"elements/(drishti-[\w-]+)/", rel)
    return m.group(1) if m else None


def folder_files(rel_dir: str) -> dict[str, bytes]:
    base = ROOT / rel_dir
    if not base.is_dir():
        raise DistError(f"{rel_dir} is missing")
    return {f.relative_to(ROOT).as_posix(): f.read_bytes() for f in sorted(base.rglob("*")) if f.is_file()}


def library_tree(train: Train, lib: str) -> dict[str, bytes]:
    """One library's files: its ES modules, bundle, style sheets (its own), vendored engine and assets with their licences and its
    declarations; drishti-core also the token sheet and every theme."""
    spec = train.libs[lib]
    out: dict[str, bytes] = {}
    out.update(folder_files(f"elements/{lib}/src"))
    out[f"elements/{lib}/{bundle_name(lib)}"] = (ELEMENTS / lib / bundle_name(lib)).read_bytes()
    for part in (spec.get("parts") or {}).values():                       # its parts: files beside the bundle (a worker, an inspector)
        out[f"elements/{lib}/{part['file']}"] = (ELEMENTS / lib / part["file"]).read_bytes()
        for c in part.get("css") or []:
            out[c] = (ROOT / c).read_bytes()
    for c in spec.get("css") or []:
        if owner(c) in (None, lib):
            out[c] = (ROOT / c).read_bytes()
    for s in spec.get("scripts") or []:
        out[s] = (ROOT / s).read_bytes()
        for lic in ("LICENSE", "NOTICE"):
            p = ROOT / Path(s).parent / lic
            if p.is_file():
                out[(Path(s).parent / lic).as_posix()] = p.read_bytes()
    for a in spec.get("assets") or []:
        out.update(folder_files(a.rstrip("/")))
    if lib == "drishti-core":
        table = themes()
        for t in theme_names(table):
            out[f"themes/drishti-theme-{t}.css"] = theme_css(t, table).encode("utf-8")
    d = dts.declarations(lib, (ELEMENTS / lib / spec["entry"]).resolve(), lambda other: f"../{other}/drishti-{short(other)}")
    out[f"elements/{lib}/drishti-{short(lib)}.d.ts"] = (HEADER_CSS + f"/* {lib} {train.version}: TypeScript declarations, generated from the typed JSDoc "
                                                        "by tools/elements/dts.py. */\n" + d).encode("utf-8")
    return out


def integrity(files: dict[str, bytes]) -> dict[str, dict]:
    return {p: {"bytes": len(b), "integrity": sri(b)} for p, b in sorted(files.items())}


def full_tree(train: Train) -> dict[str, bytes]:
    """Every library, the themes, the gallery, the data tables, the project's own files, and ``drishti-elements.json``."""
    libs = train.resolve(["all"])
    files: dict[str, bytes] = {}
    for lib in libs:
        files.update(library_tree(train, lib))
    files["elements/drishti_elements.json"] = (json.dumps(train.raw, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    for d in SHIPPED:
        if (ROOT / d).is_dir():
            files.update(folder_files(d))
    for f in SHIPPED_FILES:
        if (ROOT / f).is_file():
            files[f] = (ROOT / f).read_bytes()
    files["drishti-elements.json"] = dist_manifest(train, libs, files)
    return files


def dist_manifest(train: Train, libs: list[str], files: dict[str, bytes]) -> bytes:
    body = {"name": "drishti-elements", "version": train.version,
            "libraries": {n: {"title": train.libs[n].get("title", ""),
                              "requires": train.libs[n].get("requires") or [], "bundle": f"elements/{n}/{bundle_name(n)}",
                              "entry": f"elements/{n}/{train.libs[n]['entry']}", "types": f"elements/{n}/drishti-{short(n)}.d.ts",
                              "css": train.libs[n].get("css") or []} for n in libs},
            "themes": [p[len("themes/drishti-theme-"):-4] for p in sorted(files) if p.startswith("themes/")],
            "files": integrity({p: b for p, b in files.items() if p != "drishti-elements.json"})}
    return (json.dumps(body, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


# -- the forms -----------------------------------------------------------------------------------------------------------------------
def write_zip(files: dict[str, bytes], path: Path, top: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in sorted(files):
            info = zipfile.ZipInfo(f"{top}/{p}", date_time=ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, files[p])
    return path


def write_tree(files: dict[str, bytes], out: Path) -> Path:
    for p, b in files.items():
        f = out / p
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(b)
    return out


def build_all(out: Path) -> list[tuple[Path, int]]:
    """The release: the tree ``drishti-elements-<version>/`` and its zip, into ``out``."""
    train = Train()
    files = full_tree(train)
    name = f"drishti-elements-{train.version}"
    write_tree(files, out / name)
    z = write_zip(files, out / f"{name}.zip", name)
    return [(out / name, sum(len(b) for b in files.values())), (z, z.stat().st_size)]
