import { describe, test, assert, beforeEach } from 'vitest';

import {
	benchmark_baseline_create,
	benchmark_baseline_serialize,
	benchmark_baseline_parse,
	benchmark_baseline_compare,
	benchmark_baseline_format,
	benchmark_baseline_format_json,
	benchmark_budget_diff,
	type BenchmarkBaseline,
	type BenchmarkBaselineCompareOptions,
	type BenchmarkBaselineCreateOptions
} from '#lib/benchmark_baseline.ts';
import { Benchmark } from '#lib/benchmark.ts';
import { BenchmarkStats } from '#lib/benchmark_stats.ts';
import type { BenchmarkResult } from '#lib/benchmark_types.ts';

// Default budget for synthetic results. Mirrors the DEFAULT_* constants in
// `benchmark.ts` — keep these in sync if the Benchmark class defaults change,
// otherwise synthetic fixtures will silently drift from realistic runs.
const default_budget = {
	duration_ms: 1000,
	warmup_iterations: 10,
	min_iterations: 30,
	max_iterations: 100_000,
	async_resolved: false
};

// Construct a synthetic BenchmarkResult with predictable stats.
const create_synthetic_result = (
	name: string,
	mean_ns: number,
	budget = default_budget
): BenchmarkResult => {
	const timings = Array(100).fill(mean_ns);
	return {
		name,
		stats: new BenchmarkStats(timings),
		iterations: 100,
		total_time_ms: (mean_ns * 100) / 1_000_000,
		timings_ns: timings,
		budget
	};
};

const OPTIONS: BenchmarkBaselineCreateOptions = {
	git_commit: 'abc',
	git_branch: 'main',
	runtime_version: 'v1'
};

const create_result = (name: string, timings_ns: Array<number>): BenchmarkResult => ({
	name,
	stats: new BenchmarkStats(timings_ns),
	iterations: timings_ns.length,
	total_time_ms: 1,
	timings_ns,
	budget: {
		duration_ms: 1000,
		warmup_iterations: 10,
		min_iterations: 30,
		max_iterations: 100_000,
		async_resolved: false
	}
});

// the stored text, as a caller's file would hold it
let stored: string | null;

beforeEach(() => {
	stored = null;
});

const save = (
	results: Array<BenchmarkResult>,
	options?: Partial<BenchmarkBaselineCreateOptions>
): void => {
	stored = benchmark_baseline_serialize(
		benchmark_baseline_create(results, {
			git_commit: null,
			git_branch: null,
			runtime_version: process.version,
			...options
		})
	);
};

const load = (): BenchmarkBaseline | null => {
	if (stored === null) return null;
	const parsed = benchmark_baseline_parse(stored);
	return parsed.ok ? parsed.baseline : null;
};

// rewrites the stored baseline, to simulate one from another run
const rewrite = (mutate: (data: any) => void): void => {
	const data = JSON.parse(stored!);
	mutate(data);
	stored = JSON.stringify(data);
};

const compare = (
	results: Array<BenchmarkResult>,
	options?: Partial<BenchmarkBaselineCompareOptions>
) => benchmark_baseline_compare(results, load(), { runtime_version: process.version, ...options });

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
	budget: default_budget
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
		recommendation: 'Regression detected'
	},
	methodology_changed: false,
	noise_warning: false,
	max_cv: 0.1,
	max_outlier_ratio: 0
});

describe('benchmark_baseline_create', () => {
	test('roundtrips through serialize and parse', async () => {
		const bench = new Benchmark({
			duration_ms: 50,
			min_iterations: 5
		});

		bench.add('task1', () => 1 + 1);
		bench.add('task2', () => 2 + 2);

		await bench.run();

		save(bench.results());

		const loaded = load();

		assert.isNotNull(loaded);
		assert.isDefined(loaded);
		assert.lengthOf(loaded.entries, 2);
		assert.isDefined(loaded.entries[0]);
		assert.isDefined(loaded.entries[1]);
		assert.strictEqual(loaded.entries[0].name, 'task1');
		assert.strictEqual(loaded.entries[1].name, 'task2');
		assert.strictEqual(loaded.runtime_version, process.version);
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
			async_resolved: false
		});
		assert.deepEqual(loaded.entries[1].budget, loaded.entries[0].budget);
	});

	test('custom git info', async () => {
		const bench = new Benchmark({
			duration_ms: 50,
			min_iterations: 5
		});
		bench.add('task1', () => 1 + 1);
		await bench.run();

		save(bench.results(), { git_commit: 'custom_commit_hash', git_branch: 'custom_branch' });

		const loaded = load();

		assert.isNotNull(loaded);
		assert.isDefined(loaded);
		assert.strictEqual(loaded.git_commit, 'custom_commit_hash');
		assert.strictEqual(loaded.git_branch, 'custom_branch');
	});

	test('omits metadata when none is given', () => {
		assert.notProperty(benchmark_baseline_create([], OPTIONS), 'metadata');
	});

	test('a task with no valid samples leaves a baseline that parses', () => {
		const baseline = benchmark_baseline_create(
			[create_result('measured', [1, 2, 3, 4, 5, 6]), create_result('no_samples', [0, 0, 0])],
			OPTIONS
		);
		const parsed = benchmark_baseline_parse(benchmark_baseline_serialize(baseline));
		assert.ok(parsed.ok);
		assert.deepEqual(
			parsed.baseline.entries.map((e) => e.name),
			['measured']
		);
	});
});

describe('benchmark_baseline_parse', () => {
	const assert_parse_error = (text: string, kind: 'invalid' | 'version_mismatch'): void => {
		const parsed = benchmark_baseline_parse(text);
		assert.ok(!parsed.ok);
		assert.strictEqual(parsed.kind, kind);
		assert.ok(parsed.message);
	};

	test('reports text that is not JSON as invalid', () => {
		assert_parse_error('not valid json', 'invalid');
	});

	test('reports JSON that is not a baseline as invalid', () => {
		assert_parse_error('null', 'invalid');
		assert_parse_error('[]', 'invalid');
		assert_parse_error(JSON.stringify({ wrong: 'schema' }), 'invalid');
	});

	test('strips unknown keys and rejects a missing required key', () => {
		save([create_synthetic_result('t', 1000)]);
		rewrite((data) => {
			data.extra = 1;
			data.entries[0].extra = 1;
			data.entries[0].budget.extra = 1;
		});
		const loaded = load();
		assert.isNotNull(loaded);
		assert.notProperty(loaded, 'extra');
		assert.notProperty(loaded.entries[0], 'extra');
		assert.notProperty(loaded.entries[0]!.budget, 'extra');

		rewrite((data) => {
			delete data.runtime_version;
		});
		assert_parse_error(stored!, 'invalid');
	});

	test('reports a version mismatch', () => {
		save([]);
		rewrite((data) => {
			data.version = 999;
		});
		assert_parse_error(stored!, 'version_mismatch');
	});

	test('reports another version as a mismatch even when it fails the schema', () => {
		assert_parse_error(JSON.stringify({ version: 3, node_version: 'v22.0.0' }), 'version_mismatch');
	});
});

describe('benchmark_baseline_serialize', () => {
	test('writes tab-indented JSON with the file version first', () => {
		const baseline = benchmark_baseline_create([create_synthetic_result('a', 1000)], {
			git_commit: 'abc',
			git_branch: 'main',
			runtime_version: 'v99.0.0'
		});
		const text = benchmark_baseline_serialize(baseline);
		assert.ok(text.startsWith('{\n\t"version": 4,\n\t"timestamp": "'));
		const data = JSON.parse(text);
		assert.strictEqual(data.git_commit, 'abc');
		assert.strictEqual(data.git_branch, 'main');
		assert.strictEqual(data.runtime_version, 'v99.0.0');
		assert.strictEqual(data.entries[0].name, 'a');
		assert.notProperty(data, 'metadata');
	});
});

describe('benchmark_baseline_compare', () => {
	test('no baseline', async () => {
		const bench = new Benchmark({
			duration_ms: 50,
			min_iterations: 5
		});

		bench.add('task1', () => 1 + 1);
		await bench.run();

		const comparison = compare(bench.results());

		assert.isFalse(comparison.baseline_found);
		assert.deepEqual(comparison.new_tasks, ['task1']);
		assert.lengthOf(comparison.regressions, 0);
		assert.lengthOf(comparison.improvements, 0);
	});

	test('identical results', async () => {
		const bench = new Benchmark({
			duration_ms: 50,
			min_iterations: 5
		});

		bench.add('task1', () => 1 + 1);
		await bench.run();

		// Save baseline
		save(bench.results());

		// Compare same results
		const comparison = compare(bench.results());

		assert.isTrue(comparison.baseline_found);
		assert.lengthOf(comparison.comparisons, 1);
		assert.lengthOf(comparison.unchanged, 1);
		assert.lengthOf(comparison.regressions, 0);
		assert.lengthOf(comparison.improvements, 0);
	});

	test('new task added', async () => {
		const bench1 = new Benchmark({
			duration_ms: 50,
			min_iterations: 5
		});
		bench1.add('task1', () => 1 + 1);
		await bench1.run();

		save(bench1.results());

		// Add a new task
		const bench2 = new Benchmark({
			duration_ms: 50,
			min_iterations: 5
		});
		bench2.add('task1', () => 1 + 1);
		bench2.add('task2', () => 2 + 2);
		await bench2.run();

		const comparison = compare(bench2.results());

		assert.isTrue(comparison.baseline_found);
		assert.deepEqual(comparison.new_tasks, ['task2']);
		assert.lengthOf(comparison.comparisons, 1);
	});

	test('task removed', async () => {
		const bench1 = new Benchmark({
			duration_ms: 50,
			min_iterations: 5
		});
		bench1.add('task1', () => 1 + 1);
		bench1.add('task2', () => 2 + 2);
		await bench1.run();

		save(bench1.results());

		// Remove a task
		const bench2 = new Benchmark({
			duration_ms: 50,
			min_iterations: 5
		});
		bench2.add('task1', () => 1 + 1);
		await bench2.run();

		const comparison = compare(bench2.results());

		assert.isTrue(comparison.baseline_found);
		assert.deepEqual(comparison.removed_tasks, ['task2']);
		assert.lengthOf(comparison.comparisons, 1);
	});

	test('comparison result structure', async () => {
		const bench = new Benchmark({
			duration_ms: 100,
			min_iterations: 10
		});

		bench.add('consistent', () => {
			let sum = 0;
			for (let i = 0; i < 100; i++) sum += i;
			return sum;
		});

		await bench.run();
		save(bench.results());

		// Run again
		bench.reset();
		await bench.run();

		const comparison = compare(bench.results());

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
			min_iterations: 5
		});
		bench.add('task1', () => 1 + 1);
		await bench.run();

		save(bench.results());

		const comparison = compare(bench.results());

		assert.isTrue(comparison.baseline_found);
		assert.isNotNull(comparison.baseline_age_days);
		assert.isDefined(comparison.baseline_age_days);
		assert.isAtLeast(comparison.baseline_age_days, 0);
		assert.isBelow(comparison.baseline_age_days, 1); // Should be very recent
		assert.isFalse(comparison.baseline_stale);
	});

	test('regression_threshold downgrades small regressions to unchanged', () => {
		// Baseline at 1000ns; current at 1030ns (3% slower).
		save([create_synthetic_result('test_task', 1000)]);

		// 3% is above the practical-significance floor but below the regression threshold.
		const comparison = compare([create_synthetic_result('test_task', 1030)], {
			min_percent_difference: 0.01,
			regression_threshold: 1.05
		});

		assert.lengthOf(comparison.regressions, 0);
		assert.lengthOf(comparison.unchanged, 1);
		assert.isDefined(comparison.unchanged[0]);
		assert.strictEqual(comparison.unchanged[0].name, 'test_task');
	});

	test('methodology change routes to methodology_changed bucket, not regressions or comparisons', () => {
		// Baseline at 1000ns with min_iterations: 10. Current at 1500ns
		// (50% slower — would normally be a regression) but with min_iterations: 50.
		// The budget mismatch should route it to methodology_changed only.
		save([create_synthetic_result('test_task', 1000)]);

		const current = create_synthetic_result('test_task', 1500, {
			...default_budget,
			min_iterations: 50
		});
		const comparison = compare([current]);

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

	test('identical budgets do not flag methodology_changed', () => {
		save([create_synthetic_result('test_task', 1000)]);

		const comparison = compare([create_synthetic_result('test_task', 1000)]);

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
			{ field: 'duration_ms', value: 2000 },
			{ field: 'warmup_iterations', value: 99 },
			{ field: 'min_iterations', value: 50 },
			{ field: 'max_iterations', value: 50_000 },
			{ field: 'async_resolved', value: true }
		] as const;

		for (const { field, value } of cases) {
			save([create_synthetic_result('t', 1000)]);

			const current = create_synthetic_result('t', 1000, { ...default_budget, [field]: value });
			const comparison = compare([current]);

			assert.lengthOf(comparison.methodology_changed, 1, `${field} did not route`);
			assert.lengthOf(comparison.unchanged, 0, `${field} leaked into unchanged`);
			assert.lengthOf(comparison.comparisons, 0, `${field} leaked into comparisons`);
		}
	});

	test('methodology change with multiple fields changed at once', () => {
		save([create_synthetic_result('t', 1000)]);

		const current = create_synthetic_result('t', 1000, {
			duration_ms: 2000,
			warmup_iterations: 99,
			min_iterations: 50,
			max_iterations: 50_000,
			async_resolved: true
		});
		const comparison = compare([current]);

		assert.lengthOf(comparison.methodology_changed, 1);
		assert.isDefined(comparison.methodology_changed[0]);
		// All five fields should appear in the diff used by the formatters.
		const diff = benchmark_budget_diff(
			comparison.methodology_changed[0].baseline.budget,
			comparison.methodology_changed[0].current.budget
		);
		assert.lengthOf(diff, 5);
		assert.deepEqual(diff.map((d) => d.field).sort(), [
			'async_resolved',
			'duration_ms',
			'max_iterations',
			'min_iterations',
			'warmup_iterations'
		]);
	});

	test('runtime_version_changed reflects a runtime version mismatch', () => {
		save([create_synthetic_result('task', 1000)], { runtime_version: 'v0.0.1-fake' });

		const comparison = compare([create_synthetic_result('task', 1000)]);

		assert.isTrue(comparison.runtime_version_changed);
		assert.strictEqual(comparison.baseline_runtime_version, 'v0.0.1-fake');
		assert.strictEqual(comparison.current_runtime_version, process.version);
	});

	test('reports the given runtime version with no baseline', () => {
		const comparison = benchmark_baseline_compare([], null, { runtime_version: 'v99.0.0' });
		assert.strictEqual(comparison.current_runtime_version, 'v99.0.0');
		assert.strictEqual(comparison.baseline_runtime_version, null);
		assert.isFalse(comparison.runtime_version_changed);
	});

	test('noise_warning fires when cv exceeds default 0.3 threshold on either side', () => {
		// Construct a result with cv ≈ 0.5: alternating 500/1500 → mean=1000,
		// std_dev=500. MAD outlier detection keeps all values (modified z-score
		// = 0.6745 < 3.5 threshold), so the persisted std_dev reflects the
		// configured spread.
		const noisy_timings = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 500 : 1500));
		const stable_timings = Array(100).fill(1000);

		const noisy_result = (name: string): BenchmarkResult => ({
			name,
			stats: new BenchmarkStats(noisy_timings),
			iterations: 100,
			total_time_ms: 0.1,
			timings_ns: noisy_timings,
			budget: default_budget
		});
		const stable_result = (name: string): BenchmarkResult => ({
			name,
			stats: new BenchmarkStats(stable_timings),
			iterations: 100,
			total_time_ms: 0.1,
			timings_ns: stable_timings,
			budget: default_budget
		});

		save([noisy_result('baseline_noisy'), stable_result('clean')]);

		const comparison = compare([stable_result('baseline_noisy'), stable_result('clean')]);

		// `baseline_noisy` has noisy baseline → max_cv ≈ 0.5, flags noise_warning.
		// `clean` is stable on both sides → no warning.
		const noisy_entry = [
			...comparison.regressions,
			...comparison.improvements,
			...comparison.unchanged
		].find((r) => r.name === 'baseline_noisy');
		const clean_entry = [
			...comparison.regressions,
			...comparison.improvements,
			...comparison.unchanged
		].find((r) => r.name === 'clean');

		assert.isDefined(noisy_entry);
		assert.isTrue(noisy_entry.noise_warning);
		assert.isAbove(noisy_entry.max_cv, 0.3);
		assert.isDefined(clean_entry);
		assert.isFalse(clean_entry.noise_warning);
	});

	test('noise_warning respects custom noise_warning_cv_threshold', () => {
		// Same noisy fixture (cv ≈ 0.5). With threshold raised to 0.6, the
		// warning is suppressed; with threshold dropped to 0.1, even mildly
		// noisy stable_result (cv near 0) stays suppressed but the noisy one
		// fires earlier.
		const noisy_timings = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 500 : 1500));
		const result = (name: string): BenchmarkResult => ({
			name,
			stats: new BenchmarkStats(noisy_timings),
			iterations: 100,
			total_time_ms: 0.1,
			timings_ns: noisy_timings,
			budget: default_budget
		});

		save([result('t')]);

		const raised = compare([result('t')], { noise_warning_cv_threshold: 0.6 });
		const found_raised = [...raised.regressions, ...raised.improvements, ...raised.unchanged].find(
			(r) => r.name === 't'
		);
		assert.isDefined(found_raised);
		assert.isFalse(found_raised.noise_warning);

		const lowered = compare([result('t')], { noise_warning_cv_threshold: 0.1 });
		const found_lowered = [
			...lowered.regressions,
			...lowered.improvements,
			...lowered.unchanged
		].find((r) => r.name === 't');
		assert.isDefined(found_lowered);
		assert.isTrue(found_lowered.noise_warning);
	});

	test('noise_warning fires on high outlier_ratio even with tight cleaned cv', () => {
		// Timings that produce a tight cleaned distribution but high outlier
		// ratio: 80 samples lightly varied around 1000 (990-1010, gives
		// MAD a non-zero floor so detection actually fires — purely
		// identical inliers collapse MAD to 0 and the IQR fallback then
		// accepts the extremes as legitimate spread). Plus 20 extreme
		// outliers at 50_000 that MAD strips out. After cleaning, cv stays
		// well below the 0.3 cv threshold, but 20/100 = 20% outlier_ratio
		// trips the 0.1 outlier threshold → noise_warning fires anyway.
		const bimodal_timings = [
			...Array.from({ length: 80 }, (_, i) => 990 + (i % 21)),
			...Array(20).fill(50_000)
		];
		const bimodal_result = (name: string): BenchmarkResult => ({
			name,
			stats: new BenchmarkStats(bimodal_timings),
			iterations: 100,
			total_time_ms: 0.1,
			timings_ns: bimodal_timings,
			budget: default_budget
		});

		save([bimodal_result('t')]);

		const comparison = compare([bimodal_result('t')]);

		const entry = [
			...comparison.regressions,
			...comparison.improvements,
			...comparison.unchanged
		].find((r) => r.name === 't');

		assert.isDefined(entry);
		// cv on the cleaned set (990-1010) is near 0.006, well under 0.3.
		assert.isBelow(entry.max_cv, 0.3);
		// But outlier_ratio is well above 0.1 → flag fires anyway.
		assert.isAbove(entry.max_outlier_ratio, 0.1);
		assert.isTrue(entry.noise_warning);
	});

	test('noise_warning_outlier_ratio_threshold is respected', () => {
		// Same bimodal fixture; raising the outlier threshold past the actual
		// rate suppresses the warning, lowering it below makes it fire.
		const bimodal_timings = [
			...Array.from({ length: 80 }, (_, i) => 990 + (i % 21)),
			...Array(20).fill(50_000)
		];
		const bimodal_result = (name: string): BenchmarkResult => ({
			name,
			stats: new BenchmarkStats(bimodal_timings),
			iterations: 100,
			total_time_ms: 0.1,
			timings_ns: bimodal_timings,
			budget: default_budget
		});

		save([bimodal_result('t')]);

		const raised = compare([bimodal_result('t')], {
			noise_warning_cv_threshold: 0.99, // disable cv gate
			noise_warning_outlier_ratio_threshold: 0.5 // above actual ~0.2
		});
		const found_raised = [...raised.regressions, ...raised.improvements, ...raised.unchanged].find(
			(r) => r.name === 't'
		);
		assert.isDefined(found_raised);
		assert.isFalse(found_raised.noise_warning);

		const lowered = compare([bimodal_result('t')], {
			noise_warning_cv_threshold: 0.99, // still disabled
			noise_warning_outlier_ratio_threshold: 0.05 // below actual ~0.2
		});
		const found_lowered = [
			...lowered.regressions,
			...lowered.improvements,
			...lowered.unchanged
		].find((r) => r.name === 't');
		assert.isDefined(found_lowered);
		assert.isTrue(found_lowered.noise_warning);
	});

	test('outlier_ratio survives the baseline JSON roundtrip', () => {
		const bimodal_timings = [
			...Array.from({ length: 80 }, (_, i) => 990 + (i % 21)),
			...Array(20).fill(50_000)
		];
		const bimodal_result: BenchmarkResult = {
			name: 't',
			stats: new BenchmarkStats(bimodal_timings),
			iterations: 100,
			total_time_ms: 0.1,
			timings_ns: bimodal_timings,
			budget: default_budget
		};

		save([bimodal_result]);
		const loaded = load();

		assert.isNotNull(loaded);
		assert.isDefined(loaded.entries[0]);
		assert.isAbove(loaded.entries[0].outlier_ratio, 0.1);
	});

	test('metadata round-trips through save → load → compare', () => {
		// Mirrors the intended consumer pattern: pass run-level context that
		// the comparison math doesn't care about (corpus shape, versions,
		// hardware notes) on save; read it back on the comparison result.
		const metadata = {
			corpus: { svelte: 200, typescript: 150, css: 50 },
			versions: { prettier: '3.2.0', svelte: '5.0.0' },
			binary_sizes: [{ label: 'tsv.wasm', bytes: 1_234_567 }],
			notes: 'thermal throttling observed mid-run'
		};

		save([create_synthetic_result('task', 1000)], { metadata });

		const loaded = load();
		assert.isNotNull(loaded);
		assert.deepEqual(loaded.metadata, metadata);

		const comparison = compare([create_synthetic_result('task', 1000)]);
		assert.deepEqual(comparison.baseline_metadata, metadata);
	});

	test('omitted metadata is absent from the saved file (no spurious "metadata: {}")', () => {
		// truly absent, not just empty, since consumers may distinguish
		// "never set metadata" from "set to {}"
		save([create_synthetic_result('task', 1000)]);

		assert.notProperty(JSON.parse(stored!), 'metadata');

		const comparison = compare([create_synthetic_result('task', 1000)]);
		assert.isNull(comparison.baseline_metadata);
	});

	test('baseline_metadata is null when no baseline exists', () => {
		const comparison = compare([create_synthetic_result('task', 1000)]);
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
			baseline_runtime_version: process.version,
			current_runtime_version: process.version,
			runtime_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [noisy_regression],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
			new_tasks: [],
			removed_tasks: []
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
			baseline_runtime_version: process.version,
			current_runtime_version: process.version,
			runtime_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [noisy_regression, clean_regression],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
			new_tasks: [],
			removed_tasks: []
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
		save(['c', 'a', 'b'].map((name) => create_synthetic_result(name, 1000)));

		const bumped = (name: string) =>
			create_synthetic_result(name, 1000, { ...default_budget, min_iterations: 50 });
		const comparison = compare([bumped('c'), bumped('a'), bumped('b')]);

		assert.lengthOf(comparison.methodology_changed, 3);
		assert.deepEqual(
			comparison.methodology_changed.map((r) => r.name),
			['a', 'b', 'c']
		);
	});

	test('regressions sorted by percent_difference descending', () => {
		save(['a', 'b', 'c'].map((name) => create_synthetic_result(name, 1000)));

		const comparison = compare([
			create_synthetic_result('a', 1500), // 50% slower
			create_synthetic_result('b', 1200), // 20% slower
			create_synthetic_result('c', 1300) // 30% slower
		]);

		assert.lengthOf(comparison.regressions, 3);
		assert.deepEqual(
			comparison.regressions.map((r) => r.name),
			['a', 'c', 'b']
		);
	});

	test('improvements sorted by percent_difference descending', () => {
		save(['a', 'b', 'c'].map((name) => create_synthetic_result(name, 2000)));

		const comparison = compare([
			create_synthetic_result('a', 1000), // 100% faster (2x speedup)
			create_synthetic_result('b', 1500), // 33% faster
			create_synthetic_result('c', 1200) // 67% faster
		]);

		assert.lengthOf(comparison.improvements, 3);
		assert.deepEqual(
			comparison.improvements.map((r) => r.name),
			['a', 'c', 'b']
		);
	});

	test('baseline_stale is true when older than staleness_warning_days', () => {
		// Save a fresh baseline, then rewrite its timestamp to 30 days ago.
		save([create_synthetic_result('task', 1000)]);
		rewrite((data) => {
			data.timestamp = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
		});

		const comparison = compare([create_synthetic_result('task', 1000)], {
			staleness_warning_days: 7
		});

		assert.isTrue(comparison.baseline_stale);
		assert.isNotNull(comparison.baseline_age_days);
		// `isNotNull` narrows the type so the value below is a `number`.
		assert.isAbove(comparison.baseline_age_days, 7);
	});

	test('staleness_warning_days option', async () => {
		const bench = new Benchmark({
			duration_ms: 50,
			min_iterations: 5
		});
		bench.add('task1', () => 1 + 1);
		await bench.run();

		save(bench.results());

		// Fresh baseline should not be stale with reasonable threshold
		const comparison = compare(bench.results(), { staleness_warning_days: 1 });

		assert.isFalse(comparison.baseline_stale);
		assert.isDefined(comparison.baseline_age_days);
		assert.isNotNull(comparison.baseline_age_days);
		assert.isBelow(comparison.baseline_age_days, 1);

		// With staleness_warning_days: 365, should not be stale
		const comparison2 = compare(bench.results(), { staleness_warning_days: 365 });

		assert.isFalse(comparison2.baseline_stale);

		// Without staleness_warning_days, stale should be false
		const comparison3 = compare(bench.results());

		assert.isFalse(comparison3.baseline_stale);
	});

	test('carries the baseline facts to the comparison and its JSON', () => {
		const baseline = benchmark_baseline_create([], OPTIONS);
		const comparison = benchmark_baseline_compare([], baseline, {
			runtime_version: 'v2',
			staleness_warning_days: -1
		});
		assert.strictEqual(comparison.baseline_commit, 'abc');
		const json = JSON.parse(benchmark_baseline_format_json(comparison));
		assert.strictEqual(json.baseline_commit, 'abc');
		assert.strictEqual(json.baseline_runtime_version, 'v1');
		assert.strictEqual(json.current_runtime_version, 'v2');
		assert.isTrue(json.runtime_version_changed);
		assert.isTrue(json.baseline_stale);
	});

	test('a task with a baseline entry and no valid samples reads as removed', () => {
		const baseline = benchmark_baseline_create([create_result('t', [1, 2, 3, 4, 5, 6])], {
			git_commit: null,
			git_branch: null,
			runtime_version: 'v1'
		});
		const comparison = benchmark_baseline_compare([create_result('t', [0, 0, 0])], baseline, {
			runtime_version: 'v1'
		});
		assert.deepEqual(comparison.removed_tasks, ['t']);
		assert.lengthOf(comparison.unchanged, 0);
		assert.lengthOf(comparison.comparisons, 0);
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
			baseline_runtime_version: null,
			current_runtime_version: process.version,
			runtime_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
			new_tasks: ['task1'],
			removed_tasks: []
		};

		const formatted = benchmark_baseline_format(result);

		assert.include(formatted, 'No baseline found');
	});

	test('with results', () => {
		const result = {
			baseline_found: true,
			baseline_timestamp: '2024-01-15T10:30:00Z',
			baseline_commit: 'abc123def456',
			baseline_age_days: 5.5,
			baseline_stale: false,
			baseline_runtime_version: process.version,
			current_runtime_version: process.version,
			runtime_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [create_mock_regression('slow_task', 1000, 2000)],
			improvements: [],
			unchanged: [{ name: 'stable_task' } as any],
			methodology_changed: [],
			new_tasks: [],
			removed_tasks: []
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
			baseline_runtime_version: process.version,
			current_runtime_version: process.version,
			runtime_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
			new_tasks: [],
			removed_tasks: []
		};

		const formatted = benchmark_baseline_format(result);

		assert.include(formatted, '30 days');
		assert.include(formatted, '(STALE)');
	});

	test('runtime_version_changed surfaces in header', () => {
		const result = {
			baseline_found: true,
			baseline_timestamp: '2024-01-15T10:30:00Z',
			baseline_commit: 'abc123def456',
			baseline_age_days: 1,
			baseline_stale: false,
			baseline_runtime_version: 'v22.15.0',
			current_runtime_version: 'v24.0.0',
			runtime_version_changed: true,
			baseline_metadata: null,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
			new_tasks: [],
			removed_tasks: []
		};

		const formatted = benchmark_baseline_format(result);

		assert.include(formatted, 'Baseline runtime: v22.15.0 → v24.0.0');
		assert.include(formatted, 'CHANGED');
	});

	test('methodology_changed section renders budget diff', () => {
		const baseline_entry = create_mock_baseline_entry('slugify', 1000);
		const current_entry = {
			...create_mock_baseline_entry('slugify', 1000),
			budget: { ...default_budget, min_iterations: 50 }
		};
		const result = {
			baseline_found: true,
			baseline_timestamp: '2024-01-15T10:30:00Z',
			baseline_commit: 'abc123def456',
			baseline_age_days: 1,
			baseline_stale: false,
			baseline_runtime_version: process.version,
			current_runtime_version: process.version,
			runtime_version_changed: false,
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
					max_outlier_ratio: 0
				}
			],
			new_tasks: [],
			removed_tasks: []
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
			baseline_runtime_version: process.version,
			current_runtime_version: process.version,
			runtime_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
			new_tasks: ['only_new'],
			removed_tasks: ['only_removed']
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
			min_iterations: 50
		});
		assert.deepEqual(diff, [{ field: 'min_iterations', baseline: 30, current: 50 }]);
	});

	test('async_resolved flip is detected', () => {
		// The resolved sync/async classification is part of the budget — a flip
		// (e.g. auto-detect → explicit `async: true`) shifts every iteration's
		// measurement code path, so it has to surface as methodology drift.
		const diff = benchmark_budget_diff(default_budget, {
			...default_budget,
			async_resolved: true
		});
		assert.deepEqual(diff, [{ field: 'async_resolved', baseline: false, current: true }]);
	});

	test('returns all five entries when every field differs', () => {
		const diff = benchmark_budget_diff(default_budget, {
			duration_ms: 2000,
			warmup_iterations: 99,
			min_iterations: 50,
			max_iterations: 50_000,
			async_resolved: true
		});
		// Order is field-declaration order in the helper; the caller can sort
		// if they need a different one.
		assert.deepEqual(
			diff.map((d) => d.field),
			['duration_ms', 'warmup_iterations', 'min_iterations', 'max_iterations', 'async_resolved']
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
			baseline_runtime_version: process.version,
			current_runtime_version: process.version,
			runtime_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [create_mock_regression('slow_task', 1000, 2000)],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
			new_tasks: ['new_task'],
			removed_tasks: ['old_task']
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
			corpus: { svelte: 200, typescript: 150 },
			versions: { prettier: '3.2.0' }
		};
		const result = {
			baseline_found: true,
			baseline_timestamp: '2024-01-15T10:30:00Z',
			baseline_commit: 'abc',
			baseline_age_days: 1,
			baseline_stale: false,
			baseline_runtime_version: process.version,
			current_runtime_version: process.version,
			runtime_version_changed: false,
			baseline_metadata: metadata,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
			new_tasks: [],
			removed_tasks: []
		};

		const parsed = JSON.parse(benchmark_baseline_format_json(result));
		assert.deepEqual(parsed.baseline_metadata, metadata);
	});

	test('methodology_changed in JSON output carries budget_diff', () => {
		const baseline_entry = create_mock_baseline_entry('slugify', 1000);
		const current_entry = {
			...create_mock_baseline_entry('slugify', 1000),
			budget: { ...default_budget, min_iterations: 50 }
		};
		const result = {
			baseline_found: true,
			baseline_timestamp: '2024-01-15T10:30:00Z',
			baseline_commit: 'abc',
			baseline_age_days: 1,
			baseline_stale: false,
			baseline_runtime_version: process.version,
			current_runtime_version: process.version,
			runtime_version_changed: false,
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
					max_outlier_ratio: 0
				}
			],
			new_tasks: [],
			removed_tasks: []
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
			baseline_runtime_version: null,
			current_runtime_version: process.version,
			runtime_version_changed: false,
			baseline_metadata: null,
			comparisons: [],
			regressions: [],
			improvements: [],
			unchanged: [],
			methodology_changed: [],
			new_tasks: [],
			removed_tasks: []
		};

		const compact = benchmark_baseline_format_json(result);
		const pretty = benchmark_baseline_format_json(result, { pretty: true });

		// Pretty should have newlines, compact should not
		assert.notInclude(compact, '\n');
		assert.include(pretty, '\n');
		assert.include(pretty, '\t');
	});
});
