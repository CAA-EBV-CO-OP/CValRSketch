# Contributing to CValRSketch

Contributions are welcome. This is a small, single-file project, so most changes are self-contained.

---

## Setup

There is no install step. Clone the repo and open `index.html` in any modern browser:

```bash
git clone https://github.com/CAA-EBV-CO-OP/CValRSketch.git
cd CValRSketch
# Open index.html in Chrome, Edge, Firefox, or Safari
```

No package manager, no build pipeline, no server required.

---

## Editing

The application is split across two files:
- `index.html` — desktop UI (HTML, inline `<style>`, inline `<script>` for UI logic).
- `core.js` — shared pure logic (parser, geometry, edit ops). Both `index.html` and the mobile page load it via `<script src="core.js">`.

Within `index.html`:

- HTML markup at the top
- Inline `<style>` block
- Inline `<script>` block, sectioned with `// ===== banner comments`

Any standard text editor or IDE works. VS Code provides useful HTML and JavaScript assistance for this file type.

---

## Verifying Changes

After any non-trivial JavaScript edit, check for syntax errors before testing. A single missing parenthesis will silently prevent all event listeners from registering, making the app appear frozen:

```bash
node scripts/check-inline.js index.html && node scripts/check-inline.js m/index.html && node --check core.js && node --check dictation.js
```

Run from the repository root. The helper extracts inline script blocks by tag, skips scripts with a `src` attribute, and runs `node --check` on a temporary file that it then removes. It fails if no inline script blocks are found. This checks both desktop and mobile pages without depending on line numbers. In Windows PowerShell 5.1, run each command separately and stop if one fails (`&&` requires PowerShell 7 or another compatible shell).

After confirming the syntax, reload the page (`Ctrl+F5`) and test the change interactively.

---

## Style Guidelines

- Vanilla JavaScript only. No bundlers, transpilers, or external libraries.
- The app must remain a single self-contained file unless explicitly approved otherwise.
- Comments should explain non-obvious reasoning, not restate what the code does.
- Follow Semantic Versioning for releases. See `VERSION.md` and `CHANGELOG.md`.

For a detailed guide to the code layout, coordinate systems, key design decisions, and known gotchas, see `CLAUDE.md`.

---

## Pull Requests

- Branch from `main`.
- Keep PRs focused — one logical change per PR.
- Update `CHANGELOG.md` under `[Unreleased]` for any user-facing change.
- Bump the version in `VERSION.md` and the `README.md` header if the change warrants a release.
- Reference the issue number in the PR description if applicable.

---

## License

By contributing, you agree that your contributions will be licensed under the AGPL-3.0 license that covers this project. See `LICENSE`.
