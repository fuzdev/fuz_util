---
'@fuzdev/fuz_util': patch
---

fix: `throttle` no longer drops a call made while its trailing call runs, never overlaps calls, keeps working after a queued call rejects (its promise rejects with the error), no longer reports a duplicate unhandled rejection from its own bookkeeping, and with `when: 'both'` a call made while a trailing call is queued now joins it instead of running ahead of the stale queued args
