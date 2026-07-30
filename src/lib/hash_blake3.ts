/**
 * BLAKE3 cryptographic hashing via `@fuzdev/blake3_wasm`.
 *
 * Synchronous and fast. Returns hex-encoded 256-bit (32-byte) digests.
 * WASM initialization starts eagerly on import. Await `blake3_ready` before first use
 * in browser contexts where the WASM must be fetched asynchronously.
 *
 * Importing this module costs the WASM binary. Code that only validates the
 * shape of a hash wants `Blake3Hash` from `hash_schemas.ts`, which is
 * WASM-free.
 *
 * @module
 */

import { hash, init } from '@fuzdev/blake3_wasm';

import { to_hex } from './hex.ts';
import { to_bytes } from './bytes.ts';

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
