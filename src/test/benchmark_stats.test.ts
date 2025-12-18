import {test} from 'vitest';

import {BenchmarkStats, benchmark_stats_compare} from '$lib/benchmark_stats.js';

test('BenchmarkStats: basic usage', ({expect}) => {
	const timings_ns = [1200, 1300, 1100, 1500, 1200, 1400, 1300];
	const stats = new BenchmarkStats(timings_ns);

	expect(stats.sample_size).toBe(7);
	expect(stats.raw_sample_size).toBe(7);
	expect(stats.failed_iterations).toBe(0);
	expect(stats.mean_ns).toBeCloseTo(1285.7, 1);
	expect(stats.p50_ns).toBeCloseTo(1300, 0);
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
	expect(stats.p50_ns).toBeNaN();
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
	expect(stats.p50_ns).toBe(5000);
	expect(stats.min_ns).toBe(5000);
	expect(stats.max_ns).toBe(5000);
	expect(stats.std_dev_ns).toBe(0);
	expect(stats.cv).toBe(0); // std_dev / mean = 0 / 5000 = 0
});

test('BenchmarkStats: all same values (zero variance)', ({expect}) => {
	const stats = new BenchmarkStats([1000, 1000, 1000, 1000, 1000]);

	expect(stats.mean_ns).toBe(1000);
	expect(stats.p50_ns).toBe(1000);
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

test('BenchmarkStats: percentiles (p90, p95, p99)', ({expect}) => {
	// Create a dataset where percentiles are predictable
	// 100 values from 1 to 100
	const timings_ns = Array.from({length: 100}, (_, i) => i + 1);
	const stats = new BenchmarkStats(timings_ns);

	// With 100 values, percentiles should be close to the value at that position
	expect(stats.p90_ns).toBeGreaterThanOrEqual(89);
	expect(stats.p90_ns).toBeLessThanOrEqual(91);
	expect(stats.p95_ns).toBeGreaterThanOrEqual(94);
	expect(stats.p95_ns).toBeLessThanOrEqual(96);
	expect(stats.p99_ns).toBeGreaterThanOrEqual(98);
	expect(stats.p99_ns).toBeLessThanOrEqual(100);
});

test('BenchmarkStats: confidence interval', ({expect}) => {
	const timings_ns = [100, 102, 98, 101, 99, 100, 103, 97, 100, 101];
	const stats = new BenchmarkStats(timings_ns);

	const [lower, upper] = stats.confidence_interval_ns;

	// CI should bracket the mean
	expect(lower).toBeLessThan(stats.mean_ns);
	expect(upper).toBeGreaterThan(stats.mean_ns);
	// CI should be reasonable (not too wide for this low-variance data)
	expect(upper - lower).toBeLessThan(10);
});

test('BenchmarkStats: two samples', ({expect}) => {
	const stats = new BenchmarkStats([1000, 2000]);

	expect(stats.sample_size).toBe(2);
	expect(stats.mean_ns).toBe(1500);
	expect(stats.p50_ns).toBe(1500);
	expect(stats.min_ns).toBe(1000);
	expect(stats.max_ns).toBe(2000);
});

// benchmark_stats_compare() tests

test('benchmark_stats_compare: clearly faster', ({expect}) => {
	// a is clearly faster than b (1μs vs 2μs)
	const a = new BenchmarkStats(Array(100).fill(1000));
	const b = new BenchmarkStats(Array(100).fill(2000));

	const comparison = benchmark_stats_compare(a, b);

	expect(comparison.faster).toBe('a');
	expect(comparison.speedup_ratio).toBeCloseTo(2, 1);
	expect(comparison.significant).toBe(true);
	expect(comparison.p_value).toBeLessThan(0.05);
	expect(comparison.effect_magnitude).toBe('large');
});

test('benchmark_stats_compare: clearly slower', ({expect}) => {
	// a is clearly slower than b
	const a = new BenchmarkStats(Array(100).fill(3000));
	const b = new BenchmarkStats(Array(100).fill(1000));

	const comparison = benchmark_stats_compare(a, b);

	expect(comparison.faster).toBe('b');
	expect(comparison.speedup_ratio).toBeCloseTo(3, 1);
	expect(comparison.significant).toBe(true);
});

test('benchmark_stats_compare: equal', ({expect}) => {
	// a and b are the same
	const a = new BenchmarkStats(Array(100).fill(1000));
	const b = new BenchmarkStats(Array(100).fill(1000));

	const comparison = benchmark_stats_compare(a, b);

	expect(comparison.faster).toBe('equal');
	expect(comparison.speedup_ratio).toBe(1);
	expect(comparison.effect_magnitude).toBe('negligible');
});

test('benchmark_stats_compare: negligible difference', ({expect}) => {
	// Very small difference with realistic variance
	// The difference between means should be small relative to the variance
	const base_a = 1000;
	const base_b = 1010; // 1% difference
	const variance = 200; // Large variance relative to difference

	// Generate data with variance around each mean
	const a_data = Array.from(
		{length: 100},
		(_, i) => base_a + (i % 5) * (variance / 5) - variance / 2,
	);
	const b_data = Array.from(
		{length: 100},
		(_, i) => base_b + (i % 5) * (variance / 5) - variance / 2,
	);

	const a = new BenchmarkStats(a_data);
	const b = new BenchmarkStats(b_data);

	const comparison = benchmark_stats_compare(a, b);

	// With high variance and small difference, effect should be small or negligible
	expect(['negligible', 'small']).toContain(comparison.effect_magnitude);
});

test('benchmark_stats_compare: empty stats', ({expect}) => {
	const a = new BenchmarkStats([]);
	const b = new BenchmarkStats([1000, 1100, 1200]);

	const comparison = benchmark_stats_compare(a, b);

	expect(comparison.faster).toBe('equal');
	expect(comparison.significant).toBe(false);
	expect(comparison.recommendation).toContain('Insufficient data');
});

test('benchmark_stats_compare: custom alpha', ({expect}) => {
	// Create data with moderate difference
	const a = new BenchmarkStats([1000, 1100, 1200, 1050, 1150]);
	const b = new BenchmarkStats([1500, 1600, 1700, 1550, 1650]);

	// With default alpha (0.05), should be significant
	const comparison_default = benchmark_stats_compare(a, b);
	expect(comparison_default.significant).toBe(true);

	// With very strict alpha (0.001), might not be significant
	const comparison_strict = benchmark_stats_compare(a, b, {alpha: 0.001});
	// p_value should be reported regardless
	expect(comparison_strict.p_value).toBeGreaterThan(0);
});

test('benchmark_stats_compare: confidence interval overlap', ({expect}) => {
	// Overlapping CIs - a and b have close means with variance
	const a_values = [1000, 1100, 1200, 1050, 1150, 1080, 1120, 1090, 1110, 1095];
	const b_values = [1100, 1200, 1300, 1150, 1250, 1180, 1220, 1190, 1210, 1195];

	const a = new BenchmarkStats(a_values);
	const b = new BenchmarkStats(b_values);

	const comparison = benchmark_stats_compare(a, b);

	// These should have overlapping CIs
	expect(typeof comparison.ci_overlap).toBe('boolean');
});

test('benchmark_stats_compare: recommendation string', ({expect}) => {
	const a = new BenchmarkStats(Array(50).fill(1000));
	const b = new BenchmarkStats(Array(50).fill(2000));

	const comparison = benchmark_stats_compare(a, b);

	expect(typeof comparison.recommendation).toBe('string');
	expect(comparison.recommendation.length).toBeGreaterThan(0);
});

test('benchmark_stats_compare: very different sample sizes', ({expect}) => {
	// a has many samples, b has few
	const a_values = Array.from({length: 1000}, (_, i) => 1000 + (i % 10) * 10);
	const b_values = [2000, 2100, 2050, 1950, 2000];

	const a = new BenchmarkStats(a_values);
	const b = new BenchmarkStats(b_values);

	const comparison = benchmark_stats_compare(a, b);

	// Should still produce valid results
	expect(comparison.faster).toBe('a');
	expect(comparison.p_value).toBeGreaterThanOrEqual(0);
	expect(comparison.p_value).toBeLessThanOrEqual(1);
	expect(comparison.effect_size).toBeGreaterThanOrEqual(0);
});

test('benchmark_stats_compare: small vs large sample', ({expect}) => {
	// Very small sample (minimum for stats)
	const a = new BenchmarkStats([1000, 1100, 1050]);
	// Large sample
	const b_values = Array.from({length: 500}, (_, i) => 2000 + (i % 20) * 10);
	const b = new BenchmarkStats(b_values);

	const comparison = benchmark_stats_compare(a, b);

	expect(comparison.faster).toBe('a');
	expect(comparison.speedup_ratio).toBeGreaterThan(1);
	// With unequal sample sizes, Welch's t-test handles this appropriately
	expect(typeof comparison.p_value).toBe('number');
});

test('benchmark_stats_compare: one sample has high variance', ({expect}) => {
	// a is consistent
	const a = new BenchmarkStats(Array(100).fill(1000));
	// b has high variance
	const b_values = Array.from({length: 100}, (_, i) => 1000 + (i % 2 === 0 ? 500 : -500));
	const b = new BenchmarkStats(b_values);

	const comparison = benchmark_stats_compare(a, b);

	// Both have same mean, but different variances
	expect(comparison.effect_magnitude).toBe('negligible');
	expect(comparison.faster).toBe('equal');
});

test('benchmark_stats_compare: both empty', ({expect}) => {
	const a = new BenchmarkStats([]);
	const b = new BenchmarkStats([]);

	const comparison = benchmark_stats_compare(a, b);

	expect(comparison.faster).toBe('equal');
	expect(comparison.significant).toBe(false);
	expect(comparison.recommendation).toContain('Insufficient data');
});

test('benchmark_stats_compare: single sample each', ({expect}) => {
	const a = new BenchmarkStats([1000]);
	const b = new BenchmarkStats([2000]);

	const comparison = benchmark_stats_compare(a, b);

	// With single samples, std_dev is 0
	expect(comparison.faster).toBe('a');
	expect(comparison.speedup_ratio).toBe(2);
	// Zero variance case should still work
	expect(comparison.effect_magnitude).toBe('large');
});
