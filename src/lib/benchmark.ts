/**
 * Zero-dependency benchmarking library for measuring function performance.
 *
 * @example
 * ```ts
 * import {Benchmark} from '@fuzdev/fuz_util/benchmark.js';
 *
 * const bench = new Benchmark({
 *   duration_ms: 5000,
 *   warmup_iterations: 5,
 * });
 *
 * bench
 *   .add('slugify', () => slugify(title))
 *   .add('slugify_slower', () => slugify_slower(title));
 *
 * const results = await bench.run();
 * console.log(bench.table());
 * ```
 */

import {is_promise, wait} from './async.js';
import {BenchmarkStats, benchmark_stats_compare} from './benchmark_stats.js';

// Re-export for convenience
export {benchmark_stats_compare};
import {timer_default, time_unit_detect_best, time_format} from './time.js';
import {
	benchmark_format_table,
	benchmark_format_table_grouped,
	benchmark_format_markdown,
	benchmark_format_json,
	benchmark_format_number,
	type BenchmarkFormatJsonOptions,
} from './benchmark_format.js';
import type {
	BenchmarkConfig,
	BenchmarkTask,
	BenchmarkResult,
	BenchmarkFormatTableOptions,
} from './benchmark_types.js';

// Default configuration values
const DEFAULT_DURATION_MS = 1000;
const DEFAULT_WARMUP_ITERATIONS = 10;
const DEFAULT_COOLDOWN_MS = 100;
const DEFAULT_MIN_ITERATIONS = 10;
const DEFAULT_MAX_ITERATIONS = 100_000;

/**
 * Validate and normalize benchmark configuration.
 * Throws if configuration is invalid.
 */
const validate_config = (config: BenchmarkConfig): void => {
	if (config.duration_ms !== undefined && config.duration_ms <= 0) {
		throw new Error(`duration_ms must be positive, got ${config.duration_ms}`);
	}
	if (config.warmup_iterations !== undefined && config.warmup_iterations < 0) {
		throw new Error(`warmup_iterations must be non-negative, got ${config.warmup_iterations}`);
	}
	if (config.cooldown_ms !== undefined && config.cooldown_ms < 0) {
		throw new Error(`cooldown_ms must be non-negative, got ${config.cooldown_ms}`);
	}
	if (config.min_iterations !== undefined && config.min_iterations < 1) {
		throw new Error(`min_iterations must be at least 1, got ${config.min_iterations}`);
	}
	if (config.max_iterations !== undefined && config.max_iterations < 1) {
		throw new Error(`max_iterations must be at least 1, got ${config.max_iterations}`);
	}
	if (
		config.min_iterations !== undefined &&
		config.max_iterations !== undefined &&
		config.min_iterations > config.max_iterations
	) {
		throw new Error(
			`min_iterations (${config.min_iterations}) cannot exceed max_iterations (${config.max_iterations})`,
		);
	}
};

/**
 * Internal task representation with detected async status.
 */
interface BenchmarkTaskInternal extends BenchmarkTask {
	/** Whether the function returns a promise (detected during warmup or from hint) */
	is_async?: boolean;
}

/**
 * Warmup function by running it multiple times.
 * Detects whether the function is async based on return value.
 *
 * @param fn - Function to warmup (sync or async)
 * @param iterations - Number of warmup iterations
 * @param async_hint - If provided, use this instead of detecting
 * @returns Whether the function is async
 *
 * @example
 * ```ts
 * const is_async = await benchmark_warmup(() => expensive_operation(), 10);
 * ```
 */
export const benchmark_warmup = async (
	fn: () => unknown,
	iterations: number,
	async_hint?: boolean,
): Promise<boolean> => {
	// If we have an explicit hint, use it
	if (async_hint !== undefined) {
		// Still run warmup iterations for JIT
		for (let i = 0; i < iterations; i++) {
			const result = fn();
			if (async_hint && is_promise(result)) {
				await result; // eslint-disable-line no-await-in-loop
			}
		}
		return async_hint;
	}

	// Detect on first iteration
	let detected_async = false;
	for (let i = 0; i < iterations; i++) {
		const result = fn();
		if (i === 0) {
			detected_async = is_promise(result);
		}
		if (detected_async && is_promise(result)) {
			await result; // eslint-disable-line no-await-in-loop
		}
	}
	return detected_async;
};

/**
 * Benchmark class for measuring and comparing function performance.
 */
export class Benchmark {
	readonly #config: Required<Omit<BenchmarkConfig, 'on_iteration' | 'on_task_complete'>> &
		Pick<BenchmarkConfig, 'on_iteration' | 'on_task_complete'>;
	readonly #tasks: Array<BenchmarkTaskInternal> = [];
	#results: Array<BenchmarkResult> = [];

	constructor(config: BenchmarkConfig = {}) {
		validate_config(config);
		this.#config = {
			duration_ms: config.duration_ms ?? DEFAULT_DURATION_MS,
			warmup_iterations: config.warmup_iterations ?? DEFAULT_WARMUP_ITERATIONS,
			cooldown_ms: config.cooldown_ms ?? DEFAULT_COOLDOWN_MS,
			min_iterations: config.min_iterations ?? DEFAULT_MIN_ITERATIONS,
			max_iterations: config.max_iterations ?? DEFAULT_MAX_ITERATIONS,
			timer: config.timer ?? timer_default,
			on_iteration: config.on_iteration,
			on_task_complete: config.on_task_complete,
		};
	}

	/**
	 * Add a benchmark task.
	 * @param name - Task name or full task object
	 * @param fn - Function to benchmark (if name is string). Return values are ignored.
	 * @returns This Benchmark instance for chaining
	 *
	 * @example
	 * ```ts
	 * bench.add('simple', () => fn());
	 *
	 * // Or with setup/teardown:
	 * bench.add({
	 *   name: 'with setup',
	 *   fn: () => process(data),
	 *   setup: () => { data = load() },
	 *   teardown: () => { cleanup() },
	 * });
	 * ```
	 */
	add(name: string, fn: () => unknown): this;
	add(task: BenchmarkTask): this;
	add(name_or_task: string | BenchmarkTask, fn?: () => unknown): this {
		const task_name = typeof name_or_task === 'string' ? name_or_task : name_or_task.name;

		// Validate unique task names
		if (this.#tasks.some((t) => t.name === task_name)) {
			throw new Error(`Task "${task_name}" already exists`);
		}

		if (typeof name_or_task === 'string') {
			if (!fn) throw new Error('Function required when name is string');
			this.#tasks.push({name: name_or_task, fn});
		} else {
			this.#tasks.push(name_or_task);
		}
		return this;
	}

	/**
	 * Remove a benchmark task by name.
	 * @param name - Name of the task to remove
	 * @returns This Benchmark instance for chaining
	 * @throws Error if task with given name doesn't exist
	 *
	 * @example
	 * ```ts
	 * bench.add('task1', () => fn1());
	 * bench.add('task2', () => fn2());
	 * bench.remove('task1');
	 * // Only task2 remains
	 * ```
	 */
	remove(name: string): this {
		const index = this.#tasks.findIndex((t) => t.name === name);
		if (index === -1) {
			throw new Error(`Task "${name}" not found`);
		}
		this.#tasks.splice(index, 1);
		return this;
	}

	/**
	 * Mark a task to be skipped during benchmark runs.
	 * @param name - Name of the task to skip
	 * @returns This Benchmark instance for chaining
	 * @throws Error if task with given name doesn't exist
	 *
	 * @example
	 * ```ts
	 * bench.add('task1', () => fn1());
	 * bench.add('task2', () => fn2());
	 * bench.skip('task1');
	 * // Only task2 will run
	 * ```
	 */
	skip(name: string): this {
		const task = this.#tasks.find((t) => t.name === name);
		if (!task) {
			throw new Error(`Task "${name}" not found`);
		}
		task.skip = true;
		return this;
	}

	/**
	 * Mark a task to run exclusively (along with other `only` tasks).
	 * @param name - Name of the task to run exclusively
	 * @returns This Benchmark instance for chaining
	 * @throws Error if task with given name doesn't exist
	 *
	 * @example
	 * ```ts
	 * bench.add('task1', () => fn1());
	 * bench.add('task2', () => fn2());
	 * bench.add('task3', () => fn3());
	 * bench.only('task2');
	 * // Only task2 will run
	 * ```
	 */
	only(name: string): this {
		const task = this.#tasks.find((t) => t.name === name);
		if (!task) {
			throw new Error(`Task "${name}" not found`);
		}
		task.only = true;
		return this;
	}

	/**
	 * Run all benchmark tasks.
	 * @returns Array of benchmark results
	 */
	async run(): Promise<Array<BenchmarkResult>> {
		this.#results = [];

		// Determine which tasks to run
		const has_only = this.#tasks.some((t) => t.only);
		const tasks_to_run = this.#tasks.filter((t) => {
			if (t.skip) return false;
			if (has_only) return t.only;
			return true;
		});

		for (let i = 0; i < tasks_to_run.length; i++) {
			const task = tasks_to_run[i]!;
			const result = await this.#run_task(task); // eslint-disable-line no-await-in-loop
			this.#results.push(result);

			// Call on_task_complete callback
			this.#config.on_task_complete?.(result, i, tasks_to_run.length);

			// Cooldown between tasks (skip after last task)
			if (this.#config.cooldown_ms > 0 && i < tasks_to_run.length - 1) {
				await wait(this.#config.cooldown_ms); // eslint-disable-line no-await-in-loop
			}
		}

		return this.#results;
	}

	/**
	 * Run a single benchmark task.
	 * Throws if the task fails during setup, warmup, or measurement.
	 */
	async #run_task(task: BenchmarkTaskInternal): Promise<BenchmarkResult> {
		const suite_start_ns = this.#config.timer.now();

		// Pre-allocate array to avoid GC pressure during measurement
		const max_iterations = this.#config.max_iterations;
		const timings_ns: Array<number> = new Array(max_iterations);
		let timing_count = 0;

		try {
			// Setup
			if (task.setup) {
				await task.setup();
			}

			// Warmup and detect async
			const is_async = await benchmark_warmup(task.fn, this.#config.warmup_iterations, task.async);
			task.is_async = is_async;

			// Measurement phase
			const target_time_ns = this.#config.duration_ms * 1_000_000; // Convert ms to ns
			const min_iterations = this.#config.min_iterations;

			let aborted = false as boolean;
			const abort = (): void => {
				aborted = true;
			};
			const measurement_start_ns = this.#config.timer.now();

			// Use separate code paths for sync vs async for better performance
			if (is_async) {
				// Async code path - await each iteration
				// eslint-disable-next-line no-unmodified-loop-condition
				while (timing_count < max_iterations && !aborted) {
					const iter_start_ns = this.#config.timer.now();
					await task.fn(); // eslint-disable-line no-await-in-loop
					const iter_end_ns = this.#config.timer.now();
					timings_ns[timing_count++] = iter_end_ns - iter_start_ns;
					this.#config.on_iteration?.(task.name, timing_count, abort);

					const total_elapsed_ns = iter_end_ns - measurement_start_ns;
					if (timing_count >= min_iterations && total_elapsed_ns >= target_time_ns) {
						break;
					}
				}
			} else {
				// Sync code path - no promise checking overhead
				// eslint-disable-next-line no-unmodified-loop-condition
				while (timing_count < max_iterations && !aborted) {
					const iter_start_ns = this.#config.timer.now();
					task.fn();
					const iter_end_ns = this.#config.timer.now();
					timings_ns[timing_count++] = iter_end_ns - iter_start_ns;
					this.#config.on_iteration?.(task.name, timing_count, abort);

					const total_elapsed_ns = iter_end_ns - measurement_start_ns;
					if (timing_count >= min_iterations && total_elapsed_ns >= target_time_ns) {
						break;
					}
				}
			}
		} finally {
			// Always run teardown
			if (task.teardown) {
				await task.teardown();
			}
		}

		// Trim array to actual size
		timings_ns.length = timing_count;

		const suite_end_ns = this.#config.timer.now();
		const total_time_ms = (suite_end_ns - suite_start_ns) / 1_000_000; // Convert back to ms for display

		// Analyze results
		const stats = new BenchmarkStats(timings_ns);

		return {
			name: task.name,
			stats,
			iterations: timing_count,
			total_time_ms,
			timings_ns,
		};
	}

	/**
	 * Format results as an ASCII table with percentiles, min/max, and relative performance.
	 * @param options - Formatting options
	 * @returns Formatted table string
	 *
	 * @example
	 * ```ts
	 * // Standard table
	 * console.log(bench.table());
	 *
	 * // Grouped by category
	 * console.log(bench.table({
	 *   groups: [
	 *     { name: 'FAST PATHS', filter: (r) => r.name.includes('fast') },
	 *     { name: 'SLOW PATHS', filter: (r) => r.name.includes('slow') },
	 *   ]
	 * }));
	 * ```
	 */
	table(options?: BenchmarkFormatTableOptions): string {
		return options?.groups
			? benchmark_format_table_grouped(this.#results, options.groups)
			: benchmark_format_table(this.#results);
	}

	/**
	 * Format results as a Markdown table.
	 * @returns Formatted markdown string
	 */
	markdown(): string {
		return benchmark_format_markdown(this.#results);
	}

	/**
	 * Format results as JSON.
	 * @param options - Formatting options (pretty, include_timings)
	 * @returns JSON string
	 */
	json(options?: BenchmarkFormatJsonOptions): string {
		return benchmark_format_json(this.#results, options);
	}

	/**
	 * Get the benchmark results.
	 * Returns a shallow copy to prevent external mutation.
	 * @returns Array of benchmark results
	 */
	results(): Array<BenchmarkResult> {
		return [...this.#results];
	}

	/**
	 * Reset the benchmark results.
	 * Keeps tasks intact so benchmarks can be rerun.
	 * @returns This Benchmark instance for chaining
	 */
	reset(): this {
		this.#results = [];
		return this;
	}

	/**
	 * Clear everything (results and tasks).
	 * Use this to start fresh with a new set of benchmarks.
	 * @returns This Benchmark instance for chaining
	 */
	clear(): this {
		this.#results = [];
		this.#tasks.length = 0;
		return this;
	}

	/**
	 * Get a quick text summary of the fastest task.
	 * @returns Human-readable summary string
	 *
	 * @example
	 * ```ts
	 * console.log(bench.summary());
	 * // "Fastest: slugify_v2 (1,285,515.00 ops/sec, 786.52ns per op)"
	 * // "Slowest: slugify (252,955.00 ops/sec, 3.95μs per op)"
	 * // "Speed difference: 5.08x"
	 * ```
	 */
	summary(): string {
		if (this.#results.length === 0) return 'No results';

		const fastest = this.#results.reduce((a, b) =>
			a.stats.ops_per_second > b.stats.ops_per_second ? a : b,
		);

		const slowest = this.#results.reduce((a, b) =>
			a.stats.ops_per_second < b.stats.ops_per_second ? a : b,
		);

		const ratio = fastest.stats.ops_per_second / slowest.stats.ops_per_second;

		// Detect best unit for consistent display
		const mean_times = this.#results.map((r) => r.stats.mean_ns);
		const unit = time_unit_detect_best(mean_times);

		const lines: Array<string> = [];
		lines.push(
			`Fastest: ${fastest.name} (${benchmark_format_number(fastest.stats.ops_per_second)} ops/sec, ${time_format(fastest.stats.mean_ns, unit)} per op)`,
		);

		if (this.#results.length > 1) {
			lines.push(
				`Slowest: ${slowest.name} (${benchmark_format_number(slowest.stats.ops_per_second)} ops/sec, ${time_format(slowest.stats.mean_ns, unit)} per op)`,
			);
			lines.push(`Speed difference: ${ratio.toFixed(2)}x`);
		}

		return lines.join('\n');
	}
}
