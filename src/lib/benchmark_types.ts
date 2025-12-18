import type {BenchmarkStats} from './benchmark_stats.js';
import type {Timer} from './time.js';

/**
 * Configuration options for a benchmark suite.
 */
export interface BenchmarkConfig {
	/**
	 * Target duration to run each benchmark task in milliseconds.
	 * The benchmark will run until this duration is reached or max_iterations is hit.
	 * Default: 1000ms
	 */
	duration_ms?: number;

	/**
	 * Number of warmup iterations before actual measurements.
	 * Warmup helps stabilize JIT compilation and caches.
	 * Default: 5
	 */
	warmup_iterations?: number;

	/**
	 * Cooldown time between tasks in milliseconds.
	 * Helps prevent interference between benchmarks.
	 * Default: 100ms
	 */
	cooldown_ms?: number;

	/**
	 * Minimum number of iterations to run.
	 * Default: 10
	 */
	min_iterations?: number;

	/**
	 * Maximum number of iterations to run.
	 * Prevents infinite loops if function is extremely fast.
	 * Default: 100000
	 */
	max_iterations?: number;

	/**
	 * Custom timer to use for measurements.
	 * Default: timer_default (auto-detects environment)
	 */
	timer?: Timer;

	/**
	 * Callback invoked after each iteration completes.
	 * Useful for triggering garbage collection, logging progress, early termination,
	 * or custom instrumentation.
	 *
	 * **Note**: The callback time is NOT included in iteration measurements - it runs
	 * after the timing capture. However, frequent GC calls will slow overall benchmark
	 * execution time.
	 *
	 * @param task_name - Name of the current task being benchmarked
	 * @param iteration - Current iteration number (1-indexed)
	 * @param abort - Call to stop the benchmark early for this task
	 *
	 * @example
	 * ```ts
	 * // Trigger GC between iterations (run node with --expose-gc)
	 * new Benchmark({
	 *   on_iteration: () => {
	 *     if (globalThis.gc) globalThis.gc();
	 *   }
	 * })
	 *
	 * // Log progress for long-running benchmarks
	 * new Benchmark({
	 *   on_iteration: (name, iteration) => {
	 *     if (iteration % 1000 === 0) {
	 *       console.log(`${name}: ${iteration} iterations`);
	 *     }
	 *   }
	 * })
	 *
	 * // Stop early when converged
	 * new Benchmark({
	 *   on_iteration: (name, iteration, abort) => {
	 *     if (iteration > 1000 && has_stabilized()) abort();
	 *   }
	 * })
	 * ```
	 */
	on_iteration?: (task_name: string, iteration: number, abort: () => void) => void;

	/**
	 * Callback invoked after each task completes.
	 * Useful for logging progress during long benchmark runs.
	 *
	 * @param result - The completed benchmark result
	 * @param index - Zero-based index of the completed task
	 * @param total - Total number of tasks to run
	 *
	 * @example
	 * ```ts
	 * new Benchmark({
	 *   on_task_complete: (result, index, total) => {
	 *     console.log(`[${index + 1}/${total}] ${result.name}: ${result.stats.ops_per_second.toFixed(0)} ops/sec`);
	 *   }
	 * })
	 * ```
	 */
	on_task_complete?: (result: BenchmarkResult, index: number, total: number) => void;
}

/**
 * A benchmark task to execute.
 */
export interface BenchmarkTask {
	/** Name of the task (for display) */
	name: string;

	/** Function to benchmark (sync or async). Return values are ignored. */
	fn: () => unknown;

	/**
	 * Optional setup function run before benchmarking this task.
	 * Not included in timing measurements.
	 */
	setup?: () => void | Promise<void>;

	/**
	 * Optional teardown function run after benchmarking this task.
	 * Not included in timing measurements.
	 */
	teardown?: () => void | Promise<void>;

	/**
	 * If true, skip this task during benchmark runs.
	 * Useful for temporarily disabling tasks during development.
	 */
	skip?: boolean;

	/**
	 * If true, run only this task (and other tasks marked `only`).
	 * Useful for focusing on specific tasks during development.
	 */
	only?: boolean;

	/**
	 * Hint for whether the function is sync or async.
	 * If not provided, automatically detected during warmup.
	 * Setting this explicitly skips per-iteration promise checking for sync functions.
	 */
	async?: boolean;
}

/**
 * Result from running a single benchmark task.
 */
export interface BenchmarkResult {
	/** Task name */
	name: string;

	/** Statistical analysis of the benchmark */
	stats: BenchmarkStats;

	/** Number of iterations executed */
	iterations: number;

	/** Total time spent benchmarking (including warmup) in milliseconds */
	total_time_ms: number;

	/**
	 * Raw timing data for each iteration in nanoseconds.
	 * Useful for custom statistical analysis, histogram generation,
	 * or exporting to external tools.
	 */
	timings_ns: Array<number>;
}

/**
 * Options for table formatting.
 */
export interface BenchmarkFormatTableOptions {
	/**
	 * Group results by category using filter functions.
	 */
	groups?: Array<BenchmarkGroup>;
}

/**
 * A group definition for organizing benchmark results.
 */
export interface BenchmarkGroup {
	/** Display name for the group */
	name: string;

	/** Optional description shown below the group name */
	description?: string;

	/** Filter function to determine which results belong to this group */
	filter: (result: BenchmarkResult) => boolean;

	/**
	 * Task name to use as baseline for the "vs" column.
	 * When specified, ratios are computed against this task instead of the fastest.
	 * If the baseline task is not found in the group, falls back to "vs Best" with a warning.
	 */
	baseline?: string;
}
