import { afterEach, assert, beforeEach, describe, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	BENCHMARK_LOCK_PATH,
	benchmark_lock_acquire,
	benchmark_lock_format_refusal,
	type BenchmarkLockHolder
} from '$lib/benchmark_lock.ts';

let dir: string;
let path: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'fuz_benchmark_lock_test_'));
	path = join(dir, 'benchmark.lock');
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

/** The id of a process that has exited. */
const to_dead_pid = (): number => spawnSync(process.execPath, ['-e', '']).pid;

const write_holder = (holder: BenchmarkLockHolder): void =>
	writeFileSync(path, JSON.stringify(holder));

const create_errno_error = (code: string): NodeJS.ErrnoException =>
	Object.assign(new Error(code), { code });

describe('benchmark_lock_acquire', () => {
	test('takes a free lock and names its holder in the file', () => {
		const acquired = benchmark_lock_acquire('test run', { path });
		assert.ok(acquired.ok);
		assert.strictEqual(acquired.lock.path, path);
		const holder: BenchmarkLockHolder = JSON.parse(readFileSync(path, 'utf8'));
		assert.strictEqual(holder.pid, process.pid);
		assert.strictEqual(holder.label, 'test run');
		assert.strictEqual(holder.cwd, process.cwd());
		assert.ok(!Number.isNaN(Date.parse(holder.started_at)));
	});

	test('leaves only the lock file behind, taken or refused', () => {
		const first = benchmark_lock_acquire('first', { path });
		assert.ok(first.ok);
		const second = benchmark_lock_acquire('second', { path });
		assert.ok(!second.ok);
		assert.deepEqual(readdirSync(dir), ['benchmark.lock']);
	});

	test('refuses while a live process holds it, and names that process', () => {
		const first = benchmark_lock_acquire('first', { path });
		assert.ok(first.ok);
		const second = benchmark_lock_acquire('second', { path });
		assert.ok(!second.ok);
		assert.strictEqual(second.path, path);
		assert.ok(second.holder);
		assert.strictEqual(second.holder.pid, process.pid);
		assert.strictEqual(second.holder.label, 'first');
		assert.strictEqual(second.stale, false);
		// the refusal left the holder's lock alone
		assert.strictEqual(JSON.parse(readFileSync(path, 'utf8')).label, 'first');
	});

	test('takes over a lock whose process is gone', () => {
		write_holder({ pid: to_dead_pid(), label: 'crashed', cwd: '/', started_at: 'earlier' });
		const acquired = benchmark_lock_acquire('next', { path });
		assert.ok(acquired.ok);
		assert.strictEqual(JSON.parse(readFileSync(path, 'utf8')).pid, process.pid);
	});

	test('refuses a stale lock it may not remove', () => {
		const stale: BenchmarkLockHolder = {
			pid: to_dead_pid(),
			label: 'another user',
			cwd: '/',
			started_at: 'earlier'
		};
		write_holder(stale);
		const acquired = benchmark_lock_acquire('next', {
			path,
			remove: () => {
				throw create_errno_error('EPERM');
			}
		});
		assert.ok(!acquired.ok);
		assert.deepEqual(acquired.holder, stale);
		assert.strictEqual(acquired.stale, true);
		assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), stale);
	});

	test('rethrows any other error removing a stale lock', () => {
		write_holder({ pid: to_dead_pid(), label: 'crashed', cwd: '/', started_at: 'earlier' });
		assert.throws(
			() =>
				benchmark_lock_acquire('next', {
					path,
					remove: () => {
						throw create_errno_error('EIO');
					}
				}),
			'EIO'
		);
	});

	test('refuses a lock it cannot read, rather than breaking it', () => {
		writeFileSync(path, 'not json');
		const acquired = benchmark_lock_acquire('next', { path });
		assert.ok(!acquired.ok);
		assert.strictEqual(acquired.holder, null);
		assert.strictEqual(readFileSync(path, 'utf8'), 'not json');
	});

	test('refuses a lock naming a pid that is not a positive integer', () => {
		for (const pid of [0, -1, 1.5, 2 ** 31, Number.MAX_SAFE_INTEGER]) {
			writeFileSync(path, JSON.stringify({ pid, label: 'odd', cwd: '/', started_at: 'earlier' }));
			const acquired = benchmark_lock_acquire('next', { path });
			assert.ok(!acquired.ok, `pid ${pid}`);
			assert.strictEqual(acquired.holder, null);
			assert.strictEqual(acquired.stale, false);
		}
	});

	test('release frees the lock, once', () => {
		const acquired = benchmark_lock_acquire('test run', { path });
		assert.ok(acquired.ok);
		assert.strictEqual(acquired.lock.release(), true);
		assert.ok(!existsSync(path));
		// a later holder's lock is not removed by releasing again
		const next = benchmark_lock_acquire('next', { path });
		assert.ok(next.ok);
		assert.strictEqual(acquired.lock.release(), true);
		assert.ok(existsSync(path));
	});

	test('release reports a lock that was taken over, and leaves the new holder alone', () => {
		const acquired = benchmark_lock_acquire('test run', { path });
		assert.ok(acquired.ok);
		const other: BenchmarkLockHolder = { pid: 1, label: 'other', cwd: '/', started_at: 'later' };
		write_holder(other);
		assert.strictEqual(acquired.lock.release(), false);
		assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), other);
		// and a lock that vanished was not held to the end either
		const again = benchmark_lock_acquire('again', { path: join(dir, 'other.lock') });
		assert.ok(again.ok);
		rmSync(again.lock.path);
		assert.strictEqual(again.lock.release(), false);
	});

	test('the default path is fixed on POSIX, not under TMPDIR', () => {
		if (platform() === 'win32') {
			assert.ok(BENCHMARK_LOCK_PATH.startsWith(tmpdir()));
		} else {
			assert.strictEqual(BENCHMARK_LOCK_PATH, '/tmp/fuz_benchmark.lock');
		}
	});
});

describe('benchmark_lock_format_refusal', () => {
	const holder: BenchmarkLockHolder = {
		pid: 4242,
		label: 'full run',
		cwd: '/somewhere',
		started_at: '2026-01-01T00:00:00.000Z'
	};

	test('names a live holder and the file', () => {
		const message = benchmark_lock_format_refusal({ path, holder, stale: false });
		assert.match(message, /held by pid 4242/);
		assert.match(message, /full run/);
		assert.match(message, /\/somewhere/);
		assert.ok(message.includes(path));
	});

	test('says a stale lock it could not remove needs its owner or root', () => {
		const message = benchmark_lock_format_refusal({ path, holder, stale: true });
		assert.match(message, /pid 4242/);
		assert.match(message, /gone/);
		assert.match(message, /owner or root/);
		assert.notMatch(message, /held by/);
		assert.ok(message.includes(path));
	});

	test('says what to do with a lock that names no one', () => {
		assert.ok(benchmark_lock_format_refusal({ path, holder: null, stale: false }).includes(path));
	});
});
