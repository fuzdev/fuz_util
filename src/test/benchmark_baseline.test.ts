import {test, beforeEach, afterEach} from 'vitest';
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

// Use a unique temp directory for each test run
const test_dir = join(tmpdir(), `benchmark_baseline_test_${Date.now()}`);

beforeEach(async () => {
	await mkdir(test_dir, {recursive: true});
});

afterEach(async () => {
	await rm(test_dir, {recursive: true, force: true});
});

test('benchmark_baseline_save and benchmark_baseline_load: roundtrip', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 5,
	});

	bench.add('task1', () => 1 + 1);
	bench.add('task2', () => 2 + 2);

	await bench.run();

	await benchmark_baseline_save(bench.results(), {path: test_dir});

	const loaded = await benchmark_baseline_load({path: test_dir});

	expect(loaded).not.toBeNull();
	expect(loaded!.entries).toHaveLength(2);
	expect(loaded!.entries[0]!.name).toBe('task1');
	expect(loaded!.entries[1]!.name).toBe('task2');
	expect(loaded!.node_version).toBe(process.version);
	expect(loaded!.timestamp).toBeTruthy();
});

test('benchmark_baseline_load: returns null when no baseline exists', async ({expect}) => {
	const loaded = await benchmark_baseline_load({path: test_dir});
	expect(loaded).toBeNull();
});

test('benchmark_baseline_compare: no baseline', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 5,
	});

	bench.add('task1', () => 1 + 1);
	await bench.run();

	const comparison = await benchmark_baseline_compare(bench.results(), {path: test_dir});

	expect(comparison.baseline_found).toBe(false);
	expect(comparison.new_tasks).toEqual(['task1']);
	expect(comparison.regressions).toHaveLength(0);
	expect(comparison.improvements).toHaveLength(0);
});

test('benchmark_baseline_compare: identical results', async ({expect}) => {
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

	expect(comparison.baseline_found).toBe(true);
	expect(comparison.comparisons).toHaveLength(1);
	expect(comparison.unchanged).toHaveLength(1);
	expect(comparison.regressions).toHaveLength(0);
	expect(comparison.improvements).toHaveLength(0);
});

test('benchmark_baseline_compare: new task added', async ({expect}) => {
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

	expect(comparison.baseline_found).toBe(true);
	expect(comparison.new_tasks).toEqual(['task2']);
	expect(comparison.comparisons).toHaveLength(1);
});

test('benchmark_baseline_compare: task removed', async ({expect}) => {
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

	expect(comparison.baseline_found).toBe(true);
	expect(comparison.removed_tasks).toEqual(['task2']);
	expect(comparison.comparisons).toHaveLength(1);
});

test('benchmark_baseline_format: no baseline', ({expect}) => {
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

	expect(formatted).toContain('No baseline found');
	expect(formatted).toContain('benchmark_baseline_save()');
});

test('benchmark_baseline_format: with results', ({expect}) => {
	const result = {
		baseline_found: true,
		baseline_timestamp: '2024-01-15T10:30:00Z',
		baseline_commit: 'abc123def456',
		baseline_age_days: 5.5,
		baseline_stale: false,
		comparisons: [],
		regressions: [
			{
				name: 'slow_task',
				baseline: {
					name: 'slow_task',
					mean_ns: 1000,
					median_ns: 1000,
					std_dev_ns: 100,
					min_ns: 900,
					max_ns: 1100,
					p75_ns: 1050,
					p90_ns: 1080,
					p95_ns: 1090,
					p99_ns: 1095,
					ops_per_second: 1000000,
					sample_size: 100,
				},
				current: {
					name: 'slow_task',
					mean_ns: 2000,
					median_ns: 2000,
					std_dev_ns: 100,
					min_ns: 1900,
					max_ns: 2100,
					p75_ns: 2050,
					p90_ns: 2080,
					p95_ns: 2090,
					p99_ns: 2095,
					ops_per_second: 500000,
					sample_size: 100,
				},
				comparison: {
					faster: 'a' as const,
					speedup_ratio: 2.0,
					significant: true,
					p_value: 0.001,
					effect_size: 5.0,
					effect_magnitude: 'large' as const,
					ci_overlap: false,
					recommendation: 'Regression detected',
				},
			},
		],
		improvements: [],
		unchanged: [{name: 'stable_task'} as any],
		new_tasks: [],
		removed_tasks: [],
	};

	const formatted = benchmark_baseline_format(result);

	expect(formatted).toContain('2024-01-15');
	expect(formatted).toContain('abc123de'); // Truncated commit
	expect(formatted).toContain('Baseline age: 5 days');
	expect(formatted).toContain('Regressions (1)');
	expect(formatted).toContain('slow_task');
	expect(formatted).toContain('2.00x slower');
	expect(formatted).toContain('Unchanged (1)');
});

test('benchmark_baseline_save: custom git info', async ({expect}) => {
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

	expect(loaded).not.toBeNull();
	expect(loaded!.git_commit).toBe('custom_commit_hash');
	expect(loaded!.git_branch).toBe('custom_branch');
});

test('benchmark_baseline_load: handles corrupted file', async ({expect}) => {
	const {writeFile} = await import('node:fs/promises');

	// Write invalid JSON
	await mkdir(test_dir, {recursive: true});
	await writeFile(join(test_dir, 'baseline.json'), 'not valid json', 'utf-8');

	const loaded = await benchmark_baseline_load({path: test_dir});

	// Should return null and remove corrupted file
	expect(loaded).toBeNull();
});

test('benchmark_baseline_load: handles invalid schema', async ({expect}) => {
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
	expect(loaded).toBeNull();
});

test('benchmark_baseline_compare: comparison result structure', async ({expect}) => {
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

	expect(comparison.baseline_found).toBe(true);
	expect(comparison.baseline_timestamp).toBeTruthy();
	expect(comparison.comparisons).toHaveLength(1);

	const task_comparison = comparison.comparisons[0]!;
	expect(task_comparison.name).toBe('consistent');
	expect(task_comparison.baseline).toBeDefined();
	expect(task_comparison.current).toBeDefined();
	expect(task_comparison.comparison).toBeDefined();
	expect(task_comparison.comparison.faster).toBeDefined();
	expect(task_comparison.comparison.significant).toBeDefined();
});

test('benchmark_baseline_compare: baseline_age_days is calculated', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 5,
	});
	bench.add('task1', () => 1 + 1);
	await bench.run();

	await benchmark_baseline_save(bench.results(), {path: test_dir});

	const comparison = await benchmark_baseline_compare(bench.results(), {path: test_dir});

	expect(comparison.baseline_found).toBe(true);
	expect(comparison.baseline_age_days).not.toBeNull();
	expect(comparison.baseline_age_days).toBeGreaterThanOrEqual(0);
	expect(comparison.baseline_age_days).toBeLessThan(1); // Should be very recent
	expect(comparison.baseline_stale).toBe(false);
});

test('benchmark_baseline_compare: staleness_warning_days option', async ({expect}) => {
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
		staleness_warning_days: 1, // 1 day threshold
	});

	expect(comparison.baseline_stale).toBe(false);
	expect(comparison.baseline_age_days).toBeLessThan(1);

	// With staleness_warning_days: 365, should not be stale
	const comparison2 = await benchmark_baseline_compare(bench.results(), {
		path: test_dir,
		staleness_warning_days: 365,
	});

	expect(comparison2.baseline_stale).toBe(false);

	// Without staleness_warning_days, stale should be false
	const comparison3 = await benchmark_baseline_compare(bench.results(), {
		path: test_dir,
	});

	expect(comparison3.baseline_stale).toBe(false);
});

test('benchmark_baseline_format: stale baseline shows warning', ({expect}) => {
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

	expect(formatted).toContain('30 days');
	expect(formatted).toContain('(STALE)');
});

test('benchmark_baseline_format_json: produces valid JSON', ({expect}) => {
	const result = {
		baseline_found: true,
		baseline_timestamp: '2024-01-15T10:30:00Z',
		baseline_commit: 'abc123def456',
		baseline_age_days: 5.5,
		baseline_stale: false,
		comparisons: [],
		regressions: [
			{
				name: 'slow_task',
				baseline: {
					name: 'slow_task',
					mean_ns: 1000,
					median_ns: 1000,
					std_dev_ns: 100,
					min_ns: 900,
					max_ns: 1100,
					p75_ns: 1050,
					p90_ns: 1080,
					p95_ns: 1090,
					p99_ns: 1095,
					ops_per_second: 1000000,
					sample_size: 100,
				},
				current: {
					name: 'slow_task',
					mean_ns: 2000,
					median_ns: 2000,
					std_dev_ns: 100,
					min_ns: 1900,
					max_ns: 2100,
					p75_ns: 2050,
					p90_ns: 2080,
					p95_ns: 2090,
					p99_ns: 2095,
					ops_per_second: 500000,
					sample_size: 100,
				},
				comparison: {
					faster: 'a' as const,
					speedup_ratio: 2.0,
					significant: true,
					p_value: 0.001,
					effect_size: 5.0,
					effect_magnitude: 'large' as const,
					ci_overlap: false,
					recommendation: 'Regression detected',
				},
			},
		],
		improvements: [],
		unchanged: [],
		new_tasks: ['new_task'],
		removed_tasks: ['old_task'],
	};

	const json_str = benchmark_baseline_format_json(result);
	const parsed = JSON.parse(json_str);

	expect(parsed.baseline_found).toBe(true);
	expect(parsed.summary.regressions).toBe(1);
	expect(parsed.summary.new_tasks).toBe(1);
	expect(parsed.regressions[0].name).toBe('slow_task');
	expect(parsed.regressions[0].speedup_ratio).toBe(2.0);
	expect(parsed.new_tasks).toEqual(['new_task']);
	expect(parsed.removed_tasks).toEqual(['old_task']);
});

test('benchmark_baseline_format_json: pretty option', ({expect}) => {
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
	expect(compact).not.toContain('\n');
	expect(pretty).toContain('\n');
	expect(pretty).toContain('\t');
});
