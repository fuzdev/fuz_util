/**
 * Schema-validated persistent cache with dirty tracking and corruption recovery.
 *
 * Extracted from shared patterns in gro's build cache and fuz_gitops's fs_fetch_value_cache.
 *
 * Features:
 * - Schema validation at load time (any validation function, not coupled to Zod)
 * - Optional version checking
 * - Corruption recovery (delete invalid file, start fresh)
 * - Dirty tracking (only writes if data changed)
 * - Pluggable storage via `FsOperations`
 *
 * @module
 */

import {dirname} from 'node:path';

import type {Result} from './result.js';
import type {Logger} from './log.js';
import type {FsOperations} from './fs_operations.js';
import {default_fs_operations} from './fs_operations_node.js';

/**
 * A loaded cache store with data and save capability.
 */
export interface CacheStore<TData> {
	/** The cached data. Mutate directly; dirty tracking happens at save time. */
	data: TData;
	/**
	 * Persists data to disk if changed since load.
	 * @returns `Result` with `value: true` if data was written, `value: false` if unchanged.
	 */
	save: () => Promise<Result<{value: boolean}, {message: string}>>;
	/** The file path where this cache is stored. */
	path: string;
}

/**
 * Options for creating a cache store.
 */
export interface CreateCacheStoreOptions<TData> {
	/** Absolute path to the cache JSON file. */
	path: string;
	/**
	 * Validation function for loaded data.
	 * Called with the parsed and deserialized data.
	 * Return the validated data, or `null` to indicate validation failure
	 * (which triggers cache invalidation — file is deleted and `fresh_data()` is used).
	 */
	validate: (data: unknown) => TData | null;
	/** Factory function to create fresh/empty data when cache is missing or invalid. */
	fresh_data: () => TData;
	/**
	 * Optional expected version string.
	 * If provided, the deserialized data must have a `version` property matching this value.
	 * Mismatched versions are treated as stale cache.
	 */
	version?: string;
	/**
	 * Serializer for the data. Defaults to `JSON.stringify(data, null, '\t')`.
	 * Override for custom serialization (e.g., Map-based data, Prettier formatting).
	 *
	 * Must produce identical output for identical data — dirty tracking
	 * uses string equality on the serialized result.
	 */
	serialize?: (data: TData) => string | Promise<string>;
	/**
	 * Deserializer for raw file contents. Defaults to `JSON.parse`.
	 * Override for custom deserialization (e.g., reviving Maps from arrays).
	 */
	deserialize?: (raw: string) => unknown;
	/** Filesystem operations. Uses `default_fs_operations` if not provided. */
	fs_ops?: FsOperations;
	/** Optional logger for warnings about corruption recovery. */
	log?: Logger;
}

/**
 * Creates a file-backed cache store with automatic schema validation,
 * version checking, corruption recovery, and dirty tracking.
 *
 * @returns A `CacheStore` with the loaded (or fresh) data and a `save()` method.
 */
export const create_cache_store = async <TData>(
	options: CreateCacheStoreOptions<TData>,
): Promise<CacheStore<TData>> => {
	const {
		path,
		validate,
		fresh_data,
		version,
		serialize = default_serialize,
		deserialize = JSON.parse,
		fs_ops = default_fs_operations,
		log,
	} = options;

	let data: TData;
	let initial_serialized: string | null = null;

	// Try to load existing cache
	const read_result = await fs_ops.read_file({path});
	if (read_result.ok) {
		const raw = read_result.value;
		try {
			const parsed = deserialize(raw);

			// Version check (if configured)
			if (
				version !== undefined &&
				(parsed == null ||
					typeof parsed !== 'object' ||
					!('version' in parsed) ||
					(parsed as {version: unknown}).version !== version)
			) {
				log?.warn(`Cache version mismatch at ${path}, starting fresh`);
				await cleanup_invalid(path, fs_ops);
				data = fresh_data();
			} else {
				// Validate
				const validated = validate(parsed);
				if (validated !== null) {
					data = validated;
					initial_serialized = raw;
				} else {
					log?.warn(`Cache validation failed at ${path}, starting fresh`);
					await cleanup_invalid(path, fs_ops);
					data = fresh_data();
				}
			}
		} catch {
			// Corrupted file (JSON parse error, etc.)
			log?.warn(`Corrupted cache at ${path}, starting fresh`);
			await cleanup_invalid(path, fs_ops);
			data = fresh_data();
		}
	} else {
		// File doesn't exist or can't be read
		data = fresh_data();
	}

	return {
		data,
		path,
		save: async () => {
			try {
				const serialized = await serialize(data);

				// Dirty check: skip write if unchanged
				if (serialized === initial_serialized) {
					return {ok: true, value: false};
				}

				// Ensure parent directory exists
				const dir = dirname(path);
				const mkdir_result = await fs_ops.mkdir({path: dir, recursive: true});
				if (!mkdir_result.ok) {
					return {ok: false, message: mkdir_result.message};
				}

				const write_result = await fs_ops.write_file({path, content: serialized});
				if (!write_result.ok) {
					return {ok: false, message: write_result.message};
				}

				// Update snapshot so subsequent saves detect further changes
				initial_serialized = serialized;
				return {ok: true, value: true};
			} catch (error) {
				return {
					ok: false,
					message: `Failed to save cache at ${path}: ${error instanceof Error ? error.message : String(error)}`,
				};
			}
		},
	};
};

const default_serialize = (data: unknown): string => JSON.stringify(data, null, '\t');

/**
 * Silently removes an invalid cache file.
 */
const cleanup_invalid = async (path: string, fs_ops: FsOperations): Promise<void> => {
	await fs_ops.rm({path, force: true});
};
