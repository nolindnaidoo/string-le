//! Finding where each extracted value came from.
//!
//! One mechanism for all seven formats: a **forward cursor** over the
//! source, matching each value in turn from where the previous one
//! ended. Extraction already yields values in document order, so the
//! cursor never has to choose between two occurrences of the same
//! string — the first `"readable"` takes the first occurrence and the
//! second takes the second.
//!
//! This is outside parity scope. The extension returns values and no
//! positions, so there is nothing here for it to disagree with; see
//! SPEC.md, "Positions — the addition".

use super::Found;
use super::position::PositionIndex;

/// Pair each value with where it was found, in order.
///
/// **A value that cannot be located gets no position, and the cursor
/// does not move.** That keeps one unlocatable value from dragging the
/// rest of the document out of alignment, and it is a real outcome
/// rather than an error: a parser resolves escapes and folds scalars, so
/// `"a\nb"` in JSON, a YAML block scalar and a CSV cell holding an
/// escaped quote are all correct values that never appear literally in
/// the source. A nearby guess would be worse than nothing.
///
/// The search is forward-only. Falling back to a scan from the start
/// would answer with a position *earlier* than a value already reported
/// above it, which reads as a tool that cannot count.
pub(crate) fn locate(text: &str, values: Vec<String>) -> Vec<Found> {
    let index = PositionIndex::new(text);
    let mut cursor = 0;

    values
        .into_iter()
        .map(|value| {
            let position = text
                .get(cursor..)
                .and_then(|rest| rest.find(&value))
                .map(|offset| {
                    let start = cursor + offset;
                    cursor = start + value.len();
                    index.at(start)
                });
            Found { value, position }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn values(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| (*item).to_string()).collect()
    }

    #[test]
    fn a_value_is_found_where_it_appears() {
        let found = locate("key = \"hello\"\n", values(&["hello"]));
        let position = found[0].position.expect("a position");
        assert_eq!((position.line, position.column), (1, 8));
    }

    /// The reason the cursor exists. Two identical values must land on
    /// their own occurrences, not both on the first.
    #[test]
    fn repeated_values_take_successive_occurrences() {
        let text = "a: same\nb: other\nc: same\n";
        let found = locate(text, values(&["same", "other", "same"]));
        let lines: Vec<usize> = found
            .iter()
            .map(|item| item.position.expect("a position").line)
            .collect();
        assert_eq!(lines, [1, 2, 3]);
    }

    /// A value the parser produced but the source never spells: JSON
    /// resolved `\n` into a real newline, so the two-line string is not
    /// in the document anywhere.
    #[test]
    fn a_value_the_source_does_not_spell_gets_no_position() {
        let found = locate(r#"{"a":"first\nsecond"}"#, values(&["first\nsecond"]));
        assert_eq!(found[0].value, "first\nsecond");
        assert!(found[0].position.is_none());
    }

    /// One value that cannot be located must not cost the next one its
    /// position.
    #[test]
    fn a_miss_does_not_move_the_cursor() {
        let text = "one\nthree\n";
        let found = locate(text, values(&["one", "two", "three"]));
        assert_eq!(found[0].position.expect("a position").line, 1);
        assert!(found[1].position.is_none());
        assert_eq!(found[2].position.expect("a position").line, 2);
    }

    /// Forward-only. A value appearing earlier than the cursor is
    /// reported as unlocated rather than as a position above one already
    /// given.
    #[test]
    fn the_search_never_goes_backwards() {
        let text = "early\nlate\n";
        let found = locate(text, values(&["late", "early"]));
        assert_eq!(found[0].position.expect("a position").line, 2);
        assert!(found[1].position.is_none());
    }

    /// Columns are UTF-16 units, so a value after a two-byte character
    /// reports where an editor puts it.
    #[test]
    fn a_column_after_a_multibyte_character_is_counted_in_utf16() {
        let found = locate("café = \"x\"\n", values(&["x"]));
        assert_eq!(found[0].position.expect("a position").column, 9);
    }

    #[test]
    fn nothing_to_locate_is_nothing_returned() {
        assert!(locate("anything", Vec::new()).is_empty());
    }

    /// A value can sit at the very start.
    #[test]
    fn an_offset_of_zero_is_a_position_like_any_other() {
        let found = locate("hello world", values(&["hello"]));
        let position = found[0].position.expect("a position");
        assert_eq!((position.line, position.column), (1, 1));
    }
}
