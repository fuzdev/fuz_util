/**
 * Hex encoding and binary data conversion helpers.
 *
 * @module
 */

const encoder = new TextEncoder();

// Lazily computed lookup table for byte to hex conversion
let byte_to_hex: Array<string> | undefined;
const get_byte_to_hex = (): Array<string> => {
	if (byte_to_hex === undefined) {
		byte_to_hex = new Array(256); // 256 possible byte values (0x00-0xff)
		for (let i = 0; i < 256; i++) {
			byte_to_hex[i] = i.toString(16).padStart(2, '0');
		}
	}
	return byte_to_hex;
};

/**
 * Converts a `Uint8Array` to a lowercase hex string.
 *
 * @param bytes - Binary data to encode.
 * @returns Hex string with two characters per byte.
 */
export const to_hex = (bytes: Uint8Array): string => {
	const lookup = get_byte_to_hex();
	let hex = '';
	for (const byte of bytes) {
		hex += lookup[byte];
	}
	return hex;
};

/**
 * Converts string or binary data to a `Uint8Array`.
 * Strings are UTF-8 encoded. `Uint8Array` inputs are returned as-is.
 *
 * @param data - String or `BufferSource` to convert.
 * @returns `Uint8Array` view of the data.
 */
export const to_bytes = (data: BufferSource | string): Uint8Array => {
	if (typeof data === 'string') return encoder.encode(data);
	if (data instanceof Uint8Array) return data;
	if (data instanceof ArrayBuffer) return new Uint8Array(data);
	return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
};
