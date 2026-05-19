# CValRSketch

**A browser-based floor plan sketching tool for residential property appraisal.**
Walk a path by entering wall segments (e.g. `40'3 l`, `34 d`, `13'4 r`), and the app draws the polygon, calculates square footage, and exports a labeled sketch as SVG or PNG.

**Version:** 0.9.0 (2026-05-19)
**License:** [AGPL-3.0](./LICENSE)
**Repo:** https://github.com/CAA-EBV-CO-OP/CValRSketch

---

## Overview

Create a sketch with simple distance and direction into the tool to produce a clean drawing with area totals. CValRSketch is a single self-contained HTML file that handles this step: enter measurements directly, review the resulting polygon, label areas, and export a print-ready sketch.

The file requires no installation, no server, and no account. Sketches are saved and loaded as JSON files on the local machine.

Developed for the CAA-EBV-CO-OP community.

---

## Quick Start

### Desktop (Chrome / Edge / Firefox / Safari)
1. Clone or download this repo.
2. Open `sketch_walker.html` in any modern browser (Chrome, Edge, Firefox, Safari).

### Install on iPhone / iPad / Android (PWA)

CValRSketch is a Progressive Web App. To install it as a home-screen icon that opens full-screen and runs offline:

1. Host the repo over HTTPS — the simplest path is enabling **GitHub Pages** on this repo (Settings → Pages → Deploy from `main` / root). Any static host works.
2. Open the hosted URL on your phone in **Chrome (Android)** or **Safari (iOS)**.
3. **Android:** Chrome surfaces an "Install" / "Add to Home screen" prompt automatically.
4. **iOS:** tap the Share button → **Add to Home Screen**.
5. Launch from the home-screen icon. It opens full-screen, no browser chrome, and works offline after the first load.

Service workers do not run on `file://`, so PWA install requires hosting. For local testing, run any static server (e.g. `python -m http.server` in the repo folder) and open `http://localhost:8000/sketch_walker.html`.

The file is fully self-contained: HTML + inline CSS + vanilla JavaScript. No external dependencies, no network calls.

---

## How It Works

1. Pick a start point (defaults to origin).
2. Enter wall segments in the **New Segment** box. Format: `<length> <dir> [angle]`. Examples:
   - `40'3 l` — 40 feet 3 inches left
   - `16'4 u 45` — 16'4" angled 45° right from the previous heading
   - `5'd 2'l` — diagonal wall with components 5' down and 2' left
3. Close the shape when the path returns to the start point. The gap indicator shows the directional offset if the shape is not yet closed.
4. Label the area (e.g. Living, Finished Basement, Open Deck) — square footage is calculated automatically.
5. Add floors (Basement / Main / Upper) as needed. Other floors render as adjustable-opacity ghosts.
6. Set a Subject (e.g. a property address) for the export title.
7. Export as SVG or PNG, optionally fitted to US Letter portrait or landscape.

---

## Features

### Drawing
- **Walk mode** — enter segments as `<length> <dir> [angle]` (e.g. `16'4 u`, `26'9 r`, `8 d`)
- **Relative angle turns** — `r 45` turns 45° right of the previous heading; `l 45` turns 45° left
- **Combined-component diagonals** — `5'd 2'l` creates one diagonal wall from directional components
- **Auto-extend** — enter a direction alone (e.g. `r`) to preview the next aligned vertex
- **Pen-jump** — arrow keys move the pen to the next aligned vertex without drawing a wall
- **Sub-measurements** — `37'6+2'9 l` sums to 40'3"
- **Batch entry** — comma-separated segments: `16'4 u, 26'9 r, 8 d`
- **Gap diagnosis** — open shapes display a directional breakdown (e.g. `gap 5'5" (2'0" left + 5'0" down)`)

### Editing
- **Edit mode** — select any wall or vertex to modify length, move, insert, or delete
- **Length-edit modes** — stretch end, symmetric, maintain rectangle
- **Split mode** — divide a shape with a projected wall
- **Fence (group stretch)** — drag a selection rectangle; enclosed vertices translate, crossing walls stretch
- **Copy shape with offset** — duplicate a selected shape at a typed offset (e.g. `10' r`)

### Measurement Annotations
- **Offset annotation tool** — click two vertices to place a labeled measurement anywhere on the canvas; persists across save/load

### Multi-Floor
- Floors: Basement / Main / Upper (rename or add as needed)
- Ghost view of other floors at adjustable opacity (5%–100%), with labels and dimensions
- Per-floor totals and grand totals by area type

### Export
- SVG and PNG with optional subject title and legend
- Legend built from area types in use, with per-type square footage totals and wall-style key
- Page sizes: Auto, US Letter Portrait (8.5×11"), US Letter Landscape (11×8.5")
- Tight crop — bounding box of actual content, not the full canvas
- Title and legend rendered at full size regardless of sketch scale
- UI overlays (selection handles, fence rings, vertex pickers) are stripped from exports

### Other
- Undo / Redo (`Ctrl+Z` / `Ctrl+Y`)
- Save / Load as JSON
- Subject field persists with the sketch
- Square footage displayed as whole numbers

---

## Notes

- Runs entirely client-side. No data is transmitted externally.
- All code is in a single file (`sketch_walker.html`). No build pipeline.
- Tested in Chromium-based browsers and Firefox. Safari is expected to work but is less tested.
- Touch/pinch-zoom gestures are not yet implemented.

---

## License

Released under the [GNU Affero General Public License v3.0 (AGPL-3.0)](./LICENSE).

You may use, modify, and redistribute this software. Modified versions — including network-deployed instances — must remain under AGPL-3.0 with source available.

Forks and derivative tools should retain the AGPL-3.0 license and credit the original project with a link to this repository.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Issues and pull requests are welcome.
