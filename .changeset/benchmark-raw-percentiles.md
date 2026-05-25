---
'@fuzdev/fuz_util': minor
---

fix: treat benchmark timing outliers asymmetrically

- `BenchmarkStats` now computes the upper-tail order statistics (`max_ns`, `p75_ns`–`p99_ns`) over the raw valid timings instead of the MAD-cleaned set
- `max_ns` and the `p75_ns`–`p99_ns` percentiles shift on distributions with detected high outliers
