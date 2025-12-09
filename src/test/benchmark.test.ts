/* eslint-disable @typescript-eslint/no-empty-function */

import {test} from 'vitest';

import {Benchmark} from '$lib/benchmark.js';
import {wait} from '$lib/async.js';
import type {Timer} from '$lib/time.js';

test('Benchmark: basic usage with string name', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 100,
		min_iterations: 5,
		warmup_iterations: 2,
	});

	let count = 0;
	bench.add('test', () => {
		count++;
	});

	const results = await bench.run();

	expect(results).toHaveLength(1);
	expect(results[0]!.name).toBe('test');
	expect(results[0]!.iterations).toBeGreaterThanOrEqual(5);
	expect(results[0]!.stats.mean_ns).toBeGreaterThan(0);
	expect(count).toBeGreaterThan(0);
});

test('Benchmark: chaining multiple tasks', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
	});

	bench
		.add('task 1', () => 1 + 1)
		.add('task 2', () => 2 + 2)
		.add('task 3', () => 3 + 3);

	const results = await bench.run();

	expect(results).toHaveLength(3);
	expect(results[0]!.name).toBe('task 1');
	expect(results[1]!.name).toBe('task 2');
	expect(results[2]!.name).toBe('task 3');
});

test('Benchmark: with task object', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
	});

	bench.add({
		name: 'object task',
		fn: () => {
			return 42;
		},
	});

	const results = await bench.run();

	expect(results).toHaveLength(1);
	expect(results[0]!.name).toBe('object task');
});

test('Benchmark: with setup and teardown', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
	});

	let setup_called = false;
	let teardown_called = false;
	let value = 0;

	bench.add({
		name: 'with setup',
		setup: () => {
			setup_called = true;
			value = 42;
		},
		fn: () => {
			return value * 2;
		},
		teardown: () => {
			teardown_called = true;
			value = 0;
		},
	});

	await bench.run();

	expect(setup_called).toBe(true);
	expect(teardown_called).toBe(true);
	expect(value).toBe(0);
});

test('Benchmark: async setup/teardown', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
	});

	let data: string | null = null;

	bench.add({
		name: 'async task',
		setup: async () => {
			await wait(5);
			data = 'loaded';
		},
		fn: async () => {
			await wait(1);
			return data;
		},
		teardown: async () => {
			await wait(5);
			data = null;
		},
	});

	await bench.run();

	expect(data).toBe(null);
});

test('Benchmark: on_iteration callback', async ({expect}) => {
	const cycles: Array<{name: string; iteration: number}> = [];

	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 5,
		warmup_iterations: 0,
		on_iteration: (name, iteration) => {
			cycles.push({name, iteration});
		},
	});

	bench.add('test', () => 1 + 1);

	await bench.run();

	expect(cycles.length).toBeGreaterThanOrEqual(5);
	expect(cycles[0]!.name).toBe('test');
	expect(cycles[0]!.iteration).toBe(1);
	expect(cycles[4]!.iteration).toBe(5);
});

test('Benchmark: custom timer', async ({expect}) => {
	let counter = 0;
	const custom_timer: Timer = {
		now: () => {
			counter += 10_000_000; // 10ms in ns
			return counter;
		},
	};

	const bench = new Benchmark({
		timer: custom_timer,
		duration_ms: 100,
		min_iterations: 5,
		warmup_iterations: 0,
		cooldown_ms: 0,
	});

	bench.add('test', () => {});

	const results = await bench.run();

	expect(results).toHaveLength(1);
	expect(counter).toBeGreaterThan(0);
});

test('Benchmark: respects min_iterations', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 1,
		min_iterations: 20,
		warmup_iterations: 0,
	});

	bench.add('test', () => {});

	const results = await bench.run();

	expect(results[0]!.iterations).toBeGreaterThanOrEqual(20);
});

test('Benchmark: respects max_iterations', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 10000,
		min_iterations: 5,
		max_iterations: 10,
		warmup_iterations: 0,
	});

	bench.add('test', () => {});

	const results = await bench.run();

	expect(results[0]!.iterations).toBeLessThanOrEqual(10);
});

test('Benchmark: table() output', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 5,
	});

	bench.add('task 1', () => 1 + 1).add('task 2', () => 2 + 2);

	await bench.run();
	const table = bench.table();

	expect(table).toContain('task 1');
	expect(table).toContain('task 2');
	expect(table).toContain('ops/sec');
	expect(table).toContain('p50');
	expect(table).toContain('vs Best');
});

test('Benchmark: markdown() output', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 5,
	});

	bench.add('task 1', () => 1 + 1);

	await bench.run();
	const md = bench.markdown();

	expect(md).toContain('task 1');
	expect(md).toContain('|');
	expect(md).toContain('ops/sec');
});

test('Benchmark: json() output', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 5,
	});

	bench.add('task 1', () => 1 + 1);

	await bench.run();
	const json = bench.json();

	expect(json).toContain('task 1');
	expect(json).toContain('ops_per_second');
	expect(json).toContain('mean_ns');

	const parsed = JSON.parse(json);
	expect(parsed).toHaveLength(1);
	expect(parsed[0].name).toBe('task 1');
});

test('Benchmark: results() returns a copy', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 5,
	});

	bench.add('test', () => {});

	await bench.run();
	const results1 = bench.results();
	const results2 = bench.results();

	// Should be equal content but different references (shallow copy)
	expect(results1).not.toBe(results2);
	expect(results1).toEqual(results2);
	expect(results1).toHaveLength(1);

	// Mutating the copy should not affect internal state
	results1.length = 0;
	expect(bench.results()).toHaveLength(1);
});

test('Benchmark: cooldown between tasks', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
		cooldown_ms: 20,
	});

	bench.add('task 1', () => {}).add('task 2', () => {});

	const start = Date.now();
	await bench.run();
	const elapsed = Date.now() - start;

	expect(elapsed).toBeGreaterThanOrEqual(18);
});

test('Benchmark: warmup iterations', async ({expect}) => {
	let count = 0;

	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 5,
		warmup_iterations: 10,
	});

	bench.add('test', () => {
		count++;
	});

	await bench.run();

	expect(count).toBeGreaterThanOrEqual(15);
});

test('Benchmark: error in add() without fn', ({expect}) => {
	const bench = new Benchmark();

	expect(() => {
		// @ts-expect-error - Testing runtime error
		bench.add('test');
	}).toThrow('Function required');
});

test('Benchmark: error on duplicate task name', ({expect}) => {
	const bench = new Benchmark();

	bench.add('test', () => {});

	expect(() => {
		bench.add('test', () => {});
	}).toThrow('Task "test" already exists');

	// Also works with task object
	expect(() => {
		bench.add({name: 'test', fn: () => {}});
	}).toThrow('Task "test" already exists');
});

test('Benchmark: reset() clears results but keeps tasks', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
	});

	bench.add('test', () => 1 + 1);

	await bench.run();
	expect(bench.results()).toHaveLength(1);

	bench.reset();
	expect(bench.results()).toHaveLength(0);

	// Tasks are preserved, can run again
	await bench.run();
	expect(bench.results()).toHaveLength(1);
});

test('Benchmark: clear() clears results and tasks', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
	});

	bench.add('test', () => 1 + 1);

	await bench.run();
	expect(bench.results()).toHaveLength(1);

	bench.clear();
	expect(bench.results()).toHaveLength(0);

	// Tasks are cleared, running produces no results
	await bench.run();
	expect(bench.results()).toHaveLength(0);
});

test('Benchmark: sync vs async detection', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 5,
	});

	let sync_count = 0;
	let async_count = 0;

	// Sync function
	bench.add('sync', () => {
		sync_count++;
	});

	// Async function
	bench.add('async', async () => {
		async_count++;
		await Promise.resolve();
	});

	await bench.run();

	expect(sync_count).toBeGreaterThan(0);
	expect(async_count).toBeGreaterThan(0);
	expect(bench.results()).toHaveLength(2);
});

test('Benchmark: handles function that returns a value', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 5,
	});

	bench.add('returns number', () => 42);
	bench.add('returns object', () => ({foo: 'bar'}));
	bench.add('returns promise', () => Promise.resolve('result'));

	const results = await bench.run();

	expect(results).toHaveLength(3);
	results.forEach((r) => {
		expect(r.stats.mean_ns).toBeGreaterThan(0);
		expect(r.iterations).toBeGreaterThanOrEqual(5);
	});
});

test('Benchmark: captures errors without stopping suite', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
		warmup_iterations: 0,
	});

	bench.add('succeeds', () => 1 + 1);
	bench.add('fails', () => {
		throw new Error('test error');
	});
	bench.add('also succeeds', () => 2 + 2);

	const results = await bench.run();

	// All tasks run despite error
	expect(results).toHaveLength(3);

	// First task succeeded
	expect(results[0]!.error).toBeUndefined();
	expect(results[0]!.iterations).toBeGreaterThan(0);

	// Second task failed
	expect(results[1]!.error).toBeDefined();
	expect(results[1]!.error!.message).toBe('test error');

	// Third task succeeded
	expect(results[2]!.error).toBeUndefined();
	expect(results[2]!.iterations).toBeGreaterThan(0);
});

test('Benchmark: error in setup still runs teardown', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
	});

	let teardown_called = false;

	bench.add({
		name: 'setup fails',
		setup: () => {
			throw new Error('setup error');
		},
		fn: () => 1 + 1,
		teardown: () => {
			teardown_called = true;
		},
	});

	const results = await bench.run();

	expect(results[0]!.error).toBeDefined();
	expect(results[0]!.error!.message).toBe('setup error');
	// Teardown not called because setup didn't complete
	expect(teardown_called).toBe(false);
});

test('Benchmark: teardown runs even when fn throws', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 1,
		warmup_iterations: 0,
	});

	let teardown_called = false;

	bench.add({
		name: 'fn fails',
		setup: () => {},
		fn: () => {
			throw new Error('fn error');
		},
		teardown: () => {
			teardown_called = true;
		},
	});

	const results = await bench.run();

	expect(results[0]!.error).toBeDefined();
	expect(results[0]!.error!.message).toBe('fn error');
	// Teardown should be called because setup completed
	expect(teardown_called).toBe(true);
});

test('Benchmark: table() with groups', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
	});

	bench
		.add('[fast] operation 1', () => 1 + 1)
		.add('[fast] operation 2', () => 2 + 2)
		.add('[slow] operation 1', () => {
			let sum = 0;
			for (let i = 0; i < 100; i++) sum += i;
			return sum;
		});

	await bench.run();

	const groups = [
		{name: 'FAST', filter: (r: {name: string}) => r.name.includes('[fast]')},
		{name: 'SLOW', filter: (r: {name: string}) => r.name.includes('[slow]')},
	];

	const table = bench.table({groups});

	expect(table).toContain('FAST');
	expect(table).toContain('SLOW');
	expect(table).toContain('[fast] operation 1');
	expect(table).toContain('[slow] operation 1');
});

test('Benchmark: table() with groups shows percentiles', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
	});

	bench.add('[a] task', () => 1 + 1).add('[b] task', () => 2 + 2);

	await bench.run();

	const groups = [
		{name: 'GROUP A', filter: (r: {name: string}) => r.name.includes('[a]')},
		{name: 'GROUP B', filter: (r: {name: string}) => r.name.includes('[b]')},
	];

	const table = bench.table({groups});

	expect(table).toContain('GROUP A');
	expect(table).toContain('GROUP B');
	// Tables show percentile columns
	expect(table).toContain('p50');
	expect(table).toContain('vs Best');
});

test('Benchmark: summary() output', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 5,
	});

	bench
		.add('fast', () => 1 + 1)
		.add('slow', () => {
			let sum = 0;
			for (let i = 0; i < 1000; i++) sum += i;
			return sum;
		});

	await bench.run();
	const summary = bench.summary();

	expect(summary).toContain('Fastest:');
	expect(summary).toContain('Slowest:');
	expect(summary).toContain('Speed difference:');
	expect(summary).toContain('ops/sec');
});

test('Benchmark: summary() with no results', ({expect}) => {
	const bench = new Benchmark();
	expect(bench.summary()).toBe('No results');
});

test('Benchmark: summary() with single task', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 5,
	});

	bench.add('only task', () => 1 + 1);

	await bench.run();
	const summary = bench.summary();

	// With single task, fastest and slowest are the same
	expect(summary).toContain('Fastest:');
	expect(summary).toContain('only task');
});

test('Benchmark: table() with no results', ({expect}) => {
	const bench = new Benchmark();
	expect(bench.table()).toBe('(no results)');
});

test('Benchmark: markdown() with no results', ({expect}) => {
	const bench = new Benchmark();
	expect(bench.markdown()).toBe('(no results)');
});

test('Benchmark: json() compact output', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 5,
	});

	bench.add('task', () => 1 + 1);

	await bench.run();
	const compact = bench.json(false);

	// Compact JSON has no newlines or indentation
	expect(compact).not.toContain('\n');
	expect(compact).toContain('task');
});

test('Benchmark: groups with description', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
	});

	bench.add('test task', () => 1 + 1);

	await bench.run();

	const groups = [
		{
			name: 'TEST GROUP',
			description: 'This is a test description',
			filter: () => true,
		},
	];

	const table = bench.table({groups});

	expect(table).toContain('TEST GROUP');
	expect(table).toContain('This is a test description');
});

test('Benchmark: ungrouped results appear in Other', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
	});

	bench.add('[grouped] task', () => 1 + 1);
	bench.add('ungrouped task', () => 2 + 2);

	await bench.run();

	const groups = [
		{name: 'GROUPED', filter: (r: {name: string}) => r.name.includes('[grouped]')},
	];

	const table = bench.table({groups});

	expect(table).toContain('GROUPED');
	expect(table).toContain('Other');
	expect(table).toContain('ungrouped task');
});
