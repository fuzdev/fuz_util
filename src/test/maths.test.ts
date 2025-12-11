import {describe, test, assert} from 'vitest';

import {clamp, lerp, round, format_number} from '$lib/maths.ts';

describe('clamp', () => {
	test('clamps a no-op', () => {
		assert.strictEqual(clamp(0, -1, 1), 0);
	});

	test('clamps to min', () => {
		assert.strictEqual(clamp(-2, -1, 1), -1);
	});

	test('clamps to max', () => {
		assert.strictEqual(clamp(2, -1, 1), 1);
	});
});

describe('lerp', () => {
	test('lerps two numbers', () => {
		assert.strictEqual(lerp(0, 10, 0.2), 2);
	});

	test('finds the midpoint between two numbers', () => {
		assert.strictEqual(lerp(1, 3, 0.5), 2);
	});

	test('lerps with 0', () => {
		assert.strictEqual(lerp(1, 3, 0), 1);
	});

	test('lerps with 1', () => {
		assert.strictEqual(lerp(1, 3, 1), 3);
	});
});

describe('round', () => {
	test('rounds a number up to 3 decimals', () => {
		assert.strictEqual(round(0.0349, 3), 0.035);
	});

	test('rounds a negative number down to 5 decimals', () => {
		assert.strictEqual(round(-1.6180339, 5), -1.61803);
	});
});

describe('format_number', () => {
	test('formats number with thousands separators', () => {
		assert.strictEqual(format_number(1234567.89), '1,234,567.89');
		assert.strictEqual(format_number(1000), '1,000.00');
		assert.strictEqual(format_number(999), '999.00');
	});

	test('formats with custom decimal places', () => {
		assert.strictEqual(format_number(1234.5678, 0), '1,235');
		assert.strictEqual(format_number(1234.5678, 1), '1,234.6');
		assert.strictEqual(format_number(1234.5678, 3), '1,234.568');
	});

	test('handles small numbers', () => {
		assert.strictEqual(format_number(0.123), '0.12');
		assert.strictEqual(format_number(42), '42.00');
	});

	test('handles infinity and NaN', () => {
		assert.strictEqual(format_number(Infinity), 'Infinity');
		assert.strictEqual(format_number(-Infinity), '-Infinity');
		assert.strictEqual(format_number(NaN), 'NaN');
	});

	test('handles negative numbers', () => {
		assert.strictEqual(format_number(-1234567.89), '-1,234,567.89');
		assert.strictEqual(format_number(-1000), '-1,000.00');
	});
});
