# Version

**Current version:** `0.11.22`
**Released:** 2026-05-20

CValRSketch follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).
While the project is below 1.0, the public "API" (segment syntax, JSON save format) may still change between minor versions; breaking changes will be called out in [CHANGELOG.md](./CHANGELOG.md).

---

## Version history

| Version | Date       | Type   | Headline change                                                            |
|---------|------------|--------|----------------------------------------------------------------------------|
| 0.11.22 | 2026-05-20 | patch  | Mobile: 📋 Copy / Paste sketch via clipboard. Workaround for the OneDrive iOS File Provider being unreliable — gets sketch JSON in/out without depending on Save to Files. |
| 0.11.21 | 2026-05-20 | minor  | Recent projects list — every Save/Load also stores a copy in `localStorage`; mobile drawer surfaces them at the top; desktop adds a 📂 Recent header button. Up to 12 entries; tap to load, × to remove. Lets you hop between sketches without re-navigating the file picker. |
| 0.11.20 | 2026-05-20 | patch  | "New project" / "🗋 New" button added to both desktop header and mobile drawer. Clears shapes, in-progress walk, annotations, subject, floors, etc. for a clean slate. Confirms first when there's work to discard; pushed to undo for recovery. |
| 0.11.19 | 2026-05-20 | patch  | Mobile: persistent ⚠ self-intersection badge — every render now flags any shape whose walls cross each other with a red badge above its centroid. Tap it to open the split / keep / undo modal. Catches state-on-load and any move the live check missed. |
| 0.11.18 | 2026-05-20 | patch  | Mobile: wall-delete modal adds a third option — "Detach for re-walking" — which removes the shape and converts the remaining walls into an in-progress walk so you can replace the deleted wall with a new path (notch, bay, chamfer, etc.) and close again. |
| 0.11.17 | 2026-05-20 | patch  | Save / Export now uses File System Access API on desktop (real Save As dialog with folder navigation + Create New Folder) and Web Share with files on mobile (iOS Share sheet → Save to Files). Falls back to direct download where neither is supported. |
| 0.11.16 | 2026-05-20 | minor  | Mobile: self-intersection detection on every move (vertex / wall / fence / length). Modal offers to split into two separate areas, keep as one, or undo — important for appraisal GLA where self-crossed shapes wouldn't count as continuous space. |
| 0.11.15 | 2026-05-19 | patch  | Mobile: fence panel gains L/U/D/R snap buttons. Each tap moves the selection toward the closest aligned vertex from the selection's centroid in that direction — same pattern as vertex / wall snap. Closes gaps in one tap when you've fence-selected the pen vertex. |
| 0.11.14 | 2026-05-19 | patch  | Mobile: vertex/wall edit controls now slide INTO the keypad area (replacing entry+keypad) instead of opening a modal that hides the sketch. Canvas stays visible while snapping/moving so you can see the result live. |
| 0.11.13 | 2026-05-19 | patch  | Mobile: fence-tool re-entry fix (clear stuck pointer state on enter/exit). Wall editor expanded — change length, move by typed offset, or snap-move with L/U/D/R buttons (same pattern as vertex editor). |
| 0.11.12 | 2026-05-19 | patch  | Mobile snap fix: direct alignments no longer always beat projections. Both are merged into a single sorted-by-distance candidate list, so the truly-closest target wins. Affects chain auto-extend, vertex direction-snap, and bare-direction auto-extend. |
| 0.11.11 | 2026-05-19 | patch  | Mobile: chain auto-extend. Tap L/U/D/R repeatedly to chain together direction-snaps (each starts from the previous endpoint). Commit as separate walls with ✓ or as one diagonal wall with ↗ Connect. |
| 0.11.10 | 2026-05-19 | patch  | Mobile: fence-mode toggle button (🔲) added to header for one-tap access. Vertex move modal gains direction-snap buttons (L/U/D/R) that move the vertex to the next aligned vertex on each tap. |
| 0.11.9  | 2026-05-19 | patch  | Mobile fix: tapping a vertex or wall now reliably triggers its click handler. Pointer capture was being set on every touch, which redirected click events away from child hit-circles on iOS. |
| 0.11.8  | 2026-05-19 | patch  | Mobile: fence tool (group select / stretch) ported from desktop. Toggle from drawer; one-finger drag draws rectangle; pinch still zooms. Apply typed offset to move selected vertices; walls crossing the fence stretch automatically. |
| 0.11.7  | 2026-05-19 | patch  | Mobile: tapping a vertex now opens a small actions modal — "Use as next start point" and "Move vertex by offset…" — instead of jumping straight to set-start. Extensible for future per-vertex actions. |
| 0.11.6  | 2026-05-19 | patch  | Mobile: auto-extend now falls back to **perpendicular-line projection** when no directly-aligned vertex exists. So `L` walks until pen's X matches another vertex's X — helps close shapes when start isn't horizontally/vertically aligned. |
| 0.11.5  | 2026-05-19 | patch  | Mobile: auto-extend preview with cycle-through. Tap L/U/D/R with no length to preview the next aligned vertex; tap the same direction again to cycle to further candidates; tap ✓ to commit. |
| 0.11.4  | 2026-05-19 | patch  | Mobile: version stamp in header + drawer; "Reload latest (clear cache)" button to force a fresh fetch. |
| 0.11.3  | 2026-05-19 | patch  | Mobile: tap any green vertex to anchor the start point; "Reset start" + "Offset start" in the drawer. |
| 0.11.2  | 2026-05-19 | patch  | Mobile: collapse / expand toggle for the entry tools so the canvas can use the full screen. |
| 0.11.1  | 2026-05-19 | patch  | Mobile input flow flipped to length-then-direction (matches desktop). Diagonals via chained rise/run like `2'6 r 1'6 d`. Drops the diagonal-corner buttons. |
| 0.11.0  | 2026-05-19 | minor  | Mobile-first page at `m/index.html` with touch direction pad + numeric keypad. Shares `core.js` with desktop. Installable PWA at `/CValRSketch/m/`. |
| 0.10.0  | 2026-05-19 | minor  | Refactor: extract pure parser + geometry + edit ops into `core.js` shared by desktop and (upcoming) mobile pages. Behaviour unchanged. |
| 0.9.1   | 2026-05-19 | patch  | Rename `sketch_walker.html` → `index.html` so install URL is `/CValRSketch/` (old path kept as redirect) |
| 0.9.0   | 2026-05-19 | minor  | Progressive Web App: installable on iPhone/Android, runs offline           |
| 0.8.0   | 2026-05-19 | minor  | Export rewrite: page-coord title/legend, tight bbox, UI-overlay stripping, whole-number sq ft |
| 0.7.0   | 2026-05-19 | minor  | Subject title, legend in exports, Letter portrait/landscape page-fit, ghost-opacity slider in header |
| 0.6.0   | 2026-05-19 | minor  | Fence mode (rubber-band group stretch); Copy shape with typed offset       |
| 0.5.0   | 2026-05-19 | minor  | Offset measurement annotation tool; directional gap breakdown              |
| 0.4.0   | 2026-05-19 | minor  | Combined-component diagonal syntax (`5'd 2'l`); relative-angle turn convention for `r`/`l` |
| 0.3.0   | earlier    | minor  | Multi-floor support; save/load JSON; settings modal; edit + split modes    |
| 0.2.0   | earlier    | minor  | Walk-mode segment parser; SVG/PNG export                                   |
| 0.1.0   | initial    | minor  | First working `sketch_walker.html`                                         |

See [CHANGELOG.md](./CHANGELOG.md) for full details of each release.
