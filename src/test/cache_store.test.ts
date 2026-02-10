import {describe, test, expect} from 'vitest';
import {mkdir, rm, writeFile, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

import {create_cache_store} from '$lib/cache_store.js';

const create_tmp_dir = async (): Promise<string> => {
	const dir = join(
		tmpdir(),
		'fuz_util_test_cache_' + Date.now() + '_' + Math.random().toString(36).slice(2),
	);
	await mkdir(dir, {recursive: true});
	return dir;
};

interface TestCache {
	version: string;
	count: number;
	items: Array<string>;
}

const validate_test_cache = (data: unknown): TestCache | null => {
	if (
		data != null &&
		typeof data === 'object' &&
		'version' in data &&
		'count' in data &&
		'items' in data
	) {
		return data as TestCache;
	}
	return null;
};

const fresh_test_cache = (): TestCache => ({version: '1', count: 0, items: []});

describe('create_cache_store', () => {
	describe('loading', () => {
		test('returns fresh data when no cache file exists', async () => {
			const dir = await create_tmp_dir();
			const store = await create_cache_store({
				path: join(dir, 'cache.json'),
				validate: validate_test_cache,
				fresh_data: fresh_test_cache,
			});

			expect(store.data).toEqual({version: '1', count: 0, items: []});

			await rm(dir, {recursive: true, force: true});
		});

		test('loads existing valid cache', async () => {
			const dir = await create_tmp_dir();
			const path = join(dir, 'cache.json');
			const cached: TestCache = {version: '1', count: 5, items: ['a', 'b']};
			await writeFile(path, JSON.stringify(cached, null, '\t'));

			const store = await create_cache_store({
				path,
				validate: validate_test_cache,
				fresh_data: fresh_test_cache,
			});

			expect(store.data.count).toBe(5);
			expect(store.data.items).toEqual(['a', 'b']);

			await rm(dir, {recursive: true, force: true});
		});

		test('handles corrupted cache file', async () => {
			const dir = await create_tmp_dir();
			const path = join(dir, 'cache.json');
			await writeFile(path, 'not valid json!!!');

			const store = await create_cache_store({
				path,
				validate: validate_test_cache,
				fresh_data: fresh_test_cache,
			});

			expect(store.data).toEqual(fresh_test_cache());

			await rm(dir, {recursive: true, force: true});
		});

		test('handles validation failure', async () => {
			const dir = await create_tmp_dir();
			const path = join(dir, 'cache.json');
			await writeFile(path, JSON.stringify({wrong: 'shape'}));

			const store = await create_cache_store({
				path,
				validate: validate_test_cache,
				fresh_data: fresh_test_cache,
			});

			expect(store.data).toEqual(fresh_test_cache());

			await rm(dir, {recursive: true, force: true});
		});
	});

	describe('version checking', () => {
		test('accepts matching version', async () => {
			const dir = await create_tmp_dir();
			const path = join(dir, 'cache.json');
			const cached: TestCache = {version: '1', count: 10, items: []};
			await writeFile(path, JSON.stringify(cached));

			const store = await create_cache_store({
				path,
				validate: validate_test_cache,
				fresh_data: fresh_test_cache,
				version: '1',
			});

			expect(store.data.count).toBe(10);

			await rm(dir, {recursive: true, force: true});
		});

		test('rejects mismatched version', async () => {
			const dir = await create_tmp_dir();
			const path = join(dir, 'cache.json');
			const cached: TestCache = {version: '1', count: 10, items: []};
			await writeFile(path, JSON.stringify(cached));

			const store = await create_cache_store({
				path,
				validate: validate_test_cache,
				fresh_data: fresh_test_cache,
				version: '2',
			});

			expect(store.data).toEqual(fresh_test_cache());

			await rm(dir, {recursive: true, force: true});
		});
	});

	describe('save', () => {
		test('writes data to disk', async () => {
			const dir = await create_tmp_dir();
			const path = join(dir, 'cache.json');

			const store = await create_cache_store({
				path,
				validate: validate_test_cache,
				fresh_data: fresh_test_cache,
			});

			store.data.count = 42;
			store.data.items.push('new');

			const result = await store.save();
			expect(result.ok).toBe(true);
			if (result.ok) expect(result.value).toBe(true);

			// Verify written data
			const raw = await readFile(path, 'utf8');
			const parsed = JSON.parse(raw);
			expect(parsed.count).toBe(42);
			expect(parsed.items).toEqual(['new']);

			await rm(dir, {recursive: true, force: true});
		});

		test('skips write when data unchanged', async () => {
			const dir = await create_tmp_dir();
			const path = join(dir, 'cache.json');
			const cached: TestCache = {version: '1', count: 5, items: ['a']};
			await writeFile(path, JSON.stringify(cached, null, '\t'));

			const store = await create_cache_store({
				path,
				validate: validate_test_cache,
				fresh_data: fresh_test_cache,
			});

			// Don't modify data
			const result = await store.save();
			expect(result.ok).toBe(true);
			if (result.ok) expect(result.value).toBe(false);

			await rm(dir, {recursive: true, force: true});
		});

		test('creates parent directory on save', async () => {
			const dir = await create_tmp_dir();
			const path = join(dir, 'nested', 'deep', 'cache.json');

			const store = await create_cache_store({
				path,
				validate: validate_test_cache,
				fresh_data: fresh_test_cache,
			});

			store.data.count = 1;
			const result = await store.save();
			expect(result.ok).toBe(true);

			const raw = await readFile(path, 'utf8');
			expect(JSON.parse(raw).count).toBe(1);

			await rm(dir, {recursive: true, force: true});
		});

		test('detects further changes after first save', async () => {
			const dir = await create_tmp_dir();
			const path = join(dir, 'cache.json');

			const store = await create_cache_store({
				path,
				validate: validate_test_cache,
				fresh_data: fresh_test_cache,
			});

			store.data.count = 1;
			const r1 = await store.save();
			expect(r1.ok).toBe(true);
			if (r1.ok) expect(r1.value).toBe(true);

			// No change
			const r2 = await store.save();
			expect(r2.ok).toBe(true);
			if (r2.ok) expect(r2.value).toBe(false);

			// Another change
			store.data.count = 2;
			const r3 = await store.save();
			expect(r3.ok).toBe(true);
			if (r3.ok) expect(r3.value).toBe(true);

			await rm(dir, {recursive: true, force: true});
		});
	});

	describe('custom serialize/deserialize', () => {
		test('uses custom serializer and deserializer', async () => {
			const dir = await create_tmp_dir();
			const path = join(dir, 'cache.json');

			// Store a Map as array of entries
			type MapData = Map<string, number>;
			const store = await create_cache_store<MapData>({
				path,
				validate: (data) => (data instanceof Map ? data : null),
				fresh_data: () => new Map(),
				serialize: (data) => JSON.stringify(Array.from(data.entries())),
				deserialize: (raw) => new Map(JSON.parse(raw)),
			});

			store.data.set('a', 1);
			store.data.set('b', 2);
			await store.save();

			// Reload and verify
			const store2 = await create_cache_store<MapData>({
				path,
				validate: (data) => (data instanceof Map ? data : null),
				fresh_data: () => new Map(),
				serialize: (data) => JSON.stringify(Array.from(data.entries())),
				deserialize: (raw) => new Map(JSON.parse(raw)),
			});

			expect(store2.data.get('a')).toBe(1);
			expect(store2.data.get('b')).toBe(2);

			await rm(dir, {recursive: true, force: true});
		});
	});

	test('path property matches input', async () => {
		const dir = await create_tmp_dir();
		const path = join(dir, 'cache.json');

		const store = await create_cache_store({
			path,
			validate: validate_test_cache,
			fresh_data: fresh_test_cache,
		});

		expect(store.path).toBe(path);

		await rm(dir, {recursive: true, force: true});
	});
});
