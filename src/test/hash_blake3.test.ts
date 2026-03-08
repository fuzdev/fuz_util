import {describe, test, expect} from 'vitest';

import {hash_blake3, Blake3Hash} from '$lib/hash_blake3.js';

describe('hash_blake3', () => {
	// Known test vectors from blake3_wasm test suite (~/dev/blake3/test/test_vectors.json)
	describe('known test vectors', () => {
		test('empty input', () => {
			expect(hash_blake3('')).toBe(
				'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262',
			);
		});

		test('hello', () => {
			expect(hash_blake3('hello')).toBe(
				'ea8f163db38682925e4491c5e58d4bb3506ef8c14eb78a86e908c5624a67200f',
			);
		});

		test('single byte 0x42', () => {
			expect(hash_blake3(new Uint8Array([0x42]))).toBe(
				'9f9524ca18c0cc03aef1a0b84faed9375e5d19575e9328e65fea72991f0f58cf',
			);
		});
	});

	describe('string input', () => {
		test('unicode produces valid hash', () => {
			const result = hash_blake3('日本語');
			expect(result).toHaveLength(64);
			expect(result).toMatch(/^[0-9a-f]+$/);
		});

		test('emoji produces valid hash', () => {
			const result = hash_blake3('🎉');
			expect(result).toHaveLength(64);
			expect(result).toMatch(/^[0-9a-f]+$/);
		});
	});

	describe('BufferSource input', () => {
		test('ArrayBuffer', () => {
			const buffer = new TextEncoder().encode('hello').buffer;
			expect(hash_blake3(buffer)).toBe(
				'ea8f163db38682925e4491c5e58d4bb3506ef8c14eb78a86e908c5624a67200f',
			);
		});

		test('Uint8Array', () => {
			const array = new Uint8Array([104, 101, 108, 108, 111]); // "hello"
			expect(hash_blake3(array)).toBe(
				'ea8f163db38682925e4491c5e58d4bb3506ef8c14eb78a86e908c5624a67200f',
			);
		});

		test('Uint8Array slice (byteOffset)', () => {
			const full = new Uint8Array([0, 0, 104, 101, 108, 108, 111, 0, 0]);
			const slice = new Uint8Array(full.buffer, 2, 5); // "hello"
			const result = hash_blake3(slice);
			expect(result).toBe(hash_blake3('hello'));
		});

		test('empty ArrayBuffer', () => {
			expect(hash_blake3(new ArrayBuffer(0))).toBe(
				'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262',
			);
		});

		test('empty string equals empty buffer', () => {
			expect(hash_blake3('')).toBe(hash_blake3(new ArrayBuffer(0)));
		});

		test('DataView', () => {
			const buffer = new TextEncoder().encode('hello').buffer;
			const view = new DataView(buffer);
			expect(hash_blake3(view)).toBe(hash_blake3('hello'));
		});

		test('Int8Array', () => {
			const array = new Int8Array([104, 101, 108, 108, 111]); // "hello"
			expect(hash_blake3(array)).toBe(hash_blake3('hello'));
		});

		test('large buffer', () => {
			const large = new Uint8Array(1_000_000).fill(42);
			const result = hash_blake3(large);
			expect(result).toHaveLength(64);
			expect(result).toMatch(/^[0-9a-f]+$/);
		});
	});

	describe('consistency', () => {
		test('same input produces same output', () => {
			const input = 'consistent input';
			expect(hash_blake3(input)).toBe(hash_blake3(input));
		});

		test('string and equivalent buffer produce same hash', () => {
			const str = 'equivalent';
			const buffer = new TextEncoder().encode(str);
			expect(hash_blake3(str)).toBe(hash_blake3(buffer));
		});

		test('different inputs produce different hashes', () => {
			const inputs = ['hello', 'world', 'foo', 'bar', 'baz'];
			const hashes = new Set(inputs.map(hash_blake3));
			expect(hashes.size).toBe(inputs.length);
		});
	});

	describe('Blake3Hash schema', () => {
		test('accepts valid hash output', () => {
			const valid = hash_blake3('test');
			expect(Blake3Hash.safeParse(valid).success).toBe(true);
		});

		test('accepts all-zeros', () => {
			expect(Blake3Hash.safeParse('0'.repeat(64)).success).toBe(true);
		});

		test('accepts all-f', () => {
			expect(Blake3Hash.safeParse('f'.repeat(64)).success).toBe(true);
		});

		test('rejects too short', () => {
			expect(Blake3Hash.safeParse('abcdef').success).toBe(false);
		});

		test('rejects too long', () => {
			expect(Blake3Hash.safeParse('a'.repeat(65)).success).toBe(false);
		});

		test('rejects uppercase hex', () => {
			expect(Blake3Hash.safeParse('A'.repeat(64)).success).toBe(false);
		});

		test('rejects non-hex characters', () => {
			expect(Blake3Hash.safeParse('g'.repeat(64)).success).toBe(false);
		});

		test('rejects empty string', () => {
			expect(Blake3Hash.safeParse('').success).toBe(false);
		});

		test('rejects 63 chars (off-by-one short)', () => {
			expect(Blake3Hash.safeParse('a'.repeat(63)).success).toBe(false);
		});

		test('rejects 65 chars (off-by-one long)', () => {
			expect(Blake3Hash.safeParse('a'.repeat(65)).success).toBe(false);
		});

		test('rejects UUID format', () => {
			// Regression: session IDs were validated as UUIDs but are blake3 hashes
			expect(Blake3Hash.safeParse('00000000-0000-4000-8000-000000000040').success).toBe(false);
		});

		test('rejects mixed case hex', () => {
			const mixed = 'aAbBcCdDeEfF'.repeat(5) + 'aAbB';
			expect(mixed.length).toBe(64);
			expect(Blake3Hash.safeParse(mixed).success).toBe(false);
		});

		test('rejects leading whitespace', () => {
			expect(Blake3Hash.safeParse(' ' + 'a'.repeat(64)).success).toBe(false);
		});

		test('rejects trailing whitespace', () => {
			expect(Blake3Hash.safeParse('a'.repeat(64) + ' ').success).toBe(false);
		});

		test('rejects embedded spaces', () => {
			expect(Blake3Hash.safeParse('a'.repeat(32) + ' ' + 'a'.repeat(31)).success).toBe(false);
		});

		test('rejects number', () => {
			expect(Blake3Hash.safeParse(12345).success).toBe(false);
		});

		test('rejects null', () => {
			expect(Blake3Hash.safeParse(null).success).toBe(false);
		});

		test('rejects undefined', () => {
			expect(Blake3Hash.safeParse(undefined).success).toBe(false);
		});

		test('rejects boolean', () => {
			expect(Blake3Hash.safeParse(true).success).toBe(false);
		});

		test('hash_blake3 output always passes Blake3Hash', () => {
			for (const input of ['', 'hello', 'test', '🎉', 'a'.repeat(1000)]) {
				const h = hash_blake3(input);
				expect(Blake3Hash.safeParse(h).success).toBe(true);
			}
		});
	});

	describe('edge cases', () => {
		test('whitespace strings are distinct', () => {
			const results = [' ', '\t', '\n', '  '].map(hash_blake3);
			const unique = new Set(results);
			expect(unique.size).toBe(4);
		});

		test('full byte range buffer', () => {
			const allBytes = new Uint8Array(256);
			for (let i = 0; i < 256; i++) {
				allBytes[i] = i;
			}
			const result = hash_blake3(allBytes);
			expect(result).toHaveLength(64);
			expect(result).toMatch(/^[0-9a-f]+$/);
		});
	});
});
