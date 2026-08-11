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
        .map(|cell| cell.trim())
        .filter(|cell| !cell.is_empty())
        .map(str::to_string)
        .collect()
}

fn rows(text: &str) -> Result<Vec<Vec<String>>, csv::Error> {
    csv::ReaderBuilder::new()
        // csv-parse's `columns: false`: every record is cells, and the
        // first row is not special until a caller says it is.
        .has_headers(false)
        // `relax_column_count`: a ragged row is data, not a failure.
        .flexible(true)
        .from_reader(text.as_bytes())
        .records()
        .map(|record| record.map(|row| row.iter().map(str::to_string).collect()))
        .collect()
}

pub(crate) fn parse_error(text: &str) -> Option<String> {
    rows(text)
        .err()
        .map(|error| format!("Invalid CSV: {error}"))
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

    #[test]
    fn ragged_rows_are_data_not_failure() {
        assert_eq!(extract("a,b,c\nd", plain()), ["a", "b", "c", "d"]);
        assert!(parse_error("a,b,c\nd").is_none());
    }
}
