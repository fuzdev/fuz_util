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
	 * Default: 10000
	 */
	max_iterations?: number;

	/**
	 * Custom timer to use for measurements.
	 * Default: timer_default (auto-detects environment)
	 */
	timer?: Timer;

	/**
	 * Callback invoked after each iteration completes.
	 * Useful for triggering garbage collection, logging progress, or custom instrumentation.
	 *
	 * **Note**: The callback time is NOT included in iteration measurements - it runs
	 * after the timing capture. However, frequent GC calls will slow overall benchmark
	 * execution time.
	 *
	 * @param task_name - Name of the current task being benchmarked
	 * @param iteration - Current iteration number (1-indexed)
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
	 * ```
	 */
	on_iteration?: (task_name: string, iteration: number) => void;

	// TODO @enhance Consider adding `remove_outliers?: boolean` (default: true) to allow
	// users to opt-out of automatic outlier removal when they need raw statistics.
	// Use cases: debugging timing anomalies, analyzing GC impact, or when outliers
	// are meaningful (e.g., cold-start performance). Implementation: pass flag to
	// BenchmarkStats constructor to conditionally skip stats_outliers_mad() call.

	// TODO @enhance Consider adding early termination when measurements stabilize.
	// Options: `stabilize?: boolean` or `stabilize_cv_threshold?: number` (e.g., 0.02).
	// Algorithm: track rolling CV over last N samples (e.g., 100), stop when CV stays
	// below threshold for M consecutive checks. Useful for very fast functions where
	// thousands of samples add diminishing returns. Trade-off: less predictable runtime.
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

	/** Error if the task failed during execution */
	error?: Error;

	// TODO @enhance Consider adding `timings_ns?: Array<number>` for raw timing data exposure.
	// Use cases: custom statistical analysis, histogram generation, percentile calculations
	// beyond p99, or exporting to external tools. Trade-off: memory usage scales with
	// iterations (8 bytes per sample × potentially 100K+ samples per task). Implementation:
	// add `expose_timings?: boolean` to BenchmarkConfig, conditionally attach array here.
}

/**
 * Options for table formatting.
 */
export interface BenchmarkTableOptions {
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
}
