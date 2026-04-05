import {describe, test, assert} from 'vitest';

import {BenchmarkStats, benchmark_stats_compare} from '$lib/benchmark_stats.js';

describe('BenchmarkStats', () => {
	test('basic usage', () => {
		const timings_ns = [1200, 1300, 1100, 1500, 1200, 1400, 1300];
		const stats = new BenchmarkStats(timings_ns);

		assert.strictEqual(stats.sample_size, 7);
		assert.strictEqual(stats.raw_sample_size, 7);
		assert.strictEqual(stats.failed_iterations, 0);
		assert.approximately(stats.mean_ns, 1285.7, 0.05);
		assert.approximately(stats.p50_ns, 1300, 0.5);
		assert.approximately(stats.min_ns, 1100, 0.5);
		assert.approximately(stats.max_ns, 1500, 0.5);
		assert.isAbove(stats.ops_per_second, 0);
		assert.isAbove(stats.cv, 0);
	});

	test('with outliers', () => {
		const timings_ns = [1000, 1100, 1200, 1100, 1000, 100_000];
		const stats = new BenchmarkStats(timings_ns);

		assert.include(stats.outliers_ns, 100_000);
		assert.isAbove(stats.outlier_ratio, 0);
		assert.strictEqual(stats.sample_size, 5);
		assert.approximately(stats.mean_ns, 1080, 1);
	});

	test('with failed iterations', () => {
		const timings_ns = [1200, 1300, NaN, 1100, Infinity, -1, 1400];
		const stats = new BenchmarkStats(timings_ns);

		assert.strictEqual(stats.failed_iterations, 3);
		assert.strictEqual(stats.sample_size, 4);
		assert.strictEqual(stats.raw_sample_size, 7);
	});

	test('empty input', () => {
		const stats = new BenchmarkStats([]);

		assert.isNaN(stats.mean_ns);
		assert.isNaN(stats.p50_ns);
		assert.strictEqual(stats.ops_per_second, 0);
		assert.strictEqual(stats.sample_size, 0);
	});

	test('all invalid', () => {
		const stats = new BenchmarkStats([NaN, Infinity, -1]);

		assert.isNaN(stats.mean_ns);
		assert.strictEqual(stats.failed_iterations, 3);
		assert.strictEqual(stats.sample_size, 0);
	});

	test('toString', () => {
		const stats = new BenchmarkStats([1000, 1100, 1200]);
		const str = stats.toString();

		assert.include(str, 'mean=');
		assert.include(str, 'ops/sec=');
		assert.include(str, 'cv=');
		assert.include(str, 'samples=');
	});

	test('single sample', () => {
		const stats = new BenchmarkStats([5000]);

		assert.strictEqual(stats.sample_size, 1);
		assert.strictEqual(stats.mean_ns, 5000);
		assert.strictEqual(stats.p50_ns, 5000);
		assert.strictEqual(stats.min_ns, 5000);
		assert.strictEqual(stats.max_ns, 5000);
		assert.strictEqual(stats.std_dev_ns, 0);
		assert.strictEqual(stats.cv, 0);
	});

	test('all same values (zero variance)', () => {
		const stats = new BenchmarkStats([1000, 1000, 1000, 1000, 1000]);

		assert.strictEqual(stats.mean_ns, 1000);
		assert.strictEqual(stats.p50_ns, 1000);
		assert.strictEqual(stats.std_dev_ns, 0);
		assert.strictEqual(stats.cv, 0);
		assert.lengthOf(stats.outliers_ns, 0);
	});

	test('very large values', () => {
		const large = 1_000_000_000; // 1 second in ns
		const stats = new BenchmarkStats([large, large + 1000, large + 2000]);

		assert.approximately(stats.mean_ns, large + 1000, 0.5);
		assert.approximately(stats.ops_per_second, 1, 0.05);
	});

	test('very small values (nanoseconds)', () => {
		const stats = new BenchmarkStats([10, 12, 11, 13, 9]);

		assert.approximately(stats.mean_ns, 11, 0.5);
		assert.isAbove(stats.ops_per_second, 80_000_000);
	});

	test('percentiles (p90, p95, p99)', () => {
		// 100 values from 1 to 100 — percentiles are predictable
		const timings_ns = Array.from({length: 100}, (_, i) => i + 1);
		const stats = new BenchmarkStats(timings_ns);

		assert.isAtLeast(stats.p90_ns, 89);
		assert.isAtMost(stats.p90_ns, 91);
		assert.isAtLeast(stats.p95_ns, 94);
		assert.isAtMost(stats.p95_ns, 96);
		assert.isAtLeast(stats.p99_ns, 98);
		assert.isAtMost(stats.p99_ns, 100);
	});

	test('confidence interval', () => {
		const timings_ns = [100, 102, 98, 101, 99, 100, 103, 97, 100, 101];
		const stats = new BenchmarkStats(timings_ns);

		const [lower, upper] = stats.confidence_interval_ns;

		// CI should bracket the mean
		assert.isBelow(lower, stats.mean_ns);
		assert.isAbove(upper, stats.mean_ns);
		// CI should be reasonable (not too wide for this low-variance data)
		assert.isBelow(upper - lower, 10);
	});

	test('two samples', () => {
		const stats = new BenchmarkStats([1000, 2000]);

		assert.strictEqual(stats.sample_size, 2);
		assert.strictEqual(stats.mean_ns, 1500);
		assert.strictEqual(stats.p50_ns, 1500);
		assert.strictEqual(stats.min_ns, 1000);
		assert.strictEqual(stats.max_ns, 2000);
	});
});

describe('benchmark_stats_compare', () => {
	test('clearly faster', () => {
		// a is clearly faster than b (1μs vs 2μs)
		const a = new BenchmarkStats(Array(100).fill(1000));
		const b = new BenchmarkStats(Array(100).fill(2000));

		const comparison = benchmark_stats_compare(a, b);

		assert.strictEqual(comparison.faster, 'a');
		assert.approximately(comparison.speedup_ratio, 2, 0.05);
		assert.isTrue(comparison.significant);
		assert.isBelow(comparison.p_value, 0.05);
		assert.strictEqual(comparison.effect_magnitude, 'large');
	});

	test('clearly slower', () => {
		// a is clearly slower than b
		const a = new BenchmarkStats(Array(100).fill(3000));
		const b = new BenchmarkStats(Array(100).fill(1000));

		const comparison = benchmark_stats_compare(a, b);

		assert.strictEqual(comparison.faster, 'b');
		assert.approximately(comparison.speedup_ratio, 3, 0.05);
		assert.isTrue(comparison.significant);
	});

	test('equal', () => {
		// a and b are the same
		const a = new BenchmarkStats(Array(100).fill(1000));
		const b = new BenchmarkStats(Array(100).fill(1000));

		const comparison = benchmark_stats_compare(a, b);

		assert.strictEqual(comparison.faster, 'equal');
		assert.strictEqual(comparison.speedup_ratio, 1);
		assert.strictEqual(comparison.effect_magnitude, 'negligible');
	});

	test('negligible difference', () => {
		// Very small difference with realistic variance
		const base_a = 1000;
		const base_b = 1010; // 1% difference
		const variance = 200; // Large variance relative to difference

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
		assert.include(['negligible', 'small'], comparison.effect_magnitude);
	});

	test('empty stats', () => {
		const a = new BenchmarkStats([]);
		const b = new BenchmarkStats([1000, 1100, 1200]);

		const comparison = benchmark_stats_compare(a, b);

		assert.strictEqual(comparison.faster, 'equal');
		assert.isFalse(comparison.significant);
		assert.include(comparison.recommendation, 'Insufficient data');
	});

	test('custom alpha', () => {
		// Create data with moderate difference
		const a = new BenchmarkStats([1000, 1100, 1200, 1050, 1150]);
		const b = new BenchmarkStats([1500, 1600, 1700, 1550, 1650]);

		// With default alpha (0.05), should be significant
		const comparison_default = benchmark_stats_compare(a, b);
		assert.isTrue(comparison_default.significant);

		// With very strict alpha (0.001), might not be significant
		const comparison_strict = benchmark_stats_compare(a, b, {alpha: 0.001});
		// p_value should be reported regardless
		assert.isAbove(comparison_strict.p_value, 0);
	});

	test('confidence interval overlap with very close means', () => {
		// Nearly identical distributions — CIs should overlap
		const a_values = [1000, 1010, 990, 1005, 995, 1008, 992, 1003, 997, 1001];
		const b_values = [1005, 1015, 995, 1010, 1000, 1013, 997, 1008, 1002, 1006];

		const a = new BenchmarkStats(a_values);
		const b = new BenchmarkStats(b_values);

		const comparison = benchmark_stats_compare(a, b);

		assert.isTrue(comparison.ci_overlap);
	});

	test('confidence interval no overlap with distant means', () => {
		// Non-overlapping CIs — a and b have very different means
		const a = new BenchmarkStats(Array(100).fill(1000));
		const b = new BenchmarkStats(Array(100).fill(5000));

		const comparison = benchmark_stats_compare(a, b);

		assert.isFalse(comparison.ci_overlap);
	});

	test('recommendation string', () => {
		const a = new BenchmarkStats(Array(50).fill(1000));
		const b = new BenchmarkStats(Array(50).fill(2000));

		const comparison = benchmark_stats_compare(a, b);

		assert.isString(comparison.recommendation);
		assert.isAbove(comparison.recommendation.length, 0);
	});

	test('very different sample sizes', () => {
		// a has many samples, b has few
		const a_values = Array.from({length: 1000}, (_, i) => 1000 + (i % 10) * 10);
		const b_values = [2000, 2100, 2050, 1950, 2000];

		const a = new BenchmarkStats(a_values);
		const b = new BenchmarkStats(b_values);

		const comparison = benchmark_stats_compare(a, b);

		assert.strictEqual(comparison.faster, 'a');
		assert.isAtLeast(comparison.p_value, 0);
		assert.isAtMost(comparison.p_value, 1);
		assert.isAtLeast(comparison.effect_size, 0);
	});

	test('small vs large sample', () => {
		// Very small sample (minimum for stats)
		const a = new BenchmarkStats([1000, 1100, 1050]);
		// Large sample
		const b_values = Array.from({length: 500}, (_, i) => 2000 + (i % 20) * 10);
		const b = new BenchmarkStats(b_values);

		const comparison = benchmark_stats_compare(a, b);

		assert.strictEqual(comparison.faster, 'a');
		assert.isAbove(comparison.speedup_ratio, 1);
		// With unequal sample sizes, Welch's t-test handles this appropriately
		assert.isNumber(comparison.p_value);
	});

	test('one sample has high variance', () => {
		// a is consistent
		const a = new BenchmarkStats(Array(100).fill(1000));
		// b has high variance
		const b_values = Array.from({length: 100}, (_, i) => 1000 + (i % 2 === 0 ? 500 : -500));
		const b = new BenchmarkStats(b_values);

		const comparison = benchmark_stats_compare(a, b);

		// Both have same mean, but different variances
		assert.strictEqual(comparison.effect_magnitude, 'negligible');
		assert.strictEqual(comparison.faster, 'equal');
	});

	test('both empty', () => {
		const a = new BenchmarkStats([]);
		const b = new BenchmarkStats([]);

		const comparison = benchmark_stats_compare(a, b);

		assert.strictEqual(comparison.faster, 'equal');
		assert.isFalse(comparison.significant);
		assert.include(comparison.recommendation, 'Insufficient data');
	});

	test('single sample each', () => {
		const a = new BenchmarkStats([1000]);
		const b = new BenchmarkStats([2000]);

		const comparison = benchmark_stats_compare(a, b);

		// With single samples, std_dev is 0
		assert.strictEqual(comparison.faster, 'a');
		assert.strictEqual(comparison.speedup_ratio, 2);
		// Zero variance case should still work
		assert.strictEqual(comparison.effect_magnitude, 'large');
	});

	test('percent_difference is computed', () => {
		const a = new BenchmarkStats(Array(100).fill(1000));
		const b = new BenchmarkStats(Array(100).fill(2000));

		const comparison = benchmark_stats_compare(a, b);

		// speedup_ratio = 2.0, so percent_difference = 1.0 (100%)
		assert.approximately(comparison.percent_difference, 1.0, 0.005);
	});

	test('small percent difference is negligible', () => {
		// 2% difference with realistic variance — exercises the actual large-n oversensitivity path
		// Values cycle through offsets to produce ~3% CV, giving non-zero std_dev
		const a_data = Array.from({length: 1000}, (_, i) => 10000 + ((i % 11) - 5) * 100);
		const b_data = Array.from({length: 1000}, (_, i) => 10200 + ((i % 11) - 5) * 100);
		const a = new BenchmarkStats(a_data);
		const b = new BenchmarkStats(b_data);

		const comparison = benchmark_stats_compare(a, b);

		// 2% difference should be negligible despite large n making p≈0 via Welch's t-test
		assert.approximately(comparison.percent_difference, 0.02, 0.05);
		assert.strictEqual(comparison.effect_magnitude, 'negligible');
		assert.isFalse(comparison.significant);
		assert.strictEqual(comparison.faster, 'equal');
		// the t-test itself DOES detect the difference — that's the whole problem we're fixing
		assert.isBelow(comparison.p_value, 0.001);
	});

	test('min_percent_difference option', () => {
		// 15% difference with realistic variance
		const a_data = Array.from({length: 1000}, (_, i) => 10000 + ((i % 11) - 5) * 100);
		const b_data = Array.from({length: 1000}, (_, i) => 11500 + ((i % 11) - 5) * 100);
		const a = new BenchmarkStats(a_data);
		const b = new BenchmarkStats(b_data);

		// With default 10% threshold, 15% is "small" and significant
		const default_comparison = benchmark_stats_compare(a, b);
		assert.strictEqual(default_comparison.effect_magnitude, 'small');
		assert.isTrue(default_comparison.significant);

		// With 20% threshold, 15% is negligible and not significant
		const strict_comparison = benchmark_stats_compare(a, b, {min_percent_difference: 0.2});
		assert.strictEqual(strict_comparison.effect_magnitude, 'negligible');
		assert.isFalse(strict_comparison.significant);
		assert.strictEqual(strict_comparison.faster, 'equal');
	});

	test('effect magnitude scales with min_percent_difference', () => {
		// 30% difference
		const a_data = Array.from({length: 100}, (_, i) => 10000 + ((i % 11) - 5) * 100);
		const b_data = Array.from({length: 100}, (_, i) => 13000 + ((i % 11) - 5) * 100);
		const a = new BenchmarkStats(a_data);
		const b = new BenchmarkStats(b_data);

		// Default min_pct=0.10: 30% < 50% (5*min_pct) → medium
		const comparison = benchmark_stats_compare(a, b);
		assert.strictEqual(comparison.effect_magnitude, 'medium');

		// min_pct=0.20: 30% < 60% (3*min_pct) → small
		const comparison2 = benchmark_stats_compare(a, b, {min_percent_difference: 0.2});
		assert.strictEqual(comparison2.effect_magnitude, 'small');
	});

	test('large n system noise stays negligible', () => {
		// Simulates system-level noise: same code, n=1000, means differ by 3%
		// This is the core scenario that was producing false "large" regressions.
		// Uses realistic variance (CV ~3%) so the test exercises Welch's t-test, not the
		// zero-variance special case.
		const a_data = Array.from({length: 1000}, (_, i) => 10000 + ((i % 11) - 5) * 100);
		const b_data = Array.from({length: 1000}, (_, i) => 10300 + ((i % 11) - 5) * 100);
		const a = new BenchmarkStats(a_data);
		const b = new BenchmarkStats(b_data);

		const comparison = benchmark_stats_compare(a, b);

		// 3% difference should be negligible (below 10% default threshold)
		assert.strictEqual(comparison.effect_magnitude, 'negligible');
		assert.isFalse(comparison.significant);
		assert.strictEqual(comparison.faster, 'equal');
		// p-value is tiny from Welch's t-test (large n, real variance, SE→0) but we
		// gate on practical significance — this is the exact fix for the reported bug
		assert.isBelow(comparison.p_value, 0.001);
		// Cohen's d > 0.8 — the old system classified this as "large" (threshold 0.8),
		// which is exactly the false positive this fix addresses
		assert.isAbove(comparison.effect_size, 0.8);
	});

	test('boundary at min_percent_difference', () => {
		// Exactly at the 10% boundary — should be 'small', not 'negligible'
		const a = new BenchmarkStats(Array(100).fill(10000));
		const b = new BenchmarkStats(Array(100).fill(11000));

		const comparison = benchmark_stats_compare(a, b);

		// 10% = min_pct exactly → NOT < min_pct, so should be 'small'
		assert.approximately(comparison.percent_difference, 0.1, 0.005);
		assert.strictEqual(comparison.effect_magnitude, 'small');
		assert.isTrue(comparison.significant);
	});

	test('large difference with small n and high p', () => {
		// Large percent difference but too few samples / high variance to be statistically significant
		const a = new BenchmarkStats([1000, 3000, 2000]);
		const b = new BenchmarkStats([4000, 6000, 5000]);

		const comparison = benchmark_stats_compare(a, b);

		// percent_difference is large (~150%) but p-value may be > alpha with n=3
		assert.isAbove(comparison.percent_difference, 1.0);
		// Even if not statistically significant, effect_magnitude reflects the percentage
		assert.strictEqual(comparison.effect_magnitude, 'large');
		// recommendation should mention the percentage even without significance
		if (!comparison.significant) {
			assert.include(comparison.recommendation, 'difference observed');
		}
	});
});
