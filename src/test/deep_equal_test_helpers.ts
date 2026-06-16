import {test, assert} from 'vitest';

import {deep_equal} from '$lib/deep_equal.ts';

/**
 * Helper to test equal values with bidirectional assertions.
 */
export const assert_equal = (message: string, a: unknown, b: unknown): void => {
	test(`equal: ${message}`, () => {
		assert.ok(deep_equal(a, b), `Expected ${String(a)} to equal ${String(b)}`);
	});
	test(`equal: ${message} ↶`, () => {
		assert.ok(deep_equal(b, a), `Expected ${String(b)} to equal ${String(a)}`);
	});
};

/**
 * Helper to test unequal values with bidirectional assertions.
 */
export const assert_not_equal = (message: string, a: unknown, b: unknown): void => {
	test(`not equal: ${message}`, () => {
		assert.ok(!deep_equal(a, b), `Expected ${String(a)} to not equal ${String(b)}`);
	});
	test(`not equal: ${message} ↶`, () => {
		assert.ok(!deep_equal(b, a), `Expected ${String(b)} to not equal ${String(a)}`);
	});
};

/**
 * Batch test equal values.
 */
export const test_equal_values = (values: ReadonlyArray<[string, any, any]>): void => {
	for (const [message, a, b] of values) {
		assert_equal(message, a, b);
	}
};

/**
 * Batch test unequal values.
 */
export const test_unequal_values = (values: ReadonlyArray<[string, any, any]>): void => {
	for (const [message, a, b] of values) {
		assert_not_equal(message, a, b);
	}
};
