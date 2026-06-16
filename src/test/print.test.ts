import {describe, test, assert, beforeAll, afterAll} from 'vitest';

import {
	print_ms,
	st,
	configure_print_colors,
	print_key_value,
	print_number_with_separators,
	print_string,
	print_number,
	print_boolean,
	print_value,
	print_error,
	print_timing,
} from '../lib/print.ts';

let original_st: typeof st;

beforeAll(() => {
	original_st = st;
	configure_print_colors(null);
});

afterAll(() => {
	configure_print_colors(original_st);
});

describe('print_ms', () => {
	test('formats milliseconds with appropriate decimals', () => {
		assert.strictEqual(print_ms(1), '1.0ms');
		assert.strictEqual(print_ms(1.1), '1.1ms');
		assert.strictEqual(print_ms(1.11), '1.1ms');
		assert.strictEqual(print_ms(1.19), '1.2ms');
		assert.strictEqual(print_ms(20), '20ms');
		assert.strictEqual(print_ms(20.1), '20ms');
		assert.strictEqual(print_ms(20.9), '21ms');
		assert.strictEqual(print_ms(300), '300ms');
		assert.strictEqual(print_ms(300.1), '300ms');
		assert.strictEqual(print_ms(300.9), '301ms');
		assert.strictEqual(print_ms(4000), '4,000ms');
		assert.strictEqual(print_ms(4000.1), '4,000ms');
		assert.strictEqual(print_ms(4000.9), '4,001ms');
		assert.strictEqual(print_ms(50000), '50,000ms');
		assert.strictEqual(print_ms(50000.1), '50,000ms');
		assert.strictEqual(print_ms(50000.9), '50,001ms');
		assert.strictEqual(print_ms(600000), '600,000ms');
		assert.strictEqual(print_ms(600000.1), '600,000ms');
		assert.strictEqual(print_ms(600000.9), '600,001ms');
		assert.strictEqual(print_ms(7000000), '7,000,000ms');
		assert.strictEqual(print_ms(7000000.1), '7,000,000ms');
		assert.strictEqual(print_ms(7000000.9), '7,000,001ms');
	});

	test('sub-0.1ms uses 2 decimals', () => {
		assert.strictEqual(print_ms(0.05), '0.05ms');
		assert.strictEqual(print_ms(0.09), '0.09ms');
	});
});

describe('print_key_value', () => {
	test('formats key-value pair', () => {
		assert.strictEqual(print_key_value('count', 5), 'count(5)');
		assert.strictEqual(print_key_value('time', '3ms'), 'time(3ms)');
	});
});

describe('print_number_with_separators', () => {
	test('adds separators to large numbers', () => {
		assert.strictEqual(print_number_with_separators('1000'), '1,000');
		assert.strictEqual(print_number_with_separators('1000000'), '1,000,000');
		assert.strictEqual(print_number_with_separators('123456789'), '123,456,789');
	});

	test('does not add separators to small numbers', () => {
		assert.strictEqual(print_number_with_separators('0'), '0');
		assert.strictEqual(print_number_with_separators('999'), '999');
	});

	test('preserves decimal portion', () => {
		assert.strictEqual(print_number_with_separators('1000.50'), '1,000.50');
		assert.strictEqual(print_number_with_separators('123.456'), '123.456');
	});

	test('no separator when empty string passed', () => {
		assert.strictEqual(print_number_with_separators('1000', ''), '1000');
	});

	test('custom separator', () => {
		assert.strictEqual(print_number_with_separators('1000000', '_'), '1_000_000');
	});
});

describe('print_string', () => {
	test('wraps in single quotes', () => {
		assert.strictEqual(print_string('hello'), "'hello'");
		assert.strictEqual(print_string(''), "''");
	});
});

describe('print_number', () => {
	test('formats number as string', () => {
		assert.strictEqual(print_number(42), '42');
		assert.strictEqual(print_number(3.14), '3.14');
		assert.strictEqual(print_number(-1), '-1');
		assert.strictEqual(print_number(0), '0');
	});
});

describe('print_boolean', () => {
	test('formats boolean as string', () => {
		assert.strictEqual(print_boolean(true), 'true');
		assert.strictEqual(print_boolean(false), 'false');
	});
});

describe('print_value', () => {
	test('formats strings', () => {
		assert.strictEqual(print_value('hello'), "'hello'");
	});

	test('formats numbers', () => {
		assert.strictEqual(print_value(42), '42');
	});

	test('formats booleans', () => {
		assert.strictEqual(print_value(true), 'true');
	});

	test('formats null', () => {
		assert.strictEqual(print_value(null), 'null');
	});

	test('formats arrays', () => {
		assert.strictEqual(print_value([1, 'a']), "[1, 'a']");
	});

	test('formats objects via JSON.stringify', () => {
		assert.strictEqual(print_value({a: 1}), '{"a":1}');
	});

	test('formats undefined', () => {
		assert.strictEqual(print_value(undefined), 'undefined');
	});

	test('empty array', () => {
		assert.strictEqual(print_value([]), '[]');
	});
});

describe('print_error', () => {
	test('uses stack when available', () => {
		const err = new Error('test error');
		const result = print_error(err);
		assert.include(result, 'test error');
	});

	test('falls back to message when no stack', () => {
		const err = new Error('test message');
		err.stack = undefined;
		assert.strictEqual(print_error(err), 'Error: test message');
	});

	test('handles error with no message or stack', () => {
		const err = {message: '', stack: undefined} as Error;
		const result = print_error(err);
		assert.include(result, 'Unknown error');
	});
});

describe('print_timing', () => {
	test('formats timing with key', () => {
		const result = print_timing('build', 1234);
		assert.include(result, '1,234ms');
		assert.include(result, 'build');
	});

	test('shows ellipsis for undefined timing', () => {
		const result = print_timing('pending', undefined);
		assert.include(result, '...');
		assert.include(result, 'pending');
	});

	test('numeric key', () => {
		const result = print_timing(0, 5);
		assert.include(result, '0');
	});
});

describe('configure_print_colors', () => {
	test('returns the configured function', () => {
		const result = configure_print_colors(null);
		assert.isFunction(result);
		// null resets to identity
		assert.strictEqual(result('red', 'hello'), 'hello');
	});
});
