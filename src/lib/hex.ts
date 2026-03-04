/**
 * Hex encoding and decoding helpers.
 *
 * @module
 */

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
 * Decodes a hex string to a `Uint8Array`.
 * Whitespace is stripped before parsing. Returns `null` for invalid hex.
 *
 * @param hex - Hex string to decode (case-insensitive, whitespace allowed).
 * @returns Decoded bytes, or `null` if the input is not valid hex.
 */
export const from_hex = (hex: string): Uint8Array | null => {
	const clean = hex.replace(/\s/g, '');
	if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) return null;
	const bytes = new Uint8Array(clean.length / 2);
	for (let i = 0; i < clean.length; i += 2) {
		bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
	}
	return bytes;
};

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
