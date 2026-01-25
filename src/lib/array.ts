import type {ArrayElement} from './types.js';

// TODO try to cange to readonly again, see if upstream errors are tolerably fixed
export const EMPTY_ARRAY: Array<any> = Object.freeze([]) as any;

/** Converts `value` to an array if it's not already. */
export const to_array = <T>(value: T): T extends ReadonlyArray<any> ? T : Array<T> =>
	Array.isArray(value) ? (value as any) : ([value] as any);

/**
 * Removes an element from `array` at `index` in an unordered manner.
 * @mutates array - swaps element at index with last element, then removes last element
 */
export const remove_unordered = (array: Array<any>, index: number): void => {
	array[index] = array[array.length - 1];
	array.pop();
};

/**
 * Returns a function that returns the next item in the `array`
 * in a linear sequence, looping back to index 0 when it reaches the end.
 */
export const to_next = <T extends ReadonlyArray<any>>(array: T): (() => ArrayElement<T>) => {
	let i = -1;
	return () => {
		i++;
		if (i >= array.length) i = 0;
		return array[i];
	};
};
