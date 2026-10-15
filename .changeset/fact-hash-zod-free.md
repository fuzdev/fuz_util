---
'@fuzdev/fuz_util': minor
---

**breaking** feat: drop Zod: remove `id.ts`, `datetime.ts`, and `zod.ts`, and make `FactHash` a fuz_schema brand

- removes `id.ts` (`Uuid`, `UuidWithDefault`, `create_uuid`, `is_uuid`, `UUID_MATCHER`, `create_client_id_creator`, `ClientIdCreator`), `datetime.ts` (`Datetime`, `DatetimeNow`, `get_datetime_now`), and `zod.ts` (`zod_to_subschema`, `ZOD_WRAPPER_TYPES`, `zod_unwrap_def`, `zod_get_base_type`, `zod_is_optional`, `zod_is_nullable`, `zod_has_default`, `zod_get_innermost_type`, `zod_get_schema_keys`, `zod_maybe_get_field_schema`, `zod_get_field_schema`, `zod_unwrap_to_object`, `ZodFieldInfo`, `zod_extract_fields`): they move to '@fuzdev/fuz_app', which has not released them yet, so depend on a fuz_app release that has them or copy them from '@fuzdev/fuz_util' 0.74.0
- removes the Zod schemas `Blake3Hash` (bare 64-char hex) and `FactHashSchema` from `hash_schemas.ts`; a fact-hash schema builds on the new `FACT_HASH_EXACT` export, e.g. `z.string().regex(FACT_HASH_EXACT) as z.ZodString & z.ZodType<FactHash, string>`
- '@fuzdev/fuz_app' 0.137 and earlier don't start with this version: they import the removed modules and schemas; upgrade fuz_app with it
- `FactHash` is now '@fuzdev/fuz_schema''s `Branded<string, 'FactHash'>` in place of Zod's `.brand('FactHash')`, and `fact_hash_verify`, `fact_hash_extract_refs`, and `FactStore` take or return it: a value branded by Zod's `.brand('FactHash')` no longer fits, but one parsed by a schema whose output is typed `FactHash`, or narrowed by `is_fact_hash`, does; the runtime of `fact_hash_bytes`, `fact_hash_stream`, `is_fact_hash`, and `FACT_HASH_PATTERN` is unchanged
- adds the `FACT_HASH_EXACT` export, the anchored `/^blake3:[0-9a-f]{64}$/` pattern that was module-private
- `zod` is no longer an optional peer dependency
