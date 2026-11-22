# Provenance

Where CValRSketch's code comes from, so anyone weighing it can see that it is an
original work.

## Origin

CValRSketch was written from scratch by Paul Rayburn, a residential appraiser in
British Columbia, to put his own field workflow on screen: walk the outside of the house
with a laser, call out each wall as a length and a direction (`6'9" r`), and have the
sketch and its areas build as you go. It was not modelled on, ported from or derived
from any other sketch program's code, file formats or interface.

It grew one feature at a time:

| Version | Added |
|---|---|
| 0.1 | First working `sketch_walker.html` |
| 0.2 | Walk-mode wall parser; SVG/PNG export |
| 0.3 | Multiple floors; save/load JSON; edit and split modes |
| 0.4–0.8 | Diagonal walls, offsets, fence mode, titled exports (git history starts at 0.8.0, 2026-05-19) |
| 0.9–0.45 | Phone app, shared `core.js`, trace over an image, iGUIDE PDF import, and the rest, as recorded in [CHANGELOG.md](CHANGELOG.md) and the git history |

Versions 0.1 to 0.7 predate the git repository; the version table in the first commit
records them. Development has used AI coding assistants under the author's direction.

## What it reads

Every importer works from an open or documented input, never from another vendor's
software:

- **CValRSketch JSON**: its own save format.
- **CValRScan scans** (in development on a fork, not yet in `main`): the OSASI companion
  iPhone app's own format, built on Apple's public RoomPlan API.
- **iGUIDE floor-plan PDFs**: the text and drawing of an ordinary PDF the user already
  holds, read with PDF.js.
- **Images**: traced by hand after calibrating from two known points.

CValRSketch does not read or write any proprietary sketch format, and holds no vendor
keys, libraries or code.

## Third-party components

- [PDF.js](https://mozilla.github.io/pdf.js/) (Apache-2.0), in `vendor/pdfjs`, for PDF
  import.

Anything added later is listed here and in [NOTICE](NOTICE).

## Review of other public sketch apps (2026-11-22)

In November 2026 we reviewed several appraisal sketch apps posted publicly on GitHub,
checking for our own code and for unauthorized vendor code. None contained CValRSketch
code. Some contained, or had once contained, material tied to a commercial sketch
vendor. Dated copies are kept privately as a record only. Nothing from them is used in
CValRSketch, and contributors should not copy from them.

## Contributions

Contributions must be the contributor's own work, or come from a source whose licence
is compatible with the AGPL-3.0, with that source recorded here. Do not submit code
taken from, decompiled from or modelled on the internals of commercial sketch software.

## Licence

GNU AGPL-3.0-or-later, with the attribution terms in [NOTICE](NOTICE).
Copyright (C) 2026 CAA-EBV-CO-OP and the CValRSketch contributors.
