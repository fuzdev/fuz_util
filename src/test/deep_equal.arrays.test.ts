import {describe, test, assert} from 'vitest';

import {deep_equal} from '$lib/deep_equal.ts';
import {test_equal_values, test_unequal_values} from './deep_equal_test_helpers.ts';

describe('arrays', () => {
	// note: arrays are NOT equal to objects (different type check via instanceof)
	test('vs objects: not equal even with matching keys', () => {
		assert.ok(!deep_equal([1, 2], {0: 1, 1: 2, length: 2}));
		assert.ok(!deep_equal(['a', 'b'], {0: 'a', 1: 'b', length: 2}));
		// even empty arrays are not equal to empty objects (instanceof check)
		assert.ok(!deep_equal([], {}));
	});

	describe('equal values', () => {
		test_equal_values([
			// basic arrays
			['empty arrays', [], []],
			['with numbers', [1, 2, 3], [1, 2, 3]],
			['with one element', [1], [1]],
			['with two elements', [1, 2], [1, 2]],
			['with strings', ['apple', 'banana'], ['apple', 'banana']],
			['with mixed types', [1, 'two', true, null], [1, 'two', true, null]],

			// nested arrays
			['nested arrays', [1, [2, 3]], [1, [2, 3]]],
			['deeply nested', [1, [[[[1, 'd'], 'c'], 'b'], 'a']], [1, [[[[1, 'd'], 'c'], 'b'], 'a']]],
			['with nested objects', [{a: 1}, {b: 2}], [{a: 1}, {b: 2}]],
			['mixed nesting', [1, {a: [2, 3]}, [4, {b: 5}]], [1, {a: [2, 3]}, [4, {b: 5}]]],

			// typed arrays
			['Uint8Array', new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])],
			['Int8Array', new Int8Array([-1, 0, 1]), new Int8Array([-1, 0, 1])],
			['Uint16Array', new Uint16Array([256, 512]), new Uint16Array([256, 512])],
			['Int16Array', new Int16Array([-256, 256]), new Int16Array([-256, 256])],
			['Uint32Array', new Uint32Array([1000, 2000]), new Uint32Array([1000, 2000])],
			['Int32Array', new Int32Array([-1000, 1000]), new Int32Array([-1000, 1000])],
			['Float32Array', new Float32Array([1.5, 2.5]), new Float32Array([1.5, 2.5])],
			['Float64Array', new Float64Array([1.5, 2.5]), new Float64Array([1.5, 2.5])],
			[
				'Uint8ClampedArray',
				new Uint8ClampedArray([0, 128, 255]),
				new Uint8ClampedArray([0, 128, 255]),
			],
			['BigInt64Array', new BigInt64Array([1n, -1n, 0n]), new BigInt64Array([1n, -1n, 0n])],
			[
				'BigUint64Array',
				new BigUint64Array([0n, 100n, 1000n]),
				new BigUint64Array([0n, 100n, 1000n]),
			],

			// special values in arrays
			['with NaN', [NaN, 1, 2], [NaN, 1, 2]],
			['with undefined', [1, undefined, 3], [1, undefined, 3]],
			['with null', [1, null, 3], [1, null, 3]],
		]);
	});

	describe('unequal values', () => {
		test_unequal_values([
			// basic differences
			['different elements', [1, 2], [1, 3]],
			['different lengths', [1, 2, 3], [1, 2]],
			['empty vs with undefined', [], [undefined]],
			['differently sorted elements', [1, 'apple'], ['apple', 1]],
			['different types', [1, 2, 3], [1, '2', 3]],
			['array and null', [], null],
			['array and undefined', [], undefined],

			// nested differences
			['nested with differences', [1, [2, 3]], [1, [2, 4]]],
			['nested with different depths', [1, [2]], [1, [2, [3]]]],
			['deeply nested', [1, [[[[1, 'd'], 'c'], 'b'], 'a']], [1, [[[[1, 'D'], 'c'], 'b'], 'a']]],

			// typed array differences
			['typed: differently sorted elements', new Uint8Array([1, 2, 3]), new Uint8Array([1, 3, 2])],
			['typed: different lengths', new Uint8Array([1, 2, 3]), new Uint8Array([1, 2])],
			['typed: different values', new Float64Array([1.5, 2.5]), new Float64Array([1.5, 2.6])],
			['BigInt64Array: different values', new BigInt64Array([1n, 2n]), new BigInt64Array([1n, 3n])],
			// Different typed array types (different constructors)
			['typed: different types', new Uint8Array([1, 2, 3]), new Int8Array([1, 2, 3])],
			[
				'Uint8Array vs Uint8ClampedArray',
				new Uint8Array([1, 2, 3]),
				new Uint8ClampedArray([1, 2, 3]),
			],
			['Float32Array vs Float64Array', new Float32Array([1.5, 2.5]), new Float64Array([1.5, 2.5])],
			// TypedArray vs regular array (different constructors)
			['typed vs regular array', new Uint8Array([1, 2, 3]), [1, 2, 3]],

			// special value differences
			['NaN position differences', [1, NaN, 3], [1, 3, NaN]],
			['null vs undefined', [1, null, 3], [1, undefined, 3]],
		]);
	});
});
