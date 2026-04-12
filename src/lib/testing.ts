/**
 * Shared test assertions for the `@fuzdev` ecosystem.
 *
 * Extends the fuz-stack testing conventions (`assert` from vitest, tests in `src/test/`,
 * plain object mocks) with reusable helpers for patterns that appear across multiple repos.
 * Only depends on vitest — safe for fuz_util's zero-runtime-deps constraint.
 *
 * @module
 */

import {assert, vi} from 'vitest';

import type {Logger} from './log.js';
import type {Result} from './result.js';

/**
 * Asserts that `fn` rejects with an `Error`.
 * Optionally matches the error message against `pattern`.
 * Returns the caught `Error` for further assertions by the caller.
 *
 * `assert.fail` is placed after the catch block so that assertion failures
 * from the test itself are not swallowed by the catch.
 *
 * @param fn - async function expected to reject
 * @param pattern - optional regex to match against the error message
 * @returns the caught `Error`
 */
export const assert_rejects = async (
	fn: () => Promise<unknown>,
	pattern?: RegExp,
): Promise<Error> => {
	try {
		await fn();
	} catch (err) {
		assert(err instanceof Error, 'Expected rejection to be an Error');
		if (pattern) {
			assert.match(err.message, pattern);
		}
		return err;
	}
	assert.fail('Expected to throw');
};

/**
 * Asserts a `Result` is ok and narrows `result` to the success type in the calling scope.
 *
 * @param result - a `Result` to assert
 * @param msg - optional custom failure message
 */
export const assert_result_ok: <TValue, TError>(
	result: Result<TValue, TError>,
	msg?: string,
) => asserts result is {ok: true} & TValue = (result, msg) => {
	assert.ok(result.ok, msg ?? 'Expected result.ok to be true');
};

/**
 * Asserts a `Result` is an error and narrows `result` to the error type in the calling scope.
 *
 * @param result - a `Result` to assert
 * @param msg - optional custom failure message
 */
export const assert_result_error: <TValue, TError>(
	result: Result<TValue, TError>,
	msg?: string,
) => asserts result is {ok: false} & TError = (result, msg) => {
	assert.ok(!result.ok, msg ?? 'Expected result.ok to be false');
};

/**
 * A mock `Logger` with `vi.fn()` methods and call tracking arrays.
 * Assignable to `Logger` for use in code under test.
 * Each tracking array captures the first argument of each call.
 * For full call details, use `vi.fn()` introspection on the methods directly.
 */
export type MockLogger = Logger & {
	error_calls: Array<unknown>;
	warn_calls: Array<unknown>;
	info_calls: Array<unknown>;
	debug_calls: Array<unknown>;
};

/**
 * Creates a mock `Logger` with `vi.fn()` on each logging method
 * and tracking arrays for inspecting logged messages.
 * Follows the fuz-stack convention of plain object mocks over mocking libraries.
 *
 * @returns a `MockLogger` assignable to `Logger`
 */
export const create_mock_logger = (): MockLogger => {
	const error_calls: Array<unknown> = [];
	const warn_calls: Array<unknown> = [];
	const info_calls: Array<unknown> = [];
	const debug_calls: Array<unknown> = [];

	return {
		error: vi.fn((msg: unknown) => error_calls.push(msg)),
		warn: vi.fn((msg: unknown) => warn_calls.push(msg)),
		info: vi.fn((msg: unknown) => info_calls.push(msg)),
		debug: vi.fn((msg: unknown) => debug_calls.push(msg)),
		raw: vi.fn(),
		error_calls,
		warn_calls,
		info_calls,
		debug_calls,
	} as unknown as MockLogger;
};
