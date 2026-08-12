// A comment mentioning "the docs" is prose, not a literal.

/// Every raw string form, each one value.
fn messages() -> Vec<&'static str> {
    let raw = r#"a raw "quoted" string"#;
    let hashed = r##"holds a "# sequence"##;
    let plain = r"C:\Users\test";
    let bytes = b"payload";
    let escaped = "say \"hi\"";
    let spanning = "first
second";
    let marker = '"';
    let empty = "";
    vec![raw, hashed, plain, bytes, escaped, spanning, empty]
}
