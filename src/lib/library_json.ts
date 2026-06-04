/**
 * Library metadata combining package.json with analyzed source.
 *
 * @module
 */

import type {ModuleJsonInput} from 'svelte-docinfo/types.js';

import {ensure_end, strip_end, strip_start} from './string.js';
import type {PackageJson} from './package_json.js';
import type {Url} from './url.js';

/**
 * A library's analyzed source: package identity plus the module metadata
 * produced by `svelte-docinfo`.
 *
 * `modules` uses `svelte-docinfo`'s wire shape (`ModuleJsonInput`), the same
 * shape its Vite plugin's `virtual:svelte-docinfo` and CLI emit. `svelte-docinfo`
 * is an optional peer dependency — install it to type this field, otherwise the
 * reference degrades to `any`.
 */
export interface SourceJson {
	name: string;
	version: string;
	modules?: Array<ModuleJsonInput>;
}

/**
 * A library's package.json and source metadata with computed properties.
 */
export interface LibraryJson {
	/** Package name, e.g. `@fuzdev/fuz_ui`. */
	name: string;
	/** Name without scope, e.g. `fuz`. */
	repo_name: string;
	/** GitHub repo URL, e.g. `https://github.com/fuzdev/fuz_ui`. */
	repo_url: Url;
	/** GitHub user/org, e.g. `ryanatkn`. */
	owner_name: string | null;
	homepage_url: Url | null;
	/** Logo URL, falls back to `favicon.png`. */
	logo_url: Url | null;
	logo_alt: string;
	npm_url: Url | null;
	changelog_url: Url | null;
	/** True if has exports and version is not `0.0.1`. */
	published: boolean;
	/**
	 * The package.json. Client docs feed the curated `virtual:pkg.json` (a
	 * `PkgJson` subset) here; tooling like fuz_gitops feeds the full file and
	 * reads `dependencies`/`devDependencies`, so the type stays `PackageJson`.
	 */
	pkg_json: PackageJson;
	source_json: SourceJson;
}

/**
 * Creates a `LibraryJson` with computed properties from package.json and source metadata.
 */
export const library_json_parse = (pkg_json: PackageJson, source_json: SourceJson): LibraryJson => {
	const {name} = pkg_json;

	// TODO hacky
	const parse_repo = (r: string | null | undefined) => {
		if (!r) return null;
		return strip_end(strip_start(strip_end(r, '.git'), 'git+'), '/');
	};

	const repo_url = parse_repo(
		pkg_json.repository
			? typeof pkg_json.repository === 'string'
				? pkg_json.repository
				: pkg_json.repository.url
			: null,
	);
	if (!repo_url) {
		throw Error('failed to parse library_json - `repo_url` is required in package_json');
	}

	const homepage_url = pkg_json.homepage ?? null;

	const published = !pkg_json.private && !!pkg_json.exports && pkg_json.version !== '0.0.1';

	// TODO generic registries
	const npm_url = published ? 'https://www.npmjs.com/package/' + pkg_json.name : null;

	const changelog_url = published && repo_url ? repo_url + '/blob/main/CHANGELOG.md' : null;

	const repo_name = library_repo_name_parse(name);

	const owner_name = repo_url ? strip_start(repo_url, 'https://github.com/').split('/')[0]! : null;

	const logo_url = homepage_url
		? ensure_end(homepage_url, '/') +
			(pkg_json.logo ? strip_start(pkg_json.logo, '/') : 'favicon.png')
		: null;

	const logo_alt = pkg_json.logo_alt ?? `logo for ${repo_name}`;

	return {
		name,
		repo_name,
		repo_url,
		owner_name,
		homepage_url,
		logo_url,
		logo_alt,
		npm_url,
		changelog_url,
		published,
		pkg_json,
		source_json,
	};
};

/**
 * Builds a `LibraryJson` from a `package.json` and analyzed `modules`,
 * deriving the `SourceJson` wrapper from the package's own `name`/`version`.
 *
 * Convenience over `library_json_parse` for the common case where `modules`
 * come from `svelte-docinfo` (e.g. its `virtual:svelte-docinfo` Vite module or
 * `analyzeFromFiles`).
 */
export const library_json_from_modules = (
	pkg_json: PackageJson,
	modules: SourceJson['modules'],
): LibraryJson => {
	if (pkg_json.version === undefined) {
		throw Error(
			`failed to build library_json - package.json for "${pkg_json.name}" has no version`,
		);
	}
	return library_json_parse(pkg_json, {
		name: pkg_json.name,
		version: pkg_json.version,
		modules,
	});
};

/**
 * Extracts repo name from a package name, e.g. `@fuzdev/fuz_ui` → `fuz`.
 */
export const library_repo_name_parse = (name: string): string => {
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
 * Extracts GitHub org URL from a library, e.g. `https://github.com/ryanatkn`.
 */
export const library_org_url_parse = (library: LibraryJson): string | null => {
	const {repo_name, repo_url} = library;
	if (!repo_url) return null;
	const suffix = '/' + repo_name;
	if (repo_url.endsWith(suffix)) {
		return strip_end(repo_url, suffix);
	}
	return null;
};
