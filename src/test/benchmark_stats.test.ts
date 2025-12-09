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
	outliers_detect_iqr,
	outliers_detect_mad,
	BenchmarkStats,
} from '$lib/benchmark_stats.js';

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

test('outliers_detect_iqr: no outliers', ({expect}) => {
	const values = [1, 2, 3, 4, 5];
	const result = outliers_detect_iqr(values);
	expect(result.cleaned.length).toBe(5);
	expect(result.outliers.length).toBe(0);
});

test('outliers_detect_iqr: with outliers', ({expect}) => {
	const values = [1, 2, 3, 4, 5, 6, 7, 50];
	const result = outliers_detect_iqr(values);
	expect(result.cleaned).toContain(1);
	expect(result.cleaned).toContain(7);
	expect(result.outliers).toContain(50);
	expect(result.outliers.length).toBeGreaterThan(0);
});

test('outliers_detect_iqr: small sample', ({expect}) => {
	const values = [1, 2];
	const result = outliers_detect_iqr(values);
	expect(result.cleaned).toEqual(values);
	expect(result.outliers).toEqual([]);
});

test('outliers_detect_mad: no outliers', ({expect}) => {
	const values = [10, 11, 12, 13, 14];
	const result = outliers_detect_mad(values);
	expect(result.cleaned.length).toBe(5);
	expect(result.outliers.length).toBe(0);
});

test('outliers_detect_mad: with outliers', ({expect}) => {
	const values = [10, 11, 12, 13, 14, 100, 200];
	const result = outliers_detect_mad(values);
	expect(result.cleaned).toContain(10);
	expect(result.cleaned).toContain(14);
	expect(result.outliers).toContain(100);
	expect(result.outliers).toContain(200);
});

test('BenchmarkStats: basic usage', ({expect}) => {
	const timings_ns = [1200, 1300, 1100, 1500, 1200, 1400, 1300];
	const stats = new BenchmarkStats(timings_ns);

	expect(stats.sample_size).toBe(7);
	expect(stats.raw_sample_size).toBe(7);
	expect(stats.failed_iterations).toBe(0);
	expect(stats.mean_ns).toBeCloseTo(1285.7, 1);
	expect(stats.median_ns).toBeCloseTo(1300, 0);
	expect(stats.min_ns).toBeCloseTo(1100, 0);
	expect(stats.max_ns).toBeCloseTo(1500, 0);
	expect(stats.ops_per_second).toBeGreaterThan(0);
	expect(stats.cv).toBeGreaterThan(0);
});

test('BenchmarkStats: with outliers', ({expect}) => {
	const timings_ns = [1000, 1100, 1200, 1100, 1000, 100_000];
	const stats = new BenchmarkStats(timings_ns);

	expect(stats.outliers_ns).toContain(100_000);
	expect(stats.outlier_ratio).toBeGreaterThan(0);
	expect(stats.sample_size).toBe(5);
	expect(stats.mean_ns).toBeCloseTo(1080, 10);
});

test('BenchmarkStats: with failed iterations', ({expect}) => {
	const timings_ns = [1200, 1300, NaN, 1100, Infinity, -1, 1400];
	const stats = new BenchmarkStats(timings_ns);

	expect(stats.failed_iterations).toBe(3);
	expect(stats.sample_size).toBe(4);
	expect(stats.raw_sample_size).toBe(7);
});

test('BenchmarkStats: empty input', ({expect}) => {
	const stats = new BenchmarkStats([]);

	expect(stats.mean_ns).toBeNaN();
	expect(stats.median_ns).toBeNaN();
	expect(stats.ops_per_second).toBe(0);
	expect(stats.sample_size).toBe(0);
});

test('BenchmarkStats: all invalid', ({expect}) => {
	const stats = new BenchmarkStats([NaN, Infinity, -1]);

	expect(stats.mean_ns).toBeNaN();
	expect(stats.failed_iterations).toBe(3);
	expect(stats.sample_size).toBe(0);
});

test('BenchmarkStats: toString', ({expect}) => {
	const stats = new BenchmarkStats([1000, 1100, 1200]);
	const str = stats.toString();

	expect(str).toContain('mean=');
	expect(str).toContain('ops/sec=');
	expect(str).toContain('cv=');
	expect(str).toContain('samples=');
});

test('BenchmarkStats: single sample', ({expect}) => {
	const stats = new BenchmarkStats([5000]);

	expect(stats.sample_size).toBe(1);
	expect(stats.mean_ns).toBe(5000);
	expect(stats.median_ns).toBe(5000);
	expect(stats.min_ns).toBe(5000);
	expect(stats.max_ns).toBe(5000);
	expect(stats.std_dev_ns).toBe(0);
	expect(stats.cv).toBe(0); // std_dev / mean = 0 / 5000 = 0
});

test('BenchmarkStats: all same values (zero variance)', ({expect}) => {
	const stats = new BenchmarkStats([1000, 1000, 1000, 1000, 1000]);

	expect(stats.mean_ns).toBe(1000);
	expect(stats.median_ns).toBe(1000);
	expect(stats.std_dev_ns).toBe(0);
	expect(stats.cv).toBe(0);
	expect(stats.outliers_ns).toHaveLength(0);
});

test('BenchmarkStats: very large values', ({expect}) => {
	const large = 1_000_000_000; // 1 second in ns
	const stats = new BenchmarkStats([large, large + 1000, large + 2000]);

	expect(stats.mean_ns).toBeCloseTo(large + 1000, 0);
	expect(stats.ops_per_second).toBeCloseTo(1, 1); // ~1 op/sec
});

test('BenchmarkStats: very small values (nanoseconds)', ({expect}) => {
	const stats = new BenchmarkStats([10, 12, 11, 13, 9]);

	expect(stats.mean_ns).toBeCloseTo(11, 0);
	expect(stats.ops_per_second).toBeGreaterThan(80_000_000); // > 80M ops/sec
});
