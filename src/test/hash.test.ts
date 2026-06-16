import {describe, test, assert} from 'vitest';

import {hash_sha1, hash_sha256, hash_sha384, hash_sha512, hash_insecure} from '../lib/hash.ts';

// test vectors generated via WebCrypto `crypto.subtle.digest`
// format: [input, sha1, sha256, sha384, sha512]
const vectors: Array<[string, string, string, string, string]> = [
	[
		'',
		'da39a3ee5e6b4b0d3255bfef95601890afd80709',
		'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
		'38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b',
		'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e',
	],
	[
		'hello',
		'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d',
		'2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
		'59e1748777448c69de6b800d7a33bbfb9ff1b463e44354c3553bcdb9c666fa90125a3c79f90397bdf5f6a13de828684f',
		'9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72323c3d99ba5c11d7c7acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043',
	],
	[
		'hello world',
		'2aae6c35c94fcfb415dbe95f408b9ce91ee846ed',
		'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
		'fdbd8e75a67f29f701a4e040385e2e23986303ea10239211af907fcbb83578b3e417cb71ce646efd0819dd8c088de1bd',
		'309ecc489c12d6eb4cc40f50c902f2b4d0ed77ee511a7c7a9bcd3ca86d4cd86f989dd35bc5ff499670da34255b45b0cfd830e81f605dcf7dc5542e93ae9cd76f',
	],
	[
		'abc',
		'a9993e364706816aba3e25717850c26c9cd0d89d',
		'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
		'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
		'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
	],
];

const webcrypto_fns = [
	{name: 'hash_sha1', fn: hash_sha1, hex_len: 40, vector_index: 1},
	{name: 'hash_sha256', fn: hash_sha256, hex_len: 64, vector_index: 2},
	{name: 'hash_sha384', fn: hash_sha384, hex_len: 96, vector_index: 3},
	{name: 'hash_sha512', fn: hash_sha512, hex_len: 128, vector_index: 4},
] as const;

const hello_bytes = new Uint8Array([104, 101, 108, 108, 111]);

describe.each(webcrypto_fns)('$name', ({fn, hex_len, vector_index}) => {
	test.each(vectors)('vector %#: %j', async (input, ...expected) => {
		assert.strictEqual(await fn(input), expected[vector_index - 1]);
	});

	test(`returns ${hex_len}-character lowercase hex`, async () => {
		const result = await fn('test');
		assert.strictEqual(result.length, hex_len);
		assert.match(result, /^[0-9a-f]+$/);
	});

	test('Uint8Array input matches string', async () => {
		const from_bytes = await fn(hello_bytes);
		const from_string = await fn('hello');
		assert.strictEqual(from_bytes, from_string);
	});

	test('ArrayBuffer input', async () => {
		assert.strictEqual(await fn(hello_bytes.buffer), await fn('hello'));
	});

	test('Uint8Array slice with byteOffset', async () => {
		const padded = new Uint8Array([0, 0, 104, 101, 108, 108, 111, 0, 0]);
		const slice = new Uint8Array(padded.buffer, 2, 5);
		assert.strictEqual(await fn(slice), await fn('hello'));
	});

	test('DataView input', async () => {
		const view = new DataView(hello_bytes.buffer);
		assert.strictEqual(await fn(view), await fn('hello'));
	});

	test('Int8Array input', async () => {
		const array = new Int8Array([104, 101, 108, 108, 111]);
		assert.strictEqual(await fn(array), await fn('hello'));
	});

	test('empty string equals empty buffer', async () => {
		assert.strictEqual(await fn(''), await fn(new ArrayBuffer(0)));
	});

	test('unicode and emoji produce valid hex', async () => {
		for (const input of ['日本語', '🎉']) {
			const result = await fn(input);
			assert.strictEqual(result.length, hex_len);
			assert.match(result, /^[0-9a-f]+$/);
		}
	});

	test('same input produces same output', async () => {
		assert.strictEqual(await fn('deterministic'), await fn('deterministic'));
	});

	test('distinct whitespace strings produce distinct hashes', async () => {
		const results = await Promise.all([fn(' '), fn('\t'), fn('\n'), fn('  ')]);
		assert.strictEqual(new Set(results).size, 4);
	});

	test('large buffer', async () => {
		const result = await fn(new Uint8Array(1_000_000).fill(42));
		assert.strictEqual(result.length, hex_len);
		assert.match(result, /^[0-9a-f]+$/);
	});

	test('parallel calls produce correct results', async () => {
		const inputs = ['one', 'two', 'three', 'four', 'five'];
		const [run1, run2] = await Promise.all([
			Promise.all(inputs.map(fn)),
			Promise.all(inputs.map(fn)),
		]);
		assert.deepEqual(run1, run2);
	});
});

describe('hash_insecure', () => {
	test('returns 8-character hex', () => {
		for (const input of ['', 'hello', '日本語', '🎉']) {
			const result = hash_insecure(input);
			assert.strictEqual(result.length, 8);
			assert.match(result, /^[0-9a-f]+$/);
		}
	});

	test('empty buffer is DJB2 initial value', () => {
		assert.strictEqual(hash_insecure(new ArrayBuffer(0)), '00001505');
	});

	test('different inputs produce different outputs', () => {
		const inputs = ['hello', 'world', 'foo', 'bar', 'baz'];
		assert.strictEqual(new Set(inputs.map(hash_insecure)).size, inputs.length);
	});

	test('BufferSource types', () => {
		const expected = hash_insecure(new Uint8Array([104, 101, 108, 108, 111]));
		assert.match(hash_insecure(new TextEncoder().encode('hello').buffer), /^[0-9a-f]{8}$/);
		assert.strictEqual(hash_insecure(new Int8Array([104, 101, 108, 108, 111])), expected);
		assert.strictEqual(
			hash_insecure(new DataView(new Uint8Array([104, 101, 108, 108, 111]).buffer)),
			expected,
		);
	});

	test('Uint8Array slice with byteOffset', () => {
		const padded = new Uint8Array([0, 0, 104, 101, 108, 108, 111, 0, 0]);
		const slice = new Uint8Array(padded.buffer, 2, 5);
		assert.strictEqual(
			hash_insecure(slice),
			hash_insecure(new Uint8Array([104, 101, 108, 108, 111])),
		);
	});

	test('ASCII string equals buffer with same byte values', () => {
		// for ASCII, charCodeAt and UTF-8 bytes are identical
		assert.strictEqual(
			hash_insecure('hello'),
			hash_insecure(new Uint8Array([104, 101, 108, 108, 111])),
		);
	});

	test('non-ASCII string differs from UTF-8 buffer', () => {
		// string uses UTF-16 code units, buffer uses UTF-8 bytes
		assert.notStrictEqual(hash_insecure('🎉'), hash_insecure(new TextEncoder().encode('🎉')));
	});

	test('null bytes differ from empty', () => {
		assert.notStrictEqual(
			hash_insecure(new Uint8Array([0, 0, 0, 0])),
			hash_insecure(new ArrayBuffer(0)),
		);
	});

	test('distinct whitespace strings', () => {
		assert.strictEqual(new Set([' ', '\t', '\n', '  '].map(hash_insecure)).size, 4);
	});
});
