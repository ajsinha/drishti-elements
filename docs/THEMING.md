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
# Theming

Every colour, size, radius, layer and density of every component is a CSS custom property of drishti-core's token set. The one file is
`css/drishti_tokens.css`; `python3 tools/elements/build.py` writes the themes' table of drishti-core (`drishti_theme-table.js`) from it, and
`tools/elements/dist.py` writes one complete sheet per theme to `themes/`.

## The tokens

| Family | Tokens | What they hold |
|---|---|---|
| Theme colours | `--d-bg` ... `--d-bad`, `--d-fill`, `--d-grad-*`, `--d-nav-*` | one block per theme (`data-theme` on `<html>`), the light fallback, and the print palette last; text colours read at 4.5:1 on every ground |
| Fixed colours | `--d-on-color`, `--d-paper`, `--d-on-band`, `--d-band-*`, `--d-scrim*`, `--d-swatch-*` | the same in every theme: white labels on coloured fills, scrims under dialogs, a theme menu's swatches |
| Elevation | `--d-shadow` (per theme), `--d-elev-*` | shadows by role: paper, raised, bar, pop, toast, panel, list, menu, sheet, dialog, drawer |
| Type | `--d-fs-<px>`, `--d-fs-em-<percent>`, `--d-fs-display-<n>` | absolute steps written in px (a component draws the same size whatever the host page's root text size), relative steps, fluid display sizes |
| Spacing | `--d-sp-<px>`, `--d-space-xs` ... `--d-space-xl` | padding, margin and gap steps |
| Radius | `--d-radius`, `--d-radius-<px>`, `--d-radius-pill` | corner radii |
| Layers | `--d-z-bar` ... `--d-z-confirm` | the stacking order of what floats over the page |
| Breakpoints | `--d-bp-*` | the only widths an `@media` may use (a media query cannot read a custom property, so it repeats the number) |
| Densities | `--d-density-data-*`, `--d-density-control-*` | the base text of the three densities (comfortable, compact, terminal) for data (grid, chart) and controls (inputs) |
| Motion | `--d-dur-fast`, `--d-dur-base`, `--d-dur-slow`, `--d-dur-shimmer`, `--d-ease` | `prefers-reduced-motion` sets every duration to 0 |

Components that draw something carry a `@media print` block and a `@media (forced-colors: active)` block.

## Choosing a theme

- **Every theme, switched at run time**: load `css/drishti_tokens.css` and set `data-theme` on `<html>`: `terminal` (the default, dark), `light`,
  `blue`, `green`, `wallstreet`, `crimson`, `crimson-dark`, `terminal-green`, `terminal-crimson` or `terminal-blue`. Without the attribute the default
  theme is used, and the light one when the reader's system prefers light. `Drishti.elements.core.setTheme('light')` does the same from code.
- **One theme, fixed**: `themes/drishti-theme-<name>.css`, or `python3 tools/elements/cli.py pack --theme <name>` (`dark` and `light` name the
  default dark and the first light theme): every token on `:root`, no attribute needed.

## Your own theme

An override after the sheet: set the tokens you change, on `:root` for the whole page or on any element for one part of it. The components follow
at once, charts included.

```css
:root {
  --d-accent: #0a7d5a;          /* buttons, emphasis, the selected cell */
  --d-on-accent: #ffffff;       /* text on it */
  --d-font-sans: "Inter", system-ui, sans-serif;
}
.my-sidebar { --d-surface: #f4f6f8; }   /* one region only */
```

Keep text tokens readable on their grounds (4.5:1, WCAG AA). The density (`comfortable`, `compact`, `terminal`) is each component's `density`
option or `data-density` on an ancestor.
