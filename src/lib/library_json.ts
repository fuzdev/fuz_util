/**
 * Library metadata: the curated package identity paired with analyzed source.
 *
 * @module
 */

import type {ModuleJsonInput} from 'svelte-docinfo/types.js';

import {pkg_json_from_package_json, type PkgJson} from './pkg_json.js';
import type {PackageJson} from './package_json.js';

/**
 * A library's analyzed source: the module metadata produced by `svelte-docinfo`.
 *
 * `modules` uses `svelte-docinfo`'s wire shape (`ModuleJsonInput`), the same
 * shape its Vite plugin's `virtual:svelte-docinfo` and CLI emit. `svelte-docinfo`
 * is an optional peer dependency — install it to type this field, otherwise the
 * reference degrades to `any`.
 */
export interface SourceJson {
	modules?: Array<ModuleJsonInput>;
}

/**
 * A library, as two clean projections of its inputs: `pkg_json` (the curated,
 * publish-safe subset of `package.json`) and `source_json` (the `svelte-docinfo`
 * analysis). Both are raw data — every derived value (repo url, npm url,
 * `published`, the module/declaration hierarchy, …) is computed by the consumer
 * (fuz_ui's `Library` class), not stored here, so nothing can go stale.
 */
export interface LibraryJson {
	pkg_json: PkgJson;
	source_json: SourceJson;
}

/**
 * Builds a `LibraryJson` from a `package.json` and analyzed `modules`.
 *
 * Curates `package_json` to the publish-safe `PkgJson` subset via
 * `pkg_json_from_package_json`, so a full `package.json` (the common case from
 * gro's loader or a JSON import) is accepted and stripped, while an
 * already-curated `PkgJson` passes through unchanged.
 */
export const library_json_from_modules = (
	package_json: PackageJson,
	modules: SourceJson['modules'],
): LibraryJson => ({
	pkg_json: pkg_json_from_package_json(package_json),
	source_json: {modules},
});
