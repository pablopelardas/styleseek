<div align="center">

<img src="media/icon.png" width="112" alt="StyleSeek" />

# StyleSeek

**Find any CSS/SCSS selector — even when its full name never appears in your source.**

[![CI](https://github.com/pablopelardas/styleseek/actions/workflows/ci.yml/badge.svg)](https://github.com/pablopelardas/styleseek/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-007ACC?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)

</div>

---

## The problem

With BEM and Sass nesting, this is what you write:

```scss
.org-tree {
  &__header { height: 40px; }

  &__controls {
    display: flex;

    &-button { cursor: pointer; }
  }
}
```

…and this is what the browser shows you: `.org-tree__controls-button`.

Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>, paste that class, and VS Code
finds **nothing** — the file only contains `&-button`. So you search `.org-tree`,
open the file, and walk the nesting by eye.

StyleSeek reconstructs the full selector *before* indexing it. That same file
becomes searchable as:

```text
.org-tree
.org-tree__header
.org-tree__controls
.org-tree__controls-button
```

Each entry remembers the exact file, line and column of **its own**
declaration. Searching `.org-tree__controls-button` jumps to `&-button` — not
to the `.org-tree` block that happens to contain it.

## Search examples

| You type | You get |
| --- | --- |
| `.org-tree__controls` | exact match |
| `org-tree__controls` | same — the leading dot is optional |
| `__controls` | every `__controls` in the project, at any nesting depth |
| `controls-button` | `.org-tree__controls-button` |
| `tree__cont` | `.org-tree__controls` |
| `header` | everything containing `header` |
| `org ctrl` | `.org-tree__controls` (fuzzy) |

Search is case-insensitive, results keep their original casing, and ranking
**orders** matches — it never discards a valid one.

<details>
<summary><strong>Ranking order</strong></summary>

1. Exact selector match
2. Exact match ignoring the optional leading `.`
3. BEM suffix / segment match
4. Prefix match
5. Continuous partial match
6. Fuzzy match

Ties break on: active file first, then shorter selector, then a stable
alphabetical order so results never jump around while you type.

</details>

## Commands

| Command | Default keybinding | What it does |
| --- | --- | --- |
| `StyleSeek: Search Selector` | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd> | Opens the global selector search |
| `StyleSeek: Find Selected Selector` | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd> | Opens the search pre-filled with the selection, or the class under the cursor |
| `StyleSeek: Go to Definition` | — | Jumps from a class used in a template to its declaration; asks when several match |
| `StyleSeek: Rebuild Index` | — | Re-parses the whole workspace |
| `StyleSeek: Show Index Status` | — | Files indexed, selectors found, parse errors, timings, per-folder breakdown |

On macOS, <kbd>Cmd</kbd> replaces <kbd>Ctrl</kbd>.

`Find Selected Selector` works from HTML, Vue, JSX, TSX, CSS and SCSS — it
reads the text, not the language server, and it does **not** stop at hyphens
the way VS Code's default word definition does.

<details>
<summary><strong>Changing a keybinding</strong></summary>

Both defaults are free in a stock VS Code install, but other extensions may
claim them. Open **Keyboard Shortcuts** (<kbd>Ctrl</kbd>+<kbd>K</kbd>
<kbd>Ctrl</kbd>+<kbd>S</kbd>), search `styleseek`, and rebind. Or in
`keybindings.json`:

```json
{ "key": "ctrl+shift+alt+f", "command": "styleseek.searchSelector" }
```

`Go to Definition` is intentionally **not** bound to <kbd>F12</kbd>. That key
belongs to the language servers, and hijacking it to guess at CSS would get in
your way. Bind `styleseek.goToDefinition` yourself if you want it.

</details>

## Supported files

- **`.scss`** — full Sass nesting
- **`.css`** — including native CSS nesting
- **`.vue`** — every `<style>` block, `scoped` or not, extracted with
  `@vue/compiler-sfc` so positions point at the real line of the `.vue` file

`<style src="./styles.scss">` is followed: the referenced file is indexed once,
without duplicating its selectors into the component.

<details>
<summary><strong>What is understood</strong></summary>

- Unlimited nesting depth (`.a { &__b { &--active { &-icon { … } } } }`)
- Descendant selectors — `.container { .button { } }` becomes
  `.container .button`, never `.container.button`
- Child, adjacent and general sibling combinators (`>`, `+`, `~`)
- Pseudo-classes and pseudo-elements, including functional ones with
  arguments: the comma inside `:is(.a, .b)` is not a selector-list separator
- Attribute selectors, even containing commas or `&`
- Selector lists — `&__title, &__subtitle` produces two entries, each with its
  own position
- Parent lists — `.a, .b { &__x { } }` expands to `.a__x` and `.b__x`
- Multiple `&` in one selector — `.page & { }`, `& + & { }`
- `@media`, `@supports`, `@if`, `@each`, `@include … { }` are transparent to
  the nesting context
- `@at-root` resolves against the document root

</details>

### Deliberate limitations

These are decisions, not omissions:

- **No Sass compiler.** `#{$prefix}` is kept literally, so `.#{$prefix}-button`
  is indexed under that exact name. It stays findable by its static parts
  (`-button`), and StyleSeek never invents a resolved name it cannot prove.
- **`@mixin` / `@function` bodies.** A `&` inside a mixin has no statically
  known parent, so those selectors are skipped rather than guessed. Plain
  selectors inside a mixin are still indexed.
- **`@keyframes` steps** (`0%`, `from`, `to`) are not selectors and are never
  indexed.
- **A file with a syntax error** is reported in `Show Index Status` and
  contributes no selectors; the rest of the index is unaffected.
- **`.sass` (indented), `.less` and `.styl`** are not supported. There is a
  single dispatch point (`src/parsers/index.ts`) if you want to add one.

## Configuration

```json
{
  "styleseek.enabled": true,
  "styleseek.include": ["**/*.scss", "**/*.css", "**/*.vue"],
  "styleseek.exclude": [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/.next/**",
    "**/.nuxt/**"
  ],
  "styleseek.respectSearchExclude": true,
  "styleseek.maxResults": 100,
  "styleseek.enableFuzzySearch": true,
  "styleseek.includePseudoClasses": false,
  "styleseek.prioritizeActiveFile": true,
  "styleseek.indexDebounceMs": 250
}
```

`respectSearchExclude` additionally honours your `files.exclude` and
`search.exclude` settings. Multi-root workspaces are supported; nothing
outside a workspace folder is ever indexed.

## Indexing behaviour

Activation is cheap — opening VS Code costs nothing. The workspace is parsed
on first use, and the search opens **immediately** with a loading state rather
than blocking on it.

After that, updates are incremental:

- Create, change, delete and rename are watched
- **Unsaved edits are indexed**: a selector you just typed is findable before
  you save
- Closing a dirty document reverts the index to the content on disk
- Events are debounced and coalesced per file
- A slow parse can never overwrite a newer one, and a superseded full rebuild
  publishes nothing

Measured on a real 104-file Vue 3 + SCSS project: **1006 selectors in 283 ms**
(165 ms discovery, 118 ms parsing), zero parse errors.

## Privacy and security

StyleSeek is fully local and does exactly nothing else:

- No network access, no telemetry, no analytics
- No credentials, no accounts
- Never runs your project's scripts, build or package manager
- Never downloads anything at runtime
- No `eval`, no dynamic code generation
- Four runtime dependencies, all widely used: `postcss`, `postcss-scss`,
  `postcss-selector-parser`, `@vue/compiler-sfc`

## Installation

From the Marketplace once published, or from a `.vsix`:

```bash
code --install-extension styleseek.vsix
```

Every CI run attaches a built `.vsix` as an artifact, so you can grab one from
the [Actions tab](https://github.com/pablopelardas/styleseek/actions) without
building anything.

## Contributing

Bug reports with the SCSS that reproduces them are the single most useful
thing you can send. See [CONTRIBUTING.md](CONTRIBUTING.md) for the setup, the
architecture and how the tests are organised.

```bash
npm install
npm run verify   # types + lint + unit tests + bundle smoke test
```

Press <kbd>F5</kbd> to launch the Extension Development Host.

## License

[MIT](LICENSE).
