/**
 * Hash vocabulary — the `FactHash` type, patterns, and guards, with no hashing.
 *
 * This module is deliberately WASM-free. `hash_blake3.ts` and `fact_hash.ts`
 * import `@fuzdev/blake3-wasm` and kick off its initialization at module
 * scope, so importing either one to reach a validator drags the WASM binary
 * into the bundle and fetches it at page load. Client code that only needs to
 * *validate* a hash — action specs, wire schemas, cell payload shapes —
 * imports from here and pays nothing.
 *
 * This module is Zod-free; schemas validating a fact hash build on
 * `FACT_HASH_EXACT`.
 *
 * The hashing functions live next door: `hash_blake3` in `hash_blake3.ts`,
 * the `fact_hash_*` producers in `fact_hash.ts`.
 *
 * @module
 */

import type { Branded } from '@fuzdev/fuz_schema/schema.ts';

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

/**
 * Stricter anchored variant for full-string validation. Schemas that validate
 * a fact hash build on this exact pattern, e.g. `z.string().regex(FACT_HASH_EXACT)`.
 */
export const FACT_HASH_EXACT = /^blake3:[0-9a-f]{64}$/;

/**
 * A `blake3:`-prefixed fact hash. Branded so the type system distinguishes a
 * fact hash from any other `string`. Construct only via `fact_hash_bytes` /
 * `fact_hash_stream`, a schema whose output is typed `FactHash`, or the
 * `is_fact_hash` guard — direct string literals don't satisfy the brand.
 */
export type FactHash = Branded<string, 'FactHash'>;

/**
 * Type guard. Useful when receiving a hash from an external boundary —
 * narrows `string` to `FactHash` without going through a schema.
 */
export const is_fact_hash = (s: string): s is FactHash => FACT_HASH_EXACT.test(s);
