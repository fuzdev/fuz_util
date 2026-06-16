import {describe, test, assert} from 'vitest';

import {from_hex, to_hex} from '../lib/hex.ts';

describe('to_hex', () => {
	test('empty Uint8Array', () => {
		assert.strictEqual(to_hex(new Uint8Array(0)), '');
	});

	test('known bytes', () => {
		assert.strictEqual(to_hex(new Uint8Array([0xde, 0xad, 0xbe, 0xef])), 'deadbeef');
	});

	test('single byte zero', () => {
		assert.strictEqual(to_hex(new Uint8Array([0x00])), '00');
	});

	test('single byte max', () => {
		assert.strictEqual(to_hex(new Uint8Array([0xff])), 'ff');
	});

	test('low nibble padding', () => {
		// Values 0-15 need a leading zero
		assert.strictEqual(to_hex(new Uint8Array([0x0a])), '0a');
	});

	test('sequential bytes', () => {
		assert.strictEqual(
			to_hex(new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef])),
			'0123456789abcdef',
		);
	});

	test('all zeros', () => {
		assert.strictEqual(to_hex(new Uint8Array(4)), '00000000');
	});

	test('all 0xff', () => {
		assert.strictEqual(to_hex(new Uint8Array(3).fill(0xff)), 'ffffff');
	});

	test('produces lowercase', () => {
		const result = to_hex(new Uint8Array([0xab, 0xcd, 0xef]));
		assert.strictEqual(result, result.toLowerCase());
	});

	test('output length is double input length', () => {
		const input = new Uint8Array(100);
		crypto.getRandomValues(input);
		assert.strictEqual(to_hex(input).length, 200);
	});
});

describe('from_hex', () => {
	test('decodes valid hex', () => {
		assert.deepEqual(from_hex('68656c6c6f'), new Uint8Array([104, 101, 108, 108, 111]));
	});

	test('decodes uppercase hex', () => {
		assert.deepEqual(from_hex('48454C4C4F'), new Uint8Array([72, 69, 76, 76, 79]));
	});

	test('decodes mixed case', () => {
		assert.deepEqual(from_hex('aAbBcC'), new Uint8Array([0xaa, 0xbb, 0xcc]));
	});

	test('strips whitespace', () => {
		assert.deepEqual(from_hex('68 65 6c 6c 6f'), new Uint8Array([104, 101, 108, 108, 111]));
	});

	test('strips tabs and newlines', () => {
		assert.deepEqual(from_hex('68\t65\n6c'), new Uint8Array([104, 101, 108]));
	});

	test('empty string returns empty array', () => {
		assert.deepEqual(from_hex(''), new Uint8Array([]));
	});

	test('returns null for odd length', () => {
		assert.isNull(from_hex('abc'));
	});

	test('returns null for invalid characters', () => {
		assert.isNull(from_hex('xyz'));
	});

	test('returns null for mixed valid and invalid', () => {
		assert.isNull(from_hex('abcdgh'));
	});

	test('roundtrips with to_hex', () => {
		const bytes = new Uint8Array([0, 1, 127, 128, 255]);
		assert.deepEqual(from_hex(to_hex(bytes)), bytes);
	});

	test('full byte range roundtrip', () => {
		const bytes = new Uint8Array(256);
		for (let i = 0; i < 256; i++) {
			bytes[i] = i;
		}
		assert.deepEqual(from_hex(to_hex(bytes)), bytes);
	});
});
