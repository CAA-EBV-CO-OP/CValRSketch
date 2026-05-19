# Contributing to CValRSketch

Thanks for your interest in contributing. CValRSketch is a small, single-file project — most contributions will be quick and self-contained.

## Setup

There is no install step. Clone the repo and open `sketch_walker.html` in any modern browser:

```bash
git clone https://github.com/CAA-EBV-CO-OP/CValRSketch.git
cd CValRSketch
# open sketch_walker.html in Chrome / Edge / Firefox / Safari
```

No `npm install`, no `pip install`, no build pipeline.

## Editing

The entire app lives in `sketch_walker.html`:
- HTML at the top
- inline `<style>` block
- inline `<script>` block (sectioned with `// =====` banner comments)

Use any text editor or IDE that handles HTML. VS Code's HTML+JavaScript intellisense works well.

## Verifying changes

After a non-trivial JavaScript change, **always syntax-check** the script block. A single missing `)` will silently kill the entire script and the app will appear frozen on reload:

```bash
# Extract the <script> contents and check with Node
awk 'NR>=137 && NR<=2428' sketch_walker.html > /tmp/sw.js
node --check /tmp/sw.js
```

(Adjust line numbers if the `<script>` / `</script>` boundaries have moved.)

Then test the change interactively by reloading the page (`Ctrl+F5` to bust the browser cache).

## Style

- Vanilla JavaScript only. No bundlers, transpilers, or framework dependencies.
- Single file. Keep it that way unless the user explicitly approves splitting it.
- Sparse comments. Code should be self-documenting; comments are for non-obvious *why*.
- No emoji in code or commit messages unless requested.
- Follow Semantic Versioning for releases ([VERSION.md](./VERSION.md) and [CHANGELOG.md](./CHANGELOG.md)).

See **[CLAUDE.md](./CLAUDE.md)** for a much more detailed developer guide — it documents the code layout, coordinate systems, key design decisions, and past gotchas.

## Pull requests

- Branch from `main`.
- Keep PRs focused — one logical change per PR.
- Update [CHANGELOG.md](./CHANGELOG.md) under `[Unreleased]` for any user-facing change.
- Bump the version in [VERSION.md](./VERSION.md) and the `README.md` header if the change warrants a release.
- Reference the issue number in the PR description if there is one.

## License

By contributing, you agree your contributions will be licensed under the **AGPL-3.0** license that covers the project. See [LICENSE](./LICENSE).
