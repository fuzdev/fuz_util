/**
 * Alea: a seedable pseudo-random number generator by Johannes Baagøe.
 *
 * DO NOT USE when security matters — use the Web Crypto API (`crypto.getRandomValues`) instead.
 *
 * Alea passes all 11 distribution quality tests at 10M samples,
 * performing on par with `Math.random` (V8's xorshift128+):
 *
 * - mean, variance, chi-squared uniformity, Kolmogorov-Smirnov
 * - lag-1 through lag-8 autocorrelation
 * - runs test, gap test, permutation test (triples)
 * - bit-level frequency (bits 0-7)
 * - 2D serial pairs (25x25 through 200x200 grids)
 * - birthday spacings (Marsaglia parameters)
 *
 * Speed is ~19% slower than `Math.random` (~12M ops/sec vs ~14M ops/sec).
 *
 * To reproduce:
 *
 * ```bash
 * npm run benchmark_random_quality          # distribution tests (N=1M)
 * npm run benchmark_random_quality -- --deep # thorough (N=10M, multi-trial)
 * npm run benchmark_random                  # speed comparison
 * ```
 *
 * @see https://github.com/nquinlan/better-random-numbers-for-javascript-mirror
 *
 * @module
 */

/*

Copyright (C) 2010 by Johannes Baagøe <baagoe@baagoe.org>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/

export interface Alea {
	(): number;
	uint32: () => number;
	fract53: () => number;
	version: string;
	seeds: Array<unknown>;
}

/**
 * Seeded pseudo-random number generator.
 * DO NOT USE when security matters, use webcrypto APIs instead.
 *
 * @see https://github.com/nquinlan/better-random-numbers-for-javascript-mirror
 */
export const create_random_alea = (...seed: Array<unknown>): Alea => {
	let s0 = 0;
	let s1 = 0;
	let s2 = 0;
	let c = 1;

	const seeds = seed.length ? seed : [Date.now()];
	let mash: Mash | null = masher();
	s0 = mash(' ');
	s1 = mash(' ');
	s2 = mash(' ');

	for (const s of seeds) {
		s0 -= mash(s);
		if (s0 < 0) s0 += 1;
		s1 -= mash(s);
		if (s1 < 0) s1 += 1;
		s2 -= mash(s);
		if (s2 < 0) s2 += 1;
	}
	mash = null;

	const random: Alea = (): number => {
		const t = 2091639 * s0 + c * 2.3283064365386963e-10; // 2^-32
		s0 = s1;
		s1 = s2;
		return (s2 = t - (c = t | 0));
	};
	random.uint32 = (): number => {
		return random() * 0x100000000; // 2^32
	};
	random.fract53 = (): number => {
		return random() + ((random() * 0x200000) | 0) * 1.1102230246251565e-16; // 2^-53
	};
	random.version = 'Alea 0.9';
	random.seeds = seeds;
	return random;
};

type Mash = (data: any) => number;

/**
 * @source https://github.com/nquinlan/better-random-numbers-for-javascript-mirror
 * @copyright Johannes Baagøe <baagoe@baagoe.com>, 2010
 */
export const masher = (): Mash => {
	let n = 0xefc8249d;
	return (data) => {
		const d = data + '';
		for (let i = 0; i < d.length; i++) {
			n += d.charCodeAt(i);
			let h = 0.02519603282416938 * n;
			n = h >>> 0;
			h -= n;
			h *= n;
			n = h >>> 0;
			h -= n;
			n += h * 0x100000000; // 2^32
		}
		return (n >>> 0) * 2.3283064365386963e-10; // 2^-32
	};
};
