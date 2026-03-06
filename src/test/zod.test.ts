import {assert, test, describe} from 'vitest';
import {z} from 'zod';

import {
	zod_to_subschema,
	ZOD_WRAPPER_TYPES,
	zod_unwrap_def,
	zod_get_base_type,
	zod_is_optional,
	zod_is_nullable,
	zod_has_default,
	zod_unwrap_to_object,
	zod_extract_fields,
	zod_to_schema_description,
	zod_to_schema_default,
	zod_to_schema_aliases,
	zod_to_schema_type_string,
	zod_format_value,
	zod_to_schema_properties,
	zod_to_schema_names_with_aliases,
} from '$lib/zod.ts';

// -- zod_to_subschema --

describe('zod_to_subschema', () => {
	const unwrappable: Array<[string, z.ZodType]> = [
		['optional', z.string().optional()],
		['nullable', z.string().nullable()],
		['default', z.string().default('hi')],
		['pipe', z.string().pipe(z.string())],
	];

	for (const [label, schema] of unwrappable) {
		test(`unwraps ${label}`, () => {
			const sub = zod_to_subschema(schema._zod.def);
			assert.ok(sub, `expected subschema for ${label}`);
		});
	}

	const terminal: Array<[string, z.ZodType]> = [
		['string', z.string()],
		['number', z.number()],
		['boolean', z.boolean()],
		['enum', z.enum(['a', 'b'])],
		['object', z.strictObject({x: z.string()})],
		['array', z.array(z.string())],
	];

	for (const [label, schema] of terminal) {
		test(`returns undefined for ${label}`, () => {
			assert.equal(zod_to_subschema(schema._zod.def), undefined);
		});
	}
});

// -- ZOD_WRAPPER_TYPES --

test('ZOD_WRAPPER_TYPES contains expected types', () => {
	const expected = ['optional', 'nullable', 'default', 'transform', 'pipe', 'prefault'];
	for (const t of expected) {
		assert.ok(ZOD_WRAPPER_TYPES.has(t), `missing ${t}`);
	}
	assert.equal(ZOD_WRAPPER_TYPES.size, expected.length);
});

// -- zod_unwrap_def --

describe('zod_unwrap_def', () => {
	test('returns def directly for base types', () => {
		assert.equal(zod_unwrap_def(z.string()).type, 'string');
		assert.equal(zod_unwrap_def(z.number()).type, 'number');
		assert.equal(zod_unwrap_def(z.boolean()).type, 'boolean');
	});

	test('unwraps single wrapper', () => {
		assert.equal(zod_unwrap_def(z.string().optional()).type, 'string');
		assert.equal(zod_unwrap_def(z.string().nullable()).type, 'string');
		assert.equal(zod_unwrap_def(z.number().default(0)).type, 'number');
	});

	test('unwraps multiple layers', () => {
		const schema = z.string().nullable().optional().default('x');
		assert.equal(zod_unwrap_def(schema).type, 'string');
	});

	test('unwraps pipe to input schema', () => {
		const schema = z.string().pipe(z.string());
		assert.equal(zod_unwrap_def(schema).type, 'string');
	});

	test('stops at non-wrapper types', () => {
		assert.equal(zod_unwrap_def(z.enum(['a', 'b'])).type, 'enum');
	});

	test('unwraps to object', () => {
		const schema = z.strictObject({x: z.string()}).default({x: 'hi'});
		assert.equal(zod_unwrap_def(schema).type, 'object');
	});
});

// -- zod_get_base_type --

describe('zod_get_base_type', () => {
	const cases: Array<[string, z.ZodType, string]> = [
		['plain string', z.string(), 'string'],
		['plain number', z.number(), 'number'],
		['plain boolean', z.boolean(), 'boolean'],
		['enum', z.enum(['x']), 'enum'],
		['array', z.array(z.number()), 'array'],
		['object', z.strictObject({a: z.string()}), 'object'],
		['optional string', z.string().optional(), 'string'],
		['nullable number', z.number().nullable(), 'number'],
		['default boolean', z.boolean().default(true), 'boolean'],
		['optional nullable default', z.string().nullable().default('x').optional(), 'string'],
	];

	for (const [label, schema, expected] of cases) {
		test(label, () => {
			assert.equal(zod_get_base_type(schema), expected);
		});
	}
});

// -- zod_is_optional --

describe('zod_is_optional', () => {
	test('true for optional schema', () => {
		assert.ok(zod_is_optional(z.string().optional()));
	});

	test('false for required schema', () => {
		assert.ok(!zod_is_optional(z.string()));
	});

	test('false for nullable (not optional)', () => {
		assert.ok(!zod_is_optional(z.string().nullable()));
	});

	test('false for default (not optional)', () => {
		assert.ok(!zod_is_optional(z.string().default('x')));
	});

	test('checks outermost only — inner optional not detected', () => {
		assert.ok(!zod_is_optional(z.string().optional().nullable()));
	});

	test('checks outermost only — outer optional detected', () => {
		assert.ok(zod_is_optional(z.string().nullable().optional()));
	});
});

// -- zod_is_nullable --

describe('zod_is_nullable', () => {
	test('true for nullable schema', () => {
		assert.ok(zod_is_nullable(z.string().nullable()));
	});

	test('false for non-nullable schema', () => {
		assert.ok(!zod_is_nullable(z.string()));
	});

	test('false for optional-only schema', () => {
		assert.ok(!zod_is_nullable(z.string().optional()));
	});

	test('finds nullable through optional wrapper', () => {
		assert.ok(zod_is_nullable(z.string().nullable().optional()));
	});

	test('finds nullable through default wrapper', () => {
		assert.ok(zod_is_nullable(z.string().nullable().default('x')));
	});

	test('finds nullable through multiple wrappers', () => {
		assert.ok(zod_is_nullable(z.string().nullable().default('x').optional()));
	});

	test('false when no nullable at any level', () => {
		assert.ok(!zod_is_nullable(z.string().default('x').optional()));
	});
});

// -- zod_has_default --

describe('zod_has_default', () => {
	test('true for schema with default', () => {
		assert.ok(zod_has_default(z.string().default('x')));
	});

	test('false for schema without default', () => {
		assert.ok(!zod_has_default(z.string()));
	});

	test('finds default through optional wrapper', () => {
		assert.ok(zod_has_default(z.string().default('x').optional()));
	});

	test('finds default through nullable wrapper', () => {
		assert.ok(zod_has_default(z.number().default(0).nullable()));
	});

	test('false for optional without default', () => {
		assert.ok(!zod_has_default(z.string().optional()));
	});

	test('false for nullable without default', () => {
		assert.ok(!zod_has_default(z.string().nullable()));
	});

	test('detects default of false', () => {
		assert.ok(zod_has_default(z.boolean().default(false)));
	});
});

// -- zod_unwrap_to_object --

describe('zod_unwrap_to_object', () => {
	test('returns object schema directly', () => {
		const schema = z.strictObject({x: z.string()});
		const result = zod_unwrap_to_object(schema);
		assert.ok(result);
		assert.ok('x' in result.shape);
	});

	test('unwraps optional around object', () => {
		const result = zod_unwrap_to_object(z.strictObject({x: z.string()}).optional());
		assert.ok(result);
		assert.ok('x' in result.shape);
	});

	test('unwraps default around object', () => {
		const result = zod_unwrap_to_object(z.strictObject({x: z.string()}).default({x: 'hi'}));
		assert.ok(result);
		assert.ok('x' in result.shape);
	});

	test('unwraps nullable around object', () => {
		const result = zod_unwrap_to_object(z.strictObject({x: z.number()}).nullable());
		assert.ok(result);
		assert.ok('x' in result.shape);
	});

	test('unwraps multiple layers around object', () => {
		const result = zod_unwrap_to_object(
			z.strictObject({a: z.boolean()}).default({a: true}).optional(),
		);
		assert.ok(result);
		assert.ok('a' in result.shape);
	});

	const non_objects: Array<[string, z.ZodType]> = [
		['string', z.string()],
		['number', z.number()],
		['array', z.array(z.string())],
		['optional string', z.string().optional()],
		['enum', z.enum(['a'])],
	];

	for (const [label, schema] of non_objects) {
		test(`returns null for ${label}`, () => {
			assert.equal(zod_unwrap_to_object(schema), null);
		});
	}

	test('works with z.object (loose)', () => {
		const result = zod_unwrap_to_object(z.object({y: z.number()}));
		assert.ok(result);
		assert.ok('y' in result.shape);
	});

	test('works with empty object', () => {
		const result = zod_unwrap_to_object(z.strictObject({}));
		assert.ok(result);
		assert.equal(Object.keys(result.shape).length, 0);
	});
});

// -- zod_extract_fields --

describe('zod_extract_fields', () => {
	test('extracts basic field info', () => {
		const schema = z.strictObject({
			name: z.string(),
			age: z.number().optional(),
			active: z.boolean().default(true),
		});
		const fields = zod_extract_fields(schema);
		assert.equal(fields.length, 3);

		const name_field = fields.find((f) => f.name === 'name')!;
		assert.equal(name_field.base_type, 'string');
		assert.ok(name_field.required);
		assert.ok(!name_field.has_default);
		assert.ok(!name_field.nullable);

		const age_field = fields.find((f) => f.name === 'age')!;
		assert.equal(age_field.base_type, 'number');
		assert.ok(!age_field.required);
		assert.ok(!age_field.has_default);
		assert.ok(!age_field.nullable);

		const active_field = fields.find((f) => f.name === 'active')!;
		assert.equal(active_field.base_type, 'boolean');
		assert.ok(active_field.required);
		assert.ok(active_field.has_default);
		assert.ok(!active_field.nullable);
	});

	test('detects nullable fields', () => {
		const schema = z.strictObject({
			value: z.string().nullable(),
			wrapped: z.number().nullable().optional(),
		});
		const fields = zod_extract_fields(schema);
		assert.ok(fields.find((f) => f.name === 'value')!.nullable);
		assert.ok(fields.find((f) => f.name === 'wrapped')!.nullable);
	});

	test('empty object returns empty array', () => {
		assert.equal(zod_extract_fields(z.strictObject({})).length, 0);
	});

	test('handles enum fields', () => {
		const schema = z.strictObject({status: z.enum(['active', 'inactive'])});
		const fields = zod_extract_fields(schema);
		assert.equal(fields[0]!.base_type, 'enum');
		assert.ok(fields[0]!.required);
	});

	test('handles deeply wrapped fields', () => {
		const schema = z.strictObject({
			deep: z.string().nullable().default('x').optional(),
		});
		const fields = zod_extract_fields(schema);
		const f = fields[0]!;
		assert.equal(f.base_type, 'string');
		assert.ok(!f.required);
		assert.ok(f.has_default);
		assert.ok(f.nullable);
	});
});

// -- zod_to_schema_description --

describe('zod_to_schema_description', () => {
	test('returns description from meta', () => {
		assert.equal(zod_to_schema_description(z.string().meta({description: 'a name'})), 'a name');
	});

	test('returns null when no description', () => {
		assert.equal(zod_to_schema_description(z.string()), null);
	});

	test('unwraps optional to find description', () => {
		assert.equal(
			zod_to_schema_description(z.string().meta({description: 'inner'}).optional()),
			'inner',
		);
	});

	test('unwraps default to find description', () => {
		assert.equal(
			zod_to_schema_description(z.string().meta({description: 'with default'}).default('hi')),
			'with default',
		);
	});

	test('unwraps nullable to find description', () => {
		assert.equal(
			zod_to_schema_description(z.string().meta({description: 'nullable inner'}).nullable()),
			'nullable inner',
		);
	});

	test('prefers outer description over inner', () => {
		const schema = z.string().meta({description: 'inner'}).optional().meta({description: 'outer'});
		assert.equal(zod_to_schema_description(schema), 'outer');
	});

	test('returns null through multiple wrappers with no description', () => {
		assert.equal(zod_to_schema_description(z.string().optional().nullable()), null);
	});
});

// -- zod_to_schema_default --

describe('zod_to_schema_default', () => {
	const cases: Array<[string, z.ZodType, unknown]> = [
		['string default', z.string().default('hello'), 'hello'],
		['boolean false default', z.boolean().default(false), false],
		['number default', z.number().default(42), 42],
		['number zero default', z.number().default(0), 0],
		['empty string default', z.string().default(''), ''],
		['no default', z.string(), undefined],
		['nested through optional', z.string().default('nested').optional(), 'nested'],
		['nested through nullable', z.number().default(7).nullable(), 7],
	];

	for (const [label, schema, expected] of cases) {
		test(label, () => {
			assert.strictEqual(zod_to_schema_default(schema), expected);
		});
	}

	test('array default', () => {
		const result = zod_to_schema_default(z.array(z.string()).default([]));
		assert.ok(Array.isArray(result));
		assert.equal((result as Array<unknown>).length, 0);
	});

	test('object default', () => {
		const result = zod_to_schema_default(z.strictObject({x: z.string()}).default({x: 'a'})) as {
			x: string;
		};
		assert.equal(result.x, 'a');
	});
});

// -- zod_to_schema_aliases --

describe('zod_to_schema_aliases', () => {
	test('returns aliases from meta', () => {
		assert.deepEqual(zod_to_schema_aliases(z.string().meta({aliases: ['n', 'name']})), [
			'n',
			'name',
		]);
	});

	test('returns empty array when no aliases', () => {
		assert.deepEqual(zod_to_schema_aliases(z.string()), []);
	});

	test('unwraps optional to find aliases', () => {
		assert.deepEqual(
			zod_to_schema_aliases(
				z
					.string()
					.meta({aliases: ['v']})
					.optional(),
			),
			['v'],
		);
	});

	test('unwraps default to find aliases', () => {
		assert.deepEqual(
			zod_to_schema_aliases(
				z
					.boolean()
					.meta({aliases: ['h']})
					.default(false),
			),
			['h'],
		);
	});

	test('returns empty array through wrappers with no aliases', () => {
		assert.deepEqual(zod_to_schema_aliases(z.string().optional().nullable()), []);
	});
});

// -- zod_to_schema_type_string --

describe('zod_to_schema_type_string', () => {
	const simple_cases: Array<[string, z.ZodType, string]> = [
		['string', z.string(), 'string'],
		['number', z.number(), 'number'],
		['boolean', z.boolean(), 'boolean'],
		['bigint', z.bigint(), 'bigint'],
		['array', z.array(z.string()), 'Array<string>'],
		['nullable string', z.string().nullable(), 'string | null'],
		['optional string', z.string().optional(), 'string | undefined'],
		['default string', z.string().default('hi'), 'string'],
		['nullable optional', z.string().nullable().optional(), 'string | null | undefined'],
		['optional nullable', z.string().optional().nullable(), 'string | undefined | null'],
	];

	for (const [label, schema, expected] of simple_cases) {
		test(label, () => {
			assert.equal(zod_to_schema_type_string(schema), expected);
		});
	}

	test('enum', () => {
		assert.equal(zod_to_schema_type_string(z.enum(['a', 'b', 'c'])), "'a' | 'b' | 'c'");
	});

	test('single-value enum', () => {
		assert.equal(zod_to_schema_type_string(z.enum(['only'])), "'only'");
	});

	test('literal number', () => {
		assert.equal(zod_to_schema_type_string(z.literal(42)), '42');
	});

	test('literal string', () => {
		assert.equal(zod_to_schema_type_string(z.literal('yes')), "'yes'");
	});

	test('literal boolean', () => {
		assert.equal(zod_to_schema_type_string(z.literal(true)), 'true');
	});

	test('literal null', () => {
		assert.equal(zod_to_schema_type_string(z.literal(null)), 'null');
	});
});

// -- zod_format_value --

describe('zod_format_value', () => {
	const cases: Array<[string, unknown, string]> = [
		['undefined', undefined, ''],
		['null', null, 'null'],
		['string', 'hello', "'hello'"],
		['empty string', '', "''"],
		['true', true, 'true'],
		['false', false, 'false'],
		['positive number', 42, '42'],
		['zero', 0, '0'],
		['negative number', -1, '-1'],
		['empty array', [], '[]'],
		['non-empty array', [1, 2], '[]'],
		['object', {a: 1}, '{"a":1}'],
		['empty object', {}, '{}'],
	];

	for (const [label, value, expected] of cases) {
		test(label, () => {
			assert.equal(zod_format_value(value), expected);
		});
	}

	test('symbol returns empty string', () => {
		assert.equal(zod_format_value(Symbol('x')), '');
	});

	test('function returns empty string', () => {
		assert.equal(
			zod_format_value(() => {}),
			'',
		);
	});
});

// -- zod_to_schema_properties --

describe('zod_to_schema_properties', () => {
	test('extracts properties with full metadata', () => {
		const schema = z.strictObject({
			name: z.string().meta({description: 'the name'}).default('world'),
			verbose: z
				.boolean()
				.meta({aliases: ['v'], description: 'verbose output'})
				.default(false),
		});
		const props = zod_to_schema_properties(schema);
		assert.equal(props.length, 2);

		assert.equal(props[0]!.name, 'name');
		assert.equal(props[0]!.type, 'string');
		assert.equal(props[0]!.description, 'the name');
		assert.equal(props[0]!.default, 'world');
		assert.deepEqual(props[0]!.aliases, []);

		assert.equal(props[1]!.name, 'verbose');
		assert.equal(props[1]!.type, 'boolean');
		assert.equal(props[1]!.description, 'verbose output');
		assert.strictEqual(props[1]!.default, false);
		assert.deepEqual(props[1]!.aliases, ['v']);
	});

	test('skips fields that have a no- counterpart', () => {
		const schema = z.strictObject({
			watch: z.boolean().default(true),
			'no-watch': z.boolean().default(false),
		});
		const props = zod_to_schema_properties(schema);
		assert.equal(props.length, 1);
		assert.equal(props[0]!.name, 'no-watch');
	});

	test('returns empty array for non-object schemas', () => {
		assert.equal(zod_to_schema_properties(z.string()).length, 0);
		assert.equal(zod_to_schema_properties(z.number()).length, 0);
		assert.equal(zod_to_schema_properties(z.array(z.string())).length, 0);
	});

	test('handles fields with no metadata', () => {
		const props = zod_to_schema_properties(z.strictObject({bare: z.string()}));
		assert.equal(props.length, 1);
		assert.equal(props[0]!.description, '');
		assert.equal(props[0]!.default, undefined);
		assert.deepEqual(props[0]!.aliases, []);
	});

	test('handles nullable fields', () => {
		const props = zod_to_schema_properties(z.strictObject({value: z.string().nullable()}));
		assert.equal(props[0]!.type, 'string | null');
	});

	test('handles enum fields', () => {
		const props = zod_to_schema_properties(z.strictObject({mode: z.enum(['fast', 'slow'])}));
		assert.equal(props[0]!.type, "'fast' | 'slow'");
	});
});

// -- zod_to_schema_names_with_aliases --

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
		for (const expected of ['help', 'h', 'version', 'v', 'V', 'name']) {
			assert.ok(names.has(expected), `expected '${expected}' in names`);
		}
	});

	test('skips _ property', () => {
		const schema = z.strictObject({
			_: z.array(z.string()).default([]),
			name: z.string().default(''),
		});
		const names = zod_to_schema_names_with_aliases(schema);
		assert.ok(!names.has('_'));
		assert.ok(names.has('name'));
	});

	test('empty object returns empty set', () => {
		assert.equal(zod_to_schema_names_with_aliases(z.strictObject({})).size, 0);
	});

	test('does not include aliases of _ field', () => {
		const schema = z.strictObject({
			_: z
				.array(z.string())
				.meta({aliases: ['positional']})
				.default([]),
		});
		const names = zod_to_schema_names_with_aliases(schema);
		assert.ok(!names.has('positional'));
		assert.equal(names.size, 0);
	});
});
