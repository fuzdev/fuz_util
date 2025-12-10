# fuz_util

> TypeScript utility library - foundational utilities with no UI dependencies

fuz_util (`@fuzdev/fuz_util`) provides core TypeScript utilities used across the
`@ryanatkn` ecosystem. It has no UI framework dependencies (no Svelte) and
focuses on pure TypeScript helpers.

## Scope

fuz_util is a **foundational utility library**:

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
- `time.ts` - high-resolution timing, measurement, and formatting
- `throttle.ts` - throttle/debounce
- `timings.ts` - performance timing

### Benchmarking

Benchmarking library with nanosecond precision timing,
comprehensive statistics (mean, median, percentiles, outlier detection), and
multiple output formats (ASCII table, Markdown, JSON).

```typescript
import {Benchmark} from '@fuzdev/fuz_util/benchmark.js';

const bench = new Benchmark({duration_ms: 5000, warmup_iterations: 10});

bench
  .add('test 1', () => fn1())
  .add('test 2', () => fn2());

await bench.run();
console.log(bench.table());     // ASCII table with all percentiles
console.log(bench.markdown());  // Markdown table
console.log(bench.summary());   // Fastest/slowest comparison
```

**Workflow:**

```bash
npm run benchmark        # Run and compare against baseline
npm run benchmark:save   # Save new baseline (after intentional changes)
```

Baseline stored in `src/benchmarks/baseline.json` (committed to repo).

See `src/docs/benchmark.md` for full documentation.

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

### Statistics

- `stats.ts` - statistical functions (mean, median, std_dev, percentiles, outlier
  detection)

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
- no re-exports - import directly from the source module (e.g., import baseline
  functions from `benchmark_baseline.js`, not from `benchmark.js`)
- no backwards compatibility preservation - breaking changes are acceptable

## What fuz_util does NOT include

- UI components (use fuz)
- Svelte-specific code (use fuz)
- Build tooling (use gro)
- UI helper functions for src_json (use fuz's `src_json.ts` for
  `identifier_display_name_get`, `identifier_import_generate`)
