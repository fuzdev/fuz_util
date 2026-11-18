/**
 * Shared helpers for the diff tests: side reconstruction, line-number and
 * normalization invariants, seeded random text pairs, and the captured git
 * fixtures.
 *
 * @module
 */

import { assert } from 'vitest';

import type { DiffLine } from '#lib/diff.ts';

import git_fixtures from './fixtures/diff_git/diff_git_fixtures.json' with { type: 'json' };

/**
 * One text pair with real `git diff --no-index` output at `-U0` and `-U3`,
 * each beside the command that printed it.
 */
export interface DiffGitCase {
	name: string;
	a: string;
	b: string;
	command_u0: string;
	u0: string;
	command_u3: string;
	u3: string;
}

/**
 * One captured `git diff` output and the command that printed it.
 */
export interface DiffGitPatch {
	command: string;
	patch: string;
}

/**
 * Real git output, captured verbatim (headers, `\ No newline` markers, and
 * `\r` included) by `fixtures/diff_git/update.task.ts`. `cases` diff text
 * pairs; `patches` holds output only a repository prints (rename, mode
 * change, binary, new and deleted files) or that isn't a plain line diff
 * (`--word-diff`); `files` holds the renamed file's two versions, for
 * rebuilding its diff from edits.
 */
export const diff_git_fixtures: {
	git_version: string;
	cases: Array<DiffGitCase>;
	patches: Record<string, DiffGitPatch>;
	files: { rename_a: string; rename_b: string };
} = git_fixtures;

/**
 * Looks up a captured patch's text by name, throwing for an unknown name.
 */
export const diff_git_patch = (name: string): string => {
	const patch = diff_git_fixtures.patches[name];
	if (!patch) throw Error(`no diff git patch named ${name}`);
	return patch.patch;
};

/**
 * Rebuilds the `a` text from a diff — `same` + `remove` lines, terminated
 * unless the side's final line carries `no_newline`.
 */
export const reconstruct_a = (diff: Array<DiffLine>): string => {
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
export const reconstruct_b = (diff: Array<DiffLine>): string => {
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
export const assert_line_numbers = (diff: Array<DiffLine>): void => {
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
export const assert_normalized = (diff: Array<DiffLine>): void => {
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

const ALPHABET = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', ''];

/**
 * Generates a random text pair — `b` is `a` with a few spliced deletions,
 * insertions, and replacements, and either side may lack a final newline.
 *
 * @param random - a seeded source of `[0, 1)` numbers
 */
export const random_diff_case = (random: () => number): { a: string; b: string } => {
	const random_int = (max: number): number => Math.floor(random() * max);
	const a_lines: Array<string> = [];
	const a_len = random_int(40);
	for (let i = 0; i < a_len; i++) a_lines.push(ALPHABET[random_int(ALPHABET.length)]!);
	const b_lines = [...a_lines];
	const mutations = random_int(9);
	for (let i = 0; i < mutations; i++) {
		const kind = random_int(3);
		const at = random_int(b_lines.length + 1);
		if (kind === 0) {
			b_lines.splice(at, random_int(4));
		} else if (kind === 1) {
			b_lines.splice(at, 0, ALPHABET[random_int(ALPHABET.length)]!);
		} else if (at < b_lines.length) {
			b_lines[at] = ALPHABET[random_int(ALPHABET.length)]!;
		}
	}
	const terminate = (lines: Array<string>): string => {
		if (lines.length === 0) return '';
		// avoid the ambiguous unterminated-empty-final-line case: an empty
		// final line without a trailing newline is indistinguishable from a
		// terminated text under the reconstruction helpers
		if (lines[lines.length - 1] === '' || random_int(2) === 0) return lines.join('\n') + '\n';
		return lines.join('\n');
	};
	return { a: terminate(a_lines), b: terminate(b_lines) };
};
