# Benchmark Library

> Zero-dependency performance benchmarking for TypeScript/JavaScript

Comprehensive statistical analysis, percentile tracking, and rich output formatting.

## Quick Start

```ts
import {Benchmark} from '@fuzdev/fuz_util/benchmark.js';

const bench = new Benchmark({
	duration_ms: 5000, // Run each task for 5 seconds
	warmup_iterations: 10, // 10 warmup iterations
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

## Features

### 🎯 Comprehensive Statistics

- **Mean, median, standard deviation**
- **Percentiles** (p50, p90, p95, p99) for tail latency analysis
- **Min/max** times to spot variance
- **Outlier detection** using MAD (Median Absolute Deviation)
- **Confidence intervals** (95%)
- **Coefficient of variation** for consistency measurement

### 📊 Rich Output Formats

#### Standard Table

```ts
console.log(bench.table());
```

```
┌───────┬────────────┬────────────┬───────────┬──────────┬─────────┐
│ Index │ Task Name  │  ops/sec   │ Mean (μs) │  Margin  │ Samples │
├───────┼────────────┼────────────┼───────────┼──────────┼─────────┤
│   0   │ Array.map  │  1,237,144 │    0.81   │  ±3.00%  │   8576  │
│   1   │ for loop   │    261,619 │    3.82   │  ±0.84%  │   7903  │
└───────┴────────────┴────────────┴───────────┴──────────┴─────────┘
```

#### Detailed Table (with percentiles, min/max, relative performance)

```ts
console.log(bench.table({detailed: true}));
```

```
┌────┬────────────┬────────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│    │ Task Name  │  ops/sec   │ p50 (μs) │ p90 (μs) │ p95 (μs) │ p99 (μs) │ min (μs) │ max (μs) │ vs Best  │
├────┼────────────┼────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ 🐆 │ Array.map  │ 1,237,144  │   0.78   │   0.82   │   0.83   │   0.86   │   0.73   │   0.94   │ baseline │
│ 🐇 │ for loop   │   261,619  │   3.89   │   3.94   │   3.96   │   4.02   │   3.83   │   4.11   │   4.73x  │
└────┴────────────┴────────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
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
┌────┬────────────┬────────────┬───────────┬──────────┬─────────┬──────────┐
│    │ Task Name  │  ops/sec   │ Mean (μs) │  Margin  │ Samples │ vs Best  │
├────┼────────────┼────────────┼───────────┼──────────┼─────────┼──────────┤
│ 🐆 │ Array.map  │ 1,237,144  │    0.81   │  ±3.00%  │   8576  │ baseline │
└────┴────────────┴────────────┴───────────┴──────────┴─────────┴──────────┘

📦 LOOPS
┌────┬────────────┬────────────┬───────────┬──────────┬─────────┬──────────┐
│    │ Task Name  │  ops/sec   │ Mean (μs) │  Margin  │ Samples │ vs Best  │
├────┼────────────┼────────────┼───────────┼──────────┼─────────┼──────────┤
│ 🐇 │ for loop   │   261,619  │    3.82   │  ±0.84%  │   7903  │   4.73x  │
└────┴────────────┴────────────┴───────────┴──────────┴─────────┴──────────┘
```

#### Markdown Export

```ts
console.log(bench.markdown());
```

Perfect for documentation and GitHub.

#### JSON Export

```ts
console.log(bench.json()); // Pretty-printed
console.log(bench.json(false)); // Compact
```

Full statistics in JSON format for programmatic analysis, tracking trends over time, or integration with other tools.

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

	/** Warmup iterations before measuring (default: 5) */
	warmup_iterations?: number;

	/** Cooldown between tasks (default: 100ms) */
	cooldown_ms?: number;

	/** Minimum iterations (default: 10) */
	min_iterations?: number;

	/** Maximum iterations (default: 10000) */
	max_iterations?: number;

	/** Custom timer (default: auto-detect) */
	timer?: Timer;

	/** Callback after each iteration */
	on_iteration?: (task_name: string, iteration: number) => void;
}
```

## Advanced Usage

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

### Percentiles (p50, p90, p95, p99)

**What they are:**

- **p50 (median)**: 50% of operations complete faster than this
- **p90**: 90% of operations complete faster than this
- **p95**: 95% of operations complete faster than this
- **p99**: 99% of operations complete faster than this

Percentiles are calculated using the **R-7 linear interpolation method** (the default
in R, NumPy, and Excel). This interpolates between adjacent data points for more
accurate estimates, especially important with smaller sample sizes.

**Why they matter:**

- p50 shows typical performance
- p90-p99 reveal tail latency (worst-case scenarios)
- Critical for understanding user experience under load

**Example interpretation:**

```
p50: 100μs, p99: 500μs
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

## API Reference

### Benchmark Class

```ts
class Benchmark {
	constructor(config?: BenchmarkConfig);
	add(name: string, fn: () => unknown): this;
	add(task: BenchmarkTask): this;
	run(): Promise<Array<BenchmarkResult>>;
	table(options?: BenchmarkTableOptions): string;
	markdown(): string;
	json(pretty?: boolean): string;
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
}

interface BenchmarkResult {
	name: string;
	stats: BenchmarkStats;
	iterations: number;
	total_time_ms: number;
	/** Present if the task threw an error during execution */
	error?: Error;
}
```

**Handling errors**: If a benchmark task throws an error, it's captured in the result
rather than stopping the entire suite. Check for errors when processing results:

```ts
const results = await bench.run();
for (const result of results) {
	if (result.error) {
		console.error(`Task "${result.name}" failed:`, result.error.message);
		continue;
	}
	console.log(`${result.name}: ${result.stats.ops_per_second} ops/sec`);
}
```

```ts
interface BenchmarkTableOptions {
	detailed?: boolean;
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
	median_ns: number;
	std_dev_ns: number;
	min_ns: number;
	max_ns: number;
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
```

## Tips for Accurate Benchmarks

1. **Run for sufficient time**: At least 1-5 seconds per task
2. **Use warmup iterations**: Let JIT compile the code first (5-10 iterations)
3. **Close other applications**: Reduce CPU contention
4. **Run multiple times**: Compare results across runs for consistency
5. **Check p99 percentile**: Don't just look at averages
6. **Use GC control**: Trigger GC between tasks for fairness
7. **Avoid side effects**: Don't modify external state in benchmarks
8. **Test realistic workloads**: Use real data, not just toy examples

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

Async functions are automatically detected during warmup. Ensure consistent return types:

```ts
// Good: Always sync or always async
bench.add('async', async () => await fetch(url));
bench.add('sync', () => compute(data));

// Avoid: Mixed sync/async returns
bench.add('mixed', () => (cached ? cached : fetch(url))); // May not await!
```

### Memory Considerations

Large benchmark suites can accumulate significant memory:

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
