//! INI, read with `rust-ini` where the extension reads with `ini`.
//!
//! Like `.env`, every value is text: `port = 8080` yields the string
//! `8080`. Bare keys — a line with no `=` — parse to a flag rather than
//! a value and are not extracted, matching the extension.
//!
//! **Escape processing is off.** rust-ini reads `\` as an escape
//! character by default and the npm `ini` package does not, so
//! `path = C:\Users\test` came out as `C:Users\test` here and
//! `C:\Users\test` there. A Windows path in a config file is the
//! ordinary case, not a curiosity, and the corpus caught it on the
//! first run.

use super::collect::{Value, collect};

/// rust-ini's defaults, minus the escape handling the extension's
/// parser does not do.
fn options() -> ini::ParseOption {
    ini::ParseOption {
        enabled_escape: false,
        ..ini::ParseOption::default()
    }
}

/// Drop the lines the npm `ini` package tolerates and rust-ini rejects.
///
/// A bare key — a word alone on a line, with no `=` or `:` — parses to a
/// flag there and is not a value; here it is a hard parse error, which
/// took the whole file down with it. A config holding
/// `name = kept` and a stray `barekey` yielded `["kept"]` in the
/// extension and nothing at all here, and a stray word in a config file
/// is an ordinary thing rather than a curiosity.
///
/// Only unindented lines are dropped. An indented line with no separator
/// is a continuation of the value above it, which both parsers read that
/// way and which dropping would corrupt.
fn without_bare_keys(text: &str) -> String {
    text.lines()
        .filter(|line| {
            let trimmed = line.trim();
            trimmed.is_empty()
                || line.starts_with(char::is_whitespace)
                || trimmed.starts_with(';')
                || trimmed.starts_with('#')
                || trimmed.starts_with('[')
                || trimmed.contains('=')
                || trimmed.contains(':')
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub(crate) fn extract(text: &str) -> Vec<String> {
    let Ok(parsed) = ini::Ini::load_from_str_opt(&without_bare_keys(text), options()) else {
        return Vec::new();
    };
    let mut values = Vec::new();
    for (_, properties) in &parsed {
        for (_, value) in properties {
            values.push(Value::Str(value.to_string()));
        }
    }
    collect(&Value::Seq(values))
}

pub(crate) fn parse_error(text: &str) -> Option<String> {
    ini::Ini::load_from_str_opt(&without_bare_keys(text), options())
        .err()
        .map(|error| format!("Invalid INI: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn values_are_extracted_and_keys_are_not() {
        assert_eq!(extract("[s]\nname = John Doe"), ["John Doe"]);
    }

    #[test]
    fn quoted_and_unquoted_values_both_read() {
        assert_eq!(
            extract("[s]\na = \"quoted\"\nb = plain text"),
            ["quoted", "plain text"]
        );
    }

    #[test]
    fn comment_lines_are_skipped() {
        assert_eq!(
            extract("[s]\n; c = commented\n# d = also\na = kept"),
            ["kept"]
        );
    }

    /// The documented exception: untyped formats keep numeric-looking
    /// values.
    #[test]
    fn a_numeric_looking_value_is_a_string_here() {
        assert_eq!(extract("[s]\nport = 8080"), ["8080"]);
    }

    #[test]
    fn sections_are_walked_in_order() {
        assert_eq!(
            extract("[one]\na = first\n\n[two]\nb = second"),
            ["first", "second"]
        );
    }

    /// The regression the corpus caught: a backslash is a character,
    /// not an escape, because that is how the extension's parser reads
    /// one.
    #[test]
    fn a_backslash_is_kept_verbatim() {
        assert_eq!(
            extract(
                r"[s]
path = C:\Users\test"
            ),
            [r"C:\Users\test"]
        );
    }

    /// The divergence a bare key caused: rust-ini rejects the file and
    /// the npm parser shrugs, so every value in it was lost here and
    /// kept there.
    #[test]
    fn a_bare_key_does_not_take_the_file_down_with_it() {
        assert_eq!(extract("[a]\nname = kept\nbarekey"), ["kept"]);
        assert_eq!(extract("[a]\nbarekey\nname = kept"), ["kept"]);
    }

    /// An indented line with no separator continues the value above it.
    /// Dropping it as a bare key would corrupt that value.
    #[test]
    fn an_indented_continuation_is_not_a_bare_key() {
        assert_eq!(
            extract("[a]\nmulti = one\n  two\nname = kept"),
            ["one", "kept"]
        );
        assert_eq!(extract("[a]\n  indented = v"), ["v"]);
    }

    #[test]
    fn a_document_that_cannot_parse_yields_nothing_and_says_why() {
        assert!(extract("[unclosed").is_empty());
        assert!(parse_error("[unclosed").is_some());
        assert!(parse_error("[a]\nb = c").is_none());
    }

    #[test]
    fn an_empty_value_is_dropped() {
        assert!(extract("[s]\nempty =").is_empty());
    }
}
