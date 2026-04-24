/**
 * Optional hook invoked when an entry is evicted due to capacity overflow.
 * Not called on `delete()` or `clear()`.
 *
 * Called AFTER the new entry is inserted, so the map is already in its post-`set` state
 * when the callback runs. A throwing callback does not leave the map inconsistent —
 * the eviction and insertion are already committed.
 */
export type LruMapOnEvict<K, V> = (key: K, value: V) => void;

/**
 * Options for `LruMap`.
 */
export interface LruMapOptions<K, V> {
	/**
	 * Called with the evicted `(key, value)` when a `set()` exceeds `capacity`.
	 * Fires after the new entry is inserted. Not called on `delete()` or `clear()`.
	 */
	on_evict?: LruMapOnEvict<K, V>;
}

/**
 * Bounded LRU (least-recently-used) map with a hard `capacity`.
 *
 * Behaves like `Map` for `get`/`set`/`has`/`delete`/`size`/iteration, with these differences:
 *
 * - Inserting a new key when `size === capacity` evicts the least-recently-used entry.
 * - `get(key)` marks the entry as most-recently-used.
 * - `set(key, value)` marks the entry as most-recently-used (including when overwriting).
 * - `has(key)` does NOT mark as used (matches `Map` parity).
 * - `peek(key)` reads without marking as used.
 *
 * Iteration order is LRU → MRU, matching `Map`'s insertion-order guarantee where "insertion"
 * is redefined as "last use".
 *
 * Implementation uses a single backing `Map` and relies on its insertion-order iteration —
 * on use, the entry is deleted and re-inserted to move it to the MRU end.
 *
 * Iterators (`keys()`, `values()`, `entries()`, `[Symbol.iterator]`) are live views over the
 * backing `Map`, not snapshots. Per the ECMAScript `Map` iteration spec, calling `get(key)` or
 * `set(existing_key, …)` during iteration moves that entry to the MRU end and causes it to be
 * re-visited later in the same iteration. If you need a stable view while mutating, copy first
 * (e.g. `[...lru.entries()]`).
 *
 * @example
 * ```ts
 * const cache = new LruMap<string, Buffer>(100, {
 *   on_evict: (key, value) => value.release(),
 * });
 * cache.set('a.png', buf_a);
 * cache.set('b.png', buf_b);
 * cache.get('a.png'); // refreshes 'a.png' as most-recently-used
 * ```
 */
export class LruMap<K, V> {
	readonly capacity: number;

	readonly #map: Map<K, V> = new Map();
	readonly #on_evict: LruMapOnEvict<K, V> | undefined;

	/**
	 * @param capacity - maximum number of entries; must be a positive integer
	 * @param options - optional `on_evict` hook
	 * @throws Error if `capacity` is not a positive integer
	 */
	constructor(capacity: number, options?: LruMapOptions<K, V>) {
		if (!(capacity >= 1) || !Number.isInteger(capacity)) {
			throw new Error(`LruMap capacity must be a positive integer, got ${capacity}`);
		}
		this.capacity = capacity;
		this.#on_evict = options?.on_evict;
	}

	get size(): number {
		return this.#map.size;
	}

	/**
	 * Returns the value for `key` and marks it as most-recently-used.
	 */
	get(key: K): V | undefined {
		const map = this.#map;
		const value = map.get(key);
		// distinguish a stored `undefined` from a missing key; skips the extra `has` on the hot path
		if (value === undefined && !map.has(key)) return undefined;
		map.delete(key);
		map.set(key, value as V);
		return value;
	}

	/**
	 * Returns the value for `key` without affecting eviction order.
	 */
	peek(key: K): V | undefined {
		return this.#map.get(key);
	}

	/**
	 * Returns `true` if `key` is present. Does NOT mark as used (matches `Map`).
	 */
	has(key: K): boolean {
		return this.#map.has(key);
	}

	/**
	 * Sets `value` for `key` and marks it as most-recently-used.
	 * Evicts the least-recently-used entry when inserting a new key at capacity.
	 * The `on_evict` hook (if any) fires AFTER the new entry is inserted.
	 */
	set(key: K, value: V): this {
		const map = this.#map;
		if (map.delete(key)) {
			map.set(key, value);
			return this;
		}
		if (map.size >= this.capacity) {
			const on_evict = this.#on_evict;
			if (on_evict !== undefined) {
				const entry = map.entries().next().value!;
				map.delete(entry[0]);
				map.set(key, value);
				on_evict(entry[0], entry[1]);
				return this;
			}
			const lru_key = map.keys().next().value as K;
			map.delete(lru_key);
		}
		map.set(key, value);
		return this;
	}

	delete(key: K): boolean {
		return this.#map.delete(key);
	}

	clear(): void {
		this.#map.clear();
	}

	[Symbol.iterator](): IterableIterator<[K, V]> {
		return this.#map[Symbol.iterator]();
	}

	keys(): IterableIterator<K> {
		return this.#map.keys();
	}

	values(): IterableIterator<V> {
		return this.#map.values();
	}

	entries(): IterableIterator<[K, V]> {
		return this.#map.entries();
	}
}
