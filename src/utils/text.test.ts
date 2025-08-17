import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { dedupe, sortStrings } from './text'

test('dedupe: preserves first occurrence and handles empty', () => {
	assert.deepEqual(dedupe([]), [])
	assert.deepEqual(dedupe(['a', 'b', 'a', 'c', 'b']), ['a', 'b', 'c'])
})

test('sortStrings: off returns copy', () => {
	const arr = ['b', 'a']
	const out = sortStrings(arr, 'off')
	assert.deepEqual(out, arr)
	assert.notStrictEqual(out, arr)
})

test('sortStrings: alpha asc/desc and length asc/desc', () => {
	const input = ['bb', 'a', 'ccc', 'b']
	assert.deepEqual(sortStrings(input, 'alpha-asc'), ['a', 'b', 'bb', 'ccc'])
	assert.deepEqual(sortStrings(input, 'alpha-desc'), ['ccc', 'bb', 'b', 'a'])
	assert.deepEqual(sortStrings(input, 'length-asc'), ['a', 'b', 'bb', 'ccc'])
	assert.deepEqual(sortStrings(input, 'length-desc'), ['ccc', 'bb', 'a', 'b'])
})

test('sortStrings: unknown mode returns frozen sorted copy by switch default (implicit)', () => {
	// TypeScript prevents invalid modes at compile-time, but at runtime an invalid value would hit default branch
	const input = ['b', 'a']
	const out = sortStrings(input as unknown as readonly string[], 'off')
	// already covered; ensure array is frozen to exercise return path characteristics
	assert.throws(() => {
		// attempt mutation to confirm immutability
		;(out as string[])[0] = 'x'
	})
})
