/**
 * Time utilities.
 * Provides cross-platform high-resolution timing and measurement helpers.
 */

/**
 * Timer interface for measuring elapsed time.
 * Returns time in nanoseconds for maximum precision.
 */
export interface Timer {
	/** Get current time in nanoseconds */
	now: () => number;
}

/**
 * Node.js high-resolution timer using process.hrtime.bigint().
 * Provides true nanosecond precision.
 */
export const timer_node: Timer = {
	now: (): number => {
		const ns = process.hrtime.bigint();
		return Number(ns); // Native nanoseconds
	},
};

/**
 * Browser high-resolution timer using performance.now().
 * Converts milliseconds to nanoseconds for consistent API.
 *
 * **Precision varies by browser due to Spectre/Meltdown mitigations:**
 * - Chrome: ~100μs (coarsened)
 * - Firefox: ~1ms (rounded)
 * - Safari: ~100μs
 * - Node.js: ~1μs
 *
 * For nanosecond-precision benchmarks, use Node.js with `timer_node`.
 */
export const timer_browser: Timer = {
	now: (): number => {
		return performance.now() * 1_000_000; // Convert ms to ns
	},
};

/**
 * Detect the best available timer function for the current environment.
 * Called once and cached for performance.
 */
const detect_timer_fn = (): (() => number) => {
	// Check if we're in Node.js with hrtime.bigint support
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (typeof process !== 'undefined' && process.hrtime) {
		try {
			if (typeof process.hrtime.bigint !== 'undefined') {
				return timer_node.now;
			}
		} catch {
			// Ignore and fall through
		}
	}
	// Fallback to performance.now() (works in browsers and modern Node.js)
	if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
		return timer_browser.now;
	}
	// Last resort: Date.now() (millisecond precision only)
	return () => Date.now() * 1_000_000;
};

// Cache the detected timer function
let _cached_timer_fn: (() => number) | null = null;
const get_timer_fn = (): (() => number) => {
	if (_cached_timer_fn === null) {
		_cached_timer_fn = detect_timer_fn();
	}
	return _cached_timer_fn;
};

/**
 * Auto-detected timer based on environment.
 * Uses process.hrtime in Node.js, performance.now() in browsers.
 * The timer function is detected once and cached for performance.
 */
export const timer_default: Timer = {
	now: (): number => get_timer_fn()(),
};

/**
 * Time units and conversions.
 */
export const TIME_NS_PER_US = 1_000;
export const TIME_NS_PER_MS = 1_000_000;
export const TIME_NS_PER_SEC = 1_000_000_000;

/**
 * Convert nanoseconds to microseconds.
 */
export const time_ns_to_us = (ns: number): number => ns / TIME_NS_PER_US;

/**
 * Convert nanoseconds to milliseconds.
 */
export const time_ns_to_ms = (ns: number): number => ns / TIME_NS_PER_MS;

/**
 * Convert nanoseconds to seconds.
 */
export const time_ns_to_sec = (ns: number): number => ns / TIME_NS_PER_SEC;

/**
 * Time unit for formatting.
 */
export type TimeUnit = 'ns' | 'us' | 'ms' | 's';

/**
 * Detect the best time unit for a set of nanosecond values.
 * Chooses the unit where most values fall in the range 1-9999.
 * @param values_ns - Array of times in nanoseconds
 * @returns Best unit to use for all values
 */
export const time_unit_detect_best = (values_ns: Array<number>): TimeUnit => {
	if (values_ns.length === 0) return 'ms';

	// Filter out invalid values
	const valid = values_ns.filter((v) => isFinite(v) && v > 0);
	if (valid.length === 0) return 'ms';

	// Find the median value (more stable than mean for outliers)
	const sorted = [...valid].sort((a, b) => a - b);
	const median = sorted[Math.floor(sorted.length / 2)]!;

	// Choose unit based on median magnitude
	if (median < 1_000) {
		return 'ns'; // < 1μs
	} else if (median < 1_000_000) {
		return 'us'; // < 1ms
	} else if (median < 1_000_000_000) {
		return 'ms'; // < 1s
	} else {
		return 's'; // >= 1s
	}
};

/**
 * Format time with a specific unit.
 * @param ns - Time in nanoseconds
 * @param unit - Unit to use ('ns', 'us', 'ms', 's')
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string like "3.87μs"
 */
export const time_format = (ns: number, unit: TimeUnit, decimals: number = 2): string => {
	if (!isFinite(ns)) return String(ns);

	switch (unit) {
		case 'ns':
			return `${ns.toFixed(decimals)}ns`;
		case 'us':
			return `${time_ns_to_us(ns).toFixed(decimals)}μs`;
		case 'ms':
			return `${time_ns_to_ms(ns).toFixed(decimals)}ms`;
		case 's':
			return `${time_ns_to_sec(ns).toFixed(decimals)}s`;
	}
};

/**
 * Format time with adaptive units (ns/μs/ms/s) based on magnitude.
 * @param ns - Time in nanoseconds
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string like "3.87μs" or "1.23ms"
 *
 * @example
 * ```ts
 * time_format_adaptive(1500) // "1.50μs"
 * time_format_adaptive(3870) // "3.87μs"
 * time_format_adaptive(1500000) // "1.50ms"
 * time_format_adaptive(1500000000) // "1.50s"
 * ```
 */
export const time_format_adaptive = (ns: number, decimals: number = 2): string => {
	if (!isFinite(ns)) return String(ns);

	// Choose unit based on magnitude
	if (ns < 1_000) {
		return time_format(ns, 'ns', decimals);
	} else if (ns < 1_000_000) {
		return time_format(ns, 'us', decimals);
	} else if (ns < 1_000_000_000) {
		return time_format(ns, 'ms', decimals);
	} else {
		return time_format(ns, 's', decimals);
	}
};

/**
 * Result from timing a function execution.
 * All times in nanoseconds for maximum precision.
 */
export interface TimeResult {
	/** Elapsed time in nanoseconds */
	elapsed_ns: number;
	/** Elapsed time in microseconds (convenience) */
	elapsed_us: number;
	/** Elapsed time in milliseconds (convenience) */
	elapsed_ms: number;
	/** Start time in nanoseconds (from timer.now()) */
	started_at_ns: number;
	/** End time in nanoseconds (from timer.now()) */
	ended_at_ns: number;
}

/**
 * Time an asynchronous function execution.
 * @param fn - Async function to time
 * @param timer - Timer to use (defaults to timer_default)
 * @returns Object containing the function result and timing information
 *
 * @example
 * ```ts
 * const {result, timing} = await time_async(async () => {
 *   await fetch('https://api.example.com/data');
 *   return 42;
 * });
 * console.log(`Result: ${result}, took ${time_format_adaptive(timing.elapsed_ns)}`);
 * ```
 */
export const time_async = async <T>(
	fn: () => Promise<T>,
	timer: Timer = timer_default,
): Promise<{result: T; timing: TimeResult}> => {
	const started_at_ns = timer.now();
	const result = await fn();
	const ended_at_ns = timer.now();
	const elapsed_ns = ended_at_ns - started_at_ns;

	return {
		result,
		timing: {
			elapsed_ns,
			elapsed_us: time_ns_to_us(elapsed_ns),
			elapsed_ms: time_ns_to_ms(elapsed_ns),
			started_at_ns,
			ended_at_ns,
		},
	};
};

/**
 * Time a synchronous function execution.
 * @param fn - Sync function to time
 * @param timer - Timer to use (defaults to timer_default)
 * @returns Object containing the function result and timing information
 *
 * @example
 * ```ts
 * const {result, timing} = time_sync(() => {
 *   return expensive_computation();
 * });
 * console.log(`Result: ${result}, took ${time_format_adaptive(timing.elapsed_ns)}`);
 * ```
 */
export const time_sync = <T>(
	fn: () => T,
	timer: Timer = timer_default,
): {result: T; timing: TimeResult} => {
	const started_at_ns = timer.now();
	const result = fn();
	const ended_at_ns = timer.now();
	const elapsed_ns = ended_at_ns - started_at_ns;

	return {
		result,
		timing: {
			elapsed_ns,
			elapsed_us: time_ns_to_us(elapsed_ns),
			elapsed_ms: time_ns_to_ms(elapsed_ns),
			started_at_ns,
			ended_at_ns,
		},
	};
};

/**
 * Measure multiple executions of a function and return all timings.
 * @param fn - Function to measure (sync or async)
 * @param iterations - Number of times to execute
 * @param timer - Timer to use (defaults to timer_default)
 * @returns Array of elapsed times in nanoseconds
 *
 * @example
 * ```ts
 * const timings_ns = await time_measure(async () => {
 *   await process_data();
 * }, 100);
 *
 * import {BenchmarkStats} from './benchmark_stats.js';
 * const stats = new BenchmarkStats(timings_ns);
 * console.log(`Mean: ${time_format_adaptive(stats.mean_ns)}`);
 * ```
 */
export const time_measure = async (
	fn: () => unknown,
	iterations: number,
	timer: Timer = timer_default,
): Promise<Array<number>> => {
	const timings: Array<number> = [];

	for (let i = 0; i < iterations; i++) {
		const started_at_ns = timer.now();
		await fn(); // eslint-disable-line no-await-in-loop
		const ended_at_ns = timer.now();
		timings.push(ended_at_ns - started_at_ns);
	}

	return timings;
};
