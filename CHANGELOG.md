# Changelog

## 0.3.0

- README now links to the published Marketplace listing, with live version and
  install-count badges.
- Release workflow: pushing a `v*` tag runs the full gate, attaches the built
  VSIX to a GitHub release and publishes that same artifact to the
  Marketplace. It refuses to run when the tag and `package.json` disagree.

## 0.2.1

- Marketplace icon, generated reproducibly by `npm run generate-icon`.
- Rewritten README with badges, and a CONTRIBUTING guide covering the
  architecture, the no-`vscode`-in-the-core rule and how the tests are split.
- Manifest metadata for publishing: `icon`, `galleryBanner`, and the `private`
  flag dropped now that this is a public MIT project.

## 0.2.0

### Fixed

- **`Show Index Status` reported nothing but its headline.** The breakdown was
  passed as a notification `detail`, which VS Code only renders on *modal*
  dialogs and otherwise discards silently. It now goes to the StyleSeek output
  channel, with the notification keeping the headline and a Details action.

### Added

- `Show Index Status` breaks the index down **per workspace folder**, so a
  multi-root workspace, a second window, or a file pulled in from outside the
  workspace can no longer hide inside a single total.
- The reported indexing time is split into **discovery** (resolving the
  include/exclude globs) and **parsing**. A single total cannot tell a slow
  glob walk apart from slow parsing.

### Performance

- Include globs are resolved **in parallel**. Each glob is a full workspace
  walk and they were awaited one after another, so three patterns meant three
  sequential walks of the whole tree.

Measured on a real 104-file Vue 3 + SCSS project: 1006 selectors in 283 ms
(165 ms discovery, 118 ms parsing), 0 parse errors.

## 0.1.0

- Initial release: AST-based SCSS/CSS/Vue selector reconstruction, in-memory
  index with incremental updates, ranked fuzzy search and precise navigation.
