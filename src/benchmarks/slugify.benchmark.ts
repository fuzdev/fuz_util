import {Benchmark} from '$lib/benchmark.js';
import {slugify} from '$lib/path.js';

/* eslint-disable no-console */

const bench = new Benchmark({
	duration_ms: 5000,
	warmup_iterations: 10,
});

const title = 'this Is a Test of Things to Do';

const results1: Array<string> = [];
const results2: Array<string> = [];

bench
	.add('slugify', () => {
		results1.push(slugify(title));
	})
	.add('slugify without special characters', () => {
		results2.push(slugify(title, false));
	});

await bench.run();

console.log('\n📊 Slugify Benchmark Results\n');
console.log(bench.table({detailed: true}));

console.log('\n📈 Summary\n');
console.log(bench.summary());

console.log('\nVerification:');
console.log(`results1.length: ${results1.length}`);
console.log(`results2.length: ${results2.length}`);
