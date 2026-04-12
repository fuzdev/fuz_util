import {test, assert, describe, vi} from 'vitest';

import {
	assert_rejects,
	assert_result_ok,
	assert_result_error,
	create_mock_logger,
	type MockLogger,
} from '$lib/testing.ts';
import type {Result} from '$lib/result.ts';

describe('assert_rejects', () => {
	test('catches and returns the error', async () => {
		const err = await assert_rejects(async () => {
			throw new Error('test error');
		});
		assert.instanceOf(err, Error);
		assert.strictEqual(err.message, 'test error');
	});

	test('matches message against pattern', async () => {
		const err = await assert_rejects(async () => {
			throw new Error('something went wrong');
		}, /went wrong/);
		assert.strictEqual(err.message, 'something went wrong');
	});

	test('fails when pattern does not match', async () => {
		try {
			await assert_rejects(async () => {
				throw new Error('actual message');
			}, /expected pattern/);
			assert.fail('Expected assert_rejects to fail');
		} catch (err) {
			assert(err instanceof Error);
			// the error is from assert.match failing
			assert.ok(err.message.length > 0);
		}
	});

	test('fails when fn does not throw', async () => {
		try {
			await assert_rejects(async () => 'no throw');
			assert.fail('Expected assert_rejects to fail');
		} catch (err) {
			assert(err instanceof Error);
			assert.ok(err.message.includes('Expected to throw'));
		}
	});

	test('fails when thrown value is not an Error', async () => {
		try {
			await assert_rejects(async () => {
				throw 'string error'; // eslint-disable-line @typescript-eslint/only-throw-error
			});
			assert.fail('Expected assert_rejects to fail');
		} catch (err) {
			assert(err instanceof Error);
			assert.ok(err.message.includes('Error'));
		}
	});

	test('works without pattern argument', async () => {
		const err = await assert_rejects(async () => {
			throw new Error('any message');
		});
		assert.strictEqual(err.message, 'any message');
	});

	test('handles synchronous throws in async function', async () => {
		const err = await assert_rejects(() => {
			throw new Error('sync throw');
		});
		assert.strictEqual(err.message, 'sync throw');
	});
});

describe('assert_result_ok', () => {
	test('narrows result to ok type', () => {
		const result: Result<{value: number}, {message: string}> = {ok: true, value: 42};
		assert_result_ok(result);
		// result is now narrowed — access properties directly
		assert.strictEqual(result.ok, true);
		assert.strictEqual(result.value, 42);
	});

	test('fails on error result', () => {
		const result: Result<{value: number}, {message: string}> = {ok: false, message: 'bad'};
		assert.throws(() => assert_result_ok(result));
	});

	test('fails on error result with default message', () => {
		const result: Result<{value: number}, {message: string}> = {ok: false, message: 'bad'};
		try {
			assert_result_ok(result);
			assert.fail('Expected to throw');
		} catch (err) {
			assert(err instanceof Error);
			assert.ok(err.message.includes('Expected result.ok to be true'));
		}
	});

	test('uses custom message on failure', () => {
		const result: Result<{value: number}, {message: string}> = {ok: false, message: 'bad'};
		try {
			assert_result_ok(result, 'custom failure');
			assert.fail('Expected to throw');
		} catch (err) {
			assert(err instanceof Error);
			assert.ok(err.message.includes('custom failure'));
		}
	});

	test('works with minimal Result shape', () => {
		const result: Result = {ok: true};
		assert_result_ok(result);
		assert.strictEqual(result.ok, true);
	});
});

describe('assert_result_error', () => {
	test('narrows result to error type', () => {
		const result: Result<{value: number}, {message: string}> = {ok: false, message: 'bad'};
		assert_result_error(result);
		// result is now narrowed — access properties directly
		assert.strictEqual(result.ok, false);
		assert.strictEqual(result.message, 'bad');
	});

	test('fails on ok result', () => {
		const result: Result<{value: number}, {message: string}> = {ok: true, value: 42};
		assert.throws(() => assert_result_error(result));
	});

	test('fails on ok result with default message', () => {
		const result: Result<{value: number}, {message: string}> = {ok: true, value: 42};
		try {
			assert_result_error(result);
			assert.fail('Expected to throw');
		} catch (err) {
			assert(err instanceof Error);
			assert.ok(err.message.includes('Expected result.ok to be false'));
		}
	});

	test('uses custom message on failure', () => {
		const result: Result<{value: number}, {message: string}> = {ok: true, value: 42};
		try {
			assert_result_error(result, 'custom failure');
			assert.fail('Expected to throw');
		} catch (err) {
			assert(err instanceof Error);
			assert.ok(err.message.includes('custom failure'));
		}
	});

	test('works with minimal Result shape', () => {
		const result: Result = {ok: false};
		assert_result_error(result);
		assert.strictEqual(result.ok, false);
	});
});

describe('create_mock_logger', () => {
	test('returns a mock with all logging methods', () => {
		const log = create_mock_logger();
		assert.typeOf(log.error, 'function');
		assert.typeOf(log.warn, 'function');
		assert.typeOf(log.info, 'function');
		assert.typeOf(log.debug, 'function');
		assert.typeOf(log.raw, 'function');
	});

	test('tracks error calls', () => {
		const log = create_mock_logger();
		log.error('err1');
		log.error('err2');
		assert.deepEqual(log.error_calls, ['err1', 'err2']);
	});

	test('tracks warn calls', () => {
		const log = create_mock_logger();
		log.warn('w1');
		assert.deepEqual(log.warn_calls, ['w1']);
	});

	test('tracks info calls', () => {
		const log = create_mock_logger();
		log.info('i1');
		log.info('i2');
		log.info('i3');
		assert.deepEqual(log.info_calls, ['i1', 'i2', 'i3']);
	});

	test('tracks debug calls', () => {
		const log = create_mock_logger();
		log.debug('d1');
		assert.deepEqual(log.debug_calls, ['d1']);
	});

	test('starts with empty tracking arrays', () => {
		const log = create_mock_logger();
		assert.deepEqual(log.error_calls, []);
		assert.deepEqual(log.warn_calls, []);
		assert.deepEqual(log.info_calls, []);
		assert.deepEqual(log.debug_calls, []);
	});

	test('methods are vi.fn() mocks', () => {
		const log = create_mock_logger();
		log.info('hello');
		log.info('world');
		assert.ok(vi.isMockFunction(log.info));
		assert.strictEqual((log.info as ReturnType<typeof vi.fn>).mock.calls.length, 2);
	});

	test('tracks non-string first args', () => {
		const log = create_mock_logger();
		log.info(42);
		log.info({key: 'value'});
		log.info(null);
		assert.deepEqual(log.info_calls, [42, {key: 'value'}, null]);
	});

	test('each instance has independent tracking', () => {
		const log_a = create_mock_logger();
		const log_b = create_mock_logger();
		log_a.info('a');
		log_b.info('b');
		assert.deepEqual(log_a.info_calls, ['a']);
		assert.deepEqual(log_b.info_calls, ['b']);
	});

	test('is assignable to Logger', () => {
		const log: MockLogger = create_mock_logger();
		// type-level check — if this compiles, the assignment works
		const _use_as_logger: import('$lib/log.ts').Logger = log;
		assert.ok(_use_as_logger);
	});
});
