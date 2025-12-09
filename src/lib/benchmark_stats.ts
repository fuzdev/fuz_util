/**
 * Benchmark-specific statistical analysis.
 * Uses the general stats utilities from stats.ts for timing/performance analysis.
 * All timing values are in nanoseconds.
 */

import {TIME_NS_PER_SEC, time_format_adaptive} from './benchmark_timing.js';
import {
	stats_mean,
	stats_median,
	stats_std_dev,
	stats_percentile,
	stats_cv,
	stats_min_max,
	stats_confidence_interval,
	stats_outliers_mad,
} from './stats.js';

/**
 * Complete statistical analysis of timing measurements.
 * Includes outlier detection, descriptive statistics, and performance metrics.
 * All timing values are in nanoseconds.
 */
export class BenchmarkStats {
	/** Mean (average) time in nanoseconds */
	readonly mean_ns: number;
	/** Median time in nanoseconds */
	readonly median_ns: number;
	/** Standard deviation in nanoseconds */
	readonly std_dev_ns: number;
	/** Minimum time in nanoseconds */
	readonly min_ns: number;
	/** Maximum time in nanoseconds */
	readonly max_ns: number;
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
			this.median_ns = NaN;
			this.std_dev_ns = NaN;
			this.min_ns = NaN;
			this.max_ns = NaN;
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
		this.median_ns = stats_median(sorted_cleaned);
		this.std_dev_ns = stats_std_dev(cleaned, this.mean_ns);

		const {min, max} = stats_min_max(sorted_cleaned);
		this.min_ns = min;
		this.max_ns = max;

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

	// TODO: Consider adding a static `compare(a: BenchmarkStats, b: BenchmarkStats)` method
	// that performs statistical significance testing (e.g., Welch's t-test) to determine
	// if two benchmark results are significantly different. Would be useful for CI/CD
	// to detect performance regressions with confidence.
}
