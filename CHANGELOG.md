# Changelog

All notable changes to **CValRSketch** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Voice-to-text segment entry (Web Speech API) with a grammar-first parser and verbal confirmation
- Touch gestures (pinch-zoom, two-finger pan) for tablet/phone use
- "Snap-to-close" one-click button when gap is small but non-zero
- Diagnose hint: "wall N may be X too long/short" suggestions based on gap direction

---

## [0.11.1] — 2026-05-19

### Changed
- **Mobile input flow flipped** to **length first, then direction** — matches the desktop's typed-segment convention. Tap digits and `ft`/`in`/`+`/`.` to build the length, then tap `L`/`U`/`D`/`R` to append the direction, then **✓ Add Wall** to commit.
- **Diagonals via rise/run.** Type a length, tap a direction, type another length, tap another direction → produces one diagonal wall (e.g. `2'6 r 1'6 d` is a wall 2'6" right + 1'6" down combined). Uses the same auto-combine logic core.js already supports for the desktop.
- **Angles** also work natively: type `16'4 r 4 5` (length-direction-angle) and the parser interprets the trailing digits as a CW turn from the previous heading (e.g. 45°).

### Removed
- The 8-way direction pad (with diagonal-corner buttons) and its two-step diagonal-entry mode. The new keypad-only flow handles diagonals and cardinals with the same mental model.

### Added
- **Live preview line** under the entry buffer: shows what the current text will parse as (`→ 16'4" r @ 45°`, `→ 2'10" r (diagonal)`, or `↳ auto-extend r`) so you know what tapping ✓ will do.
- **× clear** key on the keypad to wipe the entry buffer in one tap; **⌫** backspace removes the last character.

---

## [0.11.0] — 2026-05-19

### Added
- **Mobile-first page** at `m/index.html`, installable as a separate PWA at `caa-ebv-co-op.github.io/CValRSketch/m/`. Touch-friendly UI designed for one-thumb operation on a phone in the field.
- **Direction pad + numeric keypad** input flow: tap a cardinal direction (or a diagonal corner), type a distance with the on-screen keypad (`ft`/`in`/`+` units), tap ✓ Add. Auto-extend supported: pick a direction with no distance and tap ✓.
- **Diagonal entry** via the four corner buttons (↖↗↙↘): two-step input collects leg 1 then leg 2, producing one diagonal wall using the shared `&`-component syntax.
- **Tap-to-edit**: tap a completed wall to open a length-change / delete modal; tap a shape interior to open the shape editor (label / type / floor).
- **Pinch-zoom + two-finger pan** on the canvas; double-tap to reset view.
- **Drawer** (☰) holds floor switcher, area list, undo, save/load JSON, export PNG/SVG, ghost-opacity slider, and subject input.
- **Export uses `navigator.share()`** when the browser supports it (so you can text or email the PNG/SVG straight from the iPhone share sheet), falling back to a direct download otherwise.
- `m/manifest.webmanifest` for PWA install at the mobile route. Shares the root `icon.svg` / `icon-192.png` / `icon-512.png`.

### Changed
- Service worker cache bumped to `cvalrsketch-v0.11.0`; cache list now includes `m/`, `m/index.html`, and `m/manifest.webmanifest`.

### Notes
- The mobile page reuses **all** parsing and geometry from `core.js`; sketches saved on mobile and desktop are JSON-compatible (round-trip works either direction).
- v1 mobile scope intentionally excludes Fence-stretch, Split mode, and Offset annotations (kept on desktop). Voice input also deferred.
- Service-worker offline cache for the mobile route requires either an in-folder `m/sw.js` or a `Service-Worker-Allowed` header on the parent SW. v1 ships without offline on mobile; the install + manifest still work fine and the page is cached by the browser's normal HTTP cache.

---

## [0.10.0] — 2026-05-19

### Changed
- **Refactor: extract pure logic into `core.js`.** Parsing (`parseLength`, `parseSegment`, `headingDeg`, `formatLength`, `formatGapBreakdown`), geometry (`pathPoints`, `polygonArea`, `polygonCentroid`, `wallVector/Length/Unit`, `findOpposingWall`), shape edit ops (`rebuildSegments`, `syncClosure`, `setWallLength`, `moveWallByVector`, `moveVertexByVector`, `insertVertexOnWall`, `deleteVertex`), and `findAlignedCandidates` now live in `core.js` and are shared with the upcoming mobile page.
- Constants `TYPES`, `DIR_BASE`, `SETTINGS_DEFAULTS`, `HISTORY_LIMIT`, `EXPORT_PAGE_SIZES` also moved to `core.js`.
- `pathPoints(segs)` and `findAlignedCandidates(priorSegments, dir)` signatures changed: now take `(segs, start)` and `(priorSegments, dir, start, shapes)` respectively. Page-side wrappers (`pathPointsHere`, `findAlignedCandidatesHere`) supply the state-dependent args.
- `deleteVertex` no longer alerts on the too-small-to-delete case; that prompt now lives in the page-side `deleteVertexWithPrompt` wrapper, keeping core pure.
- Service worker cache bumped to `cvalrsketch-v0.10.0`; `core.js` added to `CORE_ASSETS` for offline use.

### Notes
- Behaviour identical to v0.9.1 from the user's perspective. This release is the foundation for the upcoming mobile-first PWA (v0.11.0+) that will also load `core.js`.

---

## [0.9.1] — 2026-05-19

### Changed
- Renamed the app entry from `sketch_walker.html` → `index.html` so the hosted install URL is just `/CValRSketch/` (no filename suffix). The PWA installs cleanly at the repo root path.
- `manifest.webmanifest` `start_url` updated to `./`.
- Service worker (`sw.js`) cache bumped to `cvalrsketch-v0.9.1`; cached asset list and offline fallback updated to `./index.html`.

### Added
- `sketch_walker.html` is now a small redirect stub pointing at `./`, so any bookmarks or shared links to the old path still work.

### Notes
- The historical filename `sketch_walker.html` remains in `git mv` history; rename, don't re-add as separate files.

---

## [0.9.0] — 2026-05-19

### Added
- **Progressive Web App support.** Add to Home Screen on iOS Safari or Chrome Android installs CValRSketch as a launcher icon that opens full-screen and runs offline.
- `manifest.webmanifest` declaring app name, theme, icons, and standalone display mode.
- `sw.js` service worker with offline-first caching (cache key `cvalrsketch-v0.9.0`).
- `icon.svg`, `icon-192.png`, `icon-512.png` for home-screen icons across platforms (including iOS apple-touch-icon).
- Mobile viewport meta + Apple PWA capability meta tags in the HTML head.

### Notes
- PWA install requires HTTPS hosting (e.g. GitHub Pages). Service workers don't run on `file://`.

---
- Inverse-scale dimension labels in exports so they stay readable on heavily-shrunk page-fit exports
- Touch/pinch gesture support for tablets
- Mouse-drag placement for `Copy shape` (currently typed-offset only)
- "Snap-to-close" one-click button when gap is small but non-zero
- Diagnose hint: "wall N may be X" too long/short" suggestions based on gap direction

---

## [0.8.0] — 2026-05-19

### Changed
- **Export pipeline rewritten** so title and legend render in *page coordinates* (always full size) while only the canvas content is scaled to fit the page.
- Exports now compute a **tight bounding box** of the actual content (shapes + in-progress walk + annotations) instead of using the full on-screen canvas, eliminating wasted whitespace on the page.
- Legend switched to a **2-column layout** when there are >4 area types; bigger swatches (30×18) and 13pt labels.
- All `sq ft` values now display as **whole numbers** (centroid labels, sidebar shapes, totals, legend).

### Added
- `.ui-overlay` class on fence selection rings, fence draw rectangle, offset-pick highlight ring, and offset-pick hit circles, so all UI-only visuals are stripped from exports.
- Export pipeline also strips `.selected` styling on walls so they don't render blue in exported sketches.

### Fixed
- Vertex highlight rings (from fence selection) were appearing in PNG exports — now stripped.
- Missing close-paren in the legend builder that crashed the entire script and froze the app on reload — fixed.

---

## [0.7.0] — 2026-05-19

### Added
- **Subject field** in the floor bar — stored on the sketch (saves with JSON) and rendered as the title on SVG/PNG exports.
- **Legend in exports** — auto-builds from area types actually used on the sketch, with fill swatches, per-type sq ft totals, and a wall-style key (enclosed wall vs. dashed open edge).
- **Settings toggles** for `Include subject as title` and `Include legend` on exports.
- **Page-size dropdown** in Settings: `Auto`, `Letter Portrait (8.5×11)`, `Letter Landscape (11×8.5)`. Exports fit to letter paper at 96 DPI with `preserveAspectRatio=xMidYMid meet`.
- **Ghost-opacity slider** in the floor bar (and in Settings) so other-floor visibility is dialed in live without opening the settings modal.

### Changed
- Default ghost opacity raised from 25% to 45%.
- Ghost shapes now render walls, dimension labels, and centroid/area labels (all under the same opacity), instead of just an outline.

---

## [0.6.0] — 2026-05-19

### Added
- **Fence mode (group stretch)** — new top-level mode tab. Click-and-drag a rectangle on the canvas to capture every vertex fully inside; typed offset (e.g. `3'6 r`) moves all captured vertices.
  - Walls with both endpoints inside translate as a rigid block.
  - Walls crossing the fence boundary stretch (one end moves, one stays).
  - Works on completed shapes, in-progress walk vertices, *and* offset-annotation endpoints.
- **Copy shape with offset** — when a shape is selected in Edit mode, sidebar exposes a `Copy + place` action that duplicates the shape at a typed offset (`10' r`, `5'd 3'l`, …). The copy becomes selected for chained operations.

### Changed
- `viewTransform` is now a module-level variable so screen↔world coordinate conversion is available outside `render()`.
- Esc clears a pending fence drag/selection or a pending offset-pick.

---

## [0.5.0] — 2026-05-19

### Added
- **Offset measurement annotations** — new sidebar tool (`Measure offset`). Click two vertices to drop a labeled measurement (`<distance> (<dx> dir + <dy> dir)`) anywhere on the canvas. Annotations persist across save/load, are part of undo, and can be removed individually or cleared all at once.
- First-picked vertex shows a dashed magenta ring so you know what you've captured.
- In-progress walk vertices become clickable during picking (start, pen, and intermediate vertices).

### Changed
- Pen-info line and the `Current Shape` gap badge now show the directional **gap breakdown** (`gap 5'5" (2'0" right + 5'0" down)`) so you can spot mismeasured walls instantly.
- In-progress canvas now draws an **orange dashed gap line** with an `OFFSET …` label between the pen and the start when the path is open.

---

## [0.4.0] — 2026-05-19

### Added
- **Combined-component diagonal syntax** — `5'd & 2'l` makes one diagonal wall with summed dx/dy. The `&` is optional: `5'd 2'l` (or `5'd3'l`) auto-combines when the parser sees length+dir+length+dir pairs.
- Error message when the parser detects four-token pairs without `&` and falls through to angle parsing, suggesting the right form.

### Changed
- `parseSegment` now optionally accepts a `priorHeadingDeg` argument; angles on `r`/`l` are interpreted as a **turn from the previous heading** instead of CW from cardinal base (so walking a perimeter doesn't require keeping track of absolute direction).
- `addCmd` threads the prior heading through batch parsing so each comma-separated segment turns from the previous.

---

## [0.3.0] — earlier dev (pre-session baseline updates)

### Added
- Multi-floor support with `basement` / `main` / `upper` tabs, ghosted other-floor view, per-floor totals.
- Save / Load sketch as JSON.
- Settings modal with persistence in `localStorage`.
- Edit mode with click-to-select walls / vertices / whole shapes; multiple length-edit modes (stretch-end, symmetric, maintain-rect).
- Split mode with projected wall.
- Auto-extend and pen-jump features.

---

## [0.2.0] — earlier dev

### Added
- Walk mode parser supporting `<length> <dir> [angle]`, sub-measurements (`37'6+2'9`), batch entry, and cardinal directions.
- SVG and PNG export.

---

## [0.1.0] — initial

### Added
- First working version of `sketch_walker.html` with single-floor walking, basic edit, and SVG export.

[Unreleased]: https://github.com/CAA-EBV-CO-OP/CValRSketch/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/CAA-EBV-CO-OP/CValRSketch/releases/tag/v0.8.0
[0.7.0]: https://github.com/CAA-EBV-CO-OP/CValRSketch/releases/tag/v0.7.0
[0.6.0]: https://github.com/CAA-EBV-CO-OP/CValRSketch/releases/tag/v0.6.0
[0.5.0]: https://github.com/CAA-EBV-CO-OP/CValRSketch/releases/tag/v0.5.0
[0.4.0]: https://github.com/CAA-EBV-CO-OP/CValRSketch/releases/tag/v0.4.0
[0.3.0]: https://github.com/CAA-EBV-CO-OP/CValRSketch/releases/tag/v0.3.0
[0.2.0]: https://github.com/CAA-EBV-CO-OP/CValRSketch/releases/tag/v0.2.0
[0.1.0]: https://github.com/CAA-EBV-CO-OP/CValRSketch/releases/tag/v0.1.0
