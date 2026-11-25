<!--
  Drishti Elements

  Copyright (c) 2026 Ashutosh Sinha <ajsinha@gmail.com>.
  All rights reserved.

  PROPRIETARY.

  This file is the proprietary property of Ashutosh Sinha.
  Copying, use, modification or distribution of this file, via any medium,
  is not permitted except with the express prior written permission of the
  copyright holder.

  See the LICENSE file in the root of this repository.
-->
# Roadmap

Designed but **not built**. Nothing here is in the release; what is built is in [DESIGN.md](DESIGN.md), [VIEWS.md](VIEWS.md) and
[API.md](API.md). The full earlier design text is in the repository's history (`docs/VIEWS_DESIGN.md` before 3.3.2-ide3).

## drishti-views: producing a ViewModel from a server

- **Helpers for Python, Java and Node** that build a ViewModel in a few calls, each with a 30-line example dashboard.
- **A linter** that explains a ViewModel's problems with fixes, a **playground page** to edit one live, and a **"Views: speed" gallery
  page** that shows the budgets being met.
- **`migrate.mjs`**: upgrades a ViewModel between contract versions; `since` and deprecation marks on every field.

## drishti-views: the contract

- **More patch operations** on live frames (11 of the 17 designed are not built; rows patches by key, as built, cover the common case).
- **Safety and size limits in the contract**: `links.allow`, `limits.bytes`, `limits.text`; Trusted Types throughout.
- **Actions** from a panel to the host (`actions.publish`).

## drishti-views: the handle and options

- Handle methods `subscribe`, `export` and `open`; options `theme`, `events`, `remember`, `explain`, `actions`, `limits` and `tag`; a
  `VERSION` export.
- **Speed budgets P4 to P8 and P10 to P12** with tests (P1 to P3 and P9 are built and tested).

## Writing screens in a few lines

The idea of writing a few lines of Sutra to get a live, terminal-grade screen belongs to the Sutra language and is in Drishti Rachana's
roadmap.
