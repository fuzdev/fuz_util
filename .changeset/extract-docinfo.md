---
'@fuzdev/fuz_util': major
---

Extract source/declaration analysis schemas to `svelte-docinfo`

- Remove `source_json.ts` — `DeclarationKind`, `GenericParamInfo`, `ParameterInfo`, `ComponentPropInfo`, `DeclarationJson`, `ModuleJson`, `SourceJson` schemas and the `declaration_get_display_name` / `declaration_generate_import` helpers now live in `svelte-docinfo`.
- Move the `SourceJson` wrapper (`{name, version, modules}`) to `library_json.ts`, typing `modules` with `svelte-docinfo`'s `ModuleJsonInput`.
- Add `svelte-docinfo` as an optional peer dependency — without it, `modules` degrades to `any`.
- Add `library_json_from_modules(package_json, modules)` — derives the `SourceJson` wrapper from the package's own `name`/`version`.
- Migration: import declaration/module types from `svelte-docinfo/types.js`, and `SourceJson` from `@fuzdev/fuz_util/library_json.js`.
