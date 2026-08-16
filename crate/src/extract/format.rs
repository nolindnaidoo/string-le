//! Which extractor reads a document.
//!
//! **An unresolved format is not an error.** Every other crate in this
//! family refuses a name it does not recognise; this one falls through
//! to quoted-string extraction, because that is what the extension does
//! and because it is the case that matters most. A `.ts` file is not a
//! format this parses, and its quoted strings are exactly the
//! user-facing copy a reviewer came for.

/// Every name a caller might send, mapped to the extractor key it means.
/// Ported from the extension's `ALIASES` rather than re-derived: two
/// frontends disagreeing about whether `conf` is INI is two frontends
/// reading the same file differently.
///
/// The source languages carry both the VS Code language id and the file
/// extension, because one frontend dispatches on the id it is handed and
/// the other on the name of a file it walked. A language read here and
/// not there would be the same tool answering two ways.
const ALIASES: [(&str, &str); 41] = [
    ("json", "json"),
    ("jsonc", "jsonc"),
    ("yaml", "yaml"),
    ("yml", "yaml"),
    ("csv", "csv"),
    ("tsv", "tsv"),
    ("toml", "toml"),
    ("ini", "ini"),
    ("env", "env"),
    ("dotenv", "env"),
    ("python", "python"),
    ("py", "python"),
    ("rust", "rust"),
    ("rs", "rust"),
    ("go", "go"),
    ("shellscript", "shellscript"),
    ("sh", "shellscript"),
    ("bash", "shellscript"),
    ("zsh", "shellscript"),
    ("php", "php"),
    ("ruby", "ruby"),
    ("rb", "ruby"),
    ("perl", "perl"),
    ("pl", "perl"),
    ("pm", "perl"),
    ("csharp", "csharp"),
    ("cs", "csharp"),
    ("javascript", "javascript"),
    ("javascriptreact", "javascript"),
    ("js", "javascript"),
    ("jsx", "javascript"),
    ("mjs", "javascript"),
    ("cjs", "javascript"),
    ("typescript", "typescript"),
    ("typescriptreact", "typescript"),
    ("ts", "typescript"),
    ("tsx", "typescript"),
    ("mts", "typescript"),
    ("cts", "typescript"),
    // Prose has no literals. Naming it is a way of asking for the
    // quoted runs a fenced code block and a backtick span leave behind,
    // which is what it has always got.
    ("markdown", "fallback"),
    ("md", "fallback"),
];

/// The formats a caller can name, for the tool schema's enum. Held equal
/// to the alias table by a test, so a format can never be offered and
/// then not resolve.
///
/// `fallback` is nameable on purpose: now that a `.py` file is read as
/// Python, asking for the quoted runs instead has to be something a
/// caller can say.
pub(crate) const SUPPORTED_FORMATS: [&str; 19] = [
    "json",
    "jsonc",
    "yaml",
    "csv",
    "tsv",
    "toml",
    "ini",
    "env",
    "python",
    "rust",
    "go",
    "shellscript",
    "php",
    "ruby",
    "perl",
    "csharp",
    "javascript",
    "typescript",
    "fallback",
];

/// What the engine uses when it recognises nothing.
pub(crate) const FALLBACK_FORMAT: &str = "fallback";

fn normalise(value: &str) -> String {
    super::text::trim(value)
        .to_lowercase()
        .trim_start_matches('.')
        .to_string()
}

/// The extractor key for an already-canonical format name, or
/// `fallback`. Used on the hot path, where the caller has resolved once.
pub(crate) fn canonical(format: &str) -> &'static str {
    ALIASES
        .iter()
        .find(|(alias, _)| *alias == format)
        .map_or(FALLBACK_FORMAT, |(_, key)| *key)
}

/// Resolve an extractor key from an explicit format, else from a
/// filename, else `fallback`.
///
/// A caller who knows nothing about a document still gets its strings —
/// which is the difference between a tool a reviewer can point at a
/// repository and one they have to describe it to first.
pub(crate) fn resolve_format(format: Option<&str>, filename: Option<&str>) -> &'static str {
    if let Some(name) = format {
        let direct = canonical(&normalise(name));
        if direct != FALLBACK_FORMAT {
            return direct;
        }
    }

    let Some(filename) = filename else {
        return FALLBACK_FORMAT;
    };

    // A dotfile like `.env` has no extension to split on; its whole name
    // is the type.
    let whole = canonical(&normalise(filename));
    if whole != FALLBACK_FORMAT {
        return whole;
    }

    // **A dotenv file is `.env` and everything after it.** Splitting on
    // the last dot asks `local` for a format and gets nothing, so
    // `.env.local` fell to the quoted-run scan — which finds only what
    // is quoted, so an unquoted `NAME=plain` vanished while the `.env`
    // beside it read both values.
    if is_dotenv(&super::text::trim(filename).to_lowercase()) {
        return canonical("env");
    }

    filename
        .rsplit_once('.')
        .map_or(FALLBACK_FORMAT, |(_, extension)| {
            canonical(&normalise(extension))
        })
}

/// Whether a filename names a dotenv file.
///
/// `.env` and any suffix of it — `.env.local`, `.env.production`,
/// `.env.test.local` — plus the `<name>.env` spelling.
///
/// **The leading dot is the signal**, so this takes the name before
/// `normalise` strips it. Without it `env.ts` — an ordinary TypeScript
/// file — would read as dotenv, which is the worse mistake: it silences
/// a real source file rather than adding noise to a config. `.envrc` is
/// direnv's shell script and is likewise not a dotenv file.
fn is_dotenv(name: &str) -> bool {
    name == ".env"
        || name.starts_with(".env.")
        || name == "env"
        || name
            .strip_suffix(".env")
            .is_some_and(|stem| !stem.is_empty())
}

#[cfg(test)]
mod dotenv_tests {
    use super::resolve_format;

    /// Not only a miss: the quoted-run fallback finds only what is
    /// quoted, so an unquoted value disappeared from a `.env.local`
    /// while the `.env` beside it reported it.
    #[test]
    fn every_dotenv_spelling_resolves() {
        for name in [
            ".env",
            ".env.local",
            ".env.production",
            ".env.test.local",
            "app.env",
            "env",
        ] {
            assert_eq!(resolve_format(None, Some(name)), "env", "{name}");
        }
    }

    /// The exclusions matter more than the inclusions: reading a source
    /// file as dotenv would silence it.
    #[test]
    fn a_name_that_merely_starts_with_env_is_not_dotenv() {
        for name in [".envrc", "environment.json", "env.ts", "sender.env.rs"] {
            assert_ne!(resolve_format(None, Some(name)), "env", "{name}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_offered_format_resolves_to_itself() {
        for format in SUPPORTED_FORMATS {
            assert_eq!(resolve_format(Some(format), None), format, "{format}");
        }
    }

    #[test]
    fn the_extensions_aliases_are_honoured() {
        for (alias, expected) in [
            ("jsonc", "jsonc"),
            ("yml", "yaml"),
            ("tsv", "tsv"),
            ("dotenv", "env"),
            ("py", "python"),
            ("rs", "rust"),
            ("bash", "shellscript"),
            ("rb", "ruby"),
            ("cs", "csharp"),
            ("javascriptreact", "javascript"),
            ("tsx", "typescript"),
            ("md", "fallback"),
        ] {
            assert_eq!(resolve_format(Some(alias), None), expected, "{alias}");
        }
    }

    /// A source file is now read as its own language rather than through
    /// the quoted-run lens, and the filename is enough to say which.
    #[test]
    fn a_source_file_resolves_to_its_language() {
        for (filename, expected) in [
            ("main.rs", "rust"),
            ("app.py", "python"),
            ("server.go", "go"),
            ("deploy.sh", "shellscript"),
            ("Widget.cs", "csharp"),
            ("index.tsx", "typescript"),
            ("README.md", "fallback"),
        ] {
            assert_eq!(resolve_format(None, Some(filename)), expected, "{filename}");
        }
    }

    #[test]
    fn a_name_is_normalised_before_it_is_matched() {
        assert_eq!(resolve_format(Some("  JSON "), None), "json");
        assert_eq!(resolve_format(Some(".toml"), None), "toml");
    }

    #[test]
    fn a_filename_supplies_the_format_when_none_is_named() {
        assert_eq!(resolve_format(None, Some("config.toml")), "toml");
        assert_eq!(resolve_format(None, Some("data.CSV")), "csv");
    }

    /// A dotfile is its own extension.
    #[test]
    fn a_dotfile_resolves_by_its_whole_name() {
        assert_eq!(resolve_format(None, Some(".env")), "env");
        assert_eq!(resolve_format(None, Some("env")), "env");
    }

    /// The property the audit story rests on. Not a refusal, not an
    /// empty result — the quoted-string extractor, which is the one that
    /// reads a source file.
    #[test]
    fn anything_unrecognised_falls_back() {
        for name in ["klingon", "", "wat"] {
            assert_eq!(resolve_format(Some(name), None), FALLBACK_FORMAT, "{name}");
        }
        assert_eq!(resolve_format(None, Some("notes.rtf")), FALLBACK_FORMAT);
        assert_eq!(resolve_format(None, Some("Makefile")), FALLBACK_FORMAT);
        assert_eq!(resolve_format(None, None), FALLBACK_FORMAT);
    }

    /// An explicit format that resolves to nothing still lets the
    /// filename answer, rather than the bad name poisoning the lookup.
    #[test]
    fn an_unresolved_format_defers_to_the_filename() {
        assert_eq!(resolve_format(Some("nonsense"), Some("a.toml")), "toml");
    }

    #[test]
    fn the_offered_list_matches_the_alias_table() {
        for format in SUPPORTED_FORMATS {
            assert!(
                ALIASES.iter().any(|(_, key)| *key == format),
                "{format} is offered but no alias produces it"
            );
        }
        for (_, key) in ALIASES {
            assert!(
                SUPPORTED_FORMATS.contains(&key),
                "{key} is produced but not offered"
            );
        }
    }
}
