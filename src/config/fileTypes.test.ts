import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { isSupportedFileType, normalizeFileType } from './fileTypes'

test('fileTypes: isSupportedFileType recognizes known types', () => {
	for (const t of ['json', 'yaml', 'yml', 'csv', 'toml', 'ini', 'env', 'fallback']) {
		assert.ok(isSupportedFileType(t))
	}
	assert.ok(!isSupportedFileType('unknown' as string))
})

test('fileTypes: normalizeFileType trims, lowercases, and validates', () => {
	assert.equal(normalizeFileType('  JSON  '), 'json')
	assert.equal(normalizeFileType('  YML'), 'yml')
	assert.equal(normalizeFileType(''), undefined)
	assert.equal(normalizeFileType('x'), undefined)
})
