---
'@fuzdev/fuz_util': minor
---

**breaking** fix: `hash_insecure` is now real 32-bit DJB2 (`hash * 33 + c`, wrapped to 32 bits each step), so its output changes for every non-empty input; rebuild anything keyed by it
