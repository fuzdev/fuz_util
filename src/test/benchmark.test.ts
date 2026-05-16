import {describe, test, assert} from 'vitest';

import {Benchmark} from '$lib/benchmark.js';
import {wait} from '$lib/async.js';
import type {Timer} from '$lib/time.js';

describe('Benchmark', () => {
	describe('basic usage', () => {
		test('with string name', async () => {
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

			assert.lengthOf(results, 1);
			const first = results[0];
			assert.isDefined(first);
			assert.strictEqual(first.name, 'test');
			assert.isAtLeast(first.iterations, 5);
			assert.isAbove(first.stats.mean_ns, 0);
			assert.isAbove(count, 0);
		});

		test('chaining multiple tasks', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 3,
			});

			bench
				.add('task 1', () => 1 + 1)
				.add('task 2', () => 2 + 2)
				.add('task 3', () => 3 + 3);

			const results = await bench.run();

			assert.lengthOf(results, 3);
			assert.deepEqual(
				results.map((r) => r.name),
				['task 1', 'task 2', 'task 3'],
			);
		});

		test('with task object', async () => {
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

			assert.lengthOf(results, 1);
			assert.isDefined(results[0]);
			assert.strictEqual(results[0].name, 'object task');
		});

		test('sync vs async detection', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 5,
			});

			let sync_count = 0;
			let async_count = 0;

			bench.add('sync', () => {
				sync_count++;
			});

			bench.add('async', async () => {
				async_count++;
				await Promise.resolve();
			});

			await bench.run();

			assert.isAbove(sync_count, 0);
			assert.isAbove(async_count, 0);
			assert.lengthOf(bench.results(), 2);
		});

		test('handles function that returns a value', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 5,
			});

			bench.add('returns number', () => 42);
			bench.add('returns object', () => ({foo: 'bar'}));
			bench.add('returns promise', () => Promise.resolve('result'));

			const results = await bench.run();

			assert.lengthOf(results, 3);
			for (const r of results) {
				assert.isAbove(r.stats.mean_ns, 0);
				assert.isAtLeast(r.iterations, 5);
			}
		});

		test('async hint skips detection', async () => {
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

			assert.lengthOf(results, 2);
			assert.isDefined(results[0]);
			assert.isDefined(results[1]);
			assert.isAbove(results[0].stats.mean_ns, 0);
			assert.isAbove(results[1].stats.mean_ns, 0);
		});
	});

	describe('setup and teardown', () => {
		test('with setup and teardown', async () => {
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

			assert.isTrue(setup_called);
			assert.isTrue(teardown_called);
			assert.strictEqual(value, 0);
		});

		test('async setup/teardown', async () => {
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

			assert.isNull(data);
		});

		test('teardown runs even when fn throws', async () => {
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

			try {
				await bench.run();
				assert.fail('Expected error');
			} catch (e: any) {
				assert.include(e.message, 'fn error');
			}
			// Teardown should be called because of finally block
			assert.isTrue(teardown_called);
		});
	});

	describe('callbacks', () => {
		test('on_iteration callback', async () => {
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

			assert.isAtLeast(cycles.length, 5);
			assert.isDefined(cycles[0]);
			assert.isDefined(cycles[4]);
			assert.strictEqual(cycles[0].name, 'test');
			assert.strictEqual(cycles[0].iteration, 1);
			assert.strictEqual(cycles[4].iteration, 5);
		});

		test('on_iteration abort stops early', async () => {
			let iteration_count = 0;

			const bench = new Benchmark({
				duration_ms: 10000, // Long duration — should be aborted
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
			assert.isDefined(results[0]);
			assert.strictEqual(results[0].iterations, 50);
			assert.strictEqual(iteration_count, 50);
		});

		test('on_iteration abort stops async task early', async () => {
			let iteration_count = 0;

			const bench = new Benchmark({
				duration_ms: 10000,
				min_iterations: 5,
				max_iterations: 10000,
				on_iteration: (_name, iteration, abort) => {
					iteration_count = iteration;
					if (iteration >= 10) abort();
				},
			});

			bench.add('async test', async () => {
				await Promise.resolve();
			});

			const results = await bench.run();

			assert.isDefined(results[0]);
			assert.strictEqual(results[0].iterations, 10);
			assert.strictEqual(iteration_count, 10);
		});

		test('on_task_complete callback', async () => {
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

			assert.lengthOf(completed, 2);
			assert.deepEqual(completed[0], {name: 'task1', index: 0, total: 2});
			assert.deepEqual(completed[1], {name: 'task2', index: 1, total: 2});
		});
	});

	describe('configuration', () => {
		test('custom timer', async () => {
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

			assert.lengthOf(results, 1);
			assert.isAbove(counter, 0);
		});

		test('respects min_iterations', async () => {
			const bench = new Benchmark({
				duration_ms: 1,
				min_iterations: 20,
				warmup_iterations: 1,
			});

			bench.add('test', () => {});

			const results = await bench.run();

			assert.isDefined(results[0]);
			assert.isAtLeast(results[0].iterations, 20);
		});

		test('respects max_iterations', async () => {
			const bench = new Benchmark({
				duration_ms: 10000,
				min_iterations: 5,
				max_iterations: 10,
				warmup_iterations: 1,
			});

			bench.add('test', () => {});

			const results = await bench.run();

			assert.isDefined(results[0]);
			assert.isAtMost(results[0].iterations, 10);
		});

		test('cooldown between tasks', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 3,
				cooldown_ms: 20,
			});

			bench.add('task 1', () => {}).add('task 2', () => {});

			const start = Date.now();
			await bench.run();
			const elapsed = Date.now() - start;

			assert.isAtLeast(elapsed, 18);
		});

		test('warmup iterations', async () => {
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

			assert.isAtLeast(count, 15);
		});

		test('warmup_iterations can be 0', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 5,
				warmup_iterations: 0,
			});

			bench.add('test', () => 1 + 1);

			const results = await bench.run();

			assert.lengthOf(results, 1);
			assert.isDefined(results[0]);
			assert.isAtLeast(results[0].iterations, 5);
		});

		test('warmup_iterations=0 still detects async fn (no hint)', async () => {
			// Without detection, async fns get dispatched on the sync path and the
			// returned promise is never awaited — wrong timings + unhandled rejection.
			// We observe `resolved_count` at on_iteration time: in the correct path
			// fn() has fully awaited so the count matches; in the buggy sync path
			// the post-await body hasn't run yet so the count lags.
			let resolved_count = 0;
			const observations: Array<{iter: number; resolved: number}> = [];

			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 5,
				warmup_iterations: 0,
				on_iteration: (_name, iteration) => {
					observations.push({iter: iteration, resolved: resolved_count});
				},
			});

			bench.add('async', async () => {
				await Promise.resolve();
				resolved_count++;
			});

			await bench.run();

			assert.isAtLeast(observations.length, 5);
			// In the correct path resolved_count advances by exactly 1 between
			// consecutive on_iteration calls (each fn fully awaited). In the
			// buggy sync path, the post-await body is queued as a microtask
			// that hasn't run yet — adjacent observations would show no delta.
			for (let i = 1; i < observations.length; i++) {
				const prev = observations[i - 1]!;
				const curr = observations[i]!;
				assert.strictEqual(curr.resolved - prev.resolved, 1);
			}
		});
	});

	describe('configuration validation', () => {
		test('throws on negative duration_ms', () => {
			assert.throws(() => new Benchmark({duration_ms: -1}), 'duration_ms must be positive');
		});

		test('throws on zero duration_ms', () => {
			assert.throws(() => new Benchmark({duration_ms: 0}), 'duration_ms must be positive');
		});

		test('throws on negative warmup_iterations', () => {
			assert.throws(
				() => new Benchmark({warmup_iterations: -1}),
				'warmup_iterations must be non-negative',
			);
		});

		test('warmup_iterations can be 0 (skips warmup)', () => {
			assert.doesNotThrow(() => new Benchmark({warmup_iterations: 0}));
		});

		test('throws on negative cooldown_ms', () => {
			assert.throws(() => new Benchmark({cooldown_ms: -1}), 'cooldown_ms must be non-negative');
		});

		test('allows cooldown_ms of 0', () => {
			assert.doesNotThrow(() => new Benchmark({cooldown_ms: 0}));
		});

		test('throws on zero min_iterations', () => {
			assert.throws(() => new Benchmark({min_iterations: 0}), 'min_iterations must be at least 1');
		});

		test('throws on zero max_iterations', () => {
			assert.throws(() => new Benchmark({max_iterations: 0}), 'max_iterations must be at least 1');
		});

		test('throws on min > max iterations', () => {
			assert.throws(
				() => new Benchmark({min_iterations: 100, max_iterations: 10}),
				'min_iterations (100) cannot exceed max_iterations (10)',
			);
		});
	});

	describe('output formats', () => {
		test('table() output', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 5,
			});

			bench.add('task 1', () => 1 + 1).add('task 2', () => 2 + 2);

			await bench.run();
			const table = bench.table();

			assert.include(table, 'task 1');
			assert.include(table, 'task 2');
			assert.include(table, 'ops/sec');
			assert.include(table, 'p50');
			assert.include(table, 'vs Best');
		});

		test('table() with no results', () => {
			const bench = new Benchmark();
			assert.strictEqual(bench.table(), '(no results)');
		});

		test('markdown() output', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 5,
			});

			bench.add('task 1', () => 1 + 1);

			await bench.run();
			const md = bench.markdown();

			assert.include(md, 'task 1');
			assert.include(md, '|');
			assert.include(md, 'ops/sec');
		});

		test('markdown() with no results', () => {
			const bench = new Benchmark();
			assert.strictEqual(bench.markdown(), '(no results)');
		});

		test('json() output', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 5,
			});

			bench.add('task 1', () => 1 + 1);

			await bench.run();
			const json = bench.json();

			assert.include(json, 'task 1');
			assert.include(json, 'ops_per_second');
			assert.include(json, 'mean_ns');

			const parsed = JSON.parse(json);
			assert.lengthOf(parsed, 1);
			assert.strictEqual(parsed[0].name, 'task 1');
		});

		test('json() compact output', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 5,
			});

			bench.add('task', () => 1 + 1);

			await bench.run();
			const compact = bench.json({pretty: false});

			// Compact JSON has no newlines or indentation
			assert.notInclude(compact, '\n');
			assert.include(compact, 'task');
		});

		test('json() with include_timings', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 10,
			});

			bench.add('test', () => 1 + 1);

			await bench.run();

			// Without include_timings
			const json_without = bench.json();
			assert.notInclude(json_without, 'timings_ns');

			// With include_timings
			const json_with = bench.json({include_timings: true});
			assert.include(json_with, 'timings_ns');

			const parsed = JSON.parse(json_with);
			assert.isArray(parsed[0].timings_ns);
			assert.isAtLeast(parsed[0].timings_ns.length, 10);
		});

		test('p75 percentile in output', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 5,
			});

			bench.add('test', () => 1 + 1);

			await bench.run();
			const table = bench.table();
			const json = bench.json();

			assert.include(table, 'p75');
			assert.include(json, 'p75_ns');

			const first = bench.results()[0];
			assert.isDefined(first);
			assert.isAbove(first.stats.p75_ns, 0);
		});

		test('summary() output', async () => {
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

			assert.include(summary, 'Fastest:');
			assert.include(summary, 'Slowest:');
			assert.include(summary, 'Speed difference:');
			assert.include(summary, 'ops/sec');
		});

		test('summary() with no results', () => {
			const bench = new Benchmark();
			assert.strictEqual(bench.summary(), 'No results');
		});

		test('summary() with single task', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 5,
			});

			bench.add('only task', () => 1 + 1);

			await bench.run();
			const summary = bench.summary();

			// With single task, fastest and slowest are the same
			assert.include(summary, 'Fastest:');
			assert.include(summary, 'only task');
		});
	});

	describe('groups', () => {
		test('table() with groups', async () => {
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

			assert.include(table, 'FAST');
			assert.include(table, 'SLOW');
			assert.include(table, '[fast] operation 1');
			assert.include(table, '[slow] operation 1');
		});

		test('table() with groups shows percentiles', async () => {
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

			assert.include(table, 'GROUP A');
			assert.include(table, 'GROUP B');
			assert.include(table, 'p50');
			assert.include(table, 'vs Best');
		});

		test('groups with description', async () => {
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

			assert.include(table, 'TEST GROUP');
			assert.include(table, 'This is a test description');
		});

		test('ungrouped results appear in Other', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 3,
			});

			bench.add('[grouped] task', () => 1 + 1);
			bench.add('ungrouped task', () => 2 + 2);

			await bench.run();

			const groups = [
				{
					name: 'GROUPED',
					filter: (r: {name: string}) => r.name.includes('[grouped]'),
				},
			];

			const table = bench.table({groups});

			assert.include(table, 'GROUPED');
			assert.include(table, 'Other');
			assert.include(table, 'ungrouped task');
		});

		test('markdown with groups uses baseline', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 3,
			});
			bench.add('format/prettier', () => {});
			bench.add('format/tsv', () => {});

			await bench.run();

			const markdown = bench.markdown({
				groups: [
					{
						name: 'Format',
						filter: (r) => r.name.startsWith('format/'),
						baseline: 'format/prettier',
					},
				],
			});

			assert.include(markdown, '### Format');
			assert.include(markdown, 'vs format/prettier');
		});
	});

	describe('task management', () => {
		test('remove() removes task by name', () => {
			const bench = new Benchmark();

			bench.add('task1', () => {});
			bench.add('task2', () => {});
			bench.add('task3', () => {});

			bench.remove('task2');

			// Can add task2 again since it was removed
			bench.add('task2', () => {});

			// Verify task1 still exists
			assert.throws(() => bench.add('task1', () => {}), 'Task "task1" already exists');
		});

		test('remove() throws for non-existent task', () => {
			const bench = new Benchmark();
			bench.add('task1', () => {});

			assert.throws(() => bench.remove('nonexistent'), 'Task "nonexistent" not found');
		});

		test('remove() returns this for chaining', () => {
			const bench = new Benchmark();

			bench.add('task1', () => {});
			bench.add('task2', () => {});

			const result = bench.remove('task1');
			assert.strictEqual(result, bench);
		});

		test('skip() skips tasks', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 3,
			});

			bench.add('task1', () => 1 + 1);
			bench.add('task2', () => 2 + 2);
			bench.add('task3', () => 3 + 3);

			bench.skip('task2');

			const results = await bench.run();

			assert.lengthOf(results, 2);
			assert.deepEqual(
				results.map((r) => r.name),
				['task1', 'task3'],
			);
		});

		test('skip() returns this for chaining', () => {
			const bench = new Benchmark();

			bench.add('task1', () => {});
			bench.add('task2', () => {});

			const result = bench.skip('task1');
			assert.strictEqual(result, bench);
		});

		test('skip() throws for non-existent task', () => {
			const bench = new Benchmark();
			bench.add('task1', () => {});

			assert.throws(() => bench.skip('nonexistent'), 'Task "nonexistent" not found');
		});

		test('skip via task object', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 3,
			});

			bench.add({name: 'task1', fn: () => 1 + 1, skip: true});
			bench.add('task2', () => 2 + 2);

			const results = await bench.run();

			assert.lengthOf(results, 1);
			assert.isDefined(results[0]);
			assert.strictEqual(results[0].name, 'task2');
		});

		test('only() runs only marked tasks', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 3,
			});

			bench.add('task1', () => 1 + 1);
			bench.add('task2', () => 2 + 2);
			bench.add('task3', () => 3 + 3);

			bench.only('task2');

			const results = await bench.run();

			assert.lengthOf(results, 1);
			assert.isDefined(results[0]);
			assert.strictEqual(results[0].name, 'task2');
		});

		test('only() throws for non-existent task', () => {
			const bench = new Benchmark();
			bench.add('task1', () => {});

			assert.throws(() => bench.only('nonexistent'), 'Task "nonexistent" not found');
		});

		test('multiple only() tasks', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 3,
			});

			bench.add('task1', () => 1 + 1);
			bench.add('task2', () => 2 + 2);
			bench.add('task3', () => 3 + 3);

			bench.only('task1').only('task3');

			const results = await bench.run();

			assert.lengthOf(results, 2);
			assert.deepEqual(
				results.map((r) => r.name),
				['task1', 'task3'],
			);
		});

		test('only via task object', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 3,
			});

			bench.add({name: 'task1', fn: () => 1 + 1, only: true});
			bench.add('task2', () => 2 + 2);

			const results = await bench.run();

			assert.lengthOf(results, 1);
			assert.isDefined(results[0]);
			assert.strictEqual(results[0].name, 'task1');
		});

		test('skip takes precedence over only', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 3,
			});

			bench.add({name: 'task1', fn: () => 1 + 1, only: true, skip: true});
			bench.add({name: 'task2', fn: () => 2 + 2, only: true});

			const results = await bench.run();

			assert.lengthOf(results, 1);
			assert.isDefined(results[0]);
			assert.strictEqual(results[0].name, 'task2');
		});

		test('reset() clears results but keeps tasks', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 3,
			});

			bench.add('test', () => 1 + 1);

			await bench.run();
			assert.lengthOf(bench.results(), 1);

			bench.reset();
			assert.lengthOf(bench.results(), 0);

			// Tasks are preserved, can run again
			await bench.run();
			assert.lengthOf(bench.results(), 1);
		});

		test('clear() clears results and tasks', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 3,
			});

			bench.add('test', () => 1 + 1);

			await bench.run();
			assert.lengthOf(bench.results(), 1);

			bench.clear();
			assert.lengthOf(bench.results(), 0);

			// Tasks are cleared, running produces no results
			await bench.run();
			assert.lengthOf(bench.results(), 0);
		});

		test('run with no tasks produces empty results', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 3,
			});

			const results = await bench.run();

			assert.lengthOf(results, 0);
			assert.isFalse(bench.has_results);
		});
	});

	describe('error handling', () => {
		test('error in add() without fn', () => {
			const bench = new Benchmark();

			assert.throws(() => {
				// @ts-expect-error - Testing runtime error
				bench.add('test');
			}, 'Function required');
		});

		test('error on duplicate task name', () => {
			const bench = new Benchmark();

			bench.add('test', () => {});

			assert.throws(() => {
				bench.add('test', () => {});
			}, 'Task "test" already exists');

			// Also works with task object
			assert.throws(() => {
				bench.add({name: 'test', fn: () => {}});
			}, 'Task "test" already exists');
		});

		test('throws on task error', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 3,
				warmup_iterations: 1,
			});

			bench.add('fails', () => {
				throw new Error('test error');
			});

			try {
				await bench.run();
				assert.fail('Expected error');
			} catch (e: any) {
				assert.include(e.message, 'test error');
			}
		});

		test('error in setup throws', async () => {
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

			try {
				await bench.run();
				assert.fail('Expected error');
			} catch (e: any) {
				assert.include(e.message, 'setup error');
			}
			// Teardown still runs via finally
			assert.isTrue(teardown_called);
		});
	});

	describe('properties', () => {
		test('results() returns a copy', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 5,
			});

			bench.add('test', () => {});

			await bench.run();
			const results1 = bench.results();
			const results2 = bench.results();

			// Should be equal content but different references (shallow copy)
			assert.notStrictEqual(results1, results2);
			assert.deepEqual(results1, results2);
			assert.lengthOf(results1, 1);

			// Mutating the copy should not affect internal state
			results1.length = 0;
			assert.lengthOf(bench.results(), 1);
		});

		test('timings_ns exposed on result', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 10,
			});

			bench.add('test', () => 1 + 1);

			const results = await bench.run();

			const first = results[0];
			assert.isDefined(first);
			assert.isArray(first.timings_ns);
			assert.isAtLeast(first.timings_ns.length, 10);
			assert.isDefined(first.timings_ns[0]);
			assert.isAbove(first.timings_ns[0], 0);
			// Should match iterations count
			assert.strictEqual(first.timings_ns.length, first.iterations);
		});

		test('has_results is false before run', () => {
			const bench = new Benchmark();
			bench.add('test', () => {});

			assert.isFalse(bench.has_results);
		});

		test('has_results is true after run', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 3,
			});
			bench.add('test', () => {});

			await bench.run();

			assert.isTrue(bench.has_results);
		});

		test('has_results is false after reset', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 3,
			});
			bench.add('test', () => {});

			await bench.run();
			assert.isTrue(bench.has_results);

			bench.reset();
			assert.isFalse(bench.has_results);
		});

		test('results_by_name returns empty map before run', () => {
			const bench = new Benchmark();
			bench.add('test', () => {});

			const map = bench.results_by_name();

			assert.strictEqual(map.size, 0);
		});

		test('results_by_name returns map with results after run', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 3,
			});
			bench.add('task1', () => {});
			bench.add('task2', () => {});

			await bench.run();
			const map = bench.results_by_name();

			assert.strictEqual(map.size, 2);
			assert.isTrue(map.has('task1'));
			assert.isTrue(map.has('task2'));
			const task1 = map.get('task1');
			const task2 = map.get('task2');
			assert.isDefined(task1);
			assert.isDefined(task2);
			assert.strictEqual(task1.name, 'task1');
			assert.strictEqual(task2.name, 'task2');
		});

		test('results_by_name returns new map each call', async () => {
			const bench = new Benchmark({
				duration_ms: 50,
				min_iterations: 3,
			});
			bench.add('test', () => {});

			await bench.run();

			const map1 = bench.results_by_name();
			const map2 = bench.results_by_name();

			assert.notStrictEqual(map1, map2);
			assert.strictEqual(map1.get('test'), map2.get('test')); // same result object
		});
	});
});
