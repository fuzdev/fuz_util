import type {BenchmarkResult, BenchmarkGroup} from './benchmark_types.js';
import {time_unit_detect_best, time_format, TIME_UNIT_DISPLAY} from './time.js';
import {string_display_width, pad_width} from './string.js';
import {format_number} from './maths.js';

/**
 * Format results as an ASCII table with percentiles, min/max, and relative performance.
 * All times use the same unit for easy comparison.
 * @param results - Array of benchmark results
 * @returns Formatted table string with enhanced metrics
 *
 * @example
 * ```ts
 * console.log(benchmark_format_table(results));
 * // ┌─────────────┬────────────┬────────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
 * // │ Task Name   │  ops/sec   │ median(μs) │ p75 (μs) │ p90 (μs) │ p95 (μs) │ p99 (μs) │ min (μs) │ max (μs) │ vs Best  │
 * // ├─────────────┼────────────┼────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
 * // │ slugify v2  │ 1,237,144  │    0.81    │   0.85   │   0.89   │   0.95   │   1.20   │   0.72   │    2.45  │ baseline │
 * // │ slugify     │   261,619  │    3.82    │   3.95   │   4.12   │   4.35   │   5.10   │   3.21   │   12.45  │   4.73x  │
 * // └─────────────┴────────────┴────────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
 * ```
 */
export const benchmark_format_table = (results: Array<BenchmarkResult>): string => {
	if (results.length === 0) return '(no results)';

	// Detect best unit for all results
	const mean_times = results.map((r) => r.stats.mean_ns);
	const unit = time_unit_detect_best(mean_times);
	const unit_str = TIME_UNIT_DISPLAY[unit];

	// Find fastest for relative comparison
	const fastest_ops = Math.max(...results.map((r) => r.stats.ops_per_second));

	const rows: Array<Array<string>> = [];

	// Header with unit
	rows.push([
		'Task Name',
		'ops/sec',
		`median (${unit_str})`,
		`p75 (${unit_str})`,
		`p90 (${unit_str})`,
		`p95 (${unit_str})`,
		`p99 (${unit_str})`,
		`min (${unit_str})`,
		`max (${unit_str})`,
		'vs Best',
	]);

	// Data rows - all use same unit
	results.forEach((r) => {
		const ops_sec = benchmark_format_number(r.stats.ops_per_second, 2);
		const median = time_format(r.stats.median_ns, unit, 2).replace(unit_str, '').trim();
		const p75 = time_format(r.stats.p75_ns, unit, 2).replace(unit_str, '').trim();
		const p90 = time_format(r.stats.p90_ns, unit, 2).replace(unit_str, '').trim();
		const p95 = time_format(r.stats.p95_ns, unit, 2).replace(unit_str, '').trim();
		const p99 = time_format(r.stats.p99_ns, unit, 2).replace(unit_str, '').trim();
		const min = time_format(r.stats.min_ns, unit, 2).replace(unit_str, '').trim();
		const max = time_format(r.stats.max_ns, unit, 2).replace(unit_str, '').trim();

		// Calculate relative performance
		const ratio = fastest_ops / r.stats.ops_per_second;
		const vs_best = ratio === 1.0 ? 'baseline' : `${ratio.toFixed(2)}x`;

		rows.push([r.name, ops_sec, median, p75, p90, p95, p99, min, max, vs_best]);
	});

	// Calculate column widths (using display width for proper emoji handling)
	const widths = rows[0]!.map((_, col_i) => {
		return Math.max(...rows.map((row) => string_display_width(row[col_i]!)));
	});

	// Build table
	const lines: Array<string> = [];

	// Top border
	lines.push('┌' + widths.map((w) => '─'.repeat(w + 2)).join('┬') + '┐');

	// Header
	const header = rows[0]!.map((cell, i) => ' ' + pad_width(cell, widths[i]!) + ' ').join('│');
	lines.push('│' + header + '│');

	// Header separator
	lines.push('├' + widths.map((w) => '─'.repeat(w + 2)).join('┼') + '┤');

	// Data rows
	for (let i = 1; i < rows.length; i++) {
		const row = rows[i]!.map((cell, col_i) => {
			const width = widths[col_i]!;
			// Left-align task name, right-align numbers
			if (col_i === 0) {
				return ' ' + pad_width(cell, width, 'left') + ' ';
			} else {
				return ' ' + pad_width(cell, width, 'right') + ' ';
			}
		}).join('│');
		lines.push('│' + row + '│');
	}

	// Bottom border
	lines.push('└' + widths.map((w) => '─'.repeat(w + 2)).join('┴') + '┘');

	return lines.join('\n');
};

/**
 * Format results as a Markdown table with key metrics.
 * All times use the same unit for easy comparison.
 * @param results - Array of benchmark results
 * @returns Formatted markdown table string
 *
 * @example
 * ```ts
 * console.log(benchmark_format_markdown(results));
 * // | Task Name  | ops/sec    | median (μs) | p75 (μs) | p90 (μs) | p95 (μs) | p99 (μs) | min (μs) | max (μs) | vs Best  |
 * // |------------|------------|-------------|----------|----------|----------|----------|----------|----------|----------|
 * // | slugify v2 | 1,237,144  | 0.81        | 0.85     | 0.89     | 0.95     | 1.20     | 0.72     | 2.45     | baseline |
 * // | slugify    |   261,619  | 3.82        | 3.95     | 4.12     | 4.35     | 5.10     | 3.21     | 12.45    | 4.73x    |
 * ```
 */
export const benchmark_format_markdown = (results: Array<BenchmarkResult>): string => {
	if (results.length === 0) return '(no results)';

	// Detect best unit for all results
	const mean_times = results.map((r) => r.stats.mean_ns);
	const unit = time_unit_detect_best(mean_times);
	const unit_str = TIME_UNIT_DISPLAY[unit];

	// Find fastest for relative comparison
	const fastest_ops = Math.max(...results.map((r) => r.stats.ops_per_second));

	const rows: Array<Array<string>> = [];

	// Header with unit
	rows.push([
		'Task Name',
		'ops/sec',
		`median (${unit_str})`,
		`p75 (${unit_str})`,
		`p90 (${unit_str})`,
		`p95 (${unit_str})`,
		`p99 (${unit_str})`,
		`min (${unit_str})`,
		`max (${unit_str})`,
		'vs Best',
	]);

	// Data rows - all use same unit
	results.forEach((r) => {
		const ops_sec = benchmark_format_number(r.stats.ops_per_second, 2);
		const median = time_format(r.stats.median_ns, unit, 2).replace(unit_str, '').trim();
		const p75 = time_format(r.stats.p75_ns, unit, 2).replace(unit_str, '').trim();
		const p90 = time_format(r.stats.p90_ns, unit, 2).replace(unit_str, '').trim();
		const p95 = time_format(r.stats.p95_ns, unit, 2).replace(unit_str, '').trim();
		const p99 = time_format(r.stats.p99_ns, unit, 2).replace(unit_str, '').trim();
		const min = time_format(r.stats.min_ns, unit, 2).replace(unit_str, '').trim();
		const max = time_format(r.stats.max_ns, unit, 2).replace(unit_str, '').trim();

		// Calculate relative performance
		const ratio = fastest_ops / r.stats.ops_per_second;
		const vs_best = ratio === 1.0 ? 'baseline' : `${ratio.toFixed(2)}x`;

		rows.push([r.name, ops_sec, median, p75, p90, p95, p99, min, max, vs_best]);
	});

	// Calculate column widths
	const widths = rows[0]!.map((_, col_i) => {
		return Math.max(...rows.map((row) => row[col_i]!.length));
	});

	// Build table
	const lines: Array<string> = [];

	// Header
	const header = rows[0]!.map((cell, i) => cell.padEnd(widths[i]!)).join(' | ');
	lines.push('| ' + header + ' |');

	// Separator
	const separator = widths.map((w) => '-'.repeat(w)).join(' | ');
	lines.push('| ' + separator + ' |');

	// Data rows
	for (let i = 1; i < rows.length; i++) {
		const row = rows[i]!.map((cell, col_i) => {
			const width = widths[col_i]!;
			// Right-align numbers, left-align names
			if (col_i === 0) {
				return cell.padEnd(width);
			} else {
				return cell.padStart(width);
			}
		}).join(' | ');
		lines.push('| ' + row + ' |');
	}

	return lines.join('\n');
};

export interface BenchmarkFormatJsonOptions {
	/** Whether to pretty-print (default: true) */
	pretty?: boolean;
	/** Whether to include raw timings array (default: false, can be large) */
	include_timings?: boolean;
}

/**
 * Format results as JSON.
 * @param results - Array of benchmark results
 * @param options - Formatting options
 * @returns JSON string
 *
 * @example
 * ```ts
 * console.log(format_json(results));
 * console.log(format_json(results, {pretty: false}));
 * console.log(format_json(results, {include_timings: true}));
 * ```
 */
export const benchmark_format_json = (
	results: Array<BenchmarkResult>,
	options?: BenchmarkFormatJsonOptions,
): string => {
	const pretty = options?.pretty ?? true;
	const include_timings = options?.include_timings ?? false;
	// Flatten stats into result object for easier consumption
	const flattened = results.map((r) => ({
		name: r.name,
		iterations: r.iterations,
		total_time_ms: r.total_time_ms,
		ops_per_second: r.stats.ops_per_second,
		mean_ns: r.stats.mean_ns,
		median_ns: r.stats.median_ns,
		std_dev_ns: r.stats.std_dev_ns,
		min_ns: r.stats.min_ns,
		max_ns: r.stats.max_ns,
		p75_ns: r.stats.p75_ns,
		p90_ns: r.stats.p90_ns,
		p95_ns: r.stats.p95_ns,
		p99_ns: r.stats.p99_ns,
		cv: r.stats.cv,
		confidence_interval_ns: r.stats.confidence_interval_ns,
		outliers: r.stats.outliers_ns.length,
		outlier_ratio: r.stats.outlier_ratio,
		sample_size: r.stats.sample_size,
		raw_sample_size: r.stats.raw_sample_size,
		failed_iterations: r.stats.failed_iterations,
		...(include_timings ? {timings_ns: r.timings_ns} : {}),
	}));

	return pretty ? JSON.stringify(flattened, null, 2) : JSON.stringify(flattened);
};

/**
 * Format results as a grouped table with visual separators between groups.
 * @param results - Array of benchmark results
 * @param groups - Array of group definitions
 * @returns Formatted table string with group separators
 *
 * @example
 * ```ts
 * const groups = [
 *   { name: 'FAST PATHS', filter: (r) => r.name.includes('fast') },
 *   { name: 'SLOW PATHS', filter: (r) => r.name.includes('slow') },
 * ];
 * console.log(benchmark_format_table_grouped(results, groups));
 * // 📦 FAST PATHS
 * // ┌────┬─────────────┬────────────┬...┐
 * // │ 🐆 │ fast test 1 │ 1,237,144  │...│
 * // │ 🐇 │ fast test 2 │   261,619  │...│
 * // └────┴─────────────┴────────────┴...┘
 * //
 * // 📦 SLOW PATHS
 * // ┌────┬─────────────┬────────────┬...┐
 * // │ 🐢 │ slow test 1 │    10,123  │...│
 * // └────┴─────────────┴────────────┴...┘
 * ```
 */
export const benchmark_format_table_grouped = (
	results: Array<BenchmarkResult>,
	groups: Array<BenchmarkGroup>,
): string => {
	if (results.length === 0) return '(no results)';

	const sections: Array<string> = [];

	for (const group of groups) {
		const group_results = results.filter(group.filter);
		if (group_results.length === 0) continue;

		// Add group header and table
		const header = group.description
			? `\n📦 ${group.name}\n   ${group.description}`
			: `\n📦 ${group.name}`;
		sections.push(header);
		sections.push(benchmark_format_table(group_results));
	}

	// Handle ungrouped results (those that don't match any group)
	const grouped_names = new Set(groups.flatMap((g) => results.filter(g.filter).map((r) => r.name)));
	const ungrouped = results.filter((r) => !grouped_names.has(r.name));

	if (ungrouped.length > 0) {
		sections.push('\n📦 Other');
		sections.push(benchmark_format_table(ungrouped));
	}

	return sections.join('\n');
};

/**
 * Format a number with fixed decimal places and thousands separators.
 * @see {@link format_number} in maths.ts for the underlying implementation.
 */
export const benchmark_format_number = format_number;
