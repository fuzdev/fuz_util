import { describe, test, assert } from 'vitest';

import { hash_blake3 } from '$lib/hash_blake3.ts';
import { Blake3Hash } from '$lib/hash_schemas.ts';

describe('hash_blake3', () => {
	// Known test vectors from blake3_wasm test suite (~/dev/blake3/test/test_vectors.json)
	describe('known test vectors', () => {
		test('empty input', () => {
			assert.strictEqual(
				hash_blake3(''),
				'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262'
			);
		});

		test('hello', () => {
			assert.strictEqual(
				hash_blake3('hello'),
				'ea8f163db38682925e4491c5e58d4bb3506ef8c14eb78a86e908c5624a67200f'
			);
		});

		test('single byte 0x42', () => {
			assert.strictEqual(
				hash_blake3(new Uint8Array([0x42])),
				'9f9524ca18c0cc03aef1a0b84faed9375e5d19575e9328e65fea72991f0f58cf'
			);
		});
	});

	describe('string input', () => {
		test('unicode produces valid hash', () => {
			const result = hash_blake3('日本語');
			assert.strictEqual(result.length, 64);
			assert.match(result, /^[0-9a-f]+$/);
		});

		test('emoji produces valid hash', () => {
			const result = hash_blake3('🎉');
			assert.strictEqual(result.length, 64);
			assert.match(result, /^[0-9a-f]+$/);
		});
	});

	describe('BufferSource input', () => {
		test('ArrayBuffer', () => {
			const buffer = new TextEncoder().encode('hello').buffer;
			assert.strictEqual(
				hash_blake3(buffer),
				'ea8f163db38682925e4491c5e58d4bb3506ef8c14eb78a86e908c5624a67200f'
			);
		});

		test('Uint8Array', () => {
			const array = new Uint8Array([104, 101, 108, 108, 111]); // "hello"
			assert.strictEqual(
				hash_blake3(array),
				'ea8f163db38682925e4491c5e58d4bb3506ef8c14eb78a86e908c5624a67200f'
			);
		});

		test('Uint8Array slice (byteOffset)', () => {
			const full = new Uint8Array([0, 0, 104, 101, 108, 108, 111, 0, 0]);
			const slice = new Uint8Array(full.buffer, 2, 5); // "hello"
			const result = hash_blake3(slice);
			assert.strictEqual(result, hash_blake3('hello'));
		});

		test('empty ArrayBuffer', () => {
			assert.strictEqual(
				hash_blake3(new ArrayBuffer(0)),
				'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262'
			);
		});

		test('empty string equals empty buffer', () => {
			assert.strictEqual(hash_blake3(''), hash_blake3(new ArrayBuffer(0)));
		});

		test('DataView', () => {
			const buffer = new TextEncoder().encode('hello').buffer;
			const view = new DataView(buffer);
			assert.strictEqual(hash_blake3(view), hash_blake3('hello'));
		});

		test('Int8Array', () => {
			const array = new Int8Array([104, 101, 108, 108, 111]); // "hello"
			assert.strictEqual(hash_blake3(array), hash_blake3('hello'));
		});

		test('large buffer', () => {
			const large = new Uint8Array(1_000_000).fill(42);
			const result = hash_blake3(large);
			assert.strictEqual(result.length, 64);
			assert.match(result, /^[0-9a-f]+$/);
		});

		// Regression: TS 5.7+ made `Uint8Array` generic over its underlying buffer
		// (default `Uint8Array<ArrayBufferLike>`). The previous `BufferSource`-only
		// signature rejected the default shape since `BufferSource` resolves to
		// `ArrayBufferView<ArrayBuffer>`. Lock in that the default typechecks.
		test('default Uint8Array<ArrayBufferLike> typechecks', () => {
			const make = (): Uint8Array => new Uint8Array([104, 101, 108, 108, 111]);
			assert.strictEqual(
				hash_blake3(make()),
				'ea8f163db38682925e4491c5e58d4bb3506ef8c14eb78a86e908c5624a67200f'
			);
		});
	});

	describe('consistency', () => {
		test('same input produces same output', () => {
			const input = 'consistent input';
			assert.strictEqual(hash_blake3(input), hash_blake3(input));
		});

		test('string and equivalent buffer produce same hash', () => {
			const str = 'equivalent';
			const buffer = new TextEncoder().encode(str);
			assert.strictEqual(hash_blake3(str), hash_blake3(buffer));
		});

		test('different inputs produce different hashes', () => {
			const inputs = ['hello', 'world', 'foo', 'bar', 'baz'];
			const hashes = new Set(inputs.map(hash_blake3));
			assert.strictEqual(hashes.size, inputs.length);
		});
	});

	describe('Blake3Hash integration', () => {
		test('hash_blake3 output always passes Blake3Hash', () => {
			for (const input of ['', 'hello', 'test', '\u{1F389}', 'a'.repeat(1000)]) {
				const h = hash_blake3(input);
				assert.strictEqual(Blake3Hash.safeParse(h).success, true);
			}
		});
	});

	describe('edge cases', () => {
		test('whitespace strings are distinct', () => {
			const results = [' ', '\t', '\n', '  '].map(hash_blake3);
			const unique = new Set(results);
			assert.strictEqual(unique.size, 4);
		});

		test('full byte range buffer', () => {
			const allBytes = new Uint8Array(256);
			for (let i = 0; i < 256; i++) {
				allBytes[i] = i;
			}
			const result = hash_blake3(allBytes);
			assert.strictEqual(result.length, 64);
			assert.match(result, /^[0-9a-f]+$/);
		});
	});
});
