import {test, expect, describe} from 'vitest';
import {
	benchmark_format_table,
	benchmark_format_markdown,
	benchmark_format_table_grouped,
	benchmark_format_markdown_grouped,
} from '$lib/benchmark_format.js';
import type {BenchmarkResult} from '$lib/benchmark_types.js';

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
		failed_iterations: 0,
	},
});

describe('benchmark_format_table', () => {
	test('table columns align properly with emojis', () => {
		const results = [
			create_result('fast task', 2_000_000), // 🐆 emoji
			create_result('slow task', 50_000), // 🐢 emoji
		];

		const table = benchmark_format_table(results);
		const lines = table.split('\n');

		// Check that all lines have the same length (proper alignment)
		const line_lengths = lines.map((line) => {
			// Count display width, not string length (emojis are 2 wide)
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
			expect(line_lengths[i]).toBe(first_width);
		}
	});

	test('border and content widths match', () => {
		const results = [create_result('test', 1_000_000)];

		const table = benchmark_format_table(results);
		const lines = table.split('\n');

		// Top border
		const top_border = lines[0]!;
		// Header content
		const header = lines[1]!;

		// Count segments between box characters
		const border_segments = top_border.split(/[┌┬┐]/).filter(Boolean);
		const header_segments = header.split('│').filter(Boolean);

		// Each segment should have matching width
		expect(border_segments.length).toBe(header_segments.length);

		for (let i = 0; i < border_segments.length; i++) {
			const border_width = border_segments[i]!.length;
			const header_width = header_segments[i]!.length;
			expect(border_width).toBe(header_width);
		}
	});

	test('empty results returns placeholder', () => {
		const table = benchmark_format_table([]);
		expect(table).toBe('(no results)');
	});

	test('baseline parameter changes comparison column header', () => {
		const results = [create_result('prettier', 500_000), create_result('tsv', 2_000_000)];

		const table = benchmark_format_table(results, 'prettier');

		// Should have "vs prettier" instead of "vs Best"
		expect(table).toContain('vs prettier');
		expect(table).not.toContain('vs Best');
	});

	test('baseline parameter computes ratios against baseline task', () => {
		const results = [
			create_result('prettier', 500_000), // baseline
			create_result('tsv', 2_000_000), // 4x faster than prettier
		];

		const table = benchmark_format_table(results, 'prettier');

		// prettier should show "baseline" (1.0x)
		// tsv is 4x faster, so ratio = 500000/2000000 = 0.25x
		expect(table).toContain('baseline');
		expect(table).toContain('0.25x');
	});

	test('throws error when baseline task not found', () => {
		const results = [create_result('task1', 1_000_000), create_result('task2', 500_000)];

		expect(() => benchmark_format_table(results, 'nonexistent')).toThrow(
			'Baseline task "nonexistent" not found in results. Available tasks: task1, task2',
		);
	});
});

describe('benchmark_format_markdown', () => {
	test('baseline parameter changes comparison column header', () => {
		const results = [create_result('prettier', 500_000), create_result('tsv', 2_000_000)];

		const markdown = benchmark_format_markdown(results, 'prettier');

		expect(markdown).toContain('vs prettier');
		expect(markdown).not.toContain('vs Best');
	});

	test('throws error when baseline task not found', () => {
		const results = [create_result('task1', 1_000_000)];

		expect(() => benchmark_format_markdown(results, 'nonexistent')).toThrow(
			'Baseline task "nonexistent" not found',
		);
	});
});

describe('benchmark_format_table_grouped', () => {
	test('passes baseline to group tables', () => {
		const results = [
			create_result('format/prettier', 500_000),
			create_result('format/tsv', 2_000_000),
			create_result('parse/babel', 100_000),
		];

		const table = benchmark_format_table_grouped(results, [
			{
				name: 'Format',
				filter: (r) => r.name.startsWith('format/'),
				baseline: 'format/prettier',
			},
			{
				name: 'Parse',
				filter: (r) => r.name.startsWith('parse/'),
			},
		]);

		// Format group should use "vs format/prettier"
		expect(table).toContain('vs format/prettier');
		// Parse group should use "vs Best" (no baseline specified)
		expect(table).toContain('vs Best');
	});

	test('throws when group baseline not found in group results', () => {
		const results = [create_result('format/tsv', 2_000_000)];

		expect(() =>
			benchmark_format_table_grouped(results, [
				{
					name: 'Format',
					filter: (r) => r.name.startsWith('format/'),
					baseline: 'format/prettier', // not in results
				},
			]),
		).toThrow('Baseline task "format/prettier" not found');
	});
});

describe('benchmark_format_markdown_grouped', () => {
	test('creates grouped markdown with headers', () => {
		const results = [
			create_result('format/prettier', 500_000),
			create_result('format/tsv', 2_000_000),
			create_result('parse/babel', 100_000),
		];

		const markdown = benchmark_format_markdown_grouped(results, [
			{
				name: 'Format',
				filter: (r) => r.name.startsWith('format/'),
				baseline: 'format/prettier',
			},
			{
				name: 'Parse',
				filter: (r) => r.name.startsWith('parse/'),
			},
		]);

		// Should have markdown headers
		expect(markdown).toContain('### Format');
		expect(markdown).toContain('### Parse');
		// Format group should use baseline
		expect(markdown).toContain('vs format/prettier');
	});

	test('includes group description when provided', () => {
		const results = [create_result('test', 1_000_000)];

		const markdown = benchmark_format_markdown_grouped(results, [
			{
				name: 'Test Group',
				description: 'This is a description',
				filter: () => true,
			},
		]);

		expect(markdown).toContain('### Test Group');
		expect(markdown).toContain('This is a description');
	});

	test('empty results returns placeholder', () => {
		const markdown = benchmark_format_markdown_grouped([], []);
		expect(markdown).toBe('(no results)');
	});
});
