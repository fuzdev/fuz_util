import {describe, test, expect} from 'vitest';

import {hash_blake3} from '$lib/hash_blake3.js';

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
