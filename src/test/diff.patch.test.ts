/**
 * Tests for `diff_hunks_parse` — reading one file's unified diff, as git
 * prints it, into hunks.
 *
 * @module
 */

import { assert, test, describe } from 'vitest';

import { diff_hunks, diff_lines, format_diff, diff_hunks_parse } from '#lib/diff.ts';
import { create_random_alea } from '#lib/random_alea.ts';
import { unwrap } from '#lib/result.ts';

import {
	diff_git_fixtures,
	diff_git_patch,
	random_diff_case,
	reconstruct_a,
	reconstruct_b
} from './diff_test_helpers.ts';

const get_case = (name: string) => diff_git_fixtures.cases.find((c) => c.name === name)!;

/**
 * Asserts the patch fails as `invalid` with a message containing `includes`.
 */
const assert_invalid = (patch: string, includes: string): void => {
	const result = diff_hunks_parse(patch);
	assert.ok(!result.ok, `expected a failure for ${JSON.stringify(patch)}`);
	assert.strictEqual(result.kind, 'invalid');
	assert.include(result.message, includes);
};

describe('diff_hunks_parse', () => {
	describe('git output', () => {
		for (const c of diff_git_fixtures.cases) {
			test(`${c.name} at -U3 and -U0`, () => {
				for (const patch of [c.u3, c.u0]) {
					const hunks = unwrap(diff_hunks_parse(patch));
					assert.isAbove(hunks.length, 0);
					for (const h of hunks) {
						let a_count = 0;
						let b_count = 0;
						for (const l of h.lines) {
							if (l.a_line !== null) a_count++;
							if (l.b_line !== null) b_count++;
						}
						assert.strictEqual(a_count, h.a_count);
						assert.strictEqual(b_count, h.b_count);
					}
				}
			});
		}

		test('a hunk covering a whole file rebuilds both sides', () => {
			for (const name of [
				'code_edit',
				'newline_added',
				'newline_removed',
				'both_unterminated_last_changed',
				'unterminated_append',
				'single_unterminated_to_empty',
				'created',
				'deleted',
				'crlf'
			]) {
				const c = get_case(name);
				const hunks = unwrap(diff_hunks_parse(c.u3));
				assert.lengthOf(hunks, 1, name);
				assert.strictEqual(reconstruct_a(hunks[0]!.lines), c.a, name);
				assert.strictEqual(reconstruct_b(hunks[0]!.lines), c.b, name);
			}
		});

		test('a newline added at the end of the file', () => {
			assert.deepEqual(unwrap(diff_hunks_parse(get_case('newline_added').u3)), [
				{
					a_start: 1,
					a_count: 3,
					b_start: 1,
					b_count: 3,
					lines: [
						{ type: 'same', text: 'one', a_line: 1, b_line: 1 },
						{ type: 'same', text: 'two', a_line: 2, b_line: 2 },
						{ type: 'remove', text: 'three', a_line: 3, b_line: null, no_newline: true },
						{ type: 'add', text: 'three', a_line: null, b_line: 3 }
					]
				}
			]);
		});

		test('both sides unterminated with the last line changed', () => {
			const [hunk] = unwrap(diff_hunks_parse(get_case('both_unterminated_last_changed').u0));
			assert.deepEqual(hunk, {
				a_start: 3,
				a_count: 1,
				b_start: 3,
				b_count: 1,
				lines: [
					{ type: 'remove', text: 'three', a_line: 3, b_line: null, no_newline: true },
					{ type: 'add', text: 'THREE', a_line: null, b_line: 3, no_newline: true }
				]
			});
		});

		test('-U0 zero-count sides anchor to the line before', () => {
			const hunks = unwrap(diff_hunks_parse(get_case('code_edit').u0));
			assert.deepEqual(
				hunks.map((h) => [h.a_start, h.a_count, h.b_start, h.b_count]),
				[
					[1, 0, 2, 1],
					[7, 4, 7, 0],
					[12, 1, 9, 2],
					[19, 2, 16, 0],
					[21, 0, 18, 2]
				]
			);
			assert.deepEqual(hunks[0]!.lines, [
				{ type: 'add', text: "import {bar} from './bar.ts';", a_line: null, b_line: 2 }
			]);
		});

		test('a file created and a file deleted', () => {
			assert.deepEqual(unwrap(diff_hunks_parse(get_case('created').u3)), [
				{
					a_start: 0,
					a_count: 0,
					b_start: 1,
					b_count: 2,
					lines: [
						{ type: 'add', text: 'first', a_line: null, b_line: 1 },
						{ type: 'add', text: 'second', a_line: null, b_line: 2 }
					]
				}
			]);
			const [deleted] = unwrap(diff_hunks_parse(diff_git_patch('deleted_file')));
			assert.deepEqual(deleted, {
				a_start: 1,
				a_count: 1,
				b_start: 0,
				b_count: 0,
				lines: [{ type: 'remove', text: 'bye', a_line: 1, b_line: null }]
			});
		});

		test('`\\r` stays in line text', () => {
			const [hunk] = unwrap(diff_hunks_parse(get_case('crlf').u3));
			assert.deepEqual(
				hunk!.lines.map((l) => l.text),
				['one\r', 'two\r', 'TWO\r', 'three\r']
			);
		});

		test('diff-like line text is content, not headers', () => {
			const [hunk] = unwrap(diff_hunks_parse(get_case('diff_like_text').u3));
			assert.deepEqual(
				hunk!.lines.map((l) => [l.type, l.text]),
				[
					['same', '--- a'],
					['remove', '+++ b'],
					['add', '+++ c'],
					['same', '@@ -1 +1 @@'],
					['same', '-x'],
					['remove', '+y'],
					['add', '+z']
				]
			);
		});

		test('rename and mode headers are skipped', () => {
			const hunks = unwrap(diff_hunks_parse(diff_git_patch('rename_mode_u3')));
			assert.lengthOf(hunks, 1);
			assert.strictEqual(hunks[0]!.a_start, 3);
			assert.strictEqual(hunks[0]!.a_count, 7);
			assert.deepEqual(unwrap(diff_hunks_parse(diff_git_patch('rename_mode_u0')))[0]!.lines, [
				{ type: 'remove', text: 'row 6', a_line: 6, b_line: null },
				{ type: 'add', text: 'row six', a_line: null, b_line: 6 }
			]);
		});

		test('headers with no hunks, like a pure rename, parse to no hunks', () => {
			const patch = diff_git_patch('rename_mode_u3');
			const headers = patch.slice(0, patch.indexOf('\nindex ') + 1);
			assert.deepEqual(unwrap(diff_hunks_parse(headers)), []);
		});

		test('a deletion printed with -D has no hunks', () => {
			assert.deepEqual(unwrap(diff_hunks_parse(diff_git_patch('deleted_file_irreversible'))), []);
		});

		test('a new file, with `--- /dev/null`', () => {
			assert.deepEqual(unwrap(diff_hunks_parse(diff_git_patch('added_file'))), [
				{
					a_start: 0,
					a_count: 0,
					b_start: 1,
					b_count: 1,
					lines: [{ type: 'add', text: 'hi', a_line: null, b_line: 1 }]
				}
			]);
		});

		test('an empty unchanged line as `diff.suppressBlankEmpty` prints it', () => {
			const c = get_case('suppress_blank_empty');
			assert.include(c.command_u3, 'diff.suppressBlankEmpty=true');
			assert.include(c.u3, '\n x\n\n-y\n');
			const [hunk] = unwrap(diff_hunks_parse(c.u3));
			assert.deepEqual(
				hunk!.lines.map((l) => [l.type, l.text]),
				[
					['same', 'x'],
					['same', ''],
					['remove', 'y'],
					['add', 'Y'],
					['same', ''],
					['same', 'z']
				]
			);
		});

		test('`--word-diff` output is refused as hunks that change no lines', () => {
			for (const name of ['word_diff_u3', 'word_diff_u0']) {
				const result = diff_hunks_parse(diff_git_patch(name));
				assert.ok(!result.ok, name);
				assert.strictEqual(result.kind, 'invalid');
				assert.include(result.message, 'line 5: a hunk that changes no lines', name);
			}
		});

		test('empty text parses to no hunks', () => {
			assert.deepEqual(unwrap(diff_hunks_parse('')), []);
		});

		test('a binary patch is a binary failure', () => {
			const result = diff_hunks_parse(diff_git_patch('binary'));
			assert.ok(!result.ok);
			assert.strictEqual(result.kind, 'binary');
			const literal = diff_hunks_parse(
				'diff --git a/x b/x\nindex 1..2\nGIT binary patch\nliteral 6\n'
			);
			assert.ok(!literal.ok);
			assert.strictEqual(literal.kind, 'binary');
		});

		test('text without a trailing newline parses the same', () => {
			const c = get_case('code_edit');
			assert.deepEqual(diff_hunks_parse(c.u3.slice(0, -1)), diff_hunks_parse(c.u3));
		});

		test('a hunk with no file headers', () => {
			assert.deepEqual(unwrap(diff_hunks_parse('@@ -1 +1 @@\n-a\n+b\n')), [
				{
					a_start: 1,
					a_count: 1,
					b_start: 1,
					b_count: 1,
					lines: [
						{ type: 'remove', text: 'a', a_line: 1, b_line: null },
						{ type: 'add', text: 'b', a_line: null, b_line: 1 }
					]
				}
			]);
		});
	});

	describe('round trips through format_diff', () => {
		test('seeded random pairs at several context widths', () => {
			const random = create_random_alea('diff-patch');
			for (let i = 0; i < 200; i++) {
				const { a, b } = random_diff_case(random);
				const context = i % 4;
				const hunks = diff_hunks(diff_lines(a, b), context);
				const text = format_diff(hunks, 'a/f', 'b/f', { max_lines: 0 });
				assert.deepEqual(unwrap(diff_hunks_parse(text)), hunks, `case ${i}`);
			}
		});
	});

	describe('malformed input', () => {
		test('fewer lines than the header counts, ended by the next hunk', () => {
			assert_invalid('@@ -1,2 +1,2 @@\n-a\n+b\n@@ -5 +5 @@\n-x\n+y\n', 'the hunk ends early');
		});

		test('fewer lines than the header counts, ended by the text', () => {
			assert_invalid('@@ -1,2 +1,2 @@\n-a\n+b\n', 'the patch ends inside a hunk');
		});

		test('more lines than the header counts', () => {
			assert_invalid('@@ -1 +1 @@\n-a\n+b\n+c\n', 'a line past the count in its hunk headers');
			assert_invalid(
				'@@ -1 +1,2 @@\n-a\n-b\n+c\n',
				'a removed line past the count in its hunk header'
			);
			assert_invalid(
				'@@ -1,2 +1 @@\n-a\n+b\n+c\n',
				'an added line past the count in its hunk header'
			);
			assert_invalid(
				'@@ -1,2 +1 @@\n-a\n+b\n c\n',
				'a context line past the count in its hunk header'
			);
		});

		test('garbage before the first hunk', () => {
			assert_invalid(
				'hello\n@@ -1 +1 @@\n-a\n+b\n',
				'line 1: expected a file header or a hunk header'
			);
			assert_invalid('not a diff at all\n', 'expected a file header');
		});

		test('garbage inside and after a hunk', () => {
			assert_invalid('@@ -1,2 +1,2 @@\n-a\nwhat\n', 'line 3: the hunk ends early');
			assert_invalid(
				'@@ -1 +1 @@\n-a\n+b\ntrailing\n',
				'line 4: a line past the count in its hunk headers'
			);
		});

		test('an empty row inside a hunk is an empty unchanged line', () => {
			const [hunk] = unwrap(diff_hunks_parse('@@ -1,3 +1,3 @@\n a\n\n-b\n+c\n'));
			assert.deepEqual(hunk!.lines[1], { type: 'same', text: '', a_line: 2, b_line: 2 });
			const [trailing] = unwrap(diff_hunks_parse('@@ -1,2 +1,2 @@\n-a\n+b\n\n'));
			assert.deepEqual(trailing!.lines[2], { type: 'same', text: '', a_line: 2, b_line: 2 });
			// past the hunk's counts it's still a stray line
			assert_invalid('@@ -1 +1 @@\n-a\n+b\n\n\n', 'a line past the count');
		});

		test('a hunk with no changed line', () => {
			assert_invalid('@@ -1,2 +1,2 @@\n a\n b\n', 'line 1: a hunk that changes no lines');
			assert_invalid(
				'@@ -1 +1 @@\n a\n@@ -3 +3 @@\n-c\n+d\n',
				'line 1: a hunk that changes no lines'
			);
			assert_invalid(
				'@@ -1 +1 @@\n-a\n+b\n@@ -3 +3 @@\n x\n',
				'line 4: a hunk that changes no lines'
			);
		});

		test('a second file', () => {
			const c = get_case('crlf');
			assert_invalid(c.u3 + c.u3, "line 10: a second file's header");
			// `diff -u` output has no `diff` line, so the next file starts at `---`
			const plain = c.u3.slice(c.u3.indexOf('\n---') + 1);
			assert_invalid(plain + plain, "line 8: a second file's header");
		});

		test('malformed hunk headers', () => {
			for (const header of [
				'@@ -a +1 @@',
				'@@ -1 +1',
				'@@ -1,x +1 @@',
				'@@ -1 +1 @@x',
				'@@ -1 -1 @@',
				'@@ -+1 +1 @@',
				'@@ -1, +1 @@',
				'@@ - 1 +1 @@',
				'@@ -1 +1,-1 @@',
				'@@@ -1 -1 +1 @@@',
				'@@ -1e3 +1 @@',
				'@@'
			]) {
				assert_invalid(`${header}\n-a\n+b\n`, 'a malformed hunk header');
			}
		});

		test('a header with section text still parses', () => {
			assert.ok(diff_hunks_parse('@@ -1 +1 @@ fn main() @@ x\n-a\n+b\n').ok);
		});

		test('a hunk that changes no lines', () => {
			assert_invalid('@@ -1,0 +1,0 @@\n', 'hunk header changes no lines');
		});

		test('a zero start with a nonzero count', () => {
			assert_invalid('@@ -0,1 +1 @@\n-a\n+b\n', 'a_start is 0 with a nonzero a_count');
		});

		test('hunks out of order or overlapping', () => {
			assert_invalid('@@ -5 +5 @@\n-a\n+b\n@@ -2 +2 @@\n-c\n+d\n', 'out of order or overlapping');
			assert_invalid('@@ -2,2 +2,2 @@\n-a\n-b\n+c\n+d\n@@ -3 +3 @@\n-e\n+f\n', 'overlapping');
		});

		test('unchanged runs of different lengths', () => {
			assert_invalid(
				'@@ -2 +3 @@\n-a\n+b\n',
				'the unchanged run before the hunk is 1 lines in a but 2 in b'
			);
			assert_invalid(
				'@@ -1 +1 @@\n-a\n+b\n@@ -5 +4 @@\n-c\n+d\n',
				'the unchanged run before the hunk is 3 lines in a but 2 in b'
			);
		});

		test('a no-newline marker with no line before it', () => {
			assert_invalid(
				'\\ No newline at end of file\n@@ -1 +1 @@\n-a\n+b\n',
				'expected a file header'
			);
			assert_invalid(
				'@@ -1 +1 @@\n\\ No newline at end of file\n-a\n+b\n',
				'with no line before it'
			);
		});

		test('a second no-newline marker', () => {
			assert_invalid(
				'@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file\n\\ No newline at end of file\n',
				'a second no-newline marker'
			);
			assert_invalid(
				'@@ -1 +1 @@\n-a\n\\ No newline at end of file\n\\ No newline at end of file\n+b\n',
				'with no line before it'
			);
		});

		test('a no-newline marker on an empty line', () => {
			// once the hunk's counts are met, on each kind of line
			assert_invalid('@@ -1,2 +1 @@\n a\n-\n\\ No newline at end of file\n', 'on an empty line');
			assert_invalid('@@ -1 +1,2 @@\n a\n+\n\\ No newline at end of file\n', 'on an empty line');
			assert_invalid(
				'@@ -1,2 +1,2 @@\n-a\n+b\n \n\\ No newline at end of file\n',
				'on an empty line'
			);
			// an empty row read as an empty unchanged line (`diff.suppressBlankEmpty`)
			assert_invalid(
				'@@ -1,2 +1,2 @@\n-a\n+b\n\n\\ No newline at end of file\n',
				'on an empty line'
			);
			// inside the hunk, with lines of b still to come
			assert_invalid(
				'@@ -1,2 +1,2 @@\n a\n-\n\\ No newline at end of file\n+b\n',
				'on an empty line'
			);
			// a one-space line isn't empty
			assert.ok(diff_hunks_parse('@@ -1 +1 @@\n- \n\\ No newline at end of file\n+b\n').ok);
		});

		test('a line after a side ended without a newline', () => {
			assert_invalid(
				'@@ -1,2 +1,2 @@\n-a\n\\ No newline at end of file\n-b\n+c\n+d\n',
				'after the end'
			);
			assert_invalid(
				'@@ -1,2 +1,2 @@\n a\n\\ No newline at end of file\n-b\n+c\n',
				'after the end'
			);
		});

		test('a hunk after a side ended without a newline', () => {
			assert_invalid(
				'@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n@@ -2 +2 @@\n-c\n+d\n',
				'a hunk after the end of the file'
			);
		});

		test('a hunk anchored past the end of a side that ended', () => {
			// a pure insertion whose a anchor lies past a's unterminated end
			assert_invalid(
				'@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n@@ -3,0 +4 @@\n+c\n',
				'line 5: a hunk after the end of the file'
			);
			// and a pure deletion past b's
			assert_invalid(
				'@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file\n@@ -4 +3,0 @@\n-c\n',
				'line 5: a hunk after the end of the file'
			);
		});

		test('mutated git patches never throw, and parse consistently or fail', () => {
			const random = create_random_alea('diff-patch-mutated');
			const random_int = (max: number): number => Math.floor(random() * max);
			const patches = diff_git_fixtures.cases.flatMap((c) => [c.u0, c.u3]);
			const fillers = [
				' x',
				'-x',
				'+x',
				'\\ No newline at end of file',
				'@@ -1 +1 @@',
				'',
				'diff --git a/x b/x'
			];
			let failures = 0;
			for (let i = 0; i < 500; i++) {
				const rows = patches[random_int(patches.length)]!.split('\n');
				const at = random_int(rows.length);
				const kind = random_int(3);
				if (kind === 0) rows.splice(at, 1);
				else if (kind === 1) rows.splice(at, 0, fillers[random_int(fillers.length)]!);
				else rows.splice(at, 0, rows[at]!);
				const result = diff_hunks_parse(rows.join('\n'));
				if (!result.ok) {
					failures++;
					continue;
				}
				for (const h of result.value) {
					assert.strictEqual(h.lines.filter((l) => l.a_line !== null).length, h.a_count);
					assert.strictEqual(h.lines.filter((l) => l.b_line !== null).length, h.b_count);
				}
			}
			assert.isAbove(failures, 0);
		});

		test('an added line after a removed final line is fine', () => {
			assert.ok(diff_hunks_parse('@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+a\n').ok);
		});
	});
});
