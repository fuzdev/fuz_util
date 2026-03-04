/**
 * Hex encoding helpers.
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
