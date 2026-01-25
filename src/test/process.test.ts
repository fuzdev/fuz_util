import {test, describe, assert, vi} from 'vitest';
import {EventEmitter} from 'node:events';
import type {ChildProcess} from 'node:child_process';

import {
	spawn,
	spawn_out,
	spawn_process,
	despawn,
	spawn_restartable_process,
	ProcessRegistry,
	process_registry_default,
	spawn_result_is_error,
	spawn_result_is_signaled,
	spawn_result_is_exited,
	process_is_pid_running,
	print_child_process,
	print_spawn_result,
	spawn_result_to_message,
	attach_process_error_handler,
	type SpawnResult,
} from '$lib/process.js';

describe('spawn', () => {
	test('returns ok for successful command', async () => {
		const result = await spawn('echo', ['hello']);
		assert.ok(result.ok);
		assert.ok(spawn_result_is_exited(result));
		assert.strictEqual(result.code, 0);
		assert.strictEqual(result.signal, null);
	});

	test('returns not ok with exit code for failed command', async () => {
		const result = await spawn('node', ['-e', 'process.exit(42)']);
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_exited(result));
		assert.strictEqual(result.code, 42);
		assert.strictEqual(result.signal, null);
	});

	test('returns error for non-existent command', async () => {
		const result = await spawn('nonexistent_command_xyz_12345');
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_error(result));
		assert.ok(result.error instanceof Error);
		assert.ok(
			result.error.message.includes('ENOENT') ||
				(result.error as NodeJS.ErrnoException).code === 'ENOENT',
		);
	});

	test('supports timeout_ms option', async () => {
		const result = await spawn('sleep', ['10'], {timeout_ms: 50});
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_signaled(result));
		assert.strictEqual(result.signal, 'SIGTERM');
	});

	test('supports AbortSignal option', async () => {
		const controller = new AbortController();
		const promise = spawn('sleep', ['10'], {signal: controller.signal});
		// Give process time to start
		await new Promise((r) => setTimeout(r, 20));
		controller.abort();
		const result = await promise;
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_signaled(result));
		assert.strictEqual(result.signal, 'SIGTERM');
	});

	test('handles pre-aborted signal', async () => {
		const controller = new AbortController();
		controller.abort();
		const result = await spawn('sleep', ['10'], {signal: controller.signal});
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_signaled(result));
	});

	test('supports both signal and timeout_ms together', async () => {
		const controller = new AbortController();
		// timeout_ms is shorter, should win
		const result = await spawn('sleep', ['10'], {
			signal: controller.signal,
			timeout_ms: 50,
		});
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_signaled(result));
		assert.strictEqual(result.signal, 'SIGTERM');
	});
});

describe('spawn_out', () => {
	test('captures stdout', async () => {
		const {result, stdout, stderr} = await spawn_out('echo', ['hello']);
		assert.ok(result.ok);
		assert.strictEqual(stdout, 'hello\n');
		// stderr stream available but empty
		assert.strictEqual(stderr, '');
	});

	test('captures stderr', async () => {
		const {result, stdout, stderr} = await spawn_out('node', [
			'-e',
			'console.error("error output")',
		]);
		assert.ok(result.ok);
		// stdout stream available but empty
		assert.strictEqual(stdout, '');
		assert.strictEqual(stderr, 'error output\n');
	});

	test('captures both stdout and stderr', async () => {
		const {result, stdout, stderr} = await spawn_out('node', [
			'-e',
			'console.log("out"); console.error("err");',
		]);
		assert.ok(result.ok);
		assert.strictEqual(stdout, 'out\n');
		assert.strictEqual(stderr, 'err\n');
	});

	test('captures output even on non-zero exit', async () => {
		const {result, stdout, stderr} = await spawn_out('node', [
			'-e',
			'console.log("out"); console.error("err"); process.exit(1);',
		]);
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_exited(result));
		assert.strictEqual(result.code, 1);
		assert.strictEqual(stdout, 'out\n');
		assert.strictEqual(stderr, 'err\n');
	});

	test('returns null streams for non-existent command', async () => {
		const {result, stdout, stderr} = await spawn_out('nonexistent_command_xyz_12345');
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_error(result));
		assert.strictEqual(stdout, null);
		assert.strictEqual(stderr, null);
	});

	test('supports timeout_ms option', async () => {
		const {result} = await spawn_out('sleep', ['10'], {timeout_ms: 50});
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_signaled(result));
		assert.strictEqual(result.signal, 'SIGTERM');
	});

	test('supports AbortSignal option', async () => {
		const controller = new AbortController();
		const promise = spawn_out('sleep', ['10'], {signal: controller.signal});
		await new Promise((r) => setTimeout(r, 20));
		controller.abort();
		const {result} = await promise;
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_signaled(result));
	});

	test('returns empty string for empty output', async () => {
		const {result, stdout, stderr} = await spawn_out('node', ['-e', 'process.stdout.write("")']);
		assert.ok(result.ok);
		// Empty write - stream available but no content
		assert.strictEqual(stdout, '');
		assert.strictEqual(stderr, '');
	});

	test('captures multi-chunk output correctly', async () => {
		// Generate output that will likely come in multiple chunks
		const {result, stdout} = await spawn_out('node', [
			'-e',
			'for(let i=0;i<100;i++) console.log("line "+i);',
		]);
		assert.ok(result.ok);
		assert.ok(stdout !== null);
		assert.ok(stdout.includes('line 0'));
		assert.ok(stdout.includes('line 99'));
		// Verify all 100 lines are present
		const lines = stdout.trim().split('\n');
		assert.strictEqual(lines.length, 100);
	});
});

describe('spawn_process', () => {
	test('returns child and closed promise', async () => {
		const {child, closed} = spawn_process('echo', ['test']);
		assert.ok(child);
		assert.ok(typeof child.pid === 'number');
		const result = await closed;
		assert.ok(result.ok);
	});

	test('child can be killed', async () => {
		const {child, closed} = spawn_process('sleep', ['10']);
		assert.ok(process_is_pid_running(child.pid!));
		child.kill('SIGTERM');
		const result = await closed;
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_signaled(result));
		assert.strictEqual(result.signal, 'SIGTERM');
	});
});

describe('despawn', () => {
	test('kills running process', async () => {
		const {child, closed} = spawn_process('sleep', ['10']);
		const result = await despawn(child);
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_signaled(result));
		// Also verify closed resolves
		const closedResult = await closed;
		assert.ok(!closedResult.ok);
	});

	test('returns immediately for already exited process', async () => {
		const {child, closed} = spawn_process('echo', ['done']);
		await closed;
		const result = await despawn(child);
		assert.ok(result.ok);
		assert.ok(spawn_result_is_exited(result));
		assert.strictEqual(result.code, 0);
	});

	test('returns signalCode for already-signaled process', async () => {
		const {child, closed} = spawn_process('sleep', ['10']);
		child.kill('SIGKILL');
		await closed;
		const result = await despawn(child);
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_signaled(result));
		assert.strictEqual(result.signal, 'SIGKILL');
	});

	test('supports custom signal', async () => {
		const {child} = spawn_process('sleep', ['10']);
		const result = await despawn(child, {signal: 'SIGKILL'});
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_signaled(result));
		assert.strictEqual(result.signal, 'SIGKILL');
	});

	test('escalates to SIGKILL after timeout', async () => {
		// Process that ignores SIGTERM - needs time to set up handler
		const {child} = spawn_process('node', [
			'-e',
			'process.on("SIGTERM", () => console.log("ignored")); setInterval(() => {}, 1000);',
		]);
		// Wait for process to start and set up handler
		await new Promise((r) => setTimeout(r, 50));
		const result = await despawn(child, {signal: 'SIGTERM', timeout_ms: 100});
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_signaled(result));
		assert.strictEqual(result.signal, 'SIGKILL');
	});

	test('timeout_ms of 0 escalates to SIGKILL immediately', async () => {
		// Process that ignores SIGTERM
		const {child} = spawn_process('node', [
			'-e',
			'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);',
		]);
		await new Promise((r) => setTimeout(r, 50));
		const result = await despawn(child, {signal: 'SIGTERM', timeout_ms: 0});
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_signaled(result));
		assert.strictEqual(result.signal, 'SIGKILL');
	});
});

describe('ProcessRegistry', () => {
	test('tracks spawned processes', async () => {
		const registry = new ProcessRegistry();
		assert.strictEqual(registry.processes.size, 0);

		const {child, closed} = registry.spawn('sleep', ['10']);
		assert.strictEqual(registry.processes.size, 1);
		assert.ok(registry.processes.has(child));

		child.kill();
		await closed;
		assert.strictEqual(registry.processes.size, 0);
	});

	test('despawn_all kills all processes', async () => {
		const registry = new ProcessRegistry();
		registry.spawn('sleep', ['10']);
		registry.spawn('sleep', ['10']);
		assert.strictEqual(registry.processes.size, 2);

		const results = await registry.despawn_all();
		assert.strictEqual(results.length, 2);
		assert.ok(results.every((r) => !r.ok));
		assert.strictEqual(registry.processes.size, 0);
	});

	test('despawn_all returns empty array when no processes', async () => {
		const registry = new ProcessRegistry();
		const results = await registry.despawn_all();
		assert.strictEqual(results.length, 0);
	});

	test('isolated from process_registry_default', async () => {
		const registry = new ProcessRegistry();
		const defaultSizeBefore = process_registry_default.processes.size;

		const {child, closed} = registry.spawn('sleep', ['10']);
		assert.strictEqual(process_registry_default.processes.size, defaultSizeBefore);
		assert.strictEqual(registry.processes.size, 1);

		child.kill();
		await closed;
	});

	test('removes process from registry on spawn error', async () => {
		const registry = new ProcessRegistry();
		assert.strictEqual(registry.processes.size, 0);

		const {closed} = registry.spawn('nonexistent_command_xyz_12345');
		// Process is added to registry immediately
		assert.strictEqual(registry.processes.size, 1);

		const result = await closed;
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_error(result));
		// After error, process should be removed from registry
		assert.strictEqual(registry.processes.size, 0);
	});

	test('uses injected spawn_child_process function', async () => {
		const registry = new ProcessRegistry();

		// Create a mock child process using EventEmitter
		const emitter = new EventEmitter();
		const mock_child = Object.assign(emitter, {
			pid: 12345,
			exitCode: null as number | null,
			signalCode: null as NodeJS.Signals | null,
			spawnargs: ['test', 'arg'],
			kill: vi.fn(() => true),
		}) as unknown as ChildProcess;

		let captured_command: string | undefined;
		let captured_args: ReadonlyArray<string> | undefined;
		let captured_options: Record<string, unknown> | undefined;
		const mock_spawn = vi.fn(
			(cmd: string, args: ReadonlyArray<string>, opts: Record<string, unknown>) => {
				captured_command = cmd;
				captured_args = args;
				captured_options = opts;
				return mock_child;
			},
		);

		const {child, closed} = registry.spawn('test', ['arg'], {
			spawn_child_process: mock_spawn as unknown as typeof import('node:child_process').spawn,
		});

		// Verify the mock was called with correct arguments
		assert.ok(mock_spawn.mock.calls.length === 1);
		assert.strictEqual(captured_command, 'test');
		assert.deepStrictEqual(captured_args, ['arg']);
		assert.strictEqual(captured_options?.stdio, 'inherit');

		// Verify the child is the mock
		assert.strictEqual(child, mock_child);
		assert.strictEqual(child.pid, 12345);

		// Simulate the process exiting with code 0
		emitter.emit('close', 0, null);

		const result = await closed;
		assert.ok(result.ok);
		assert.ok(spawn_result_is_exited(result));
		assert.strictEqual(result.code, 0);
	});

	test('injected spawn receives custom options', async () => {
		const registry = new ProcessRegistry();

		const emitter = new EventEmitter();
		const mock_child = Object.assign(emitter, {
			pid: 12345,
			exitCode: null as number | null,
			signalCode: null as NodeJS.Signals | null,
			spawnargs: ['test'],
			kill: vi.fn(() => true),
		}) as unknown as ChildProcess;

		let captured_options: Record<string, unknown> | undefined;
		const mock_spawn = vi.fn(
			(_cmd: string, _args: ReadonlyArray<string>, opts: Record<string, unknown>) => {
				captured_options = opts;
				return mock_child;
			},
		);

		const {closed} = registry.spawn('test', [], {
			spawn_child_process: mock_spawn as unknown as typeof import('node:child_process').spawn,
			cwd: '/custom/path',
			env: {FOO: 'bar'},
		});

		// Verify custom options are passed through
		assert.strictEqual(captured_options?.cwd, '/custom/path');
		assert.deepStrictEqual(captured_options?.env, {FOO: 'bar'});

		emitter.emit('close', 0, null);
		await closed;
	});
});

describe('spawn_restartable_process', () => {
	test('spawned promise resolves when first spawn completes', async () => {
		const rp = spawn_restartable_process('sleep', ['10']);
		await rp.spawned;
		assert.ok(rp.active);
		assert.ok(rp.child !== null);
		assert.ok(typeof rp.child.pid === 'number');
		await rp.kill();
		assert.ok(!rp.active);
		assert.strictEqual(rp.child, null);
	});

	test('closed promise resolves when process exits', async () => {
		const rp = spawn_restartable_process('node', ['-e', 'setTimeout(() => {}, 50)']);
		await rp.spawned;
		const result = await rp.closed;
		assert.ok(result.ok);
		assert.ok(spawn_result_is_exited(result));
	});

	test('restart kills current and starts new process', async () => {
		const rp = spawn_restartable_process('sleep', ['10']);
		await rp.spawned;
		const firstPid = rp.child?.pid;
		assert.ok(firstPid);

		await rp.restart();
		const secondPid = rp.child.pid;
		assert.ok(secondPid);
		assert.notStrictEqual(firstPid, secondPid);

		await rp.kill();
	});

	test('closed updates after restart', async () => {
		const rp = spawn_restartable_process('node', ['-e', 'setTimeout(() => process.exit(1), 30)']);
		await rp.spawned;
		const firstClosed = rp.closed;
		const firstResult = await firstClosed;
		assert.ok(!firstResult.ok);
		assert.ok(spawn_result_is_exited(firstResult));
		assert.strictEqual(firstResult.code, 1);

		await rp.restart();
		// closed should now be a different promise
		const secondClosed = rp.closed;
		assert.notStrictEqual(firstClosed, secondClosed);

		await rp.kill();
	});

	test('supports SpawnProcessOptions', async () => {
		const controller = new AbortController();
		const rp = spawn_restartable_process('sleep', ['10'], {signal: controller.signal});
		await rp.spawned;
		assert.ok(rp.active);
		controller.abort();
		const result = await rp.closed;
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_signaled(result));
	});

	test('concurrent restart calls are coalesced', async () => {
		const rp = spawn_restartable_process('sleep', ['10']);
		await rp.spawned;
		const pid1 = rp.child?.pid;

		// Fire multiple restarts concurrently
		const restart1 = rp.restart();
		const restart2 = rp.restart();
		const restart3 = rp.restart();

		await Promise.all([restart1, restart2, restart3]);

		// Only one new process should exist
		assert.ok(rp.active);
		const pid2 = rp.child?.pid;
		assert.notStrictEqual(pid1, pid2);

		await rp.kill();
	});

	test('restart after natural exit works', async () => {
		const rp = spawn_restartable_process('node', ['-e', 'process.exit(0)']);
		await rp.spawned;
		const firstPid = rp.child?.pid;
		// Wait for natural exit
		const result = await rp.closed;
		assert.ok(result.ok);
		// Note: active stays true until kill() or restart() - it reflects handle state, not process state

		// Restart should work and give us a new process
		await rp.restart();
		assert.ok(rp.active);
		assert.ok(rp.child !== null);
		assert.notStrictEqual(rp.child.pid, firstPid);

		await rp.kill();
	});

	test('kill when process already exited', async () => {
		const rp = spawn_restartable_process('node', ['-e', 'process.exit(0)']);
		await rp.spawned;
		await rp.closed;
		// Note: active is still true here until kill() is called

		// Kill should work without throwing, and set active to false
		await rp.kill();
		assert.ok(!rp.active);
	});

	test('restart after kill allows new process', async () => {
		const rp = spawn_restartable_process('sleep', ['10']);
		await rp.spawned;
		await rp.kill();
		assert.ok(!rp.active);

		// Restart after kill should work
		await rp.restart();
		assert.ok(rp.active);
		assert.ok(rp.child !== null);

		await rp.kill();
	});

	test('pre-aborted signal kills process immediately', async () => {
		const controller = new AbortController();
		controller.abort();
		const rp = spawn_restartable_process('sleep', ['10'], {signal: controller.signal});
		await rp.spawned;
		// Process should be killed immediately due to pre-aborted signal
		const result = await rp.closed;
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_signaled(result));
	});

	test('concurrent kill and restart resolves without error', async () => {
		const rp = spawn_restartable_process('sleep', ['10']);
		await rp.spawned;

		// Fire kill and restart concurrently - should not throw or deadlock
		const kill_promise = rp.kill();
		const restart_promise = rp.restart();

		await Promise.all([kill_promise, restart_promise]);

		// Should end in a stable state (either active with new process, or inactive)
		// The exact outcome depends on timing, but no crash/deadlock should occur
		if (rp.active) {
			await rp.kill();
		}
	});

	test('multiple concurrent kills are coalesced', async () => {
		const rp = spawn_restartable_process('sleep', ['10']);
		await rp.spawned;

		// Multiple concurrent kill calls should all resolve
		const kills = [rp.kill(), rp.kill(), rp.kill()];
		await Promise.all(kills);

		assert.ok(!rp.active);
	});
});

describe('type guards', () => {
	test('spawn_result_is_error identifies error results', () => {
		const error: SpawnResult = {
			ok: false,
			child: null!,
			error: new Error('test'),
			code: null,
			signal: null,
		};
		const exited: SpawnResult = {ok: true, child: null!, error: null, code: 0, signal: null};
		const signaled: SpawnResult = {
			ok: false,
			child: null!,
			error: null,
			code: null,
			signal: 'SIGTERM',
		};

		assert.ok(spawn_result_is_error(error));
		assert.ok(!spawn_result_is_error(exited));
		assert.ok(!spawn_result_is_error(signaled));
	});

	test('spawn_result_is_exited identifies exited results', () => {
		const error: SpawnResult = {
			ok: false,
			child: null!,
			error: new Error('test'),
			code: null,
			signal: null,
		};
		const exited: SpawnResult = {ok: true, child: null!, error: null, code: 0, signal: null};
		const signaled: SpawnResult = {
			ok: false,
			child: null!,
			error: null,
			code: null,
			signal: 'SIGTERM',
		};

		assert.ok(!spawn_result_is_exited(error));
		assert.ok(spawn_result_is_exited(exited));
		assert.ok(!spawn_result_is_exited(signaled));
	});

	test('spawn_result_is_signaled identifies signaled results', () => {
		const error: SpawnResult = {
			ok: false,
			child: null!,
			error: new Error('test'),
			code: null,
			signal: null,
		};
		const exited: SpawnResult = {ok: true, child: null!, error: null, code: 0, signal: null};
		const signaled: SpawnResult = {
			ok: false,
			child: null!,
			error: null,
			code: null,
			signal: 'SIGTERM',
		};

		assert.ok(!spawn_result_is_signaled(error));
		assert.ok(!spawn_result_is_signaled(exited));
		assert.ok(spawn_result_is_signaled(signaled));
	});
});

describe('process_is_pid_running', () => {
	test('returns true for running process', async () => {
		const {child, closed} = spawn_process('sleep', ['10']);
		assert.ok(process_is_pid_running(child.pid!));
		child.kill();
		await closed;
	});

	test('returns false for non-existent pid', () => {
		// Use a very high PID that's unlikely to exist
		assert.ok(!process_is_pid_running(999999999));
	});

	test('returns false for non-positive pid', () => {
		assert.ok(!process_is_pid_running(0));
		assert.ok(!process_is_pid_running(-1));
		assert.ok(!process_is_pid_running(-999));
	});

	test('returns false for NaN and Infinity', () => {
		assert.ok(!process_is_pid_running(NaN));
		assert.ok(!process_is_pid_running(Infinity));
		assert.ok(!process_is_pid_running(-Infinity));
	});

	test('returns false for fractional pid', () => {
		assert.ok(!process_is_pid_running(1234.5));
		assert.ok(!process_is_pid_running(1.1));
		assert.ok(!process_is_pid_running(0.5));
	});
});

describe('print utilities', () => {
	test('print_child_process formats with pid', async () => {
		const {child, closed} = spawn_process('echo', ['test']);
		const output = print_child_process(child);
		assert.ok(output.includes('pid('));
		assert.ok(output.includes('echo test'));
		await closed;
	});

	test('print_spawn_result returns ok for success', () => {
		const result: SpawnResult = {ok: true, child: null!, error: null, code: 0, signal: null};
		assert.strictEqual(print_spawn_result(result), 'ok');
	});

	test('print_spawn_result returns error message for error', () => {
		const result: SpawnResult = {
			ok: false,
			child: null!,
			error: new Error('test error'),
			code: null,
			signal: null,
		};
		assert.strictEqual(print_spawn_result(result), 'test error');
	});

	test('print_spawn_result returns signal for signaled', () => {
		const result: SpawnResult = {
			ok: false,
			child: null!,
			error: null,
			code: null,
			signal: 'SIGTERM',
		};
		const output = print_spawn_result(result);
		assert.ok(output.includes('signal'));
		assert.ok(output.includes('SIGTERM'));
	});

	test('print_spawn_result returns code for exited', () => {
		const result: SpawnResult = {ok: false, child: null!, error: null, code: 42, signal: null};
		const output = print_spawn_result(result);
		assert.ok(output.includes('code'));
		assert.ok(output.includes('42'));
	});

	test('spawn_result_to_message formats error', () => {
		const result: SpawnResult = {
			ok: false,
			child: null!,
			error: new Error('test error'),
			code: null,
			signal: null,
		};
		assert.strictEqual(spawn_result_to_message(result), 'error: test error');
	});

	test('spawn_result_to_message formats signal', () => {
		const result: SpawnResult = {
			ok: false,
			child: null!,
			error: null,
			code: null,
			signal: 'SIGKILL',
		};
		assert.strictEqual(spawn_result_to_message(result), 'signal SIGKILL');
	});

	test('spawn_result_to_message formats code', () => {
		const result: SpawnResult = {ok: false, child: null!, error: null, code: 1, signal: null};
		assert.strictEqual(spawn_result_to_message(result), 'code 1');
	});
});

describe('timeout_ms validation', () => {
	test('spawn throws for negative timeout_ms', () => {
		assert.throws(() => spawn_process('echo', ['test'], {timeout_ms: -1}), /non-negative/);
	});

	test('despawn throws for negative timeout_ms', async () => {
		const {child, closed} = spawn_process('sleep', ['10']);
		let threw = false;
		try {
			await despawn(child, {timeout_ms: -1});
		} catch (err) {
			threw = true;
			assert.ok((err as Error).message.includes('non-negative'));
		} finally {
			child.kill();
			await closed;
		}
		assert.ok(threw, 'Expected despawn to throw');
	});

	test('spawn allows timeout_ms of 0', async () => {
		// 0 is valid but immediately sends SIGTERM
		const result = await spawn('sleep', ['10'], {timeout_ms: 0});
		assert.ok(!result.ok);
		assert.ok(spawn_result_is_signaled(result));
	});
});

describe('attach_process_error_handler', () => {
	test('returns cleanup function', () => {
		const registry = new ProcessRegistry();
		const cleanup = registry.attach_error_handler();
		assert.ok(typeof cleanup === 'function');
		cleanup();
	});

	test('cleanup removes handler', () => {
		const registry = new ProcessRegistry();
		const cleanup = registry.attach_error_handler();
		cleanup();
		// Attaching again should succeed without warning (handler was removed)
		const cleanup2 = registry.attach_error_handler();
		cleanup2();
	});

	test('double attach throws', () => {
		const registry = new ProcessRegistry();
		const cleanup = registry.attach_error_handler();
		assert.throws(() => registry.attach_error_handler(), /already attached/);
		cleanup();
	});

	test('module-level function works', () => {
		const cleanup = attach_process_error_handler();
		assert.ok(typeof cleanup === 'function');
		cleanup();
	});

	test('accepts graceful_timeout_ms option', () => {
		const registry = new ProcessRegistry();
		const cleanup = registry.attach_error_handler({graceful_timeout_ms: 100});
		assert.ok(typeof cleanup === 'function');
		cleanup();
	});
});
