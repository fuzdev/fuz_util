import {describe, test, expect} from 'vitest';
import {z} from 'zod';

import {
	zod_to_subschema,
	zod_to_schema_description,
	zod_to_schema_default,
	zod_to_schema_aliases,
	zod_to_schema_type_string,
	zod_format_value,
	zod_to_schema_properties,
	zod_to_schema_names_with_aliases,
} from '$lib/zod.ts';

describe('zod_to_subschema', () => {
	test('returns undefined for plain string', () => {
		expect(zod_to_subschema(z.string().def)).toBe(undefined);
	});

	test('unwraps optional', () => {
		const schema = z.string().optional();
		const sub = zod_to_subschema(schema.def);
		expect(sub).toBeDefined();
	});

	test('unwraps default', () => {
		const schema = z.string().default('hello');
		const sub = zod_to_subschema(schema.def);
		expect(sub).toBeDefined();
	});

	test('unwraps nullable', () => {
		const schema = z.string().nullable();
		const sub = zod_to_subschema(schema.def);
		expect(sub).toBeDefined();
	});

	test('returns undefined for number', () => {
		expect(zod_to_subschema(z.number().def)).toBe(undefined);
	});

	test('returns undefined for boolean', () => {
		expect(zod_to_subschema(z.boolean().def)).toBe(undefined);
	});
});

describe('zod_to_schema_description', () => {
	test('returns description from meta', () => {
		const schema = z.string().meta({description: 'a name'});
		expect(zod_to_schema_description(schema)).toBe('a name');
	});

	test('returns null when no description', () => {
		const schema = z.string();
		expect(zod_to_schema_description(schema)).toBe(null);
	});

	test('unwraps optional to find description', () => {
		const schema = z.string().meta({description: 'inner desc'}).optional();
		expect(zod_to_schema_description(schema)).toBe('inner desc');
	});

	test('unwraps default to find description', () => {
		const schema = z.string().meta({description: 'with default'}).default('hi');
		expect(zod_to_schema_description(schema)).toBe('with default');
	});

	test('prefers outer description over inner', () => {
		const schema = z.string().meta({description: 'inner'}).optional().meta({description: 'outer'});
		expect(zod_to_schema_description(schema)).toBe('outer');
	});
});

describe('zod_to_schema_default', () => {
	test('returns default value', () => {
		const schema = z.string().default('hello');
		expect(zod_to_schema_default(schema)).toBe('hello');
	});

	test('returns undefined when no default', () => {
		const schema = z.string();
		expect(zod_to_schema_default(schema)).toBe(undefined);
	});

	test('returns boolean default', () => {
		const schema = z.boolean().default(false);
		expect(zod_to_schema_default(schema)).toBe(false);
	});

	test('returns number default', () => {
		const schema = z.number().default(42);
		expect(zod_to_schema_default(schema)).toBe(42);
	});

	test('unwraps optional to find default', () => {
		const schema = z.string().default('nested').optional();
		expect(zod_to_schema_default(schema)).toBe('nested');
	});
});

describe('zod_to_schema_aliases', () => {
	test('returns aliases from meta', () => {
		const schema = z.string().meta({aliases: ['n', 'name']});
		expect(zod_to_schema_aliases(schema)).toEqual(['n', 'name']);
	});

	test('returns empty array when no aliases', () => {
		const schema = z.string();
		expect(zod_to_schema_aliases(schema)).toEqual([]);
	});

	test('unwraps optional to find aliases', () => {
		const schema = z
			.string()
			.meta({aliases: ['v']})
			.optional();
		expect(zod_to_schema_aliases(schema)).toEqual(['v']);
	});

	test('unwraps default to find aliases', () => {
		const schema = z
			.boolean()
			.meta({aliases: ['h']})
			.default(false);
		expect(zod_to_schema_aliases(schema)).toEqual(['h']);
	});
});

describe('zod_to_schema_type_string', () => {
	test('string', () => {
		expect(zod_to_schema_type_string(z.string())).toBe('string');
	});

	test('number', () => {
		expect(zod_to_schema_type_string(z.number())).toBe('number');
	});

	test('boolean', () => {
		expect(zod_to_schema_type_string(z.boolean())).toBe('boolean');
	});

	test('int (zod v4 reports as number)', () => {
		// z.int() in zod v4 uses 'number' as the def type with integer checks
		expect(zod_to_schema_type_string(z.int())).toBe('number');
	});

	test('array', () => {
		expect(zod_to_schema_type_string(z.array(z.string()))).toBe('Array<string>');
	});

	test('enum', () => {
		const schema = z.enum(['a', 'b', 'c']);
		expect(zod_to_schema_type_string(schema)).toBe("'a' | 'b' | 'c'");
	});

	test('nullable wraps inner type', () => {
		const schema = z.string().nullable();
		expect(zod_to_schema_type_string(schema)).toBe('string | null');
	});

	test('optional wraps inner type', () => {
		const schema = z.string().optional();
		expect(zod_to_schema_type_string(schema)).toBe('string | undefined');
	});

	test('unwraps default to show inner type', () => {
		const schema = z.string().default('hi');
		expect(zod_to_schema_type_string(schema)).toBe('string');
	});
});

describe('zod_format_value', () => {
	test('undefined returns empty string', () => {
		expect(zod_format_value(undefined)).toBe('');
	});

	test('null returns "null"', () => {
		expect(zod_format_value(null)).toBe('null');
	});

	test('string is quoted', () => {
		expect(zod_format_value('hello')).toBe("'hello'");
	});

	test('array returns "[]"', () => {
		expect(zod_format_value([])).toBe('[]');
	});

	test('object returns JSON', () => {
		expect(zod_format_value({a: 1})).toBe('{"a":1}');
	});

	test('boolean returns String()', () => {
		expect(zod_format_value(true)).toBe('true');
		expect(zod_format_value(false)).toBe('false');
	});

	test('number returns String()', () => {
		expect(zod_format_value(42)).toBe('42');
		expect(zod_format_value(0)).toBe('0');
	});
});

describe('zod_to_schema_properties', () => {
	test('extracts properties from strictObject', () => {
		const schema = z.strictObject({
			name: z.string().meta({description: 'the name'}).default('world'),
			verbose: z
				.boolean()
				.meta({aliases: ['v'], description: 'verbose output'})
				.default(false),
		});
		const props = zod_to_schema_properties(schema);
		expect(props).toHaveLength(2);
		const p0 = props[0]!;
		const p1 = props[1]!;
		expect(p0.name).toBe('name');
		expect(p0.type).toBe('string');
		expect(p0.description).toBe('the name');
		expect(p0.default).toBe('world');
		expect(p0.aliases).toEqual([]);
		expect(p1.name).toBe('verbose');
		expect(p1.type).toBe('boolean');
		expect(p1.description).toBe('verbose output');
		expect(p1.default).toBe(false);
		expect(p1.aliases).toEqual(['v']);
	});

	test('skips no- prefixed fields', () => {
		const schema = z.strictObject({
			watch: z.boolean().default(true),
			'no-watch': z.boolean().default(false),
		});
		const props = zod_to_schema_properties(schema);
		// 'no-watch' is in the shape, so 'watch' is skipped (the no- field shadows it)
		expect(props).toHaveLength(1);
		expect(props[0]!.name).toBe('no-watch');
	});

	test('returns empty array for non-object schemas', () => {
		expect(zod_to_schema_properties(z.string())).toEqual([]);
	});
});

describe('zod_to_schema_names_with_aliases', () => {
	test('collects names and aliases', () => {
		const schema = z.strictObject({
			help: z
				.boolean()
				.meta({aliases: ['h']})
				.default(false),
			version: z
				.boolean()
				.meta({aliases: ['v', 'V']})
				.default(false),
			name: z.string().default(''),
		});
		const names = zod_to_schema_names_with_aliases(schema);
		expect(names.has('help')).toBe(true);
		expect(names.has('h')).toBe(true);
		expect(names.has('version')).toBe(true);
		expect(names.has('v')).toBe(true);
		expect(names.has('V')).toBe(true);
		expect(names.has('name')).toBe(true);
	});

	test('skips _ property', () => {
		const schema = z.strictObject({
			_: z.array(z.string()).default([]),
			name: z.string().default(''),
		});
		const names = zod_to_schema_names_with_aliases(schema);
		expect(names.has('_')).toBe(false);
		expect(names.has('name')).toBe(true);
	});
});
