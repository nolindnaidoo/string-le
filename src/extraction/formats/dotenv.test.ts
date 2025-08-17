import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractDotenv } from './dotenv'

test('dotenv: ignores comments and empty, handles export and quotes', () => {
	const env = '# c\nexport A=one\nB=" two "\nC=\nD=3\n'
	const out = extractDotenv(env)
	assert.deepEqual(out, ['one', 'two', '3'])
})

test('dotenv: lines without equals are skipped; single quotes trimmed', () => {
	const env = "NOEQUALS\nSINGLE=' x '\n"
	const out = extractDotenv(env)
	assert.deepEqual(out, ['x'])
})
