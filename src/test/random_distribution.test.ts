/**
 * Distribution quality tests for PRNGs.
 * Tests uniformity and independence from first principles.
 */

import {describe, test, assert} from 'vitest';

import {create_random_alea} from '$lib/random_alea.ts';
import {create_random_xoshiro} from '$lib/random_xoshiro.ts';
import {stats_mean, stats_variance, stats_std_dev} from '$lib/stats.ts';

import {
	type Prng,
	create_random_lcg,
	create_random_xorshift32,
	create_random_middle_square,
} from './random_test_helpers.ts';

// sample size for most tests
const N = 100_000;

// generator factories — each returns a fresh PRNG
const generators: Array<{name: string; create: () => Prng; expect_good: boolean}> = [
	{name: 'Math.random', create: () => Math.random, expect_good: true},
	{name: 'Alea', create: () => create_random_alea(42), expect_good: true},
	{name: 'Xoshiro128**', create: () => create_random_xoshiro(42), expect_good: true},
	{name: 'Xorshift32', create: () => create_random_xorshift32(42), expect_good: true},
	{name: 'LCG', create: () => create_random_lcg(42), expect_good: false},
	{name: 'Middle Square', create: () => create_random_middle_square(5678), expect_good: false},
];

/** Generate N samples from a PRNG. */
const generate_samples = (prng: Prng, count: number): Array<number> => {
	const samples: Array<number> = [];
	for (let i = 0; i < count; i++) {
		samples.push(prng());
	}
	return samples;
};

describe('bucket uniformity (chi-squared)', () => {
	const k = 100; // number of buckets
	const expected_per_bucket = N / k;

	for (const {name, create, expect_good} of generators) {
		test(name, () => {
			const prng = create();
			const buckets = new Array(k).fill(0) as Array<number>;

			for (let i = 0; i < N; i++) {
				const bucket = Math.min(Math.floor(prng() * k), k - 1);
				buckets[bucket] = (buckets[bucket] ?? 0) + 1;
			}

			let chi_squared = 0;
			for (let i = 0; i < k; i++) {
				const diff = buckets[i]! - expected_per_bucket;
				chi_squared += (diff * diff) / expected_per_bucket;
			}

			// reduced chi-squared should be near 1.0 for uniform distribution
			// k-1 = 99 degrees of freedom
			const reduced = chi_squared / (k - 1);

			if (expect_good) {
				assert.ok(
					reduced > 0.5 && reduced < 1.8,
					`${name}: reduced χ² = ${reduced.toFixed(3)}, expected near 1.0`,
				);
			}
			// for bad generators, just log — they may or may not fail this
		});
	}
});

describe('mean and variance', () => {
	// uniform [0,1): mean = 0.5, variance = 1/12 ≈ 0.08333
	const expected_mean = 0.5;
	const expected_variance = 1 / 12;

	for (const {name, create, expect_good} of generators) {
		test(name, () => {
			const samples = generate_samples(create(), N);
			const mean = stats_mean(samples);
			const variance = stats_variance(samples, mean);

			if (expect_good) {
				assert.ok(
					Math.abs(mean - expected_mean) < 0.005,
					`${name}: mean = ${mean.toFixed(6)}, expected ~${expected_mean}`,
				);
				assert.ok(
					Math.abs(variance - expected_variance) < 0.003,
					`${name}: variance = ${variance.toFixed(6)}, expected ~${expected_variance.toFixed(6)}`,
				);
			}
		});
	}
});

describe('serial correlation', () => {
	for (const {name, create, expect_good} of generators) {
		test(name, () => {
			const samples = generate_samples(create(), N);
			const mean = stats_mean(samples);

			// Pearson correlation between (x_i, x_{i+1})
			let numerator = 0;
			let denominator = 0;
			for (let i = 0; i < samples.length - 1; i++) {
				const d = samples[i]! - mean;
				numerator += d * (samples[i + 1]! - mean);
				denominator += d * d;
			}
			const r = numerator / denominator;

			if (expect_good) {
				// for independent samples, |r| should be ≈ 0 with SE ≈ 1/√N
				assert.ok(
					Math.abs(r) < 0.02,
					`${name}: lag-1 autocorrelation r = ${r.toFixed(6)}, expected near 0`,
				);
			}
		});
	}
});

describe('runs test', () => {
	for (const {name, create, expect_good} of generators) {
		test(name, () => {
			const samples = generate_samples(create(), N);

			// count runs of consecutive values above/below 0.5
			let runs = 1;
			for (let i = 1; i < samples.length; i++) {
				const prev_above = samples[i - 1]! >= 0.5;
				const curr_above = samples[i]! >= 0.5;
				if (prev_above !== curr_above) runs++;
			}

			// for independent Bernoulli(0.5), expected runs ≈ (N+1)/2, variance ≈ (N-1)/4
			const expected_runs = (N + 1) / 2;
			const std_dev_runs = Math.sqrt((N - 1) / 4);
			const z = (runs - expected_runs) / std_dev_runs;

			if (expect_good) {
				assert.ok(Math.abs(z) < 3, `${name}: runs z-score = ${z.toFixed(3)}, expected |z| < 3`);
			}
		});
	}
});

describe('gap test', () => {
	for (const {name, create, expect_good} of generators) {
		test(name, () => {
			const samples = generate_samples(create(), N);

			// measure gaps between values falling in [0, 0.5)
			const max_gap_bucket = 10;
			const gap_counts = new Array(max_gap_bucket + 1).fill(0) as Array<number>;
			let current_gap = 0;
			let has_first_hit = false;
			let total_gaps = 0;

			for (let i = 0; i < samples.length; i++) {
				if (samples[i]! < 0.5) {
					if (has_first_hit) {
						// record the gap since the previous hit
						const bucket = Math.min(current_gap, max_gap_bucket);
						gap_counts[bucket] = (gap_counts[bucket] ?? 0) + 1;
						total_gaps++;
					}
					has_first_hit = true;
					current_gap = 0;
				} else {
					current_gap++;
				}
			}

			if (total_gaps < 100) return; // not enough data

			// geometric distribution with p=0.5
			// P(gap = k) = (1-p)^k * p = 0.5^(k+1)
			// P(gap >= max_gap_bucket) = 0.5^max_gap_bucket
			let chi_squared = 0;
			const p = 0.5;
			for (let k = 0; k <= max_gap_bucket; k++) {
				let expected_prob: number;
				if (k < max_gap_bucket) {
					expected_prob = (1 - p) ** k * p;
				} else {
					// catch-all bucket for gap >= max_gap_bucket
					expected_prob = (1 - p) ** max_gap_bucket;
				}
				const expected_count = total_gaps * expected_prob;
				if (expected_count > 0) {
					const diff = gap_counts[k]! - expected_count;
					chi_squared += (diff * diff) / expected_count;
				}
			}

			const df = max_gap_bucket; // max_gap_bucket + 1 bins - 1
			const reduced = chi_squared / df;

			if (expect_good) {
				assert.ok(
					reduced < 3,
					`${name}: gap test reduced χ² = ${reduced.toFixed(3)}, expected < 3`,
				);
			}
		});
	}
});

describe('Kolmogorov-Smirnov test', () => {
	for (const {name, create, expect_good} of generators) {
		test(name, () => {
			const samples = generate_samples(create(), N);
			samples.sort((a, b) => a - b);

			// D = max|i/N - x_(i)| over both D+ and D-
			let d_max = 0;
			for (let i = 0; i < samples.length; i++) {
				const empirical_cdf = (i + 1) / N;
				const theoretical_cdf = samples[i]!;
				const d_plus = Math.abs(empirical_cdf - theoretical_cdf);
				const d_minus = Math.abs(i / N - theoretical_cdf);
				d_max = Math.max(d_max, d_plus, d_minus);
			}

			// critical value at 95% ≈ 1.36/√N ≈ 0.0043 for N=100k
			// use generous threshold
			if (expect_good) {
				assert.ok(d_max < 0.007, `${name}: KS D = ${d_max.toFixed(6)}, expected < 0.007`);
			}
		});
	}
});

describe('bit-level frequency', () => {
	for (const {name, create, expect_good} of generators) {
		test(name, () => {
			const samples = generate_samples(create(), N);

			// test multiple "bit positions"
			// bit 0: value >= 0.5
			// bit 1: value in [0.25, 0.5) ∪ [0.75, 1.0) — i.e., floor(value*4) is odd
			// bit 2: floor(value*8) is odd
			const bits_to_test = 4;

			for (let bit = 0; bit < bits_to_test; bit++) {
				const divisor = 2 ** (bit + 1);
				let ones = 0;

				for (let i = 0; i < samples.length; i++) {
					const index = Math.floor(samples[i]! * divisor);
					if (index % 2 === 1) ones++;
				}

				const proportion = ones / N;

				if (expect_good) {
					// SE of proportion ≈ 0.5/√N ≈ 0.00158
					assert.ok(
						Math.abs(proportion - 0.5) < 0.01,
						`${name}: bit ${bit} proportion = ${proportion.toFixed(4)}, expected ~0.5`,
					);
				}
			}
		});
	}
});

describe('permutation test', () => {
	for (const {name, create, expect_good} of generators) {
		test(name, () => {
			const prng = create();
			const n_triples = Math.floor(N / 3);

			// 6 possible orderings of 3 elements
			const bins = new Array(6).fill(0) as Array<number>;

			for (let i = 0; i < n_triples; i++) {
				const a = prng();
				const b = prng();
				const c = prng();

				// encode the ordering as an index 0..5
				let index: number;
				if (a <= b && b <= c) index = 0;
				else if (a <= c && c <= b) index = 1;
				else if (b <= a && a <= c) index = 2;
				else if (b <= c && c <= a) index = 3;
				else if (c <= a && a <= b) index = 4;
				else index = 5; // c <= b <= a

				bins[index] = (bins[index] ?? 0) + 1;
			}

			const expected = n_triples / 6;
			let chi_squared = 0;
			for (let i = 0; i < 6; i++) {
				const diff = bins[i]! - expected;
				chi_squared += (diff * diff) / expected;
			}

			// 5 degrees of freedom
			const reduced = chi_squared / 5;

			if (expect_good) {
				assert.ok(
					reduced < 3,
					`${name}: permutation reduced χ² = ${reduced.toFixed(3)}, expected < 3`,
				);
			}
		});
	}
});

describe('birthday spacings', () => {
	// Marsaglia's birthday spacings test parameters:
	// n=1024 birthdays in M=2^24, count distinct spacing values appearing 2+ times
	// expected count follows Poisson(λ) with λ = n³/(4M) ≈ 16
	const M = 1 << 24;
	const n_samples = 1024;

	for (const {name, create, expect_good} of generators) {
		test(name, () => {
			const prng = create();
			const values: Array<number> = [];

			for (let i = 0; i < n_samples; i++) {
				values.push(Math.floor(prng() * M));
			}

			values.sort((a, b) => a - b);

			// compute spacings between adjacent sorted values
			const spacings: Array<number> = [];
			for (let i = 1; i < values.length; i++) {
				spacings.push(values[i]! - values[i - 1]!);
			}

			// count distinct spacing values that appear 2 or more times
			const spacing_counts: Map<number, number> = new Map();
			for (const s of spacings) {
				spacing_counts.set(s, (spacing_counts.get(s) ?? 0) + 1);
			}
			let collisions = 0;
			for (const count of spacing_counts.values()) {
				if (count >= 2) collisions++;
			}

			// λ = n³/(4M) ≈ 1024³/(4*2^24) = 2^30/2^26 = 16
			const lambda = (n_samples * n_samples * n_samples) / (4 * M);

			if (expect_good) {
				// Poisson(16): mean=16, std_dev=4
				// check z-score is reasonable
				const std_dev_lambda = Math.sqrt(lambda);
				const z = Math.abs(collisions - lambda) / std_dev_lambda;
				assert.ok(
					z < 4,
					`${name}: birthday collisions = ${collisions}, expected ≈ ${lambda.toFixed(
						0,
					)}, z = ${z.toFixed(2)}`,
				);
			}
		});
	}
});

describe('serial pairs (2D lattice)', () => {
	for (const {name, create, expect_good} of generators) {
		test(name, () => {
			// plot consecutive pairs (x_i, x_{i+1}) on a k×k grid
			// LCG outputs fall on hyperplanes, leaving cells non-uniform
			const prng = create();
			const k = 50; // 50×50 = 2500 cells
			const n_pairs = N;
			const grid = new Array(k * k).fill(0) as Array<number>;
			let prev = prng();
			for (let i = 0; i < n_pairs; i++) {
				const curr = prng();
				const row = Math.min(Math.floor(prev * k), k - 1);
				const col = Math.min(Math.floor(curr * k), k - 1);
				grid[row * k + col] = (grid[row * k + col] ?? 0) + 1;
				prev = curr;
			}

			const expected = n_pairs / (k * k);
			let chi_squared = 0;
			for (let i = 0; i < k * k; i++) {
				const d = grid[i]! - expected;
				chi_squared += (d * d) / expected;
			}

			const df = k * k - 1;
			const reduced = chi_squared / df;

			if (expect_good) {
				// std dev of reduced chi-squared ≈ √(2/df) ≈ 0.028
				const chi2_se = Math.sqrt(2 / df);
				assert.ok(
					Math.abs(reduced - 1) < 4 * chi2_se,
					`${name}: 2D serial reduced χ² = ${reduced.toFixed(3)}, expected near 1.0`,
				);
			}
		});
	}
});

describe('bad generators fail at least one test', () => {
	test('Middle Square has poor distribution', () => {
		const prng = create_random_middle_square(5678);
		const samples = generate_samples(prng, 10_000);
		const mean = stats_mean(samples);
		const std_dev = stats_std_dev(samples);

		// middle square degenerates — it cycles through a small set of values
		// the distribution will be highly non-uniform
		// we just verify it's noticeably off from the ideal
		const mean_error = Math.abs(mean - 0.5);
		const std_dev_error = Math.abs(std_dev - Math.sqrt(1 / 12));
		const has_issues = mean_error > 0.01 || std_dev_error > 0.01;

		assert.ok(
			has_issues,
			`Middle Square should show distribution issues (mean_err=${mean_error.toFixed(
				4,
			)}, std_err=${std_dev_error.toFixed(4)})`,
		);
	});
});
