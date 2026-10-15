# Contributing to StyleSeek

Thanks for taking the time. This document covers what the project expects, so
you spend your effort on the change itself rather than on guessing conventions.

## The most useful contribution

**A selector StyleSeek gets wrong, with the SCSS that reproduces it.**

Selector reconstruction has a long tail: nesting, combinators, interpolation,
at-rules and preprocessor syntax interact in ways no fixture anticipates. A
five-line snippet from a real project is worth more than a feature request.

Open an issue with:

1. The SCSS (or `.vue` block) — the smallest version that still misbehaves
2. What you searched for
3. What you expected, and what you got
4. The output of `StyleSeek: Show Index Status`

## Getting set up

```bash
git clone https://github.com/pablopelardas/styleseek.git
cd styleseek
npm install
npm run verify
```

`npm run verify` runs the whole gate: type-check, lint, unit tests and the
bundle smoke test. If it passes locally it passes in CI, on Linux and Windows.

Press <kbd>F5</kbd> in VS Code to launch the Extension Development Host. It
starts `npm run watch` for you, so edits rebuild automatically — reload the
host window to pick them up.

| Script | What it does |
| --- | --- |
| `npm run verify` | Everything below, in order. Run this before pushing. |
| `npm run check-types` | `tsc --noEmit` |
| `npm run lint` | ESLint over `src` and `tests` |
| `npm test` | Vitest, watch mode via `npm run test:watch` |
| `npm run build` | esbuild bundle into `dist/` |
| `npm run smoke` | Builds, then drives the bundle against a `vscode` stub |
| `npm run package` | Produces `styleseek.vsix` |
| `npm run generate-icon` | Regenerates `media/icon.png` from the script |

## Architecture

```text
src/
  extension.ts            activation and command wiring
  config.ts               settings, validation, glob merging
  commands/               one file per command
  parsers/
    selectorResolver.ts   & resolution, selector-list splitting  <- the core
    styleBlockParser.ts   PostCSS AST walk, context stack, positions
    scssParser.ts  cssParser.ts  vueParser.ts  position.ts
  indexing/
    indexEngine.ts        parse orchestration, versioning, cancellation
    selectorIndex.ts      in-memory store, per-file slices
    workspaceIndexer.ts   the only VS Code-aware indexing code
    fileWatcher.ts        watchers, debouncing, event coalescing
  search/
    fuzzyMatcher.ts  ranking.ts  selectorSearch.ts
  ui/
    selectorQuickPick.ts  navigation.ts
```

### The one rule that matters

**`parsers/`, `search/`, `indexing/indexEngine.ts` and
`indexing/selectorIndex.ts` must not import `vscode`.**

That boundary is why this project has fast unit tests instead of an Extension
Host harness. Anything that needs the editor API belongs in `commands/`,
`ui/`, `indexing/workspaceIndexer.ts`, `indexing/fileWatcher.ts` or
`extension.ts`. If you find yourself wanting `vscode` in the core, the
dependency usually wants to be an interface the host implements — see
`IndexEngineHost`.

### Other conventions

- **Selector reconstruction is AST-based, never regex-driven.** The
  hand-written scanner in `selectorResolver.ts` exists *only* as a fallback
  for Sass syntax `postcss-selector-parser` cannot read. Do not extend the
  regex surface.
- **Never invent a selector.** When nesting cannot be resolved statically — a
  `&` inside a `@mixin`, an unresolvable interpolation — skip it or keep it
  literal. A wrong entry is worse than a missing one.
- **Ranking orders, it never filters.** A weak match is still a match. If a
  change can drop a valid hit, it is the wrong change.
- Comments explain *why*, not *what*. The code already says what it does.

## Tests

| File | Covers |
| --- | --- |
| `tests/parser.test.ts` | SCSS/CSS nesting, combinators, at-rules, positions |
| `tests/vue.test.ts` | SFC extraction, multiple blocks, `<style src>` |
| `tests/search.test.ts` | Tiers, fuzzy matching, ranking, result sets |
| `tests/indexer.test.ts` | Incremental updates, unsaved edits, cancellation |
| `tests/navigation.test.ts` | Navigation targets and cursor token detection |
| `tests/playground.test.ts` | The real files in `examples/playground` |
| `scripts/smoke.mjs` | The built bundle against a `vscode` stub |

**Assert concrete values, not that the code ran.** Compare reconstructed
selectors *and* their line/column against expected literals. A test that only
checks "something came back" would not have caught any of the bugs this
project has actually had.

Two of those suites are load-bearing in a way worth knowing:

- **`tests/playground.test.ts`** asserts the promises made by
  `examples/playground/README.md`. If you change parser behaviour, that README
  and this test move together — documentation cannot drift from reality.
- **`scripts/smoke.mjs`** is the only test that exercises the real VS Code API
  surface. Anything in the editor-facing layer that can break silently (a
  dropped notification field, an unregistered command) belongs here.

### Adding a new file type

There is a single dispatch point: `parseFile` in `src/parsers/index.ts`. Add
the extension to `SUPPORTED_EXTENSIONS`, write a parser that produces
`StyleBlock`s, and let `parseStyleBlocks` do the resolution. Add fixtures to
`examples/playground` and assertions to `tests/playground.test.ts`.

## Pull requests

- Branch off `master`.
- **Conventional commits**: `feat:`, `fix:`, `perf:`, `docs:`, `test:`,
  `refactor:`, `chore:`, `ci:`. The body should explain why, not restate the
  diff.
- `npm run verify` must pass. CI runs it on Linux and Windows.
- A behaviour change needs a test that fails without it.
- Update `CHANGELOG.md` under an `Unreleased` heading.

## Reporting a security issue

StyleSeek runs entirely locally, makes no network calls and executes nothing
from your project — the attack surface is small by design. If you find
something that breaks those guarantees, open an issue describing the class of
problem rather than a working exploit.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
