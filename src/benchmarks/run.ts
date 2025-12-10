/**
 * Unified benchmark runner with baseline comparison.
 *
 * Usage:
 *   gro run src/benchmarks/run.ts          # run and compare against baseline
 *   gro run src/benchmarks/run.ts --save   # run and save as new baseline
 *
 * @module
 */

/* eslint-disable no-console */

import {readFile, writeFile} from 'node:fs/promises';
import {format_file} from '@ryanatkn/gro/format_file.js';

import {Benchmark} from '$lib/benchmark.js';
import {
	benchmark_baseline_save,
	benchmark_baseline_compare,
	benchmark_baseline_format,
} from '$lib/benchmark_baseline.js';
import {slugify} from '$lib/path.js';
import {deep_equal} from '$lib/deep_equal.js';

const save_baseline = process.argv.includes('--save');
const BASELINE_PATH = 'src/benchmarks';
const BASELINE_FILE = `${BASELINE_PATH}/baseline.json`;

// Configure benchmark
const bench = new Benchmark({
	duration_ms: 3000,
	warmup_iterations: 10,
	min_iterations: 50,
});

// ============================================
// Slugify benchmarks
// ============================================

const slugify_title = 'this Is a Test of Things to Do';
const slugify_results: Array<string> = [];

bench.add('slugify', () => {
	slugify_results.push(slugify(slugify_title));
});

bench.add('slugify (no special chars)', () => {
	slugify_results.push(slugify(slugify_title, false));
});

// ============================================
// Deep equal benchmarks
// ============================================

const deep_equal_small_obj = {a: 1, b: 2, c: 3};
const deep_equal_small_obj_copy = {a: 1, b: 2, c: 3};
const deep_equal_nested = {a: {b: {c: {d: 1}}}};
const deep_equal_nested_copy = {a: {b: {c: {d: 1}}}};
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

// ============================================
// Run benchmarks
// ============================================

console.log('Running benchmarks...\n');
await bench.run();

console.log('📊 Benchmark Results\n');
console.log(bench.table());

// ============================================
// Baseline comparison
// ============================================

const comparison = await benchmark_baseline_compare(bench.results(), {
	path: BASELINE_PATH,
	regression_threshold: 1.05, // 5% threshold to reduce noise
	staleness_warning_days: 30,
});

console.log('\n📈 Baseline Comparison\n');
console.log(benchmark_baseline_format(comparison));

if (save_baseline) {
	await benchmark_baseline_save(bench.results(), {path: BASELINE_PATH});
	const content = await readFile(BASELINE_FILE, 'utf-8');
	const formatted = await format_file(content, {filepath: BASELINE_FILE});
	await writeFile(BASELINE_FILE, formatted);
	console.log(`\n✓ Baseline saved to ${BASELINE_FILE}`);
} else if (comparison.baseline_found && comparison.regressions.length > 0) {
	console.log('\n⚠️  Regressions detected. Run with --save to update baseline if intentional.');
}

// Prevent optimization
void slugify_results.length;
void deep_equal_result;
