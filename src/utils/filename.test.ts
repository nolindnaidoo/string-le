import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectEnvExtension } from './filename'

test('detectEnvExtension: env variants map to env', () => {
	assert.equal(detectEnvExtension('/a/.env'), 'env')
	assert.equal(detectEnvExtension('/a/.env.local'), 'env')
	assert.equal(detectEnvExtension('/a/.env.prod'), 'env')
})

test('detectEnvExtension: regular extensions pass through', () => {
	assert.equal(detectEnvExtension('/a/file.json'), 'json')
	assert.equal(detectEnvExtension('/a/file.yaml'), 'yaml')
})

test('detectEnvExtension: exact .env file (first branch only)', () => {
	// Test where ONLY the first condition is true: baseName === '.env'
	assert.equal(detectEnvExtension('.env'), 'env')
	assert.equal(detectEnvExtension('/path/to/.env'), 'env')
})

test('detectEnvExtension: .env prefix but not exact match (second branch)', () => {
	// Test the second condition: baseName.startsWith('.env') but not === '.env'
	assert.equal(detectEnvExtension('.env.development'), 'env')
	assert.equal(detectEnvExtension('.env.production'), 'env')
})

test('detectEnvExtension: file without extension', () => {
	// Test edge case with no extension
	assert.equal(detectEnvExtension('README'), '')
	assert.equal(detectEnvExtension('/path/to/Dockerfile'), '')
})

test('detectEnvExtension: non-env files (false branch)', () => {
	// Test files that don't match the .env conditions at all
	assert.equal(detectEnvExtension('environment.json'), 'json')
	assert.equal(detectEnvExtension('config.env.json'), 'json')
	assert.equal(detectEnvExtension('package.json'), 'json')
	assert.equal(detectEnvExtension('src/test.ts'), 'ts')
})
