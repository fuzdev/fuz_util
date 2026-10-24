/**
 * Hash vocabulary — the `FactHash` type, its pattern, and its guard, with no hashing.
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
 * Anchored pattern for full-string validation: `blake3:` plus exactly 64
 * lowercase hex chars. Schemas that validate a fact hash build on it, e.g.
 * `z.string().regex(FACT_HASH_EXACT)`.
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
