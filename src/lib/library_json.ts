/**
 * Library metadata: the curated package identity paired with analyzed source.
 *
 * @module
 */

import type {ModuleJsonInput} from 'svelte-docinfo/types.js';

import {pkg_json_from_package_json, pkg_json_keys, type PkgJson} from './pkg_json.ts';
import type {PackageJson} from './package_json.ts';

/**
 * A library's analyzed source: the module metadata produced by `svelte-docinfo`.
 *
 * `modules` is typed as `svelte-docinfo`'s wire shape (`ModuleJsonInput`), the
 * input side where defaulted arrays and booleans may be absent. Its Vite plugin
 * (`virtual:svelte-docinfo`) and CLI emit exactly this compacted shape; gro's
 * loader instead hands back the parsed output-side superset (defaults
 * materialized), which is structurally assignable and can be re-compacted to the
 * wire shape with `compactReplacer`. Either way consumers must treat defaulted
 * fields as optional. `svelte-docinfo` is an optional peer dependency — install
 * it to type this field, otherwise the reference degrades to `any`.
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
 *
 * `keys` overrides the curated field set, and must match the `keys` passed to
 * the build-time strip (fuz_ui's `vite_plugin_pkg_json`): the re-strip here
 * drops any field not in `keys`, so a wider build-time list with the default
 * here would silently discard the extras. Pass the same shared list to both.
 */
export const library_json_from_modules = (
	package_json: PackageJson,
	modules: SourceJson['modules'],
	keys: ReadonlyArray<keyof PackageJson> = pkg_json_keys,
): LibraryJson => ({
	pkg_json: pkg_json_from_package_json(package_json, keys),
	source_json: {modules},
});
