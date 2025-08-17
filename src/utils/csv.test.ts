import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { splitCsvLine } from './csv'

test('splitCsvLine: empty line', () => {
	assert.deepEqual(splitCsvLine(''), [])
})

test('splitCsvLine: basic', () => {
	assert.deepEqual(splitCsvLine('a,b , c '), ['a', 'b', 'c'])
})

test('splitCsvLine: quoted commas and escaped quotes', () => {
	assert.deepEqual(splitCsvLine('"a,1","x""y",z'), ['a,1', 'x"y', 'z'])
})
