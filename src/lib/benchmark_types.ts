import type {BenchmarkStats} from './benchmark_stats.ts';
import type {Timer} from './time.ts';

/**
 * Configuration options for a benchmark suite.
 */
export interface BenchmarkConfig {
	/**
	 * Target measurement duration per task in milliseconds. The loop runs
	 * at least `min_iterations` iterations *and* at least this long, with
	 * `max_iterations` and `on_iteration` `abort()` as hard ceilings.
	 * Default: 1000ms
	 */
	duration_ms?: number;

	/**
	 * Number of warmup iterations before actual measurements.
	 * Warmup helps stabilize JIT compilation and caches.
	 * Default: 10
	 */
	warmup_iterations?: number;

	/**
	 * Cooldown time between tasks in milliseconds. Lets the runtime settle
	 * GC and (partially) thermal state between tasks. Fixed regardless of
	 * the previous task's duration or allocation footprint — if a suite
	 * mixes heavy and light tasks, raise this so light tasks downstream
	 * don't run in the prior task's GC shadow.
	 * Default: 100ms
	 */
	cooldown_ms?: number;

	/**
	 * Minimum number of iterations to run. The loop continues past
	 * `duration_ms` if needed to reach this floor, so raising it in a slow
	 * suite extends wall-clock past `duration_ms`.
	 *
	 * The default (30) is sized so the Welch's-t DOF approximation used by
	 * `benchmark_stats_compare` stays stable on the floor case. Lowering it
	 * below ~15 produces statistically unreliable significance calls on slow
	 * tasks that hit the floor exactly — the math still runs but
	 * `comparison.significant` becomes a coin flip on noisy outliers.
	 *
	 * Default: 30
	 */
	min_iterations?: number;

	/**
	 * Maximum number of iterations to run. Prevents infinite loops on
	 * extremely fast functions, and also sizes the pre-allocated timings
	 * array — set this only as high as you expect to fill, since oversized
	 * caps waste memory and add GC pressure during measurement.
	 * Default: 100000
	 */
	max_iterations?: number;

	/**
	 * Custom timer to use for measurements.
	 * Default: `timer_default` (auto-detects environment)
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
	 * @param task_name - name of the current task being benchmarked
	 * @param iteration - current iteration number (1-indexed)
	 * @param abort - call to stop the benchmark early for this task
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
	 * @param result - the completed benchmark result
	 * @param index - zero-based index of the completed task
	 * @param total - total number of tasks to run
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
 *
 * The time-budget fields (`duration_ms`, `warmup_iterations`, `min_iterations`,
 * `max_iterations`) override the suite-level `BenchmarkConfig` for this task
 * only. Use them when one task is much faster or slower than the others —
 * e.g. raise `min_iterations` on a slow task so its percentile/CI math has
 * enough samples without inflating the budget for the fast tasks.
 *
 * **Reading output across overrides:** when per-task overrides diverge
 * across rows in the same table, cross-row comparison weakens. Percentiles
 * (`p50`, `p99`, …) become unreliable when sample counts differ — `p99` at
 * n=30 and `p99` at n=50000 estimate different things. Means (and the
 * `vs Best` column) stay reasonable only if `warmup_iterations` is held
 * comparable across tasks; asymmetric warmup biases the under-warmed task's
 * mean upward. Per-task percentiles remain valid for that task alone.
 */
export interface BenchmarkTask {
	/** Name of the task (for display) */
	name: string;

	/** Function to benchmark (sync or async). Return values are ignored. */
	fn: () => unknown;

	/**
	 * Optional setup function run before benchmarking this task.
	 * Not included in timing measurements.
	 *
	 * Mutations to `fn` and `name` made here are honored by the measurement
	 * loop — useful for dynamic configuration that depends on async state
	 * resolved during setup.
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
	 * Hint for whether the function is sync or async. Auto-detected during
	 * warmup if not set; `async: false` skips per-iteration promise checking
	 * for sync functions, while `async: true` forces an `await` on every
	 * measurement iteration.
	 *
	 * Setting `async: true` on a function that returns sync forces an
	 * unnecessary microtask per iteration — for sub-microsecond functions
	 * this adds measurable bias. Prefer leaving `async` undefined (auto-
	 * detected during warmup) unless the conditional-async hazard below
	 * applies.
	 *
	 * **Required for conditional-async fns** — without `async: true`, a
	 * first call that happens to return synchronously locks in the sync
	 * code path and any later Promise returns leak as unhandled rejections.
	 */
	async?: boolean;

	/**
	 * Override the suite's `duration_ms` for this task only.
	 * Useful when one task is much slower than others and needs a longer (or shorter)
	 * measurement window than the suite default.
	 */
	duration_ms?: number;

	/**
	 * Override the suite's `warmup_iterations` for this task only.
	 * Slow tasks may want fewer warmup iterations to keep wall-clock reasonable;
	 * tight/complex functions may want more so TurboFan reaches steady state.
	 */
	warmup_iterations?: number;

	/**
	 * Override the suite's `min_iterations` for this task only.
	 * Raise this on slow tasks so percentile and CI math have enough
	 * samples. Wins over `duration_ms` (see the suite field) — a slow task
	 * with a raised floor extends wall-clock until the count is reached.
	 *
	 * Prefer raising this over `duration_ms` when you need more samples:
	 * per-iteration noise (GC, scheduler, thermal) is a time-rate process,
	 * so a longer wall-clock window proportionally inflates exposure to
	 * rare tail events. Raising the sample floor fixes the statistical-power
	 * problem without that inflation.
	 */
	min_iterations?: number;

	/**
	 * Override the suite's `max_iterations` for this task only.
	 * Cap a fast task to a fixed sample count, or raise the ceiling on a
	 * slow task that would otherwise be limited by the suite default. Also
	 * sizes the per-task pre-allocation — avoid extreme caps that won't
	 * actually be filled. When this differs sharply across tasks in the
	 * same suite, the larger allocation can leak GC pressure into
	 * subsequent tasks (`cooldown_ms` is fixed regardless of prior task
	 * footprint).
	 */
	max_iterations?: number;
}

/**
 * Effective time-budget config used to produce a benchmark sample set.
 * Resolved from per-task overrides on top of suite defaults — what the
 * measurement loop actually saw, not what was configured.
 *
 * `async_resolved` captures the boolean that `benchmark_warmup` actually
 * returned for the measurement run — *not* the user's `task.async` hint.
 * The two diverge when (a) the hint is `undefined` and the function is
 * auto-detected sync vs. async, or (b) a conditional-async fn resolves
 * differently between runs. Persisting the resolved value is what makes
 * the budget describe "what the loop saw," not "what was configured."
 */
export interface BenchmarkBudget {
	duration_ms: number;
	warmup_iterations: number;
	min_iterations: number;
	max_iterations: number;
	async_resolved: boolean;
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

	/** Total wall-clock time for the task (setup + warmup + measurement + teardown) in milliseconds */
	total_time_ms: number;

	/**
	 * Raw timing data for each iteration in nanoseconds.
	 * Length equals `iterations` (the array is right-sized after measurement).
	 * Useful for custom statistical analysis, histogram generation,
	 * or exporting to external tools.
	 */
	timings_ns: Array<number>;

	/**
	 * Effective per-task time budget after applying overrides to suite defaults.
	 * Persisted into baselines so `benchmark_baseline_compare` can detect
	 * methodology drift — a `min_iterations` bump between baseline and current
	 * shifts Welch's DOF and produces "regressions" that are sample-size
	 * artifacts, not real drift.
	 */
	budget: BenchmarkBudget;
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
