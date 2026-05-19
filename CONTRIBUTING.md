# Contributing to CValRSketch

Contributions are welcome. This is a small, single-file project, so most changes are self-contained.

---

## Setup

There is no install step. Clone the repo and open `sketch_walker.html` in any modern browser:

```bash
git clone https://github.com/CAA-EBV-CO-OP/CValRSketch.git
cd CValRSketch
# Open sketch_walker.html in Chrome, Edge, Firefox, or Safari
```

No package manager, no build pipeline, no server required.

---

## Editing

The entire application lives in `sketch_walker.html`:

- HTML markup at the top
- Inline `<style>` block
- Inline `<script>` block, sectioned with `// ===== banner comments`

Any standard text editor or IDE works. VS Code provides useful HTML and JavaScript assistance for this file type.

---

## Verifying Changes

After any non-trivial JavaScript edit, check for syntax errors before testing. A single missing parenthesis will silently prevent all event listeners from registering, making the app appear frozen:

```bash
awk 'NR>=145 && NR<=2443' sketch_walker.html > /tmp/sw.js && node --check /tmp/sw.js
```

Adjust the line range if the `<script>`/`</script>` boundaries have moved.

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
