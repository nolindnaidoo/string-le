import { describe, expect, it } from 'vitest';
import { _createDocument } from '../__mocks__/vscode';
import { extractLines, joinLines } from './editorLines';

function editorWith(content: string): never {
	return { document: _createDocument({ content }) } as never;
}

describe("a document's lines and its trailing newline", () => {
	it('keeps a trailing newline at the end, not as an empty line to sort', () => {
		// Split as one more line, the empty string sorted to the top and the
		// sorted document began with a blank line.
		const document = extractLines(editorWith('b\na\n'));
		expect(document).toEqual({ lines: ['b', 'a'], terminated: true });
		expect(joinLines(document, [...document.lines].sort())).toBe('a\nb\n');
	});

	it('adds no newline to a document that had none', () => {
		const document = extractLines(editorWith('b\na'));
		expect(document).toEqual({ lines: ['b', 'a'], terminated: false });
		expect(joinLines(document, [...document.lines].sort())).toBe('a\nb');
	});

	it('reads CRLF, and writes LF', () => {
		const document = extractLines(editorWith('b\r\na\r\n'));
		expect(document).toEqual({ lines: ['b', 'a'], terminated: true });
		expect(joinLines(document, document.lines)).toBe('b\na\n');
	});

	it('keeps a blank line inside the document as a line', () => {
		expect(extractLines(editorWith('b\n\na\n')).lines).toEqual(['b', '', 'a']);
	});

	it('reads an empty document as one empty line', () => {
		const document = extractLines(editorWith(''));
		expect(document).toEqual({ lines: [''], terminated: false });
		expect(joinLines(document, document.lines)).toBe('');
	});
});
