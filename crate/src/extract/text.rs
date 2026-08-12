//! One trim rule, shared by every extractor here.
//!
//! The extension trims with JavaScript's `String.prototype.trim`, and
//! **that is not `str::trim`**. JavaScript's whitespace is `WhiteSpace ∪
//! LineTerminator`, which carries U+FEFF — the byte-order mark, which
//! the language calls ZWNBSP — and does not carry U+0085, the next-line
//! control. Unicode's `White_Space` property, which `str::trim` uses, is
//! the other way round on both.
//!
//! Two characters is the whole difference, and it was enough to make the
//! shared `extract_strings` tool answer two ways: a value with a BOM at
//! either end came back trimmed from one server and untrimmed from the
//! other. A generated document found it; no hand-written case ever would
//! have, because nobody writes a BOM in the middle of a file on purpose.
//!
//! A BOM at the *start of a document* is a separate rule and stays where
//! it is, in `scan::without_bom`: it is stripped before anything reads
//! the text, so the columns this crate reports match the editor the
//! extension runs in.

/// Whether JavaScript's `trim` would remove this character.
///
/// Expressed as the difference from Unicode's `White_Space` rather than
/// as a list, because the difference is the point and a list would rot
/// silently the next time either standard moves.
pub(crate) fn is_whitespace(character: char) -> bool {
    (character.is_whitespace() && character != '\u{85}') || character == '\u{feff}'
}

pub(crate) fn trim(text: &str) -> &str {
    text.trim_matches(is_whitespace)
}

pub(crate) fn trim_start(text: &str) -> &str {
    text.trim_start_matches(is_whitespace)
}

pub(crate) fn trim_end(text: &str) -> &str {
    text.trim_end_matches(is_whitespace)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The two characters the two standards disagree about, and the
    /// reason this module exists rather than a call to `str::trim`.
    #[test]
    fn the_byte_order_mark_is_whitespace_and_the_next_line_control_is_not() {
        assert_eq!(trim("\u{feff}value\u{feff}"), "value");
        assert!(
            "\u{feff}value\u{feff}".trim() != "value",
            "str::trim keeps it, which is the divergence"
        );
        assert_eq!(trim("\u{85}value\u{85}"), "\u{85}value\u{85}");
        assert!(
            "\u{85}value\u{85}".trim() == "value",
            "str::trim removes it, which is the other half"
        );
    }

    /// Everything both standards agree on still goes.
    #[test]
    fn ordinary_whitespace_is_trimmed_from_either_end() {
        assert_eq!(trim("  value\t\n"), "value");
        assert_eq!(trim_start("  value  "), "value  ");
        assert_eq!(trim_end("  value  "), "  value");
        assert_eq!(trim("\u{a0}\u{2028}value\u{3000}"), "value");
    }

    #[test]
    fn a_value_of_nothing_but_whitespace_trims_to_nothing() {
        assert!(trim("\u{feff} \t ").is_empty());
        assert!(trim("").is_empty());
    }

    #[test]
    fn nothing_inside_a_value_is_touched() {
        assert_eq!(trim("a\u{feff}b"), "a\u{feff}b");
        assert_eq!(trim(" a  b "), "a  b");
    }
}
