---
'@fuzdev/fuz_util': minor
---

**breaking** refactor: `FactStore.put_ref` is removed from the interface — an implementation stores bytes it is handed (`put` / `put_stream`) and no longer registers bytes held at an external URL; a caller holding such bytes reads them and calls `put` or `put_stream`
