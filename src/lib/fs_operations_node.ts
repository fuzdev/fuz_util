/**
 * Default Node.js implementation of `FsOperations` using `node:fs/promises`.
 *
 * Separated from the interface module (`fs_operations.ts`) so that
 * non-Node runtimes (e.g., Deno) can import the interface without pulling in `node:fs`.
 *
 * @module
 */

import {readFile, writeFile, stat, readdir, mkdir, rm, access, constants} from 'node:fs/promises';

import type {FsOperations} from './fs_operations.js';

/**
 * Default filesystem operations implementation using `node:fs/promises`.
 */
export const default_fs_operations: FsOperations = {
	read_file: async (options) => {
		try {
			const value = await readFile(options.path, options.encoding ?? 'utf8');
			return {ok: true, value};
		} catch (error) {
			return {
				ok: false,
				message: `Failed to read file ${options.path}: ${to_error_message(error)}`,
			};
		}
	},

	read_file_buffer: async (options) => {
		try {
			const buf = await readFile(options.path);
			const value = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
			return {ok: true, value};
		} catch (error) {
			return {
				ok: false,
				message: `Failed to read file buffer ${options.path}: ${to_error_message(error)}`,
			};
		}
	},

	write_file: async (options) => {
		try {
			await writeFile(options.path, options.content);
			return {ok: true};
		} catch (error) {
			return {
				ok: false,
				message: `Failed to write file ${options.path}: ${to_error_message(error)}`,
			};
		}
	},

	stat: async (options) => {
		try {
			const stats = await stat(options.path);
			return {
				ok: true,
				value: {
					size: stats.size,
					mtime_ms: stats.mtimeMs,
					ctime_ms: stats.ctimeMs,
					mode: stats.mode,
					is_file: stats.isFile(),
					is_directory: stats.isDirectory(),
				},
			};
		} catch (error) {
			return {ok: false, message: `Failed to stat ${options.path}: ${to_error_message(error)}`};
		}
	},

	exists: async (options) => {
		try {
			await access(options.path, constants.F_OK);
			return true;
		} catch {
			return false;
		}
	},

	readdir: async (options) => {
		try {
			const entries = await readdir(options.path, {withFileTypes: true});
			return {
				ok: true,
				value: entries.map((entry) => ({
					name: entry.name,
					is_file: entry.isFile(),
					is_directory: entry.isDirectory(),
				})),
			};
		} catch (error) {
			return {
				ok: false,
				message: `Failed to readdir ${options.path}: ${to_error_message(error)}`,
			};
		}
	},

	mkdir: async (options) => {
		try {
			await mkdir(options.path, {recursive: options.recursive ?? false});
			return {ok: true};
		} catch (error) {
			return {ok: false, message: `Failed to mkdir ${options.path}: ${to_error_message(error)}`};
		}
	},

	rm: async (options) => {
		try {
			await rm(options.path, {
				recursive: options.recursive ?? false,
				force: options.force ?? false,
			});
			return {ok: true};
		} catch (error) {
			return {ok: false, message: `Failed to rm ${options.path}: ${to_error_message(error)}`};
		}
	},
};

const to_error_message = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);
