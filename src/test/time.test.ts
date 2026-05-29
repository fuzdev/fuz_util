import {test, assert} from 'vitest';

import {is_promise, wait} from '$lib/async.js';
import {benchmark_warmup} from '$lib/benchmark.js';
import {
	timer_node,
	timer_browser,
	timer_default,
	time_async,
	time_sync,
	time_measure,
	time_format_adaptive,
	time_format,
	time_unit_detect_best,
	type Timer,
} from '$lib/time.js';

test('is_promise: detects promises', () => {
	// True for promises
	assert.strictEqual(is_promise(Promise.resolve()), true);
	// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
	assert.strictEqual(is_promise(Promise.reject().catch(() => {})), true);
	assert.strictEqual(is_promise(new Promise(() => {})), true);

	// True for thenables
	assert.strictEqual(is_promise({then: () => {}}), true);

	// False for non-promises
	assert.strictEqual(is_promise(null), false);
	assert.strictEqual(is_promise(undefined), false);
	assert.strictEqual(is_promise(42), false);
	assert.strictEqual(is_promise('string'), false);
	assert.strictEqual(is_promise({}), false);
	assert.strictEqual(is_promise([]), false);
	assert.strictEqual(
		is_promise(() => {}),
		false,
	);
});

test('timer_node: provides high-resolution time', () => {
	const t1 = timer_node.now();
	const t2 = timer_node.now();

	assert.isAbove(t1, 0);
	assert.isAtLeast(t2, t1);
	assert.strictEqual(typeof t1, 'number');
});

test('timer_browser: provides high-resolution time', () => {
	const t1 = timer_browser.now();
	const t2 = timer_browser.now();

	assert.isAbove(t1, 0);
	assert.isAtLeast(t2, t1);
	assert.strictEqual(typeof t1, 'number');
});

test('timer_default: auto-detects environment', () => {
	const t1 = timer_default.now();
	const t2 = timer_default.now();

	assert.isAbove(t1, 0);
	assert.isAtLeast(t2, t1);
	assert.strictEqual(typeof t1, 'number');
});

test('time_format_adaptive: formats nanoseconds', () => {
	assert.strictEqual(time_format_adaptive(500), '500.00ns');
	assert.strictEqual(time_format_adaptive(1500), '1.50μs');
	assert.strictEqual(time_format_adaptive(3870), '3.87μs');
	assert.strictEqual(time_format_adaptive(1_500_000), '1.50ms');
	assert.strictEqual(time_format_adaptive(1_500_000_000), '1.50s');
});

test('time_sync: times synchronous function', () => {
	const {result, timing} = time_sync(() => {
		let sum = 0;
		for (let i = 0; i < 1000; i++) {
			sum += i;
		}
		return sum;
	});

	assert.strictEqual(result, 499500);
	assert.isAtLeast(timing.elapsed_ns, 0);
	assert.isAtLeast(timing.elapsed_ms, 0);
	assert.isAbove(timing.ended_at_ns, timing.started_at_ns);
	assert.strictEqual(timing.elapsed_ns, timing.ended_at_ns - timing.started_at_ns);
});

test('time_sync: with custom timer', () => {
	let counter = 0;
	const custom_timer: Timer = {
		now: () => {
			counter += 10_000_000; // 10ms in ns
			return counter;
		},
	};

	const {timing} = time_sync(() => 42, custom_timer);

	assert.strictEqual(timing.started_at_ns, 10_000_000);
	assert.strictEqual(timing.ended_at_ns, 20_000_000);
	assert.strictEqual(timing.elapsed_ns, 10_000_000);
	assert.strictEqual(timing.elapsed_ms, 10);
});

test('time_async: times asynchronous function', async () => {
	const {result, timing} = await time_async(async () => {
		await wait(10);
		return 'done';
	});

	assert.strictEqual(result, 'done');
	assert.isAtLeast(timing.elapsed_ms, 9); // Allow some timing variance
	assert.isAbove(timing.ended_at_ns, timing.started_at_ns);
});

test('time_async: with custom timer', async () => {
	let counter = 0;
	const custom_timer: Timer = {
		now: () => {
			counter += 5_000_000; // 5ms in ns
			return counter;
		},
	};

	const {timing} = await time_async(() => Promise.resolve('test'), custom_timer);

	assert.strictEqual(timing.started_at_ns, 5_000_000);
	assert.strictEqual(timing.ended_at_ns, 10_000_000);
	assert.strictEqual(timing.elapsed_ns, 5_000_000);
	assert.strictEqual(timing.elapsed_ms, 5);
});

test('time_measure: measures multiple iterations', async () => {
	const timings = await time_measure(() => {
		let sum = 0;
		for (let i = 0; i < 100; i++) {
			sum += i;
		}
		return sum;
	}, 10);

	assert.strictEqual(timings.length, 10);
	timings.forEach((t) => {
		assert.isAtLeast(t, 0);
		assert.strictEqual(isFinite(t), true);
	});
});

test('time_measure: with async function', async () => {
	const timings = await time_measure(async () => {
		await wait(5);
	}, 3);

	assert.strictEqual(timings.length, 3);
	timings.forEach((t) => {
		assert.isAtLeast(t, 4_000_000); // 4ms in ns, allow timing variance
	});
});

test('benchmark_warmup: runs sync function multiple times', async () => {
	let count = 0;

	await benchmark_warmup(() => {
		count++;
	}, 5);

	assert.strictEqual(count, 5);
});

test('benchmark_warmup: runs async function multiple times', async () => {
	let count = 0;

	await benchmark_warmup(async () => {
		await wait(1);
		count++;
	}, 3);

	assert.strictEqual(count, 3);
});

test('benchmark_warmup: zero iterations still runs one detection call without a hint', async () => {
	let count = 0;

	await benchmark_warmup(() => {
		count++;
	}, 0);

	// One detection call runs even with iterations=0, otherwise async fns
	// would be silently misclassified as sync.
	assert.strictEqual(count, 1);
});

test('benchmark_warmup: zero iterations with explicit hint skips the call', async () => {
	let count = 0;

	await benchmark_warmup(
		() => {
			count++;
		},
		0,
		false,
	);

	// When the caller provides a hint, no detection call is needed.
	assert.strictEqual(count, 0);
});

test('time_unit_detect_best: selects nanoseconds for sub-microsecond values', () => {
	assert.strictEqual(time_unit_detect_best([100, 200, 300]), 'ns');
	assert.strictEqual(time_unit_detect_best([999]), 'ns');
});

test('time_unit_detect_best: selects microseconds for microsecond-range values', () => {
	assert.strictEqual(time_unit_detect_best([1_000, 2_000, 3_000]), 'us');
	assert.strictEqual(time_unit_detect_best([500_000, 800_000]), 'us');
});

test('time_unit_detect_best: selects milliseconds for millisecond-range values', () => {
	assert.strictEqual(time_unit_detect_best([1_000_000, 2_000_000]), 'ms');
	assert.strictEqual(time_unit_detect_best([500_000_000]), 'ms');
});

test('time_unit_detect_best: selects seconds for second-range values', () => {
	assert.strictEqual(time_unit_detect_best([1_000_000_000, 2_000_000_000]), 's');
	assert.strictEqual(time_unit_detect_best([5_000_000_000]), 's');
});

test('time_unit_detect_best: handles empty array', () => {
	// Empty array defaults to 'ms' as a sensible default
	assert.strictEqual(time_unit_detect_best([]), 'ms');
});

test('time_format: formats with specific unit', () => {
	// Nanoseconds
	assert.strictEqual(time_format(500, 'ns'), '500.00ns');
	assert.strictEqual(time_format(1234, 'ns', 0), '1234ns');

	// Microseconds
	assert.strictEqual(time_format(1_500, 'us'), '1.50μs');
	assert.strictEqual(time_format(3_870, 'us', 1), '3.9μs');

	// Milliseconds
	assert.strictEqual(time_format(1_500_000, 'ms'), '1.50ms');
	assert.strictEqual(time_format(12_345_678, 'ms', 3), '12.346ms');

	// Seconds
	assert.strictEqual(time_format(1_500_000_000, 's'), '1.50s');
	assert.strictEqual(time_format(3_210_000_000, 's', 1), '3.2s');
});
