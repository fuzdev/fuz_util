import {describe, test, expect} from 'vitest';

import {from_hex, to_hex} from '$lib/hex.js';

describe('to_hex', () => {
	test('empty Uint8Array', () => {
		expect(to_hex(new Uint8Array(0))).toBe('');
	});

	test('known bytes', () => {
		expect(to_hex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe('deadbeef');
	});

	test('single byte zero', () => {
		expect(to_hex(new Uint8Array([0x00]))).toBe('00');
	});

	test('single byte max', () => {
		expect(to_hex(new Uint8Array([0xff]))).toBe('ff');
	});

	test('low nibble padding', () => {
		// Values 0-15 need a leading zero
		expect(to_hex(new Uint8Array([0x0a]))).toBe('0a');
	});

	test('sequential bytes', () => {
		expect(to_hex(new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]))).toBe(
			'0123456789abcdef',
		);
	});

	test('all zeros', () => {
		expect(to_hex(new Uint8Array(4))).toBe('00000000');
	});

	test('all 0xff', () => {
		expect(to_hex(new Uint8Array(3).fill(0xff))).toBe('ffffff');
	});

	test('produces lowercase', () => {
		const result = to_hex(new Uint8Array([0xab, 0xcd, 0xef]));
		expect(result).toBe(result.toLowerCase());
	});

	test('output length is double input length', () => {
		const input = new Uint8Array(100);
		crypto.getRandomValues(input);
		expect(to_hex(input)).toHaveLength(200);
	});
});

describe('from_hex', () => {
	test('decodes valid hex', () => {
		expect(from_hex('68656c6c6f')).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
	});

	test('decodes uppercase hex', () => {
		expect(from_hex('48454C4C4F')).toEqual(new Uint8Array([72, 69, 76, 76, 79]));
	});

	test('decodes mixed case', () => {
		expect(from_hex('aAbBcC')).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc]));
	});

	test('strips whitespace', () => {
		expect(from_hex('68 65 6c 6c 6f')).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
	});

	test('strips tabs and newlines', () => {
		expect(from_hex('68\t65\n6c')).toEqual(new Uint8Array([104, 101, 108]));
	});

	test('empty string returns empty array', () => {
		expect(from_hex('')).toEqual(new Uint8Array([]));
	});

	test('returns null for odd length', () => {
		expect(from_hex('abc')).toBeNull();
	});

	test('returns null for invalid characters', () => {
		expect(from_hex('xyz')).toBeNull();
	});

	test('returns null for mixed valid and invalid', () => {
		expect(from_hex('abcdgh')).toBeNull();
	});

	test('roundtrips with to_hex', () => {
		const bytes = new Uint8Array([0, 1, 127, 128, 255]);
		expect(from_hex(to_hex(bytes))).toEqual(bytes);
	});

	test('full byte range roundtrip', () => {
		const bytes = new Uint8Array(256);
		for (let i = 0; i < 256; i++) {
			bytes[i] = i;
		}
		expect(from_hex(to_hex(bytes))).toEqual(bytes);
	});
});
