/**
 * Fact hash utilities.
 *
 * A `FactHash` is a `blake3:`-prefixed hex64 blake3 digest. The prefix makes
 * the hash self-identifying — any text scanner can find it without prior
 * knowledge of the source.
 *
 * Branded via Zod (`FactHashSchema`), mirroring `Uuid`. Runtime validation
 * happens at construction (`fact_hash_bytes` / `fact_hash_stream` cast at
 * the source; `FactHashSchema.parse` / `is_fact_hash` validate inputs from
 * external boundaries).
 *
 * The hash-producing helpers carry the `fact_hash_` prefix so they namespace
 * cleanly alongside the branded `FactHash` type and the `FACT_HASH_*`
 * constants, and stay distinct from the raw-hex `hash_blake3` / `hash_sha256`
 * family in `hash.ts` (those return bare digests; these return the branded,
 * `blake3:`-prefixed wire form).
 *
 * @module
 */

import { hash_stream } from '@fuzdev/blake3_wasm';
import { z } from 'zod';

import { hash_blake3 } from './hash_blake3.ts';
import { to_hex } from './hex.ts';
import type { Json } from './json.ts';

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
 * Synchronously hash bytes into a fact hash.
 *
 * Delegates to `hash_blake3` (the fuz_util wrapper around `@fuzdev/blake3_wasm`)
 * and prefixes the result with `blake3:`. Strings are UTF-8 encoded.
 */
export const fact_hash_bytes = (data: Uint8Array | string): FactHash =>
	(FACT_HASH_PREFIX + hash_blake3(data)) as FactHash;

/**
 * Hash a `ReadableStream<Uint8Array>` into a fact hash without buffering
 * the full content. Used by `FactStore.put_ref` for large external content.
 */
export const fact_hash_stream = async (stream: ReadableStream<Uint8Array>): Promise<FactHash> =>
	(FACT_HASH_PREFIX + to_hex(await hash_stream(stream))) as FactHash;

/**
 * Type guard. Useful when receiving a hash from an external boundary —
 * narrows `string` to `FactHash` without going through Zod.
 */
export const is_fact_hash = (s: string): s is FactHash => FACT_HASH_EXACT.test(s);

/**
 * Verify that `bytes` produce the claimed `hash`.
 *
 * Returns `false` on any mismatch, including a malformed hash. Callers
 * doing security-sensitive integrity checks should treat `false` as
 * not-found / corrupt and refuse to use the bytes.
 */
export const fact_hash_verify = (hash_value: FactHash, bytes: Uint8Array): boolean =>
	fact_hash_bytes(bytes) === hash_value;

/**
 * Walk a JSON value collecting every `blake3:`-prefixed string match.
 *
 * Strings, object values, and array elements are scanned; object keys are
 * intentionally skipped (a hash as an object key is exotic enough that
 * callers should declare it explicitly via `FactStore.put({refs})`). The
 * same hash appearing twice is deduplicated. Order follows depth-first
 * traversal of the input.
 *
 * Used by application code on cell snapshot writes and JSON fact writes.
 */
export const fact_hash_extract_refs = (value: Json): Array<FactHash> => {
	const found = new Set<FactHash>();
	walk(value, found);
	return [...found];
};

const walk = (value: Json, found: Set<FactHash>): void => {
	if (typeof value === 'string') {
		const matches = value.match(FACT_HASH_PATTERN);
		if (matches) for (const m of matches) found.add(m as FactHash);
		return;
	}
	if (value === null || typeof value !== 'object') return;
	if (Array.isArray(value)) {
		for (const item of value) walk(item, found);
		return;
	}
	for (const v of Object.values(value)) walk(v, found);
};
