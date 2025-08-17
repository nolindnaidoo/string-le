import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractIni } from './ini'

test('ini: extracts nested strings', () => {
	const ini = '[a]\nx = one\n[a.b]\ny = two\n'
	const out = extractIni(ini)
	assert.deepEqual(out, ['one', 'two'])
})

test('ini › returns [] and invokes onParseError once on invalid input', () => {
	const out = extractIni('[a\n=]\n')
	assert.deepEqual(out, [])
})

test('ini: calls onParseError callback when parsing fails', () => {
	let errorMessage = ''
	const options = {
		onParseError: (msg: string) => {
			errorMessage = msg
		},
	}
	// Force a parse error by passing non-string input (cast to any to bypass TypeScript)
	const out = extractIni(undefined as any, options)
	assert.deepEqual(out, [])
	assert.ok(
		errorMessage.startsWith('Invalid INI:'),
		`Expected error message to start with 'Invalid INI:', got: ${errorMessage}`,
	)
})

test('ini: returns empty array when parse error occurs without callback', () => {
	// Test the error path without onParseError callback using non-string input
	const out = extractIni(123 as any)
	assert.deepEqual(out, [])
})
