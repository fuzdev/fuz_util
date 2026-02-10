/**
 * Directory fingerprinting and validation utilities.
 *
 * Extracted from gro's `collect_build_outputs` and `validate_build_cache`.
 * Scans directory trees, collects per-file metadata with configurable fields,
 * and validates snapshots against the current filesystem state.
 *
 * @module
 */

import {join} from 'node:path';

import type {Logger} from './log.js';
import {hash_secure} from './hash.js';
import {map_concurrent} from './async.js';
import type {FsOperations} from './fs_operations.js';
import {default_fs_operations} from './fs_operations_node.js';

/**
 * Metadata about a single file in a snapshot.
 * All fields except `path` are optional based on the `FileSnapshotFields` configuration.
 */
export interface FileSnapshotEntry {
	/** Relative path from the snapshot root directory. */
	path: string;
	/** SHA-256 hash of file contents. Present if `hash` field is enabled. */
	hash?: string;
	/** File size in bytes. Present if `size` field is enabled. */
	size?: number;
	/** Modification time in milliseconds since epoch. Present if `mtime` field is enabled. */
	mtime?: number;
	/** Change time in milliseconds since epoch. Present if `ctime` field is enabled. */
	ctime?: number;
	/** Unix file permission mode. Present if `mode` field is enabled. */
	mode?: number;
}

/**
 * Controls which metadata fields are collected per file.
 * All default to `false`. The `path` field is always included.
 */
export interface FileSnapshotFields {
	/** Compute SHA-256 content hash. Expensive for large files. */
	hash?: boolean;
	/** Include file size. */
	size?: boolean;
	/** Include modification time. */
	mtime?: boolean;
	/** Include change time. */
	ctime?: boolean;
	/** Include file mode/permissions. */
	mode?: boolean;
}

export interface CollectFileSnapshotOptions {
	/** Directories to scan. */
	dirs: Array<string>;
	/** Which metadata fields to include per file. */
	fields: FileSnapshotFields;
	/** Filesystem operations. Uses `default_fs_operations` if not provided. */
	fs_ops?: FsOperations;
	/** Maximum concurrent file operations. Defaults to 20. */
	concurrency?: number;
	/** Optional filter: return `false` to exclude a file path. */
	filter?: (path: string) => boolean;
	/** Optional logger for warnings. */
	log?: Logger;
}

interface FileToProcess {
	full_path: string;
	relative_path: string;
}

/**
 * Recursively scans directories and collects per-file metadata.
 *
 * @returns Array of snapshot entries sorted by path.
 */
export const collect_file_snapshot = async (
	options: CollectFileSnapshotOptions,
): Promise<Array<FileSnapshotEntry>> => {
	const {dirs, fields, fs_ops = default_fs_operations, concurrency = 20, filter, log} = options;

	const needs_stat = fields.size || fields.mtime || fields.ctime || fields.mode;

	// Collect all files to process
	const files: Array<FileToProcess> = [];

	const collect_recursive = async (
		dir: string,
		relative_base: string,
		dir_prefix: string,
	): Promise<void> => {
		const result = await fs_ops.readdir({path: dir});
		if (!result.ok) {
			log?.warn(`Failed to read directory ${dir}: ${result.message}`);
			return;
		}

		for (const entry of result.value) {
			const full_path = join(dir, entry.name);
			const relative_path = relative_base ? join(relative_base, entry.name) : entry.name;
			const cache_key = join(dir_prefix, relative_path);

			if (entry.is_directory) {
				await collect_recursive(full_path, relative_path, dir_prefix); // eslint-disable-line no-await-in-loop
			} else if (entry.is_file) {
				if (!filter || filter(cache_key)) {
					files.push({full_path, relative_path: cache_key});
				}
			}
			// Symlinks and other types are intentionally ignored
		}
	};

	// Collect files from all directories sequentially
	for (const dir of dirs) {
		if (!(await fs_ops.exists({path: dir}))) continue; // eslint-disable-line no-await-in-loop
		await collect_recursive(dir, '', dir); // eslint-disable-line no-await-in-loop
	}

	// Process files with controlled concurrency
	const entries = await map_concurrent(
		files,
		async ({full_path, relative_path}): Promise<FileSnapshotEntry> => {
			const entry: FileSnapshotEntry = {path: relative_path};

			// Stat if any stat-based fields are needed
			if (needs_stat) {
				const stat_result = await fs_ops.stat({path: full_path});
				if (stat_result.ok) {
					if (fields.size) entry.size = stat_result.value.size;
					if (fields.mtime) entry.mtime = stat_result.value.mtime_ms;
					if (fields.ctime) entry.ctime = stat_result.value.ctime_ms;
					if (fields.mode) entry.mode = stat_result.value.mode;
				}
			}

			// Hash if requested
			if (fields.hash) {
				const read_result = await fs_ops.read_file_buffer({path: full_path});
				if (read_result.ok) {
					entry.hash = await hash_secure(read_result.value as BufferSource);
				}
			}

			return entry;
		},
		concurrency,
	);

	return entries.sort((a, b) => a.path.localeCompare(b.path));
};

export interface ValidateFileSnapshotOptions {
	/** Snapshot entries to validate. */
	entries: Array<FileSnapshotEntry>;
	/** Base directory to prepend to entry paths. Defaults to `''` (paths used as-is). */
	base_dir?: string;
	/** Filesystem operations. Uses `default_fs_operations` if not provided. */
	fs_ops?: FsOperations;
	/** Maximum concurrent file operations. Defaults to 20. */
	concurrency?: number;
	/** Optional logger for debug information. */
	log?: Logger;
}

/**
 * Validates a snapshot against the current filesystem state.
 *
 * Uses a two-pass strategy for efficiency:
 * 1. Fast negative check: verify files exist and sizes match (sequential, early exit)
 * 2. Content verification: hash files and compare (concurrent)
 *
 * @returns `true` if all entries match current filesystem state.
 */
export const validate_file_snapshot = async (
	options: ValidateFileSnapshotOptions,
): Promise<boolean> => {
	const {entries, base_dir = '', fs_ops = default_fs_operations, concurrency = 20} = options;

	// Pass 1: Fast negative checks (sequential with early exit)
	for (const entry of entries) {
		const path = join(base_dir, entry.path);

		if (!(await fs_ops.exists({path}))) return false; // eslint-disable-line no-await-in-loop

		// Size check (fast negative — avoids expensive hash)
		if (entry.size !== undefined) {
			const stat_result = await fs_ops.stat({path}); // eslint-disable-line no-await-in-loop
			if (!stat_result.ok || stat_result.value.size !== entry.size) return false;
		}
	}

	// Pass 2: Content hash verification (concurrent)
	const entries_with_hash = entries.filter((e) => e.hash !== undefined);
	if (entries_with_hash.length === 0) return true;

	const results = await map_concurrent(
		entries_with_hash,
		async (entry) => {
			const path = join(base_dir, entry.path);
			try {
				const read_result = await fs_ops.read_file_buffer({path});
				if (!read_result.ok) return false;
				const actual_hash = await hash_secure(read_result.value as BufferSource);
				return actual_hash === entry.hash;
			} catch {
				return false;
			}
		},
		concurrency,
	);

	return results.every((valid) => valid);
};
