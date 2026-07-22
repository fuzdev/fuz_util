import { describe, test, assert } from 'vitest';
import {
	benchmark_format_table,
	benchmark_format_markdown,
	benchmark_format_table_grouped,
	benchmark_format_markdown_grouped
} from '$lib/benchmark_format.ts';
import type { BenchmarkResult } from '$lib/benchmark_types.ts';

// Helper to create minimal benchmark results for testing
const create_result = (name: string, ops_per_second: number): BenchmarkResult => ({
	name,
	iterations: 1000,
	total_time_ms: 1000,
	timings_ns: [],
	stats: {
		mean_ns: 1_000_000_000 / ops_per_second,
		p50_ns: 1_000_000_000 / ops_per_second,
		std_dev_ns: 100,
		min_ns: 900,
		max_ns: 1100,
		p75_ns: 1050,
		p90_ns: 1080,
		p95_ns: 1090,
		p99_ns: 1095,
		ops_per_second,
		cv: 0.1,
		confidence_interval_ns: [900, 1100],
		outliers_ns: [],
		outlier_ratio: 0,
		sample_size: 1000,
		raw_sample_size: 1000,
		failed_iterations: 0
	},
	budget: {
		duration_ms: 1000,
		warmup_iterations: 10,
		min_iterations: 30,
		max_iterations: 100_000,
		async_resolved: false
	}
});

describe('benchmark_format_table', () => {
	test('table columns align properly with emojis', () => {
		const results = [create_result('fast task', 2_000_000), create_result('slow task', 50_000)];

		const table = benchmark_format_table(results);
		const lines = table.split('\n');

		// Count display width, not string length (emojis are 2 wide)
		const line_lengths = lines.map((line) => {
			let width = 0;
			for (const char of line) {
				const code = char.codePointAt(0)!;
				if (
					(code >= 0x1f300 && code <= 0x1faff) ||
					(code >= 0x2600 && code <= 0x27bf) ||
					(code >= 0x1f600 && code <= 0x1f64f) ||
					(code >= 0x1f680 && code <= 0x1f6ff)
				) {
					width += 2;
				} else {
					width += 1;
				}
			}
			return width;
		});

		// All lines should have the same display width
		const first_width = line_lengths[0];
		for (let i = 1; i < line_lengths.length; i++) {
			assert.strictEqual(line_lengths[i], first_width);
		}
	});

	test('border and content widths match', () => {
		const results = [create_result('test', 1_000_000)];

		const table = benchmark_format_table(results);
		const lines = table.split('\n');

		assert.isDefined(lines[0]);
		assert.isDefined(lines[1]);
		const top_border = lines[0];
		const header = lines[1];

		// Count segments between box characters
		const border_segments = top_border.split(/[┌┬┐]/).filter(Boolean);
		const header_segments = header.split('│').filter(Boolean);

		// Each segment should have matching width
		assert.strictEqual(border_segments.length, header_segments.length);

		for (let i = 0; i < border_segments.length; i++) {
			const border_seg = border_segments[i];
			const header_seg = header_segments[i];
			assert.isDefined(border_seg);
			assert.isDefined(header_seg);
			assert.strictEqual(border_seg.length, header_seg.length);
		}
	});

	test('empty results returns placeholder', () => {
		const table = benchmark_format_table([]);
		assert.strictEqual(table, '(no results)');
	});

	test('baseline parameter changes comparison column header', () => {
		const results = [create_result('prettier', 500_000), create_result('tsv', 2_000_000)];

		const table = benchmark_format_table(results, 'prettier');

		assert.include(table, 'vs prettier');
		assert.notInclude(table, 'vs Best');
	});

	test('baseline parameter computes ratios against baseline task', () => {
		const results = [create_result('prettier', 500_000), create_result('tsv', 2_000_000)];

		const table = benchmark_format_table(results, 'prettier');

		// prettier should show "baseline" (1.0x)
		// tsv is 4x faster, so ratio = 500000/2000000 = 0.25x
		assert.include(table, 'baseline');
		assert.include(table, '0.25x');
	});

	test('throws error when baseline task not found', () => {
		const results = [create_result('task1', 1_000_000), create_result('task2', 500_000)];

		assert.throws(
			() => benchmark_format_table(results, 'nonexistent'),
			'Baseline task "nonexistent" not found in results. Available tasks: task1, task2'
		);
	});
});

describe('benchmark_format_markdown', () => {
	test('baseline parameter changes comparison column header', () => {
		const results = [create_result('prettier', 500_000), create_result('tsv', 2_000_000)];

		const markdown = benchmark_format_markdown(results, 'prettier');

		assert.include(markdown, 'vs prettier');
		assert.notInclude(markdown, 'vs Best');
	});

	test('throws error when baseline task not found', () => {
		const results = [create_result('task1', 1_000_000)];

		assert.throws(
			() => benchmark_format_markdown(results, 'nonexistent'),
			'Baseline task "nonexistent" not found'
		);
	});
});

describe('benchmark_format_table_grouped', () => {
	test('passes baseline to group tables', () => {
		const results = [
			create_result('format/prettier', 500_000),
			create_result('format/tsv', 2_000_000),
			create_result('parse/babel', 100_000)
		];

		const table = benchmark_format_table_grouped(results, [
			{
				name: 'Format',
				filter: (r) => r.name.startsWith('format/'),
				baseline: 'format/prettier'
			},
			{
				name: 'Parse',
				filter: (r) => r.name.startsWith('parse/')
			}
		]);

		assert.include(table, 'vs format/prettier');
		// Parse group should use "vs Best" (no baseline specified)
		assert.include(table, 'vs Best');
	});

	test('throws when group baseline not found in group results', () => {
		const results = [create_result('format/tsv', 2_000_000)];

		assert.throws(
			() =>
				benchmark_format_table_grouped(results, [
					{
						name: 'Format',
						filter: (r) => r.name.startsWith('format/'),
						baseline: 'format/prettier'
					}
				]),
			'Baseline task "format/prettier" not found'
		);
	});
});

describe('benchmark_format_markdown_grouped', () => {
	test('creates grouped markdown with headers', () => {
		const results = [
			create_result('format/prettier', 500_000),
			create_result('format/tsv', 2_000_000),
			create_result('parse/babel', 100_000)
		];

		const markdown = benchmark_format_markdown_grouped(results, [
			{
				name: 'Format',
				filter: (r) => r.name.startsWith('format/'),
				baseline: 'format/prettier'
			},
			{
				name: 'Parse',
				filter: (r) => r.name.startsWith('parse/')
			}
		]);

		assert.include(markdown, '### Format');
		assert.include(markdown, '### Parse');
		assert.include(markdown, 'vs format/prettier');
	});

	test('includes group description when provided', () => {
		const results = [create_result('test', 1_000_000)];

		const markdown = benchmark_format_markdown_grouped(results, [
			{
				name: 'Test Group',
				description: 'This is a description',
				filter: () => true
			}
		]);

		assert.include(markdown, '### Test Group');
		assert.include(markdown, 'This is a description');
	});

	test('empty results returns placeholder', () => {
		const markdown = benchmark_format_markdown_grouped([], []);
		assert.strictEqual(markdown, '(no results)');
	});
});
