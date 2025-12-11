import {test, expect, describe} from 'vitest';
import {benchmark_format_table} from '$lib/benchmark_format.js';
import type {BenchmarkResult} from '$lib/benchmark_types.js';

// Helper to create minimal benchmark results for testing
const create_result = (name: string, ops_per_second: number): BenchmarkResult => ({
	name,
	iterations: 1000,
	total_time_ms: 1000,
	timings_ns: [],
	stats: {
		mean_ns: 1_000_000_000 / ops_per_second,
		median_ns: 1_000_000_000 / ops_per_second,
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
});
