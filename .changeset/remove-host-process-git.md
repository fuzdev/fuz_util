---
'@fuzdev/fuz_util': minor
---

**breaking** remove `@fuzdev/fuz_util/process.ts` and `@fuzdev/fuz_util/git.ts`, and fix `log.ts` throwing at load with no `process` global; gro consumers use `@fuzdev/gro/spawn.ts`, `@fuzdev/gro/process.ts`, and `@fuzdev/gro/git.ts`, others take an injected dependency or write local code with `node:child_process`
