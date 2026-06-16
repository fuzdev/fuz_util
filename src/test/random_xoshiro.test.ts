/*

Xoshiro128** by David Blackman and Sebastiano Vigna (2018)

CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/

*/

import {test, assert} from 'vitest';

import {create_random_xoshiro} from '$lib/random_xoshiro.ts';

test('deterministic output with seed 42', () => {
	const random = create_random_xoshiro(42);
	assert.strictEqual(random(), 0.6606157226487994);
	assert.strictEqual(random(), 0.12688010395504534);
	assert.strictEqual(random(), 0.11170196393504739);
});

test('deterministic output with seed 0', () => {
	const random = create_random_xoshiro(0);
	assert.strictEqual(random(), 0.8868539538234472);
	assert.strictEqual(random(), 0.26395898405462503);
	assert.strictEqual(random(), 0.012474989285692573);
});

test('another seed', () => {
	const random = create_random_xoshiro(1277182878230);
	assert.strictEqual(random(), 0.8184546460397542);
	assert.strictEqual(random(), 0.952143958536908);
	assert.strictEqual(random(), 0.2612513310741633);
});

test('seeded random uint32', () => {
	const random = create_random_xoshiro(42);
	assert.strictEqual(random.uint32(), 2837322924);
	assert.strictEqual(random.uint32(), 544945897);
	assert.strictEqual(random.uint32(), 479756282);
});

test('seeded random fract53', () => {
	const random = create_random_xoshiro(42);
	assert.strictEqual(random.fract53(), 0.6606157226783409);
	assert.strictEqual(random.fract53(), 0.11170196412479017);
	assert.strictEqual(random.fract53(), 0.07910565008091508);
});

test('version and seed properties', () => {
	const random = create_random_xoshiro(42);
	assert.strictEqual(random.version, 'Xoshiro128** 1.0');
	assert.strictEqual(random.seed, 42);
});

test('default seed does not throw', () => {
	const random = create_random_xoshiro();
	const value = random();
	assert.ok(value >= 0 && value < 1);
});

test('all values in [0, 1)', () => {
	const random = create_random_xoshiro(42);
	for (let i = 0; i < 1000; i++) {
		const value = random();
		assert.ok(value >= 0, `value ${value} should be >= 0`);
		assert.ok(value < 1, `value ${value} should be < 1`);
	}
});
