# Belt

> TypeScript utility library - foundational utilities with no UI dependencies

Belt (`@fuzdev/fuz_util`) provides core TypeScript utilities used across the
`@ryanatkn` ecosystem. It has no UI framework dependencies (no Svelte) and
focuses on pure TypeScript helpers.

## Scope

Belt is a **foundational utility library**:

- Pure TypeScript utilities (string, array, object, async, etc.)
- Zod schemas for common data structures (`PackageJson`)
- No UI components, no Svelte dependency
- Used by gro (build tools) and fuz (UI/stack)

## Key modules

### Data utilities

- `array.ts` - array manipulation helpers
- `object.ts` - object utilities
- `string.ts` - string manipulation
- `json.ts` - JSON helpers
- `map.ts` - Map utilities
- `iterator.ts` - iterator helpers

### Async and timing

- `async.ts` - async utilities (wait, etc.)
- `throttle.ts` - throttle/debounce
- `timings.ts` - performance timing

### Types and validation

- `package_json.ts` - `PackageJson` Zod schema with gro extensions (glyph,
  logo, motto, etc.)
- `src_json.ts` - `SrcJson`, `ModuleJson`, `IdentifierJson` Zod schemas for
  `.well-known/src.json` metadata (shared by gro for generation and fuz for UI)
- `pkg_json.ts` - `PkgJson` enriched package representation combining
  `PackageJson` and `SrcJson`
- `result.ts` - Result type pattern
- `error.ts` - error utilities

### System utilities

- `process.ts` - process/spawn helpers
- `fetch.ts` - fetch utilities with caching
- `path.ts` - path utilities
- `git.ts` - git operations
- `log.ts` - logging system

### Other

- `random.ts`, `random_alea.ts` - random number generation
- `colors.ts` - color utilities
- `maths.ts` - math helpers
- `id.ts` - ID generation
- `counter.ts` - counter utilities
- `dom.ts` - DOM utilities (isomorphic)
- `deep_equal.ts` - deep equality comparison
- `function.ts` - function utilities
- `regexp.ts` - regex helpers

## Code style

- `snake_case` for most identifiers (files, variables, functions, types) instead
  of camelCase
- `PascalCase` for types, class names, and Svelte components
- explicit file extensions in imports
- tab indentation, 100 character width

## What belt does NOT include

- UI components (use fuz)
- Svelte-specific code (use fuz)
- Build tooling (use gro)
- UI helper functions for src_json (use fuz's `src_json.ts` for
  `identifier_display_name_get`, `identifier_import_generate`)
