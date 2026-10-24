/**
 * Fact hash producers.
 *
 * A `FactHash` is a `blake3:`-prefixed hex64 blake3 digest. The prefix makes
 * the hash self-identifying — any text scanner can find it without prior
 * knowledge of the source.
 *
 * The vocabulary — `FactHash`, `FACT_HASH_PREFIX`, `FACT_HASH_EXACT`,
 * `is_fact_hash` — lives in `hash_schemas.ts`, which imports no WASM. This
 * module holds the functions that actually hash, so importing it costs the
 * `@fuzdev/blake3-wasm` binary. Client code validating a hash it received
 * should import from `hash_schemas.ts` instead.
 *
 * Runtime validation happens at construction (`fact_hash_bytes` /
 * `fact_hash_stream` cast at the source; `is_fact_hash` and
 * schemas typed `FactHash` validate inputs from external boundaries).
 *
 * The hash-producing helpers carry the `fact_hash_` prefix so they namespace
 * cleanly alongside the branded `FactHash` type and the `FACT_HASH_*`
 * constants, and stay distinct from the raw-hex `hash_blake3` (`hash_blake3.ts`)
 * and `hash_sha256` (`hash.ts`), which return bare digests; these return the
 * branded, `blake3:`-prefixed wire form.
 *
 * There is no ref extraction here: a fact's refs are whatever its writer
 * declares via `FactPutOptions.refs`, never scanned out of its bytes.
 *
 * @module
 */

import { hash_stream } from '@fuzdev/blake3-wasm';

import { hash_blake3 } from './hash_blake3.ts';
import { FACT_HASH_PREFIX, type FactHash } from './hash_schemas.ts';
import { to_hex } from './hex.ts';

/**
 * Synchronously hash bytes into a fact hash.
 *
 * Delegates to `hash_blake3` (the fuz_util wrapper around `@fuzdev/blake3-wasm`)
 * and prefixes the result with `blake3:`. Strings are UTF-8 encoded.
 */
export const fact_hash_bytes = (data: Uint8Array | string): FactHash =>
	(FACT_HASH_PREFIX + hash_blake3(data)) as FactHash;

/**
 * Hash a `ReadableStream<Uint8Array>` into a fact hash without buffering
 * the full content.
 */
export const fact_hash_stream = async (stream: ReadableStream<Uint8Array>): Promise<FactHash> =>
	(FACT_HASH_PREFIX + to_hex(await hash_stream(stream))) as FactHash;

/**
 * Verify that `bytes` produce the claimed `hash`.
 *
 * Returns `false` on any mismatch, including a malformed hash. Callers
 * doing security-sensitive integrity checks should treat `false` as
 * not-found / corrupt and refuse to use the bytes.
 */
export const fact_hash_verify = (hash_value: FactHash, bytes: Uint8Array): boolean =>
	fact_hash_bytes(bytes) === hash_value;
