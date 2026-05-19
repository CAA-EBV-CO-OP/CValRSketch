# Version

**Current version:** `0.10.0`
**Released:** 2026-05-19

CValRSketch follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).
While the project is below 1.0, the public "API" (segment syntax, JSON save format) may still change between minor versions; breaking changes will be called out in [CHANGELOG.md](./CHANGELOG.md).

---

## Version history

| Version | Date       | Type   | Headline change                                                            |
|---------|------------|--------|----------------------------------------------------------------------------|
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
