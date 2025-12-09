import {test} from 'vitest';

import {BenchmarkStats} from '$lib/benchmark_stats.js';

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
