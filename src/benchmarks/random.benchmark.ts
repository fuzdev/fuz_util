import {Benchmark} from '$lib/benchmark.js';
import {create_random_alea} from '$lib/random_alea.js';
import {create_random_xoshiro} from '$lib/random_xoshiro.js';

import {create_random_lcg, create_random_xorshift32} from '../test/random_test_helpers.js';

/* eslint-disable no-console */

const bench = new Benchmark({
	duration_ms: 5000,
	warmup_iterations: 10,
});

// create seeded instances
const alea = create_random_alea(42);
const xoshiro = create_random_xoshiro(42);
const lcg = create_random_lcg(42);
const xorshift = create_random_xorshift32(42);

// prevent dead-code elimination
let sink = 0;

bench
	.add('Math.random', () => {
		sink += Math.random();
	})
	.add('Alea', () => {
		sink += alea();
	})
	.add('Xoshiro128**', () => {
		sink += xoshiro();
	})
	.add('Xorshift32', () => {
		sink += xorshift();
	})
	.add('LCG', () => {
		sink += lcg();
	});

await bench.run();

console.log('\n📊 Random Benchmark Results\n');
console.log(bench.table());

console.log('\n📈 Summary\n');
console.log(bench.summary());

void sink;
