import {
	spawn as spawn_child_process,
	type SpawnOptions,
	type ChildProcess,
} from 'node:child_process';
import {styleText as st} from 'node:util';

import {Logger} from './log.js';
import {print_error, print_key_value} from './print.js';
import type {Result} from './result.js';

const log = new Logger('process');

export interface SpawnedProcess {
	child: ChildProcess;
	closed: Promise<SpawnResult>;
}

export interface Spawned {
	child: ChildProcess;
	signal: NodeJS.Signals | null;
	code: number | null;
}

// TODO are `code` and `signal` more related than that?
// e.g. should this be a union type where one is always `null`?
export type SpawnResult = Result<Spawned, Spawned>;

/**
 * A convenient promise wrapper around `spawn_process`
 * intended for commands that have an end, not long running-processes like watchers.
 * Any more advanced usage should use `spawn_process` directly for access to the `child` process.
 */
export const spawn = (...args: Parameters<typeof spawn_process>): Promise<SpawnResult> =>
	spawn_process(...args).closed;

export interface SpawnedOut {
	result: SpawnResult;
	stdout: string | null;
	stderr: string | null;
}

/**
 * Similar to `spawn` but buffers and returns `stdout` and `stderr` as strings.
 */
export const spawn_out = async (
	command: string,
	args: ReadonlyArray<string> = [],
	options?: SpawnOptions,
): Promise<SpawnedOut> => {
	const {child, closed} = spawn_process(command, args, {...options, stdio: 'pipe'});
	let stdout: string | null = null;
	child.stdout!.on('data', (data: Buffer) => {
		stdout = (stdout ?? '') + data.toString();
	});
	let stderr: string | null = null;
	child.stderr!.on('data', (data: Buffer) => {
		stderr = (stderr ?? '') + data.toString();
	});
	const result = await closed;
	return {result, stdout, stderr};
};

/**
 * Wraps the normal Node `childProcess.spawn` with graceful child shutdown behavior.
 * Also returns a convenient `closed` promise.
 * If you only need `closed`, prefer the shorthand function `spawn`.
 * @mutates global_spawn calls `register_global_spawn()` which adds to the module-level Set
 */
export const spawn_process = (
	command: string,
	args: ReadonlyArray<string> = [],
	options?: SpawnOptions,
): SpawnedProcess => {
	let resolve: (v: SpawnResult) => void;
	const closed: Promise<SpawnResult> = new Promise((r) => (resolve = r));
	const child = spawn_child_process(command, args, {stdio: 'inherit', ...options});
	const unregister = register_global_spawn(child);
	child.once('close', (code, signal) => {
		unregister();
		resolve(code ? {ok: false, child, code, signal} : {ok: true, child, code, signal});
	});
	return {closed, child};
};

export const print_child_process = (child: ChildProcess): string =>
	`${st('gray', 'pid(')}${child.pid}${st('gray', ')')} ← ${st('green', child.spawnargs.join(' '))}`;

/**
 * We register spawned processes gloabally so we can gracefully exit child processes.
 * Otherwise, errors can cause zombie processes, sometimes blocking ports even!
 */
export const global_spawn: Set<ChildProcess> = new Set();

/**
 * Returns a function that unregisters the `child`.
 * @param child the child process to register
 * @returns cleanup function that removes the child from `global_spawn`
 * @mutates global_spawn adds child to the module-level Set, and the returned function removes it
 */
export const register_global_spawn = (child: ChildProcess): (() => void) => {
	if (global_spawn.has(child)) {
		log.error(st('red', 'already registered global spawn:'), print_child_process(child));
	}
	global_spawn.add(child);
	return () => {
		if (!global_spawn.has(child)) {
			log.error(st('red', 'spawn not registered:'), print_child_process(child));
		}
		global_spawn.delete(child);
	};
};

/**
 * Kills a child process and returns a `SpawnResult`.
 */
export const despawn = (child: ChildProcess): Promise<SpawnResult> => {
	let resolve: (v: SpawnResult) => void;
	const closed: Promise<SpawnResult> = new Promise((r) => (resolve = r));
	log.debug('despawning', print_child_process(child));
	child.once('close', (code, signal) => {
		resolve(code ? {ok: false, child, code, signal} : {ok: true, child, code, signal});
	});
	child.kill();
	return closed;
};

/**
 * Kills all globally registered child processes.
 * @mutates global_spawn indirectly removes processes through `despawn()` calls
 */
export const despawn_all = (): Promise<Array<SpawnResult>> =>
	Promise.all(Array.from(global_spawn, (child) => despawn(child)));

/**
 * Attaches the `'uncoughtException'` event to despawn all processes,
 * and enables custom error logging with `to_error_label`.
 * @param to_error_label - Customize the error label or return `null` for the default `origin`.
 * @param map_error_text - Customize the error text. Return `''` to silence, or `null` for the default `print_error(err)`.
 */
export const attach_process_error_handlers = (
	to_error_label?: (err: Error, origin: NodeJS.UncaughtExceptionOrigin) => string | null,
	map_error_text?: (err: Error, origin: NodeJS.UncaughtExceptionOrigin) => string | null,
	handle_error: (err: Error, origin: NodeJS.UncaughtExceptionOrigin) => void = () =>
		process.exit(1),
): void => {
	process.on('uncaughtException', async (err, origin): Promise<void> => {
		const label = to_error_label?.(err, origin) ?? origin;
		if (label) {
			const error_text = map_error_text?.(err, origin) ?? print_error(err);
			if (error_text) {
				new Logger(label).error(error_text);
			}
		}
		await despawn_all();
		handle_error(err, origin);
	});
};

/**
 * Formats a `SpawnResult` for printing.
 */
export const print_spawn_result = (result: SpawnResult): string => {
	if (result.ok) return 'ok';
	let text = result.code === null ? '' : print_key_value('code', result.code);
	if (result.signal !== null) text += (text ? ' ' : '') + print_key_value('signal', result.signal);
	return text;
};

// TODO might want to expand this API for some use cases - assumes always running
export interface RestartableProcess {
	restart: () => void;
	kill: () => Promise<void>;
}

/**
 * Like `spawn_process` but with `restart` and `kill`,
 * handling many concurrent `restart` calls gracefully.
 */
export const spawn_restartable_process = (
	command: string,
	args: ReadonlyArray<string> = [],
	options?: SpawnOptions,
): RestartableProcess => {
	let spawned: SpawnedProcess | null = null;
	let restarting: Promise<any> | null = null;
	const close = async (): Promise<void> => {
		if (!spawned) return;
		restarting = spawned.closed;
		spawned.child.kill();
		spawned = null;
		await restarting;
		restarting = null;
	};
	const restart = async (): Promise<void> => {
		if (restarting) return restarting;
		if (spawned) await close();
		spawned = spawn_process(command, args, {stdio: 'inherit', ...options});
	};
	const kill = async (): Promise<void> => {
		if (restarting) await restarting;
		await close();
	};
	// Start immediately -- it sychronously starts the process so there's no need to await.
	void restart();
	return {restart, kill};
};

/**
 * Check if a PID is still running.
 */
export const process_is_pid_running = (pid: number): boolean => {
	try {
		// Sending signal 0 doesn't actually send a signal, just checks if process exists
		process.kill(pid, 0);
		return true;
	} catch (err: any) {
		// ESRCH = no such process, EPERM = exists but no permission
		return err.code === 'EPERM';
	}
};
