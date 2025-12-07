/**
 * Library metadata combining package.json with analyzed source.
 */

import {ensure_end, strip_end, strip_start} from './string.js';
import type {PackageJson} from './package_json.js';
import type {SourceJson} from './source_json.js';
import type {Url} from './url.js';

/**
 * A library's package.json and source metadata with computed properties.
 */
export interface LibraryJson {
	package_json: PackageJson;
	source_json: SourceJson;
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
}

/**
 * Creates a `LibraryJson` with computed properties from package.json and source metadata.
 */
export const library_json_parse = (
	package_json: PackageJson,
	source_json: SourceJson,
): LibraryJson => {
	const {name} = package_json;

	// TODO hacky
	const parse_repo = (r: string | null | undefined) => {
		if (!r) return null;
		return strip_end(strip_start(strip_end(r, '.git'), 'git+'), '/');
	};

	const repo_url = parse_repo(
		package_json.repository
			? typeof package_json.repository === 'string'
				? package_json.repository
				: package_json.repository.url
			: null,
	);
	if (!repo_url) {
		throw Error('failed to parse library_json - `repo_url` is required in package_json');
	}

	const homepage_url = package_json.homepage ?? null;

	const published =
		!package_json.private && !!package_json.exports && package_json.version !== '0.0.1';

	// TODO generic registries
	const npm_url = published ? 'https://www.npmjs.com/package/' + package_json.name : null;

	const changelog_url = published && repo_url ? repo_url + '/blob/main/CHANGELOG.md' : null;

	const repo_name = library_repo_name_parse(name);

	const owner_name = repo_url ? strip_start(repo_url, 'https://github.com/').split('/')[0]! : null;

	const logo_url = homepage_url
		? ensure_end(homepage_url, '/') +
			(package_json.logo ? strip_start(package_json.logo, '/') : 'favicon.png')
		: null;

	const logo_alt = package_json.logo_alt ?? `logo for ${repo_name}`;

	return {
		package_json,
		source_json,
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
	};
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
