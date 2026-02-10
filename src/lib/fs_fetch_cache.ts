/**
 * Convenience wrapper combining `cache_store` with `FetchValueCache` serialization.
 *
 * Replaces fuz_gitops's `fs_fetch_value_cache.ts` with a version built on `cache_store` primitives.
 *
 * @module
 */

import {join} from 'node:path';

import type {Logger} from './log.js';
import type {FsOperations} from './fs_operations.js';
import {type CacheStore, create_cache_store} from './cache_store.js';
import {serialize_cache, deserialize_cache, type FetchValueCache} from './fetch.js';

/**
 * A cache store wrapping `FetchValueCache`.
 * The `data` field is a `Map` that can be passed directly to `fetch_value`'s `cache` option.
 */
export type FsFetchCache = CacheStore<FetchValueCache>;

export interface CreateFsFetchCacheOptions {
	/** Cache name (used as filename without `.json` extension). */
	name: string;
	/** Directory to store cache file. */
	dir: string;
	/** Filesystem operations. Uses `default_fs_operations` if not provided. */
	fs_ops?: FsOperations;
	/**
	 * Optional formatter for the serialized JSON before writing.
	 * Useful for Prettier formatting via `format_file`.
	 */
	format?: (content: string, filepath: string) => string | Promise<string>;
	/** Optional logger. */
	log?: Logger;
}

/**
 * Creates a filesystem-backed cache for `fetch_value` API responses.
 *
 * @example
 * ```ts
 * const cache = await create_fs_fetch_cache({
 *   name: 'repos',
 *   dir: '.gro/build/fetch',
 * });
 * // Use cache.data (a FetchValueCache Map) with fetch_value
 * await fetch_value(url, {cache: cache.data});
 * // Persist only if changed
 * await cache.save();
 * ```
 */
export const create_fs_fetch_cache = async (
	options: CreateFsFetchCacheOptions,
): Promise<FsFetchCache> => {
	const {name, dir, fs_ops, format, log} = options;
	const path = join(dir, name + '.json');

	return create_cache_store<FetchValueCache>({
		path,
		validate: (data) => {
			// FetchValueCache is a Map — deserialized via deserialize_cache
			if (data instanceof Map) return data as FetchValueCache;
			return null;
		},
		fresh_data: () => new Map(),
		serialize: async (data) => {
			const serialized = serialize_cache(data);
			if (format) {
				return format(serialized, path);
			}
			return serialized;
		},
		deserialize: (raw) => deserialize_cache(raw),
		fs_ops,
		log,
	});
};
