import { describe, expect, it } from 'vitest';
import { extractStrings } from './extract';

describe('extractStrings', () => {
	it('should trims text and returns empty for blank', () => {
		expect(extractStrings('   ', 'json')).toEqual([]);
	});

	it('should unknown type uses fallback', () => {
		const out = extractStrings('foo "bar" baz', 'unknown');
		expect(out).toEqual(['bar']);
	});

	it('reads a prototype name as an unknown type, not as an extractor', () => {
		// `EXTRACTORS.constructor` is `Object` on a plain lookup, and calling it
		// as an extractor hands the document back as a String object.
		for (const name of ['constructor', '__proto__', 'toString']) {
			expect(extractStrings('foo "bar" baz', name), name).toEqual(['bar']);
		}
	});

	it('should trims and normalizes fileType key before routing', () => {
		const out = extractStrings('{"a":"x"}', '  JSON  ');
		expect(out).toEqual(['x']);
	});

	// JSON extraction tests
	it('should JSON with nested objects', () => {
		const json = JSON.stringify({
			user: {
				name: 'John Doe',
				email: 'john@example.com',
				preferences: {
					theme: 'dark',
					language: 'en',
				},
			},
			settings: {
				notifications: true,
				privacy: 'strict',
			},
		});

		const result = extractStrings(json, 'json');
		expect(result).toEqual([
			'John Doe',
			'john@example.com',
			'dark',
			'en',
			'strict',
		]);
	});

	it('should JSON with arrays', () => {
		const json = JSON.stringify({
			tags: ['urgent', 'important', 'review'],
			users: [
				{ name: 'Alice', role: 'admin' },
				{ name: 'Bob', role: 'user' },
			],
		});

		const result = extractStrings(json, 'json');
		expect(result).toEqual([
			'urgent',
			'important',
			'review',
			'Alice',
			'admin',
			'Bob',
			'user',
		]);
	});

	it('should JSON with empty values', () => {
		const json = JSON.stringify({
			name: '',
			description: null,
			tags: [],
			active: false,
		});

		const result = extractStrings(json, 'json');
		expect(result).toEqual([]); // No strings, only boolean/null/empty
	});

	it('should JSON with malformed input', () => {
		const malformed = '{"name": "test", "invalid": }';
		const result = extractStrings(malformed, 'json');
		expect(result).toEqual([]);
	});

	// CSV extraction tests
	it('should CSV with headers', () => {
		const csv = `name,email,role
  John Doe,john@example.com,admin
  Jane Smith,jane@example.com,user`;

		const result = extractStrings(csv, 'csv');
		expect(result).toEqual([
			'name',
			'email',
			'role',
			'John Doe',
			'john@example.com',
			'admin',
			'Jane Smith',
			'jane@example.com',
			'user',
		]);
	});

	it('should CSV with quoted values', () => {
		const csv = `"Product Name","Description","Price"
  "Widget A","A great widget","$19.99"
  "Widget B","Another widget","$29.99"`;

		const result = extractStrings(csv, 'csv');
		expect(result).toEqual([
			'Product Name',
			'Description',
			'Price',
			'Widget A',
			'A great widget',
			'$19.99',
			'Widget B',
			'Another widget',
			'$29.99',
		]);
	});

	it('should CSV with empty rows', () => {
		const csv = `name,email
  John,john@example.com

  Jane,jane@example.com`;

		const result = extractStrings(csv, 'csv');
		expect(result).toEqual([
			'name',
			'email',
			'John',
			'john@example.com',
			'Jane',
			'jane@example.com',
		]);
	});

	// DotEnv extraction tests
	it('should DotEnv with various formats', () => {
		const dotenv = `# Database settings
  DB_HOST=localhost
  DB_PORT=5432
  DB_NAME=myapp
  DB_USER=admin
  DB_PASSWORD=secret123

  # Feature flags
  ENABLE_FEATURE_X=true
  ENABLE_FEATURE_Y=false
  API_URL=https://api.example.com`;

		const result = extractStrings(dotenv, 'env');
		expect(result).toEqual([
			'localhost',
			'5432',
			'myapp',
			'admin',
			'secret123',
			'true', // DotEnv values are all strings
			'false', // DotEnv values are all strings
			'https://api.example.com',
		]);
	});

	it('should DotEnv with quoted values', () => {
		const dotenv = `NAME="John Doe"
  DESCRIPTION='A great app'
  VERSION="1.0.0"`;

		const result = extractStrings(dotenv, 'env');
		expect(result).toEqual(['John Doe', 'A great app', '1.0.0']);
	});

	it('should DotEnv with empty values', () => {
		const dotenv = `EMPTY=
  QUOTED_EMPTY=""
  SPACE=" "`;

		const result = extractStrings(dotenv, 'env');
		expect(result).toEqual([' ']);
	});

	// Fallback extraction tests
	it('should fallback with various string patterns', () => {
		const text = `Hello "world" and 'universe'
    Also \`backticks\` and "nested 'quotes'"
    Empty "" and 'single' quotes`;

		const result = extractStrings(text, 'unknown');
		expect(result).toEqual([
			'world',
			'universe',
			'backticks',
			"nested 'quotes'",
			'single',
		]);
	});

	it('should fallback with no strings', () => {
		const text = `Just plain text without any quotes`;
		const result = extractStrings(text, 'unknown');
		expect(result).toEqual([]);
	});

	it('should fallback with mixed content', () => {
		const text = `Code: const x = "test";
  Comment: // This is a comment
  String: 'hello world'`;

		const result = extractStrings(text, 'unknown');
		expect(result).toEqual(['test', 'hello world']);
	});

	// Edge cases
	it('should very large JSON', () => {
		const largeObj = {
			items: Array.from({ length: 1000 }, (_, i) => ({
				id: i,
				name: `Item ${i}`,
				description: `Description for item ${i}`,
			})),
		};

		const json = JSON.stringify(largeObj);
		const result = extractStrings(json, 'json');

		// Should extract all string values
		expect(result.length).toBe(2000); // 1000 names + 1000 descriptions
		expect(result).toContain('Item 0');
		expect(result).toContain('Item 999');
		expect(result).toContain('Description for item 0');
		expect(result).toContain('Description for item 999');
	});

	it('should empty input', () => {
		expect(extractStrings('', 'json')).toEqual([]);
		expect(extractStrings('', 'csv')).toEqual([]);
		expect(extractStrings('', 'env')).toEqual([]);
		expect(extractStrings('', 'unknown')).toEqual([]);
	});

	it('should whitespace-only input', () => {
		expect(extractStrings('   \n\t  ', 'json')).toEqual([]);
		expect(extractStrings('   \n\t  ', 'csv')).toEqual([]);
		expect(extractStrings('   \n\t  ', 'env')).toEqual([]);
		expect(extractStrings('   \n\t  ', 'unknown')).toEqual([]);
	});
});
