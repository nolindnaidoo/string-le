import * as assert from 'assert'
import { test } from 'node:test'
import { applyTrimMode } from '../utils/trim'

test('trim util: both (default) trims leading and trailing', () => {
    const initial = '  line 1  \n  line 2  '
    const expected = 'line 1\nline 2'
    const result = initial.split('\n').map((l) => applyTrimMode(l, 'both')).join('\n')
    assert.strictEqual(result, expected)
})

test('trim util: leading only', () => {
    const initial = '  line 1  \n\t\tline 2  '
    const expected = 'line 1  \nline 2  '
    const result = initial.split('\n').map((l) => applyTrimMode(l, 'leading')).join('\n')
    assert.strictEqual(result, expected)
})

test('trim util: trailing only', () => {
    const initial = '  line 1  \n  line 2\t\t'
    const expected = '  line 1\n  line 2'
    const result = initial.split('\n').map((l) => applyTrimMode(l, 'trailing')).join('\n')
    assert.strictEqual(result, expected)
})
