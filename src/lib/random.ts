import type {ArrayElement} from './types.js';

/**
 * Generates a random `number` between `min` and `max`.
 */
export const random_float = (min: number, max: number, random = Math.random): number =>
	random() * (max - min) + min;

/**
 * Returns a random integer between `min` and `max` inclusive.
 * Node's `randomInt` is similar but exclusive of the max value, and makes `min` optional -
 * https://nodejs.org/docs/latest-v20.x/api/crypto.html#cryptorandomintmin-max-callback
 */
export const random_int = (min: number, max: number, random = Math.random): number =>
	Math.floor(random() * (max - min + 1)) + min;

/**
 * Generates a random `boolean`.
 */
export const random_boolean = (random = Math.random): boolean => random() > 0.5;

/**
 * Selects a random item from an array.
 */
export const random_item = <T extends ReadonlyArray<any>>(
	arr: T,
	random = Math.random,
): ArrayElement<T> => arr[random_int(0, arr.length - 1, random)];

/**
 * Mutates `array` with random ordering.
 * @mutates array - randomly reorders elements in place using Fisher-Yates shuffle
 */
export const shuffle: <T extends Array<any>>(array: T, random?: typeof random_int) => T = (
	array,
	random = random_int,
) => {
	const {length} = array;
	const max = length - 1;
	for (let i = 0; i < length; i++) {
		const index = random(0, max);
		if (i === index) continue;
		const item = array[index];
		array[index] = array[i];
		array[i] = item;
	}
	return array;
};
