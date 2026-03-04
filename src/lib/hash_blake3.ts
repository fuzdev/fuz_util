/**
 * BLAKE3 cryptographic hashing via `@fuzdev/blake3_wasm`.
 *
 * Synchronous and fast. Returns hex-encoded 256-bit (32-byte) digests.
 *
 * @module
 */

import {hash} from '@fuzdev/blake3_wasm';

import {to_hex} from './hex.js';
import {to_bytes} from './bytes.js';

/**
 * Computes a BLAKE3 hash synchronously.
 *
 * @param data - String or binary data to hash. Strings are UTF-8 encoded.
 * @returns 64-character hexadecimal hash string (32 bytes).
 */
export const hash_blake3 = (data: BufferSource | string): string => to_hex(hash(to_bytes(data)));
