---
'@fuzdev/fuz_util': minor
---

fix: `PackageJson` `sideEffects` accepts a boolean as well as an array of strings, so manifests with `"sideEffects": false` parse; the inferred type widens from `Array<string>` to `boolean | Array<string>`
