/**
 * Hash vocabulary — schemas, patterns, and guards, with no hashing.
 *
 * This module is deliberately WASM-free. `hash_blake3.ts` and `fact_hash.ts`
 * import `@fuzdev/blake3_wasm` and kick off its initialization at module
 * scope, so importing either one to reach a validator drags the WASM binary
 * into the bundle and fetches it at page load. Client code that only needs to
 * *validate* a hash — action specs, wire schemas, cell payload shapes —
 * imports from here and pays nothing.
 *
 * The hashing functions live next door: `hash_blake3` in `hash_blake3.ts`,
 * the `fact_hash_*` producers in `fact_hash.ts`.
 *
 * @module
 */

import { z } from 'zod';

/** Zod schema for a BLAKE3 hex hash — 64 lowercase hex characters (256-bit output). */
export const Blake3Hash = z
	.string()
	.regex(/^[0-9a-f]{64}$/, 'Expected a 64-character lowercase hex blake3 hash');
export type Blake3Hash = z.infer<typeof Blake3Hash>;

/** Algorithm prefix on every fact hash. The colon is the separator. */
export const FACT_HASH_PREFIX = 'blake3:';

/**
 * Pattern for detecting a fact hash anywhere in text.
 *
 * Has the global flag because the primary use is `String.matchAll` over
 * cell data / fact bytes. Callers that only need to validate a single
 * known string should use `is_fact_hash` instead — `RegExp.test` mutates
 * `lastIndex` on global patterns.
 *
 * The trailing `(?=blake3:|[^0-9a-f]|$)` lookahead enforces a right
 * boundary so a 64-hex digest is matched only when it actually *ends*:
 * followed by a non-hex char, the end of string, or the start of another
 * `blake3:` ref. This rejects malformed over-long runs (`blake3:` + 65+
 * hex) rather than silently truncating them to a different valid-shaped
 * hash, while still matching two refs concatenated with no separator
 * (the `blake3:` alternative is needed because the prefix itself begins
 * with the hex char `b`). A bare `(?![0-9a-f])` would instead drop the
 * first of two glued refs.
 */
export const FACT_HASH_PATTERN = /blake3:[0-9a-f]{64}(?=blake3:|[^0-9a-f]|$)/g;

/** Stricter anchored variant for full-string validation. */
const FACT_HASH_EXACT = /^blake3:[0-9a-f]{64}$/;

/**
 * Wire-form schema for a `blake3:`-prefixed fact hash. Branded so the
 * type system distinguishes a fact hash from any other `string`,
 * mirroring `Uuid` (`id.ts`). Construct only via `fact_hash_bytes` /
 * `fact_hash_stream` / `FactHashSchema.parse(s)` — direct string literals
 * don't satisfy the brand.
 *
 * Both client-side (cell payloads) and server-side (DB-row hashes)
 * consumers reuse this same schema.
 */
export const FactHashSchema = z.string().regex(FACT_HASH_EXACT).brand('FactHash');
export type FactHash = z.infer<typeof FactHashSchema>;

/**
 * Type guard. Useful when receiving a hash from an external boundary —
 * narrows `string` to `FactHash` without going through Zod.
 */
export const is_fact_hash = (s: string): s is FactHash => FACT_HASH_EXACT.test(s);
