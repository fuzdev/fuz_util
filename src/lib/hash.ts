/**
 * Hash utilities for content comparison and cache invalidation.
 *
 * Provides both secure (cryptographic) and insecure (fast) hash functions.
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
 * Computes a cryptographic hash using Web Crypto API.
 *
 * @param data - String or binary data to hash. Strings are UTF-8 encoded.
 * @param algorithm - Hash algorithm. Defaults to SHA-256.
 * @returns Hexadecimal hash string.
 */
export const hash_secure = async (
	data: BufferSource | string,
	algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512' = 'SHA-256',
): Promise<string> => {
	const buffer = typeof data === 'string' ? encoder.encode(data) : data;
	const digested = await crypto.subtle.digest(algorithm, buffer);
	const bytes = new Uint8Array(digested);
	const lookup = get_byte_to_hex();
	let hex = '';
	for (const byte of bytes) {
		hex += lookup[byte];
	}
	return hex;
};

/**
 * Computes a fast non-cryptographic hash using DJB2 algorithm.
 * Use for content comparison and cache keys, not security.
 *
 * Note: Strings use UTF-16 code units, buffers use raw bytes.
 * For non-ASCII, `hash_insecure(str) !== hash_insecure(encoder.encode(str))`.
 *
 * @param data - String or binary data to hash.
 * @returns 8-character hex-encoded unsigned 32-bit hash.
 */
export const hash_insecure = (data: BufferSource | string): string => {
	let hash = 5381; // DJB2 initial value, chosen empirically for good distribution
	if (typeof data === 'string') {
		for (let i = 0; i < data.length; i++) {
			hash = (hash << 5) - hash + data.charCodeAt(i);
		}
	} else {
		const bytes: Uint8Array =
			data instanceof Uint8Array
				? data
				: data instanceof ArrayBuffer
					? new Uint8Array(data)
					: new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
		for (const byte of bytes) {
			hash = (hash << 5) - hash + byte;
		}
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
};
