---
'@fuzdev/fuz_util': minor
---

feat: add `stats_t_critical_95`, `stats_std_dev_sample`, `stats_spread`, `stats_ratio_deviation`, and `stats_pairwise_deviation` to `stats.ts`, and the machine-wide benchmark lock `benchmark_lock.ts` (`benchmark_lock_acquire`, `benchmark_lock_format_refusal`, `BENCHMARK_LOCK_PATH`)

fix: `stats_incomplete_beta` was missing the first step of its continued fraction, so `stats_t_distribution_p_value` returned p-values far too small for df up to 100 (0.017 where 0.05 is right at df 11); it switches to the normal only above df 1e7, where the two agree to within 1e-6, and a df of 0 or below, or NaN, now gives a NaN p-value. Welch comparisons (`benchmark_stats_compare`, `benchmark_baseline_compare`) therefore reported significance too readily at df up to 100, and `benchmark_stats_compare` now reports `significant: false` for a single sample

**breaking** `stats_confidence_interval` and `stats_confidence_interval_from_summary` default to the 95% Student's t critical value at n - 1 degrees of freedom over the sample standard deviation, and return `[NaN, NaN]` for fewer than two values; their options are now `{critical?: number}`, replacing `z_score` and `confidence_level`. `STATS_CONFIDENCE_Z_SCORES` and `stats_confidence_level_to_z_score` are removed. `BenchmarkStats.confidence_interval_ns` widens slightly at small sample sizes, and for one sample is `[NaN, NaN]` (`null`s in `benchmark_format_json` output), with `ci_overlap` then false
