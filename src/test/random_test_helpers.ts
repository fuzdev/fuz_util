/**
 * Custom PRNG factories for distribution testing and benchmarking.
 * These are NOT for production use — they exist to compare quality and speed
 * against `Math.random`, `create_random_alea`, and `create_random_xoshiro`.
 *
 * @module
 */

/**
 * A bare PRNG function returning a float in [0, 1).
 */
export type Prng = () => number;

/**
 * Linear congruential generator using Numerical Recipes constants.
 * Known for poor low-order bits and hyperplane structure in higher dimensions.
 */
export const create_random_lcg = (seed: number): Prng => {
	let state = seed >>> 0;
	return () => {
		state = (1664525 * state + 1013904223) & 0xffffffff;
		return (state >>> 0) / 0x100000000;
	};
};

/**
 * Xorshift32 generator (Marsaglia, 2003).
 * Simple and fast with decent quality for a 32-bit state.
 */
export const create_random_xorshift32 = (seed: number): Prng => {
	let state = (seed || 1) | 0; // must be nonzero
	return () => {
		state ^= state << 13;
		state ^= state >> 17;
		state ^= state << 5;
		return (state >>> 0) / 0x100000000;
	};
};

/**
 * Von Neumann's middle-square method (1949).
 * Intentionally terrible — cycles quickly and degenerates to zero.
 * Used as a negative control in distribution tests.
 */
export const create_random_middle_square = (seed: number): Prng => {
	let state = seed || 1234;
	return () => {
		const squared = (state * state).toString().padStart(8, '0');
		state = parseInt(squared.substring(2, 6), 10) || 1;
		return state / 10000;
	};
};
