import { beforeEach, describe, expect, it } from 'vitest';
import {
	_codeActionProviders,
	_createDocument,
	_createExtensionContext,
	_resetMockState,
} from '../__mocks__/vscode';
import { registerCodeActions } from './codeActions';

type Provider = {
	provideCodeActions: (
		document: unknown,
	) => Array<{ title: string; command: { command: string } }> | undefined;
};

describe('code actions', () => {
	beforeEach(() => {
		_resetMockState();
	});

	it('registers a provider for every supported language', () => {
		const context = _createExtensionContext();
		registerCodeActions(context as never);

		expect(_codeActionProviders().map((p) => p.language)).toEqual([
			'json',
			'yaml',
			'csv',
			'toml',
			'ini',
			'dotenv',
			'env',
		]);
	});

	it('offers the extract action for non-empty documents only', () => {
		const context = _createExtensionContext();
		registerCodeActions(context as never);
		const provider = _codeActionProviders()[0]?.provider as Provider;

		const actions = provider.provideCodeActions(
			_createDocument({ content: '{"a": "b"}' }),
		);
		expect(actions?.[0]?.command.command).toBe('string-le.extractStrings');

		expect(
			provider.provideCodeActions(_createDocument({ content: '   ' })),
		).toBeUndefined();
	});
});
