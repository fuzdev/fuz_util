/**
 * Unified benchmark runner with baseline comparison.
 *
 * Usage:
 *   gro run src/benchmarks/run.ts          # run and compare against baseline
 *   gro run src/benchmarks/run.ts --save   # run and save as new baseline
 */

/* eslint-disable no-console */

import { readFile, writeFile } from 'node:fs/promises';
import { format_file } from '@fuzdev/gro/format_file.ts';
import {
	GIT_LOCAL_PASS_ENV,
	git_current_branch_name,
	git_current_commit_hash,
	to_git_program
} from '@fuzdev/gro/git.ts';
import { spawn } from '@fuzdev/gro/spawn.ts';

import { Benchmark } from '../lib/benchmark.ts';
import {
	benchmark_baseline_create,
	benchmark_baseline_compare,
	benchmark_baseline_format,
	benchmark_baseline_parse,
	benchmark_baseline_serialize
} from '../lib/benchmark_baseline.ts';
import { slugify } from '../lib/path.ts';
import { deep_equal } from '../lib/deep_equal.ts';

const save_baseline = process.argv.includes('--save');
const BASELINE_FILE = 'src/benchmarks/baseline.json';

// Configure benchmark
const bench = new Benchmark({
	duration_ms: 3000,
	warmup_iterations: 10,
	min_iterations: 50
});

//
// Slugify benchmarks
//

const slugify_title = 'this Is a Test of Things to Do';
const slugify_results: Array<string> = [];

bench.add('slugify', () => {
	slugify_results.push(slugify(slugify_title));
});

bench.add('slugify (no special chars)', () => {
	slugify_results.push(slugify(slugify_title, false));
});

//
// Deep equal benchmarks
//

const deep_equal_small_obj = { a: 1, b: 2, c: 3 };
const deep_equal_small_obj_copy = { a: 1, b: 2, c: 3 };
const deep_equal_nested = { a: { b: { c: { d: 1 } } } };
const deep_equal_nested_copy = { a: { b: { c: { d: 1 } } } };
const deep_equal_array = [1, 2, 3, 4, 5];
const deep_equal_array_copy = [1, 2, 3, 4, 5];
let deep_equal_result = false;

bench.add('deep_equal: small objects', () => {
	deep_equal_result = deep_equal(deep_equal_small_obj, deep_equal_small_obj_copy);
});

bench.add('deep_equal: nested objects', () => {
	deep_equal_result = deep_equal(deep_equal_nested, deep_equal_nested_copy);
});

bench.add('deep_equal: arrays', () => {
	deep_equal_result = deep_equal(deep_equal_array, deep_equal_array_copy);
});

bench.add('deep_equal: same reference', () => {
	deep_equal_result = deep_equal(deep_equal_small_obj, deep_equal_small_obj);
});

//
// Run benchmarks
//

console.log('Running benchmarks...\n');
await bench.run();

console.log('📊 Benchmark Results\n');
console.log(bench.table());

//
// Baseline comparison
//

const stored = await readFile(BASELINE_FILE, 'utf-8').catch(() => null);
const parsed = stored === null ? null : benchmark_baseline_parse(stored);
if (parsed && !parsed.ok) console.warn(`Ignoring baseline: ${parsed.message}`);

const comparison = benchmark_baseline_compare(
	bench.results(),
	parsed?.ok ? parsed.baseline : null,
	{
		runtime_version: process.version,
		regression_threshold: 1.05, // 5% threshold to reduce noise
		staleness_warning_days: 30
	}
);

console.log('\n📈 Baseline Comparison\n');
console.log(benchmark_baseline_format(comparison));

if (save_baseline) {
	const git = to_git_program(spawn, { pass_env: GIT_LOCAL_PASS_ENV });
	const baseline = benchmark_baseline_create(bench.results(), {
		git_commit: await git_current_commit_hash(git),
		git_branch: await git_current_branch_name(git),
		runtime_version: process.version
	});
	await writeFile(
		BASELINE_FILE,
		format_file(benchmark_baseline_serialize(baseline), { filepath: BASELINE_FILE })
	);
	console.log(`\n✓ Baseline saved to ${BASELINE_FILE}`);
} else if (comparison.baseline_found) {
	if (comparison.regressions.length > 0) {
		console.log('\n⚠️  Regressions detected. Run with --save to update baseline if intentional.');
	}
	if (comparison.methodology_changed.length > 0) {
		console.log(
			'\n⚠️  Methodology changed on some tasks. Re-run with --save to update the baseline and surface any drift masked by the budget change.'
		);
	}
	// Tally noise warnings across the three Welch-eligible buckets — a
	// methodology_changed row gets its own banner above, so don't double-count.
	const noise_count =
		comparison.regressions.filter((r) => r.noise_warning).length +
		comparison.improvements.filter((r) => r.noise_warning).length +
		comparison.unchanged.filter((r) => r.noise_warning).length;
	if (noise_count > 0) {
		console.log(
			`\n⚠️  ${
				noise_count
			} task(s) flagged with high measurement noise. Treat their significance calls with skepticism; consider rerunning on quieter hardware.`
		);
	}
}

// Prevent optimization
slugify_results.length;
deep_equal_result;
