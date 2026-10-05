/**
 * `FactStore` interface.
 *
 * Backend-agnostic content-addressed byte store. Implementations vary by
 * context (filesystem, PG, federated composition later) but all share this
 * interface so callers don't care which. The interface lives in fuz_util
 * (zero backend deps) so build tools can use it; backend implementations
 * live downstream.
 *
 * Idempotent writes, verifiable reads, embedded vs external storage
 * abstracted — see the per-method contracts below.
 *
 * @module
 */

import type { FactHash } from './hash_schemas.ts';

/**
 * Optional metadata + ref declarations on a `put` / `put_stream` call.
 *
 * `content_type` is advisory and not part of the hash. Omitting it
 * (`undefined`) reads back from `get_meta` as `null` — `undefined` means
 * "caller didn't specify," `null` means "no type stored." `refs` lets
 * callers declare references for binary content where text scanning isn't
 * sound; for JSON content, implementations may auto-extract refs from the
 * bytes when no explicit `refs` is supplied.
 */
export interface FactPutOptions {
	content_type?: string;
	refs?: Array<FactHash>;
}

/**
 * Outcome of a streaming `put_stream` — the finalized digests + byte count.
 *
 * `hash` is the `blake3:`-prefixed fact hash (content address); `sha256` is the
 * bare-hex SHA-256 computed in the same pass, so a consumer can persist it
 * alongside the fact and let clients verify downloads with the ubiquitous
 * `sha256sum` (there is no universal shell BLAKE3 tool); `size` is the streamed
 * byte count. Mirrors the Rust `PutStreamOutcome`.
 */
export interface PutStreamOutcome {
	hash: FactHash;
	sha256: string;
	size: number;
}

/**
 * Per-fact metadata returned by `FactStore.get_meta`.
 *
 * `external` is `true` when the bytes are stored outside the row rather
 * than embedded — callers may use this to decide whether to stream vs load
 * fully. The storage location is intentionally *not* exposed here: reads go
 * through `get`, which verifies hash↔bytes, so handing out a location would
 * bypass the verifiable-reads contract. It surfaces only from `delete`.
 */
export interface FactMeta {
	content_type: string | null;
	size: number;
	created_at: Date;
	external: boolean;
}

/**
 * Backend-agnostic content-addressed byte store.
 *
 * - **Idempotent writes.** `put(x)` and `put(x)` again — same hash, no
 *   error, no duplication. Content type and refs from the first write win.
 * - **Verifiable reads.** Implementations should verify hash↔bytes on
 *   reads from external storage; embedded reads can skip verify because
 *   the storage is the hash table.
 * - **Backend-agnostic.** Composes — a frontline store can check local,
 *   then remote, then peer (deferred).
 */
export interface FactStore {
	/**
	 * Store bytes, return their hash. Idempotent — storing the same bytes
	 * twice is a no-op that returns the same hash.
	 */
	put: (bytes: Uint8Array, options?: FactPutOptions) => Promise<FactHash>;

	/**
	 * Stream bytes into the store with bounded memory, returning the finalized
	 * digests + size. Hashes BLAKE3 (content address) **and** SHA-256 in a single
	 * pass over the stream, buffers in memory only up to the embedded threshold,
	 * then spills to the disk CAS — so a multi-GB upload never buffers in RAM.
	 *
	 * Enforces `max_bytes` mid-stream: a body whose running byte count passes the
	 * cap throws `PayloadTooLargeError` (the backstop for a chunked or
	 * mis-declared `Content-Length`). A disk-full (`ENOSPC`) mid-stream throws
	 * `StorageFullError`. Idempotent like `put` — identical bytes land on the same
	 * content-addressed path and the underlying insert is `ON CONFLICT DO NOTHING`.
	 *
	 * The streaming twin of `put`; mirrors the Rust `FactStore::put_stream`.
	 */
	put_stream: (
		stream: ReadableStream<Uint8Array>,
		max_bytes: number,
		options?: FactPutOptions
	) => Promise<PutStreamOutcome>;

	/**
	 * Retrieve bytes by hash. Returns `null` when not found OR when externally
	 * stored bytes could not be read or failed integrity verification — all
	 * are treated as unavailable from the caller's perspective.
	 */
	get: (hash: FactHash) => Promise<Uint8Array | null>;

	/** Existence check. Cheaper than `get` when bytes aren't needed. */
	has: (hash: FactHash) => Promise<boolean>;

	/** Metadata about a stored fact. Returns `null` when not found. */
	get_meta: (hash: FactHash) => Promise<FactMeta | null>;

	/**
	 * Declared references for a fact (target hashes only). Returns `[]` for an
	 * absent hash as well as a present-but-ref-less fact — absence-as-no-refs
	 * is what a graph walker wants (a missing fact has no outgoing edges to
	 * follow), and callers needing presence should use `has` / `get_meta`.
	 */
	get_refs: (hash: FactHash) => Promise<Array<FactHash>>;

	/**
	 * Drop a fact. Idempotent — deleting an absent hash returns `null`.
	 * Returns the deleted fact's `size` and `external_url` so callers can
	 * tally freed bytes and remove the externally stored bytes; the store
	 * does not remove them itself. `external_url` is whatever the row held —
	 * validate its shape before using it to address anything.
	 *
	 * Implementations do NOT verify the hash is unreferenced — that
	 * policy lives one layer up (orphan-fact admin, GC walker).
	 */
	delete: (hash: FactHash) => Promise<{ size: number; external_url: string | null } | null>;
}
