/**
 * A machine-wide benchmark lock: one measuring process at a time. Two benchmark
 * runs at once don't give two noisy results, they give two wrong ones, because
 * each changes the other's caches, frequency ceiling, and scheduling.
 *
 * The lock is a file at a fixed path, `BENCHMARK_LOCK_PATH`, shared by every
 * checkout and every tool on the machine that uses this module. It is created
 * exclusively and names its holder. Acquiring never waits: a second run is
 * refused, not queued. A holder whose process is gone is stale, and its lock is
 * taken over.
 *
 * Two limits, both narrow. A process id reused by an unrelated process makes a
 * stale lock look held, and the refusal names the file to delete. And two runs
 * that take over the same stale lock in the same instant can both believe they
 * hold it, so `release` reports whether the lock was still this process's, and
 * a caller that lost it should discard what it measured. A parent killed
 * outright (SIGKILL) also leaves any child it was waiting on running, with the
 * lock looking stale.
 *
 * The lock is shared on purpose, so any local user can block benchmarks by
 * creating the file; the refusal names it. On Windows the default path is
 * under the per-user temp directory, so there the lock is per user.
 *
 * Node-only: it uses `node:fs`, `node:os`, and `process`.
 *
 * @module
 */

import { linkSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Result } from './result.ts';

/**
 * The default lock path: `/tmp/fuz_benchmark.lock` on POSIX, and
 * `fuz_benchmark.lock` in the OS temp directory on Windows. POSIX deliberately
 * doesn't use `os.tmpdir()`, which follows `TMPDIR`: two benchmarks run with
 * different `TMPDIR`s would silently take different locks and measure at once.
 * Windows has no shared temp directory, and its `os.tmpdir()` is per user, so
 * there the lock is too. Tests pass a path of their own.
 */
export const BENCHMARK_LOCK_PATH =
	platform() === 'win32' ? join(tmpdir(), 'fuz_benchmark.lock') : '/tmp/fuz_benchmark.lock';

/**
 * What a lock file says about the process holding it.
 */
export interface BenchmarkLockHolder {
	pid: number;
	/** What the holder is doing, shown to a run that is refused. */
	label: string;
	/** The holder's working directory. */
	cwd: string;
	/** When the lock was taken, as an ISO timestamp. */
	started_at: string;
}

/**
 * A held benchmark lock.
 */
export interface BenchmarkLock {
	path: string;
	/**
	 * Releases the lock. Safe to call again: later calls return the first
	 * call's answer and remove nothing.
	 *
	 * @returns whether the lock was still this process's when first released
	 */
	release: () => boolean;
}

/**
 * Why `benchmark_lock_acquire` refused the lock.
 */
export interface BenchmarkLockRefusal {
	path: string;
	/** The holder the lock file names, or null when it names none. */
	holder: BenchmarkLockHolder | null;
	/**
	 * Whether the holder's process is gone but the lock couldn't be removed,
	 * as with another user's lock in a sticky temp directory.
	 */
	stale: boolean;
}

/**
 * Options for `benchmark_lock_acquire`.
 */
export interface BenchmarkLockAcquireOptions {
	/** The lock file. Defaults to `BENCHMARK_LOCK_PATH`. */
	path?: string;
	/** Removes a lock file, as `rmSync` with `force` does. Injectable for tests. */
	remove?: (path: string) => void;
}

const PID_MAX = 2 ** 31 - 1;

const remove_default = (path: string): void => rmSync(path, { force: true });

const read_holder = (path: string): BenchmarkLockHolder | null => {
	try {
		const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
		if (
			typeof data === 'object' &&
			data !== null &&
			'pid' in data &&
			typeof data.pid === 'number' &&
			// `process.kill(0, 0)` signals the process group, so a pid of 0 would look held
			// forever, and one past the platform's range would look stale
			Number.isInteger(data.pid) &&
			data.pid > 0 &&
			data.pid <= PID_MAX &&
			'label' in data &&
			typeof data.label === 'string' &&
			'cwd' in data &&
			typeof data.cwd === 'string' &&
			'started_at' in data &&
			typeof data.started_at === 'string'
		) {
			return { pid: data.pid, label: data.label, cwd: data.cwd, started_at: data.started_at };
		}
	} catch {
		// missing or unreadable: no holder to name
	}
	return null;
};

const pid_is_alive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// the process exists but belongs to another user
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
};

// writes the holder beside the lock, then hard-links it into place: the link
// fails with EEXIST like an exclusive create, but the lock never exists empty,
// so a concurrent reader always finds its holder
const try_create = (path: string, holder: BenchmarkLockHolder): boolean => {
	const staged = `${path}.${holder.pid}.tmp`;
	try {
		writeFileSync(staged, JSON.stringify(holder));
		linkSync(staged, path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
		throw error;
	} finally {
		rmSync(staged, { force: true });
	}
};

/**
 * Takes the machine-wide benchmark lock, or reports who holds it. It never
 * waits. A lock that can't be read is refused rather than broken, since there
 * is no process to probe, and a stale lock that can't be removed (another
 * user's, in a sticky temp directory) is refused too.
 *
 * @param label - what this process is doing, shown to a run that is refused
 * @returns the lock, or the lock's path, its holder (null when the file names none),
 *   and whether that holder is gone but its lock couldn't be removed
 * @throws an fs error other than the lock existing, or than EPERM removing a stale one
 */
export const benchmark_lock_acquire = (
	label: string,
	options?: BenchmarkLockAcquireOptions
): Result<{ lock: BenchmarkLock }, BenchmarkLockRefusal> => {
	const path = options?.path ?? BENCHMARK_LOCK_PATH;
	const remove = options?.remove ?? remove_default;
	const holder: BenchmarkLockHolder = {
		pid: process.pid,
		label,
		cwd: process.cwd(),
		started_at: new Date().toISOString()
	};
	if (!try_create(path, holder)) {
		const current = read_holder(path);
		if (current === null || pid_is_alive(current.pid)) {
			return { ok: false, path, holder: current, stale: false };
		}
		// stale: its process is gone
		try {
			remove(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
			return { ok: false, path, holder: current, stale: true };
		}
		if (!try_create(path, holder)) {
			return { ok: false, path, holder: read_holder(path), stale: false };
		}
	}
	let released: boolean | null = null;
	const release = (): boolean => {
		if (released !== null) return released;
		released = read_holder(path)?.pid === process.pid;
		if (released) remove(path);
		return released;
	};
	return { ok: true, lock: { path, release } };
};

/**
 * Says why the lock was refused, for the message a refused run prints.
 *
 * @param refusal - the refusal `benchmark_lock_acquire` returned
 */
export const benchmark_lock_format_refusal = (refusal: BenchmarkLockRefusal): string => {
	const { path, holder, stale } = refusal;
	if (holder === null) {
		return `the benchmark lock ${path} exists but names no holder: delete it if no benchmark is running`;
	}
	const who = `pid ${holder.pid} (${holder.label}, in ${holder.cwd}, since ${holder.started_at})`;
	return stale
		? `the benchmark lock ${path} names ${who}, which is gone, but this user can't remove it: its owner or root must delete it`
		: `the benchmark lock is held by ${who}: wait for it, or delete ${path} if that process is not a benchmark`;
};
