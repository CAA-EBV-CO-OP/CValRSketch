# CValRSketch

**Floor plan sketching for residential appraisal that runs entirely in the browser.** Use it offline from a local download or host it yourself; your sketches never leave your machine.
Walk a path by entering wall segments (e.g. `40'3 l`, `34 d`, `13'4 r`), and the app draws the polygon, calculates square footage, and exports a labeled sketch as SVG or PNG.

**Version:** 0.37.0 (2026-10-02)
**License:** [AGPL-3.0](./LICENSE)
**Repo:** https://github.com/CAA-EBV-CO-OP/CValRSketch
**Part of:** [OSASI — the Open Source Appraisal Software Initiative](https://osasi.org)

---

## Overview

Create a sketch with simple distance and direction into the tool to produce a clean drawing with area totals. CValRSketch is a single self-contained HTML file that handles this step: enter measurements directly, review the resulting polygon, label areas, and export a print-ready sketch.

The file requires no installation, no server, and no account. Sketches are saved and loaded as JSON files on the local machine. **Save app copy** (header) writes a frozen, self-contained HTML of the running version — keep it in the job folder beside the sketch so the sketch reopens the same way years later (works from a served copy such as osasi.org; a copy opened from disk cannot read its own source).

Developed for the CAA-EBV-CO-OP community as part of [OSASI](https://osasi.org), the Open Source Appraisal Software Initiative — a co-operative of real estate appraisers building shared, open tools that run entirely in the browser.

---

## Quick Start

### Desktop (Chrome / Edge / Firefox / Safari)
1. Clone or download this repo.
2. Open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari).

### Mobile (iPhone / Android) — touch-first version

A dedicated mobile-first page lives at **`m/index.html`**, optimised for one-thumb operation: direction pad + numeric keypad, pinch-zoom canvas, share-sheet exports. Use it on your phone instead of the desktop page.

Live URL: **https://caa-ebv-co-op.github.io/CValRSketch/m/**

To install it as a home-screen icon:

1. Open the URL above on your phone in **Chrome (Android)** or **Safari (iOS)**.
2. **Android:** Chrome surfaces an "Install" / "Add to Home screen" prompt automatically.
3. **iOS:** tap the Share button → **Add to Home Screen**.
4. Launch from the home-screen icon — opens full-screen, no browser chrome.

Sketches save and load as JSON and are interchangeable between the desktop and mobile pages.

### Install the desktop version on a phone (PWA, advanced)

If you specifically want the desktop UI on your phone (with its three-column layout — usually not what you want on a small screen), the same install steps work on the root URL **https://caa-ebv-co-op.github.io/CValRSketch/**.

Service workers do not run on `file://`, so PWA install requires hosting. For local testing, run any static server (e.g. `python -m http.server` in the repo folder) and open `http://localhost:8000/`.

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
- **Edit mode** — select any wall or vertex to modify length, move, insert, delete, or curve a wall into an arc by its rise
- **Length-edit modes** — stretch end, symmetric, maintain rectangle
- **Split mode** — divide a shape with a projected wall
- **Fence (group stretch)** — drag a selection rectangle; enclosed vertices translate, crossing walls stretch
- **Copy shape with offset** — duplicate a selected shape at a typed offset (e.g. `10' r`)

### Measurement Annotations
- **Measure tool** — 📏 Measure (or M), then click any two points: corners and walls snap, Alt for a free point, Shift for level/plumb; labeled measurements belong to their floor and persist across save/load

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

### Import a floor-plan PDF
- **📐 Import PDF…** reads an **iGUIDE** floor-plan PDF and creates one shape per floor, traced from the PDF's vector drawing (not a picture), so corners land within about half an inch
- A check table compares each traced floor with the area iGUIDE states; floors go to the matching tab, multi-building plans arrive as separate buildings
- Rooms iGUIDE excludes (garage, unheated sun room) come in as their own areas, sized to the excluded area it states; decks, porches and patios are traced from the outline around their label
- Each floor is turned and slid to sit over the main floor (wall directions, the page compass, then walls landing on walls); placements that are a judgment call are flagged *check position*
- Runs on your computer: the PDF is never uploaded. Needs the hosted app (or any local web server); a page opened straight from disk cannot load the PDF reader
- New formats are added as *format profiles* in `pdf-import.mjs`

### Other
- Undo / Redo (`Ctrl+Z` / `Ctrl+Y`)
- Save / Load as JSON
- Subject field persists with the sketch
- Square footage displayed as whole numbers

---

## Notes

- Runs entirely client-side. No data is transmitted externally.
- All code is in a single file (`index.html`, redirected from the legacy `sketch_walker.html`). No build pipeline.
- Tested in Chromium-based browsers and Firefox. Safari is expected to work but is less tested.
- Touch/pinch-zoom gestures are not yet implemented.
- Third-party code: PDF import uses Mozilla [PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0), vendored unmodified in `vendor/pdfjs/` and loaded only when a PDF is imported.

---

## License

Released under the [GNU Affero General Public License v3.0 (AGPL-3.0)](./LICENSE).

You may use, modify, and redistribute this software. Modified versions — including network-deployed instances — must remain under AGPL-3.0 with source available.

What that means in practice:

- **Use it freely.** Anyone may run, study and modify CValRSketch, personally or commercially.
- **Share alike.** If you redistribute it, modified or not, you must provide the complete corresponding source under AGPL-3.0. If you modify it and let others use it over a network (a hosted copy), those users must be offered the source too (AGPL §13).
- **Keep the notices.** The copyright, licence and no-warranty notices in `NOTICE`, the file headers, and the About dialog must stay with every copy; modified files must say they were changed and when (AGPL §5).
- **Credit is required, not optional.** Under additional terms adopted per AGPL §7(b) and §7(c) (see `NOTICE`; the licence text itself is `LICENSE`), every copy and every derivative must preserve and display the attribution *"Built on CValRSketch, an OSASI project — https://osasi.org"* wherever it shows its own name, version or legal notices, and a modified version must not be presented as the original or as endorsed by OSASI or CAA-EBV-CO-OP.

**Your own branding is welcome.** Settings → *Your branding* takes your firm name and logo (kept in your browser, not in sketch files) and puts them in the app header and the title block of every export; the *provided by osasi.org* credit on exports is off unless you tick it. Beyond that you may restyle the app and even rename it — the licence permits modification, and the exported sketch pages carry no required notice at all, so client-facing output is entirely yours. Two things stay: the attribution *Built on CValRSketch, an OSASI project* remains wherever the app shows its own name, version or legal notices (the About dialog is enough), and a rebranded version must not be presented as the original or as endorsed by OSASI. If you share or host your branded version for others, the same source-sharing rule applies to it.

The names *CValRSketch* and *OSASI* are not licensed for use on derivative works in a way that suggests endorsement; please rename your fork if it diverges.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Issues and pull requests are welcome.
