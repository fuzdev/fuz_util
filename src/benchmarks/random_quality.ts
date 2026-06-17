/**
 * PRNG distribution quality report.
 * Runs statistical tests and prints a comparison table across generators.
 *
 * Usage:
 *   gro run src/benchmarks/random_quality.ts          # default (N=1M)
 *   gro run src/benchmarks/random_quality.ts --deep    # thorough (N=10M)
 */

/* eslint-disable no-console */

import {create_random_alea} from '../lib/random_alea.ts';
import {create_random_xoshiro} from '../lib/random_xoshiro.ts';
import {stats_mean, stats_variance} from '../lib/stats.ts';
import {string_display_width, pad_width} from '../lib/string.ts';

import {
	type Prng,
	create_random_lcg,
	create_random_xorshift32,
} from '../test/random_test_helpers.ts';

const deep = process.argv.includes('--deep');
const N = deep ? 10_000_000 : 1_000_000;

// thresholds that scale with sample size
// for a uniform [0,1) distribution, standard error scales as 1/√N
const se = 1 / Math.sqrt(N); // ≈ 0.001 at 1M, ≈ 0.000316 at 10M

interface Generator {
	name: string;
	create: () => Prng;
}

const generators: Array<Generator> = [
	{name: 'Math.random', create: () => Math.random},
	{name: 'Alea', create: () => create_random_alea(42)},
	{name: 'Xoshiro128**', create: () => create_random_xoshiro(42)},
	{name: 'Xorshift32', create: () => create_random_xorshift32(42)},
	{name: 'LCG', create: () => create_random_lcg(42)},
];

const generate_samples = (prng: Prng, count: number): Array<number> => {
	const samples: Array<number> = [];
	for (let i = 0; i < count; i++) {
		samples.push(prng());
	}
	return samples;
};

interface TestResult {
	value: string;
	pass: boolean;
}

type TestFn = (gen: Generator) => TestResult;

interface TestDef {
	name: string;
	ideal: string;
	run: TestFn;
}

const tests: Array<TestDef> = [
	{
		name: 'Mean',
		ideal: '0.5000',
		run: (gen) => {
			const samples = generate_samples(gen.create(), N);
			const mean = stats_mean(samples);
			// SE of mean for uniform = (1/√12)/√N ≈ 0.289 * se
			const threshold = 5 * 0.289 * se; // ~5 sigma
			return {value: mean.toFixed(4), pass: Math.abs(mean - 0.5) < threshold};
		},
	},
	{
		name: 'Variance',
		ideal: '0.0833',
		run: (gen) => {
			const samples = generate_samples(gen.create(), N);
			const variance = stats_variance(samples);
			// variance of sample variance for uniform ≈ harder to derive exactly,
			// use empirical scaling: threshold ∝ 1/√N
			const threshold = 5 * 0.05 * se * Math.sqrt(N) * (1 / Math.sqrt(N)); // ~0.005 at 100k, ~0.0016 at 1M
			return {
				value: variance.toFixed(4),
				pass: Math.abs(variance - 1 / 12) < Math.max(threshold, 0.001),
			};
		},
	},
	{
		name: 'χ² reduced',
		ideal: '~1.0',
		run: (gen) => {
			const k = 100;
			const expected = N / k;
			const prng = gen.create();
			const buckets = new Array(k).fill(0) as Array<number>;
			for (let i = 0; i < N; i++) {
				const b = Math.min(Math.floor(prng() * k), k - 1);
				buckets[b] = (buckets[b] ?? 0) + 1;
			}
			let chi2 = 0;
			for (let i = 0; i < k; i++) {
				const d = buckets[i]! - expected;
				chi2 += (d * d) / expected;
			}
			const reduced = chi2 / (k - 1);
			// std dev of reduced chi-squared ≈ √(2/(k-1)) ≈ 0.142 for k=100
			const chi2_se = Math.sqrt(2 / (k - 1));
			return {value: reduced.toFixed(2), pass: Math.abs(reduced - 1) < 4 * chi2_se};
		},
	},
	{
		name: 'Correlation',
		ideal: '~0.000',
		run: (gen) => {
			const samples = generate_samples(gen.create(), N);
			const mean = stats_mean(samples);
			let num = 0;
			let den = 0;
			for (let i = 0; i < samples.length - 1; i++) {
				const d = samples[i]! - mean;
				num += d * (samples[i + 1]! - mean);
				den += d * d;
			}
			const r = num / den;
			// SE of correlation ≈ 1/√N
			const threshold = 4 * se;
			return {value: r.toFixed(5), pass: Math.abs(r) < threshold};
		},
	},
	{
		name: 'Runs z',
		ideal: '|z|<3',
		run: (gen) => {
			const samples = generate_samples(gen.create(), N);
			let runs = 1;
			for (let i = 1; i < samples.length; i++) {
				if (samples[i - 1]! >= 0.5 !== samples[i]! >= 0.5) runs++;
			}
			const expected_runs = (N + 1) / 2;
			const z = (runs - expected_runs) / Math.sqrt((N - 1) / 4);
			return {value: z.toFixed(2), pass: Math.abs(z) < 3};
		},
	},
	{
		name: 'KS D',
		ideal: `<${(1.63 / Math.sqrt(N)).toFixed(4)}`,
		run: (gen) => {
			const samples = generate_samples(gen.create(), N);
			samples.sort((a, b) => a - b);
			let d_max = 0;
			for (let i = 0; i < samples.length; i++) {
				const d_plus = Math.abs((i + 1) / N - samples[i]!);
				const d_minus = Math.abs(i / N - samples[i]!);
				d_max = Math.max(d_max, d_plus, d_minus);
			}
			// KS critical value at 99% ≈ 1.63/√N
			const threshold = 1.63 / Math.sqrt(N);
			return {value: d_max.toFixed(5), pass: d_max < threshold};
		},
	},
	{
		name: 'Gap χ²',
		ideal: '<3.0',
		run: (gen) => {
			const samples = generate_samples(gen.create(), N);
			const max_bucket = 10;
			const gap_counts = new Array(max_bucket + 1).fill(0) as Array<number>;
			let current_gap = 0;
			let has_first_hit = false;
			let total = 0;
			for (let i = 0; i < samples.length; i++) {
				if (samples[i]! < 0.5) {
					if (has_first_hit) {
						const b = Math.min(current_gap, max_bucket);
						gap_counts[b] = (gap_counts[b] ?? 0) + 1;
						total++;
					}
					has_first_hit = true;
					current_gap = 0;
				} else {
					current_gap++;
				}
			}
			if (total < 100) return {value: 'n/a', pass: false};
			let chi2 = 0;
			for (let k = 0; k <= max_bucket; k++) {
				const p = k < max_bucket ? 0.5 ** (k + 1) : 0.5 ** max_bucket;
				const exp = total * p;
				if (exp > 0) {
					const d = gap_counts[k]! - exp;
					chi2 += (d * d) / exp;
				}
			}
			const reduced = chi2 / max_bucket;
			return {value: reduced.toFixed(2), pass: reduced < 3};
		},
	},
	{
		name: 'Bit freq',
		ideal: '~0.500',
		run: (gen) => {
			const samples = generate_samples(gen.create(), N);
			// test 4 bit positions, report worst deviation
			let worst_prop = 0.5;
			let worst_dev = 0;
			for (let bit = 0; bit < 4; bit++) {
				const div = 2 ** (bit + 1);
				let ones = 0;
				for (let i = 0; i < samples.length; i++) {
					if (Math.floor(samples[i]! * div) % 2 === 1) ones++;
				}
				const prop = ones / N;
				const dev = Math.abs(prop - 0.5);
				if (dev > worst_dev) {
					worst_dev = dev;
					worst_prop = prop;
				}
			}
			// SE of proportion ≈ 0.5/√N, threshold at ~4 sigma
			const threshold = 4 * (0.5 / Math.sqrt(N));
			return {value: worst_prop.toFixed(4), pass: worst_dev < threshold};
		},
	},
	{
		name: 'Perm χ²',
		ideal: '<3.0',
		run: (gen) => {
			const prng = gen.create();
			const n_triples = Math.floor(N / 3);
			const bins = new Array(6).fill(0) as Array<number>;
			for (let i = 0; i < n_triples; i++) {
				const a = prng();
				const b = prng();
				const c = prng();
				let idx: number;
				if (a <= b && b <= c) idx = 0;
				else if (a <= c && c <= b) idx = 1;
				else if (b <= a && a <= c) idx = 2;
				else if (b <= c && c <= a) idx = 3;
				else if (c <= a && a <= b) idx = 4;
				else idx = 5;
				bins[idx] = (bins[idx] ?? 0) + 1;
			}
			const expected = n_triples / 6;
			let chi2 = 0;
			for (let i = 0; i < 6; i++) {
				const d = bins[i]! - expected;
				chi2 += (d * d) / expected;
			}
			const reduced = chi2 / 5;
			return {value: reduced.toFixed(2), pass: reduced < 3};
		},
	},
	{
		name: 'Serial 2D',
		ideal: '<1.5',
		run: (gen) => {
			// 2D serial pairs test: plot (x_i, x_{i+1}) on a k×k grid
			// LCG outputs fall on hyperplanes, leaving many cells empty
			const prng = gen.create();
			const k = 50; // 50×50 = 2500 cells
			const n_pairs = Math.min(N, 1_000_000); // cap to keep fast
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
			let chi2 = 0;
			for (let i = 0; i < k * k; i++) {
				const d = grid[i]! - expected;
				chi2 += (d * d) / expected;
			}
			const df = k * k - 1;
			const reduced = chi2 / df;
			// std dev of reduced chi-squared ≈ √(2/df) ≈ 0.028
			const chi2_se = Math.sqrt(2 / df);
			return {value: reduced.toFixed(2), pass: Math.abs(reduced - 1) < 4 * chi2_se};
		},
	},
	{
		name: 'Birthday z',
		ideal: '|z|<4',
		run: (gen) => {
			// fixed n=1024, M=2^24 — Poisson approximation requires n << √M
			// in deep mode, run multiple trials and average
			const M = 1 << 24;
			const n = 1024;
			const trials = deep ? 10 : 1;
			const lambda = (n * n * n) / (4 * M); // ≈ 16
			let total_collisions = 0;

			for (let t = 0; t < trials; t++) {
				const prng = gen.create();
				// burn past previous trials' values for seeded generators
				for (let i = 0; i < t * n; i++) prng();

				const values: Array<number> = [];
				for (let i = 0; i < n; i++) {
					values.push(Math.floor(prng() * M));
				}
				values.sort((a, b) => a - b);
				const spacings: Array<number> = [];
				for (let i = 1; i < values.length; i++) {
					spacings.push(values[i]! - values[i - 1]!);
				}
				const counts: Map<number, number> = new Map();
				for (const s of spacings) {
					counts.set(s, (counts.get(s) ?? 0) + 1);
				}
				for (const c of counts.values()) {
					if (c >= 2) total_collisions++;
				}
			}

			const avg_collisions = total_collisions / trials;
			const z = (avg_collisions - lambda) / Math.sqrt(lambda / trials);
			return {value: z.toFixed(2), pass: Math.abs(z) < 4};
		},
	},
];

//
// Table rendering helper
//

const render_table = (all_rows: Array<Array<string>>, left_align_cols = 1): string => {
	const col_widths = all_rows[0]!.map((_, col) =>
		Math.max(...all_rows.map((row) => string_display_width(row[col]!))),
	);
	const top = '┌' + col_widths.map((w) => '─'.repeat(w + 2)).join('┬') + '┐';
	const mid = '├' + col_widths.map((w) => '─'.repeat(w + 2)).join('┼') + '┤';
	const bot = '└' + col_widths.map((w) => '─'.repeat(w + 2)).join('┴') + '┘';

	const fmt = (row: Array<string>, is_header: boolean): string => {
		const cells = row.map((cell, i) => {
			const align = i < left_align_cols ? 'left' : 'right';
			return ' ' + pad_width(cell, col_widths[i]!, is_header ? 'left' : align) + ' ';
		});
		return '│' + cells.join('│') + '│';
	};

	const lines: Array<string> = [top, fmt(all_rows[0]!, true), mid];
	for (let i = 1; i < all_rows.length; i++) {
		lines.push(fmt(all_rows[i]!, false));
	}
	lines.push(bot);
	return lines.join('\n');
};

//
// Run main tests
//

const mode = deep ? 'deep' : 'default';
console.log(`\nPRNG Distribution Quality Report (N=${N.toLocaleString()}, ${mode})\n`);

const results: Array<{test_name: string; ideal: string; outcomes: Array<TestResult>}> = [];
for (const t of tests) {
	const outcomes = generators.map((g) => t.run(g));
	results.push({test_name: t.name, ideal: t.ideal, outcomes});
}

// build and render main table
const main_header = ['Test', 'Ideal', ...generators.map((g) => g.name)];
const main_rows: Array<Array<string>> = [main_header];
for (const r of results) {
	main_rows.push([
		r.test_name,
		r.ideal,
		...r.outcomes.map((o) => `${o.value} ${o.pass ? ' ok' : 'FAIL'}`),
	]);
}
console.log(render_table(main_rows, 2));

// score summary
const pass_counts = generators.map((_, gi) =>
	results.reduce((sum, r) => sum + (r.outcomes[gi]!.pass ? 1 : 0), 0),
);
console.log(
	'\nScore: ' + generators.map((g, i) => `${g.name} ${pass_counts[i]}/${tests.length}`).join('  '),
);

//
// Detailed analysis
//

console.log('\n\n── Detailed Analysis ──\n');

// --- Multi-lag correlation ---
{
	const max_lag = 8;
	const n_corr = Math.min(N, 1_000_000);
	console.log(`Autocorrelation by lag (N=${n_corr.toLocaleString()}):\n`);

	const corr_header = ['Lag', ...generators.map((g) => g.name)];
	const corr_rows: Array<Array<string>> = [corr_header];

	// generate samples once per generator
	const all_samples = generators.map((g) => generate_samples(g.create(), n_corr));
	const all_means = all_samples.map((s) => stats_mean(s));

	for (let lag = 1; lag <= max_lag; lag++) {
		const row: Array<string> = [String(lag)];
		for (let gi = 0; gi < generators.length; gi++) {
			const samples = all_samples[gi]!;
			const mean = all_means[gi]!;
			let num = 0;
			let den = 0;
			for (let i = 0; i < samples.length - lag; i++) {
				const d = samples[i]! - mean;
				num += d * (samples[i + lag]! - mean);
				den += d * d;
			}
			const r = num / den;
			const threshold = 4 / Math.sqrt(n_corr);
			const flag = Math.abs(r) > threshold ? ' !' : '';
			row.push(r.toFixed(5) + flag);
		}
		corr_rows.push(row);
	}
	console.log(render_table(corr_rows));
}

// --- Bit frequency breakdown ---
{
	const n_bits = 8;
	const n_freq = Math.min(N, 1_000_000);
	console.log(`\nBit frequency (N=${n_freq.toLocaleString()}, showing proportion of 1s):\n`);

	const bit_header = ['Bit', ...generators.map((g) => g.name)];
	const bit_rows: Array<Array<string>> = [bit_header];

	const all_samples = generators.map((g) => generate_samples(g.create(), n_freq));
	const threshold = 4 * (0.5 / Math.sqrt(n_freq));

	for (let bit = 0; bit < n_bits; bit++) {
		const row: Array<string> = [String(bit)];
		const div = 2 ** (bit + 1);
		for (let gi = 0; gi < generators.length; gi++) {
			const samples = all_samples[gi]!;
			let ones = 0;
			for (let i = 0; i < samples.length; i++) {
				if (Math.floor(samples[i]! * div) % 2 === 1) ones++;
			}
			const prop = ones / n_freq;
			const flag = Math.abs(prop - 0.5) > threshold ? ' !' : '';
			row.push(prop.toFixed(4) + flag);
		}
		bit_rows.push(row);
	}
	console.log(render_table(bit_rows));
}

// --- 2D serial test at multiple grid resolutions ---
{
	const resolutions = [25, 50, 100, 200];
	const n_pairs = Math.min(N, 2_000_000); // need enough to fill fine grids
	console.log(
		`\n2D serial pairs χ² by grid resolution (N=${n_pairs.toLocaleString()}, showing reduced χ²):\n`,
	);

	const grid_header = ['Grid', ...generators.map((g) => g.name)];
	const grid_rows: Array<Array<string>> = [grid_header];

	for (const k of resolutions) {
		const row: Array<string> = [`${k}×${k}`];
		const df = k * k - 1;
		const chi2_se = Math.sqrt(2 / df);

		for (const gen of generators) {
			const prng = gen.create();
			const grid = new Array(k * k).fill(0) as Array<number>;
			let prev = prng();
			for (let i = 0; i < n_pairs; i++) {
				const curr = prng();
				const r = Math.min(Math.floor(prev * k), k - 1);
				const c = Math.min(Math.floor(curr * k), k - 1);
				grid[r * k + c] = (grid[r * k + c] ?? 0) + 1;
				prev = curr;
			}
			const expected = n_pairs / (k * k);
			let chi2 = 0;
			for (let i = 0; i < k * k; i++) {
				const d = grid[i]! - expected;
				chi2 += (d * d) / expected;
			}
			const reduced = chi2 / df;
			const flag = Math.abs(reduced - 1) > 4 * chi2_se ? ' !' : '';
			row.push(reduced.toFixed(3) + flag);
		}
		grid_rows.push(row);
	}
	console.log(render_table(grid_rows));
}

// --- Bucket distribution uniformity ---
{
	const k = 20; // coarser for visual clarity
	const n_buck = Math.min(N, 1_000_000);
	const expected = n_buck / k;
	console.log(
		`\nBucket distribution (N=${n_buck.toLocaleString()}, ${
			k
		} buckets, expected=${expected.toLocaleString()}/bucket):\n`,
	);

	for (const gen of generators) {
		const prng = gen.create();
		const buckets = new Array(k).fill(0) as Array<number>;
		for (let i = 0; i < n_buck; i++) {
			const b = Math.min(Math.floor(prng() * k), k - 1);
			buckets[b] = (buckets[b] ?? 0) + 1;
		}

		// render as a bar chart using block characters
		const max_deviation = Math.max(...buckets.map((b) => Math.abs(b - expected)));
		const bar_width = 30;
		const scale = max_deviation > 0 ? bar_width / max_deviation : 1;

		console.log(`  ${gen.name}:`);
		for (let i = 0; i < k; i++) {
			const deviation = buckets[i]! - expected;
			const bar_len = Math.round(Math.abs(deviation) * scale);
			const bar = deviation >= 0 ? '▓'.repeat(bar_len) : '░'.repeat(bar_len);
			const prefix = deviation >= 0 ? '+' : '-';
			const pct = ((deviation / expected) * 100).toFixed(1);
			const label = `[${(i / k).toFixed(2)}-${((i + 1) / k).toFixed(2)})`;
			console.log(`    ${label} ${prefix}${pct.padStart(4)}% ${bar}`);
		}
		console.log();
	}
}

console.log();
