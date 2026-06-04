/**
 * The curated, publish-safe subset of `package.json`.
 *
 * `PkgJson` is the shape served by the `virtual:pkg.json` Vite module (see
 * fuz_ui's `vite_plugin_fuz_pkg`) and fed to `LibraryJson.pkg_json`. It
 * exists to keep the rest of `package.json` — `scripts`, `dependencies`,
 * `devDependencies`, `engines`, `files`, internal config — out of client
 * bundles and rendered output. The plugin strips to `pkg_json_keys` at build
 * time; `PkgJson` is `Pick`ed from the same list, so the runtime strip and the
 * type can't drift, and the type is strict (accessing a stripped field like
 * `pkg_json.scripts` is a compile error).
 *
 * @module
 */

import type {PackageJson} from './package_json.js';

/**
 * The keys kept when stripping `package.json` down to a `PkgJson` — package
 * identity plus the Fuz extension fields (`tagline`, `glyph`, `logo`,
 * `logo_alt`). `exports` and `private` are kept because `library_json_parse`
 * derives `published` from them; everything omitted stays out of the client.
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
