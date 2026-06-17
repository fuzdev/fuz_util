/**
 * Benchmark-specific statistical analysis.
 * Uses the general stats utilities from `stats.ts` for timing/performance analysis.
 * All timing values are in nanoseconds.
 *
 * @module
 */

import {TIME_NS_PER_SEC, time_format_adaptive} from './time.ts';
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
} from './stats.ts';

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
	/** Whether the difference is both statistically and practically significant */
	significant: boolean;
	/** P-value from Welch's t-test (lower = more confident the difference is real) */
	p_value: number;
	/** Percentage difference between means as a ratio (0.05 = 5%, 1.0 = 100%) */
	percent_difference: number;
	/** Cohen's d effect size (informational — not used for classification) */
	effect_size: number;
	/** Interpretation of practical significance based on percentage difference */
	effect_magnitude: EffectMagnitude;
	/**
	 * Whether the 95% confidence intervals of the two means overlap.
	 *
	 * **Informational only — do not use this field to infer significance.**
	 * Two means with overlapping 95% CIs can still differ significantly at
	 * p<0.05 (overlap of up to ~25% of CI width is consistent with
	 * significance); conversely, non-overlapping CIs are slightly *stronger*
	 * than the standard p<0.05 bar but the relationship is not strict.
	 * Use `significant` and `p_value` for classification. This field is
	 * exposed for consumers who want to render CIs side-by-side and need
	 * the visual overlap check.
	 *
	 * Note: the underlying CIs are computed with a z-score (1.96) rather
	 * than the strict t-score, so at small n the CIs are slightly narrow
	 * — overlap is reported less often than a t-based CI would. Effect is
	 * ~2-3% at the n=30 floor after Bessel's correction on `std_dev_ns`.
	 */
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
	/**
	 * Minimum percentage difference to consider practically meaningful, as a ratio.
	 * Below this threshold, differences are classified as 'negligible' and
	 * `significant` is forced to `false`, regardless of p-value.
	 * This prevents the t-test's oversensitivity at large sample sizes from
	 * flagging system-level noise (thermal throttle, OS scheduler, cache pressure)
	 * as meaningful differences.
	 *
	 * Effect magnitude thresholds scale from this value:
	 * negligible < min, small < min*3, medium < min*5, large >= min*5.
	 *
	 * Default: 0.10 (10%).
	 */
	min_percent_difference?: number;
}

/**
 * Complete statistical analysis of timing measurements.
 * Includes outlier detection, descriptive statistics, and performance metrics.
 * All timing values are in nanoseconds.
 *
 * **Outliers are treated asymmetrically**, because high and low outliers in
 * timing data mean different things:
 *
 * - Upper-tail order statistics (`max_ns`, `p75_ns`–`p99_ns`) are computed over
 *   the **raw** valid timings — high outliers (GC pauses, slow paths) are real
 *   latency events, so the tail stays honest and p99 reflects real events
 *   rather than a pre-stripped distribution.
 * - `min_ns` is computed over the **MAD-cleaned** timings — nothing runs faster
 *   than its true cost, so a low outlier is an invalid measurement, not a fast
 *   run, and reporting it as the best case would mislead.
 * - Central-tendency statistics (`mean_ns`, `std_dev_ns`, `cv`,
 *   `confidence_interval_ns`, `ops_per_second`) are computed over the
 *   **MAD-cleaned** timings so the Welch's-t comparison keeps a stable mean.
 *
 * `p50_ns` (median) uses raw timings to stay paired with the percentile family;
 * being robust, it's unaffected in practice. `outlier_ratio` reports how heavy
 * the tail was either way. `sample_size` is the cleaned count behind central
 * tendency and `min_ns`; the upper-tail order statistics use all valid timings
 * (`sample_size` + `outliers_ns.length`); `raw_sample_size` is the total input
 * count including the `failed_iterations` invalid values that were filtered out.
 */
export class BenchmarkStats {
	/** Mean (average) time in nanoseconds (over MAD-cleaned samples) */
	readonly mean_ns: number;
	/** 50th percentile (median) time in nanoseconds (over raw samples) */
	readonly p50_ns: number;
	/** Standard deviation in nanoseconds (over MAD-cleaned samples) */
	readonly std_dev_ns: number;
	/** Minimum time in nanoseconds (over MAD-cleaned samples) */
	readonly min_ns: number;
	/** Maximum time in nanoseconds (over raw samples) */
	readonly max_ns: number;
	/** 75th percentile in nanoseconds (over raw samples) */
	readonly p75_ns: number;
	/** 90th percentile in nanoseconds (over raw samples) */
	readonly p90_ns: number;
	/** 95th percentile in nanoseconds (over raw samples) */
	readonly p95_ns: number;
	/** 99th percentile in nanoseconds (over raw samples) */
	readonly p99_ns: number;
	/** Coefficient of variation (std_dev / mean) */
	readonly cv: number;
	/** 95% confidence interval for the mean in nanoseconds */
	readonly confidence_interval_ns: [number, number];
	/** Array of detected outlier values in nanoseconds */
	readonly outliers_ns: Array<number>;
	/** Ratio of outliers to total samples */
	readonly outlier_ratio: number;
	/** Number of valid samples after outlier removal (population for central tendency and `min_ns`) */
	readonly sample_size: number;
	/** Number of input samples before filtering invalid/outlier values */
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
			if (isFinite(t) && t > 0) {
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

		// Detect outliers once; how each statistic uses the result depends on
		// what an outlier physically means at that tail.
		const {cleaned, outliers} = stats_outliers_mad(valid_timings);

		this.outliers_ns = outliers;
		this.outlier_ratio = outliers.length / valid_timings.length;
		this.sample_size = cleaned.length;

		// High and low outliers in timing data come from different processes,
		// so the three statistic families treat them differently:
		//
		// - Central tendency (mean, std_dev, cv, CI, ops/sec): MAD-cleaned set,
		//   so a GC pause doesn't drag the mean around and Welch's-t in
		//   `benchmark_stats_compare` keeps a stable mean/variance estimate.
		// - Upper-tail order statistics (max, p75-p99): RAW valid timings. High
		//   outliers are real latency events — a GC pause or slow path is part
		//   of the true distribution, and pre-stripping the tail before
		//   measuring a tail percentile defeats the purpose of p99 (a slow
		//   server's tail *is* the signal, not noise to discard).
		// - min: MAD-cleaned set. Nothing runs faster than its true cost, so a
		//   low outlier is an invalid measurement (dead-code elimination, a
		//   skipped iteration, timer quantization), not a fast run — reporting
		//   it as the best case would be a lie. Low outliers can't reach
		//   max/p75-p99, so those stay raw for free; only min and (negligibly,
		//   since the median is robust) p50 ever see them.
		//
		// The `stats_*` helpers each sort/scan internally, so there is no
		// pre-sort here; `outlier_ratio` reports how heavy the tail was either
		// way.

		// `stats_std_dev` returns the *population* std_dev (divides by n). For
		// benchmark use we need the *sample* std_dev (Bessel's correction,
		// divides by n-1): Welch's t-test in `benchmark_stats_compare` treats
		// `std_dev_ns` as the sample-variance estimator of a hypothetical
		// population of all possible runs. The general utility stays
		// population-style so non-benchmark callers aren't surprised; we apply
		// the correction once here and use the result for std_dev_ns, cv, and
		// the CI margin.
		this.mean_ns = stats_mean(cleaned);
		const std_dev_population = stats_std_dev(cleaned, this.mean_ns);
		const bessel = cleaned.length >= 2 ? Math.sqrt(cleaned.length / (cleaned.length - 1)) : 1;
		this.std_dev_ns = std_dev_population * bessel;

		this.min_ns = stats_min_max(cleaned).min;
		this.max_ns = stats_min_max(valid_timings).max;

		this.p50_ns = stats_median(valid_timings);
		this.p75_ns = stats_percentile(valid_timings, 0.75);
		this.p90_ns = stats_percentile(valid_timings, 0.9);
		this.p95_ns = stats_percentile(valid_timings, 0.95);
		this.p99_ns = stats_percentile(valid_timings, 0.99);

		this.cv = stats_cv(this.mean_ns, this.std_dev_ns);
		// `stats_confidence_interval` internally uses the same population
		// std_dev, so scale the half-width by the Bessel factor to keep CI
		// consistent with the sample-corrected std_dev_ns. (Note: z-score is
		// still used here, not t-score — at the n=30 floor the residual
		// narrowness vs. t is ~2-3% after this correction; documented in
		// docs/benchmark.md.)
		const ci_raw = stats_confidence_interval(cleaned);
		this.confidence_interval_ns = [
			this.mean_ns - (this.mean_ns - ci_raw[0]) * bessel,
			this.mean_ns + (ci_raw[1] - this.mean_ns) * bessel,
		];

		// Calculate throughput (operations per second)
		this.ops_per_second = this.mean_ns > 0 ? TIME_NS_PER_SEC / this.mean_ns : 0;
	}

	/**
	 * Format stats as a human-readable string.
	 */
	toString(): string {
		return `BenchmarkStats(mean=${time_format_adaptive(
			this.mean_ns,
		)}, ops/sec=${this.ops_per_second.toFixed(2)}, cv=${(this.cv * 100).toFixed(1)}%, samples=${
			this.sample_size
		})`;
	}
}

/**
 * Compare two benchmark results for practical and statistical significance.
 * Uses percentage difference for effect magnitude classification, with Welch's
 * t-test for statistical confidence. Cohen's d is computed as an informational
 * metric but does not drive classification — its thresholds (0.2/0.5/0.8) are
 * calibrated for social science and produce false positives in benchmarking
 * where within-run variance is tight.
 *
 * @param a - first benchmark stats (or any object with required properties)
 * @param b - second benchmark stats (or any object with required properties)
 * @returns comparison result with significance, effect size, and recommendation
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
	const min_pct = options?.min_percent_difference ?? 0.1;

	// Handle edge cases
	if (a.sample_size === 0 || b.sample_size === 0) {
		return {
			faster: 'equal',
			speedup_ratio: 1,
			significant: false,
			p_value: 1,
			percent_difference: 0,
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

	// Percentage difference relative to the faster mean (always >= 0)
	const percent_difference = speedup_ratio - 1;

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

	// Cohen's d effect size (informational only — not used for classification)
	const pooled_std_dev = Math.sqrt(
		((a.sample_size - 1) * a.std_dev_ns ** 2 + (b.sample_size - 1) * b.std_dev_ns ** 2) /
			(a.sample_size + b.sample_size - 2),
	);
	let effect_size: number;
	if (pooled_std_dev === 0) {
		effect_size = a.mean_ns === b.mean_ns ? 0 : Infinity;
	} else {
		effect_size = Math.abs(a.mean_ns - b.mean_ns) / pooled_std_dev;
	}

	// Effect magnitude based on percentage difference, not Cohen's d.
	// Cohen's d thresholds (0.2/0.5/0.8) are calibrated for social science, not benchmarking.
	// Within-run variance is tight, so even small system noise (thermal throttle, OS scheduler)
	// produces large Cohen's d. Percentage thresholds directly answer "is this difference
	// meaningful in practice?" Thresholds scale with min_percent_difference so users can
	// tune one knob for their system's noise floor.
	let effect_magnitude: EffectMagnitude;
	if (percent_difference < min_pct) {
		effect_magnitude = 'negligible';
	} else if (percent_difference < min_pct * 3) {
		effect_magnitude = 'small';
	} else if (percent_difference < min_pct * 5) {
		effect_magnitude = 'medium';
	} else {
		effect_magnitude = 'large';
	}

	// Check confidence interval overlap
	const ci_overlap =
		a.confidence_interval_ns[0] <= b.confidence_interval_ns[1] &&
		b.confidence_interval_ns[0] <= a.confidence_interval_ns[1];

	// Significance requires both statistical significance (p < alpha)
	// AND practical significance (percent_difference >= min_pct).
	// With large n, the t-test finds p≈0 for any difference because
	// SE = std_dev/sqrt(n) → 0. Gating on practical significance
	// prevents system noise from being flagged as meaningful.
	const significant = p_value < alpha && percent_difference >= min_pct;

	// Generate recommendation
	let recommendation: string;
	if (percent_difference < min_pct) {
		recommendation = 'No meaningful difference detected';
	} else if (!significant) {
		recommendation = `${(percent_difference * 100).toFixed(
			1,
		)}% difference observed but not statistically significant (p=${p_value.toFixed(3)})`;
	} else {
		recommendation = `${faster === 'a' ? 'First' : 'Second'} is ${speedup_ratio.toFixed(
			2,
		)}x faster with ${effect_magnitude} effect size (${(percent_difference * 100).toFixed(
			1,
		)}%, p=${p_value.toFixed(3)})`;
	}

	// Adjust 'faster' to 'equal' if effect is negligible
	const adjusted_faster = effect_magnitude === 'negligible' ? 'equal' : faster;

	return {
		faster: adjusted_faster,
		speedup_ratio,
		significant,
		p_value,
		percent_difference,
		effect_size,
		effect_magnitude,
		ci_overlap,
		recommendation,
	};
};
