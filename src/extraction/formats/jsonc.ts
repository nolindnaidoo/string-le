/**
 * JSONC as the crate reads it: JSON plus comments and trailing commas, and
 * nothing else.
 *
 * Both are blanked to spaces rather than removed, so every character left
 * keeps its index, and the strict parser then reads what remains — which is
 * what makes a JSONC document mean exactly what the same document means as
 * JSON. A block comment that never closes is left in place, so the parser
 * refuses the document, as the crate's does.
 */
export function stripJsonc(text: string): string {
	const out: string[] = [];
	let inString = false;
	for (let at = 0; at < text.length; at++) {
		const ch = text.charAt(at);
		if (inString) {
			out.push(ch);
			if (ch === '\\' && at + 1 < text.length) {
				at++;
				out.push(text.charAt(at));
			} else if (ch === '"') {
				inString = false;
			}
			continue;
		}
		if (ch === '"') {
			inString = true;
			out.push(ch);
			continue;
		}
		const next = text.charAt(at + 1);
		if (ch === '/' && next === '/') {
			while (at < text.length && text.charAt(at) !== '\n') {
				out.push(' ');
				at++;
			}
			if (at < text.length) out.push('\n');
			continue;
		}
		if (ch === '/' && next === '*') {
			const close = text.indexOf('*/', at + 2);
			if (close === -1) return text;
			for (const blanked of text.slice(at, close + 2))
				out.push(blanked === '\n' ? '\n' : ' ');
			at = close + 1;
			continue;
		}
		out.push(ch);
	}
	return withoutTrailingCommas(out.join(''));
}

/** A comma whose next non-space character closes the container. */
function withoutTrailingCommas(text: string): string {
	const chars = [...text];
	let inString = false;
	for (let at = 0; at < chars.length; at++) {
		const ch = chars[at];
		if (inString) {
			if (ch === '\\') at++;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') {
			inString = true;
			continue;
		}
		if (ch !== ',') continue;
		let ahead = at + 1;
		while (ahead < chars.length && /\s/.test(chars[ahead] as string)) ahead++;
		if (chars[ahead] === '}' || chars[ahead] === ']') chars[at] = ' ';
	}
	return chars.join('');
}
