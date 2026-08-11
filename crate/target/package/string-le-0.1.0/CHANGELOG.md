# Changelog

The Rust CLI and MCP server. The VS Code extension has its own
[CHANGELOG](../CHANGELOG.md) and its own version — the two products in
this repository release on their own cadence.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
  and a 1-based line and column when the value can be located in the
  source. A value that cannot be — a resolved escape, a folded scalar —
  reports none, and the summary counts them.
- **The CLI**: JSON reports on stdout one per line, a human summary on
  stderr, and exit codes following grep — 0 strings found, 1 none found,
  2 the question was malformed. `--dedupe`, `--format`, `--values`,
  `--csv-header`, `--csv-column`, `--stdin`, `--hidden`, `--no-ignore`.
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
