/**
 * Xoshiro128**: a seedable pseudo-random number generator by Blackman & Vigna (2018).
 * Recommended for reproducible randomness (testing, simulations, procedural generation).
 *
 * DO NOT USE when security matters — use the Web Crypto API (`crypto.getRandomValues`) instead.
 *
 * Xoshiro128** has a 2^128-1 period and passes BigCrush.
 * It uses pure 32-bit arithmetic (shifts, rotates, XOR, multiply)
 * making it very fast in JavaScript via `Math.imul`.
 *
 * Xoshiro128** passes all 11 distribution quality tests at 10M samples,
 * performing on par with `Math.random` (V8's xorshift128+):
 *
 * - mean, variance, chi-squared uniformity, Kolmogorov-Smirnov
 * - lag-1 through lag-8 autocorrelation
 * - runs test, gap test, permutation test (triples)
 * - bit-level frequency (bits 0-7)
 * - 2D serial pairs (25x25 through 200x200 grids)
 * - birthday spacings (Marsaglia parameters)
 *
 * Speed is near-native (~4% slower than `Math.random`) and ~18% faster than Alea
 * (~14.4M ops/sec vs ~15.0M and ~12.2M respectively).
 *
 * To reproduce:
 *
 * ```bash
 * npm run benchmark_random_quality          # distribution tests (N=1M)
 * npm run benchmark_random_quality -- --deep # thorough (N=10M, multi-trial)
 * npm run benchmark_random                  # speed comparison
 * ```
 *
 * @see https://prng.di.unimi.it/
 * @see https://vigna.di.unimi.it/ftp/papers/ScrambledLinear.pdf
 *
 * @module
 */

/*

Written in 2018 by David Blackman and Sebastiano Vigna (vigna@acm.org)

To the extent possible under law, the author has dedicated all copyright
and related and neighboring rights to this software to the public domain
worldwide. This software is distributed without any warranty.

See <https://creativecommons.org/publicdomain/zero/1.0/>.

*/

export interface RandomXoshiro {
	(): number;
	uint32: () => number;
	fract53: () => number;
	version: string;
	seed: number;
}

/**
 * Seeded pseudo-random number generator using the Xoshiro128** algorithm.
 * DO NOT USE when security matters, use webcrypto APIs instead.
 *
 * @see https://prng.di.unimi.it/
 */
export const create_random_xoshiro = (seed?: number): RandomXoshiro => {
	const actual_seed = seed ?? Date.now();
	let sm_state = actual_seed | 0;

	// expand single seed into 4 state words via SplitMix32
	let r = splitmix32_next(sm_state);
	let s0 = r.value;
	sm_state = r.state;
	r = splitmix32_next(sm_state);
	let s1 = r.value;
	sm_state = r.state;
	r = splitmix32_next(sm_state);
	let s2 = r.value;
	sm_state = r.state;
	r = splitmix32_next(sm_state);
	let s3 = r.value;

	// guard against all-zero state (absorbing fixed point)
	if ((s0 | s1 | s2 | s3) === 0) s0 = 1;

	const next_uint32 = (): number => {
		const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9);
		const t = s1 << 9;

		s2 ^= s0;
		s3 ^= s1;
		s1 ^= s2;
		s0 ^= s3;
		s2 ^= t;
		s3 = rotl(s3, 11);

		return result >>> 0;
	};

	const random: RandomXoshiro = (): number => next_uint32() / 0x100000000; // 2^32

	random.uint32 = next_uint32;

	random.fract53 = (): number => {
		return random() + ((random() * 0x200000) | 0) * 1.1102230246251565e-16; // 2^-53
	};

	random.version = 'Xoshiro128** 1.0';
	random.seed = actual_seed;

	return random;
};

/**
 * Expands a 32-bit state by one step using the SplitMix32 algorithm,
 * producing the four state words needed by Xoshiro128**.
 */
const splitmix32_next = (prev_state: number): { value: number; state: number } => {
	const next_state = (prev_state + 0x9e3779b9) | 0;
	let z = next_state;
	z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
	z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
	return { value: (z ^ (z >>> 16)) >>> 0, state: next_state };
};

const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k));
