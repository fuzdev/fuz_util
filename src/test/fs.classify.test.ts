import { describe, test, assert } from 'vitest';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { fs_classify_error, type FsError } from '$lib/fs.ts';

const create_temp_dir = async (): Promise<string> => {
	const dir = join(
		tmpdir(),
		`fuz-util-fs-classify-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
	);
	await mkdir(dir, { recursive: true });
	return dir;
};

describe('fs_classify_error', () => {
	test('classifies ENOENT as not_found', () => {
		const err = Object.assign(new Error('no such file'), { code: 'ENOENT' });
		const result = fs_classify_error(err);
		assert.strictEqual(result.kind, 'not_found');
		assert.strictEqual(result.message, 'no such file');
	});

	test('classifies EACCES as permission_denied', () => {
		const err = Object.assign(new Error('access denied'), { code: 'EACCES' });
		const result = fs_classify_error(err);
		assert.strictEqual(result.kind, 'permission_denied');
		assert.strictEqual(result.message, 'access denied');
	});

	test('classifies EPERM as permission_denied', () => {
		const err = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
		const result = fs_classify_error(err);
		assert.strictEqual(result.kind, 'permission_denied');
		assert.strictEqual(result.message, 'operation not permitted');
	});

	test('classifies EEXIST as already_exists', () => {
		const err = Object.assign(new Error('file exists'), { code: 'EEXIST' });
		const result = fs_classify_error(err);
		assert.strictEqual(result.kind, 'already_exists');
		assert.strictEqual(result.message, 'file exists');
	});

	test('unknown code falls through to io_error', () => {
		const err = Object.assign(new Error('disk quota exceeded'), { code: 'EDQUOT' });
		const result = fs_classify_error(err);
		assert.strictEqual(result.kind, 'io_error');
		assert.strictEqual(result.message, 'disk quota exceeded');
	});

	test('Error without code is io_error', () => {
		const err = new Error('generic failure');
		const result = fs_classify_error(err);
		assert.strictEqual(result.kind, 'io_error');
		assert.strictEqual(result.message, 'generic failure');
	});

	test('string error is io_error with stringified message', () => {
		const result = fs_classify_error('raw string error');
		assert.strictEqual(result.kind, 'io_error');
		assert.strictEqual(result.message, 'raw string error');
	});

	test('null is io_error', () => {
		const result = fs_classify_error(null);
		assert.strictEqual(result.kind, 'io_error');
		assert.strictEqual(result.message, 'null');
	});

	test('undefined is io_error', () => {
		const result = fs_classify_error(undefined);
		assert.strictEqual(result.kind, 'io_error');
		assert.strictEqual(result.message, 'undefined');
	});

	test('number is io_error', () => {
		const result = fs_classify_error(42);
		assert.strictEqual(result.kind, 'io_error');
		assert.strictEqual(result.message, '42');
	});

	test('plain object without code is io_error with String(obj) message', () => {
		const result = fs_classify_error({ some: 'thing' });
		assert.strictEqual(result.kind, 'io_error');
		assert.strictEqual(result.message, '[object Object]');
	});

	test('non-string code falls through to io_error', () => {
		const err = Object.assign(new Error('weird'), { code: 42 });
		const result = fs_classify_error(err);
		assert.strictEqual(result.kind, 'io_error');
		assert.strictEqual(result.message, 'weird');
	});

	test('plain object with code property is classified', () => {
		const result = fs_classify_error({ code: 'ENOENT', message: 'not a real Error' });
		assert.strictEqual(result.kind, 'not_found');
		// String({code, message}) produces '[object Object]' since it's not an Error instance
		assert.strictEqual(result.message, '[object Object]');
	});

	test('result is a discriminated union exhaustively narrowable by kind', () => {
		// Compile-time exhaustiveness — adding a new kind without updating this
		// function errors on the `never` return via `satisfies never`.
		const label = (result: FsError): string => {
			switch (result.kind) {
				case 'not_found':
					return 'missing';
				case 'permission_denied':
					return 'denied';
				case 'already_exists':
					return 'exists';
				case 'io_error':
					return 'io';
				default:
					return result satisfies never;
			}
		};
		const err = Object.assign(new Error('nope'), { code: 'ENOENT' });
		assert.strictEqual(label(fs_classify_error(err)), 'missing');
	});

	test('classifies real ENOENT thrown by readFile', async () => {
		try {
			await readFile('/non/existent/path/that/does/not/exist.txt');
			assert.fail('Expected readFile to throw');
		} catch (error) {
			const result = fs_classify_error(error);
			assert.strictEqual(result.kind, 'not_found');
		}
	});

	test('classifies real EEXIST thrown by open with wx flag', async () => {
		const dir = await create_temp_dir();
		const path = join(dir, 'file.txt');
		await writeFile(path, 'first');
		try {
			const handle = await open(path, 'wx');
			await handle.close();
			assert.fail('Expected open to throw');
		} catch (error) {
			const result = fs_classify_error(error);
			assert.strictEqual(result.kind, 'already_exists');
		} finally {
			await rm(dir, { recursive: true });
		}
	});
});
