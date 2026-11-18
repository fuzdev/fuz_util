/**
 * Line and intra-line character diffs via greedy Myers over interned
 * sequences, plus hunk grouping and unified-diff text formatting, and the
 * way back in from another differ: line diffs rebuilt from `@@` change
 * regions, and hunks parsed from unified-diff text.
 *
 * @module
 */

import { string_is_binary } from './string.ts';
import { st } from './print.ts';
import type { Result } from './result.ts';

/**
 * One line of a line diff. Line numbers are 1-based; the absent side of an
 * add/remove is `null`.
 */
export interface DiffLine {
	type: 'same' | 'add' | 'remove';
	/**
	 * The line's content, without its newline terminator.
	 */
	text: string;
	a_line: number | null;
	b_line: number | null;
	/**
	 * Set on the final line of a side that lacks a trailing newline (git's
	 * `\ No newline at end of file` semantics). A terminated and an
	 * unterminated line never match, so a newline-only change shows as
	 * remove+add of the final line.
	 */
	no_newline?: boolean;
}

/**
 * Options for `diff_lines`.
 */
export interface DiffOptions {
	/**
	 * Maximum edit cost (Myers `D`) before the remaining changed region
	 * degrades to one whole replace block — bounds worst-case time and memory
	 * on unrelated inputs. The result is always a valid diff.
	 *
	 * @default 2048
	 */
	max_cost?: number;
}

const MAX_COST_DEFAULT = 2048;

/**
 * A group of changed lines with surrounding context. Starts are 1-based; a
 * side with zero lines (pure insertion/deletion at `context_lines: 0`) starts
 * at the line *before* the hunk on that side, 0 at the very beginning —
 * unified-diff `@@` conventions.
 */
export interface DiffHunk {
	a_start: number;
	a_count: number;
	b_start: number;
	b_count: number;
	/**
	 * The hunk's lines, shared (not copied) from the input diff.
	 */
	lines: Array<DiffLine>;
}

/**
 * Changed-character ranges from an intra-line diff of one paired
 * remove/add line. Ranges are `[start, end)` offsets into the respective
 * line's text, in order and non-adjacent.
 */
export interface DiffSegments {
	a_ranges: Array<[number, number]>;
	b_ranges: Array<[number, number]>;
}

/**
 * Options for `diff_segments`.
 */
export interface DiffSegmentsOptions {
	/**
	 * See `DiffOptions.max_cost`.
	 *
	 * @default 2048
	 */
	max_cost?: number;
	/**
	 * Lines longer than this return `null` (no emphasis) — perf guard.
	 *
	 * @default 1000
	 */
	max_length?: number;
	/**
	 * Minimum Dice similarity (`2 * matched_chars / total_chars`) for a
	 * result — below it the pair is considered a rewrite and `null` is
	 * returned so unrelated lines don't get noise emphasis.
	 *
	 * @default 0.3
	 */
	min_similarity?: number;
	/**
	 * Changed ranges separated by at most this many matched characters merge
	 * (per side, with the matched characters absorbed into the range) —
	 * avoids fragmented emphasis when a rewrite happens to match stray
	 * characters. 0 keeps exact ranges.
	 *
	 * @default 2
	 */
	join_gap?: number;
}

// run-length edit op over abstract sequences, the shared core's output
interface DiffEditOp {
	type: 'same' | 'add' | 'remove';
	count: number;
}

/**
 * Merges adjacent ops and normalizes each changed region (a maximal run of
 * non-`same` ops) to removes-before-adds — patch-equivalent, and the shape
 * viewers want for pairing.
 */
const normalize_ops = (ops: Array<DiffEditOp>): Array<DiffEditOp> => {
	const out: Array<DiffEditOp> = [];
	let removes = 0;
	let adds = 0;
	const flush = (): void => {
		if (removes > 0) {
			out.push({ type: 'remove', count: removes });
			removes = 0;
		}
		if (adds > 0) {
			out.push({ type: 'add', count: adds });
			adds = 0;
		}
	};
	for (const op of ops) {
		if (op.type === 'same') {
			flush();
			const last = out[out.length - 1];
			if (last && last.type === 'same') {
				last.count += op.count;
			} else {
				out.push({ type: 'same', count: op.count });
			}
		} else if (op.type === 'remove') {
			removes += op.count;
		} else {
			adds += op.count;
		}
	}
	flush();
	return out;
};

/**
 * Greedy Myers over `a[a_off .. a_off + n)` and `b[b_off .. b_off + m)`,
 * returning single-step ops in order. Assumes `n > 0` and `m > 0`. When the
 * edit cost exceeds `max_cost`, degrades to one remove+add replace block.
 */
const myers_middle = (
	a: ArrayLike<number>,
	a_off: number,
	n: number,
	b: ArrayLike<number>,
	b_off: number,
	m: number,
	max_cost: number
): Array<DiffEditOp> => {
	const cap = Math.min(n + m, max_cost);
	// endpoints indexed by k + cap; per-round compact copies for the backtrack
	const v = new Int32Array(2 * cap + 1);
	const trace: Array<Int32Array> = [];
	let found_d = -1;
	for (let d = 0; d <= cap; d++) {
		for (let k = -d; k <= d; k += 2) {
			let x =
				k === -d || (k !== d && v[cap + k - 1]! < v[cap + k + 1]!)
					? v[cap + k + 1]! // down: consume one of b
					: v[cap + k - 1]! + 1; // right: consume one of a
			let y = x - k;
			while (x < n && y < m && a[a_off + x] === b[b_off + y]) {
				x++;
				y++;
			}
			v[cap + k] = x;
			if (x >= n && y >= m) {
				found_d = d;
				break;
			}
		}
		// row[i] is the endpoint for k = -d + 2i (slots past an early break are
		// stale but never read)
		const row = new Int32Array(d + 1);
		for (let k = -d, i = 0; k <= d; k += 2, i++) row[i] = v[cap + k]!;
		trace.push(row);
		if (found_d !== -1) break;
	}
	if (found_d === -1) {
		return [
			{ type: 'remove', count: n },
			{ type: 'add', count: m }
		];
	}
	const rev: Array<DiffEditOp> = [];
	let x = n;
	let y = m;
	for (let d = found_d; d > 0; d--) {
		const k = x - y;
		const prow = trace[d - 1]!;
		const prev_of = (kk: number): number => prow[(kk + d - 1) >> 1]!;
		const from_down = k === -d || (k !== d && prev_of(k - 1) < prev_of(k + 1));
		const prev_k = from_down ? k + 1 : k - 1;
		const prev_x = prev_of(prev_k);
		const after_x = from_down ? prev_x : prev_x + 1;
		const snake = x - after_x;
		if (snake > 0) rev.push({ type: 'same', count: snake });
		rev.push(from_down ? { type: 'add', count: 1 } : { type: 'remove', count: 1 });
		x = prev_x;
		y = prev_x - prev_k;
	}
	if (x > 0) rev.push({ type: 'same', count: x });
	rev.reverse();
	return rev;
};

/**
 * Diffs two abstract number sequences (interned lines or char codes) into
 * normalized run-length ops: common prefix/suffix trimming, then greedy Myers
 * on the middle.
 */
const diff_ops = (
	a: ArrayLike<number>,
	b: ArrayLike<number>,
	max_cost: number
): Array<DiffEditOp> => {
	const n_total = a.length;
	const m_total = b.length;
	let pre = 0;
	while (pre < n_total && pre < m_total && a[pre] === b[pre]) pre++;
	let suf = 0;
	while (
		suf < n_total - pre &&
		suf < m_total - pre &&
		a[n_total - 1 - suf] === b[m_total - 1 - suf]
	) {
		suf++;
	}
	const n = n_total - pre - suf;
	const m = m_total - pre - suf;
	const ops: Array<DiffEditOp> = [];
	if (pre > 0) ops.push({ type: 'same', count: pre });
	if (n === 0) {
		if (m > 0) ops.push({ type: 'add', count: m });
	} else if (m === 0) {
		ops.push({ type: 'remove', count: n });
	} else {
		const middle = myers_middle(a, pre, n, b, pre, m, max_cost);
		for (const op of middle) ops.push(op);
	}
	if (suf > 0) ops.push({ type: 'same', count: suf });
	return normalize_ops(ops);
};

/**
 * Splits into lines without terminators: a text ending in `\n` contributes
 * exactly its terminated lines (no phantom empty final line), one not ending
 * in `\n` has an unterminated final line, and `''` has no lines at all.
 */
const split_lines = (text: string): { lines: Array<string>; ends_newline: boolean } => {
	if (text === '') return { lines: [], ends_newline: true };
	const lines = text.split('\n');
	if (lines[lines.length - 1] === '') {
		lines.pop();
		return { lines, ends_newline: true };
	}
	return { lines, ends_newline: false };
};

/**
 * Interns lines to ids in `ids`, shared across both sides so equal lines get
 * equal ids. An unterminated final line interns in a separate key namespace,
 * so it never matches a terminated line of the same text.
 */
const intern_lines = (
	lines: Array<string>,
	ends_newline: boolean,
	ids: Map<string, number>
): Int32Array => {
	const out = new Int32Array(lines.length);
	const last = lines.length - 1;
	for (let i = 0; i < lines.length; i++) {
		const key = (!ends_newline && i === last ? 'u' : 't') + lines[i]!;
		let id = ids.get(key);
		if (id === undefined) {
			id = ids.size;
			ids.set(key, id);
		}
		out[i] = id;
	}
	return out;
};

/**
 * Generates a line diff between two strings — greedy Myers over interned
 * lines, with each changed region normalized to removes-before-adds.
 * Splits on `\n` only (`\r` stays in line text).
 *
 * @param a - the original content
 * @param b - the updated content
 */
export const diff_lines = (a: string, b: string, options: DiffOptions = {}): Array<DiffLine> => {
	const { max_cost = MAX_COST_DEFAULT } = options;
	const a_split = split_lines(a);
	const b_split = split_lines(b);
	const a_lines = a_split.lines;
	const b_lines = b_split.lines;
	const ids: Map<string, number> = new Map();
	const a_ids = intern_lines(a_lines, a_split.ends_newline, ids);
	const b_ids = intern_lines(b_lines, b_split.ends_newline, ids);
	const ops = diff_ops(a_ids, b_ids, max_cost);
	const a_last_unterminated = a_split.ends_newline ? -1 : a_lines.length - 1;
	const b_last_unterminated = b_split.ends_newline ? -1 : b_lines.length - 1;
	const result: Array<DiffLine> = [];
	let ai = 0;
	let bi = 0;
	for (const op of ops) {
		for (let i = 0; i < op.count; i++) {
			if (op.type === 'same') {
				const line: DiffLine = { type: 'same', text: a_lines[ai]!, a_line: ai + 1, b_line: bi + 1 };
				if (ai === a_last_unterminated) line.no_newline = true;
				result.push(line);
				ai++;
				bi++;
			} else if (op.type === 'remove') {
				const line: DiffLine = { type: 'remove', text: a_lines[ai]!, a_line: ai + 1, b_line: null };
				if (ai === a_last_unterminated) line.no_newline = true;
				result.push(line);
				ai++;
			} else {
				const line: DiffLine = { type: 'add', text: b_lines[bi]!, a_line: null, b_line: bi + 1 };
				if (bi === b_last_unterminated) line.no_newline = true;
				result.push(line);
				bi++;
			}
		}
	}
	return result;
};

/**
 * Groups a line diff into hunks — changed lines plus `context_lines` of
 * surrounding context, with overlapping or adjacent windows merged. Returns
 * `[]` when nothing changed.
 *
 * @param context_lines - number of context lines around changes (default: 3)
 */
export const diff_hunks = (lines: Array<DiffLine>, context_lines = 3): Array<DiffHunk> => {
	const len = lines.length;
	const hunks: Array<DiffHunk> = [];
	let window_start = -1;
	let window_end = -1; // inclusive
	const flush = (): void => {
		if (window_start === -1) return;
		const hunk_lines = lines.slice(window_start, window_end + 1);
		let a_start = 0;
		let b_start = 0;
		let a_count = 0;
		let b_count = 0;
		for (const l of hunk_lines) {
			if (l.a_line !== null) {
				if (a_count === 0) a_start = l.a_line;
				a_count++;
			}
			if (l.b_line !== null) {
				if (b_count === 0) b_start = l.b_line;
				b_count++;
			}
		}
		// a zero-count side anchors to the last line before the hunk on that side
		if (a_count === 0) {
			for (let i = window_start - 1; i >= 0; i--) {
				const a_line = lines[i]!.a_line;
				if (a_line !== null) {
					a_start = a_line;
					break;
				}
			}
		}
		if (b_count === 0) {
			for (let i = window_start - 1; i >= 0; i--) {
				const b_line = lines[i]!.b_line;
				if (b_line !== null) {
					b_start = b_line;
					break;
				}
			}
		}
		hunks.push({ a_start, a_count, b_start, b_count, lines: hunk_lines });
		window_start = -1;
		window_end = -1;
	};
	for (let i = 0; i < len; i++) {
		if (lines[i]!.type === 'same') continue;
		const start = Math.max(0, i - context_lines);
		const end = Math.min(len - 1, i + context_lines);
		if (window_start === -1) {
			window_start = start;
			window_end = end;
		} else if (start <= window_end + 1) {
			window_end = end;
		} else {
			flush();
			window_start = start;
			window_end = end;
		}
	}
	flush();
	return hunks;
};

/**
 * One change region as a `@@` header numbers it,
 * `[a_start, a_count, b_start, b_count]` — the line-text-free form of a diff
 * that `git diff -U0` headers carry. Starts are 1-based; a side with a zero
 * count starts at the line *before* the region on that side, 0 at the very
 * beginning, as in `DiffHunk`. A count omitted from a header is 1.
 */
export type DiffEdit = [a_start: number, a_count: number, b_start: number, b_count: number];

/**
 * The 0-based number of lines before a region on one side, from its
 * 1-based `@@` start.
 */
const edit_position = (start: number, count: number): number => (count > 0 ? start - 1 : start);

/**
 * Checks one edit's numbers, returning why they're unusable or `null`.
 */
const check_edit_numbers = (edit: DiffEdit): string | null => {
	if (edit.length !== 4) return 'expected four numbers';
	for (const n of edit) {
		if (!Number.isSafeInteger(n) || n < 0) return 'expected non-negative integers';
	}
	const [a_start, a_count, b_start, b_count] = edit;
	if (a_count === 0 && b_count === 0) return 'changes no lines';
	if (a_count > 0 && a_start === 0) return 'a_start is 0 with a nonzero a_count';
	if (b_count > 0 && b_start === 0) return 'b_start is 0 with a nonzero b_count';
	return null;
};

/**
 * A failed `diff_lines_from_edits` result naming the edit, its label built
 * only on failure.
 */
const edit_fail = (i: number, edit: DiffEdit, reason: string): { ok: false; message: string } => ({
	ok: false,
	message: `edits[${i}] [${edit.join(', ')}]: ${reason}`
});

/**
 * Rebuilds a whole-file line diff from two texts and their change regions —
 * the `Array<DiffLine>` that `diff_lines(a, b)` returns when its diff chose
 * these regions. Lets a caller render another differ's choices, like git's
 * histogram diff from `git diff -U0` headers, without the line text crossing
 * a wire.
 *
 * Lines split as in `diff_lines`, so a terminated and an unterminated final
 * line never match: git reports a newline-only change as a region holding
 * the final line, and that region's lines carry `no_newline`. Each region
 * emits its removes before its adds; the lines between regions are `same`.
 * Edits that touch (no unchanged line between them on either side) merge
 * into one region, as `diff_lines` normalizes a run of changes. An empty
 * `edits` asserts the texts are equal.
 *
 * Inconsistent input is an expected failure, not a bug — stale edits or the
 * wrong blob — so it returns a failed `Result` naming the edit or line:
 * numbers that aren't non-negative integers, an edit that changes no lines,
 * edits out of order or overlapping, a region past either text's end,
 * unchanged runs of different lengths on the two sides, or an unchanged
 * line whose text (or final newline) differs between the sides.
 *
 * The edits must come from an exact-text diff of these same texts: with git,
 * `--no-textconv --no-ext-diff`, no color or `--word-diff`, no option that
 * ignores whitespace or lines (`-w`, `-b`, `--ignore-space-at-eol`,
 * `--ignore-cr-at-eol`, `--ignore-blank-lines`, `-I`), and blobs or commits
 * rather than a worktree file that clean/smudge filters or `core.autocrlf`
 * change. Under an ignoring option git calls lines unchanged whose text
 * differs, which a `same` `DiffLine` can't hold, so such edits are refused.
 *
 * @param a - the original content
 * @param b - the updated content
 * @param edits - the change regions in order, as `diff_edits_from_lines` returns them
 * @returns the line diff, or why the edits don't fit the texts
 */
export const diff_lines_from_edits = (
	a: string,
	b: string,
	edits: Array<DiffEdit>
): Result<{ value: Array<DiffLine> }, { message: string }> => {
	const a_split = split_lines(a);
	const b_split = split_lines(b);
	const a_lines = a_split.lines;
	const b_lines = b_split.lines;
	const a_last_unterminated = a_split.ends_newline ? -1 : a_lines.length - 1;
	const b_last_unterminated = b_split.ends_newline ? -1 : b_lines.length - 1;
	const result: Array<DiffLine> = [];
	let ai = 0;
	let bi = 0;
	// where the pending changed region starts, -1 for none; touching edits extend it
	let region_a = -1;
	let region_b = -1;
	const flush_region = (): void => {
		if (region_a === -1) return;
		for (let i = region_a; i < ai; i++) {
			const line: DiffLine = { type: 'remove', text: a_lines[i]!, a_line: i + 1, b_line: null };
			if (i === a_last_unterminated) line.no_newline = true;
			result.push(line);
		}
		for (let i = region_b; i < bi; i++) {
			const line: DiffLine = { type: 'add', text: b_lines[i]!, a_line: null, b_line: i + 1 };
			if (i === b_last_unterminated) line.no_newline = true;
			result.push(line);
		}
		region_a = -1;
		region_b = -1;
	};
	// emits `count` unchanged lines, returning why one doesn't match or `null`
	const emit_same = (count: number, where: string): string | null => {
		for (let i = 0; i < count; i++) {
			const a_text = a_lines[ai]!;
			const a_unterminated = ai === a_last_unterminated;
			if (a_text !== b_lines[bi]) {
				return `unchanged a line ${ai + 1} and b line ${bi + 1} differ ${where}`;
			}
			if (a_unterminated !== (bi === b_last_unterminated)) {
				return `unchanged a line ${ai + 1} and b line ${bi + 1} differ in their final newline ${where}`;
			}
			const line: DiffLine = { type: 'same', text: a_text, a_line: ai + 1, b_line: bi + 1 };
			if (a_unterminated) line.no_newline = true;
			result.push(line);
			ai++;
			bi++;
		}
		return null;
	};
	// check the edits' structure before any text, so a structural fault reports as one
	let a_end = 0;
	let b_end = 0;
	for (let i = 0; i < edits.length; i++) {
		const edit = edits[i]!;
		const invalid = check_edit_numbers(edit);
		if (invalid !== null) return edit_fail(i, edit, invalid);
		const [a_start, a_count, b_start, b_count] = edit;
		const a_pos = edit_position(a_start, a_count);
		const b_pos = edit_position(b_start, b_count);
		if (a_pos < a_end || b_pos < b_end) {
			return edit_fail(i, edit, 'out of order or overlapping the previous edit');
		}
		if (a_pos + a_count > a_lines.length) {
			return edit_fail(i, edit, `past the end of a, which has ${a_lines.length} lines`);
		}
		if (b_pos + b_count > b_lines.length) {
			return edit_fail(i, edit, `past the end of b, which has ${b_lines.length} lines`);
		}
		if (a_pos - a_end !== b_pos - b_end) {
			return edit_fail(
				i,
				edit,
				`the unchanged run before it is ${a_pos - a_end} lines in a but ${b_pos - b_end} in b`
			);
		}
		a_end = a_pos + a_count;
		b_end = b_pos + b_count;
	}
	const tail = a_lines.length - a_end;
	const where = edits.length === 0 ? 'with no edits' : 'after the last edit';
	if (tail !== b_lines.length - b_end) {
		return {
			ok: false,
			message: `the unchanged run ${where} is ${tail} lines in a but ${b_lines.length - b_end} in b`
		};
	}
	for (let i = 0; i < edits.length; i++) {
		const [a_start, a_count, b_start, b_count] = edits[i]!;
		const a_pos = edit_position(a_start, a_count);
		const b_pos = edit_position(b_start, b_count);
		const gap = a_pos - ai;
		if (gap > 0) {
			flush_region();
			const mismatch = emit_same(gap, `before edits[${i}]`);
			if (mismatch !== null) return { ok: false, message: mismatch };
		}
		if (region_a === -1) {
			region_a = a_pos;
			region_b = b_pos;
		}
		ai = a_pos + a_count;
		bi = b_pos + b_count;
	}
	flush_region();
	const mismatch = emit_same(tail, where);
	if (mismatch !== null) return { ok: false, message: mismatch };
	return { ok: true, value: result };
};

/**
 * Collects a whole-file line diff's change regions — the inverse of
 * `diff_lines_from_edits`, so `diff_lines_from_edits(a, b,
 * diff_edits_from_lines(diff_lines(a, b)))` returns `diff_lines(a, b)`. Each
 * maximal run of non-`same` lines is one edit. A zero-count side anchors to
 * the line before the run, so the lines must start at the top of the file
 * (as `diff_lines` returns them, not a hunk's slice).
 *
 * @param lines - a whole-file line diff
 */
export const diff_edits_from_lines = (lines: Array<DiffLine>): Array<DiffEdit> => {
	const edits: Array<DiffEdit> = [];
	let a_prev = 0; // the last line seen on each side
	let b_prev = 0;
	let i = 0;
	while (i < lines.length) {
		const line = lines[i]!;
		if (line.type === 'same') {
			if (line.a_line !== null) a_prev = line.a_line;
			if (line.b_line !== null) b_prev = line.b_line;
			i++;
			continue;
		}
		let a_first = 0;
		let a_count = 0;
		let b_first = 0;
		let b_count = 0;
		const a_before = a_prev;
		const b_before = b_prev;
		while (i < lines.length && lines[i]!.type !== 'same') {
			const { a_line, b_line } = lines[i]!;
			if (a_line !== null) {
				if (a_count === 0) a_first = a_line;
				a_count++;
				a_prev = a_line;
			}
			if (b_line !== null) {
				if (b_count === 0) b_first = b_line;
				b_count++;
				b_prev = b_line;
			}
			i++;
		}
		edits.push([
			a_count > 0 ? a_first : a_before,
			a_count,
			b_count > 0 ? b_first : b_before,
			b_count
		]);
	}
	return edits;
};

/**
 * Why `diff_hunks_parse` couldn't read a patch.
 */
export interface DiffHunksParseError {
	/**
	 * `'binary'` when git printed the file as binary (`Binary files … differ`
	 * or `GIT binary patch`) — no line hunks exist, distinct from a patch
	 * with no content change; `'invalid'` for text that isn't one file's
	 * consistent unified diff.
	 */
	kind: 'binary' | 'invalid';
	message: string;
}

/**
 * The extended header lines git prints before a file's first hunk.
 */
const PATCH_HEADER_PREFIXES = [
	'diff ',
	'index ',
	'--- ',
	'+++ ',
	'old mode ',
	'new mode ',
	'deleted file mode ',
	'new file mode ',
	'similarity index ',
	'dissimilarity index ',
	'rename from ',
	'rename to ',
	'copy from ',
	'copy to '
];

/**
 * Parses a run of decimal digits (no sign, spaces, or exponent), or returns
 * `null`.
 */
const parse_uint = (text: string): number | null => {
	if (text === '' || text.length > 15) return null;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		if (c < 48 || c > 57) return null;
	}
	return Number(text);
};

/**
 * Parses a `start[,count]` header range; an omitted count is 1.
 */
const parse_hunk_range = (text: string): [number, number] | null => {
	const comma = text.indexOf(',');
	const start = parse_uint(comma === -1 ? text : text.slice(0, comma));
	const count = comma === -1 ? 1 : parse_uint(text.slice(comma + 1));
	if (start === null || count === null) return null;
	return [start, count];
};

/**
 * Parses `@@ -a[,b] +c[,d] @@[ section]`, or returns `null`.
 */
const parse_hunk_header = (line: string): DiffEdit | null => {
	if (!line.startsWith('@@ -')) return null;
	const end = line.indexOf(' @@', 4);
	if (end === -1) return null;
	if (line.length > end + 3 && line[end + 3] !== ' ') return null;
	const ranges = line.slice(4, end);
	const plus = ranges.indexOf(' +');
	if (plus === -1) return null;
	const a = parse_hunk_range(ranges.slice(0, plus));
	const b = parse_hunk_range(ranges.slice(plus + 2));
	if (a === null || b === null) return null;
	return [a[0], a[1], b[0], b[1]];
};

/**
 * Parses one file's unified diff as git prints it (`git diff -U3`, or any
 * context width) into hunks — for rendering a change from the patch alone,
 * without either side's text.
 *
 * File header lines before the first `@@` (`diff --git`, `index`, `---`,
 * `+++`, mode, rename, and copy lines) are skipped; a patch with headers
 * and no hunks (a rename or mode change alone) or empty text parses to `[]`.
 * A count omitted from a `@@` header is 1, and the section text after the
 * closing `@@` is ignored. `\ No newline at end of file` sets `no_newline`
 * on the line before it, per `DiffLine`. Lines split on `\n` only, so `\r`
 * stays in line text as in `diff_lines`.
 *
 * The result is checked against itself: each hunk's lines must match its
 * header's counts, hunks must be in order and not overlap, the unchanged
 * runs between hunks must be equally long on both sides, each hunk must
 * change a line, and no line or hunk may follow a side's no-newline line. A
 * failure's `kind` tells a binary patch from malformed text.
 *
 * Inside a hunk an empty row is an empty unchanged line, as git prints one
 * under `diff.suppressBlankEmpty` (and `git apply` and GNU patch accept).
 * The patch must be plain exact-text output, as `diff_lines_from_edits`
 * details: `--no-textconv --no-ext-diff`, no color, no `--word-diff` (its
 * rows carry no line markers, so they mostly parse as a hunk that changes
 * nothing, which is refused), and no option that ignores whitespace or lines
 * (`-w`, `-b`, `--ignore-blank-lines`, and the like), under which a context
 * line shows one text for lines that differ between the sides. `git diff -D`
 * prints a deleted file's headers with no hunks, so it parses to `[]` like a
 * pure rename.
 *
 * @param patch - one file's unified diff text
 * @returns the hunks, with starts and counts as their headers give them
 */
export const diff_hunks_parse = (
	patch: string
): Result<{ value: Array<DiffHunk> }, DiffHunksParseError> => {
	const rows = patch.split('\n');
	if (rows[rows.length - 1] === '') rows.pop();
	const hunks: Array<DiffHunk> = [];
	const invalid = (row: number, message: string): { ok: false } & DiffHunksParseError => ({
		ok: false,
		kind: 'invalid',
		message: `line ${row + 1}: ${message}`
	});
	let hunk: DiffHunk | null = null;
	let a_left = 0; // lines the open hunk's header still promises
	let b_left = 0;
	let a_next = 0; // the next line number on each side
	let b_next = 0;
	let a_end = 0; // lines on each side through the last hunk
	let b_end = 0;
	let a_ended = false; // a no-newline line ended the side
	let b_ended = false;
	let hunk_row = 0; // the open hunk's header row
	let hunk_changed = false; // the open hunk has a removed or added line
	let last: DiffLine | null = null;
	for (let r = 0; r < rows.length; r++) {
		const row = rows[r]!;
		if (hunk !== null && (a_left > 0 || b_left > 0)) {
			// `diff.suppressBlankEmpty` prints an empty unchanged line as an empty row
			const marker = row === '' ? ' ' : row[0];
			const text = row.slice(1);
			let line: DiffLine;
			if (marker === ' ') {
				if (a_left === 0 || b_left === 0) {
					return invalid(r, 'a context line past the count in its hunk header');
				}
				if (a_ended || b_ended) return invalid(r, 'a line after the end of the file');
				line = { type: 'same', text, a_line: a_next++, b_line: b_next++ };
				a_left--;
				b_left--;
			} else if (marker === '-') {
				if (a_left === 0) return invalid(r, 'a removed line past the count in its hunk header');
				if (a_ended) return invalid(r, 'a line after the end of the file');
				line = { type: 'remove', text, a_line: a_next++, b_line: null };
				a_left--;
				hunk_changed = true;
			} else if (marker === '+') {
				if (b_left === 0) return invalid(r, 'an added line past the count in its hunk header');
				if (b_ended) return invalid(r, 'a line after the end of the file');
				line = { type: 'add', text, a_line: null, b_line: b_next++ };
				b_left--;
				hunk_changed = true;
			} else if (marker === '\\') {
				if (last === null || last.no_newline) {
					return invalid(r, 'a no-newline marker with no line before it');
				}
				last.no_newline = true;
				if (last.a_line !== null) a_ended = true;
				if (last.b_line !== null) b_ended = true;
				continue;
			} else {
				return invalid(r, `the hunk ends early, missing ${a_left} lines of a and ${b_left} of b`);
			}
			hunk.lines.push(line);
			last = line;
			// git never prints a hunk without a change; `--word-diff` output parses as one
			if (a_left === 0 && b_left === 0 && !hunk_changed) {
				return invalid(hunk_row, 'a hunk that changes no lines, which git never prints');
			}
			continue;
		}
		if (row.startsWith('\\') && last !== null) {
			if (last.no_newline) return invalid(r, 'a second no-newline marker');
			last.no_newline = true;
			if (last.a_line !== null) a_ended = true;
			if (last.b_line !== null) b_ended = true;
			continue;
		}
		if (row.startsWith('@@')) {
			const edit = parse_hunk_header(row);
			if (edit === null) return invalid(r, `a malformed hunk header: ${row}`);
			const numbers = check_edit_numbers(edit);
			if (numbers !== null) return invalid(r, `hunk header ${numbers}`);
			const [a_start, a_count, b_start, b_count] = edit;
			const a_pos = edit_position(a_start, a_count);
			const b_pos = edit_position(b_start, b_count);
			if (a_pos < a_end || b_pos < b_end) {
				return invalid(r, 'a hunk out of order or overlapping the previous hunk');
			}
			// a side that ended unterminated has no lines after it to change or anchor to
			if (
				(a_ended && (a_count > 0 || a_pos > a_end)) ||
				(b_ended && (b_count > 0 || b_pos > b_end))
			) {
				return invalid(r, 'a hunk after the end of the file');
			}
			if (a_pos - a_end !== b_pos - b_end) {
				return invalid(
					r,
					`the unchanged run before the hunk is ${a_pos - a_end} lines in a but ${b_pos - b_end} in b`
				);
			}
			hunk = { a_start, a_count, b_start, b_count, lines: [] };
			hunks.push(hunk);
			a_left = a_count;
			b_left = b_count;
			a_next = a_pos + 1;
			b_next = b_pos + 1;
			a_end = a_pos + a_count;
			b_end = b_pos + b_count;
			hunk_row = r;
			hunk_changed = false;
			last = null;
			continue;
		}
		if (hunk === null) {
			if (row.startsWith('Binary files ') || row === 'GIT binary patch') {
				return { ok: false, kind: 'binary', message: `line ${r + 1}: a binary patch` };
			}
			if (PATCH_HEADER_PREFIXES.some((prefix) => row.startsWith(prefix))) continue;
			return invalid(r, 'expected a file header or a hunk header');
		}
		if (PATCH_HEADER_PREFIXES.some((prefix) => row.startsWith(prefix))) {
			return invalid(r, "a second file's header, but this parses one file");
		}
		return invalid(r, 'a line past the count in its hunk headers');
	}
	if (hunk !== null && (a_left > 0 || b_left > 0)) {
		return invalid(
			rows.length - 1,
			`the patch ends inside a hunk, missing ${a_left} lines of a and ${b_left} of b`
		);
	}
	return { ok: true, value: hunks };
};

/**
 * Merges ranges separated by at most `join_gap` positions, reusing (and
 * mutating) the input tuples.
 */
const join_ranges = (
	ranges: Array<[number, number]>,
	join_gap: number
): Array<[number, number]> => {
	if (join_gap <= 0 || ranges.length < 2) return ranges;
	let last = ranges[0]!;
	const out: Array<[number, number]> = [last];
	for (let i = 1; i < ranges.length; i++) {
		const r = ranges[i]!;
		if (r[0] - last[1] <= join_gap) {
			last[1] = r[1];
		} else {
			out.push(r);
			last = r;
		}
	}
	return out;
};

/**
 * Computes intra-line changed-character ranges for one paired remove/add
 * line — char-level greedy Myers. Returns `null` when the pair reads as a
 * rewrite (below `min_similarity`) or a line exceeds `max_length`, so
 * callers skip emphasis rather than highlight noise.
 *
 * @param a - the removed line's text
 * @param b - the added line's text
 */
export const diff_segments = (
	a: string,
	b: string,
	options: DiffSegmentsOptions = {}
): DiffSegments | null => {
	const {
		max_cost = MAX_COST_DEFAULT,
		max_length = 1000,
		min_similarity = 0.3,
		join_gap = 2
	} = options;
	if (a.length > max_length || b.length > max_length) return null;
	if (a === b) return { a_ranges: [], b_ranges: [] };
	const a_codes = new Int32Array(a.length);
	for (let i = 0; i < a.length; i++) a_codes[i] = a.charCodeAt(i);
	const b_codes = new Int32Array(b.length);
	for (let i = 0; i < b.length; i++) b_codes[i] = b.charCodeAt(i);
	const ops = diff_ops(a_codes, b_codes, max_cost);
	let matched = 0;
	for (const op of ops) {
		if (op.type === 'same') matched += op.count;
	}
	if ((2 * matched) / (a.length + b.length) < min_similarity) return null;
	const a_ranges: Array<[number, number]> = [];
	const b_ranges: Array<[number, number]> = [];
	let ai = 0;
	let bi = 0;
	for (const op of ops) {
		if (op.type === 'same') {
			ai += op.count;
			bi += op.count;
		} else if (op.type === 'remove') {
			a_ranges.push([ai, ai + op.count]);
			ai += op.count;
		} else {
			b_ranges.push([bi, bi + op.count]);
			bi += op.count;
		}
	}
	return { a_ranges: join_ranges(a_ranges, join_gap), b_ranges: join_ranges(b_ranges, join_gap) };
};

/**
 * Options for `format_diff`.
 */
export interface FormatDiffOptions {
	/**
	 * Prefix prepended to every output line, e.g. for indentation.
	 */
	prefix?: string;
	/**
	 * Maximum number of content lines before truncating with a
	 * `... (N more lines)` marker, 0 for unlimited.
	 *
	 * @default 50
	 */
	max_lines?: number;
}

/**
 * Formats hunks as unified-diff text with `@@` headers. Colors go through
 * `print.ts`'s `st` seam — plain text until `configure_print_colors` opts in.
 *
 * @param a_path - path label for the original content
 * @param b_path - path label for the updated content
 */
export const format_diff = (
	hunks: Array<DiffHunk>,
	a_path: string,
	b_path: string,
	options: FormatDiffOptions = {}
): string => {
	const { prefix = '', max_lines = 50 } = options;
	const out: Array<string> = [`${prefix}--- ${a_path}`, `${prefix}+++ ${b_path}`];
	let total = 0;
	for (const h of hunks) total += h.lines.length;
	let count = 0;
	outer: for (const h of hunks) {
		if (max_lines > 0 && count >= max_lines) break;
		out.push(prefix + st('cyan', `@@ -${h.a_start},${h.a_count} +${h.b_start},${h.b_count} @@`));
		for (const line of h.lines) {
			if (max_lines > 0 && count >= max_lines) break outer;
			if (line.type === 'add') {
				out.push(prefix + st('green', '+' + line.text));
			} else if (line.type === 'remove') {
				out.push(prefix + st('red', '-' + line.text));
			} else {
				out.push(`${prefix} ${line.text}`);
			}
			if (line.no_newline) out.push(`${prefix}\\ No newline at end of file`);
			count++;
		}
	}
	if (count < total) out.push(`${prefix}... (${total - count} more lines)`);
	return out.join('\n');
};

/**
 * Options for `generate_diff`.
 */
export interface GenerateDiffOptions extends FormatDiffOptions {
	/**
	 * See `diff_hunks`.
	 *
	 * @default 3
	 */
	context_lines?: number;
	/**
	 * See `DiffOptions.max_cost`.
	 *
	 * @default 2048
	 */
	max_cost?: number;
}

/**
 * Generates formatted unified-diff text between two strings — `diff_lines` →
 * `diff_hunks` → `format_diff`. Returns `null` if either side is binary.
 *
 * @param path - file path used for both labels
 */
export const generate_diff = (
	a: string,
	b: string,
	path: string,
	options: GenerateDiffOptions = {}
): string | null => {
	if (string_is_binary(a) || string_is_binary(b)) return null;
	const { context_lines, max_cost, ...format_options } = options;
	const lines = diff_lines(a, b, { max_cost });
	const hunks = diff_hunks(lines, context_lines);
	return format_diff(hunks, path, path, format_options);
};
