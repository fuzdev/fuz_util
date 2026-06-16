import {test, assert} from 'vitest';

import {LruMap} from '$lib/lru_map.ts';

test('basic set / get / has / delete / size behave like Map', () => {
	const lru = new LruMap<string, number>(3);

	assert.strictEqual(lru.size, 0);
	assert.strictEqual(lru.get('a'), undefined);
	assert.strictEqual(lru.has('a'), false);
	assert.strictEqual(lru.delete('a'), false);

	assert.strictEqual(lru.set('a', 1), lru);
	lru.set('b', 2);

	assert.strictEqual(lru.size, 2);
	assert.strictEqual(lru.has('a'), true);
	assert.strictEqual(lru.has('b'), true);
	assert.strictEqual(lru.get('a'), 1);
	assert.strictEqual(lru.get('b'), 2);

	assert.strictEqual(lru.delete('a'), true);
	assert.strictEqual(lru.delete('a'), false);
	assert.strictEqual(lru.size, 1);
	assert.strictEqual(lru.has('a'), false);
});

test('capacity <= 0 throws at construction', () => {
	assert.throws(() => new LruMap(0), /positive integer/);
	assert.throws(() => new LruMap(-1), /positive integer/);
	assert.throws(() => new LruMap(-100), /positive integer/);
});

test('non-integer or non-finite capacity throws at construction', () => {
	assert.throws(() => new LruMap(1.5), /positive integer/);
	assert.throws(() => new LruMap(NaN), /positive integer/);
	assert.throws(() => new LruMap(Infinity), /positive integer/);
});

test('insertion beyond capacity evicts the LRU entry', () => {
	const lru = new LruMap<string, number>(3);
	lru.set('a', 1);
	lru.set('b', 2);
	lru.set('c', 3);
	assert.strictEqual(lru.size, 3);

	lru.set('d', 4);

	assert.strictEqual(lru.size, 3);
	assert.strictEqual(lru.has('a'), false);
	assert.strictEqual(lru.has('b'), true);
	assert.strictEqual(lru.has('c'), true);
	assert.strictEqual(lru.has('d'), true);
});

test('get(existing_key) moves it to MRU, changing next eviction target', () => {
	const lru = new LruMap<string, number>(3);
	lru.set('a', 1);
	lru.set('b', 2);
	lru.set('c', 3);

	// touch 'a' so it is no longer the LRU
	assert.strictEqual(lru.get('a'), 1);

	lru.set('d', 4);

	assert.strictEqual(lru.has('a'), true, "'a' was touched and should survive");
	assert.strictEqual(lru.has('b'), false, "'b' should now be the evicted LRU");
	assert.strictEqual(lru.has('c'), true);
	assert.strictEqual(lru.has('d'), true);
});

test('peek does NOT change eviction order', () => {
	const lru = new LruMap<string, number>(3);
	lru.set('a', 1);
	lru.set('b', 2);
	lru.set('c', 3);

	assert.strictEqual(lru.peek('a'), 1);
	assert.strictEqual(lru.peek('missing'), undefined);

	lru.set('d', 4);

	// 'a' stayed the LRU despite peek, so it was evicted
	assert.strictEqual(lru.has('a'), false);
	assert.strictEqual(lru.has('b'), true);
	assert.strictEqual(lru.has('c'), true);
	assert.strictEqual(lru.has('d'), true);
});

test('has does NOT change eviction order (Map parity)', () => {
	const lru = new LruMap<string, number>(3);
	lru.set('a', 1);
	lru.set('b', 2);
	lru.set('c', 3);

	assert.strictEqual(lru.has('a'), true);

	lru.set('d', 4);

	assert.strictEqual(lru.has('a'), false, "'has' must not refresh recency");
});

test('set on an existing key updates the value and moves it to MRU', () => {
	const lru = new LruMap<string, number>(3);
	lru.set('a', 1);
	lru.set('b', 2);
	lru.set('c', 3);

	// overwrite 'a' — should refresh to MRU
	lru.set('a', 99);

	assert.strictEqual(lru.get('a'), 99);

	lru.set('d', 4);

	assert.strictEqual(lru.has('a'), true, 'overwriting should mark MRU');
	assert.strictEqual(lru.has('b'), false, "'b' is now the LRU and should be evicted");
	assert.strictEqual(lru.has('c'), true);
	assert.strictEqual(lru.has('d'), true);
});

test('iteration order is LRU → MRU and reflects access', () => {
	const lru = new LruMap<string, number>(3);
	lru.set('a', 1);
	lru.set('b', 2);
	lru.set('c', 3);

	assert.deepEqual(
		[...lru],
		[
			['a', 1],
			['b', 2],
			['c', 3],
		],
	);
	assert.deepEqual([...lru.keys()], ['a', 'b', 'c']);
	assert.deepEqual([...lru.values()], [1, 2, 3]);
	assert.deepEqual(
		[...lru.entries()],
		[
			['a', 1],
			['b', 2],
			['c', 3],
		],
	);

	lru.get('a'); // move 'a' to MRU

	assert.deepEqual([...lru.keys()], ['b', 'c', 'a']);
});

test('on_evict fires with the evicted (key, value) when included', () => {
	const evictions: Array<[string, number]> = [];
	const lru = new LruMap<string, number>(2, {
		on_evict: (key, value) => {
			evictions.push([key, value]);
		},
	});

	lru.set('a', 1);
	lru.set('b', 2);
	assert.deepEqual(evictions, []);

	lru.set('c', 3); // evicts 'a'
	assert.deepEqual(evictions, [['a', 1]]);

	lru.set('d', 4); // evicts 'b'
	assert.deepEqual(evictions, [
		['a', 1],
		['b', 2],
	]);
});

test('on_evict does NOT fire on delete, clear, or overwrite', () => {
	const evictions: Array<[string, number]> = [];
	const lru = new LruMap<string, number>(3, {
		on_evict: (key, value) => {
			evictions.push([key, value]);
		},
	});

	lru.set('a', 1);
	lru.set('b', 2);
	lru.set('c', 3);

	lru.delete('a');
	lru.set('b', 20); // overwrite, not eviction
	lru.clear();

	assert.deepEqual(evictions, []);
});

test('clear() resets size and iteration is empty afterward', () => {
	const lru = new LruMap<string, number>(3);
	lru.set('a', 1);
	lru.set('b', 2);
	lru.set('c', 3);

	lru.clear();

	assert.strictEqual(lru.size, 0);
	assert.strictEqual(lru.has('a'), false);
	assert.strictEqual(lru.get('a'), undefined);
	assert.deepEqual([...lru], []);
	assert.deepEqual([...lru.keys()], []);
	assert.deepEqual([...lru.values()], []);
	assert.deepEqual([...lru.entries()], []);

	// still usable after clear
	lru.set('x', 42);
	assert.strictEqual(lru.size, 1);
	assert.strictEqual(lru.get('x'), 42);
});

test('capacity of 1 works and always evicts the previous entry', () => {
	const evictions: Array<[string, number]> = [];
	const lru = new LruMap<string, number>(1, {
		on_evict: (key, value) => {
			evictions.push([key, value]);
		},
	});

	lru.set('a', 1);
	assert.strictEqual(lru.size, 1);

	lru.set('b', 2);
	assert.strictEqual(lru.size, 1);
	assert.strictEqual(lru.has('a'), false);
	assert.strictEqual(lru.has('b'), true);
	assert.deepEqual(evictions, [['a', 1]]);
});

test('works with object keys', () => {
	const lru = new LruMap<{id: number}, string>(2);
	const k1 = {id: 1};
	const k2 = {id: 2};
	const k3 = {id: 3};

	lru.set(k1, 'one');
	lru.set(k2, 'two');
	assert.strictEqual(lru.get(k1), 'one'); // k1 → MRU
	lru.set(k3, 'three'); // evicts k2

	assert.strictEqual(lru.has(k1), true);
	assert.strictEqual(lru.has(k2), false);
	assert.strictEqual(lru.has(k3), true);
});

test('overwriting an existing key at capacity does NOT evict', () => {
	const evictions: Array<[string, number]> = [];
	const lru = new LruMap<string, number>(3, {
		on_evict: (key, value) => {
			evictions.push([key, value]);
		},
	});

	lru.set('a', 1);
	lru.set('b', 2);
	lru.set('c', 3);
	assert.strictEqual(lru.size, 3);

	// overwrite in place, many times, always at capacity
	for (let i = 0; i < 10; i++) {
		lru.set('b', 100 + i);
	}

	assert.strictEqual(lru.size, 3);
	assert.deepEqual(evictions, [], 'overwrite must never trigger on_evict');
	assert.strictEqual(lru.has('a'), true);
	assert.strictEqual(lru.has('b'), true);
	assert.strictEqual(lru.has('c'), true);
	assert.strictEqual(lru.peek('b'), 109);
});

test('delete frees a slot so the next insert does not evict', () => {
	const evictions: Array<[string, number]> = [];
	const lru = new LruMap<string, number>(3, {
		on_evict: (key, value) => {
			evictions.push([key, value]);
		},
	});

	lru.set('a', 1);
	lru.set('b', 2);
	lru.set('c', 3);

	assert.strictEqual(lru.delete('b'), true);
	lru.set('d', 4);

	assert.strictEqual(lru.size, 3);
	assert.deepEqual(evictions, []);
	assert.strictEqual(lru.has('a'), true);
	assert.strictEqual(lru.has('b'), false);
	assert.strictEqual(lru.has('c'), true);
	assert.strictEqual(lru.has('d'), true);
});

test('deleting the current LRU changes the next eviction target', () => {
	const evictions: Array<[string, number]> = [];
	const lru = new LruMap<string, number>(3, {
		on_evict: (key, value) => {
			evictions.push([key, value]);
		},
	});

	lru.set('a', 1);
	lru.set('b', 2);
	lru.set('c', 3);

	// 'a' is the LRU; remove it
	assert.strictEqual(lru.delete('a'), true);

	// fill back to cap (no eviction yet — we're under cap)
	lru.set('d', 4);
	assert.deepEqual(evictions, []);

	// one more push — 'b' is now the LRU, should be evicted
	lru.set('e', 5);
	assert.deepEqual(evictions, [['b', 2]]);
	assert.strictEqual(lru.has('a'), false);
	assert.strictEqual(lru.has('b'), false);
	assert.strictEqual(lru.has('c'), true);
	assert.strictEqual(lru.has('d'), true);
	assert.strictEqual(lru.has('e'), true);
});

test('get(missing_key) returns undefined and does NOT perturb eviction order', () => {
	const lru = new LruMap<string, number>(3);
	lru.set('a', 1);
	lru.set('b', 2);
	lru.set('c', 3);

	// repeated misses must not touch recency
	for (let i = 0; i < 5; i++) {
		assert.strictEqual(lru.get('missing_' + i), undefined);
	}
	assert.deepEqual([...lru.keys()], ['a', 'b', 'c']);

	lru.set('d', 4);

	// 'a' is still the LRU and gets evicted — misses did not rescue it
	assert.strictEqual(lru.has('a'), false);
	assert.strictEqual(lru.has('b'), true);
	assert.strictEqual(lru.has('c'), true);
	assert.strictEqual(lru.has('d'), true);
});

test('undefined as a value is distinguishable from absence and participates in LRU order', () => {
	const evictions: Array<[string, number | undefined]> = [];
	const lru = new LruMap<string, number | undefined>(3, {
		on_evict: (key, value) => {
			evictions.push([key, value]);
		},
	});

	lru.set('a', undefined);
	lru.set('b', 2);
	lru.set('c', 3);

	assert.strictEqual(lru.has('a'), true);
	assert.strictEqual(lru.get('a'), undefined);
	assert.strictEqual(lru.has('missing'), false);
	assert.strictEqual(lru.get('missing'), undefined);

	// the get('a') above marked it MRU, so 'b' is the LRU now
	lru.set('d', 4);

	assert.strictEqual(lru.has('a'), true);
	assert.strictEqual(lru.has('b'), false);
	assert.strictEqual(lru.has('c'), true);
	assert.strictEqual(lru.has('d'), true);

	// overwrite with a defined value
	lru.set('a', 42);
	assert.strictEqual(lru.peek('a'), 42);

	// push 'a' to LRU and evict — hook must receive the defined 42, not undefined
	lru.set('e', 5); // 'c' is LRU now
	lru.set('f', 6); // 'd' is LRU now
	lru.set('g', 7); // 'a' is LRU now, evicts with value 42
	assert.deepEqual(evictions, [
		['b', 2],
		['c', 3],
		['d', 4],
		['a', 42],
	]);
});

test('on_evict receives undefined when the evicted value is undefined', () => {
	const evictions: Array<[string, number | undefined]> = [];
	const lru = new LruMap<string, number | undefined>(2, {
		on_evict: (key, value) => {
			evictions.push([key, value]);
		},
	});

	lru.set('a', undefined);
	lru.set('b', 2);
	lru.set('c', 3); // evicts 'a' with value undefined

	assert.strictEqual(evictions.length, 1);
	assert.strictEqual(evictions[0]![0], 'a');
	assert.strictEqual(evictions[0]![1], undefined);
});

test('re-setting the same key with the same value still marks it MRU', () => {
	const lru = new LruMap<string, number>(3);
	lru.set('a', 1);
	lru.set('b', 2);
	lru.set('c', 3);

	// identical re-write — still counts as a use
	lru.set('a', 1);

	lru.set('d', 4);

	assert.strictEqual(lru.has('a'), true, 'identical re-write should refresh recency');
	assert.strictEqual(lru.has('b'), false, "'b' is now the LRU");
	assert.strictEqual(lru.has('c'), true);
	assert.strictEqual(lru.has('d'), true);
});

test('on_evict fires AFTER the new entry is inserted', () => {
	const observed: Array<{evicted: [string, number]; size: number; has_new: boolean}> = [];
	const lru = new LruMap<string, number>(2, {
		on_evict: (key, value) => {
			observed.push({
				evicted: [key, value],
				size: lru.size,
				has_new: lru.has('c'),
			});
		},
	});

	lru.set('a', 1);
	lru.set('b', 2);
	lru.set('c', 3); // evicts 'a'

	assert.strictEqual(observed.length, 1);
	const first = observed[0]!;
	assert.deepEqual(first.evicted, ['a', 1]);
	assert.strictEqual(first.size, 2, 'new entry is already counted when on_evict runs');
	assert.strictEqual(first.has_new, true, "'c' is already present when on_evict runs");
});

test('on_evict that throws leaves the map in a consistent post-set state', () => {
	const lru = new LruMap<string, number>(2, {
		on_evict: () => {
			throw new Error('boom');
		},
	});

	lru.set('a', 1);
	lru.set('b', 2);

	assert.throws(() => lru.set('c', 3), /boom/);

	// 'a' was evicted and 'c' was inserted before the throw — map is consistent
	assert.strictEqual(lru.size, 2);
	assert.strictEqual(lru.has('a'), false);
	assert.strictEqual(lru.has('b'), true);
	assert.strictEqual(lru.has('c'), true);
	assert.strictEqual(lru.peek('c'), 3);
});
