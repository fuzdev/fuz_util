import { rm, readdir, access, constants } from 'node:fs/promises';
import type { RmOptions } from 'node:fs';
import { join, isAbsolute } from 'node:path';

import { to_error_message } from './error.ts';
import { EMPTY_OBJECT } from './object.ts';
import { to_array } from './array.ts';
import { ensure_end } from './string.ts';
import type { FileFilter, ResolvedPath, PathFilter } from './path.ts';

/**
 * Discriminated filesystem error kinds.
 *
 * The shared error shape for `Result<{value: T}, FsError>`-returning filesystem
 * deps across the ecosystem. Callers branch on `kind` instead of regex-matching
 * `message`. The set is deliberately small — add kinds only when a caller
 * needs to distinguish them.
 */
export type FsError =
	| { kind: 'not_found'; message: string }
	| { kind: 'permission_denied'; message: string }
	| { kind: 'already_exists'; message: string }
	| { kind: 'io_error'; message: string };

/**
 * Extends `FsError` with `invalid_json` for `read_json`-style ops where the
 * file exists but parse fails. Callers can distinguish missing from corrupt
 * (e.g. self-healing config loads) without regex-matching `message`.
 */
export type FsJsonError = FsError | { kind: 'invalid_json'; message: string };

/**
 * Classifies a thrown filesystem error into a discriminated `FsError`.
 *
 * Reads the Node `code` property (`ENOENT`/`EACCES`/`EPERM`/`EEXIST`) — Deno
 * surfaces the same codes when throwing from `node:fs/promises`. Unknown codes
 * fall through to `io_error`.
 */
export const fs_classify_error = (error: unknown): FsError => {
	const message = to_error_message(error);
	if (error && typeof error === 'object' && 'code' in error) {
		switch ((error as { code: string }).code) {
			case 'ENOENT':
				return { kind: 'not_found', message };
			case 'EACCES':
			case 'EPERM':
				return { kind: 'permission_denied', message };
			case 'EEXIST':
				return { kind: 'already_exists', message };
		}
	}
	return { kind: 'io_error', message };
};

/**
 * Checks if a file or directory exists.
 */
export const fs_exists = async (path: string): Promise<boolean> => {
	try {
		await access(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
};

/**
 * Empties a directory, recursively by default. If `should_remove` is provided, only entries where it returns `true` are removed.
 */
export const fs_empty_dir = async (
	dir: string,
	should_remove?: (name: string) => boolean,
	options?: RmOptions
): Promise<void> => {
	const entries = await readdir(dir);
	const to_remove = should_remove ? entries.filter(should_remove) : entries;
	await Promise.all(to_remove.map((name) => rm(join(dir, name), { recursive: true, ...options })));
};

export interface FsSearchOptions {
	/**
	 * One or more filter functions, any of which can short-circuit the search by returning `false`.
	 */
	filter?: PathFilter | Array<PathFilter>;
	/**
	 * One or more file filter functions. Every filter must pass for a file to be included.
	 */
	file_filter?: FileFilter | Array<FileFilter>;
	/**
	 * Pass `null` or `false` to speed things up at the cost of volatile ordering.
	 */
	sort?: boolean | null | ((a: ResolvedPath, b: ResolvedPath) => number);
	/**
	 * Set to `true` to include directories. Defaults to `false`.
	 */
	include_directories?: boolean;
	/**
	 * Sets the cwd for `dir` unless it's an absolute path or `null`.
	 */
	cwd?: string | null;
}

export const fs_search = async (
	dir: string,
	options: FsSearchOptions = EMPTY_OBJECT
): Promise<Array<ResolvedPath>> => {
	const {
		filter,
		file_filter,
		sort = default_sort,
		include_directories = false,
		cwd = process.cwd()
	} = options;

	const final_dir = ensure_end(cwd && !isAbsolute(dir) ? join(cwd, dir) : dir, '/');

	const filters =
		!filter || (Array.isArray(filter) && !filter.length) ? undefined : to_array(filter);
	const file_filters =
		!file_filter || (Array.isArray(file_filter) && !file_filter.length)
			? undefined
			: to_array(file_filter);

	const paths: Array<ResolvedPath> = []; // mutated
	try {
		await crawl(final_dir, paths, filters, file_filters, include_directories, null);
	} catch (error) {
		if (error.code === 'ENOENT') return [];
		throw error;
	}

	return sort ? paths.sort(typeof sort === 'boolean' ? default_sort : sort) : paths;
};

const default_sort = (a: ResolvedPath, b: ResolvedPath): number => a.path.localeCompare(b.path);

/**
 * Recursively crawls a directory, collecting paths.
 * @mutates paths - appends discovered files and directories
 */
const crawl = async (
	dir: string,
	paths: Array<ResolvedPath>,
	filters: Array<PathFilter> | undefined,
	file_filters: Array<FileFilter> | undefined,
	include_directories: boolean,
	base_dir: string | null
): Promise<void> => {
	let subdirs: Array<Promise<void>> | undefined;
	const dirents = await readdir(dir, { withFileTypes: true });
	for (const dirent of dirents) {
		const { name, parentPath } = dirent;
		const is_directory = dirent.isDirectory();
		const id = parentPath + name;

		if (filters && !filters.every((f) => f(id, is_directory))) {
			continue;
		}

		const path = base_dir === null ? name : base_dir + '/' + name;

		if (is_directory) {
			const dir_id = id + '/';
			if (include_directories) {
				paths.push({ path, id: dir_id, is_directory: true });
			}
			(subdirs ??= []).push(crawl(dir_id, paths, filters, file_filters, include_directories, path));
		} else if (!file_filters || file_filters.every((f) => f(id))) {
			paths.push({ path, id, is_directory: false });
		}
	}
	if (subdirs) await Promise.all(subdirs);
};
