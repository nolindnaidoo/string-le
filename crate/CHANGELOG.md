# Changelog

The Rust CLI and MCP server. The VS Code extension, the npm MCP server
and the npm command line have their own [CHANGELOG](../CHANGELOG.md).
Up to 0.4.4 the crate was versioned on its own. From 2.6.0 every surface
in this repository carries one version and releases from one tag.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.6.4] - 2026-10-17

### Changed

- No change to the crate. The version moves with the npm command line,
  which now refuses a closed stdout in this crate's words.

## [2.6.3] - 2026-10-17

### Changed

- No change to the crate. The version moves with the npm command line,
  which now waits for stderr to drain before it exits.

## [2.6.2] - 2026-10-16

### Changed

- No change to the crate. The version moves with the npm command line,
  which now words an OS error on Windows as this one does.

## [2.6.1] - 2026-10-16

### Changed

- No change to the crate. The version moves with the npm command line,
  which publishes as `strings-le` because npm refused `string-le`. 2.6.0
  was tagged but never reached crates.io.

## [2.6.0] - 2026-10-15

### Changed

- **The version jumps from 0.4.4 to 2.6.0** to match the extension and
  the npm command line `string-le`, which installs the same command and
  is held to this one byte for byte. Two binaries called `string-le`
  printing different versions for the same behaviour would mislead
  anyone comparing them. The number changes no behaviour.

## [0.4.4] - 2026-10-15

### Changed

- **stdout is silent at a terminal.** The JSON reports printed on the same
  screen as the stderr listing and said the same thing again. Piped or
  redirected, stdout carries every report exactly as before. `--values`
  still prints the values at a terminal, because it is a request to see
  them.

## [0.4.3] - 2026-10-13

The crate's half of a bug fix and hardening pass over the whole repository.

### Fixed

- The shared `extract_strings` tool read a `filename` sent as a path by the
  text after its last dot, so `config/.env.local` was the quoted-run scan
  and an unquoted value in it was missed. A filename is resolved by its last
  segment, whichever separator wrote the path, as the walk's file names
  always were.
- A dotenv line holding a lone quote, `A="`, yielded the quote character
  as a value; the extension reads it as an unterminated value and yields
  nothing, and so does this now.
- A repeated INI key yielded every value here and only the last one from the
  extension, whose `ini` package reads a section into an object. It keeps
  the last value in the place the key first appeared, on both, and SPEC.md
  says so.
- The shared tool refused a `maxResults` written as `1e21`, which the npm
  server reads as an integer and clamps to the ceiling. Any integral number
  past the ceiling is clamped, on both.
- The MCP server ended with exit 2 on a line that was not UTF-8, and every
  later request went unanswered. It reads such a line with replacement
  characters, as the npm server's decoder does, and keeps serving.
- The MCP server dropped a line that was not JSON, and a request without a
  method, without a word, answered a request lacking `jsonrpc: "2.0"`, and
  answered a request whose id is null. Each is handled as the npm server
  handles it: a parse error for the first three, in the same words, and no
  reply for the last, which is a notification. The unknown-method and
  unknown-tool refusals use the npm server's words too.
- A document nested deeper than its parser follows was refused in the
  parser's own words, where the extension read it as empty, and a YAML
  document between 99 and 255 levels of flow nesting was read here and
  refused there. Both sides count the nesting before parsing and refuse
  past one bound per format, 512 for JSON, 80 for TOML, 98 for YAML, in
  the same words. SPEC.md "Nesting limits, held equal".
- The MCP server held a frame whole until its newline, so input with no
  newline grew the process by its own size. A frame over 16 MiB is refused
  with a JSON-RPC parse error, in the npm server's words, and the server
  keeps serving.

## [0.4.2] - 2026-10-11

### Fixed

- **The README's Open VSX link led nowhere.** It pointed at a namespace the
  extension's listing has left, and points at `nolindnaidoo` now. The Zed
  row is gone with the Zed extension, which was never listed.
- The family list's String-LE line no longer promises a position for every
  string.
- The crate's description no longer promises a position for every string.
  Positions are an opt-in setting in the extension, absent from the shared
  `extract_strings` tool, and unavailable for six formats.

### Changed

- SPEC.md no longer says the extension has no positions. It has had them as
  an opt-in setting since extension 2.5.0, placed by its own scanner for the
  source languages, JSON and plain text. The shared tool still carries none,
  and nothing holds the two surfaces' placements equal.

## [0.4.1] - 2026-10-03

### Fixed

- The `extract_strings` MCP tool's `maxResults` description now matches the npm
  server's word for word ("Cap on returned strings"). CI now fails when the two
  servers' definitions differ.

## [0.4.0] - 2026-09-30

### Added

- **A quoted string can span lines in the fallback scan.** In a format
  nothing here parses, a multi-line message or template was invisible,
  because a quoted run stopped at the end of a line. The new
  `string-le.fallback.multiline` setting, off by default, lets it span
  lines, as the CLI's `--multiline` already did. The shared
  `extract_strings` MCP tool takes the same `multiline`, on both servers.
  Languages whose own strings span lines were already read that way.

## [0.3.1] - 2026-08-15

### Fixed

- **`.env.local` and its siblings are read as dotenv.** Resolution split
  on the last dot, so `.env.local` and `.env.production` asked `local`
  and `production` for a format, got nothing, and fell to the quoted-run
  scan — which finds only what is quoted. An unquoted `NAME=plain`
  vanished, while the `.env` beside it reported it.

  The leading dot is the signal, so the check runs before `normalise`
  strips it: reading `env.ts` as dotenv would silence a real source
  file, which is the worse mistake. `.envrc` is direnv's shell script
  and stays out. Both exclusions are pinned.

## [0.3.0] - 2026-08-15

Three formats named a reader that could not read them. An audit drove
the binary instead of reading the spec.

### Fixed

- **`.conf` and `.cfg` are read by the quoted-run scan.** They named the
  INI reader, which accepts free-form text as a valid document holding
  no values — so an sshd config's `Banner "Authorized users only."` came
  back as nothing at all, with an empty `diagnostics` and exit 1. That
  is a file reading to whoever ran it as a file that was clean.
  `.properties` keeps the INI reader.

- **`.tsv` is read with a tab.** It named the comma reader, so
  `Alice\tHello, world` came back as the two values `Alice\tHello` and
  `world` — neither of which is in the document. This one did not merely
  lose values; it invented them.

- **`.jsonc` reads comments and trailing commas.** It named the strict
  reader, which rejects both.

### Added

- `jsonc` and `tsv` are formats in their own right, with corpus
  documents pinning each, and a contract test — observed failing before
  the fix — asserting that a named format reads the document it was
  named for.

## [0.2.2] - 2026-08-15

### Added

- **The crates.io page carries a demo of the CLI.** It had the icon and
  nothing else, because the only recording in the repository was of the
  VS Code extension reading an editor buffer — a clip of something this
  binary does not do. `assets/demo.tape` records the real binary against
  the files in `assets/demo/`, so the clip is reproducible (`cd assets
  && vhs demo.tape`) rather than an artifact nobody can regenerate.

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

[0.4.4]: https://crates.io/crates/string-le/0.4.4
[0.4.3]: https://crates.io/crates/string-le/0.4.3
[0.4.2]: https://crates.io/crates/string-le/0.4.2
[0.4.1]: https://crates.io/crates/string-le/0.4.1
[0.4.0]: https://crates.io/crates/string-le/0.4.0
[0.3.1]: https://crates.io/crates/string-le/0.3.1
[0.3.0]: https://crates.io/crates/string-le/0.3.0
[0.2.2]: https://crates.io/crates/string-le/0.2.2
[0.2.1]: https://crates.io/crates/string-le/0.2.1
[0.2.0]: https://crates.io/crates/string-le/0.2.0
[0.1.0]: https://crates.io/crates/string-le/0.1.0
