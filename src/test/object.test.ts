import {describe, test, assert} from 'vitest';

import {
	map_record,
	omit,
	pick_by,
	omit_undefined,
	reorder,
	traverse,
	is_plain_object,
	EMPTY_OBJECT,
	transform_empty_object_to_undefined,
} from '$lib/object.ts';

describe('map_record', () => {
	test('basic behavior', () => {
		assert.deepStrictEqual(
			map_record({a: 1, b: 2}, (v, k) => v + k),
			{a: '1a', b: '2b'},
		);
		assert.deepStrictEqual(
			map_record({}, (v, k) => v + k),
			{},
		);
	});
});

describe('omit', () => {
	test('basic behavior', () => {
		assert.deepStrictEqual(omit({a: 1, b: 2}, ['b']), {a: 1});
		assert.deepStrictEqual(omit({a: 1, b: 2}, []), {a: 1, b: 2});
		assert.deepStrictEqual(omit({a: 1, b: 2}, ['b', 'a']), {});
	});
});

describe('pick_by', () => {
	test('basic behavior', () => {
		assert.deepStrictEqual(
			pick_by({a: 1, b: 2}, (v) => v === 1),
			{a: 1},
		);
		assert.deepStrictEqual(
			pick_by({a: 1, b: 2}, (_v, k) => k === 'a'),
			{a: 1},
		);
		assert.deepStrictEqual(
			pick_by({a: 1, b: 2}, () => false),
			{},
		);
		assert.deepStrictEqual(
			pick_by({a: 1, b: 2}, () => true),
			{a: 1, b: 2},
		);
	});
});

describe('omit_undefined', () => {
	test('basic behavior', () => {
		assert.deepStrictEqual(omit_undefined({a: 1, b: undefined, c: undefined}), {a: 1});
		assert.deepStrictEqual(omit_undefined({a: undefined, b: 2, c: undefined}), {b: 2});
		assert.deepStrictEqual(omit_undefined({a: 1, b: 2}), {a: 1, b: 2});
		assert.deepStrictEqual(omit_undefined({a: undefined, b: undefined}), {} as any);
		assert.deepStrictEqual(omit_undefined({}), {});
	});
});

describe('reorder', () => {
	test('basic behavior', () => {
		assert.strictEqual(
			JSON.stringify(reorder({a: 1, b: 2, c: 3, d: 4}, ['d', 'b', 'c', 'a'])),
			JSON.stringify({d: 4, b: 2, c: 3, a: 1}),
		);
	});
});

describe('traverse', () => {
	test('basic behavior', () => {
		const results: Array<any> = [];
		const obj = {a: 1, b: {c: 2, d: ['33', undefined]}, e: null};
		traverse(obj, (key, value, obj) => results.push(key, value, obj));
		assert.deepStrictEqual(results, [
			'a',
			1,
			obj,
			'b',
			{c: 2, d: ['33', undefined]},
			obj,
			'c',
			2,
			obj.b,
			'd',
			['33', undefined],
			obj.b,
			'0',
			'33',
			obj.b.d,
			'1',
			undefined,
			obj.b.d,
			'e',
			null,
			obj,
		]);
	});
});

describe('is_plain_object', () => {
	test('returns true for plain objects', () => {
		assert.isTrue(is_plain_object({}));
		assert.isTrue(is_plain_object({a: 1}));
	});

	test('returns true for Object.create(null)', () => {
		assert.isTrue(is_plain_object(Object.create(null)));
	});

	test('returns false for class instances', () => {
		assert.isFalse(is_plain_object(new Map()));
		assert.isFalse(is_plain_object(new Set()));
		assert.isFalse(is_plain_object(new Date()));
		assert.isFalse(is_plain_object(new Error('test')));
	});

	test('returns false for arrays', () => {
		assert.isFalse(is_plain_object([]));
		assert.isFalse(is_plain_object([1, 2]));
	});

	test('returns false for null, undefined, and primitives', () => {
		assert.isFalse(is_plain_object(null));
		assert.isFalse(is_plain_object(undefined));
		assert.isFalse(is_plain_object(0));
		assert.isFalse(is_plain_object(''));
		assert.isFalse(is_plain_object(false));
	});
});

describe('EMPTY_OBJECT', () => {
	test('is a frozen empty object', () => {
		assert.isTrue(Object.isFrozen(EMPTY_OBJECT));
		assert.strictEqual(Object.keys(EMPTY_OBJECT).length, 0);
	});

	test('property access returns undefined', () => {
		assert.strictEqual(EMPTY_OBJECT['anything-here'], undefined);
		assert.strictEqual(EMPTY_OBJECT[42], undefined);
	});

	test('mutations throw', () => {
		assert.throws(() => {
			(EMPTY_OBJECT as any).x = 1;
		});
	});
});

describe('transform_empty_object_to_undefined', () => {
	test('returns undefined for empty object', () => {
		assert.strictEqual(transform_empty_object_to_undefined({}), undefined);
	});

	test('returns the object if it has properties', () => {
		const obj = {a: 1};
		assert.strictEqual(transform_empty_object_to_undefined(obj), obj);
	});

	test('returns falsy values as-is', () => {
		assert.strictEqual(transform_empty_object_to_undefined(null), null);
		// eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
		assert.strictEqual(transform_empty_object_to_undefined(undefined), undefined);
		assert.strictEqual(transform_empty_object_to_undefined(0 as any), 0);
		assert.strictEqual(transform_empty_object_to_undefined('' as any), '');
	});
});
