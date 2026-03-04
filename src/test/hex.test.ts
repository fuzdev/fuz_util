import {describe, test, expect} from 'vitest';

import {to_hex} from '$lib/hex.js';

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
