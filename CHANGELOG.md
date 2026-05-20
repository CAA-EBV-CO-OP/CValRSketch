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

## [0.11.19] — 2026-05-20

### Added
- **Persistent self-intersection warning badge.** Every render now checks each shape on the active floor for self-intersection (any two non-adjacent walls crossing). Broken shapes get a red ⚠ badge drawn above their centroid. Tap the badge to open the same split / keep / undo modal that the live-move detection uses.
- The badge catches cases that the post-move detection misses: shapes loaded from JSON that were already broken, shapes that became broken through in-progress segment moves, and any geometry the live check happened to miss.

### Notes
- Detection is still per-shape only (no cross-shape overlap check). If you walk a new shape that overlaps an existing shape's walls, that's not flagged — it's two separate polygons that happen to share space. Genuine self-intersection (one polygon's walls crossing itself) does get flagged.

---

## [0.11.18] — 2026-05-20

### Added
- **Wall-delete now has three options** instead of the binary Cancel/OK confirm. Tapping **Delete wall** in the wall edit panel opens a modal:
  - **🔗 Merge adjacent walls (join into one straight wall)** — current behaviour. Removes the shared vertex so the two adjacent walls collapse into one straight wall.
  - **✂ Detach for re-walking (replace this wall with a new path)** — *new*. Removes the shape entirely and turns the remaining walls (in order, starting just after the deleted wall) into in-progress walking segments. Start point is set to the end of the deleted wall, so the pen ends up at the start of the deleted wall — exactly where you need to walk in the replacement geometry. Use this to swap a wall for a notch, bay, chamfer, or any custom shape, then ✓ Close Shape to re-form the area.
  - **Cancel** — does nothing.

### Why
- Some wall edits aren't a length tweak — they're "this wall should actually have a 3' bump-out". Previously you'd have to delete the wall, delete several others, and re-walk the whole thing. Now: tap wall → Delete → Detach → walk the new path → Close.

---

## [0.11.17] — 2026-05-20

### Changed
- **Save and Export now use the best available file-picker API for the platform.** New `saveBlob(blob, filename, mime)` helper applied to both desktop (`index.html`) and mobile (`m/index.html`) for **Save JSON**, **Export PNG**, **Export SVG**:
  1. **`window.showSaveFilePicker`** (desktop Chrome / Edge / Opera / Brave) — a real native **Save As** dialog with folder navigation and a Create New Folder button. The browser remembers the last folder you saved to *for this app + file type*, so the second save defaults there automatically. `startIn: 'documents'` is the initial hint before the first save.
  2. **`navigator.share({files})`** (iOS Safari 15+, Android Chrome) — the system share sheet, which includes **Save to Files** so you can navigate to any folder, including creating new ones.
  3. **Direct download fallback** — for Firefox / older browsers / unsupported MIME types, behaviour is unchanged (file lands in the browser's default Downloads folder).
- Export filenames now derive from the **Subject** (sanitized: non-word characters replaced with `_`) instead of being hardcoded to `sketch.svg` / `sketch.png` / `sketch.json`. So `295 Browns Rd, Nakusp` saves as `295_Browns_Rd__Nakusp.svg`.

### Notes
- **Browsers don't let web apps set a default folder programmatically.** The two APIs above are the closest available: they let the user navigate and create folders themselves, with `showSaveFilePicker` remembering the last location across sessions.

---

## [0.11.16] — 2026-05-20

### Added
- **Self-intersection detection on mobile move operations.** When any vertex / wall / fence / length-change move would cause a shape's walls to cross each other (figure-8 geometry), a modal pops up before the toast:
  - **✂ Split into 2 separate areas** — splits the polygon at the intersection point into two simple polygons. The original shape keeps the outer loop; a new shape ("<original> (split)") gets the inner loop, with the same type and floor. Important for appraisal use cases like Gross Living Area (GLA) where a self-crossed shape really represents two non-contiguous spaces that shouldn't be counted together.
  - **⚠ Keep as one shape anyway** — applies the move as-is. The polygon will render oddly (the SVG fill will treat the inner loop as a hole due to the even-odd fill rule) and area calculations may be off, but you can clean it up later.
  - **↶ Undo the move** — reverts the change. Same as Ctrl+Z. The shape is restored exactly as it was.
- Detection is interior-strict (segment crossings only, not endpoint touches) so adjacent walls and concave corners don't false-positive.
- Detection runs after each: `vertex snap`, `vertex move` (typed offset), `wall snap`, `wall move` (typed offset), `length change`, `fence snap`, `fence move`.

---

## [0.11.15] — 2026-05-19

### Added
- **Direction-snap buttons in the mobile fence panel.** After fence-selecting one or more vertices, four big buttons (← L, ↑ U, ↓ D, R →) appear above the typed-offset input. Each tap moves the entire selection toward the next aligned vertex in that direction, using the **centroid** of the selected vertices as the snap reference. Same `findSnapCandidates` (direct alignment + perpendicular projection, closest wins) as the pen / vertex / wall snap.
- For a single-vertex fence selection (a common close-the-gap workflow — fence the pen vertex, tap U, gap closed in two taps), the centroid IS the vertex, so the snap is unambiguous.

### Changed
- `applyFenceMove` (typed offset) and the new `snapFenceMove` (direction tap) now share an `applyFenceMoveBy(dx, dy)` helper, so all fence-move behaviour (walls fully inside translate; walls crossing the fence stretch; in-progress vertex shifts; rebuild segments) is in one place.

### Why
- Closing a gap by fence-selecting the pen and typing `5'0 u` worked, but typed offsets get tedious when the snap target is "the next aligned vertex". One-tap direction-snap matches the vertex/wall edit panels and the chain auto-extend, so the snap mental model is consistent across every move tool.

---

## [0.11.14] — 2026-05-19

### Changed
- **Mobile vertex/wall edit controls now slide INTO the keypad area** instead of opening a modal that hides the sketch. The bottom strip swaps between three modes:
  - **Walk** (default) — entry display + numeric keypad
  - **Editing vertex/wall** — header with current position/length + Done button, big direction-snap buttons (L/U/D/R), typed-offset input, plus set-as-start / delete actions
  - **Fence** — group select / move panel (existing)
- Tapping a vertex on an active-floor shape opens the edit panel directly (skipping the previous "use as start vs move" modal). The "Use as start" action is a button inside the panel now.
- Tapping a wall opens the wall edit panel directly (skipping the wall-editor modal).
- **Ghost vertices** (other floors) still open a small modal — only the "Use as next start point" action applies, so the panel would be overkill.
- The canvas remains fully visible while editing, so direction-snaps and offset applies update the sketch live and you can see exactly what each tap does.

### Why
- The previous modal occluded the sketch you were trying to align with. Now you can see both the controls AND the geometry, so snapping a vertex/wall to the next aligned position is a tap-and-watch experience.

---

## [0.11.13] — 2026-05-19

### Fixed
- **Mobile fence tool "works once per session" bug.** iOS occasionally drops `pointerup` events, leaving a stale entry in the active-pointers map. Subsequent single-finger taps then look like a 2-finger gesture, so the 1-finger fence-drag branch never fires. Now `enterFenceMode()` and `exitFenceMode()` clear the active-pointers map and any pending gesture-start state, so fence drags work reliably every time you toggle the mode.

### Added
- **Wall editor expansion.** Tapping a wall now opens a modal with three move/snap options, in the same length + snap + offset pattern as the vertex editor:
  - **Change length** — text input with Apply button (same as before).
  - **Snap-move to next aligned vertex (from start endpoint)** — four big direction buttons (← L, ↑ U, ↓ D, R →). Each tap moves the whole wall by the distance from the wall's start endpoint to the next aligned target in that direction; uses the same `findSnapCandidates` (direct + projection, closest wins) as the pen and vertex tools. The modal stays open so you can keep tapping a direction to walk the wall along through further aligned positions.
  - **Move whole wall by typed offset** — text input (e.g. `3'6 r`, `5'd 2'l`) with Apply. Uses `moveWallByVector`.
- **Delete wall** and **Done** buttons remain at the bottom of the modal.

---

## [0.11.12] — 2026-05-19

### Fixed
- **Mobile direction-snap could skip closer waypoints.** When a directly-aligned vertex existed in the chosen direction (even one far away), the snap would always prefer it over closer perpendicular-line projections. So tapping `U` from the bottom of a staircase shape could jump 20' all the way to the start vertex's Y rather than stopping at the first 5' or 10' staircase corner. Fixed by merging both candidate sources into one list sorted by distance, so the truly-closest target wins regardless of whether it's a direct alignment or a column/row projection.

### Changed
- Direct-alignment + projection candidate combination now lives in a single `findSnapCandidates()` helper used by chain auto-extend, the bare-direction auto-extend, and the vertex direction-snap modal.

---

## [0.11.11] — 2026-05-19

### Added
- **Chain auto-extend on mobile.** Tap L/U/D/R with no length to preview a snap to the next aligned vertex (existing). Now tap a **different** direction button to chain another leg from that endpoint — and another, and another. Each leg is drawn as an orange dashed line with its snap distance.
- **↗ Connect button** (magenta) next to ✓ Add Wall. Visible when the chain has 2+ legs. Commits the entire chain as **one diagonal wall** from the pen to the chain's final endpoint, discarding the intermediate waypoints. A faint magenta line on the canvas previews where the diagonal would go.
- ✓ Add Wall button label now reflects chain length: `✓ Add 1 Wall`, `✓ Add 2 Walls`, etc. Commits each leg as its own cardinal wall.
- **⌫ backspace pops the last chain leg** instead of clearing the whole preview. **× clear** wipes the chain.

### Removed
- The single-direction cycle behaviour from earlier auto-extend — tapping the same direction twice now appends a second leg instead of cycling to a further candidate on the same line. Chained navigation through closer waypoints replaces the cycle UX.

### Why
- Lets you visually navigate to a destination vertex that isn't directly aligned with the pen by snapping leg-by-leg, then either keep that L-shaped path or collapse it into a single angled wall — exactly the same as drawing a diagonal wall to a far vertex you can't easily measure.

---

## [0.11.10] — 2026-05-19

### Added
- **Fence-mode toggle in the header (🔲).** One-tap access to enter / exit fence mode without opening the drawer. Toggles to ✗ while fence is active so you can clearly see (and cancel) the mode.
- **Direction-snap buttons in the vertex move modal.** After tapping a vertex and choosing "Move", the modal now shows four big direction buttons (← L, ↑ U, ↓ D, → R) above the typed-offset input. Each tap moves the vertex to the **next aligned vertex** in that direction (using the same alignment logic as the pen's auto-extend, with perpendicular-projection fallback). Tap a direction repeatedly to walk the vertex along to further-aligned vertices. The modal stays open and shows the live position; tap **Done** when you're satisfied.
- The typed-offset path is still available below the direction buttons for explicit nudges.

### Why
- Direction-snap is the most common move pattern — "this vertex needs to line up with that one over there" — and now takes two taps instead of typing an offset.
- The drawer fence-mode button was hard to discover; the header toggle is always visible.

---

## [0.11.9] — 2026-05-19

### Fixed
- **Mobile vertex / wall taps not opening their editors.** The `pointerdown` handler was calling `svg.setPointerCapture()` on every touch, including plain single-finger taps. On iOS this redirects the eventual `click` event to the SVG element instead of the child hit-circle, so the vertex menu / wall editor handlers never fired. Now pointer capture is only set when we're actually starting a gesture (pinch zoom or fence drag). Single-finger taps go through the normal click path.

### Notes
- This bug had been silently affecting tap targets since v0.11.0 — the fence rollout made it noticeable when vertex taps stopped working as expected.

---

## [0.11.8] — 2026-05-19

### Added
- **Fence tool on mobile** (group select + stretch). Drawer → **🔲 Group select / move…** enters fence mode:
  - Header switches to an orange tint, the entry/keypad is replaced by a small fence panel.
  - **One-finger drag** on the canvas draws an orange-dashed selection rectangle.
  - **Two-finger pinch still zooms** during fence mode, so you can frame the area before selecting.
  - On release, every vertex inside the rectangle on the **active floor** gets a blue ring. In-progress walk vertices are picked up too.
  - Type an offset like `3'6 r` in the fence panel and tap **↔ Move** to translate all selected vertices. Walls fully inside the fence translate as a block; walls crossing the boundary stretch (one end moves, the other doesn't) — same behaviour as the desktop fence.
  - **Clear** drops the selection without exiting; **Done** exits fence mode.

### Notes
- Vertex-tap menus and the start-point picker are disabled while fence mode is active so a one-finger touch becomes the drag-start unambiguously.
- Fence selection is intentionally limited to the **active floor** — ghost-floor vertices are not selectable from fence mode.

---

## [0.11.7] — 2026-05-19

### Added
- **Vertex actions modal on mobile.** Tapping a vertex (when no walk is in progress) now opens a confirmation modal showing the vertex coords and the shape it belongs to, with two actions:
  - **📍 Use as next start point** — anchors the next walk there.
  - **↔ Move this vertex by offset…** — opens a secondary modal that takes a typed offset (e.g. `3'6 r`, `6" d`, or `2'l 1'u` for a diagonal). Adjacent walls stretch automatically. Only available for vertices on the active floor (ghost vertices on other floors get the start-point option only).

### Changed
- Tap-to-set-start no longer fires immediately; the modal gives you a chance to back out if you tapped the wrong vertex.

### Why
- Makes per-vertex editing discoverable and extensible. Future actions (delete, snap to grid, etc.) can slot into the same modal without re-plumbing the hit handler.

---

## [0.11.6] — 2026-05-19

### Added
- **Perpendicular-line projection fallback for mobile auto-extend.** When no directly-aligned vertex exists in the chosen direction, the preview now offers candidates from the **perpendicular projection** of every vertex — that is, "walk L until the pen's X matches another vertex's X" (and the mirror for R/U/D). Lets you navigate back toward a shape's column or row even when no vertex is directly aligned with the current pen.
- Projected candidates are marked `(project)` in the entry display so you can tell them apart from direct alignments.

### Why
- Earlier, if you walked 10' right then 5' down and tapped L hoping to head back toward the start, you'd get "No aligned vertex" because the start is up-AND-left, not directly left. The projection fallback now lets L walk you to the start's column; tap U from there to close the shape.

---

## [0.11.5] — 2026-05-19

### Added
- **Auto-extend with preview + cycle on mobile.** When the entry is empty, tap a direction button (`L` / `U` / `D` / `R`) and the page **previews** the next aligned vertex in that direction — orange dashed line from the pen to the candidate, with a labeled length. Tap the same direction button **again** to cycle to the next-further-aligned vertex (and again, and again — wraps around). Tap **✓ Add Wall** to commit the currently-previewed candidate.
- The entry display shows `↳ R → 10'4"` and a hint line `candidate 1 of 3 · tap R again to cycle, ✓ to commit` so you always know what tapping ✓ will produce.

### Changed
- Tapping `⌫` / `×` / any non-direction key cancels an active preview, returning you to normal entry mode.
- Mirrors the desktop's `r`+Enter cycle behaviour, adapted for touch.

### Why
- Lets you walk along existing geometry vertex-to-vertex using only the direction keys and ✓ Add — no length entry needed when the target vertex aligns with an existing wall.

---

## [0.11.4] — 2026-05-19

### Added
- **Version stamp visible in the mobile header** (`vX.Y.Z` in small grey text next to the title) so you can always tell at a glance which version is loaded, without opening the drawer.
- **Drawer → About → "Reload latest (clear cache)" button.** Unregisters any service workers, deletes all caches, then reloads the page with a cache-bust query string (`?v=<timestamp>`). The most reliable way to bypass iOS Safari's aggressive PWA caching when a new version has shipped but the app keeps showing the old UI.
- Added `Cache-Control: no-cache, no-store, must-revalidate` + `Pragma: no-cache` + `Expires: 0` meta tags to the mobile page so Safari is more inclined to revalidate on every load. (Meta tags have limited effect compared to real HTTP headers — GitHub Pages won't let us set those — but they help in the browser-tab case.)

### Notes
- If you've installed the mobile page as a home-screen app on iOS and aren't seeing a new feature, open the drawer (☰), scroll to About, and tap **Reload latest (clear cache)**. The page will reload and the version stamp in the header should match the latest release on GitHub.

---

## [0.11.3] — 2026-05-19

### Added
- **Mobile start-point picker.** When no walk is in progress, every vertex of every shape on the active floor (and ghosted other floors) becomes a small green tappable dot. Tap one and the next walk starts from there. The current start vertex shows as a solid green dot.
- **Drawer → Start Point** section with:
  - Current start info ("Picked at (x, y) ft" or "Origin (0, 0)").
  - **Offset** input — type something like `3'6 r` to nudge the start along a direction from its current position. Useful when you want to start partway along an existing wall.
  - **Reset start to origin** button.
- Status line now shows the current start coords and a hint to tap a green vertex to change them.

---

## [0.11.2] — 2026-05-19

### Added
- **Mobile collapse / expand toggle** for the entry tools so the canvas can use the full screen for review.
  - Tap the `▼` button on the entry row to slide the entry display + keypad down out of view.
  - When collapsed, a floating `▲ Show keypad` button appears in the bottom-right of the canvas. Tap it to bring the entry tools back.
  - The canvas re-fits after the transition so your sketch reflows to use the new space.

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
