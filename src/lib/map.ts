/**
 * Sorts a map by `comparator`, a function that compares two entries,
 * defaulting to using `localeCompare` and `>`.
 */
export const sort_map = <T extends Map<any, any>>(
	map: T,
	comparator = compare_simple_map_entries,
): T => new Map([...map].sort(comparator)) as T;

/**
 * Compares two map entries for sorting purposes.
 * If the key is a string, it uses `localeCompare` for comparison.
 * For other types, it uses `>`.
 */
export const compare_simple_map_entries = (a: [any, any], b: [any, any]): number => {
	const a_key = a[0];
	return typeof a_key === 'string' ? a_key.localeCompare(b[0]) : a[0] > b[0] ? 1 : -1;
};
