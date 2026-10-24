---
'@fuzdev/fuz_util': minor
---

**breaking** feat: remove `fact_hash_extract_refs` and `FACT_HASH_PATTERN`: a fact's refs are what its writer declares in `FactPutOptions.refs`, and `FactStore` implementations no longer scan JSON content for them
