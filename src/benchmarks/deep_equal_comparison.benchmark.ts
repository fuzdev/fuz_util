import {Benchmark} from '$lib/benchmark.js';
import {dequal} from 'dequal';
import fastDeepEqual from 'fast-deep-equal';

import {deep_equal} from '$lib/deep_equal.js';

/* eslint-disable no-console */

// Benchmark deep_equal vs popular libraries: dequal and fast-deep-equal
// Focus: Common use cases to understand relative performance

const bench = new Benchmark({
	duration_ms: 1000, // 1000ms per benchmark for good balance of accuracy and memory usage
	warmup_iterations: 5,
	on_iteration: () => {
		// Trigger GC between iterations if available (requires --expose-gc flag)
		if (globalThis.gc) globalThis.gc();
	},
});

// =============================================================================
// Test data - comprehensive coverage of realistic patterns and sizes
// =============================================================================

// Arrays: small baseline (1, 3), then representative larger sizes
const arr_1 = [1];
const arr_1_copy = [1];
const arr_3 = [1, 2, 3];
const arr_3_copy = [1, 2, 3];
const arr_10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const arr_10_copy = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const arr_50 = Array.from({length: 50}, (_, i) => i);
const arr_50_copy = Array.from({length: 50}, (_, i) => i);
const arr_100 = Array.from({length: 100}, (_, i) => i);
const arr_100_copy = Array.from({length: 100}, (_, i) => i);
const arr_500 = Array.from({length: 500}, (_, i) => i);
const arr_500_copy = Array.from({length: 500}, (_, i) => i);

// Objects: small baseline (1, 3), then realistic larger sizes
const obj_1_a = {a: 1};
const obj_1_b = {a: 1};
const obj_3_a = {a: 1, b: 2, c: 3};
const obj_3_b = {a: 1, b: 2, c: 3};
const obj_10_a: Record<string, number> = {};
const obj_10_b: Record<string, number> = {};
for (let i = 0; i < 10; i++) {
	obj_10_a[`key_${i}`] = i;
	obj_10_b[`key_${i}`] = i;
}
const obj_20_a: Record<string, number> = {};
const obj_20_b: Record<string, number> = {};
for (let i = 0; i < 20; i++) {
	obj_20_a[`key_${i}`] = i;
	obj_20_b[`key_${i}`] = i;
}
const obj_50_a: Record<string, number> = {};
const obj_50_b: Record<string, number> = {};
for (let i = 0; i < 50; i++) {
	obj_50_a[`key_${i}`] = i;
	obj_50_b[`key_${i}`] = i;
}
const obj_100_a: Record<string, number> = {};
const obj_100_b: Record<string, number> = {};
for (let i = 0; i < 100; i++) {
	obj_100_a[`key_${i}`] = i;
	obj_100_b[`key_${i}`] = i;
}

// Mixed structures: real-world patterns
const arr_of_objs_a = Array.from({length: 10}, (_, i) => ({
	id: i,
	name: `item_${i}`,
	value: i * 10,
}));
const arr_of_objs_b = Array.from({length: 10}, (_, i) => ({
	id: i,
	name: `item_${i}`,
	value: i * 10,
}));

const obj_with_arrays_a = {
	tags: ['javascript', 'typescript', 'node'],
	scores: [98, 87, 92, 88],
	meta: {created: '2024-01-15', updated: '2024-01-20'},
};
const obj_with_arrays_b = {
	tags: ['javascript', 'typescript', 'node'],
	scores: [98, 87, 92, 88],
	meta: {created: '2024-01-15', updated: '2024-01-20'},
};

const nested_shallow_a = {data: {user: {id: 1, name: 'alice'}}};
const nested_shallow_b = {data: {user: {id: 1, name: 'alice'}}};

const nested_deep_a = {a: {b: {c: {d: {e: 'deep'}}}}};
const nested_deep_b = {a: {b: {c: {d: {e: 'deep'}}}}};

// TypedArrays
const uint8 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const uint8_copy = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

// Other types
const date_a = new Date('2024-01-15');
const date_b = new Date('2024-01-15');

// ArrayBuffer
const ab_a = new ArrayBuffer(64);
const ab_b = new ArrayBuffer(64);
const ab_view_a = new Uint8Array(ab_a);
const ab_view_b = new Uint8Array(ab_b);
for (let i = 0; i < 64; i++) {
	ab_view_a[i] = i % 256;
	ab_view_b[i] = i % 256;
}

// Constructor mismatch (fast-fail case)
const empty_obj = {};
const empty_arr: Array<any> = [];

// =============================================================================
// Arrays - granular small sizes to detect performance cliffs
// =============================================================================

bench.add('array (1 element): deep_equal', () => deep_equal(arr_1, arr_1_copy));
bench.add('array (1 element): dequal', () => dequal(arr_1, arr_1_copy));
bench.add('array (1 element): fast-deep-equal', () => fastDeepEqual(arr_1, arr_1_copy));

bench.add('array (3 elements): deep_equal', () => deep_equal(arr_3, arr_3_copy));
bench.add('array (3 elements): dequal', () => dequal(arr_3, arr_3_copy));
bench.add('array (3 elements): fast-deep-equal', () => fastDeepEqual(arr_3, arr_3_copy));

bench.add('array (10 elements): deep_equal', () => deep_equal(arr_10, arr_10_copy));
bench.add('array (10 elements): dequal', () => dequal(arr_10, arr_10_copy));
bench.add('array (10 elements): fast-deep-equal', () => fastDeepEqual(arr_10, arr_10_copy));

bench.add('array (50 elements): deep_equal', () => deep_equal(arr_50, arr_50_copy));
bench.add('array (50 elements): dequal', () => dequal(arr_50, arr_50_copy));
bench.add('array (50 elements): fast-deep-equal', () => fastDeepEqual(arr_50, arr_50_copy));

bench.add('array (100 elements): deep_equal', () => deep_equal(arr_100, arr_100_copy));
bench.add('array (100 elements): dequal', () => dequal(arr_100, arr_100_copy));
bench.add('array (100 elements): fast-deep-equal', () => fastDeepEqual(arr_100, arr_100_copy));

bench.add('array (500 elements): deep_equal', () => deep_equal(arr_500, arr_500_copy));
bench.add('array (500 elements): dequal', () => dequal(arr_500, arr_500_copy));
bench.add('array (500 elements): fast-deep-equal', () => fastDeepEqual(arr_500, arr_500_copy));

// =============================================================================
// Objects - granular small sizes + realistic larger sizes
// =============================================================================

bench.add('object (1 prop): deep_equal', () => deep_equal(obj_1_a, obj_1_b));
bench.add('object (1 prop): dequal', () => dequal(obj_1_a, obj_1_b));
bench.add('object (1 prop): fast-deep-equal', () => fastDeepEqual(obj_1_a, obj_1_b));

bench.add('object (3 props): deep_equal', () => deep_equal(obj_3_a, obj_3_b));
bench.add('object (3 props): dequal', () => dequal(obj_3_a, obj_3_b));
bench.add('object (3 props): fast-deep-equal', () => fastDeepEqual(obj_3_a, obj_3_b));

bench.add('object (10 props): deep_equal', () => deep_equal(obj_10_a, obj_10_b));
bench.add('object (10 props): dequal', () => dequal(obj_10_a, obj_10_b));
bench.add('object (10 props): fast-deep-equal', () => fastDeepEqual(obj_10_a, obj_10_b));

bench.add('object (20 props): deep_equal', () => deep_equal(obj_20_a, obj_20_b));
bench.add('object (20 props): dequal', () => dequal(obj_20_a, obj_20_b));
bench.add('object (20 props): fast-deep-equal', () => fastDeepEqual(obj_20_a, obj_20_b));

bench.add('object (50 props): deep_equal', () => deep_equal(obj_50_a, obj_50_b));
bench.add('object (50 props): dequal', () => dequal(obj_50_a, obj_50_b));
bench.add('object (50 props): fast-deep-equal', () => fastDeepEqual(obj_50_a, obj_50_b));

bench.add('object (100 props): deep_equal', () => deep_equal(obj_100_a, obj_100_b));
bench.add('object (100 props): dequal', () => dequal(obj_100_a, obj_100_b));
bench.add('object (100 props): fast-deep-equal', () => fastDeepEqual(obj_100_a, obj_100_b));

// =============================================================================
// Mixed structures - real-world patterns
// =============================================================================

bench.add('array of objects (10 items): deep_equal', () =>
	deep_equal(arr_of_objs_a, arr_of_objs_b),
);
bench.add('array of objects (10 items): dequal', () => dequal(arr_of_objs_a, arr_of_objs_b));
bench.add('array of objects (10 items): fast-deep-equal', () =>
	fastDeepEqual(arr_of_objs_a, arr_of_objs_b),
);

bench.add('object with arrays: deep_equal', () => deep_equal(obj_with_arrays_a, obj_with_arrays_b));
bench.add('object with arrays: dequal', () => dequal(obj_with_arrays_a, obj_with_arrays_b));
bench.add('object with arrays: fast-deep-equal', () =>
	fastDeepEqual(obj_with_arrays_a, obj_with_arrays_b),
);

bench.add('nested shallow (2 levels): deep_equal', () =>
	deep_equal(nested_shallow_a, nested_shallow_b),
);
bench.add('nested shallow (2 levels): dequal', () => dequal(nested_shallow_a, nested_shallow_b));
bench.add('nested shallow (2 levels): fast-deep-equal', () =>
	fastDeepEqual(nested_shallow_a, nested_shallow_b),
);

bench.add('nested deep (5 levels): deep_equal', () => deep_equal(nested_deep_a, nested_deep_b));
bench.add('nested deep (5 levels): dequal', () => dequal(nested_deep_a, nested_deep_b));
bench.add('nested deep (5 levels): fast-deep-equal', () =>
	fastDeepEqual(nested_deep_a, nested_deep_b),
);

// =============================================================================
// TypedArrays and binary data
// =============================================================================

bench.add('typed array (10 elements): deep_equal', () => deep_equal(uint8, uint8_copy));
bench.add('typed array (10 elements): dequal', () => dequal(uint8, uint8_copy));
bench.add('typed array (10 elements): fast-deep-equal', () => fastDeepEqual(uint8, uint8_copy));

bench.add('ArrayBuffer (64 bytes): deep_equal', () => deep_equal(ab_a, ab_b));
bench.add('ArrayBuffer (64 bytes): dequal', () => dequal(ab_a, ab_b));
bench.add('ArrayBuffer (64 bytes): fast-deep-equal', () => fastDeepEqual(ab_a, ab_b));

// =============================================================================
// Other types
// =============================================================================

bench.add('Date: deep_equal', () => deep_equal(date_a, date_b));
bench.add('Date: dequal', () => dequal(date_a, date_b));
bench.add('Date: fast-deep-equal', () => fastDeepEqual(date_a, date_b));

// =============================================================================
// Fast-fail cases
// =============================================================================

bench.add('constructor mismatch {} vs []: deep_equal', () => deep_equal(empty_obj, empty_arr));
bench.add('constructor mismatch {} vs []: dequal', () => dequal(empty_obj, empty_arr));
bench.add('constructor mismatch {} vs []: fast-deep-equal', () =>
	fastDeepEqual(empty_obj, empty_arr),
);

// =============================================================================
// Run and report
// =============================================================================

await bench.run();

const results = bench.results();

// Group results by test case
const groups: Map<string, Array<any>> = new Map();
for (const result of results) {
	const [testCase, library] = result.name.split(': ');
	if (!groups.has(testCase!)) {
		groups.set(testCase!, []);
	}
	groups.get(testCase!)!.push({
		library,
		hz: result.stats.ops_per_second,
		mean_ns: result.stats.mean_ns,
	});
}

console.log('\n📊 Library Comparison: deep_equal vs dequal vs fast-deep-equal\n');

for (const [testCase, results] of groups) {
	console.log(`\n${testCase}:`);

	// Sort by speed (fastest first)
	results.sort((a, b) => b.hz - a.hz);

	const fastest = results[0];
	for (const result of results) {
		const ratio = fastest.hz / result.hz;
		const speed_marker = result === fastest ? '🏆' : '  ';
		const ops_per_sec = result.hz.toFixed(0).padStart(10);
		const relative = ratio === 1 ? 'baseline' : `${ratio.toFixed(2)}x slower`;

		console.log(
			`  ${speed_marker} ${result.library.padEnd(20)} ${ops_per_sec} ops/sec  (${relative})`,
		);
	}
}

console.log('\n📈 Summary:\n');

// Overall stats per library
const library_stats: Map<string, {total_hz: number; wins: number; count: number}> = new Map();
for (const result of results) {
	const library = result.name.split(': ')[1]!;
	if (!library_stats.has(library)) {
		library_stats.set(library, {total_hz: 0, wins: 0, count: 0});
	}
	const stats = library_stats.get(library)!;
	stats.total_hz += result.stats.ops_per_second;
	stats.count++;
}

// Count wins
for (const [, results] of groups) {
	const fastest = results.reduce((a, b) => (a.hz > b.hz ? a : b));
	library_stats.get(fastest.library)!.wins++;
}

for (const [library, stats] of library_stats) {
	const avg_hz = stats.total_hz / stats.count;
	console.log(
		`  ${library.padEnd(20)} avg: ${avg_hz.toFixed(0).padStart(10)} ops/sec  |  wins: ${stats.wins}/${groups.size}`,
	);
}

console.log('');
