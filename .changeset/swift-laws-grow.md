---
'@fuzdev/fuz_util': minor
---

fix: make `esm-env` a required peer (was optional) — `log.ts` imports it at runtime and no required framework peer guarantees it, so an optional peer left a node-only consumer with a missing-module crash. npm auto-installs required peers.
