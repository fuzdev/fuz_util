import { describe, test, assert } from 'vitest';

import {
	FACT_HASH_EXACT,
	FACT_HASH_PREFIX,
	is_fact_hash,
	type FactHash
} from '#lib/hash_schemas.ts';

/** A syntactically valid (if not content-derived) fact hash literal. */
const HASH_A = (FACT_HASH_PREFIX + 'a'.repeat(64)) as FactHash;

describe('is_fact_hash / FACT_HASH_EXACT', () => {
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

	test('FACT_HASH_EXACT is anchored and stateless', () => {
		assert.strictEqual(FACT_HASH_EXACT.source, '^blake3:[0-9a-f]{64}$');
		assert.strictEqual(FACT_HASH_EXACT.flags, '');
		assert.ok(FACT_HASH_EXACT.test(HASH_A));
		assert.ok(!FACT_HASH_EXACT.test('blake3:nope'));
	});

	test('FactHash is branded, so a plain string does not fit until narrowed', () => {
		const raw: string = FACT_HASH_PREFIX + 'a'.repeat(64);
		// @ts-expect-error a plain string lacks the brand
		const unbranded: FactHash = raw;
		assert.ok(is_fact_hash(unbranded));
		if (!is_fact_hash(raw)) assert.fail('expected a fact hash');
		const narrowed: FactHash = raw;
		assert.strictEqual(narrowed, HASH_A);
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
