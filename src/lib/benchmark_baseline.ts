/**
 * Benchmark baseline storage and comparison utilities.
 * Save benchmark results to disk and compare against baselines for regression detection.
 */

import {readFile, writeFile, mkdir, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';

import {fs_exists} from './fs.js';
import {git_info_get} from './git.js';
import type {BenchmarkResult} from './benchmark_types.js';
import {
	benchmark_stats_compare,
	type BenchmarkComparison,
	type BenchmarkStatsComparable,
} from './benchmark_stats.js';
import {stats_confidence_interval_from_summary} from './stats.js';

// Version for forward compatibility - increment when schema changes
const BASELINE_VERSION = 1;

/**
 * Schema for a single benchmark entry in the baseline.
 */
export const BenchmarkBaselineEntry = z.object({
	name: z.string(),
	mean_ns: z.number(),
	median_ns: z.number(),
	std_dev_ns: z.number(),
	min_ns: z.number(),
	max_ns: z.number(),
	p75_ns: z.number(),
	p90_ns: z.number(),
	p95_ns: z.number(),
	p99_ns: z.number(),
	ops_per_second: z.number(),
	sample_size: z.number(),
});
export type BenchmarkBaselineEntry = z.infer<typeof BenchmarkBaselineEntry>;

/**
 * Schema for the complete baseline file.
 */
export const BenchmarkBaseline = z.object({
	version: z.number(),
	timestamp: z.string(),
	git_commit: z.string().nullable(),
	git_branch: z.string().nullable(),
	node_version: z.string(),
	entries: z.array(BenchmarkBaselineEntry),
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
	/** Individual task comparisons */
	comparisons: Array<BenchmarkBaselineTaskComparison>;
	/** Tasks that regressed (slower with statistical significance), sorted by effect size (largest first) */
	regressions: Array<BenchmarkBaselineTaskComparison>;
	/** Tasks that improved (faster with statistical significance), sorted by effect size (largest first) */
	improvements: Array<BenchmarkBaselineTaskComparison>;
	/** Tasks with no significant change */
	unchanged: Array<BenchmarkBaselineTaskComparison>;
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
	comparison: BenchmarkComparison;
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
		median_ns: r.stats.median_ns,
		std_dev_ns: r.stats.std_dev_ns,
		min_ns: r.stats.min_ns,
		max_ns: r.stats.max_ns,
		p75_ns: r.stats.p75_ns,
		p90_ns: r.stats.p90_ns,
		p95_ns: r.stats.p95_ns,
		p99_ns: r.stats.p99_ns,
		ops_per_second: r.stats.ops_per_second,
		sample_size: r.stats.sample_size,
	}));
};

/**
 * Save benchmark results as the current baseline.
 *
 * @param results - Benchmark results to save
 * @param options - Save options
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
	options: BenchmarkBaselineSaveOptions = {},
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
	};

	await mkdir(base_path, {recursive: true});
	const filepath = join(base_path, BASELINE_FILENAME);
	await writeFile(filepath, JSON.stringify(baseline, null, '\t'), 'utf-8');
};

/**
 * Load the current baseline from disk.
 *
 * @param options - Load options
 * @returns The baseline, or null if not found or invalid
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
	options: BenchmarkBaselineLoadOptions = {},
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

		// Check version compatibility
		if (baseline.version !== BASELINE_VERSION) {
			// eslint-disable-next-line no-console
			console.warn(
				`Benchmark baseline version mismatch (got ${baseline.version}, expected ${BASELINE_VERSION}). Removing stale baseline: ${filepath}`,
			);
			await rm(filepath, {force: true});
			return null;
		}

		return baseline;
	} catch (err) {
		// eslint-disable-next-line no-console
		console.warn(
			`Invalid or corrupted benchmark baseline file. Removing: ${filepath}`,
			err instanceof Error ? err.message : err,
		);
		await rm(filepath, {force: true});
		return null;
	}
};

/**
 * Compare benchmark results against the stored baseline.
 *
 * @param results - Current benchmark results
 * @param options - Comparison options including regression threshold and staleness warning
 * @returns Comparison result with regressions, improvements, and unchanged tasks
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
	options: BenchmarkBaselineCompareOptions = {},
): Promise<BenchmarkBaselineComparisonResult> => {
	const baseline = await benchmark_baseline_load(options);
	const regression_threshold = options.regression_threshold ?? 1.0;

	if (!baseline) {
		return {
			baseline_found: false,
			baseline_timestamp: null,
			baseline_commit: null,
			baseline_age_days: null,
			baseline_stale: false,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			new_tasks: results.map((r) => r.name),
			removed_tasks: [],
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
				baseline_entry.sample_size,
			),
		};
		const current_stats: BenchmarkStatsComparable = {
			mean_ns: current.mean_ns,
			std_dev_ns: current.std_dev_ns,
			sample_size: current.sample_size,
			confidence_interval_ns: stats_confidence_interval_from_summary(
				current.mean_ns,
				current.std_dev_ns,
				current.sample_size,
			),
		};

		const comparison = benchmark_stats_compare(baseline_stats, current_stats);

		const task_comparison: BenchmarkBaselineTaskComparison = {
			name: current.name,
			baseline: baseline_entry,
			current,
			comparison,
		};

		comparisons.push(task_comparison);

		// Categorize based on comparison result
		// Note: comparison.faster is 'a' (baseline) or 'b' (current)
		if (comparison.significant && comparison.effect_magnitude !== 'negligible') {
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

	// Sort regressions and improvements by effect size (largest first)
	const sort_by_effect_size = (
		a: BenchmarkBaselineTaskComparison,
		b: BenchmarkBaselineTaskComparison,
	) => b.comparison.effect_size - a.comparison.effect_size;

	regressions.sort(sort_by_effect_size);
	improvements.sort(sort_by_effect_size);

	return {
		baseline_found: true,
		baseline_timestamp: baseline.timestamp,
		baseline_commit: baseline.git_commit,
		baseline_age_days,
		baseline_stale,
		comparisons,
		regressions,
		improvements,
		unchanged,
		new_tasks,
		removed_tasks,
	};
};

/**
 * Format a baseline comparison result as a human-readable string.
 *
 * @param result - Comparison result from benchmark_baseline_compare
 * @returns Formatted string summary
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
	lines.push('');

	if (result.regressions.length > 0) {
		lines.push(`Regressions (${result.regressions.length}):`);
		for (const r of result.regressions) {
			const ratio = r.comparison.speedup_ratio.toFixed(2);
			const p = r.comparison.p_value.toFixed(3);
			lines.push(`  ${r.name}: ${ratio}x slower (p=${p}, ${r.comparison.effect_magnitude})`);
		}
		lines.push('');
	}

	if (result.improvements.length > 0) {
		lines.push(`Improvements (${result.improvements.length}):`);
		for (const r of result.improvements) {
			const ratio = r.comparison.speedup_ratio.toFixed(2);
			const p = r.comparison.p_value.toFixed(3);
			lines.push(`  ${r.name}: ${ratio}x faster (p=${p}, ${r.comparison.effect_magnitude})`);
		}
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
			`Removed tasks (${result.removed_tasks.length}): ${result.removed_tasks.join(', ')}`,
		);
	}

	// Summary line
	const total = result.comparisons.length;
	const summary_parts: Array<string> = [];
	if (result.regressions.length > 0) summary_parts.push(`${result.regressions.length} regressions`);
	if (result.improvements.length > 0)
		summary_parts.push(`${result.improvements.length} improvements`);
	if (result.unchanged.length > 0) summary_parts.push(`${result.unchanged.length} unchanged`);

	lines.push('');
	lines.push(`Summary: ${summary_parts.join(', ')} (${total} total)`);

	return lines.join('\n');
};

/**
 * Format a baseline comparison result as JSON for programmatic consumption.
 *
 * @param result - Comparison result from benchmark_baseline_compare
 * @param options - Formatting options
 * @returns JSON string
 */
export const benchmark_baseline_format_json = (
	result: BenchmarkBaselineComparisonResult,
	options: {pretty?: boolean} = {},
): string => {
	const output = {
		baseline_found: result.baseline_found,
		baseline_timestamp: result.baseline_timestamp,
		baseline_commit: result.baseline_commit,
		baseline_age_days: result.baseline_age_days,
		baseline_stale: result.baseline_stale,
		summary: {
			total: result.comparisons.length,
			regressions: result.regressions.length,
			improvements: result.improvements.length,
			unchanged: result.unchanged.length,
			new_tasks: result.new_tasks.length,
			removed_tasks: result.removed_tasks.length,
		},
		regressions: result.regressions.map((r) => ({
			name: r.name,
			speedup_ratio: r.comparison.speedup_ratio,
			effect_size: r.comparison.effect_size,
			effect_magnitude: r.comparison.effect_magnitude,
			p_value: r.comparison.p_value,
			baseline_mean_ns: r.baseline.mean_ns,
			current_mean_ns: r.current.mean_ns,
		})),
		improvements: result.improvements.map((r) => ({
			name: r.name,
			speedup_ratio: r.comparison.speedup_ratio,
			effect_size: r.comparison.effect_size,
			effect_magnitude: r.comparison.effect_magnitude,
			p_value: r.comparison.p_value,
			baseline_mean_ns: r.baseline.mean_ns,
			current_mean_ns: r.current.mean_ns,
		})),
		unchanged: result.unchanged.map((r) => r.name),
		new_tasks: result.new_tasks,
		removed_tasks: result.removed_tasks,
	};

	return options.pretty ? JSON.stringify(output, null, '\t') : JSON.stringify(output);
};
