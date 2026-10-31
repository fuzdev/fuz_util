import { test, assert, describe, vi, afterEach } from 'vitest';

import { throttle } from '#lib/throttle.ts';
import { wait, create_deferred, type Deferred } from '#lib/async.ts';
import { assert_rejects } from '#lib/testing.ts';

test('throttles calls to a function', async () => {
	const results: Array<string> = [];
	const fn = throttle(async (name: string) => {
		results.push(name + '_run');
		await wait();
		results.push(name + '_done');
	});

	const promise_a = fn('a'); // called immediately
	const promise_b = fn('b'); // discarded
	const promise_c = fn('c'); // discarded
	const promise_d = fn('d'); // called at trailing edge

	assert.ok(promise_a !== promise_b);
	assert.strictEqual(promise_b, promise_c);
	assert.strictEqual(promise_b, promise_d);

	assert.deepEqual(results, ['a_run']); // called immediately

	await promise_a;

	assert.deepEqual(results, ['a_run', 'a_done']);

	await wait();

	assert.deepEqual(results, ['a_run', 'a_done', 'd_run']);

	await promise_b;

	assert.deepEqual(results, ['a_run', 'a_done', 'd_run', 'd_done']);
});

test('calls functions in sequence', async () => {
	const results: Array<string> = [];
	const fn = throttle(async (name: string) => {
		results.push(name + '_run');
		await wait();
		results.push(name + '_done');
	});

	const promise_a = fn('a'); // called immediately

	assert.deepEqual(results, ['a_run']); // called immediately

	await promise_a;

	assert.deepEqual(results, ['a_run', 'a_done']);

	const promise_b = fn('b'); // called immediately

	assert.deepEqual(results, ['a_run', 'a_done', 'b_run']); // called immediately

	assert.ok(promise_a !== promise_b);

	await promise_b;

	assert.deepEqual(results, ['a_run', 'a_done', 'b_run', 'b_done']);
});

test("throttles calls to a function with when='trailing'", async () => {
	const results: Array<string> = [];
	const fn = throttle(
		async (name: string) => {
			results.push(name + '_run');
			await wait();
			results.push(name + '_done');
		},
		{ when: 'trailing' }
	);

	const promise_a = fn('a'); // discarded
	const promise_b = fn('b'); // discarded
	const promise_c = fn('c'); // discarded
	const promise_d = fn('d'); // called at trailing edge

	assert.strictEqual(promise_a, promise_b);
	assert.strictEqual(promise_a, promise_c);
	assert.strictEqual(promise_a, promise_d);

	assert.deepEqual(results, []); // no immediate call

	await wait();

	assert.deepEqual(results, ['d_run']);

	await promise_a;

	assert.deepEqual(results, ['d_run', 'd_done']);

	const promise_e = fn('e'); // called at trailing edge

	assert.ok(promise_a !== promise_e);
	assert.deepEqual(results, ['d_run', 'd_done']);

	await wait();

	assert.deepEqual(results, ['d_run', 'd_done', 'e_run']);

	await promise_e;

	assert.deepEqual(results, ['d_run', 'd_done', 'e_run', 'e_done']);

	const promise_f = fn('f'); // discarded
	const promise_g = fn('g'); // called at trailing edge

	assert.ok(promise_e !== promise_f);
	assert.ok(promise_f === promise_g);
	assert.deepEqual(results, ['d_run', 'd_done', 'e_run', 'e_done']);

	await wait();

	assert.deepEqual(results, ['d_run', 'd_done', 'e_run', 'e_done', 'g_run']);

	await promise_g;

	assert.deepEqual(results, ['d_run', 'd_done', 'e_run', 'e_done', 'g_run', 'g_done']);
});

test('throttles with non-zero delay', async () => {
	const results: Array<string> = [];
	const fn = throttle(
		async (name: string) => {
			results.push(name + '_run');
			await wait();
			results.push(name + '_done');
		},
		{ delay: 10 }
	);

	const promise_a = fn('a'); // called immediately
	assert.deepEqual(results, ['a_run']);

	// While 'a' is pending, queue 'b' then 'c' — 'c' replaces 'b'
	const promise_b = fn('b');
	void fn('c');

	await promise_a;
	assert.deepEqual(results, ['a_run', 'a_done']);

	// Wait for the delay timer to fire and the flush to execute
	await wait(20);
	await promise_b;

	// 'c' should have been called (trailing), not 'b'
	assert.isTrue(results.includes('c_run'));
	assert.isFalse(results.includes('b_run'));
});

test("throttles calls to a function with when='leading'", async () => {
	const results: Array<string> = [];
	const fn = throttle(
		async (name: string) => {
			results.push(name + '_run');
			await wait();
			results.push(name + '_done');
		},
		{ when: 'leading' }
	);

	const promise_a = fn('a'); // called immediately
	const promise_b = fn('b'); // discarded
	const promise_c = fn('c'); // discarded
	const promise_d = fn('d'); // discarded

	assert.strictEqual(promise_a, promise_b);
	assert.strictEqual(promise_a, promise_c);
	assert.strictEqual(promise_a, promise_d);

	assert.deepEqual(results, ['a_run']); // called immediately

	await promise_a;

	assert.deepEqual(results, ['a_run', 'a_done']);

	const promise_e = fn('e'); // called immediately

	assert.ok(promise_a !== promise_e);

	assert.deepEqual(results, ['a_run', 'a_done', 'e_run']); // called immediately

	await promise_e;

	assert.deepEqual(results, ['a_run', 'a_done', 'e_run', 'e_done']);

	const promise_f = fn('f'); // called immediately
	const promise_g = fn('g'); // discarded

	assert.ok(promise_e !== promise_f);
	assert.ok(promise_f === promise_g);

	assert.deepEqual(results, ['a_run', 'a_done', 'e_run', 'e_done', 'f_run']); // called immediately

	await promise_g;

	assert.deepEqual(results, ['a_run', 'a_done', 'e_run', 'e_done', 'f_run', 'f_done']);
});

/**
 * Creates a callback whose calls each run until the test settles them by name,
 * logging `name_run` when a call starts and `name_done` or `name_failed` when it settles.
 */
const create_gated_callback = () => {
	const log: Array<string> = [];
	const gates: Map<string, Deferred<void>> = new Map();
	const cb = async (name: string): Promise<void> => {
		log.push(name + '_run');
		const gate = create_deferred<void>();
		gates.set(name, gate);
		try {
			await gate.promise;
		} catch (error) {
			log.push(name + '_failed');
			throw error;
		}
		log.push(name + '_done');
	};
	const gate = (name: string): Deferred<void> => {
		const found = gates.get(name);
		assert.ok(found, `expected a running call named '${name}'`);
		return found;
	};
	return { log, cb, gate };
};

describe('throttle with fake timers', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	test("a call made while the trailing call runs still runs with when='both'", async () => {
		vi.useFakeTimers();
		const { log, cb, gate } = create_gated_callback();
		const fn = throttle(cb, { delay: 10 });

		const promise_a = fn('a'); // leading
		const promise_b = fn('b'); // trailing
		assert.deepEqual(log, ['a_run']);

		gate('a').resolve();
		await promise_a;
		await vi.advanceTimersByTimeAsync(10);
		assert.deepEqual(log, ['a_run', 'a_done', 'b_run']);

		const promise_c = fn('c'); // made while the trailing call runs
		assert.ok(promise_c !== promise_b);

		// the next call waits for the running one, then `delay`
		await vi.advanceTimersByTimeAsync(100);
		assert.deepEqual(log, ['a_run', 'a_done', 'b_run']);

		gate('b').resolve();
		await promise_b;
		await vi.advanceTimersByTimeAsync(9);
		assert.deepEqual(log, ['a_run', 'a_done', 'b_run', 'b_done']);
		await vi.advanceTimersByTimeAsync(1);
		assert.deepEqual(log, ['a_run', 'a_done', 'b_run', 'b_done', 'c_run']);

		gate('c').resolve();
		await promise_c;
		assert.deepEqual(log, ['a_run', 'a_done', 'b_run', 'b_done', 'c_run', 'c_done']);
	});

	test("a call made while the trailing call runs still runs with when='trailing'", async () => {
		vi.useFakeTimers();
		const { log, cb, gate } = create_gated_callback();
		const fn = throttle(cb, { delay: 10, when: 'trailing' });

		const promise_a = fn('a');
		await vi.advanceTimersByTimeAsync(10);
		assert.deepEqual(log, ['a_run']);

		const promise_b = fn('b'); // discarded
		const promise_c = fn('c'); // made while the trailing call runs
		assert.ok(promise_b !== promise_a);
		assert.strictEqual(promise_b, promise_c);

		await vi.advanceTimersByTimeAsync(100);
		assert.deepEqual(log, ['a_run']); // never overlaps the running call

		gate('a').resolve();
		await promise_a;
		await vi.advanceTimersByTimeAsync(10);
		assert.deepEqual(log, ['a_run', 'a_done', 'c_run']);

		gate('c').resolve();
		await promise_c;
		assert.deepEqual(log, ['a_run', 'a_done', 'c_run', 'c_done']);
	});

	test("a call made during the delay after a call completes joins the trailing call with when='both'", async () => {
		vi.useFakeTimers();
		const { log, cb, gate } = create_gated_callback();
		const fn = throttle(cb, { delay: 10 });

		const promise_a = fn('a');
		const promise_b = fn('b');
		gate('a').resolve();
		await promise_a;

		const promise_c = fn('c'); // nothing runs, but the trailing call is still queued
		assert.strictEqual(promise_c, promise_b);
		assert.deepEqual(log, ['a_run', 'a_done']);

		await vi.advanceTimersByTimeAsync(10);
		assert.deepEqual(log, ['a_run', 'a_done', 'c_run']);
		gate('c').resolve();
		await promise_c;
	});

	describe.each(['both', 'trailing'] as const)(
		"a rejected trailing call with when='%s'",
		(when) => {
			test('rejects its promise and later calls still run', async () => {
				vi.useFakeTimers();
				const { log, cb, gate } = create_gated_callback();
				const fn = throttle(cb, { delay: 10, when });

				const promise_a = fn('a'); // leading with 'both', discarded with 'trailing'
				const promise_b = fn('b'); // trailing
				if (when === 'both') {
					gate('a').resolve();
					await promise_a;
				}
				await vi.advanceTimersByTimeAsync(10);
				assert.include(log, 'b_run');

				gate('b').reject(new Error('trailing failed'));
				await assert_rejects(() => promise_b, /trailing failed/);
				assert.include(log, 'b_failed');

				// the throttle is not stuck: a later call and one made while it runs both run
				const promise_c = fn('c');
				assert.ok(promise_c !== promise_b);
				await vi.advanceTimersByTimeAsync(10);
				assert.include(log, 'c_run');
				const promise_d = fn('d');
				gate('c').resolve();
				await promise_c;
				await vi.advanceTimersByTimeAsync(10);
				assert.include(log, 'd_run');
				gate('d').resolve();
				await promise_d;
				assert.include(log, 'd_done');
			});
		}
	);
});

test('a rejected leading call rejects only its own promise', async () => {
	const fn = throttle(async (name: string) => {
		await wait();
		throw new Error(name + ' failed');
	});
	// an unhandled rejection from the throttle's own bookkeeping fails the run
	await assert_rejects(() => fn('a'), /a failed/);
	await assert_rejects(() => fn('b'), /b failed/);
});
