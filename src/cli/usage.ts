/**
 * The command line's help text and the flags it names.
 *
 * Word for word the Rust CLI's, because both install as `string-le` and a
 * person reading `--help` cannot tell which one they have.
 * `scripts/check-cli-parity.ts` compares the two outputs, and `cli.test.ts`
 * holds FLAGS equal to the flags this text names.
 */

export const USAGE = `usage: string-le [options] <file|dir>...
       string-le [options] --stdin [--format <format>]
       string-le mcp
       string-le --version | --help

Gets every string value out of a tree and into one place a person can
read: JSON, YAML, CSV, TOML, INI and dotenv are parsed, ten source
languages are read by their own literal syntax, and anything else falls
back to quoted runs — so a .py or .rs file yields the copy in it rather
than fragments of it.

It reports what is there and nothing else. Which strings matter is yours
to decide.

One JSON report per line on stdout when it is piped or redirected, human
summary on stderr. At a terminal stdout stays silent, except that
--values always prints the values.

Options:
  --dedupe             collapse repeated values to their first occurrence
  --format <format>    force a format instead of inferring it from the
                       file name; an unknown name falls back rather than
                       failing
  --values             print only the values, one per line, for piping
  --multiline          let a *fallback* quoted run span lines. A language
                       whose own syntax spans lines needs no flag; this
                       is for the formats nothing here parses
  --csv-header         skip the first CSV row
  --csv-column <n>     take only this 0-based CSV column
  --strict             exit 2 if any file could not be read, rather than
                       reporting it and carrying on
  --stdin              read one document from stdin
  --hidden             walk hidden files and directories too
  --no-ignore          walk files that .gitignore excludes

A binary file — a NUL byte in its first 8KB — was never a text
candidate: it gets no report line and cannot fail --strict, and the
summary counts how many. A file that IS text and could not be read is
named on stderr and carried in the report, and does not by itself fail
the run; --strict turns that back into a failure.

Exit codes follow grep: 0 strings found · 1 none found · 2 malformed
question. Finding none is an answer, not an error.`;

export const FLAGS: readonly string[] = Object.freeze([
	'--strict',
	'--dedupe',
	'--format',
	'--values',
	'--multiline',
	'--csv-header',
	'--csv-column',
	'--stdin',
	'--hidden',
	'--no-ignore',
]);
