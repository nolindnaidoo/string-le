//! TOML, read with `toml` where the extension reads with `@iarna/toml`.
//!
//! `preserve_order` is not optional. Without it a table iterates
//! alphabetically and extraction stops following the document, which
//! would break the one thing this tool's output contract is: values in
//! the order they appear.

use toml::Value as Toml;

use super::collect::{Value, collect};

pub(crate) fn extract(text: &str) -> Vec<String> {
    let Ok(parsed) = text.parse::<toml::Table>() else {
        return Vec::new();
    };
    collect(&Value::Map(parsed.values().map(convert).collect()))
}

fn convert(value: &Toml) -> Value {
    match value {
        Toml::String(text) => Value::Str(text.clone()),
        Toml::Array(items) => Value::Seq(items.iter().map(convert).collect()),
        Toml::Table(entries) => Value::Map(entries.values().map(convert).collect()),
        // A TOML date is a typed value, not text. The extension drops it
        // because `@iarna/toml` hands back a Date, and this drops it for
        // the same reason.
        Toml::Integer(_) | Toml::Float(_) | Toml::Boolean(_) | Toml::Datetime(_) => Value::Other,
    }
}

pub(crate) fn parse_error(text: &str) -> Option<String> {
    text.parse::<toml::Table>()
        .err()
        .map(|error| format!("Invalid TOML: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_and_literal_strings_are_both_values() {
        assert_eq!(
            extract("a = \"basic\"\nb = 'literal'"),
            ["basic", "literal"]
        );
    }

    #[test]
    fn keys_are_never_extracted() {
        assert_eq!(extract("title = \"value\""), ["value"]);
    }

    #[test]
    fn typed_values_are_dropped() {
        assert_eq!(
            extract("n = 1\nf = 1.5\nb = true\nd = 2026-01-01\ns = \"kept\""),
            ["kept"]
        );
    }

    #[test]
    fn arrays_and_tables_are_followed() {
        let document = "tags = [\"alpha\", \"beta\"]\n\n[owner]\nname = \"Tom\"\n";
        assert_eq!(extract(document), ["alpha", "beta", "Tom"]);
    }

    /// A multi-line basic string is one value with real newlines in it,
    /// which is also why it cannot be located in the source.
    #[test]
    fn a_multiline_string_is_one_value() {
        assert_eq!(
            extract("a = \"\"\"\nfirst\nsecond\n\"\"\""),
            ["first\nsecond"]
        );
    }

    #[test]
    fn a_hash_inside_a_string_is_not_a_comment() {
        assert_eq!(extract("a = \"value with # hash\""), ["value with # hash"]);
    }

    #[test]
    fn a_broken_document_yields_nothing_and_says_why() {
        assert!(extract("not = = toml").is_empty());
        assert!(parse_error("not = = toml").is_some());
        assert!(parse_error("a = \"b\"").is_none());
    }
}
