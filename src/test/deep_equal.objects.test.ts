import { describe } from 'vitest';

import { test_equal_values, test_unequal_values } from './deep_equal_test_helpers.ts';

describe('objects', () => {
	describe('equal values', () => {
		test_equal_values([
			// basic objects
			['empty objects', {}, {}],
			['simple objects', { a: 1, b: 2 }, { a: 1, b: 2 }],
			['with shuffled keys', { a: 1, b: 2, c: 3 }, { c: 3, a: 1, b: 2 }],
			['with string values', { name: 'alice', role: 'admin' }, { name: 'alice', role: 'admin' }],
			['with mixed types', { num: 1, str: 'hi', bool: true }, { num: 1, str: 'hi', bool: true }],

			// nested objects
			['nested objects', { a: { b: 1 } }, { a: { b: 1 } }],
			['deeply nested', { a: { b: { c: { d: 1 } } } }, { a: { b: { c: { d: 1 } } } }],
			[
				'complex nested',
				{ a: 1, b: { c: { d: { e: 1, f: { g: { h1: 1, h2: 2 }, i: 1 } } }, j: 1 } },
				{ a: 1, b: { c: { d: { e: 1, f: { g: { h2: 2, h1: 1 }, i: 1 } } }, j: 1 } }
			],

			// objects with null/undefined values
			['with null', { a: null }, { a: null }],
			['with undefined', { a: undefined }, { a: undefined }],
			['with mixed null/undefined', { a: null, b: undefined }, { a: null, b: undefined }],

			// objects with special values
			['with NaN', { value: NaN }, { value: NaN }],
			['with infinity', { value: Infinity }, { value: Infinity }],
			['with arrays', { items: [1, 2, 3] }, { items: [1, 2, 3] }]
		]);
	});

	describe('unequal values', () => {
		test_unequal_values([
			// basic differences
			['empty vs non-empty', {}, { a: 1 }],
			['different values', { a: 1, b: 2 }, { a: 1, b: 3 }],
			['different key counts', { a: 1 }, { a: 1, b: 2 }],
			['differently named keys', { a: 1, b: 2 }, { a: 1, c: 2 }],
			['object and null', {}, null],
			['object and undefined', {}, undefined],
			['object with props and array', { a: 1 }, []],

			// nested differences
			['nested with different values', { a: { b: 1 } }, { a: { b: 2 } }],
			['nested with different depth', { a: { b: 1 } }, { a: { b: { c: 1 } } }],
			[
				'complex with one difference',
				{ a: 1, b: { c: { d: { e: 1, f: { g: { h1: 1, h2: 2 }, i: 1 } } }, j: 1 } },
				{ a: 1, b: { c: { d: { e: 1, f: { g: { h2: 3, h1: 1 }, i: 1 } } }, j: 1 } }
			],

			// null/undefined differences
			['null vs undefined', { a: null }, { a: undefined }],
			['present key vs missing key', { a: 1, b: 2 }, { a: 1 }],
			['undefined value vs missing key', { a: undefined }, {}],

			// type mismatches within objects
			['number vs string value', { value: 1 }, { value: '1' }],
			['array vs object value', { items: [1, 2] }, { items: { 0: 1, 1: 2 } }]
		]);
	});
});
