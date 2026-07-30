import { describe } from 'vitest';

import { test_equal_values, test_unequal_values } from './deep_equal_test_helpers.ts';

describe('collections', () => {
	describe('sets', () => {
		describe('equal values', () => {
			test_equal_values([
				// basic sets
				['empty sets', new Set(), new Set()],
				['with numbers', new Set([1, 2, 3]), new Set([1, 2, 3])],
				[
					'with strings',
					new Set(['apple', 'banana', 'cherry']),
					new Set(['apple', 'banana', 'cherry'])
				],
				[
					'with mixed types',
					new Set(['a', 'b', null, Array, 1, 2, 3]),
					new Set(['a', 'b', null, Array, 1, 2, 3])
				],
				[
					'with shuffled order',
					new Set(['a', 'b', null, Array, 1, 2, 3]),
					new Set(['b', 'a', null, 3, 2, 1, Array])
				]
			]);
		});

		describe('unequal values', () => {
			test_unequal_values([
				// basic differences
				['different values', new Set(['a', 'b', null, 1]), new Set(['a', 'b', null, '1'])],
				['different sizes', new Set([1, 2, 3]), new Set([1, 2])],
				['empty vs non-empty', new Set(), new Set([1])],
				['set vs array', new Set(['a', 'b', 'c', 'd']), ['a', 'b', 'c', 'd']],
				['set and object', new Set([1, 2]), { 0: 1, 1: 2 }],
				['set and null', new Set(), null],

				// note: sets compare by reference for object values
				['deeply equal objects but different refs', new Set([{ a: 1 }]), new Set([{ a: 1 }])]
			]);
		});
	});

	describe('maps', () => {
		describe('equal values', () => {
			test_equal_values([
				// basic maps
				['empty maps', new Map(), new Map()],
				[
					'with string keys',
					new Map<string, any>([
						['name', 'alice'],
						['role', 'admin']
					]),
					new Map<string, any>([
						['name', 'alice'],
						['role', 'admin']
					])
				],
				[
					'with number keys',
					new Map([
						[1, 'one'],
						[2, 'two']
					]),
					new Map([
						[1, 'one'],
						[2, 'two']
					])
				],
				[
					'with nested values',
					new Map<string, any>([
						['a', 1],
						['b', 2],
						['c', [1, [2, 3]]]
					]),
					new Map<string, any>([
						['a', 1],
						['b', 2],
						['c', [1, [2, 3]]]
					])
				],
				[
					'with object values',
					new Map([
						['user1', { name: 'alice' }],
						['user2', { name: 'bob' }]
					]),
					new Map([
						['user1', { name: 'alice' }],
						['user2', { name: 'bob' }]
					])
				]
			]);
		});

		describe('unequal values', () => {
			test_unequal_values([
				// basic differences
				[
					'different values',
					new Map([
						['a', 1],
						['b', 2],
						['c', 3]
					]),
					new Map([
						['a', 1],
						['b', 2],
						['c', 4]
					])
				],
				[
					'different keys',
					new Map([
						['a', 1],
						['b', 2],
						['c', 3]
					]),
					new Map([
						['a', 1],
						['b', 2],
						['d', 3]
					])
				],
				[
					'fewer pairs',
					new Map([
						['a', 1],
						['b', 2],
						['c', 3]
					]),
					new Map([
						['a', 1],
						['b', 2]
					])
				],
				[
					'map vs object',
					new Map([
						['a', 1],
						['b', 2],
						['c', 3]
					]),
					{ a: 1, b: 2, c: 3 }
				],
				['empty vs non-empty', new Map(), new Map([['a', 1]])],
				['map and null', new Map(), null],

				// note: maps compare keys by reference
				[
					'deeply equal object keys but different refs',
					new Map([[{ a: 1 }, 'value']]),
					new Map([[{ a: 1 }, 'value']])
				]
			]);
		});
	});

	describe('regexps', () => {
		describe('equal values', () => {
			test_equal_values([
				['simple regexps', /a/, /a/],
				['with flags', /test/gi, /test/gi],
				['with special chars', /[a-z]+/, /[a-z]+/],
				['with quantifiers', /a{2,4}/, /a{2,4}/]
			]);
		});

		describe('unequal values', () => {
			test_unequal_values([
				['different sources', /a/, /b/],
				['different flags', /a/, /a/g],
				['case sensitivity flags', /test/i, /test/],
				['regexp and string', /test/, 'test']
			]);
		});
	});
});
