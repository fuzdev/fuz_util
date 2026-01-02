/**
 * Statistical analysis utilities.
 * Pure functions with zero dependencies - can be used standalone for any data analysis.
 *
 * @module
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
 * Common z-scores for confidence intervals.
 */
export const STATS_CONFIDENCE_Z_SCORES: Record<number, number> = {
	0.8: 1.282,
	0.9: 1.645,
	0.95: 1.96,
	0.99: 2.576,
	0.999: 3.291,
};

/**
 * Convert a confidence level (0-1) to a z-score.
 * Uses a lookup table for common values, approximates others.
 *
 * @example
 * ```ts
 * stats_confidence_level_to_z_score(0.95); // 1.96
 * stats_confidence_level_to_z_score(0.99); // 2.576
 * ```
 */
export const stats_confidence_level_to_z_score = (level: number): number => {
	if (level <= 0 || level >= 1) {
		throw new Error('Confidence level must be between 0 and 1 (exclusive)');
	}

	// Check lookup table first
	if (level in STATS_CONFIDENCE_Z_SCORES) {
		return STATS_CONFIDENCE_Z_SCORES[level]!;
	}

	// For confidence level c, we want z such that P(-z < Z < z) = c
	// This means Φ(z) = (1 + c) / 2, so z = Φ⁻¹((1 + c) / 2)
	// Using Φ⁻¹(p) = √2 * erfinv(2p - 1)
	const p = (1 + level) / 2; // e.g., 0.95 -> 0.975
	const x = 2 * p - 1; // Argument for erfinv, e.g., 0.975 -> 0.95

	// Winitzki approximation for erfinv
	const a = 0.147;
	const ln_term = Math.log(1 - x * x);
	const term1 = 2 / (Math.PI * a) + ln_term / 2;
	const erfinv = Math.sign(x) * Math.sqrt(Math.sqrt(term1 * term1 - ln_term / a) - term1);

	return Math.SQRT2 * erfinv;
};

/**
 * Configuration options for confidence interval calculation.
 */
export interface StatsConfidenceIntervalOptions {
	/** Z-score for confidence level (default: 1.96 for 95% CI) */
	z_score?: number;
	/** Confidence level (0-1), alternative to z_score. If both provided, z_score takes precedence. */
	confidence_level?: number;
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
	if (values.length === 0) return [NaN, NaN];

	const mean = stats_mean(values);
	const std_dev = stats_std_dev(values, mean);

	return stats_confidence_interval_from_summary(mean, std_dev, values.length, options);
};

/**
 * Calculate confidence interval from summary statistics (mean, std_dev, sample_size).
 * Useful when raw data is not available.
 * @param mean - Mean of the data
 * @param std_dev - Standard deviation of the data
 * @param sample_size - Number of samples
 * @param options - Configuration options
 * @returns [lower_bound, upper_bound]
 */
export const stats_confidence_interval_from_summary = (
	mean: number,
	std_dev: number,
	sample_size: number,
	options?: StatsConfidenceIntervalOptions,
): [number, number] => {
	// z_score takes precedence, then confidence_level, then default
	const z_score =
		options?.z_score ??
		(options?.confidence_level
			? stats_confidence_level_to_z_score(options.confidence_level)
			: null) ??
		DEFAULT_CONFIDENCE_Z;

	if (sample_size === 0) return [NaN, NaN];

	const se = std_dev / Math.sqrt(sample_size);
	const margin = z_score * se;

	return [mean - margin, mean + margin];
};

// Hypothesis Testing Utilities
// These functions support statistical significance testing (t-tests, p-values, etc.)

/**
 * Result from Welch's t-test calculation.
 */
export interface StatsWelchTTestResult {
	/** The t-statistic */
	t_statistic: number;
	/** Welch-Satterthwaite degrees of freedom */
	degrees_of_freedom: number;
}

/**
 * Calculate Welch's t-test statistic and degrees of freedom.
 * Welch's t-test is more robust than Student's t-test when variances are unequal.
 *
 * @param mean1 - Mean of first sample
 * @param std1 - Standard deviation of first sample
 * @param n1 - Size of first sample
 * @param mean2 - Mean of second sample
 * @param std2 - Standard deviation of second sample
 * @param n2 - Size of second sample
 */
export const stats_welch_t_test = (
	mean1: number,
	std1: number,
	n1: number,
	mean2: number,
	std2: number,
	n2: number,
): StatsWelchTTestResult => {
	const var1 = std1 ** 2;
	const var2 = std2 ** 2;

	const se1 = var1 / n1;
	const se2 = var2 / n2;

	const t_statistic = (mean1 - mean2) / Math.sqrt(se1 + se2);

	// Welch-Satterthwaite degrees of freedom
	const numerator = (se1 + se2) ** 2;
	const denominator = se1 ** 2 / (n1 - 1) + se2 ** 2 / (n2 - 1);
	const degrees_of_freedom = numerator / denominator;

	return {t_statistic, degrees_of_freedom};
};

/**
 * Standard normal CDF approximation (Abramowitz and Stegun formula 7.1.26).
 */
export const stats_normal_cdf = (x: number): number => {
	const t = 1 / (1 + 0.2316419 * Math.abs(x));
	const d = 0.3989423 * Math.exp((-x * x) / 2);
	const p =
		d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
	return x > 0 ? 1 - p : p;
};

/**
 * Log gamma function approximation (Lanczos approximation).
 */
export const stats_ln_gamma = (z: number): number => {
	const g = 7;
	const c = [
		0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
		-176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
		1.5056327351493116e-7,
	];

	if (z < 0.5) {
		return Math.log(Math.PI / Math.sin(Math.PI * z)) - stats_ln_gamma(1 - z);
	}

	const z_adj = z - 1;
	let x = c[0]!;
	for (let i = 1; i < g + 2; i++) {
		x += c[i]! / (z_adj + i);
	}
	const t = z_adj + g + 0.5;
	return 0.5 * Math.log(2 * Math.PI) + (z_adj + 0.5) * Math.log(t) - t + Math.log(x);
};

/**
 * Approximate regularized incomplete beta function for p-value calculation.
 * Uses continued fraction expansion for reasonable accuracy.
 */
export const stats_incomplete_beta = (x: number, a: number, b: number): number => {
	// Simple approximation using the relationship between beta and normal distributions
	// For our use case (t-distribution p-values), this provides sufficient accuracy
	if (x <= 0) return 0;
	if (x >= 1) return 1;

	// Use symmetry if needed
	if (x > (a + 1) / (a + b + 2)) {
		return 1 - stats_incomplete_beta(1 - x, b, a);
	}

	// Continued fraction approximation (first few terms)
	const lnBeta = stats_ln_gamma(a) + stats_ln_gamma(b) - stats_ln_gamma(a + b);
	const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

	// Simple continued fraction (limited iterations for speed)
	let f = 1;
	let c = 1;
	let d = 0;

	for (let m = 1; m <= 100; m++) {
		const m2 = 2 * m;

		// Even step
		let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
		d = 1 + aa * d;
		if (Math.abs(d) < 1e-30) d = 1e-30;
		c = 1 + aa / c;
		if (Math.abs(c) < 1e-30) c = 1e-30;
		d = 1 / d;
		f *= d * c;

		// Odd step
		aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
		d = 1 + aa * d;
		if (Math.abs(d) < 1e-30) d = 1e-30;
		c = 1 + aa / c;
		if (Math.abs(c) < 1e-30) c = 1e-30;
		d = 1 / d;
		const delta = d * c;
		f *= delta;

		if (Math.abs(delta - 1) < 1e-8) break;
	}

	return front * f;
};

/**
 * Approximate two-tailed p-value from t-distribution.
 * For large df (>100), uses normal approximation.
 * For smaller df, uses incomplete beta function.
 *
 * @param t - Absolute value of t-statistic
 * @param df - Degrees of freedom
 * @returns Two-tailed p-value
 */
export const stats_t_distribution_p_value = (t: number, df: number): number => {
	// Use normal approximation for large df
	if (df > 100) {
		return 2 * (1 - stats_normal_cdf(t));
	}

	// For smaller df, use a more accurate approximation
	// Based on the incomplete beta function relationship
	const x = df / (df + t * t);
	const a = df / 2;
	const b = 0.5;

	return stats_incomplete_beta(x, a, b);
};
