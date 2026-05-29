---
'@fuzdev/fuz_util': major
---

Remove `source_json.ts` — the `DeclarationKind`, `GenericParamInfo`,
`ParameterInfo`, `ComponentPropInfo`, `DeclarationJson`, `ModuleJson`, and
`SourceJson` schemas plus the deprecated `declaration_get_display_name` and
`declaration_generate_import` helpers are now owned by `svelte-docinfo`.

`SourceJson` (the `{name, version, modules}` wrapper used by `LibraryJson`)
moves to `library_json.ts` and types `modules` with `svelte-docinfo`'s
`ModuleJsonInput`. Add `svelte-docinfo` as an optional peer dependency; without
it installed the `modules` type degrades to `any`.

Adds `library_json_from_modules(package_json, modules)` to `library_json.ts` — a
convenience over `library_json_parse` that derives the `SourceJson` wrapper from
the package's own `name`/`version`, for the common case where `modules` come from
`svelte-docinfo` (its `virtual:svelte-docinfo` Vite module or `analyzeFromFiles`).

Migration: import declaration/module types from `svelte-docinfo/types.js`, and
import `SourceJson` from `@fuzdev/fuz_util/library_json.js` instead of
`@fuzdev/fuz_util/source_json.js`.
