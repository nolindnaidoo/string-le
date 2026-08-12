import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { capped, createDiagnosticSink, isOk, readMaxResults } from './envelope';
import { FALLBACK_FORMAT, resolveFormat, SUPPORTED_FORMATS } from './fileType';
import { TOOLS } from './tools';
import { createResponder, serve } from './transport';

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
		expect(resolveFormat(' conf ', undefined)).toBe('ini');
	});

	it('resolves a dotfile whose whole name is the type', () => {
		expect(resolveFormat(undefined, '.env')).toBe('env');
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

	it('echoes the protocol version the client asked for', async () => {
		const reply = await respond({
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: { protocolVersion: '2024-11-05' },
		});
		expect(reply?.result?.protocolVersion).toBe('2024-11-05');
		expect(reply?.result?.serverInfo).toEqual({
			name: 'string-le',
			version: '1.0.0',
		});
	});

	it('does not reply to a notification', async () => {
		// A reply to a notification is the classic way to wedge a client.
		expect(
			await respond({ jsonrpc: '2.0', method: 'notifications/initialized' }),
		).toBeNull();
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

	it('ignores blank lines', async () => {
		const { input, replies } = harness();
		input.emit('data', '\n\n{"jsonrpc":"2.0","id":6,"method":"ping"}\n');
		await settle();
		expect(replies()).toHaveLength(1);
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
