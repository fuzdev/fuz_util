import {describe, test, expect} from 'vitest';
import {z} from 'zod';

import {
	args_validate_schema,
	args_parse,
	args_serialize,
	args_extract_aliases,
	argv_parse,
	type Args,
} from './args.ts';

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

describe('argv_parse', () => {
	// Table-driven tests for simple input → output cases
	// Format: [description, input, expected output]
	const basic_cases: Array<[string, Array<string>, Record<string, unknown>]> = [
		// Basic functionality
		['empty argv', [], {_: []}],
		['positional arguments', ['foo', 'bar', 'baz'], {_: ['foo', 'bar', 'baz']}],

		// Long flags
		['long flag boolean', ['--watch'], {_: [], watch: true}],
		['long flag with value', ['--output', 'dist'], {_: [], output: 'dist'}],
		['long flag with equals', ['--output=dist'], {_: [], output: 'dist'}],
		['long flag negation', ['--no-watch'], {_: [], watch: false}],
		['--no- sets empty key to false', ['--no-'], {_: [], '': false}],
		['multiple long flags', ['--a', '--b', '--c'], {_: [], a: true, b: true, c: true}],

		// Short flags
		['short flag boolean', ['-v'], {_: [], v: true}],
		['short flag with value', ['-o', 'dist'], {_: [], o: 'dist'}],
		['combined short flags', ['-abc'], {_: [], a: true, b: true, c: true}],
		['combined short flags with value', ['-abc', 'value'], {_: [], a: true, b: true, c: 'value'}],
		['short flag with equals', ['-o=dist'], {_: [], o: 'dist'}],
		['combined short flags with equals', ['-abc=value'], {_: [], a: true, b: true, c: 'value'}],
		[
			'multiple combined short flag groups',
			['-abc', '-def'],
			{_: [], a: true, b: true, c: true, d: true, e: true, f: true},
		],
		[
			'combined flags with value then more flags',
			['-abc', 'val', '-def'],
			{_: [], a: true, b: true, c: 'val', d: true, e: true, f: true},
		],

		// Numeric coercion
		['coerces integer', ['--count', '123'], {_: [], count: 123}],
		['coerces float', ['--ratio', '3.14'], {_: [], ratio: 3.14}],
		['coerces scientific notation', ['--big', '1e5'], {_: [], big: 100000}],
		['coerces negative with equals', ['--val=-5'], {_: [], val: -5}],
		['coerces leading zeros', ['--port', '007'], {_: [], port: 7}],
		['coerces hex', ['--val', '0x10'], {_: [], val: 16}],
		['coerces octal', ['--val', '0o10'], {_: [], val: 8}],
		['coerces binary', ['--val', '0b10'], {_: [], val: 2}],
		['coerces small decimal', ['--val', '0.0000001'], {_: [], val: 1e-7}],
		['coerces decimal without leading zero', ['--val', '.5'], {_: [], val: 0.5}],
		['coerces MAX_SAFE_INTEGER', ['--val', '9007199254740991'], {_: [], val: 9007199254740991}],
		['keeps non-numeric string', ['--name', 'hello'], {_: [], name: 'hello'}],
		['keeps mixed alphanumeric', ['--id', '123abc'], {_: [], id: '123abc'}],
		['keeps Infinity as string', ['--val', 'Infinity'], {_: [], val: 'Infinity'}],
		['keeps NaN as string', ['--val', 'NaN'], {_: [], val: 'NaN'}],
		['keeps boolean-like true as string', ['--flag', 'true'], {_: [], flag: 'true'}],
		['keeps boolean-like false as string', ['--flag', 'false'], {_: [], flag: 'false'}],

		// -- separator
		[
			'-- stops flag parsing',
			['--watch', '--', '--not-a-flag'],
			{_: ['--not-a-flag'], watch: true},
		],
		[
			'everything after -- is positional',
			['--', '-a', '--bee', 'cee'],
			{_: ['-a', '--bee', 'cee']},
		],
		['-- alone', ['--'], {_: []}],

		// Mixed positionals and flags
		[
			'positionals before and after flags',
			['src', '--output', 'dist', 'lib'],
			{_: ['src', 'lib'], output: 'dist'},
		],
		[
			'flag followed by flag (no value)',
			['--watch', '--verbose'],
			{_: [], watch: true, verbose: true},
		],
		['flag at end with no value', ['foo', '--watch'], {_: ['foo'], watch: true}],

		// Repeated flags (arrays)
		[
			'repeated long flags become array',
			['--file', 'a.ts', '--file', 'b.ts'],
			{_: [], file: ['a.ts', 'b.ts']},
		],
		[
			'repeated short flags become array',
			['-f', 'a.ts', '-f', 'b.ts'],
			{_: [], f: ['a.ts', 'b.ts']},
		],
		['three repeated flags', ['--x', '1', '--x', '2', '--x', '3'], {_: [], x: [1, 2, 3]}],

		// Special characters in flag names
		['dots in flag name', ['--foo.bar'], {_: [], 'foo.bar': true}],
		['underscores in flag name', ['--foo_bar'], {_: [], foo_bar: true}],
		['dots in flag name with value', ['--config.path', '/tmp'], {_: [], 'config.path': '/tmp'}],

		// Multiple equals signs
		['multiple equals in value', ['--config=key=value'], {_: [], config: 'key=value'}],
		['multiple equals in short flag value', ['-f=a=b=c'], {_: [], f: 'a=b=c'}],
		['value that looks like flag after =', ['--cmd=--help'], {_: [], cmd: '--help'}],

		// Numeric flags
		['zero as short flag', ['-0'], {_: [], '0': true}],
		['zero as long flag', ['--0'], {_: [], '0': true}],
		['numeric combined short flags', ['-123'], {_: [], '1': true, '2': true, '3': true}],

		// Positional edge cases
		['equals sign in positional preserved', ['foo=bar'], {_: ['foo=bar']}],
		['single dash is ignored', ['-'], {_: []}],
		['empty string as positional', ['foo', '', 'bar'], {_: ['foo', '', 'bar']}],

		// Unicode
		['unicode value', ['--flag', '日本語'], {_: [], flag: '日本語'}],
		['unicode flag name', ['--フラグ'], {_: [], フラグ: true}],

		// Value starting with equals
		['value starting with equals', ['--flag', '=value'], {_: [], flag: '=value'}],
		['equals-equals value', ['--flag==value'], {_: [], flag: '=value'}],

		// Whitespace in values
		['preserves leading/trailing spaces', ['--flag', '  spaces  '], {_: [], flag: '  spaces  '}],

		// Mixed repeated flags (boolean then value)
		[
			'mixed repeated flag becomes array',
			['--flag', '--flag=value'],
			{_: [], flag: [true, 'value']},
		],

		// Negative number after -- is positional
		['negative number after -- is positional string', ['--', '-5'], {_: ['-5']}],
	];

	test.each(basic_cases)('%s', (_description, input, expected) => {
		expect(argv_parse(input)).toEqual(expected);
	});

	// Special JS property names - tested separately because object literal syntax
	// doesn't allow __proto__ as a normal property
	/* eslint-disable no-proto, @typescript-eslint/dot-notation */
	describe('special property names (Object.create(null))', () => {
		test('__proto__ as flag name', () => {
			const result = argv_parse(['--__proto__', 'value']);
			expect(result._).toEqual([]);
			expect(result['__proto__']).toBe('value');
			expect(Object.keys(result)).toContain('__proto__');
		});

		test('constructor as flag name', () => {
			const result = argv_parse(['--constructor', 'test']);
			expect(result._).toEqual([]);
			expect(result['constructor']).toBe('test');
		});

		test('no prototype pollution', () => {
			argv_parse(['--__proto__', 'polluted']);
			expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		});
	});
	/* eslint-enable no-proto, @typescript-eslint/dot-notation */

	// Empty equals tests (differs from mri: we return '' not true)
	const empty_equals_cases: Array<[string, Array<string>, Record<string, unknown>]> = [
		['long flag with empty equals', ['--output='], {_: [], output: ''}],
		['short flag with empty equals', ['-f='], {_: [], f: ''}],
		['combined short flags with empty equals', ['-abc='], {_: [], a: true, b: true, c: ''}],
		[
			'empty equals with next arg (next is positional)',
			['--flag=', 'next'],
			{_: ['next'], flag: ''},
		],
		['empty equals followed by flag', ['--flag=', '-v'], {_: [], flag: '', v: true}],
		[
			'multiple flags with empty equals',
			['--foo=', '--bar=', '--baz=value'],
			{_: [], foo: '', bar: '', baz: 'value'},
		],
		[
			'empty equals then -- separator',
			['--flag=', '--', 'positional'],
			{_: ['positional'], flag: ''},
		],
		[
			'repeated flag with empty equals',
			['--flag=', '--flag=value', '--flag='],
			{_: [], flag: ['', 'value', '']},
		],
		['empty string as flag value (space syntax)', ['--name', ''], {_: [], name: ''}],
		[
			'empty string preserved (not coerced to 0)',
			['--flag', '', '--other'],
			{_: [], flag: '', other: true},
		],
	];

	describe('empty equals (differs from mri)', () => {
		test.each(empty_equals_cases)('%s', (_description, input, expected) => {
			expect(argv_parse(input)).toEqual(expected);
		});
	});

	// mri compatibility - intentional differences
	const mri_diff_cases: Array<[string, Array<string>, Record<string, unknown>, string]> = [
		[
			'triple dash creates flag with dash prefix',
			['---flag'],
			{_: [], '-flag': true},
			'mri strips ALL dashes',
		],
		[
			'quadruple dash creates flag with double-dash prefix',
			['----flag'],
			{_: [], '--flag': true},
			'mri strips ALL dashes',
		],
		['triple dash alone', ['---'], {_: [], '-': true}, 'mri ignores'],
		['quadruple dash alone', ['----'], {_: [], '--': true}, 'mri ignores'],
		[
			'--=value sets empty key to value',
			['--=value'],
			{_: [], '': 'value'},
			'mri treats =value as flag name',
		],
		['double negation', ['--no-no-watch'], {_: [], 'no-watch': false}, 'strips one no- prefix'],
	];

	describe('mri differences (intentional)', () => {
		test.each(mri_diff_cases)('%s', (_description, input, expected, _mri_behavior) => {
			expect(argv_parse(input)).toEqual(expected);
		});
	});

	// Dash handling edge cases
	const dash_cases: Array<[string, Array<string>, Record<string, unknown>]> = [
		['dash in combined short flags', ['-a-b'], {_: [], a: true, '-': true, b: true}],
		['single dash after flag (ignored, flag is boolean)', ['--flag', '-'], {_: [], flag: true}],
		['double dash after flag stops parsing', ['--flag', '--'], {_: [], flag: true}],
		[
			'negative number as arg is treated as flag',
			['--count', '-5'],
			{_: [], count: true, '5': true},
		],
	];

	describe('dash handling', () => {
		test.each(dash_cases)('%s', (_description, input, expected) => {
			expect(argv_parse(input)).toEqual(expected);
		});
	});

	// Complex real-world examples (keep as individual tests for clarity)
	describe('real-world patterns', () => {
		test('gro-like task invocation', () => {
			expect(argv_parse(['test', '--watch', '-v', 'src/*.test.ts'])).toEqual({
				_: ['test'],
				watch: true,
				v: 'src/*.test.ts',
			});
		});

		test('build command with multiple flags', () => {
			expect(argv_parse(['build', '--no-minify', '--output', 'dist', '--format', 'esm'])).toEqual({
				_: ['build'],
				minify: false,
				output: 'dist',
				format: 'esm',
			});
		});

		test('forwarded args pattern', () => {
			expect(argv_parse(['eslint', '--fix', '--ext', '.ts'])).toEqual({
				_: ['eslint'],
				fix: true,
				ext: '.ts',
			});
		});

		test('mixed positionals and flags (flag takes next non-flag as value)', () => {
			expect(argv_parse(['foo', '--watch', 'bar', '-v'])).toEqual({
				_: ['foo'],
				watch: 'bar',
				v: true,
			});
		});
	});

	// Round-trip tests with args_serialize
	describe('round-trip with args_serialize', () => {
		const round_trip_cases: Array<[string, Args]> = [
			['simple args', {_: ['foo', 'bar'], watch: true, count: 5}],
			['complex args', {_: ['src'], verbose: true, output: 'dist', count: 42}],
			['repeated flags', {_: [], file: ['a.ts', 'b.ts', 'c.ts']}],
			['only positionals', {_: ['src', 'lib', 'test']}],
			['empty args', {}],
		];

		test.each(round_trip_cases)('%s', (_description, original) => {
			const serialized = args_serialize(original);
			const reparsed = argv_parse(serialized);
			// Empty args get _ array added by argv_parse
			const expected = '_' in original ? original : {_: [], ...original};
			expect(reparsed).toEqual(expected);
		});

		test('no- prefix round-trip (becomes negated base flag)', () => {
			// --no-watch becomes {watch: false}, not {no-watch: true}
			const original = {_: [] as Array<string>, 'no-watch': true};
			const serialized = args_serialize(original);
			expect(serialized).toEqual(['--no-watch']);
			const reparsed = argv_parse(serialized);
			expect(reparsed.watch).toBe(false);
			expect(reparsed['no-watch']).toBeUndefined();
		});

		test('string values with spaces round-trip correctly', () => {
			const original = {_: [] as Array<string>, message: 'hello world'};
			const serialized = args_serialize(original);
			expect(serialized).toEqual(['--message', 'hello world']);
			const reparsed = argv_parse(serialized);
			expect(reparsed.message).toBe('hello world');
		});
	});
});
