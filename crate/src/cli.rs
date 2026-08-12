//! The terminal surface.
//!
//! stdout is always protocol — one JSON report per line, one line per
//! file. stderr is always for the human, and is a projection of the same
//! reports rather than parallel prose.

use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::ExitCode;

use crate::extract::resolve_format;
use crate::scan::{self, FileReport, ScanOptions};
use crate::walk::{self, WalkOptions};

const USAGE: &str = "usage: string-le [options] <file|dir>...
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

Files that are not text, or that cannot be opened, are named on stderr
and carried in the report, and do not by themselves fail the run — every
repository has a PNG in it. --strict turns them back into a failure.

Exit codes follow grep: 0 strings found · 1 none found · 2 malformed
question. Finding none is an answer, not an error.";

/// Every flag the parser accepts. Held equal to the flags named in USAGE
/// by a test, and consulted at runtime so the list is what the parser
/// actually honours.
const FLAGS: [&str; 10] = [
    "--strict",
    "--dedupe",
    "--format",
    "--values",
    "--multiline",
    "--csv-header",
    "--csv-column",
    "--stdin",
    "--hidden",
    "--no-ignore",
];

#[derive(Debug)]
struct Cli {
    /// Fail the run if any file could not be read.
    strict: bool,
    inputs: Vec<PathBuf>,
    stdin: bool,
    /// Print values alone rather than JSON reports. The reviewer's next
    /// step is almost always another tool, and making them run `jq`
    /// first is a tax on the person this was built for.
    values_only: bool,
    scan: ScanOptions,
    walk: WalkOptions,
}

pub(crate) fn run() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();

    if let Some(first) = args.first() {
        match first.as_str() {
            "mcp" => return crate::mcp::serve(),
            "--help" | "-h" => {
                println!("{USAGE}");
                return ExitCode::SUCCESS;
            }
            "--version" | "-V" => {
                println!("string-le {}", env!("CARGO_PKG_VERSION"));
                return ExitCode::SUCCESS;
            }
            _ => {}
        }
    }

    match execute(&args) {
        Ok(code) => ExitCode::from(code),
        Err(message) => {
            eprintln!("string-le: {message}");
            ExitCode::from(2)
        }
    }
}

fn execute(args: &[String]) -> Result<u8, String> {
    let options = parse(args)?;
    let reports = if options.stdin {
        vec![scan_stdin(&options)?]
    } else {
        walk::collect(&options.inputs, &options.walk)?
            .iter()
            .map(|target| scan::scan_file(target, options.scan))
            .collect()
    };

    if options.values_only {
        write_values(&reports)?;
    } else {
        write_reports(&reports)?;
    }

    summarise(&reports, options.values_only);
    Ok(scan::exit_code(&reports, options.strict))
}

fn write_reports(reports: &[FileReport]) -> Result<(), String> {
    let mut stdout = std::io::stdout().lock();
    for report in reports {
        let line = serde_json::to_string(report).expect("a report serializes");
        writeln!(stdout, "{line}")
            .map_err(|error| format!("could not write the report: {error}"))?;
    }
    Ok(())
}

fn write_values(reports: &[FileReport]) -> Result<(), String> {
    let mut stdout = std::io::stdout().lock();
    for report in reports {
        for found in &report.strings {
            writeln!(stdout, "{}", found.value)
                .map_err(|error| format!("could not write the values: {error}"))?;
        }
    }
    Ok(())
}

fn scan_stdin(options: &Cli) -> Result<FileReport, String> {
    let mut content = String::new();
    std::io::stdin()
        .read_to_string(&mut content)
        .map_err(|error| format!("could not read stdin: {error}"))?;
    // No filename to infer from, so an unnamed format falls back — which
    // is the same answer a source file gets and needs no special case.
    let format = options
        .scan
        .format
        .unwrap_or(crate::extract::FALLBACK_FORMAT);
    Ok(scan::scan_content(
        &content,
        "<stdin>".to_string(),
        format,
        options.scan,
    ))
}

fn parse(args: &[String]) -> Result<Cli, String> {
    let mut options = Cli {
        inputs: Vec::new(),
        stdin: false,
        strict: false,
        values_only: false,
        scan: ScanOptions::default(),
        walk: WalkOptions::default(),
    };

    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        // Strict parsing, never a silent default: a typo'd `--dedup`
        // that quietly did nothing would produce a report the caller
        // believed was deduplicated.
        if arg.starts_with('-') && !FLAGS.contains(&arg.as_str()) {
            return Err(format!("{arg} is not an option. Try --help."));
        }

        match arg.as_str() {
            "--dedupe" => options.scan.dedupe = true,
            "--values" => options.values_only = true,
            "--multiline" => options.scan.extract.multiline = true,
            "--stdin" => options.stdin = true,
            "--strict" => options.strict = true,
            "--hidden" => options.walk.hidden = true,
            "--no-ignore" => options.walk.respect_ignore = false,
            "--csv-header" => options.scan.extract.csv_has_header = true,
            "--csv-column" => {
                let value = rest
                    .next()
                    .ok_or_else(|| "--csv-column needs a column number".to_string())?;
                options.scan.extract.csv_column = Some(
                    value
                        .parse()
                        .map_err(|_| format!("{value} is not a column number"))?,
                );
            }
            // An unknown format falls back rather than failing, which is
            // the extension's behaviour and the reason this tool can be
            // pointed at a repository nobody has described to it. The
            // flag still takes a value, so a missing one is a refusal.
            "--format" => {
                let value = rest
                    .next()
                    .ok_or_else(|| "--format needs a format".to_string())?;
                options.scan.format = Some(resolve_format(Some(value), None));
            }
            path => options.inputs.push(PathBuf::from(path)),
        }
    }

    if options.stdin && !options.inputs.is_empty() {
        return Err("reading from stdin takes no file arguments".to_string());
    }
    if !options.stdin && options.inputs.is_empty() {
        return Err("name a file or a directory to read. Try --help.".to_string());
    }
    Ok(options)
}

/// The human half. Every line restates something already on stdout.
fn summarise(reports: &[FileReport], values_only: bool) {
    let mut stderr = std::io::stderr().lock();
    let mut strings = 0;
    let mut unlocated = 0;

    for report in reports {
        for diagnostic in &report.diagnostics {
            let _ = writeln!(stderr, "{}: {}", report.file, diagnostic.message);
        }
        // With --values the values are already on stdout; repeating them
        // here would double every line a reviewer is piping.
        if !values_only {
            for found in &report.strings {
                let _ = writeln!(stderr, "{}", scan::describe(report, found));
            }
        }
        strings += report.summary.strings;
        unlocated += report.summary.unlocated;
    }

    let _ = writeln!(
        stderr,
        "{} in {}",
        plural(strings, "string", "strings"),
        plural(reports.len(), "file", "files")
    );
    if unlocated > 0 {
        // Said plainly: a reader treating this report as a complete
        // index of where each string lives needs to know how much of it
        // is not an index.
        let _ = writeln!(
            stderr,
            "{} could not be located in the source",
            plural(unlocated, "value", "values")
        );
    }
}

fn plural(count: usize, one: &str, many: &str) -> String {
    format!("{count} {}", if count == 1 { one } else { many })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extract::SUPPORTED_FORMATS;

    #[test]
    fn every_documented_flag_is_parsed_and_the_reverse() {
        let mut documented: Vec<&str> = USAGE
            .split_whitespace()
            .filter(|word| word.starts_with("--"))
            .map(|word| word.trim_end_matches([',', '.', ':', ';']))
            .filter(|word| !matches!(*word, "--version" | "--help"))
            .collect();
        documented.sort_unstable();
        documented.dedup();

        let mut implemented = FLAGS.to_vec();
        implemented.sort_unstable();
        assert_eq!(documented, implemented);
    }

    #[test]
    fn the_parser_accepts_every_flag_it_lists() {
        for flag in FLAGS {
            let args: Vec<String> = match flag {
                "--format" => vec![flag.into(), "json".into(), "x".into()],
                "--csv-column" => vec![flag.into(), "1".into(), "x".into()],
                "--stdin" => vec![flag.into()],
                _ => vec![flag.into(), "x".into()],
            };
            assert!(parse(&args).is_ok(), "{flag}");
        }
    }

    /// Off unless asked for, so the default answer is the extension's
    /// answer.
    #[test]
    fn multiline_is_off_by_default() {
        assert!(
            !parse(&["x".into()])
                .expect("options")
                .scan
                .extract
                .multiline
        );
        assert!(
            parse(&["--multiline".into(), "x".into()])
                .expect("options")
                .scan
                .extract
                .multiline
        );
    }

    #[test]
    fn an_unknown_flag_is_refused_rather_than_ignored() {
        let error = parse(&["--dedup".into(), "x".into()]).expect_err("a refusal");
        assert!(error.contains("--dedup"), "{error}");
    }

    /// The one place this crate is deliberately lenient, and it is the
    /// extension's leniency: a format nobody recognises is the fallback
    /// extractor, not a refusal.
    #[test]
    fn an_unknown_format_falls_back_rather_than_being_refused() {
        let options = parse(&["--format".into(), "klingon".into(), "x".into()]).expect("accepted");
        assert_eq!(options.scan.format, Some(crate::extract::FALLBACK_FORMAT));
    }

    #[test]
    fn every_offered_format_is_accepted_by_name() {
        for format in SUPPORTED_FORMATS {
            let options = parse(&["--format".into(), format.into(), "x".into()]).expect(format);
            assert_eq!(options.scan.format, Some(format));
        }
    }

    #[test]
    fn a_format_flag_with_no_value_is_refused() {
        assert!(parse(&["--format".into()]).is_err());
        assert!(parse(&["--csv-column".into()]).is_err());
    }

    #[test]
    fn a_column_that_is_not_a_number_is_refused_by_name() {
        let error =
            parse(&["--csv-column".into(), "second".into(), "x".into()]).expect_err("a refusal");
        assert!(error.contains("second"), "{error}");
    }

    /// There is no verdict, so there is no flag that would produce one.
    /// If this ever needs changing, the tool has grown an opinion about
    /// which strings matter.
    #[test]
    fn no_flag_asks_for_a_judgment() {
        for attempt in [
            "--user-facing",
            "--spellcheck",
            "--min-length",
            "--lang",
            "--fix",
        ] {
            assert!(
                parse(&[attempt.into(), "x".into()]).is_err(),
                "{attempt} was accepted"
            );
        }
        for word in ["spell", "translat", "banned", "score"] {
            assert!(!USAGE.contains(word), "the usage text offers {word}");
        }
    }

    #[test]
    fn naming_nothing_is_refused() {
        assert!(parse(&[]).is_err());
    }

    #[test]
    fn stdin_and_file_arguments_together_are_refused() {
        assert!(parse(&["--stdin".into(), "x".into()]).is_err());
    }

    #[test]
    fn the_usage_text_states_greps_convention() {
        assert!(USAGE.contains("grep"));
        for code in ["0", "1", "2"] {
            assert!(USAGE.contains(code), "exit code {code} is undocumented");
        }
    }
}
