import {test, expect, describe} from 'vitest';

import {
	wait,
	create_deferred,
	each_concurrent,
	map_concurrent,
	map_concurrent_settled,
} from '$lib/async.ts';

/* eslint-disable @typescript-eslint/require-await */

test('basic behavior', async () => {
	await wait();
	await wait(10);
});

describe('create_deferred', () => {
	test('resolves with value', async () => {
		const deferred = create_deferred<number>();
		deferred.resolve(42);
		const result = await deferred.promise;
		expect(result).toBe(42);
	});

	test('rejects with error', async () => {
		const deferred = create_deferred<number>();
		const error = new Error('test error');
		deferred.reject(error);
		await expect(deferred.promise).rejects.toBe(error);
	});

	test('promise resolves only once', async () => {
		const deferred = create_deferred<number>();
		deferred.resolve(1);
		deferred.resolve(2); // second resolve is ignored
		const result = await deferred.promise;
		expect(result).toBe(1);
	});

	test('can be awaited before resolving', async () => {
		const deferred = create_deferred<string>();
		const promise = deferred.promise.then((v) => v + '!');
		setTimeout(() => deferred.resolve('hello'), 10);
		const result = await promise;
		expect(result).toBe('hello!');
	});
});

describe('each_concurrent', () => {
	test('processes all items', async () => {
		const processed: Array<number> = [];
		const items = [1, 2, 3, 4, 5];
		await each_concurrent(
			items,
			async (x) => {
				processed.push(x);
			},
			3,
		);
		expect(processed.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
	});

	test('respects concurrency limit', async () => {
		let max_concurrent = 0;
		let current_concurrent = 0;

		const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		await each_concurrent(
			items,
			async () => {
				current_concurrent++;
				max_concurrent = Math.max(max_concurrent, current_concurrent);
				await new Promise((r) => setTimeout(r, 10));
				current_concurrent--;
			},
			3,
		);

		expect(max_concurrent).toBe(3);
	});

	test('handles empty array', async () => {
		const processed: Array<number> = [];
		await each_concurrent(
			[],
			async (x: number) => {
				processed.push(x);
			},
			3,
		);
		expect(processed).toEqual([]);
	});

	test('handles single item', async () => {
		const processed: Array<number> = [];
		await each_concurrent(
			[42],
			async (x) => {
				processed.push(x);
			},
			3,
		);
		expect(processed).toEqual([42]);
	});

	test('fails fast on error', async () => {
		const processed: Array<number> = [];

		await expect(
			each_concurrent(
				[1, 2, 3, 4, 5],
				async (x) => {
					await new Promise((r) => setTimeout(r, 10));
					if (x === 3) throw new Error('test error');
					processed.push(x);
				},
				2,
			),
		).rejects.toThrow('test error');

		// Should have processed some items before failing
		expect(processed.length).toBeLessThan(5);
	});

	test('throws on invalid concurrency', async () => {
		const noop = async () => {
			/* noop */
		};
		await expect(each_concurrent([1], noop, 0)).rejects.toThrow('concurrency must be at least 1');
		await expect(each_concurrent([1], noop, -1)).rejects.toThrow('concurrency must be at least 1');
	});

	test('concurrency 1 is sequential', async () => {
		const order: Array<number> = [];
		const items = [30, 10, 20]; // different delays

		await each_concurrent(
			items,
			async (delay, index) => {
				await new Promise((r) => setTimeout(r, delay));
				order.push(index);
			},
			1,
		);

		// With concurrency 1, should process in input order regardless of delay
		expect(order).toEqual([0, 1, 2]);
	});

	test('passes index to callback', async () => {
		const indices: Array<number> = [];
		const items = ['a', 'b', 'c'];
		await each_concurrent(
			items,
			async (_, index) => {
				indices.push(index);
			},
			3,
		);
		expect(indices.sort((a, b) => a - b)).toEqual([0, 1, 2]);
	});

	test('high concurrency with fewer items', async () => {
		const processed: Array<number> = [];
		const items = [1, 2, 3];
		await each_concurrent(
			items,
			async (x) => {
				processed.push(x);
			},
			100,
		);
		expect(processed.sort((a, b) => a - b)).toEqual([1, 2, 3]);
	});

	test('preserves error object', async () => {
		const custom_error = new Error('custom');
		(custom_error as any).code = 'ENOENT';

		try {
			await each_concurrent(
				[1],
				async () => {
					throw custom_error;
				},
				3,
			);
			expect.fail('should have thrown');
		} catch (error) {
			expect(error).toBe(custom_error);
			expect(error.code).toBe('ENOENT');
		}
	});

	test('error on first item', async () => {
		const processed: Array<number> = [];

		await expect(
			each_concurrent(
				[1, 2, 3],
				async (x) => {
					if (x === 1) throw new Error('first item error');
					processed.push(x);
				},
				1,
			),
		).rejects.toThrow('first item error');

		// With concurrency 1, should not process any items after the first fails
		expect(processed).toEqual([]);
	});

	test('error on last item', async () => {
		const processed: Array<number> = [];

		await expect(
			each_concurrent(
				[1, 2, 3],
				async (x) => {
					if (x === 3) throw new Error('last item error');
					processed.push(x);
				},
				1,
			),
		).rejects.toThrow('last item error');

		expect(processed).toEqual([1, 2]);
	});
});

describe('map_concurrent', () => {
	test('processes all items', async () => {
		const items = [1, 2, 3, 4, 5];
		const results = await map_concurrent(items, async (x) => x * 2, 3);
		expect(results).toEqual([2, 4, 6, 8, 10]);
	});

	test('preserves order with varying delays', async () => {
		const items = [50, 10, 30, 20, 40]; // delays in ms
		const results = await map_concurrent(
			items,
			async (delay, index) => {
				await new Promise((r) => setTimeout(r, delay));
				return index;
			},
			3,
		);
		// Results should be in original order, not completion order
		expect(results).toEqual([0, 1, 2, 3, 4]);
	});

	test('respects concurrency limit', async () => {
		let max_concurrent = 0;
		let current_concurrent = 0;

		const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		await map_concurrent(
			items,
			async (x) => {
				current_concurrent++;
				max_concurrent = Math.max(max_concurrent, current_concurrent);
				await new Promise((r) => setTimeout(r, 10));
				current_concurrent--;
				return x;
			},
			3,
		);

		expect(max_concurrent).toBe(3);
	});

	test('handles empty array', async () => {
		const results = await map_concurrent([], async (x: number) => x * 2, 3);
		expect(results).toEqual([]);
	});

	test('handles single item', async () => {
		const results = await map_concurrent([42], async (x) => x * 2, 3);
		expect(results).toEqual([84]);
	});

	test('fails fast on error', async () => {
		const processed: Array<number> = [];

		await expect(
			map_concurrent(
				[1, 2, 3, 4, 5],
				async (x) => {
					await new Promise((r) => setTimeout(r, 10));
					if (x === 3) throw new Error('test error');
					processed.push(x);
					return x;
				},
				2,
			),
		).rejects.toThrow('test error');

		// Should have processed some items before failing
		// With concurrency 2: items 1,2 start, then 3 starts when one finishes
		expect(processed.length).toBeLessThan(5);
	});

	test('throws on invalid concurrency', async () => {
		await expect(map_concurrent([1], async (x) => x, 0)).rejects.toThrow(
			'concurrency must be at least 1',
		);
		await expect(map_concurrent([1], async (x) => x, -1)).rejects.toThrow(
			'concurrency must be at least 1',
		);
	});

	test('concurrency 1 is sequential', async () => {
		const order: Array<number> = [];
		const items = [30, 10, 20]; // different delays

		await map_concurrent(
			items,
			async (delay, index) => {
				await new Promise((r) => setTimeout(r, delay));
				order.push(index);
				return index;
			},
			1,
		);

		// With concurrency 1, should process in input order regardless of delay
		expect(order).toEqual([0, 1, 2]);
	});

	test('passes index to callback', async () => {
		const items = ['a', 'b', 'c'];
		const results = await map_concurrent(items, async (item, index) => `${item}:${index}`, 3);
		expect(results).toEqual(['a:0', 'b:1', 'c:2']);
	});

	test('high concurrency with fewer items', async () => {
		const items = [1, 2, 3];
		const results = await map_concurrent(items, async (x) => x * 2, 100);
		expect(results).toEqual([2, 4, 6]);
	});

	test('handles undefined results correctly', async () => {
		const results = await map_concurrent([1, 2, 3], async () => undefined, 3);
		expect(results).toEqual([undefined, undefined, undefined]);
		expect(results).toHaveLength(3);
	});

	test('handles null results correctly', async () => {
		const results = await map_concurrent([1, 2, 3], async () => null, 3);
		expect(results).toEqual([null, null, null]);
	});

	test('preserves error object', async () => {
		const custom_error = new Error('custom');
		(custom_error as any).code = 'ENOENT';

		try {
			await map_concurrent(
				[1],
				async () => {
					throw custom_error;
				},
				3,
			);
			expect.fail('should have thrown');
		} catch (error) {
			expect(error).toBe(custom_error);
			expect(error.code).toBe('ENOENT');
		}
	});

	test('error on first item', async () => {
		const processed: Array<number> = [];

		await expect(
			map_concurrent(
				[1, 2, 3],
				async (x) => {
					if (x === 1) throw new Error('first item error');
					processed.push(x);
					return x;
				},
				1,
			),
		).rejects.toThrow('first item error');

		// With concurrency 1, should not process any items after the first fails
		expect(processed).toEqual([]);
	});

	test('error on last item', async () => {
		const processed: Array<number> = [];

		await expect(
			map_concurrent(
				[1, 2, 3],
				async (x) => {
					if (x === 3) throw new Error('last item error');
					processed.push(x);
					return x;
				},
				1,
			),
		).rejects.toThrow('last item error');

		expect(processed).toEqual([1, 2]);
	});

	test('items.length equals concurrency', async () => {
		let max_concurrent = 0;
		let current_concurrent = 0;

		const items = [1, 2, 3];
		const results = await map_concurrent(
			items,
			async (x) => {
				current_concurrent++;
				max_concurrent = Math.max(max_concurrent, current_concurrent);
				await new Promise((r) => setTimeout(r, 10));
				current_concurrent--;
				return x * 2;
			},
			3, // same as items.length
		);

		expect(results).toEqual([2, 4, 6]);
		expect(max_concurrent).toBe(3);
	});

	test('handles synchronous throw in async function', async () => {
		await expect(
			map_concurrent(
				[1, 2, 3],
				async (x) => {
					if (x === 2) {
						// Synchronous throw, not a rejection
						throw new Error('sync throw');
					}
					return x;
				},
				3,
			),
		).rejects.toThrow('sync throw');
	});

	test('nested calls', async () => {
		const results = await map_concurrent(
			[1, 2],
			async (x) => {
				const inner = await map_concurrent([10, 20], async (y) => x * y, 2);
				return inner;
			},
			2,
		);
		expect(results).toEqual([
			[10, 20],
			[20, 40],
		]);
	});
});

describe('map_concurrent_settled', () => {
	test('collects all results', async () => {
		const items = [1, 2, 3, 4, 5];
		const results = await map_concurrent_settled(items, async (x) => x * 2, 3);
		expect(results).toEqual([
			{status: 'fulfilled', value: 2},
			{status: 'fulfilled', value: 4},
			{status: 'fulfilled', value: 6},
			{status: 'fulfilled', value: 8},
			{status: 'fulfilled', value: 10},
		]);
	});

	test('collects errors without failing', async () => {
		const results = await map_concurrent_settled(
			[1, 2, 3, 4, 5],
			async (x) => {
				if (x === 2 || x === 4) throw new Error(`error ${x}`);
				return x * 2;
			},
			2,
		);

		expect(results[0]).toEqual({status: 'fulfilled', value: 2});
		expect(results[1]!.status).toBe('rejected');
		expect(results[2]).toEqual({status: 'fulfilled', value: 6});
		expect(results[3]!.status).toBe('rejected');
		expect(results[4]).toEqual({status: 'fulfilled', value: 10});

		const rejected = results.filter((r) => r.status === 'rejected');
		expect(rejected).toHaveLength(2);
	});

	test('preserves order with varying delays', async () => {
		const items = [50, 10, 30, 20, 40];
		const results = await map_concurrent_settled(
			items,
			async (delay, index) => {
				await new Promise((r) => setTimeout(r, delay));
				return index;
			},
			3,
		);
		const values = results.map((r) => (r.status === 'fulfilled' ? r.value : undefined));
		expect(values).toEqual([0, 1, 2, 3, 4]);
	});

	test('handles empty array', async () => {
		const results = await map_concurrent_settled([], async (x: number) => x, 3);
		expect(results).toEqual([]);
	});

	test('throws on invalid concurrency', async () => {
		await expect(map_concurrent_settled([1], async (x) => x, 0)).rejects.toThrow(
			'concurrency must be at least 1',
		);
	});

	test('all items fail', async () => {
		const results = await map_concurrent_settled(
			[1, 2, 3],
			async (x) => {
				throw new Error(`error ${x}`);
			},
			2,
		);

		expect(results.every((r) => r.status === 'rejected')).toBe(true);
		expect(results).toHaveLength(3);
	});

	test('preserves error objects', async () => {
		const custom_error = new Error('custom');
		(custom_error as any).code = 'CUSTOM_CODE';

		const results = await map_concurrent_settled(
			[1],
			async () => {
				throw custom_error;
			},
			3,
		);

		expect(results).toHaveLength(1);
		expect(results[0]!.status).toBe('rejected');
		const rejected = results[0] as PromiseRejectedResult;
		expect(rejected.reason).toBe(custom_error);
		expect(rejected.reason.code).toBe('CUSTOM_CODE');
	});

	test('error indices are correct with varying delays', async () => {
		const results = await map_concurrent_settled(
			[1, 2, 3, 4, 5],
			async (x) => {
				// Items 2 and 4 fail, but 4 completes before 2 due to shorter delay
				if (x === 2) {
					await new Promise((r) => setTimeout(r, 50));
					throw new Error('error 2');
				}
				if (x === 4) {
					await new Promise((r) => setTimeout(r, 10));
					throw new Error('error 4');
				}
				return x;
			},
			5,
		);

		// Error indices should reflect original array positions, not completion order
		expect(results[0]!.status).toBe('fulfilled');
		expect(results[1]!.status).toBe('rejected'); // index 1 = item 2
		expect(results[2]!.status).toBe('fulfilled');
		expect(results[3]!.status).toBe('rejected'); // index 3 = item 4
		expect(results[4]!.status).toBe('fulfilled');
	});

	test('respects concurrency limit', async () => {
		let max_concurrent = 0;
		let current_concurrent = 0;

		await map_concurrent_settled(
			[1, 2, 3, 4, 5, 6],
			async () => {
				current_concurrent++;
				max_concurrent = Math.max(max_concurrent, current_concurrent);
				await new Promise((r) => setTimeout(r, 10));
				current_concurrent--;
			},
			2,
		);

		expect(max_concurrent).toBe(2);
	});

	test('single item fails', async () => {
		const results = await map_concurrent_settled(
			[1],
			async () => {
				throw new Error('single failure');
			},
			1,
		);

		expect(results).toHaveLength(1);
		expect(results[0]!.status).toBe('rejected');
	});

	test('first item fails, rest succeed', async () => {
		const results = await map_concurrent_settled(
			[1, 2, 3],
			async (x) => {
				if (x === 1) throw new Error('first fails');
				return x * 2;
			},
			1,
		);

		expect(results[0]!.status).toBe('rejected');
		expect(results[1]).toEqual({status: 'fulfilled', value: 4});
		expect(results[2]).toEqual({status: 'fulfilled', value: 6});
	});

	test('last item fails, rest succeed', async () => {
		const results = await map_concurrent_settled(
			[1, 2, 3],
			async (x) => {
				if (x === 3) throw new Error('last fails');
				return x * 2;
			},
			1,
		);

		expect(results[0]).toEqual({status: 'fulfilled', value: 2});
		expect(results[1]).toEqual({status: 'fulfilled', value: 4});
		expect(results[2]!.status).toBe('rejected');
	});

	test('distinguishes undefined value from failure', async () => {
		const results = await map_concurrent_settled(
			[1, 2, 3],
			async (x) => {
				if (x === 1) return undefined;
				if (x === 2) throw new Error('fail');
				return x;
			},
			3,
		);

		// undefined return is fulfilled, not rejected
		expect(results[0]).toEqual({status: 'fulfilled', value: undefined});
		expect(results[1]!.status).toBe('rejected');
		expect(results[2]).toEqual({status: 'fulfilled', value: 3});
	});
});
