import {Benchmark} from '$lib/benchmark.js';
import {deep_equal} from '$lib/deep_equal.js';

/* eslint-disable no-console, no-new-wrappers */

// Benchmark deep_equal performance across common use cases
// Focus: constructor check overhead, instanceof optimization potential, typed arrays

const bench = new Benchmark({
	duration_ms: 1000, // 1000ms per benchmark for good balance of accuracy and memory usage
	warmup_iterations: 10, // Warmup iterations before measuring
});

// =============================================================================
// 1. FAST PATHS (should be nanoseconds - baseline)
// =============================================================================

const obj = {a: 1, b: 2, c: 3};
const arr = [1, 2, 3, 4, 5];

bench.add('same reference (fastest path)', () => {
	deep_equal(obj, obj);
});

bench.add('primitives: numbers equal', () => {
	deep_equal(42, 42);
});

bench.add('primitives: numbers not equal', () => {
	deep_equal(42, 43);
});

bench.add('constructor mismatch: {} vs []', () => {
	deep_equal({}, []);
});

bench.add('constructor mismatch: array vs object', () => {
	deep_equal(arr, obj);
});

// =============================================================================
// 2. COMMON CASES (microseconds - typical usage)
// =============================================================================

const small_obj_a = {id: 1, name: 'alice', active: true, count: 42, tags: ['a', 'b']};
const small_obj_b = {id: 1, name: 'alice', active: true, count: 42, tags: ['a', 'b']};
const small_obj_c = {id: 1, name: 'alice', active: true, count: 99, tags: ['a', 'b']};

bench.add('small object: equal (5 props, 1 nested array)', () => {
	deep_equal(small_obj_a, small_obj_b);
});

bench.add('small object: not equal (different value)', () => {
	deep_equal(small_obj_a, small_obj_c);
});

const small_arr_a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const small_arr_b = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const small_arr_c = [1, 2, 3, 4, 5, 6, 7, 8, 9, 99];

bench.add('small array: equal (10 elements)', () => {
	deep_equal(small_arr_a, small_arr_b);
});

bench.add('small array: not equal (last element)', () => {
	deep_equal(small_arr_a, small_arr_c);
});

// =============================================================================
// 3. TYPED ARRAYS (the TODO focus!)
// =============================================================================

const uint8_a = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const uint8_b = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const uint8_c = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 99]);
const int8_a = new Int8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const float64_a = new Float64Array([1.1, 2.2, 3.3, 4.4, 5.5]);
const float64_b = new Float64Array([1.1, 2.2, 3.3, 4.4, 5.5]);

bench.add('typed array: Uint8Array equal (10 elements)', () => {
	deep_equal(uint8_a, uint8_b);
});

bench.add('typed array: Uint8Array not equal', () => {
	deep_equal(uint8_a, uint8_c);
});

bench.add('typed array: different types (constructor check)', () => {
	deep_equal(uint8_a, int8_a);
});

bench.add('typed array: Float64Array equal', () => {
	deep_equal(float64_a, float64_b);
});

const large_uint8_a = new Uint8Array(1000);
const large_uint8_b = new Uint8Array(1000);
for (let i = 0; i < 1000; i++) {
	large_uint8_a[i] = i % 256;
	large_uint8_b[i] = i % 256;
}

bench.add('typed array: large Uint8Array (1000 elements)', () => {
	deep_equal(large_uint8_a, large_uint8_b);
});

// =============================================================================
// 4. NEW BUG FIXES (verify no performance regression)
// =============================================================================

const date_a = new Date('2024-01-15T10:30:00Z');
const date_b = new Date('2024-01-15T10:30:00Z');
const date_c = new Date('2024-01-16T10:30:00Z');

bench.add('Date: equal timestamps', () => {
	deep_equal(date_a, date_b);
});

bench.add('Date: different timestamps', () => {
	deep_equal(date_a, date_c);
});

const ab_a = new ArrayBuffer(64);
const ab_b = new ArrayBuffer(64);
const ab_c = new ArrayBuffer(128);
const ab_view_a = new Uint8Array(ab_a);
const ab_view_b = new Uint8Array(ab_b);
for (let i = 0; i < 64; i++) {
	ab_view_a[i] = i % 256;
	ab_view_b[i] = i % 256;
}

bench.add('ArrayBuffer: equal (64 bytes)', () => {
	deep_equal(ab_a, ab_b);
});

bench.add('ArrayBuffer: different lengths', () => {
	deep_equal(ab_a, ab_c);
});

const large_ab_a = new ArrayBuffer(1024);
const large_ab_b = new ArrayBuffer(1024);
const large_ab_view_a = new Uint8Array(large_ab_a);
const large_ab_view_b = new Uint8Array(large_ab_b);
for (let i = 0; i < 1024; i++) {
	large_ab_view_a[i] = i % 256;
	large_ab_view_b[i] = i % 256;
}

bench.add('ArrayBuffer: large (1KB)', () => {
	deep_equal(large_ab_a, large_ab_b);
});

const err_a = new Error('test message');
const err_b = new Error('test message');
const err_c = new Error('different message');

bench.add('Error: equal messages', () => {
	deep_equal(err_a, err_b);
});

bench.add('Error: different messages', () => {
	deep_equal(err_a, err_c);
});

const boxed_num_a = new Number(42);
const boxed_num_b = new Number(42);
const boxed_num_c = new Number(99);

bench.add('boxed Number: equal values', () => {
	deep_equal(boxed_num_a, boxed_num_b);
});

bench.add('boxed Number: different values', () => {
	deep_equal(boxed_num_a, boxed_num_c);
});

// =============================================================================
// 5. NESTED STRUCTURES (recursive performance)
// =============================================================================

const nested_2_levels = {
	a: {x: 1, y: 2},
	b: {x: 3, y: 4},
	c: {x: 5, y: 6},
};
const nested_2_levels_copy = {
	a: {x: 1, y: 2},
	b: {x: 3, y: 4},
	c: {x: 5, y: 6},
};

bench.add('nested object: 2 levels', () => {
	deep_equal(nested_2_levels, nested_2_levels_copy);
});

const nested_5_levels = {a: {b: {c: {d: {e: {f: 'deep'}}}}}};
const nested_5_levels_copy = {a: {b: {c: {d: {e: {f: 'deep'}}}}}};

bench.add('nested object: 5 levels deep', () => {
	deep_equal(nested_5_levels, nested_5_levels_copy);
});

// =============================================================================
// 6. STRESS TESTS (worst case performance)
// =============================================================================

const large_obj: Record<string, number> = {};
const large_obj_copy: Record<string, number> = {};
for (let i = 0; i < 100; i++) {
	large_obj[`key_${i}`] = i;
	large_obj_copy[`key_${i}`] = i;
}

bench.add('large object: 100 properties', () => {
	deep_equal(large_obj, large_obj_copy);
});

const large_arr_a = Array.from({length: 1000}, (_, i) => i);
const large_arr_b = Array.from({length: 1000}, (_, i) => i);

bench.add('large array: 1000 elements', () => {
	deep_equal(large_arr_a, large_arr_b);
});

// =============================================================================
// 7. COLLECTIONS (Map, Set)
// =============================================================================

const map_a = new Map([
	['a', 1],
	['b', 2],
	['c', 3],
]);
const map_b = new Map([
	['a', 1],
	['b', 2],
	['c', 3],
]);

bench.add('Map: equal (3 entries)', () => {
	deep_equal(map_a, map_b);
});

const set_a = new Set([1, 2, 3, 4, 5]);
const set_b = new Set([1, 2, 3, 4, 5]);

bench.add('Set: equal (5 elements)', () => {
	deep_equal(set_a, set_b);
});

// =============================================================================
// Run and report
// =============================================================================

await bench.run();

console.log('\n📊 deep_equal Performance Benchmarks\n');
console.log(bench.table());

console.log('\n📊 Grouped by Category (Detailed)\n');
const groups: Array<import('$lib/benchmark.js').BenchmarkGroup> = [
	{
		name: 'FAST PATHS (baseline)',
		filter: (r) =>
			r.name.includes('same reference') ||
			r.name.includes('primitives') ||
			r.name.includes('constructor mismatch'),
	},
	{name: 'SMALL DATA STRUCTURES', filter: (r) => r.name.startsWith('small ')},
	{name: 'TYPED ARRAYS', filter: (r) => r.name.startsWith('typed array')},
	{
		name: 'SPECIAL TYPES (Date, Error, etc.)',
		filter: (r) =>
			r.name.includes('Date:') ||
			r.name.includes('Error:') ||
			r.name.includes('ArrayBuffer') ||
			r.name.includes('boxed'),
	},
	{name: 'NESTED STRUCTURES', filter: (r) => r.name.startsWith('nested ')},
	{name: 'STRESS TESTS', filter: (r) => r.name.startsWith('large ')},
	{name: 'COLLECTIONS', filter: (r) => r.name.includes('Map:') || r.name.includes('Set:')},
];
console.log(bench.table({groups}));

console.log('\n📈 Summary\n');
console.log(bench.summary());
