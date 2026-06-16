/**
 * BLAKE3 cryptographic hashing via `@fuzdev/blake3_wasm`.
 *
 * Synchronous and fast. Returns hex-encoded 256-bit (32-byte) digests.
 * WASM initialization starts eagerly on import. Await `blake3_ready` before first use
 * in browser contexts where the WASM must be fetched asynchronously.
 *
 * @module
 */

import {z} from 'zod';
import {hash, init} from '@fuzdev/blake3_wasm';

import {to_hex} from './hex.ts';
import {to_bytes} from './bytes.ts';

/**
 * Resolves when the BLAKE3 WASM module is initialized and ready.
 * Initialization starts eagerly on import. Idempotent — safe to await multiple times.
 * In Node.js/Deno (sync init), this resolves immediately.
 */
export const blake3_ready = init();

/**
 * Computes a BLAKE3 hash synchronously.
 *
 * @param data - String or binary data to hash. Strings are UTF-8 encoded.
 * @returns 64-character hexadecimal hash string (32 bytes)
 */
export const hash_blake3 = (data: Uint8Array | BufferSource | string): string =>
	to_hex(hash(to_bytes(data)));

/** Zod schema for a BLAKE3 hex hash — 64 lowercase hex characters (256-bit output). */
export const Blake3Hash = z
	.string()
	.regex(/^[0-9a-f]{64}$/, 'Expected a 64-character lowercase hex blake3 hash');
export type Blake3Hash = z.infer<typeof Blake3Hash>;
