/**
 * Hash utilities using Web Crypto API and DJB2.
 *
 * Provides `hash_sha256`, `hash_sha384`, `hash_sha512`, `hash_sha1` (Web Crypto, async)
 * and `hash_insecure` (DJB2, fast non-cryptographic).
 * For BLAKE3, see `hash_blake3` in `hash_blake3.ts`.
 *
 * @module
 */

import {to_hex} from './hex.js';

const encoder = new TextEncoder();

/**
 * Computes a hash using Web Crypto API.
 *
 * @param algorithm - Web Crypto algorithm name (e.g. `'SHA-256'`).
 * @param data - String or binary data to hash. Strings are UTF-8 encoded.
 * @returns hexadecimal hash string.
 */
const hash_webcrypto = async (algorithm: string, data: BufferSource | string): Promise<string> => {
	const buffer = typeof data === 'string' ? encoder.encode(data) : data;
	const digested = await crypto.subtle.digest(algorithm, buffer);
	return to_hex(new Uint8Array(digested));
};

/**
 * Computes a SHA-1 hash using Web Crypto API.
 *
 * @param data - String or binary data to hash. Strings are UTF-8 encoded.
 * @returns 40-character hexadecimal hash string.
 */
export const hash_sha1 = (data: BufferSource | string): Promise<string> =>
	hash_webcrypto('SHA-1', data);

/**
 * Computes a SHA-256 hash using Web Crypto API.
 *
 * @param data - String or binary data to hash. Strings are UTF-8 encoded.
 * @returns 64-character hexadecimal hash string.
 */
export const hash_sha256 = (data: BufferSource | string): Promise<string> =>
	hash_webcrypto('SHA-256', data);

/**
 * Computes a SHA-384 hash using Web Crypto API.
 *
 * @param data - String or binary data to hash. Strings are UTF-8 encoded.
 * @returns 96-character hexadecimal hash string.
 */
export const hash_sha384 = (data: BufferSource | string): Promise<string> =>
	hash_webcrypto('SHA-384', data);

/**
 * Computes a SHA-512 hash using Web Crypto API.
 *
 * @param data - String or binary data to hash. Strings are UTF-8 encoded.
 * @returns 128-character hexadecimal hash string.
 */
export const hash_sha512 = (data: BufferSource | string): Promise<string> =>
	hash_webcrypto('SHA-512', data);

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
