# fuz_util

> TypeScript utility library - foundational utilities with no UI dependencies

fuz_util (`@fuzdev/fuz_util`) provides core TypeScript utilities used across the
`@fuzdev` ecosystem. It has no UI framework dependencies (no Svelte) and
focuses on pure TypeScript helpers.

For coding conventions, see Skill(fuz-stack).

## Gro commands

```bash
gro check     # typecheck, test, lint, format check (run before committing)
gro typecheck # typecheck only (faster iteration)
gro test      # run tests with vitest
gro gen       # regenerate .gen files
gro build     # build the package for production
```

IMPORTANT for AI agents: Do NOT run `gro dev` - the developer will manage the
dev server.

## Scope

fuz_util is a **foundational utility library**:

- Pure TypeScript utilities (string, array, object, async, etc.)
- Zod schemas for common data structures (`PackageJson`)
- Svelte preprocessor helpers (type-only Svelte dependency, no runtime dep)
- No UI components
- Used by gro (build tools) and fuz (UI/stack)

## Key modules

### Data utilities

- `array.ts` - array manipulation helpers
- `object.ts` - object utilities
- `string.ts` - string manipulation
- `json.ts` - JSON helpers
- `map.ts` - Map utilities
- `iterator.ts` - iterator helpers
- `hash.ts` - hashing (`hash_secure` with Web Crypto SHA-256, `hash_insecure` with
  DJB2 for non-security uses)

### Async and timing

- `async.ts` - async utilities (wait, concurrent operations, Deferred pattern)
- `time.ts` - high-resolution timing, measurement, and formatting
- `throttle.ts` - throttle/debounce with configurable edge behavior
- `timings.ts` - performance timing

Key exports: `map_concurrent`, `each_concurrent` (concurrency-limited async),
`create_deferred` (Deferred pattern), `throttle` with `when` option
('leading' | 'trailing' | 'both').

### Benchmarking

Benchmarking library with nanosecond precision timing, comprehensive statistics
(mean, median, percentiles, outlier detection, confidence intervals), and
multiple output formats (`table()`, `markdown()`, `summary()`, `json()`).

**Workflow:**

```bash
npm run benchmark              # Run and compare against baseline
npm run benchmark:save         # Save new baseline (after intentional changes)
npm run benchmark_slugify      # Run individual benchmark
npm run benchmark_deep_equal   # Run individual benchmark
```

Baseline stored in `src/benchmarks/baseline.json` (committed to repo).

See `docs/benchmark.md` for full documentation.

### Types and validation

- `types.ts` - TypeScript utility types (Flavored, Branded, union helpers)
- `package_json.ts` - `PackageJson` Zod schema with gro extensions (glyph,
  logo, motto, etc.)
- `source_json.ts` - `SourceJson`, `ModuleJson`, `DeclarationJson` Zod schemas
  for `.well-known/src.json` metadata
- `library_json.ts` - `LibraryJson` combining package.json + source metadata
- `result.ts` - Result type pattern
- `error.ts` - error utilities (`UnreachableError`, `unreachable` assertion)
- `args.ts` - CLI argument parsing with Zod validation

- `types.ts` - `Flavored` (loose nominal typing, no cast needed) and `Branded`
  (strict, requires cast) for type-safe IDs
- `result.ts` - `Result<T, E>` discriminated union with `unwrap()` helper
- `args.ts` - `args_parse()` for CLI arguments with Zod schemas, supports
  aliases, `--no-flag` negation, boolean coercion

### Schema introspection

- `zod.ts` - Zod schema introspection for CLI help generation (extracting
  descriptions, defaults, aliases, type strings, properties from Zod schemas)

### System utilities

- `process.ts` - process/spawn helpers with typed results
- `fetch.ts` - fetch utilities with caching, rate limit detection, ETag support
- `fs.ts` - file system utilities (`fs_exists`, `fs_empty_dir`, `fs_search`)
- `path.ts` - path utilities
- `git.ts` - git operations
- `log.ts` - hierarchical logging system

- `process.ts` - `spawn()` with typed results (`SpawnResultExited`,
  `SpawnResultSignaled`, `SpawnResultError`) and type guards
- `log.ts` - `Logger` class with hierarchical children, auto-detects level from
  `PUBLIC_LOG_LEVEL` env var

### Statistics

- `stats.ts` - statistical functions (mean, median, std_dev, percentiles, outlier
  detection)

### Svelte preprocessor utilities

- `svelte_preprocess_helpers.ts` - shared helpers for Svelte preprocessors (AST
  utilities, import management, string escaping). Uses `import type` from
  `svelte/compiler` for types only — no runtime Svelte dependency. Used by
  `svelte_preprocess_mdz` (fuz_ui) and `svelte_preprocess_fuz_code` (fuz_code).

### Other

- `random.ts`, `random_alea.ts` - random number generation
- `colors.ts` - color utilities
- `maths.ts` - math helpers
- `id.ts` - ID generation
- `counter.ts` - counter utilities
- `dom.ts` - DOM utilities (isomorphic)
- `deep_equal.ts` - deep equality with security features (constructor comparison,
  prototype pollution protection)
- `function.ts` - function utilities (`noop`, `identity`, Thunk pattern)
- `regexp.ts` - regex helpers
- `url.ts` - URL utilities
- `print.ts` - formatted output with colors

- `function.ts` - `Thunk<T>` type and `unthunk()` for lazy evaluation

## Code style

- `snake_case` for most identifiers (files, variables, functions) instead of
  camelCase
- `PascalCase` for types, classes, and Svelte components
- explicit file extensions in imports
- tab indentation, 100 character width
- no re-exports - import directly from the source module (e.g., import baseline
  functions from `benchmark_baseline.js`, not from `benchmark.js`)
- no backwards compatibility preservation - breaking changes are acceptable

## Configuration

**Logger level:** Set `PUBLIC_LOG_LEVEL` environment variable to control logging:

```bash
PUBLIC_LOG_LEVEL=debug gro dev
```

Levels: `off`, `error`, `warn`, `info`, `debug`. Defaults to `info` in
production, `debug` in development.

**Timer auto-detection:** `timer_default` from `time.ts` automatically selects:

- `timer_node` (nanosecond precision via `process.hrtime.bigint()`) in Node.js
- `timer_browser` (millisecond precision via `performance.now()`) in browsers

Note: Browser timing is coarsened due to Spectre/Meltdown mitigations.

## What fuz_util does NOT include

- UI components (use fuz_ui)
- Svelte-specific UI code (use fuz_ui; preprocessor helpers are here)
- Build tooling (use gro)
- CSS utilities (use fuz_css)
- UI helper functions for source_json (use fuz_ui's helpers)

## Project standards

- TypeScript strict mode
- Prettier with tabs, 100 char width
- Node >= 22.15
- Tests in `src/test/` (not co-located)
- No runtime Svelte dependency (`svelte_preprocess_helpers.ts` uses type-only imports)

## Related projects

- [`fuz_css`](../fuz_css/CLAUDE.md) - CSS framework (depends on fuz_util)
- [`fuz_ui`](../fuz_ui/CLAUDE.md) - UI components (depends on fuz_util)
- [`gro`](../gro/CLAUDE.md) - build system (depends on fuz_util)
