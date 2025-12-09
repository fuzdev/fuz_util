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
import {BenchmarkStats} from './benchmark_stats.js';
import {timer_default, time_unit_detect_best, time_format} from './time.js';
import {
	benchmark_format_table,
	benchmark_format_table_detailed,
	benchmark_format_table_grouped,
	benchmark_format_markdown,
	benchmark_format_json,
} from './benchmark_format.js';
import type {
	BenchmarkConfig,
	BenchmarkTask,
	BenchmarkResult,
	BenchmarkTableOptions,
} from './benchmark_types.js';

// Default configuration values
const DEFAULT_DURATION_MS = 1000;
const DEFAULT_WARMUP_ITERATIONS = 5;
const DEFAULT_COOLDOWN_MS = 100;
const DEFAULT_MIN_ITERATIONS = 10;
const DEFAULT_MAX_ITERATIONS = 10000;

/**
 * Warmup function by running it multiple times.
 * Detects whether the function returns promises and uses the appropriate path.
 * Returns whether the function is async (returns promises) for use in measurement.
 *
 * @param fn - Function to warmup (sync or async)
 * @param iterations - Number of warmup iterations
 * @returns Whether the function returns promises (is async)
 *
 * @example
 * ```ts
 * const is_async = await benchmark_warmup(() => expensive_operation(), 10);
 * // Use is_async to choose measurement strategy
 * ```
 */
export const benchmark_warmup = async (fn: () => unknown, iterations: number): Promise<boolean> => {
	if (iterations <= 0) {
		// No warmup requested - detect async with a single call
		const result = fn();
		if (is_promise(result)) {
			await result;
			return true;
		}
		return false;
	}

	// First iteration detects if function returns promises
	const first_result = fn();
	const fn_is_async = is_promise(first_result);

	if (fn_is_async) {
		await first_result;
		// Async path for remaining iterations
		for (let i = 1; i < iterations; i++) {
			await fn(); // eslint-disable-line no-await-in-loop
		}
	} else {
		// Sync path - no await overhead
		for (let i = 1; i < iterations; i++) {
			fn();
		}
	}

	return fn_is_async;
};

/**
 * Benchmark class for measuring and comparing function performance.
 */
export class Benchmark {
	private readonly config: Required<Omit<BenchmarkConfig, 'on_iteration'>> &
		Pick<BenchmarkConfig, 'on_iteration'>;
	private readonly tasks: Array<BenchmarkTask> = [];
	private _results: Array<BenchmarkResult> = [];
	private cached_unit: ReturnType<typeof time_unit_detect_best> | null = null;

	constructor(config: BenchmarkConfig = {}) {
		this.config = {
			duration_ms: config.duration_ms ?? DEFAULT_DURATION_MS,
			warmup_iterations: config.warmup_iterations ?? DEFAULT_WARMUP_ITERATIONS,
			cooldown_ms: config.cooldown_ms ?? DEFAULT_COOLDOWN_MS,
			min_iterations: config.min_iterations ?? DEFAULT_MIN_ITERATIONS,
			max_iterations: config.max_iterations ?? DEFAULT_MAX_ITERATIONS,
			timer: config.timer ?? timer_default,
			on_iteration: config.on_iteration,
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
		if (this.tasks.some((t) => t.name === task_name)) {
			throw new Error(`Task "${task_name}" already exists`);
		}

		if (typeof name_or_task === 'string') {
			if (!fn) throw new Error('Function required when name is string');
			this.tasks.push({name: name_or_task, fn});
		} else {
			this.tasks.push(name_or_task);
		}
		return this;
	}

	/**
	 * Run all benchmark tasks.
	 * @returns Array of benchmark results
	 */
	async run(): Promise<Array<BenchmarkResult>> {
		this._results = [];
		this.cached_unit = null; // Invalidate cache

		for (const task of this.tasks) {
			const result = await this.run_task(task); // eslint-disable-line no-await-in-loop
			this._results.push(result);

			// Cooldown between tasks
			if (this.config.cooldown_ms > 0) {
				await wait(this.config.cooldown_ms); // eslint-disable-line no-await-in-loop
			}
		}

		return this._results;
	}

	/**
	 * Get the best time unit for displaying results.
	 * Caches the result for repeated calls.
	 */
	private get_display_unit(): ReturnType<typeof time_unit_detect_best> {
		if (this.cached_unit === null) {
			const mean_times = this._results.map((r) => r.stats.mean_ns);
			this.cached_unit = time_unit_detect_best(mean_times);
		}
		return this.cached_unit;
	}

	/**
	 * Run a single benchmark task.
	 * Returns a result even if the task fails - check the `error` property.
	 */
	private async run_task(task: BenchmarkTask): Promise<BenchmarkResult> {
		const suite_start_ns = this.config.timer.now();
		const timings_ns: Array<number> = [];
		let setup_completed = false;
		let error: Error | undefined;

		try {
			// Setup
			if (task.setup) {
				await task.setup();
			}
			setup_completed = true;

			// Warmup - also detects if function returns promises
			// Detection happens during warmup (not during measurement) for cleaner timing
			const fn_is_async = await benchmark_warmup(task.fn, this.config.warmup_iterations);

			// Measurement phase
			const target_time_ns = this.config.duration_ms * 1_000_000; // Convert ms to ns
			const min_iterations = this.config.min_iterations;
			const max_iterations = this.config.max_iterations;

			let iteration = 0;
			const measurement_start_ns = this.config.timer.now();

			if (fn_is_async) {
				// Async path - check each return value and await if promise
				while (iteration < max_iterations) {
					const iter_start_ns = this.config.timer.now();
					const result = task.fn();
					if (is_promise(result)) {
						await result; // eslint-disable-line no-await-in-loop
					}
					const iter_end_ns = this.config.timer.now();
					timings_ns.push(iter_end_ns - iter_start_ns);
					iteration++;
					this.config.on_iteration?.(task.name, iteration);

					const total_elapsed_ns = iter_end_ns - measurement_start_ns;
					if (iteration >= min_iterations && total_elapsed_ns >= target_time_ns) {
						break;
					}
				}
			} else {
				// Sync path - no await overhead for maximum accuracy
				while (iteration < max_iterations) {
					const iter_start_ns = this.config.timer.now();
					task.fn();
					const iter_end_ns = this.config.timer.now();
					timings_ns.push(iter_end_ns - iter_start_ns);
					iteration++;
					this.config.on_iteration?.(task.name, iteration);

					const total_elapsed_ns = iter_end_ns - measurement_start_ns;
					if (iteration >= min_iterations && total_elapsed_ns >= target_time_ns) {
						break;
					}
				}
			}
		} catch (e) {
			error = e instanceof Error ? e : new Error(String(e));
		} finally {
			// Always run teardown if setup completed
			if (setup_completed && task.teardown) {
				try {
					await task.teardown();
				} catch {
					// Ignore teardown errors if we already have an error
				}
			}
		}

		const suite_end_ns = this.config.timer.now();
		const total_time_ms = (suite_end_ns - suite_start_ns) / 1_000_000; // Convert back to ms for display

		// Analyze results (may have partial data if error occurred mid-run)
		const stats = new BenchmarkStats(timings_ns);

		return {
			name: task.name,
			stats,
			iterations: timings_ns.length,
			total_time_ms,
			error,
		};
	}

	/**
	 * Format results as an ASCII table.
	 * @param options - Formatting options
	 * @returns Formatted table string
	 *
	 * @example
	 * ```ts
	 * // Standard table
	 * console.log(bench.table());
	 *
	 * // Detailed table with percentiles
	 * console.log(bench.table({ detailed: true }));
	 *
	 * // Grouped by category
	 * console.log(bench.table({
	 *   groups: [
	 *     { name: 'FAST PATHS', filter: (r) => r.name.includes('fast') },
	 *     { name: 'SLOW PATHS', filter: (r) => r.name.includes('slow') },
	 *   ]
	 * }));
	 *
	 * // Both detailed and grouped
	 * console.log(bench.table({ detailed: true, groups }));
	 * ```
	 */
	table(options: BenchmarkTableOptions = {}): string {
		const {detailed = false, groups} = options;

		if (groups) {
			return benchmark_format_table_grouped(this._results, groups, detailed);
		}
		if (detailed) {
			return benchmark_format_table_detailed(this._results);
		}
		return benchmark_format_table(this._results);
	}

	/**
	 * Format results as a Markdown table.
	 * @returns Formatted markdown string
	 */
	markdown(): string {
		return benchmark_format_markdown(this._results);
	}

	/**
	 * Format results as JSON.
	 * @param pretty - Whether to pretty-print (default: true)
	 * @returns JSON string
	 */
	json(pretty: boolean = true): string {
		return benchmark_format_json(this._results, pretty);
	}

	/**
	 * Get the benchmark results.
	 * Returns a shallow copy to prevent external mutation.
	 * @returns Array of benchmark results
	 */
	results(): Array<BenchmarkResult> {
		return [...this._results];
	}

	/**
	 * Reset the benchmark results.
	 * Keeps tasks intact so benchmarks can be rerun.
	 * @returns This Benchmark instance for chaining
	 */
	reset(): this {
		this._results = [];
		this.cached_unit = null;
		return this;
	}

	/**
	 * Clear everything (results and tasks).
	 * Use this to start fresh with a new set of benchmarks.
	 * @returns This Benchmark instance for chaining
	 */
	clear(): this {
		this._results = [];
		this.cached_unit = null;
		this.tasks.length = 0;
		return this;
	}

	/**
	 * Get a quick text summary of the fastest task.
	 * @returns Human-readable summary string
	 *
	 * @example
	 * ```ts
	 * console.log(bench.summary());
	 * // "Fastest: slugify_v2 (1,285,515 ops/sec, 786.52ns per op)"
	 * // "Slowest: slugify (252,955 ops/sec, 3.95μs per op)"
	 * // "Speed difference: 5.08x"
	 * ```
	 */
	summary(): string {
		if (this._results.length === 0) return 'No results';

		const fastest = this._results.reduce((a, b) =>
			a.stats.ops_per_second > b.stats.ops_per_second ? a : b,
		);

		const slowest = this._results.reduce((a, b) =>
			a.stats.ops_per_second < b.stats.ops_per_second ? a : b,
		);

		const ratio = fastest.stats.ops_per_second / slowest.stats.ops_per_second;

		// Use cached unit for consistent display
		const unit = this.get_display_unit();

		const lines: Array<string> = [];
		lines.push(
			`Fastest: ${fastest.name} (${fastest.stats.ops_per_second.toFixed(2)} ops/sec, ${time_format(fastest.stats.mean_ns, unit)} per op)`,
		);

		if (this._results.length > 1) {
			lines.push(
				`Slowest: ${slowest.name} (${slowest.stats.ops_per_second.toFixed(2)} ops/sec, ${time_format(slowest.stats.mean_ns, unit)} per op)`,
			);
			lines.push(`Speed difference: ${ratio.toFixed(2)}x`);
		}

		return lines.join('\n');
	}
}
