//! String literals, in the language that wrote them.
//!
//! The quoted-run fallback reads every source file through a
//! JavaScript-shaped lens, and on real code that lens is wrong rather
//! than merely coarse: a Python docstring is missed, a Rust
//! `r#"a raw "quoted" string"#` comes back as the two fragments
//! `a raw` and `string`, a Go backtick string and a shell heredoc are
//! not there at all. This module reads each language's own literal
//! syntax instead.
//!
//! **It does not decide what counts as a string.** Every literal it
//! finds is handed to `collect`, the same rule the parsed formats use —
//! trimmed, empty ones dropped, duplicates kept.
//!
//! Three things it deliberately keeps from the fallback:
//!
//! - **Escapes are not resolved.** A backslash in the source survives
//!   into the value, as it does for every other extractor here, which is
//!   also what lets a value be found again in the source and given a
//!   position.
//! - **A comment is text like any other.** Its quoted runs are read with
//!   the fallback pattern, so language awareness buys correct literals
//!   without quietly deciding that a string in a comment does not count.
//! - **No judgment.** Nothing here asks whether a string looks
//!   user-facing.
//!
//! What it does not keep is `--multiline`. A Python triple-quoted
//! string, a Go raw string, a JavaScript template literal and a heredoc
//! span lines because their language says they do, so they are read that
//! way with no flag. The flag stays what it was: an opt-in for the
//! *fallback*, where spanning lines really is a divergence.

use super::collect::{self, Value};
use super::fallback;

/// The languages with a literal syntax of their own worth reading.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Language {
    Python,
    Rust,
    Go,
    Shell,
    Php,
    Ruby,
    Perl,
    CSharp,
    JavaScript,
}

/// Which language an extractor key means, or `None` for a key this
/// module does not read.
///
/// TypeScript and JavaScript share a lexer here; they stay separate
/// keys so a report says which one the caller named.
pub(crate) fn language(format: &str) -> Option<Language> {
    match format {
        "python" => Some(Language::Python),
        "rust" => Some(Language::Rust),
        "go" => Some(Language::Go),
        "shellscript" => Some(Language::Shell),
        "php" => Some(Language::Php),
        "ruby" => Some(Language::Ruby),
        "perl" => Some(Language::Perl),
        "csharp" => Some(Language::CSharp),
        "javascript" | "typescript" => Some(Language::JavaScript),
        _ => None,
    }
}

/// Every string literal, in document order.
pub(crate) fn extract(text: &str, language: Language) -> Vec<String> {
    // Indexing by character rather than by byte: every delimiter here is
    // ASCII, and a scanner that can never land inside a multi-byte
    // character is one fewer thing to get right in nine languages.
    let chars: Vec<char> = text.chars().collect();
    let mut scanner = Scanner {
        chars: &chars,
        at: 0,
        language,
        values: Vec::new(),
        heredocs: Vec::new(),
        unclosed: std::collections::HashSet::new(),
        closable: None,
    };
    scanner.run();
    collect::collect(&Value::Seq(scanner.values))
}

/// How a run reaches its closing delimiter.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Escapes {
    /// `\` takes the next character with it, whatever it is.
    Backslash,
    /// The C# verbatim rule: `""` is a quote, not the end.
    Doubled,
    /// Nothing escapes — a Go or Rust raw string, a shell `'…'`.
    None,
}

struct Taken {
    value: String,
    /// Index just past the closing delimiter.
    end: usize,
}

/// A heredoc whose introducer has been read and whose body starts after
/// the current line.
struct Pending {
    tag: String,
    /// Whether the closing tag may be indented — `<<-`, `<<~`, and PHP,
    /// which allows it since 7.3.
    indented: bool,
}

struct Scanner<'a> {
    chars: &'a [char],
    at: usize,
    language: Language,
    values: Vec<Value>,
    heredocs: Vec<Pending>,
    /// Every `(tag, indented)` already searched for and not found.
    unclosed: std::collections::HashSet<(String, bool)>,
    /// Every tag any line in this document could possibly close, built
    /// once on the first heredoc. `None` until then.
    closable: Option<std::collections::HashSet<String>>,
}

impl Scanner<'_> {
    fn run(&mut self) {
        while self.at < self.chars.len() {
            if self.chars[self.at] == '\n' && !self.heredocs.is_empty() {
                self.take_heredoc_bodies();
                continue;
            }
            if self.take_comment()
                || self.take_string()
                || self.take_character()
                || self.take_heredoc_marker()
            {
                continue;
            }
            self.at += 1;
        }
    }

    // ---- the four things that can start here ----------------------

    fn take_comment(&mut self) -> bool {
        let Some(end) = self.comment_end() else {
            return false;
        };
        let body: String = self.chars[self.at..end].iter().collect();
        let runs: Vec<Value> = fallback::runs(&body, false)
            .into_iter()
            .map(|run| Value::Str(run.to_string()))
            .collect();
        self.values.extend(runs);
        self.at = end;
        true
    }

    fn take_string(&mut self) -> bool {
        let Some(taken) = self.string_at() else {
            return false;
        };
        self.values.push(Value::Str(taken.value));
        self.at = taken.end;
        true
    }

    /// A character literal is a character, not a string.
    ///
    /// It is skipped rather than ignored because `'"'` is ordinary Rust,
    /// Go and C#, and a scanner that walked past it would read the quote
    /// inside as opening a string and swallow the rest of the file.
    fn take_character(&mut self) -> bool {
        if !matches!(
            self.language,
            Language::Rust | Language::Go | Language::CSharp
        ) {
            return false;
        }
        if self.chars.get(self.at) != Some(&'\'') {
            return false;
        }
        let Some(end) = self.character_end() else {
            return false;
        };
        self.at = end;
        true
    }

    fn take_heredoc_marker(&mut self) -> bool {
        let Some((pending, end)) = self.heredoc_marker() else {
            return false;
        };
        self.heredocs.push(pending);
        self.at = end;
        true
    }

    // ---- strings, per language ------------------------------------

    fn string_at(&self) -> Option<Taken> {
        match self.language {
            Language::Python => self.python_string(),
            Language::Rust => self.rust_string(),
            Language::Go => self.go_string(),
            Language::Shell => self.shell_string(),
            Language::Php | Language::Ruby | Language::Perl => self.scripting_string(),
            Language::CSharp => self.csharp_string(),
            Language::JavaScript => self.javascript_string(),
        }
    }

    /// Triple-quoted strings, and the `r`/`b`/`u`/`f` prefixes in any
    /// order or case.
    ///
    /// The triple-quoted form is the whole reason this language is here:
    /// it is where a docstring lives, it spans lines, and the fallback
    /// sees only an empty `""` pair on each side of it.
    fn python_string(&self) -> Option<Taken> {
        const PREFIXES: [char; 8] = ['r', 'R', 'b', 'B', 'u', 'U', 'f', 'F'];
        let start = self.at;
        let mut at = start;
        while at < start + 2 && self.chars.get(at).is_some_and(|c| PREFIXES.contains(c)) {
            at += 1;
        }
        let quote = *self.chars.get(at)?;
        if quote != '"' && quote != '\'' {
            return None;
        }
        if at > start && self.preceded_by_identifier(start) {
            return None;
        }
        let triple = [quote, quote, quote];
        if self.matches_at(at, &triple) {
            return self.delimited(at + 3, &triple, Escapes::Backslash, true);
        }
        // A backslash escapes the closing quote even under `r`: Python's
        // own lexer says `r"\""` is a string and `r"\"` is an error.
        self.delimited(at + 1, &[quote], Escapes::Backslash, false)
    }

    /// Raw strings with any number of hashes, and the `b`/`c` prefixes.
    ///
    /// `r#"a raw "quoted" string"#` is one value with its inner quotes
    /// intact, which is the regression this module was written for.
    fn rust_string(&self) -> Option<Taken> {
        let start = self.at;
        let mut at = start;
        if matches!(self.chars.get(at), Some('b' | 'c')) {
            at += 1;
        }
        let raw = self.chars.get(at) == Some(&'r');
        let mut hashes = 0;
        if raw {
            at += 1;
            while self.chars.get(at) == Some(&'#') {
                hashes += 1;
                at += 1;
            }
        }
        if self.chars.get(at) != Some(&'"') {
            return None;
        }
        if at > start && self.preceded_by_identifier(start) {
            return None;
        }
        if !raw {
            // Rust string literals may contain a real newline.
            return self.delimited(at + 1, &['"'], Escapes::Backslash, true);
        }
        let mut terminator = vec!['"'];
        terminator.resize(hashes + 1, '#');
        self.delimited(at + 1, &terminator, Escapes::None, true)
    }

    fn go_string(&self) -> Option<Taken> {
        match self.chars.get(self.at)? {
            '"' => self.delimited(self.at + 1, &['"'], Escapes::Backslash, false),
            // The raw string: no escapes, and it spans lines because Go
            // says it does.
            '`' => self.delimited(self.at + 1, &['`'], Escapes::None, true),
            _ => None,
        }
    }

    fn shell_string(&self) -> Option<Taken> {
        match self.chars.get(self.at)? {
            '"' => self.delimited(self.at + 1, &['"'], Escapes::Backslash, true),
            // Inside `'…'` a backslash is a backslash, and the run runs
            // until the next quote however many lines away that is.
            '\'' => self.delimited(self.at + 1, &['\''], Escapes::None, true),
            _ => None,
        }
    }

    /// PHP, Ruby and Perl agree: both quote styles escape with `\` and
    /// both may span lines.
    fn scripting_string(&self) -> Option<Taken> {
        match self.chars.get(self.at)? {
            quote @ ('"' | '\'') => {
                self.delimited(self.at + 1, &[*quote], Escapes::Backslash, true)
            }
            _ => None,
        }
    }

    /// Verbatim `@"…"`, interpolated `$"…"`, and both together.
    ///
    /// In a verbatim string `""` is one quote, so `@"He said ""hi"""` is
    /// one value rather than the three fragments the fallback reports.
    fn csharp_string(&self) -> Option<Taken> {
        let start = self.at;
        let mut at = start;
        let mut verbatim = false;
        for _ in 0..2 {
            match self.chars.get(at) {
                Some('@') => {
                    verbatim = true;
                    at += 1;
                }
                Some('$') => at += 1,
                _ => break,
            }
        }
        if self.chars.get(at) != Some(&'"') {
            return None;
        }
        if verbatim {
            return self.delimited(at + 1, &['"'], Escapes::Doubled, true);
        }
        self.delimited(at + 1, &['"'], Escapes::Backslash, false)
    }

    fn javascript_string(&self) -> Option<Taken> {
        match self.chars.get(self.at)? {
            quote @ ('"' | '\'') => {
                self.delimited(self.at + 1, &[*quote], Escapes::Backslash, false)
            }
            '`' => self.template(),
            _ => None,
        }
    }

    /// A template literal, read as one value.
    ///
    /// The fallback ends a run at the first backtick, so
    /// `` `a ${x ? `b` : `c`} d` `` becomes three fragments and a
    /// template spanning lines is missed entirely. Interpolation is part
    /// of the value: `${count}` is what the source says, and resolving
    /// it is not something a reader of a static file can be given
    /// honestly.
    fn template(&self) -> Option<Taken> {
        /// Deep enough for any real source, shallow enough that a
        /// pathological file cannot make this walk forever.
        const MAX_NESTING: usize = 64;

        let from = self.at + 1;
        let mut at = from;
        // One entry per open template, holding the brace depth of its
        // interpolation. Zero means the scan is in template text.
        let mut open = vec![0usize];
        while at < self.chars.len() {
            let &depth = open.last()?;
            let last = open.len() - 1;
            let current = self.chars[at];
            at = match current {
                '\\' => at + 2,
                '`' if depth == 0 && open.len() == 1 => {
                    return Some(Taken {
                        value: self.chars[from..at].iter().collect(),
                        end: at + 1,
                    });
                }
                '`' if depth == 0 => {
                    open.pop();
                    at + 1
                }
                '`' if open.len() >= MAX_NESTING => return None,
                '`' => {
                    open.push(0);
                    at + 1
                }
                '$' if depth == 0 && self.chars.get(at + 1) == Some(&'{') => {
                    open[last] = 1;
                    at + 2
                }
                '{' if depth > 0 => {
                    open[last] = depth + 1;
                    at + 1
                }
                '}' if depth > 0 => {
                    open[last] = depth - 1;
                    at + 1
                }
                '"' | '\'' if depth > 0 => self
                    .delimited(at + 1, &[current], Escapes::Backslash, false)
                    .map_or(at + 1, |taken| taken.end),
                _ => at + 1,
            };
        }
        None
    }

    /// The shared body of every quoted run.
    ///
    /// An unterminated run is **not** a string: returning `None` costs
    /// one apostrophe its value, where guessing an end would cost the
    /// rest of the file its meaning.
    fn delimited(
        &self,
        from: usize,
        terminator: &[char],
        escapes: Escapes,
        newlines: bool,
    ) -> Option<Taken> {
        let mut at = from;
        while at < self.chars.len() {
            let current = self.chars[at];
            if escapes == Escapes::Backslash && current == '\\' {
                at += 2;
                continue;
            }
            if !newlines && current == '\n' {
                return None;
            }
            if !self.matches_at(at, terminator) {
                at += 1;
                continue;
            }
            if escapes == Escapes::Doubled && self.matches_at(at + terminator.len(), terminator) {
                at += terminator.len() * 2;
                continue;
            }
            return Some(Taken {
                value: self.chars[from..at].iter().collect(),
                end: at + terminator.len(),
            });
        }
        None
    }

    /// Where a character literal ends, or `None` for a Rust lifetime.
    ///
    /// The window is what tells the two apart: `'a'` and `'\u{1F600}'`
    /// close within a few characters, `'static` never does.
    fn character_end(&self) -> Option<usize> {
        const LONGEST: usize = 14;
        let mut at = self.at + 1;
        let limit = (self.at + LONGEST).min(self.chars.len());
        while at < limit {
            match self.chars[at] {
                '\\' => at += 2,
                '\n' => return None,
                '\'' => return Some(at + 1),
                _ => at += 1,
            }
        }
        None
    }

    // ---- comments -------------------------------------------------

    fn comment_end(&self) -> Option<usize> {
        match self.language {
            Language::Python => self.hash_comment(true),
            Language::Shell => self.hash_comment(false),
            Language::Ruby => self.ruby_comment(),
            Language::Perl => self.perl_comment(),
            Language::Php => self
                .slash_comment(false)
                .or_else(|| self.hash_comment(true)),
            Language::Rust => self.slash_comment(true),
            Language::Go | Language::CSharp | Language::JavaScript => self.slash_comment(false),
        }
    }

    /// `anywhere` is false for shell, where `#` only opens a comment at
    /// the start of a word — `file#1` is a file name.
    fn hash_comment(&self, anywhere: bool) -> Option<usize> {
        if self.chars.get(self.at) != Some(&'#') {
            return None;
        }
        if !anywhere && !self.at_word_start() {
            return None;
        }
        Some(self.line_end(self.at))
    }

    fn ruby_comment(&self) -> Option<usize> {
        if let Some(end) = self.line_block("=begin", "=end") {
            return Some(end);
        }
        self.hash_comment(true)
    }

    fn perl_comment(&self) -> Option<usize> {
        if let Some(end) = self.pod_block() {
            return Some(end);
        }
        // `$#array` is the last index of an array, not a comment.
        if self
            .at
            .checked_sub(1)
            .and_then(|index| self.chars.get(index))
            .is_some_and(|c| matches!(c, '$' | '@' | '%'))
        {
            return None;
        }
        self.hash_comment(true)
    }

    fn slash_comment(&self, nested: bool) -> Option<usize> {
        if self.matches_at(self.at, &['/', '/']) {
            return Some(self.line_end(self.at));
        }
        if !self.matches_at(self.at, &['/', '*']) {
            return None;
        }
        Some(self.block_comment_end(nested))
    }

    /// An unterminated block comment runs to the end of the file, which
    /// is what a compiler would say too.
    fn block_comment_end(&self, nested: bool) -> usize {
        let mut at = self.at + 2;
        let mut depth = 1usize;
        while at < self.chars.len() {
            if nested && self.matches_at(at, &['/', '*']) {
                depth += 1;
                at += 2;
                continue;
            }
            if !self.matches_at(at, &['*', '/']) {
                at += 1;
                continue;
            }
            depth -= 1;
            at += 2;
            if depth == 0 {
                return at;
            }
        }
        self.chars.len()
    }

    /// Ruby's `=begin` … `=end`, both at the start of a line.
    fn line_block(&self, opener: &str, closer: &str) -> Option<usize> {
        if !self.at_line_start() || !self.starts_with(self.at, opener) {
            return None;
        }
        let mut at = self.line_end(self.at) + 1;
        while at < self.chars.len() {
            if self.starts_with(at, closer) {
                return Some(self.line_end(at));
            }
            at = self.line_end(at) + 1;
        }
        Some(self.chars.len())
    }

    /// Perl documentation: a line opening with `=` and a letter, through
    /// the line opening with `=cut`.
    fn pod_block(&self) -> Option<usize> {
        if !self.at_line_start() || self.chars.get(self.at) != Some(&'=') {
            return None;
        }
        if !self
            .chars
            .get(self.at + 1)
            .is_some_and(char::is_ascii_alphabetic)
        {
            return None;
        }
        let mut at = self.line_end(self.at) + 1;
        while at < self.chars.len() {
            if self.starts_with(at, "=cut") {
                return Some(self.line_end(at));
            }
            at = self.line_end(at) + 1;
        }
        Some(self.chars.len())
    }

    // ---- heredocs -------------------------------------------------

    fn heredoc_marker(&self) -> Option<(Pending, usize)> {
        match self.language {
            Language::Shell => self.shell_heredoc(),
            Language::Php => self.php_heredoc(),
            Language::Ruby | Language::Perl => self.script_heredoc(),
            _ => None,
        }
    }

    fn shell_heredoc(&self) -> Option<(Pending, usize)> {
        if !self.matches_at(self.at, &['<', '<']) {
            return None;
        }
        let mut at = self.at + 2;
        let indented = self.chars.get(at) == Some(&'-');
        if indented {
            at += 1;
        }
        while self.chars.get(at) == Some(&' ') {
            at += 1;
        }
        let (tag, end) = self.heredoc_tag(at)?;
        Some((Pending { tag, indented }, end))
    }

    fn php_heredoc(&self) -> Option<(Pending, usize)> {
        if !self.matches_at(self.at, &['<', '<', '<']) {
            return None;
        }
        let mut at = self.at + 3;
        while self.chars.get(at) == Some(&' ') {
            at += 1;
        }
        let (tag, end) = self.heredoc_tag(at)?;
        Some((
            Pending {
                tag,
                indented: true,
            },
            end,
        ))
    }

    fn script_heredoc(&self) -> Option<(Pending, usize)> {
        if !self.matches_at(self.at, &['<', '<']) {
            return None;
        }
        let mut at = self.at + 2;
        let squiggly = matches!(self.chars.get(at), Some('~' | '-'));
        if squiggly {
            at += 1;
        }
        let quoted = matches!(self.chars.get(at), Some('\'' | '"'));
        let (tag, end) = self.heredoc_tag(at)?;
        // `queue << item` is a left shift. A bare tag is only read as a
        // heredoc when it is spelled the way heredoc tags are spelled.
        if !squiggly && !quoted && !tag.starts_with(|c: char| c.is_uppercase() || c == '_') {
            return None;
        }
        Some((
            Pending {
                tag,
                indented: true,
            },
            end,
        ))
    }

    fn heredoc_tag(&self, at: usize) -> Option<(String, usize)> {
        let quote = match self.chars.get(at) {
            Some(&found @ ('\'' | '"')) => Some(found),
            _ => None,
        };
        let start = at + usize::from(quote.is_some());
        if !self
            .chars
            .get(start)
            .is_some_and(|c| c.is_alphabetic() || *c == '_')
        {
            return None;
        }
        let mut end = start;
        while self
            .chars
            .get(end)
            .is_some_and(|c| c.is_alphanumeric() || *c == '_')
        {
            end += 1;
        }
        let tag: String = self.chars[start..end].iter().collect();
        let Some(quote) = quote else {
            return Some((tag, end));
        };
        if self.chars.get(end) != Some(&quote) {
            return None;
        }
        Some((tag, end + 1))
    }

    /// The bodies of every heredoc introduced on the line just ended.
    ///
    /// A body whose closing tag never arrives is not a heredoc at all —
    /// the same refusal `delimited` makes, and for the same reason.
    ///
    /// **The first one that never closes ends the batch.** A shell
    /// reading `diff <<A <<B` gives the rest of the file to `A` when
    /// `A`'s tag never arrives, so `B` has no body to read; carrying on
    /// to `B` invented one, and made a line carrying a thousand tags
    /// scan the whole file a thousand times.
    fn take_heredoc_bodies(&mut self) {
        self.at += 1;
        let pending = std::mem::take(&mut self.heredocs);
        for heredoc in &pending {
            let Some((body, end)) = self.heredoc_body(heredoc) else {
                return;
            };
            self.values.push(Value::Str(body));
            self.at = end;
        }
    }

    /// A tag that was searched for and not found, so the same search is
    /// never run twice.
    ///
    /// `self.at` only ever moves forward, so a tag missing from
    /// `self.at..` is missing from every later suffix too. Without this,
    /// a file repeating one never-closing tag re-read the rest of itself
    /// on every occurrence.
    fn heredoc_body(&mut self, heredoc: &Pending) -> Option<(String, usize)> {
        // A tag no line in the whole document could ever close is
        // answered without reading the document. One pass to build the
        // set replaces one pass per tag, which is the difference between
        // linear and quadratic on a file full of `<<` that never closes.
        if !self.closable().contains(&heredoc.tag) {
            return None;
        }
        // Keyed by the indent rule as well as the tag: `<<EOF` and
        // `<<-EOF` look for different lines, so one failing says nothing
        // about the other.
        let key = (heredoc.tag.clone(), heredoc.indented);
        if self.unclosed.contains(&key) {
            return None;
        }
        let mut line = self.at;
        while line <= self.chars.len() {
            let end = self.line_end(line);
            if self.terminates(line, end, heredoc) {
                return Some((
                    self.chars[self.at..line].iter().collect(),
                    (end + 1).min(self.chars.len()),
                ));
            }
            line = end + 1;
        }
        self.unclosed.insert(key);
        None
    }

    /// Every tag some line in this document could close, built once.
    ///
    /// A **superset**, and that is what makes it safe to consult: a tag
    /// missing from it cannot satisfy `terminates` on any line, so the
    /// forward search can be skipped outright; a tag present still gets
    /// the full search. A heredoc tag is alphanumerics and `_`, so a
    /// candidate carrying leading whitespace can never be one — which is
    /// why a single trimmed key covers both indent rules.
    fn closable(&mut self) -> &std::collections::HashSet<String> {
        if self.closable.is_none() {
            let built = self.candidate_tags();
            self.closable = Some(built);
        }
        self.closable.as_ref().expect("just built")
    }

    fn candidate_tags(&self) -> std::collections::HashSet<String> {
        let mut tags = std::collections::HashSet::new();
        let mut line = 0;
        while line <= self.chars.len() {
            let end = self.line_end(line);
            let text: String = self
                .chars
                .get(line..end)
                .unwrap_or_default()
                .iter()
                .collect();
            tags.insert(self.candidate_tag(&text));
            line = end + 1;
        }
        tags
    }

    /// The one tag a line could close.
    fn candidate_tag(&self, line: &str) -> String {
        if self.language != Language::Php {
            return super::text::trim(line).to_string();
        }
        // PHP closes with `EOT;` or `EOT,` as often as with `EOT`, so
        // the tag is the identifier the line opens with.
        super::text::trim_start(line)
            .chars()
            .take_while(|c| c.is_alphanumeric() || *c == '_')
            .collect()
    }

    fn terminates(&self, start: usize, end: usize, heredoc: &Pending) -> bool {
        let line: String = self
            .chars
            .get(start..end)
            .unwrap_or_default()
            .iter()
            .collect();
        let line = line.trim_end_matches('\r');
        let candidate = if heredoc.indented {
            super::text::trim_start(line)
        } else {
            line
        };
        if self.language == Language::Php {
            // PHP closes with `EOT;` or `EOT,` as often as with `EOT`.
            let Some(rest) = candidate.strip_prefix(&heredoc.tag) else {
                return false;
            };
            return rest
                .chars()
                .next()
                .is_none_or(|c| !c.is_alphanumeric() && c != '_');
        }
        super::text::trim_end(candidate) == heredoc.tag
    }

    // ---- reading the text ------------------------------------------

    fn matches_at(&self, at: usize, needle: &[char]) -> bool {
        self.chars.get(at..at + needle.len()) == Some(needle)
    }

    fn starts_with(&self, at: usize, text: &str) -> bool {
        text.chars()
            .enumerate()
            .all(|(offset, expected)| self.chars.get(at + offset) == Some(&expected))
    }

    fn line_end(&self, from: usize) -> usize {
        self.chars
            .get(from..)
            .and_then(|rest| rest.iter().position(|c| *c == '\n'))
            .map_or(self.chars.len(), |offset| from + offset)
    }

    fn at_line_start(&self) -> bool {
        self.at == 0 || self.chars.get(self.at - 1) == Some(&'\n')
    }

    fn at_word_start(&self) -> bool {
        let Some(index) = self.at.checked_sub(1) else {
            return true;
        };
        self.chars.get(index).is_some_and(|c| {
            super::text::is_whitespace(*c) || matches!(c, ';' | '&' | '|' | '(' | ')')
        })
    }

    fn preceded_by_identifier(&self, at: usize) -> bool {
        at.checked_sub(1)
            .and_then(|index| self.chars.get(index))
            .is_some_and(|c| c.is_alphanumeric() || *c == '_')
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(text: &str, language: Language) -> Vec<String> {
        extract(text, language)
    }

    #[test]
    fn every_source_key_resolves_and_nothing_else_does() {
        for key in [
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
        ] {
            assert!(language(key).is_some(), "{key}");
        }
        for key in ["json", "fallback", "markdown", ""] {
            assert!(language(key).is_none(), "{key}");
        }
    }

    // ---- Python ---------------------------------------------------

    /// The regression. A docstring is one string, and the fallback sees
    /// only an empty `""` pair on either side of it.
    #[test]
    fn a_python_docstring_is_one_string() {
        let source =
            "def greet():\n    \"\"\"Greet a user.\n\n    Politely.\n    \"\"\"\n    return 1\n";
        assert_eq!(
            read(source, Language::Python),
            ["Greet a user.\n\n    Politely."]
        );
    }

    #[test]
    fn python_reads_both_triple_quote_styles() {
        assert_eq!(read("x = '''a\nb'''", Language::Python), ["a\nb"]);
        assert_eq!(read("x = \"\"\"a\nb\"\"\"", Language::Python), ["a\nb"]);
    }

    #[test]
    fn python_prefixes_are_part_of_the_syntax_not_the_value() {
        assert_eq!(
            read(
                "a = f\"Hi {name}\"\nb = r\"\\d+\"\nc = b\"bytes\"\nd = rb'both'",
                Language::Python
            ),
            ["Hi {name}", "\\d+", "bytes", "both"]
        );
    }

    /// A prefix letter is only a prefix when it stands alone.
    #[test]
    fn an_identifier_ending_in_a_prefix_letter_is_not_a_prefix() {
        assert_eq!(read("myf\"x\"", Language::Python), ["x"]);
        assert_eq!(read("for x in 'items':", Language::Python), ["items"]);
    }

    #[test]
    fn a_python_comment_yields_its_quoted_runs_and_nothing_else() {
        assert_eq!(
            read(
                "# see \"the docs\"\nx = 'v'  # don't worry\n",
                Language::Python
            ),
            ["the docs", "v"]
        );
    }

    #[test]
    fn a_hash_inside_a_python_string_is_not_a_comment() {
        assert_eq!(
            read("x = 'a # b'\ny = 'c'", Language::Python),
            ["a # b", "c"]
        );
    }

    #[test]
    fn an_unterminated_python_string_is_not_a_string() {
        assert_eq!(read("x = 'oops\ny = 'kept'", Language::Python), ["kept"]);
    }

    // ---- Rust -----------------------------------------------------

    /// The regression. The fallback splits this into `a raw` and
    /// `string`, losing the inner quotes on the way.
    #[test]
    fn a_rust_raw_string_is_one_string_with_its_quotes() {
        assert_eq!(
            read("let s = r#\"a raw \"quoted\" string\"#;", Language::Rust),
            ["a raw \"quoted\" string"]
        );
    }

    #[test]
    fn rust_raw_strings_take_any_number_of_hashes() {
        assert_eq!(read("r\"plain\"", Language::Rust), ["plain"]);
        assert_eq!(
            read("r##\"has \"# inside\"##", Language::Rust),
            ["has \"# inside"]
        );
        assert_eq!(
            read("b\"bytes\" br#\"raw bytes\"#", Language::Rust),
            ["bytes", "raw bytes"]
        );
    }

    #[test]
    fn a_rust_string_may_span_lines() {
        assert_eq!(
            read("let s = \"first\nsecond\";", Language::Rust),
            ["first\nsecond"]
        );
    }

    /// Without this, the quote inside the character literal opens a run
    /// that eats the rest of the file.
    #[test]
    fn a_rust_character_literal_is_not_a_string() {
        assert_eq!(
            read("if c == '\"' { let s = \"kept\"; }", Language::Rust),
            ["kept"]
        );
        assert_eq!(
            read("let c = 'a'; let s = \"kept\";", Language::Rust),
            ["kept"]
        );
        assert_eq!(
            read("let c = '\\''; let s = \"kept\";", Language::Rust),
            ["kept"]
        );
    }

    #[test]
    fn a_rust_lifetime_is_not_a_character_literal() {
        assert_eq!(
            read(
                "fn f<'a>(x: &'a str) -> &'a str { \"kept\" }",
                Language::Rust
            ),
            ["kept"]
        );
    }

    #[test]
    fn rust_block_comments_nest() {
        assert_eq!(
            read("/* outer /* inner */ still */ \"kept\"", Language::Rust),
            ["kept"]
        );
    }

    #[test]
    fn a_raw_identifier_is_not_a_raw_string() {
        assert_eq!(read("let r#type = \"kept\";", Language::Rust), ["kept"]);
    }

    // ---- Go -------------------------------------------------------

    /// The regression. The fallback's pattern cannot span lines, so a
    /// Go raw string is not there at all.
    #[test]
    fn a_go_raw_string_is_one_string() {
        assert_eq!(
            read("const usage = `line one\nline two`", Language::Go),
            ["line one\nline two"]
        );
    }

    #[test]
    fn a_go_interpreted_string_stops_at_the_line() {
        assert_eq!(
            read("s := \"one\"\nt := \"two\"", Language::Go),
            ["one", "two"]
        );
        assert_eq!(read("s := \"oops\nt := \"kept\"", Language::Go), ["kept"]);
    }

    #[test]
    fn a_go_rune_is_not_a_string() {
        assert_eq!(
            read("if c == '\"' { s := \"kept\" }", Language::Go),
            ["kept"]
        );
    }

    // ---- shell ----------------------------------------------------

    /// The regression. A heredoc body is one string, and the fallback
    /// reports nothing at all.
    #[test]
    fn a_shell_heredoc_is_one_string() {
        assert_eq!(
            read("cat <<EOF\nThe body.\nSecond line.\nEOF\n", Language::Shell),
            ["The body.\nSecond line."]
        );
    }

    #[test]
    fn shell_heredocs_take_every_introducer() {
        assert_eq!(
            read("cat <<'EOF'\nliteral\nEOF\n", Language::Shell),
            ["literal"]
        );
        assert_eq!(
            read("cat <<\"EOF\"\nexpanded\nEOF\n", Language::Shell),
            ["expanded"]
        );
        assert_eq!(
            read("cat <<- EOF\n\tindented\n\tEOF\n", Language::Shell),
            ["indented"]
        );
    }

    #[test]
    fn two_heredocs_on_one_line_are_two_strings() {
        assert_eq!(
            read("diff <<A <<B\nfirst\nA\nsecond\nB\n", Language::Shell),
            ["first", "second"]
        );
    }

    #[test]
    fn a_heredoc_that_never_closes_is_not_a_string() {
        assert!(read("cat <<EOF\nno terminator\n", Language::Shell).is_empty());
    }

    /// A shell gives the rest of the file to the first heredoc whose tag
    /// never arrives, so the ones queued behind it never get a body.
    /// Reading on regardless invented one — and made a line carrying a
    /// thousand tags scan the whole file a thousand times.
    #[test]
    fn a_heredoc_that_never_closes_ends_the_batch() {
        assert!(read("diff <<A <<B\nfirst\nB\n", Language::Shell).is_empty());
        assert_eq!(
            read("diff <<A <<B\nfirst\nA\nsecond\nB\n", Language::Shell),
            ["first", "second"],
            "a batch that closes is unaffected"
        );
    }

    /// The same tag, never closing, twice: the second occurrence must
    /// not re-read the rest of the file to learn what the first already
    /// found out.
    #[test]
    fn a_tag_searched_for_once_is_not_searched_for_again() {
        assert!(read("cat <<GONE\na\ncat <<GONE\nb\n", Language::Shell).is_empty());
    }

    /// `<<EOF` and `<<-EOF` look for different lines, so one failing
    /// says nothing about the other.
    #[test]
    fn an_indented_tag_is_searched_for_even_after_the_bare_one_failed() {
        assert_eq!(
            read(
                "cat <<EOF\nbody\n  EOF\ncat <<- EOF\nkept\n  EOF\n",
                Language::Shell
            ),
            ["kept"]
        );
    }

    #[test]
    fn a_left_shift_is_not_a_heredoc() {
        assert_eq!(read("x=$((1 << 2))\ny='kept'", Language::Shell), ["kept"]);
    }

    #[test]
    fn a_hash_inside_a_shell_word_is_not_a_comment() {
        assert_eq!(
            read("file=report#1\necho 'kept'", Language::Shell),
            ["kept"]
        );
        assert_eq!(
            read("# a \"noted\" thing\necho 'kept'", Language::Shell),
            ["noted", "kept"]
        );
    }

    // ---- PHP, Ruby, Perl ------------------------------------------

    #[test]
    fn a_php_heredoc_and_nowdoc_are_each_one_string() {
        assert_eq!(read("$a = <<<EOT\nhello\nEOT;\n", Language::Php), ["hello"]);
        assert_eq!(read("$a = <<<'NOW'\nraw\nNOW;\n", Language::Php), ["raw"]);
    }

    #[test]
    fn php_reads_both_comment_styles() {
        assert_eq!(
            read(
                "# one \"a\"\n// two \"b\"\n/* three \"c\" */\n$x = 'kept';",
                Language::Php
            ),
            ["a", "b", "c", "kept"]
        );
    }

    #[test]
    fn a_ruby_heredoc_is_one_string_and_a_left_shift_is_not() {
        assert_eq!(read("t = <<~EOS\n  hi\nEOS\n", Language::Ruby), ["hi"]);
        assert_eq!(read("list << item\nx = 'kept'", Language::Ruby), ["kept"]);
    }

    /// A `=begin` block is a comment, so it is read as prose: its quoted
    /// runs come through, and the code inside it does not confuse the
    /// scan around it.
    #[test]
    fn a_ruby_block_comment_is_read_as_prose() {
        assert_eq!(
            read("=begin\nprose 'here'\n=end\nx = 'kept'", Language::Ruby),
            ["here", "kept"]
        );
    }

    #[test]
    fn a_perl_heredoc_is_one_string_and_a_last_index_is_not_a_comment() {
        assert_eq!(
            read("my $t = <<'END';\nbody\nEND\n", Language::Perl),
            ["body"]
        );
        assert_eq!(
            read("my $n = $#list;\nmy $s = 'kept';", Language::Perl),
            ["kept"]
        );
    }

    #[test]
    fn perl_documentation_is_read_as_prose() {
        assert_eq!(
            read("=pod\nprose 'here'\n=cut\nmy $s = 'kept';", Language::Perl),
            ["here", "kept"]
        );
    }

    // ---- C# -------------------------------------------------------

    /// The fallback reports `He said`, `hi` and `loudly`.
    #[test]
    fn a_csharp_verbatim_string_keeps_its_doubled_quotes() {
        assert_eq!(
            read("var s = @\"He said \"\"hi\"\" loudly\";", Language::CSharp),
            ["He said \"\"hi\"\" loudly"]
        );
    }

    #[test]
    fn a_csharp_verbatim_string_spans_lines_and_keeps_backslashes() {
        assert_eq!(
            read("var p = @\"C:\\Users\\test\";", Language::CSharp),
            ["C:\\Users\\test"]
        );
        assert_eq!(
            read("var q = @\"one\ntwo\";", Language::CSharp),
            ["one\ntwo"]
        );
    }

    #[test]
    fn csharp_interpolation_reads_either_order() {
        assert_eq!(read("var a = $\"Hi {n}\";", Language::CSharp), ["Hi {n}"]);
        assert_eq!(
            read("var b = $@\"a \"\"b\"\";\";", Language::CSharp),
            ["a \"\"b\"\";"]
        );
        assert_eq!(read("var c = @$\"x\";", Language::CSharp), ["x"]);
    }

    // ---- JavaScript and TypeScript --------------------------------

    #[test]
    fn a_template_literal_is_one_string_across_lines() {
        assert_eq!(
            read(
                "const body = `Dear reader,\n\nWelcome.`;",
                Language::JavaScript
            ),
            ["Dear reader,\n\nWelcome."]
        );
    }

    #[test]
    fn a_nested_template_is_part_of_the_string_around_it() {
        assert_eq!(
            read("const s = `a ${x ? `b` : `c`} d`;", Language::JavaScript),
            ["a ${x ? `b` : `c`} d"]
        );
    }

    #[test]
    fn a_brace_inside_an_interpolation_does_not_end_it() {
        assert_eq!(
            read("const s = `a ${ {k: `v`}.k } b`;", Language::JavaScript),
            ["a ${ {k: `v`}.k } b"]
        );
    }

    #[test]
    fn a_quoted_brace_inside_an_interpolation_does_not_end_it() {
        assert_eq!(
            read("const s = `a ${f(\"}\")} b`;", Language::JavaScript),
            ["a ${f(\"}\")} b"]
        );
    }

    #[test]
    fn javascript_escapes_survive_into_the_value() {
        assert_eq!(
            read("const s = 'It\\'s fine';", Language::JavaScript),
            ["It\\'s fine"]
        );
    }

    #[test]
    fn a_javascript_comment_yields_its_quoted_runs() {
        assert_eq!(
            read(
                "// A comment mentioning \"quoted text\".\nconst a = 'v';",
                Language::JavaScript
            ),
            ["quoted text", "v"]
        );
    }

    // ---- the shared rule ------------------------------------------

    /// `collect` answers this, not the languages: every extractor here
    /// hands it raw literals and it decides what survives.
    #[test]
    fn empty_and_whitespace_only_literals_are_dropped_everywhere() {
        assert_eq!(
            read("a = ''\nb = '  '\nc = 'kept'", Language::Python),
            ["kept"]
        );
        assert_eq!(read("a := \"\"; b := \"kept\"", Language::Go), ["kept"]);
    }

    #[test]
    fn values_are_trimmed_and_repeats_are_kept() {
        assert_eq!(read("a = '  padded  '", Language::Python), ["padded"]);
        assert_eq!(
            read("a = 'same'\nb = 'same'", Language::Python),
            ["same", "same"]
        );
    }

    #[test]
    fn an_empty_document_yields_nothing() {
        assert!(read("", Language::Python).is_empty());
        assert!(read("no literals at all", Language::Rust).is_empty());
    }

    /// Pathological nesting stops rather than running away.
    #[test]
    fn template_nesting_is_capped() {
        let source = format!("`{}", "${`".repeat(200));
        assert!(read(&source, Language::JavaScript).is_empty());
    }
}
