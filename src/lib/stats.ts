/**
 * Statistical analysis utilities.
 * Pure functions with zero dependencies - can be used standalone for any data analysis.
 */

// Statistical constants (defaults)
const DEFAULT_IQR_MULTIPLIER = 1.5;
const DEFAULT_MAD_Z_SCORE_THRESHOLD = 3.5;
const DEFAULT_MAD_Z_SCORE_EXTREME = 5.0;
const DEFAULT_MAD_CONSTANT = 0.6745; // For normal distribution approximation
const DEFAULT_OUTLIER_RATIO_HIGH = 0.3;
const DEFAULT_OUTLIER_RATIO_EXTREME = 0.4;
const DEFAULT_OUTLIER_KEEP_RATIO = 0.8;
const DEFAULT_CONFIDENCE_Z = 1.96; // 95% confidence
const DEFAULT_MIN_SAMPLE_SIZE = 3;

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
export interface StatsOutlierResult {
	/** Values after removing outliers */
	cleaned: Array<number>;
	/** Detected outlier values */
	outliers: Array<number>;
}

/**
 * Configuration options for IQR outlier detection.
 */
export interface StatsOutliersIqrOptions {
	/** Multiplier for IQR bounds (default: 1.5) */
	iqr_multiplier?: number;
	/** Minimum sample size to perform outlier detection (default: 3) */
	min_sample_size?: number;
}

/**
 * Detect outliers using the IQR (Interquartile Range) method.
 * Values outside [Q1 - multiplier*IQR, Q3 + multiplier*IQR] are considered outliers.
 */
export const stats_outliers_iqr = (
	values: Array<number>,
	options?: StatsOutliersIqrOptions,
): StatsOutlierResult => {
	const iqr_multiplier = options?.iqr_multiplier ?? DEFAULT_IQR_MULTIPLIER;
	const min_sample_size = options?.min_sample_size ?? DEFAULT_MIN_SAMPLE_SIZE;

	if (values.length < min_sample_size) {
		return {cleaned: values, outliers: []};
	}

	const sorted = [...values].sort((a, b) => a - b);
	const q1 = sorted[Math.floor(sorted.length * 0.25)]!;
	const q3 = sorted[Math.floor(sorted.length * 0.75)]!;
	const iqr = q3 - q1;

	if (iqr === 0) {
		return {cleaned: values, outliers: []};
	}

	const lower_bound = q1 - iqr_multiplier * iqr;
	const upper_bound = q3 + iqr_multiplier * iqr;

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
 * Configuration options for MAD outlier detection.
 */
export interface StatsOutliersMadOptions {
	/** Modified Z-score threshold for outlier detection (default: 3.5) */
	z_score_threshold?: number;
	/** Extreme Z-score threshold when too many outliers detected (default: 5.0) */
	z_score_extreme?: number;
	/** MAD constant for normal distribution (default: 0.6745) */
	mad_constant?: number;
	/** Ratio threshold to switch to extreme mode (default: 0.3) */
	outlier_ratio_high?: number;
	/** Ratio threshold to switch to keep-closest mode (default: 0.4) */
	outlier_ratio_extreme?: number;
	/** Ratio of values to keep in keep-closest mode (default: 0.8) */
	outlier_keep_ratio?: number;
	/** Minimum sample size to perform outlier detection (default: 3) */
	min_sample_size?: number;
	/** Options to pass to IQR fallback when MAD is zero */
	iqr_options?: StatsOutliersIqrOptions;
}

/**
 * Detect outliers using the MAD (Median Absolute Deviation) method.
 * More robust than IQR for skewed distributions.
 * Uses modified Z-score: |0.6745 * (x - median) / MAD|
 * Values with modified Z-score > threshold are considered outliers.
 */
export const stats_outliers_mad = (
	values: Array<number>,
	options?: StatsOutliersMadOptions,
): StatsOutlierResult => {
	const z_score_threshold = options?.z_score_threshold ?? DEFAULT_MAD_Z_SCORE_THRESHOLD;
	const z_score_extreme = options?.z_score_extreme ?? DEFAULT_MAD_Z_SCORE_EXTREME;
	const mad_constant = options?.mad_constant ?? DEFAULT_MAD_CONSTANT;
	const outlier_ratio_high = options?.outlier_ratio_high ?? DEFAULT_OUTLIER_RATIO_HIGH;
	const outlier_ratio_extreme = options?.outlier_ratio_extreme ?? DEFAULT_OUTLIER_RATIO_EXTREME;
	const outlier_keep_ratio = options?.outlier_keep_ratio ?? DEFAULT_OUTLIER_KEEP_RATIO;
	const min_sample_size = options?.min_sample_size ?? DEFAULT_MIN_SAMPLE_SIZE;
	const iqr_options = options?.iqr_options;

	if (values.length < min_sample_size) {
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
		return stats_outliers_iqr(values, iqr_options);
	}

	// Use modified Z-score with MAD
	let cleaned: Array<number> = [];
	let outliers: Array<number> = [];

	for (const value of values) {
		const modified_z_score = (mad_constant * (value - median)) / mad;
		if (Math.abs(modified_z_score) > z_score_threshold) {
			outliers.push(value);
		} else {
			cleaned.push(value);
		}
	}

	// If too many outliers, increase threshold and try again
	if (outliers.length > values.length * outlier_ratio_high) {
		cleaned = [];
		outliers = [];

		for (const value of values) {
			const modified_z_score = (mad_constant * (value - median)) / mad;
			if (Math.abs(modified_z_score) > z_score_extreme) {
				outliers.push(value);
			} else {
				cleaned.push(value);
			}
		}

		// If still too many outliers, keep closest values to median
		if (outliers.length > values.length * outlier_ratio_extreme) {
			const with_distances = values.map((v) => ({
				value: v,
				distance: Math.abs(v - median),
			}));
			with_distances.sort((a, b) => a.distance - b.distance);

			const keep_count = Math.floor(values.length * outlier_keep_ratio);
			cleaned = with_distances.slice(0, keep_count).map((d) => d.value);
			outliers = with_distances.slice(keep_count).map((d) => d.value);
		}
	}

	return {cleaned, outliers};
};

/**
 * Configuration options for confidence interval calculation.
 */
export interface StatsConfidenceIntervalOptions {
	/** Z-score for confidence level (default: 1.96 for 95% CI) */
	z_score?: number;
}

/**
 * Calculate confidence interval for the mean.
 * @param values - Array of numbers
 * @param options - Configuration options
 * @returns [lower_bound, upper_bound]
 */
export const stats_confidence_interval = (
	values: Array<number>,
	options?: StatsConfidenceIntervalOptions,
): [number, number] => {
	const z_score = options?.z_score ?? DEFAULT_CONFIDENCE_Z;

	if (values.length === 0) return [NaN, NaN];

	const mean = stats_mean(values);
	const std_dev = stats_std_dev(values, mean);

	const se = std_dev / Math.sqrt(values.length);
	const margin = z_score * se;

	return [mean - margin, mean + margin];
};
