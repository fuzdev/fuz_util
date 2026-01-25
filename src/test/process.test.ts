import {test, assert} from 'vitest';

import {spawn, spawn_out} from '$lib/process.ts';

test('spawn', async () => {
	const result = await spawn('echo', ['a', 'b']);
	assert.ok(result.ok);
});

test('spawn with non-zero exit code', async () => {
	const result = await spawn('node', ['-e', 'process.exit(1)']);
	assert.ok(!result.ok);
	assert.ok('code' in result);
	assert.strictEqual(result.code, 1);
});

test('spawn with non-existent command returns error', async () => {
	const result = await spawn('nonexistent_command_that_does_not_exist_12345');
	assert.ok(!result.ok);
	assert.ok('error' in result);
	assert.ok(result.error instanceof Error);
	assert.ok(result.error.message.includes('ENOENT') || (result.error as any).code === 'ENOENT');
});

test('spawn_out', async () => {
	const {result, stdout, stderr} = await spawn_out('echo', ['a', 'b']);
	assert.ok(result.ok);
	assert.strictEqual(stdout, 'a b\n');
	assert.strictEqual(stderr, null);
});

test('spawn_out with stderr', async () => {
	const {result, stdout, stderr} = await spawn_out('node', [
		'-e',
		'console.log("out"); console.error("err");',
	]);
	assert.ok(result.ok);
	assert.strictEqual(stdout, 'out\n');
	assert.strictEqual(stderr, 'err\n');
});

test('spawn_out with non-zero exit code', async () => {
	const {result, stdout, stderr} = await spawn_out('node', [
		'-e',
		'console.log("out"); console.error("err"); process.exit(1);',
	]);
	assert.ok(!result.ok);
	assert.ok('code' in result);
	assert.strictEqual(result.code, 1);
	assert.strictEqual(stdout, 'out\n');
	assert.strictEqual(stderr, 'err\n');
});

test('spawn_out with non-existent command returns error', async () => {
	const {result, stdout, stderr} = await spawn_out('nonexistent_command_that_does_not_exist_12345');
	assert.ok(!result.ok);
	assert.ok('error' in result);
	assert.ok(result.error instanceof Error);
	assert.ok(result.error.message.includes('ENOENT') || (result.error as any).code === 'ENOENT');
	assert.strictEqual(stdout, null);
	assert.strictEqual(stderr, null);
});
