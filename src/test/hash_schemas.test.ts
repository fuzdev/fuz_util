import { describe, test, assert } from 'vitest';

import {
	Blake3Hash,
	FACT_HASH_PREFIX,
	FactHashSchema,
	is_fact_hash,
	type FactHash
} from '$lib/hash_schemas.ts';

/** A syntactically valid (if not content-derived) fact hash literal. */
const HASH_A = (FACT_HASH_PREFIX + 'a'.repeat(64)) as FactHash;

describe('Blake3Hash', () => {
	test('accepts all-zeros', () => {
		assert.strictEqual(Blake3Hash.safeParse('0'.repeat(64)).success, true);
	});

	test('accepts all-f', () => {
		assert.strictEqual(Blake3Hash.safeParse('f'.repeat(64)).success, true);
	});

	test('rejects too short', () => {
		assert.strictEqual(Blake3Hash.safeParse('abcdef').success, false);
	});

	test('rejects too long', () => {
		assert.strictEqual(Blake3Hash.safeParse('a'.repeat(65)).success, false);
	});

	test('rejects uppercase hex', () => {
		assert.strictEqual(Blake3Hash.safeParse('A'.repeat(64)).success, false);
	});

	test('rejects non-hex characters', () => {
		assert.strictEqual(Blake3Hash.safeParse('g'.repeat(64)).success, false);
	});

	test('rejects empty string', () => {
		assert.strictEqual(Blake3Hash.safeParse('').success, false);
	});

	test('rejects 63 chars (off-by-one short)', () => {
		assert.strictEqual(Blake3Hash.safeParse('a'.repeat(63)).success, false);
	});

	test('rejects 65 chars (off-by-one long)', () => {
		assert.strictEqual(Blake3Hash.safeParse('a'.repeat(65)).success, false);
	});

	test('rejects UUID format', () => {
		// Regression: session IDs were validated as UUIDs but are blake3 hashes
		assert.strictEqual(Blake3Hash.safeParse('00000000-0000-4000-8000-000000000040').success, false);
	});

	test('rejects mixed case hex', () => {
		const mixed = 'aAbBcCdDeEfF'.repeat(5) + 'aAbB';
		assert.strictEqual(mixed.length, 64);
		assert.strictEqual(Blake3Hash.safeParse(mixed).success, false);
	});

	test('rejects leading whitespace', () => {
		assert.strictEqual(Blake3Hash.safeParse(' ' + 'a'.repeat(64)).success, false);
	});

	test('rejects trailing whitespace', () => {
		assert.strictEqual(Blake3Hash.safeParse('a'.repeat(64) + ' ').success, false);
	});

	test('rejects embedded spaces', () => {
		assert.strictEqual(Blake3Hash.safeParse('a'.repeat(32) + ' ' + 'a'.repeat(31)).success, false);
	});

	test('rejects number', () => {
		assert.strictEqual(Blake3Hash.safeParse(12345).success, false);
	});

	test('rejects null', () => {
		assert.strictEqual(Blake3Hash.safeParse(null).success, false);
	});

	test('rejects undefined', () => {
		assert.strictEqual(Blake3Hash.safeParse(undefined).success, false);
	});

	test('rejects boolean', () => {
		assert.strictEqual(Blake3Hash.safeParse(true).success, false);
	});

	test('rejects the `blake3:`-prefixed wire form (that is FactHashSchema)', () => {
		assert.strictEqual(Blake3Hash.safeParse(HASH_A).success, false);
	});
});

describe('is_fact_hash / FactHashSchema', () => {
	test('accepts a well-formed lowercase hex64 hash', () => {
		assert.ok(is_fact_hash(FACT_HASH_PREFIX + 'a'.repeat(64)));
	});

	test('rejects wrong length, wrong prefix, and uppercase hex', () => {
		assert.ok(!is_fact_hash(FACT_HASH_PREFIX + 'a'.repeat(63)), '63 chars');
		assert.ok(!is_fact_hash(FACT_HASH_PREFIX + 'a'.repeat(65)), '65 chars');
		assert.ok(!is_fact_hash('sha256:' + 'a'.repeat(64)), 'wrong prefix');
		assert.ok(!is_fact_hash('a'.repeat(64)), 'no prefix');
		assert.ok(!is_fact_hash(FACT_HASH_PREFIX + 'A'.repeat(64)), 'uppercase hex');
		assert.ok(!is_fact_hash(FACT_HASH_PREFIX + 'g'.repeat(64)), 'non-hex letter');
	});

	test('rejects the empty string, the bare prefix, and surrounding whitespace', () => {
		assert.ok(!is_fact_hash(''), 'empty');
		assert.ok(!is_fact_hash(FACT_HASH_PREFIX), 'prefix only');
		assert.ok(!is_fact_hash(' ' + FACT_HASH_PREFIX + 'a'.repeat(64)), 'leading space');
		assert.ok(!is_fact_hash(FACT_HASH_PREFIX + 'a'.repeat(64) + '\n'), 'trailing newline');
	});

	test('FactHashSchema.parse throws on a malformed value', () => {
		assert.throws(() => FactHashSchema.parse('blake3:nope'));
	});

	test('FactHashSchema.parse round-trips a well-formed hash unchanged', () => {
		const raw = FACT_HASH_PREFIX + 'a'.repeat(64);
		assert.strictEqual(FactHashSchema.parse(raw), raw);
	});

	test('a hash embedded in a longer string is not a single-string match', () => {
		// is_fact_hash is anchored — only an exact match passes.
		assert.ok(!is_fact_hash(`see ${HASH_A} here`));
	});

	test('is_fact_hash is stateless across repeated calls (anchored, not /g)', () => {
		// Guards against regressing FACT_HASH_EXACT to a global pattern, whose
		// lastIndex would make alternating `.test` calls flip-flop.
		assert.ok(is_fact_hash(HASH_A));
		assert.ok(is_fact_hash(HASH_A));
		assert.ok(is_fact_hash(HASH_A));
	});
});
