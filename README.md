# CValRSketch

**A single-file, browser-based floor plan sketching tool for residential property appraisal.**
You walk a path by typing wall segments (e.g. `40'3 l`, `34 d`, `13'4 r`), it draws the polygon, totals the square footage, and exports a labeled sketch as SVG or PNG fit to letter paper.

**Version:** 0.8.0 (2026-05-19)
**License:** [AGPL-3.0](./LICENSE)
**Repo:** https://github.com/CAA-EBV-CO-OP/CValRSketch

---

## What problem it solves

Appraisers measure buildings on site with a tape and a clipboard, then have to turn those numbers into a clean sketch with totals and area breakdowns. Most desktop sketch tools require licensing, install, or a mouse — neither great when you're standing in someone's driveway with a phone or tablet.

CValRSketch is a single HTML file. Open it locally, type the measurements as you call them out, get a print-ready sketch with a legend and per-area totals. No install, no account, no server. Sketches save and load as JSON so you can revisit them later.

Built for the **Canadian Appraisers Association — East/Border Valley Co-op (CAA-EBV-CO-OP)** community, but works for any appraiser, designer, or homeowner who needs a quick scaled outline.

---

## Quick Start

1. Clone or download this repo.
2. Open **`sketch_walker.html`** directly in any modern browser (Chrome, Edge, Firefox, Safari).
3. That's it — no install, no build, no server.

> The file is fully self-contained: HTML + inline CSS + vanilla JavaScript. No external dependencies, no network calls.

---

## How the app works

1. **Pick a start point** (defaults to origin).
2. **Walk segments** in the `New Segment` box. Examples:
    - `40'3 l` — walk 40 feet 3 inches *left*
    - `16'4 u 45` — walk 16'4" with a 45° turn *right* from the previous heading
    - `5'd 2'l` — one diagonal wall whose components are 5' down and 2' left
3. **Close the shape** when you return to the start (the gap indicator shows directional offset if you're off).
4. **Label the area** (Living, Finished basement, Open deck, etc.) — sq ft is auto-calculated.
5. **Add more floors** (basement / main / upper) — other floors render as ghosts at adjustable opacity.
6. **Set a Subject** (e.g. *295 Browns Rd, Nakusp*) for the export title.
7. **Export SVG or PNG**, optionally fit to US Letter portrait or landscape, with title + legend.

---

## Key features

### Drawing
- **Walk mode** — type segments like `<length> <dir> [angle]` (e.g. `16'4 u`, `26'9 r`, `8 d`)
- **Relative angle convention** — after a segment, `r 45` turns 45° right of your previous heading; `l 45` turns 45° left. Walks a perimeter intuitively.
- **Combined-component diagonals** — `5'd 2'l` (or `5'd & 2'l`) makes one diagonal wall whose dx/dy come from the components
- **Auto-extend** — type just a direction (e.g. `r`) and Enter to preview the next aligned vertex; cycle with repeated `r`+Enter
- **Pen-jump** — arrow keys to jump pen to the next aligned vertex without drawing a wall
- **Sub-measurements** — `37'6+2'9 l` adds 37'6" + 2'9" → 40'3" total
- **Batch entry** — comma-separated segments: `16'4 u, 26'9 r, 8 d`
- **Smart gap diagnosis** — open shapes show `gap 5'5" (2'0" left + 5'0" down)` so you can spot mismeasured walls

### Editing
- **Edit mode** — click any wall or vertex to modify length, move, insert, or delete
- **Multiple length-edit modes** — stretch end, symmetric, maintain rectangle
- **Split mode** — split a shape with a projected wall
- **Fence (group stretch)** — drag a rectangle, all vertices inside translate; walls crossing the fence stretch automatically. Works on completed shapes, in-progress walks, and offset annotations.
- **Copy shape with offset** — duplicate a selected shape at a typed offset (e.g. `10' r`)

### Measurement annotations
- **Offset measurement tool** — click any two vertices to drop a labeled offset annotation (`2'9" right + 5'0" down`) anywhere on the canvas. Persists across save/load.

### Multi-floor
- **Floors:** basement / main / upper (rename and add as needed)
- **Ghost view** of other floors at adjustable opacity (5%–100%), with full labels and dimensions
- **Per-floor totals** + grand totals by area type

### Export
- **SVG + PNG** with optional subject title and legend
- **Legend** auto-builds from area types actually used, with per-type sq ft totals + wall-style key
- **Page sizes:** Auto, US Letter Portrait (8.5×11), US Letter Landscape (11×8.5)
- **Tight crop** — exports use the actual content bounding box, not the on-screen canvas, so the sketch fills the page
- **Title + legend rendered in page coords** so text stays readable even when the sketch is heavily scaled
- **UI overlays stripped** — vertex picker dots, fence rings, selection highlights don't appear in exports

### Other
- Undo / redo (Ctrl+Z / Ctrl+Y)
- Save / Load as JSON (settings persist via localStorage; sketches save to file)
- Subject field persists with the sketch
- Whole-number sq ft (no decimals cluttering labels)

---

## Notes & constraints

- **Runs entirely client-side.** Nothing is uploaded anywhere. Sketches you save are local files on your machine. If you put real client data in a sketch and email it, that's on you.
- **Single file.** All code lives in `sketch_walker.html`. No build pipeline, no bundler, no transpile step. Open in a text editor to read or modify.
- **Browser only.** Tested in Chromium-based browsers and Firefox. Safari should work but is less tested.
- **No mobile gestures yet.** Pinch-zoom and touch-drag are not implemented; on tablets, use a stylus + on-screen keyboard.

---

## License

CValRSketch is released under the **GNU Affero General Public License v3.0** ([AGPL-3.0](./LICENSE)).

This is a **copyleft** license: you may use, modify, and redistribute the software, **but** any modified version (including network-deployed versions) must remain under AGPL-3.0 with source available, and **attribution to the original project is required**.

If you publish a fork, a hosted instance, or a derivative tool, please:
- Keep the AGPL-3.0 license
- Credit *CValRSketch — CAA-EBV-CO-OP* and link back to https://github.com/CAA-EBV-CO-OP/CValRSketch

This matches the licensing approach used by other tools in the CAA-EBV-CO-OP community (e.g. `CAADataBridge`).

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Issues and pull requests welcome at https://github.com/CAA-EBV-CO-OP/CValRSketch.
