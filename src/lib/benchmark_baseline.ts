/**
 * Benchmark baseline storage and comparison utilities.
 * Save benchmark results to disk and compare against baselines for regression detection.
 *
 * @module
 */

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

import { fs_exists } from './fs.ts';
import { git_info_get } from './git.ts';
import type { BenchmarkResult } from './benchmark_types.ts';
import {
	benchmark_stats_compare,
	type BenchmarkComparison,
	type BenchmarkStatsComparable
} from './benchmark_stats.ts';
import { stats_confidence_interval_from_summary, stats_cv } from './stats.ts';

// Version for forward compatibility - increment when schema changes
const BASELINE_VERSION = 3;

/**
 * Schema for the effective per-task time budget that produced a sample set.
 * Persisted on every entry so comparison can detect methodology drift.
 * Internal — consumers access the inferred TS type via
 * `BenchmarkBaselineEntry['budget']` or `BenchmarkBudget` from
 * `benchmark_types.ts`.
 */
const BenchmarkBaselineBudget = z.object({
	duration_ms: z.number(),
	warmup_iterations: z.number(),
	min_iterations: z.number(),
	max_iterations: z.number(),
	async_resolved: z.boolean()
});

/**
 * Schema for a single benchmark entry in the baseline.
 *
 * `outlier_ratio` is persisted as a noise signal independent of the
 * post-cleaning `std_dev_ns`/cv: outlier removal *deflates* std_dev (the
 * cleaned set is by construction less variable than the raw set), so cv
 * alone misses runs where a third of the iterations were tail events.
 * `benchmark_baseline_compare` OR-gates `noise_warning` on this field so
 * a noisy raw distribution gets flagged even when the cleaned cv looks tight.
 */
export const BenchmarkBaselineEntry = z.object({
	name: z.string(),
	mean_ns: z.number(),
	p50_ns: z.number(),
	std_dev_ns: z.number(),
	min_ns: z.number(),
	max_ns: z.number(),
	p75_ns: z.number(),
	p90_ns: z.number(),
	p95_ns: z.number(),
	p99_ns: z.number(),
	ops_per_second: z.number(),
	sample_size: z.number(),
	outlier_ratio: z.number(),
	budget: BenchmarkBaselineBudget
});
export type BenchmarkBaselineEntry = z.infer<typeof BenchmarkBaselineEntry>;

/**
 * Schema for the complete baseline file.
 *
 * `metadata` is an opt-in passthrough bag for context that applies to the whole
 * run but isn't part of the comparison math — corpus identity (file counts,
 * total bytes), dependency versions, binary sizes, hardware notes, build flags.
 * Pass it on save and read it back on load; it's not interpreted by
 * `benchmark_baseline_compare`. The intended use is to let consumers attach
 * "did this run measure the same thing as the baseline?" context (e.g. corpus
 * shape) without forking the schema, then surface mismatches in their own
 * reporting. fuz_util doesn't surface metadata in comparison output because it
 * has no shape — consumers know what their metadata means and how to display
 * the diff.
 */
export const BenchmarkBaseline = z.object({
	version: z.number(),
	timestamp: z.string(),
	git_commit: z.string().nullable(),
	git_branch: z.string().nullable(),
	node_version: z.string(),
	entries: z.array(BenchmarkBaselineEntry),
	metadata: z.record(z.string(), z.unknown()).optional()
});
export type BenchmarkBaseline = z.infer<typeof BenchmarkBaseline>;

/**
 * Options for saving a baseline.
 */
export interface BenchmarkBaselineSaveOptions {
	/** Directory to store baselines (default: '.gro/benchmarks') */
	path?: string;
	/** Git commit hash (auto-detected if not provided) */
	git_commit?: string | null;
	/** Git branch name (auto-detected if not provided) */
	git_branch?: string | null;
	/**
	 * Opt-in passthrough for run-level context (corpus identity, dependency
	 * versions, binary sizes, hardware notes). Round-trips on `_load` and is
	 * accessible via `BenchmarkBaselineComparisonResult.baseline_metadata`, but
	 * is *not* interpreted by `_compare` — consumers decide what to do with
	 * mismatches. Keep values JSON-serializable; this is written verbatim to
	 * the baseline file.
	 */
	metadata?: Record<string, unknown>;
}

/**
 * Options for loading a baseline.
 */
export interface BenchmarkBaselineLoadOptions {
	/** Directory to load baseline from (default: '.gro/benchmarks') */
	path?: string;
}

/**
 * Options for comparing against a baseline.
 */
export interface BenchmarkBaselineCompareOptions extends BenchmarkBaselineLoadOptions {
	/**
	 * Minimum speedup ratio to consider a regression.
	 * For example, 1.05 means only flag regressions that are 5% or more slower.
	 * Default: 1.0 (any statistically significant slowdown is a regression)
	 */
	regression_threshold?: number;
	/**
	 * Number of days after which to warn about stale baseline.
	 * Default: undefined (no staleness warning)
	 */
	staleness_warning_days?: number;
	/**
	 * Minimum percentage difference to consider meaningful, as a ratio.
	 * Passed through to `benchmark_stats_compare`. See `BenchmarkCompareOptions`.
	 * Default: 0.10 (10%)
	 */
	min_percent_difference?: number;
	/**
	 * Coefficient of variation (`std_dev / mean`) at or above which a
	 * comparison is flagged with `noise_warning: true`. Doesn't affect
	 * bucketing — the task still routes to regressions / improvements /
	 * unchanged as the Welch math dictates — but tells the formatter (and
	 * any custom consumer) that the underlying measurement is noisy enough
	 * that a "significant" call should be read with skepticism. The default
	 * is calibrated for system-noise/thermal/background-load contamination,
	 * not microbenchmark floor effects; lower it (e.g. 0.15) for
	 * sub-microsecond functions where any cv signal matters, raise it for
	 * inherently noisy workloads where 0.3 fires on every run.
	 * Default: 0.30
	 */
	noise_warning_cv_threshold?: number;
	/**
	 * Outlier ratio (fraction of iterations rejected by MAD outlier removal)
	 * at or above which the comparison is flagged with `noise_warning: true`,
	 * OR-gated with the cv check. Catches the case where the post-cleaning
	 * cv looks tight because outlier removal already deflated the spread —
	 * a third of the iterations being tail events is itself a noise signal,
	 * even if the surviving samples cluster cleanly. Set higher (e.g. 0.2)
	 * for benchmarks where outliers are expected (allocator-bound, async
	 * I/O), lower (e.g. 0.05) for tight CPU loops.
	 * Default: 0.10
	 */
	noise_warning_outlier_ratio_threshold?: number;
}

/**
 * Result of comparing current results against a baseline.
 */
export interface BenchmarkBaselineComparisonResult {
	/** Whether a baseline was found */
	baseline_found: boolean;
	/** Timestamp of the baseline */
	baseline_timestamp: string | null;
	/** Git commit of the baseline */
	baseline_commit: string | null;
	/** Age of the baseline in days */
	baseline_age_days: number | null;
	/** Whether the baseline is considered stale based on staleness_warning_days option */
	baseline_stale: boolean;
	/** Node.js version recorded in the baseline (null if no baseline). */
	baseline_node_version: string | null;
	/** Node.js version of the process that produced the current results. */
	current_node_version: string;
	/**
	 * True if the baseline's node version differs from the current process.
	 * Informational only — surfaced in the comparison header so readers can
	 * apply the caveat across all task comparisons; does not affect per-task
	 * classification (Node bumps affect every task uniformly).
	 */
	node_version_changed: boolean;
	/**
	 * The `metadata` bag persisted in the baseline file, or `null` if the
	 * baseline didn't have one (or no baseline was found). Returned verbatim —
	 * fuz_util doesn't validate the shape or diff it against any "current run"
	 * metadata. If the consumer needs a diff, they pass `options.metadata`
	 * (current-run context) and walk the two records themselves.
	 */
	baseline_metadata: Record<string, unknown> | null;
	/**
	 * Individual task comparisons for tasks where Welch's math is meaningful —
	 * i.e., budget unchanged between baseline and current. Methodology-changed
	 * tasks are NOT in here; they live in `methodology_changed`. Excluding them
	 * here keeps aggregate reads of `c.comparison.faster` /
	 * `c.comparison.speedup_ratio` / `c.comparison.recommendation` safe — those
	 * fields are still computed for methodology-changed rows but answer a
	 * counterfactual question (the math is correct over mismatched sample
	 * sizes) and would mislead consumers iterating this array.
	 */
	comparisons: Array<BenchmarkBaselineTaskComparison>;
	/** Tasks that regressed (slower with statistical significance), sorted by effect size (largest first) */
	regressions: Array<BenchmarkBaselineTaskComparison>;
	/** Tasks that improved (faster with statistical significance), sorted by effect size (largest first) */
	improvements: Array<BenchmarkBaselineTaskComparison>;
	/** Tasks with no significant change */
	unchanged: Array<BenchmarkBaselineTaskComparison>;
	/**
	 * Tasks whose effective budget differs between baseline and current.
	 * Excluded from regressions/improvements/unchanged because the Welch
	 * comparison is contaminated by sample-size or warmup differences — the
	 * math is correct but answers a different question than the reader thinks.
	 * Re-save the baseline after intentional methodology changes to surface
	 * any genuine drift that was masked.
	 */
	methodology_changed: Array<BenchmarkBaselineTaskComparison>;
	/** Tasks in current run but not in baseline */
	new_tasks: Array<string>;
	/** Tasks in baseline but not in current run */
	removed_tasks: Array<string>;
}

/**
 * Comparison result for a single task.
 */
export interface BenchmarkBaselineTaskComparison {
	name: string;
	baseline: BenchmarkBaselineEntry;
	current: BenchmarkBaselineEntry;
	/**
	 * Welch comparison of baseline vs. current means.
	 *
	 * When the row is in `methodology_changed`, **every field** of this object
	 * is contaminated by sample-size or warmup differences — not just
	 * `recommendation`. The Welch math runs end-to-end and populates `faster`,
	 * `speedup_ratio`, `significant`, `p_value`, `percent_difference`,
	 * `effect_size`, `effect_magnitude`, `ci_overlap`, and `recommendation`,
	 * but it's comparing distributions produced under different methodologies.
	 * Treat the result as diagnostic ("how dramatic is the contamination?"),
	 * not authoritative.
	 *
	 * The built-in formatters (`benchmark_baseline_format`,
	 * `benchmark_baseline_format_json`) never render `comparison.*` for
	 * methodology-changed rows for this reason — they show only the budget
	 * diff. Custom consumers reading this field directly should check
	 * `methodology_changed` first.
	 */
	comparison: BenchmarkComparison;
	/**
	 * True if the effective time budget differs between baseline and current.
	 * When set, the task is routed to `methodology_changed` instead of
	 * regressions/improvements/unchanged, and the `comparison` field's contents
	 * become unreliable per the doc above.
	 */
	methodology_changed: boolean;
	/**
	 * True when measurement noise is high enough to undermine the
	 * significance call on this row. OR-gated across two signals:
	 *   - `max(baseline.cv, current.cv) >= noise_warning_cv_threshold`
	 *     where cv = `std_dev_ns / mean_ns` (post-outlier-removal).
	 *   - `max(baseline.outlier_ratio, current.outlier_ratio)
	 *     >= noise_warning_outlier_ratio_threshold`, since outlier removal
	 *     deflates cv — a high outlier ratio is itself a noise signal even
	 *     when the cleaned cv looks tight.
	 * Independent of `methodology_changed`. The Welch math still ran; this
	 * flag tells the reader to take `comparison.significant` with skepticism
	 * on this row. Cv is recomputed at comparison time from persisted
	 * `mean_ns`/`std_dev_ns`; `outlier_ratio` is persisted directly.
	 */
	noise_warning: boolean;
	/**
	 * The larger of the two coefficients of variation across baseline and
	 * current, exposed so consumers can render the actual noise level.
	 * Recomputed at comparison time from persisted `mean_ns` and
	 * `std_dev_ns` — not a persisted field.
	 */
	max_cv: number;
	/**
	 * The larger of the two outlier ratios across baseline and current.
	 * Read directly from the persisted entries. Exposed so consumers can
	 * render the actual outlier rate alongside `noise_warning`.
	 */
	max_outlier_ratio: number;
}

const DEFAULT_BASELINE_PATH = '.gro/benchmarks';
const BASELINE_FILENAME = 'baseline.json';

/**
 * Convert benchmark results to baseline entries.
 */
const results_to_entries = (results: Array<BenchmarkResult>): Array<BenchmarkBaselineEntry> => {
	return results.map((r) => ({
		name: r.name,
		mean_ns: r.stats.mean_ns,
		p50_ns: r.stats.p50_ns,
		std_dev_ns: r.stats.std_dev_ns,
		min_ns: r.stats.min_ns,
		max_ns: r.stats.max_ns,
		p75_ns: r.stats.p75_ns,
		p90_ns: r.stats.p90_ns,
		p95_ns: r.stats.p95_ns,
		p99_ns: r.stats.p99_ns,
		ops_per_second: r.stats.ops_per_second,
		sample_size: r.stats.sample_size,
		outlier_ratio: r.stats.outlier_ratio,
		budget: r.budget
	}));
};

/**
 * Per-field diff entry produced by `benchmark_budget_diff`. The `async_resolved`
 * entry carries booleans; every other entry carries numbers. Consumers reading
 * `baseline`/`current` should narrow on `field` before using the value
 * arithmetically.
 */
export type BenchmarkBudgetDiffEntry =
	| {
			field: 'duration_ms' | 'warmup_iterations' | 'min_iterations' | 'max_iterations';
			baseline: number;
			current: number;
	  }
	| { field: 'async_resolved'; baseline: boolean; current: boolean };

/**
 * Compute the per-field diff between two effective budgets. Returns an empty
 * array if budgets are identical — the formatters use the length as a quick
 * "methodology changed?" check without re-deriving the boolean.
 */
export const benchmark_budget_diff = (
	baseline: BenchmarkBaselineEntry['budget'],
	current: BenchmarkBaselineEntry['budget']
): Array<BenchmarkBudgetDiffEntry> => {
	const diff: Array<BenchmarkBudgetDiffEntry> = [];
	if (baseline.duration_ms !== current.duration_ms) {
		diff.push({
			field: 'duration_ms',
			baseline: baseline.duration_ms,
			current: current.duration_ms
		});
	}
	if (baseline.warmup_iterations !== current.warmup_iterations) {
		diff.push({
			field: 'warmup_iterations',
			baseline: baseline.warmup_iterations,
			current: current.warmup_iterations
		});
	}
	if (baseline.min_iterations !== current.min_iterations) {
		diff.push({
			field: 'min_iterations',
			baseline: baseline.min_iterations,
			current: current.min_iterations
		});
	}
	if (baseline.max_iterations !== current.max_iterations) {
		diff.push({
			field: 'max_iterations',
			baseline: baseline.max_iterations,
			current: current.max_iterations
		});
	}
	if (baseline.async_resolved !== current.async_resolved) {
		diff.push({
			field: 'async_resolved',
			baseline: baseline.async_resolved,
			current: current.async_resolved
		});
	}
	return diff;
};

/**
 * Save benchmark results as the current baseline.
 *
 * Each entry's effective time-budget (`duration_ms`, `warmup_iterations`,
 * `min_iterations`, `max_iterations`) is persisted alongside the stats so a
 * later `benchmark_baseline_compare` can detect methodology drift — a budget
 * mismatch between baseline and current routes the task to the
 * `methodology_changed` bucket instead of producing false regressions /
 * improvements. Suite-level config (`timer`, `cooldown_ms`) is *not*
 * persisted; keep it stable across runs in the same baseline lineage.
 *
 * @throws Error if creating the baseline directory or writing the file fails
 *
 * @example
 * ```ts
 * const bench = new Benchmark();
 * bench.add('test', () => fn());
 * await bench.run();
 * await benchmark_baseline_save(bench.results());
 * ```
 */
export const benchmark_baseline_save = async (
	results: Array<BenchmarkResult>,
	options: BenchmarkBaselineSaveOptions = {}
): Promise<void> => {
	const base_path = options.path ?? DEFAULT_BASELINE_PATH;

	// Get git info if not provided
	let git_commit = options.git_commit;
	let git_branch = options.git_branch;
	if (git_commit === undefined || git_branch === undefined) {
		const git_info = await git_info_get();
		git_commit ??= git_info.commit;
		git_branch ??= git_info.branch;
	}

	const baseline: BenchmarkBaseline = {
		version: BASELINE_VERSION,
		timestamp: new Date().toISOString(),
		git_commit,
		git_branch,
		node_version: process.version,
		entries: results_to_entries(results),
		// Only write `metadata` when the caller passed something — keeps
		// baselines that don't use the feature byte-identical to the pre-
		// metadata schema (no spurious `"metadata": {}` field in the file).
		...(options.metadata !== undefined ? { metadata: options.metadata } : {})
	};

	await mkdir(base_path, { recursive: true });
	const filepath = join(base_path, BASELINE_FILENAME);
	await writeFile(filepath, JSON.stringify(baseline, null, '\t'), 'utf-8');
};

/**
 * Load the current baseline from disk.
 *
 * @returns the baseline, or null if not found or invalid
 *
 * @example
 * ```ts
 * const baseline = await benchmark_baseline_load();
 * if (baseline) {
 *   console.log(`Baseline from ${baseline.timestamp}`);
 * }
 * ```
 */
export const benchmark_baseline_load = async (
	options: BenchmarkBaselineLoadOptions = {}
): Promise<BenchmarkBaseline | null> => {
	const base_path = options.path ?? DEFAULT_BASELINE_PATH;
	const filepath = join(base_path, BASELINE_FILENAME);

	if (!(await fs_exists(filepath))) {
		return null;
	}

	try {
		const contents = await readFile(filepath, 'utf-8');
		const parsed = JSON.parse(contents);
		const baseline = BenchmarkBaseline.parse(parsed);

		// Check version compatibility. Auto-delete on mismatch because the schema
		// shift (new required fields like `budget` / `outlier_ratio`) means we
		// can't usefully load the old file — but tell the caller what to do next,
		// since the failure mode is silent (the run continues, just without a
		// baseline comparison) and easy to miss in CI output.
		if (baseline.version !== BASELINE_VERSION) {
			// eslint-disable-next-line no-console
			console.warn(
				`Benchmark baseline version mismatch (got ${baseline.version}, expected ${
					BASELINE_VERSION
				}). Removing stale baseline: ${
					filepath
				}. Re-run with --save (or the consumer's equivalent flag) to seed a new baseline.`
			);
			await rm(filepath, { force: true });
			return null;
		}

		return baseline;
	} catch (error) {
		// eslint-disable-next-line no-console
		console.warn(
			`Invalid or corrupted benchmark baseline file. Removing: ${
				filepath
			}. Re-run with --save (or the consumer's equivalent flag) to seed a new baseline.`,
			error instanceof Error ? error.message : error
		);
		await rm(filepath, { force: true });
		return null;
	}
};

/**
 * Compare benchmark results against the stored baseline.
 *
 * @param options - comparison options including regression threshold and staleness warning
 * @returns comparison result with regressions, improvements, and unchanged tasks
 *
 * @example
 * ```ts
 * const bench = new Benchmark();
 * bench.add('test', () => fn());
 * await bench.run();
 *
 * const comparison = await benchmark_baseline_compare(bench.results(), {
 *   regression_threshold: 1.05, // Only flag regressions 5% or more slower
 *   staleness_warning_days: 7,  // Warn if baseline is older than 7 days
 * });
 * if (comparison.regressions.length > 0) {
 *   console.log('Performance regressions detected!');
 *   for (const r of comparison.regressions) {
 *     console.log(`  ${r.name}: ${r.comparison.speedup_ratio.toFixed(2)}x slower`);
 *   }
 *   process.exit(1);
 * }
 * ```
 */
export const benchmark_baseline_compare = async (
	results: Array<BenchmarkResult>,
	options: BenchmarkBaselineCompareOptions = {}
): Promise<BenchmarkBaselineComparisonResult> => {
	const baseline = await benchmark_baseline_load(options);
	const regression_threshold = options.regression_threshold ?? 1.0;
	// Calibrated for general system-noise contamination (thermal throttling,
	// background load). See `noise_warning_cv_threshold` doc for tuning notes.
	const noise_warning_cv_threshold = options.noise_warning_cv_threshold ?? 0.3;
	// 0.1 because well-behaved benchmarks with MAD outlier removal typically
	// sit well under 5% — 10% is a meaningful jump. The cleaner internally
	// re-cleans at 0.3 (`DEFAULT_OUTLIER_RATIO_HIGH`), so we fire well below
	// that threshold.
	const noise_warning_outlier_ratio_threshold =
		options.noise_warning_outlier_ratio_threshold ?? 0.1;

	if (!baseline) {
		return {
			baseline_found: false,
			baseline_timestamp: null,
			baseline_commit: null,
			baseline_age_days: null,
			baseline_stale: false,
			baseline_node_version: null,
			current_node_version: process.version,
			node_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
			new_tasks: results.map((r) => r.name),
			removed_tasks: []
		};
	}

	// Calculate baseline age
	const baseline_date = new Date(baseline.timestamp);
	const now = new Date();
	const baseline_age_days = (now.getTime() - baseline_date.getTime()) / (1000 * 60 * 60 * 24);
	const baseline_stale =
		options.staleness_warning_days !== undefined &&
		baseline_age_days > options.staleness_warning_days;

	const current_entries = results_to_entries(results);
	const baseline_map = new Map(baseline.entries.map((e) => [e.name, e]));
	const current_map = new Map(current_entries.map((e) => [e.name, e]));

	const comparisons: Array<BenchmarkBaselineTaskComparison> = [];
	const regressions: Array<BenchmarkBaselineTaskComparison> = [];
	const improvements: Array<BenchmarkBaselineTaskComparison> = [];
	const unchanged: Array<BenchmarkBaselineTaskComparison> = [];
	const methodology_changed: Array<BenchmarkBaselineTaskComparison> = [];
	const new_tasks: Array<string> = [];
	const removed_tasks: Array<string> = [];

	// Compare tasks that exist in both
	for (const current of current_entries) {
		const baseline_entry = baseline_map.get(current.name);
		if (!baseline_entry) {
			new_tasks.push(current.name);
			continue;
		}

		// Create minimal stats objects for comparison
		const baseline_stats: BenchmarkStatsComparable = {
			mean_ns: baseline_entry.mean_ns,
			std_dev_ns: baseline_entry.std_dev_ns,
			sample_size: baseline_entry.sample_size,
			confidence_interval_ns: stats_confidence_interval_from_summary(
				baseline_entry.mean_ns,
				baseline_entry.std_dev_ns,
				baseline_entry.sample_size
			)
		};
		const current_stats: BenchmarkStatsComparable = {
			mean_ns: current.mean_ns,
			std_dev_ns: current.std_dev_ns,
			sample_size: current.sample_size,
			confidence_interval_ns: stats_confidence_interval_from_summary(
				current.mean_ns,
				current.std_dev_ns,
				current.sample_size
			)
		};

		const comparison = benchmark_stats_compare(baseline_stats, current_stats, {
			min_percent_difference: options.min_percent_difference
		});

		const budget_diff = benchmark_budget_diff(baseline_entry.budget, current.budget);
		const is_methodology_changed = budget_diff.length > 0;

		// Recompute cv at comparison time from persisted `mean_ns` /
		// `std_dev_ns`. We don't persist `cv` directly because it's a pure
		// function of those two values — keeping it derived means older
		// baselines (which never wrote a `cv` field) work unchanged, and the
		// recomputation can't drift from the source values.
		const baseline_cv = stats_cv(baseline_entry.mean_ns, baseline_entry.std_dev_ns);
		const current_cv = stats_cv(current.mean_ns, current.std_dev_ns);
		// NaN-safe max: `Math.max(NaN, x) === NaN`, so a zero-mean side would
		// silently disable the warning. Treat NaN as 0 — a side with no mean
		// has no measurable noise to warn about.
		const max_cv = Math.max(
			Number.isFinite(baseline_cv) ? baseline_cv : 0,
			Number.isFinite(current_cv) ? current_cv : 0
		);
		const max_outlier_ratio = Math.max(baseline_entry.outlier_ratio, current.outlier_ratio);
		// OR-gate: cleaned cv catches noisy surviving distributions; outlier
		// ratio catches the case where the cleaning ate a lot of variance
		// before cv was computed (so cv looks tight but a third of the
		// iterations were tails).
		const noise_warning =
			max_cv >= noise_warning_cv_threshold ||
			max_outlier_ratio >= noise_warning_outlier_ratio_threshold;

		const task_comparison: BenchmarkBaselineTaskComparison = {
			name: current.name,
			baseline: baseline_entry,
			current,
			comparison,
			methodology_changed: is_methodology_changed,
			noise_warning,
			max_cv,
			max_outlier_ratio
		};

		// Methodology-changed tasks are routed to their own bucket and excluded
		// from `comparisons` — the Welch math is contaminated by sample-size or
		// warmup differences, and we don't want aggregate consumers of
		// `comparisons` accidentally folding in misleading numbers.
		if (is_methodology_changed) {
			methodology_changed.push(task_comparison);
			continue;
		}

		comparisons.push(task_comparison);

		// Categorize based on comparison result
		// Note: comparison.faster is 'a' (baseline) or 'b' (current)
		// significant implies percent_difference >= min_pct, which implies effect_magnitude !== 'negligible'
		if (comparison.significant) {
			if (comparison.faster === 'a') {
				// Baseline was faster = potential regression
				// Only count as regression if it exceeds the threshold
				if (comparison.speedup_ratio >= regression_threshold) {
					regressions.push(task_comparison);
				} else {
					unchanged.push(task_comparison);
				}
			} else if (comparison.faster === 'b') {
				// Current is faster = improvement
				improvements.push(task_comparison);
			} else {
				unchanged.push(task_comparison);
			}
		} else {
			unchanged.push(task_comparison);
		}
	}

	// Find removed tasks
	for (const baseline_entry of baseline.entries) {
		if (!current_map.has(baseline_entry.name)) {
			removed_tasks.push(baseline_entry.name);
		}
	}

	// Sort regressions and improvements by percentage difference (largest first)
	const sort_by_percent_difference = (
		a: BenchmarkBaselineTaskComparison,
		b: BenchmarkBaselineTaskComparison
	) => b.comparison.percent_difference - a.comparison.percent_difference;

	regressions.sort(sort_by_percent_difference);
	improvements.sort(sort_by_percent_difference);
	// Methodology-changed rows have a contaminated `comparison`, so sorting by
	// effect would be misleading. Sort by name for stable, diffable output —
	// use raw byte comparison rather than `localeCompare` so order is
	// locale-independent across developer machines and CI.
	methodology_changed.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

	return {
		baseline_found: true,
		baseline_timestamp: baseline.timestamp,
		baseline_commit: baseline.git_commit,
		baseline_age_days,
		baseline_stale,
		baseline_node_version: baseline.node_version,
		current_node_version: process.version,
		node_version_changed: baseline.node_version !== process.version,
		baseline_metadata: baseline.metadata ?? null,
		comparisons,
		regressions,
		improvements,
		unchanged,
		methodology_changed,
		new_tasks,
		removed_tasks
	};
};

/**
 * Format a baseline comparison result as a human-readable string.
 *
 * @param result - comparison result from `benchmark_baseline_compare`
 */
export const benchmark_baseline_format = (result: BenchmarkBaselineComparisonResult): string => {
	if (!result.baseline_found) {
		return 'No baseline found. Call benchmark_baseline_save() to create one.';
	}

	const lines: Array<string> = [];

	lines.push(`Comparing against baseline from ${result.baseline_timestamp}`);
	if (result.baseline_commit) {
		lines.push(`Baseline commit: ${result.baseline_commit.slice(0, 8)}`);
	}
	if (result.baseline_age_days !== null) {
		const age_str =
			result.baseline_age_days < 1
				? 'less than a day'
				: result.baseline_age_days < 2
					? '1 day'
					: `${Math.floor(result.baseline_age_days)} days`;
		lines.push(`Baseline age: ${age_str}${result.baseline_stale ? ' (STALE)' : ''}`);
	}
	if (result.node_version_changed && result.baseline_node_version) {
		lines.push(
			`Baseline node: ${result.baseline_node_version} → ${result.current_node_version} (CHANGED)`
		);
	}
	lines.push('');

	// Suffix appended to a per-task line when its measurement was noisy
	// enough that the Welch significance call should be read with skepticism.
	// Shows both signals (cv and outlier ratio) so the reader can judge
	// which one tripped — they answer different questions about noise.
	const noise_suffix = (r: BenchmarkBaselineTaskComparison): string =>
		r.noise_warning
			? ` ⚠ noisy (cv=${(r.max_cv * 100).toFixed(1)}%, outliers=${(
					r.max_outlier_ratio * 100
				).toFixed(1)}%)`
			: '';

	if (result.regressions.length > 0) {
		lines.push(`Regressions (${result.regressions.length}):`);
		for (const r of result.regressions) {
			const ratio = r.comparison.speedup_ratio.toFixed(2);
			const pct = (r.comparison.percent_difference * 100).toFixed(1);
			const p = r.comparison.p_value.toFixed(3);
			lines.push(
				`  ${r.name}: ${ratio}x slower (${pct}%, p=${p}, ${
					r.comparison.effect_magnitude
				})${noise_suffix(r)}`
			);
		}
		lines.push('');
	}

	if (result.improvements.length > 0) {
		lines.push(`Improvements (${result.improvements.length}):`);
		for (const r of result.improvements) {
			const ratio = r.comparison.speedup_ratio.toFixed(2);
			const pct = (r.comparison.percent_difference * 100).toFixed(1);
			const p = r.comparison.p_value.toFixed(3);
			lines.push(
				`  ${r.name}: ${ratio}x faster (${pct}%, p=${p}, ${
					r.comparison.effect_magnitude
				})${noise_suffix(r)}`
			);
		}
		lines.push('');
	}

	if (result.methodology_changed.length > 0) {
		lines.push(`Methodology changed (${result.methodology_changed.length}):`);
		for (const r of result.methodology_changed) {
			const diff = benchmark_budget_diff(r.baseline.budget, r.current.budget);
			const diff_str = diff.map((d) => `${d.field} ${d.baseline} → ${d.current}`).join(', ');
			lines.push(`  ${r.name}: ${diff_str}`);
		}
		lines.push('  (re-save baseline to surface any drift masked by methodology changes)');
		lines.push('');
	}

	if (result.unchanged.length > 0) {
		lines.push(`Unchanged (${result.unchanged.length}):`);
		for (const r of result.unchanged) {
			lines.push(`  ${r.name}`);
		}
		lines.push('');
	}

	if (result.new_tasks.length > 0) {
		lines.push(`New tasks (${result.new_tasks.length}): ${result.new_tasks.join(', ')}`);
	}

	if (result.removed_tasks.length > 0) {
		lines.push(
			`Removed tasks (${result.removed_tasks.length}): ${result.removed_tasks.join(', ')}`
		);
	}

	// Summary line. `total` is the count of cross-baseline tasks across all
	// four buckets — `comparisons` no longer includes methodology_changed.
	const total =
		result.regressions.length +
		result.improvements.length +
		result.unchanged.length +
		result.methodology_changed.length;
	const summary_parts: Array<string> = [];
	if (result.regressions.length > 0) summary_parts.push(`${result.regressions.length} regressions`);
	if (result.improvements.length > 0)
		summary_parts.push(`${result.improvements.length} improvements`);
	if (result.methodology_changed.length > 0)
		summary_parts.push(`${result.methodology_changed.length} methodology changed`);
	if (result.unchanged.length > 0) summary_parts.push(`${result.unchanged.length} unchanged`);

	lines.push('');
	// Guard against the empty-bucket case (e.g. every task new or removed) so
	// we don't print "Summary:  (0 total)" with a double space.
	const summary_text = summary_parts.length > 0 ? summary_parts.join(', ') : 'no comparable tasks';
	lines.push(`Summary: ${summary_text} (${total} total)`);

	return lines.join('\n');
};

/**
 * Format a baseline comparison result as JSON for programmatic consumption.
 *
 * @param result - comparison result from `benchmark_baseline_compare`
 */
export const benchmark_baseline_format_json = (
	result: BenchmarkBaselineComparisonResult,
	options: { pretty?: boolean } = {}
): string => {
	const output = {
		baseline_found: result.baseline_found,
		baseline_timestamp: result.baseline_timestamp,
		baseline_commit: result.baseline_commit,
		baseline_age_days: result.baseline_age_days,
		baseline_stale: result.baseline_stale,
		baseline_node_version: result.baseline_node_version,
		current_node_version: result.current_node_version,
		node_version_changed: result.node_version_changed,
		baseline_metadata: result.baseline_metadata,
		summary: {
			total:
				result.regressions.length +
				result.improvements.length +
				result.unchanged.length +
				result.methodology_changed.length,
			regressions: result.regressions.length,
			improvements: result.improvements.length,
			unchanged: result.unchanged.length,
			methodology_changed: result.methodology_changed.length,
			// Cross-bucket count so a CI pipeline can decide whether to flag a
			// run as needing rerun-on-quieter-hardware without iterating every
			// bucket. Excludes methodology_changed rows by design — they get
			// their own flag and a separate workflow.
			noise_warnings:
				result.regressions.filter((r) => r.noise_warning).length +
				result.improvements.filter((r) => r.noise_warning).length +
				result.unchanged.filter((r) => r.noise_warning).length,
			new_tasks: result.new_tasks.length,
			removed_tasks: result.removed_tasks.length
		},
		regressions: result.regressions.map((r) => ({
			name: r.name,
			speedup_ratio: r.comparison.speedup_ratio,
			percent_difference: r.comparison.percent_difference,
			effect_size: r.comparison.effect_size,
			effect_magnitude: r.comparison.effect_magnitude,
			p_value: r.comparison.p_value,
			baseline_mean_ns: r.baseline.mean_ns,
			current_mean_ns: r.current.mean_ns,
			noise_warning: r.noise_warning,
			max_cv: r.max_cv,
			max_outlier_ratio: r.max_outlier_ratio
		})),
		improvements: result.improvements.map((r) => ({
			name: r.name,
			speedup_ratio: r.comparison.speedup_ratio,
			percent_difference: r.comparison.percent_difference,
			effect_size: r.comparison.effect_size,
			effect_magnitude: r.comparison.effect_magnitude,
			p_value: r.comparison.p_value,
			baseline_mean_ns: r.baseline.mean_ns,
			current_mean_ns: r.current.mean_ns,
			noise_warning: r.noise_warning,
			max_cv: r.max_cv,
			max_outlier_ratio: r.max_outlier_ratio
		})),
		unchanged: result.unchanged.map((r) => r.name),
		methodology_changed: result.methodology_changed.map((r) => ({
			name: r.name,
			budget_diff: benchmark_budget_diff(r.baseline.budget, r.current.budget)
		})),
		new_tasks: result.new_tasks,
		removed_tasks: result.removed_tasks
	};

	return options.pretty ? JSON.stringify(output, null, '\t') : JSON.stringify(output);
};
