---
'@fuzdev/fuz_util': minor
---

**breaking** feat: `args.ts` and `git.ts` take '@fuzdev/fuz_schema' schemas instead of Zod's

- `args_parse`, `args_serialize`, `args_validate_schema`, and `args_extract_aliases` take a fuz_schema object schema (`s.object` refuses unknown keys as `z.strictObject` did); aliases are attached with `meta(entry, {aliases: ['v']})`, declared on `SchemaMeta`, and read on any wrapper layer of an entry
- `args_parse` returns `SchemaResult`, `{ok: true, value}` or `{ok: false, issues}`, in place of `z.ZodSafeParseResult`, and `args_validate_schema` returns `{ok: true}` or `{ok: false, issues}` in place of `{success, error}`; format issues with fuz_schema's `format_issue` in place of `z.prettifyError`
- an alias conflict is a `SchemaIssue` of kind `'alias_canonical_conflict'` or `'duplicate_alias'`, with the alias as its `path`
- a `with_default` value is the same object on every parse, where Zod copied it: give array and object entries `with_default_fn` (`_: s.with_default_fn(s.array(s.string), () => [])`); the output's keys keep the input's order when no entry changed, where Zod's always followed the schema's
- `GitOrigin` and `GitBranch` are `flavor(s.string, ..)` schemas; '@fuzdev/fuz_schema' `^0.2.0` is required
