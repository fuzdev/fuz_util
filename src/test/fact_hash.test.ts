import { describe, test, assert } from 'vitest';

import { fact_hash_bytes, fact_hash_stream, fact_hash_verify } from '#lib/fact_hash.ts';
import {
	FACT_HASH_PREFIX,
	FACT_HASH_EXACT,
	is_fact_hash,
	type FactHash
} from '#lib/hash_schemas.ts';
import { hash_blake3 } from '#lib/hash_blake3.ts';

/** A syntactically valid (if not content-derived) fact hash literal. */
const HASH_A = (FACT_HASH_PREFIX + 'a'.repeat(64)) as FactHash;

/** Build a single-chunk `ReadableStream<Uint8Array>` from `bytes`. */
const stream_of = (...chunks: Array<Uint8Array>): ReadableStream<Uint8Array> =>
	new ReadableStream({
		start(controller) {
			for (const c of chunks) controller.enqueue(c);
			controller.close();
		}
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

	test('is deterministic and produces a valid FactHash', () => {
		const h1 = fact_hash_bytes('same');
		const h2 = fact_hash_bytes('same');
		assert.strictEqual(h1, h2);
		assert.ok(is_fact_hash(h1));
		assert.ok(FACT_HASH_EXACT.test(h1));
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
			stream_of(whole.subarray(0, 3), whole.subarray(3, 7), whole.subarray(7))
		);
		assert.strictEqual(split, fact_hash_bytes(whole));
	});

	test('empty chunks between data do not affect the digest', async () => {
		const whole = new TextEncoder().encode('abcdefghij');
		const split = await fact_hash_stream(
			stream_of(new Uint8Array(0), whole.subarray(0, 5), new Uint8Array(0), whole.subarray(5))
		);
		assert.strictEqual(split, fact_hash_bytes(whole));
	});

	test('an empty stream hashes identically to empty bytes', async () => {
		assert.strictEqual(await fact_hash_stream(stream_of()), fact_hash_bytes(new Uint8Array(0)));
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
