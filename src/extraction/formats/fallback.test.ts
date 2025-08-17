import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractFallback } from './fallback'

test('fallback: extracts quoted strings and trims', () => {
	const out = extractFallback('  before \' x \' middle "y" after ')
	assert.deepEqual(out, ['x', 'y'])
})

test('fallback: handles multiple adjacent quoted strings and ignores unquoted', () => {
	const out = extractFallback('"a""b" c "d"')
	assert.deepEqual(out, ['a', 'b', 'd'])
})

test('fallback: handles text with no quoted strings (null match branch)', () => {
	// Test the ?? [] branch when regex.match() returns null
	const out = extractFallback('no quotes here at all')
	assert.deepEqual(out, [])
})

test('fallback: handles empty and whitespace-only quoted strings', () => {
	// Test the filter(Boolean) branch
	const out = extractFallback('"" "   " "valid"')
	assert.deepEqual(out, ['valid'])
})
