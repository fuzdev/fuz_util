---
'@fuzdev/fuz_util': minor
---

**breaking** feat: `benchmark_baseline.ts` takes '@fuzdev/fuz_schema' schemas instead of Zod's

- `BenchmarkBaseline` and `BenchmarkBaselineEntry` are fuz_schema `strip_object` schemas with no `.parse`, `.safeParse`, `.shape`, or `.extend`: call `s.parse(BenchmarkBaseline, value)` for `{ok: true, value}` or `{ok: false, issues}` in place of `.safeParse`, and `s.parse_or_throw` (throwing `SchemaError`) in place of `.parse`; unknown keys are still stripped and the persisted shape and `BASELINE_VERSION` are unchanged, and the warning for an invalid file prints fuz_schema's issue text in place of Zod's issue list
- the output is the input itself when no unknown key is dropped, where Zod always copied: a valid baseline, its `entries`, and its `metadata` come back as the same objects in the input's key order (Zod rewrote keys into the schema's order), so mutating the output of `s.parse` mutates its input; `benchmark_baseline_load` parses a fresh object, so it shares nothing with its caller
- `benchmark_baseline.ts` no longer imports Zod, so benchmark consumers no longer need the optional `zod` peer
