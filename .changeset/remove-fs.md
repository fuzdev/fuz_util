---
'@fuzdev/fuz_util': minor
---

**breaking** remove `@fuzdev/fuz_util/fs.ts` (`fs_exists`, `fs_empty_dir`, `fs_search`, `fs_classify_error`, `FsError`, `FsJsonError`, `FsSearchOptions`); gro consumers use `@fuzdev/gro/fs.ts` and `@fuzdev/gro/fs_search.ts`, others take an injected dependency or write local code with `node:fs/promises`
