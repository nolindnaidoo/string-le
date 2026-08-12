//! `.env`, line by line — the one format the extension parses by hand,
//! ported the same way.
//!
//! Every value here is text: there is no type system in a `.env` file,
//! so `PORT=8080` yields the string `8080`. That is the documented
//! exception to "non-string primitives are dropped", and it is why an
//! `.env` and a JSON holding the same-looking data produce different
//! results on purpose.

pub(crate) fn extract(text: &str) -> Vec<String> {
    text.lines().filter_map(value_of).collect()
}

fn value_of(raw_line: &str) -> Option<String> {
    let line = super::text::trim(raw_line);
    if line.is_empty() || line.starts_with('#') {
        return None;
    }

    let content = line.strip_prefix("export ").map_or(line, super::text::trim);
    let (_, raw_value) = content.split_once('=')?;
    let raw_value = super::text::trim(raw_value);
    if raw_value.is_empty() {
        return None;
    }

    let value = unquote(strip_inline_comment(raw_value));
    (!value.is_empty()).then(|| value.to_string())
}

/// A `#` inside a quoted value is part of the value, not a comment —
/// which is the whole reason quoting exists in these files.
fn strip_inline_comment(value: &str) -> &str {
    if value.starts_with('"') || value.starts_with('\'') {
        return value;
    }
    match value.split_once('#') {
        Some((before, _)) => super::text::trim(before),
        None => value,
    }
}

fn unquote(value: &str) -> &str {
    for quote in ['"', '\''] {
        if value.len() > 1 && value.starts_with(quote) && value.ends_with(quote) {
            return &value[1..value.len() - 1];
        }
    }
    value
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plain_assignment_yields_its_value() {
        assert_eq!(extract("NAME=value"), ["value"]);
    }

    #[test]
    fn keys_are_never_extracted() {
        assert_eq!(extract("SECRET_KEY=abc"), ["abc"]);
    }

    #[test]
    fn comments_and_blank_lines_are_skipped() {
        assert_eq!(extract("# a comment\n\nA=one\n   \nB=two"), ["one", "two"]);
    }

    #[test]
    fn an_export_prefix_is_removed() {
        assert_eq!(extract("export NAME=value"), ["value"]);
    }

    #[test]
    fn quotes_are_removed() {
        assert_eq!(extract("A=\"double\"\nB='single'"), ["double", "single"]);
    }

    /// The asymmetry worth keeping: a hash ends an unquoted value and is
    /// part of a quoted one.
    #[test]
    fn an_inline_comment_ends_an_unquoted_value_only() {
        assert_eq!(extract("A=value # trailing"), ["value"]);
        assert_eq!(extract("B=\"value # kept\""), ["value # kept"]);
    }

    #[test]
    fn a_line_without_an_equals_is_not_an_assignment() {
        assert!(extract("JUST_A_WORD").is_empty());
    }

    #[test]
    fn an_empty_value_is_dropped() {
        assert!(extract("EMPTY=").is_empty());
        assert!(extract("SPACES=   ").is_empty());
    }

    /// The documented exception: untyped formats keep numeric-looking
    /// values, because in a `.env` file that is all there is.
    #[test]
    fn a_numeric_looking_value_is_a_string_here() {
        assert_eq!(extract("PORT=8080"), ["8080"]);
    }

    /// Only the first `=` splits; a value may contain more.
    #[test]
    fn a_value_may_contain_an_equals_sign() {
        assert_eq!(extract("TOKEN=a=b=c"), ["a=b=c"]);
    }

    #[test]
    fn carriage_returns_do_not_end_up_in_values() {
        assert_eq!(extract("A=value\r\nB=other\r\n"), ["value", "other"]);
    }
}
