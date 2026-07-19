/**
 * Line and intra-line character diffs via greedy Myers over interned
 * sequences, plus hunk grouping and unified-diff text formatting.
 *
 * @module
 */

import {string_is_binary} from './string.ts';
import {st} from './print.ts';

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
			out.push({type: 'remove', count: removes});
			removes = 0;
		}
		if (adds > 0) {
			out.push({type: 'add', count: adds});
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
				out.push({type: 'same', count: op.count});
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
	max_cost: number,
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
			{type: 'remove', count: n},
			{type: 'add', count: m},
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
		if (snake > 0) rev.push({type: 'same', count: snake});
		rev.push(from_down ? {type: 'add', count: 1} : {type: 'remove', count: 1});
		x = prev_x;
		y = prev_x - prev_k;
	}
	if (x > 0) rev.push({type: 'same', count: x});
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
	max_cost: number,
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
	if (pre > 0) ops.push({type: 'same', count: pre});
	if (n === 0) {
		if (m > 0) ops.push({type: 'add', count: m});
	} else if (m === 0) {
		ops.push({type: 'remove', count: n});
	} else {
		const middle = myers_middle(a, pre, n, b, pre, m, max_cost);
		for (const op of middle) ops.push(op);
	}
	if (suf > 0) ops.push({type: 'same', count: suf});
	return normalize_ops(ops);
};

/**
 * Splits into lines without terminators: a text ending in `\n` contributes
 * exactly its terminated lines (no phantom empty final line), one not ending
 * in `\n` has an unterminated final line, and `''` has no lines at all.
 */
const split_lines = (text: string): {lines: Array<string>; ends_newline: boolean} => {
	if (text === '') return {lines: [], ends_newline: true};
	const lines = text.split('\n');
	if (lines[lines.length - 1] === '') {
		lines.pop();
		return {lines, ends_newline: true};
	}
	return {lines, ends_newline: false};
};

/**
 * Interns lines to ids in `ids`, shared across both sides so equal lines get
 * equal ids. An unterminated final line interns in a separate key namespace,
 * so it never matches a terminated line of the same text.
 */
const intern_lines = (
	lines: Array<string>,
	ends_newline: boolean,
	ids: Map<string, number>,
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
	const {max_cost = MAX_COST_DEFAULT} = options;
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
				const line: DiffLine = {type: 'same', text: a_lines[ai]!, a_line: ai + 1, b_line: bi + 1};
				if (ai === a_last_unterminated) line.no_newline = true;
				result.push(line);
				ai++;
				bi++;
			} else if (op.type === 'remove') {
				const line: DiffLine = {type: 'remove', text: a_lines[ai]!, a_line: ai + 1, b_line: null};
				if (ai === a_last_unterminated) line.no_newline = true;
				result.push(line);
				ai++;
			} else {
				const line: DiffLine = {type: 'add', text: b_lines[bi]!, a_line: null, b_line: bi + 1};
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
		hunks.push({a_start, a_count, b_start, b_count, lines: hunk_lines});
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
 * Computes intra-line changed-character ranges for one paired remove/add
 * line — char-level greedy Myers. Returns `null` when the pair reads as a
 * rewrite (below `min_similarity`) or a line exceeds `max_length`, so
 * callers skip emphasis rather than highlight noise.
 *
 * @param a - the removed line's text
 * @param b - the added line's text
 */
/**
 * Merges ranges separated by at most `join_gap` positions, mutating and
 * returning `ranges`.
 */
const join_ranges = (
	ranges: Array<[number, number]>,
	join_gap: number,
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

export const diff_segments = (
	a: string,
	b: string,
	options: DiffSegmentsOptions = {},
): DiffSegments | null => {
	const {
		max_cost = MAX_COST_DEFAULT,
		max_length = 1000,
		min_similarity = 0.3,
		join_gap = 2,
	} = options;
	if (a.length > max_length || b.length > max_length) return null;
	if (a === b) return {a_ranges: [], b_ranges: []};
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
	return {a_ranges: join_ranges(a_ranges, join_gap), b_ranges: join_ranges(b_ranges, join_gap)};
};

/**
 * Format options for diff output.
 */
export interface FormatDiffOptions {
	/**
	 * Prefix for each line (for indentation in plan output).
	 */
	prefix?: string;
	/**
	 * Maximum number of content lines to show, 0 for unlimited.
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
	options: FormatDiffOptions = {},
): string => {
	const {prefix = '', max_lines = 50} = options;
	const out: Array<string> = [`${prefix}--- ${a_path}`, `${prefix}+++ ${b_path}`];
	let total = 0;
	for (const h of hunks) total += h.lines.length;
	let count = 0;
	outer: for (const h of hunks) {
		out.push(prefix + st('cyan', `@@ -${h.a_start},${h.a_count} +${h.b_start},${h.b_count} @@`));
		for (const line of h.lines) {
			if (max_lines > 0 && count >= max_lines) {
				out.push(`${prefix}... (${total - count} more lines)`);
				break outer;
			}
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
	options: GenerateDiffOptions = {},
): string | null => {
	if (string_is_binary(a) || string_is_binary(b)) return null;
	const {context_lines, max_cost, ...format_options} = options;
	const lines = diff_lines(a, b, {max_cost});
	const hunks = diff_hunks(lines, context_lines);
	return format_diff(hunks, path, path, format_options);
};
