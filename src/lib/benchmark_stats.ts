/**
 * Benchmark-specific statistical analysis.
 * Uses the general stats utilities from stats.ts for timing/performance analysis.
 * All timing values are in nanoseconds.
 */

import {TIME_NS_PER_SEC, time_format_adaptive} from './time.js';
import {
	stats_mean,
	stats_median,
	stats_std_dev,
	stats_percentile,
	stats_cv,
	stats_min_max,
	stats_confidence_interval,
	stats_outliers_mad,
	stats_welch_t_test,
	stats_t_distribution_p_value,
} from './stats.js';

/**
 * Minimal stats interface for comparison.
 * This allows comparing stats from different sources (e.g., loaded baselines).
 */
export interface BenchmarkStatsComparable {
	mean_ns: number;
	std_dev_ns: number;
	sample_size: number;
	confidence_interval_ns: [number, number];
}

/**
 * Effect size magnitude interpretation (Cohen's d).
 */
export type EffectMagnitude = 'negligible' | 'small' | 'medium' | 'large';

/**
 * Result from comparing two benchmark stats.
 */
export interface BenchmarkComparison {
	/** Which benchmark is faster ('a', 'b', or 'equal' if difference is negligible) */
	faster: 'a' | 'b' | 'equal';
	/** How much faster the winner is (e.g., 1.5 means 1.5x faster) */
	speedup_ratio: number;
	/** Whether the difference is statistically significant at the given alpha */
	significant: boolean;
	/** P-value from Welch's t-test (lower = more confident the difference is real) */
	p_value: number;
	/** Cohen's d effect size (magnitude of difference independent of sample size) */
	effect_size: number;
	/** Interpretation of effect size */
	effect_magnitude: EffectMagnitude;
	/** Whether the 95% confidence intervals overlap */
	ci_overlap: boolean;
	/** Human-readable interpretation of the comparison */
	recommendation: string;
}

/**
 * Options for benchmark comparison.
 */
export interface BenchmarkCompareOptions {
	/** Significance level for hypothesis testing (default: 0.05) */
	alpha?: number;
}

/**
 * Complete statistical analysis of timing measurements.
 * Includes outlier detection, descriptive statistics, and performance metrics.
 * All timing values are in nanoseconds.
 */
export class BenchmarkStats {
	/** Mean (average) time in nanoseconds */
	readonly mean_ns: number;
	/** 50th percentile (median) time in nanoseconds */
	readonly p50_ns: number;
	/** Standard deviation in nanoseconds */
	readonly std_dev_ns: number;
	/** Minimum time in nanoseconds */
	readonly min_ns: number;
	/** Maximum time in nanoseconds */
	readonly max_ns: number;
	/** 75th percentile in nanoseconds */
	readonly p75_ns: number;
	/** 90th percentile in nanoseconds */
	readonly p90_ns: number;
	/** 95th percentile in nanoseconds */
	readonly p95_ns: number;
	/** 99th percentile in nanoseconds */
	readonly p99_ns: number;
	/** Coefficient of variation (std_dev / mean) */
	readonly cv: number;
	/** 95% confidence interval for the mean in nanoseconds */
	readonly confidence_interval_ns: [number, number];
	/** Array of detected outlier values in nanoseconds */
	readonly outliers_ns: Array<number>;
	/** Ratio of outliers to total samples */
	readonly outlier_ratio: number;
	/** Number of samples after outlier removal */
	readonly sample_size: number;
	/** Original number of samples (before outlier removal) */
	readonly raw_sample_size: number;
	/** Operations per second (NS_PER_SEC / mean_ns) */
	readonly ops_per_second: number;
	/** Number of failed iterations (NaN, Infinity, or negative values) */
	readonly failed_iterations: number;

	constructor(timings_ns: Array<number>) {
		// Filter out invalid values (NaN, Infinity, negative)
		const valid_timings: Array<number> = [];
		let failed_count = 0;

		for (const t of timings_ns) {
			if (!isNaN(t) && isFinite(t) && t > 0) {
				valid_timings.push(t);
			} else {
				failed_count++;
			}
		}

		this.failed_iterations = failed_count;
		this.raw_sample_size = timings_ns.length;

		// If no valid timings, return empty stats
		if (valid_timings.length === 0) {
			this.mean_ns = NaN;
			this.p50_ns = NaN;
			this.std_dev_ns = NaN;
			this.min_ns = NaN;
			this.max_ns = NaN;
			this.p75_ns = NaN;
			this.p90_ns = NaN;
			this.p95_ns = NaN;
			this.p99_ns = NaN;
			this.cv = NaN;
			this.confidence_interval_ns = [NaN, NaN];
			this.outliers_ns = [];
			this.outlier_ratio = 0;
			this.sample_size = 0;
			this.ops_per_second = 0;
			return;
		}

		// Detect and remove outliers
		const {cleaned, outliers} = stats_outliers_mad(valid_timings);
		const sorted_cleaned = [...cleaned].sort((a, b) => a - b);

		this.outliers_ns = outliers;
		this.outlier_ratio = outliers.length / valid_timings.length;
		this.sample_size = cleaned.length;

		// Calculate statistics on cleaned data
		this.mean_ns = stats_mean(cleaned);
		this.p50_ns = stats_median(sorted_cleaned);
		this.std_dev_ns = stats_std_dev(cleaned, this.mean_ns);

		const {min, max} = stats_min_max(sorted_cleaned);
		this.min_ns = min;
		this.max_ns = max;

		this.p75_ns = stats_percentile(sorted_cleaned, 0.75);
		this.p90_ns = stats_percentile(sorted_cleaned, 0.9);
		this.p95_ns = stats_percentile(sorted_cleaned, 0.95);
		this.p99_ns = stats_percentile(sorted_cleaned, 0.99);

		this.cv = stats_cv(this.mean_ns, this.std_dev_ns);
		this.confidence_interval_ns = stats_confidence_interval(cleaned);

		// Calculate throughput (operations per second)
		this.ops_per_second = this.mean_ns > 0 ? TIME_NS_PER_SEC / this.mean_ns : 0;
	}

	/**
	 * Format stats as a human-readable string.
	 */
	toString(): string {
		return `BenchmarkStats(mean=${time_format_adaptive(this.mean_ns)}, ops/sec=${this.ops_per_second.toFixed(2)}, cv=${(this.cv * 100).toFixed(1)}%, samples=${this.sample_size})`;
	}
}

/**
 * Compare two benchmark results for statistical significance.
 * Uses Welch's t-test (handles unequal variances) and Cohen's d effect size.
 *
 * @param a - First benchmark stats (or any object with required properties)
 * @param b - Second benchmark stats (or any object with required properties)
 * @param options - Comparison options
 * @returns Comparison result with significance, effect size, and recommendation
 *
 * @example
 * ```ts
 * const comparison = benchmark_stats_compare(result_a.stats, result_b.stats);
 * if (comparison.significant) {
 *   console.log(`${comparison.faster} is ${comparison.speedup_ratio.toFixed(2)}x faster`);
 * }
 * ```
 */
export const benchmark_stats_compare = (
	a: BenchmarkStatsComparable,
	b: BenchmarkStatsComparable,
	options?: BenchmarkCompareOptions,
): BenchmarkComparison => {
	const alpha = options?.alpha ?? 0.05;

	// Handle edge cases
	if (a.sample_size === 0 || b.sample_size === 0) {
		return {
			faster: 'equal',
			speedup_ratio: 1,
			significant: false,
			p_value: 1,
			effect_size: 0,
			effect_magnitude: 'negligible',
			ci_overlap: true,
			recommendation: 'Insufficient data for comparison',
		};
	}

	// Calculate speedup ratio (lower time = faster, so compare by time not ops/sec)
	const speedup_ratio = a.mean_ns < b.mean_ns ? b.mean_ns / a.mean_ns : a.mean_ns / b.mean_ns;
	const faster: 'a' | 'b' | 'equal' =
		a.mean_ns < b.mean_ns ? 'a' : a.mean_ns > b.mean_ns ? 'b' : 'equal';

	// Welch's t-test (handles unequal variances)
	// Special case: if both have zero variance, t-test is undefined
	let p_value: number;
	if (a.std_dev_ns === 0 && b.std_dev_ns === 0) {
		// When there's no variance, any difference is 100% reliable (p=0) or identical (p=1)
		p_value = a.mean_ns === b.mean_ns ? 1 : 0;
	} else {
		const {t_statistic, degrees_of_freedom} = stats_welch_t_test(
			a.mean_ns,
			a.std_dev_ns,
			a.sample_size,
			b.mean_ns,
			b.std_dev_ns,
			b.sample_size,
		);
		// Calculate two-tailed p-value using t-distribution approximation
		p_value = stats_t_distribution_p_value(Math.abs(t_statistic), degrees_of_freedom);
	}

	// Cohen's d effect size
	const pooled_std_dev = Math.sqrt(
		((a.sample_size - 1) * a.std_dev_ns ** 2 + (b.sample_size - 1) * b.std_dev_ns ** 2) /
			(a.sample_size + b.sample_size - 2),
	);

	// When pooled_std_dev is 0 but means differ, effect is maximal (infinite)
	// When means are equal, effect is 0
	let effect_size: number;
	let effect_magnitude: EffectMagnitude;

	if (pooled_std_dev === 0) {
		// Zero variance case - if means differ, it's a definitive difference
		if (a.mean_ns === b.mean_ns) {
			effect_size = 0;
			effect_magnitude = 'negligible';
		} else {
			// Any difference is 100% reliable when there's no variance
			effect_size = Infinity;
			effect_magnitude = 'large';
		}
	} else {
		effect_size = Math.abs(a.mean_ns - b.mean_ns) / pooled_std_dev;
		// Interpret effect size (Cohen's conventions)
		effect_magnitude =
			effect_size < 0.2
				? 'negligible'
				: effect_size < 0.5
					? 'small'
					: effect_size < 0.8
						? 'medium'
						: 'large';
	}

	// Check confidence interval overlap
	const ci_overlap =
		a.confidence_interval_ns[0] <= b.confidence_interval_ns[1] &&
		b.confidence_interval_ns[0] <= a.confidence_interval_ns[1];

	// Determine significance
	const significant = p_value < alpha;

	// Generate recommendation
	let recommendation: string;
	if (!significant) {
		recommendation =
			effect_magnitude === 'negligible'
				? 'No meaningful difference detected'
				: `Difference not statistically significant (p=${p_value.toFixed(3)}), but effect size suggests ${effect_magnitude} practical difference`;
	} else if (effect_magnitude === 'negligible') {
		recommendation = `Statistically significant but negligible practical difference (${speedup_ratio.toFixed(2)}x)`;
	} else {
		recommendation = `${faster === 'a' ? 'First' : 'Second'} is ${speedup_ratio.toFixed(2)}x faster with ${effect_magnitude} effect size (p=${p_value.toFixed(3)})`;
	}

	// Adjust 'faster' to 'equal' if effect is negligible
	const adjusted_faster = effect_magnitude === 'negligible' ? 'equal' : faster;

	return {
		faster: adjusted_faster,
		speedup_ratio,
		significant,
		p_value,
		effect_size,
		effect_magnitude,
		ci_overlap,
		recommendation,
	};
};
