---
'@fuzdev/fuz_util': minor
---

feat: add `PkgJson`, the curated publish-safe subset of `PackageJson`, plus `pkg_json_keys`

**Breaking:** rename `LibraryJson.package_json` to `pkg_json`. The field type is unchanged (`PackageJson`); update reads from `library_json.package_json` to `library_json.pkg_json`.
