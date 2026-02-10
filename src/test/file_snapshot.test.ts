import {describe, test, expect} from 'vitest';
import {writeFile, mkdir, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

import {collect_file_snapshot, validate_file_snapshot} from '$lib/file_snapshot.js';

const create_tmp_dir = async (): Promise<string> => {
	const dir = join(
		tmpdir(),
		'fuz_util_test_snap_' + Date.now() + '_' + Math.random().toString(36).slice(2),
	);
	await mkdir(dir, {recursive: true});
	return dir;
};

describe('collect_file_snapshot', () => {
	test('collects files from directory', async () => {
		const dir = await create_tmp_dir();
		await writeFile(join(dir, 'a.txt'), 'hello');
		await writeFile(join(dir, 'b.txt'), 'world');

		const entries = await collect_file_snapshot({
			dirs: [dir],
			fields: {hash: true, size: true},
		});

		expect(entries).toHaveLength(2);
		expect(entries[0]!.path.endsWith('a.txt')).toBe(true);
		expect(entries[1]!.path.endsWith('b.txt')).toBe(true);
		expect(entries[0]!.hash).toMatch(/^[0-9a-f]{64}$/);
		expect(entries[0]!.size).toBe(5);

		await rm(dir, {recursive: true, force: true});
	});

	test('collects files recursively', async () => {
		const dir = await create_tmp_dir();
		await writeFile(join(dir, 'root.txt'), 'root');
		await mkdir(join(dir, 'sub'));
		await writeFile(join(dir, 'sub', 'nested.txt'), 'nested');

		const entries = await collect_file_snapshot({
			dirs: [dir],
			fields: {size: true},
		});

		expect(entries).toHaveLength(2);
		const nested = entries.find((e) => e.path.includes('nested'));
		expect(nested).toBeDefined();
		expect(nested?.size).toBe(6);

		await rm(dir, {recursive: true, force: true});
	});

	test('respects filter', async () => {
		const dir = await create_tmp_dir();
		await writeFile(join(dir, 'keep.txt'), 'keep');
		await writeFile(join(dir, 'skip.log'), 'skip');

		const entries = await collect_file_snapshot({
			dirs: [dir],
			fields: {},
			filter: (path) => !path.endsWith('.log'),
		});

		expect(entries).toHaveLength(1);
		expect(entries[0]!.path.endsWith('keep.txt')).toBe(true);

		await rm(dir, {recursive: true, force: true});
	});

	test('skips nonexistent directories', async () => {
		const entries = await collect_file_snapshot({
			dirs: ['/tmp/nonexistent_' + Date.now()],
			fields: {},
		});

		expect(entries).toEqual([]);
	});

	test('configurable fields', async () => {
		const dir = await create_tmp_dir();
		await writeFile(join(dir, 'file.txt'), 'content');

		// Only size
		const size_only = await collect_file_snapshot({
			dirs: [dir],
			fields: {size: true},
		});
		expect(size_only[0]!.size).toBe(7);
		expect(size_only[0]!.hash).toBeUndefined();
		expect(size_only[0]!.mtime).toBeUndefined();

		// Only hash
		const hash_only = await collect_file_snapshot({
			dirs: [dir],
			fields: {hash: true},
		});
		expect(hash_only[0]!.hash).toMatch(/^[0-9a-f]{64}$/);
		expect(hash_only[0]!.size).toBeUndefined();

		// All fields
		const all = await collect_file_snapshot({
			dirs: [dir],
			fields: {hash: true, size: true, mtime: true, ctime: true, mode: true},
		});
		expect(all[0]!.hash).toBeDefined();
		expect(all[0]!.size).toBeDefined();
		expect(all[0]!.mtime).toBeDefined();
		expect(all[0]!.ctime).toBeDefined();
		expect(all[0]!.mode).toBeDefined();

		await rm(dir, {recursive: true, force: true});
	});

	test('scans multiple directories', async () => {
		const dir1 = await create_tmp_dir();
		const dir2 = await create_tmp_dir();
		await writeFile(join(dir1, 'one.txt'), '1');
		await writeFile(join(dir2, 'two.txt'), '2');

		const entries = await collect_file_snapshot({
			dirs: [dir1, dir2],
			fields: {},
		});

		expect(entries).toHaveLength(2);

		await rm(dir1, {recursive: true, force: true});
		await rm(dir2, {recursive: true, force: true});
	});

	test('returns sorted entries', async () => {
		const dir = await create_tmp_dir();
		await writeFile(join(dir, 'c.txt'), '');
		await writeFile(join(dir, 'a.txt'), '');
		await writeFile(join(dir, 'b.txt'), '');

		const entries = await collect_file_snapshot({
			dirs: [dir],
			fields: {},
		});

		const names = entries.map((e) => e.path.split('/').pop());
		expect(names).toEqual(['a.txt', 'b.txt', 'c.txt']);

		await rm(dir, {recursive: true, force: true});
	});
});

describe('validate_file_snapshot', () => {
	test('validates matching snapshot', async () => {
		const dir = await create_tmp_dir();
		await writeFile(join(dir, 'file.txt'), 'hello');

		const entries = await collect_file_snapshot({
			dirs: [dir],
			fields: {hash: true, size: true},
		});

		const valid = await validate_file_snapshot({entries});
		expect(valid).toBe(true);

		await rm(dir, {recursive: true, force: true});
	});

	test('detects missing file', async () => {
		const dir = await create_tmp_dir();
		await writeFile(join(dir, 'file.txt'), 'hello');

		const entries = await collect_file_snapshot({
			dirs: [dir],
			fields: {hash: true, size: true},
		});

		await rm(join(dir, 'file.txt'));

		const valid = await validate_file_snapshot({entries});
		expect(valid).toBe(false);

		await rm(dir, {recursive: true, force: true});
	});

	test('detects content change via hash', async () => {
		const dir = await create_tmp_dir();
		const path = join(dir, 'file.txt');
		await writeFile(path, 'original');

		const entries = await collect_file_snapshot({
			dirs: [dir],
			fields: {hash: true, size: true},
		});

		await writeFile(path, 'modified');

		const valid = await validate_file_snapshot({entries});
		expect(valid).toBe(false);

		await rm(dir, {recursive: true, force: true});
	});

	test('detects size change (fast path)', async () => {
		const dir = await create_tmp_dir();
		const path = join(dir, 'file.txt');
		await writeFile(path, 'short');

		const entries = await collect_file_snapshot({
			dirs: [dir],
			fields: {hash: true, size: true},
		});

		await writeFile(path, 'much longer content');

		const valid = await validate_file_snapshot({entries});
		expect(valid).toBe(false);

		await rm(dir, {recursive: true, force: true});
	});

	test('validates empty snapshot', async () => {
		const valid = await validate_file_snapshot({entries: []});
		expect(valid).toBe(true);
	});
});
