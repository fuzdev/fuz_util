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
const DEFAULT_MIN_SAMPLE_SIZE = 3;

/**
 * Calculate the mean (average) of an array of numbers.
 */
export const stats_mean = (values: ReadonlyArray<number>): number => {
	if (values.length === 0) return NaN;
	return values.reduce((sum, val) => sum + val, 0) / values.length;
};

/**
 * Calculate the median of an array of numbers.
 * NaN values are filtered out before computing.
 */
export const stats_median = (values: ReadonlyArray<number>): number => {
	const valid = values.filter((v) => !Number.isNaN(v));
	if (valid.length === 0) return NaN;
	const sorted = valid.sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
};

/**
 * Calculate the population standard deviation of an array of numbers
 * (divides by n). For a sample standing in for a larger population, as with
 * timings, use `stats_std_dev_sample`.
 */
export const stats_std_dev = (values: ReadonlyArray<number>, mean?: number): number => {
	if (values.length === 0) return NaN;
	const m = mean ?? stats_mean(values);
	const variance = values.reduce((sum, val) => sum + (val - m) ** 2, 0) / values.length;
	return Math.sqrt(variance);
};

/**
 * Calculate the sample standard deviation of an array of numbers, with Bessel's
 * correction (divides by n - 1). This is the estimator a t-based confidence
 * interval and Welch's t-test expect.
 *
 * @param values - the sample
 * @param mean - the sample's mean, when already computed
 * @returns the sample standard deviation, or NaN for fewer than two values
 */
export const stats_std_dev_sample = (values: ReadonlyArray<number>, mean?: number): number => {
	if (values.length < 2) return NaN;
	const m = mean ?? stats_mean(values);
	const sum = values.reduce((acc, val) => acc + (val - m) ** 2, 0);
	return Math.sqrt(sum / (values.length - 1));
};

/**
 * Calculate the variance of an array of numbers.
 */
export const stats_variance = (values: ReadonlyArray<number>, mean?: number): number => {
	if (values.length === 0) return NaN;
	const m = mean ?? stats_mean(values);
	return values.reduce((sum, val) => sum + (val - m) ** 2, 0) / values.length;
};

/**
 * Calculate a percentile of an array of numbers using linear interpolation.
 * Uses the "R-7" method (default in R, NumPy, Excel) which interpolates between
 * data points for more accurate percentile estimates, especially with smaller samples.
 * @param p - percentile (0-1, e.g., 0.95 for 95th percentile)
 */
export const stats_percentile = (values: ReadonlyArray<number>, p: number): number => {
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
 * NaN values are ignored.
 */
export const stats_min_max = (values: ReadonlyArray<number>): { min: number; max: number } => {
	if (values.length === 0) return { min: NaN, max: NaN };
	let min = Infinity;
	let max = -Infinity;
	for (let i = 0; i < values.length; i++) {
		const val = values[i]!;
		if (Number.isNaN(val)) continue;
		if (val < min) min = val;
		if (val > max) max = val;
	}
	if (min === Infinity) return { min: NaN, max: NaN };
	return { min, max };
};

/**
 * Calculate the spread of an array of numbers: the largest over the smallest,
 * so 1 when all agree. NaN values are ignored, as `stats_min_max` does.
 *
 * @returns the ratio of max to min, or NaN when there is no value or the smallest is not positive
 */
export const stats_spread = (values: ReadonlyArray<number>): number => {
	const { min, max } = stats_min_max(values);
	if (!(min > 0)) return NaN;
	return max / min;
};

/**
 * Calculate how far a ratio is from 1, the same in either direction:
 * `max(ratio, 1 / ratio) - 1`, so 1.1 and 1 / 1.1 both give 0.1.
 *
 * @returns the deviation, or NaN when `ratio` is not positive
 */
export const stats_ratio_deviation = (ratio: number): number => {
	if (!(ratio > 0)) return NaN;
	return Math.max(ratio, 1 / ratio) - 1;
};

/**
 * Deviation figures over pairs of values that measure the same thing.
 */
export interface StatsPairwiseDeviation {
	/** How many pairs the figures are taken over. */
	pairs: number;
	/** The median deviation. */
	median: number;
	/** The 95th percentile deviation. */
	p95: number;
	/** The largest deviation. */
	max: number;
}

/**
 * Calculate how much values that should agree disagree, as an A/A noise figure.
 * Each group holds repeated measurements of one thing, and every pair within a
 * group contributes the `stats_ratio_deviation` of its ratio. Groups are never
 * compared with each other. A value that is not a positive finite number is
 * skipped, and so is a pair whose ratio overflows.
 *
 * @param groups - each group's repeated measurements
 * @returns the figures over every pair, or null when there is no usable pair
 */
export const stats_pairwise_deviation = (
	groups: ReadonlyArray<ReadonlyArray<number>>
): StatsPairwiseDeviation | null => {
	const deviations: Array<number> = [];
	for (const group of groups) {
		const usable = group.filter((v) => Number.isFinite(v) && v > 0);
		for (let i = 0; i < usable.length; i++) {
			for (let j = i + 1; j < usable.length; j++) {
				const a = usable[i]!;
				const b = usable[j]!;
				// larger over smaller, so the ratio can't underflow to 0
				const deviation = stats_ratio_deviation(a > b ? a / b : b / a);
				if (Number.isFinite(deviation)) deviations.push(deviation);
			}
		}
	}
	if (deviations.length === 0) return null;
	return {
		pairs: deviations.length,
		median: stats_median(deviations),
		p95: stats_percentile(deviations, 0.95),
		max: stats_min_max(deviations).max
	};
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
	options?: StatsOutliersIqrOptions
): StatsOutlierResult => {
	const iqr_multiplier = options?.iqr_multiplier ?? DEFAULT_IQR_MULTIPLIER;
	const min_sample_size = options?.min_sample_size ?? DEFAULT_MIN_SAMPLE_SIZE;

	if (values.length < min_sample_size) {
		return { cleaned: values, outliers: [] };
	}

	const sorted = [...values].sort((a, b) => a - b);
	const q1 = sorted[Math.floor(sorted.length * 0.25)]!;
	const q3 = sorted[Math.floor(sorted.length * 0.75)]!;
	const iqr = q3 - q1;

	if (iqr === 0) {
		return { cleaned: values, outliers: [] };
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

	return { cleaned, outliers };
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
	options?: StatsOutliersMadOptions
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
		return { cleaned: values, outliers: [] };
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
				distance: Math.abs(v - median)
			}));
			with_distances.sort((a, b) => a.distance - b.distance);

			const keep_count = Math.floor(values.length * outlier_keep_ratio);
			cleaned = with_distances.slice(0, keep_count).map((d) => d.value);
			outliers = with_distances.slice(keep_count).map((d) => d.value);
		}
	}

	return { cleaned, outliers };
};

// two-sided 95% Student's t critical values for df 1-30, rounded up to three decimals
const T_CRITICAL_95_LOW = [
	12.707, 4.303, 3.183, 2.777, 2.571, 2.447, 2.365, 2.307, 2.263, 2.229, 2.201, 2.179, 2.161, 2.145,
	2.132, 2.12, 2.11, 2.101, 2.094, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.049,
	2.046, 2.043
];
// [df, t] beyond the low table, rounded up likewise, ending at the normal limit
const T_CRITICAL_95_HIGH: ReadonlyArray<readonly [number, number]> = [
	[30, 2.043],
	[40, 2.022],
	[60, 2.001],
	[120, 1.98],
	[Infinity, 1.96]
];

/**
 * Two-sided 95% critical value of Student's t distribution: the multiple of the
 * standard error a 95% confidence interval spans on each side of the mean.
 * A table gives whole df up to 30 and 40, 60, and 120, each rounded up to three
 * decimals. Between table points, and for fractional df such as Welch's, it
 * interpolates linearly in 1 / df. t is convex in 1 / df, so the interpolation
 * lands above the true value, well above it under df 3. The value is never
 * below the true one, so an interval is never narrower than it should be.
 *
 * @param df - degrees of freedom, at least 1
 * @returns the critical value, 1.96 for infinite df, or NaN when `df` is below 1 or NaN
 */
export const stats_t_critical_95 = (df: number): number => {
	if (!(df >= 1)) return NaN;
	if (Number.isInteger(df) && df <= T_CRITICAL_95_LOW.length) return T_CRITICAL_95_LOW[df - 1]!;
	let lo_df: number, lo_t: number, hi_df: number, hi_t: number;
	if (df < T_CRITICAL_95_LOW.length) {
		lo_df = Math.floor(df);
		hi_df = lo_df + 1;
		lo_t = T_CRITICAL_95_LOW[lo_df - 1]!;
		hi_t = T_CRITICAL_95_LOW[hi_df - 1]!;
	} else {
		let i = 1;
		while (T_CRITICAL_95_HIGH[i]![0] < df) i++;
		[lo_df, lo_t] = T_CRITICAL_95_HIGH[i - 1]!;
		[hi_df, hi_t] = T_CRITICAL_95_HIGH[i]!;
		if (df === hi_df) return hi_t;
	}
	// fraction of the way from the upper point back to the lower one, in 1 / df
	const fraction = (1 / df - 1 / hi_df) / (1 / lo_df - 1 / hi_df);
	return hi_t + fraction * (lo_t - hi_t);
};

/**
 * Configuration options for confidence interval calculation.
 */
export interface StatsConfidenceIntervalOptions {
	/**
	 * The multiple of the standard error on each side of the mean.
	 * Defaults to `stats_t_critical_95` at n - 1 degrees of freedom.
	 */
	critical?: number;
}

/**
 * Calculate a confidence interval for the mean, from the sample standard
 * deviation and, by default, the 95% Student's t critical value.
 *
 * @returns `[lower_bound, upper_bound]`, both NaN for fewer than two values
 */
export const stats_confidence_interval = (
	values: ReadonlyArray<number>,
	options?: StatsConfidenceIntervalOptions
): [number, number] => {
	if (values.length < 2) return [NaN, NaN];

	const mean = stats_mean(values);
	const std_dev = stats_std_dev_sample(values, mean);

	return stats_confidence_interval_from_summary(mean, std_dev, values.length, options);
};

/**
 * Calculate a confidence interval for the mean from summary statistics.
 * Useful when raw data is not available.
 *
 * @param mean - the sample mean
 * @param std_dev - the sample standard deviation (`stats_std_dev_sample`)
 * @param sample_size - how many values the summary covers
 * @returns `[lower_bound, upper_bound]`, both NaN when `sample_size` is below 2
 */
export const stats_confidence_interval_from_summary = (
	mean: number,
	std_dev: number,
	sample_size: number,
	options?: StatsConfidenceIntervalOptions
): [number, number] => {
	if (!(sample_size >= 2)) return [NaN, NaN];

	const critical = options?.critical ?? stats_t_critical_95(sample_size - 1);
	const margin = (critical * std_dev) / Math.sqrt(sample_size);

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
 * Params suffixed `1` describe the first sample, `2` the second.
 */
export const stats_welch_t_test = (
	mean1: number,
	std1: number,
	n1: number,
	mean2: number,
	std2: number,
	n2: number
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

	return { t_statistic, degrees_of_freedom };
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
		1.5056327351493116e-7
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
 * Regularized incomplete beta function `I_x(a, b)`, by the continued fraction
 * of Numerical Recipes' `betai`/`betacf` (modified Lentz), using the symmetry
 * `I_x(a, b) = 1 - I_(1-x)(b, a)` where that converges faster. Accurate to
 * about 1e-8 for the t p-value (b = 0.5). For large a and b both, precision
 * falls with √max(a, b), and the value after the iteration cap is returned as is.
 *
 * @param x - the upper limit of integration, in [0, 1]
 * @param a - the first shape parameter, positive
 * @param b - the second shape parameter, positive
 * @returns `I_x(a, b)`, in [0, 1]
 */
export const stats_incomplete_beta = (x: number, a: number, b: number): number => {
	if (x <= 0) return 0;
	if (x >= 1) return 1;

	// the continued fraction converges fast below this point
	if (x > (a + 1) / (a + b + 2)) {
		return 1 - stats_incomplete_beta(1 - x, b, a);
	}

	const ln_beta = stats_ln_gamma(a) + stats_ln_gamma(b) - stats_ln_gamma(a + b);
	const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - ln_beta) / a;

	const tiny = 1e-30;
	let c = 1;
	let d = 1 - ((a + b) * x) / (a + 1);
	if (Math.abs(d) < tiny) d = tiny;
	d = 1 / d;
	let f = d;

	for (let m = 1; m <= 300; m++) {
		const m2 = 2 * m;

		// even step
		let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
		d = 1 + aa * d;
		if (Math.abs(d) < tiny) d = tiny;
		c = 1 + aa / c;
		if (Math.abs(c) < tiny) c = tiny;
		d = 1 / d;
		f *= d * c;

		// odd step
		aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
		d = 1 + aa * d;
		if (Math.abs(d) < tiny) d = tiny;
		c = 1 + aa / c;
		if (Math.abs(c) < tiny) c = tiny;
		d = 1 / d;
		const delta = d * c;
		f *= delta;

		if (Math.abs(delta - 1) < 1e-14) break;
	}

	return front * f;
};

// above this df the t p-value is the normal's, see `stats_t_distribution_p_value`
const T_DISTRIBUTION_NORMAL_ABOVE_DF = 1e7;

/**
 * Two-tailed p-value of Student's t distribution, through the regularized
 * incomplete beta function. Above df 1e7 it is the normal limit: `df / (df + t²)`
 * loses precision as df grows, and from there t and the normal differ by less
 * than the normal approximation's own error, so the switch moves the value by less
 * than 1e-6.
 *
 * @param t - absolute value of t-statistic
 * @param df - degrees of freedom
 * @returns two-tailed p-value, or NaN when `df` is not positive
 */
export const stats_t_distribution_p_value = (t: number, df: number): number => {
	if (!(df > 0)) return NaN;
	if (df > T_DISTRIBUTION_NORMAL_ABOVE_DF)
		return Math.min(1, 2 * (1 - stats_normal_cdf(Math.abs(t))));
	return stats_incomplete_beta(df / (df + t * t), df / 2, 0.5);
};
