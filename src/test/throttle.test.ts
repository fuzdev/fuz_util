import {test, assert} from 'vitest';

import {throttle} from '../lib/throttle.ts';
import {wait} from '../lib/async.ts';

test('throttles calls to a function', async () => {
	const results: Array<string> = [];
	const fn = throttle(async (name: string) => {
		results.push(name + '_run');
		await wait();
		results.push(name + '_done');
	});

	const promise_a = fn('a'); // called immediately
	const promise_b = fn('b'); // discarded
	const promise_c = fn('c'); // discarded
	const promise_d = fn('d'); // called at trailing edge

	assert.ok(promise_a !== promise_b);
	assert.strictEqual(promise_b, promise_c);
	assert.strictEqual(promise_b, promise_d);

	assert.deepEqual(results, ['a_run']); // called immediately

	await promise_a;

	assert.deepEqual(results, ['a_run', 'a_done']);

	await wait();

	assert.deepEqual(results, ['a_run', 'a_done', 'd_run']);

	await promise_b;

	assert.deepEqual(results, ['a_run', 'a_done', 'd_run', 'd_done']);
});

test('calls functions in sequence', async () => {
	const results: Array<string> = [];
	const fn = throttle(async (name: string) => {
		results.push(name + '_run');
		await wait();
		results.push(name + '_done');
	});

	const promise_a = fn('a'); // called immediately

	assert.deepEqual(results, ['a_run']); // called immediately

	await promise_a;

	assert.deepEqual(results, ['a_run', 'a_done']);

	const promise_b = fn('b'); // called immediately

	assert.deepEqual(results, ['a_run', 'a_done', 'b_run']); // called immediately

	assert.ok(promise_a !== promise_b);

	await promise_b;

	assert.deepEqual(results, ['a_run', 'a_done', 'b_run', 'b_done']);
});

test("throttles calls to a function with when='trailing'", async () => {
	const results: Array<string> = [];
	const fn = throttle(
		async (name: string) => {
			results.push(name + '_run');
			await wait();
			results.push(name + '_done');
		},
		{when: 'trailing'},
	);

	const promise_a = fn('a'); // discarded
	const promise_b = fn('b'); // discarded
	const promise_c = fn('c'); // discarded
	const promise_d = fn('d'); // called at trailing edge

	assert.strictEqual(promise_a, promise_b);
	assert.strictEqual(promise_a, promise_c);
	assert.strictEqual(promise_a, promise_d);

	assert.deepEqual(results, []); // no immediate call

	await wait();

	assert.deepEqual(results, ['d_run']);

	await promise_a;

	assert.deepEqual(results, ['d_run', 'd_done']);

	const promise_e = fn('e'); // called at trailing edge

	assert.ok(promise_a !== promise_e);
	assert.deepEqual(results, ['d_run', 'd_done']);

	await wait();

	assert.deepEqual(results, ['d_run', 'd_done', 'e_run']);

	await promise_e;

	assert.deepEqual(results, ['d_run', 'd_done', 'e_run', 'e_done']);

	const promise_f = fn('f'); // discarded
	const promise_g = fn('g'); // called at trailing edge

	assert.ok(promise_e !== promise_f);
	assert.ok(promise_f === promise_g);
	assert.deepEqual(results, ['d_run', 'd_done', 'e_run', 'e_done']);

	await wait();

	assert.deepEqual(results, ['d_run', 'd_done', 'e_run', 'e_done', 'g_run']);

	await promise_g;

	assert.deepEqual(results, ['d_run', 'd_done', 'e_run', 'e_done', 'g_run', 'g_done']);
});

test('throttles with non-zero delay', async () => {
	const results: Array<string> = [];
	const fn = throttle(
		async (name: string) => {
			results.push(name + '_run');
			await wait();
			results.push(name + '_done');
		},
		{delay: 10},
	);

	const promise_a = fn('a'); // called immediately
	assert.deepEqual(results, ['a_run']);

	// While 'a' is pending, queue 'b' then 'c' — 'c' replaces 'b'
	const promise_b = fn('b');
	void fn('c');

	await promise_a;
	assert.deepEqual(results, ['a_run', 'a_done']);

	// Wait for the delay timer to fire and the flush to execute
	await wait(20);
	await promise_b;

	// 'c' should have been called (trailing), not 'b'
	assert.isTrue(results.includes('c_run'));
	assert.isFalse(results.includes('b_run'));
});

test("throttles calls to a function with when='leading'", async () => {
	const results: Array<string> = [];
	const fn = throttle(
		async (name: string) => {
			results.push(name + '_run');
			await wait();
			results.push(name + '_done');
		},
		{when: 'leading'},
	);

	const promise_a = fn('a'); // called immediately
	const promise_b = fn('b'); // discarded
	const promise_c = fn('c'); // discarded
	const promise_d = fn('d'); // discarded

	assert.strictEqual(promise_a, promise_b);
	assert.strictEqual(promise_a, promise_c);
	assert.strictEqual(promise_a, promise_d);

	assert.deepEqual(results, ['a_run']); // called immediately

	await promise_a;

	assert.deepEqual(results, ['a_run', 'a_done']);

	const promise_e = fn('e'); // called immediately

	assert.ok(promise_a !== promise_e);

	assert.deepEqual(results, ['a_run', 'a_done', 'e_run']); // called immediately

	await promise_e;

	assert.deepEqual(results, ['a_run', 'a_done', 'e_run', 'e_done']);

	const promise_f = fn('f'); // called immediately
	const promise_g = fn('g'); // discarded

	assert.ok(promise_e !== promise_f);
	assert.ok(promise_f === promise_g);

	assert.deepEqual(results, ['a_run', 'a_done', 'e_run', 'e_done', 'f_run']); // called immediately

	await promise_g;

	assert.deepEqual(results, ['a_run', 'a_done', 'e_run', 'e_done', 'f_run', 'f_done']);
});
