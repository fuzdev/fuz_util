import {test} from 'vitest';

import {is_promise} from '$lib/async.js';
import {
	timer_node,
	timer_browser,
	timer_default,
	time_async,
	time_sync,
	time_measure,
	warmup,
	sleep,
	format_time_adaptive,
	type Timer,
} from '$lib/benchmark_timing.js';

/* eslint-disable @typescript-eslint/no-empty-function */

test('is_promise: detects promises', ({expect}) => {
	// True for promises
	expect(is_promise(Promise.resolve())).toBe(true);
	// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
	expect(is_promise(Promise.reject().catch(() => {}))).toBe(true);
	expect(is_promise(new Promise(() => {}))).toBe(true);

	// True for thenables
	expect(is_promise({then: () => {}})).toBe(true);

	// False for non-promises
	expect(is_promise(null)).toBe(false);
	expect(is_promise(undefined)).toBe(false);
	expect(is_promise(42)).toBe(false);
	expect(is_promise('string')).toBe(false);
	expect(is_promise({})).toBe(false);
	expect(is_promise([])).toBe(false);
	expect(is_promise(() => {})).toBe(false);
});

test('timer_node: provides high-resolution time', ({expect}) => {
	const t1 = timer_node.now();
	const t2 = timer_node.now();

	expect(t1).toBeGreaterThan(0);
	expect(t2).toBeGreaterThanOrEqual(t1);
	expect(typeof t1).toBe('number');
});

test('timer_browser: provides high-resolution time', ({expect}) => {
	const t1 = timer_browser.now();
	const t2 = timer_browser.now();

	expect(t1).toBeGreaterThan(0);
	expect(t2).toBeGreaterThanOrEqual(t1);
	expect(typeof t1).toBe('number');
});

test('timer_default: auto-detects environment', ({expect}) => {
	const t1 = timer_default.now();
	const t2 = timer_default.now();

	expect(t1).toBeGreaterThan(0);
	expect(t2).toBeGreaterThanOrEqual(t1);
	expect(typeof t1).toBe('number');
});

test('format_time_adaptive: formats nanoseconds', ({expect}) => {
	expect(format_time_adaptive(500)).toBe('500.00ns');
	expect(format_time_adaptive(1500)).toBe('1.50μs');
	expect(format_time_adaptive(3870)).toBe('3.87μs');
	expect(format_time_adaptive(1_500_000)).toBe('1.50ms');
	expect(format_time_adaptive(1_500_000_000)).toBe('1.50s');
});

test('time_sync: times synchronous function', ({expect}) => {
	const {result, timing} = time_sync(() => {
		let sum = 0;
		for (let i = 0; i < 1000; i++) {
			sum += i;
		}
		return sum;
	});

	expect(result).toBe(499500);
	expect(timing.elapsed_ns).toBeGreaterThanOrEqual(0);
	expect(timing.elapsed_ms).toBeGreaterThanOrEqual(0);
	expect(timing.ended_at_ns).toBeGreaterThan(timing.started_at_ns);
	expect(timing.elapsed_ns).toBe(timing.ended_at_ns - timing.started_at_ns);
});

test('time_sync: with custom timer', ({expect}) => {
	let counter = 0;
	const custom_timer: Timer = {
		now: () => {
			counter += 10_000_000; // 10ms in ns
			return counter;
		},
	};

	const {timing} = time_sync(() => 42, custom_timer);

	expect(timing.started_at_ns).toBe(10_000_000);
	expect(timing.ended_at_ns).toBe(20_000_000);
	expect(timing.elapsed_ns).toBe(10_000_000);
	expect(timing.elapsed_ms).toBe(10);
});

test('time_async: times asynchronous function', async ({expect}) => {
	const {result, timing} = await time_async(async () => {
		await sleep(10);
		return 'done';
	});

	expect(result).toBe('done');
	expect(timing.elapsed_ms).toBeGreaterThanOrEqual(9); // Allow some timing variance
	expect(timing.ended_at_ns).toBeGreaterThan(timing.started_at_ns);
});

test('time_async: with custom timer', async ({expect}) => {
	let counter = 0;
	const custom_timer: Timer = {
		now: () => {
			counter += 5_000_000; // 5ms in ns
			return counter;
		},
	};

	const {timing} = await time_async(() => Promise.resolve('test'), custom_timer);

	expect(timing.started_at_ns).toBe(5_000_000);
	expect(timing.ended_at_ns).toBe(10_000_000);
	expect(timing.elapsed_ns).toBe(5_000_000);
	expect(timing.elapsed_ms).toBe(5);
});

test('time_measure: measures multiple iterations', async ({expect}) => {
	const timings = await time_measure(() => {
		let sum = 0;
		for (let i = 0; i < 100; i++) {
			sum += i;
		}
		return sum;
	}, 10);

	expect(timings).toHaveLength(10);
	timings.forEach((t) => {
		expect(t).toBeGreaterThanOrEqual(0);
		expect(isFinite(t)).toBe(true);
	});
});

test('time_measure: with async function', async ({expect}) => {
	const timings = await time_measure(async () => {
		await sleep(5);
	}, 3);

	expect(timings).toHaveLength(3);
	timings.forEach((t) => {
		expect(t).toBeGreaterThanOrEqual(4_000_000); // 4ms in ns, allow timing variance
	});
});

test('warmup: runs sync function multiple times', async ({expect}) => {
	let count = 0;

	const is_async = await warmup(() => {
		count++;
	}, 5);

	expect(count).toBe(5);
	expect(is_async).toBe(false);
});

test('warmup: runs async function multiple times', async ({expect}) => {
	let count = 0;

	const is_async = await warmup(async () => {
		await sleep(1);
		count++;
	}, 3);

	expect(count).toBe(3);
	expect(is_async).toBe(true);
});

test('warmup: detects async with zero iterations', async ({expect}) => {
	// Even with 0 iterations, it should detect async
	const is_async_true = await warmup(() => Promise.resolve(), 0);
	expect(is_async_true).toBe(true);

	const is_async_false = await warmup(() => 42, 0);
	expect(is_async_false).toBe(false);
});

test('sleep: waits for specified duration', async ({expect}) => {
	const start = timer_default.now();
	await sleep(20);
	const elapsed_ns = timer_default.now() - start;
	const elapsed_ms = elapsed_ns / 1_000_000;

	expect(elapsed_ms).toBeGreaterThanOrEqual(18); // Allow some variance
	expect(elapsed_ms).toBeLessThan(50); // Should not take too long
});
