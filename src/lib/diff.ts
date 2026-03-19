/**
 * Line-based diff utilities using LCS (Longest Common Subsequence).
 *
 * @module
 */

import {string_is_binary} from './string.js';

/** Line diff result */
export interface DiffLine {
	type: 'same' | 'add' | 'remove';
	line: string;
}

/**
 * Generate a line-based diff between two strings using LCS algorithm.
 *
 * @param a - the original/current content
 * @param b - the new/desired content
 * @returns array of diff lines with type annotations
 */
export const diff_lines = (a: string, b: string): Array<DiffLine> => {
	const a_lines = a.split('\n');
	const b_lines = b.split('\n');
	const result: Array<DiffLine> = [];

	const lcs = compute_lcs(a_lines, b_lines);
	let ai = 0;
	let bi = 0;
	let li = 0;

	while (ai < a_lines.length || bi < b_lines.length) {
		if (li < lcs.length && ai < a_lines.length && a_lines[ai] === lcs[li]) {
			if (bi < b_lines.length && b_lines[bi] === lcs[li]) {
				result.push({type: 'same', line: a_lines[ai]!});
				ai++;
				bi++;
				li++;
			} else {
				result.push({type: 'add', line: b_lines[bi]!});
				bi++;
			}
		} else if (ai < a_lines.length && (li >= lcs.length || a_lines[ai] !== lcs[li])) {
			result.push({type: 'remove', line: a_lines[ai]!});
			ai++;
		} else if (bi < b_lines.length) {
			result.push({type: 'add', line: b_lines[bi]!});
			bi++;
		}
	}

	return result;
};

/**
 * Compute longest common subsequence of two string arrays.
 *
 * Uses dynamic programming with O(m*n) time and space complexity.
 */
const compute_lcs = (a: Array<string>, b: Array<string>): Array<string> => {
	const m = a.length;
	const n = b.length;
	const dp: Array<Array<number>> = Array.from({length: m + 1}, () => Array(n + 1).fill(0));

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (a[i - 1] === b[j - 1]) {
				dp[i]![j] = dp[i - 1]![j - 1]! + 1;
			} else {
				dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
			}
		}
	}

	// Backtrack to find LCS
	const lcs: Array<string> = [];
	let i = m;
	let j = n;
	while (i > 0 && j > 0) {
		if (a[i - 1] === b[j - 1]) {
			lcs.unshift(a[i - 1]!);
			i--;
			j--;
		} else if (dp[i - 1]![j]! > dp[i]![j - 1]!) {
			i--;
		} else {
			j--;
		}
	}

	return lcs;
};

/**
 * Filter diff to only include lines within N lines of context around changes.
 *
 * @param diff - the full diff lines
 * @param context_lines - number of context lines to show around changes (default: 3)
 * @returns filtered diff with ellipsis markers for skipped regions
 */
export const filter_diff_context = (diff: Array<DiffLine>, context_lines = 3): Array<DiffLine> => {
	if (diff.length === 0) return [];

	// Find indices of all changed lines
	const changed_indices: Array<number> = [];
	for (let i = 0; i < diff.length; i++) {
		if (diff[i]!.type !== 'same') {
			changed_indices.push(i);
		}
	}

	if (changed_indices.length === 0) return [];

	// Build set of indices to include (changed lines + context)
	const include_indices: Set<number> = new Set();
	for (const idx of changed_indices) {
		for (
			let i = Math.max(0, idx - context_lines);
			i <= Math.min(diff.length - 1, idx + context_lines);
			i++
		) {
			include_indices.add(i);
		}
	}

	// Build result with ellipsis markers for gaps
	const result: Array<DiffLine> = [];
	let last_included = -1;

	for (let i = 0; i < diff.length; i++) {
		if (include_indices.has(i)) {
			// Add ellipsis if there's a gap
			if (last_included >= 0 && i > last_included + 1) {
				result.push({type: 'same', line: '...'});
			}
			result.push(diff[i]!);
			last_included = i;
		}
	}

	return result;
};

/** ANSI color codes */
const colors = {
	red: '\x1b[31m',
	green: '\x1b[32m',
	reset: '\x1b[0m',
} as const;

/**
 * Format options for diff output.
 */
export interface FormatDiffOptions {
	/** Prefix for each line (for indentation in plan output). */
	prefix?: string;
	/** Whether to use ANSI colors. */
	use_color?: boolean;
	/** Maximum number of diff lines to show (0 = unlimited). */
	max_lines?: number;
}

/**
 * Format a diff for display.
 *
 * @param diff - the diff lines to format
 * @param current_path - path label for "current" content
 * @param desired_path - path label for "desired" content
 * @param options - formatting options
 * @returns formatted diff string
 */
export const format_diff = (
	diff: Array<DiffLine>,
	current_path: string,
	desired_path: string,
	options: FormatDiffOptions = {},
): string => {
	const {prefix = '', use_color = true, max_lines = 50} = options;

	const lines: Array<string> = [
		`${prefix}--- ${current_path} (current)`,
		`${prefix}+++ ${desired_path} (desired)`,
	];

	let count = 0;
	for (const d of diff) {
		if (max_lines > 0 && count >= max_lines) {
			const remaining = diff.length - count;
			lines.push(`${prefix}... (${remaining} more lines)`);
			break;
		}

		const line_prefix = d.type === 'add' ? '+' : d.type === 'remove' ? '-' : ' ';

		if (use_color && d.type !== 'same') {
			const color = d.type === 'add' ? colors.green : colors.red;
			lines.push(`${prefix}${color}${line_prefix}${d.line}${colors.reset}`);
		} else {
			lines.push(`${prefix}${line_prefix}${d.line}`);
		}

		count++;
	}

	return lines.join('\n');
};

/**
 * Generate a formatted diff between two strings.
 *
 * Combines `diff_lines`, `filter_diff_context`, and `format_diff` for convenience.
 * Returns null if content is binary.
 *
 * @param current - current content
 * @param desired - desired content
 * @param path - file path for labels
 * @param options - formatting options
 * @returns formatted diff string, or null if binary
 */
export const generate_diff = (
	current: string,
	desired: string,
	path: string,
	options: FormatDiffOptions = {},
): string | null => {
	// Skip binary files
	if (string_is_binary(current) || string_is_binary(desired)) {
		return null;
	}

	const diff = diff_lines(current, desired);
	const filtered = filter_diff_context(diff);
	return format_diff(filtered, path, path, options);
};
