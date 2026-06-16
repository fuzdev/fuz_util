import {test, assert, describe} from 'vitest';

import {json_type_of, json_embed, json_stringify_deterministic} from '$lib/json.ts';
import {noop} from '$lib/function.ts';

describe('json_type_of', () => {
	test('returns correct type for strings', () => {
		assert.strictEqual(json_type_of(''), 'string');
		assert.strictEqual(json_type_of('1'), 'string');
	});

	test('returns correct type for numbers', () => {
		assert.strictEqual(json_type_of(1), 'number');
		assert.strictEqual(json_type_of(-1), 'number');
		assert.strictEqual(json_type_of(-100.5), 'number');
		assert.strictEqual(json_type_of(NaN), 'number');
		assert.strictEqual(json_type_of(Infinity), 'number');
	});

	test('returns correct type for booleans', () => {
		assert.strictEqual(json_type_of(false), 'boolean');
		assert.strictEqual(json_type_of(true), 'boolean');
	});

	test('returns correct type for objects', () => {
		assert.strictEqual(json_type_of({}), 'object');
		assert.strictEqual(json_type_of({a: 1}), 'object');
	});

	test('returns correct type for null', () => {
		assert.strictEqual(json_type_of(null), 'null');
	});

	test('returns correct type for arrays', () => {
		assert.strictEqual(json_type_of([]), 'array');
		assert.strictEqual(json_type_of([1, 2, 3]), 'array');
	});

	test('returns undefined for invalid types', () => {
		assert.strictEqual(json_type_of(undefined as any), undefined);
		assert.strictEqual(json_type_of(noop as any), undefined);
		assert.strictEqual(json_type_of(BigInt(9000) as any), undefined);
		assert.strictEqual(json_type_of(Symbol() as any), undefined);
	});
});

describe('json_embed', () => {
	test('escapes double quotes', () => {
		assert.strictEqual(json_embed('hello"world'), `JSON.parse('"hello\\"world"')`);
	});

	test('escapes single quotes', () => {
		assert.strictEqual(json_embed("hello'world"), `JSON.parse('"hello\\'world"')`);
	});

	test('escapes multiple single quotes', () => {
		assert.strictEqual(
			json_embed("'hello'w''or'''ld'"),
			`JSON.parse('"\\'hello\\'w\\'\\'or\\'\\'\\'ld\\'"')`,
		);
	});

	test('formats objects with custom serializer', () => {
		assert.strictEqual(
			json_embed({a: 1, b: 2}, (d) => JSON.stringify(d, null, '\t')),
			`JSON.parse('{\\
	"a": 1,\\
	"b": 2\\
}')`,
		);
	});

	test('embeds primitive numbers', () => {
		assert.strictEqual(json_embed(123), `JSON.parse('123')`);
		assert.strictEqual(json_embed(-456), `JSON.parse('-456')`);
		assert.strictEqual(json_embed(0), `JSON.parse('0')`);
	});

	test('embeds primitive booleans', () => {
		assert.strictEqual(json_embed(true), `JSON.parse('true')`);
		assert.strictEqual(json_embed(false), `JSON.parse('false')`);
	});

	test('embeds null', () => {
		assert.strictEqual(json_embed(null), `JSON.parse('null')`);
	});

	test('embeds arrays', () => {
		assert.strictEqual(json_embed([1, 2, 3]), `JSON.parse('[1,2,3]')`);
		assert.strictEqual(json_embed(['a', 'b', 'c']), `JSON.parse('["a","b","c"]')`);
	});

	test('embeds nested arrays', () => {
		assert.strictEqual(
			json_embed([
				[1, 2],
				[3, 4],
			]),
			`JSON.parse('[[1,2],[3,4]]')`,
		);
	});

	test('embeds empty values', () => {
		assert.strictEqual(json_embed(''), `JSON.parse('""')`);
		assert.strictEqual(json_embed({}), `JSON.parse('{}')`);
		assert.strictEqual(json_embed([]), `JSON.parse('[]')`);
	});

	test('escapes backslashes', () => {
		assert.strictEqual(json_embed('path\\to\\file'), `JSON.parse('"path\\\\to\\\\file"')`);
	});

	test('handles strings with actual newlines', () => {
		const stringWithNewline = 'line1\nline2';
		const result = json_embed(stringWithNewline);
		assert.strictEqual(result, `JSON.parse('"line1\\nline2"')`);
	});

	test('embeds complex nested structures', () => {
		const complex = {a: [1, {b: 2}], c: {d: [3, 4]}};
		assert.strictEqual(json_embed(complex), `JSON.parse('{"a":[1,{"b":2}],"c":{"d":[3,4]}}')`);
	});

	test('handles tab characters', () => {
		const stringWithTab = 'hello\tworld';
		const result = json_embed(stringWithTab);
		assert.strictEqual(result, `JSON.parse('"hello\\tworld"')`);
	});

	test('handles carriage returns', () => {
		const stringWithCr = 'line1\rline2';
		const result = json_embed(stringWithCr);
		assert.strictEqual(result, `JSON.parse('"line1\\rline2"')`);
	});

	test('handles mixed special characters', () => {
		const mixed = 'it\'s a\n"test"\twith\rspecial chars';
		const result = json_embed(mixed);
		assert.strictEqual(result, `JSON.parse('"it\\'s a\\n\\"test\\"\\twith\\rspecial chars"')`);
	});

	test('round-trip preserves data integrity', () => {
		const testCases = [
			{name: 'object', data: {a: 1, b: 'test', c: [1, 2, 3]}},
			{name: 'array', data: [1, 'hello', true, null]},
			{name: 'string', data: 'test string'},
			{name: 'number', data: 42},
			{name: 'boolean', data: true},
			{name: 'null', data: null},
			{name: 'nested', data: {a: {b: {c: [1, {d: 2}]}}}},
		];

		for (const {name, data} of testCases) {
			const embedded = json_embed(data);
			// eslint-disable-next-line no-eval -- Testing that embedded JSON parses correctly
			const parsed = eval(embedded);
			assert.deepStrictEqual(parsed, data, `Round-trip failed for ${name}`);
		}
	});

	test('handles objects with toJSON method', () => {
		const obj = {
			value: 'test',
			toJSON() {
				return {custom: 'serialized', data: 123};
			},
		};
		const result = json_embed(obj);
		assert.strictEqual(result, `JSON.parse('{"custom":"serialized","data":123}')`);
	});
});

describe('json_stringify_deterministic', () => {
	test('sorts object keys alphabetically', () => {
		const obj = {z: 1, a: 2, m: 3};
		const result = json_stringify_deterministic(obj);
		assert.strictEqual(result, '{"a":2,"m":3,"z":1}');
	});

	test('produces same output regardless of key order', () => {
		const obj1 = {z: 1, a: 2, m: 3};
		const obj2 = {a: 2, m: 3, z: 1};
		const obj3 = {m: 3, z: 1, a: 2};

		assert.strictEqual(json_stringify_deterministic(obj1), json_stringify_deterministic(obj2));
		assert.strictEqual(json_stringify_deterministic(obj2), json_stringify_deterministic(obj3));
	});

	test('handles nested objects', () => {
		const obj = {
			z: {nested_z: 1, nested_a: 2},
			a: {nested_b: 3, nested_a: 4},
		};
		const result = json_stringify_deterministic(obj);
		// Both outer and inner keys should be sorted
		assert.strictEqual(result, '{"a":{"nested_a":4,"nested_b":3},"z":{"nested_a":2,"nested_z":1}}');
	});

	test('preserves array order', () => {
		const obj = {z: [3, 1, 2], a: [6, 4, 5]};
		const result = json_stringify_deterministic(obj);
		// Keys sorted, but array elements keep their order
		assert.strictEqual(result, '{"a":[6,4,5],"z":[3,1,2]}');
	});

	test('handles top-level array', () => {
		const arr = [3, 1, 2];
		const result = json_stringify_deterministic(arr);
		// Array order preserved
		assert.strictEqual(result, '[3,1,2]');
	});

	test('handles nested arrays', () => {
		const obj = {
			z: [
				[3, 2],
				[1, 0],
			],
			a: [
				[6, 5],
				[4, 3],
			],
		};
		const result = json_stringify_deterministic(obj);
		// All array ordering preserved, keys sorted
		assert.strictEqual(result, '{"a":[[6,5],[4,3]],"z":[[3,2],[1,0]]}');
	});

	test('handles sparse arrays', () => {
		const arr = new Array(3);
		arr[0] = 1;
		arr[2] = 3;
		const obj = {data: arr};
		const result = json_stringify_deterministic(obj);
		// Empty slots become null
		assert.strictEqual(result, '{"data":[1,null,3]}');
	});

	test('handles arrays of objects', () => {
		const obj = {
			items: [
				{z: 1, a: 2},
				{y: 3, b: 4},
			],
		};
		const result = json_stringify_deterministic(obj);
		// Objects in array should also have sorted keys
		assert.strictEqual(result, '{"items":[{"a":2,"z":1},{"b":4,"y":3}]}');
	});

	test('handles primitives', () => {
		assert.strictEqual(json_stringify_deterministic('string'), '"string"');
		assert.strictEqual(json_stringify_deterministic(123), '123');
		assert.strictEqual(json_stringify_deterministic(true), 'true');
		assert.strictEqual(json_stringify_deterministic(null), 'null');
	});

	test('handles falsy but valid values', () => {
		const obj = {z: false, a: 0, m: '', n: null};
		const result = json_stringify_deterministic(obj);
		assert.strictEqual(result, '{"a":0,"m":"","n":null,"z":false}');
	});

	test('handles negative numbers', () => {
		const obj = {z: -100, a: -1, m: 0, b: 1};
		const result = json_stringify_deterministic(obj);
		assert.strictEqual(result, '{"a":-1,"b":1,"m":0,"z":-100}');
	});

	test('handles undefined in objects by omitting keys', () => {
		const obj = {z: 1, a: undefined, m: 2};
		const result = json_stringify_deterministic(obj);
		// 'a' key is omitted entirely
		assert.strictEqual(result, '{"m":2,"z":1}');
	});

	test('handles undefined in arrays by converting to null', () => {
		const obj = {items: [1, undefined, 3]};
		const result = json_stringify_deterministic(obj);
		// undefined becomes null in arrays
		assert.strictEqual(result, '{"items":[1,null,3]}');
	});

	test('handles NaN and Infinity as null', () => {
		const obj = {z_nan: NaN, a_inf: Infinity, m_neginf: -Infinity};
		const result = json_stringify_deterministic(obj);
		assert.strictEqual(result, '{"a_inf":null,"m_neginf":null,"z_nan":null}');
	});

	test('handles functions by omitting them from objects', () => {
		const obj = {z: 1, a: () => 'test', m: 2};
		const result = json_stringify_deterministic(obj);
		// Function key is omitted
		assert.strictEqual(result, '{"m":2,"z":1}');
	});

	test('ignores symbol keys', () => {
		const sym = Symbol('test');
		const obj = {z: 1, [sym]: 'ignored', a: 2} as any;
		const result = json_stringify_deterministic(obj);
		// Symbols are not enumerable in JSON
		assert.strictEqual(result, '{"a":2,"z":1}');
	});

	test('handles Date objects as ISO strings', () => {
		const date = new Date('2024-01-15T12:00:00.000Z');
		const obj = {z_date: date, a_string: 'text'};
		const result = json_stringify_deterministic(obj);
		assert.strictEqual(result, '{"a_string":"text","z_date":"2024-01-15T12:00:00.000Z"}');
	});

	test('handles Map and Set as empty objects', () => {
		const obj = {z: new Map([['a', 1]]), a: new Set([1, 2]), m: 'value'};
		const result = json_stringify_deterministic(obj);
		// Maps and Sets become {}
		assert.strictEqual(result, '{"a":{},"m":"value","z":{}}');
	});

	test('handles empty object', () => {
		assert.strictEqual(json_stringify_deterministic({}), '{}');
	});

	test('handles empty array', () => {
		assert.strictEqual(json_stringify_deterministic([]), '[]');
	});

	test('sorts numeric keys alphabetically as strings', () => {
		const obj = {10: 'ten', 2: 'two', 1: 'one', 20: 'twenty'};
		const result = json_stringify_deterministic(obj);
		// JSON.stringify outputs integer-like keys in numeric order per spec
		assert.strictEqual(result, '{"1":"one","2":"two","10":"ten","20":"twenty"}');
	});

	test('handles mixed numeric and string keys', () => {
		const obj = {100: 'hundred', '50': 'fifty', a: 'letter', '2': 'two', z: 'last'};
		const result = json_stringify_deterministic(obj);
		// Numeric keys first (in numeric order), then string keys alphabetically
		assert.strictEqual(result, '{"2":"two","50":"fifty","100":"hundred","a":"letter","z":"last"}');
	});

	test('handles empty string keys', () => {
		const obj = {'': 'empty', z: 'z-value', a: 'a-value'};
		const result = json_stringify_deterministic(obj);
		// Empty string sorts first
		assert.strictEqual(result, '{"":"empty","a":"a-value","z":"z-value"}');
	});

	test('handles keys with whitespace', () => {
		const obj = {' z ': 1, a: 2, '  b': 3, 'c ': 4};
		const result = json_stringify_deterministic(obj);
		// Whitespace affects sorting, spaces sort before letters
		assert.strictEqual(result, '{"  b":3," z ":1,"a":2,"c ":4}');
	});

	test('handles Unicode and special characters in keys', () => {
		const obj = {'z-key': 1, 'a key': 2, ñ: 3, 中文: 4};
		const result = json_stringify_deterministic(obj);
		// Sorts by Unicode code points
		assert.strictEqual(result, '{"a key":2,"z-key":1,"ñ":3,"中文":4}');
	});

	test('handles deeply nested structures', () => {
		const obj = {
			z: {
				nested: {
					deep: {
						z_key: 1,
						a_key: 2,
					},
				},
			},
			a: 'value',
		};
		const result = json_stringify_deterministic(obj);
		assert.strictEqual(result, '{"a":"value","z":{"nested":{"deep":{"a_key":2,"z_key":1}}}}');
	});

	test('handles complex nested array-object structures', () => {
		const obj = {
			z: [
				{nested: [1, 2, {deep_z: 'z', deep_a: 'a'}]},
				{nested: [3, 4, {deep_m: 'm', deep_b: 'b'}]},
			],
			a: {items: [{z: 1, a: 2}]},
		};
		const result = json_stringify_deterministic(obj);
		// All object keys sorted at every level, array order preserved
		assert.strictEqual(
			result,
			'{"a":{"items":[{"a":2,"z":1}]},"z":[{"nested":[1,2,{"deep_a":"a","deep_z":"z"}]},{"nested":[3,4,{"deep_b":"b","deep_m":"m"}]}]}',
		);
	});

	test('handles objects with toJSON method', () => {
		const obj = {
			z: 'regular',
			a: {
				toJSON() {
					return {custom: 'serialized', z_field: 1, a_field: 2};
				},
			},
		};
		const result = json_stringify_deterministic(obj);
		// toJSON output also gets sorted
		assert.strictEqual(
			result,
			'{"a":{"a_field":2,"custom":"serialized","z_field":1},"z":"regular"}',
		);
	});

	test('handles mixed types', () => {
		const obj = {
			z_string: 'text',
			a_number: 42,
			m_boolean: true,
			b_null: null,
			y_array: [1, 2, 3],
			d_object: {z: 1, a: 2},
		};
		const result = json_stringify_deterministic(obj);
		assert.strictEqual(
			result,
			'{"a_number":42,"b_null":null,"d_object":{"a":2,"z":1},"m_boolean":true,"y_array":[1,2,3],"z_string":"text"}',
		);
	});

	test('consistent with JSON.parse roundtrip', () => {
		const obj = {z: 1, a: 2, m: {nested_z: 3, nested_a: 4}};
		const json = json_stringify_deterministic(obj);
		const parsed = JSON.parse(json);
		// The parsed object should be semantically equal (though key order might differ in memory)
		assert.deepStrictEqual(parsed, obj);
	});

	test('throws on circular references', () => {
		const obj: any = {z: 1, a: 2};
		obj.circular = obj;
		// Throws RangeError (stack overflow) due to recursion in replacer
		assert.throws(() => json_stringify_deterministic(obj), RangeError);
	});

	test('handles build_cache_config-like objects', () => {
		const config1 = {
			platform: 'linux',
			arch: 'x64',
			node: 'v20.0.0',
			features: {beta_ui: true, analytics: false},
		};
		const config2 = {
			features: {analytics: false, beta_ui: true},
			node: 'v20.0.0',
			platform: 'linux',
			arch: 'x64',
		};

		assert.strictEqual(
			json_stringify_deterministic(config1),
			json_stringify_deterministic(config2),
		);
	});
});
