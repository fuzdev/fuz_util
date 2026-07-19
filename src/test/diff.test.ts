/**
 * Tests for line and character diff utilities.
 *
 * @module
 */

import {assert, test, describe} from 'vitest';
import {styleText} from 'node:util';

import {
	diff_lines,
	diff_hunks,
	diff_segments,
	format_diff,
	generate_diff,
	type DiffLine,
} from '$lib/diff.ts';
import {configure_print_colors} from '$lib/print.ts';
import {create_random_alea} from '$lib/random_alea.ts';

/**
 * Rebuilds the `a` text from a diff — `same` + `remove` lines, terminated
 * unless the side's final line carries `no_newline`.
 */
const reconstruct_a = (diff: Array<DiffLine>): string => {
	const lines: Array<string> = [];
	let ends_newline = true;
	for (const d of diff) {
		if (d.a_line !== null) {
			lines.push(d.text);
			if (d.no_newline) ends_newline = false;
		}
	}
	if (lines.length === 0) return '';
	return lines.join('\n') + (ends_newline ? '\n' : '');
};

/**
 * Rebuilds the `b` text from a diff — `same` + `add` lines.
 */
const reconstruct_b = (diff: Array<DiffLine>): string => {
	const lines: Array<string> = [];
	let ends_newline = true;
	for (const d of diff) {
		if (d.b_line !== null) {
			lines.push(d.text);
			if (d.no_newline) ends_newline = false;
		}
	}
	if (lines.length === 0) return '';
	return lines.join('\n') + (ends_newline ? '\n' : '');
};

/**
 * Asserts 1-based, gapless, monotonic line numbers per side.
 */
const assert_line_numbers = (diff: Array<DiffLine>): void => {
	let ai = 0;
	let bi = 0;
	for (const d of diff) {
		if (d.a_line !== null) {
			ai++;
			assert.strictEqual(d.a_line, ai);
		}
		if (d.b_line !== null) {
			bi++;
			assert.strictEqual(d.b_line, bi);
		}
	}
};

/**
 * Asserts each changed region is normalized to removes-before-adds.
 */
const assert_normalized = (diff: Array<DiffLine>): void => {
	let seen_add = false;
	for (const d of diff) {
		if (d.type === 'same') {
			seen_add = false;
		} else if (d.type === 'add') {
			seen_add = true;
		} else {
			assert.isFalse(seen_add, 'remove after add within a changed region');
		}
	}
};

describe('diff_lines', () => {
	describe('identical content', () => {
		test('empty strings produce empty diff', () => {
			assert.deepEqual(diff_lines('', ''), []);
		});

		test('identical single unterminated line', () => {
			const result = diff_lines('hello', 'hello');
			assert.deepEqual(result, [
				{type: 'same', text: 'hello', a_line: 1, b_line: 1, no_newline: true},
			]);
		});

		test('identical multiline with trailing newline has no phantom line', () => {
			const content = 'line 1\nline 2\nline 3\n';
			const result = diff_lines(content, content);
			assert.lengthOf(result, 3);
			for (const line of result) {
				assert.strictEqual(line.type, 'same');
				assert.isUndefined(line.no_newline);
			}
		});

		test('duplicate lines', () => {
			const result = diff_lines('a\na\na\n', 'a\na\na\n');
			assert.lengthOf(result, 3);
			assert_line_numbers(result);
		});
	});

	describe('additions', () => {
		test('add to empty', () => {
			const result = diff_lines('', 'new line\n');
			assert.deepEqual(result, [{type: 'add', text: 'new line', a_line: null, b_line: 1}]);
		});

		test('add line at end', () => {
			const result = diff_lines('line 1\n', 'line 1\nline 2\n');
			assert.deepEqual(result, [
				{type: 'same', text: 'line 1', a_line: 1, b_line: 1},
				{type: 'add', text: 'line 2', a_line: null, b_line: 2},
			]);
		});

		test('add line at beginning', () => {
			const result = diff_lines('line 2\n', 'line 1\nline 2\n');
			assert.deepEqual(result, [
				{type: 'add', text: 'line 1', a_line: null, b_line: 1},
				{type: 'same', text: 'line 2', a_line: 1, b_line: 2},
			]);
		});

		test('add multiple lines', () => {
			const result = diff_lines('a\nc\n', 'a\nb1\nb2\nc\n');
			const adds = result.filter((d) => d.type === 'add');
			assert.deepEqual(
				adds.map((d) => d.text),
				['b1', 'b2'],
			);
			assert_line_numbers(result);
		});
	});

	describe('removals', () => {
		test('remove all content', () => {
			const result = diff_lines('old line\n', '');
			assert.deepEqual(result, [{type: 'remove', text: 'old line', a_line: 1, b_line: null}]);
		});

		test('remove line from middle', () => {
			const result = diff_lines('a\nb\nc\n', 'a\nc\n');
			assert.deepEqual(result, [
				{type: 'same', text: 'a', a_line: 1, b_line: 1},
				{type: 'remove', text: 'b', a_line: 2, b_line: null},
				{type: 'same', text: 'c', a_line: 3, b_line: 2},
			]);
		});

		test('remove multiple lines', () => {
			const result = diff_lines('a\nb1\nb2\nc\n', 'a\nc\n');
			const removes = result.filter((d) => d.type === 'remove');
			assert.deepEqual(
				removes.map((d) => d.text),
				['b1', 'b2'],
			);
		});
	});

	describe('modifications', () => {
		test('change in middle emits remove before add with correct numbers', () => {
			const result = diff_lines('a\nold\nc\n', 'a\nnew\nc\n');
			assert.deepEqual(result, [
				{type: 'same', text: 'a', a_line: 1, b_line: 1},
				{type: 'remove', text: 'old', a_line: 2, b_line: null},
				{type: 'add', text: 'new', a_line: null, b_line: 2},
				{type: 'same', text: 'c', a_line: 3, b_line: 3},
			]);
		});

		test('completely different content', () => {
			const result = diff_lines('a\nb\nc\n', 'x\ny\nz\n');
			assert.lengthOf(
				result.filter((d) => d.type === 'remove'),
				3,
			);
			assert.lengthOf(
				result.filter((d) => d.type === 'add'),
				3,
			);
			assert_normalized(result);
		});

		test('minimal edit script on the classic Myers case', () => {
			// abcabba -> cbabac has edit distance 5
			const a = 'a\nb\nc\na\nb\nb\na\n';
			const b = 'c\nb\na\nb\na\nc\n';
			const result = diff_lines(a, b);
			assert.lengthOf(
				result.filter((d) => d.type !== 'same'),
				5,
			);
			assert.strictEqual(reconstruct_a(result), a);
			assert.strictEqual(reconstruct_b(result), b);
		});
	});

	describe('trailing newlines', () => {
		test('newline-only change shows as remove+add of the final line', () => {
			const result = diff_lines('a', 'a\n');
			assert.deepEqual(result, [
				{type: 'remove', text: 'a', a_line: 1, b_line: null, no_newline: true},
				{type: 'add', text: 'a', a_line: null, b_line: 1},
			]);
		});

		test('removing the trailing newline', () => {
			const result = diff_lines('a\n', 'a');
			assert.deepEqual(result, [
				{type: 'remove', text: 'a', a_line: 1, b_line: null},
				{type: 'add', text: 'a', a_line: null, b_line: 1, no_newline: true},
			]);
		});

		test('matching unterminated final lines stay same', () => {
			const result = diff_lines('a\nb', 'a\nb');
			assert.deepEqual(result, [
				{type: 'same', text: 'a', a_line: 1, b_line: 1},
				{type: 'same', text: 'b', a_line: 2, b_line: 2, no_newline: true},
			]);
		});
	});

	describe('max_cost degradation', () => {
		test('disjoint content degrades to a replace block that still round-trips', () => {
			const a = 'a\nb\nc\nd\n';
			const b = 'w\nx\ny\nz\n';
			const result = diff_lines(a, b, {max_cost: 1});
			assert.deepEqual(
				result.map((d) => d.type),
				['remove', 'remove', 'remove', 'remove', 'add', 'add', 'add', 'add'],
			);
			assert.strictEqual(reconstruct_a(result), a);
			assert.strictEqual(reconstruct_b(result), b);
		});

		test('common prefix and suffix survive the cap', () => {
			const result = diff_lines('p\nx\ny\nq\n', 'p\nz\nw\nq\n', {max_cost: 1});
			assert.strictEqual(result[0]!.type, 'same');
			assert.strictEqual(result[0]!.text, 'p');
			assert.strictEqual(result[result.length - 1]!.type, 'same');
			assert.strictEqual(result[result.length - 1]!.text, 'q');
			assert_normalized(result);
		});
	});

	describe('reconstruction', () => {
		test('reconstructing both sides from a mixed diff', () => {
			const a = 'line 1\nline 2\nline 3\nline 4\n';
			const b = 'line 1\nnew line\nline 3\nline 4\nline 5\n';
			const result = diff_lines(a, b);
			assert.strictEqual(reconstruct_a(result), a);
			assert.strictEqual(reconstruct_b(result), b);
		});
	});

	test('determinism', () => {
		const a = 'a\nb\nc\nx\n';
		const b = 'a\nc\ny\nx\n';
		assert.deepEqual(diff_lines(a, b), diff_lines(a, b));
	});
});

describe('diff_hunks', () => {
	test('empty diff returns no hunks', () => {
		assert.deepEqual(diff_hunks([]), []);
	});

	test('no changes returns no hunks', () => {
		const diff = diff_lines('a\nb\nc\n', 'a\nb\nc\n');
		assert.deepEqual(diff_hunks(diff), []);
	});

	test('single change gets context on both sides', () => {
		const a_lines = Array.from({length: 21}, (_, i) => `line ${i + 1}`);
		const b_lines = [...a_lines];
		b_lines[10] = 'modified';
		const diff = diff_lines(a_lines.join('\n') + '\n', b_lines.join('\n') + '\n');
		const hunks = diff_hunks(diff, 3);
		assert.lengthOf(hunks, 1);
		const h = hunks[0]!;
		assert.strictEqual(h.a_start, 8);
		assert.strictEqual(h.a_count, 7);
		assert.strictEqual(h.b_start, 8);
		assert.strictEqual(h.b_count, 7);
		assert.lengthOf(h.lines, 8); // 3 context + remove + add + 3 context
		assert.strictEqual(h.lines[0]!.text, 'line 8');
		assert.strictEqual(h.lines[7]!.text, 'line 14');
	});

	test('context clamps at boundaries', () => {
		const diff = diff_lines('a\nb\n', 'x\nb\n');
		const hunks = diff_hunks(diff, 5);
		assert.lengthOf(hunks, 1);
		assert.strictEqual(hunks[0]!.a_start, 1);
		assert.strictEqual(hunks[0]!.b_start, 1);
	});

	test('nearby changes merge into one hunk, distant ones split', () => {
		const a_lines = Array.from({length: 20}, (_, i) => `line ${i + 1}`);
		const b_lines = [...a_lines];
		b_lines[2] = 'x';
		b_lines[17] = 'y';
		const diff = diff_lines(a_lines.join('\n') + '\n', b_lines.join('\n') + '\n');
		assert.lengthOf(diff_hunks(diff, 1), 2);
		assert.lengthOf(diff_hunks(diff, 10), 1);
	});

	test('pure insertion anchors the empty side to the preceding line', () => {
		const diff = diff_lines('a\nb\n', 'a\nx\nb\n');
		const hunks = diff_hunks(diff, 0);
		assert.lengthOf(hunks, 1);
		const h = hunks[0]!;
		assert.strictEqual(h.a_start, 1);
		assert.strictEqual(h.a_count, 0);
		assert.strictEqual(h.b_start, 2);
		assert.strictEqual(h.b_count, 1);
	});

	test('pure insertion at the very beginning anchors to 0', () => {
		const diff = diff_lines('b\n', 'a\nb\n');
		const hunks = diff_hunks(diff, 0);
		assert.lengthOf(hunks, 1);
		assert.strictEqual(hunks[0]!.a_start, 0);
		assert.strictEqual(hunks[0]!.a_count, 0);
		assert.strictEqual(hunks[0]!.b_start, 1);
	});

	test('pure deletion anchors the empty side to the preceding line', () => {
		const diff = diff_lines('a\nx\nb\n', 'a\nb\n');
		const hunks = diff_hunks(diff, 0);
		assert.lengthOf(hunks, 1);
		const h = hunks[0]!;
		assert.strictEqual(h.a_start, 2);
		assert.strictEqual(h.a_count, 1);
		assert.strictEqual(h.b_start, 1);
		assert.strictEqual(h.b_count, 0);
	});

	test('hunk lines are shared with the input diff, not copied', () => {
		const diff = diff_lines('a\nx\nb\n', 'a\ny\nb\n');
		const hunks = diff_hunks(diff, 1);
		assert.strictEqual(hunks[0]!.lines[0], diff[0]);
	});

	test('context_lines 0 includes only changed lines', () => {
		const diff = diff_lines('before\nold\nafter\n', 'before\nnew\nafter\n');
		const hunks = diff_hunks(diff, 0);
		assert.lengthOf(hunks, 1);
		assert.deepEqual(
			hunks[0]!.lines.map((l) => l.type),
			['remove', 'add'],
		);
	});
});

describe('diff_segments', () => {
	test('identical lines produce empty ranges', () => {
		assert.deepEqual(diff_segments('same', 'same'), {a_ranges: [], b_ranges: []});
	});

	test('both empty produce empty ranges', () => {
		assert.deepEqual(diff_segments('', ''), {a_ranges: [], b_ranges: []});
	});

	test('single char substitution', () => {
		assert.deepEqual(diff_segments('const x = 1;', 'const y = 1;'), {
			a_ranges: [[6, 7]],
			b_ranges: [[6, 7]],
		});
	});

	test('insertion only', () => {
		assert.deepEqual(diff_segments('ab', 'axb'), {a_ranges: [], b_ranges: [[1, 2]]});
	});

	test('deletion only', () => {
		assert.deepEqual(diff_segments('axb', 'ab'), {a_ranges: [[1, 2]], b_ranges: []});
	});

	test('dissimilar lines return null', () => {
		assert.isNull(diff_segments('abc', 'xyz'));
	});

	test('empty vs nonempty returns null', () => {
		assert.isNull(diff_segments('', 'something'));
	});

	test('min_similarity 0 accepts a full rewrite', () => {
		assert.deepEqual(diff_segments('abc', 'xyz', {min_similarity: 0}), {
			a_ranges: [[0, 3]],
			b_ranges: [[0, 3]],
		});
	});

	test('max_length returns null for long lines', () => {
		const long = 'x'.repeat(50);
		assert.isNull(diff_segments(long, long + 'y', {max_length: 10}));
	});

	test('join_gap merges ranges across tiny matched gaps by default', () => {
		assert.deepEqual(diff_segments('abcdef', 'aXcYef'), {
			a_ranges: [[1, 4]],
			b_ranges: [[1, 4]],
		});
	});

	test('join_gap 0 keeps exact ranges', () => {
		assert.deepEqual(diff_segments('abcdef', 'aXcYef', {join_gap: 0}), {
			a_ranges: [
				[1, 2],
				[3, 4],
			],
			b_ranges: [
				[1, 2],
				[3, 4],
			],
		});
	});

	test('join_gap does not merge across wide matched gaps', () => {
		const result = diff_segments('one two three', 'one 2wo threX');
		assert.deepEqual(result, {
			a_ranges: [
				[4, 5],
				[12, 13],
			],
			b_ranges: [
				[4, 5],
				[12, 13],
			],
		});
	});

	test('changed-char total matches the edit distance on the classic case', () => {
		const result = diff_segments('abcabba', 'cbabac', {min_similarity: 0, join_gap: 0});
		assert.isNotNull(result);
		const total =
			result.a_ranges.reduce((sum, [s, e]) => sum + e - s, 0) +
			result.b_ranges.reduce((sum, [s, e]) => sum + e - s, 0);
		assert.strictEqual(total, 5);
	});
});

describe('format_diff', () => {
	const single_change_hunks = () => {
		const a_lines = Array.from({length: 21}, (_, i) => `line ${i + 1}`);
		const b_lines = [...a_lines];
		b_lines[10] = 'modified';
		const diff = diff_lines(a_lines.join('\n') + '\n', b_lines.join('\n') + '\n');
		return diff_hunks(diff, 3);
	};

	test('includes file path headers', () => {
		const result = format_diff([], 'old.txt', 'new.txt');
		assert.strictEqual(result, '--- old.txt\n+++ new.txt');
	});

	test('emits @@ hunk headers', () => {
		const result = format_diff(single_change_hunks(), 'a', 'b');
		assert.include(result, '@@ -8,7 +8,7 @@');
	});

	test('prefixes added, removed, and context lines', () => {
		const result = format_diff(single_change_hunks(), 'a', 'b');
		assert.include(result, '+modified');
		assert.include(result, '-line 11');
		assert.include(result, ' line 8');
	});

	test('plain text by default, colored once print colors are configured', () => {
		const hunks = single_change_hunks();
		assert.notInclude(format_diff(hunks, 'a', 'b'), '\x1b[');
		// node's styleText no-ops on non-TTY streams, so use a deterministic styler
		const fake_st = ((format: unknown, text: string) =>
			`[${String(format)}]${text}[/]`) as typeof styleText;
		configure_print_colors(fake_st);
		try {
			const colored = format_diff(hunks, 'a', 'b');
			assert.include(colored, '[green]+modified[/]');
			assert.include(colored, '[red]-line 11[/]');
			assert.include(colored, '[cyan]@@ -8,7 +8,7 @@[/]');
		} finally {
			configure_print_colors(null);
		}
	});

	test('respects prefix option', () => {
		const result = format_diff(single_change_hunks(), 'a', 'b', {prefix: '  '});
		for (const line of result.split('\n')) {
			assert.isTrue(line.startsWith('  '));
		}
	});

	test('respects max_lines option', () => {
		const diff = diff_lines('', Array.from({length: 100}, (_, i) => `line ${i}`).join('\n') + '\n');
		const hunks = diff_hunks(diff);
		const result = format_diff(hunks, 'a', 'b', {max_lines: 5});
		assert.include(result, '... (95 more lines)');
	});

	test('max_lines 0 shows all lines', () => {
		const diff = diff_lines('', Array.from({length: 10}, (_, i) => `line ${i}`).join('\n') + '\n');
		const hunks = diff_hunks(diff);
		const result = format_diff(hunks, 'a', 'b', {max_lines: 0});
		assert.notInclude(result, 'more lines');
		// 2 headers + 1 @@ + 10 content lines
		assert.lengthOf(result.split('\n'), 13);
	});

	test('emits the no-newline marker', () => {
		const diff = diff_lines('a\n', 'a');
		const result = format_diff(diff_hunks(diff), 'a', 'b');
		assert.include(result, '\\ No newline at end of file');
	});
});

describe('generate_diff', () => {
	test('returns formatted diff for text content', () => {
		const result = generate_diff('old\nline\n', 'new\nline\n', 'test.txt');
		assert.isString(result);
		assert.include(result!, '--- test.txt');
		assert.include(result!, '+++ test.txt');
		assert.include(result!, '-old');
		assert.include(result!, '+new');
	});

	test('returns null for binary content on either side', () => {
		assert.isNull(generate_diff('binary\0content', 'text', 'file.bin'));
		assert.isNull(generate_diff('text', 'binary\0content', 'file.bin'));
		assert.isNull(generate_diff('a\0b', 'c\0d', 'file.bin'));
	});

	test('identical content produces only headers', () => {
		const content = 'same\ncontent\n';
		const result = generate_diff(content, content, 'file.txt');
		assert.strictEqual(result, '--- file.txt\n+++ file.txt');
	});

	test('context filtering keeps distant lines out', () => {
		const a_lines = Array.from({length: 20}, (_, i) => `line ${i}`);
		const b_lines = [...a_lines];
		b_lines[10] = 'modified line 10';
		const result = generate_diff(a_lines.join('\n') + '\n', b_lines.join('\n') + '\n', 'file.txt');
		assert.isString(result);
		assert.include(result!, 'modified line 10');
		assert.notInclude(result!, 'line 0');
		assert.include(result!, '@@');
	});

	test('passes format options through', () => {
		const result = generate_diff('a\n', 'b\n', 'file.txt', {prefix: '> '});
		assert.isString(result);
		for (const line of result!.split('\n')) {
			assert.isTrue(line.startsWith('> '));
		}
	});

	test('both empty strings produce only headers', () => {
		assert.strictEqual(generate_diff('', '', 'file.txt'), '--- file.txt\n+++ file.txt');
	});
});

describe('round-trip property', () => {
	const random = create_random_alea('diff-rework');
	const random_int = (max: number): number => Math.floor(random() * max);
	const alphabet = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', ''];

	const random_case = (): {a: string; b: string} => {
		const a_lines: Array<string> = [];
		const a_len = random_int(40);
		for (let i = 0; i < a_len; i++) a_lines.push(alphabet[random_int(alphabet.length)]!);
		const b_lines = [...a_lines];
		const mutations = random_int(9);
		for (let i = 0; i < mutations; i++) {
			const kind = random_int(3);
			const at = random_int(b_lines.length + 1);
			if (kind === 0) {
				b_lines.splice(at, random_int(4));
			} else if (kind === 1) {
				b_lines.splice(at, 0, alphabet[random_int(alphabet.length)]!);
			} else if (at < b_lines.length) {
				b_lines[at] = alphabet[random_int(alphabet.length)]!;
			}
		}
		const terminate = (lines: Array<string>): string => {
			if (lines.length === 0) return '';
			// avoid the ambiguous unterminated-empty-final-line case: an empty
			// final line without a trailing newline is indistinguishable from a
			// terminated text under this test's reconstruction
			if (lines[lines.length - 1] === '' || random_int(2) === 0) return lines.join('\n') + '\n';
			return lines.join('\n');
		};
		return {a: terminate(a_lines), b: terminate(b_lines)};
	};

	test('diffs reconstruct both sides exactly', () => {
		for (let i = 0; i < 100; i++) {
			const {a, b} = random_case();
			const result = diff_lines(a, b);
			assert.strictEqual(reconstruct_a(result), a, `a mismatch for case ${i}`);
			assert.strictEqual(reconstruct_b(result), b, `b mismatch for case ${i}`);
			assert_line_numbers(result);
			assert_normalized(result);
		}
	});

	test('capped diffs still reconstruct both sides exactly', () => {
		for (let i = 0; i < 100; i++) {
			const {a, b} = random_case();
			const result = diff_lines(a, b, {max_cost: 3});
			assert.strictEqual(reconstruct_a(result), a, `a mismatch for case ${i}`);
			assert.strictEqual(reconstruct_b(result), b, `b mismatch for case ${i}`);
			assert_line_numbers(result);
			assert_normalized(result);
		}
	});
});
