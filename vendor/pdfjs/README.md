# Vendored: PDF.js

- **What:** Mozilla PDF.js, `pdfjs-dist` **6.3.289**, *legacy* build (`legacy/build/pdf.min.mjs`, `legacy/build/pdf.worker.min.mjs`), copied unmodified from the npm package.
- **Licence:** Apache-2.0 — see `LICENSE` in this folder. Compatible with CValRSketch's AGPL-3.0.
- **Source:** https://github.com/mozilla/pdf.js · https://www.npmjs.com/package/pdfjs-dist
- **Why legacy:** the modern build needs very recent browser features (e.g. `Uint8Array.prototype.toHex`); the legacy build runs on older Safari/Chrome too.
- **Used by:** `pdf-import.mjs` (📐 Import PDF…). Loaded on demand only — normal app start-up never fetches it. Opened with `isEvalSupported: false`.

To update: `npm pack pdfjs-dist@<version>`, copy the two legacy `.min.mjs` files and `LICENSE` here, update this file, bump the app version (the service-worker cache name change drops the old copy).
