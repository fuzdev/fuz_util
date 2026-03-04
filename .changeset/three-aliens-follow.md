---
'@fuzdev/fuz_util': minor
---

switch to blake3 hashing

- add `hash_blake3`, sync BLAKE3 via `@fuzdev/blake3_wasm`
- rename `hash_sha256` from `hash_secure` and remove the custom algorithm param
- add `hex.ts` with `to_hex`
- add `bytes.ts` with `to_bytes`
