# Changelog

All notable changes to String-LE will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1] - 2026-08-04

### Fixed

- Repository links point at `nolindnaidoo/string-le` following the repo
  rename. The published extension id is unchanged.

### Changed

- Marketplace categories re-targeted for discovery. `Other` is dropped
  (65,992 extensions, no discovery value); each extension now sits in
  categories matching how it is actually used.
- Search keywords widened to 30, targeting the terms users actually type
  rather than internal vocabulary.
- Toolchain moved to current: TypeScript 7, vitest 4, Biome 2.5.7,
  @types/node 26. `@types/vscode` is now pinned exactly to the
  `engines.vscode` floor — the caret had let the type surface drift 15
  minors ahead of the version actually supported.
- Runtime dependencies updated across majors where present: csv-parse 7,
  ini 7, js-yaml 5. Extraction output is unchanged, verified against the
  characterization goldens.
- Packaging no longer walks the npm tree (`vsce package --no-dependencies`).
  The bundle is self-contained, so the walk served no purpose and failed
  after any dependency change. Scrape-LE keeps it, since it genuinely
  ships `playwright-core`.
- Documentation claims corrected against the code. Removed: Numbers-LE
  "with statistics", EnvSync-LE "visual diffs", Regex-LE "live feedback",
  String-LE "and validation" — none of those features exist.

### Added

- Rating links in the in-extension help output, for both the VS Code
  Marketplace and Open VSX. Acquisitions exceed listing page views, so most
  users never see the listing's rating control; help is the surface they do
  reach.
- README now carries measured Performance and Testing sections, both
  generated rather than written — from `scripts/benchmark.ts` and from the
  coverage summary. CI fails if the coverage numbers drift from a real run.
- Coverage thresholds enforced at 75 lines / 80 functions / 60 branches /
  75 statements.
- CodeQL scanning, Dependabot with grouped weekly updates, and auto-merge
  limited to patch and minor devDependency bumps that pass CI.

## [2.0.0] - 2026-07-29

Full rehabilitation release. The headline: **v1.x VSIXes built from this
repo could not activate** — the build had no bundler while the package
excluded `node_modules`, so the extension crashed on load with
`Cannot find module 'vscode-nls'`. 2.0.0 ships a self-contained esbuild
bundle, verified by a packaging gate and a real extension-host
integration suite on every CI run.

### Fixed

- **Packaging**: `dist/extension.js` is now a single self-contained
  bundle (VSIX: 53 files → 21). A bundle gate (static require scan +
  loading the bundle with `vscode` stubbed) blocks any regression.
- **Errors were invisible by default**: with the default
  `notificationsLevel` of `silent`, error notifications returned before
  showing anything. Errors now always show; `important` adds warnings;
  `all` adds info. Error text redacts home directories and
  credential-shaped fragments.
- **Config**: code fallbacks silently disagreed with manifest defaults
  (`postProcess.openInNewFile` false vs true, `openResultsSideBySide`
  false vs true, `notificationsLevel` all vs silent) — now provably
  identical (asserted by a parity test over every declared setting).
  Non-numeric setting overrides no longer produce `NaN` thresholds;
  non-boolean values are no longer truthiness-coerced.
- **File-type detection**: was filename-only, so untitled documents
  silently blocked on a file-type picker. The language id is now used
  first (matching the context-menu predicate), then the filename.
- **Context menu**: the `resourceExtname in …` when-clause never
  matched — the editor context-menu entry had never appeared. Replaced
  with an `editorLangId` regex.

### Changed — extraction output

- **YAML, TOML, and INI are now genuinely parsed** (js-yaml,
  @iarna/toml, ini). v1 routed them to a quoted-string regex scan:
  unquoted values — most YAML/INI values in practice — were silently
  missed, and quoted strings inside INI comments were extracted.
  Now: unquoted plain scalars, block/folded scalars, multi-document
  YAML, and TOML multiline strings all extract; comment content never
  does; invalid syntax reports a parse error (via `showParseErrors`)
  instead of silently degrading to a quote scan.
- **One rule set for all parsed formats** (`extraction/collect.ts`):
  values only (never keys), trimmed, empty dropped; typed formats
  (JSON/YAML/TOML) drop numbers/booleans/dates; untyped line formats
  (INI/.env) extract numeric-looking values as strings.
- **CSV**: the column picker and multi-column fan-out now use the same
  csv-parse parser as extraction — quoted headers containing commas or
  newlines are handled identically everywhere (previously a hand-rolled
  line splitter disagreed with the real parser).

### Removed

- 12 settings that were never read by any code path (`performance.*`,
  `keyboard.*`, `presets.*`). 15 real settings remain.
- The runtime "localization" layer: it never loaded a single
  translation (broken `vscode-nls` wiring; the per-module bundles it
  needed were never generated) — users always saw English.
  Manifest/settings translations in 12 languages remain and now have
  full key parity.
- ~4,000 lines of dead code and 116 MB of tracked benchmark fixtures:
  the never-invoked performance-monitoring module (the sink for the six
  `performance.*` settings), benchmark files, the perf-data generator
  that fabricated docs/PERFORMANCE.md, `sample/`, and stale docs
  (`docs/`, `.cursorrules`) replaced by an accurate README + AGENTS.md.
- Help content claiming JS/TS/HTML/CSS support that never existed.

### Infrastructure

- `engines.vscode ^1.90.0` — current VS Code and Cursor 2.x supported.
- Real quality gates: typecheck now covers tests, coverage thresholds
  actually enforce (the old config used an inert Jest-style key; real
  coverage is now 82% and enforced at 80), integration tests run in a
  downloaded VS Code on all 3 OSes, CI packages the VSIX and uploads it.
- Release workflow publishes to both the VS Code Marketplace and Open
  VSX (Cursor's marketplace source).
- Publisher/identity: `nolindnaidoo` everywhere.

> Entries below this line predate 2.0.0 and have been condensed: the
> original release notes claimed features, coverage numbers, and
> parsing behavior that the shipped code did not have (the packaged
> extension could not activate at all).

## [1.8.1] and earlier - 2025

- 1.8.1 (2025-11-02): README LE-family updates.
- 1.8.0 (2025-10-26): README/marketplace-link updates.
- 1.7.0 (2025-01-27): initial public release.
