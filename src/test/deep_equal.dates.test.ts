import { describe } from 'vitest';

import { test_equal_values, test_unequal_values } from './deep_equal_test_helpers.ts';

// Date objects are compared by their timestamp values using .getTime()

const date1 = new Date('2024-01-15T10:30:00Z');
const date2 = new Date('2024-01-15T10:30:00Z');

describe('dates', () => {
	describe('equal values', () => {
		test_equal_values([
			['same date reference', date1, date1],
			['same timestamp', date1, date2],
			['from same string', new Date('2024-01-15'), new Date('2024-01-15')],
			['from same timestamp number', new Date(1705315800000), new Date(1705315800000)],
			['invalid date instances', new Date('invalid'), new Date('invalid')], // both NaN
			['epoch date instances', new Date(0), new Date(0)]
		]);
	});

	describe('unequal values', () => {
		test_unequal_values([
			// type mismatches
			['date and null', new Date(), null],
			['date and undefined', new Date(), undefined],
			['date and string', new Date('2024-01-15'), '2024-01-15'],
			['date and timestamp number', new Date(1705315800000), 1705315800000],
			['date and non-empty array', new Date(), [1]],

			// dates with different timestamps should NOT be equal
			['different timestamps', new Date('2024-01-15'), new Date('2024-01-16')],

			// dates should NOT equal empty objects/arrays (different constructors)
			['date and empty object', new Date(), {}],
			['date and empty array', new Date(), []]
		]);
	});
});
