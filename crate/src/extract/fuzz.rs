//! A standing net over the pure layer.
//!
//! String-literal scanning is the most fuzzable surface this crate has,
//! and this release gave it ten languages' worth of delimiters that
//! nest, escape and span lines. What a generated document is looking
//! for is a panic, a hang, and a run that never terminates and swallows
//! the rest of the file — three failures no hand-written case finds,
//! because they live in inputs nobody would think to write.
//!
//! **Only `extract/` is targeted.** Everything here is pure: text in,
//! values out, no filesystem and no process. That is what makes running
//! it thousands of times a second worth doing.
//!
//! **Determinism, and the one exception.** The default run is a fixed
//! seed and a fixed number of iterations, so `cargo test` answers the
//! same way every time. CI sets `STRING_LE_FUZZ_SECONDS` to run each
//! target against the clock instead, and `STRING_LE_FUZZ_SEED` to move
//! the search; every failure prints the seed and the input, so a red
//! build says exactly what to rerun.

use super::collect::{self, Value};
use super::source::{self, Language};
use super::{Options, SUPPORTED_FORMATS, examine, extract};

/// Iterations per target when nothing asks for a time budget. Small
/// enough that the ordinary suite stays fast, large enough that a
/// regression in a delimiter is very unlikely to survive it.
const DEFAULT_ITERATIONS: u32 = 3_000;

/// The longest a single document may take. An input this size is a few
/// microseconds of work; a second means the scanner stopped making
/// progress, which is the hang this exists to catch.
const PER_INPUT_LIMIT: std::time::Duration = std::time::Duration::from_secs(1);

/// Bounded so one input cannot be slow simply for being enormous — the
/// large-document story belongs to `tests/scenarios.rs`.
const MAX_DOCUMENT: usize = 8 * 1024;

/// xorshift64*, written out rather than depended on: three lines, and a
/// dependency in the lockfile is a cost this does not need to carry.
struct Rng(u64);

impl Rng {
    fn new(seed: u64) -> Self {
        Self(seed | 1)
    }

    fn next(&mut self) -> u64 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        self.0.wrapping_mul(0x2545_f491_4f6c_dd1d)
    }

    fn below(&mut self, limit: usize) -> usize {
        usize::try_from(self.next() % limit as u64).unwrap_or(0)
    }

    fn pick<'a, T>(&mut self, items: &'a [T]) -> &'a T {
        &items[self.below(items.len())]
    }
}

/// The pieces a document is built from: every delimiter the ten
/// scanners recognise, every character known to break one, and enough
/// ordinary text that a run has something to swallow.
const TOKENS: [&str; 64] = [
    "\"",
    "'",
    "`",
    "\\",
    "\\\"",
    "\\\\",
    "\"\"",
    "'''",
    "\"\"\"",
    "r\"",
    "r#\"",
    "r##\"",
    "\"#",
    "\"##",
    "b\"",
    "br#\"",
    "@\"",
    "$\"",
    "$@\"",
    "@$\"",
    "${",
    "}",
    "{",
    "<<EOF",
    "<<'EOF'",
    "<<-EOF",
    "<<~EOF",
    "<<<EOT",
    "<<<'NOW'",
    "EOF",
    "EOT",
    "NOW",
    "//",
    "/*",
    "*/",
    "#",
    "=begin",
    "=end",
    "=pod",
    "=cut",
    "\n",
    "\r\n",
    "\r",
    "\t",
    " ",
    "  ",
    ";",
    "=",
    "(",
    ")",
    "[",
    "]",
    "let s",
    "const x",
    "def f",
    "echo",
    "value",
    "copy",
    "Delete this?",
    "café",
    "🎯",
    "\u{feff}",
    "\u{85}",
    "\0",
];

/// A random document from the token alphabet.
fn soup(rng: &mut Rng) -> String {
    let mut text = String::new();
    let pieces = 1 + rng.below(120);
    for _ in 0..pieces {
        text.push_str(rng.pick(&TOKENS));
        if text.len() >= MAX_DOCUMENT {
            break;
        }
    }
    text
}

/// The corpus, mutated. Real documents are a better starting point than
/// noise for reaching the branches a scanner only takes on plausible
/// input, so they are checked in as seeds and then cut about.
const SEEDS: [&str; 10] = [
    include_str!("../../fixtures/documents/strings.py"),
    include_str!("../../fixtures/documents/strings.rs"),
    include_str!("../../fixtures/documents/strings.go"),
    include_str!("../../fixtures/documents/strings.sh"),
    include_str!("../../fixtures/documents/strings.php"),
    include_str!("../../fixtures/documents/strings.rb"),
    include_str!("../../fixtures/documents/strings.pl"),
    include_str!("../../fixtures/documents/strings.cs"),
    include_str!("../../fixtures/documents/strings.js"),
    include_str!("../../fixtures/documents/strings.ts"),
];

/// One corpus document with a piece cut out, a token spliced in, or
/// both. Truncation is the important one: it is how an unterminated
/// delimiter arrives in a document that is otherwise real.
fn mutated(rng: &mut Rng) -> String {
    let seed = *rng.pick(&SEEDS);
    let chars: Vec<char> = seed.chars().take(MAX_DOCUMENT).collect();
    if chars.is_empty() {
        return String::new();
    }
    let cut = rng.below(chars.len());
    let mut text: String = chars[..cut].iter().collect();
    match rng.below(3) {
        // Truncated, so whatever was open at `cut` never closes.
        0 => {}
        1 => text.push_str(rng.pick(&TOKENS)),
        _ => {
            text.push_str(rng.pick(&TOKENS));
            text.extend(chars[cut..].iter());
        }
    }
    text
}

fn document(rng: &mut Rng) -> String {
    if rng.below(2) == 0 {
        return soup(rng);
    }
    mutated(rng)
}

/// How long each target runs, and from where it starts.
///
/// Both are read once and printed, so a failure in CI names the seed
/// that produced it.
fn budget() -> (u64, Option<std::time::Duration>) {
    let seed = std::env::var("STRING_LE_FUZZ_SEED")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0x5eed_5717_1e5f_0f0f);
    let seconds = std::env::var("STRING_LE_FUZZ_SECONDS")
        .ok()
        .and_then(|value| value.parse().ok())
        .map(std::time::Duration::from_secs);
    (seed, seconds)
}

/// Run one check over generated documents until the budget runs out.
fn campaign(target: &str, mut check: impl FnMut(&str, u64)) {
    let (seed, seconds) = budget();
    eprintln!("fuzz {target}: seed {seed:#x}");
    let mut rng = Rng::new(seed);
    let started = std::time::Instant::now();
    let mut iterations = 0u64;

    loop {
        match seconds {
            Some(limit) if started.elapsed() >= limit => break,
            None if iterations >= u64::from(DEFAULT_ITERATIONS) => break,
            _ => {}
        }
        let text = document(&mut rng);
        let began = std::time::Instant::now();
        check(&text, iterations);
        let elapsed = began.elapsed();
        assert!(
            elapsed < PER_INPUT_LIMIT,
            "fuzz {target}: seed {seed:#x} iteration {iterations} took {elapsed:?} on {:?}",
            &text[..text.len().min(400)]
        );
        iterations += 1;
    }
    eprintln!("fuzz {target}: {iterations} documents");
}

/// What every extraction must be true of, whatever the input was.
///
/// The value bound is the runaway check: an extractor that duplicated
/// its input, or looped emitting the same run, breaks it long before it
/// exhausts memory.
///
/// The trim rule is asserted for every format **except `env`**, which
/// SPEC.md records as the exception: a quoted `.env` value keeps
/// whatever is between the quotes, spaces included, because in a file
/// with no type system that is a value somebody wrote on purpose. Both
/// frontends do this and the corpus pins it, so it is a documented
/// answer rather than a leak in the rule.
fn holds(values: &[String], text: &str, what: &str, iteration: u64) {
    let characters = text.chars().count();
    assert!(
        values.len() <= characters + 1,
        "{what} #{iteration}: {} values from {characters} characters",
        values.len()
    );
    let produced: usize = values.iter().map(String::len).sum();
    assert!(
        produced <= text.len() * 4 + 16,
        "{what} #{iteration}: {produced} bytes of values from {} bytes of document",
        text.len()
    );
    if what == "env" {
        return;
    }
    for value in values {
        assert!(
            !super::text::trim(value).is_empty(),
            "{what} #{iteration}: an empty value survived the collection rule: {text:?}"
        );
    }
}

const LANGUAGES: [(&str, Language); 9] = [
    ("python", Language::Python),
    ("rust", Language::Rust),
    ("go", Language::Go),
    ("shellscript", Language::Shell),
    ("php", Language::Php),
    ("ruby", Language::Ruby),
    ("perl", Language::Perl),
    ("csharp", Language::CSharp),
    ("javascript", Language::JavaScript),
];

/// The delimiter scanner, in all nine languages, on every document.
#[test]
fn the_source_scanner_answers_or_says_nothing() {
    campaign("source", |text, iteration| {
        for (name, language) in LANGUAGES {
            let values = source::extract(text, language);
            holds(&values, text, name, iteration);
            assert_eq!(
                values,
                source::extract(text, language),
                "{name} #{iteration}: the same document answered twice, differently"
            );
        }
    });
}

/// The whole pure pipeline: every format, values *and* positions.
///
/// This is the layer that slices the document to place a value, which is
/// where the SIGABRT this family saw on a real repository lived.
#[test]
fn every_format_places_its_values_inside_the_document() {
    campaign("examine", |text, iteration| {
        for format in SUPPORTED_FORMATS {
            let examined = examine(text, format, Options::default());
            let values: Vec<String> = examined
                .found
                .iter()
                .map(|found| found.value.clone())
                .collect();
            holds(&values, text, format, iteration);

            let lines = text.lines().count() + 1;
            for found in &examined.found {
                let Some(position) = found.position else {
                    continue;
                };
                assert!(
                    position.line >= 1 && position.line <= lines,
                    "{format} #{iteration}: line {} of {lines}",
                    position.line
                );
                assert!(
                    position.column >= 1,
                    "{format} #{iteration}: column {} is not 1-based",
                    position.column
                );
            }
        }
    });
}

/// The fallback and the `--multiline` variant of it, which is the one
/// pattern in the crate that may cross a line.
///
/// **On a document with no line break in it the two must be the same
/// answer.** That is the contract the flag is sold on: asked for, it
/// reads runs that span lines; not asked for, and on a document with no
/// lines to span, it changes nothing. Beyond that there is no relation
/// worth asserting — allowing newlines re-pairs every quote in the
/// document, so it can find more runs or fewer, and a bound invented
/// here would be a red build about nothing.
#[test]
fn the_fallback_agrees_with_itself_where_there_are_no_lines_to_span() {
    campaign("fallback", |text, iteration| {
        let narrow = extract(text, "fallback", Options::default());
        let wide = extract(
            text,
            "fallback",
            Options {
                multiline: true,
                ..Options::default()
            },
        );
        holds(&narrow, text, "fallback", iteration);
        holds(&wide, text, "fallback multiline", iteration);
        if !text.contains(['\n', '\r']) {
            assert_eq!(
                narrow, wide,
                "fallback #{iteration}: the flag changed a document with no lines to span: {text:?}"
            );
        }
    });
}

/// The depth cap, asserted rather than trusted.
///
/// Nothing in this crate reaches it today — every parser guards its own
/// nesting first — so the only thing that can prove the backstop still
/// works is building a tree deeper than it and watching the answer come
/// back rather than the stack go.
#[test]
fn the_recursion_cap_holds_at_any_shape() {
    let (seed, _) = budget();
    eprintln!("fuzz collect: seed {seed:#x}");
    let mut rng = Rng::new(seed);

    for iteration in 0..200u32 {
        // Past the 1000 the extension stops at, so both sides of the cap
        // are exercised.
        let depth = 900 + rng.below(300);
        let mut value = Value::Str("bottom".to_string());
        for _ in 0..depth {
            value = match rng.below(3) {
                0 => Value::Seq(vec![value]),
                1 => Value::Map(vec![value]),
                _ => Value::Seq(vec![Value::Other, value, Value::Str("  ".to_string())]),
            };
        }
        let collected = collect::collect(&value);
        assert!(
            collected.len() <= 1,
            "collect #{iteration}: depth {depth} produced {} values",
            collected.len()
        );
        assert_eq!(
            collected.is_empty(),
            depth > 1000,
            "collect #{iteration}: depth {depth} answered on the wrong side of the cap"
        );
    }
}
