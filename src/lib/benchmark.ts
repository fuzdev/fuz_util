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
	benchmark_format_table_grouped,
	benchmark_format_markdown,
	benchmark_format_json,
	format_number,
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
const DEFAULT_MAX_ITERATIONS = 100_000;

/**
 * Warmup function by running it multiple times.
 * Awaits any promises returned by the function.
 *
 * @param fn - Function to warmup (sync or async)
 * @param iterations - Number of warmup iterations
 *
 * @example
 * ```ts
 * await benchmark_warmup(() => expensive_operation(), 10);
 * ```
 */
export const benchmark_warmup = async (fn: () => unknown, iterations: number): Promise<void> => {
	for (let i = 0; i < iterations; i++) {
		const result = fn();
		if (is_promise(result)) {
			await result; // eslint-disable-line no-await-in-loop
		}
	}
};

/**
 * Benchmark class for measuring and comparing function performance.
 */
export class Benchmark {
	readonly #config: Required<Omit<BenchmarkConfig, 'on_iteration'>> &
		Pick<BenchmarkConfig, 'on_iteration'>;
	readonly #tasks: Array<BenchmarkTask> = [];
	#results: Array<BenchmarkResult> = [];

	constructor(config: BenchmarkConfig = {}) {
		const warmup_iterations = config.warmup_iterations ?? DEFAULT_WARMUP_ITERATIONS;
		if (warmup_iterations < 1) {
			throw new Error('warmup_iterations must be at least 1');
		}

		this.#config = {
			duration_ms: config.duration_ms ?? DEFAULT_DURATION_MS,
			warmup_iterations,
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
	 * Run all benchmark tasks.
	 * @returns Array of benchmark results
	 */
	async run(): Promise<Array<BenchmarkResult>> {
		this.#results = [];

		for (const task of this.#tasks) {
			const result = await this.#run_task(task); // eslint-disable-line no-await-in-loop
			this.#results.push(result);

			// Cooldown between tasks
			if (this.#config.cooldown_ms > 0) {
				await wait(this.#config.cooldown_ms); // eslint-disable-line no-await-in-loop
			}
		}

		return this.#results;
	}

	/**
	 * Run a single benchmark task.
	 * Throws if the task fails during setup, warmup, or measurement.
	 */
	async #run_task(task: BenchmarkTask): Promise<BenchmarkResult> {
		const suite_start_ns = this.#config.timer.now();
		const timings_ns: Array<number> = [];

		try {
			// Setup
			if (task.setup) {
				await task.setup();
			}

			// Warmup
			await benchmark_warmup(task.fn, this.#config.warmup_iterations);

			// Measurement phase
			const target_time_ns = this.#config.duration_ms * 1_000_000; // Convert ms to ns
			const min_iterations = this.#config.min_iterations;
			const max_iterations = this.#config.max_iterations;

			let iteration = 0;
			let aborted = false as boolean;
			const abort = (): void => {
				aborted = true;
			};
			const measurement_start_ns = this.#config.timer.now();

			// eslint-disable-next-line no-unmodified-loop-condition
			while (iteration < max_iterations && !aborted) {
				const iter_start_ns = this.#config.timer.now();
				const result = task.fn();
				if (is_promise(result)) {
					await result; // eslint-disable-line no-await-in-loop
				}
				const iter_end_ns = this.#config.timer.now();
				timings_ns.push(iter_end_ns - iter_start_ns);
				iteration++;
				this.#config.on_iteration?.(task.name, iteration, abort);

				const total_elapsed_ns = iter_end_ns - measurement_start_ns;
				if (iteration >= min_iterations && total_elapsed_ns >= target_time_ns) {
					break;
				}
			}
		} finally {
			// Always run teardown
			if (task.teardown) {
				await task.teardown();
			}
		}

		const suite_end_ns = this.#config.timer.now();
		const total_time_ms = (suite_end_ns - suite_start_ns) / 1_000_000; // Convert back to ms for display

		// Analyze results
		const stats = new BenchmarkStats(timings_ns);

		return {
			name: task.name,
			stats,
			iterations: timings_ns.length,
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
	table(options: BenchmarkTableOptions = {}): string {
		return options.groups
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
	 * @param pretty - Whether to pretty-print (default: true)
	 * @param include_timings - Whether to include raw timings array (default: false, can be large)
	 * @returns JSON string
	 */
	json(pretty: boolean = true, include_timings: boolean = false): string {
		return benchmark_format_json(this.#results, pretty, include_timings);
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
			`Fastest: ${fastest.name} (${format_number(fastest.stats.ops_per_second)} ops/sec, ${time_format(fastest.stats.mean_ns, unit)} per op)`,
		);

		if (this.#results.length > 1) {
			lines.push(
				`Slowest: ${slowest.name} (${format_number(slowest.stats.ops_per_second)} ops/sec, ${time_format(slowest.stats.mean_ns, unit)} per op)`,
			);
			lines.push(`Speed difference: ${ratio.toFixed(2)}x`);
		}

		return lines.join('\n');
	}
}
