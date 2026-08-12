import type { Extractor } from '../../types';
import { collectStrings } from '../collect';
import { quotedRuns } from './fallback';

/**
 * String literals, in the language that wrote them.
 *
 * The quoted-run fallback reads every source file through a
 * JavaScript-shaped lens, and on real code that lens is wrong rather than
 * merely coarse: a Python docstring is missed, a Rust `r#"a raw "quoted"
 * string"#` comes back as the two fragments `a raw` and `string`, a Go
 * backtick string and a shell heredoc are not there at all.
 *
 * It does not decide what counts as a string. Every literal it finds is
 * handed to collectStrings, the same rule the parsed formats use —
 * trimmed, empty ones dropped, duplicates kept.
 *
 * Three things it keeps from the fallback deliberately: escapes are not
 * resolved, a comment is text like any other (its quoted runs are read
 * with the fallback pattern), and nothing here asks whether a string
 * looks user-facing.
 *
 * This file is the reference implementation for crate/src/extract/source.rs;
 * crate/fixtures/ is the contract between them.
 */

export type SourceLanguage =
	| 'python'
	| 'rust'
	| 'go'
	| 'shell'
	| 'php'
	| 'ruby'
	| 'perl'
	| 'csharp'
	| 'javascript';

/** Every file type that resolves to a language, keyed as callers send it. */
const LANGUAGE_BY_FILE_TYPE: Readonly<Record<string, SourceLanguage>> =
	Object.freeze({
		python: 'python',
		py: 'python',
		rust: 'rust',
		rs: 'rust',
		go: 'go',
		shellscript: 'shell',
		sh: 'shell',
		bash: 'shell',
		zsh: 'shell',
		php: 'php',
		ruby: 'ruby',
		rb: 'ruby',
		perl: 'perl',
		pl: 'perl',
		pm: 'perl',
		csharp: 'csharp',
		cs: 'csharp',
		javascript: 'javascript',
		javascriptreact: 'javascript',
		js: 'javascript',
		jsx: 'javascript',
		mjs: 'javascript',
		cjs: 'javascript',
		// TypeScript is lexed as JavaScript; the two stay separate file
		// types so a report says which one the caller named.
		typescript: 'javascript',
		typescriptreact: 'javascript',
		ts: 'javascript',
		tsx: 'javascript',
		mts: 'javascript',
		cts: 'javascript',
	});

/** One extractor per file type that reads a source language. */
export const SOURCE_EXTRACTORS: Readonly<Record<string, Extractor>> =
	Object.freeze(
		Object.fromEntries(
			Object.entries(LANGUAGE_BY_FILE_TYPE).map(([fileType, language]) => [
				fileType,
				createSourceExtractor(language),
			]),
		),
	);

export function createSourceExtractor(language: SourceLanguage): Extractor {
	return (text): readonly string[] =>
		Object.freeze(collectStrings(scan(text, language)));
}

/** How a run reaches its closing delimiter. */
type Escapes = 'backslash' | 'doubled' | 'none';

type Taken = Readonly<{ value: string; end: number }>;

/** A heredoc whose introducer has been read; its body starts next line. */
type Pending = Readonly<{ tag: string; indented: boolean }>;

type Marked = Readonly<{ pending: Pending; end: number }>;

type Scanner = {
	// Code points rather than UTF-16 units, so an index here means what
	// the same index means in the Rust scanner.
	readonly chars: readonly string[];
	readonly language: SourceLanguage;
	readonly values: string[];
	readonly heredocs: Pending[];
	/** Every `tag\0indented` already searched for and not found. */
	readonly unclosed: Set<string>;
	/**
	 * Every tag some line in this document could close, built once on
	 * the first heredoc. `null` until then.
	 */
	closable: Set<string> | null;
	at: number;
};

/** Deep enough for real source, shallow enough to bound a bad file. */
const MAX_TEMPLATE_NESTING = 64;
/** The longest character literal worth looking for: `'\u{1F600}'`. */
const LONGEST_CHARACTER = 14;

const PYTHON_PREFIXES = 'rRbBuUfF';
// `\p{Alphabetic}` rather than `\p{L}`: the Rust scanner asks
// `char::is_alphabetic`, which is the Alphabetic property and takes in
// the combining marks that general category L leaves out. Two spellings
// of one rule is how two frontends start to disagree.
const IDENTIFIER = /[\p{Alphabetic}\p{N}_]/u;
/** The identifier a line opens with, for the PHP closing-tag rule. */
const LEADING_IDENTIFIER = /^[\p{Alphabetic}\p{N}_]*/u;
const LETTER = /\p{Alphabetic}/u;
const UPPERCASE = /\p{Uppercase}/u;
const WHITESPACE = /\s/u;
const WORD_BREAK = new Set([';', '&', '|', '(', ')']);

function scan(text: string, language: SourceLanguage): readonly string[] {
	const scanner: Scanner = {
		chars: Array.from(text),
		language,
		values: [],
		heredocs: [],
		unclosed: new Set(),
		closable: null,
		at: 0,
	};
	run(scanner);
	return scanner.values;
}

function run(scanner: Scanner): void {
	while (scanner.at < scanner.chars.length) {
		if (scanner.chars[scanner.at] === '\n' && scanner.heredocs.length > 0) {
			takeHeredocBodies(scanner);
			continue;
		}
		if (
			takeComment(scanner) ||
			takeString(scanner) ||
			takeCharacter(scanner) ||
			takeHeredocMarker(scanner)
		) {
			continue;
		}
		scanner.at += 1;
	}
}

// ---- the four things that can start here ------------------------------

function takeComment(scanner: Scanner): boolean {
	const end = COMMENT_READERS[scanner.language](scanner);
	if (end === null) return false;

	for (const run of quotedRuns(slice(scanner, scanner.at, end))) {
		scanner.values.push(run);
	}
	scanner.at = end;
	return true;
}

function takeString(scanner: Scanner): boolean {
	const taken = STRING_READERS[scanner.language](scanner);
	if (!taken) return false;

	scanner.values.push(taken.value);
	scanner.at = taken.end;
	return true;
}

/**
 * A character literal is a character, not a string. It is skipped rather
 * than ignored because `'"'` is ordinary Rust, Go and C#, and a scanner
 * that walked past it would read the quote inside as opening a string and
 * swallow the rest of the file.
 */
function takeCharacter(scanner: Scanner): boolean {
	if (!CHARACTER_LITERAL_LANGUAGES.has(scanner.language)) return false;
	if (charAt(scanner, scanner.at) !== "'") return false;

	const end = characterEnd(scanner);
	if (end === null) return false;

	scanner.at = end;
	return true;
}

function takeHeredocMarker(scanner: Scanner): boolean {
	const reader = HEREDOC_READERS[scanner.language];
	if (!reader) return false;

	const marked = reader(scanner);
	if (!marked) return false;

	scanner.heredocs.push(marked.pending);
	scanner.at = marked.end;
	return true;
}

// ---- strings, per language --------------------------------------------

/**
 * Triple-quoted strings, and the r/b/u/f prefixes in any order or case.
 *
 * The triple-quoted form is the whole reason this language is here: it is
 * where a docstring lives, it spans lines, and the fallback sees only an
 * empty `""` pair on each side of it.
 */
function pythonString(scanner: Scanner): Taken | null {
	const start = scanner.at;
	let at = start;
	while (at < start + 2) {
		const current = charAt(scanner, at);
		if (!current || !PYTHON_PREFIXES.includes(current)) break;
		at += 1;
	}

	const quote = charAt(scanner, at);
	if (quote !== '"' && quote !== "'") return null;
	if (at > start && precededByIdentifier(scanner, start)) return null;

	const triple = quote.repeat(3);
	if (matchesAt(scanner, at, triple)) {
		return delimited(scanner, at + 3, triple, 'backslash', true);
	}
	// A backslash escapes the closing quote even under `r`: Python's own
	// lexer says `r"\""` is a string and `r"\"` is an error.
	return delimited(scanner, at + 1, quote, 'backslash', false);
}

/**
 * Raw strings with any number of hashes, and the b/c prefixes.
 * `r#"a raw "quoted" string"#` is one value with its inner quotes intact.
 */
function rustString(scanner: Scanner): Taken | null {
	const start = scanner.at;
	let at = start;
	const prefix = charAt(scanner, at);
	if (prefix === 'b' || prefix === 'c') at += 1;

	const raw = charAt(scanner, at) === 'r';
	let hashes = 0;
	if (raw) {
		at += 1;
		while (charAt(scanner, at) === '#') {
			hashes += 1;
			at += 1;
		}
	}

	if (charAt(scanner, at) !== '"') return null;
	if (at > start && precededByIdentifier(scanner, start)) return null;
	// A Rust string literal may contain a real newline.
	if (!raw) return delimited(scanner, at + 1, '"', 'backslash', true);

	return delimited(scanner, at + 1, `"${'#'.repeat(hashes)}`, 'none', true);
}

function goString(scanner: Scanner): Taken | null {
	const current = charAt(scanner, scanner.at);
	if (current === '"') {
		return delimited(scanner, scanner.at + 1, '"', 'backslash', false);
	}
	// The raw string: no escapes, and it spans lines because Go says so.
	if (current === '`') {
		return delimited(scanner, scanner.at + 1, '`', 'none', true);
	}
	return null;
}

function shellString(scanner: Scanner): Taken | null {
	const current = charAt(scanner, scanner.at);
	if (current === '"') {
		return delimited(scanner, scanner.at + 1, '"', 'backslash', true);
	}
	// Inside '…' a backslash is a backslash, and the run runs until the
	// next quote however many lines away that is.
	if (current === "'") {
		return delimited(scanner, scanner.at + 1, "'", 'none', true);
	}
	return null;
}

/** PHP, Ruby and Perl agree: both quote styles escape with `\` and span lines. */
function scriptingString(scanner: Scanner): Taken | null {
	const current = charAt(scanner, scanner.at);
	if (current !== '"' && current !== "'") return null;
	return delimited(scanner, scanner.at + 1, current, 'backslash', true);
}

/**
 * Verbatim `@"…"`, interpolated `$"…"`, and both together. In a verbatim
 * string `""` is one quote, so `@"He said ""hi"""` is one value rather
 * than the three fragments the fallback reports.
 */
function csharpString(scanner: Scanner): Taken | null {
	let at = scanner.at;
	let verbatim = false;
	for (let step = 0; step < 2; step += 1) {
		const current = charAt(scanner, at);
		if (current === '@') {
			verbatim = true;
			at += 1;
			continue;
		}
		if (current !== '$') break;
		at += 1;
	}

	if (charAt(scanner, at) !== '"') return null;
	if (verbatim) return delimited(scanner, at + 1, '"', 'doubled', true);
	return delimited(scanner, at + 1, '"', 'backslash', false);
}

function javascriptString(scanner: Scanner): Taken | null {
	const current = charAt(scanner, scanner.at);
	if (current === '"' || current === "'") {
		return delimited(scanner, scanner.at + 1, current, 'backslash', false);
	}
	if (current === '`') return template(scanner);
	return null;
}

/**
 * A template literal, read as one value.
 *
 * The fallback ends a run at the first backtick, so `` `a ${x ? `b` : `c`} d` ``
 * becomes three fragments and a template spanning lines is missed
 * entirely. Interpolation is part of the value: `${count}` is what the
 * source says, and resolving it is not something a reader of a static
 * file can be given honestly.
 */
function template(scanner: Scanner): Taken | null {
	const from = scanner.at + 1;
	let at = from;
	// One entry per open template, holding the brace depth of its
	// interpolation. Zero means the scan is in template text.
	const open: number[] = [0];

	while (at < scanner.chars.length) {
		const depth = open[open.length - 1] as number;
		const current = scanner.chars[at] as string;
		const top = open.length - 1;

		if (current === '\\') {
			at += 2;
			continue;
		}
		if (current === '`' && depth === 0 && open.length === 1) {
			return { value: slice(scanner, from, at), end: at + 1 };
		}
		if (current === '`' && depth === 0) {
			open.pop();
			at += 1;
			continue;
		}
		if (current === '`' && open.length >= MAX_TEMPLATE_NESTING) return null;
		if (current === '`') {
			open.push(0);
			at += 1;
			continue;
		}
		if (current === '$' && depth === 0 && charAt(scanner, at + 1) === '{') {
			open[top] = 1;
			at += 2;
			continue;
		}
		if (current === '{' && depth > 0) {
			open[top] = depth + 1;
			at += 1;
			continue;
		}
		if (current === '}' && depth > 0) {
			open[top] = depth - 1;
			at += 1;
			continue;
		}
		if ((current === '"' || current === "'") && depth > 0) {
			const inner = delimited(scanner, at + 1, current, 'backslash', false);
			at = inner ? inner.end : at + 1;
			continue;
		}
		at += 1;
	}
	return null;
}

/**
 * The shared body of every quoted run.
 *
 * An unterminated run is NOT a string: returning null costs one
 * apostrophe its value, where guessing an end would cost the rest of the
 * file its meaning.
 */
function delimited(
	scanner: Scanner,
	from: number,
	terminator: string,
	escapes: Escapes,
	newlines: boolean,
): Taken | null {
	let at = from;
	while (at < scanner.chars.length) {
		const current = scanner.chars[at] as string;
		if (escapes === 'backslash' && current === '\\') {
			at += 2;
			continue;
		}
		if (!newlines && current === '\n') return null;
		if (!matchesAt(scanner, at, terminator)) {
			at += 1;
			continue;
		}
		if (
			escapes === 'doubled' &&
			matchesAt(scanner, at + terminator.length, terminator)
		) {
			at += terminator.length * 2;
			continue;
		}
		return { value: slice(scanner, from, at), end: at + terminator.length };
	}
	return null;
}

/**
 * Where a character literal ends, or null for a Rust lifetime. The window
 * is what tells the two apart: `'a'` closes within a few characters,
 * `'static` never does.
 */
function characterEnd(scanner: Scanner): number | null {
	let at = scanner.at + 1;
	const limit = Math.min(scanner.at + LONGEST_CHARACTER, scanner.chars.length);
	while (at < limit) {
		const current = scanner.chars[at];
		if (current === '\\') {
			at += 2;
			continue;
		}
		if (current === '\n') return null;
		if (current === "'") return at + 1;
		at += 1;
	}
	return null;
}

// ---- comments ----------------------------------------------------------

/** `anywhere` is false for shell, where `file#1` is a file name. */
function hashComment(scanner: Scanner, anywhere: boolean): number | null {
	if (charAt(scanner, scanner.at) !== '#') return null;
	if (!anywhere && !atWordStart(scanner)) return null;
	return lineEnd(scanner, scanner.at);
}

function rubyComment(scanner: Scanner): number | null {
	const block = lineBlock(scanner, '=begin', '=end');
	if (block !== null) return block;
	return hashComment(scanner, true);
}

function perlComment(scanner: Scanner): number | null {
	const pod = podBlock(scanner);
	if (pod !== null) return pod;
	// `$#array` is the last index of an array, not a comment.
	const previous = charAt(scanner, scanner.at - 1);
	if (previous === '$' || previous === '@' || previous === '%') return null;
	return hashComment(scanner, true);
}

function phpComment(scanner: Scanner): number | null {
	const slash = slashComment(scanner, false);
	if (slash !== null) return slash;
	return hashComment(scanner, true);
}

function slashComment(scanner: Scanner, nested: boolean): number | null {
	if (matchesAt(scanner, scanner.at, '//')) return lineEnd(scanner, scanner.at);
	if (!matchesAt(scanner, scanner.at, '/*')) return null;
	return blockCommentEnd(scanner, nested);
}

/** An unterminated block comment runs to the end of the file. */
function blockCommentEnd(scanner: Scanner, nested: boolean): number {
	let at = scanner.at + 2;
	let depth = 1;
	while (at < scanner.chars.length) {
		if (nested && matchesAt(scanner, at, '/*')) {
			depth += 1;
			at += 2;
			continue;
		}
		if (!matchesAt(scanner, at, '*/')) {
			at += 1;
			continue;
		}
		depth -= 1;
		at += 2;
		if (depth === 0) return at;
	}
	return scanner.chars.length;
}

/** Ruby's `=begin` … `=end`, both at the start of a line. */
function lineBlock(
	scanner: Scanner,
	opener: string,
	closer: string,
): number | null {
	if (!atLineStart(scanner)) return null;
	if (!matchesAt(scanner, scanner.at, opener)) return null;
	return closingLine(scanner, closer);
}

/** Perl documentation: `=` and a letter, through the line opening `=cut`. */
function podBlock(scanner: Scanner): number | null {
	if (!atLineStart(scanner)) return null;
	if (charAt(scanner, scanner.at) !== '=') return null;

	const second = charAt(scanner, scanner.at + 1);
	if (!second || !/[A-Za-z]/.test(second)) return null;
	return closingLine(scanner, '=cut');
}

function closingLine(scanner: Scanner, closer: string): number {
	let at = lineEnd(scanner, scanner.at) + 1;
	while (at < scanner.chars.length) {
		if (matchesAt(scanner, at, closer)) return lineEnd(scanner, at);
		at = lineEnd(scanner, at) + 1;
	}
	return scanner.chars.length;
}

// ---- heredocs ----------------------------------------------------------

function shellHeredoc(scanner: Scanner): Marked | null {
	if (!matchesAt(scanner, scanner.at, '<<')) return null;

	let at = scanner.at + 2;
	const indented = charAt(scanner, at) === '-';
	if (indented) at += 1;
	while (charAt(scanner, at) === ' ') at += 1;

	const tagged = heredocTag(scanner, at);
	if (!tagged) return null;
	return { pending: { tag: tagged.tag, indented }, end: tagged.end };
}

function phpHeredoc(scanner: Scanner): Marked | null {
	if (!matchesAt(scanner, scanner.at, '<<<')) return null;

	let at = scanner.at + 3;
	while (charAt(scanner, at) === ' ') at += 1;

	const tagged = heredocTag(scanner, at);
	if (!tagged) return null;
	return { pending: { tag: tagged.tag, indented: true }, end: tagged.end };
}

function scriptHeredoc(scanner: Scanner): Marked | null {
	if (!matchesAt(scanner, scanner.at, '<<')) return null;

	let at = scanner.at + 2;
	const introducer = charAt(scanner, at);
	const squiggly = introducer === '~' || introducer === '-';
	if (squiggly) at += 1;

	const opener = charAt(scanner, at);
	const quoted = opener === "'" || opener === '"';
	const tagged = heredocTag(scanner, at);
	if (!tagged) return null;

	// `queue << item` is a left shift. A bare tag is only read as a
	// heredoc when it is spelled the way heredoc tags are spelled.
	const spelled =
		UPPERCASE.test(tagged.tag[0] as string) || tagged.tag[0] === '_';
	if (!squiggly && !quoted && !spelled) return null;
	return { pending: { tag: tagged.tag, indented: true }, end: tagged.end };
}

function heredocTag(
	scanner: Scanner,
	at: number,
): Readonly<{ tag: string; end: number }> | null {
	const opener = charAt(scanner, at);
	const quote = opener === "'" || opener === '"' ? opener : null;
	const start = at + (quote ? 1 : 0);

	const first = charAt(scanner, start);
	if (!first || !(LETTER.test(first) || first === '_')) return null;

	let end = start;
	while (end < scanner.chars.length) {
		const current = scanner.chars[end] as string;
		if (!IDENTIFIER.test(current)) break;
		end += 1;
	}

	const tag = slice(scanner, start, end);
	if (!quote) return { tag, end };
	if (charAt(scanner, end) !== quote) return null;
	return { tag, end: end + 1 };
}

/**
 * The bodies of every heredoc introduced on the line just ended. A body
 * whose closing tag never arrives is not a heredoc at all — the same
 * refusal `delimited` makes, and for the same reason.
 *
 * The first one that never closes ends the batch. A shell reading
 * `diff <<A <<B` gives the rest of the file to `A` when `A`'s tag never
 * arrives, so `B` has no body to read; carrying on to `B` invented one,
 * and made a line carrying a thousand tags scan the whole file a
 * thousand times.
 */
function takeHeredocBodies(scanner: Scanner): void {
	scanner.at += 1;
	const pending = scanner.heredocs.splice(0, scanner.heredocs.length);
	for (const heredoc of pending) {
		const body = heredocBody(scanner, heredoc);
		if (!body) return;
		scanner.values.push(body.value);
		scanner.at = body.end;
	}
}

function heredocBody(scanner: Scanner, heredoc: Pending): Taken | null {
	// A tag no line in the whole document could ever close is answered
	// without reading the document. One pass to build the set replaces
	// one pass per tag, which is the difference between linear and
	// quadratic on a file full of `<<` that never closes.
	if (!closable(scanner).has(heredoc.tag)) return null;

	// Keyed by the indent rule as well as the tag: `<<EOF` and `<<-EOF`
	// look for different lines, so one failing says nothing about the
	// other. `scanner.at` only ever moves forward, so a tag missing from
	// here on is missing from every later suffix too.
	const key = `${heredoc.tag}\0${heredoc.indented}`;
	if (scanner.unclosed.has(key)) return null;

	let line = scanner.at;
	while (line <= scanner.chars.length) {
		const end = lineEnd(scanner, line);
		if (terminates(scanner, line, end, heredoc)) {
			return {
				value: slice(scanner, scanner.at, line),
				end: Math.min(end + 1, scanner.chars.length),
			};
		}
		line = end + 1;
	}
	scanner.unclosed.add(key);
	return null;
}

/**
 * Every tag some line in this document could close, built once.
 *
 * A superset, and that is what makes it safe to consult: a tag missing
 * from it cannot satisfy `terminates` on any line, so the forward search
 * can be skipped outright; a tag present still gets the full search. A
 * heredoc tag is alphanumerics and `_`, so a candidate carrying leading
 * whitespace can never be one — which is why a single trimmed key covers
 * both indent rules.
 */
function closable(scanner: Scanner): Set<string> {
	if (scanner.closable) return scanner.closable;

	const tags = new Set<string>();
	let line = 0;
	while (line <= scanner.chars.length) {
		const end = lineEnd(scanner, line);
		tags.add(candidateTag(scanner, slice(scanner, line, end)));
		line = end + 1;
	}
	scanner.closable = tags;
	return tags;
}

/** The one tag a line could close. */
function candidateTag(scanner: Scanner, line: string): string {
	if (scanner.language !== 'php') return line.trim();

	// PHP closes with `EOT;` or `EOT,` as often as with `EOT`, so the
	// tag is the identifier the line opens with. Matched with the `u`
	// flag rather than unit by unit, so an astral letter is one
	// character here as it is in the scanner's own char array.
	return LEADING_IDENTIFIER.exec(line.trimStart())?.[0] ?? '';
}

function terminates(
	scanner: Scanner,
	start: number,
	end: number,
	heredoc: Pending,
): boolean {
	const line = slice(scanner, start, end).replace(/\r+$/, '');
	const candidate = heredoc.indented ? line.trimStart() : line;
	if (scanner.language !== 'php') return candidate.trimEnd() === heredoc.tag;

	// PHP closes with `EOT;` or `EOT,` as often as with `EOT`.
	if (!candidate.startsWith(heredoc.tag)) return false;
	const rest = candidate.slice(heredoc.tag.length);
	if (rest.length === 0) return true;
	return !IDENTIFIER.test(rest[0] as string);
}

// ---- reading the text --------------------------------------------------

function charAt(scanner: Scanner, at: number): string | undefined {
	if (at < 0 || at >= scanner.chars.length) return undefined;
	return scanner.chars[at];
}

function slice(scanner: Scanner, from: number, to: number): string {
	return scanner.chars.slice(from, to).join('');
}

function matchesAt(scanner: Scanner, at: number, needle: string): boolean {
	const length = Array.from(needle).length;
	if (at < 0 || at + length > scanner.chars.length) return false;
	return slice(scanner, at, at + length) === needle;
}

function lineEnd(scanner: Scanner, from: number): number {
	for (let at = Math.max(from, 0); at < scanner.chars.length; at += 1) {
		if (scanner.chars[at] === '\n') return at;
	}
	return scanner.chars.length;
}

function atLineStart(scanner: Scanner): boolean {
	return scanner.at === 0 || charAt(scanner, scanner.at - 1) === '\n';
}

function atWordStart(scanner: Scanner): boolean {
	if (scanner.at === 0) return true;
	const previous = charAt(scanner, scanner.at - 1);
	if (!previous) return true;
	return WHITESPACE.test(previous) || WORD_BREAK.has(previous);
}

function precededByIdentifier(scanner: Scanner, at: number): boolean {
	const previous = charAt(scanner, at - 1);
	if (!previous) return false;
	return IDENTIFIER.test(previous);
}

const CHARACTER_LITERAL_LANGUAGES: ReadonlySet<SourceLanguage> = new Set([
	'rust',
	'go',
	'csharp',
]);

const STRING_READERS: Readonly<
	Record<SourceLanguage, (scanner: Scanner) => Taken | null>
> = Object.freeze({
	python: pythonString,
	rust: rustString,
	go: goString,
	shell: shellString,
	php: scriptingString,
	ruby: scriptingString,
	perl: scriptingString,
	csharp: csharpString,
	javascript: javascriptString,
});

const COMMENT_READERS: Readonly<
	Record<SourceLanguage, (scanner: Scanner) => number | null>
> = Object.freeze({
	python: (scanner) => hashComment(scanner, true),
	shell: (scanner) => hashComment(scanner, false),
	ruby: rubyComment,
	perl: perlComment,
	php: phpComment,
	rust: (scanner) => slashComment(scanner, true),
	go: (scanner) => slashComment(scanner, false),
	csharp: (scanner) => slashComment(scanner, false),
	javascript: (scanner) => slashComment(scanner, false),
});

const HEREDOC_READERS: Readonly<
	Partial<Record<SourceLanguage, (scanner: Scanner) => Marked | null>>
> = Object.freeze({
	shell: shellHeredoc,
	php: phpHeredoc,
	ruby: scriptHeredoc,
	perl: scriptHeredoc,
});
