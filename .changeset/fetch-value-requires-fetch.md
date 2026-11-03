---
'@fuzdev/fuz_util': minor
---

**breaking** feat: `fetch_value` requires `options.fetch` and no longer defaults to `globalThis.fetch`, so the network is always handed in; pass `globalThis.fetch` on Node and in browsers
