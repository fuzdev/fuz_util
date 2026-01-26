import type {styleText} from 'node:util';

import type {Timings} from './timings.js';
import type {Logger} from './log.js';

export let st: typeof styleText = (_, v) => v;

/**
 * Configures the module-level styling function for colored output.
 * @mutates st - assigns the module-level `st` variable
 */
export const configure_print_colors = (
	s: typeof styleText | null | undefined,
): typeof styleText => {
	st = s ?? ((_, v) => v);
	return st;
};

/**
 * Formats a key-value pair for printing.
 */
export const print_key_value = (key: string, value: string | number): string =>
	st('gray', `${key}(`) + value + st('gray', ')');

/**
 * Formats a `number` of milliseconds for printing.
 */
export const print_ms = (ms: number, decimals?: number, separator?: string): string => {
	const decimal_count = decimals ?? (ms >= 10 ? 0 : ms < 0.1 ? 2 : 1);
	const rounded = ms.toFixed(decimal_count);
	return st('white', print_number_with_separators(rounded, separator)) + st('gray', 'ms');
};

/**
 * Formats a `number` with separators for improved readability.
 */
export const print_number_with_separators = (v: string, separator = ','): string => {
	if (!separator) return v;
	const decimal_index = v.indexOf('.');
	const start_index = (decimal_index === -1 ? v.length : decimal_index) - 1;
	let s = decimal_index === -1 ? '' : v.slice(start_index + 1);
	let count = 0;
	for (let i = start_index; i >= 0; i--) {
		count++;
		if (count > 3 && count % 3 === 1) s = separator + s;
		s = v[i] + s;
	}
	return s;
};

/**
 * Formats a `string` for printing.
 */
export const print_string = (value: string): string => st('green', `'${value}'`);

/**
 * Formats a `number` for printing.
 */
export const print_number = (value: number): string => st('cyan', value + '');

/**
 * Formats a `boolean` for printing.
 */
export const print_boolean = (value: boolean): string => st('yellow', value + '');

/**
 * Formats any value for printing.
 */
export const print_value = (value: unknown): string => {
	if (Array.isArray(value)) {
		return st('blue', '[') + value.map(print_value).join(st('blue', ', ')) + st('blue', ']');
	}
	switch (typeof value) {
		case 'string':
			return print_string(value);
		case 'number':
			return print_number(value);
		case 'boolean':
			return print_boolean(value);
		case 'object':
			return value === null ? st('blue', 'null') : st('magenta', JSON.stringify(value));
		default:
			return st('blue', value + '');
	}
};

/**
 * Formats an error for printing.
 * Because throwing errors and rejecting promises isn't typesafe,
 * don't assume the arg is an `Error` and try to return something useful.
 */
export const print_error = (err: Error): string =>
	st(
		'yellow',
		err.stack ?? ((err.message && `Error: ${err.message}`) || `Unknown error: ${err as any}`),
	);

/**
 * Formats a timing entry with `key` for printing.
 */
export const print_timing = (key: string | number, timing: number | undefined): string =>
	`${timing === undefined ? '...' : print_ms(timing, undefined)} ${st('gray', '←')} ${st('gray', key + '')}`;

/**
 * Prints all timings in a `Timings` object.
 */
export const print_timings = (timings: Timings, log: Logger): void => {
	for (const [key, timing] of timings.entries()) {
		log.debug(print_timing(key, timing));
	}
};
