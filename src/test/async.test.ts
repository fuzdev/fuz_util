import {test, expect, assert, describe} from 'vitest';

import {
	wait,
	is_promise,
	create_deferred,
	AsyncSemaphore,
	each_concurrent,
	map_concurrent,
	map_concurrent_settled,
} from '$lib/async.ts';

/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable no-await-in-loop */

describe('wait', () => {
	test('resolves with no args', async () => {
		await wait();
	});

	test('resolves after approximately the given duration', async () => {
		const start = Date.now();
		await wait(50);
		const elapsed = Date.now() - start;
		assert.isAtLeast(elapsed, 30);
	});
});

describe('is_promise', () => {
	test('actual Promise returns true', () => {
		assert.isTrue(is_promise(Promise.resolve(42)));
		assert.isTrue(is_promise(new Promise(() => {})));
	});

	test('thenable object returns true', () => {
		assert.isTrue(is_promise({then: () => {}}));
	});

	test('null returns false', () => {
		assert.isFalse(is_promise(null));
	});

	test('undefined returns false', () => {
		assert.isFalse(is_promise(undefined));
	});

	test('number returns false', () => {
		assert.isFalse(is_promise(42));
	});

	test('string returns false', () => {
		assert.isFalse(is_promise('hello'));
	});

	test('plain object returns false', () => {
		assert.isFalse(is_promise({}));
		assert.isFalse(is_promise({value: 42}));
	});

	test('object with non-function then returns false', () => {
		assert.isFalse(is_promise({then: 'not a function'}));
		assert.isFalse(is_promise({then: 42}));
		assert.isFalse(is_promise({then: true}));
	});

	test('boolean returns false', () => {
		assert.isFalse(is_promise(true));
		assert.isFalse(is_promise(false));
	});

	test('array returns false', () => {
		assert.isFalse(is_promise([1, 2, 3]));
	});

	test('function returns false', () => {
		assert.isFalse(is_promise(() => {}));
	});
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

	test('works with void type', async () => {
		const deferred = create_deferred<void>();
		deferred.resolve();
		await deferred.promise;
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

	test('handles synchronous throw in async function', async () => {
		await expect(
			each_concurrent(
				[1, 2, 3],
				async (x) => {
					if (x === 2) {
						throw new Error('sync throw');
					}
				},
				3,
			),
		).rejects.toThrow('sync throw');
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

describe('AsyncSemaphore', () => {
	test('acquire resolves immediately when permits available', async () => {
		const sem = new AsyncSemaphore(2);
		await sem.acquire(); // should not block
		await sem.acquire(); // should not block
	});

	test('acquire blocks when no permits available', async () => {
		const sem = new AsyncSemaphore(1);
		await sem.acquire();

		let acquired = false;
		const pending = sem.acquire().then(() => {
			acquired = true;
		});

		// Give microtasks a chance to run
		await new Promise((r) => setTimeout(r, 10));
		assert.isFalse(acquired, 'should be blocked waiting for permit');

		sem.release();
		await pending;
		assert.isTrue(acquired, 'should have acquired after release');
	});

	test('release grants permit to next waiter', async () => {
		const sem = new AsyncSemaphore(1);
		await sem.acquire();

		const order: Array<string> = [];
		const p1 = sem.acquire().then(() => order.push('first'));
		const p2 = sem.acquire().then(() => order.push('second'));

		sem.release(); // grants to first waiter
		await p1;
		sem.release(); // grants to second waiter
		await p2;

		assert.deepEqual(order, ['first', 'second']);
	});

	test('release increments permits when no waiters', async () => {
		const sem = new AsyncSemaphore(1);
		await sem.acquire();
		sem.release();
		// Should be able to acquire again without blocking
		await sem.acquire();
	});

	test('infinity permits never blocks', async () => {
		const sem = new AsyncSemaphore(Infinity);
		// Acquire many times without releasing — should never block
		for (let i = 0; i < 100; i++) {
			await sem.acquire();
		}
	});

	test('zero permits blocks immediately', async () => {
		const sem = new AsyncSemaphore(0);
		let acquired = false;
		const pending = sem.acquire().then(() => {
			acquired = true;
		});

		await new Promise((r) => setTimeout(r, 10));
		assert.isFalse(acquired);

		sem.release();
		await pending;
		assert.isTrue(acquired);
	});

	test('limits concurrency in practice', async () => {
		const sem = new AsyncSemaphore(2);
		let current = 0;
		let max_concurrent = 0;

		const task = async (): Promise<void> => {
			await sem.acquire();
			current++;
			if (current > max_concurrent) max_concurrent = current;
			await new Promise((r) => setTimeout(r, 20));
			current--;
			sem.release();
		};

		await Promise.all([task(), task(), task(), task(), task()]);

		assert.strictEqual(max_concurrent, 2);
		assert.strictEqual(current, 0);
	});

	test('FIFO ordering of waiters', async () => {
		const sem = new AsyncSemaphore(0);
		const order: Array<number> = [];

		const p1 = sem.acquire().then(() => order.push(1));
		const p2 = sem.acquire().then(() => order.push(2));
		const p3 = sem.acquire().then(() => order.push(3));

		sem.release();
		await p1;
		sem.release();
		await p2;
		sem.release();
		await p3;

		assert.deepEqual(order, [1, 2, 3]);
	});

	test('multiple releases before acquires', async () => {
		const sem = new AsyncSemaphore(0);
		sem.release();
		sem.release();
		sem.release();

		// Should be able to acquire 3 times without blocking
		await sem.acquire();
		await sem.acquire();
		await sem.acquire();
	});
});
