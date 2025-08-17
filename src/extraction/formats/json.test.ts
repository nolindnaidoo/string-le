import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractJson } from './json'

test('json: extracts nested strings', () => {
	const out = extractJson('{"a":"x","b":[{"c":"y"}]}')
	assert.deepEqual(out, ['x', 'y'])
})

test('json: onParseError invoked on invalid JSON', () => {
	let called = ''
	const out = extractJson('{invalid', {
		onParseError: (m) => {
			called = m
		},
	})
	assert.deepEqual(out, [])
	assert.ok(called.startsWith('Invalid JSON:'))
})
