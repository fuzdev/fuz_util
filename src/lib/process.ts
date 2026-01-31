import {
	spawn as node_spawn_child_process,
	type SpawnOptions,
	type ChildProcess,
} from 'node:child_process';
import {styleText as st} from 'node:util';

import {Logger} from './log.js';
import {print_error, print_key_value} from './print.js';
import {noop} from './function.js';

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
	code: null;
	signal: null;
}

/**
 * Process ran and exited with a code.
 * `ok` is true when `code` is 0.
 */
export interface SpawnResultExited {
	ok: boolean;
	child: ChildProcess;
	error: null;
	code: number;
	signal: null;
}

/**
 * Process was terminated by a signal (e.g., SIGTERM, SIGKILL).
 */
export interface SpawnResultSignaled {
	ok: false;
	child: ChildProcess;
	error: null;
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
	result.error !== null;

/**
 * Type guard for signal termination.
 */
export const spawn_result_is_signaled = (result: SpawnResult): result is SpawnResultSignaled =>
	result.signal !== null;

/**
 * Type guard for normal exit with code.
 */
export const spawn_result_is_exited = (result: SpawnResult): result is SpawnResultExited =>
	result.code !== null;

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
	 * Timeout in milliseconds. Must be non-negative.
	 * Sends SIGTERM when exceeded. A value of 0 triggers immediate SIGTERM.
	 */
	timeout_ms?: number;
	/**
	 * Custom spawn function for testing. Defaults to `node:child_process` spawn.
	 */
	spawn_child_process?: typeof node_spawn_child_process;
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
	 * Timeout in ms before escalating to SIGKILL. Must be non-negative.
	 * Useful for processes that may ignore SIGTERM. A value of 0 triggers immediate SIGKILL escalation.
	 */
	timeout_ms?: number;
}

/**
 * Result of spawning a detached process.
 */
export type SpawnDetachedResult = {ok: true; child: ChildProcess} | {ok: false; message: string};

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
 *
 * Handles both 'error' and 'close' events with deduplication because Node.js
 * can emit both for certain failures (e.g., spawn ENOENT emits 'error' then 'close').
 * The `resolved` flag ensures we only resolve once with the first event's data.
 */
const create_closed_promise = (child: ChildProcess): Promise<SpawnResult> => {
	let resolve: (v: SpawnResult) => void;
	let resolved = false;
	const closed: Promise<SpawnResult> = new Promise((r) => (resolve = r));

	child.once('error', (err) => {
		if (resolved) return;
		resolved = true;
		resolve({ok: false, child, error: err, code: null, signal: null});
	});

	child.once('close', (code, signal) => {
		if (resolved) return;
		resolved = true;
		if (signal !== null) {
			resolve({ok: false, child, error: null, code: null, signal});
		} else {
			resolve({ok: code === 0, child, error: null, code: code ?? 0, signal: null});
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
		return noop;
	}
	const on_abort = () => child.kill();
	signal.addEventListener('abort', on_abort, {once: true});
	return () => signal.removeEventListener('abort', on_abort);
};

/**
 * Validates timeout_ms option.
 * @throws if timeout_ms is negative
 */
const validate_timeout_ms = (timeout_ms: number | undefined): void => {
	if (timeout_ms !== undefined && timeout_ms < 0) {
		throw new Error(`timeout_ms must be non-negative, got ${timeout_ms}`);
	}
};

/**
 * Sets up timeout handling for a child process.
 * Note: timeout_ms of 0 triggers immediate SIGTERM (use with caution).
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
 * The default instance `process_registry_default` is used by module-level functions.
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

	#error_handler: ((err: Error, origin: NodeJS.UncaughtExceptionOrigin) => void) | null = null;

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
		const {
			signal,
			timeout_ms,
			spawn_child_process = node_spawn_child_process,
			...spawn_options
		} = options ?? {};
		validate_timeout_ms(timeout_ms);
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
	 * @returns Result with captured `stdout` and `stderr`.
	 *   - `null` means spawn failed (ENOENT, etc.) or stream was unavailable
	 *   - `''` (empty string) means process ran but produced no output
	 *   - non-empty string contains the captured output
	 */
	async spawn_out(
		command: string,
		args: ReadonlyArray<string> = [],
		options?: SpawnProcessOptions,
	): Promise<SpawnedOut> {
		const {child, closed} = this.spawn(command, args, {...options, stdio: 'pipe'});
		const stdout_chunks: Array<string> = [];
		const stderr_chunks: Array<string> = [];
		// Track whether streams were available (not null)
		const stdout_available = child.stdout !== null;
		const stderr_available = child.stderr !== null;
		const on_stdout = (data: Buffer): void => {
			stdout_chunks.push(data.toString());
		};
		const on_stderr = (data: Buffer): void => {
			stderr_chunks.push(data.toString());
		};
		child.stdout?.on('data', on_stdout);
		child.stderr?.on('data', on_stderr);
		const result = await closed;
		// Clean up listeners explicitly
		child.stdout?.off('data', on_stdout);
		child.stderr?.off('data', on_stderr);
		// If spawn failed (error result), streams are meaningless - return null
		// Otherwise: '' = available but empty, string = has content
		const spawn_failed = spawn_result_is_error(result);
		const stdout = spawn_failed || !stdout_available ? null : stdout_chunks.join('');
		const stderr = spawn_failed || !stderr_available ? null : stderr_chunks.join('');
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
		validate_timeout_ms(timeout_ms);

		// Already exited with code
		if (child.exitCode !== null) {
			return {
				ok: child.exitCode === 0,
				child,
				error: null,
				code: child.exitCode,
				signal: null,
			};
		}
		// Already terminated by signal
		if (child.signalCode !== null) {
			return {
				ok: false,
				child,
				error: null,
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
	async despawn_all(options?: DespawnOptions): Promise<Array<SpawnResult>> {
		return Promise.all([...this.processes].map((child) => this.despawn(child, options)));
	}

	/**
	 * Attaches an `uncaughtException` handler that kills all processes before exiting.
	 * Prevents zombie processes when the parent crashes.
	 *
	 * By default uses SIGKILL for immediate termination. Set `graceful_timeout_ms`
	 * to attempt SIGTERM first (allowing processes to clean up) before escalating
	 * to SIGKILL after the timeout.
	 *
	 * Note: Node's uncaughtException handler cannot await async operations, so
	 * graceful shutdown uses a blocking busy-wait. This may not be sufficient
	 * for processes that need significant cleanup time.
	 *
	 * @param options - Configuration options
	 * @param options.to_error_label - Customize error label, return `null` for default
	 * @param options.map_error_text - Customize error text, return `''` to silence
	 * @param options.handle_error - Called after cleanup, defaults to `process.exit(1)`
	 * @param options.graceful_timeout_ms - If set, sends SIGTERM first and waits this
	 *   many ms before SIGKILL. Recommended: 100-500ms. If null/undefined, uses
	 *   immediate SIGKILL (default).
	 * @returns Cleanup function to remove the handler
	 */
	attach_error_handler(options?: {
		to_error_label?: (err: Error, origin: NodeJS.UncaughtExceptionOrigin) => string | null;
		map_error_text?: (err: Error, origin: NodeJS.UncaughtExceptionOrigin) => string | null;
		handle_error?: (err: Error, origin: NodeJS.UncaughtExceptionOrigin) => void;
		graceful_timeout_ms?: number | null;
	}): () => void {
		if (this.#error_handler) {
			throw new Error('Error handler already attached to this registry');
		}

		const {
			to_error_label,
			map_error_text,
			handle_error = () => process.exit(1),
			graceful_timeout_ms,
		} = options ?? {};

		this.#error_handler = (err, origin): void => {
			const label = to_error_label?.(err, origin) ?? origin;
			if (label) {
				const error_text = map_error_text?.(err, origin) ?? print_error(err);
				if (error_text) {
					new Logger(label).error(error_text);
				}
			}

			if (graceful_timeout_ms != null && graceful_timeout_ms > 0) {
				// Attempt graceful shutdown with SIGTERM first
				for (const child of this.processes) {
					child.kill('SIGTERM');
				}
				// Busy-wait (blocking) - only option in sync handler.
				// Warning: This will peg the CPU during the wait period.
				const deadline = Date.now() + graceful_timeout_ms;
				while (Date.now() < deadline) {
					// spin
				}
			}

			// Force kill all (including any that survived SIGTERM)
			for (const child of this.processes) {
				child.kill('SIGKILL');
			}
			this.processes.clear();
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
export const process_registry_default = new ProcessRegistry();

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
): SpawnedProcess => process_registry_default.spawn(command, args, options);

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
): Promise<SpawnedOut> => process_registry_default.spawn_out(command, args, options);

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
	process_registry_default.despawn(child, options);

/**
 * Kills all processes in the default registry.
 */
export const despawn_all = (options?: DespawnOptions): Promise<Array<SpawnResult>> =>
	process_registry_default.despawn_all(options);

/**
 * Attaches an `uncaughtException` handler to the default registry.
 *
 * @see ProcessRegistry.attach_error_handler
 */
export const attach_process_error_handler = (
	options?: Parameters<ProcessRegistry['attach_error_handler']>[0],
): (() => void) => process_registry_default.attach_error_handler(options);

/**
 * Spawns a detached process that continues after parent exits.
 *
 * Unlike other spawn functions, this is NOT tracked in any ProcessRegistry.
 * The spawned process is meant to outlive the parent (e.g., daemon processes).
 *
 * @param command - The command to run
 * @param args - Arguments to pass to the command
 * @param options - Spawn options (use `stdio` to redirect output to file descriptors)
 * @returns Result with pid on success, or error message on failure
 *
 * @example
 * ```ts
 * // Simple detached process
 * const result = spawn_detached('node', ['daemon.js'], {cwd: '/app'});
 *
 * // With log file (caller handles file opening)
 * import {openSync, closeSync} from 'node:fs';
 * const log_fd = openSync('/var/log/daemon.log', 'a');
 * const result = spawn_detached('node', ['daemon.js'], {
 *   cwd: '/app',
 *   stdio: ['ignore', log_fd, log_fd],
 * });
 * closeSync(log_fd);
 * ```
 */
export const spawn_detached = (
	command: string,
	args: ReadonlyArray<string> = [],
	options?: SpawnOptions,
): SpawnDetachedResult => {
	try {
		const child = node_spawn_child_process(command, args, {
			stdio: 'ignore',
			...options,
			detached: true,
		});

		// Allow parent to exit independently
		child.unref();

		if (child.pid === undefined) {
			return {ok: false, message: 'Failed to get child PID'};
		}

		return {ok: true, child};
	} catch (error) {
		return {ok: false, message: error instanceof Error ? error.message : String(error)};
	}
};

//
// Formatting Utilities
//

/**
 * Formats a child process for display.
 *
 * @example `pid(1234) <- node server.js`
 */
export const print_child_process = (child: ChildProcess): string =>
	`${st('gray', 'pid(')}${child.pid ?? 'none'}${st('gray', ')')} ← ${st('green', child.spawnargs.join(' '))}`;

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
	/**
	 * Restart the process, killing the current one if active.
	 * Concurrent calls are coalesced - multiple calls before the first completes
	 * will share the same restart operation.
	 */
	restart: () => Promise<void>;
	/** Kill the process and set `active` to false */
	kill: () => Promise<void>;
	/**
	 * Whether this handle is managing a process.
	 *
	 * Note: This reflects handle state, not whether the underlying OS process is executing.
	 * Remains `true` after a process exits naturally until `kill()` or `restart()` is called.
	 * To check if the process actually exited, await `closed`.
	 */
	readonly active: boolean;
	/** The current child process, or null if not active */
	readonly child: ChildProcess | null;
	/** Promise that resolves when the current process exits */
	readonly closed: Promise<SpawnResult>;
	/**
	 * Promise that resolves when the initial `spawn_process()` call completes.
	 *
	 * Note: This resolves when the spawn syscall returns, NOT when the process
	 * is "ready" or has produced output. For commands that fail immediately
	 * (e.g., ENOENT), `spawned` still resolves - check `closed` for errors.
	 *
	 * @example
	 * ```ts
	 * const rp = spawn_restartable_process('node', ['server.js']);
	 * await rp.spawned;  // Safe to access rp.child now
	 * ```
	 */
	readonly spawned: Promise<void>;
}

/**
 * Spawns a process that can be restarted.
 * Handles concurrent restart calls gracefully.
 *
 * Note: The `signal` and `timeout_ms` options are reapplied on each restart.
 * If the AbortSignal is already aborted when `restart()` is called, the new
 * process will be killed immediately.
 *
 * @example Simple restart on crash
 * ```ts
 * const rp = spawn_restartable_process('node', ['server.js']);
 *
 * while (rp.active) {
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
 * while (rp.active) {
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
	options?: SpawnProcessOptions,
): RestartableProcess => {
	let spawned_process: SpawnedProcess | null = null;
	let pending_close: Promise<SpawnResult> | null = null;
	let pending_restart: Promise<void> | null = null;
	let pending_kill: Promise<void> | null = null;
	// Deferred promise - resolves when first process spawns
	let closed_promise: Promise<SpawnResult>;
	let resolve_closed: (result: SpawnResult) => void;
	const reset_closed_promise = (): void => {
		closed_promise = new Promise((r) => (resolve_closed = r));
	};
	reset_closed_promise();

	// Resolve when first spawn completes to avoid race conditions
	let resolve_spawned: () => void;
	const spawned: Promise<void> = new Promise((r) => (resolve_spawned = r));

	const do_close = async (): Promise<void> => {
		if (!spawned_process) return;
		pending_close = spawned_process.closed;
		spawned_process.child.kill();
		spawned_process = null;
		await pending_close;
		pending_close = null;
	};

	const do_restart = async (): Promise<void> => {
		// Wait for any in-progress kill or close before restarting
		if (pending_kill) await pending_kill;
		if (pending_close) await pending_close;
		if (spawned_process) await do_close();
		spawned_process = spawn_process(command, args, {stdio: 'inherit', ...options});
		// Forward the spawned process's closed promise to our exposed one
		void spawned_process.closed.then((result) => {
			resolve_closed(result);
		});
	};

	// Coalesce concurrent restart calls - multiple calls share one restart
	const restart = (): Promise<void> => {
		if (!pending_restart) {
			// Reset the closed promise for the new process
			reset_closed_promise();
			pending_restart = do_restart().finally(() => {
				pending_restart = null;
			});
		}
		return pending_restart;
	};

	// Wait for any pending restart to complete first, ensuring we kill
	// the newly spawned process rather than racing with it
	const kill = async (): Promise<void> => {
		if (pending_kill) return pending_kill;
		pending_kill = (async () => {
			if (pending_restart) await pending_restart;
			if (pending_close) await pending_close;
			await do_close();
		})();
		try {
			await pending_kill;
		} finally {
			pending_kill = null;
		}
	};

	// Start immediately and resolve spawned promise when done
	void restart().then(() => resolve_spawned());

	return {
		restart,
		kill,
		get active() {
			return spawned_process !== null;
		},
		get child() {
			return spawned_process?.child ?? null;
		},
		get closed() {
			return closed_promise;
		},
		get spawned() {
			return spawned;
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
 * @param pid - The process ID to check (must be a positive integer)
 * @returns `true` if the process exists (even without permission to signal it),
 *   `false` if the process doesn't exist or if pid is invalid (non-positive, non-integer, NaN, Infinity)
 */
export const process_is_pid_running = (pid: number): boolean => {
	// Handle NaN, Infinity, negative, zero, non-integers, and fractional values
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (err: unknown) {
		// ESRCH = no such process
		// EPERM = process exists but we lack permission to signal it
		// Safely access .code in case of unexpected error types
		const code =
			err && typeof err === 'object' && 'code' in err ? (err as {code: string}).code : undefined;
		return code === 'EPERM';
	}
};
