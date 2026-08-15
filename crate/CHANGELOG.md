# Changelog

The Rust CLI and MCP server. The VS Code extension has its own
[CHANGELOG](../CHANGELOG.md) and its own version — the two products in
this repository release on their own cadence.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-08-15

### Fixed

- **The crates.io page shows the icon.** It lived only in the repository
  README, and that file is not the one `cargo publish` ships — the
  published README is this directory's. A relative path would not have
  fixed it: the crate is published from `crate/`, so crates.io resolves
  a relative link against `path_in_vcs` and looks for the asset below
  the crate directory rather than beside it. The image is an absolute
  URL, which every surface renders.

  No demo goes with it. `src/assets/images/demo.gif` records the
  extension reading an editor buffer, which is not what this binary
  does; the demo that belongs here is a recording of the CLI, and there
  is not one yet.

## [0.2.0] - 2026-08-14

Source files are the reason this tool exists, and until now it read them
through the wrong lens. This release makes it do what you already
expected: a Python docstring is one string, a Rust raw string keeps the
quotes inside it, a shell heredoc is there at all.

**Your counts will move, and not all in the same direction.** On a
Python or shell tree the number goes up — docstrings and heredoc bodies
were invisible before. On a Rust or C# tree it goes down, and that is
the fix working: scanning this crate's own source finds 1,889 strings
where it used to find 2,033, and the 144 that went away were `:`, `"`,
`{`, `,` — fragments of lifetimes and character literals that were never
strings. Whole values replace them: a JSON payload embedded in a test
used to arrive in four pieces and now arrives in one. If you keep a
baseline, re-take it.

### Added

- **Ten languages read by their own syntax** — Python, Rust, Go, shell,
  PHP, Ruby, Perl, C#, JavaScript and TypeScript. What changes, in the
  order you will notice it:

  - a Python `"""docstring"""` spanning lines is one string, where before
    it was nothing at all;
  - `r#"a raw "quoted" string"#` is one string with its inner quotes,
    where before it was `a raw` and `string`;
  - a Go backtick string, a shell `<<EOF` heredoc and a PHP `<<<EOT` are
    strings, where before they were missing;
  - `@"He said ""hi"""` in C# is one string, not three;
  - a template literal is one string however many lines and `${…}` it
    holds;
  - `'a'`, `'"'` and a Rust lifetime are not strings, so an apostrophe
    in `don't` costs itself and no longer eats the rest of the line.

  Escapes are still not resolved — a backslash in the source is a
  backslash in the value, on purpose, because that is what lets a value
  be found again and given a line and column. A string inside a comment
  is still a string; deciding it does not count would be this tool
  having an opinion.

- **`--format fallback`**, for when you want the old quoted-run reading
  of a source file back. `markdown` and `md` resolve to it too: prose has
  no literals.

- **Six CI jobs**, each added because something real got past a green
  suite: hazardous files and trees on three operating systems, per-OS
  behaviour, a generated cross-server check, a fuzzer over the parsers, a
  wall-clock budget, and a matrix asserting every format it claims to
  open is opened. They found every fix below. Details in AGENTS.md.

### Changed

- **A source file reports its language.** `messages.ts` comes back as
  `typescript` and `app.py` as `python`, where both used to say
  `fallback`. If you branch on the `format` field, this is the line to
  read twice.

- **The `extract_strings` MCP tool now answers `ok: false` on a document
  it could not parse**, with a diagnostic saying why. It used to answer
  `ok: true` with an empty list — a clean result for a check that never
  ran. **If you branch on `ok`, your code will take a different path than
  it did.** That is the intent: an empty answer and an unreadable
  document should never have looked the same.

- **`--multiline` is for the fallback only.** A Python triple-quoted
  string, a Go or Rust raw string, a heredoc and a template literal span
  lines because their language says so, and need no flag. The flag still
  widens the quoted-run reading of everything else.

- **A binary file is skipped silently and counted.** A NUL byte in the
  first 8KB means binary: no report line, no diagnostic, and it cannot
  fail `--strict`. The summary counts them — `…, 16 binary files
  skipped` — because the walk reached more files than you got. Before
  this, one PNG made `--strict` exit 2 on every repository that has an
  image in it, which is every repository. A file that *is* text and
  still could not be read is still named and still fails `--strict`.

### Fixed

- **A shell script with an unclosed heredoc took half a minute to
  scan.** A 200 KB file spent 24 seconds; it now takes a third of a
  second. This is also a **behaviour change**: the first tag that never
  arrives ends the batch, which is what a shell does — `diff <<A <<B`
  with no `A` gives the rest of the file to `A`, so `B` never gets a body
  either. Reading on to `B` invented one.

- **Reports written on Windows used backslashes.** A path in the report
  read `src\ui\messages.ts`, so a pipeline grepping for
  `src/ui/messages.ts` found nothing and the same scan described the same
  file two ways on two machines. Every reported path uses `/` now. On
  unix a backslash in a file name is still part of the name.

- **A value with a byte-order mark at either end came back two different
  ways** depending on which of the two MCP servers you asked. One trimmed
  the mark off, the other kept it. They agree now.

- **`Invalid CSV: Invalid CSV: …`** — the format was named twice in the
  one message you ever see.

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

[0.2.1]: https://crates.io/crates/string-le/0.2.1
[0.2.0]: https://crates.io/crates/string-le/0.2.0
[0.1.0]: https://crates.io/crates/string-le/0.1.0
