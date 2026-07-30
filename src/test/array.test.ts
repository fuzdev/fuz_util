import { describe, test, assert } from 'vitest';

import { EMPTY_ARRAY, to_array, remove_unordered, to_next } from '$lib/array.ts';

describe('EMPTY_ARRAY', () => {
	test('is an empty frozen array', () => {
		assert.isArray(EMPTY_ARRAY);
		assert.strictEqual(EMPTY_ARRAY.length, 0);
		assert.isTrue(Object.isFrozen(EMPTY_ARRAY));
	});

	test('mutations throw', () => {
		assert.throws(() => {
			EMPTY_ARRAY.push(1);
		});
		assert.throws(() => {
			EMPTY_ARRAY[0] = 1;
		});
	});

	test('same reference on repeated access', () => {
		assert.strictEqual(EMPTY_ARRAY, EMPTY_ARRAY);
	});
});

describe('to_array', () => {
	test('returns the same array if already an array', () => {
		const array = [1, 2, 3];
		assert.strictEqual(array, to_array(array));
	});

	test('wraps non-array values in an array', () => {
		assert.deepEqual(to_array(1), [1]);
		assert.deepEqual(to_array({ a: 1 }), [{ a: 1 }]);
		assert.deepEqual(to_array('hello'), ['hello']);
	});

	test('wraps null and undefined', () => {
		assert.deepEqual(to_array(null), [null]);
		assert.deepEqual(to_array(undefined), [undefined]);
	});

	test('returns empty array as-is', () => {
		const empty: Array<any> = [];
		assert.strictEqual(to_array(empty), empty);
	});
});

describe('remove_unordered', () => {
	test('removes element by swapping with last', () => {
		const arr = [10, 20, 30, 40];
		remove_unordered(arr, 1);
		assert.strictEqual(arr.length, 3);
		assert.strictEqual(arr[1], 40); // last element moved to index 1
		assert.isTrue(arr.includes(10));
		assert.isFalse(arr.includes(20));
	});

	test('removes last element', () => {
		const arr = [10, 20, 30];
		remove_unordered(arr, 2);
		assert.deepEqual(arr, [10, 20]);
	});

	test('removes first element', () => {
		const arr = [10, 20, 30];
		remove_unordered(arr, 0);
		assert.strictEqual(arr.length, 2);
		assert.strictEqual(arr[0], 30); // last swapped to 0
		assert.strictEqual(arr[1], 20);
	});

	test('removes from single-element array', () => {
		const arr = [42];
		remove_unordered(arr, 0);
		assert.deepEqual(arr, []);
	});
});

describe('to_next', () => {
	test('cycles through array linearly', () => {
		const next = to_next(['a', 'b', 'c']);
		assert.strictEqual(next(), 'a');
		assert.strictEqual(next(), 'b');
		assert.strictEqual(next(), 'c');
	});

	test('wraps back to index 0 after reaching end', () => {
		const next = to_next([1, 2]);
		assert.strictEqual(next(), 1);
		assert.strictEqual(next(), 2);
		assert.strictEqual(next(), 1);
		assert.strictEqual(next(), 2);
	});

	test('single-element array always returns same value', () => {
		const next = to_next([42]);
		assert.strictEqual(next(), 42);
		assert.strictEqual(next(), 42);
		assert.strictEqual(next(), 42);
	});
});
