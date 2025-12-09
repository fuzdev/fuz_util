/**
 * Statistical analysis utilities for benchmarking.
 * Pure functions with zero dependencies - can be used standalone for any timing/performance analysis.
 * All timing values are in nanoseconds unless otherwise specified.
 */

import {NS_PER_SEC, format_time_adaptive} from './benchmark_timing.js';

// Statistical constants
const QUARTILE_Q1 = 0.25;
const QUARTILE_Q3 = 0.75;
const IQR_MULTIPLIER = 1.5;
const MAD_Z_SCORE_THRESHOLD = 3.5;
const MAD_Z_SCORE_EXTREME = 5.0;
const MAD_CONSTANT = 0.6745; // For normal distribution approximation
const OUTLIER_RATIO_HIGH = 0.3;
const OUTLIER_RATIO_EXTREME = 0.4;
const OUTLIER_KEEP_RATIO = 0.8;
const CONFIDENCE_INTERVAL_Z = 1.96; // 95% confidence
const MIN_SAMPLE_SIZE = 3;

/**
 * Calculate the mean (average) of an array of numbers.
 */
export const stats_mean = (values: Array<number>): number => {
	if (values.length === 0) return NaN;
	return values.reduce((sum, val) => sum + val, 0) / values.length;
};

/**
 * Calculate the median of an array of numbers.
 */
export const stats_median = (values: Array<number>): number => {
	if (values.length === 0) return NaN;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
};

/**
 * Calculate the standard deviation of an array of numbers.
 * Uses population standard deviation (divides by n, not n-1).
 * For benchmarks with many samples, this is typically appropriate.
 */
export const stats_std_dev = (values: Array<number>, mean?: number): number => {
	if (values.length === 0) return NaN;
	const m = mean ?? stats_mean(values);
	const variance = values.reduce((sum, val) => sum + (val - m) ** 2, 0) / values.length;
	return Math.sqrt(variance);
};

/**
 * Calculate the variance of an array of numbers.
 */
export const stats_variance = (values: Array<number>, mean?: number): number => {
	if (values.length === 0) return NaN;
	const m = mean ?? stats_mean(values);
	return values.reduce((sum, val) => sum + (val - m) ** 2, 0) / values.length;
};

/**
 * Calculate a percentile of an array of numbers using linear interpolation.
 * Uses the "R-7" method (default in R, NumPy, Excel) which interpolates between
 * data points for more accurate percentile estimates, especially with smaller samples.
 * @param values - Array of numbers
 * @param p - Percentile (0-1, e.g., 0.95 for 95th percentile)
 */
export const stats_percentile = (values: Array<number>, p: number): number => {
	if (values.length === 0) return NaN;
	if (values.length === 1) return values[0]!;

	const sorted = [...values].sort((a, b) => a - b);
	const n = sorted.length;

	// R-7 method: index = (n - 1) * p
	const index = (n - 1) * p;
	const lower = Math.floor(index);
	const upper = Math.ceil(index);

	if (lower === upper) {
		return sorted[lower]!;
	}

	// Linear interpolation between the two nearest values
	const fraction = index - lower;
	return sorted[lower]! + fraction * (sorted[upper]! - sorted[lower]!);
};

/**
 * Calculate the coefficient of variation (CV).
 * CV = standard deviation / mean, expressed as a ratio.
 * Useful for comparing relative variability between datasets.
 */
export const stats_cv = (mean: number, std_dev: number): number => {
	if (mean === 0) return NaN;
	return std_dev / mean;
};

/**
 * Calculate min and max values.
 */
export const stats_min_max = (values: Array<number>): {min: number; max: number} => {
	if (values.length === 0) return {min: NaN, max: NaN};
	let min = values[0]!;
	let max = values[0]!;
	for (let i = 1; i < values.length; i++) {
		const val = values[i]!;
		if (val < min) min = val;
		if (val > max) max = val;
	}
	return {min, max};
};

/**
 * Result from outlier detection.
 */
export interface OutlierDetectionResult {
	/** Values after removing outliers */
	cleaned: Array<number>;
	/** Detected outlier values */
	outliers: Array<number>;
}

/**
 * Detect outliers using the IQR (Interquartile Range) method.
 * Values outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR] are considered outliers.
 */
export const outliers_detect_iqr = (values: Array<number>): OutlierDetectionResult => {
	if (values.length < MIN_SAMPLE_SIZE) {
		return {cleaned: values, outliers: []};
	}

	const sorted = [...values].sort((a, b) => a - b);
	const q1 = sorted[Math.floor(sorted.length * QUARTILE_Q1)]!;
	const q3 = sorted[Math.floor(sorted.length * QUARTILE_Q3)]!;
	const iqr = q3 - q1;

	if (iqr === 0) {
		return {cleaned: values, outliers: []};
	}

	const lower_bound = q1 - IQR_MULTIPLIER * iqr;
	const upper_bound = q3 + IQR_MULTIPLIER * iqr;

	const cleaned: Array<number> = [];
	const outliers: Array<number> = [];

	for (const value of values) {
		if (value < lower_bound || value > upper_bound) {
			outliers.push(value);
		} else {
			cleaned.push(value);
		}
	}

	return {cleaned, outliers};
};

/**
 * Detect outliers using the MAD (Median Absolute Deviation) method.
 * More robust than IQR for skewed distributions.
 * Uses modified Z-score: |0.6745 * (x - median) / MAD|
 * Values with modified Z-score > 3.5 are considered outliers.
 */
export const outliers_detect_mad = (values: Array<number>): OutlierDetectionResult => {
	if (values.length < MIN_SAMPLE_SIZE) {
		return {cleaned: values, outliers: []};
	}

	const sorted = [...values].sort((a, b) => a - b);
	const median = stats_median(sorted);

	// Calculate MAD (Median Absolute Deviation)
	const deviations = values.map((v) => Math.abs(v - median));
	const sorted_deviations = [...deviations].sort((a, b) => a - b);
	const mad = stats_median(sorted_deviations);

	// If MAD is zero, fall back to IQR method
	if (mad === 0) {
		return outliers_detect_iqr(values);
	}

	// Use modified Z-score with MAD
	let cleaned: Array<number> = [];
	let outliers: Array<number> = [];

	for (const value of values) {
		const modified_z_score = (MAD_CONSTANT * (value - median)) / mad;
		if (Math.abs(modified_z_score) > MAD_Z_SCORE_THRESHOLD) {
			outliers.push(value);
		} else {
			cleaned.push(value);
		}
	}

	// If too many outliers, increase threshold and try again
	if (outliers.length > values.length * OUTLIER_RATIO_HIGH) {
		cleaned = [];
		outliers = [];

		for (const value of values) {
			const modified_z_score = (MAD_CONSTANT * (value - median)) / mad;
			if (Math.abs(modified_z_score) > MAD_Z_SCORE_EXTREME) {
				outliers.push(value);
			} else {
				cleaned.push(value);
			}
		}

		// If still too many outliers, keep closest values to median
		if (outliers.length > values.length * OUTLIER_RATIO_EXTREME) {
			const with_distances = values.map((v) => ({
				value: v,
				distance: Math.abs(v - median),
			}));
			with_distances.sort((a, b) => a.distance - b.distance);

			const keep_count = Math.floor(values.length * OUTLIER_KEEP_RATIO);
			cleaned = with_distances.slice(0, keep_count).map((d) => d.value);
			outliers = with_distances.slice(keep_count).map((d) => d.value);
		}
	}

	return {cleaned, outliers};
};

/**
 * Calculate confidence interval for the mean.
 * Uses 95% confidence level (z=1.96).
 * @param values - Array of numbers
 * @returns [lower_bound, upper_bound]
 */
export const stats_confidence_interval = (values: Array<number>): [number, number] => {
	if (values.length === 0) return [NaN, NaN];

	const mean = stats_mean(values);
	const std_dev = stats_std_dev(values, mean);

	const se = std_dev / Math.sqrt(values.length);
	const margin = CONFIDENCE_INTERVAL_Z * se;

	return [mean - margin, mean + margin];
};

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
		const {cleaned, outliers} = outliers_detect_mad(valid_timings);
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
		this.ops_per_second = this.mean_ns > 0 ? NS_PER_SEC / this.mean_ns : 0;
	}

	/**
	 * Format stats as a human-readable string.
	 */
	toString(): string {
		return `BenchmarkStats(mean=${format_time_adaptive(this.mean_ns)}, ops/sec=${this.ops_per_second.toFixed(2)}, cv=${(this.cv * 100).toFixed(1)}%, samples=${this.sample_size})`;
	}

	// TODO: Consider adding a static `compare(a: BenchmarkStats, b: BenchmarkStats)` method
	// that performs statistical significance testing (e.g., Welch's t-test) to determine
	// if two benchmark results are significantly different. Would be useful for CI/CD
	// to detect performance regressions with confidence.
}
