import {describe, test, expect} from 'vitest';
import {mkdir, writeFile, readdir, rm, stat, symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

import {fs_exists, fs_empty_dir, fs_search} from '$lib/fs.ts';

const create_temp_dir = async (): Promise<string> => {
	const dir = join(
		tmpdir(),
		`fuz-util-fs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	await mkdir(dir, {recursive: true});
	return dir;
};

describe('fs_exists', () => {
	test('returns true for existing file', async () => {
		const dir = await create_temp_dir();
		const file = join(dir, 'test.txt');
		await writeFile(file, 'hello');

		expect(await fs_exists(file)).toBe(true);

		await rm(dir, {recursive: true});
	});

	test('returns true for existing directory', async () => {
		const dir = await create_temp_dir();

		expect(await fs_exists(dir)).toBe(true);

		await rm(dir, {recursive: true});
	});

	test('returns false for non-existent path', async () => {
		expect(await fs_exists('/non/existent/path/that/does/not/exist')).toBe(false);
	});

	test('returns false after file is deleted', async () => {
		const dir = await create_temp_dir();
		const file = join(dir, 'test.txt');
		await writeFile(file, 'hello');

		expect(await fs_exists(file)).toBe(true);
		await rm(file);
		expect(await fs_exists(file)).toBe(false);

		await rm(dir, {recursive: true});
	});

	test('returns true for symlink to existing file', async () => {
		const dir = await create_temp_dir();
		const file = join(dir, 'target.txt');
		const link = join(dir, 'link.txt');
		await writeFile(file, 'target');
		await symlink(file, link);

		expect(await fs_exists(link)).toBe(true);

		await rm(dir, {recursive: true});
	});

	test('returns false for broken symlink', async () => {
		const dir = await create_temp_dir();
		const file = join(dir, 'target.txt');
		const link = join(dir, 'link.txt');
		await writeFile(file, 'target');
		await symlink(file, link);
		await rm(file);

		expect(await fs_exists(link)).toBe(false);

		await rm(dir, {recursive: true});
	});
});

describe('fs_empty_dir', () => {
	test('removes all files from directory', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'a.txt'), 'a');
		await writeFile(join(dir, 'b.txt'), 'b');
		await writeFile(join(dir, 'c.txt'), 'c');

		expect((await readdir(dir)).length).toBe(3);

		await fs_empty_dir(dir);

		expect((await readdir(dir)).length).toBe(0);

		await rm(dir, {recursive: true});
	});

	test('removes nested directories', async () => {
		const dir = await create_temp_dir();
		const nested = join(dir, 'nested');
		await mkdir(nested);
		await writeFile(join(nested, 'file.txt'), 'hello');
		await writeFile(join(dir, 'root.txt'), 'root');

		expect((await readdir(dir)).length).toBe(2);

		await fs_empty_dir(dir);

		expect((await readdir(dir)).length).toBe(0);

		await rm(dir, {recursive: true});
	});

	test('with filter keeps entries where filter returns false', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'keep.txt'), 'keep');
		await writeFile(join(dir, 'remove.txt'), 'remove');
		await mkdir(join(dir, '.git'));
		await writeFile(join(dir, '.git', 'config'), 'git config');

		await fs_empty_dir(dir, (name) => name !== '.git' && name !== 'keep.txt');

		const remaining = await readdir(dir);
		expect(remaining).toContain('keep.txt');
		expect(remaining).toContain('.git');
		expect(remaining).not.toContain('remove.txt');

		await rm(dir, {recursive: true});
	});

	test('filter receives basename not full path', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'file.txt'), 'content');

		const received_paths: Array<string> = [];
		await fs_empty_dir(dir, (path) => {
			received_paths.push(path);
			return false;
		});

		expect(received_paths).toEqual(['file.txt']);
		expect(received_paths[0]).not.toContain(dir);

		await rm(dir, {recursive: true});
	});

	test('on empty directory does nothing', async () => {
		const dir = await create_temp_dir();

		await fs_empty_dir(dir);

		expect(await fs_exists(dir)).toBe(true);
		expect((await readdir(dir)).length).toBe(0);

		await rm(dir, {recursive: true});
	});

	test('throws on non-existent directory', async () => {
		await expect(fs_empty_dir('/non/existent/directory')).rejects.toThrow();
	});

	test('preserves the directory itself', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'file.txt'), 'content');

		await fs_empty_dir(dir);

		expect(await fs_exists(dir)).toBe(true);
		const stats = await stat(dir);
		expect(stats.isDirectory()).toBe(true);

		await rm(dir, {recursive: true});
	});

	test('removes hidden files', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, '.hidden'), 'hidden');
		await writeFile(join(dir, '.dotfile'), 'dot');
		await writeFile(join(dir, 'visible.txt'), 'visible');

		await fs_empty_dir(dir);

		expect((await readdir(dir)).length).toBe(0);

		await rm(dir, {recursive: true});
	});

	test('handles filenames with spaces and special characters', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'file with spaces.txt'), 'spaces');
		await writeFile(join(dir, 'special!@#$.txt'), 'special');
		await writeFile(join(dir, 'über.txt'), 'unicode');

		expect((await readdir(dir)).length).toBe(3);

		await fs_empty_dir(dir);

		expect((await readdir(dir)).length).toBe(0);

		await rm(dir, {recursive: true});
	});

	test('removes deeply nested structures', async () => {
		const dir = await create_temp_dir();
		const deep = join(dir, 'a', 'b', 'c', 'd');
		await mkdir(deep, {recursive: true});
		await writeFile(join(deep, 'deep.txt'), 'deep');
		await writeFile(join(dir, 'a', 'shallow.txt'), 'shallow');

		await fs_empty_dir(dir);

		expect((await readdir(dir)).length).toBe(0);

		await rm(dir, {recursive: true});
	});

	test('with filter returning false for all keeps everything', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'a.txt'), 'a');
		await writeFile(join(dir, 'b.txt'), 'b');

		await fs_empty_dir(dir, () => false);

		expect((await readdir(dir)).sort()).toEqual(['a.txt', 'b.txt']);

		await rm(dir, {recursive: true});
	});

	test('with filter returning true for all removes everything', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'a.txt'), 'a');
		await writeFile(join(dir, 'b.txt'), 'b');

		await fs_empty_dir(dir, () => true);

		expect((await readdir(dir)).length).toBe(0);

		await rm(dir, {recursive: true});
	});

	test('removes symlinks', async () => {
		const dir = await create_temp_dir();
		const file = join(dir, 'target.txt');
		const link = join(dir, 'link.txt');
		await writeFile(file, 'target');
		await symlink(file, link);

		expect((await readdir(dir)).length).toBe(2);

		await fs_empty_dir(dir);

		expect((await readdir(dir)).length).toBe(0);

		await rm(dir, {recursive: true});
	});

	test('removes symlinks to directories without following them', async () => {
		const dir = await create_temp_dir();
		const target_dir = join(dir, 'target_dir');
		const link = join(dir, 'link_to_dir');
		await mkdir(target_dir);
		await writeFile(join(target_dir, 'file.txt'), 'content');
		await symlink(target_dir, link);

		await fs_empty_dir(dir);

		expect((await readdir(dir)).length).toBe(0);

		await rm(dir, {recursive: true, force: true});
	});
});

describe('fs_search', () => {
	test('finds files in directory', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'a.txt'), 'a');
		await writeFile(join(dir, 'b.txt'), 'b');

		const result = await fs_search(dir, {cwd: null});

		expect(result.map((f) => f.path).sort()).toEqual(['a.txt', 'b.txt']);
		expect(result.every((f) => !f.is_directory)).toBe(true);

		await rm(dir, {recursive: true});
	});

	test('finds files in nested directories', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'root.txt'), 'root');
		await mkdir(join(dir, 'sub'));
		await writeFile(join(dir, 'sub', 'nested.txt'), 'nested');
		await mkdir(join(dir, 'sub', 'deep'));
		await writeFile(join(dir, 'sub', 'deep', 'deep.txt'), 'deep');

		const result = await fs_search(dir, {cwd: null});

		expect(result.map((f) => f.path).sort()).toEqual([
			'root.txt',
			'sub/deep/deep.txt',
			'sub/nested.txt',
		]);

		await rm(dir, {recursive: true});
	});

	test('returns empty array for non-existent directory', async () => {
		const result = await fs_search('/non/existent/directory/path', {cwd: null});
		expect(result).toEqual([]);
	});

	test('returns empty array for empty directory', async () => {
		const dir = await create_temp_dir();

		const result = await fs_search(dir, {cwd: null});

		expect(result).toEqual([]);

		await rm(dir, {recursive: true});
	});

	test('filter excludes paths', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'keep.txt'), 'keep');
		await writeFile(join(dir, 'ignore.txt'), 'ignore');
		await mkdir(join(dir, 'node_modules'));
		await writeFile(join(dir, 'node_modules', 'pkg.js'), 'pkg');

		const result = await fs_search(dir, {
			cwd: null,
			filter: (path) => !path.includes('ignore') && !path.includes('node_modules'),
		});

		expect(result.map((f) => f.path)).toEqual(['keep.txt']);

		await rm(dir, {recursive: true});
	});

	test('filter receives is_directory flag', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'file.txt'), 'file');
		await mkdir(join(dir, 'subdir'));
		await writeFile(join(dir, 'subdir', 'nested.txt'), 'nested');

		const calls: Array<{path: string; is_directory: boolean}> = [];
		await fs_search(dir, {
			cwd: null,
			filter: (path, is_directory) => {
				calls.push({path, is_directory});
				return true;
			},
		});

		const dir_call = calls.find((c) => c.path.endsWith('subdir'));
		const file_call = calls.find((c) => c.path.endsWith('file.txt'));

		expect(dir_call?.is_directory).toBe(true);
		expect(file_call?.is_directory).toBe(false);

		await rm(dir, {recursive: true});
	});

	test('filter excluding directory prevents recursion into it', async () => {
		const dir = await create_temp_dir();
		await mkdir(join(dir, 'excluded'));
		await writeFile(join(dir, 'excluded', 'should_not_find.txt'), 'hidden');
		await mkdir(join(dir, 'included'));
		await writeFile(join(dir, 'included', 'should_find.txt'), 'visible');

		const visited: Array<string> = [];
		const result = await fs_search(dir, {
			cwd: null,
			filter: (path) => {
				visited.push(path);
				return !path.includes('excluded');
			},
		});

		expect(result.map((f) => f.path)).toEqual(['included/should_find.txt']);
		expect(visited.some((p) => p.includes('should_not_find'))).toBe(false);

		await rm(dir, {recursive: true});
	});

	test('multiple filters all must pass', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'a.txt'), 'a');
		await writeFile(join(dir, 'b.js'), 'b');
		await writeFile(join(dir, 'c.txt'), 'c');

		const result = await fs_search(dir, {
			cwd: null,
			filter: [(path) => !path.endsWith('a.txt'), (path) => !path.endsWith('.js')],
		});

		expect(result.map((f) => f.path)).toEqual(['c.txt']);

		await rm(dir, {recursive: true});
	});

	test('empty filter array is ignored', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'a.txt'), 'a');
		await writeFile(join(dir, 'b.txt'), 'b');

		const result = await fs_search(dir, {cwd: null, filter: []});

		expect(result.map((f) => f.path).sort()).toEqual(['a.txt', 'b.txt']);

		await rm(dir, {recursive: true});
	});

	test('file_filter applies only to files', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'yes.txt'), 'yes');
		await writeFile(join(dir, 'no.md'), 'no');
		await mkdir(join(dir, 'subdir'));
		await writeFile(join(dir, 'subdir', 'also.txt'), 'also');

		const result = await fs_search(dir, {
			cwd: null,
			file_filter: (path) => path.endsWith('.txt'),
		});

		expect(result.map((f) => f.path).sort()).toEqual(['subdir/also.txt', 'yes.txt']);

		await rm(dir, {recursive: true});
	});

	test('multiple file_filters all must pass', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'test_file.txt'), 'test');
		await writeFile(join(dir, 'test_file.md'), 'md');
		await writeFile(join(dir, 'other.txt'), 'other');
		await writeFile(join(dir, 'test_file.js'), 'js');

		const result = await fs_search(dir, {
			cwd: null,
			// file_filter receives the full id path, so use basename matching
			file_filter: [(path) => path.includes('test_file'), (path) => path.endsWith('.txt')],
		});

		expect(result.map((f) => f.path)).toEqual(['test_file.txt']);

		await rm(dir, {recursive: true});
	});

	test('empty file_filter array is ignored', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'a.txt'), 'a');
		await writeFile(join(dir, 'b.txt'), 'b');

		const result = await fs_search(dir, {cwd: null, file_filter: []});

		expect(result.map((f) => f.path).sort()).toEqual(['a.txt', 'b.txt']);

		await rm(dir, {recursive: true});
	});

	test('include_directories adds directories to results', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'file.txt'), 'file');
		await mkdir(join(dir, 'subdir'));
		await writeFile(join(dir, 'subdir', 'nested.txt'), 'nested');

		const result = await fs_search(dir, {cwd: null, include_directories: true});

		const paths = result.map((f) => f.path).sort();
		expect(paths).toEqual(['file.txt', 'subdir', 'subdir/nested.txt']);

		const subdir_entry = result.find((f) => f.path === 'subdir');
		expect(subdir_entry?.is_directory).toBe(true);

		await rm(dir, {recursive: true});
	});

	test('custom sort function', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'a.txt'), 'a');
		await writeFile(join(dir, 'b.txt'), 'b');
		await writeFile(join(dir, 'c.txt'), 'c');

		const result = await fs_search(dir, {
			cwd: null,
			sort: (a, b) => b.path.localeCompare(a.path),
		});

		expect(result.map((f) => f.path)).toEqual(['c.txt', 'b.txt', 'a.txt']);

		await rm(dir, {recursive: true});
	});

	test('sort false disables sorting', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'z.txt'), 'z');
		await writeFile(join(dir, 'a.txt'), 'a');
		await writeFile(join(dir, 'm.txt'), 'm');

		const result = await fs_search(dir, {cwd: null, sort: false});

		expect(result.map((f) => f.path).sort()).toEqual(['a.txt', 'm.txt', 'z.txt']);

		await rm(dir, {recursive: true});
	});

	test('sort null disables sorting', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'z.txt'), 'z');
		await writeFile(join(dir, 'a.txt'), 'a');

		const result = await fs_search(dir, {cwd: null, sort: null});

		expect(result.map((f) => f.path).sort()).toEqual(['a.txt', 'z.txt']);

		await rm(dir, {recursive: true});
	});

	test('id contains full path', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'file.txt'), 'content');
		await mkdir(join(dir, 'sub'));
		await writeFile(join(dir, 'sub', 'nested.txt'), 'nested');

		const result = await fs_search(dir, {cwd: null});

		const file = result.find((f) => f.path === 'file.txt');
		const nested = result.find((f) => f.path === 'sub/nested.txt');

		expect(file?.id).toBe(join(dir, 'file.txt'));
		expect(nested?.id).toBe(join(dir, 'sub', 'nested.txt'));

		await rm(dir, {recursive: true});
	});

	test('directory id ends with slash', async () => {
		const dir = await create_temp_dir();
		await mkdir(join(dir, 'subdir'));
		await writeFile(join(dir, 'subdir', 'file.txt'), 'content');

		const result = await fs_search(dir, {cwd: null, include_directories: true});

		const subdir = result.find((f) => f.path === 'subdir');
		expect(subdir?.id.endsWith('/')).toBe(true);

		await rm(dir, {recursive: true});
	});

	test('finds hidden files', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, '.hidden'), 'hidden');
		await writeFile(join(dir, 'visible.txt'), 'visible');

		const result = await fs_search(dir, {cwd: null});

		expect(result.map((f) => f.path).sort()).toEqual(['.hidden', 'visible.txt']);

		await rm(dir, {recursive: true});
	});

	test('cwd resolves relative paths', async () => {
		const dir = await create_temp_dir();
		const subdir = join(dir, 'mysubdir');
		await mkdir(subdir);
		await writeFile(join(subdir, 'file.txt'), 'content');

		const result = await fs_search('mysubdir', {cwd: dir});

		expect(result.map((f) => f.path)).toEqual(['file.txt']);

		await rm(dir, {recursive: true});
	});

	test('absolute path ignores cwd', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'file.txt'), 'content');

		const result = await fs_search(dir, {cwd: '/some/other/path'});

		expect(result.map((f) => f.path)).toEqual(['file.txt']);

		await rm(dir, {recursive: true});
	});

	test('handles symlinks to files', async () => {
		const dir = await create_temp_dir();
		const target = join(dir, 'target.txt');
		const link = join(dir, 'link.txt');
		await writeFile(target, 'target');
		await symlink(target, link);

		const result = await fs_search(dir, {cwd: null});

		expect(result.map((f) => f.path).sort()).toEqual(['link.txt', 'target.txt']);

		await rm(dir, {recursive: true});
	});

	test('handles filenames with spaces and special characters', async () => {
		const dir = await create_temp_dir();
		await writeFile(join(dir, 'file with spaces.txt'), 'spaces');
		await writeFile(join(dir, 'special@#$.txt'), 'special');

		const result = await fs_search(dir, {cwd: null});

		expect(result.map((f) => f.path).sort()).toEqual(['file with spaces.txt', 'special@#$.txt']);

		await rm(dir, {recursive: true});
	});

	test('deeply nested directories', async () => {
		const dir = await create_temp_dir();
		const deep = join(dir, 'a', 'b', 'c', 'd', 'e');
		await mkdir(deep, {recursive: true});
		await writeFile(join(deep, 'deep.txt'), 'deep');

		const result = await fs_search(dir, {cwd: null});

		expect(result.map((f) => f.path)).toEqual(['a/b/c/d/e/deep.txt']);

		await rm(dir, {recursive: true});
	});
});
