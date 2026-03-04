import {describe} from 'vitest';

import {test_equal_values, test_unequal_values} from './deep_equal_test_helpers.ts';

// shared test values
const symbol = Symbol('test');
const fn = () => {};

describe('primitives', () => {
	describe('equal values', () => {
		test_equal_values([
			// numbers
			['numbers', 1, 1],
			['zero', 0, 0],
			['negative numbers', -42, -42],
			['floats', 3.14159, 3.14159],
			['NaN', NaN, NaN],
			['positive infinity', Infinity, Infinity],
			['negative infinity', -Infinity, -Infinity],

			// strings
			['strings', 'hello', 'hello'],
			['empty strings', '', ''],
			['multiline strings', 'line one\nline two', 'line one\nline two'],
			['unicode strings', 'café', 'café'],

			// booleans
			['true', true, true],
			['false', false, false],

			// null and undefined
			['null', null, null],
			['undefined', undefined, undefined],
			['undefined and void 0', undefined, void 0],

			// symbols
			['same symbol reference', symbol, symbol],

			// functions
			['same function reference', fn, fn],

			// bigint
			['bigint', 1n, 1n],
			['negative bigint', -100n, -100n],
			['large bigint', 9007199254740991n, 9007199254740991n],
		]);
	});

	describe('unequal values', () => {
		test_unequal_values([
			// numbers
			['numbers with different signs', 1, -1],
			['different numbers', 1, 2],
			['number and NaN', 0, NaN],
			['positive and negative infinity', Infinity, -Infinity],
			['positive and negative zero', 0, -0],
			['integer and float', 1, 1.1],

			// strings
			['different strings', 'hello', 'world'],
			['string case sensitivity', 'Hello', 'hello'],
			['empty string and space', '', ' '],

			// booleans
			['booleans', true, false],

			// null and undefined
			['null and undefined', null, undefined],

			// symbols
			['different symbols', Symbol('a'), Symbol('a')],
			['symbol and string', Symbol('test'), 'test'],

			// functions
			['different functions', () => {}, () => {}],

			// bigint
			['different bigints', 1n, 2n],
			['bigint and number', 1n, 1],

			// type mismatches
			['number and string', 1, '1'],
			['boolean and number', true, 1],
			['null and object', null, {}],
			['undefined and null', undefined, null],
			['string and object', 'test', {0: 't', 1: 'e', 2: 's', 3: 't'}],
		]);
	});
});
