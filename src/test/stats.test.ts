import { describe, test, assert } from 'vitest';

import {
	stats_mean,
	stats_median,
	stats_std_dev,
	stats_variance,
	stats_percentile,
	stats_cv,
	stats_min_max,
	stats_confidence_interval,
	stats_confidence_interval_from_summary,
	stats_outliers_iqr,
	stats_outliers_mad,
	stats_std_dev_sample,
	stats_spread,
	stats_ratio_deviation,
	stats_pairwise_deviation,
	stats_t_critical_95,
	stats_welch_t_test,
	stats_normal_cdf,
	stats_ln_gamma,
	stats_incomplete_beta,
	stats_t_distribution_p_value
} from '#lib/stats.ts';

describe('stats_mean', () => {
	test('stats_mean', () => {
		assert.strictEqual(stats_mean([1, 2, 3, 4, 5]), 3);
		assert.strictEqual(stats_mean([10]), 10);
		assert.isNaN(stats_mean([]));
		assert.approximately(stats_mean([1.5, 2.5, 3.5]), 2.5, 0.005);
	});
});

describe('stats_median', () => {
	test('stats_median', () => {
		assert.strictEqual(stats_median([1, 2, 3, 4, 5]), 3);
		assert.strictEqual(stats_median([1, 2, 3, 4]), 2.5);
		assert.strictEqual(stats_median([5, 1, 3, 2, 4]), 3);
		assert.strictEqual(stats_median([10]), 10);
		assert.isNaN(stats_median([]));
	});
});

describe('stats_std_dev', () => {
	test('stats_std_dev', () => {
		assert.approximately(stats_std_dev([2, 4, 4, 4, 5, 5, 7, 9]), 2, 0.5);
		assert.strictEqual(stats_std_dev([1, 1, 1, 1]), 0);
		assert.isNaN(stats_std_dev([]));
	});

	test('stats_std_dev with pre-computed mean', () => {
		const values = [2, 4, 4, 4, 5, 5, 7, 9];
		const mean = stats_mean(values);
		const sd_auto = stats_std_dev(values);
		const sd_manual = stats_std_dev(values, mean);
		assert.strictEqual(sd_auto, sd_manual);
	});
});

describe('stats_variance', () => {
	test('stats_variance', () => {
		assert.approximately(stats_variance([2, 4, 4, 4, 5, 5, 7, 9]), 4, 0.5);
		assert.strictEqual(stats_variance([1, 1, 1, 1]), 0);
		assert.isNaN(stats_variance([]));
	});

	test('stats_variance with pre-computed mean', () => {
		const values = [2, 4, 4, 4, 5, 5, 7, 9];
		const mean = stats_mean(values);
		const var_auto = stats_variance(values);
		const var_manual = stats_variance(values, mean);
		assert.strictEqual(var_auto, var_manual);
	});
});

describe('stats_percentile', () => {
	test('stats_percentile: uses R-7 linear interpolation', () => {
		const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

		// p=0.5 with 10 values: index = 9 * 0.5 = 4.5, interpolate between 5 and 6
		assert.strictEqual(stats_percentile(values, 0.5), 5.5);

		// p=0.25 with 10 values: index = 9 * 0.25 = 2.25, interpolate between 3 and 4
		assert.approximately(stats_percentile(values, 0.25), 3.25, 5e-11);

		// p=0.75 with 10 values: index = 9 * 0.75 = 6.75, interpolate between 7 and 8
		assert.approximately(stats_percentile(values, 0.75), 7.75, 5e-11);

		// Exact index values (no interpolation needed)
		assert.strictEqual(stats_percentile(values, 0), 1); // index = 0
		assert.strictEqual(stats_percentile(values, 1.0), 10); // index = 9

		assert.isNaN(stats_percentile([], 0.5));
	});

	test('stats_percentile: edge cases', () => {
		const values = [1, 2, 3, 4, 5];

		// p=0 should return first element
		assert.strictEqual(stats_percentile(values, 0), 1);

		// p=1.0 should return last element
		assert.strictEqual(stats_percentile(values, 1.0), 5);

		// p=0.5 with 5 values: index = 4 * 0.5 = 2, returns 3 (no interpolation)
		assert.strictEqual(stats_percentile(values, 0.5), 3);

		// Single element array
		assert.strictEqual(stats_percentile([42], 0), 42);
		assert.strictEqual(stats_percentile([42], 0.5), 42);
		assert.strictEqual(stats_percentile([42], 1.0), 42);

		// Two element array with interpolation
		assert.strictEqual(stats_percentile([10, 20], 0.5), 15);
		assert.strictEqual(stats_percentile([10, 20], 0.25), 12.5);
		assert.strictEqual(stats_percentile([10, 20], 0.75), 17.5);
	});

	test('stats_percentile: unsorted input', () => {
		// stats_percentile sorts internally
		assert.strictEqual(stats_percentile([5, 1, 3, 2, 4], 0.5), 3);
		assert.strictEqual(stats_percentile([10, 5, 1], 0), 1);
		assert.strictEqual(stats_percentile([10, 5, 1], 1.0), 10);
	});
});

describe('stats_cv', () => {
	test('stats_cv', () => {
		assert.strictEqual(stats_cv(100, 10), 0.1);
		assert.strictEqual(stats_cv(50, 5), 0.1);
		assert.isNaN(stats_cv(0, 5));
	});
});

describe('stats_min_max', () => {
	test('stats_min_max', () => {
		assert.deepEqual(stats_min_max([5, 1, 9, 3, 7]), { min: 1, max: 9 });
		assert.deepEqual(stats_min_max([42]), { min: 42, max: 42 });
		assert.deepEqual(stats_min_max([]), { min: NaN, max: NaN });
	});
});

describe('stats_confidence_interval', () => {
	test('stats_confidence_interval: t-based by default', () => {
		const values = [10, 12, 11, 13, 10, 12, 11];
		const mean = stats_mean(values);
		const margin = (2.447 * stats_std_dev_sample(values, mean)) / Math.sqrt(values.length);
		const [lower, upper] = stats_confidence_interval(values);
		assert.approximately(lower, mean - margin, 1e-12);
		assert.approximately(upper, mean + margin, 1e-12);
	});

	test('stats_confidence_interval: fewer than two values', () => {
		assert.deepEqual(stats_confidence_interval([]), [NaN, NaN]);
		assert.deepEqual(stats_confidence_interval([5]), [NaN, NaN]);
		assert.deepEqual(stats_confidence_interval([5], { critical: 1.96 }), [NaN, NaN]);
	});

	test('stats_confidence_interval: custom critical value', () => {
		const values = [10, 11, 12, 13, 14, 15];
		const width = (ci: [number, number]) => ci[1] - ci[0];
		const ci_t = stats_confidence_interval(values);
		const ci_z = stats_confidence_interval(values, { critical: 1.96 });
		const ci_1 = stats_confidence_interval(values, { critical: 1 });
		assert.isAbove(width(ci_t), width(ci_z));
		assert.isAbove(width(ci_z), width(ci_1));
		assert.approximately(width(ci_t) / width(ci_1), 2.571, 1e-12);
	});
});

describe('stats_t_critical_95', () => {
	test('stats_t_critical_95: exact table values', () => {
		assert.strictEqual(stats_t_critical_95(1), 12.707);
		assert.strictEqual(stats_t_critical_95(2), 4.303);
		assert.strictEqual(stats_t_critical_95(11), 2.201);
		assert.strictEqual(stats_t_critical_95(30), 2.043);
		assert.strictEqual(stats_t_critical_95(40), 2.022);
		assert.strictEqual(stats_t_critical_95(60), 2.001);
		assert.strictEqual(stats_t_critical_95(120), 1.98);
		assert.strictEqual(stats_t_critical_95(Infinity), 1.96);
	});

	test('stats_t_critical_95: interpolates at or slightly above the true value', () => {
		// true values: t(35) = 2.0301, t(2.5) = 3.5747, t(500) = 1.9647
		const t_35 = stats_t_critical_95(35);
		assert.isAtLeast(t_35, 2.0301);
		assert.isAtMost(t_35, 2.033);
		const t_2_5 = stats_t_critical_95(2.5);
		assert.isAtLeast(t_2_5, 3.5747);
		assert.isAtMost(t_2_5, 3.64);
		assert.approximately(stats_t_critical_95(500), 1.9648, 1e-4);
		assert.approximately(stats_t_critical_95(1e12), 1.96, 1e-9);
	});

	test('stats_t_critical_95: never below the true quantile', () => {
		// at the true quantile the two-sided p-value is 0.05, and above it less
		const dfs = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, 15, 20, 29.5, 30, 35, 40, 50, 60, 90, 120, 500];
		for (let df = 1; df <= 30; df++) dfs.push(df);
		for (const df of dfs) {
			assert.isAtMost(stats_t_distribution_p_value(stats_t_critical_95(df), df), 0.05, `df ${df}`);
		}
		// and the rounding is to the next thousandth, no further
		for (const df of [...Array.from({ length: 30 }, (_, i) => i + 1), 40, 60, 120]) {
			const p = stats_t_distribution_p_value(stats_t_critical_95(df) - 0.001, df);
			assert.isAbove(p, 0.05, `df ${df}`);
		}
	});

	test('stats_t_critical_95: non-increasing in df', () => {
		let prev = Infinity;
		for (let df = 1; df <= 1000; df += 0.25) {
			const t = stats_t_critical_95(df);
			assert.isAtMost(t, prev, `df ${df}`);
			prev = t;
		}
	});

	test('stats_t_critical_95: invalid df', () => {
		assert.isNaN(stats_t_critical_95(0));
		assert.isNaN(stats_t_critical_95(0.5));
		assert.isNaN(stats_t_critical_95(-1));
		assert.isNaN(stats_t_critical_95(NaN));
	});
});

describe('stats_std_dev_sample', () => {
	test('stats_std_dev_sample: divides by n - 1', () => {
		const values = [2, 4, 4, 4, 5, 5, 7, 9];
		assert.approximately(stats_std_dev_sample(values), Math.sqrt(32 / 7), 1e-12);
		assert.approximately(stats_std_dev_sample(values, 5), Math.sqrt(32 / 7), 1e-12);
		assert.strictEqual(stats_std_dev_sample([3, 3]), 0);
	});

	test('stats_std_dev_sample: fewer than two values', () => {
		assert.isNaN(stats_std_dev_sample([]));
		assert.isNaN(stats_std_dev_sample([1]));
	});
});

describe('stats_spread', () => {
	test('stats_spread', () => {
		assert.strictEqual(stats_spread([2, 4, 3]), 2);
		assert.strictEqual(stats_spread([5, 5]), 1);
		assert.strictEqual(stats_spread([7]), 1);
		assert.strictEqual(stats_spread([2, NaN, 6]), 3);
	});

	test('stats_spread: no positive minimum', () => {
		assert.isNaN(stats_spread([]));
		assert.isNaN(stats_spread([NaN, NaN]));
		assert.isNaN(stats_spread([0, 5]));
		assert.isNaN(stats_spread([-1, 5]));
	});
});

describe('stats_ratio_deviation', () => {
	test('stats_ratio_deviation: symmetric', () => {
		assert.strictEqual(stats_ratio_deviation(1), 0);
		assert.approximately(stats_ratio_deviation(1.25), 0.25, 1e-12);
		assert.approximately(stats_ratio_deviation(1 / 1.25), 0.25, 1e-12);
	});

	test('stats_ratio_deviation: invalid ratio', () => {
		assert.isNaN(stats_ratio_deviation(0));
		assert.isNaN(stats_ratio_deviation(-2));
		assert.isNaN(stats_ratio_deviation(NaN));
	});
});

describe('stats_pairwise_deviation', () => {
	test('stats_pairwise_deviation: pairs within each group', () => {
		const result = stats_pairwise_deviation([
			[100, 110, 100],
			[200, 200, 200]
		]);
		assert.ok(result);
		assert.strictEqual(result.pairs, 6);
		assert.strictEqual(result.median, 0);
		assert.approximately(result.max, 0.1, 1e-12);
		assert.isAtMost(result.p95, result.max);
		assert.isAbove(result.p95, 0);
	});

	test('stats_pairwise_deviation: never across groups', () => {
		const result = stats_pairwise_deviation([[100, 100], [300]]);
		assert.ok(result);
		assert.strictEqual(result.pairs, 1);
		assert.strictEqual(result.max, 0);
	});

	test('stats_pairwise_deviation: nothing to pair', () => {
		assert.strictEqual(stats_pairwise_deviation([]), null);
		assert.strictEqual(stats_pairwise_deviation([[1], [2]]), null);
		assert.strictEqual(
			stats_pairwise_deviation([
				[0, 5],
				[NaN, 3]
			]),
			null
		);
	});

	test('stats_pairwise_deviation: skips values that are not positive', () => {
		const result = stats_pairwise_deviation([[100, 0, 120, -5]]);
		assert.ok(result);
		assert.strictEqual(result.pairs, 1);
		assert.approximately(result.max, 0.2, 1e-12);
	});

	test('stats_pairwise_deviation: extreme values never yield NaN', () => {
		const result = stats_pairwise_deviation([[1e-10, 1e300, 1e300, 1e-10]]);
		assert.ok(result);
		// the two pairs of 1e-10 against 1e300 overflow and are skipped
		assert.strictEqual(result.pairs, 2);
		assert.strictEqual(result.median, 0);
		assert.strictEqual(result.p95, 0);
		const tiny = stats_pairwise_deviation([[1e-300, 1e-10]]);
		assert.ok(tiny);
		assert.ok(Number.isFinite(tiny.max));
		assert.isAbove(tiny.max, 1e289);
	});

	test('stats_pairwise_deviation: the same under reversal', () => {
		const groups = [
			[100, 104, 97, 120],
			[50, 55]
		];
		const forward = stats_pairwise_deviation(groups);
		const reversed = stats_pairwise_deviation(groups.map((g) => [...g].reverse()));
		assert.ok(forward && reversed);
		assert.strictEqual(forward.pairs, reversed.pairs);
		assert.approximately(forward.median, reversed.median, 1e-12);
		assert.approximately(forward.p95, reversed.p95, 1e-12);
		assert.approximately(forward.max, reversed.max, 1e-12);
	});
});

describe('stats_outliers_iqr', () => {
	test('stats_outliers_iqr: no outliers', () => {
		const values = [1, 2, 3, 4, 5];
		const result = stats_outliers_iqr(values);
		assert.strictEqual(result.cleaned.length, 5);
		assert.strictEqual(result.outliers.length, 0);
	});

	test('stats_outliers_iqr: with outliers', () => {
		const values = [1, 2, 3, 4, 5, 6, 7, 50];
		const result = stats_outliers_iqr(values);
		assert.include(result.cleaned, 1);
		assert.include(result.cleaned, 7);
		assert.include(result.outliers, 50);
		assert.isAbove(result.outliers.length, 0);
	});

	test('stats_outliers_iqr: small sample', () => {
		const values = [1, 2];
		const result = stats_outliers_iqr(values);
		assert.deepEqual(result.cleaned, values);
		assert.deepEqual(result.outliers, []);
	});

	test('stats_outliers_iqr: custom iqr_multiplier', () => {
		// With lower multiplier, more values become outliers
		const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15];
		const strict = stats_outliers_iqr(values, { iqr_multiplier: 1.0 });
		const lenient = stats_outliers_iqr(values, { iqr_multiplier: 3.0 });

		// Stricter threshold should find more outliers
		assert.isAtLeast(strict.outliers.length, lenient.outliers.length);
	});

	test('stats_outliers_iqr: custom min_sample_size', () => {
		const values = [1, 2, 100];

		// Default min_sample_size is 3, so this should work
		const default_result = stats_outliers_iqr(values);
		assert.strictEqual(default_result.cleaned.length + default_result.outliers.length, 3);

		// With min_sample_size: 5, should skip outlier detection
		const skip_result = stats_outliers_iqr(values, { min_sample_size: 5 });
		assert.deepEqual(skip_result.cleaned, values);
		assert.deepEqual(skip_result.outliers, []);
	});

	test('stats_outliers_iqr: IQR is zero returns all values', () => {
		const values = [5, 5, 5, 5, 5];
		const result = stats_outliers_iqr(values);
		assert.deepEqual(result.cleaned, values);
		assert.deepEqual(result.outliers, []);
	});
});

describe('stats_outliers_mad', () => {
	test('stats_outliers_mad: no outliers', () => {
		const values = [10, 11, 12, 13, 14];
		const result = stats_outliers_mad(values);
		assert.strictEqual(result.cleaned.length, 5);
		assert.strictEqual(result.outliers.length, 0);
	});

	test('stats_outliers_mad: with outliers', () => {
		const values = [10, 11, 12, 13, 14, 100, 200];
		const result = stats_outliers_mad(values);
		assert.include(result.cleaned, 10);
		assert.include(result.cleaned, 14);
		assert.include(result.outliers, 100);
		assert.include(result.outliers, 200);
	});

	test('stats_outliers_mad: custom z_score_threshold', () => {
		const values = [10, 11, 12, 13, 14, 25, 30];

		// Lower threshold = stricter = more outliers
		const strict = stats_outliers_mad(values, { z_score_threshold: 2.0 });
		const lenient = stats_outliers_mad(values, { z_score_threshold: 5.0 });

		assert.isAtLeast(strict.outliers.length, lenient.outliers.length);
	});

	test('stats_outliers_mad: custom min_sample_size', () => {
		const values = [1, 2, 100];

		// With min_sample_size: 5, should skip outlier detection
		const result = stats_outliers_mad(values, { min_sample_size: 5 });
		assert.deepEqual(result.cleaned, values);
		assert.deepEqual(result.outliers, []);
	});

	test('stats_outliers_mad: custom outlier_keep_ratio', () => {
		// Create data that triggers the keep-closest fallback
		// Many potential outliers to trigger the ratio checks
		const values = [1, 2, 3, 4, 5, 100, 200, 300, 400, 500];

		const result = stats_outliers_mad(values, {
			z_score_threshold: 1.0, // Very strict - many outliers
			outlier_ratio_high: 0.1, // Trigger extreme mode quickly
			outlier_ratio_extreme: 0.2, // Trigger keep-closest mode
			outlier_keep_ratio: 0.5 // Keep only 50%
		});

		// Should have kept some values
		assert.isAbove(result.cleaned.length, 0);
		assert.strictEqual(result.cleaned.length + result.outliers.length, values.length);
	});

	test('stats_outliers_mad: MAD is zero falls back to IQR', () => {
		// All same values except one outlier — MAD of deviations will be 0
		// because majority of values are identical
		const values = [5, 5, 5, 5, 100];
		const result = stats_outliers_mad(values);
		// Should fall back to IQR — the IQR of [5,5,5,5,100] has q1=5, q3=5, iqr=0
		// So IQR also returns all values (iqr===0 branch)
		assert.strictEqual(result.cleaned.length + result.outliers.length, values.length);
	});
});

describe('stats_confidence_interval_from_summary', () => {
	test('stats_confidence_interval_from_summary: matches the values form', () => {
		const values = [10, 12, 11, 13, 10, 12, 11];
		const mean = stats_mean(values);
		const std_dev = stats_std_dev_sample(values, mean);

		const ci_from_values = stats_confidence_interval(values);
		const ci_from_summary = stats_confidence_interval_from_summary(mean, std_dev, values.length);

		assert.approximately(ci_from_summary[0], ci_from_values[0], 5e-11);
		assert.approximately(ci_from_summary[1], ci_from_values[1], 5e-11);
	});

	test('stats_confidence_interval_from_summary: t critical value at n - 1', () => {
		const [lower, upper] = stats_confidence_interval_from_summary(100, 10, 12);
		assert.approximately(upper - 100, (2.201 * 10) / Math.sqrt(12), 1e-12);
		assert.approximately(100 - lower, (2.201 * 10) / Math.sqrt(12), 1e-12);
	});

	test('stats_confidence_interval_from_summary: fewer than two samples', () => {
		assert.deepEqual(stats_confidence_interval_from_summary(100, 10, 0), [NaN, NaN]);
		assert.deepEqual(stats_confidence_interval_from_summary(100, 10, 1), [NaN, NaN]);
	});

	test('stats_confidence_interval_from_summary: custom critical value', () => {
		const ci_t = stats_confidence_interval_from_summary(100, 10, 100);
		const ci_99 = stats_confidence_interval_from_summary(100, 10, 100, { critical: 2.626 });
		assert.isAbove(ci_99[1] - ci_99[0], ci_t[1] - ci_t[0]);
	});
});

describe('hypothesis testing utilities', () => {
	test('stats_welch_t_test: equal means', () => {
		const result = stats_welch_t_test(100, 10, 50, 100, 10, 50);
		assert.strictEqual(result.t_statistic, 0);
		assert.isAbove(result.degrees_of_freedom, 0);
	});

	test('stats_welch_t_test: different means', () => {
		const result = stats_welch_t_test(100, 10, 50, 110, 10, 50);
		assert.isBelow(result.t_statistic, 0); // First mean is lower
		assert.isAbove(Math.abs(result.t_statistic), 0);
		assert.isAbove(result.degrees_of_freedom, 0);
	});

	test('stats_welch_t_test: unequal variances', () => {
		// Welch's test handles unequal variances
		const result = stats_welch_t_test(100, 5, 30, 100, 20, 30);
		assert.strictEqual(result.t_statistic, 0);
		// Degrees of freedom should be less than n1 + n2 - 2 due to unequal variances
		assert.isBelow(result.degrees_of_freedom, 58);
	});

	test('stats_normal_cdf: known values', () => {
		// z = 0 should give 0.5
		assert.approximately(stats_normal_cdf(0), 0.5, 0.0005);
		// z = 1.96 should give ~0.975 (97.5th percentile)
		assert.approximately(stats_normal_cdf(1.96), 0.975, 0.005);
		// z = -1.96 should give ~0.025
		assert.approximately(stats_normal_cdf(-1.96), 0.025, 0.005);
		// Extreme values
		assert.isAbove(stats_normal_cdf(3), 0.99);
		assert.isBelow(stats_normal_cdf(-3), 0.01);
	});

	test('stats_ln_gamma: known values', () => {
		// ln(Γ(1)) = ln(0!) = ln(1) = 0
		assert.approximately(stats_ln_gamma(1), 0, 0.000005);
		// ln(Γ(2)) = ln(1!) = ln(1) = 0
		assert.approximately(stats_ln_gamma(2), 0, 0.000005);
		// ln(Γ(3)) = ln(2!) = ln(2) ≈ 0.693
		assert.approximately(stats_ln_gamma(3), Math.log(2), 0.0005);
		// ln(Γ(4)) = ln(3!) = ln(6) ≈ 1.79
		assert.approximately(stats_ln_gamma(4), Math.log(6), 0.0005);
	});

	test('stats_ln_gamma: z < 0.5 uses reflection formula', () => {
		// ln(Γ(0.5)) = ln(√π) ≈ 0.5723649429247
		assert.approximately(stats_ln_gamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-6);
		// ln(Γ(0.25)) — exercises the recursive z<0.5 branch
		const result = stats_ln_gamma(0.25);
		assert.isNumber(result);
		assert.isFinite(result);
		assert.isAbove(result, 0); // Γ(0.25) ≈ 3.6256, so ln should be > 0
	});

	test('stats_incomplete_beta: edge cases', () => {
		// x = 0 should return 0
		assert.strictEqual(stats_incomplete_beta(0, 5, 5), 0);
		// x = 1 should return 1
		assert.strictEqual(stats_incomplete_beta(1, 5, 5), 1);
		// Monotonic: larger x should give larger result
		const low = stats_incomplete_beta(0.3, 5, 5);
		const high = stats_incomplete_beta(0.7, 5, 5);
		assert.isAbove(high, low);
		// Result should be in [0, 1]
		assert.isAbove(stats_incomplete_beta(0.5, 5, 5), 0);
		assert.isBelow(stats_incomplete_beta(0.5, 5, 5), 1);
	});

	test('stats_t_distribution_p_value: known values', () => {
		// Large df approaches normal distribution
		// t = 1.96 with large df should give p ≈ 0.05 (two-tailed)
		assert.approximately(stats_t_distribution_p_value(1.96, 1000), 0.05, 0.05);

		// t = 0 should give p = 1 (no difference)
		assert.approximately(stats_t_distribution_p_value(0, 50), 1, 0.05);

		// Larger t should give smaller p
		const p_small = stats_t_distribution_p_value(2, 50);
		const p_large = stats_t_distribution_p_value(4, 50);
		assert.isBelow(p_large, p_small);
	});

	test('stats_t_distribution_p_value: tabulated values', () => {
		// at the 0.975 quantile the two-sided p-value is 0.05
		const quantiles: Array<[number, number]> = [
			[1, 12.7062],
			[2, 4.30265],
			[5, 2.57058],
			[11, 2.20099],
			[30, 2.04227],
			[60, 2.0003],
			[100, 1.98397],
			[101, 1.98373],
			[1000, 1.96234]
		];
		for (const [df, t] of quantiles) {
			assert.approximately(stats_t_distribution_p_value(t, df), 0.05, 1e-5, `df ${df}`);
		}
		assert.approximately(stats_t_distribution_p_value(1, 30), 0.3253, 1e-4);
		assert.approximately(stats_t_distribution_p_value(2, 5), 0.1019, 1e-4);
		assert.approximately(stats_t_distribution_p_value(1, 1), 0.5, 1e-9);
	});

	test('stats_t_distribution_p_value: large df approaches the normal', () => {
		const normal = 2 * (1 - stats_normal_cdf(1.96));
		assert.approximately(normal, 0.05, 1e-4);
		assert.approximately(stats_t_distribution_p_value(1.96, 1e6), normal, 1e-6);
		assert.approximately(stats_t_distribution_p_value(1.96, 1e9), normal, 1e-6);
		assert.strictEqual(stats_t_distribution_p_value(1.96, Infinity), normal);
	});

	test('stats_t_distribution_p_value: huge df is the normal', () => {
		for (const t of [0, 0.5, 1.96, 5]) {
			const normal = Math.min(1, 2 * (1 - stats_normal_cdf(t)));
			for (const df of [1e13, 1e16, 1e300]) {
				assert.approximately(stats_t_distribution_p_value(t, df), normal, 1e-6, `t ${t} df ${df}`);
			}
			// no jump where the normal takes over
			assert.approximately(
				stats_t_distribution_p_value(t, 1e7),
				stats_t_distribution_p_value(t, 1e7 + 1),
				1e-6,
				`t ${t}`
			);
		}
	});

	test('stats_t_distribution_p_value: t = 0 at huge df is at most 1', () => {
		for (const df of [1e8, 1e300]) {
			const p = stats_t_distribution_p_value(0, df);
			assert.isAtMost(p, 1);
			assert.approximately(p, 1, 1e-6);
		}
	});

	test('stats_t_distribution_p_value: non-positive df', () => {
		assert.isNaN(stats_t_distribution_p_value(2, 0));
		assert.isNaN(stats_t_distribution_p_value(2, -1));
		assert.isNaN(stats_t_distribution_p_value(2, NaN));
	});

	test('stats_t_distribution_p_value: continuous in df', () => {
		let prev = stats_t_distribution_p_value(2, 1);
		for (let df = 2; df <= 300; df++) {
			const p = stats_t_distribution_p_value(2, df);
			assert.isBelow(p, prev, `df ${df}`);
			// no jump where an approximation would take over
			if (df > 10) assert.isBelow(prev - p, 0.005, `df ${df}`);
			prev = p;
		}
	});

	test('stats_t_distribution_p_value: small df', () => {
		// With small df, the t-distribution has heavier tails
		// Same t-value should give larger p with smaller df
		const p_small_df = stats_t_distribution_p_value(2, 5);
		const p_large_df = stats_t_distribution_p_value(2, 100);
		assert.isAbove(p_small_df, p_large_df);
	});
});

describe('NaN handling', () => {
	test('stats_min_max ignores NaN regardless of position', () => {
		// NaN as first element should not poison the result
		assert.deepEqual(stats_min_max([NaN, 1, 3]), { min: 1, max: 3 });
		assert.deepEqual(stats_min_max([1, NaN, 3]), { min: 1, max: 3 });
		assert.deepEqual(stats_min_max([1, 3, NaN]), { min: 1, max: 3 });
		// All NaN
		assert.isNaN(stats_min_max([NaN, NaN]).min);
		assert.isNaN(stats_min_max([NaN, NaN]).max);
		// Single NaN
		assert.isNaN(stats_min_max([NaN]).min);
		assert.isNaN(stats_min_max([NaN]).max);
	});

	test('stats_median filters NaN before computing', () => {
		// NaN should not affect median of valid values
		assert.strictEqual(stats_median([1, NaN, 3]), 2);
		assert.strictEqual(stats_median([NaN, 1, 2]), 1.5);
		assert.strictEqual(stats_median([1, 2, NaN, 3, 4]), 2.5);
		// All NaN
		assert.isNaN(stats_median([NaN, NaN]));
	});
});
