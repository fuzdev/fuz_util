import {describe, test, assert} from 'vitest';

import {
	FACT_HASH_PREFIX,
	FACT_HASH_PATTERN,
	FactHashSchema,
	fact_hash_bytes,
	fact_hash_stream,
	is_fact_hash,
	fact_hash_verify,
	fact_hash_extract_refs,
	type FactHash,
} from '$lib/fact_hash.ts';
import {hash_blake3} from '$lib/hash_blake3.ts';
import type {Json} from '$lib/json.ts';

/** A syntactically valid (if not content-derived) fact hash literal. */
const HASH_A = (FACT_HASH_PREFIX + 'a'.repeat(64)) as FactHash;
const HASH_B = (FACT_HASH_PREFIX + 'b'.repeat(64)) as FactHash;

/** Build a single-chunk `ReadableStream<Uint8Array>` from `bytes`. */
const stream_of = (...chunks: Array<Uint8Array>): ReadableStream<Uint8Array> =>
	new ReadableStream({
		start(controller) {
			for (const c of chunks) controller.enqueue(c);
			controller.close();
		},
	});

describe('fact_hash_bytes', () => {
	test('prefixes the blake3 hex digest', () => {
		const bytes = new TextEncoder().encode('hello');
		assert.strictEqual(fact_hash_bytes(bytes), FACT_HASH_PREFIX + hash_blake3(bytes));
	});

	test('string input is UTF-8 encoded — equals the encoded bytes', () => {
		const text = 'héllo 🌍';
		assert.strictEqual(fact_hash_bytes(text), fact_hash_bytes(new TextEncoder().encode(text)));
	});

	test('is deterministic and produces a schema-valid FactHash', () => {
		const h1 = fact_hash_bytes('same');
		const h2 = fact_hash_bytes('same');
		assert.strictEqual(h1, h2);
		assert.ok(is_fact_hash(h1));
		assert.doesNotThrow(() => FactHashSchema.parse(h1));
	});

	test('different inputs hash differently', () => {
		assert.notStrictEqual(fact_hash_bytes('a'), fact_hash_bytes('b'));
	});

	test('the empty input still yields a valid hash', () => {
		const h = fact_hash_bytes(new Uint8Array(0));
		assert.ok(is_fact_hash(h));
	});
});

describe('fact_hash_stream', () => {
	test('streamed bytes hash identically to buffered bytes', async () => {
		const bytes = new TextEncoder().encode('the quick brown fox');
		assert.strictEqual(await fact_hash_stream(stream_of(bytes)), fact_hash_bytes(bytes));
	});

	test('chunk boundaries do not affect the digest', async () => {
		const whole = new TextEncoder().encode('abcdefghij');
		const split = await fact_hash_stream(
			stream_of(whole.subarray(0, 3), whole.subarray(3, 7), whole.subarray(7)),
		);
		assert.strictEqual(split, fact_hash_bytes(whole));
	});

	test('empty chunks between data do not affect the digest', async () => {
		const whole = new TextEncoder().encode('abcdefghij');
		const split = await fact_hash_stream(
			stream_of(new Uint8Array(0), whole.subarray(0, 5), new Uint8Array(0), whole.subarray(5)),
		);
		assert.strictEqual(split, fact_hash_bytes(whole));
	});

	test('an empty stream hashes identically to empty bytes', async () => {
		assert.strictEqual(await fact_hash_stream(stream_of()), fact_hash_bytes(new Uint8Array(0)));
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

describe('fact_hash_verify', () => {
	test('true when bytes reproduce the hash', () => {
		const bytes = new TextEncoder().encode('payload');
		assert.ok(fact_hash_verify(fact_hash_bytes(bytes), bytes));
	});

	test('false when bytes differ', () => {
		assert.ok(!fact_hash_verify(fact_hash_bytes('payload'), new TextEncoder().encode('tampered')));
	});

	test('false for a malformed claimed hash', () => {
		// A non-content hash literal can never equal a freshly computed digest.
		assert.ok(!fact_hash_verify(HASH_A, new TextEncoder().encode('payload')));
	});

	test('true for the empty input', () => {
		const empty = new Uint8Array(0);
		assert.ok(fact_hash_verify(fact_hash_bytes(empty), empty));
	});
});

describe('fact_hash_extract_refs', () => {
	test('finds a ref in a plain string value', () => {
		assert.deepStrictEqual(fact_hash_extract_refs({image: HASH_A}), [HASH_A]);
	});

	test('walks nested objects and arrays', () => {
		const value = {a: {b: [HASH_A, {c: HASH_B}]}};
		assert.deepStrictEqual(new Set(fact_hash_extract_refs(value)), new Set([HASH_A, HASH_B]));
	});

	test('object keys are not scanned', () => {
		assert.deepStrictEqual(fact_hash_extract_refs({[HASH_A]: 'value'}), []);
	});

	test('deduplicates repeated refs', () => {
		assert.deepStrictEqual(fact_hash_extract_refs([HASH_A, HASH_A, {x: HASH_A}]), [HASH_A]);
	});

	test('preserves depth-first first-seen order', () => {
		assert.deepStrictEqual(fact_hash_extract_refs([HASH_B, HASH_A, HASH_B]), [HASH_B, HASH_A]);
	});

	test('extracts multiple refs from a single string value', () => {
		const blob = `prefix ${HASH_A} middle ${HASH_B} suffix`;
		assert.deepStrictEqual(new Set(fact_hash_extract_refs({blob})), new Set([HASH_A, HASH_B]));
	});

	test('ignores null, numbers, and booleans', () => {
		assert.deepStrictEqual(fact_hash_extract_refs({a: null, b: 1, c: true, d: [null, 2]}), []);
	});

	test('returns [] for top-level non-string primitives', () => {
		for (const v of [null, 42, true, false]) {
			assert.deepStrictEqual(fact_hash_extract_refs(v as Json), [], JSON.stringify(v));
		}
	});

	test('returns [] when no refs are present', () => {
		assert.deepStrictEqual(fact_hash_extract_refs({title: 'no hashes here'}), []);
	});

	test('returns [] for empty containers', () => {
		assert.deepStrictEqual(fact_hash_extract_refs({}), []);
		assert.deepStrictEqual(fact_hash_extract_refs([]), []);
	});

	test('finds both of two hashes glued together with no separator', () => {
		// Concatenated refs in a blob (e.g. packed binary metadata rendered to
		// text) must both surface — the second `blake3:` is found right after
		// the first match ends.
		assert.deepStrictEqual(fact_hash_extract_refs({blob: HASH_A + HASH_B}), [HASH_A, HASH_B]);
	});

	test('a top-level string value is scanned', () => {
		assert.deepStrictEqual(fact_hash_extract_refs(HASH_A as unknown as string), [HASH_A]);
	});

	test('uppercase-hex hashes are not matched (scanner is lowercase-only)', () => {
		// Mirrors `is_fact_hash`'s lowercase contract — an uppercased digest
		// is not a valid ref and must not be silently extracted.
		const upper = FACT_HASH_PREFIX + 'A'.repeat(64);
		assert.deepStrictEqual(fact_hash_extract_refs({upper}), []);
	});

	test('self-identifying: a hash glued to a leading word is still found', () => {
		// The `blake3:` prefix is self-identifying — the unanchored scan finds
		// it mid-token (no word boundary required), unlike anchored validation.
		assert.deepStrictEqual(fact_hash_extract_refs({k: 'xref=' + HASH_A}), [HASH_A]);
	});

	test('multiple refs in one string preserve their in-string order', () => {
		// `String.match` returns matches left-to-right; pin that the dedup Set
		// preserves that order for a single scanned string.
		assert.deepStrictEqual(fact_hash_extract_refs(`${HASH_B} then ${HASH_A}`), [HASH_B, HASH_A]);
	});

	test('rejects an over-long hex run instead of truncating to a wrong hash', () => {
		// `blake3:` + 65+ hex is malformed, not normal data. The right-boundary
		// lookahead drops it rather than emitting the (different) 64-char prefix
		// as if it were a real ref.
		assert.deepStrictEqual(fact_hash_extract_refs({over: FACT_HASH_PREFIX + 'a'.repeat(65)}), []);
		assert.deepStrictEqual(fact_hash_extract_refs({over: FACT_HASH_PREFIX + 'a'.repeat(128)}), []);
	});

	test('a valid ref followed immediately by a non-hex char is still found', () => {
		// The boundary is "not more hex" — a hash glued to non-hex text (a
		// slash, brace, the letter past the hex range) is a complete ref.
		assert.deepStrictEqual(fact_hash_extract_refs({k: HASH_A + '/thumb.png'}), [HASH_A]);
		assert.deepStrictEqual(fact_hash_extract_refs({k: HASH_A + 'z'}), [HASH_A]);
	});

	test('FACT_HASH_PATTERN is global (lastIndex hazard for .test, safe for .match)', () => {
		// Guards the documented contract that the exported pattern carries /g.
		assert.ok(FACT_HASH_PATTERN.global);
	});
});
