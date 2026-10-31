import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { capped, createDiagnosticSink, isOk, readMaxResults } from './envelope';
import { FALLBACK_FORMAT, resolveFormat, SUPPORTED_FORMATS } from './fileType';
import { TOOLS } from './tools';
import { createResponder, MAX_FRAME_BYTES, serve } from './transport';

/**
 * The MCP layer: the normalisation boundary, the tool table and the protocol.
 *
 * The engine is covered by its own characterization goldens. What is new here
 * is the translation between an agent's request and that engine. This engine
 * has no result envelope — it returns a bare array and reports problems through
 * a callback — so the interesting mistake is losing those reports entirely.
 */

describe('envelope: the diagnostic sink', () => {
	it('is ok when the engine reported nothing', () => {
		const sink = createDiagnosticSink();
		expect(sink.diagnostics()).toEqual([]);
		expect(isOk(sink.diagnostics())).toBe(true);
	});

	it('captures what the callback reports', () => {
		// onParseError is the engine's only error channel and it is
		// fire-and-forget: a caller that does not collect loses every parse
		// failure silently.
		const sink = createDiagnosticSink();
		sink.onParseError('unterminated string');
		expect(sink.diagnostics()).toHaveLength(1);
		expect(sink.diagnostics()[0]?.message).toBe('unterminated string');
		expect(isOk(sink.diagnostics())).toBe(false);
	});
});

describe('envelope: result cap', () => {
	it('reports truncation honestly when it drops items', () => {
		const { items, truncated } = capped([1, 2, 3, 4, 5], 2);
		expect(items).toEqual([1, 2]);
		expect(truncated).toBe(true);
	});

	it('does not claim truncation when everything fits', () => {
		const { items, truncated } = capped([1, 2], 5);
		expect(items).toHaveLength(2);
		expect(truncated).toBe(false);
	});

	it('rejects a maxResults a tool cannot honour', () => {
		expect(() => readMaxResults({ maxResults: 0 })).toThrow(/positive integer/);
		expect(() => readMaxResults({ maxResults: 1.5 })).toThrow();
		expect(() => readMaxResults({ maxResults: 'ten' })).toThrow();
	});

	it('clamps an oversized request rather than refusing it', () => {
		expect(readMaxResults({ maxResults: 999999 })).toBe(5000);
	});
});

describe('fileType: tolerant resolution', () => {
	it('accepts the extractor keys the engine registers', () => {
		expect(resolveFormat('json', undefined)).toBe('json');
	});

	it('accepts the shorthands an agent actually sends', () => {
		expect(resolveFormat('yml', undefined)).toBe('yaml');
		expect(resolveFormat('.TOML', undefined)).toBe('toml');
		expect(resolveFormat(' jsonc ', undefined)).toBe('jsonc');
		expect(resolveFormat(undefined, 'data.tsv')).toBe('tsv');
		// `conf` is not INI: a redis or nginx config has no sections and no `=`,
		// and the INI reader took it as a valid document holding nothing. The
		// crate reads it as text, and so does this.
		expect(resolveFormat(' conf ', undefined)).toBe('fallback');
	});

	it('resolves a dotfile whose whole name is the type', () => {
		expect(resolveFormat(undefined, '.env')).toBe('env');
	});

	it('reads every dotenv spelling as dotenv, and only those', () => {
		// `.env.local` split on its last dot asks `local` for a format and fell
		// to the quoted-run scan, which finds nothing in `NAME=plain`. The
		// crate resolves these to `env`; the shared tool must agree.
		for (const name of [
			'.env.local',
			'.env.production',
			'.env.test.local',
			'app.env',
			'env',
		]) {
			expect(resolveFormat(undefined, name), name).toBe('env');
		}
		for (const name of [
			'.envrc',
			'environment.json',
			'env.ts',
			'sender.env.rs',
		]) {
			expect(resolveFormat(undefined, name), name).not.toBe('env');
		}
	});

	it('resolves a path by its last segment, whichever separator wrote it', () => {
		// A folder scan hands over `src/.env.local`; the directory must not
		// hide the dotfile's whole name, and `a.env/` must not make a text
		// file dotenv.
		expect(resolveFormat(undefined, 'src/.env.local')).toBe('env');
		expect(resolveFormat(undefined, 'src\\config\\.env')).toBe('env');
		expect(resolveFormat(undefined, 'config/app.toml')).toBe('toml');
		expect(resolveFormat(undefined, 'a.env/notes.txt')).toBe(FALLBACK_FORMAT);
	});

	it('infers from a filename when no format is given', () => {
		expect(resolveFormat(undefined, 'config.toml')).toBe('toml');
	});

	it('falls back to plain text rather than refusing', () => {
		// The engine registers an extractor for exactly this case, so refusing
		// would be the actual bug.
		expect(resolveFormat('klingon', 'a.klingon')).toBe(FALLBACK_FORMAT);
		expect(resolveFormat(undefined, undefined)).toBe(FALLBACK_FORMAT);
	});

	it('advertises every format that resolves, and only those', () => {
		expect(SUPPORTED_FORMATS).toContain('json');
		expect(SUPPORTED_FORMATS).toContain('python');
		// `fallback` is advertised on purpose: a .py file is read as Python
		// now, so asking for the quoted runs instead has to be sayable.
		expect(SUPPORTED_FORMATS).toContain(FALLBACK_FORMAT);
		for (const format of SUPPORTED_FORMATS) {
			expect(resolveFormat(format, undefined)).toBe(format);
		}
	});

	it('does not read a prototype key as a format', () => {
		// On a plain object `constructor` and `__proto__` are hits, and the
		// crate's server answers `fallback` for both; this one answered with a
		// function for the file type and then failed inside the engine.
		for (const name of [
			'constructor',
			'__proto__',
			'hasOwnProperty',
			'valueOf',
		]) {
			expect(resolveFormat(name, undefined), name).toBe(FALLBACK_FORMAT);
			expect(resolveFormat(undefined, name), name).toBe(FALLBACK_FORMAT);
			expect(resolveFormat(undefined, `a.${name}`), name).toBe(FALLBACK_FORMAT);
		}
	});

	it('reads a source language by its id and by its extension', () => {
		expect(resolveFormat('python', undefined)).toBe('python');
		expect(resolveFormat(undefined, 'main.rs')).toBe('rust');
		expect(resolveFormat('typescriptreact', undefined)).toBe('typescript');
		expect(resolveFormat(undefined, 'README.md')).toBe(FALLBACK_FORMAT);
	});
});

describe('tool table', () => {
	it('pins the tool names', () => {
		expect(TOOLS.map((t) => t.name)).toEqual(['extract_strings']);
	});

	it('gives every tool a description and a closed schema', () => {
		for (const tool of TOOLS) {
			expect(tool.description.length).toBeGreaterThan(20);
			expect(tool.inputSchema.type).toBe('object');
			expect(tool.inputSchema.additionalProperties).toBe(false);
			expect(typeof tool.handler).toBe('function');
		}
	});

	it('caps results by default rather than leaving it unbounded', () => {
		const schema = TOOLS[0]?.inputSchema as {
			properties: { maxResults: { default: number } };
		};
		expect(schema.properties.maxResults.default).toBe(500);
	});
});

describe('extract_strings', () => {
	const call = async (args: Record<string, unknown>) => {
		const tool = TOOLS[0];
		if (!tool) throw new Error('no tool');
		return (await tool.handler(args)) as {
			ok: boolean;
			data: { strings: string[]; fileType: string };
			meta: { count: number; truncated: boolean };
		};
	};

	it('parses a known format', async () => {
		const result = await call({
			content: '{"name": "widget", "owner": "team"}',
			format: 'json',
		});
		expect(result.data.strings).toContain('widget');
		expect(result.data.strings).toContain('team');
		expect(result.ok).toBe(true);
	});

	it('falls back to quoted strings when no format is given', async () => {
		// The fallback extractor matches quoted runs, not arbitrary prose — so
		// the tool description promises exactly that and no more.
		const result = await call({
			content: 'const a = "alpha"; let b = `beta`;',
		});
		expect(result.data.fileType).toBe(FALLBACK_FORMAT);
		expect(result.data.strings).toContain('alpha');
		expect(result.data.strings).toContain('beta');
	});

	it('returns nothing for unquoted prose, rather than pretending', async () => {
		const result = await call({ content: 'alpha beta gamma' });
		expect(result.data.strings).toEqual([]);
		expect(result.ok).toBe(true);
	});

	it('collapses repeats only when asked', async () => {
		const content = '{"a": "same", "b": "same"}';
		const kept = await call({ content, format: 'json' });
		const deduped = await call({ content, format: 'json', dedupe: true });
		expect(kept.meta.count).toBe(2);
		expect(deduped.meta.count).toBe(1);
	});

	it('truncates at maxResults and says so', async () => {
		const content = JSON.stringify(
			Object.fromEntries(
				Array.from({ length: 10 }, (_, i) => [`k${i}`, `v${i}`]),
			),
		);
		const result = await call({ content, format: 'json', maxResults: 3 });
		expect(result.meta.count).toBe(3);
		expect(result.meta.truncated).toBe(true);
	});

	it('surfaces a parse failure instead of returning a silent empty result', async () => {
		const result = await call({ content: '{"broken": ', format: 'json' });
		expect(result.ok).toBe(false);
	});

	it('answers a prototype-named format the way the crate does', async () => {
		const result = await call({ content: 'x = "a"', format: 'constructor' });
		expect(result.ok).toBe(true);
		expect(result.data).toEqual({ strings: ['a'], fileType: FALLBACK_FORMAT });
		const byName = await call({ content: 'x = "a"', filename: '__proto__' });
		expect(byName.data.fileType).toBe(FALLBACK_FORMAT);
	});

	it('requires content', async () => {
		await expect(call({ format: 'json' })).rejects.toThrow(
			/content is required/,
		);
	});
});

describe('protocol', () => {
	const respond = createResponder(
		{ name: 'string-le', version: '1.0.0' },
		TOOLS,
	);

	it("answers with its own protocol version, as the crate's server does", async () => {
		const reply = await respond({
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: { protocolVersion: '2024-11-05' },
		});
		expect(reply?.result?.protocolVersion).toBe('2025-06-18');
		expect(reply?.result?.capabilities).toEqual({ tools: {} });
		expect(reply?.result?.serverInfo).toEqual({
			name: 'string-le',
			version: '1.0.0',
		});
	});

	it('does not reply to a notification, a null id included', async () => {
		// A reply to a notification is the classic way to wedge a client. An
		// initialize with no id was answered with `id: null`.
		expect(
			await respond({ jsonrpc: '2.0', method: 'notifications/initialized' }),
		).toBeNull();
		expect(
			await respond({ jsonrpc: '2.0', id: null, method: 'initialize' }),
		).toBeNull();
		expect(await respond({ jsonrpc: '2.0', method: 'initialize' })).toBeNull();
	});

	it("refuses notifications/initialized sent with an id as a method it does not implement, as the crate's server does", async () => {
		const reply = await respond({
			jsonrpc: '2.0',
			id: 7,
			method: 'notifications/initialized',
		});
		expect(reply?.error?.code).toBe(-32601);
	});

	it('refuses in the words the other two servers use', async () => {
		// Three servers ship from this repository; a client must not be able
		// to tell them apart by what it sent.
		expect(
			(await respond({ jsonrpc: '2.0', id: 1, method: 'resources/list' }))
				?.error?.message,
		).toBe('Unknown method: resources/list');
		expect(
			(
				await respond({
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/call',
					params: { name: 'nope' },
				})
			)?.error?.message,
		).toBe('Unknown tool: nope');
		expect(
			(await respond({ jsonrpc: '2.0', id: 1, method: 'tools/call' }))?.error
				?.message,
		).toBe('tools/call requires a string `name`');
		expect(
			(
				await respond({
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/call',
					params: { name: 3 },
				})
			)?.error?.message,
		).toBe('tools/call requires a string `name`');
	});

	it('reports an unknown method as a JSON-RPC error', async () => {
		const reply = await respond({ jsonrpc: '2.0', id: 2, method: 'nope' });
		expect(reply?.error?.code).toBe(-32601);
	});

	it('reports an unknown tool without killing the connection', async () => {
		const reply = await respond({
			jsonrpc: '2.0',
			id: 3,
			method: 'tools/call',
			params: { name: 'no_such_tool', arguments: {} },
		});
		expect(reply?.error?.code).toBe(-32602);
	});

	it('returns a tool failure as a result, not a protocol error', async () => {
		// A model can read an isError result and correct itself; a JSON-RPC error
		// reads as "the server is broken".
		const reply = await respond({
			jsonrpc: '2.0',
			id: 4,
			method: 'tools/call',
			params: { name: 'extract_strings', arguments: {} },
		});
		expect(reply?.error).toBeUndefined();
		expect(reply?.result?.isError).toBe(true);
	});
});

describe('serve: the stdio loop', () => {
	/** A fake stdin/stdout pair so the loop can be driven without a process. */
	function harness() {
		const input = new EventEmitter() as EventEmitter & {
			setEncoding?: (e: string) => void;
		};
		const written: string[] = [];
		const output = {
			write: (chunk: string) => {
				written.push(chunk);
				return true;
			},
		};
		serve(
			{ name: 'string-le', version: '1.0.0' },
			TOOLS,
			input as never,
			output as never,
		);
		const replies = () =>
			written
				.join('')
				.split('\n')
				.filter(Boolean)
				.map((l) => JSON.parse(l));
		return { input, replies };
	}

	const settle = () => new Promise((r) => setTimeout(r, 20));

	it('answers a request delivered as one line', async () => {
		const { input, replies } = harness();
		input.emit('data', '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');
		await settle();
		expect(replies()[0]?.result?.tools).toHaveLength(1);
	});

	it('reassembles a request split across chunks', async () => {
		// stdin delivers whatever the OS gives it; a request arriving in two
		// pieces must not be dropped or double-parsed.
		const { input, replies } = harness();
		input.emit('data', '{"jsonrpc":"2.0","id":2,"me');
		input.emit('data', 'thod":"ping"}\n');
		await settle();
		expect(replies()[0]?.id).toBe(2);
	});

	it('handles several requests in one chunk', async () => {
		const { input, replies } = harness();
		input.emit(
			'data',
			'{"jsonrpc":"2.0","id":3,"method":"ping"}\n{"jsonrpc":"2.0","id":4,"method":"ping"}\n',
		);
		await settle();
		expect(replies().map((r) => r.id)).toEqual([3, 4]);
	});

	it('reports malformed JSON without dying', async () => {
		// One bad line from a client must not take the server down for everyone.
		const { input, replies } = harness();
		input.emit('data', 'not json at all\n');
		input.emit('data', '{"jsonrpc":"2.0","id":5,"method":"ping"}\n');
		await settle();
		expect(replies()[0]?.error?.code).toBe(-32700);
		expect(replies()[1]?.id).toBe(5);
	});

	it('rejects a payload that is not a JSON-RPC request', async () => {
		const { input, replies } = harness();
		input.emit('data', '{"hello":"world"}\n');
		await settle();
		expect(replies()[0]?.error?.code).toBe(-32700);
	});

	it("refuses a frame led by a byte order mark as not JSON, as the crate's server does", async () => {
		// JavaScript's trim strips the mark; Rust's does not, and serde_json
		// refuses it. The loop trims as Rust trims.
		const { input, replies } = harness();
		input.emit('data', '\uFEFF{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
		input.emit('data', '\u0085 \t\n{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
		await settle();
		expect(replies().map((r) => r.error?.message ?? r.id)).toEqual([
			'Invalid JSON',
			2,
		]);
	});

	it('ignores blank lines', async () => {
		const { input, replies } = harness();
		input.emit('data', '\n\n{"jsonrpc":"2.0","id":6,"method":"ping"}\n');
		await settle();
		expect(replies()).toHaveLength(1);
	});

	it('refuses a frame over the limit whose newline arrives in the same chunk', async () => {
		// The over-limit check on the leftover buffer never sees a line that
		// arrives whole; the limit is on the line, not on its framing.
		const { input, replies } = harness();
		input.emit(
			'data',
			`${'x'.repeat(MAX_FRAME_BYTES + 1)}\n{"jsonrpc":"2.0","id":8,"method":"ping"}\n`,
		);
		await settle();
		expect(replies().map((r) => r.error?.message ?? r.id)).toEqual([
			`Message exceeds the ${MAX_FRAME_BYTES} byte frame limit`,
			8,
		]);
	});

	it('refuses a frame over the limit and keeps serving', async () => {
		// Input with no newline grew the buffer without bound: 64 MiB of it
		// held the process at 980 MB and answered nothing. Past the limit the
		// frame is refused with a parse error, the rest of that line is
		// dropped as it arrives, and the next line is served.
		const { input, replies } = harness();
		input.emit('data', 'x'.repeat(MAX_FRAME_BYTES + 1));
		input.emit('data', 'y'.repeat(1000));
		input.emit('data', 'z\n{"jsonrpc":"2.0","id":9,"method":"ping"}\n');
		await settle();
		expect(replies()).toEqual([
			{
				jsonrpc: '2.0',
				id: null,
				error: {
					code: -32700,
					message: `Message exceeds the ${MAX_FRAME_BYTES} byte frame limit`,
				},
			},
			{ jsonrpc: '2.0', id: 9, result: {} },
		]);
	});

	it('writes nothing for a notification', async () => {
		const { input, replies } = harness();
		input.emit(
			'data',
			'{"jsonrpc":"2.0","method":"notifications/initialized"}\n',
		);
		await settle();
		expect(replies()).toHaveLength(0);
	});
});

describe('serve: a client that reads slowly', () => {
	// The pipe to the client fills; `write` answers false. Every reply after
	// that would sit in this process until the client drained the pipe, so
	// the server stops reading until it does: what it holds is bounded by
	// the requests already in flight, not by everything the client sent.
	function slowReader() {
		const input = new PassThrough();
		const written: string[] = [];
		let full = false;
		const output = Object.assign(new EventEmitter(), {
			write: (chunk: string) => {
				written.push(chunk);
				return !full;
			},
		});
		serve(
			{ name: 'string-le', version: '1.0.0' },
			TOOLS,
			input,
			output as never,
		);
		return {
			input,
			output,
			written,
			fill: () => {
				full = true;
			},
			drain: () => {
				full = false;
				output.emit('drain');
			},
		};
	}

	const settle = () => new Promise((r) => setTimeout(r, 20));
	const ping = (id: number) => `{"jsonrpc":"2.0","id":${id},"method":"ping"}\n`;

	it('stops reading while the pipe is full and resumes when it drains', async () => {
		const reader = slowReader();
		reader.fill();
		reader.input.write(ping(1));
		await settle();
		expect(reader.written).toHaveLength(1);
		expect(reader.input.isPaused()).toBe(true);

		reader.input.write(ping(2));
		await settle();
		expect(reader.written).toHaveLength(1);

		reader.drain();
		await settle();
		expect(reader.input.isPaused()).toBe(false);
		expect(reader.written).toHaveLength(2);
		expect(JSON.parse(reader.written[1] ?? '').id).toBe(2);
	});

	it('reads on while the pipe accepts every reply', async () => {
		const reader = slowReader();
		reader.input.write(ping(1) + ping(2) + ping(3));
		await settle();
		expect(reader.written).toHaveLength(3);
		expect(reader.input.isPaused()).toBe(false);
	});
});
