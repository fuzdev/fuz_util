import {describe, test, expect} from 'vitest';

import {format_bytes, to_bytes} from '$lib/bytes.js';

describe('to_bytes', () => {
	describe('string input', () => {
		test('empty string', () => {
			const result = to_bytes('');
			expect(result).toBeInstanceOf(Uint8Array);
			expect(result).toHaveLength(0);
		});

		test('ASCII string', () => {
			const result = to_bytes('hello');
			expect(result).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
		});

		test('encodes as UTF-8 not UTF-16', () => {
			// é is U+00E9, UTF-8 is 2 bytes (0xC3 0xA9), UTF-16 would be 1 code unit
			const result = to_bytes('é');
			expect(result).toEqual(new Uint8Array([0xc3, 0xa9]));
			expect(result).toHaveLength(2);
		});

		test('emoji encodes as UTF-8', () => {
			// 🎉 is U+1F389, UTF-8 is 4 bytes
			const result = to_bytes('🎉');
			expect(result).toHaveLength(4);
		});
	});

	describe('Uint8Array input', () => {
		test('returns same reference', () => {
			const input = new Uint8Array([1, 2, 3]);
			const result = to_bytes(input);
			expect(result).toBe(input);
		});

		test('empty Uint8Array', () => {
			const input = new Uint8Array(0);
			const result = to_bytes(input);
			expect(result).toBe(input);
			expect(result).toHaveLength(0);
		});
	});

	describe('ArrayBuffer input', () => {
		test('wraps as Uint8Array', () => {
			const buffer = new Uint8Array([10, 20, 30]).buffer;
			const result = to_bytes(buffer);
			expect(result).toBeInstanceOf(Uint8Array);
			expect(result).toEqual(new Uint8Array([10, 20, 30]));
		});

		test('empty ArrayBuffer', () => {
			const result = to_bytes(new ArrayBuffer(0));
			expect(result).toHaveLength(0);
		});
	});

	describe('other BufferSource types', () => {
		test('DataView', () => {
			const buffer = new Uint8Array([1, 2, 3, 4, 5]).buffer;
			const view = new DataView(buffer, 1, 3);
			const result = to_bytes(view);
			expect(result).toEqual(new Uint8Array([2, 3, 4]));
		});

		test('Int8Array', () => {
			const result = to_bytes(new Int8Array([1, -1]));
			expect(result).toBeInstanceOf(Uint8Array);
			expect(result).toHaveLength(2);
		});

		test('Uint8Array with byteOffset', () => {
			const full = new Uint8Array([0, 0, 42, 43, 0, 0]);
			const slice = new Uint8Array(full.buffer, 2, 2);
			const result = to_bytes(slice);
			// Should be same reference since it's already a Uint8Array
			expect(result).toBe(slice);
			expect(result).toEqual(new Uint8Array([42, 43]));
		});

		test('Uint16Array respects byteOffset and byteLength', () => {
			const array = new Uint16Array([0x0102, 0x0304]);
			const result = to_bytes(array);
			expect(result).toBeInstanceOf(Uint8Array);
			expect(result).toHaveLength(4);
		});
	});
});

describe('format_bytes', () => {
	const cases: Array<[number, string]> = [
		[0, '0 B'],
		[1, '1 B'],
		[512, '512 B'],
		[1023, '1023 B'],
		[1024, '1.0 KB'],
		[1536, '1.5 KB'],
		[10240, '10.0 KB'],
		[1048576, '1.0 MB'],
		[1572864, '1.5 MB'],
		[1073741824, '1.0 GB'],
		[1610612736, '1.5 GB'],
	];

	test.each(cases)('%d → %s', (input, expected) => {
		expect(format_bytes(input)).toBe(expected);
	});
});
