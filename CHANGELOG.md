# @fuzdev/fuz_util

## 0.75.0

### Minor Changes

- **breaking** feat: `benchmark_baseline.ts` takes '@fuzdev/fuz_schema' schemas instead of Zod's ([bc6a416](https://github.com/fuzdev/fuz_util/commit/bc6a416))

  - `BenchmarkBaseline` and `BenchmarkBaselineEntry` are fuz_schema `strip_object` schemas with no `.parse`, `.safeParse`, `.shape`, or `.extend`: call `s.parse(BenchmarkBaseline, value)` for `{ok: true, value}` or `{ok: false, issues}` in place of `.safeParse`, and `s.parse_or_throw` (throwing `SchemaError`) in place of `.parse`; unknown keys are still stripped and the persisted shape and `BASELINE_VERSION` are unchanged, and the warning for an invalid file prints fuz_schema's issue text in place of Zod's issue list
  - the output is the input itself when no unknown key is dropped, where Zod always copied: a valid baseline, its `entries`, and its `metadata` come back as the same objects in the input's key order (Zod rewrote keys into the schema's order), so mutating the output of `s.parse` mutates its input; `benchmark_baseline_load` parses a fresh object, so it shares nothing with its caller
  - `benchmark_baseline.ts` no longer imports Zod, so benchmark consumers no longer need the optional `zod` peer

- **breaking** feat: drop Zod: remove `id.ts`, `datetime.ts`, and `zod.ts`, and make `FactHash` a fuz_schema brand ([56d8bf1](https://github.com/fuzdev/fuz_util/commit/56d8bf1))

  - removes `id.ts` (`Uuid`, `UuidWithDefault`, `create_uuid`, `is_uuid`, `UUID_MATCHER`, `create_client_id_creator`, `ClientIdCreator`), `datetime.ts` (`Datetime`, `DatetimeNow`, `get_datetime_now`), and `zod.ts` (`zod_to_subschema`, `ZOD_WRAPPER_TYPES`, `zod_unwrap_def`, `zod_get_base_type`, `zod_is_optional`, `zod_is_nullable`, `zod_has_default`, `zod_get_innermost_type`, `zod_get_schema_keys`, `zod_maybe_get_field_schema`, `zod_get_field_schema`, `zod_unwrap_to_object`, `ZodFieldInfo`, `zod_extract_fields`): they move to '@fuzdev/fuz_app', which has not released them yet, so depend on a fuz_app release that has them or copy them from '@fuzdev/fuz_util' 0.74.0
  - removes the Zod schemas `Blake3Hash` (bare 64-char hex) and `FactHashSchema` from `hash_schemas.ts`; a fact-hash schema builds on the new `FACT_HASH_EXACT` export, e.g. `z.string().regex(FACT_HASH_EXACT) as z.ZodString & z.ZodType<FactHash, string>`
  - '@fuzdev/fuz_app' 0.137 and earlier don't start with this version: they import the removed modules and schemas; upgrade fuz_app with it
  - `FactHash` is now '@fuzdev/fuz_schema''s `Branded<string, 'FactHash'>` in place of Zod's `.brand('FactHash')`, and `fact_hash_verify`, `fact_hash_extract_refs`, and `FactStore` take or return it: a value branded by Zod's `.brand('FactHash')` no longer fits, but one parsed by a schema whose output is typed `FactHash`, or narrowed by `is_fact_hash`, does; the runtime of `fact_hash_bytes`, `fact_hash_stream`, `is_fact_hash`, and `FACT_HASH_PATTERN` is unchanged
  - adds the `FACT_HASH_EXACT` export, the anchored `/^blake3:[0-9a-f]{64}$/` pattern that was module-private
  - `zod` is no longer an optional peer dependency

## 0.74.0

### Minor Changes

- **breaking** feat: `package_json.ts`, `url.ts`, and `fetch.ts` take '@fuzdev/fuz_schema' schemas instead of Zod's ([01f43fa](https://github.com/fuzdev/fuz_util/commit/01f43fa))

  - `PackageJson`, `PackageJsonRepository`, `PackageJsonAuthor`, `PackageJsonFunding`, `PackageJsonExports`, `ExportValue`, `Url`, `FetchValueCacheKey`, and `FetchValueCacheItem` are fuz_schema schemas with no `.parse`, `.safeParse`, `.shape`, or `.extend`: call `s.parse(PackageJson, value)` for `{ok: true, value}` or `{ok: false, issues}` in place of `.safeParse`, and `s.parse_or_throw` (throwing `SchemaError`) in place of `.parse`; format issues with fuz_schema's `format_issue`, whose text differs from Zod's (a failed union reads `expected string | loose_object` in place of "Invalid input"), and `deserialize_cache` throws `SchemaError` in place of `ZodError`. `FetchValueCache` is now only a type, `Map<string, FetchValueCacheItem>`, so import it with `import type`
  - gro 0.217 and earlier don't start with this version: they import `FetchValueCache` as a value and call `PackageJson.safeParse` (gro 0.216 and earlier also import the removed `zod.ts` functions, as does fuz_app 0.136 and earlier); upgrade them with it
  - `ExportValue` is a real recursive type, `string | null | {[key: string]: ExportValue}`, so `PackageJson['exports']` narrows from `Record<string, unknown>` to `Record<string, ExportValue>`; every other key of `PackageJson` keeps its type
  - the output is the input itself when nothing in it changed, where Zod always copied, so a manifest's keys keep their order and mutating the output mutates the input; an own `__proto__` key (which `JSON.parse` makes) stays in the output of a loose object that returns the input itself, where Zod dropped it (a loose object that copies drops it, as Zod did), and in a record such as `dependencies` its value is validated before it's dropped, so `{"__proto__": 1}` there now fails
  - `Url` checks the text with `URL.canParse` and returns it unchanged, where Zod trimmed it (and from Zod 4.6 also removed tabs and newlines): a padded URL is no longer rewritten, and one padded with whitespace that `URL` doesn't strip, such as a no-break space, now fails
  - removes the CLI-help functions of `zod.ts`, which nothing uses since `args.ts` moved to fuz_schema: `zod_to_schema_description`, `zod_to_schema_default`, `zod_to_schema_aliases`, `zod_to_schema_type_string`, `zod_format_value`, `ZodSchemaProperty`, `zod_to_schema_properties`, and `zod_to_schema_names_with_aliases`; the walkers stay
  - `types.ts` no longer re-exports `Flavored`, `Flavor`, `Branded`, and `Brand`: import them from '@fuzdev/fuz_schema/schema.ts'; '@fuzdev/fuz_schema' `^0.2.1` is required

  fix: `deserialize_cache` loads a cache whose items have no `params` key, as every request without params writes, where it refused the whole cache (so fuz_repos's file cache was wiped on every load); `FetchValueCacheItem`'s `params` and `value` are optional, `value` being absent when `parse` returned `undefined`; an invalid entry's issues start with its cache key, or with its index when the key itself is invalid

## 0.73.0

### Minor Changes

- **breaking** feat: `args.ts` and `git.ts` take '@fuzdev/fuz_schema' schemas instead of Zod's ([a61c463](https://github.com/fuzdev/fuz_util/commit/a61c463))

  - `args_parse`, `args_serialize`, `args_validate_schema`, and `args_extract_aliases` take a fuz_schema object schema (`s.object` refuses unknown keys as `z.strictObject` did); aliases are attached with `meta(entry, {aliases: ['v']})`, declared on `SchemaMeta`, and read on any wrapper layer of an entry
  - `args_parse` returns `SchemaResult`, `{ok: true, value}` or `{ok: false, issues}`, in place of `z.ZodSafeParseResult`, and `args_validate_schema` returns `{ok: true}` or `{ok: false, issues}` in place of `{success, error}`; format issues with fuz_schema's `format_issue` in place of `z.prettifyError`
  - an alias conflict is a `SchemaIssue` of kind `'alias_canonical_conflict'` or `'duplicate_alias'`, with the alias as its `path`
  - a `with_default` value is the same object on every parse, where Zod copied it: give array and object entries `with_default_fn` (`_: s.with_default_fn(s.array(s.string), () => [])`); the output's keys keep the input's order when no entry changed, where Zod's always followed the schema's
  - `GitOrigin` and `GitBranch` are `flavor(s.string, ..)` schemas; '@fuzdev/fuz_schema' `^0.2.0` is required

- **breaking** feat: `Flavored`, `Flavor`, `Branded`, and `Brand` are now defined in '@fuzdev/fuz_schema' and re-exported from `types.ts`, so they are the same types its `flavor` and `brand` schema helpers produce; '@fuzdev/fuz_schema' is a new required peer dependency ([33f3612](https://github.com/fuzdev/fuz_util/commit/33f3612))
- fix: `PackageJson` `sideEffects` accepts a boolean as well as an array of strings, so manifests with `"sideEffects": false` parse; the inferred type widens from `Array<string>` to `boolean | Array<string>` ([ce1c251](https://github.com/fuzdev/fuz_util/commit/ce1c251))

## 0.72.0

### Minor Changes

- **breaking** feat: `Hue` is degrees [0, 360) instead of [0, 1], matching CSS — `rgb_to_hsl`, `hsl_to_rgb`, `hsl_to_hex`, `hsl_to_hex_string`, `hsl_to_string`, `parse_hsl_string`, and `hex_string_to_hsl` take and return degrees, so callers drop their `* 360` / `/ 360`, and `hsl_to_rgb` now wraps any angle; `Hsl` and `Rgb` are no longer `readonly`. Adds `parse_hue` to `colors.ts`, and the `oklch.ts` module (moved from `@fuzdev/fuz_css`) with OKLCH/OKLab ↔ sRGB conversions, `clamp_oklch`, `oklch_in_srgb_gamut`, `oklch_max_srgb_chroma`, the allocation-free `oklch_to_srgb_into`, and `oklch_to_string` / `parse_oklch_string`; unlike the fuz_css original, `oklab_to_oklch` gives grays hue 0 rather than matrix-noise hues ([d783fe4](https://github.com/fuzdev/fuz_util/commit/d783fe4))

## 0.71.0

### Minor Changes

- feat: add `stats_t_critical_95`, `stats_std_dev_sample`, `stats_spread`, `stats_ratio_deviation`, and `stats_pairwise_deviation` to `stats.ts`, and the machine-wide benchmark lock `benchmark_lock.ts` (`benchmark_lock_acquire`, `benchmark_lock_format_refusal`, `BENCHMARK_LOCK_PATH`) ([80156e8](https://github.com/fuzdev/fuz_util/commit/80156e8))

  fix: `stats_incomplete_beta` was missing the first step of its continued fraction, so `stats_t_distribution_p_value` returned p-values far too small for df up to 100 (0.017 where 0.05 is right at df 11); it switches to the normal only above df 1e7, where the two agree to within 1e-6, and a df of 0 or below, or NaN, now gives a NaN p-value. Welch comparisons (`benchmark_stats_compare`, `benchmark_baseline_compare`) therefore reported significance too readily at df up to 100, and `benchmark_stats_compare` now reports `significant: false` for a single sample

  **breaking** `stats_confidence_interval` and `stats_confidence_interval_from_summary` default to the 95% Student's t critical value at n - 1 degrees of freedom over the sample standard deviation, and return `[NaN, NaN]` for fewer than two values; their options are now `{critical?: number}`, replacing `z_score` and `confidence_level`. `STATS_CONFIDENCE_Z_SCORES` and `stats_confidence_level_to_z_score` are removed. `BenchmarkStats.confidence_interval_ns` widens slightly at small sample sizes, and for one sample is `[NaN, NaN]` (`null`s in `benchmark_format_json` output), with `ci_overlap` then false

## 0.70.0

### Minor Changes

- **breaking** refactor: `FactStore.put_ref` is removed from the interface — an implementation stores bytes it is handed (`put` / `put_stream`) and no longer registers bytes held at an external URL; a caller holding such bytes reads them and calls `put` or `put_stream` ([8b3c39a](https://github.com/fuzdev/fuz_util/commit/8b3c39a))

## 0.69.0

### Minor Changes

- **breaking** chore: the optional peer dep `@fuzdev/blake3_wasm` is renamed to `@fuzdev/blake3-wasm` (`^0.2.0`) — swap the dependency and any `optimizeDeps.exclude` entry ([ef67d3a](https://github.com/fuzdev/fuz_util/commit/ef67d3a))

## 0.68.0

### Minor Changes

- extract fact and blake3 helpers to `hash_schemas.ts` ([4c49cbf](https://github.com/fuzdev/fuz_util/commit/4c49cbf)) ([refactor](https://github.com/fuzdev/fuz_util/commit/refactor))

## 0.67.0

### Minor Changes

- Rebuild `diff.ts` around greedy Myers (breaking): ([#84](https://github.com/fuzdev/fuz_util/pull/84))

  - `diff_lines` replaces the LCS table with greedy Myers over interned lines — linear memory, common prefix/suffix trimming, and a `max_cost` cap that degrades gracefully to a replace block on unrelated inputs. Changed regions are normalized to removes-before-adds.
  - `DiffLine` gains 1-based `a_line`/`b_line` and `no_newline` (git's "no newline at end of file" semantics, no phantom empty final line); `line` is renamed to `text`.
  - New `diff_hunks`/`DiffHunk` group changes with context, replacing `filter_diff_context` and its `'...'` sentinel line.
  - New `diff_segments` computes intra-line changed-character ranges for paired remove/add lines, with a similarity gate.
  - `format_diff` takes hunks and emits unified-diff `@@` headers; colors now go through `print.ts`'s `st` seam (`use_color` removed).

- feat: improve diff algo ([#84](https://github.com/fuzdev/fuz_util/pull/84))

## 0.66.0

### Minor Changes

- feat: make fractional-index jitter opt-out via an options object ([936e61f](https://github.com/fuzdev/fuz_util/commit/936e61f))

## 0.65.2

### Patch Changes

- add `to_error_message` to `error.ts` ([331b153](https://github.com/fuzdev/fuz_util/commit/331b153))

## 0.65.1

### Patch Changes

- feat: add configurable optional `keys` to `library_json_from_modules` and `pkg_json_from_package_json` ([5c86f08](https://github.com/fuzdev/fuz_util/commit/5c86f08))

## 0.65.0

### Minor Changes

- feat: rework `LibraryJson` and `SourceJson` for `PkgJson` ([289360c](https://github.com/fuzdev/fuz_util/commit/289360c))

### Patch Changes

- feat: add `package_helpers.ts` ([289360c](https://github.com/fuzdev/fuz_util/commit/289360c))

## 0.64.0

### Minor Changes

- feat: add `PkgJson`, the curated publish-safe subset of `PackageJson`, plus `pkg_json_keys` ([#79](https://github.com/fuzdev/fuz_util/pull/79))
- fix: make `esm-env` a required peer instead of optional ([d04f6f3](https://github.com/fuzdev/fuz_util/commit/d04f6f3))

## 0.63.2

### Patch Changes

- deps: >= for svelte-docinfo ([073060b](https://github.com/fuzdev/fuz_util/commit/073060b))

## 0.63.1

### Patch Changes

- feat: add `put_stream` to `FactStore` ([78120df](https://github.com/fuzdev/fuz_util/commit/78120df))

## 0.63.0

### Minor Changes

- deps: upgrade `svelte-docinfo` ([8f9dc7a](https://github.com/fuzdev/fuz_util/commit/8f9dc7a))

## 0.62.0

### Minor Changes

- feat: extract source/declaration analysis schemas to `svelte-docinfo` ([#62](https://github.com/fuzdev/fuz_util/pull/62))
  - Remove `source_json.ts` — `DeclarationKind`, `GenericParamInfo`, `ParameterInfo`, `ComponentPropInfo`, `DeclarationJson`, `ModuleJson`, `SourceJson` schemas and the `declaration_get_display_name` / `declaration_generate_import` helpers now live in `svelte-docinfo`.
  - Move the `SourceJson` wrapper (`{name, version, modules}`) to `library_json.ts`, typing `modules` with `svelte-docinfo`'s `ModuleJsonInput`.
  - Add `svelte-docinfo` as an optional peer dependency — without it, `modules` degrades to `any`.
  - Add `library_json_from_modules(package_json, modules)` — derives the `SourceJson` wrapper from the package's own `name`/`version`.
  - Migration: import declaration/module types from `svelte-docinfo/types.js`, and `SourceJson` from `@fuzdev/fuz_util/library_json.js`.

## 0.61.1

### Patch Changes

- feat: add `fractional_index.ts`, `fact_hash.ts`, and `fact_store.ts` ([960cb44](https://github.com/fuzdev/fuz_util/commit/960cb44))

## 0.61.0

### Minor Changes

- fix: treat benchmark timing outliers asymmetrically ([9596566](https://github.com/fuzdev/fuz_util/commit/9596566))
  - `BenchmarkStats` now computes the upper-tail order statistics (`max_ns`, `p75_ns`–`p99_ns`) over the raw valid timings instead of the MAD-cleaned set
  - `max_ns` and the `p75_ns`–`p99_ns` percentiles shift on distributions with detected high outliers

## 0.60.1

### Patch Changes

- fix: benchmark md formatting ([05f34dc](https://github.com/fuzdev/fuz_util/commit/05f34dc))

## 0.60.0

### Minor Changes

- feat: improve benchmark API ([1a71bad](https://github.com/fuzdev/fuz_util/commit/1a71bad))
- feat: refine benchmark API ([f6dc2b0](https://github.com/fuzdev/fuz_util/commit/f6dc2b0))

### Patch Changes

- fix: warmup edge case in benchmarks ([889ad0b](https://github.com/fuzdev/fuz_util/commit/889ad0b))

## 0.59.1

### Patch Changes

- fix: loosen type for `to_bytes` and `hash_blake3` to include `Uint8Array` ([e73e6a4](https://github.com/fuzdev/fuz_util/commit/e73e6a4))

## 0.59.0

### Minor Changes

- feat: add `datetime.ts` and schema for `Uuid` ([d73e2f8](https://github.com/fuzdev/fuz_util/commit/d73e2f8))
- feat: add some zod helpers ([d73e2f8](https://github.com/fuzdev/fuz_util/commit/d73e2f8))

## 0.58.0

### Minor Changes

- bump node@24.14 ([fbefe82](https://github.com/fuzdev/fuz_util/commit/fbefe82))

### Patch Changes

- feat: add `lru_map.ts` with `LruMap` ([3671f15](https://github.com/fuzdev/fuz_util/commit/3671f15))

## 0.57.0

### Minor Changes

- feat: rework deps interfaces ([#76](https://github.com/fuzdev/fuz_util/pull/76))
- feat: add `assert_property` test helper ([#78](https://github.com/fuzdev/fuz_util/pull/78))
- feat: kind-based discriminators on `SpawnResult` and `SpawnDetachedResult` (breaking: replaces sentinel-null fields; removes `spawn_result_is_*` type guards) ([#77](https://github.com/fuzdev/fuz_util/pull/77))

### Patch Changes

- fix: `deep_equal` for `Error` ([cede27a](https://github.com/fuzdev/fuz_util/commit/cede27a))

## 0.56.0

### Minor Changes

- fix: change `PackageJson` `version` to be optional ([47cb39d](https://github.com/fuzdev/fuz_util/commit/47cb39d))

### Patch Changes

- feat: add `testing.ts` ([#75](https://github.com/fuzdev/fuz_util/pull/75))

## 0.55.0

### Minor Changes

- feat: improve benchmark stats and reliability ([#74](https://github.com/fuzdev/fuz_util/pull/74))

## 0.54.0

### Minor Changes

- rename `tagline` from `motto` ([8906cac](https://github.com/fuzdev/fuz_util/commit/8906cac))

### Patch Changes

- use `Object.hasOwn` instead of `in` for own-property checks in `deep_equal` ([38fd976](https://github.com/fuzdev/fuz_util/commit/38fd976))

## 0.53.4

### Patch Changes

- add `Blake3Hash` schema ([b3b33ee](https://github.com/fuzdev/fuz_util/commit/b3b33ee))

## 0.53.3

### Patch Changes

- feat: add more zod helpers ([a86bab6](https://github.com/fuzdev/fuz_util/commit/a86bab6))

## 0.53.2

### Patch Changes

- add `format_bytes` ([de16196](https://github.com/fuzdev/fuz_util/commit/de16196))
- add `blake3_ready` with auto-init ([de16196](https://github.com/fuzdev/fuz_util/commit/de16196))

## 0.53.1

### Patch Changes

- add `from_hex`, `hash_sha1`, `hash_sha384`, and `hash_sha512` ([d16f560](https://github.com/fuzdev/fuz_util/commit/d16f560))

## 0.53.0

### Minor Changes

- unexport `masher` from `random_alea.ts` ([06d675b](https://github.com/fuzdev/fuz_util/commit/06d675b))
- rename `RandomAlea` from `Alea` ([06d675b](https://github.com/fuzdev/fuz_util/commit/06d675b))
- switch to blake3 hashing ([#73](https://github.com/fuzdev/fuz_util/pull/73))
  - add `hash_blake3`, sync BLAKE3 via optional peer dep `@fuzdev/blake3-wasm`
  - rename `hash_sha256` from `hash_secure` and remove the custom algorithm param
  - add `hex.ts` with `to_hex`
  - add `bytes.ts` with `to_bytes`

### Patch Changes

- add `random_xoshiro.ts` ([06d675b](https://github.com/fuzdev/fuz_util/commit/06d675b))
- fix empty string logging ([72dc8f4](https://github.com/fuzdev/fuz_util/commit/72dc8f4))

## 0.52.1

### Patch Changes

- feat: add `zod.ts` ([459313d](https://github.com/fuzdev/fuz_util/commit/459313d))

## 0.52.0

### Minor Changes

- change args order of async helpers and add cancellation ([#72](https://github.com/fuzdev/fuz_util/pull/72))

## 0.51.0

### Minor Changes

- improve `source_json.ts` ([#71](https://github.com/fuzdev/fuz_util/pull/71))

## 0.50.1

### Patch Changes

- fix: skip import type declarations in `resolve_component_names` ([87f4287](https://github.com/fuzdev/fuz_util/commit/87f4287))

## 0.50.0

### Minor Changes

- `handle_preprocess_error`: preserve error cause chain, simplify `format_named_specifiers` type ([e6c5b82](https://github.com/fuzdev/fuz_util/commit/e6c5b82))

## 0.49.3

### Patch Changes

- add `try_extract_conditional` to `svelte_preprocess_helpers.ts` ([0a966ec](https://github.com/fuzdev/fuz_util/commit/0a966ec))

## 0.49.2

### Patch Changes

- improve `has_identifier_in_tree` skip behavior ([74f5025](https://github.com/fuzdev/fuz_util/commit/74f5025))

## 0.49.1

### Patch Changes

- add `build_static_bindings` and support it from `evaluate_static_expr` ([3aeb47c](https://github.com/fuzdev/fuz_util/commit/3aeb47c))

## 0.49.0

### Minor Changes

- rename `string_is_binary` from `is_binary` ([#69](https://github.com/fuzdev/fuz_util/pull/69))

### Patch Changes

- add `svelte_preprocess_helpers.ts` ([#69](https://github.com/fuzdev/fuz_util/pull/69))

## 0.48.4

### Patch Changes

- add `dag.ts`, `diff.ts`, and `sort.ts` ([7b3bf38](https://github.com/fuzdev/fuz_util/commit/7b3bf38))
- add `AsyncSemaphore` to `async.ts` ([7b3bf38](https://github.com/fuzdev/fuz_util/commit/7b3bf38))

## 0.48.3

### Patch Changes

- add `hash.ts` ([#68](https://github.com/fuzdev/fuz_util/pull/68))

## 0.48.2

### Patch Changes

- add `spawn_detached` ([129b37e](https://github.com/fuzdev/fuz_util/commit/129b37e))

## 0.48.1

### Patch Changes

- parameterize `spawn_child_process` to `ProcessRegistry#spawn` ([efa8eb0](https://github.com/fuzdev/fuz_util/commit/efa8eb0))

## 0.48.0

### Minor Changes

- add `args.ts` ([#66](https://github.com/fuzdev/fuz_util/pull/66))

## 0.47.0

### Minor Changes

- improve `process.ts` interfaces ([de7a07e](https://github.com/fuzdev/fuz_util/commit/de7a07e))

## 0.46.0

### Minor Changes

- refactor process spawning with `ProcessRegistry` class and improved APIs ([#65](https://github.com/fuzdev/fuz_util/pull/65))

  breaking changes:

  - remove `global_spawn` - use `default_registry.processes` instead
  - remove `register_global_spawn` - `ProcessRegistry.spawn()` handles registration automatically
  - rename `attach_process_error_handlers` to `attach_process_error_handler` (singular)
  - rename `RestartableProcess.running` to `active` (reflects handle state, not OS process state)
  - `spawn_out` returns `''` for empty output instead of `null` (null only for spawn failures)

  new features:

  - add `ProcessRegistry` class for testable, isolated process groups
  - add `SpawnProcessOptions` with `signal` (AbortSignal) and `timeout_ms`
  - add `DespawnOptions` with `signal` and `timeout_ms` (SIGKILL escalation)
  - add type guards: `spawn_result_is_error`, `spawn_result_is_signaled`, `spawn_result_is_exited`
  - add `active`, `child`, `closed`, and `spawned` getters to `RestartableProcess`
    - `spawned` promise resolves when initial spawn completes (avoids race conditions)
    - concurrent `restart()` and `kill()` calls are coalesced
  - `spawn_restartable_process` now accepts `SpawnProcessOptions` instead of `SpawnOptions`
  - `attach_process_error_handler` now takes options object instead of positional args
  - `attach_error_handler` throws if called twice on same registry (was silent no-op)
  - `attach_error_handler` accepts `graceful_timeout_ms` option for SIGTERM before SIGKILL

  improvements:

  - fix race condition between concurrent `kill()` and `restart()` calls
  - `process_is_pid_running` rejects fractional PIDs
  - `spawn_out` explicitly cleans up stream listeners
  - improve JSDoc with usage examples throughout

## 0.45.3

### Patch Changes

- add `each_concurrent` ([#64](https://github.com/fuzdev/fuz_util/pull/64))

## 0.45.2

### Patch Changes

- add `levenshtein_distance` ([258c441](https://github.com/fuzdev/fuz_util/commit/258c441))

## 0.45.1

### Patch Changes

- change `library.json` property order ([af50855](https://github.com/fuzdev/fuz_util/commit/af50855))

## 0.45.0

### Minor Changes

- add baseline to benchmark helpers and improve grouping ([2550d9e](https://github.com/fuzdev/fuz_util/commit/2550d9e))

## 0.44.1

### Patch Changes

- add `process_is_pid_running` to `process.ts` ([f1ee638](https://github.com/fuzdev/fuz_util/commit/f1ee638))

## 0.44.0

### Minor Changes

- rework and clean up some APIs ([57842f0](https://github.com/fuzdev/fuz_util/commit/57842f0))

## 0.43.0

### Minor Changes

- change `is_promise` to return a boolean ([#61](https://github.com/fuzdev/fuz_util/pull/61))
- add benchmark lib ([#61](https://github.com/fuzdev/fuz_util/pull/61))

## 0.42.0

### Minor Changes

- move to fuzdev and rename to fuz_util from belt ([8d4e5a0](https://github.com/ryanatkn/belt/commit/8d4e5a0))

## 0.41.1

### Patch Changes

- add `fs_search` ([#59](https://github.com/ryanatkn/belt/pull/59))

## 0.41.0

### Minor Changes

- change `map_concurrent_settled` to return `PromiseSettledResult` ([8061202](https://github.com/ryanatkn/belt/commit/8061202))
- make `concurrency` required for `map_concurrent` and `map_concurrent_settled` ([8061202](https://github.com/ryanatkn/belt/commit/8061202))

## 0.40.2

### Patch Changes

- add `map_concurrent` and `map_concurrent_settled` ([ec8abaf](https://github.com/ryanatkn/belt/commit/ec8abaf))

## 0.40.1

### Patch Changes

- make `optional` optional ([72146e7](https://github.com/ryanatkn/belt/commit/72146e7))

## 0.40.0

### Minor Changes

- rework `library_json.ts` and `source_json.ts` ([a87a166](https://github.com/ryanatkn/belt/commit/a87a166))

## 0.39.0

### Minor Changes

- rename `PascalCase` from `Upper_Snake_Case` (lol) ([#58](https://github.com/ryanatkn/belt/pull/58))

## 0.38.2

### Patch Changes

- improve `fs_empty_dir` internals ([8f4cb8d](https://github.com/ryanatkn/belt/commit/8f4cb8d))

## 0.38.1

### Patch Changes

- add `fs.ts` with `fs_exists` and `fs_empty_dir` ([#56](https://github.com/ryanatkn/belt/pull/56))

## 0.38.0

### Minor Changes

- migrate `src_json.ts` from fuz ([#55](https://github.com/ryanatkn/belt/pull/55))
- rename pkg_json identifiers ([#55](https://github.com/ryanatkn/belt/pull/55))

## 0.37.2

### Patch Changes

- revert internal paths to `.js` ([#54](https://github.com/ryanatkn/belt/pull/54))

## 0.37.1

### Patch Changes

- switch to ts imports ([#48](https://github.com/ryanatkn/belt/pull/48))

## 0.37.0

### Minor Changes

- simplify logging ([#51](https://github.com/ryanatkn/belt/pull/51))

## 0.36.1

### Patch Changes

- add `deep_equal.ts` ([#50](https://github.com/ryanatkn/belt/pull/50))

## 0.36.0

### Minor Changes

- - rename `json_type_of` from `to_json_type` ([4feefaf](https://github.com/ryanatkn/belt/commit/4feefaf))
  - rename `json_embed` from `embed_json`
  - rename `json_stringify_deterministic` from `to_deterministic_json`
  - replace `canonicalize` with `json_stringify_deterministic`

## 0.35.1

### Patch Changes

- fix path module to not require node ([#47](https://github.com/ryanatkn/belt/pull/47))

## 0.35.0

### Minor Changes

- default logging to info in production ([ebdd641](https://github.com/ryanatkn/belt/commit/ebdd641))

### Patch Changes

- upstream helpers for `path.ts` and `git.ts` ([#46](https://github.com/ryanatkn/belt/pull/46))

## 0.34.1

### Patch Changes

- change `reset_regexp` to return the regexp instead of void ([48f1324](https://github.com/ryanatkn/belt/commit/48f1324))

## 0.34.0

### Minor Changes

- rename `configure_print_colors` from `set_colors` ([70503d9](https://github.com/ryanatkn/belt/commit/70503d9))

### Patch Changes

- add `reset_regexp` ([f6514a7](https://github.com/ryanatkn/belt/commit/f6514a7))

## 0.33.0

### Minor Changes

- change default `print_number_with_separators` separator to `,` from `_` ([#43](https://github.com/ryanatkn/belt/pull/43))
- remove info log labels and loosen log label types ([#43](https://github.com/ryanatkn/belt/pull/43))

### Patch Changes

- handle arrays in `print_value` ([#43](https://github.com/ryanatkn/belt/pull/43))

## 0.32.0

### Minor Changes

- add optional zod peer dep ([#42](https://github.com/ryanatkn/belt/pull/42))

### Patch Changes

- add modules package_json.ts, pkg.ts, and src_json.ts ([#42](https://github.com/ryanatkn/belt/pull/42))

## 0.31.1

### Patch Changes

- add `options` arg to `ResultError` and `UnreachableError` ctors ([34723fe](https://github.com/ryanatkn/belt/commit/34723fe))

## 0.31.0

### Minor Changes

- bump node@22.15 from 22.11 ([0989b18](https://github.com/ryanatkn/belt/commit/0989b18))
- chore: bump @types/node@24 ([ccd7d5b](https://github.com/ryanatkn/belt/commit/ccd7d5b))

### Patch Changes

- add `stringify` helper ([588732b](https://github.com/ryanatkn/belt/commit/588732b))

## 0.30.2

### Patch Changes

- improve `unreachable` type to assert `never` ([d6a81c7](https://github.com/ryanatkn/belt/commit/d6a81c7))

## 0.30.1

### Patch Changes

- upgrade esm-env@1.2.2 ([#40](https://github.com/ryanatkn/belt/pull/40))

## 0.30.0

### Minor Changes

- rename `Thunk` from `Lazy` and `unthunk` from `lazy` ([5e36e11](https://github.com/ryanatkn/belt/commit/5e36e11))

## 0.29.1

### Patch Changes

- add `ClassConstructor` to `types.ts` ([dc8f0b9](https://github.com/ryanatkn/belt/commit/dc8f0b9))

## 0.29.0

### Minor Changes

- change `is_editable` to match all inputs except hidden ones ([4889274](https://github.com/ryanatkn/belt/commit/4889274))

### Patch Changes

- add `is_interactive` ([4889274](https://github.com/ryanatkn/belt/commit/4889274))

## 0.28.0

### Minor Changes

- disable colors by default for better runtime compat - ([1972e95](https://github.com/ryanatkn/belt/commit/1972e95))
  call `set_colors(styleText)` from `print.ts`,
  in Node `import {styleText} from 'node:util';`

## 0.27.6

### Patch Changes

- add `strip_ansi` string util ([ffb7587](https://github.com/ryanatkn/belt/commit/ffb7587))

## 0.27.5

### Patch Changes

- export `st` from `print.ts` ([95fe446](https://github.com/ryanatkn/belt/commit/95fe446))

## 0.27.4

### Patch Changes

- tweak logging outputs again ([2cc4100](https://github.com/ryanatkn/belt/commit/2cc4100))
- tweak logging outputs once more ([2e2fb84](https://github.com/ryanatkn/belt/commit/2e2fb84))

## 0.27.3

### Patch Changes

- tweak logging outputs ([d292845](https://github.com/ryanatkn/belt/commit/d292845))

## 0.27.2

### Patch Changes

- change the debug char ([6876ebc](https://github.com/ryanatkn/belt/commit/6876ebc))

## 0.27.1

### Patch Changes

- improve log symbols and consistency ([28371a1](https://github.com/ryanatkn/belt/commit/28371a1))

## 0.27.0

### Minor Changes

- add `esm-env` optional dep and default logger to debug ([9c8d8af](https://github.com/ryanatkn/belt/commit/9c8d8af))

## 0.26.1

### Patch Changes

- improve `Json` types, adding `JsonPrimitive`, `JsonObject`, and `JsonArray` ([9db9a1d](https://github.com/ryanatkn/belt/commit/9db9a1d))

## 0.26.0

### Minor Changes

- remove `obtainable` ([#39](https://github.com/ryanatkn/belt/pull/39))

## 0.25.3

### Patch Changes

- add more docs ([ddcda63](https://github.com/ryanatkn/belt/commit/ddcda63))

## 0.25.2

### Patch Changes

- add optional peer dep `@types/node` to fix disabled TS `skipLibCheck` ([578f632](https://github.com/ryanatkn/belt/commit/578f632))

## 0.25.1

### Patch Changes

- add logo ([#37](https://github.com/ryanatkn/belt/pull/37))
- add `throttle` ([#38](https://github.com/ryanatkn/belt/pull/38))

## 0.25.0

### Minor Changes

- rework the `Logger` API ([#36](https://github.com/ryanatkn/belt/pull/36))
- remove `$lib/styletext.ts` ([#36](https://github.com/ryanatkn/belt/pull/36))
- move `print_log_label` to `$lib/print.ts` from `$lib/log.ts` ([#36](https://github.com/ryanatkn/belt/pull/36))
- bump required node version to `20.17` ([#36](https://github.com/ryanatkn/belt/pull/36))

## 0.24.12

### Patch Changes

- add `unreachable` error helper ([b794c07](https://github.com/ryanatkn/belt/commit/b794c07))

## 0.24.11

### Patch Changes

- fix: exit on uncaught exceptions by default ([8e2e91a](https://github.com/ryanatkn/belt/commit/8e2e91a))

## 0.24.10

### Patch Changes

- add `despawn_all` to `process.ts` ([#35](https://github.com/ryanatkn/belt/pull/35))
- fix `attach_process_error_handlers` API to only handle exceptions ([#35](https://github.com/ryanatkn/belt/pull/35))

## 0.24.9

### Patch Changes

- fix `embed_json` for multiline strings ([dac5852](https://github.com/ryanatkn/belt/commit/dac5852))

## 0.24.8

### Patch Changes

- change `embed_json` to support multiline strings ([d173206](https://github.com/ryanatkn/belt/commit/d173206))

## 0.24.7

### Patch Changes

- improve `slugify` ([#34](https://github.com/ryanatkn/belt/pull/34))
  - add the arg `map_special_characters` to optionally disable the expensive special character mappings
  - improve performance with benchmarks

## 0.24.6

### Patch Changes

- add `slugify` to `paths.ts` ([c77cbe2](https://github.com/ryanatkn/belt/commit/c77cbe2))

## 0.24.5

### Patch Changes

- improve hsl parsing to allow hsl prefix ([#33](https://github.com/ryanatkn/belt/pull/33))

## 0.24.4

### Patch Changes

- publish src files ([9af61b0](https://github.com/ryanatkn/belt/commit/9af61b0))
- add tsconfig `sourceRoot` ([459eb8a](https://github.com/ryanatkn/belt/commit/459eb8a))

## 0.24.3

### Patch Changes

- enable tsconfig `declaration` and `declarationMap` ([cbe3e31](https://github.com/ryanatkn/belt/commit/cbe3e31))

## 0.24.2

### Patch Changes

- add `embed_json` helper for embedding parsed json strings in js ([f5c02c0](https://github.com/ryanatkn/belt/commit/f5c02c0))

## 0.24.1

### Patch Changes

- fix timings type to correctly include `undefined` for unfinished ones ([603bfe4](https://github.com/ryanatkn/belt/commit/603bfe4))

## 0.24.0

### Minor Changes

- rename `UUID_MATCHER` from `uuid_matcher` for consistency ([f974a64](https://github.com/ryanatkn/belt/commit/f974a64))

### Patch Changes

- add `sideEffects` to `package.json` ([8f8c5bd](https://github.com/ryanatkn/belt/commit/8f8c5bd))

## 0.23.0

### Minor Changes

- remove `kleur` dependency for Node's `styleText` and wrap it with `$lib/styletext.ts` ([#29](https://github.com/ryanatkn/belt/pull/29))

### Patch Changes

- upgrade gro with correctly formatted exports ([744b984](https://github.com/ryanatkn/belt/commit/744b984))

## 0.22.0

### Minor Changes

- support `node@20.12` and later ([8ee3346](https://github.com/ryanatkn/belt/commit/8ee3346))

## 0.21.1

### Patch Changes

- fix hsl parsing for modern comma-less form ([963c536](https://github.com/ryanatkn/belt/commit/963c536))

## 0.21.0

### Minor Changes

- upgrade `node@22.3` ([#28](https://github.com/ryanatkn/belt/pull/28))
- rename `count_graphemes` from `to_grapheme_count` and use `Intl.Segmenter` without a fallback ([f9f62e0](https://github.com/ryanatkn/belt/commit/f9f62e0))

### Patch Changes

- add `count_iterator` ([b02e33a](https://github.com/ryanatkn/belt/commit/b02e33a))

## 0.20.10

### Patch Changes

- add `format_url` and module `$lib/url.ts` ([1843c6c](https://github.com/ryanatkn/belt/commit/1843c6c))

## 0.20.9

### Patch Changes

- fix `is_editable` ([ab395cd](https://github.com/ryanatkn/belt/commit/ab395cd))

## 0.20.8

### Patch Changes

- add `inside_editable` and tweak `is_editable` logic to use `getAttribute` ([8dc7d81](https://github.com/ryanatkn/belt/commit/8dc7d81))

## 0.20.7

### Patch Changes

- fix contentEditable detection in `is_editable` ([8ed886d](https://github.com/ryanatkn/belt/commit/8ed886d))

## 0.20.6

### Patch Changes

- add `$lib/async.ts#is_promise` ([a5d3bb6](https://github.com/ryanatkn/belt/commit/a5d3bb6))

## 0.20.5

### Patch Changes

- change `parse_hsl_string` to parse values with alpha ([37e7094](https://github.com/ryanatkn/belt/commit/37e7094))

## 0.20.4

### Patch Changes

- add `$lib/colors.ts` ([#27](https://github.com/ryanatkn/belt/pull/27))

## 0.20.3

### Patch Changes

- use '\_' for print number separator instead of ',' ([9ef6700](https://github.com/ryanatkn/belt/commit/9ef6700))

## 0.20.2

### Patch Changes

- relax fetch_value token type to accept null ([a14e4ee](https://github.com/ryanatkn/belt/commit/a14e4ee))

## 0.20.1

### Patch Changes

- rename to belt ([a8ac0af](https://github.com/ryanatkn/belt/commit/a8ac0af))

## 0.20.0

### Minor Changes

- move orgs to @ryanatkn from @grogarden ([#26](https://github.com/ryanatkn/belt/pull/26))

## 0.19.3

### Patch Changes

- improve some array types to handle readonly arrays ([23e739c](https://github.com/ryanatkn/belt/commit/23e739c))

## 0.19.2

### Patch Changes

- add `PickUnion` and `KeyofUnion` type helpers ([6e6ac53](https://github.com/ryanatkn/belt/commit/6e6ac53))

## 0.19.1

### Patch Changes

- add `ArrayElement` type helper ([940ec97](https://github.com/ryanatkn/belt/commit/940ec97))

## 0.19.0

### Minor Changes

- remove `print_causes` ([#25](https://github.com/ryanatkn/belt/pull/25))

### Patch Changes

- change `print_ms` to include separators at thousands ([#25](https://github.com/ryanatkn/belt/pull/25))
- support custom colors for printing values ([#25](https://github.com/ryanatkn/belt/pull/25))
- change print_ms to include separators at thousands was provided ([#25](https://github.com/ryanatkn/belt/pull/25))

## 0.18.3

### Patch Changes

- return headers from `fetch_value` ([#24](https://github.com/ryanatkn/belt/pull/24))

## 0.18.2

### Patch Changes

- add a default 'content-type' header for `fetch_value` ([2126d03](https://github.com/ryanatkn/belt/commit/2126d03))

## 0.18.1

### Patch Changes

- add `fetch_value` ([#22](https://github.com/ryanatkn/belt/pull/22))

## 0.18.0

### Minor Changes

- remove random_char ([fc99da6](https://github.com/ryanatkn/belt/commit/fc99da6))

## 0.17.0

### Minor Changes

- unpublish package.ts ([6ff3df5](https://github.com/ryanatkn/belt/commit/6ff3df5))

## 0.16.1

### Patch Changes

- add `random_char` helper ([8353169](https://github.com/ryanatkn/belt/commit/8353169))

## 0.16.0

### Minor Changes

- rename to `ProperSnakes` ([#21](https://github.com/ryanatkn/belt/pull/21))

## 0.15.4

### Patch Changes

- add `public: true,` to `package.json` ([47e32d6](https://github.com/ryanatkn/belt/commit/47e32d6))

## 0.15.3

### Patch Changes

- upgrade `@fuzdev/gro` which adds `modules` to `package.ts` ([4b0fc13](https://github.com/ryanatkn/belt/commit/4b0fc13))

## 0.15.2

### Patch Changes

- add shuffle ([5c6dd69](https://github.com/ryanatkn/belt/commit/5c6dd69))

## 0.15.1

### Patch Changes

- publish $routes/package.ts ([753a787](https://github.com/ryanatkn/belt/commit/753a787))

## 0.15.0

### Minor Changes

- fix global_spawn name ([530641a](https://github.com/ryanatkn/belt/commit/530641a))

### Patch Changes

- deprecate obtainable ([d123ff9](https://github.com/ryanatkn/belt/commit/d123ff9))

## 0.14.0

### Minor Changes

- fix some snake_case ([#20](https://github.com/ryanatkn/belt/pull/20))
- bump node engine to 20.10 ([#20](https://github.com/ryanatkn/belt/pull/20))
- upgrade to @fuzdev/gro@0.86 from @feltjs/gro@0.83 ([#20](https://github.com/ryanatkn/belt/pull/20))
- add `spawn_out` to process ([#20](https://github.com/ryanatkn/belt/pull/20))

## 0.13.1

### Patch Changes

- fix exports ([d62b1bf](https://github.com/ryanatkn/belt/commit/d62b1bf))

## 0.13.0

### Minor Changes

- missed a spot renaming create_stopwatch ([e373d3a](https://github.com/ryanatkn/belt/commit/e373d3a))

## 0.12.0

### Minor Changes

- switch to `snake_case` ([#19](https://github.com/ryanatkn/belt/pull/19))

## 0.11.0

### Minor Changes

- increment timing keys instead of throwing ([#18](https://github.com/ryanatkn/belt/pull/18))

## 0.10.1

### Patch Changes

- fix PUBLIC_LOG_LEVEL env var usage ([286aa46](https://github.com/ryanatkn/belt/commit/286aa46))
- move to belt.ryanatkn.com from util.felt.dev ([db08052](https://github.com/ryanatkn/belt/commit/db08052))

## 0.10.0

### Minor Changes

- upgrade gro ([#17](https://github.com/ryanatkn/belt/pull/17))
- rename to `@ryanatkn/belt` from `@feltjs/util` ([#17](https://github.com/ryanatkn/belt/pull/17))

## 0.9.1

- add `noop_async` and `resolved` function helpers
  ([commit](https://github.com/ryanatkn/belt/commit/a1f53ec07e50ffdb9763e1fcaf1a02af97302157))

## 0.9.0

- **break**: support only deep imports
  ([#16](https://github.com/ryanatkn/belt/pull/16))
- **break**: remove `nulls` and `undefineds` from `$lib/object.ts`
  ([#16](https://github.com/ryanatkn/belt/pull/16))

## 0.8.3

- fix `is_editable` to return `true` only for actually editable inputs
  ([#15](https://github.com/ryanatkn/belt/pull/15))

## 0.8.2

- add `is_iframed` helper to `$lib/dom.ts`
  ([#14](https://github.com/ryanatkn/belt/pull/14))

## 0.8.1

- loosen the types of `EMPTY_OBJECT` and `swallow`
  ([#13](https://github.com/ryanatkn/belt/pull/13))

## 0.8.0

- rename log's `trace` to `debug`
  ([#12](https://github.com/ryanatkn/belt/pull/12))

## 0.7.5

- fix root exports to omit modules with Node dependencies
  ([commit](https://github.com/ryanatkn/belt/commit/7fb6fd1279df284bbb319a984c299018d4472c80))

## 0.7.4

- fix root exports to not use `$lib`
  ([commit](https://github.com/ryanatkn/belt/commit/ae12e44814b2331883820413080ea9570d57fa5c))

## 0.7.3

- publish everything from the root
  ([commit](https://github.com/ryanatkn/belt/commit/8a7b3b0e16908b27f52563c9b3151eda47615ba5))

## 0.7.2

- add `handle_target_value` to `$lib/dom.ts`
  ([commit](https://github.com/ryanatkn/belt/commit/37d99fc73c577229ae5c5fc87dde8d238950826e))

## 0.7.1

- make `select` elements count for `is_editable`
  ([commit](https://github.com/ryanatkn/belt/commit/202026ad248b0f337d84ff3521948fd299104d6e))

## 0.7.0

- **break**: remove the type `ClientId` and make it a plain string
  ([commit](https://github.com/ryanatkn/belt/commit/b02ffa709e08b56d15988be4292928a24893695f))

## 0.6.0

- **break**: change `LogLevel` from an enum to a string type union,
  change its default to `info`, and add `to_log_level_value` to convert it to a number
  ([#11](https://github.com/ryanatkn/belt/pull/11))

## 0.5.3

- change all `$lib/` paths to be direct
  ([commit](https://github.com/ryanatkn/belt/commit/c845c45a89a75cb4d2b56c4cde1bc0d4ef090f8a))

## 0.5.2

- fix published version for @feltjs this time for real
  ([#9](https://github.com/ryanatkn/belt/pull/9))

## 0.5.1

- fix published version for @feltjs

## 0.5.0

- **break**: remove `$lib/env`
  ([#7](https://github.com/ryanatkn/belt/pull/7))
- **break**: default log level to `import.meta.env.PUBLIC_LOG_LEVEL`
  instead of the obsolete `VITE_LOG_LEVEL`
  ([#7](https://github.com/ryanatkn/belt/pull/7))
- **break**: remove exports `DEFAULT_LOG_LEVEL` and `ENV_LOG_LEVEL` from `$lib/log`
  ([#7](https://github.com/ryanatkn/belt/pull/7))

## 0.4.1

- add `to_next` to `$lib/array`
  ([#5](https://github.com/ryanatkn/belt/pull/5))

## 0.4.0

- **break**: rename `$lib/random-alea` from `$lib/random-seeded`
  and `create_random_alea` from `toRandomSeeded`

## 0.3.0

- **break**: remove `toUuid`, use platform `crypto.randomUUID` instead
- remove `@lukeed/uuid` as a peer dep
- add `kleur` as a peer dep

## 0.2.1

- fix exports
  ([#3](https://github.com/ryanatkn/belt/pull/3))

## 0.2.0

- **break**: require fully qualified imports for almost everything
  ([#2](https://github.com/ryanatkn/belt/pull/2))
- **break**: change `to_json_type` in `$lib/json` to return `undefined` instead of throwing
  ([#2](https://github.com/ryanatkn/belt/pull/2))
- **break**: rename camelCase filenames to dash-case,
  `$lib/path` from `$lib/pathParsing` and
  `$lib/random-seeded` from `$lib/randomSeed`
  ([#2](https://github.com/ryanatkn/belt/pull/2))

## 0.1.0

- publish
  ([#1](https://github.com/ryanatkn/belt/pull/1))
