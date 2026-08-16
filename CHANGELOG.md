# Changelog

All notable changes to String-LE will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file covers the **VS Code extension**. The Rust CLI in `crate/` is a
separate product on its own cadence and keeps its own
[CHANGELOG](crate/CHANGELOG.md).

## [Unreleased]

### Changed

- **New icon artwork.** A new drawing in the style the family is moving
  to, framed like the rest of the set.

### Fixed

- **The agent-files check no longer times out on Windows.** A test-only
  fix; nothing a user of the extension can observe.

## [2.3.0] - 2026-08-14

Source files are where the copy in a codebase actually lives, and until
now String-LE read every one of them the same way: look for quotes, take
what is between them. This release makes it do what you already expected
of it.

**Your extract will be a different length, and not always longer.** On a
Python or shell file it grows — docstrings and heredoc bodies were
invisible before. On a Rust or C# file it shrinks, and that is the fix:
fragments like `:`, `"` and `{` were being counted as strings because a
character literal or a lifetime looked like an open quote. Whole values
replace them. If you diff extracts between releases, expect movement in
both directions.

### Added

- **Ten languages read by their own syntax** — Python, Rust, Go, shell,
  PHP, Ruby, Perl, C#, JavaScript and TypeScript. In the order you will
  notice it:

  - a Python `"""docstring"""` spanning lines is one string, where before
    it was nothing at all;
  - `r#"a raw "quoted" string"#` is one string with its inner quotes,
    where before it was the two fragments `a raw` and `string`;
  - a Go backtick string, a shell `<<EOF` heredoc and a PHP `<<<EOT` are
    strings, where before they were missing entirely;
  - `@"He said ""hi"""` in C# is one string, not three;
  - a template literal is one string however many lines and `${…}` it
    holds;
  - `'a'`, `'"'` and a Rust lifetime are not strings, so the apostrophe
    in `don't` costs itself and no longer eats the rest of the line.

  Escapes are still not resolved — a backslash in the source stays a
  backslash in the value, deliberately. A string inside a comment is
  still a string: deciding it does not count would be the tool having an
  opinion about which strings matter, and it does not.

- **`markdown` resolves now**, to the quoted-run reading — prose has no
  literals. The MCP tool's `format` list grows to seventeen names with
  `fallback` among them, so asking for the old quoted-run reading of a
  `.py` file is something you can say.

### Changed

- **A source file reports its language.** A `.ts` document comes back as
  `typescript` where it used to say `fallback`, a `.py` as `python`. If
  anything downstream reads that field, read this line twice.

- **A shell script with an unclosed heredoc no longer stalls the
  extract**, and the answer changes with it: the first tag that never
  arrives ends the batch. A shell reading `diff <<A <<B` gives the rest
  of the file to `A` when `A`'s tag never comes, so `B` never gets a
  body; String-LE used to invent one for it. It also re-read the whole
  document once per queued tag, which on a large file was seconds of
  waiting for nothing.

- **The heredoc closing-tag rule is spelled the same on both sides.**
  This half matched `\p{L}` and the Rust half asks for the Alphabetic
  property, which takes in combining marks that `\p{L}` leaves out. Two
  spellings of one rule is how two frontends start to disagree.

- **New icon artwork.** All sixteen tools were redrawn in one style, so
  the family reads as one set wherever the listings sit side by side —
  the Marketplace, Open VSX and letools.dev. The framing is unchanged:
  the drawing fills 65.8% of an 800×800 canvas, and every smaller size
  is derived from that one file rather than drawn again.

### Added — the command line

- A **Rust CLI and MCP server**, in [`crate/`](crate/README.md),
  published to crates.io as `string-le`. It runs the same extraction over
  a whole tree, with exit codes following grep — 0 found, 1 none found,
  2 malformed question — so an audit of every string in a repository is
  one command and a file.

  It reports what is there and nothing else: no spell check, no
  banned-word list, no guess at which strings are user-facing. This
  extension stays the reference implementation, `crate/fixtures/` is the
  contract between them, and CI fails when either side drifts from it —
  including a check that runs both MCP servers over generated documents
  and requires the same answer.

## [2.2.4] - 2026-08-07

### Changed

- Documentation only — no behaviour change.

  The cross-references now point at each tool's own page on letools.dev rather
  than its VS Code Marketplace listing. The Marketplace listing shows one of
  the four channels a tool ships through; the detail page shows all of them,
  which is what a reader following a link from another tool is looking for.
  Install instructions are untouched, and the rating links now lead with Open
  VSX — where the audience these READMEs reach actually installs from.

- `homepage` in the extension and MCP manifests, and `websiteUrl` in the
  registry entry, resolve to the same detail page.

## [2.2.3] - 2026-08-05

### Changed

- Documentation and packaging metadata only — no behaviour change.

  The MCP server's source now explains its decisions rather than restating its
  code: why MCP's stdio transport is line-delimited and what happens to a client
  if you copy LSP's framing, why a tool failure is a result carrying `isError`
  rather than a JSON-RPC error and what each does to a model's next move, why
  the result cap is measured in context windows rather than milliseconds, and
  why `truncated` matters more than the cap itself.

- The npm package declares `publishConfig.provenance`, so a release published
  from CI carries a Sigstore attestation binding the tarball to the commit and
  workflow that built it. A consumer can verify it with `npm audit signatures`.

- The registry entry names its registry (`registryBaseUrl`) and how to run the
  package (`runtimeHint`), rather than leaving a client to infer both.

- Package metadata points at the author's site, and the npm page links the rest
  of the family, the Rust tools and their crates.

## [2.2.2] - 2026-08-05

### Changed

- Documentation only — no behaviour change.

  The README described a keyboard shortcut and little else. 2.2.1 added an MCP
  server that VS Code registers with agent mode, published it to npm and to the
  official MCP registry, and submitted a Zed extension — and a reader could
  discover none of it from this page. There is now a section for calling the
  tool from an agent, including the JSON config for hosts that use one and a
  one-line check that the server answers before you wire it into anything.

  The privacy section previously spoke only for the extension. It covers the
  server too, which is the part an agent actually runs.

  The registry listing gains a display name, an icon and a link to letools.dev;
  the npm page gains the badges and links it was missing. Every surface now
  points at the others.

## [2.2.1] - 2026-08-05

### Changed

- **VS Code 1.101 is now the minimum.** `engines.vscode` moves from `^1.90.0`
  to `^1.101.0` and `@types/vscode` is pinned exactly to the new floor, per the
  rule that the declared floor and the type surface must match. 1.101 is the
  first stable release carrying `registerMcpServerDefinitionProvider`, which
  the MCP integration needs — declaring the contribution point against an older
  floor would be a claim the code could not honour. Cursor and VSCodium track
  well past this; Cursor 3.6.21 reports 1.105.1.

### Added

- An MCP server, shipped inside the VSIX as `dist/mcp-server.js`. It exposes
  `extract_strings` over stdio, so an agent can pull every string out of a document
  with its 1-based position.

  It imports the extraction engine and nothing from `vscode` —
  `check:mcp-bundle` fails the build if that stops being true, because the
  server has to run in Zed, in Claude Code, and from `npx`.

- The extension now offers that server to VS Code's agent mode, so installing
  it adds `extract_strings` to the agent's tools alongside the existing commands.
  Nothing is downloaded at runtime: the server is the copy inside the VSIX.
  The registration is skipped on editors that do not implement the API, which
  is not an error — an editor without agent mode is not a broken install.

- The server is on npm as [`string-le-mcp`](https://www.npmjs.com/package/string-le-mcp),
  so `npx string-le-mcp` gives the same tool to Claude Code, Cursor, Windsurf or
  anything else that speaks MCP. It is the same build the VSIX carries, and its
  version is written from this manifest rather than maintained separately.

- A **Zed extension**, under `zed/`. Zed's extension API has no way to read the
  active buffer or register a command, so this extension could never be ported
  there in any language; a context server is the surface that fits. The crate
  is a launcher — it installs `string-le-mcp` and starts it with Zed's Node — so
  there is no second implementation to keep in agreement with the goldens.

  This engine has no result envelope at all: it returns a bare array and
  reports problems through an `onParseError` callback that a caller can simply
  not pass, losing every parse failure silently. The boundary always passes one
  and turns what it collects into diagnostics, so a truncated JSON document
  reports a failure instead of an empty success.

  An unrecognised format is not an error here either — the engine falls back to
  extracting quoted strings. The tool says exactly that rather than claiming
  plain-text extraction: unquoted prose yields nothing, and a description that
  implied otherwise would be a claim the code does not back.

### Fixed

- The coverage gate could pass against a stale summary. `coverage-readme.js`
  reads `coverage/coverage-summary.json` rather than running coverage, so when
  that file was older than the code both modes lied — the rewrite reproduced
  stale numbers and `--check` then compared the README against the same stale
  file and reported it current. Both modes now refuse a summary older than
  `src/`.

- The manifest placeholder gate only inspected `contributes.commands`, so a
  `%key%` on any other contribution point could ship as literal text. It now
  walks the whole `contributes` tree.

## [2.1.0] - 2026-08-05

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
