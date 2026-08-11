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

pub(crate) fn extract(text: &str) -> Vec<String> {
    let Ok(parsed) = ini::Ini::load_from_str_opt(text, options()) else {
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
    ini::Ini::load_from_str_opt(text, options())
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

    #[test]
    fn an_empty_value_is_dropped() {
        assert!(extract("[s]\nempty =").is_empty());
    }
}
