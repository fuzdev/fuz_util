/**
 * Tests for line-based diff utilities.
 *
 * @module
 */

import {assert, test, describe} from 'vitest';

import {
	diff_lines,
	filter_diff_context,
	format_diff,
	generate_diff,
	type DiffLine,
} from '$lib/diff.ts';

describe('diff_lines', () => {
	describe('identical content', () => {
		test('empty strings produce empty diff', () => {
			const result = diff_lines('', '');
			assert.lengthOf(result, 1);
			assert.strictEqual(result[0]!.type, 'same');
			assert.strictEqual(result[0]!.line, '');
		});

		test('identical single line', () => {
			const result = diff_lines('hello', 'hello');
			assert.lengthOf(result, 1);
			assert.strictEqual(result[0]!.type, 'same');
			assert.strictEqual(result[0]!.line, 'hello');
		});

		test('identical multiline', () => {
			const content = 'line 1\nline 2\nline 3';
			const result = diff_lines(content, content);
			assert.lengthOf(result, 3);
			for (const line of result) {
				assert.strictEqual(line.type, 'same');
			}
		});
	});

	describe('additions', () => {
		test('add to empty', () => {
			const result = diff_lines('', 'new line');
			const adds = result.filter((d) => d.type === 'add');
			assert.isAtLeast(adds.length, 1);
			assert.isTrue(adds.some((d) => d.line === 'new line'));
		});

		test('add line at end', () => {
			const result = diff_lines('line 1', 'line 1\nline 2');
			const types = result.map((d) => d.type);
			assert.include(types, 'same');
			assert.include(types, 'add');
			assert.strictEqual(result.find((d) => d.type === 'add')!.line, 'line 2');
		});

		test('add line at beginning', () => {
			const result = diff_lines('line 2', 'line 1\nline 2');
			const adds = result.filter((d) => d.type === 'add');
			assert.isTrue(adds.some((d) => d.line === 'line 1'));
		});

		test('add multiple lines', () => {
			const result = diff_lines('a\nc', 'a\nb1\nb2\nc');
			const adds = result.filter((d) => d.type === 'add');
			assert.lengthOf(adds, 2);
			assert.strictEqual(adds[0]!.line, 'b1');
			assert.strictEqual(adds[1]!.line, 'b2');
		});
	});

	describe('removals', () => {
		test('remove all content', () => {
			const result = diff_lines('old line', '');
			const removes = result.filter((d) => d.type === 'remove');
			assert.isAtLeast(removes.length, 1);
			assert.isTrue(removes.some((d) => d.line === 'old line'));
		});

		test('remove line from middle', () => {
			const result = diff_lines('a\nb\nc', 'a\nc');
			const removes = result.filter((d) => d.type === 'remove');
			assert.lengthOf(removes, 1);
			assert.strictEqual(removes[0]!.line, 'b');
		});

		test('remove multiple lines', () => {
			const result = diff_lines('a\nb1\nb2\nc', 'a\nc');
			const removes = result.filter((d) => d.type === 'remove');
			assert.lengthOf(removes, 2);
			assert.strictEqual(removes[0]!.line, 'b1');
			assert.strictEqual(removes[1]!.line, 'b2');
		});
	});

	describe('modifications', () => {
		test('single line change', () => {
			const result = diff_lines('old', 'new');
			const removes = result.filter((d) => d.type === 'remove');
			const adds = result.filter((d) => d.type === 'add');
			assert.lengthOf(removes, 1);
			assert.lengthOf(adds, 1);
			assert.strictEqual(removes[0]!.line, 'old');
			assert.strictEqual(adds[0]!.line, 'new');
		});

		test('change in middle preserves context', () => {
			const result = diff_lines('a\nold\nc', 'a\nnew\nc');
			const sames = result.filter((d) => d.type === 'same');
			const removes = result.filter((d) => d.type === 'remove');
			const adds = result.filter((d) => d.type === 'add');
			assert.lengthOf(sames, 2);
			assert.lengthOf(removes, 1);
			assert.lengthOf(adds, 1);
			assert.strictEqual(removes[0]!.line, 'old');
			assert.strictEqual(adds[0]!.line, 'new');
		});

		test('completely different content', () => {
			const result = diff_lines('a\nb\nc', 'x\ny\nz');
			const removes = result.filter((d) => d.type === 'remove');
			const adds = result.filter((d) => d.type === 'add');
			assert.lengthOf(removes, 3);
			assert.lengthOf(adds, 3);
		});
	});

	describe('mixed operations', () => {
		test('add and remove in same diff', () => {
			const result = diff_lines('a\nb\nc', 'a\nx\nc');
			assert.isTrue(result.some((d) => d.type === 'remove' && d.line === 'b'));
			assert.isTrue(result.some((d) => d.type === 'add' && d.line === 'x'));
			assert.isTrue(result.some((d) => d.type === 'same' && d.line === 'a'));
			assert.isTrue(result.some((d) => d.type === 'same' && d.line === 'c'));
		});

		test('reconstructing b from diff', () => {
			const a = 'line 1\nline 2\nline 3\nline 4';
			const b = 'line 1\nnew line\nline 3\nline 4\nline 5';
			const result = diff_lines(a, b);

			// Reconstruct b from the diff
			const reconstructed: Array<string> = [];
			for (const d of result) {
				if (d.type === 'same' || d.type === 'add') {
					reconstructed.push(d.line);
				}
			}
			assert.deepEqual(reconstructed, b.split('\n'));
		});

		test('reconstructing a from diff', () => {
			const a = 'first\nsecond\nthird';
			const b = 'first\nmodified\nthird\nfourth';
			const result = diff_lines(a, b);

			// Reconstruct a from the diff
			const reconstructed: Array<string> = [];
			for (const d of result) {
				if (d.type === 'same' || d.type === 'remove') {
					reconstructed.push(d.line);
				}
			}
			assert.deepEqual(reconstructed, a.split('\n'));
		});
	});

	describe('edge cases', () => {
		test('trailing newline handling', () => {
			const result = diff_lines('a\n', 'a\n');
			assert.lengthOf(result, 2); // 'a' and '' (after trailing newline)
			assert.strictEqual(result[0]!.type, 'same');
			assert.strictEqual(result[1]!.type, 'same');
		});

		test('duplicate lines', () => {
			const result = diff_lines('a\na\na', 'a\na\na');
			assert.lengthOf(result, 3);
			for (const d of result) {
				assert.strictEqual(d.type, 'same');
			}
		});

		test('whitespace-only differences', () => {
			const result = diff_lines('  a', 'a');
			const removes = result.filter((d) => d.type === 'remove');
			const adds = result.filter((d) => d.type === 'add');
			assert.lengthOf(removes, 1);
			assert.lengthOf(adds, 1);
		});
	});
});

describe('filter_diff_context', () => {
	/**
	 * Helper to create a diff with many same lines and a change at a specific index.
	 */
	const make_long_diff = (length: number, change_indices: Array<number>): Array<DiffLine> => {
		const diff: Array<DiffLine> = [];
		for (let i = 0; i < length; i++) {
			if (change_indices.includes(i)) {
				diff.push({type: 'remove', line: `old line ${i}`});
				diff.push({type: 'add', line: `new line ${i}`});
			} else {
				diff.push({type: 'same', line: `line ${i}`});
			}
		}
		return diff;
	};

	test('empty diff returns empty', () => {
		const result = filter_diff_context([]);
		assert.deepEqual(result, []);
	});

	test('no changes returns empty', () => {
		const diff: Array<DiffLine> = [
			{type: 'same', line: 'a'},
			{type: 'same', line: 'b'},
			{type: 'same', line: 'c'},
		];
		const result = filter_diff_context(diff);
		assert.deepEqual(result, []);
	});

	test('all changes are included', () => {
		const diff: Array<DiffLine> = [
			{type: 'remove', line: 'old'},
			{type: 'add', line: 'new'},
		];
		const result = filter_diff_context(diff);
		assert.lengthOf(result, 2);
		assert.strictEqual(result[0]!.type, 'remove');
		assert.strictEqual(result[1]!.type, 'add');
	});

	test('includes context lines around changes', () => {
		const diff: Array<DiffLine> = [
			{type: 'same', line: 'ctx before 3'},
			{type: 'same', line: 'ctx before 2'},
			{type: 'same', line: 'ctx before 1'},
			{type: 'remove', line: 'changed'},
			{type: 'same', line: 'ctx after 1'},
			{type: 'same', line: 'ctx after 2'},
			{type: 'same', line: 'ctx after 3'},
		];
		const result = filter_diff_context(diff, 3);
		assert.lengthOf(result, 7); // 3 before + 1 change + 3 after
	});

	test('custom context_lines parameter', () => {
		const diff: Array<DiffLine> = [
			{type: 'same', line: 'far before'},
			{type: 'same', line: 'near before'},
			{type: 'add', line: 'new'},
			{type: 'same', line: 'near after'},
			{type: 'same', line: 'far after'},
		];
		const result = filter_diff_context(diff, 1);
		assert.lengthOf(result, 3); // 1 before + 1 change + 1 after
		assert.strictEqual(result[0]!.line, 'near before');
		assert.strictEqual(result[1]!.line, 'new');
		assert.strictEqual(result[2]!.line, 'near after');
	});

	test('adds ellipsis for gaps', () => {
		const diff = make_long_diff(20, [2, 17]);
		const result = filter_diff_context(diff, 1);
		const ellipses = result.filter((d) => d.line === '...');
		assert.isAtLeast(ellipses.length, 1);
	});

	test('no ellipsis when changes are close together', () => {
		const diff: Array<DiffLine> = [
			{type: 'add', line: 'a'},
			{type: 'same', line: 'between'},
			{type: 'add', line: 'b'},
		];
		const result = filter_diff_context(diff, 3);
		const ellipses = result.filter((d) => d.line === '...');
		assert.lengthOf(ellipses, 0);
	});

	test('context does not exceed diff boundaries', () => {
		const diff: Array<DiffLine> = [
			{type: 'add', line: 'at start'},
			{type: 'same', line: 'after'},
		];
		const result = filter_diff_context(diff, 5);
		// Should not crash or produce out-of-bounds results
		assert.isAtLeast(result.length, 1);
		assert.isTrue(result.some((d) => d.line === 'at start'));
	});

	test('context_lines 0 includes only changed lines', () => {
		const diff: Array<DiffLine> = [
			{type: 'same', line: 'before'},
			{type: 'remove', line: 'old'},
			{type: 'add', line: 'new'},
			{type: 'same', line: 'after'},
		];
		const result = filter_diff_context(diff, 0);
		assert.lengthOf(result, 2);
		assert.strictEqual(result[0]!.type, 'remove');
		assert.strictEqual(result[1]!.type, 'add');
	});
});

describe('format_diff', () => {
	test('includes file path headers', () => {
		const diff: Array<DiffLine> = [{type: 'same', line: 'content'}];
		const result = format_diff(diff, 'file.txt', 'file.txt');
		assert.include(result, '--- file.txt (current)');
		assert.include(result, '+++ file.txt (desired)');
	});

	test('uses different paths for current and desired', () => {
		const diff: Array<DiffLine> = [{type: 'same', line: 'x'}];
		const result = format_diff(diff, 'old.txt', 'new.txt');
		assert.include(result, '--- old.txt (current)');
		assert.include(result, '+++ new.txt (desired)');
	});

	test('prefixes added lines with +', () => {
		const diff: Array<DiffLine> = [{type: 'add', line: 'new line'}];
		const result = format_diff(diff, 'a', 'b', {use_color: false});
		assert.include(result, '+new line');
	});

	test('prefixes removed lines with -', () => {
		const diff: Array<DiffLine> = [{type: 'remove', line: 'old line'}];
		const result = format_diff(diff, 'a', 'b', {use_color: false});
		assert.include(result, '-old line');
	});

	test('prefixes same lines with space', () => {
		const diff: Array<DiffLine> = [{type: 'same', line: 'unchanged'}];
		const result = format_diff(diff, 'a', 'b', {use_color: false});
		assert.include(result, ' unchanged');
	});

	test('applies ANSI colors by default', () => {
		const diff: Array<DiffLine> = [
			{type: 'add', line: 'added'},
			{type: 'remove', line: 'removed'},
		];
		const result = format_diff(diff, 'a', 'b');
		assert.include(result, '\x1b[32m'); // green for add
		assert.include(result, '\x1b[31m'); // red for remove
		assert.include(result, '\x1b[0m'); // reset
	});

	test('no ANSI colors when use_color is false', () => {
		const diff: Array<DiffLine> = [
			{type: 'add', line: 'added'},
			{type: 'remove', line: 'removed'},
		];
		const result = format_diff(diff, 'a', 'b', {use_color: false});
		assert.notInclude(result, '\x1b[');
	});

	test('no ANSI colors on same lines even with use_color', () => {
		const diff: Array<DiffLine> = [{type: 'same', line: 'unchanged'}];
		const result = format_diff(diff, 'a', 'b', {use_color: true});
		const lines = result.split('\n');
		const same_line = lines.find((l) => l.includes('unchanged'))!;
		assert.notInclude(same_line, '\x1b[');
	});

	test('respects prefix option', () => {
		const diff: Array<DiffLine> = [{type: 'same', line: 'content'}];
		const result = format_diff(diff, 'a', 'b', {prefix: '  '});
		const lines = result.split('\n');
		for (const line of lines) {
			assert.isTrue(line.startsWith('  '));
		}
	});

	test('respects max_lines option', () => {
		const diff: Array<DiffLine> = Array.from({length: 100}, (_, i) => ({
			type: 'add' as const,
			line: `line ${i}`,
		}));
		const result = format_diff(diff, 'a', 'b', {use_color: false, max_lines: 5});
		assert.include(result, '... (95 more lines)');
	});

	test('max_lines 0 shows all lines', () => {
		const diff: Array<DiffLine> = Array.from({length: 10}, (_, i) => ({
			type: 'add' as const,
			line: `line ${i}`,
		}));
		const result = format_diff(diff, 'a', 'b', {use_color: false, max_lines: 0});
		assert.notInclude(result, 'more lines');
		// 2 header lines + 10 content lines
		assert.lengthOf(result.split('\n'), 12);
	});

	test('empty diff shows only headers', () => {
		const result = format_diff([], 'a', 'b');
		const lines = result.split('\n');
		assert.lengthOf(lines, 2);
	});
});

describe('generate_diff', () => {
	test('returns formatted diff for text content', () => {
		const result = generate_diff('old\nline', 'new\nline', 'test.txt');
		assert.isString(result);
		assert.include(result!, '--- test.txt (current)');
		assert.include(result!, '+++ test.txt (desired)');
	});

	test('returns null for binary current content', () => {
		const result = generate_diff('binary\0content', 'text', 'file.bin');
		assert.isNull(result);
	});

	test('returns null for binary desired content', () => {
		const result = generate_diff('text', 'binary\0content', 'file.bin');
		assert.isNull(result);
	});

	test('returns null when both are binary', () => {
		const result = generate_diff('a\0b', 'c\0d', 'file.bin');
		assert.isNull(result);
	});

	test('passes options through to format_diff', () => {
		const result = generate_diff('old', 'new', 'file.txt', {use_color: false});
		assert.isString(result);
		assert.notInclude(result!, '\x1b[');
	});

	test('identical content produces empty-looking diff', () => {
		const content = 'same\ncontent';
		const result = generate_diff(content, content, 'file.txt', {use_color: false});
		assert.isString(result);
		// filter_diff_context returns [] for no changes, so format_diff returns just headers
		const lines = result!.split('\n');
		assert.lengthOf(lines, 2); // just headers
	});

	test('uses path for both current and desired labels', () => {
		const result = generate_diff('a', 'b', 'src/file.ts', {use_color: false});
		assert.isString(result);
		assert.include(result!, '--- src/file.ts (current)');
		assert.include(result!, '+++ src/file.ts (desired)');
	});

	test('handles multiline changes with context filtering', () => {
		const lines_a = Array.from({length: 20}, (_, i) => `line ${i}`);
		const lines_b = [...lines_a];
		lines_b[10] = 'modified line 10';
		const result = generate_diff(lines_a.join('\n'), lines_b.join('\n'), 'file.txt', {
			use_color: false,
		});
		assert.isString(result);
		assert.include(result!, 'modified line 10');
	});

	test('both empty strings', () => {
		const result = generate_diff('', '', 'file.txt', {use_color: false});
		assert.isString(result);
		// Identical content → just headers
		const lines = result!.split('\n');
		assert.lengthOf(lines, 2);
	});
});
