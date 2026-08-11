//! Quoted runs, for every format this does not parse.
//!
//! **This is the extractor that does the audit.** A `.ts`, `.py`, `.go`
//! or `.java` file is not a format with a parser here, so it lands
//! exactly here — and the quoted strings in a source file are the
//! user-facing copy a reviewer came looking for.
//!
//! It is deliberately naive: it takes what is between quotes and does
//! not resolve escapes, because that is what the extension does. A
//! backslash in the source survives into the value.

use std::sync::LazyLock;

use regex::Regex;

/// The extension's `QUOTED_STRING_REGEX`, ported rather than re-derived.
///
/// JavaScript spells it as a backreference to the opening quote with a
/// lookahead that lets an escaped character count as one unit —
/// `regex` has neither, so the
/// three quote styles are written out as three alternatives, each with
/// its own "escaped anything, or one non-quote character" body.
///
/// **Newlines are excluded on purpose.** JavaScript's `.` does not match
/// one without the `s` flag, so a quoted run there cannot span lines and
/// a multi-line template literal is simply missed. Rust's character
/// classes match newlines happily, so leaving them in found a value the
/// extension never reports — the corpus caught it on the first run.
static QUOTED: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#""(?:\\[^\r\n]|[^"\\\r\n])*"|'(?:\\[^\r\n]|[^'\\\r\n])*'|`(?:\\[^\r\n]|[^`\\\r\n])*`"#,
    )
    .expect("a constant pattern compiles")
});

pub(crate) fn extract(text: &str) -> Vec<String> {
    QUOTED
        .find_iter(text)
        .map(|found| {
            let matched = found.as_str();
            matched[1..matched.len() - 1].trim()
        })
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_three_quote_styles_are_read() {
        assert_eq!(
            extract("a = \"double\"; b = 'single'; c = `backtick`;"),
            ["double", "single", "backtick"]
        );
    }

    #[test]
    fn the_quotes_themselves_are_not_part_of_the_value() {
        assert_eq!(extract("'hello'"), ["hello"]);
    }

    #[test]
    fn empty_and_whitespace_only_runs_are_dropped() {
        assert_eq!(extract("a=''; b='  '; c='kept'"), ["kept"]);
    }

    /// The naivety is the ported behaviour: an escape is matched as one
    /// unit so the run does not end early, but it is left in the value.
    #[test]
    fn an_escaped_quote_does_not_end_the_run_and_is_not_resolved() {
        assert_eq!(extract(r"'It\'s fine'"), [r"It\'s fine"]);
        assert_eq!(extract(r#""say \"hi\"""#), [r#"say \"hi\""#]);
    }

    /// Unquoted prose is not a string here. A reviewer pointing this at
    /// a README gets nothing, which is the honest answer.
    #[test]
    fn unquoted_text_yields_nothing() {
        assert!(extract("just some words with no quotes").is_empty());
    }

    /// Ported behaviour, not an oversight: JavaScript's `.` stops at a
    /// newline, so a run that spans lines is not a run. A multi-line
    /// template literal is missed by both frontends.
    #[test]
    fn a_run_cannot_span_lines() {
        assert!(extract("`first\nsecond`").is_empty());
    }

    #[test]
    fn quotes_of_another_style_inside_a_run_are_kept() {
        assert_eq!(extract(r#""it's here""#), ["it's here"]);
    }

    /// A comment is text like any other. Filtering by syntactic role
    /// would be this crate deciding which strings matter.
    #[test]
    fn a_quoted_run_inside_a_comment_is_still_a_run() {
        assert_eq!(extract("// see \"the docs\""), ["the docs"]);
    }
}
