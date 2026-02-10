import {describe, test, expect} from 'vitest';
import {mkdir, rm, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

import {create_fs_fetch_cache} from '$lib/fs_fetch_cache.js';
import type {FetchValueCacheItem} from '$lib/fetch.js';

const create_tmp_dir = async (): Promise<string> => {
	const dir = join(
		tmpdir(),
		'fuz_util_test_fetch_cache_' + Date.now() + '_' + Math.random().toString(36).slice(2),
	);
	await mkdir(dir, {recursive: true});
	return dir;
};

describe('create_fs_fetch_cache', () => {
	test('creates empty cache when no file exists', async () => {
		const dir = await create_tmp_dir();

		const cache = await create_fs_fetch_cache({name: 'test', dir});
		expect(cache.data.size).toBe(0);

		await rm(dir, {recursive: true, force: true});
	});

	test('saves and reloads cache data', async () => {
		const dir = await create_tmp_dir();

		const cache = await create_fs_fetch_cache({name: 'test', dir});

		const item: FetchValueCacheItem = {
			key: 'GET::https://example.com::null',
			url: 'https://example.com',
			params: null,
			value: {data: 'test response'},
			etag: '"abc123"',
			last_modified: null,
		};
		cache.data.set(item.key, item);

		const save_result = await cache.save();
		expect(save_result.ok).toBe(true);
		if (save_result.ok) expect(save_result.value).toBe(true);

		// Reload
		const cache2 = await create_fs_fetch_cache({name: 'test', dir});
		expect(cache2.data.size).toBe(1);
		expect(cache2.data.get(item.key)?.value).toEqual({data: 'test response'});
		expect(cache2.data.get(item.key)?.etag).toBe('"abc123"');

		await rm(dir, {recursive: true, force: true});
	});

	test('dirty tracking skips write when unchanged', async () => {
		const dir = await create_tmp_dir();

		const cache = await create_fs_fetch_cache({name: 'test', dir});
		cache.data.set('key', {
			key: 'key',
			url: 'url',
			params: null,
			value: 'val',
			etag: null,
			last_modified: null,
		});
		await cache.save();

		// Reload and save without changes
		const cache2 = await create_fs_fetch_cache({name: 'test', dir});
		const result = await cache2.save();
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe(false);

		await rm(dir, {recursive: true, force: true});
	});

	test('uses format function when provided', async () => {
		const dir = await create_tmp_dir();

		const cache = await create_fs_fetch_cache({
			name: 'test',
			dir,
			format: (content) => '/* formatted */\n' + content,
		});

		cache.data.set('k', {
			key: 'k',
			url: 'u',
			params: null,
			value: 'v',
			etag: null,
			last_modified: null,
		});
		await cache.save();

		const raw = await readFile(join(dir, 'test.json'), 'utf8');
		expect(raw.startsWith('/* formatted */')).toBe(true);

		await rm(dir, {recursive: true, force: true});
	});

	test('handles corrupted cache file', async () => {
		const dir = await create_tmp_dir();
		const {writeFile: wf} = await import('node:fs/promises');
		await wf(join(dir, 'test.json'), 'not valid json');

		const cache = await create_fs_fetch_cache({name: 'test', dir});
		expect(cache.data.size).toBe(0);

		await rm(dir, {recursive: true, force: true});
	});

	test('path matches expected location', async () => {
		const dir = await create_tmp_dir();

		const cache = await create_fs_fetch_cache({name: 'repos', dir});
		expect(cache.path).toBe(join(dir, 'repos.json'));

		await rm(dir, {recursive: true, force: true});
	});
});
