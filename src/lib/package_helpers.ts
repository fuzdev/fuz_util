/**
 * Package and repository URL helpers.
 *
 * Generic utilities for building URLs and parsing package/repository metadata.
 * These functions have no framework dependencies and can be used at build-time or runtime.
 *
 * URL builders:
 * - `url_github_file` - GitHub file permalink
 * - `url_npm_package` - npm package page
 * - `url_logo` - library logo URL from homepage + `logo`
 *
 * Parsers:
 * - `repo_url_parse` - extract repo URL from `package.json` repository field
 * - `repo_name_parse` - extract repo name from scoped package name
 * - `repo_url_github_owner` - extract GitHub owner from repo URL
 *
 * Predicates:
 * - `package_is_published` - check if package is published to npm
 *
 * @module
 */

import {ensure_end, strip_end, strip_start} from './string.js';
import type {PackageJson} from './package_json.js';

/**
 * Build GitHub file URL for a repository.
 *
 * @param repo_url - repository URL (e.g., 'https://github.com/owner/repo')
 * @param file_path - path to the file (leading './' is stripped)
 * @param line - optional line number for deep linking
 * @returns full GitHub URL to the file on the main branch
 *
 * @example
 * ```ts
 * url_github_file('https://github.com/foo/bar', 'src/index.ts')
 * // => 'https://github.com/foo/bar/blob/main/src/index.ts'
 * ```
 *
 * @example
 * ```ts
 * url_github_file('https://github.com/foo/bar', './src/index.ts', 42)
 * // => 'https://github.com/foo/bar/blob/main/src/index.ts#L42'
 * ```
 */
export const url_github_file = (repo_url: string, file_path: string, line?: number): string => {
	const clean_path = file_path.replace(/^\.\//, '');
	const base = `${repo_url}/blob/main/${clean_path}`;
	return line ? `${base}#L${line}` : base;
};

/**
 * Extract GitHub owner/org name from repository URL.
 *
 * @param repo_url - repository URL (e.g., 'https://github.com/owner/repo')
 * @returns owner name, or null if not a valid GitHub URL
 *
 * @example
 * ```ts
 * repo_url_github_owner('https://github.com/fuzdev/fuz_ui')
 * // => 'fuzdev'
 * ```
 *
 * @example
 * ```ts
 * repo_url_github_owner('https://gitlab.com/foo/bar')
 * // => null (not a GitHub URL)
 * ```
 */
export const repo_url_github_owner = (repo_url: string): string | null => {
	const stripped = strip_start(repo_url, 'https://github.com/');
	if (stripped === repo_url) return null;
	const parts = stripped.split('/');
	return parts[0] || null;
};

/**
 * Build npm package URL.
 *
 * @param package_name - package name (can be scoped like '@org/package')
 * @returns full npm package page URL
 *
 * @example
 * ```ts
 * url_npm_package('@fuzdev/fuz_ui')
 * // => 'https://www.npmjs.com/package/@fuzdev/fuz_ui'
 * ```
 */
export const url_npm_package = (package_name: string): string =>
	'https://www.npmjs.com/package/' + package_name;

/**
 * Build a library's logo URL from its homepage and optional `logo` path.
 *
 * Resolves `logo` relative to `homepage_url`, falling back to `favicon.png` at
 * the homepage root. Returns `null` when there's no homepage.
 *
 * @param homepage_url - the library's homepage, or `null`
 * @param logo - the `logo` field from `package.json` (relative to the homepage)
 * @returns the resolved logo URL, or `null`
 *
 * @example
 * ```ts
 * url_logo('https://fuz.dev', 'logo.svg')
 * // => 'https://fuz.dev/logo.svg'
 * ```
 */
export const url_logo = (homepage_url: string | null, logo: string | undefined): string | null =>
	homepage_url
		? ensure_end(homepage_url, '/') + (logo ? strip_start(logo, '/') : 'favicon.png')
		: null;

/**
 * Check if a package is published to npm.
 *
 * A package is considered published if:
 * - It's not marked as private
 * - It has exports defined
 * - Its version is not the initial '0.0.1'
 *
 * @param package_json - the `package.json` object to check
 * @returns `true` if the package appears to be published
 */
export const package_is_published = (package_json: PackageJson): boolean => {
	return !package_json.private && !!package_json.exports && package_json.version !== '0.0.1';
};

/**
 * Extract repository name without scope from package name.
 *
 * @param name - package name (can be scoped like '@org/package')
 * @returns repository name without scope
 * @throws Error if scoped package name is malformed
 *
 * @example
 * ```ts
 * repo_name_parse('@fuzdev/fuz_ui')
 * // => 'fuz_ui'
 * ```
 *
 * @example
 * ```ts
 * repo_name_parse('lodash')
 * // => 'lodash'
 * ```
 */
export const repo_name_parse = (name: string): string => {
	if (name[0] === '@') {
		const parts = name.split('/');
		if (parts.length < 2) {
			throw new Error(`invalid scoped package name: "${name}" (expected format: @org/package)`);
		}
		return parts[1]!;
	}
	return name;
};

/**
 * Parse repository URL from `package.json` format.
 *
 * Handles both string format and object format with `url` property.
 * Strips common prefixes ('git+') and suffixes ('.git', '/').
 *
 * @param repository - the repository field from `package.json`
 * @returns clean repository URL, or null if not provided
 *
 * @example
 * ```ts
 * repo_url_parse('https://github.com/foo/bar')
 * // => 'https://github.com/foo/bar'
 * ```
 *
 * @example
 * ```ts
 * repo_url_parse({url: 'git+https://github.com/foo/bar.git'})
 * // => 'https://github.com/foo/bar'
 * ```
 *
 * @example
 * ```ts
 * repo_url_parse(undefined)
 * // => null
 * ```
 */
export const repo_url_parse = (repository: PackageJson['repository']): string | null => {
	if (!repository) return null;
	const url = typeof repository === 'string' ? repository : repository.url;
	if (!url) return null;
	// Strip the trailing slash first so a `.git/` suffix still has its `.git` removed.
	return strip_start(strip_end(strip_end(url, '/'), '.git'), 'git+');
};
