# Changelog

All notable changes to String-LE will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-08-04

### Added

- Runtime strings are localized, and this time they render. All 19 of them —
  notifications, status bar, quick-picks and prompts — go through
  `vscode.l10n` and ship as twelve translated bundles in `l10n/`. The v1.x
  line carried manifest catalogues that worked and runtime catalogues that
  never reached the screen: `vscode-nls` was configured without
  `__filename`, so every runtime string fell back to English while the VSIX
  looked correct.
- An integration test covering both localization mechanisms — manifest
  substitution, key parity across all thirteen catalogues, and placeholder
  integrity in every translation. A translation that silently drops `{0}`
  now fails the build instead of shipping a message with the value missing.

- Dependency review on pull requests, failing on a high-severity addition
  before Dependabot's auto-merge can act.

### Fixed

- The large-output dialog's "Copy only" choice could deliver nothing at all.
  The dialog offers Open / Copy only / Cancel regardless of the
  `copyToClipboardEnabled` setting, but the copy that followed was gated on
  that setting — so choosing "Copy only" with it off opened no document and
  copied nothing, then reported "Extracted 150" for results the user never
  received. An explicit choice now performs the copy, and nothing is reported
  when nothing was delivered.
- The CSV extractor threw on a parse failure instead of reporting it. Every
  other format catches, calls `onParseError` and returns nothing; CSV alone
  let the exception escape, so a file with an unterminated quote crashed the
  extraction rather than reporting it — and the `onParseError` handlers the
  callers pass in could never fire, because the throw happened first. CSV now
  behaves like the rest.
- The `vscode` test mock's `activeTextEditor` had no `edit()` method. Any
  command calling `editor.edit(...)` hit a TypeError and silently took its
  error path, which meant in-place replacement had never actually run in a
  test and a test asserting success was asserting the failure branch. The
  active editor is now a full editor, and the mock can drive a rejected edit,
  a thrown edit, a failed document open and a cancelled progress task — none
  of which were reachable before.



- The "Extract strings" Quick Fix label was hard-coded English, so the
  lightbulb menu stayed untranslated in all twelve locales while the rest of
  the UI was localized.

### Fixed

- `string-le.notificationsLevel` did not govern every notification. The
  notifier exists so it does — its own documentation says "all user
  notifications route through here" — but sort, dedupe and the CSV-streaming
  toggle called `vscode.window.show*Message` directly and so notified a user
  who had chosen `silent` anyway. Those now route through the notifier.
- `extractLines`, `joinLines`, `showNoEditorWarning` and `showSuccessMessage`
  existed as byte-identical copies in both sort.ts and dedupe.ts — including
  the edit that reads and rewrites the user's document. Defined once.
- Five more strings localized: the two toggle confirmations, the dedupe/sort
  result, the column-index validator (returned from a `validateInput`
  callback) and the status-bar tooltip.

### Changed

- Every `else` block is gone (5 of them; a sixth match was prose in the help
  text), replaced by guard clauses and value expressions.
- `commands/extract.ts` held orchestration, CSV handling, the normal extraction
  path and output routing in 618 lines. CSV moved to `commands/extractCsv.ts`,
  leaving 299 and 332.

- Test coverage raised from 63.86% to 77.82% of branches (76.53% to 88.45% of
  statements), moving the repo from 3.86 points above the branch floor to
  17.82. Nine files sat below one of the repo's own floors; two still do.
  `extraction/formats/ini.ts` cannot be closed: its fallback runs when the
  parser throws, and the `ini` package is fully lenient — unclosed sections,
  keys with no name and conflicting nested keys all parse without error, so
  the fallback cannot fire. `commands/extract.ts` retains some streaming and
  cancellation paths that need a larger fixture than is worth carrying. The activation entry point had no test at all, one of two in
  the family at 0% statements. The gap was concentrated in `commands/extract.ts`, whose settings and
  prompt-answer permutations were unreachable from the default-config tests:
  result placement, the large-output prompt, the many-documents confirmation,
  CSV column selection including the multi-column path, the streaming toggle
  and `showParseErrors`. Two behaviours are now pinned that were easy to get
  wrong: `sortEnabled` does nothing while `sortMode` is `off` (its default),
  and a CSV whose first row contains letters is treated as a header, which
  routes column selection through the picker rather than the index input.


- The private `normalizeFileType` in the extraction layer is now
  `canonicaliseFileTypeKey`. It shared a name and a rough shape with the
  exported `normalizeFileType` in config/fileTypes.ts while promising
  something different: the exported one validates against the supported list
  and returns undefined for anything else, this one accepts any string
  because an unrecognised type legitimately falls through to the generic
  extractor.


- CI gains fleet-wide checks that no single repo can perform: shared config is
  compared across all ten extensions, and every README link is verified —
  including Open VSX links, which are checked against the API because
  open-vsx.org answers HTTP 200 for extensions that do not exist.

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
