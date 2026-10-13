//! How deeply a document nests, counted before it is parsed.
//!
//! The parsers behind the JSON, TOML and YAML readers each have their own
//! depth limit, and the two frontends' limits differ: the extension's
//! `JSON.parse` and `@iarna/toml` read thousands of levels and its
//! collector then stopped at depth 1,000 without a word, so a deep
//! document answered `ok` with nothing there and a refusal here. The
//! bound is applied to the text before either parser sees it, so both
//! frontends refuse the same documents with the same words.
//!
//! It counts brackets and braces outside quoted strings, where a quoted
//! string is `"…"` with backslash escapes or `'…'` without. A comment
//! holding a thousand unmatched brackets is counted too, which refuses a
//! document nobody writes rather than missing one somebody does. The
//! extension's `nesting.ts` is the same scanner in TypeScript.
//!
//! The bound is per format, set at the weakest parser behind it on either
//! side, so a document at the bound reads on both and one past it is
//! refused by both. Measured by driving both built servers: this crate's
//! JSON parser gives up past 512 levels, its TOML parser past 80, and the
//! extension's `js-yaml` past 98 levels of flow nesting; the other three
//! parse further and would read a document their twin refuses. YAML nested
//! by indentation alone has no bracket to count and keeps each parser's own
//! limit.

/// Deeper than this is refused, per format.
pub(crate) const MAX_NESTING_JSON: usize = 512;
pub(crate) const MAX_NESTING_TOML: usize = 80;
pub(crate) const MAX_NESTING_YAML: usize = 98;

pub(crate) fn depth(content: &str) -> usize {
    let mut depth = 0usize;
    let mut deepest = 0usize;
    let mut quote: Option<char> = None;
    let mut chars = content.chars();
    while let Some(c) = chars.next() {
        if let Some(open) = quote {
            if c == '\\' && open == '"' {
                chars.next();
                continue;
            }
            if c == open {
                quote = None;
            }
            continue;
        }
        match c {
            '"' | '\'' => quote = Some(c),
            '[' | '{' => {
                depth += 1;
                deepest = deepest.max(depth);
            }
            ']' | '}' => depth = depth.saturating_sub(1),
            _ => {}
        }
    }
    deepest
}

/// The refusal for a document past the bound, in the words both frontends use.
pub(crate) fn too_deep(format: &str, bound: usize) -> String {
    format!("Invalid {format}: nested deeper than {bound} levels")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_the_deepest_run_of_open_brackets_and_braces() {
        assert_eq!(depth(""), 0);
        assert_eq!(depth("{\"a\": [1, {\"b\": 2}]}"), 3);
        assert_eq!(depth("[[[]]][[]]"), 3);
    }

    #[test]
    fn does_not_count_a_bracket_inside_a_quoted_string() {
        assert_eq!(depth("{\"a\": \"[[[[[\"}"), 1);
        assert_eq!(depth("a = '{{{'"), 0);
        assert_eq!(depth("{\"a\": \"\\\"[[\"}"), 1);
    }

    #[test]
    fn never_goes_below_zero_on_a_stray_closer() {
        assert_eq!(depth("}}}{"), 1);
    }

    #[test]
    fn names_each_formats_bound_in_the_refusal() {
        assert_eq!(
            too_deep("JSON", MAX_NESTING_JSON),
            "Invalid JSON: nested deeper than 512 levels"
        );
        assert_eq!(
            too_deep("TOML", MAX_NESTING_TOML),
            "Invalid TOML: nested deeper than 80 levels"
        );
        assert_eq!(
            too_deep("YAML", MAX_NESTING_YAML),
            "Invalid YAML: nested deeper than 98 levels"
        );
    }
}
