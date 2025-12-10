import {test} from 'vitest';

import {
	stats_mean,
	stats_median,
	stats_std_dev,
	stats_variance,
	stats_percentile,
	stats_cv,
	stats_min_max,
	stats_confidence_interval,
	stats_outliers_iqr,
	stats_outliers_mad,
	confidence_level_to_z_score,
	CONFIDENCE_Z_SCORES,
} from '$lib/stats.js';

test('stats_mean', ({expect}) => {
	expect(stats_mean([1, 2, 3, 4, 5])).toBe(3);
	expect(stats_mean([10])).toBe(10);
	expect(stats_mean([])).toBeNaN();
	expect(stats_mean([1.5, 2.5, 3.5])).toBeCloseTo(2.5);
});

test('stats_median', ({expect}) => {
	expect(stats_median([1, 2, 3, 4, 5])).toBe(3);
	expect(stats_median([1, 2, 3, 4])).toBe(2.5);
	expect(stats_median([5, 1, 3, 2, 4])).toBe(3);
	expect(stats_median([10])).toBe(10);
	expect(stats_median([])).toBeNaN();
});

test('stats_std_dev', ({expect}) => {
	expect(stats_std_dev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 0);
	expect(stats_std_dev([1, 1, 1, 1])).toBe(0);
	expect(stats_std_dev([])).toBeNaN();
});

test('stats_variance', ({expect}) => {
	expect(stats_variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4, 0);
	expect(stats_variance([1, 1, 1, 1])).toBe(0);
	expect(stats_variance([])).toBeNaN();
});

test('stats_percentile: uses R-7 linear interpolation', ({expect}) => {
	const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

	// p=0.5 with 10 values: index = 9 * 0.5 = 4.5, interpolate between 5 and 6
	expect(stats_percentile(values, 0.5)).toBe(5.5);

	// p=0.25 with 10 values: index = 9 * 0.25 = 2.25, interpolate between 3 and 4
	expect(stats_percentile(values, 0.25)).toBeCloseTo(3.25, 10);

	// p=0.75 with 10 values: index = 9 * 0.75 = 6.75, interpolate between 7 and 8
	expect(stats_percentile(values, 0.75)).toBeCloseTo(7.75, 10);

	// Exact index values (no interpolation needed)
	expect(stats_percentile(values, 0)).toBe(1); // index = 0
	expect(stats_percentile(values, 1.0)).toBe(10); // index = 9

	expect(stats_percentile([], 0.5)).toBeNaN();
});

test('stats_percentile: edge cases', ({expect}) => {
	const values = [1, 2, 3, 4, 5];

	// p=0 should return first element
	expect(stats_percentile(values, 0)).toBe(1);

	// p=1.0 should return last element
	expect(stats_percentile(values, 1.0)).toBe(5);

	// p=0.5 with 5 values: index = 4 * 0.5 = 2, returns 3 (no interpolation)
	expect(stats_percentile(values, 0.5)).toBe(3);

	// Single element array
	expect(stats_percentile([42], 0)).toBe(42);
	expect(stats_percentile([42], 0.5)).toBe(42);
	expect(stats_percentile([42], 1.0)).toBe(42);

	// Two element array with interpolation
	expect(stats_percentile([10, 20], 0.5)).toBe(15);
	expect(stats_percentile([10, 20], 0.25)).toBe(12.5);
	expect(stats_percentile([10, 20], 0.75)).toBe(17.5);
});

test('stats_cv', ({expect}) => {
	expect(stats_cv(100, 10)).toBe(0.1);
	expect(stats_cv(50, 5)).toBe(0.1);
	expect(stats_cv(0, 5)).toBeNaN();
});

test('stats_min_max', ({expect}) => {
	expect(stats_min_max([5, 1, 9, 3, 7])).toEqual({min: 1, max: 9});
	expect(stats_min_max([42])).toEqual({min: 42, max: 42});
	expect(stats_min_max([])).toEqual({min: NaN, max: NaN});
});

test('stats_confidence_interval', ({expect}) => {
	const values = [10, 12, 11, 13, 10, 12, 11];
	const [lower, upper] = stats_confidence_interval(values);
	expect(lower).toBeCloseTo(10.5, 0);
	expect(upper).toBeCloseTo(12.0, 0);
	expect(stats_confidence_interval([])).toEqual([NaN, NaN]);
});

test('stats_outliers_iqr: no outliers', ({expect}) => {
	const values = [1, 2, 3, 4, 5];
	const result = stats_outliers_iqr(values);
	expect(result.cleaned.length).toBe(5);
	expect(result.outliers.length).toBe(0);
});

test('stats_outliers_iqr: with outliers', ({expect}) => {
	const values = [1, 2, 3, 4, 5, 6, 7, 50];
	const result = stats_outliers_iqr(values);
	expect(result.cleaned).toContain(1);
	expect(result.cleaned).toContain(7);
	expect(result.outliers).toContain(50);
	expect(result.outliers.length).toBeGreaterThan(0);
});

test('stats_outliers_iqr: small sample', ({expect}) => {
	const values = [1, 2];
	const result = stats_outliers_iqr(values);
	expect(result.cleaned).toEqual(values);
	expect(result.outliers).toEqual([]);
});

test('stats_outliers_mad: no outliers', ({expect}) => {
	const values = [10, 11, 12, 13, 14];
	const result = stats_outliers_mad(values);
	expect(result.cleaned.length).toBe(5);
	expect(result.outliers.length).toBe(0);
});

test('stats_outliers_mad: with outliers', ({expect}) => {
	const values = [10, 11, 12, 13, 14, 100, 200];
	const result = stats_outliers_mad(values);
	expect(result.cleaned).toContain(10);
	expect(result.cleaned).toContain(14);
	expect(result.outliers).toContain(100);
	expect(result.outliers).toContain(200);
});

// Tests for custom options

test('stats_outliers_iqr: custom iqr_multiplier', ({expect}) => {
	// With lower multiplier, more values become outliers
	const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15];
	const strict = stats_outliers_iqr(values, {iqr_multiplier: 1.0});
	const lenient = stats_outliers_iqr(values, {iqr_multiplier: 3.0});

	// Stricter threshold should find more outliers
	expect(strict.outliers.length).toBeGreaterThanOrEqual(lenient.outliers.length);
});

test('stats_outliers_iqr: custom min_sample_size', ({expect}) => {
	const values = [1, 2, 100];

	// Default min_sample_size is 3, so this should work
	const default_result = stats_outliers_iqr(values);
	expect(default_result.cleaned.length + default_result.outliers.length).toBe(3);

	// With min_sample_size: 5, should skip outlier detection
	const skip_result = stats_outliers_iqr(values, {min_sample_size: 5});
	expect(skip_result.cleaned).toEqual(values);
	expect(skip_result.outliers).toEqual([]);
});

test('stats_outliers_mad: custom z_score_threshold', ({expect}) => {
	const values = [10, 11, 12, 13, 14, 25, 30];

	// Lower threshold = stricter = more outliers
	const strict = stats_outliers_mad(values, {z_score_threshold: 2.0});
	const lenient = stats_outliers_mad(values, {z_score_threshold: 5.0});

	expect(strict.outliers.length).toBeGreaterThanOrEqual(lenient.outliers.length);
});

test('stats_outliers_mad: custom min_sample_size', ({expect}) => {
	const values = [1, 2, 100];

	// With min_sample_size: 5, should skip outlier detection
	const result = stats_outliers_mad(values, {min_sample_size: 5});
	expect(result.cleaned).toEqual(values);
	expect(result.outliers).toEqual([]);
});

test('stats_outliers_mad: custom outlier_keep_ratio', ({expect}) => {
	// Create data that triggers the keep-closest fallback
	// Many potential outliers to trigger the ratio checks
	const values = [1, 2, 3, 4, 5, 100, 200, 300, 400, 500];

	const result = stats_outliers_mad(values, {
		z_score_threshold: 1.0, // Very strict - many outliers
		outlier_ratio_high: 0.1, // Trigger extreme mode quickly
		outlier_ratio_extreme: 0.2, // Trigger keep-closest mode
		outlier_keep_ratio: 0.5, // Keep only 50%
	});

	// Should have kept some values
	expect(result.cleaned.length).toBeGreaterThan(0);
	expect(result.cleaned.length + result.outliers.length).toBe(values.length);
});

test('stats_confidence_interval: custom z_score', ({expect}) => {
	const values = [10, 11, 12, 13, 14, 15];

	// 95% CI (default, z=1.96)
	const ci_95 = stats_confidence_interval(values);

	// 99% CI (z=2.576) should be wider
	const ci_99 = stats_confidence_interval(values, {z_score: 2.576});

	const width_95 = ci_95[1] - ci_95[0];
	const width_99 = ci_99[1] - ci_99[0];

	expect(width_99).toBeGreaterThan(width_95);
});

test('stats_confidence_interval: 68% CI', ({expect}) => {
	const values = [10, 11, 12, 13, 14, 15];

	// 68% CI (z=1.0) should be narrower than 95%
	const ci_68 = stats_confidence_interval(values, {z_score: 1.0});
	const ci_95 = stats_confidence_interval(values);

	const width_68 = ci_68[1] - ci_68[0];
	const width_95 = ci_95[1] - ci_95[0];

	expect(width_68).toBeLessThan(width_95);
});

test('stats_confidence_interval: confidence_level option', ({expect}) => {
	const values = [10, 11, 12, 13, 14, 15];

	// Using confidence_level instead of z_score
	const ci_95 = stats_confidence_interval(values, {confidence_level: 0.95});
	const ci_99 = stats_confidence_interval(values, {confidence_level: 0.99});

	const width_95 = ci_95[1] - ci_95[0];
	const width_99 = ci_99[1] - ci_99[0];

	// 99% CI should be wider than 95%
	expect(width_99).toBeGreaterThan(width_95);
});

test('stats_confidence_interval: z_score takes precedence over confidence_level', ({expect}) => {
	const values = [10, 11, 12, 13, 14, 15];

	// z_score should override confidence_level
	const ci = stats_confidence_interval(values, {
		z_score: 1.0,
		confidence_level: 0.99, // This should be ignored
	});

	// Compare to just z_score: 1.0
	const ci_z = stats_confidence_interval(values, {z_score: 1.0});

	expect(ci[0]).toBeCloseTo(ci_z[0], 10);
	expect(ci[1]).toBeCloseTo(ci_z[1], 10);
});

// confidence_level_to_z_score tests

test('confidence_level_to_z_score: lookup table values', ({expect}) => {
	expect(confidence_level_to_z_score(0.8)).toBe(CONFIDENCE_Z_SCORES[0.8]);
	expect(confidence_level_to_z_score(0.9)).toBe(CONFIDENCE_Z_SCORES[0.9]);
	expect(confidence_level_to_z_score(0.95)).toBe(CONFIDENCE_Z_SCORES[0.95]);
	expect(confidence_level_to_z_score(0.99)).toBe(CONFIDENCE_Z_SCORES[0.99]);
	expect(confidence_level_to_z_score(0.999)).toBe(CONFIDENCE_Z_SCORES[0.999]);
});

test('confidence_level_to_z_score: approximation for non-lookup values', ({expect}) => {
	// 0.85 is not in lookup table, should approximate
	const z_85 = confidence_level_to_z_score(0.85);
	// Should be between 80% and 90% z-scores
	expect(z_85).toBeGreaterThan(CONFIDENCE_Z_SCORES[0.8]!);
	expect(z_85).toBeLessThan(CONFIDENCE_Z_SCORES[0.9]!);
});

test('confidence_level_to_z_score: edge cases throw', ({expect}) => {
	expect(() => confidence_level_to_z_score(0)).toThrow();
	expect(() => confidence_level_to_z_score(1)).toThrow();
	expect(() => confidence_level_to_z_score(-0.5)).toThrow();
	expect(() => confidence_level_to_z_score(1.5)).toThrow();
});

test('confidence_level_to_z_score: reasonable approximations', ({expect}) => {
	// Test that approximation produces reasonable values
	// Higher confidence = higher z-score
	const z_70 = confidence_level_to_z_score(0.7);
	const z_75 = confidence_level_to_z_score(0.75);
	const z_80 = confidence_level_to_z_score(0.8);

	expect(z_70).toBeLessThan(z_75);
	expect(z_75).toBeLessThan(z_80);

	// z-scores should be positive for all reasonable confidence levels
	expect(z_70).toBeGreaterThan(0);
});
