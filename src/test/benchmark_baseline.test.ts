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
	benchmark_budget_diff,
} from '../lib/benchmark_baseline.ts';
import {Benchmark} from '../lib/benchmark.ts';
import {BenchmarkStats} from '../lib/benchmark_stats.ts';
import type {BenchmarkResult} from '../lib/benchmark_types.ts';

// Default budget for synthetic results. Mirrors the DEFAULT_* constants in
// `benchmark.ts` — keep these in sync if the Benchmark class defaults change,
// otherwise synthetic fixtures will silently drift from realistic runs.
const default_budget = {
	duration_ms: 1000,
	warmup_iterations: 10,
	min_iterations: 30,
	max_iterations: 100_000,
	async_resolved: false,
};

// Construct a synthetic BenchmarkResult with predictable stats.
const create_synthetic_result = (
	name: string,
	mean_ns: number,
	budget = default_budget,
): BenchmarkResult => {
	const timings = Array(100).fill(mean_ns);
	return {
		name,
		stats: new BenchmarkStats(timings),
		iterations: 100,
		total_time_ms: (mean_ns * 100) / 1_000_000,
		timings_ns: timings,
		budget,
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
	outlier_ratio: 0,
	budget: default_budget,
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
	methodology_changed: false,
	noise_warning: false,
	max_cv: 0.1,
	max_outlier_ratio: 0,
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
		// Budget survives the JSON roundtrip with the effective values the
		// loop saw (suite config + per-task overrides resolved). The
		// `async_resolved` field reflects benchmark_warmup's runtime
		// classification, not `task.async` — for these sync `() => 1 + 1`
		// fns it's `false`.
		assert.deepEqual(loaded.entries[0].budget, {
			duration_ms: 50,
			warmup_iterations: 10, // suite default
			min_iterations: 5,
			max_iterations: 100_000, // suite default
			async_resolved: false,
		});
		assert.deepEqual(loaded.entries[1].budget, loaded.entries[0].budget);
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
		const {fs_exists} = await import('../lib/fs.ts');

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

	test('methodology change routes to methodology_changed bucket, not regressions or comparisons', async () => {
		// Baseline at 1000ns with min_iterations: 10. Current at 1500ns
		// (50% slower — would normally be a regression) but with min_iterations: 50.
		// The budget mismatch should route it to methodology_changed only.
		await benchmark_baseline_save([create_synthetic_result('test_task', 1000)], {path: test_dir});

		const current = create_synthetic_result('test_task', 1500, {
			...default_budget,
			min_iterations: 50,
		});
		const comparison = await benchmark_baseline_compare([current], {path: test_dir});

		assert.lengthOf(comparison.regressions, 0);
		assert.lengthOf(comparison.unchanged, 0);
		assert.lengthOf(comparison.methodology_changed, 1);
		assert.isDefined(comparison.methodology_changed[0]);
		assert.strictEqual(comparison.methodology_changed[0].name, 'test_task');
		assert.isTrue(comparison.methodology_changed[0].methodology_changed);
		// `comparisons` excludes methodology-changed rows so aggregate reads of
		// `c.comparison.*` stay safe.
		assert.lengthOf(comparison.comparisons, 0);
	});

	test('identical budgets do not flag methodology_changed', async () => {
		await benchmark_baseline_save([create_synthetic_result('test_task', 1000)], {path: test_dir});

		const comparison = await benchmark_baseline_compare(
			[create_synthetic_result('test_task', 1000)],
			{path: test_dir},
		);

		assert.lengthOf(comparison.methodology_changed, 0);
		assert.lengthOf(comparison.unchanged, 1);
		assert.lengthOf(comparison.comparisons, 1);
		assert.isDefined(comparison.unchanged[0]);
		assert.isFalse(comparison.unchanged[0].methodology_changed);
	});

	test('methodology change detected on each of the five budget fields', async () => {
		// Save a baseline with default budget, then for each field run a current
		// that diverges on that field only. All five should route to
		// methodology_changed.
		const cases = [
			{field: 'duration_ms', value: 2000},
			{field: 'warmup_iterations', value: 99},
			{field: 'min_iterations', value: 50},
			{field: 'max_iterations', value: 50_000},
			{field: 'async_resolved', value: true},
		] as const;

		for (const {field, value} of cases) {
			await rm(test_dir, {recursive: true, force: true});
			await mkdir(test_dir, {recursive: true});
			await benchmark_baseline_save([create_synthetic_result('t', 1000)], {path: test_dir});

			const current = create_synthetic_result('t', 1000, {...default_budget, [field]: value});
			const comparison = await benchmark_baseline_compare([current], {path: test_dir});

			assert.lengthOf(comparison.methodology_changed, 1, `${field} did not route`);
			assert.lengthOf(comparison.unchanged, 0, `${field} leaked into unchanged`);
			assert.lengthOf(comparison.comparisons, 0, `${field} leaked into comparisons`);
		}
	});

	test('methodology change with multiple fields changed at once', async () => {
		await benchmark_baseline_save([create_synthetic_result('t', 1000)], {path: test_dir});

		const current = create_synthetic_result('t', 1000, {
			duration_ms: 2000,
			warmup_iterations: 99,
			min_iterations: 50,
			max_iterations: 50_000,
			async_resolved: true,
		});
		const comparison = await benchmark_baseline_compare([current], {path: test_dir});

		assert.lengthOf(comparison.methodology_changed, 1);
		assert.isDefined(comparison.methodology_changed[0]);
		// All five fields should appear in the diff used by the formatters.
		const diff = benchmark_budget_diff(
			comparison.methodology_changed[0].baseline.budget,
			comparison.methodology_changed[0].current.budget,
		);
		assert.lengthOf(diff, 5);
		assert.deepEqual(diff.map((d) => d.field).sort(), [
			'async_resolved',
			'duration_ms',
			'max_iterations',
			'min_iterations',
			'warmup_iterations',
		]);
	});

	test('node_version_changed reflects process vs baseline mismatch', async () => {
		const {readFile, writeFile} = await import('node:fs/promises');

		await benchmark_baseline_save([create_synthetic_result('task', 1000)], {path: test_dir});

		// Rewrite the saved node_version to simulate a Node upgrade.
		const filepath = join(test_dir, 'baseline.json');
		const baseline = JSON.parse(await readFile(filepath, 'utf-8'));
		baseline.node_version = 'v0.0.1-fake';
		await writeFile(filepath, JSON.stringify(baseline), 'utf-8');

		const comparison = await benchmark_baseline_compare([create_synthetic_result('task', 1000)], {
			path: test_dir,
		});

		assert.isTrue(comparison.node_version_changed);
		assert.strictEqual(comparison.baseline_node_version, 'v0.0.1-fake');
	});

	test('noise_warning fires when cv exceeds default 0.3 threshold on either side', async () => {
		// Construct a result with cv ≈ 0.5: alternating 500/1500 → mean=1000,
		// std_dev=500. MAD outlier detection keeps all values (modified z-score
		// = 0.6745 < 3.5 threshold), so the persisted std_dev reflects the
		// configured spread.
		const noisy_timings = Array.from({length: 100}, (_, i) => (i % 2 === 0 ? 500 : 1500));
		const stable_timings = Array(100).fill(1000);

		const noisy_result = (name: string): BenchmarkResult => ({
			name,
			stats: new BenchmarkStats(noisy_timings),
			iterations: 100,
			total_time_ms: 0.1,
			timings_ns: noisy_timings,
			budget: default_budget,
		});
		const stable_result = (name: string): BenchmarkResult => ({
			name,
			stats: new BenchmarkStats(stable_timings),
			iterations: 100,
			total_time_ms: 0.1,
			timings_ns: stable_timings,
			budget: default_budget,
		});

		await benchmark_baseline_save([noisy_result('baseline_noisy'), stable_result('clean')], {
			path: test_dir,
		});

		const comparison = await benchmark_baseline_compare(
			[stable_result('baseline_noisy'), stable_result('clean')],
			{path: test_dir},
		);

		// `baseline_noisy` has noisy baseline → max_cv ≈ 0.5, flags noise_warning.
		// `clean` is stable on both sides → no warning.
		const noisy_entry = [
			...comparison.regressions,
			...comparison.improvements,
			...comparison.unchanged,
		].find((r) => r.name === 'baseline_noisy');
		const clean_entry = [
			...comparison.regressions,
			...comparison.improvements,
			...comparison.unchanged,
		].find((r) => r.name === 'clean');

		assert.isDefined(noisy_entry);
		assert.isTrue(noisy_entry.noise_warning);
		assert.isAbove(noisy_entry.max_cv, 0.3);
		assert.isDefined(clean_entry);
		assert.isFalse(clean_entry.noise_warning);
	});

	test('noise_warning respects custom noise_warning_cv_threshold', async () => {
		// Same noisy fixture (cv ≈ 0.5). With threshold raised to 0.6, the
		// warning is suppressed; with threshold dropped to 0.1, even mildly
		// noisy stable_result (cv near 0) stays suppressed but the noisy one
		// fires earlier.
		const noisy_timings = Array.from({length: 100}, (_, i) => (i % 2 === 0 ? 500 : 1500));
		const result = (name: string): BenchmarkResult => ({
			name,
			stats: new BenchmarkStats(noisy_timings),
			iterations: 100,
			total_time_ms: 0.1,
			timings_ns: noisy_timings,
			budget: default_budget,
		});

		await benchmark_baseline_save([result('t')], {path: test_dir});

		const raised = await benchmark_baseline_compare([result('t')], {
			path: test_dir,
			noise_warning_cv_threshold: 0.6,
		});
		const found_raised = [...raised.regressions, ...raised.improvements, ...raised.unchanged].find(
			(r) => r.name === 't',
		);
		assert.isDefined(found_raised);
		assert.isFalse(found_raised.noise_warning);

		const lowered = await benchmark_baseline_compare([result('t')], {
			path: test_dir,
			noise_warning_cv_threshold: 0.1,
		});
		const found_lowered = [
			...lowered.regressions,
			...lowered.improvements,
			...lowered.unchanged,
		].find((r) => r.name === 't');
		assert.isDefined(found_lowered);
		assert.isTrue(found_lowered.noise_warning);
	});

	test('noise_warning fires on high outlier_ratio even with tight cleaned cv', async () => {
		// Timings that produce a tight cleaned distribution but high outlier
		// ratio: 80 samples lightly varied around 1000 (990-1010, gives
		// MAD a non-zero floor so detection actually fires — purely
		// identical inliers collapse MAD to 0 and the IQR fallback then
		// accepts the extremes as legitimate spread). Plus 20 extreme
		// outliers at 50_000 that MAD strips out. After cleaning, cv stays
		// well below the 0.3 cv threshold, but 20/100 = 20% outlier_ratio
		// trips the 0.1 outlier threshold → noise_warning fires anyway.
		const bimodal_timings = [
			...Array.from({length: 80}, (_, i) => 990 + (i % 21)),
			...Array(20).fill(50_000),
		];
		const bimodal_result = (name: string): BenchmarkResult => ({
			name,
			stats: new BenchmarkStats(bimodal_timings),
			iterations: 100,
			total_time_ms: 0.1,
			timings_ns: bimodal_timings,
			budget: default_budget,
		});

		await benchmark_baseline_save([bimodal_result('t')], {path: test_dir});

		const comparison = await benchmark_baseline_compare([bimodal_result('t')], {
			path: test_dir,
		});

		const entry = [
			...comparison.regressions,
			...comparison.improvements,
			...comparison.unchanged,
		].find((r) => r.name === 't');

		assert.isDefined(entry);
		// cv on the cleaned set (990-1010) is near 0.006, well under 0.3.
		assert.isBelow(entry.max_cv, 0.3);
		// But outlier_ratio is well above 0.1 → flag fires anyway.
		assert.isAbove(entry.max_outlier_ratio, 0.1);
		assert.isTrue(entry.noise_warning);
	});

	test('noise_warning_outlier_ratio_threshold is respected', async () => {
		// Same bimodal fixture; raising the outlier threshold past the actual
		// rate suppresses the warning, lowering it below makes it fire.
		const bimodal_timings = [
			...Array.from({length: 80}, (_, i) => 990 + (i % 21)),
			...Array(20).fill(50_000),
		];
		const bimodal_result = (name: string): BenchmarkResult => ({
			name,
			stats: new BenchmarkStats(bimodal_timings),
			iterations: 100,
			total_time_ms: 0.1,
			timings_ns: bimodal_timings,
			budget: default_budget,
		});

		await benchmark_baseline_save([bimodal_result('t')], {path: test_dir});

		const raised = await benchmark_baseline_compare([bimodal_result('t')], {
			path: test_dir,
			noise_warning_cv_threshold: 0.99, // disable cv gate
			noise_warning_outlier_ratio_threshold: 0.5, // above actual ~0.2
		});
		const found_raised = [...raised.regressions, ...raised.improvements, ...raised.unchanged].find(
			(r) => r.name === 't',
		);
		assert.isDefined(found_raised);
		assert.isFalse(found_raised.noise_warning);

		const lowered = await benchmark_baseline_compare([bimodal_result('t')], {
			path: test_dir,
			noise_warning_cv_threshold: 0.99, // still disabled
			noise_warning_outlier_ratio_threshold: 0.05, // below actual ~0.2
		});
		const found_lowered = [
			...lowered.regressions,
			...lowered.improvements,
			...lowered.unchanged,
		].find((r) => r.name === 't');
		assert.isDefined(found_lowered);
		assert.isTrue(found_lowered.noise_warning);
	});

	test('outlier_ratio survives the baseline JSON roundtrip', async () => {
		const bimodal_timings = [
			...Array.from({length: 80}, (_, i) => 990 + (i % 21)),
			...Array(20).fill(50_000),
		];
		const bimodal_result: BenchmarkResult = {
			name: 't',
			stats: new BenchmarkStats(bimodal_timings),
			iterations: 100,
			total_time_ms: 0.1,
			timings_ns: bimodal_timings,
			budget: default_budget,
		};

		await benchmark_baseline_save([bimodal_result], {path: test_dir});
		const loaded = await benchmark_baseline_load({path: test_dir});

		assert.isNotNull(loaded);
		assert.isDefined(loaded.entries[0]);
		assert.isAbove(loaded.entries[0].outlier_ratio, 0.1);
	});

	test('metadata round-trips through save → load → compare', async () => {
		// Mirrors the intended consumer pattern: pass run-level context that
		// the comparison math doesn't care about (corpus shape, versions,
		// hardware notes) on save; read it back on the comparison result.
		const metadata = {
			corpus: {svelte: 200, typescript: 150, css: 50},
			versions: {prettier: '3.2.0', svelte: '5.0.0'},
			binary_sizes: [{label: 'tsv.wasm', bytes: 1_234_567}],
			notes: 'thermal throttling observed mid-run',
		};

		await benchmark_baseline_save([create_synthetic_result('task', 1000)], {
			path: test_dir,
			metadata,
		});

		const loaded = await benchmark_baseline_load({path: test_dir});
		assert.isNotNull(loaded);
		assert.deepEqual(loaded.metadata, metadata);

		const comparison = await benchmark_baseline_compare([create_synthetic_result('task', 1000)], {
			path: test_dir,
		});
		assert.deepEqual(comparison.baseline_metadata, metadata);
	});

	test('omitted metadata is absent from the saved file (no spurious "metadata: {}")', async () => {
		// The save path uses a conditional spread so old baselines stay
		// byte-identical when no metadata is passed. Verifies the field is
		// truly absent, not just empty — important because consumers may
		// distinguish "never set metadata" (legacy or opt-out) from "set to {}".
		await benchmark_baseline_save([create_synthetic_result('task', 1000)], {path: test_dir});

		const {readFile} = await import('node:fs/promises');
		const raw = JSON.parse(await readFile(join(test_dir, 'baseline.json'), 'utf-8'));
		assert.notProperty(raw, 'metadata');

		const comparison = await benchmark_baseline_compare([create_synthetic_result('task', 1000)], {
			path: test_dir,
		});
		assert.isNull(comparison.baseline_metadata);
	});

	test('baseline_metadata is null when no baseline exists', async () => {
		const comparison = await benchmark_baseline_compare([create_synthetic_result('task', 1000)], {
			path: test_dir,
		});
		assert.isFalse(comparison.baseline_found);
		assert.isNull(comparison.baseline_metadata);
	});

	test('noise_warning surfaces in human-readable formatter', () => {
		const noisy_regression = create_mock_regression('flaky', 1000, 2000);
		noisy_regression.noise_warning = true;
		noisy_regression.max_cv = 0.45;

		const result = {
			baseline_found: true,
			baseline_timestamp: '2024-01-15T10:30:00Z',
			baseline_commit: 'abc',
			baseline_age_days: 1,
			baseline_stale: false,
			baseline_node_version: process.version,
			current_node_version: process.version,
			node_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [noisy_regression],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
			new_tasks: [],
			removed_tasks: [],
		};

		const formatted = benchmark_baseline_format(result);

		assert.include(formatted, 'flaky:');
		assert.include(formatted, '⚠ noisy');
		// Both signals rendered so the reader can see which one tripped.
		assert.include(formatted, 'cv=45.0%');
		assert.include(formatted, 'outliers=0.0%');
	});

	test('noise_warnings count in JSON summary aggregates across buckets', () => {
		const noisy_regression = create_mock_regression('reg', 1000, 2000);
		noisy_regression.noise_warning = true;
		noisy_regression.max_cv = 0.4;
		noisy_regression.max_outlier_ratio = 0.15;
		const clean_regression = create_mock_regression('clean_reg', 1000, 2000);

		const result = {
			baseline_found: true,
			baseline_timestamp: '2024-01-15T10:30:00Z',
			baseline_commit: 'abc',
			baseline_age_days: 1,
			baseline_stale: false,
			baseline_node_version: process.version,
			current_node_version: process.version,
			node_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [noisy_regression, clean_regression],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
			new_tasks: [],
			removed_tasks: [],
		};

		const parsed = JSON.parse(benchmark_baseline_format_json(result));

		assert.strictEqual(parsed.summary.noise_warnings, 1);
		assert.isTrue(parsed.regressions[0].noise_warning);
		assert.strictEqual(parsed.regressions[0].max_cv, 0.4);
		assert.strictEqual(parsed.regressions[0].max_outlier_ratio, 0.15);
		assert.isFalse(parsed.regressions[1].noise_warning);
	});

	test('methodology_changed bucket sorted by name (not add() insertion order)', async () => {
		// Save baseline tasks in non-alphabetical order, then change every
		// task's budget so all route to methodology_changed. The bucket should
		// come back alphabetical even though insertion order was c, a, b.
		await benchmark_baseline_save(
			['c', 'a', 'b'].map((name) => create_synthetic_result(name, 1000)),
			{path: test_dir},
		);

		const bumped = (name: string) =>
			create_synthetic_result(name, 1000, {...default_budget, min_iterations: 50});
		const comparison = await benchmark_baseline_compare([bumped('c'), bumped('a'), bumped('b')], {
			path: test_dir,
		});

		assert.lengthOf(comparison.methodology_changed, 3);
		assert.deepEqual(
			comparison.methodology_changed.map((r) => r.name),
			['a', 'b', 'c'],
		);
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
			baseline_node_version: null,
			current_node_version: process.version,
			node_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
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
			baseline_node_version: process.version,
			current_node_version: process.version,
			node_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [create_mock_regression('slow_task', 1000, 2000)],
			improvements: [],
			unchanged: [{name: 'stable_task'} as any],
			methodology_changed: [],
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
		// Total sums across all four buckets; here 1 regression + 1 unchanged.
		assert.include(formatted, '(2 total)');
	});

	test('stale baseline shows warning', () => {
		const result = {
			baseline_found: true,
			baseline_timestamp: '2024-01-15T10:30:00Z',
			baseline_commit: 'abc123def456',
			baseline_age_days: 30,
			baseline_stale: true,
			baseline_node_version: process.version,
			current_node_version: process.version,
			node_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
			new_tasks: [],
			removed_tasks: [],
		};

		const formatted = benchmark_baseline_format(result);

		assert.include(formatted, '30 days');
		assert.include(formatted, '(STALE)');
	});

	test('node_version_changed surfaces in header', () => {
		const result = {
			baseline_found: true,
			baseline_timestamp: '2024-01-15T10:30:00Z',
			baseline_commit: 'abc123def456',
			baseline_age_days: 1,
			baseline_stale: false,
			baseline_node_version: 'v22.15.0',
			current_node_version: 'v24.0.0',
			node_version_changed: true,
			baseline_metadata: null,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
			new_tasks: [],
			removed_tasks: [],
		};

		const formatted = benchmark_baseline_format(result);

		assert.include(formatted, 'Baseline node: v22.15.0 → v24.0.0');
		assert.include(formatted, 'CHANGED');
	});

	test('methodology_changed section renders budget diff', () => {
		const baseline_entry = create_mock_baseline_entry('slugify', 1000);
		const current_entry = {
			...create_mock_baseline_entry('slugify', 1000),
			budget: {...default_budget, min_iterations: 50},
		};
		const result = {
			baseline_found: true,
			baseline_timestamp: '2024-01-15T10:30:00Z',
			baseline_commit: 'abc123def456',
			baseline_age_days: 1,
			baseline_stale: false,
			baseline_node_version: process.version,
			current_node_version: process.version,
			node_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			methodology_changed: [
				{
					name: 'slugify',
					baseline: baseline_entry,
					current: current_entry,
					comparison: {} as any,
					methodology_changed: true,
					noise_warning: false,
					max_cv: 0.1,
					max_outlier_ratio: 0,
				},
			],
			new_tasks: [],
			removed_tasks: [],
		};

		const formatted = benchmark_baseline_format(result);

		assert.include(formatted, 'Methodology changed (1)');
		assert.include(formatted, 'slugify: min_iterations 30 → 50');
		assert.include(formatted, 're-save baseline');
		assert.include(formatted, '1 methodology changed');
		// Total counts methodology-changed as one of the four buckets.
		assert.include(formatted, '(1 total)');
	});

	test('summary "no comparable tasks" when every bucket is empty', () => {
		const result = {
			baseline_found: true,
			baseline_timestamp: '2024-01-15T10:30:00Z',
			baseline_commit: 'abc',
			baseline_age_days: 1,
			baseline_stale: false,
			baseline_node_version: process.version,
			current_node_version: process.version,
			node_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
			new_tasks: ['only_new'],
			removed_tasks: ['only_removed'],
		};

		const formatted = benchmark_baseline_format(result);

		assert.include(formatted, 'no comparable tasks');
		assert.include(formatted, '(0 total)');
		// Crucially, no "Summary:  (0 total)" with a double space.
		assert.notInclude(formatted, 'Summary:  ');
	});
});

describe('benchmark_budget_diff', () => {
	test('returns empty array for identical budgets', () => {
		const diff = benchmark_budget_diff(default_budget, default_budget);
		assert.deepEqual(diff, []);
	});

	test('returns one entry per changed field', () => {
		const diff = benchmark_budget_diff(default_budget, {
			...default_budget,
			min_iterations: 50,
		});
		assert.deepEqual(diff, [{field: 'min_iterations', baseline: 30, current: 50}]);
	});

	test('async_resolved flip is detected', () => {
		// The resolved sync/async classification is part of the budget — a flip
		// (e.g. auto-detect → explicit `async: true`) shifts every iteration's
		// measurement code path, so it has to surface as methodology drift.
		const diff = benchmark_budget_diff(default_budget, {
			...default_budget,
			async_resolved: true,
		});
		assert.deepEqual(diff, [{field: 'async_resolved', baseline: false, current: true}]);
	});

	test('returns all five entries when every field differs', () => {
		const diff = benchmark_budget_diff(default_budget, {
			duration_ms: 2000,
			warmup_iterations: 99,
			min_iterations: 50,
			max_iterations: 50_000,
			async_resolved: true,
		});
		// Order is field-declaration order in the helper; the caller can sort
		// if they need a different one.
		assert.deepEqual(
			diff.map((d) => d.field),
			['duration_ms', 'warmup_iterations', 'min_iterations', 'max_iterations', 'async_resolved'],
		);
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
			baseline_node_version: process.version,
			current_node_version: process.version,
			node_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [create_mock_regression('slow_task', 1000, 2000)],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
			new_tasks: ['new_task'],
			removed_tasks: ['old_task'],
		};

		const json_str = benchmark_baseline_format_json(result);
		const parsed = JSON.parse(json_str);

		assert.isTrue(parsed.baseline_found);
		assert.strictEqual(parsed.summary.regressions, 1);
		assert.strictEqual(parsed.summary.new_tasks, 1);
		assert.strictEqual(parsed.summary.methodology_changed, 0);
		assert.strictEqual(parsed.regressions[0].name, 'slow_task');
		assert.strictEqual(parsed.regressions[0].speedup_ratio, 2.0);
		assert.strictEqual(parsed.regressions[0].percent_difference, 1.0);
		assert.deepEqual(parsed.new_tasks, ['new_task']);
		assert.deepEqual(parsed.removed_tasks, ['old_task']);
		assert.deepEqual(parsed.methodology_changed, []);
		assert.isNull(parsed.baseline_metadata);
	});

	test('baseline_metadata passes through to JSON output verbatim', () => {
		// JSON consumers (CI tooling, dashboards) need the metadata bag too —
		// they read the JSON output rather than the in-memory comparison
		// result. Round-trip should be lossless.
		const metadata = {
			corpus: {svelte: 200, typescript: 150},
			versions: {prettier: '3.2.0'},
		};
		const result = {
			baseline_found: true,
			baseline_timestamp: '2024-01-15T10:30:00Z',
			baseline_commit: 'abc',
			baseline_age_days: 1,
			baseline_stale: false,
			baseline_node_version: process.version,
			current_node_version: process.version,
			node_version_changed: false,
			baseline_metadata: metadata,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
			new_tasks: [],
			removed_tasks: [],
		};

		const parsed = JSON.parse(benchmark_baseline_format_json(result));
		assert.deepEqual(parsed.baseline_metadata, metadata);
	});

	test('methodology_changed in JSON output carries budget_diff', () => {
		const baseline_entry = create_mock_baseline_entry('slugify', 1000);
		const current_entry = {
			...create_mock_baseline_entry('slugify', 1000),
			budget: {...default_budget, min_iterations: 50},
		};
		const result = {
			baseline_found: true,
			baseline_timestamp: '2024-01-15T10:30:00Z',
			baseline_commit: 'abc',
			baseline_age_days: 1,
			baseline_stale: false,
			baseline_node_version: process.version,
			current_node_version: process.version,
			node_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			methodology_changed: [
				{
					name: 'slugify',
					baseline: baseline_entry,
					current: current_entry,
					comparison: {} as any,
					methodology_changed: true,
					noise_warning: false,
					max_cv: 0.1,
					max_outlier_ratio: 0,
				},
			],
			new_tasks: [],
			removed_tasks: [],
		};

		const parsed = JSON.parse(benchmark_baseline_format_json(result));

		assert.strictEqual(parsed.summary.methodology_changed, 1);
		assert.lengthOf(parsed.methodology_changed, 1);
		assert.strictEqual(parsed.methodology_changed[0].name, 'slugify');
		assert.lengthOf(parsed.methodology_changed[0].budget_diff, 1);
		assert.strictEqual(parsed.methodology_changed[0].budget_diff[0].field, 'min_iterations');
		assert.strictEqual(parsed.methodology_changed[0].budget_diff[0].baseline, 30);
		assert.strictEqual(parsed.methodology_changed[0].budget_diff[0].current, 50);
	});

	test('pretty option', () => {
		const result = {
			baseline_found: false,
			baseline_timestamp: null,
			baseline_commit: null,
			baseline_age_days: null,
			baseline_stale: false,
			baseline_node_version: null,
			current_node_version: process.version,
			node_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
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
