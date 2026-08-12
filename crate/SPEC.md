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

It follows that **source files are the main event, not the edge case.**
The user-facing copy lives in `.py`, `.ts`, `.go` and `.rs`, so those are
read by their own literal syntax, and anything still unrecognised falls
through to quoted-string extraction rather than being refused. An
unrecognised format is a normal, useful answer here, which is why it is
not an error.

## Shape

**One crate.** Self-contained: no published `-core`, no shared crate with
the family, and nothing holding this code equal to the similar files in
the sibling repos. Where they agree it is because the same answer was
right twice; where they diverge that is the point.

```
crate/
├── src/
│   ├── extract/    pure: the parsed formats, the source languages,
│   │               value collection, positions. No filesystem,
│   │               pub(crate).
│   ├── walk.rs     ignore-aware tree walking and format detection
│   ├── scan.rs     one file end to end — the only path either surface calls
│   ├── cli.rs      the terminal surface
│   └── mcp/        the agent surface
└── fixtures/       the shared corpus, read by both frontends
```

**`extract/` touches no filesystem** and carries the **90% line coverage
floor per module**.

## Extraction — parity scope

### Seventeen formats, one collection rule

Six parsed: `json`, `yaml`, `csv`, `toml`, `ini`, `env`. Ten source
languages read by their own literal syntax: `python`, `rust`, `go`,
`shellscript`, `php`, `ruby`, `perl`, `csharp`, `javascript`,
`typescript`. And `fallback` — quoted runs — for everything else,
`markdown` included.

Aliases resolve as the extension resolves them, and carry both the VS
Code language id and the file extension, because one frontend dispatches
on the id it is handed and the other on the name of a file it walked:
`jsonc`→json, `yml`→yaml, `tsv`→csv, `cfg`/`conf`→ini, `dotenv`→env,
`py`→python, `rs`→rust, `sh`/`bash`/`zsh`→shellscript, `rb`→ruby,
`pl`/`pm`→perl, `cs`→csharp, `js`/`jsx`/`mjs`/`cjs`/`javascriptreact`→
javascript, `ts`/`tsx`/`mts`/`cts`/`typescriptreact`→typescript,
`md`/`markdown`→fallback. A name that resolves to nothing is `fallback`
rather than a refusal.

The four parsed formats (`json`, `yaml`, `toml`, `ini`) share one rule,
ported from `collectStrings`, and **the source languages hand their
literals to the same rule** rather than answering it a second time:

- **keys are never extracted, only values**
- non-string primitives are dropped — in a typed format a bare `42` is a
  number, and a TOML date is a date
- **untyped line formats are the exception**: INI and `.env` parse every
  value as text, so a numeric-looking value *is* a string there
- values are trimmed; empty and whitespace-only values are dropped
- recursion stops at depth 1000

**Trimming is JavaScript's, not Rust's.** The extension trims with
`String.prototype.trim`, whose whitespace set carries U+FEFF — the
byte-order mark, which the language calls ZWNBSP — and does not carry
U+0085. Unicode's `White_Space`, which `str::trim` uses, is the other way
round on both. Two characters, and enough to make the shared
`extract_strings` tool answer two ways for a value with a mark at either
end. One rule lives in `extract/text.rs` and every extractor uses it.

**A quoted `.env` value is the exception to the drop.** `A="  "` yields
two spaces. There is no type system in a `.env` file, so quoting is the
only way to say "this value is whitespace", and dropping it would throw
away something written on purpose. Both frontends do this and
`fixtures/documents/whitespace.env` pins it.

`env` is line-based: `export ` prefixes stripped, `#` comments skipped,
inline comments removed from unquoted values only, surrounding quotes
removed. `csv` reads every cell, with optional header skip and optional
single-column selection. `fallback` takes quoted runs — double, single
or backtick.

### The source languages

The quoted-run pattern reads every source file through a
JavaScript-shaped lens, and on real code that lens is wrong rather than
merely coarse:

| input | fallback | language |
|---|---|---|
| Python `"""a docstring"""` spanning lines | missed entirely | one value |
| Rust `r#"a raw "quoted" string"#` | `a raw`, `string` | one value, quotes intact |
| Go `` `raw` `` spanning lines | missed entirely | one value |
| shell `<<EOF … EOF` | missed entirely | one value |
| C# `@"He said ""hi"""` | three fragments | one value |

What each language adds:

- **Python** — triple-quoted `"""…"""` and `'''…'''`, and the `r`, `b`,
  `u`, `f` prefixes in any order or case.
- **Rust** — raw strings with any number of hashes (`r"…"`, `r#"…"#`,
  `r##"…"##`), byte and C-string prefixes, nested block comments, and
  character literals skipped so `'"'` cannot open a run.
- **Go** — backtick raw strings, interpreted strings that stop at the
  line, runes skipped.
- **Shell, PHP, Ruby, Perl** — heredocs: `<<EOF`, `<<'EOF'`, `<<-EOF`,
  `<<<EOT`, `<<<'NOW'`, `<<~EOS`. A body whose closing tag never arrives
  is not a heredoc, **and it ends the batch**: a shell reading
  `diff <<A <<B` gives the rest of the file to `A` when `A`'s tag never
  arrives, so `B` never gets a body either. Reading on to `B` invented
  one, and made a line carrying a thousand tags read the whole file a
  thousand times.
- **C#** — verbatim `@"…"` where `""` is one quote, interpolated `$"…"`,
  and both together in either order.
- **JavaScript / TypeScript** — template literals as **one** value,
  interpolation and nested templates included.

**Three deliberate divergences from the naive fallback**, each of them a
fact about the language rather than a judgment about the string:

1. **A run may span lines when its language says it may** — a Python
   triple-quote, a Go or Rust raw string, a template literal, a heredoc.
   This needs no `--multiline`, because it is not a divergence from the
   extension: the extension runs the same scanner.
2. **A character literal is not a string.** `'a'` in Rust, Go and C# is
   dropped, the way a bare `42` is dropped in a typed format.
3. **An unterminated run is not a string.** The apostrophe in
   `don't` costs itself a value rather than costing the rest of the file
   its meaning.

**Two things are kept from the fallback on purpose.** Escapes are *not*
resolved — a backslash in the source survives into the value, which is
also what lets a value be found again and given a position. And a comment
is text like any other: its quoted runs are read with the fallback
pattern, so language awareness buys correct literals without quietly
deciding a string in a comment does not count.

**Known limits, stated rather than discovered.** A regex literal
containing a quote is read as though the quote opened a run, which dies
at the end of the line. Ruby's `%w[]`/`%q()` forms and Perl's `q()`/`qq{}`
are not recognised. Markdown is prose, so it takes the fallback.

**An unterminated delimiter costs its own run and nothing more.** It
never panics, never loops, and never quietly takes the rest of the file
with it — but it does re-pair what follows: an unterminated Rust `r#"`
leaves the `"` behind it to open an ordinary string, which then closes on
the next quote several lines down. That is what a compiler sees too, and
both frontends see it identically.
`fixtures/documents/unterminated.txt` pins the answer for all ten
languages and the fallback, because this is the shape most likely to
drift and least likely to be written by hand.

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

**JSON is placed by its parser; everything else by a forward cursor.** The
jsonc AST carries a range for every literal, so JSON needs no search and
can place the values a search never finds. The cursor walks the source
matching each extracted value in turn from where the previous one ended;
extraction already yields values in document order, so it never has to
guess between two occurrences of the same string.

Positions are outside parity scope, so a format may be placed however it
can be placed honestly. Where a parser offers spans, they win.

**A value that cannot be located reports no position, and the summary
counts how many.** This is the honest failure: a parser resolves escapes
and folds scalars, so a YAML block scalar and a CSV cell containing an
escaped quote are real values that never appear literally in the source.
Reporting a nearby guess would be worse than reporting nothing; a count
the reader can see is the difference between a limitation and a lie.

JSON used to be the largest source of these and now has none, which is
the whole reason it earned spans.

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
  --multiline          let a *fallback* quoted run span lines; a language
                       whose own syntax spans lines needs no flag
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

## Where this deliberately differs

Three places, each opt-in or reported, never silent.

**`--multiline`.** JavaScript's `.` does not match a newline without the
`s` flag, so the quoted-run pattern cannot span lines. It belongs to the
**fallback** only: a language whose own syntax spans lines is read that
way with no flag, because there the extension does the same. Off by
default, so the default answer is the extension's answer. Asked for, the
fallback reads those runs too — an email body, a help paragraph, a
consent notice is exactly the copy an audit least wants to miss, and the
terminal has no reason to inherit a limit that exists because a regex in
an editor did not set a flag.

**Nesting limits.** Each parser here guards its own depth — jsonc-parser
at 512, saphyr at 256 — below the 1000 the extension's walk stops at. A
document deeper than that comes back here as a **reported parse failure**
and there as a silently half-read document. Both yield nothing useful;
only one of them says so.

**Positions**, which the extension does not have at all, so there is
nothing to differ with.

**The words a parser uses to refuse.** Both servers report a broken
document the same way — `ok: false`, one diagnostic, severity `error`,
code `parsing`, and a message opening `Invalid JSON: ` — and neither
promises what comes after that prefix, because jsonc-parser and
`JSON.parse` are different programs that word the same failure
differently. `scripts/check-differential.ts` asserts the half that is
shared.

**How strict a parser is.** `rust-ini` refuses a section header that
never closes; the `ini` package accepts it and reads the line. Two
parsers, two tolerances, and no way to have the stricter one be lenient
without writing a third. This is the one format where the two servers
disagree about whether a document is broken at all; the differential
check pins the direction, so the day either parser changes its mind the
build says so.

Everything else is parity, and the corpus is what proves it.

**Parity is the shared tool, not the two surfaces.** `extract_strings`
is one tool with two servers, and an agent must get the same answer
whichever it reaches. The surfaces are meant to differ: the extension is
IDE-first, for one open buffer, and this is terminal-first, for trees,
exit codes and pipes. The walk, `--strict`, `--values`, `--dedupe`, the
exit codes, JSON Lines and `--multiline` are this half's alone, and are
not held against the other.

## Non-goals

- **It does not judge a string.** No spell check, no banned-word list, no
  tone or reading-level score, no "this looks user-facing" guess. Which
  strings matter is the reviewer's call, and a tool that pre-filtered
  would decide the audit before the auditor saw it.
- **It does not rewrite anything**, and never writes to a scanned file.
- **It does not extract keys**, in any format.
- **No network, ever.**

## Not in v1

- **Parser-exact spans for the formats a cursor places.** JSON has them
  because its parser already carried ranges; TOML, YAML and CSV would
  each need a position-preserving parser bought for the purpose. The
  `unlocated` count is what says whether that is worth it.
- **CSV streaming.** The extension streams for large files because it
  must stay responsive in an editor; a CLI that reads a file and exits
  has no such constraint.
- **A baseline file** for accepting known strings.

## Files that were not read

Exit 2 means the *question* was malformed — an unknown flag, an
unreadable format name, a path that does not exist. It does not mean one
file in fifty thousand was a PNG.

Two different things, told apart on purpose.

**A binary file was never a text candidate.** A NUL byte in the first 8KB
is binary — ripgrep's heuristic, borrowed for the same reason its walker
is. Such a file gets **no report line**, carries no diagnostic, and
cannot fail `--strict`: it is not a text file that failed to be read, it
is a file this was never going to read. The stderr summary **counts
them** — `2 strings in 40 files, 16 binary files skipped` — because the
walk reached more files than the reader got, and saying nothing about the
difference is how a report claims coverage it does not have. On the MCP
surface the same count is `data.binaryFiles` with a `binary` warning.

**A file that is text and still could not be read** — a permissions
error, or bytes that are not valid UTF-8 with no NUL among them — is:

- named on stderr,
- carried in the JSON report with a `skipped` diagnostic saying why,
- and left out of the exit code by default.

`--strict` turns any *skipped* file back into exit 2, for a pipeline that
wants zero tolerance. Before the two were told apart, one PNG made
`--strict` exit 2 on every repository that has an image in it, which is
every repository. What is never allowed is the third option: a text file
that silently vanishes, which reads to whoever ran it as a file that was
clean.

## The byte-order mark

A leading BOM is stripped before extraction. It is three invisible bytes
that Notepad, Excel and a PowerShell redirect all add, and that VS Code
removes before the extension sees a document — so leaving it in means
the two frontends read the same file differently. It shifts every column
on the first line, and in a structured format it can lose the document
entirely.

A BOM anywhere other than the start is a zero-width no-break space and
belongs to the text.
