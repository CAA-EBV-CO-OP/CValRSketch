# Version

**Current version:** `0.11.8`
**Released:** 2026-05-19

CValRSketch follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).
While the project is below 1.0, the public "API" (segment syntax, JSON save format) may still change between minor versions; breaking changes will be called out in [CHANGELOG.md](./CHANGELOG.md).

---

## Version history

| Version | Date       | Type   | Headline change                                                            |
|---------|------------|--------|----------------------------------------------------------------------------|
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
