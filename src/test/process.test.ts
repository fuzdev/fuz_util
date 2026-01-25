import {test, describe, assert} from 'vitest';

import {
	spawn,
	spawn_out,
	spawn_process,
	despawn,
	spawn_restartable_process,
	ProcessRegistry,
	default_registry,
	spawn_result_is_error,
	spawn_result_is_signaled,
	spawn_result_is_exited,
	process_is_pid_running,
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
			result.error.message.includes('ENOENT') || (result.error as NodeJS.ErrnoException).code === 'ENOENT',
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
});

describe('spawn_out', () => {
	test('captures stdout', async () => {
		const {result, stdout, stderr} = await spawn_out('echo', ['hello']);
		assert.ok(result.ok);
		assert.strictEqual(stdout, 'hello\n');
		assert.strictEqual(stderr, null);
	});

	test('captures stderr', async () => {
		const {result, stdout, stderr} = await spawn_out('node', [
			'-e',
			'console.error("error output")',
		]);
		assert.ok(result.ok);
		assert.strictEqual(stdout, null);
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
		const p1 = registry.spawn('sleep', ['10']);
		const p2 = registry.spawn('sleep', ['10']);
		assert.strictEqual(registry.processes.size, 2);

		const results = await registry.despawn_all();
		assert.strictEqual(results.length, 2);
		assert.ok(results.every((r) => !r.ok));
		assert.strictEqual(registry.processes.size, 0);
	});

	test('isolated from default_registry', async () => {
		const registry = new ProcessRegistry();
		const defaultSizeBefore = default_registry.processes.size;

		const {child, closed} = registry.spawn('sleep', ['10']);
		assert.strictEqual(default_registry.processes.size, defaultSizeBefore);
		assert.strictEqual(registry.processes.size, 1);

		child.kill();
		await closed;
	});
});

describe('spawn_restartable_process', () => {
	test('starts immediately and exposes running state', async () => {
		const rp = spawn_restartable_process('sleep', ['10']);
		// Give it time to start
		await new Promise((r) => setTimeout(r, 20));
		assert.ok(rp.running);
		assert.ok(rp.child !== null);
		assert.ok(typeof rp.child!.pid === 'number');
		await rp.kill();
		assert.ok(!rp.running);
		assert.strictEqual(rp.child, null);
	});

	test('closed promise resolves when process exits', async () => {
		const rp = spawn_restartable_process('node', ['-e', 'setTimeout(() => {}, 50)']);
		const result = await rp.closed;
		assert.ok(result.ok);
		assert.ok(spawn_result_is_exited(result));
	});

	test('restart kills current and starts new process', async () => {
		const rp = spawn_restartable_process('sleep', ['10']);
		await new Promise((r) => setTimeout(r, 20));
		const firstPid = rp.child?.pid;
		assert.ok(firstPid);

		await rp.restart();
		await new Promise((r) => setTimeout(r, 20));
		const secondPid = rp.child?.pid;
		assert.ok(secondPid);
		assert.notStrictEqual(firstPid, secondPid);

		await rp.kill();
	});

	test('closed updates after restart', async () => {
		const rp = spawn_restartable_process('node', ['-e', 'setTimeout(() => process.exit(1), 30)']);
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
});

describe('type guards', () => {
	test('spawn_result_is_error identifies error results', () => {
		const error: SpawnResult = {ok: false, child: null!, error: new Error('test')};
		const exited: SpawnResult = {ok: true, child: null!, code: 0, signal: null};
		const signaled: SpawnResult = {ok: false, child: null!, code: null, signal: 'SIGTERM'};

		assert.ok(spawn_result_is_error(error));
		assert.ok(!spawn_result_is_error(exited));
		assert.ok(!spawn_result_is_error(signaled));
	});

	test('spawn_result_is_exited identifies exited results', () => {
		const error: SpawnResult = {ok: false, child: null!, error: new Error('test')};
		const exited: SpawnResult = {ok: true, child: null!, code: 0, signal: null};
		const signaled: SpawnResult = {ok: false, child: null!, code: null, signal: 'SIGTERM'};

		assert.ok(!spawn_result_is_exited(error));
		assert.ok(spawn_result_is_exited(exited));
		assert.ok(!spawn_result_is_exited(signaled));
	});

	test('spawn_result_is_signaled identifies signaled results', () => {
		const error: SpawnResult = {ok: false, child: null!, error: new Error('test')};
		const exited: SpawnResult = {ok: true, child: null!, code: 0, signal: null};
		const signaled: SpawnResult = {ok: false, child: null!, code: null, signal: 'SIGTERM'};

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
});
