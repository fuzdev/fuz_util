/**
 * Hash utilities using Web Crypto API and DJB2.
 *
 * - `hash_sha256` and `hash_sha512` are the standard digests for interop with
 *   tools and formats that name them, like a digest checked with `sha512sum`.
 * - `hash_sha1` and `hash_sha384` exist for interop and inspection only (SHA-1
 *   is broken for collision resistance); don't pick them for new formats.
 * - `hash_insecure` is a fast 32-bit DJB2 for cache keys and other
 *   non-security uses.
 *
 * The Web Crypto functions are async and return lowercase hex. BLAKE3, the
 * native content hash, is `hash_blake3` in `hash_blake3.ts`.
 *
 * @module
 */

import { to_hex } from './hex.ts';

const encoder = new TextEncoder();

/**
 * Computes a hash using Web Crypto API.
 *
 * @param algorithm - Web Crypto algorithm name (e.g. `'SHA-256'`)
 * @param data - String or binary data to hash. Strings are UTF-8 encoded.
 * @returns hexadecimal hash string
 */
const hash_webcrypto = async (algorithm: string, data: BufferSource | string): Promise<string> => {
	const buffer = typeof data === 'string' ? encoder.encode(data) : data;
	const digested = await crypto.subtle.digest(algorithm, buffer);
	return to_hex(new Uint8Array(digested));
};

/**
 * Computes a SHA-1 hash using Web Crypto API.
 *
 * SHA-1 is broken for collision resistance: use it only to match an existing
 * format or tool, never to authenticate content.
 *
 * @param data - String or binary data to hash. Strings are UTF-8 encoded.
 * @returns 40-character hexadecimal hash string
 */
export const hash_sha1 = (data: BufferSource | string): Promise<string> =>
	hash_webcrypto('SHA-1', data);

/**
 * Computes a SHA-256 hash using Web Crypto API.
 *
 * @param data - String or binary data to hash. Strings are UTF-8 encoded.
 * @returns 64-character hexadecimal hash string
 */
export const hash_sha256 = (data: BufferSource | string): Promise<string> =>
	hash_webcrypto('SHA-256', data);

/**
 * Computes a SHA-384 hash using Web Crypto API.
 *
 * @param data - String or binary data to hash. Strings are UTF-8 encoded.
 * @returns 96-character hexadecimal hash string
 */
export const hash_sha384 = (data: BufferSource | string): Promise<string> =>
	hash_webcrypto('SHA-384', data);

/**
 * Computes a SHA-512 hash using Web Crypto API.
 *
 * @param data - String or binary data to hash. Strings are UTF-8 encoded.
 * @returns 128-character hexadecimal hash string
 */
export const hash_sha512 = (data: BufferSource | string): Promise<string> =>
	hash_webcrypto('SHA-512', data);

/**
 * Computes a fast non-cryptographic 32-bit hash using DJB2
 * (`hash * 33 + c`, seeded with 5381, wrapped to 32 bits each step).
 *
 * Use for cache keys and change detection, not security or identity: 32 bits
 * is not collision-resistant (a collision becomes likely around tens of
 * thousands of distinct inputs), and the output is not a stable format to
 * persist beyond a cache that can be rebuilt.
 *
 * Strings hash their UTF-16 code units, buffers their raw bytes, so for
 * non-ASCII `hash_insecure(str) !== hash_insecure(encoder.encode(str))`.
 *
 * @param data - string or binary data to hash
 * @returns 8-character hex-encoded unsigned 32-bit hash
 */
export const hash_insecure = (data: BufferSource | string): string => {
	let hash = 5381;
	if (typeof data === 'string') {
		for (let i = 0; i < data.length; i++) {
			hash = ((hash << 5) + hash + data.charCodeAt(i)) | 0;
		}
	} else {
		const bytes: Uint8Array =
			data instanceof Uint8Array
				? data
				: data instanceof ArrayBuffer
					? new Uint8Array(data)
					: new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
		for (const byte of bytes) {
			hash = ((hash << 5) + hash + byte) | 0;
		}
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
};
