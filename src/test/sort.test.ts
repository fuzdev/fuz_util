/**
 * Tests for generic topological sort.
 *
 * @module
 */

import {assert, test, describe} from 'vitest';

import {topological_sort, type Sortable, type TopologicalSortResult} from '$lib/sort.js';

/**
 * Helper to create a sortable item.
 */
const make_item = (id: string, depends_on?: Array<string>): Sortable => ({
	id,
	depends_on,
});

/**
 * Helper to assert a successful sort and return the sorted IDs.
 */
const assert_sorted = <T extends Sortable>(result: TopologicalSortResult<T>): Array<string> => {
	assert.isTrue(result.ok);
	return result.sorted.map((item) => item.id);
};

/**
 * Helper to verify that all dependencies come before their dependents in a sorted array.
 */
const assert_order = (sorted_ids: Array<string>, items: Array<Sortable>): void => {
	for (const item of items) {
		for (const dep of item.depends_on ?? []) {
			const dep_idx = sorted_ids.indexOf(dep);
			const item_idx = sorted_ids.indexOf(item.id);
			assert.isBelow(dep_idx, item_idx, `dependency "${dep}" should come before "${item.id}"`);
		}
	}
};

describe('topological_sort', () => {
	describe('empty and single item', () => {
		test('empty array returns empty sorted', () => {
			const result = topological_sort([]);
			const ids = assert_sorted(result);
			assert.deepEqual(ids, []);
		});

		test('single item with no deps', () => {
			const items = [make_item('a')];
			const result = topological_sort(items);
			const ids = assert_sorted(result);
			assert.deepEqual(ids, ['a']);
		});

		test('single item with undefined depends_on', () => {
			const result = topological_sort([{id: 'a'}]);
			const ids = assert_sorted(result);
			assert.deepEqual(ids, ['a']);
		});

		test('single item with empty depends_on', () => {
			const result = topological_sort([{id: 'a', depends_on: []}]);
			const ids = assert_sorted(result);
			assert.deepEqual(ids, ['a']);
		});
	});

	describe('linear chains', () => {
		test('two items: a -> b', () => {
			const items = [make_item('b', ['a']), make_item('a')];
			const result = topological_sort(items);
			const ids = assert_sorted(result);
			assert.deepEqual(ids, ['a', 'b']);
		});

		test('three items: a -> b -> c', () => {
			const items = [make_item('c', ['b']), make_item('a'), make_item('b', ['a'])];
			const result = topological_sort(items);
			const ids = assert_sorted(result);
			assert_order(ids, items);
			assert.isBelow(ids.indexOf('a'), ids.indexOf('b'));
			assert.isBelow(ids.indexOf('b'), ids.indexOf('c'));
		});

		test('long chain preserves order', () => {
			const items = [
				make_item('e', ['d']),
				make_item('d', ['c']),
				make_item('c', ['b']),
				make_item('b', ['a']),
				make_item('a'),
			];
			const result = topological_sort(items);
			const ids = assert_sorted(result);
			assert_order(ids, items);
			assert.deepEqual(ids, ['a', 'b', 'c', 'd', 'e']);
		});
	});

	describe('diamond and fan dependencies', () => {
		test('diamond: a -> b,c -> d', () => {
			const items = [
				make_item('a'),
				make_item('b', ['a']),
				make_item('c', ['a']),
				make_item('d', ['b', 'c']),
			];
			const result = topological_sort(items);
			const ids = assert_sorted(result);
			assert_order(ids, items);
			assert.isBelow(ids.indexOf('a'), ids.indexOf('b'));
			assert.isBelow(ids.indexOf('a'), ids.indexOf('c'));
			assert.isBelow(ids.indexOf('b'), ids.indexOf('d'));
			assert.isBelow(ids.indexOf('c'), ids.indexOf('d'));
		});

		test('fan out: a -> b, a -> c, a -> d', () => {
			const items = [
				make_item('a'),
				make_item('b', ['a']),
				make_item('c', ['a']),
				make_item('d', ['a']),
			];
			const result = topological_sort(items);
			const ids = assert_sorted(result);
			assert_order(ids, items);
			assert.strictEqual(ids[0], 'a');
		});

		test('fan in: b,c,d -> a', () => {
			const items = [
				make_item('a', ['b', 'c', 'd']),
				make_item('b'),
				make_item('c'),
				make_item('d'),
			];
			const result = topological_sort(items);
			const ids = assert_sorted(result);
			assert_order(ids, items);
			assert.strictEqual(ids[ids.length - 1], 'a');
		});

		test('complex DAG with multiple paths', () => {
			// a -> b -> d
			// a -> c -> d
			// b -> e
			// d -> e
			const items = [
				make_item('a'),
				make_item('b', ['a']),
				make_item('c', ['a']),
				make_item('d', ['b', 'c']),
				make_item('e', ['b', 'd']),
			];
			const result = topological_sort(items);
			const ids = assert_sorted(result);
			assert_order(ids, items);
		});
	});

	describe('independent subgraphs', () => {
		test('two independent items', () => {
			const items = [make_item('a'), make_item('b')];
			const result = topological_sort(items);
			const ids = assert_sorted(result);
			assert.sameMembers(ids, ['a', 'b']);
		});

		test('two independent chains', () => {
			const items = [
				make_item('a1'),
				make_item('a2', ['a1']),
				make_item('b1'),
				make_item('b2', ['b1']),
			];
			const result = topological_sort(items);
			const ids = assert_sorted(result);
			assert_order(ids, items);
			assert.isBelow(ids.indexOf('a1'), ids.indexOf('a2'));
			assert.isBelow(ids.indexOf('b1'), ids.indexOf('b2'));
		});
	});

	describe('validation errors', () => {
		test('detects duplicate IDs', () => {
			const items = [make_item('a'), make_item('a')];
			const result = topological_sort(items);
			assert.isFalse(result.ok);
			assert.include(result.error, 'duplicate');
			assert.include(result.error, 'a');
		});

		test('detects unknown dependency', () => {
			const items = [make_item('a', ['missing'])];
			const result = topological_sort(items);
			assert.isFalse(result.ok);
			assert.include(result.error, 'unknown');
			assert.include(result.error, 'missing');
		});

		test('unknown dep error includes both item and dep IDs', () => {
			const items = [make_item('widget', ['gadget'])];
			const result = topological_sort(items);
			assert.isFalse(result.ok);
			assert.include(result.error, 'widget');
			assert.include(result.error, 'gadget');
		});
	});

	describe('cycle detection', () => {
		test('self-cycle: a -> a', () => {
			const items = [make_item('a', ['a'])];
			const result = topological_sort(items);
			assert.isFalse(result.ok);
			assert.include(result.error, 'cycle');
			assert.isDefined(result.cycle);
			assert.include(result.cycle, 'a');
		});

		test('two-node cycle: a -> b -> a', () => {
			const items = [make_item('a', ['b']), make_item('b', ['a'])];
			const result = topological_sort(items);
			assert.isFalse(result.ok);
			assert.include(result.error, 'cycle');
			assert.isDefined(result.cycle);
			assert.isArray(result.cycle);
		});

		test('three-node cycle: a -> b -> c -> a', () => {
			const items = [make_item('a', ['b']), make_item('b', ['c']), make_item('c', ['a'])];
			const result = topological_sort(items);
			assert.isFalse(result.ok);
			assert.include(result.error, 'cycle');
			assert.isDefined(result.cycle);
		});

		test('cycle with independent node', () => {
			const items = [
				make_item('a', ['b']),
				make_item('b', ['a']),
				make_item('c'), // independent, should not prevent cycle detection
			];
			const result = topological_sort(items);
			assert.isFalse(result.ok);
			assert.include(result.error, 'cycle');
		});

		test('cycle returns cycle path', () => {
			const items = [make_item('a', ['b']), make_item('b', ['a'])];
			const result = topological_sort(items);
			assert.isFalse(result.ok);
			assert.isDefined(result.cycle);
			assert.isAtLeast(result.cycle.length, 2);
		});
	});

	describe('label parameter', () => {
		test('uses custom label in duplicate error', () => {
			const items = [make_item('x'), make_item('x')];
			const result = topological_sort(items, 'step');
			assert.isFalse(result.ok);
			assert.include(result.error, 'step');
		});

		test('uses custom label in unknown dep error', () => {
			const items = [make_item('a', ['missing'])];
			const result = topological_sort(items, 'resource');
			assert.isFalse(result.ok);
			assert.include(result.error, 'resource');
		});

		test('uses default label when not specified', () => {
			const items = [make_item('a'), make_item('a')];
			const result = topological_sort(items);
			assert.isFalse(result.ok);
			assert.include(result.error, 'item');
		});
	});

	describe('preserves item data', () => {
		test('sorted items are the original objects', () => {
			const items = [make_item('b', ['a']), make_item('a')];
			const result = topological_sort(items);
			assert.isTrue(result.ok);
			assert.strictEqual(result.sorted[0], items[1]); // 'a' is items[1]
			assert.strictEqual(result.sorted[1], items[0]); // 'b' is items[0]
		});

		test('works with extended item types', () => {
			interface Task extends Sortable {
				priority: number;
			}
			const items: Array<Task> = [
				{id: 'b', depends_on: ['a'], priority: 2},
				{id: 'a', priority: 1},
			];
			const result = topological_sort(items);
			assert.isTrue(result.ok);
			assert.strictEqual(result.sorted[0]!.priority, 1);
			assert.strictEqual(result.sorted[1]!.priority, 2);
		});
	});
});
