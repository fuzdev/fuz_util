import {describe, test, assert} from 'vitest';

import {random_boolean, random_float, random_int, random_item, shuffle} from '../lib/random.ts';

describe('random_float', () => {
	test('-5.5 to 7', () => {
		for (let i = 0; i < 20; i++) {
			const result = random_float(-5.5, 7);
			assert.ok(result >= -5.5);
			assert.ok(result < 7);
		}
	});
});

describe('random_int', () => {
	test('0 to 1', () => {
		const items = [0, 1];
		const results = [];
		for (let i = 0; i < 20; i++) {
			const result = random_int(0, 1);
			assert.ok(items.includes(result));
			results.push(result);
		}
		for (const item of items) {
			assert.ok(results.includes(item));
		}
	});

	test('1 to 5', () => {
		const items = [1, 2, 3, 4, 5];
		const results = [];
		for (let i = 0; i < 100; i++) {
			const result = random_int(1, 5);
			assert.ok(items.includes(result));
			results.push(result);
		}
		for (const item of items) {
			assert.ok(results.includes(item));
		}
	});

	test('-3 to 2', () => {
		const items = [-3, -2, -1, 0, 1, 2];
		const results = [];
		for (let i = 0; i < 100; i++) {
			const result = random_int(-3, 2);
			assert.ok(items.includes(result));
			results.push(result);
		}
		for (const item of items) {
			assert.ok(results.includes(item));
		}
	});

	test('2 to 2', () => {
		assert.strictEqual(random_int(2, 2), 2);
	});
});

describe('random_boolean', () => {
	test('returns booleans and produces both values', () => {
		const results = new Set<boolean>();
		for (let i = 0; i < 100; i++) {
			const result = random_boolean();
			assert.strictEqual(typeof result, 'boolean');
			results.add(result);
		}
		assert.isTrue(results.has(true), 'should produce true');
		assert.isTrue(results.has(false), 'should produce false');
	});
});

describe('random_item', () => {
	test('a and b', () => {
		const items = ['a', 'b'];
		const results = [];
		for (let i = 0; i < 20; i++) {
			const result = random_item(items);
			assert.ok(items.includes(result));
			results.push(result);
		}
		for (const item of items) {
			assert.ok(results.includes(item));
		}
	});
	test('1 to 5', () => {
		const items = [1, 2, 3, 4, 5];
		const results = [];
		for (let i = 0; i < 100; i++) {
			const result = random_item(items);
			assert.ok(items.includes(result));
			results.push(result);
		}
		for (const item of items) {
			assert.ok(results.includes(item));
		}
	});
	test('empty array', () => {
		assert.strictEqual(random_item([]), undefined);
	});
});

describe('shuffle', () => {
	test('shuffles an array in place', () => {
		const original_items = ['a', 'b', 'c'];
		const items = original_items.slice();
		const shuffled = shuffle(items);
		assert.strictEqual(items, shuffled); // mutated not cloned
		assert.strictEqual(shuffled.length, 3);
		for (const item of original_items) {
			assert.ok(shuffled.includes(item));
		}
	});

	test('empty array', () => {
		const arr: Array<number> = [];
		const shuffled = shuffle(arr);
		assert.strictEqual(shuffled, arr);
		assert.deepEqual(shuffled, []);
	});

	test('single-element array', () => {
		const arr = [42];
		const shuffled = shuffle(arr);
		assert.strictEqual(shuffled, arr);
		assert.deepEqual(shuffled, [42]);
	});

	test('deterministic with seeded random', () => {
		const seeded_random = (min: number, _max: number): number => min; // always pick min
		const arr = [1, 2, 3, 4, 5];
		const shuffled = shuffle(arr.slice(), seeded_random);
		assert.strictEqual(shuffled.length, 5);
		// all original elements preserved
		for (const item of [1, 2, 3, 4, 5]) {
			assert.ok(shuffled.includes(item));
		}
	});
});
