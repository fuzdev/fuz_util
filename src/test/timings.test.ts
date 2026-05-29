import {describe, test, assert} from 'vitest';

import {create_stopwatch, Timings} from '$lib/timings.ts';

describe('create_stopwatch', () => {
	test('returns elapsed time >= 0', () => {
		const stopwatch = create_stopwatch(4);
		const elapsed = stopwatch();
		assert.isAtLeast(elapsed, 0);
		assert.ok((elapsed.toString().split('.')[1]?.length ?? 0) <= 4);
	});

	test('default decimals is 2', () => {
		const stopwatch = create_stopwatch();
		const elapsed = stopwatch();
		assert.isAtLeast(elapsed, 0);
		assert.ok((elapsed.toString().split('.')[1]?.length ?? 0) <= 2);
	});

	test('reset restarts the timer', () => {
		const stopwatch = create_stopwatch(4);
		const first = stopwatch(true); // read and reset
		assert.isAtLeast(first, 0);
		const second = stopwatch(); // read after reset
		assert.isAtLeast(second, 0);
	});
});

describe('Timings', () => {
	test('start and stop multiple overlapping timings', () => {
		const timings = new Timings(4);
		const timing = timings.start('foo');
		const timing2 = timings.start('foo');
		timings.start('foo_3');
		assert.strictEqual(Array.from(timings.entries()).length, 3);
		timing();
		timing2();
		const elapsed = timings.get('foo');
		assert.isAtLeast(elapsed, 0);
		assert.ok((elapsed.toString().split('.')[1]?.length ?? 0) <= 4);
		assert.deepEqual(
			Array.from(timings.entries(), (e) => e[0]),
			['foo', 'foo_2', 'foo_3'],
		);
	});

	test('get returns 0 for unknown key', () => {
		const timings = new Timings();
		assert.strictEqual(timings.get('nonexistent'), 0);
	});

	test('double-stop returns 0', () => {
		const timings = new Timings(4);
		const timing = timings.start('foo');
		const first = timing();
		assert.isAtLeast(first, 0);
		const second = timing();
		assert.strictEqual(second, 0); // stopwatch already removed
	});

	test('merge timings', () => {
		const a = new Timings(10);
		const b = new Timings(10);
		const timingA = a.start('test');
		const aTiming = timingA();
		assert.isAtLeast(aTiming, 0);
		const timingB = b.start('test');
		const bTiming = timingB();
		assert.isAtLeast(bTiming, 0);
		a.merge(b);
		assert.strictEqual(a.get('test'), aTiming + bTiming);
		assert.strictEqual(b.get('test'), bTiming);
	});

	test('merge with undefined timing preserves undefined', () => {
		const a = new Timings();
		const b = new Timings();
		b.start('running'); // started but not stopped — value is undefined
		a.merge(b);
		// The merged entry should be undefined (not-yet-stopped timing)
		const entries = Array.from(a.entries());
		assert.strictEqual(entries.length, 1);
		assert.strictEqual(entries[0]![0], 'running');
		assert.strictEqual(entries[0]![1], undefined);
	});

	test('entries returns all timings in order', () => {
		const timings = new Timings(4);
		const t1 = timings.start('a');
		const t2 = timings.start('b');
		t1();
		t2();
		const entries = Array.from(timings.entries());
		assert.strictEqual(entries.length, 2);
		assert.strictEqual(entries[0]![0], 'a');
		assert.strictEqual(entries[1]![0], 'b');
		assert.isNumber(entries[0]![1]);
		assert.isNumber(entries[1]![1]);
	});
});
