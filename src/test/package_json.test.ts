import { test, assert, describe } from 'vitest';
import * as s from '@fuzdev/fuz_schema/schema.ts';

import {
	ExportValue,
	PackageJson,
	PackageJsonAuthor,
	PackageJsonExports
} from '#lib/package_json.ts';

describe('PackageJson', () => {
	test('parses a minimal package.json', () => {
		const value = { name: 'abc', version: '123' };
		const parsed = s.parse(PackageJson, value);
		assert.ok(parsed.ok);
		assert.strictEqual(parsed.value, value); // nothing changed, so no copy
	});

	test('fails without a `name`', () => {
		const parsed = s.parse(PackageJson, { version: '123' });
		assert.ok(!parsed.ok);
		assert.deepEqual(parsed.issues[0]!.path, ['name']);
		assert.throws(() => s.parse_or_throw(PackageJson, { version: '123' }), s.SchemaError);
	});

	test('keeps unknown keys', () => {
		const value = { name: 'abc', svelte: './src/index.js', publishConfig: { access: 'public' } };
		const parsed = s.parse(PackageJson, value);
		assert.ok(parsed.ok);
		assert.deepEqual(parsed.value, value);
	});

	test('parses `sideEffects` as a boolean or an array of strings', () => {
		const values = [false, true, ['./src/polyfill.js', '*.css'], []];

		for (const value of values) {
			const parsed = s.parse(PackageJson, { name: 'abc', sideEffects: value });
			assert.ok(parsed.ok);
			assert.deepEqual(parsed.value.sideEffects, value);
		}
	});

	test('parses an absent `sideEffects`', () => {
		const parsed = s.parse(PackageJson, { name: 'abc' });
		assert.ok(parsed.ok);
		assert.strictEqual(parsed.value.sideEffects, undefined);
		assert.ok(!('sideEffects' in parsed.value));
	});

	test('rejects invalid `sideEffects`', () => {
		const invalid_values = [
			'./src/polyfill.js', // a bare string is not a valid value
			1,
			null,
			['./src/polyfill.js', 1] // array items must be strings
		];

		for (const invalid_value of invalid_values) {
			const parsed = s.parse(PackageJson, { name: 'abc', sideEffects: invalid_value });
			assert.ok(!parsed.ok);
			assert.strictEqual(parsed.issues[0]!.path[0], 'sideEffects');
		}
	});

	test('`author` is optional, a string, or an object', () => {
		for (const author of ['A <a@b.co>', { name: 'A' }, { name: 'A', email: 'a@b.co' }]) {
			assert.ok(s.parse(PackageJson, { name: 'abc', author }).ok);
		}
		assert.ok(s.parse(PackageJson, { name: 'abc' }).ok);
		assert.ok(!s.parse(PackageJson, { name: 'abc', author: { email: 'a@b.co' } }).ok);
		assert.ok(!s.parse(PackageJson, { name: 'abc', author: { name: 'A', email: 'a' } }).ok);
		assert.ok(!s.parse(PackageJsonAuthor, { name: 'A', url: 'not a url' }).ok);
		// the type keeps `author` an optional key
		const empty: PackageJson = { name: '' };
		assert.ok(empty);
	});

	test('`glyph` is a single grapheme', () => {
		assert.ok(s.parse(PackageJson, { name: 'abc', glyph: '🦕' }).ok);
		assert.ok(s.parse(PackageJson, { name: 'abc', glyph: '👩‍👩‍👧' }).ok);
		assert.ok(!s.parse(PackageJson, { name: 'abc', glyph: 'ab' }).ok);
		assert.ok(!s.parse(PackageJson, { name: 'abc', glyph: '' }).ok);
	});

	test('a `glyph` that is not a single grapheme reads as one', () => {
		const parsed = s.parse(PackageJson, { name: 'abc', glyph: 'ab' });
		assert.ok(!parsed.ok);
		assert.deepEqual(parsed.issues.map(s.format_issue), [
			'glyph: expected a single unicode character, received string'
		]);
	});

	test('empty `exports` become an own `undefined` key', () => {
		const parsed = s.parse(PackageJson, { name: 'abc', exports: {} });
		assert.ok(parsed.ok);
		assert.ok('exports' in parsed.value);
		assert.strictEqual(parsed.value.exports, undefined);
	});

	test('a `URL` is left as written', () => {
		const homepage = ' https://fuz.dev/ ';
		const parsed = s.parse(PackageJson, { name: 'abc', homepage });
		assert.ok(parsed.ok);
		assert.strictEqual(parsed.value.homepage, homepage);
	});

	describe('an own `__proto__` key, as `JSON.parse` makes one', () => {
		test('is kept at the top level, which passes unknown keys through', () => {
			const value = JSON.parse('{"name": "abc", "__proto__": {"x": 1}}');
			const parsed = s.parse(PackageJson, value);
			assert.ok(parsed.ok);
			assert.strictEqual(parsed.value, value);
			assert.ok(Object.hasOwn(parsed.value, '__proto__'));
		});

		test('in a record is validated, then dropped from the output', () => {
			const valid = JSON.parse('{"name": "abc", "dependencies": {"__proto__": "1", "a": "2"}}');
			const parsed = s.parse(PackageJson, valid);
			assert.ok(parsed.ok);
			assert.deepEqual(Object.keys(parsed.value.dependencies!), ['a']);
			assert.ok(!Object.hasOwn(parsed.value.dependencies!, '__proto__'));

			const invalid = JSON.parse('{"name": "abc", "dependencies": {"__proto__": 1}}');
			const failed = s.parse(PackageJson, invalid);
			assert.ok(!failed.ok);
			assert.deepEqual(failed.issues[0]!.path, ['dependencies', '__proto__']);
		});
	});
});

describe('PackageJsonExports', () => {
	const valid_exports: Array<[string, PackageJsonExports]> = [
		['a string', './index.js'],
		['null', null],
		['simple string exports', { '.': './index.js', './lib': './lib/index.js' }],
		['null exports', { '.': './index.js', './internal/*': null }],
		[
			'basic conditional exports',
			{ '.': { import: './index.mjs', require: './index.cjs', default: './index.js' } }
		],
		[
			'nested conditional exports',
			{
				'./feature': {
					node: { import: './feature-node.mjs', require: './feature-node.cjs' },
					default: './feature.mjs'
				}
			}
		],
		[
			'deeply nested conditional exports',
			{
				'./advanced': {
					node: {
						development: { import: './dev-node.mjs', require: './dev-node.cjs' },
						production: { import: './prod-node.mjs', require: './prod-node.cjs' }
					},
					default: './feature.mjs'
				}
			}
		],
		[
			'mixed exports types',
			{
				'.': './index.js',
				'./lib': { node: './lib/node.js', default: './lib/index.js' },
				'./feature/*': null,
				'./advanced': { node: { import: './advanced-node.mjs', require: './advanced-node.cjs' } }
			}
		]
	];

	for (const [name, exports] of valid_exports) {
		test(`parses ${name}`, () => {
			const parsed = s.parse(PackageJsonExports, exports);
			assert.ok(parsed.ok);
			assert.strictEqual(parsed.value, exports);
		});
	}

	test('rejects invalid exports', () => {
		const invalid_exports = [
			{ '.': true }, // boolean is not a valid export value
			{ '.': ['/path'] }, // array is not a valid export value
			{ '.': { default: true } }, // boolean is not a valid export value in conditions
			{ '.': { node: { import: ['/path'] } } } // array is not a valid nested export value
		];

		for (const invalid_export of invalid_exports) {
			assert.ok(!s.parse(PackageJsonExports, invalid_export).ok);
		}
	});

	test('`ExportValue` is a recursive type', () => {
		const value: ExportValue = { node: { import: './a.mjs', default: null }, default: './a.js' };
		assert.ok(s.parse(ExportValue, value).ok);
		const exports: PackageJson['exports'] = { '.': value };
		assert.ok(exports);
		// @ts-expect-error a boolean is not an export value
		const invalid: ExportValue = { node: true };
		assert.ok(!s.parse(ExportValue, invalid).ok);
		// @ts-expect-error nor is an array, at any depth
		const invalid_nested: PackageJsonExports = { '.': { node: ['./a.js'] } };
		assert.ok(!s.parse(PackageJsonExports, invalid_nested).ok);
	});
});
