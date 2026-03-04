import {describe, test, expect} from 'vitest';

import {hash_sha256, hash_insecure} from '$lib/hash.js';

describe('hash_sha256', () => {
	describe('string input', () => {
		// Known SHA-256 test vectors
		const string_cases: Array<[string, string, string]> = [
			['empty string', '', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
			['hello', 'hello', '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'],
			[
				'hello world',
				'hello world',
				'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
			],
		];

		test.each(string_cases)('%s', async (_description, input, expected) => {
			const result = await hash_sha256(input);
			expect(result).toBe(expected);
		});

		test('unicode produces valid hash', async () => {
			const result = await hash_sha256('日本語');
			expect(result).toHaveLength(64);
			expect(result).toMatch(/^[0-9a-f]+$/);
		});

		test('emoji produces valid hash', async () => {
			const result = await hash_sha256('🎉');
			expect(result).toHaveLength(64);
			expect(result).toMatch(/^[0-9a-f]+$/);
		});
	});

	describe('BufferSource input', () => {
		test('ArrayBuffer', async () => {
			const buffer = new TextEncoder().encode('hello').buffer;
			const result = await hash_sha256(buffer);
			expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
		});

		test('Uint8Array', async () => {
			const array = new Uint8Array([104, 101, 108, 108, 111]); // "hello"
			const result = await hash_sha256(array);
			expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
		});

		test('Uint8Array slice (byteOffset)', async () => {
			const full = new Uint8Array([0, 0, 104, 101, 108, 108, 111, 0, 0]);
			const slice = new Uint8Array(full.buffer, 2, 5); // "hello"
			const result = await hash_sha256(slice);
			expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
		});

		test('empty ArrayBuffer', async () => {
			const buffer = new ArrayBuffer(0);
			const result = await hash_sha256(buffer);
			expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
		});

		test('empty string equals empty buffer', async () => {
			const stringHash = await hash_sha256('');
			const bufferHash = await hash_sha256(new ArrayBuffer(0));
			expect(stringHash).toBe(bufferHash);
		});

		test('DataView', async () => {
			const buffer = new TextEncoder().encode('hello').buffer;
			const view = new DataView(buffer);
			const result = await hash_sha256(view);
			expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
		});

		test('Int8Array', async () => {
			const array = new Int8Array([104, 101, 108, 108, 111]); // "hello"
			const result = await hash_sha256(array);
			expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
		});

		test('large buffer', async () => {
			const large = new Uint8Array(1_000_000).fill(42);
			const result = await hash_sha256(large);
			expect(result).toHaveLength(64);
			expect(result).toMatch(/^[0-9a-f]+$/);
		});
	});

	describe('algorithms', () => {
		const algorithm_cases: Array<[string, 'SHA-256' | 'SHA-384' | 'SHA-512', number]> = [
			['SHA-256', 'SHA-256', 64],
			['SHA-384', 'SHA-384', 96],
			['SHA-512', 'SHA-512', 128],
		];

		test.each(algorithm_cases)('%s produces correct length', async (_desc, algorithm, length) => {
			const result = await hash_sha256('test', algorithm);
			expect(result).toHaveLength(length);
			expect(result).toMatch(/^[0-9a-f]+$/);
		});

		test('SHA-384 hash value', async () => {
			const result = await hash_sha256('hello', 'SHA-384');
			expect(result).toBe(
				'59e1748777448c69de6b800d7a33bbfb9ff1b463e44354c3553bcdb9c666fa90125a3c79f90397bdf5f6a13de828684f',
			);
		});

		test('SHA-512 hash value', async () => {
			const result = await hash_sha256('hello', 'SHA-512');
			expect(result).toBe(
				'9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72323c3d99ba5c11d7c7acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043',
			);
		});
	});

	describe('consistency', () => {
		test('same input produces same output', async () => {
			const input = 'consistent input';
			const result1 = await hash_sha256(input);
			const result2 = await hash_sha256(input);
			expect(result1).toBe(result2);
		});

		test('string and equivalent buffer produce same hash', async () => {
			const str = 'equivalent';
			const buffer = new TextEncoder().encode(str);
			const stringHash = await hash_sha256(str);
			const bufferHash = await hash_sha256(buffer);
			expect(stringHash).toBe(bufferHash);
		});
	});

	describe('concurrent calls', () => {
		test('parallel hashing produces correct results', async () => {
			const inputs = ['one', 'two', 'three', 'four', 'five'];
			const results = await Promise.all(inputs.map((input) => hash_sha256(input)));
			const expected = await Promise.all(inputs.map((input) => hash_sha256(input)));
			expect(results).toEqual(expected);
		});
	});

	describe('algorithm differences', () => {
		test('different algorithms produce different hashes for same input', async () => {
			const input = 'test';
			const sha256 = await hash_sha256(input, 'SHA-256');
			const sha384 = await hash_sha256(input, 'SHA-384');
			const sha512 = await hash_sha256(input, 'SHA-512');
			expect(sha256).not.toBe(sha384);
			expect(sha256).not.toBe(sha512);
			expect(sha384).not.toBe(sha512);
		});
	});

	describe('edge cases', () => {
		test('whitespace strings', async () => {
			const results = await Promise.all([
				hash_sha256(' '),
				hash_sha256('\t'),
				hash_sha256('\n'),
				hash_sha256('  '),
			]);
			const unique = new Set(results);
			expect(unique.size).toBe(4);
		});

		test('full byte range buffer', async () => {
			const allBytes = new Uint8Array(256);
			for (let i = 0; i < 256; i++) {
				allBytes[i] = i;
			}
			const result = await hash_sha256(allBytes);
			expect(result).toHaveLength(64);
			expect(result).toMatch(/^[0-9a-f]+$/);
		});
	});
});

describe('hash_insecure', () => {
	describe('string input', () => {
		const string_cases: Array<[string, string]> = [
			['empty string', ''],
			['single char', 'a'],
			['hello', 'hello'],
			['hello world', 'hello world'],
			['unicode', '日本語'],
			['emoji', '🎉'],
		];

		test.each(string_cases)('%s produces hex output', (_description, input) => {
			const result = hash_insecure(input);
			expect(result).toMatch(/^[0-9a-f]+$/);
		});
	});

	describe('BufferSource input', () => {
		test('ArrayBuffer', () => {
			const buffer = new TextEncoder().encode('hello').buffer;
			const result = hash_insecure(buffer);
			expect(result).toMatch(/^[0-9a-f]+$/);
		});

		test('Uint8Array', () => {
			const array = new Uint8Array([104, 101, 108, 108, 111]); // "hello"
			const result = hash_insecure(array);
			expect(result).toMatch(/^[0-9a-f]+$/);
		});

		test('Uint8Array slice (byteOffset)', () => {
			const full = new Uint8Array([0, 0, 104, 101, 108, 108, 111, 0, 0]);
			const slice = new Uint8Array(full.buffer, 2, 5); // "hello"
			const result = hash_insecure(slice);
			// slice should hash the same as direct array
			const direct = new Uint8Array([104, 101, 108, 108, 111]);
			expect(result).toBe(hash_insecure(direct));
		});

		test('empty ArrayBuffer', () => {
			const buffer = new ArrayBuffer(0);
			const result = hash_insecure(buffer);
			expect(result).toBe('00001505'); // 5381 in hex, padded to 8 chars
		});

		test('DataView', () => {
			const buffer = new TextEncoder().encode('test').buffer;
			const view = new DataView(buffer);
			const result = hash_insecure(view);
			expect(result).toMatch(/^[0-9a-f]+$/);
		});

		test('Int8Array', () => {
			const array = new Int8Array([1, 2, 3, 4, 5]);
			const result = hash_insecure(array);
			expect(result).toMatch(/^[0-9a-f]+$/);
		});

		test('Uint16Array', () => {
			// Multi-byte typed arrays hash the underlying bytes
			const array = new Uint16Array([0x0102, 0x0304]);
			const result = hash_insecure(array);
			expect(result).toMatch(/^[0-9a-f]+$/);
		});
	});

	describe('consistency', () => {
		test('same input produces same output', () => {
			const input = 'consistent input';
			const result1 = hash_insecure(input);
			const result2 = hash_insecure(input);
			expect(result1).toBe(result2);
		});

		test('different inputs produce different outputs', () => {
			const inputs = ['hello', 'world', 'foo', 'bar', 'baz'];
			const hashes = new Set(inputs.map(hash_insecure));
			expect(hashes.size).toBe(inputs.length);
		});
	});

	describe('string vs buffer equivalence', () => {
		// Note: string charCodeAt returns UTF-16 code units, while buffer contains UTF-8 bytes.
		// These will NOT be equivalent for ASCII strings because the encoding differs.
		// This is expected behavior - the hash operates on the raw data representation.

		test('ASCII string hashes raw UTF-16 code units', () => {
			const str = 'hello';
			const stringHash = hash_insecure(str);
			// String uses charCodeAt (UTF-16), buffer uses UTF-8 bytes
			// For ASCII they happen to have same values, but processed differently
			expect(stringHash).toMatch(/^[0-9a-f]+$/);
		});

		test('buffer hashes raw bytes', () => {
			const buffer = new TextEncoder().encode('hello');
			const bufferHash = hash_insecure(buffer);
			expect(bufferHash).toMatch(/^[0-9a-f]+$/);
		});
	});

	describe('edge cases', () => {
		test('very long string', () => {
			const long = 'a'.repeat(100000);
			const result = hash_insecure(long);
			expect(result).toMatch(/^[0-9a-f]+$/);
		});

		test('null bytes in buffer', () => {
			// With DJB2 initial value 5381, null bytes still produce a distinct hash
			const buffer = new Uint8Array([0, 0, 0, 0]);
			const result = hash_insecure(buffer);
			expect(result).toHaveLength(8);
			expect(result).toMatch(/^[0-9a-f]+$/);
			// Null bytes now produce different hash than empty buffer
			expect(result).not.toBe(hash_insecure(new ArrayBuffer(0)));
		});

		test('buffer with mixed null and non-null bytes', () => {
			const buffer = new Uint8Array([0, 1, 0, 1]);
			const result = hash_insecure(buffer);
			expect(result).toMatch(/^[0-9a-f]+$/);
			expect(result).not.toBe('0');
		});

		test('high byte values', () => {
			const buffer = new Uint8Array([255, 255, 255, 255]);
			const result = hash_insecure(buffer);
			expect(result).toMatch(/^[0-9a-f]+$/);
		});

		test('whitespace strings', () => {
			const results = [' ', '\t', '\n', '  '].map(hash_insecure);
			const unique = new Set(results);
			expect(unique.size).toBe(4);
		});

		test('full byte range buffer', () => {
			const allBytes = new Uint8Array(256);
			for (let i = 0; i < 256; i++) {
				allBytes[i] = i;
			}
			const result = hash_insecure(allBytes);
			expect(result).toMatch(/^[0-9a-f]+$/);
		});

		test('ASCII string equals buffer with same bytes', () => {
			// For ASCII (0-127), charCodeAt and UTF-8 bytes are identical
			const str = 'hello';
			const buffer = new Uint8Array([104, 101, 108, 108, 111]);
			expect(hash_insecure(str)).toBe(hash_insecure(buffer));
		});

		test('surrogate pairs (astral plane characters)', () => {
			// 🎉 is U+1F389, encoded as surrogate pair in UTF-16
			const result = hash_insecure('🎉');
			expect(result).toMatch(/^[0-9a-f]+$/);
			// String uses UTF-16 (2 code units), buffer uses UTF-8 (4 bytes)
			const buffer = new TextEncoder().encode('🎉');
			expect(buffer.length).toBe(4);
			// They should produce different hashes
			expect(hash_insecure('🎉')).not.toBe(hash_insecure(buffer));
		});
	});
});
