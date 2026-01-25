import {
	spawn as spawn_child_process,
	type SpawnOptions,
	type ChildProcess,
} from 'node:child_process';
import {styleText as st} from 'node:util';

import {Logger} from './log.js';
import {print_error, print_key_value} from './print.js';

const log = new Logger('process');

//
// Spawn Result Types
//

/**
 * Spawn failed before the process could run.
 *
 * @example ENOENT when command not found
 */
export interface SpawnResultError {
	ok: false;
	child: ChildProcess;
	error: Error;
}

/**
 * Process ran and exited with a code.
 * `ok` is true when `code` is 0.
 */
export interface SpawnResultExited {
	ok: boolean;
	child: ChildProcess;
	code: number;
	signal: null;
}

/**
 * Process was terminated by a signal (e.g., SIGTERM, SIGKILL).
 */
export interface SpawnResultSignaled {
	ok: false;
	child: ChildProcess;
	code: null;
	signal: NodeJS.Signals;
}

/**
 * Discriminated union representing all possible spawn outcomes.
 * Use type guards `spawn_result_is_error`, `spawn_result_is_signaled`,
 * and `spawn_result_is_exited` to narrow the type.
 */
export type SpawnResult = SpawnResultError | SpawnResultExited | SpawnResultSignaled;

//
// Type Guards
//

/**
 * Type guard for spawn errors (process failed to start).
 */
export const spawn_result_is_error = (result: SpawnResult): result is SpawnResultError =>
	'error' in result;

/**
 * Type guard for signal termination.
 */
export const spawn_result_is_signaled = (result: SpawnResult): result is SpawnResultSignaled =>
	'signal' in result && result.signal !== null;

/**
 * Type guard for normal exit with code.
 */
export const spawn_result_is_exited = (result: SpawnResult): result is SpawnResultExited =>
	'code' in result && result.code !== null;

//
// Spawn Options
//

/**
 * Options for spawning processes, extending Node's `SpawnOptions`.
 */
export interface SpawnProcessOptions extends SpawnOptions {
	/**
	 * AbortSignal to cancel the process.
	 * When aborted, sends SIGTERM to the child.
	 */
	signal?: AbortSignal;
	/**
	 * Timeout in milliseconds.
	 * Sends SIGTERM when exceeded.
	 */
	timeout_ms?: number;
}

/**
 * Options for killing processes.
 */
export interface DespawnOptions {
	/**
	 * Signal to send.
	 * @default 'SIGTERM'
	 */
	signal?: NodeJS.Signals;
	/**
	 * Timeout in ms before escalating to SIGKILL.
	 * Useful for processes that may ignore SIGTERM.
	 */
	timeout_ms?: number;
}

//
// Process Handle Types
//

/**
 * Handle for a spawned process with access to the child and completion promise.
 */
export interface SpawnedProcess {
	/** The underlying Node.js ChildProcess */
	child: ChildProcess;
	/** Resolves when the process exits */
	closed: Promise<SpawnResult>;
}

/**
 * Result of `spawn_out` with captured output streams.
 */
export interface SpawnedOut {
	result: SpawnResult;
	/** Captured stdout, or null if stream unavailable */
	stdout: string | null;
	/** Captured stderr, or null if stream unavailable */
	stderr: string | null;
}

//
// Internal Helpers
//

/**
 * Creates a promise that resolves when the child process closes.
 * Handles both 'error' and 'close' events with deduplication.
 */
const create_closed_promise = (child: ChildProcess): Promise<SpawnResult> => {
	let resolve: (v: SpawnResult) => void;
	let resolved = false;
	const closed: Promise<SpawnResult> = new Promise((r) => (resolve = r));

	child.once('error', (err) => {
		if (resolved) return;
		resolved = true;
		resolve({ok: false, child, error: err});
	});

	child.once('close', (code, signal) => {
		if (resolved) return;
		resolved = true;
		if (signal !== null) {
			resolve({ok: false, child, code: null, signal});
		} else {
			resolve({ok: code === 0, child, code: code ?? 0, signal: null});
		}
	});

	return closed;
};

/**
 * Sets up abort signal handling for a child process.
 * @returns cleanup function to remove the listener
 */
const setup_abort_signal = (child: ChildProcess, signal: AbortSignal): (() => void) => {
	if (signal.aborted) {
		child.kill();
		return () => {};
	}
	const on_abort = () => child.kill();
	signal.addEventListener('abort', on_abort, {once: true});
	return () => signal.removeEventListener('abort', on_abort);
};

/**
 * Sets up timeout handling for a child process.
 * @returns cleanup function to clear the timeout
 */
const setup_timeout = (child: ChildProcess, timeout_ms: number): (() => void) => {
	const timeout_id = setTimeout(() => child.kill('SIGTERM'), timeout_ms);
	return () => clearTimeout(timeout_id);
};

//
// Process Registry
//

/**
 * Manages a collection of spawned processes for lifecycle tracking and cleanup.
 *
 * The default instance `default_registry` is used by module-level functions.
 * Create separate instances for isolated process groups or testing.
 *
 * @example
 * ```ts
 * // Use default registry via module functions
 * const result = await spawn('echo', ['hello']);
 *
 * // Or create isolated registry for testing
 * const registry = new ProcessRegistry();
 * const {child, closed} = registry.spawn('node', ['server.js']);
 * await registry.despawn_all();
 * ```
 */
export class ProcessRegistry {
	/** All currently tracked child processes */
	readonly processes: Set<ChildProcess> = new Set();

	#error_handler: ((err: Error, origin: NodeJS.UncaughtExceptionOrigin) => Promise<void>) | null =
		null;

	/**
	 * Spawns a process and tracks it in this registry.
	 * The process is automatically unregistered when it exits.
	 *
	 * @param command - The command to run
	 * @param args - Arguments to pass to the command
	 * @param options - Spawn options including `signal` and `timeout_ms`
	 * @returns Handle with `child` process and `closed` promise
	 */
	spawn(
		command: string,
		args: ReadonlyArray<string> = [],
		options?: SpawnProcessOptions,
	): SpawnedProcess {
		const {signal, timeout_ms, ...spawn_options} = options ?? {};
		const child = spawn_child_process(command, args, {stdio: 'inherit', ...spawn_options});

		this.processes.add(child);
		const closed = create_closed_promise(child);

		let cleanup_abort: (() => void) | undefined;
		if (signal) {
			cleanup_abort = setup_abort_signal(child, signal);
		}

		let cleanup_timeout: (() => void) | undefined;
		if (timeout_ms !== undefined) {
			cleanup_timeout = setup_timeout(child, timeout_ms);
		}

		void closed.then(() => {
			this.processes.delete(child);
			cleanup_abort?.();
			cleanup_timeout?.();
		});

		return {child, closed};
	}

	/**
	 * Spawns a process and captures stdout/stderr as strings.
	 * Sets `stdio: 'pipe'` automatically.
	 *
	 * @param command - The command to run
	 * @param args - Arguments to pass to the command
	 * @param options - Spawn options
	 * @returns Result with captured `stdout` and `stderr`
	 */
	async spawn_out(
		command: string,
		args: ReadonlyArray<string> = [],
		options?: SpawnProcessOptions,
	): Promise<SpawnedOut> {
		const {child, closed} = this.spawn(command, args, {...options, stdio: 'pipe'});
		let stdout: string | null = null;
		let stderr: string | null = null;
		child.stdout?.on('data', (data: Buffer) => {
			stdout = (stdout ?? '') + data.toString();
		});
		child.stderr?.on('data', (data: Buffer) => {
			stderr = (stderr ?? '') + data.toString();
		});
		const result = await closed;
		return {result, stdout, stderr};
	}

	/**
	 * Kills a child process and waits for it to exit.
	 *
	 * @param child - The child process to kill
	 * @param options - Kill options including signal and timeout
	 * @returns The spawn result after the process exits
	 */
	async despawn(child: ChildProcess, options?: DespawnOptions): Promise<SpawnResult> {
		const {signal = 'SIGTERM', timeout_ms} = options ?? {};

		// Already exited with code
		if (child.exitCode !== null) {
			return {
				ok: child.exitCode === 0,
				child,
				code: child.exitCode,
				signal: null,
			};
		}
		// Already terminated by signal
		if (child.signalCode !== null) {
			return {
				ok: false,
				child,
				code: null,
				signal: child.signalCode,
			};
		}

		log.debug('despawning', print_child_process(child));
		const closed = create_closed_promise(child);

		// Escalate to SIGKILL after timeout
		if (timeout_ms !== undefined) {
			const timeout_id = setTimeout(() => child.kill('SIGKILL'), timeout_ms);
			void closed.then(() => clearTimeout(timeout_id));
		}

		child.kill(signal);
		return closed;
	}

	/**
	 * Kills all processes in this registry.
	 *
	 * @param options - Kill options applied to all processes
	 * @returns Array of spawn results
	 */
	async despawn_all(options?: DespawnOptions): Promise<SpawnResult[]> {
		return Promise.all([...this.processes].map((child) => this.despawn(child, options)));
	}

	/**
	 * Attaches an `uncaughtException` handler that despawns all processes before exiting.
	 * Prevents zombie processes when the parent crashes.
	 *
	 * @param to_error_label - Customize error label, return `null` for default
	 * @param map_error_text - Customize error text, return `''` to silence
	 * @param handle_error - Called after cleanup, defaults to `process.exit(1)`
	 * @returns Cleanup function to remove the handler
	 */
	attach_error_handler(
		to_error_label?: (err: Error, origin: NodeJS.UncaughtExceptionOrigin) => string | null,
		map_error_text?: (err: Error, origin: NodeJS.UncaughtExceptionOrigin) => string | null,
		handle_error: (err: Error, origin: NodeJS.UncaughtExceptionOrigin) => void = () =>
			process.exit(1),
	): () => void {
		if (this.#error_handler) {
			log.error(st('red', 'error handler already attached to this registry'));
		}

		this.#error_handler = async (err, origin): Promise<void> => {
			const label = to_error_label?.(err, origin) ?? origin;
			if (label) {
				const error_text = map_error_text?.(err, origin) ?? print_error(err);
				if (error_text) {
					new Logger(label).error(error_text);
				}
			}
			await this.despawn_all();
			handle_error(err, origin);
		};

		process.on('uncaughtException', this.#error_handler);

		return () => {
			if (this.#error_handler) {
				process.off('uncaughtException', this.#error_handler);
				this.#error_handler = null;
			}
		};
	}
}

//
// Default Registry
//

/**
 * Default process registry used by module-level spawn functions.
 * For testing or isolated process groups, create a new `ProcessRegistry` instance.
 */
export const default_registry = new ProcessRegistry();

//
// Module-Level Spawn Functions
//

/**
 * Spawns a process with graceful shutdown behavior.
 * Returns a handle with access to the `child` process and `closed` promise.
 *
 * @example
 * ```ts
 * const {child, closed} = spawn_process('node', ['server.js']);
 * // Later...
 * child.kill();
 * const result = await closed;
 * ```
 */
export const spawn_process = (
	command: string,
	args: ReadonlyArray<string> = [],
	options?: SpawnProcessOptions,
): SpawnedProcess => default_registry.spawn(command, args, options);

/**
 * Spawns a process and returns a promise that resolves when it exits.
 * Use this for commands that complete (not long-running processes).
 *
 * @example
 * ```ts
 * const result = await spawn('npm', ['install']);
 * if (!result.ok) console.error('Install failed');
 * ```
 */
export const spawn = (
	command: string,
	args: ReadonlyArray<string> = [],
	options?: SpawnProcessOptions,
): Promise<SpawnResult> => spawn_process(command, args, options).closed;

/**
 * Spawns a process and captures stdout/stderr as strings.
 *
 * @example
 * ```ts
 * const {result, stdout} = await spawn_out('git', ['status', '--porcelain']);
 * if (result.ok && stdout) console.log(stdout);
 * ```
 */
export const spawn_out = (
	command: string,
	args: ReadonlyArray<string> = [],
	options?: SpawnProcessOptions,
): Promise<SpawnedOut> => default_registry.spawn_out(command, args, options);

/**
 * Kills a child process and returns the result.
 *
 * @example
 * ```ts
 * const result = await despawn(child, {timeout_ms: 5000});
 * // If process ignores SIGTERM, SIGKILL sent after 5s
 * ```
 */
export const despawn = (child: ChildProcess, options?: DespawnOptions): Promise<SpawnResult> =>
	default_registry.despawn(child, options);

/**
 * Kills all processes in the default registry.
 */
export const despawn_all = (options?: DespawnOptions): Promise<SpawnResult[]> =>
	default_registry.despawn_all(options);

/**
 * Attaches an `uncaughtException` handler to the default registry.
 *
 * @see ProcessRegistry.attach_error_handler
 */
export const attach_process_error_handlers = (
	to_error_label?: (err: Error, origin: NodeJS.UncaughtExceptionOrigin) => string | null,
	map_error_text?: (err: Error, origin: NodeJS.UncaughtExceptionOrigin) => string | null,
	handle_error: (err: Error, origin: NodeJS.UncaughtExceptionOrigin) => void = () =>
		process.exit(1),
): (() => void) =>
	default_registry.attach_error_handler(to_error_label, map_error_text, handle_error);

//
// Formatting Utilities
//

/**
 * Formats a child process for display.
 *
 * @example `pid(1234) <- node server.js`
 */
export const print_child_process = (child: ChildProcess): string =>
	`${st('gray', 'pid(')}${child.pid}${st('gray', ')')} ← ${st('green', child.spawnargs.join(' '))}`;

/**
 * Formats a spawn result for display.
 * Returns `'ok'` for success, or the error/signal/code for failures.
 */
export const print_spawn_result = (result: SpawnResult): string => {
	if (result.ok) return 'ok';
	if (spawn_result_is_error(result)) return result.error.message;
	if (spawn_result_is_signaled(result)) return print_key_value('signal', result.signal);
	return print_key_value('code', result.code);
};

/**
 * Formats a spawn result for use in error messages.
 */
export const spawn_result_to_message = (result: SpawnResult): string => {
	if (spawn_result_is_error(result)) return `error: ${result.error.message}`;
	if (spawn_result_is_signaled(result)) return `signal ${result.signal}`;
	return `code ${result.code}`;
};

//
// Restartable Process
//

/**
 * Handle for a process that can be restarted.
 * Exposes `closed` promise for observing exits and implementing restart policies.
 */
export interface RestartableProcess {
	/** Restart the process, killing the current one if running */
	restart: () => Promise<void>;
	/** Kill the process and prevent further restarts */
	kill: () => Promise<void>;
	/** Whether a process is currently running */
	readonly running: boolean;
	/** The current child process, or null if not running */
	readonly child: ChildProcess | null;
	/** Promise that resolves when the current process exits */
	readonly closed: Promise<SpawnResult>;
}

/**
 * Spawns a process that can be restarted.
 * Handles concurrent restart calls gracefully.
 *
 * @example Simple restart on crash
 * ```ts
 * const rp = spawn_restartable_process('node', ['server.js']);
 *
 * while (rp.running) {
 *   const result = await rp.closed;
 *   if (result.ok) break; // Clean exit
 *   await rp.restart();
 * }
 * ```
 *
 * @example Restart with backoff
 * ```ts
 * const rp = spawn_restartable_process('node', ['server.js']);
 * let failures = 0;
 *
 * while (rp.running) {
 *   const result = await rp.closed;
 *   if (result.ok || ++failures > 5) break;
 *   await new Promise((r) => setTimeout(r, 1000 * failures));
 *   await rp.restart();
 * }
 * ```
 */
export const spawn_restartable_process = (
	command: string,
	args: ReadonlyArray<string> = [],
	options?: SpawnOptions,
): RestartableProcess => {
	let spawned: SpawnedProcess | null = null;
	let pending_close: Promise<SpawnResult> | null = null;
	// Placeholder promise for when no process has started yet
	let closed_promise: Promise<SpawnResult> = Promise.resolve({
		ok: false,
		child: null!,
		code: null,
		signal: 'SIGTERM' as NodeJS.Signals,
	});

	const do_close = async (): Promise<void> => {
		if (!spawned) return;
		pending_close = spawned.closed;
		spawned.child.kill();
		spawned = null;
		await pending_close;
		pending_close = null;
	};

	const restart = async (): Promise<void> => {
		if (pending_close) await pending_close;
		if (spawned) await do_close();
		spawned = spawn_process(command, args, {stdio: 'inherit', ...options});
		closed_promise = spawned.closed;
	};

	const kill = async (): Promise<void> => {
		if (pending_close) await pending_close;
		await do_close();
	};

	// Start immediately
	void restart();

	return {
		restart,
		kill,
		get running() {
			return spawned !== null;
		},
		get child() {
			return spawned?.child ?? null;
		},
		get closed() {
			return closed_promise;
		},
	};
};

//
// Utility Functions
//

/**
 * Checks if a process with the given PID is running.
 * Uses signal 0 which checks existence without sending a signal.
 *
 * @param pid - The process ID to check
 * @returns `true` if the process exists (even without permission to signal it)
 */
export const process_is_pid_running = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err: unknown) {
		// ESRCH = no such process, EPERM = exists but no permission
		return (err as NodeJS.ErrnoException).code === 'EPERM';
	}
};
