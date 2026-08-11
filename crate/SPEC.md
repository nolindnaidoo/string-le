# string-le — Rust specification

A port of the [String-LE](https://github.com/nolindnaidoo/string-le) VS
Code extension to a Rust CLI and MCP server: get every string value out
of a codebase so a person can read them.

**Parity first.** For extraction, the extension is the reference
implementation. The values this produces for a given document, and the
order they come in, must match what the extension produces. A difference
is a regression until proven otherwise.

## The one question

**What does this codebase actually say?**

Asked over a whole tree rather than a buffer, answered into a file a
person who does not have the repository open can read.

## Who asks it

Not the author of the code. The reviewer of it: a QA lead checking every
user-visible message before a release, a legal or compliance reader
looking for a claim the product is not allowed to make, a localisation
owner finding what was never put in a catalog, an accessibility auditor
reading the copy a screen reader will say.

None of them has the editor open, and several of them cannot be given a
checkout at all. That is the whole reason this half exists: the extension
answers this for one buffer for the person who wrote it, and this answers
it for a repository, into a file, for the person who did not.

It follows that **the fallback extractor is the main event, not the edge
case.** A `.ts` file is not a format this parses, so it falls through to
quoted-string extraction — and the quoted strings in a `.ts` file are
exactly the user-facing copy the reviewer came for. An unrecognised
format is a normal, useful answer here, which is why it is not an error.

## Shape

**One crate.** Self-contained: no published `-core`, no shared crate with
the family, and nothing holding this code equal to the similar files in
the sibling repos. Where they agree it is because the same answer was
right twice; where they diverge that is the point.

```
crate/
├── src/
│   ├── extract/    pure: the seven extractors, value collection,
│   │               positions. No filesystem, pub(crate).
│   ├── walk.rs     ignore-aware tree walking and format detection
│   ├── scan.rs     one file end to end — the only path either surface calls
│   ├── cli.rs      the terminal surface
│   └── mcp/        the agent surface
└── fixtures/       the shared corpus, read by both frontends
```

**`extract/` touches no filesystem** and carries the **90% line coverage
floor per module**.

## Extraction — parity scope

### Seven extractors, one collection rule

`json`, `yaml`, `csv`, `toml`, `ini`, `env`, and `fallback` for
everything else. Aliases resolve as the extension resolves them —
`jsonc`→json, `yml`→yaml, `tsv`→csv, `cfg`/`conf`→ini, `dotenv`→env — and
a name that resolves to nothing is `fallback` rather than a refusal.

The four parsed formats (`json`, `yaml`, `toml`, `ini`) share one rule,
ported from `collectStrings`:

- **keys are never extracted, only values**
- non-string primitives are dropped — in a typed format a bare `42` is a
  number, and a TOML date is a date
- **untyped line formats are the exception**: INI and `.env` parse every
  value as text, so a numeric-looking value *is* a string there
- values are trimmed; empty and whitespace-only values are dropped
- recursion stops at depth 1000

`env` is line-based: `export ` prefixes stripped, `#` comments skipped,
inline comments removed from unquoted values only, surrounding quotes
removed. `csv` reads every cell, with optional header skip and optional
single-column selection. `fallback` takes quoted runs — double, single
or backtick.

### The order is the contract

Values come back in document order, duplicates included. `--dedupe` is
opt-in, because it is opt-in in the extension: a string that appears
forty times is a different finding from one that appears once, and which
of those matters is the reader's call.

## Positions — the addition

The extension returns values and no positions, and `extract_strings`
keeps it that way on both servers. Its callers have the buffer open.

A reviewer reading a 40,000-line extract does not, so **the CLI and this
crate's own tool report where each value came from**: always the file,
and a 1-based line and column when the value can be located in the
source. This is outside parity scope — the extension has nothing to
disagree with.

Positions come from one mechanism for all seven formats: a **forward
cursor** over the source, matching each extracted value in turn from
where the previous one ended. Extraction already yields values in
document order, so the cursor never has to guess between two occurrences
of the same string.

**A value that cannot be located reports no position, and the summary
counts how many.** This is the honest failure and it is not rare: a
parser resolves escapes and folds scalars, so `"a\nb"` in JSON, a YAML
block scalar, and a CSV cell containing an escaped quote are all real
values that never appear literally in the source. Reporting a nearby
guess would be worse than reporting nothing; a count the reader can see
is the difference between a limitation and a lie.

**Columns are UTF-16 code units**, 1-based, matching what an editor shows.

## Output contract

**stdout is protocol, stderr is human.** One JSON report per line, one
line per file.

```json
{
  "file": "src/ui/messages.ts",
  "format": "fallback",
  "strings": [
    { "value": "Delete this permanently?", "line": 12, "column": 18 },
    { "value": "Are you sure?", "line": 13, "column": 18 }
  ],
  "diagnostics": [],
  "summary": { "strings": 2, "unlocated": 0 }
}
```

### Exit codes are the API

Following grep, as urls-le does, and for the same reason — this tool
reports what is there and holds no opinion about it:

- **0** — strings found.
- **1** — none found. An answer, not an error.
- **2** — the question was malformed: an unknown flag, an unreadable
  input, a path that does not exist.

## The CLI surface

```
usage: string-le [options] <file|dir>...
       string-le [options] --stdin [--format <format>]
       string-le mcp
       string-le --version | --help

Options:
  --dedupe             collapse repeated values to their first occurrence
  --format <format>    force a format instead of inferring it from the
                       file name; an unknown name falls back rather than
                       failing
  --values             print only the values, one per line, for piping
  --csv-header         skip the first CSV row
  --csv-column <n>     take only this 0-based CSV column
  --stdin              read one document from stdin
  --hidden             walk hidden files and directories too
  --no-ignore          walk files that .gitignore excludes
```

`--values` exists because the reviewer's next step is almost always
another tool — a spellchecker, a diff against last release, a
translation memory — and making them run `jq` first is a tax on the
person this was built for.

## The MCP surface

- **`extract_strings` belongs to both servers.** The npm server and this
  one offer the same tool: same schema, same envelope, byte-identical
  output, **values only and no positions**.
  `fixtures/mcp-extract-strings.json` runs against both.
- **`string_le_scan` is this server's own**: files or directories in,
  the same reports the CLI writes, positions included.

**Refusals speak the caller's vocabulary.** No message here names a flag.

## Non-goals

- **It does not judge a string.** No spell check, no banned-word list, no
  tone or reading-level score, no "this looks user-facing" guess. Which
  strings matter is the reviewer's call, and a tool that pre-filtered
  would decide the audit before the auditor saw it.
- **It does not rewrite anything**, and never writes to a scanned file.
- **It does not extract keys**, in any format.
- **No network, ever.**

## Not in v1

- **Parser-exact spans.** The forward cursor is one mechanism for seven
  formats; per-format spans would locate the values it cannot, at the
  cost of a position-preserving parser for each. The `unlocated` count is
  what says whether that is worth buying.
- **CSV streaming.** The extension streams for large files because it
  must stay responsive in an editor; a CLI that reads a file and exits
  has no such constraint.
- **A baseline file** for accepting known strings.
