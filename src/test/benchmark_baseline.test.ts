import {describe, test, assert, beforeEach, afterEach} from 'vitest';
import {rm, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

import {
	benchmark_baseline_save,
	benchmark_baseline_load,
	benchmark_baseline_compare,
	benchmark_baseline_format,
	benchmark_baseline_format_json,
} from '$lib/benchmark_baseline.js';
import {Benchmark} from '$lib/benchmark.js';
import {BenchmarkStats} from '$lib/benchmark_stats.js';
import type {BenchmarkResult} from '$lib/benchmark_types.js';

// Construct a synthetic BenchmarkResult with predictable stats.
const create_synthetic_result = (name: string, mean_ns: number): BenchmarkResult => {
	const timings = Array(100).fill(mean_ns);
	return {
		name,
		stats: new BenchmarkStats(timings),
		iterations: 100,
		total_time_ms: (mean_ns * 100) / 1_000_000,
		timings_ns: timings,
	};
};

// Use a unique temp directory for each test run
const test_dir = join(tmpdir(), `benchmark_baseline_test_${Date.now()}`);

// shared mock data for format/format_json tests
const create_mock_baseline_entry = (name: string, mean_ns: number) => ({
	name,
	mean_ns,
	p50_ns: mean_ns,
	std_dev_ns: 100,
	min_ns: mean_ns - 100,
	max_ns: mean_ns + 100,
	p75_ns: mean_ns + 50,
	p90_ns: mean_ns + 80,
	p95_ns: mean_ns + 90,
	p99_ns: mean_ns + 95,
	ops_per_second: Math.round(1_000_000_000 / mean_ns),
	sample_size: 100,
});

const create_mock_regression = (name: string, baseline_ns: number, current_ns: number) => ({
	name,
	baseline: create_mock_baseline_entry(name, baseline_ns),
	current: create_mock_baseline_entry(name, current_ns),
	comparison: {
		faster: 'a' as const,
		speedup_ratio: current_ns / baseline_ns,
		significant: true,
		p_value: 0.001,
		percent_difference: (current_ns - baseline_ns) / baseline_ns,
		effect_size: 5.0,
		effect_magnitude: 'large' as const,
		ci_overlap: false,
		recommendation: 'Regression detected',
	},
});

beforeEach(async () => {
	await mkdir(test_dir, {recursive: true});
});

afterEach(async () => {
	await rm(test_dir, {recursive: true, force: true});
});

describe('benchmark_baseline_save', () => {
	test('roundtrip with benchmark_baseline_load', async () => {
		const bench = new Benchmark({
			duration_ms: 50,
			min_iterations: 5,
		});

		bench.add('task1', () => 1 + 1);
		bench.add('task2', () => 2 + 2);

		await bench.run();

		await benchmark_baseline_save(bench.results(), {path: test_dir});

		const loaded = await benchmark_baseline_load({path: test_dir});

		assert.isNotNull(loaded);
		assert.isDefined(loaded);
		assert.lengthOf(loaded.entries, 2);
		assert.isDefined(loaded.entries[0]);
		assert.isDefined(loaded.entries[1]);
		assert.strictEqual(loaded.entries[0].name, 'task1');
		assert.strictEqual(loaded.entries[1].name, 'task2');
		assert.strictEqual(loaded.node_version, process.version);
		assert.ok(loaded.timestamp);
	});

	test('custom git info', async () => {
		const bench = new Benchmark({
			duration_ms: 50,
			min_iterations: 5,
		});
		bench.add('task1', () => 1 + 1);
		await bench.run();

		await benchmark_baseline_save(bench.results(), {
			path: test_dir,
			git_commit: 'custom_commit_hash',
			git_branch: 'custom_branch',
		});

		const loaded = await benchmark_baseline_load({path: test_dir});

		assert.isNotNull(loaded);
		assert.isDefined(loaded);
		assert.strictEqual(loaded.git_commit, 'custom_commit_hash');
		assert.strictEqual(loaded.git_branch, 'custom_branch');
	});
});

describe('benchmark_baseline_load', () => {
	test('returns null when no baseline exists', async () => {
		const loaded = await benchmark_baseline_load({path: test_dir});
		assert.isNull(loaded);
	});

	test('handles corrupted file', async () => {
		const {writeFile} = await import('node:fs/promises');

		// Write invalid JSON
		await mkdir(test_dir, {recursive: true});
		await writeFile(join(test_dir, 'baseline.json'), 'not valid json', 'utf-8');

		const loaded = await benchmark_baseline_load({path: test_dir});

		// Should return null and remove corrupted file
		assert.isNull(loaded);
	});

	test('handles invalid schema', async () => {
		const {writeFile} = await import('node:fs/promises');

		// Write valid JSON but invalid schema
		await mkdir(test_dir, {recursive: true});
		await writeFile(
			join(test_dir, 'baseline.json'),
			JSON.stringify({version: 1, wrong: 'schema'}),
			'utf-8',
		);

		const loaded = await benchmark_baseline_load({path: test_dir});

		// Should return null and remove invalid file
		assert.isNull(loaded);
	});

	test('handles version mismatch', async () => {
		const {writeFile} = await import('node:fs/promises');
		const {fs_exists} = await import('$lib/fs.js');

		// Write a schema-valid baseline but with a stale version number
		await mkdir(test_dir, {recursive: true});
		const filepath = join(test_dir, 'baseline.json');
		await writeFile(
			filepath,
			JSON.stringify({
				version: 999,
				timestamp: new Date().toISOString(),
				git_commit: null,
				git_branch: null,
				node_version: 'v22.0.0',
				entries: [],
			}),
			'utf-8',
		);

		const loaded = await benchmark_baseline_load({path: test_dir});

		// Should return null and remove the stale-version file
		assert.isNull(loaded);
		assert.isFalse(await fs_exists(filepath));
	});
});

describe('benchmark_baseline_compare', () => {
	test('no baseline', async () => {
		const bench = new Benchmark({
			duration_ms: 50,
			min_iterations: 5,
		});

		bench.add('task1', () => 1 + 1);
		await bench.run();

		const comparison = await benchmark_baseline_compare(bench.results(), {path: test_dir});

		assert.isFalse(comparison.baseline_found);
		assert.deepEqual(comparison.new_tasks, ['task1']);
		assert.lengthOf(comparison.regressions, 0);
		assert.lengthOf(comparison.improvements, 0);
	});

	test('identical results', async () => {
		const bench = new Benchmark({
			duration_ms: 50,
			min_iterations: 5,
		});

		bench.add('task1', () => 1 + 1);
		await bench.run();

		// Save baseline
		await benchmark_baseline_save(bench.results(), {path: test_dir});

		// Compare same results
		const comparison = await benchmark_baseline_compare(bench.results(), {path: test_dir});

		assert.isTrue(comparison.baseline_found);
		assert.lengthOf(comparison.comparisons, 1);
		assert.lengthOf(comparison.unchanged, 1);
		assert.lengthOf(comparison.regressions, 0);
		assert.lengthOf(comparison.improvements, 0);
	});

	test('new task added', async () => {
		const bench1 = new Benchmark({
			duration_ms: 50,
			min_iterations: 5,
		});
		bench1.add('task1', () => 1 + 1);
		await bench1.run();

		await benchmark_baseline_save(bench1.results(), {path: test_dir});

		// Add a new task
		const bench2 = new Benchmark({
			duration_ms: 50,
			min_iterations: 5,
		});
		bench2.add('task1', () => 1 + 1);
		bench2.add('task2', () => 2 + 2);
		await bench2.run();

		const comparison = await benchmark_baseline_compare(bench2.results(), {path: test_dir});

		assert.isTrue(comparison.baseline_found);
		assert.deepEqual(comparison.new_tasks, ['task2']);
		assert.lengthOf(comparison.comparisons, 1);
	});

	test('task removed', async () => {
		const bench1 = new Benchmark({
			duration_ms: 50,
			min_iterations: 5,
		});
		bench1.add('task1', () => 1 + 1);
		bench1.add('task2', () => 2 + 2);
		await bench1.run();

		await benchmark_baseline_save(bench1.results(), {path: test_dir});

		// Remove a task
		const bench2 = new Benchmark({
			duration_ms: 50,
			min_iterations: 5,
		});
		bench2.add('task1', () => 1 + 1);
		await bench2.run();

		const comparison = await benchmark_baseline_compare(bench2.results(), {path: test_dir});

		assert.isTrue(comparison.baseline_found);
		assert.deepEqual(comparison.removed_tasks, ['task2']);
		assert.lengthOf(comparison.comparisons, 1);
	});

	test('comparison result structure', async () => {
		const bench = new Benchmark({
			duration_ms: 100,
			min_iterations: 10,
		});

		bench.add('consistent', () => {
			let sum = 0;
			for (let i = 0; i < 100; i++) sum += i;
			return sum;
		});

		await bench.run();
		await benchmark_baseline_save(bench.results(), {path: test_dir});

		// Run again
		bench.reset();
		await bench.run();

		const comparison = await benchmark_baseline_compare(bench.results(), {path: test_dir});

		assert.isTrue(comparison.baseline_found);
		assert.ok(comparison.baseline_timestamp);
		assert.lengthOf(comparison.comparisons, 1);

		const task_comparison = comparison.comparisons[0];
		assert.isDefined(task_comparison);
		assert.strictEqual(task_comparison.name, 'consistent');
		assert.isDefined(task_comparison.baseline);
		assert.isDefined(task_comparison.current);
		assert.isDefined(task_comparison.comparison);
		assert.isDefined(task_comparison.comparison.faster);
		assert.isDefined(task_comparison.comparison.significant);
	});

	test('baseline_age_days is calculated', async () => {
		const bench = new Benchmark({
			duration_ms: 50,
			min_iterations: 5,
		});
		bench.add('task1', () => 1 + 1);
		await bench.run();

		await benchmark_baseline_save(bench.results(), {path: test_dir});

		const comparison = await benchmark_baseline_compare(bench.results(), {path: test_dir});

		assert.isTrue(comparison.baseline_found);
		assert.isNotNull(comparison.baseline_age_days);
		assert.isDefined(comparison.baseline_age_days);
		assert.isAtLeast(comparison.baseline_age_days, 0);
		assert.isBelow(comparison.baseline_age_days, 1); // Should be very recent
		assert.isFalse(comparison.baseline_stale);
	});

	test('regression_threshold downgrades small regressions to unchanged', async () => {
		// Baseline at 1000ns; current at 1030ns (3% slower).
		await benchmark_baseline_save([create_synthetic_result('test_task', 1000)], {
			path: test_dir,
		});

		const comparison = await benchmark_baseline_compare(
			[create_synthetic_result('test_task', 1030)],
			{
				path: test_dir,
				// 3% is above the practical-significance floor but below the regression threshold.
				min_percent_difference: 0.01,
				regression_threshold: 1.05,
			},
		);

		assert.lengthOf(comparison.regressions, 0);
		assert.lengthOf(comparison.unchanged, 1);
		assert.isDefined(comparison.unchanged[0]);
		assert.strictEqual(comparison.unchanged[0].name, 'test_task');
	});

	test('regressions sorted by percent_difference descending', async () => {
		await benchmark_baseline_save(
			['a', 'b', 'c'].map((name) => create_synthetic_result(name, 1000)),
			{path: test_dir},
		);

		const comparison = await benchmark_baseline_compare(
			[
				create_synthetic_result('a', 1500), // 50% slower
				create_synthetic_result('b', 1200), // 20% slower
				create_synthetic_result('c', 1300), // 30% slower
			],
			{path: test_dir},
		);

		assert.lengthOf(comparison.regressions, 3);
		assert.deepEqual(
			comparison.regressions.map((r) => r.name),
			['a', 'c', 'b'],
		);
	});

	test('improvements sorted by percent_difference descending', async () => {
		await benchmark_baseline_save(
			['a', 'b', 'c'].map((name) => create_synthetic_result(name, 2000)),
			{path: test_dir},
		);

		const comparison = await benchmark_baseline_compare(
			[
				create_synthetic_result('a', 1000), // 100% faster (2x speedup)
				create_synthetic_result('b', 1500), // 33% faster
				create_synthetic_result('c', 1200), // 67% faster
			],
			{path: test_dir},
		);

		assert.lengthOf(comparison.improvements, 3);
		assert.deepEqual(
			comparison.improvements.map((r) => r.name),
			['a', 'c', 'b'],
		);
	});

	test('baseline_stale is true when older than staleness_warning_days', async () => {
		const {readFile, writeFile} = await import('node:fs/promises');

		// Save a fresh baseline, then rewrite its timestamp to 30 days ago.
		await benchmark_baseline_save([create_synthetic_result('task', 1000)], {path: test_dir});
		const filepath = join(test_dir, 'baseline.json');
		const baseline = JSON.parse(await readFile(filepath, 'utf-8'));
		baseline.timestamp = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
		await writeFile(filepath, JSON.stringify(baseline), 'utf-8');

		const comparison = await benchmark_baseline_compare([create_synthetic_result('task', 1000)], {
			path: test_dir,
			staleness_warning_days: 7,
		});

		assert.isTrue(comparison.baseline_stale);
		assert.isNotNull(comparison.baseline_age_days);
		// `isNotNull` narrows the type so the value below is a `number`.
		assert.isAbove(comparison.baseline_age_days, 7);
	});

	test('staleness_warning_days option', async () => {
		const bench = new Benchmark({
			duration_ms: 50,
			min_iterations: 5,
		});
		bench.add('task1', () => 1 + 1);
		await bench.run();

		await benchmark_baseline_save(bench.results(), {path: test_dir});

		// Fresh baseline should not be stale with reasonable threshold
		const comparison = await benchmark_baseline_compare(bench.results(), {
			path: test_dir,
			staleness_warning_days: 1,
		});

		assert.isFalse(comparison.baseline_stale);
		assert.isDefined(comparison.baseline_age_days);
		assert.isNotNull(comparison.baseline_age_days);
		assert.isBelow(comparison.baseline_age_days, 1);

		// With staleness_warning_days: 365, should not be stale
		const comparison2 = await benchmark_baseline_compare(bench.results(), {
			path: test_dir,
			staleness_warning_days: 365,
		});

		assert.isFalse(comparison2.baseline_stale);

		// Without staleness_warning_days, stale should be false
		const comparison3 = await benchmark_baseline_compare(bench.results(), {
			path: test_dir,
		});

		assert.isFalse(comparison3.baseline_stale);
	});
});

describe('benchmark_baseline_format', () => {
	test('no baseline', () => {
		const result = {
			baseline_found: false,
			baseline_timestamp: null,
			baseline_commit: null,
			baseline_age_days: null,
			baseline_stale: false,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			new_tasks: ['task1'],
			removed_tasks: [],
		};

		const formatted = benchmark_baseline_format(result);

		assert.include(formatted, 'No baseline found');
		assert.include(formatted, 'benchmark_baseline_save()');
	});

	test('with results', () => {
		const result = {
			baseline_found: true,
			baseline_timestamp: '2024-01-15T10:30:00Z',
			baseline_commit: 'abc123def456',
			baseline_age_days: 5.5,
			baseline_stale: false,
			comparisons: [],
			regressions: [create_mock_regression('slow_task', 1000, 2000)],
			improvements: [],
			unchanged: [{name: 'stable_task'} as any],
			new_tasks: [],
			removed_tasks: [],
		};

		const formatted = benchmark_baseline_format(result);

		assert.include(formatted, '2024-01-15');
		assert.include(formatted, 'abc123de'); // Truncated commit
		assert.include(formatted, 'Baseline age: 5 days');
		assert.include(formatted, 'Regressions (1)');
		assert.include(formatted, 'slow_task');
		assert.include(formatted, '2.00x slower');
		assert.include(formatted, '100.0%');
		assert.include(formatted, 'Unchanged (1)');
	});

	test('stale baseline shows warning', () => {
		const result = {
			baseline_found: true,
			baseline_timestamp: '2024-01-15T10:30:00Z',
			baseline_commit: 'abc123def456',
			baseline_age_days: 30,
			baseline_stale: true,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			new_tasks: [],
			removed_tasks: [],
		};

		const formatted = benchmark_baseline_format(result);

		assert.include(formatted, '30 days');
		assert.include(formatted, '(STALE)');
	});
});

describe('benchmark_baseline_format_json', () => {
	test('produces valid JSON', () => {
		const result = {
			baseline_found: true,
			baseline_timestamp: '2024-01-15T10:30:00Z',
			baseline_commit: 'abc123def456',
			baseline_age_days: 5.5,
			baseline_stale: false,
			comparisons: [],
			regressions: [create_mock_regression('slow_task', 1000, 2000)],
			improvements: [],
			unchanged: [],
			new_tasks: ['new_task'],
			removed_tasks: ['old_task'],
		};

		const json_str = benchmark_baseline_format_json(result);
		const parsed = JSON.parse(json_str);

		assert.isTrue(parsed.baseline_found);
		assert.strictEqual(parsed.summary.regressions, 1);
		assert.strictEqual(parsed.summary.new_tasks, 1);
		assert.strictEqual(parsed.regressions[0].name, 'slow_task');
		assert.strictEqual(parsed.regressions[0].speedup_ratio, 2.0);
		assert.strictEqual(parsed.regressions[0].percent_difference, 1.0);
		assert.deepEqual(parsed.new_tasks, ['new_task']);
		assert.deepEqual(parsed.removed_tasks, ['old_task']);
	});

	test('pretty option', () => {
		const result = {
			baseline_found: false,
			baseline_timestamp: null,
			baseline_commit: null,
			baseline_age_days: null,
			baseline_stale: false,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			new_tasks: [],
			removed_tasks: [],
		};

		const compact = benchmark_baseline_format_json(result);
		const pretty = benchmark_baseline_format_json(result, {pretty: true});

		// Pretty should have newlines, compact should not
		assert.notInclude(compact, '\n');
		assert.include(pretty, '\n');
		assert.include(pretty, '\t');
	});
});
