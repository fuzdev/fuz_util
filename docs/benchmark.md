# Benchmark Library

⚠️ AI generated

> performance benchmarking for TypeScript/JS

Comprehensive statistical analysis, percentile tracking, and rich output formatting.

## Quick Start

```ts
import {Benchmark} from '@fuzdev/fuz_util/benchmark.js';

const bench = new Benchmark({
	duration_ms: 5000, // Run each task for 5 seconds
});

bench
	.add('Array.map', () => {
		[1, 2, 3, 4, 5].map((x) => x * 2);
	})
	.add('for loop', () => {
		const arr = [1, 2, 3, 4, 5];
		const result = [];
		for (let i = 0; i < arr.length; i++) {
			result.push(arr[i]! * 2);
		}
	});

await bench.run();
console.log(bench.table());
```

## Running Benchmarks

### In This Repository

```bash
# Run individual benchmarks
npm run benchmark_slugify
npm run benchmark_deep_equal
npm run benchmark_deep_equal_comparison
```

### In Your Project

```bash
# Using gro task runner
gro run src/benchmarks/my_benchmark.ts

# Using Node.js directly (with GC control)
node --expose-gc dist/benchmarks/my_benchmark.js
```

Benchmark files use the `.benchmark.ts` naming convention.

## Features

### 🎯 Comprehensive Statistics

- **Mean, median, standard deviation**
- **Percentiles** (median, p75, p90, p95, p99) for tail latency analysis
- **Min/max** times to spot variance
- **Outlier detection** using MAD (Median Absolute Deviation)
- **Confidence intervals** (95%)
- **Coefficient of variation** for consistency measurement

### 📊 Rich Output Formats

#### ASCII Table

```ts
console.log(bench.table());
```

```
┌────────────┬────────────┬────────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ Task Name  │  ops/sec   │ median(μs) │ p75 (μs) │ p90 (μs) │ p95 (μs) │ p99 (μs) │ min (μs) │ max (μs) │ vs Best  │
├────────────┼────────────┼────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Array.map  │ 1,237,144  │    0.78    │   0.80   │   0.82   │   0.83   │   0.86   │   0.73   │   0.94   │ baseline │
│ for loop   │   261,619  │    3.89    │   3.91   │   3.94   │   3.96   │   4.02   │   3.83   │   4.11   │   4.73x  │
└────────────┴────────────┴────────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```

**Performance tier animals:**

- 🐆 Cheetah: >1M ops/sec (extremely fast)
- 🐇 Rabbit: >100K ops/sec (fast)
- 🐢 Turtle: >10K ops/sec (moderate)
- 🐌 Snail: <10K ops/sec (slow)

#### Grouped Table

```ts
const groups = [
	{name: 'ARRAY OPERATIONS', filter: (r) => r.name.includes('Array')},
	{name: 'LOOPS', filter: (r) => r.name.includes('loop')},
];
console.log(bench.table({groups}));
```

```
📦 ARRAY OPERATIONS
┌────────────┬────────────┬────────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ Task Name  │  ops/sec   │ median(μs) │ p75 (μs) │ p90 (μs) │ p95 (μs) │ p99 (μs) │ min (μs) │ max (μs) │ vs Best  │
├────────────┼────────────┼────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Array.map  │ 1,237,144  │    0.78    │   0.80   │   0.82   │   0.83   │   0.86   │   0.73   │   0.94   │ baseline │
└────────────┴────────────┴────────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘

📦 LOOPS
┌────────────┬────────────┬────────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ Task Name  │  ops/sec   │ median(μs) │ p75 (μs) │ p90 (μs) │ p95 (μs) │ p99 (μs) │ min (μs) │ max (μs) │ vs Best  │
├────────────┼────────────┼────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ for loop   │   261,619  │    3.89    │   3.91   │   3.94   │   3.96   │   4.02   │   3.83   │   4.11   │   4.73x  │
└────────────┴────────────┴────────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```

#### Markdown Export

```ts
console.log(bench.markdown());
```

Perfect for documentation and GitHub.

#### JSON Export

```ts
console.log(bench.json()); // Pretty-printed (default)
console.log(bench.json({pretty: false})); // Compact
console.log(bench.json({include_timings: true})); // Include raw timing data
```

Full statistics in JSON format for programmatic analysis, tracking trends over time,
or integration with other tools.

### 🎨 Automatic Unit Selection

The library automatically chooses the best time unit (ns/μs/ms/s) for readability:

- **Nanoseconds (ns)**: For extremely fast operations (<1μs)
- **Microseconds (μs)**: For fast operations (1μs - 1ms)
- **Milliseconds (ms)**: For slower operations (1ms - 1s)
- **Seconds (s)**: For very slow operations (>1s)

All measurements in a table use the same unit for easy comparison.

## Configuration

```ts
interface BenchmarkConfig {
	/** Target time to run each task (default: 1000ms) */
	duration_ms?: number;

	/** Warmup iterations before measuring (default: 10) */
	warmup_iterations?: number;

	/** Cooldown between tasks (default: 100ms) */
	cooldown_ms?: number;

	/** Minimum iterations (default: 10) */
	min_iterations?: number;

	/** Maximum iterations (default: 100000) */
	max_iterations?: number;

	/** Custom timer (default: auto-detect) */
	timer?: Timer;

	/** Callback after each iteration. Call abort() to stop early. */
	on_iteration?: (task_name: string, iteration: number, abort: () => void) => void;

	/** Callback after each task completes */
	on_task_complete?: (result: BenchmarkResult, index: number, total: number) => void;
}
```

## Advanced Usage

### Skip and Only

Focus on specific tasks during development:

```ts
// Skip a task
bench.add('slow task', () => slow_operation());
bench.skip('slow task'); // Won't run

// Run only specific tasks
bench.add('task1', () => fn1());
bench.add('task2', () => fn2());
bench.add('task3', () => fn3());
bench.only('task2'); // Only task2 runs

// Or via task object
bench.add({name: 'focused', fn: () => test(), only: true});
bench.add({name: 'skipped', fn: () => other(), skip: true});
```

### Async Hint

For sync-heavy benchmarks, skip promise detection overhead:

```ts
bench.add({
	name: 'definitely sync',
	fn: () => compute(data),
	async: false, // Skip promise checking each iteration
});

bench.add({
	name: 'definitely async',
	fn: async () => await fetch(url),
	async: true, // Always await
});
```

Without the hint, async detection happens during warmup automatically.

### Progress Tracking

Monitor long-running benchmark suites:

```ts
const bench = new Benchmark({
	duration_ms: 5000,
	on_task_complete: (result, index, total) => {
		console.log(
			`[${index + 1}/${total}] ${result.name}: ${result.stats.ops_per_second.toFixed(0)} ops/sec`,
		);
	},
});
```

### Setup and Teardown

```ts
bench.add({
	name: 'with setup/teardown',
	setup: () => {
		// Runs once before benchmarking (not timed)
		data = load_test_data();
	},
	fn: () => {
		// The actual benchmark (timed)
		process(data);
	},
	teardown: () => {
		// Runs once after benchmarking (not timed)
		cleanup();
	},
});
```

### Garbage Collection Control

Garbage collection can significantly impact benchmark results. When the GC runs
mid-benchmark, it causes timing spikes that appear as outliers. While the library
automatically removes statistical outliers, controlling GC timing gives you more
consistent and reproducible results.

**Why GC matters:**

- GC pauses can add milliseconds to individual iterations
- Memory-intensive benchmarks may trigger GC more frequently
- Different functions may have different allocation patterns, biasing comparisons

**Enabling manual GC in Node.js:**

```bash
# Run with --expose-gc flag
node --expose-gc your-benchmark.js

# Or with a task runner
NODE_OPTIONS='--expose-gc' npm run benchmark
```

**Per-iteration GC (most thorough, slowest):**

```ts
const bench = new Benchmark({
	duration_ms: 5000,
	on_iteration: () => {
		// Trigger GC after each iteration
		if (globalThis.gc) globalThis.gc();
	},
});
```

This ensures each iteration starts with a clean heap, but adds significant overhead.
Best for memory-intensive benchmarks where allocation patterns vary.

**Pre-task GC only (balanced approach):**

```ts
bench.add({
	name: 'memory-intensive',
	setup: () => {
		// GC before starting measurements
		if (globalThis.gc) globalThis.gc();
		data = prepare_large_dataset();
	},
	fn: () => process(data),
	teardown: () => {
		data = null;
		// GC after to clean up
		if (globalThis.gc) globalThis.gc();
	},
});
```

**Cooldown-based GC (least intrusive):**

```ts
const bench = new Benchmark({
	cooldown_ms: 500, // Give GC time to run between tasks
});
```

The default 100ms cooldown often allows background GC to complete naturally.

**Checking GC availability:**

```ts
if (typeof globalThis.gc === 'function') {
	console.log('Manual GC available');
} else {
	console.warn('Run with --expose-gc for manual GC control');
}
```

### Accessing Raw Results

```ts
await bench.run();

const results = bench.results();
for (const result of results) {
	console.log(result.name);
	console.log(result.stats.mean_ns);
	console.log(result.stats.p99_ns);
	console.log(result.stats.outliers_ns);
	// ... all stats available
}
```

## Statistics Explained

### Percentiles (median, p75, p90, p95, p99)

**What they are:**

- **median**: 50% of operations complete faster than this
- **p75**: 75% of operations complete faster than this
- **p90**: 90% of operations complete faster than this
- **p95**: 95% of operations complete faster than this
- **p99**: 99% of operations complete faster than this

Percentiles are calculated using the **R-7 linear interpolation method** (the default
in R, NumPy, and Excel). This interpolates between adjacent data points for more
accurate estimates, especially important with smaller sample sizes.

**Why they matter:**

- median shows typical performance
- p75 shows upper-typical performance
- p90-p99 reveal tail latency (worst-case scenarios)
- Critical for understanding user experience under load

**Example interpretation:**

```
median: 100μs, p99: 500μs
```

Most operations are fast (100μs), but 1% take up to 5x longer (500μs).
This could indicate GC pauses or cache misses.

### Min/Max

Shows the fastest and slowest single iteration:

- **Min**: Best-case performance (hot path, cached)
- **Max**: Worst-case performance (cold start, GC, cache miss)
- **Range (max/min ratio)**: Indicates consistency

High variance suggests:

- JIT compilation effects
- Garbage collection interference
- CPU throttling or background tasks

### Relative Performance (vs Best)

Compares each task to the fastest:

- **baseline**: The fastest task
- **2.5x**: 2.5 times slower than the baseline

Makes it easy to spot performance differences at a glance.

### Coefficient of Variation (CV / Margin)

Measures relative variability:

- **Low (<5%)**: Very consistent performance
- **Medium (5-15%)**: Normal variability
- **High (>15%)**: Inconsistent, investigate outliers

Expressed as ±percentage in the table.

### Outlier Detection

Uses MAD (Median Absolute Deviation) to automatically remove outliers:

- More robust than IQR for skewed distributions
- Prevents GC pauses from skewing results
- Reported in stats (count and ratio)

**Important**: Outlier removal is automatic and always enabled. The `BenchmarkStats` class
computes all statistics (mean, median, percentiles, etc.) on the cleaned data after
outliers are removed. If you need raw statistics without outlier removal, access the
`raw_sample_size` property to see how many samples were collected before filtering,
and `outliers_ns` to see which values were removed.

## Standalone Statistics Module

The statistical functions used by the benchmark library are available as a standalone module:

```ts
import {
	stats_mean,
	stats_median,
	stats_std_dev,
	stats_variance,
	stats_percentile,
	stats_cv,
	stats_min_max,
	stats_confidence_interval,
	stats_outliers_iqr,
	stats_outliers_mad,
} from '@fuzdev/fuz_util/stats.js';

// Calculate statistics on any numeric array
const values = [1.2, 1.5, 1.3, 1.4, 1.6, 10.0]; // 10.0 is an outlier

const mean = stats_mean(values); // 2.83
const median = stats_median(values); // 1.45
const {cleaned, outliers} = stats_outliers_mad(values); // removes 10.0
const p95 = stats_percentile(cleaned, 0.95); // 95th percentile
```

These are pure functions with zero dependencies, useful for any statistical analysis.

## API Reference

### Benchmark Class

```ts
class Benchmark {
	constructor(config?: BenchmarkConfig);
	add(name: string, fn: () => unknown): this;
	add(task: BenchmarkTask): this;
	remove(name: string): this;
	skip(name: string): this; // Mark task to be skipped
	only(name: string): this; // Run only marked tasks
	run(): Promise<Array<BenchmarkResult>>;
	table(options?: BenchmarkFormatTableOptions): string;
	markdown(): string;
	json(options?: BenchmarkFormatJsonOptions): string;
	summary(): string;
	results(): Array<BenchmarkResult>;
	reset(): this;
	clear(): this;
}
```

### Types

See [Configuration](#configuration) for `BenchmarkConfig` options.

```ts
interface BenchmarkTask {
	name: string;
	fn: () => unknown | Promise<unknown>;
	setup?: () => void | Promise<void>;
	teardown?: () => void | Promise<void>;
	skip?: boolean; // Skip this task
	only?: boolean; // Run only this task (and other `only` tasks)
	async?: boolean; // Hint: skip promise detection if false
}

interface BenchmarkResult {
	name: string;
	stats: BenchmarkStats;
	iterations: number;
	total_time_ms: number;
	timings_ns: Array<number>; // Raw timing data
}
```

**Error handling**: If a benchmark task throws an error during setup, warmup, or
measurement, the error propagates immediately and stops the benchmark run. The
`teardown` function (if defined) still runs via `finally` to ensure cleanup.

```ts
try {
	const results = await bench.run();
	// Process successful results
} catch (error) {
	console.error('Benchmark failed:', error.message);
}
```

```ts
interface BenchmarkFormatTableOptions {
	groups?: Array<BenchmarkGroup>;
}

interface BenchmarkGroup {
	name: string;
	description?: string;
	filter: (result: BenchmarkResult) => boolean;
}
```

### BenchmarkStats Properties

```ts
class BenchmarkStats {
	mean_ns: number;
	p50_ns: number;
	std_dev_ns: number;
	min_ns: number;
	max_ns: number;
	p75_ns: number;
	p90_ns: number;
	p95_ns: number;
	p99_ns: number;
	cv: number; // Coefficient of variation
	confidence_interval_ns: [number, number];
	outliers_ns: Array<number>;
	outlier_ratio: number;
	sample_size: number;
	raw_sample_size: number;
	ops_per_second: number;
	failed_iterations: number;
}

// Compare two benchmarks for statistical significance
function benchmark_stats_compare(
	a: BenchmarkStats,
	b: BenchmarkStats,
	options?: {alpha?: number},
): BenchmarkComparison;
```

### Comparing Results

Use `benchmark_stats_compare()` to determine if performance differences are statistically significant:

```ts
import {benchmark_stats_compare} from '@fuzdev/fuz_util/benchmark_stats.js';

const results = await bench.run();
const [result_a, result_b] = results;

const comparison = benchmark_stats_compare(result_a.stats, result_b.stats);

console.log(comparison.faster); // 'a', 'b', or 'equal'
console.log(comparison.speedup_ratio); // e.g., 1.5 means 1.5x faster
console.log(comparison.significant); // true if p < 0.05
console.log(comparison.p_value); // Welch's t-test p-value
console.log(comparison.effect_size); // Cohen's d
console.log(comparison.effect_magnitude); // 'negligible', 'small', 'medium', 'large'
console.log(comparison.recommendation); // Human-readable interpretation
```

**Use cases:**

- **CI/CD regression detection**: Alert when p < 0.05 and effect is not negligible
- **A/B performance comparison**: Compare two implementations objectively
- **Before/after analysis**: Verify optimizations are real improvements

```ts
interface BenchmarkComparison {
	faster: 'a' | 'b' | 'equal';
	speedup_ratio: number;
	significant: boolean;
	p_value: number;
	effect_size: number;
	effect_magnitude: 'negligible' | 'small' | 'medium' | 'large';
	ci_overlap: boolean;
	recommendation: string;
}
```

### Baseline Storage and Regression Detection

Save benchmark results to disk and compare against baselines for CI/CD regression detection:

```ts
import {Benchmark} from '@fuzdev/fuz_util/benchmark.js';
import {
	benchmark_baseline_save,
	benchmark_baseline_compare,
	benchmark_baseline_format,
	benchmark_baseline_format_json,
} from '@fuzdev/fuz_util/benchmark_baseline.js';

const bench = new Benchmark();
bench.add('parse', () => parse(input));
bench.add('format', () => format(data));
await bench.run();

// Save current results as baseline
await benchmark_baseline_save(bench.results());

// Compare against saved baseline
const comparison = await benchmark_baseline_compare(bench.results(), {
	regression_threshold: 1.05, // Only flag regressions 5%+ slower
	staleness_warning_days: 7, // Warn if baseline > 7 days old
});

if (comparison.regressions.length > 0) {
	console.log(benchmark_baseline_format(comparison));
	process.exit(1); // Fail CI
}

// JSON output for programmatic use
console.log(benchmark_baseline_format_json(comparison, {pretty: true}));
```

**Storage location**: `.gro/benchmarks/baseline.json`

**Features:**

- Auto-detects git commit and branch
- Validates with Zod schemas (warns and auto-cleans corrupted files)
- Categorizes results: regressions, improvements, unchanged, new, removed
- Uses statistical significance testing (not just raw numbers)
- Configurable regression threshold to reduce noise
- Staleness warnings for old baselines
- Regressions sorted by effect size (most severe first)
- JSON output format for CI integration

**API:**

```ts
// Save baseline (auto-detects git info)
await benchmark_baseline_save(results, {
	path?: string,         // default: '.gro/benchmarks'
	git_commit?: string,   // auto-detected
	git_branch?: string,   // auto-detected
});

// Load baseline (returns null if missing/invalid)
const baseline = await benchmark_baseline_load({path?: string});

// Compare with options
const result = await benchmark_baseline_compare(results, {
	path?: string,
	regression_threshold?: number,     // minimum ratio to flag (default: 1.0)
	staleness_warning_days?: number,   // warn if older than N days
});
// result.regressions (sorted by severity), result.improvements,
// result.unchanged, result.new_tasks, result.removed_tasks,
// result.baseline_age_days, result.baseline_stale

// Human-readable summary
console.log(benchmark_baseline_format(result));

// JSON for CI/programmatic use
console.log(benchmark_baseline_format_json(result, {pretty?: boolean}));
```

## Tips for Accurate Benchmarks

1. **Run for sufficient time**: At least 1-5 seconds per task
2. **Use warmup iterations**: Let JIT compile the code first (10-50 iterations for complex functions)
3. **Close other applications**: Reduce CPU contention
4. **Run multiple times**: Compare results across runs for consistency
5. **Check p99 percentile**: Don't just look at averages
6. **Use GC control**: Trigger GC between tasks for fairness
7. **Avoid side effects**: Don't modify external state in benchmarks
8. **Test realistic workloads**: Use real data, not just toy examples
9. **Avoid allocations in `on_iteration`**: The callback runs between measurements, but allocations can trigger GC before the next iteration

### Browser Timing Precision

**Important**: Browser timing has reduced precision due to Spectre/Meltdown security mitigations:

| Environment | Precision                                       |
| ----------- | ----------------------------------------------- |
| Node.js     | ~1ns (nanosecond via `process.hrtime.bigint()`) |
| Chrome      | ~100μs (coarsened)                              |
| Firefox     | ~1ms (rounded)                                  |
| Safari      | ~100μs                                          |

For accurate nanosecond-precision benchmarks, **use Node.js**. Browser benchmarks are
still useful for relative comparisons but absolute timing values will be less precise.

### Async Functions

Async functions are fully supported. Each iteration checks if the return value is a
promise and awaits it if so:

```ts
bench.add('async', async () => await fetch(url));
bench.add('sync', () => compute(data));

// Mixed sync/async also works - promises are awaited when returned
bench.add('conditional', () => (cached ? cached : fetch(url)));
```

### Memory Considerations

Each result includes raw `timings_ns` for custom analysis, which accumulates memory:

- Each iteration's timing is stored (8 bytes per sample)
- With `duration_ms: 5000` and fast functions, you may collect 100,000+ samples per task
- Multiple tasks multiply this usage

**Mitigation strategies**:

```ts
// 1. Limit iterations for memory-constrained environments
const bench = new Benchmark({
	max_iterations: 10000, // Cap samples
});

// 2. Use GC between tasks
const bench = new Benchmark({
	on_iteration: () => {
		if (globalThis.gc) globalThis.gc();
	},
	cooldown_ms: 200, // Allow GC time between tasks
});

// 3. Clear results between runs if reusing a Benchmark instance
bench.reset(); // Clears results, keeps tasks
```

## Troubleshooting

### Unrealistically Fast Results

**Symptoms**: Benchmark completes in nanoseconds, results seem unrealistic

**Causes**:

- Function optimized away (no side effects)
- Return value not used

**Solutions**:

```ts
// Bad - might be optimized away
bench.add('test', () => {
	Math.sqrt(16);
});

// Good - capture result
let result;
bench.add('test', () => {
	result = Math.sqrt(16);
});

// Better - use result or make it observable
const results = [];
bench.add('test', () => {
	results.push(Math.sqrt(16));
});
```

### Inconsistent Results Between Runs

**Causes**:

- System load variations
- Not enough samples
- Non-deterministic code (random, timestamps, etc.)

**Solutions**:

```ts
// 1. Run multiple times and compare
// 2. Use consistent test data
const SEED = 12345;
const random = create_seeded_random(SEED);

// 3. Increase sample size
const bench = new Benchmark({
	duration_ms: 10000,
	min_iterations: 100,
});
```

### NaN Results

If results show NaN, check:

```ts
const results = bench.results();
for (const r of results) {
	console.log(r.stats.failed_iterations); // Should be 0
	console.log(r.stats.sample_size); // Should be > 0
}
```

Common causes: function throws errors, no valid samples collected, or all samples were outliers.

## V8 Optimization Considerations

Understanding how V8's JIT compiler works helps explain benchmark behavior.

### V8's Compilation Tiers

V8 (Node.js's JS engine) compiles code through multiple tiers:

1. **Ignition (Interpreter)**: First execution - interprets bytecode directly. Slowest but starts immediately.
2. **Sparkplug (Baseline)**: After a few calls - generates simple machine code without optimization. Fast startup, moderate performance.
3. **TurboFan (Optimizing)**: After many calls (~100-1000+) - generates highly optimized machine code based on type feedback. Fastest, but takes time to compile.

**Why this matters for benchmarks:**

- The first few iterations may be 10-100x slower than optimized code
- Warmup iterations allow V8 to reach TurboFan optimization before measurement
- Default 10 warmup iterations is sufficient for most functions, but complex ones may need more

**Recommendation**: For complex functions, use 20-50 warmup iterations:

```ts
const bench = new Benchmark({
	warmup_iterations: 50,
});
```

### Deoptimization

V8's TurboFan makes optimistic assumptions about types. If these assumptions are violated, V8 "deoptimizes" - falling back to slower code:

```ts
// This function might deoptimize if called with different types
function process(value) {
	return value.x + 1;
}

// V8 assumes 'value' is always the same shape
process({x: 1}); // Optimized for this shape
process({x: 2, y: 3}); // Different shape - may trigger deoptimization!
```

**Symptoms in benchmarks:**

- Sudden timing spikes mid-benchmark
- Inconsistent results between runs
- High variance that outlier detection doesn't fully explain

**Solutions:**

- Use consistent data types throughout the benchmark
- Ensure warmup uses representative data
- Check for "polymorphic" call sites (same function called with different types)

### Checking Optimization Status (Advanced)

For debugging, you can inspect V8's optimization status:

```bash
node --allow-natives-syntax your-benchmark.js
```

```ts
function check_optimization(fn) {
	// Force optimization attempt
	%OptimizeFunctionOnNextCall(fn);
	fn();

	const status = %GetOptimizationStatus(fn);
	// Status is a bitmask:
	// 1 = is function
	// 2 = is never optimized
	// 4 = is always optimized
	// 8 = is maybe deoptimized
	// 16 = is optimized
	// 32 = is optimized by TurboFan
	// 64 = is interpreted
	// 128 = is marked for optimization
	// 256 = is marked for concurrent optimization
	// 512 = is executing

	if (status & 16) console.log('Function is optimized');
	if (status & 64) console.log('Function is interpreted');
	if (status & 8) console.log('Function was deoptimized');
}
```

**Note**: `--allow-natives-syntax` exposes internal V8 functions and should only be used for debugging, not in production code.

### Timer Overhead

Each iteration requires two `timer.now()` calls. On Node.js with `process.hrtime.bigint()`, this overhead is typically 20-50ns. For functions taking:

- **>1μs**: Timer overhead is <5% - negligible
- **100ns-1μs**: Timer overhead is 5-50% - noticeable
- **<100ns**: Timer overhead dominates - consider batching (future feature)

The library pre-allocates the timing array to avoid GC pressure during measurement, but timer overhead cannot be eliminated.

### Other Sources of Variance

| Source                    | Impact                      | Mitigation                                           |
| ------------------------- | --------------------------- | ---------------------------------------------------- |
| **Garbage Collection**    | 1-100ms pauses              | Use `--expose-gc` and trigger between tasks          |
| **CPU Frequency Scaling** | Variable clock speed        | Let CPU warm up, disable turbo boost for consistency |
| **Background Processes**  | Sporadic interference       | Close other applications, check system load          |
| **Thermal Throttling**    | Performance drops over time | Allow cooling between benchmark runs                 |
| **Memory Pressure**       | GC triggers more frequently | Monitor memory usage, increase heap size             |
| **Cache Effects**         | Cold vs warm cache          | Warmup iterations, consistent data access patterns   |

For the most accurate results, run benchmarks on a quiet system with consistent conditions.
