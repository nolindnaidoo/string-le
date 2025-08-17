import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractToml } from './toml'

test('toml: extracts nested strings', () => {
	const toml = 'a = "x"\n[b]\nc = "y"\n'
	const out = extractToml(toml)
	assert.deepEqual(out, ['x', 'y'])
})

test('toml: onParseError invoked on invalid TOML', () => {
	let called = ''
	const out = extractToml('a = [', {
		onParseError: (m) => {
			called = m
		},
	})
	assert.deepEqual(out, [])
	assert.ok(called.startsWith('Invalid TOML:'))
})
