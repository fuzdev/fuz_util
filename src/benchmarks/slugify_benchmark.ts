import {Benchmark} from '$lib/benchmark.js';
import {slugify} from '$lib/path.js';

/* eslint-disable no-console */

/*

Benchmarks the slugify function using Belt's Benchmark class.

*/

/**
 * @see https://stackoverflow.com/questions/1053902/how-to-convert-a-title-to-a-url-slug-in-jquery/5782563#5782563
 */
const slugify_slower = (str: string): string => {
	let s = str.toLowerCase();
	for (const mapper of get_special_char_mappers()) {
		s = mapper(s);
	}
	return s
		.replace(/[^a-z0-9 -]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-');
};

const special_char_from = 'áäâàãåÆþčçćďđéěëèêẽĕȇğíìîïıňñóöòôõøðřŕšşßťúůüùûýÿž';
const special_char_to = 'aaaaaaabcccddeeeeeeeegiiiiinnooooooorrssstuuuuuyyz';
let special_char_mappers: Array<(s: string) => string> | undefined;
const get_special_char_mappers = (): Array<(s: string) => string> => {
	if (special_char_mappers) return special_char_mappers;
	special_char_mappers = [];
	for (let i = 0, j = special_char_from.length; i < j; i++) {
		special_char_mappers.push((s) =>
			s.replaceAll(special_char_from.charAt(i), special_char_to.charAt(i)),
		);
	}
	return special_char_mappers;
};

const bench = new Benchmark({
	duration_ms: 5000,
	warmup_iterations: 10,
});

const title = 'this Is a Test of Things to Do';

const results1: Array<string> = [];
const results2: Array<string> = [];
const results3: Array<string> = [];

bench
	.add('slugify current', () => {
		results1.push(slugify(title));
	})
	.add('slugify current without special characters', () => {
		results2.push(slugify(title, false));
	})
	.add('slugify slower', () => {
		results3.push(slugify_slower(title));
	});

await bench.run();

console.log('\n📊 Slugify Benchmark Results (Standard)\n');
console.log(bench.table());

console.log('\n📊 Detailed Results (with percentiles, min/max, relative performance)\n');
console.log(bench.table({detailed: true}));

console.log('\n📈 Summary\n');
console.log(bench.summary());

console.log('\n📋 JSON Export Available:\n');
console.log('  bench.json() - Full statistics in JSON format');
console.log('  bench.markdown() - Markdown table for documentation\n');

console.log('Verification:');
console.log(`results1.length: ${results1.length}`);
console.log(`results2.length: ${results2.length}`);
console.log(`results3.length: ${results3.length}`);
