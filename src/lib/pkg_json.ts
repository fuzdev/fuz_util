/**
 * The curated, publish-safe subset of `package.json`.
 *
 * `PkgJson` is the shape served by the `virtual:pkg.json` Vite module (see
 * fuz_ui's `vite_plugin_pkg_json`) and fed to `LibraryJson.pkg_json`. It
 * exists to keep the rest of `package.json` — `scripts`, `dependencies`,
 * `devDependencies`, `engines`, `files`, internal config — out of client
 * bundles and rendered output. The plugin strips to `pkg_json_keys` at build
 * time; `PkgJson` is `Pick`ed from the same list, so the runtime strip and the
 * type can't drift, and the type is strict (accessing a stripped field like
 * `pkg_json.scripts` is a compile error).
 *
 * @module
 */

import type {PackageJson} from './package_json.ts';

/**
 * The keys kept when stripping `package.json` down to a `PkgJson` — package
 * identity plus the Fuz extension fields (`tagline`, `glyph`, `logo`,
 * `logo_alt`). `exports` and `private` are kept because a consumer derives a
 * library's `published` status from them; everything omitted stays out of the client.
 */
export const pkg_json_keys = [
	'name',
	'version',
	'private',
	'description',
	'tagline',
	'glyph',
	'logo',
	'logo_alt',
	'license',
	'homepage',
	'repository',
	'funding',
	'exports',
] as const satisfies ReadonlyArray<keyof PackageJson>;

export type PkgJsonKey = (typeof pkg_json_keys)[number];

/** Publish-safe subset of `PackageJson`. */
export type PkgJson = Pick<PackageJson, PkgJsonKey>;

/**
 * Picks the curated, publish-safe subset from a full `package.json`-shaped
 * object — the runtime counterpart of the `PkgJson` type, keyed off the same
 * `pkg_json_keys` so the strip and the type can't drift. Idempotent: an
 * already-curated `PkgJson` passes through unchanged.
 *
 * Use it at every boundary that feeds `package.json` into a `LibraryJson` so the
 * curation the type promises actually holds at runtime — otherwise the full
 * manifest rides along, typed as the subset (see fuz_ui's `vite_plugin_pkg_json`
 * for the parallel build-time strip).
 *
 * `keys` overrides the field set to keep — pass a wider list (typically
 * `` [...pkg_json_keys, 'keywords'] ``) to expose extra publish-safe fields.
 * The result is then a superset of `PkgJson`, so the extra fields stay
 * statically untyped; the same `keys` must reach `library_json_from_modules`
 * (and the consumer's `virtual:pkg.json` ambient type) for them to survive end
 * to end.
 */
export const pkg_json_from_package_json = (
	source: PackageJson,
	keys: ReadonlyArray<keyof PackageJson> = pkg_json_keys,
): PkgJson => {
	const result: Record<string, unknown> = {};
	for (const key of keys) {
		if (source[key] !== undefined) result[key] = source[key];
	}
	return result as PkgJson;
};
