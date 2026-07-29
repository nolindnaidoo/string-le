import { beforeEach, describe, expect, it } from 'vitest';
import {
	_createExtensionContext,
	_resetMockState,
	_setConfig,
	window,
} from '../__mocks__/vscode';
import { createTelemetry } from './telemetry';

type MockChannel = ReturnType<typeof window.createOutputChannel>;

function captureChannel(): { channel: () => MockChannel | undefined } {
	const originalCreate = window.createOutputChannel;
	let captured: MockChannel | undefined;
	window.createOutputChannel = (name: string) => {
		captured = originalCreate(name);
		return captured;
	};
	return { channel: () => captured };
}

describe('telemetry', () => {
	beforeEach(() => {
		_resetMockState();
	});

	it('writes nothing when disabled (default)', () => {
		const capture = captureChannel();
		const telemetry = createTelemetry(_createExtensionContext() as never);

		telemetry.event('extract');

		expect(capture.channel()?._lines).toEqual([]);
	});

	it('logs locally with props when enabled', () => {
		_setConfig('string-le.telemetryEnabled', true);
		const capture = captureChannel();
		const telemetry = createTelemetry(_createExtensionContext() as never);

		telemetry.event('extracted', { count: '3' });

		expect(capture.channel()?._lines).toHaveLength(1);
		expect(capture.channel()?._lines[0]).toContain('extracted');
		expect(capture.channel()?._lines[0]).toContain('"count":"3"');
	});
});
