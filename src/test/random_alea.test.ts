/**
 * Pins `create_random_alea` against the reference implementation's published
 * output — the expected values are Baagøe's own, so a refactor that changes
 * the stream fails here rather than silently breaking every seeded consumer.
 *
 * Attribution and the MIT permission notice live with the code they cover, in
 * `random_alea.ts`, which is also where the "not a CSPRNG" warning belongs —
 * nobody reaches for a test module as a source of randomness.
 *
 * @see https://github.com/nquinlan/better-random-numbers-for-javascript-mirror
 *
 * @module
 */

import { test, assert } from 'vitest';

import { create_random_alea } from '$lib/random_alea.ts';

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
