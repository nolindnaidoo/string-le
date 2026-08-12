# Changelog

The Rust CLI and MCP server. The VS Code extension has its own
[CHANGELOG](../CHANGELOG.md) and its own version — the two products in
this repository release on their own cadence.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Ten source languages, read by their own literal syntax** — Python,
  Rust, Go, shell, PHP, Ruby, Perl, C#, JavaScript and TypeScript. The
  quoted-run fallback reads every source file through a
  JavaScript-shaped lens, and on real code that lens is wrong rather than
  coarse: a Python docstring spanning lines was missed entirely,
  `r#"a raw "quoted" string"#` came back as `a raw` and `string`, a Go
  backtick string and a shell heredoc were not there at all, and a C#
  verbatim string split into three. Aliases carry both the VS Code
  language id and the file extension, so the extension and the walk
  cannot disagree about what a file is.

  Every literal is handed to the same `collect` the parsed formats use,
  so "what counts as a string" is answered once. Escapes stay unresolved
  and comments still yield their quoted runs — the divergences from the
  fallback are per-language facts, listed in SPEC.md.

- **`--format fallback`**, and `markdown`/`md` resolving to it. Now that
  a `.py` file is read as Python, asking for the quoted runs instead has
  to be sayable.

### Changed

- **A source file reports its language, not `fallback`.** `messages.ts`
  comes back as `typescript`, `app.py` as `python`. Every corpus case and
  both surfaces move with it.
- **`--multiline` belongs to the fallback only.** A Python triple-quoted
  string, a Go or Rust raw string, a heredoc and a template literal span
  lines because their language says so, and are read that way with no
  flag — that is the language's syntax rather than a divergence from the
  extension, which runs the same scanner. The flag still widens the
  quoted-run fallback, where spanning lines really is a divergence.
- **A binary file is skipped silently and counted, not reported as a
  skip.** A NUL byte in the first 8KB means binary — ripgrep's heuristic.
  Such a file gets no report line and cannot fail `--strict`; the stderr
  summary counts them (`…, 16 binary files skipped`) and the MCP scan
  reports `data.binaryFiles`. Reported as skips, one PNG made `--strict`
  exit 2 on every repository that has an image in it. A file that *is*
  text and still could not be read keeps its named `skipped` diagnostic
  and keeps failing `--strict`; that distinction is the point.

## [0.1.0] - 2026-08-11

First release. The extension's extraction engine, ported and pinned
against a shared corpus, over a tree instead of a buffer.

### Added

- **All seven extractors** the extension has — JSON, YAML, CSV, TOML,
  INI, dotenv, and the quoted-string fallback — reproducing its values,
  in its order, for every case in `fixtures/`. That includes the parts
  worth stating: keys are never extracted, non-string primitives are
  dropped in typed formats but kept in the untyped ones, values are
  trimmed, and an unrecognised format falls back rather than failing.
- **Positions**, which the extension does not produce: the file always,
  and a 1-based line and column. JSON is placed by its parser's own
  ranges, so it is always located; the other six are found by a forward
  search over the source, and a value that search cannot find — a folded
  scalar, a CSV cell with an escaped quote — reports none, with the count
  in the summary.
- **`--multiline`**, the one place this answers differently from the
  extension and only when asked. JavaScript's `.` does not match a
  newline, so a multi-line template literal is invisible there; that is
  an email body or a consent notice, and a terminal has no reason to
  inherit the limit. Off by default.
- **The CLI**: JSON reports on stdout one per line, a human summary on
  stderr, and exit codes following grep — 0 strings found, 1 none found,
  2 the question was malformed. `--dedupe`, `--format`, `--values`,
  `--multiline`, `--csv-header`, `--csv-column`, `--stdin`, `--hidden`,
  `--no-ignore`.
- **The MCP server** (`string-le mcp`) with two tools:
  `extract_strings`, shared byte-for-byte with the npm server and pinned
  by `fixtures/mcp-extract-strings.json`, and `string_le_scan`.

### The shape of it

**The reader is not the author.** The extension answers for one buffer,
for the person who wrote the code. This answers for a repository, into a
file, for the person who did not — a QA lead reading every user-visible
message, a compliance reviewer looking for a claim the product may not
make, a localisation owner finding what never reached a catalog. Several
of them cannot be handed a checkout at all.

That is why **the fallback extractor is the main event rather than the
edge case**. A `.ts` file is not a format this parses, so it falls
through to quoted-string extraction — and those quoted strings are
exactly the copy the reviewer came for.

**It has no opinions.** No spell check, no banned-word list, no guess at
which strings are user-facing. Which strings matter is the reviewer's
call, and a tool that pre-filtered would decide the audit before the
auditor saw it. A contract test asserts no flag asks for a judgment.

[0.1.0]: https://github.com/nolindnaidoo/string-le/releases/tag/crate-v0.1.0

### Fixed

- **A leading byte-order mark is no longer part of the document.** Three
  invisible bytes, added by Notepad, Excel and a PowerShell redirect, and
  stripped by VS Code before the extension ever sees a file — so the two
  frontends read the same file differently. It shifted every column on
  line one, and before a `{` it made a structured parser reject the whole
  document, which is indistinguishable from a file with no strings in it.

- **A file that cannot be read no longer fails the run.** Every
  repository has a PNG, a zip and something the runner lacks permission
  for. Exiting 2 on those made the tool unusable in CI, which is the one
  place it is most worth running. Such a file is now named on stderr and
  carried in the report with a `skipped` diagnostic, and the exit code
  reflects what was found. `--strict` restores the old behaviour for a
  pipeline that wants zero tolerance.

- **A file that is not text is named rather than dropped.** It used to
  vanish from the report entirely, which reads to whoever ran it as
  "that file was clean".
