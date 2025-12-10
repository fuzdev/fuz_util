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
		warmup_iterations: 1,
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
		warmup_iterations: 1,
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
		warmup_iterations: 1,
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
		warmup_iterations: 1,
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
	expect(table).toContain('median');
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

test('Benchmark: throws on task error', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
		warmup_iterations: 1,
	});

	bench.add('fails', () => {
		throw new Error('test error');
	});

	await expect(bench.run()).rejects.toThrow('test error');
});

test('Benchmark: error in setup throws', async ({expect}) => {
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

	await expect(bench.run()).rejects.toThrow('setup error');
	// Teardown still runs via finally
	expect(teardown_called).toBe(true);
});

test('Benchmark: teardown runs even when fn throws', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 1,
		warmup_iterations: 1,
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

	await expect(bench.run()).rejects.toThrow('fn error');
	// Teardown should be called because of finally block
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
	expect(table).toContain('median');
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
	const compact = bench.json({pretty: false});

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

	const groups = [{name: 'GROUPED', filter: (r: {name: string}) => r.name.includes('[grouped]')}];

	const table = bench.table({groups});

	expect(table).toContain('GROUPED');
	expect(table).toContain('Other');
	expect(table).toContain('ungrouped task');
});

test('Benchmark: remove() removes task by name', ({expect}) => {
	const bench = new Benchmark();

	bench.add('task1', () => {});
	bench.add('task2', () => {});
	bench.add('task3', () => {});

	bench.remove('task2');

	// Can't add task2 again if it wasn't removed
	bench.add('task2', () => {});

	// Verify task1 still exists
	expect(() => bench.add('task1', () => {})).toThrow('Task "task1" already exists');
});

test('Benchmark: remove() throws for non-existent task', ({expect}) => {
	const bench = new Benchmark();

	bench.add('task1', () => {});

	expect(() => bench.remove('nonexistent')).toThrow('Task "nonexistent" not found');
});

test('Benchmark: remove() returns this for chaining', ({expect}) => {
	const bench = new Benchmark();

	bench.add('task1', () => {});
	bench.add('task2', () => {});

	const result = bench.remove('task1');
	expect(result).toBe(bench);
});

test('Benchmark: warmup_iterations can be 0 (skips warmup)', ({expect}) => {
	expect(() => new Benchmark({warmup_iterations: 0})).not.toThrow();
});

test('Benchmark: p75 percentile in output', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 5,
	});

	bench.add('test', () => 1 + 1);

	await bench.run();
	const table = bench.table();
	const json = bench.json();

	expect(table).toContain('p75');
	expect(json).toContain('p75_ns');

	const results = bench.results();
	expect(results[0]!.stats.p75_ns).toBeGreaterThan(0);
});

test('Benchmark: timings_ns exposed on result', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 10,
	});

	bench.add('test', () => 1 + 1);

	const results = await bench.run();

	expect(results[0]!.timings_ns).toBeInstanceOf(Array);
	expect(results[0]!.timings_ns.length).toBeGreaterThanOrEqual(10);
	expect(results[0]!.timings_ns[0]).toBeGreaterThan(0);
	// Should match iterations count
	expect(results[0]!.timings_ns.length).toBe(results[0]!.iterations);
});

test('Benchmark: on_iteration abort stops early', async ({expect}) => {
	let iteration_count = 0;

	const bench = new Benchmark({
		duration_ms: 10000, // Long duration - should be aborted
		min_iterations: 5,
		max_iterations: 10000,
		on_iteration: (_name, iteration, abort) => {
			iteration_count = iteration;
			if (iteration >= 50) abort();
		},
	});

	bench.add('test', () => 1 + 1);

	const results = await bench.run();

	// Should have stopped at 50 iterations due to abort
	expect(results[0]!.iterations).toBe(50);
	expect(iteration_count).toBe(50);
});

test('Benchmark: json() with include_timings', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 10,
	});

	bench.add('test', () => 1 + 1);

	await bench.run();

	// Without include_timings
	const json_without = bench.json();
	expect(json_without).not.toContain('timings_ns');

	// With include_timings
	const json_with = bench.json({include_timings: true});
	expect(json_with).toContain('timings_ns');

	const parsed = JSON.parse(json_with);
	expect(parsed[0].timings_ns).toBeInstanceOf(Array);
	expect(parsed[0].timings_ns.length).toBeGreaterThanOrEqual(10);
});

test('Benchmark: skip() skips tasks', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
	});

	bench.add('task1', () => 1 + 1);
	bench.add('task2', () => 2 + 2);
	bench.add('task3', () => 3 + 3);

	bench.skip('task2');

	const results = await bench.run();

	expect(results).toHaveLength(2);
	expect(results.map((r) => r.name)).toEqual(['task1', 'task3']);
});

test('Benchmark: skip() throws for non-existent task', ({expect}) => {
	const bench = new Benchmark();
	bench.add('task1', () => {});

	expect(() => bench.skip('nonexistent')).toThrow('Task "nonexistent" not found');
});

test('Benchmark: skip via task object', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
	});

	bench.add({name: 'task1', fn: () => 1 + 1, skip: true});
	bench.add('task2', () => 2 + 2);

	const results = await bench.run();

	expect(results).toHaveLength(1);
	expect(results[0]!.name).toBe('task2');
});

test('Benchmark: only() runs only marked tasks', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
	});

	bench.add('task1', () => 1 + 1);
	bench.add('task2', () => 2 + 2);
	bench.add('task3', () => 3 + 3);

	bench.only('task2');

	const results = await bench.run();

	expect(results).toHaveLength(1);
	expect(results[0]!.name).toBe('task2');
});

test('Benchmark: only() throws for non-existent task', ({expect}) => {
	const bench = new Benchmark();
	bench.add('task1', () => {});

	expect(() => bench.only('nonexistent')).toThrow('Task "nonexistent" not found');
});

test('Benchmark: multiple only() tasks', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
	});

	bench.add('task1', () => 1 + 1);
	bench.add('task2', () => 2 + 2);
	bench.add('task3', () => 3 + 3);

	bench.only('task1').only('task3');

	const results = await bench.run();

	expect(results).toHaveLength(2);
	expect(results.map((r) => r.name)).toEqual(['task1', 'task3']);
});

test('Benchmark: only via task object', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
	});

	bench.add({name: 'task1', fn: () => 1 + 1, only: true});
	bench.add('task2', () => 2 + 2);

	const results = await bench.run();

	expect(results).toHaveLength(1);
	expect(results[0]!.name).toBe('task1');
});

test('Benchmark: skip takes precedence over only', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
	});

	bench.add({name: 'task1', fn: () => 1 + 1, only: true, skip: true});
	bench.add({name: 'task2', fn: () => 2 + 2, only: true});

	const results = await bench.run();

	expect(results).toHaveLength(1);
	expect(results[0]!.name).toBe('task2');
});

test('Benchmark: on_task_complete callback', async ({expect}) => {
	const completed: Array<{name: string; index: number; total: number}> = [];

	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 3,
		cooldown_ms: 10,
		on_task_complete: (result, index, total) => {
			completed.push({name: result.name, index, total});
		},
	});

	bench.add('task1', () => 1 + 1);
	bench.add('task2', () => 2 + 2);

	await bench.run();

	expect(completed).toHaveLength(2);
	expect(completed[0]).toEqual({name: 'task1', index: 0, total: 2});
	expect(completed[1]).toEqual({name: 'task2', index: 1, total: 2});
});

test('Benchmark: async hint skips detection', async ({expect}) => {
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 5,
	});

	// Explicit async: false hint
	bench.add({
		name: 'sync with hint',
		fn: () => 1 + 1,
		async: false,
	});

	// Explicit async: true hint
	bench.add({
		name: 'async with hint',
		fn: async () => {
			await Promise.resolve();
			return 1;
		},
		async: true,
	});

	const results = await bench.run();

	expect(results).toHaveLength(2);
	expect(results[0]!.stats.mean_ns).toBeGreaterThan(0);
	expect(results[1]!.stats.mean_ns).toBeGreaterThan(0);
});

test('Benchmark: warmup_iterations can be 0', async ({expect}) => {
	// With the change to allow warmup_iterations: 0
	const bench = new Benchmark({
		duration_ms: 50,
		min_iterations: 5,
		warmup_iterations: 0,
	});

	bench.add('test', () => 1 + 1);

	const results = await bench.run();

	expect(results).toHaveLength(1);
	expect(results[0]!.iterations).toBeGreaterThanOrEqual(5);
});

// Config validation tests

test('Benchmark: throws on negative duration_ms', ({expect}) => {
	expect(() => new Benchmark({duration_ms: -1})).toThrow('duration_ms must be positive');
});

test('Benchmark: throws on zero duration_ms', ({expect}) => {
	expect(() => new Benchmark({duration_ms: 0})).toThrow('duration_ms must be positive');
});

test('Benchmark: throws on negative warmup_iterations', ({expect}) => {
	expect(() => new Benchmark({warmup_iterations: -1})).toThrow(
		'warmup_iterations must be non-negative',
	);
});

test('Benchmark: throws on negative cooldown_ms', ({expect}) => {
	expect(() => new Benchmark({cooldown_ms: -1})).toThrow('cooldown_ms must be non-negative');
});

test('Benchmark: throws on zero min_iterations', ({expect}) => {
	expect(() => new Benchmark({min_iterations: 0})).toThrow('min_iterations must be at least 1');
});

test('Benchmark: throws on zero max_iterations', ({expect}) => {
	expect(() => new Benchmark({max_iterations: 0})).toThrow('max_iterations must be at least 1');
});

test('Benchmark: throws on min > max iterations', ({expect}) => {
	expect(() => new Benchmark({min_iterations: 100, max_iterations: 10})).toThrow(
		'min_iterations (100) cannot exceed max_iterations (10)',
	);
});

test('Benchmark: allows cooldown_ms of 0', ({expect}) => {
	expect(() => new Benchmark({cooldown_ms: 0})).not.toThrow();
});
