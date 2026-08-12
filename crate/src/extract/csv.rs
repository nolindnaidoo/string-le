//! CSV, read with `csv` where the extension reads with `csv-parse`.
//!
//! The options are matched one for one, because they decide what a cell
//! *is*: no header row of its own (the header is data unless the caller
//! says otherwise), flexible record length, relaxed quoting, and cells
//! trimmed. Getting any of those wrong changes the values, not just the
//! shape.

use super::Options;

pub(crate) fn extract(text: &str, options: Options) -> Vec<String> {
    let Ok(rows) = rows(text) else {
        return Vec::new();
    };
    let start = usize::from(options.csv_has_header);

    rows.iter()
        .skip(start)
        .flat_map(|row| match options.csv_column {
            // A row shorter than the chosen column contributes nothing,
            // rather than shifting to whatever cell is last.
            Some(column) => row.get(column).map_or_else(Vec::new, |cell| vec![cell]),
            None => row.iter().collect(),
        })
        .map(|cell| super::text::trim(cell))
        .filter(|cell| !cell.is_empty())
        .map(str::to_string)
        .collect()
}

/// Remove the whitespace around a quoted field, before parsing.
///
/// csv-parse trims a cell and *then* decides whether it is quoted; the
/// `csv` crate decides first and trims after, so ` "b, c"` was never a
/// quoted field here and `a, "b, c"` came apart into three cells where
/// the extension reads two. `a, "b, c"` is ordinary hand-written CSV,
/// so this is the common case rather than a curiosity.
///
/// Only whitespace at a field boundary moves. Anything inside a quoted
/// field is content and is left exactly as written.
///
/// This is also where an unterminated quote is caught. csv-parse treats
/// one as a parse failure and the `csv` crate takes the rest of the file
/// as the field's content, so `a,"unterminated` yielded nothing there
/// and two values here.
fn trim_around_quotes(text: &str) -> Result<String, String> {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    let mut at_field_start = true;

    while let Some(character) = chars.next() {
        if at_field_start && (character == ' ' || character == '\t') {
            // Hold the run: it is only droppable if a quote follows.
            let mut held = String::from(character);
            while let Some(&next) = chars.peek() {
                if next == ' ' || next == '\t' {
                    held.push(next);
                    chars.next();
                } else {
                    break;
                }
            }
            if chars.peek() != Some(&'"') {
                out.push_str(&held);
            }
            at_field_start = false;
            continue;
        }

        if character == '"' && at_field_start {
            out.push('"');
            at_field_start = false;
            // Copy the quoted field verbatim, `""` included, then drop
            // any whitespace between its close and the next delimiter.
            let mut closed = false;
            while let Some(inner) = chars.next() {
                out.push(inner);
                if inner == '"' {
                    if chars.peek() == Some(&'"') {
                        out.push(chars.next().expect("peeked"));
                        continue;
                    }
                    while matches!(chars.peek(), Some(' ' | '\t')) {
                        chars.next();
                    }
                    closed = true;
                    break;
                }
            }
            if !closed {
                return Err("Invalid CSV: quoted field is never closed".to_string());
            }
            continue;
        }

        out.push(character);
        at_field_start = matches!(character, ',' | '\n' | '\r');
    }
    Ok(out)
}

fn rows(text: &str) -> Result<Vec<Vec<String>>, String> {
    let text = trim_around_quotes(text)?;
    csv::ReaderBuilder::new()
        // csv-parse's `columns: false`: every record is cells, and the
        // first row is not special until a caller says it is.
        .has_headers(false)
        // `relax_column_count`: a ragged row is data, not a failure.
        .flexible(true)
        .from_reader(text.as_bytes())
        .records()
        .map(|record| {
            record
                .map(|row| row.iter().map(str::to_string).collect())
                .map_err(|error| format!("Invalid CSV: {error}"))
        })
        .collect()
}

/// Why the document could not be read as CSV.
///
/// `rows` already names the format in every error it returns, so this
/// adds nothing: prefixing again produced `Invalid CSV: Invalid CSV: …`
/// on the one message a reader ever sees.
pub(crate) fn parse_error(text: &str) -> Option<String> {
    rows(text).err()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plain() -> Options {
        Options::default()
    }

    #[test]
    fn every_cell_is_a_value() {
        assert_eq!(extract("a,b\nc,d", plain()), ["a", "b", "c", "d"]);
    }

    /// The header is data until the caller says it is a header. That is
    /// the extension's default and it is the safer one: silently
    /// dropping the first row of a headerless file loses real values.
    #[test]
    fn the_first_row_is_data_by_default() {
        let with = Options {
            csv_has_header: true,
            ..plain()
        };
        assert_eq!(extract("name,city\nAda,London", plain()).len(), 4);
        assert_eq!(extract("name,city\nAda,London", with), ["Ada", "London"]);
    }

    #[test]
    fn a_chosen_column_is_the_only_one_read() {
        let options = Options {
            csv_has_header: true,
            csv_column: Some(1),
            ..plain()
        };
        assert_eq!(extract("a,b\n1,2\n3,4", options), ["2", "4"]);
    }

    #[test]
    fn a_row_too_short_for_the_chosen_column_contributes_nothing() {
        let options = Options {
            csv_column: Some(2),
            ..plain()
        };
        assert_eq!(extract("a,b,c\nd,e", options), ["c"]);
    }

    #[test]
    fn empty_cells_are_dropped() {
        assert_eq!(extract("a,,b", plain()), ["a", "b"]);
    }

    #[test]
    fn cells_are_trimmed() {
        assert_eq!(extract("  padded  ,b", plain()), ["padded", "b"]);
    }

    /// A numeric-looking cell is text: CSV has no types.
    #[test]
    fn numeric_cells_are_strings() {
        assert_eq!(extract("1,2.5", plain()), ["1", "2.5"]);
    }

    #[test]
    fn a_quoted_cell_may_contain_the_delimiter() {
        assert_eq!(extract("\"a,b\",c", plain()), ["a,b", "c"]);
    }

    /// An escaped quote is resolved by the parser, so the value is not
    /// the source spelling — which is why it cannot be located.
    #[test]
    fn an_escaped_quote_is_resolved() {
        assert_eq!(extract("\"say \"\"hi\"\"\"", plain()), [r#"say "hi""#]);
    }

    /// csv-parse trims a cell and then decides whether it is quoted;
    /// the `csv` crate decides first. Without the pre-pass `a, "b, c"`
    /// came apart into three cells here and stayed two there, and
    /// hand-written CSV is full of that space.
    #[test]
    fn whitespace_before_a_quoted_field_does_not_break_it() {
        assert_eq!(extract("a, \"b, c\"", plain()), ["a", "b, c"]);
        assert_eq!(extract(" \"x\"\"y\" ,c", plain()), ["x\"y", "c"]);
        assert_eq!(extract("a,\" spaced \"", plain()), ["a", "spaced"]);
    }

    /// Whitespace inside a quoted field is content, not padding.
    #[test]
    fn whitespace_inside_a_quoted_field_survives_the_pre_pass() {
        assert_eq!(extract("\"a  b\",c", plain()), ["a  b", "c"]);
        assert_eq!(extract("\"multi\nline\",b", plain()), ["multi\nline", "b"]);
    }

    /// The extension's parser fails here and reports it; the `csv` crate
    /// takes the rest of the file as the field, which is two values
    /// where there should be none.
    #[test]
    fn an_unterminated_quote_is_a_parse_failure() {
        assert!(extract("a,\"unterminated", plain()).is_empty());
        let message = parse_error("a,\"unterminated").expect("a reason");
        assert!(message.starts_with("Invalid CSV: "), "{message}");
        assert!(
            !message.starts_with("Invalid CSV: Invalid CSV: "),
            "the format is named once: {message}"
        );
    }

    #[test]
    fn ragged_rows_are_data_not_failure() {
        assert_eq!(extract("a,b,c\nd", plain()), ["a", "b", "c", "d"]);
        assert!(parse_error("a,b,c\nd").is_none());
    }
}
