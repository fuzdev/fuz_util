import {Benchmark} from '$lib/benchmark.js';
import {create_random_alea} from '$lib/random_alea.js';

import {
	create_random_lcg,
	create_random_xorshift32,
	create_random_middle_square,
} from '../test/random_test_helpers.js';

/* eslint-disable no-console */

const bench = new Benchmark({
	duration_ms: 5000,
	warmup_iterations: 10,
});

// create seeded instances
const alea = create_random_alea(42);
const lcg = create_random_lcg(42);
const xorshift = create_random_xorshift32(42);
const middle_square = create_random_middle_square(1234);

// prevent dead-code elimination
let sink = 0;

bench
	.add('Math.random', () => {
		sink += Math.random();
	})
	.add('Alea', () => {
		sink += alea();
	})
	.add('Xorshift32', () => {
		sink += xorshift();
	})
	.add('LCG', () => {
		sink += lcg();
	})
	.add('Middle Square', () => {
		sink += middle_square();
	});

await bench.run();

console.log('\n📊 Random Benchmark Results\n');
console.log(bench.table());

console.log('\n📈 Summary\n');
console.log(bench.summary());

void sink;
