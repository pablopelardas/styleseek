# StyleSeek playground

Open **this folder** as its own VS Code window:

```bash
code examples/playground
```

Then work through the checklist. Every item below is something the extension
is supposed to get right — if one fails, that is a real bug worth reporting.

## Acceptance cases from the spec

| # | Type in `Ctrl+Alt+F` | Expected |
| --- | --- | --- |
| A | `org-tree__controls` | `.org-tree__controls` first → Enter lands on `&__controls` in `_tree.scss:11` |
| B | `__controls` | hits from `_tree.scss`, `_table.scss` and `UserPanel.vue` |
| C | `controls-button` | `.org-tree__controls-button` → Enter lands on `&-button` |
| D | `org ctrl` | fuzzy hit on `.org-tree__controls` |
| E | `.org-tree__controls` | exact match, like pasting from DevTools |
| F | *(see below)* | unsaved edits show up |

**Case F:** open `src/styles/_table.scss`, add `&__brand-new { color: red; }`
inside `.table`, **do not save**, then hit `Ctrl+Alt+F` and search
`brand-new`. It must appear. Undo it and it must disappear again.

## Navigation precision

Searching `controls-button` must land on `&-button` — **not** on `.org-tree`
and **not** on `&__controls`. That is the whole point of the extension.

## Cursor-driven commands

Open `src/index.html`, `src/App.tsx` or `src/components/UserPanel.vue`:

- Put the caret in the middle of `org-tree__controls-button` → `Ctrl+Alt+S`.
  The search must open pre-filled with the **entire** token, hyphens included.
- Select a class by hand (quotes included) → `Ctrl+Alt+S` strips the quotes.
- `StyleSeek: Go to Definition` from the same spot jumps straight there when
  there is a single confident match, and asks when there are several.

## Edge cases

`src/styles/_edge-cases.scss` is annotated case by case. The ones most worth
checking:

| Search | Expected |
| --- | --- |
| `container` | `.container .button` — with a space, never `.container.button` |
| `card__title` | its own entry, on its own line, separate from `__subtitle` |
| `alpha__x` | the parent list expanded into `.alpha__x` / `.beta__x` |
| `input` | one entry `.input[data-kind="a,b"]` — the comma did not split it |
| `theme-dark` | `.page .theme-dark` and `.theme-dark + .theme-dark` |
| `panel__body` | found — `@media` is transparent to nesting |
| `escaped` | `.escaped`, not `.wrapper .escaped` |
| `spin` | **nothing** — `@keyframes` steps are not selectors |
| `shadow` | **nothing** — `&` inside `@mixin` has no known parent |
| `plain-inside-mixin` | found — it is a literal selector |
| `-button` | includes `.#{$prefix}-button`, kept literal, never resolved |
| `hover` | **nothing** by default; turn on `styleseek.includePseudoClasses` |

## Multi-block and external styles

- `src/components/Card.vue` has **two** `<style>` blocks. Search `card-widget`
  — `__title` and `__footer` must each point at their own real line.
- `src/components/ExternalStyles.vue` uses `<style src>`. Search
  `external-block__label`: exactly **one** hit, inside `external-block.scss`,
  not duplicated into the `.vue` file.

## Index health

`Ctrl+Shift+P` → **StyleSeek: Show Index Status**. On this folder you should
see **7 files, 53 selectors and 0 parse errors**.
