import {describe, test, expect} from 'vitest';
import {z} from 'zod';

import {args_validate_schema, args_parse, args_serialize, args_extract_aliases} from './args.ts';

describe('args_validate_schema', () => {
	test('valid schema with no aliases', () => {
		const schema = z.strictObject({
			watch: z.boolean().default(false),
		});
		const result = args_validate_schema(schema);
		expect(result.success).toBe(true);
		expect('error' in result).toBe(false);
	});

	test('valid schema with aliases', () => {
		const schema = z.strictObject({
			verbose: z
				.boolean()
				.default(false)
				.meta({aliases: ['v']}),
			output: z
				.string()
				.default('')
				.meta({aliases: ['o', 'out']}),
		});
		const result = args_validate_schema(schema);
		expect(result.success).toBe(true);
	});

	test('detects alias-canonical conflict', () => {
		const schema = z.strictObject({
			output: z
				.string()
				.default('')
				.meta({aliases: ['o']}),
			o: z.boolean().default(false),
		});
		const result = args_validate_schema(schema);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBeDefined();
			expect(result.error.issues[0]?.message).toContain('conflicts with canonical key');
		}
	});

	test('detects duplicate alias', () => {
		const schema = z.strictObject({
			verbose: z
				.boolean()
				.default(false)
				.meta({aliases: ['v']}),
			version: z
				.boolean()
				.default(false)
				.meta({aliases: ['v']}),
		});
		const result = args_validate_schema(schema);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBeDefined();
			expect(result.error.issues[0]?.message).toContain('is used by both');
		}
	});

	test('caches schema analysis (multiple calls use same cached data)', () => {
		const schema = z.strictObject({
			watch: z.boolean().default(false),
		});
		const result1 = args_validate_schema(schema);
		const result2 = args_validate_schema(schema);
		// Both calls should succeed and use cached analysis
		expect(result1.success).toBe(true);
		expect(result2.success).toBe(true);
		// The cached error object should be the same reference when there are conflicts
		const bad_schema = z.strictObject({
			output: z
				.string()
				.default('')
				.meta({aliases: ['o']}),
			o: z.boolean().default(false),
		});
		const bad1 = args_validate_schema(bad_schema);
		const bad2 = args_validate_schema(bad_schema);
		if (!bad1.success && !bad2.success) {
			expect(bad1.error).toBe(bad2.error); // Same cached error object
		}
	});

	test('handles non-object schema gracefully', () => {
		const schema = z.string();
		const result = args_validate_schema(schema);
		expect(result.success).toBe(true); // No conflicts possible
	});
});

describe('args_serialize', () => {
	test('empty object', () => {
		expect(args_serialize({})).toEqual([]);
	});

	test('positionals first', () => {
		expect(args_serialize({_: ['a', 'b'], watch: true})).toEqual(['a', 'b', '--watch']);
	});

	test('single char uses single dash', () => {
		expect(args_serialize({v: true, w: 'foo'})).toEqual(['-v', '-w', 'foo']);
	});

	test('boolean true becomes bare flag', () => {
		expect(args_serialize({watch: true})).toEqual(['--watch']);
	});

	test('boolean false is skipped', () => {
		expect(args_serialize({watch: false})).toEqual([]);
	});

	test('undefined is skipped', () => {
		expect(args_serialize({watch: undefined, verbose: true})).toEqual(['--verbose']);
	});

	test('arrays repeat the flag', () => {
		expect(args_serialize({file: ['a', 'b']})).toEqual(['--file', 'a', '--file', 'b']);
	});

	test('no- prefix skipped when base is truthy', () => {
		expect(args_serialize({watch: true, 'no-watch': false})).toEqual(['--watch']);
	});

	test('no- prefix serialized when base is falsy', () => {
		expect(args_serialize({watch: false, 'no-watch': true})).toEqual(['--no-watch']);
	});

	test('no- prefix alone', () => {
		expect(args_serialize({'no-watch': true})).toEqual(['--no-watch']);
	});

	test('prefers shortest alias when schema provided', () => {
		const schema = z.strictObject({
			verbose: z
				.boolean()
				.default(false)
				.meta({aliases: ['v', 'verb']}),
		});
		expect(args_serialize({verbose: true}, schema)).toEqual(['-v']);
	});

	test('prefers shortest alias for values', () => {
		const schema = z.strictObject({
			output: z
				.string()
				.default('')
				.meta({aliases: ['o', 'out']}),
		});
		expect(args_serialize({output: 'dist'}, schema)).toEqual(['-o', 'dist']);
	});

	test('numbers as values', () => {
		expect(args_serialize({count: 5})).toEqual(['--count', '5']);
	});

	test('empty positionals array', () => {
		expect(args_serialize({_: []})).toEqual([]);
	});
});

describe('args_parse', () => {
	test('validates with zod schema', () => {
		const schema = z.strictObject({watch: z.boolean().default(false)});
		const result = args_parse({watch: true}, schema);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({watch: true});
		}
	});

	test('applies defaults', () => {
		const schema = z.strictObject({watch: z.boolean().default(false)});
		const result = args_parse({}, schema);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({watch: false});
		}
	});

	test('expands aliases', () => {
		const schema = z.strictObject({
			verbose: z
				.boolean()
				.default(false)
				.meta({aliases: ['v']}),
		});
		const result = args_parse({v: true}, schema);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.verbose).toBe(true);
		}
	});

	test('strips alias keys for strictObject', () => {
		const schema = z.strictObject({
			verbose: z
				.boolean()
				.default(false)
				.meta({aliases: ['v']}),
		});
		const result = args_parse({v: true}, schema);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({verbose: true});
			expect('v' in result.data).toBe(false);
		}
	});

	test('multiple aliases', () => {
		const schema = z.strictObject({
			output: z
				.string()
				.default('')
				.meta({aliases: ['o', 'out']}),
		});
		const result1 = args_parse({o: 'dist'}, schema);
		const result2 = args_parse({out: 'dist'}, schema);
		expect(result1.success).toBe(true);
		expect(result2.success).toBe(true);
		if (result1.success) expect(result1.data.output).toBe('dist');
		if (result2.success) expect(result2.data.output).toBe('dist');
	});

	test('canonical takes precedence over alias', () => {
		const schema = z.strictObject({
			verbose: z
				.boolean()
				.default(false)
				.meta({aliases: ['v']}),
		});
		const result = args_parse({v: true, verbose: false}, schema);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.verbose).toBe(false);
		}
	});

	test('syncs no- prefix from base', () => {
		const schema = z.strictObject({
			watch: z.boolean().default(true),
			'no-watch': z.boolean().default(false),
		});
		const result = args_parse({watch: true}, schema);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({watch: true, 'no-watch': false});
		}
	});

	test('syncs base from no- prefix', () => {
		const schema = z.strictObject({
			watch: z.boolean().default(true),
			'no-watch': z.boolean().default(false),
		});
		const result = args_parse({'no-watch': true}, schema);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({watch: false, 'no-watch': true});
		}
	});

	test('both present - no sync needed', () => {
		const schema = z.strictObject({
			watch: z.boolean().default(true),
			'no-watch': z.boolean().default(false),
		});
		const result = args_parse({watch: false, 'no-watch': true}, schema);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({watch: false, 'no-watch': true});
		}
	});

	test('no- sync only for booleans', () => {
		const schema = z.strictObject({
			count: z.number().default(0),
			'no-count': z.number().default(0), // weird but valid
		});
		const result = args_parse({count: 5}, schema);
		expect(result.success).toBe(true);
		if (result.success) {
			// Should NOT sync because no-count is not boolean
			expect(result.data).toEqual({count: 5, 'no-count': 0});
		}
	});

	test('no- sync requires both keys in schema', () => {
		const schema = z.strictObject({
			watch: z.boolean().default(true),
			// no 'no-watch' in schema
		});
		const result = args_parse({watch: true}, schema);
		expect(result.success).toBe(true);
		if (result.success) {
			// Should NOT add 'no-watch' since it's not in schema
			expect(result.data).toEqual({watch: true});
		}
	});

	test('positionals in schema', () => {
		const schema = z.strictObject({
			_: z.array(z.string()).default([]),
			watch: z.boolean().default(false),
		});
		const result = args_parse({_: ['foo', 'bar'], watch: true}, schema);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({_: ['foo', 'bar'], watch: true});
		}
	});

	test('alias conflict with canonical key errors', () => {
		const schema = z.strictObject({
			output: z
				.string()
				.default('')
				.meta({aliases: ['o']}),
			o: z.boolean().default(false), // conflicts with alias
		});
		const result = args_parse({}, schema);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toContain('conflicts with canonical key');
		}
	});

	test('duplicate alias errors', () => {
		const schema = z.strictObject({
			verbose: z
				.boolean()
				.default(false)
				.meta({aliases: ['v']}),
			version: z
				.boolean()
				.default(false)
				.meta({aliases: ['v']}),
		});
		const result = args_parse({}, schema);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toContain('is used by both');
		}
	});

	test('schema validation is cached', () => {
		const schema = z.strictObject({
			verbose: z
				.boolean()
				.default(false)
				.meta({aliases: ['v']}),
		});
		// Multiple parses with same schema should use cached analysis
		const result1 = args_parse({v: true}, schema);
		const result2 = args_parse({verbose: true}, schema);
		expect(result1.success).toBe(true);
		expect(result2.success).toBe(true);
	});

	test('handles optional fields', () => {
		const schema = z.strictObject({
			name: z.string().optional(),
		});
		const result = args_parse({}, schema);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({});
		}
	});

	test('returns zod validation error for invalid values', () => {
		const schema = z.strictObject({
			count: z.number().min(0),
		});
		const result = args_parse({count: -5}, schema);
		expect(result.success).toBe(false);
		if (!result.success) {
			// This is a zod validation error, not a schema conflict
			expect(result.error.issues[0]?.message).not.toContain('conflicts');
			expect(result.error.issues[0]?.message).not.toContain('is used by both');
		}
	});

	test('first alias in input wins when multiple aliases provided', () => {
		const schema = z.strictObject({
			output: z
				.string()
				.default('')
				.meta({aliases: ['o', 'out']}),
		});
		// When both aliases are in input, first one processed wins
		// (object iteration order is insertion order in modern JS)
		const result = args_parse({o: 'first', out: 'second'}, schema);
		expect(result.success).toBe(true);
		if (result.success) {
			// 'o' is processed first, so 'first' is used
			expect(result.data.output).toBe('first');
		}
	});

	test('handles wrapped object schema', () => {
		const schema = z
			.strictObject({
				verbose: z
					.boolean()
					.default(false)
					.meta({aliases: ['v']}),
			})
			.default({verbose: false});
		const result = args_parse({v: true}, schema);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.verbose).toBe(true);
		}
	});

	test('no- sync works with alias expansion', () => {
		const schema = z.strictObject({
			watch: z
				.boolean()
				.default(true)
				.meta({aliases: ['w']}),
			'no-watch': z.boolean().default(false),
		});
		// Use alias 'w' to set watch=true, no-watch should sync
		const result = args_parse({w: true}, schema);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({watch: true, 'no-watch': false});
		}
	});

	test('rejects unknown keys with strictObject', () => {
		const schema = z.strictObject({
			watch: z.boolean().default(false),
		});
		const result = args_parse({watch: true, unknown: 'key'}, schema);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toContain('Unrecognized key');
		}
	});
});

describe('args_extract_aliases', () => {
	test('extracts single alias and canonical keys', () => {
		const schema = z.strictObject({
			verbose: z
				.boolean()
				.default(false)
				.meta({aliases: ['v']}),
		});
		const {aliases, canonical_keys} = args_extract_aliases(schema);
		expect(aliases.get('v')).toBe('verbose');
		expect(aliases.size).toBe(1);
		expect(canonical_keys.has('verbose')).toBe(true);
		expect(canonical_keys.size).toBe(1);
	});

	test('extracts multiple aliases for same key', () => {
		const schema = z.strictObject({
			output: z
				.string()
				.default('')
				.meta({aliases: ['o', 'out']}),
		});
		const {aliases, canonical_keys} = args_extract_aliases(schema);
		expect(aliases.get('o')).toBe('output');
		expect(aliases.get('out')).toBe('output');
		expect(aliases.size).toBe(2);
		expect(canonical_keys.has('output')).toBe(true);
	});

	test('extracts aliases from multiple keys', () => {
		const schema = z.strictObject({
			verbose: z
				.boolean()
				.default(false)
				.meta({aliases: ['v']}),
			output: z
				.string()
				.default('')
				.meta({aliases: ['o']}),
		});
		const {aliases, canonical_keys} = args_extract_aliases(schema);
		expect(aliases.get('v')).toBe('verbose');
		expect(aliases.get('o')).toBe('output');
		expect(aliases.size).toBe(2);
		expect(canonical_keys.size).toBe(2);
	});

	test('returns empty map when no aliases', () => {
		const schema = z.strictObject({
			verbose: z.boolean().default(false),
			output: z.string().default(''),
		});
		const {aliases, canonical_keys} = args_extract_aliases(schema);
		expect(aliases.size).toBe(0);
		expect(canonical_keys.size).toBe(2); // Still has canonical keys
	});

	test('handles wrapped schemas (optional, default)', () => {
		const schema = z.strictObject({
			verbose: z
				.boolean()
				.optional()
				.meta({aliases: ['v']}),
			output: z
				.string()
				.default('dist')
				.meta({aliases: ['o']}),
		});
		const {aliases} = args_extract_aliases(schema);
		expect(aliases.get('v')).toBe('verbose');
		expect(aliases.get('o')).toBe('output');
	});

	test('handles non-object schema gracefully', () => {
		const schema = z.string();
		const {aliases, canonical_keys} = args_extract_aliases(schema);
		expect(aliases.size).toBe(0);
		expect(canonical_keys.size).toBe(0);
	});

	test('canonical_keys includes keys without aliases', () => {
		const schema = z.strictObject({
			verbose: z
				.boolean()
				.default(false)
				.meta({aliases: ['v']}),
			watch: z.boolean().default(false), // no alias
			output: z.string().default(''), // no alias
		});
		const {aliases, canonical_keys} = args_extract_aliases(schema);
		expect(aliases.size).toBe(1);
		expect(canonical_keys.size).toBe(3);
		expect(canonical_keys.has('verbose')).toBe(true);
		expect(canonical_keys.has('watch')).toBe(true);
		expect(canonical_keys.has('output')).toBe(true);
	});

	test('returns copies that are safe to mutate', () => {
		const schema = z.strictObject({
			verbose: z
				.boolean()
				.default(false)
				.meta({aliases: ['v']}),
		});
		const result1 = args_extract_aliases(schema);
		// Mutate the returned collections
		result1.aliases.set('x', 'verbose');
		result1.canonical_keys.add('mutated');

		// Get fresh extraction - should not be affected
		const result2 = args_extract_aliases(schema);
		expect(result2.aliases.has('x')).toBe(false);
		expect(result2.canonical_keys.has('mutated')).toBe(false);
		expect(result2.aliases.size).toBe(1);
		expect(result2.canonical_keys.size).toBe(1);
	});
});
