import { test, assert } from 'vitest';
import { SchemaError } from '@fuzdev/fuz_schema/schema.ts';

import {
	deserialize_cache,
	serialize_cache,
	to_fetch_value_cache_key,
	type FetchValueCache,
	type FetchValueCacheItem
} from '#lib/fetch.ts';

const item: FetchValueCacheItem = {
	key: 'POST::https://fuz.dev/::{"a":1}',
	url: 'https://fuz.dev/',
	params: { a: 1 },
	value: { b: [2] },
	etag: 'abc',
	last_modified: null
};

test('a cache survives `serialize_cache` and `deserialize_cache`', () => {
	const cache: FetchValueCache = new Map([[item.key, item]]);
	const deserialized = deserialize_cache(serialize_cache(cache));
	assert.deepEqual(deserialized, cache);
});

test('a GET without params survives `serialize_cache` and `deserialize_cache`', () => {
	const url = 'https://api.github.com/repos/fuzdev/fuz_util/pulls';
	const key = to_fetch_value_cache_key(url, undefined, 'GET');
	const get_item: FetchValueCacheItem = {
		key,
		url,
		params: undefined,
		value: [{ number: 1 }],
		etag: 'W/"abc"',
		last_modified: null
	};
	const deserialized = deserialize_cache(serialize_cache(new Map([[key, get_item]])));
	assert.deepEqual([...deserialized.keys()], [key]);
	const loaded = deserialized.get(key)!;
	assert.ok(!('params' in loaded)); // `JSON.stringify` drops the `undefined`
	assert.deepEqual(loaded.value, get_item.value);
});

test('an item whose `value` is `undefined` survives `serialize_cache` and `deserialize_cache`', () => {
	const cache: FetchValueCache = new Map([[item.key, { ...item, value: undefined }]]);
	const loaded = deserialize_cache(serialize_cache(cache)).get(item.key)!;
	assert.ok(!('value' in loaded)); // `JSON.stringify` drops the `undefined`
});

test('`deserialize_cache` loads a cache written by GETs, whose items have no `params` key', () => {
	const serialized = `[
	[
		"GET::https://api.github.com/repos/fuzdev/fuz_app/commits/main/check-runs",
		{
			"key": "GET::https://api.github.com/repos/fuzdev/fuz_app/commits/main/check-runs",
			"url": "https://api.github.com/repos/fuzdev/fuz_app/commits/main/check-runs",
			"value": {"status": "completed", "conclusion": "success"},
			"etag": "W/\\"2206d35a\\"",
			"last_modified": null
		}
	],
	[
		"GET::https://api.github.com/repos/fuzdev/fuz_app/pulls",
		{
			"key": "GET::https://api.github.com/repos/fuzdev/fuz_app/pulls",
			"url": "https://api.github.com/repos/fuzdev/fuz_app/pulls",
			"value": [],
			"etag": "W/\\"4f53cda1\\"",
			"last_modified": null
		}
	]
]`;
	const cache = deserialize_cache(serialized);
	assert.strictEqual(cache.size, 2);
	assert.deepEqual(cache.get('GET::https://api.github.com/repos/fuzdev/fuz_app/pulls')?.value, []);
});

test('`deserialize_cache` drops unknown keys of an item', () => {
	const deserialized = deserialize_cache(JSON.stringify([[item.key, { ...item, extra: 1 }]]));
	assert.deepEqual(deserialized.get(item.key), item);
});

test('`deserialize_cache` throws on an invalid key or item', () => {
	for (const entry of [
		[1, item],
		[item.key, { ...item, etag: 1 }],
		[item.key, { ...item, url: undefined }]
	]) {
		assert.throws(() => deserialize_cache(JSON.stringify([entry])), SchemaError);
	}
});

test('`deserialize_cache` names the cache key of an invalid item', () => {
	const serialized = JSON.stringify([
		['a', { ...item, key: 'a' }],
		['b', { ...item, key: 'b', etag: 1 }]
	]);
	let error;
	try {
		deserialize_cache(serialized);
	} catch (err) {
		error = err;
	}
	assert.ok(error instanceof SchemaError);
	assert.deepEqual(error.issues[0]!.path, ['b', 'etag']);
	assert.strictEqual(error.message, 'b.etag: expected string, received number');
});

test('`deserialize_cache` names the index of an entry whose key is invalid', () => {
	const serialized = JSON.stringify([
		['a', { ...item, key: 'a' }],
		[1, item]
	]);
	let error;
	try {
		deserialize_cache(serialized);
	} catch (err) {
		error = err;
	}
	assert.ok(error instanceof SchemaError);
	assert.deepEqual(error.issues[0]!.path, [1]);
});
