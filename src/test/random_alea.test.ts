/*

This is the Alea pseudo-random number generator by Johannes Baagøe

Security disclaimer: Felt cannot vouch for the cryotographic security of this code.
Use Node/browser/platform crypto APIs instead of this when security matters.

From https://github.com/nquinlan/better-random-numbers-for-javascript-mirror

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

import {test, assert} from 'vitest';

import {create_random_alea} from '$lib/random_alea.ts';

test('Math.random() replacement', () => {
	// From https://github.com/nquinlan/better-random-numbers-for-javascript-mirror
	const random = create_random_alea('my', 3, 'seeds');
	assert.strictEqual(random(), 0.30802189325913787);
	assert.strictEqual(random(), 0.5190450621303171);
	assert.strictEqual(random(), 0.43635262292809784);
});

test('another seed', () => {
	const random2 = create_random_alea(1277182878230);
	assert.strictEqual(random2(), 0.6198398587293923);
	assert.strictEqual(random2(), 0.8385338634252548);
	assert.strictEqual(random2(), 0.3644848605617881);
});

test('seeded random uint32', () => {
	const random_uint32 = create_random_alea('').uint32;
	assert.strictEqual(random_uint32(), 715789690);
	assert.strictEqual(random_uint32(), 2091287642);
	assert.strictEqual(random_uint32(), 486307);
});

test('seeded random fract53', () => {
	const random_fract53 = create_random_alea('').fract53;
	assert.strictEqual(random_fract53(), 0.16665777435687268);
	assert.strictEqual(random_fract53(), 0.00011322738143160205);
	assert.strictEqual(random_fract53(), 0.17695781631176488);
});
