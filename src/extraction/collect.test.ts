import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectStrings } from './collect'

test('collectStrings: collects and trims nested strings', () => {
	const input = { a: '  x ', b: [null, 1, ' y', { c: 'z  ' }] }
	const out = collectStrings(input)
	assert.deepEqual(out, ['x', 'y', 'z'])
})

test('collectStrings: ignores non-strings and empty', () => {
	const input = { a: 0, b: false, c: undefined, d: null, e: ['   '] }
	const out = collectStrings(input)
	assert.deepEqual(out, [])
})

test('collectStrings: root null/undefined returns empty', () => {
	assert.deepEqual(collectStrings(undefined as unknown as never), [])
	assert.deepEqual(collectStrings(null as unknown as never), [])
})

test('collectStrings: array root handled', () => {
	const out = collectStrings([' a ', 1, { x: ' b ' }])
	assert.deepEqual(out, ['a', 'b'])
})
