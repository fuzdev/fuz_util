# fuz_util

> TypeScript utility library - foundational utilities with no UI dependencies

fuz_util (`@fuzdev/fuz_util`) provides core TypeScript utilities used across the
`@fuzdev` ecosystem. It has no UI framework dependencies (no Svelte) and
focuses on pure TypeScript helpers.

For coding conventions, see [`fuz-stack`](../fuz-stack/CLAUDE.md).

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
- `hash.ts` - hashing (`hash_secure` with Web Crypto SHA-256, `hash_insecure` with
  DJB2 for non-security uses)

### Async and timing

- `async.ts` - async utilities (wait, concurrent operations, Deferred pattern)
- `time.ts` - high-resolution timing, measurement, and formatting
- `throttle.ts` - throttle/debounce with configurable edge behavior
- `timings.ts` - performance timing

**Concurrent operations:**

```typescript
import {map_concurrent, each_concurrent} from '@fuzdev/fuz_util/async.js';

// Process with concurrency limit, preserving order
const results = await map_concurrent(urls, fetch_data, 5);

// Side effects only (no results collected)
await each_concurrent(items, process_item, 10);
```

**Deferred pattern:**

```typescript
import {create_deferred} from '@fuzdev/fuz_util/async.js';

const deferred = create_deferred<string>();
// Later: deferred.resolve('value') or deferred.reject(error)
await deferred.promise;
```

**Throttle with edge options:**

```typescript
import {throttle} from '@fuzdev/fuz_util/throttle.js';

const throttled = throttle(save, {
	delay: 1000,
	when: 'trailing', // 'leading' | 'trailing' | 'both'
});
```

### Benchmarking

Benchmarking library with nanosecond precision timing,
comprehensive statistics (mean, median, percentiles, outlier detection), and
multiple output formats (ASCII table, Markdown, JSON).

```typescript
import {Benchmark} from '@fuzdev/fuz_util/benchmark.js';

const bench = new Benchmark({
	duration_ms: 5000,
	warmup_iterations: 10,
	cooldown_ms: 100,
	min_iterations: 10,
	max_iterations: 100_000,
	include_percentiles: [50, 75, 90, 95, 99],
});

bench.add('test 1', () => fn1()).add('test 2', () => fn2());

await bench.run();
console.log(bench.table()); // ASCII table with all percentiles
console.log(bench.markdown()); // Markdown table
console.log(bench.summary()); // Fastest/slowest comparison
console.log(bench.json()); // JSON export
```

**Statistics computed:**

- Mean, median, standard deviation
- Percentiles (p50, p75, p90, p95, p99)
- Min/max, outlier detection (MAD)
- Coefficient of variation, confidence intervals (95%)
- Ops/sec calculation

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

**Flavored and Branded types:**

```typescript
import type {Flavored, Branded} from '@fuzdev/fuz_util/types.js';

// Loose nominal typing (no cast needed, compatible with base type)
type UserId = Flavored<number, 'UserId'>;
const id: UserId = 42; // OK

// Strict nominal typing (requires explicit cast)
type Token = Branded<string, 'Token'>;
const token = 'abc' as Token; // Must cast
```

**Result pattern:**

```typescript
import type {Result} from '@fuzdev/fuz_util/result.js';
import {unwrap} from '@fuzdev/fuz_util/result.js';

type FetchResult = Result<{data: string}, {message: string}>;

const result: FetchResult = {ok: true, data: 'hello'};
if (result.ok) {
	console.log(result.data);
}

// Throws ResultError if !ok
const data = unwrap(result);
```

**CLI argument parsing:**

```typescript
import {args_parse} from '@fuzdev/fuz_util/args.js';
import {z} from 'zod';

const schema = z.object({
	verbose: z
		.boolean()
		.default(false)
		.meta({aliases: ['v']}),
	output: z.string(),
	force: z.boolean().optional(),
});

const result = args_parse(['--verbose', '--output', 'dist'], schema);
if (result.success) {
	console.log(result.data); // {verbose: true, output: 'dist'}
}
```

Features: alias expansion, `--no-flag` negation, boolean coercion, prototype
pollution protection.

### System utilities

- `process.ts` - process/spawn helpers with typed results
- `fetch.ts` - fetch utilities with caching, rate limit detection, ETag support
- `fs.ts` - file system utilities (`fs_exists`, `fs_empty_dir`, `fs_search`)
- `path.ts` - path utilities
- `git.ts` - git operations
- `log.ts` - hierarchical logging system

**Spawn with typed results:**

```typescript
import {spawn} from '@fuzdev/fuz_util/process.js';

const result = await spawn('npm', ['test']);

// Type guards for narrowing
if (spawn_result_is_error(result)) {
	// SpawnResultError - process failed to start (ENOENT, etc)
} else if (spawn_result_is_signaled(result)) {
	// SpawnResultSignaled - killed by signal (SIGTERM, etc)
} else {
	// SpawnResultExited - normal exit, check result.code
}
```

**Hierarchical logging:**

```typescript
import {Logger} from '@fuzdev/fuz_util/log.js';

const log = new Logger('app');
const db_log = log.child('db'); // Auto-labeled [app:db]

log.set_level('debug'); // Inherited by children
log.info('Starting...');
db_log.debug('Query executed');
```

Auto-detects level from `PUBLIC_LOG_LEVEL` env var.

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
- `deep_equal.ts` - deep equality with security features (constructor comparison,
  prototype pollution protection)
- `function.ts` - function utilities (`noop`, `identity`, Thunk pattern)
- `regexp.ts` - regex helpers
- `url.ts` - URL utilities
- `print.ts` - formatted output with colors

**Thunk pattern:**

```typescript
import type {Thunk} from '@fuzdev/fuz_util/function.js';
import {unthunk} from '@fuzdev/fuz_util/function.js';

type LazyValue<T> = T | Thunk<T>;

// Calls if function, otherwise returns value
const value = unthunk(maybeLazy); // Lazy evaluation
```

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
- Svelte-specific code (use fuz_ui)
- Build tooling (use gro)
- CSS utilities (use fuz_css)
- UI helper functions for source_json (use fuz_ui's helpers)

## Project standards

- TypeScript strict mode
- Prettier with tabs, 100 char width
- Node >= 22.15
- Tests in `src/test/` (not co-located)
- No Svelte dependency (pure TypeScript)

## Related projects

- [`fuz_css`](../fuz_css/CLAUDE.md) - CSS framework (depends on fuz_util)
- [`fuz_ui`](../fuz_ui/CLAUDE.md) - UI components (depends on fuz_util)
- [`gro`](../gro/CLAUDE.md) - build system (depends on fuz_util)
