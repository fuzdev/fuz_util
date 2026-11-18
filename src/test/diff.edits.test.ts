/**
 * Tests for `diff_lines_from_edits` and `diff_edits_from_lines` — rebuilding
 * line diffs from `@@` change regions, including git's own.
 *
 * @module
 */

import { assert, test, describe } from 'vitest';

import {
	diff_edits_from_lines,
	diff_hunks,
	diff_lines,
	diff_lines_from_edits,
	diff_hunks_parse,
	type DiffEdit,
	type DiffLine
} from '#lib/diff.ts';
import { create_random_alea } from '#lib/random_alea.ts';
import { unwrap } from '#lib/result.ts';

import {
	assert_line_numbers,
	assert_normalized,
	diff_git_fixtures,
	diff_git_patch,
	random_diff_case,
	reconstruct_a,
	reconstruct_b
} from './diff_test_helpers.ts';

/**
 * Asserts the edits rebuild exactly what `diff_lines` returns.
 */
const assert_round_trip = (a: string, b: string, message?: string): void => {
	const expected = diff_lines(a, b);
	const edits = diff_edits_from_lines(expected);
	const rebuilt = diff_lines_from_edits(a, b, edits);
	assert.ok(rebuilt.ok, rebuilt.ok ? undefined : `${message ?? ''} ${rebuilt.message}`);
	assert.deepEqual(rebuilt.value, expected, message);
};

/**
 * Reads a `-U0` patch's header numbers as edits.
 */
const to_edits = (patch: string): Array<DiffEdit> =>
	unwrap(diff_hunks_parse(patch)).map((h) => [h.a_start, h.a_count, h.b_start, h.b_count]);

/**
 * Asserts the edits fail with a message containing `includes`.
 */
const assert_fails = (a: string, b: string, edits: Array<DiffEdit>, includes: string): void => {
	const result = diff_lines_from_edits(a, b, edits);
	assert.ok(!result.ok, `expected a failure for ${JSON.stringify(edits)}`);
	assert.include(result.message, includes);
};

const PAIRS: Array<[string, string]> = [
	['', ''],
	['', 'a\n'],
	['a\n', ''],
	['', 'a'],
	['a', ''],
	['a', 'a'],
	['a', 'a\n'],
	['a\n', 'a'],
	['a', 'b'],
	['a\nb', 'a\nc'],
	['a\nb', 'a\nb\n'],
	['a\nb\n', 'a\nb'],
	['a\nb', 'a\nb\nc'],
	['a\nb\nc', 'a\nb'],
	['x\na\nb\nc\n', 'a\nb\nc\ny\n'],
	['a\nb\nc\na\nb\nb\na\n', 'c\nb\na\nb\na\nc\n'],
	['a\r\nb\r\n', 'a\r\nB\r\n'],
	['\n\n\n', '\n\n'],
	['\n\nx', '\nx\n'],
	['same\n', 'same\n']
];

describe('diff_edits_from_lines', () => {
	test('no changes is no edits', () => {
		assert.deepEqual(diff_edits_from_lines(diff_lines('a\nb\n', 'a\nb\n')), []);
		assert.deepEqual(diff_edits_from_lines([]), []);
	});

	test('a pure insertion at the start anchors a to line 0', () => {
		assert.deepEqual(diff_edits_from_lines(diff_lines('b\n', 'a\nb\n')), [[0, 0, 1, 1]]);
	});

	test('a pure insertion mid-file anchors a to the line before', () => {
		assert.deepEqual(diff_edits_from_lines(diff_lines('a\nc\n', 'a\nb\nc\n')), [[1, 0, 2, 1]]);
	});

	test('a pure deletion at the end anchors b to the line before', () => {
		assert.deepEqual(diff_edits_from_lines(diff_lines('a\nb\nc\n', 'a\n')), [[2, 2, 1, 0]]);
	});

	test('deleting everything anchors b to line 0', () => {
		assert.deepEqual(diff_edits_from_lines(diff_lines('a\nb\n', '')), [[1, 2, 0, 0]]);
	});

	test('a newline-only change is a region holding the final line', () => {
		assert.deepEqual(diff_edits_from_lines(diff_lines('a\nb', 'a\nb\n')), [[2, 1, 2, 1]]);
		assert.deepEqual(diff_edits_from_lines(diff_lines('a\nb\n', 'a\nb')), [[2, 1, 2, 1]]);
	});

	test('separate regions are separate edits', () => {
		assert.deepEqual(diff_edits_from_lines(diff_lines('a\nb\nc\nd\n', 'A\nb\nc\nD\nE\n')), [
			[1, 1, 1, 1],
			[4, 1, 4, 2]
		]);
	});
});

describe('diff_lines_from_edits', () => {
	describe('round trips', () => {
		test('hand pairs', () => {
			for (const [a, b] of PAIRS) assert_round_trip(a, b, JSON.stringify([a, b]));
		});

		test('both directions of every hand pair', () => {
			for (const [a, b] of PAIRS) assert_round_trip(b, a, JSON.stringify([b, a]));
		});

		test('seeded random pairs', () => {
			const random = create_random_alea('diff-edits');
			for (let i = 0; i < 200; i++) {
				const { a, b } = random_diff_case(random);
				assert_round_trip(a, b, `case ${i}`);
			}
		});

		test('seeded random pairs at a capped cost, whose regions are coarse', () => {
			const random = create_random_alea('diff-edits-capped');
			for (let i = 0; i < 100; i++) {
				const { a, b } = random_diff_case(random);
				const expected = diff_lines(a, b, { max_cost: 3 });
				const rebuilt = unwrap(diff_lines_from_edits(a, b, diff_edits_from_lines(expected)));
				assert.deepEqual(rebuilt, expected, `case ${i}`);
			}
		});
	});

	describe('shapes', () => {
		test('no edits on equal texts is all same', () => {
			assert.deepEqual(unwrap(diff_lines_from_edits('a\nb', 'a\nb', [])), [
				{ type: 'same', text: 'a', a_line: 1, b_line: 1 },
				{ type: 'same', text: 'b', a_line: 2, b_line: 2, no_newline: true }
			]);
		});

		test('empty texts with no edits', () => {
			assert.deepEqual(unwrap(diff_lines_from_edits('', '', [])), []);
		});

		test('a region need not be the one Myers picks', () => {
			// `x` moves: Myers keeps `a\nb` and moves x, these edits keep x
			const a = 'x\na\nb\n';
			const b = 'a\nb\nx\n';
			const lines = unwrap(
				diff_lines_from_edits(a, b, [
					[0, 0, 1, 2],
					[2, 2, 3, 0]
				])
			);
			assert.deepEqual(lines, [
				{ type: 'add', text: 'a', a_line: null, b_line: 1 },
				{ type: 'add', text: 'b', a_line: null, b_line: 2 },
				{ type: 'same', text: 'x', a_line: 1, b_line: 3 },
				{ type: 'remove', text: 'a', a_line: 2, b_line: null },
				{ type: 'remove', text: 'b', a_line: 3, b_line: null }
			]);
			assert.notDeepEqual(lines, diff_lines(a, b));
		});

		test('touching edits merge into one region, removes before adds', () => {
			const a = 'a\nb\nc\n';
			const b = 'A\nB\nc\n';
			const lines = unwrap(
				diff_lines_from_edits(a, b, [
					[1, 1, 1, 1],
					[2, 1, 2, 1]
				])
			);
			assert.deepEqual(lines, diff_lines(a, b));
			assert.deepEqual(
				lines.map((l) => l.type),
				['remove', 'remove', 'add', 'add', 'same']
			);
		});

		test('a pure deletion touching a pure insertion merges', () => {
			const lines = unwrap(
				diff_lines_from_edits('a\nb\n', 'c\nb\n', [
					[1, 1, 0, 0],
					[1, 0, 1, 1]
				])
			);
			assert.deepEqual(lines, diff_lines('a\nb\n', 'c\nb\n'));
		});

		test('a newline-only change carries no_newline on the unterminated side', () => {
			assert.deepEqual(unwrap(diff_lines_from_edits('a\nb', 'a\nb\n', [[2, 1, 2, 1]])), [
				{ type: 'same', text: 'a', a_line: 1, b_line: 1 },
				{ type: 'remove', text: 'b', a_line: 2, b_line: null, no_newline: true },
				{ type: 'add', text: 'b', a_line: null, b_line: 2 }
			]);
		});

		test('both sides unterminated with an earlier change keep a same final line', () => {
			const lines = unwrap(diff_lines_from_edits('a\nb\nc', 'A\nb\nc', [[1, 1, 1, 1]]));
			assert.deepEqual(lines[lines.length - 1], {
				type: 'same',
				text: 'c',
				a_line: 3,
				b_line: 3,
				no_newline: true
			});
		});

		test('`\\r` stays in line text', () => {
			const lines = unwrap(diff_lines_from_edits('a\r\nb\r\n', 'a\r\nB\r\n', [[2, 1, 2, 1]]));
			assert.deepEqual(
				lines.map((l) => l.text),
				['a\r', 'b\r', 'B\r']
			);
		});
	});

	describe('real git regions', () => {
		for (const c of diff_git_fixtures.cases) {
			test(c.name, () => {
				// the server's half: `-U0` header numbers only
				const edits = to_edits(c.u0);
				const lines = unwrap(diff_lines_from_edits(c.a, c.b, edits));
				assert.strictEqual(reconstruct_a(lines), c.a);
				assert.strictEqual(reconstruct_b(lines), c.b);
				assert_line_numbers(lines);
				assert_normalized(lines);
				assert.deepEqual(diff_edits_from_lines(lines), edits);
				// rebuilt hunks match the ones git printed at each width
				assert.deepEqual(diff_hunks(lines, 0), unwrap(diff_hunks_parse(c.u0)));
				assert.deepEqual(diff_hunks(lines, 3), unwrap(diff_hunks_parse(c.u3)));
			});
		}

		test('git places a slider where diff_lines would not, and the rebuild keeps it', () => {
			const c = diff_git_fixtures.cases.find((c) => c.name === 'slider')!;
			assert.include(c.command_u0, '--diff-algorithm=histogram --indent-heuristic');
			const edits = to_edits(c.u0);
			assert.deepEqual(edits, [[3, 0, 4, 3]]);
			assert.deepEqual(diff_edits_from_lines(diff_lines(c.a, c.b)), [[4, 0, 5, 3]]);
			const lines = unwrap(diff_lines_from_edits(c.a, c.b, edits));
			assert.notDeepEqual(lines, diff_lines(c.a, c.b));
			assert.deepEqual(
				lines.map((l) => [l.type, l.text, l.a_line, l.b_line]),
				[
					['same', '{', 1, 1],
					['same', '  a', 2, 2],
					['same', '}', 3, 3],
					['add', '{', null, 4],
					['add', '  new', null, 5],
					['add', '}', null, 6],
					['same', '{', 4, 7],
					['same', '  b', 5, 8],
					['same', '}', 6, 9]
				]
			);
		});

		test('a renamed file rebuilds from its -U0 edits', () => {
			const { rename_a, rename_b } = diff_git_fixtures.files;
			const lines = unwrap(
				diff_lines_from_edits(rename_a, rename_b, to_edits(diff_git_patch('rename_mode_u0')))
			);
			assert.strictEqual(reconstruct_a(lines), rename_a);
			assert.strictEqual(reconstruct_b(lines), rename_b);
			assert.deepEqual(
				diff_hunks(lines, 3),
				unwrap(diff_hunks_parse(diff_git_patch('rename_mode_u3')))
			);
		});
	});

	describe('inconsistent input', () => {
		const a = 'a\nb\nc\nd\n';
		const b = 'a\nB\nc\nD\n';

		test('the consistent baseline', () => {
			assert.ok(
				diff_lines_from_edits(a, b, [
					[2, 1, 2, 1],
					[4, 1, 4, 1]
				]).ok
			);
		});

		test('out of order', () => {
			assert_fails(
				a,
				b,
				[
					[4, 1, 4, 1],
					[2, 1, 2, 1]
				],
				'edits[1] [2, 1, 2, 1]: out of order or overlapping'
			);
		});

		test('overlapping', () => {
			assert_fails(
				a,
				b,
				[
					[2, 2, 2, 2],
					[3, 1, 3, 1]
				],
				'edits[1] [3, 1, 3, 1]: out of order or overlapping'
			);
		});

		test('past the end of a', () => {
			assert_fails(a, b, [[4, 2, 4, 1]], 'past the end of a, which has 4 lines');
		});

		test('past the end of b', () => {
			assert_fails(a, b, [[4, 1, 4, 2]], 'past the end of b, which has 4 lines');
		});

		test('a pure insertion anchored past the end', () => {
			assert_fails(a, b, [[5, 0, 5, 1]], 'past the end of a');
		});

		test('unchanged runs of different lengths', () => {
			assert_fails(a, b, [[2, 1, 3, 1]], 'the unchanged run before it is 1 lines in a but 2 in b');
		});

		test('a tail of different lengths', () => {
			assert_fails(a, b, [[2, 1, 2, 2]], 'after the last edit is 2 lines in a but 1 in b');
		});

		test('an unchanged line that differs: a stale edit or the wrong blob', () => {
			assert_fails(
				a,
				b,
				[[2, 1, 2, 1]],
				'unchanged a line 4 and b line 4 differ after the last edit'
			);
			assert_fails(a, b, [[4, 1, 4, 1]], 'unchanged a line 2 and b line 2 differ before edits[0]');
		});

		test('edits from a whitespace-ignoring diff, whose unchanged lines differ', () => {
			// `git diff -w` would print only the `c` line as changed
			assert_fails(
				'a\n  b\nc\n',
				'a\n    b\nC\n',
				[[3, 1, 3, 1]],
				'unchanged a line 2 and b line 2 differ before edits[0]'
			);
		});

		test('no edits on texts that differ', () => {
			assert_fails(a, b, [], 'unchanged a line 2 and b line 2 differ with no edits');
			assert_fails('a\n', 'a\nb\n', [], 'with no edits is 1 lines in a but 2 in b');
		});

		test('an unchanged final line that differs only in its newline', () => {
			assert_fails('a\nb', 'a\nb\n', [], 'differ in their final newline');
			assert_fails('x\nb\n', 'y\nb', [[1, 1, 1, 1]], 'differ in their final newline');
		});

		test('non-integer, negative, and non-finite numbers', () => {
			for (const n of [-1, 1.5, NaN, Infinity]) {
				assert_fails(a, b, [[2, n, 2, 1]], 'expected non-negative integers');
			}
		});

		test('a tuple of the wrong length', () => {
			assert_fails(a, b, [[2, 1, 2] as unknown as DiffEdit], 'expected four numbers');
		});

		test('an edit that changes no lines', () => {
			assert_fails(a, b, [[2, 0, 2, 0]], 'changes no lines');
		});

		test('a zero start with a nonzero count', () => {
			assert_fails(a, b, [[0, 1, 1, 1]], 'a_start is 0 with a nonzero a_count');
			assert_fails(a, b, [[1, 1, 0, 1]], 'b_start is 0 with a nonzero b_count');
		});

		test('perturbed edits fail or still rebuild both sides', () => {
			const random = create_random_alea('diff-edits-perturbed');
			const random_int = (max: number): number => Math.floor(random() * max);
			let failures = 0;
			for (let i = 0; i < 300; i++) {
				const { a, b } = random_diff_case(random);
				const edits = diff_edits_from_lines(diff_lines(a, b));
				if (edits.length === 0) continue;
				const edit = edits[random_int(edits.length)]!;
				edit[random_int(4)]! += random_int(2) === 0 ? -1 : 1;
				const result = diff_lines_from_edits(a, b, edits);
				if (!result.ok) {
					failures++;
					continue;
				}
				// an accepted perturbation is another valid diff of the same texts
				const lines: Array<DiffLine> = result.value;
				assert.strictEqual(reconstruct_a(lines), a, `case ${i}`);
				assert.strictEqual(reconstruct_b(lines), b, `case ${i}`);
				assert_line_numbers(lines);
				assert_normalized(lines);
			}
			assert.isAbove(failures, 0);
		});
	});
});
