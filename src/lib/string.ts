import {count_iterator} from './iterator.js';

/**
 * Truncates a string to a maximum length, adding a suffix if needed that defaults to `...`.
 */
export const truncate = (str: string, maxLength: number, suffix = '...'): string => {
	if (maxLength < suffix.length) return '';
	if (str.length > maxLength) {
		return str.substring(0, maxLength - suffix.length) + suffix;
	}
	return str;
};

/**
 * Removes characters inclusive of `stripped`.
 */
export const strip_start = (source: string, stripped: string): string => {
	if (!stripped || !source.startsWith(stripped)) return source;
	return source.substring(stripped.length);
};

/**
 * Removes characters inclusive of `stripped`.
 */
export const strip_end = (source: string, stripped: string): string => {
	if (!stripped || !source.endsWith(stripped)) return source;
	return source.substring(0, source.length - stripped.length);
};

/**
 * Removes characters inclusive of `stripped`.
 */
export const strip_after = (source: string, stripped: string): string => {
	if (!stripped) return source;
	const idx = source.indexOf(stripped);
	if (idx === -1) return source;
	return source.substring(0, idx);
};

/**
 * Removes characters inclusive of `stripped`.
 */
export const strip_before = (source: string, stripped: string): string => {
	if (!stripped) return source;
	const idx = source.indexOf(stripped);
	if (idx === -1) return source;
	return source.substring(idx + stripped.length);
};

/**
 * Adds the substring `ensured` to the start of the `source` string if it's not already present.
 */
export const ensure_start = (source: string, ensured: string): string => {
	if (source.startsWith(ensured)) return source;
	return ensured + source;
};

/**
 * Adds the substring `ensured` to the end of the `source` string if it's not already present.
 */
export const ensure_end = (source: string, ensured: string): string => {
	if (source.endsWith(ensured)) return source;
	return source + ensured;
};

/**
 * Removes leading and trailing spaces from each line of a string.
 */
export const deindent = (str: string): string =>
	str
		.split('\n')
		.filter(Boolean)
		.map((s) => s.trim())
		.join('\n');

/**
 * Returns a plural suffix based on a count.
 */
export const plural = (count: number | undefined | null, suffix = 's'): string =>
	count === 1 ? '' : suffix;

/**
 * Returns the count of graphemes in a string, the individually rendered characters.
 */
export const count_graphemes = (str: string): number =>
	count_iterator(new Intl.Segmenter().segment(str));

/**
 * Strips ANSI escape sequences from a string
 */
export const strip_ansi = (str: string): string => str.replaceAll(/\x1B\[[0-9;]*[a-zA-Z]/g, ''); // eslint-disable-line no-control-regex

/**
 * Stringifies a value like `JSON.stringify` but with some corner cases handled better.
 *
 * @source https://2ality.com/2025/04/stringification-javascript.html
 */
export const stringify = (value: unknown): string =>
	typeof value === 'bigint' ? value + 'n' : (JSON.stringify(value) ?? String(value)); // eslint-disable-line @typescript-eslint/no-unnecessary-condition

/**
 * Calculate the display width of a string in terminal columns.
 * - Strips ANSI escape codes (they have 0 width)
 * - Emojis and other wide characters take 2 columns
 * - Tab characters take 4 columns
 * - Newlines and other control characters take 0 columns
 * - Uses `Intl.Segmenter` to properly handle grapheme clusters (e.g., family emoji "👨‍👩‍👧‍👦")
 */
export const string_display_width = (str: string): number => {
	// Strip ANSI codes first (they have 0 display width)
	const clean = strip_ansi(str);

	let width = 0;
	const segmenter = new Intl.Segmenter();
	for (const {segment} of segmenter.segment(clean)) {
		const code = segment.codePointAt(0)!;

		// Handle control characters
		if (code === 0x09) {
			// Tab = 4 columns
			width += 4;
			continue;
		}
		if (code < 0x20 || (code >= 0x7f && code < 0xa0)) {
			// Other control characters (including newline) = 0 width
			continue;
		}

		// Emoji and other wide characters (rough heuristic)
		// - Most emoji are in range 0x1F300-0x1FAFF
		// - Some are in 0x2600-0x27BF (misc symbols)
		// - CJK characters 0x4E00-0x9FFF also double-width
		// - Grapheme clusters with multiple code points (like ZWJ sequences) are typically emoji
		if (
			segment.length > 1 || // Multi-codepoint graphemes (ZWJ sequences, etc.)
			(code >= 0x1f300 && code <= 0x1faff) ||
			(code >= 0x2600 && code <= 0x27bf) ||
			(code >= 0x1f600 && code <= 0x1f64f) ||
			(code >= 0x1f680 && code <= 0x1f6ff) ||
			(code >= 0x4e00 && code <= 0x9fff) // CJK
		) {
			width += 2;
		} else {
			width += 1;
		}
	}
	return width;
};

/**
 * Pad a string to a target display width (accounting for wide characters).
 */
export const pad_width = (
	str: string,
	target_width: number,
	align: 'left' | 'right' = 'left',
): string => {
	const current_width = string_display_width(str);
	const padding = Math.max(0, target_width - current_width);
	if (align === 'left') {
		return str + ' '.repeat(padding);
	} else {
		return ' '.repeat(padding) + str;
	}
};

/**
 * Calculates the Levenshtein distance between two strings.
 * Useful for typo detection and fuzzy matching.
 *
 * @param a - First string
 * @param b - Second string
 * @returns The edit distance between the strings
 */
export const levenshtein_distance = (a: string, b: string): number => {
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;
	if (a === b) return 0;

	// Use shorter string for rows to minimize space
	const a_shorter = a.length <= b.length;
	const short = a_shorter ? a : b;
	const long = a_shorter ? b : a;
	const short_len = short.length;
	const long_len = long.length;

	// Only need two rows: previous and current
	let prev = new Uint16Array(short_len + 1);
	let curr = new Uint16Array(short_len + 1);

	// Initialize first row
	for (let j = 0; j <= short_len; j++) {
		prev[j] = j;
	}

	for (let i = 1; i <= long_len; i++) {
		curr[0] = i;
		const long_char = long.charCodeAt(i - 1);
		for (let j = 1; j <= short_len; j++) {
			if (long_char === short.charCodeAt(j - 1)) {
				curr[j] = prev[j - 1]!;
			} else {
				curr[j] = 1 + Math.min(prev[j - 1]!, prev[j]!, curr[j - 1]!);
			}
		}
		[prev, curr] = [curr, prev];
	}

	return prev[short_len]!;
};
