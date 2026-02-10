import {describe, test, expect} from 'vitest';
import {writeFile, mkdir, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

import {default_fs_operations} from '$lib/fs_operations_node.js';

const create_tmp_dir = async (): Promise<string> => {
	const dir = join(
		tmpdir(),
		'fuz_util_test_fs_ops_' + Date.now() + '_' + Math.random().toString(36).slice(2),
	);
	await mkdir(dir, {recursive: true});
	return dir;
};

describe('default_fs_operations', () => {
	describe('read_file', () => {
		test('reads existing file', async () => {
			const dir = await create_tmp_dir();
			const path = join(dir, 'test.txt');
			await writeFile(path, 'hello world');

			const result = await default_fs_operations.read_file({path});
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe('hello world');
			}

			await rm(dir, {recursive: true, force: true});
		});

		test('returns error for missing file', async () => {
			const result = await default_fs_operations.read_file({path: '/nonexistent/file.txt'});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.message).toContain('Failed to read file');
			}
		});
	});

	describe('read_file_buffer', () => {
		test('reads file as Uint8Array', async () => {
			const dir = await create_tmp_dir();
			const path = join(dir, 'binary.bin');
			await writeFile(path, Buffer.from([1, 2, 3, 4]));

			const result = await default_fs_operations.read_file_buffer({path});
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBeInstanceOf(Uint8Array);
				expect(result.value.length).toBe(4);
			}

			await rm(dir, {recursive: true, force: true});
		});
	});

	describe('write_file', () => {
		test('writes file', async () => {
			const dir = await create_tmp_dir();
			const path = join(dir, 'output.txt');

			const result = await default_fs_operations.write_file({path, content: 'test content'});
			expect(result.ok).toBe(true);

			const read = await default_fs_operations.read_file({path});
			expect(read.ok).toBe(true);
			if (read.ok) {
				expect(read.value).toBe('test content');
			}

			await rm(dir, {recursive: true, force: true});
		});
	});

	describe('stat', () => {
		test('returns stat for existing file', async () => {
			const dir = await create_tmp_dir();
			const path = join(dir, 'statme.txt');
			await writeFile(path, 'some content');

			const result = await default_fs_operations.stat({path});
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.size).toBe(12);
				expect(result.value.is_file).toBe(true);
				expect(result.value.is_directory).toBe(false);
				expect(typeof result.value.mtime_ms).toBe('number');
				expect(typeof result.value.ctime_ms).toBe('number');
				expect(typeof result.value.mode).toBe('number');
			}

			await rm(dir, {recursive: true, force: true});
		});

		test('returns stat for directory', async () => {
			const dir = await create_tmp_dir();

			const result = await default_fs_operations.stat({path: dir});
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.is_file).toBe(false);
				expect(result.value.is_directory).toBe(true);
			}

			await rm(dir, {recursive: true, force: true});
		});

		test('returns error for missing path', async () => {
			const result = await default_fs_operations.stat({path: '/nonexistent'});
			expect(result.ok).toBe(false);
		});
	});

	describe('exists', () => {
		test('returns true for existing file', async () => {
			const dir = await create_tmp_dir();
			const path = join(dir, 'exists.txt');
			await writeFile(path, '');

			expect(await default_fs_operations.exists({path})).toBe(true);

			await rm(dir, {recursive: true, force: true});
		});

		test('returns false for missing file', async () => {
			expect(await default_fs_operations.exists({path: '/nonexistent'})).toBe(false);
		});
	});

	describe('readdir', () => {
		test('lists directory entries with types', async () => {
			const dir = await create_tmp_dir();
			await writeFile(join(dir, 'a.txt'), '');
			await mkdir(join(dir, 'subdir'));

			const result = await default_fs_operations.readdir({path: dir});
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.length).toBe(2);
				const file = result.value.find((e) => e.name === 'a.txt');
				const subdir = result.value.find((e) => e.name === 'subdir');
				expect(file?.is_file).toBe(true);
				expect(file?.is_directory).toBe(false);
				expect(subdir?.is_file).toBe(false);
				expect(subdir?.is_directory).toBe(true);
			}

			await rm(dir, {recursive: true, force: true});
		});
	});

	describe('mkdir', () => {
		test('creates nested directories', async () => {
			const dir = await create_tmp_dir();
			const nested = join(dir, 'a', 'b', 'c');

			const result = await default_fs_operations.mkdir({path: nested, recursive: true});
			expect(result.ok).toBe(true);
			expect(await default_fs_operations.exists({path: nested})).toBe(true);

			await rm(dir, {recursive: true, force: true});
		});
	});

	describe('rm', () => {
		test('removes file', async () => {
			const dir = await create_tmp_dir();
			const path = join(dir, 'delete_me.txt');
			await writeFile(path, '');

			const result = await default_fs_operations.rm({path});
			expect(result.ok).toBe(true);
			expect(await default_fs_operations.exists({path})).toBe(false);

			await rm(dir, {recursive: true, force: true});
		});

		test('force removes nonexistent file without error', async () => {
			const result = await default_fs_operations.rm({
				path: '/tmp/nonexistent_' + Date.now(),
				force: true,
			});
			expect(result.ok).toBe(true);
		});
	});
});
