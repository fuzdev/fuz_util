/**
 * Pluggable filesystem operations interface for dependency injection.
 *
 * Follows the operations pattern from fuz_gitops:
 * - All operations accept a single options object parameter
 * - All fallible operations return `Result`
 * - Never throw `Error` in operations — return `Result` with `ok: false`
 * - Use `null` for expected "not found" cases
 *
 * This module contains only the interface and types — no Node.js imports.
 * See `fs_operations_node.ts` for the default Node.js implementation.
 *
 * @module
 */

import type {Result} from './result.js';

/**
 * Subset of filesystem stat results.
 * Avoids coupling to Node's full `Stats` object.
 */
export interface FsStatResult {
	size: number;
	mtime_ms: number;
	ctime_ms: number;
	mode: number;
	is_file: boolean;
	is_directory: boolean;
}

/**
 * Directory entry with file type information.
 */
export interface FsDirent {
	name: string;
	is_file: boolean;
	is_directory: boolean;
}

/**
 * Pluggable filesystem operations interface.
 *
 * See `fs_operations_node.ts` for the default implementation using `node:fs/promises`.
 * Provide a custom implementation for testing or alternative runtimes (e.g., Deno).
 */
export interface FsOperations {
	/** Reads a file as text. @returns the file content, or error if read fails. */
	read_file: (options: {
		path: string;
		encoding?: BufferEncoding;
	}) => Promise<Result<{value: string}, {message: string}>>;

	/** Reads a file as a binary buffer. @returns the file bytes, or error if read fails. */
	read_file_buffer: (options: {
		path: string;
	}) => Promise<Result<{value: Uint8Array}, {message: string}>>;

	/** Writes content to a file. @returns success, or error if write fails. */
	write_file: (options: {
		path: string;
		content: string | Uint8Array;
	}) => Promise<Result<object, {message: string}>>;

	/** Gets filesystem stats. @returns stat metadata, or error if stat fails. */
	stat: (options: {path: string}) => Promise<Result<{value: FsStatResult}, {message: string}>>;

	/** Checks if a path exists. Prefer `stat` or direct operations to avoid TOCTOU races. */
	exists: (options: {path: string}) => Promise<boolean>;

	/** Lists directory entries. @returns array of entries with type info, or error if readdir fails. */
	readdir: (options: {
		path: string;
	}) => Promise<Result<{value: Array<FsDirent>}, {message: string}>>;

	/** Creates a directory. @returns success, or error if mkdir fails. */
	mkdir: (options: {
		path: string;
		recursive?: boolean;
	}) => Promise<Result<object, {message: string}>>;

	/** Removes a file or directory. @returns success, or error if rm fails. */
	rm: (options: {
		path: string;
		recursive?: boolean;
		force?: boolean;
	}) => Promise<Result<object, {message: string}>>;
}
