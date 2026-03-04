/**
 * Tests for generic DAG executor.
 *
 * @module
 */

import {assert, test, describe} from 'vitest';

import {run_dag, type DagNode, type DagResult} from '$lib/dag.js';

/**
 * Helper to create a simple DAG node.
 */
const make_node = (
	id: string,
	options?: {
		depends_on?: Array<string>;
		execute?: () => Promise<unknown>;
		fail?: boolean;
		delay_ms?: number;
	},
): DagNode & {execute: () => Promise<void>} => ({
	id,
	depends_on: options?.depends_on,
	execute:
		(options?.execute as (() => Promise<void>) | undefined) ??
		(options?.fail
			? async () => {
					throw new Error(`node ${id} failed`);
				}
			: options?.delay_ms
				? async () => {
						await new Promise((r) => setTimeout(r, options.delay_ms));
					}
				: async () => {}),
});

/**
 * Helper to run nodes with their built-in execute functions.
 */
const run_with_execute = async (
	nodes: Array<DagNode & {execute: () => Promise<void>}>,
	options?: {
		max_concurrency?: number;
		stop_on_failure?: boolean;
		should_skip?: (node: DagNode) => boolean;
		on_skip?: (node: DagNode, reason: string) => Promise<void>;
		on_error?: (node: DagNode, error: Error) => Promise<void>;
	},
): Promise<DagResult> => {
	const node_map = new Map(nodes.map((n) => [n.id, n]));
	return run_dag({
		nodes,
		execute: async (node) => {
			await node_map.get(node.id)!.execute();
		},
		...options,
	});
};

describe('run_dag', () => {
	describe('graph validation', () => {
		test('empty nodes returns success', async () => {
			const result = await run_dag({nodes: [], execute: async () => {}});
			assert.isTrue(result.success);
			assert.strictEqual(result.completed, 0);
			assert.strictEqual(result.failed, 0);
			assert.strictEqual(result.skipped, 0);
		});

		test('single node executes', async () => {
			let executed = false;
			const result = await run_dag({
				nodes: [{id: 'a'}],
				execute: async () => {
					executed = true;
				},
			});
			assert.isTrue(result.success);
			assert.strictEqual(result.completed, 1);
			assert.isTrue(executed);
		});

		test('detects duplicate IDs', async () => {
			const result = await run_dag({
				nodes: [{id: 'a'}, {id: 'a'}],
				execute: async () => {},
			});
			assert.isFalse(result.success);
			assert.include(result.error, 'duplicate');
		});

		test('detects missing dependencies', async () => {
			const result = await run_dag({
				nodes: [{id: 'a', depends_on: ['missing']}],
				execute: async () => {},
			});
			assert.isFalse(result.success);
			assert.include(result.error, 'unknown');
		});

		test('detects cycles', async () => {
			const result = await run_dag({
				nodes: [
					{id: 'a', depends_on: ['b']},
					{id: 'b', depends_on: ['a']},
				],
				execute: async () => {},
			});
			assert.isFalse(result.success);
			assert.include(result.error, 'cycle');
		});
	});

	describe('sequential chain', () => {
		test('executes in dependency order', async () => {
			const order: Array<string> = [];
			const nodes = [
				make_node('c', {depends_on: ['b'], execute: async () => order.push('c')}),
				make_node('a', {execute: async () => order.push('a')}),
				make_node('b', {depends_on: ['a'], execute: async () => order.push('b')}),
			];
			const result = await run_with_execute(nodes);
			assert.isTrue(result.success);
			assert.strictEqual(result.completed, 3);
			assert.isBelow(order.indexOf('a'), order.indexOf('b'));
			assert.isBelow(order.indexOf('b'), order.indexOf('c'));
		});

		test('failure cascades to dependents', async () => {
			const order: Array<string> = [];
			const skipped: Array<string> = [];
			const nodes = [
				make_node('a', {fail: true}),
				make_node('b', {depends_on: ['a'], execute: async () => order.push('b')}),
				make_node('c', {depends_on: ['b'], execute: async () => order.push('c')}),
			];
			const result = await run_with_execute(nodes, {
				on_skip: async (node, _reason) => {
					skipped.push(node.id);
				},
			});
			assert.isFalse(result.success);
			assert.strictEqual(result.completed, 0);
			assert.strictEqual(result.failed, 1);
			assert.strictEqual(result.skipped, 2);
			assert.deepEqual(order, []);
			assert.include(skipped, 'b');
			assert.include(skipped, 'c');
		});
	});

	describe('parallel execution', () => {
		test('independent nodes run concurrently', async () => {
			let max_concurrent = 0;
			let current = 0;
			const nodes = ['a', 'b', 'c'].map((id) =>
				make_node(id, {
					execute: async () => {
						current++;
						if (current > max_concurrent) max_concurrent = current;
						await new Promise((r) => setTimeout(r, 20));
						current--;
					},
				}),
			);
			const start = Date.now();
			const result = await run_with_execute(nodes);
			const elapsed = Date.now() - start;

			assert.isTrue(result.success);
			assert.strictEqual(result.completed, 3);
			assert.isAbove(max_concurrent, 1, 'nodes should run concurrently');
			assert.isBelow(elapsed, 80, 'parallel execution should be faster than sequential');
		});

		test('diamond dependency: a -> b,c -> d', async () => {
			const order: Array<string> = [];
			const nodes = [
				make_node('a', {execute: async () => order.push('a')}),
				make_node('b', {depends_on: ['a'], execute: async () => order.push('b')}),
				make_node('c', {depends_on: ['a'], execute: async () => order.push('c')}),
				make_node('d', {
					depends_on: ['b', 'c'],
					execute: async () => order.push('d'),
				}),
			];
			const result = await run_with_execute(nodes);
			assert.isTrue(result.success);
			assert.strictEqual(result.completed, 4);
			assert.isBelow(order.indexOf('a'), order.indexOf('b'));
			assert.isBelow(order.indexOf('a'), order.indexOf('c'));
			assert.isBelow(order.indexOf('b'), order.indexOf('d'));
			assert.isBelow(order.indexOf('c'), order.indexOf('d'));
		});
	});

	describe('max_concurrency', () => {
		test('limits concurrent executions', async () => {
			let max_concurrent = 0;
			let current = 0;
			const nodes = ['a', 'b', 'c', 'd'].map((id) =>
				make_node(id, {
					execute: async () => {
						current++;
						if (current > max_concurrent) max_concurrent = current;
						await new Promise((r) => setTimeout(r, 20));
						current--;
					},
				}),
			);
			const result = await run_with_execute(nodes, {max_concurrency: 2});

			assert.isTrue(result.success);
			assert.strictEqual(result.completed, 4);
			assert.isAtMost(max_concurrent, 2);
		});

		test('max_concurrency 1 is effectively sequential', async () => {
			const order: Array<string> = [];
			const nodes = ['a', 'b', 'c'].map((id) =>
				make_node(id, {
					execute: async () => {
						order.push(`${id}-start`);
						await new Promise((r) => setTimeout(r, 5));
						order.push(`${id}-end`);
					},
				}),
			);
			const result = await run_with_execute(nodes, {max_concurrency: 1});

			assert.isTrue(result.success);
			assert.strictEqual(result.completed, 3);
			// Each node's end should come before the next node's start
			for (let i = 0; i < order.length - 2; i += 2) {
				const end_idx = order.indexOf(order[i]!.replace('-start', '-end'));
				const next_start_idx = i + 2 < order.length ? i + 2 : -1;
				if (next_start_idx >= 0) {
					assert.isBelow(end_idx, next_start_idx, 'should not overlap');
				}
			}
		});
	});

	describe('stop_on_failure', () => {
		test('true: stops all remaining nodes', async () => {
			const executed: Array<string> = [];
			const nodes = [
				make_node('a', {fail: true}),
				make_node('b', {execute: async () => executed.push('b')}),
				make_node('c', {execute: async () => executed.push('c')}),
			];

			// Use max_concurrency: 1 so 'a' fails before b/c start
			const result = await run_with_execute(nodes, {
				stop_on_failure: true,
				max_concurrency: 1,
			});

			assert.isFalse(result.success);
			assert.strictEqual(result.failed, 1);
			assert.deepEqual(executed, []);
		});

		test('false: continues independent branches', async () => {
			const executed: Array<string> = [];
			const nodes = [
				make_node('a', {fail: true}),
				make_node('b', {depends_on: ['a'], execute: async () => executed.push('b')}),
				make_node('c', {execute: async () => executed.push('c')}), // independent
			];
			const result = await run_with_execute(nodes, {stop_on_failure: false});

			assert.isFalse(result.success);
			assert.strictEqual(result.failed, 1);
			assert.strictEqual(result.completed, 1); // c
			assert.strictEqual(result.skipped, 1); // b (dependency failed)
			assert.include(executed, 'c');
			assert.notInclude(executed, 'b');
		});

		test('false: dependents of failed nodes are skipped', async () => {
			const executed: Array<string> = [];
			const nodes = [
				make_node('a', {execute: async () => executed.push('a')}),
				make_node('b', {depends_on: ['a'], fail: true}),
				make_node('c', {depends_on: ['b'], execute: async () => executed.push('c')}),
			];
			const result = await run_with_execute(nodes, {stop_on_failure: false});

			assert.isFalse(result.success);
			assert.strictEqual(result.completed, 1); // a
			assert.strictEqual(result.failed, 1); // b
			assert.strictEqual(result.skipped, 1); // c (dependency failed)
			assert.deepEqual(executed, ['a']);
		});
	});

	describe('should_skip', () => {
		test('pre-skipped nodes allow dependents to proceed', async () => {
			const executed: Array<string> = [];
			const nodes = [
				make_node('a', {execute: async () => executed.push('a')}),
				make_node('b', {depends_on: ['a'], execute: async () => executed.push('b')}),
			];
			const result = await run_with_execute(nodes, {
				should_skip: (node) => node.id === 'a',
			});

			assert.isTrue(result.success);
			assert.strictEqual(result.completed, 1); // b
			assert.strictEqual(result.skipped, 1); // a
			assert.deepEqual(executed, ['b']);
		});

		test('on_skip called with pre-skipped reason', async () => {
			const skip_reasons: Array<{id: string; reason: string}> = [];
			const nodes = [make_node('a')];
			await run_with_execute(nodes, {
				should_skip: () => true,
				on_skip: async (node, reason) => {
					skip_reasons.push({id: node.id, reason});
				},
			});
			assert.lengthOf(skip_reasons, 1);
			assert.strictEqual(skip_reasons[0]!.reason, 'pre-skipped');
		});
	});

	describe('cascading failure skip', () => {
		test('transitive dependents are all skipped', async () => {
			const skip_reasons: Array<{id: string; reason: string}> = [];
			const nodes = [
				make_node('a', {fail: true}),
				make_node('b', {depends_on: ['a']}),
				make_node('c', {depends_on: ['b']}),
				make_node('d', {depends_on: ['c']}),
			];
			const result = await run_with_execute(nodes, {
				on_skip: async (node, reason) => {
					skip_reasons.push({id: node.id, reason});
				},
			});

			assert.isFalse(result.success);
			assert.strictEqual(result.failed, 1);
			assert.strictEqual(result.skipped, 3);
			assert.lengthOf(skip_reasons, 3);
			for (const sr of skip_reasons) {
				assert.strictEqual(sr.reason, 'dependency failed');
			}
		});
	});

	describe('on_error callback', () => {
		test('called for failed nodes', async () => {
			const errors: Array<{id: string; message: string}> = [];
			const nodes = [make_node('a', {fail: true})];
			await run_with_execute(nodes, {
				on_error: async (node, error) => {
					errors.push({id: node.id, message: error.message});
				},
			});
			assert.lengthOf(errors, 1);
			assert.strictEqual(errors[0]!.id, 'a');
			assert.include(errors[0]!.message, 'node a failed');
		});
	});

	describe('result details', () => {
		test('per-node results are populated', async () => {
			const nodes = [
				make_node('a'),
				make_node('b', {depends_on: ['a'], fail: true}),
				make_node('c', {depends_on: ['b']}),
			];
			const result = await run_with_execute(nodes);

			assert.strictEqual(result.results.size, 3);
			assert.strictEqual(result.results.get('a')!.status, 'completed');
			assert.strictEqual(result.results.get('b')!.status, 'failed');
			assert.include(result.results.get('b')!.error, 'node b failed');
			assert.strictEqual(result.results.get('c')!.status, 'skipped');
		});

		test('duration_ms is tracked per node', async () => {
			const nodes = [make_node('a', {delay_ms: 20})];
			const result = await run_with_execute(nodes);

			assert.isTrue(result.success);
			const node_result = result.results.get('a')!;
			assert.isAtLeast(node_result.duration_ms, 10);
		});

		test('total duration_ms is tracked', async () => {
			const nodes = [make_node('a', {delay_ms: 20})];
			const result = await run_with_execute(nodes);
			assert.isAtLeast(result.duration_ms, 10);
		});
	});

	describe('skip_validation', () => {
		test('skips duplicate ID detection', async () => {
			let count = 0;
			const result = await run_dag({
				nodes: [{id: 'a'}, {id: 'b'}],
				execute: async () => {
					count++;
				},
				skip_validation: true,
			});
			assert.isTrue(result.success);
			assert.strictEqual(count, 2);
		});
	});

	describe('non-Error throw', () => {
		test('string throw is wrapped in Error', async () => {
			const errors: Array<{id: string; message: string}> = [];
			const result = await run_dag({
				nodes: [{id: 'a'}],
				execute: async () => {
					throw 'string error'; // eslint-disable-line @typescript-eslint/only-throw-error
				},
				on_error: async (_node, error) => {
					errors.push({id: 'a', message: error.message});
				},
			});
			assert.isFalse(result.success);
			assert.strictEqual(result.failed, 1);
			assert.include(result.results.get('a')!.error, 'string error');
			assert.lengthOf(errors, 1);
			assert.include(errors[0]!.message, 'string error');
		});
	});

	describe('on_skip with stopped reason', () => {
		test('nodes skipped due to stop_on_failure get stopped reason', async () => {
			const skip_reasons: Array<{id: string; reason: string}> = [];
			const nodes = [
				make_node('a', {fail: true}),
				make_node('b', {delay_ms: 5}),
				make_node('c', {delay_ms: 5}),
			];
			const result = await run_with_execute(nodes, {
				stop_on_failure: true,
				max_concurrency: 1,
				on_skip: async (node, reason) => {
					skip_reasons.push({id: node.id, reason});
				},
			});
			assert.isFalse(result.success);
			assert.strictEqual(result.failed, 1);
			assert.isAbove(skip_reasons.length, 0);
			for (const sr of skip_reasons) {
				assert.strictEqual(sr.reason, 'stopped');
			}
		});
	});

	describe('multiple concurrent failures', () => {
		test('stop_on_failure false allows multiple failures', async () => {
			const nodes = [make_node('a', {fail: true}), make_node('b', {fail: true}), make_node('c')];
			const result = await run_with_execute(nodes, {stop_on_failure: false});
			assert.isFalse(result.success);
			assert.strictEqual(result.failed, 2);
			assert.strictEqual(result.completed, 1);
			assert.strictEqual(result.results.get('a')!.status, 'failed');
			assert.strictEqual(result.results.get('b')!.status, 'failed');
			assert.strictEqual(result.results.get('c')!.status, 'completed');
		});
	});
});
