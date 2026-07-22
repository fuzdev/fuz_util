import { describe, test, assert } from 'vitest';
import { randomUUID } from 'node:crypto';

import { is_uuid, create_client_id_creator, create_uuid, Uuid, UuidWithDefault } from '$lib/id.ts';

describe('is_uuid', () => {
	test('basic behavior', () => {
		assert.ok(is_uuid(randomUUID()));
		assert.ok(is_uuid('f81d4fae-7dec-11d0-a765-00a0c91e6bf6'));
		assert.strictEqual(is_uuid('g81d4fae-7dec-11d0-a765-00a0c91e6bf6'), false);
		assert.strictEqual(is_uuid(''), false);
		assert.strictEqual(is_uuid(null!), false);
		assert.strictEqual(is_uuid(undefined!), false);

		// See the implementation's comments for why the namespace syntax is not supported.
		assert.strictEqual(is_uuid('urn:uuid:f81d4fae-7dec-11d0-a765-00a0c91e6bf6'), false);
	});
});

describe('create_uuid', () => {
	test('returns a syntactically valid UUID', () => {
		const id = create_uuid();
		assert.ok(is_uuid(id));
	});

	test('returns distinct values across calls', () => {
		assert.notEqual(create_uuid(), create_uuid());
	});

	test('round-trips through the Uuid schema', () => {
		const id = create_uuid();
		assert.equal(Uuid.parse(id), id);
	});
});

describe('Uuid schema', () => {
	test('parses a valid UUID', () => {
		const value = 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6';
		assert.equal(Uuid.parse(value), value);
	});

	test('rejects a malformed UUID', () => {
		assert.equal(Uuid.safeParse('not-a-uuid').success, false);
		assert.equal(Uuid.safeParse('').success, false);
	});

	test('rejects non-string input', () => {
		assert.equal(Uuid.safeParse(123).success, false);
		assert.equal(Uuid.safeParse(null).success, false);
		assert.equal(Uuid.safeParse(undefined).success, false);
	});
});

describe('UuidWithDefault schema', () => {
	test('produces a valid UUID when no value is supplied', () => {
		const result = UuidWithDefault.parse(undefined);
		assert.ok(is_uuid(result));
	});

	test('preserves an explicit value', () => {
		const value = 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6';
		assert.equal(UuidWithDefault.parse(value), value);
	});

	test('rejects an explicit invalid value', () => {
		assert.equal(UuidWithDefault.safeParse('nope').success, false);
	});

	test('produces distinct defaults across parses', () => {
		assert.notEqual(UuidWithDefault.parse(undefined), UuidWithDefault.parse(undefined));
	});
});

describe('create_client_id_creator', () => {
	test('basic behavior', () => {
		const toClientId = create_client_id_creator('abc');
		assert.strictEqual(toClientId(), 'abc_0');
		assert.strictEqual(toClientId(), 'abc_1');
		assert.strictEqual(toClientId(), 'abc_2');
	});

	test('custom count', () => {
		const toClientId = create_client_id_creator('abc', 1);
		assert.strictEqual(toClientId(), 'abc_1');
		assert.strictEqual(toClientId(), 'abc_2');
		assert.strictEqual(toClientId(), 'abc_3');
	});

	test('custom separator', () => {
		const toClientId = create_client_id_creator('abc', undefined, '');
		assert.strictEqual(toClientId(), 'abc0');
		assert.strictEqual(toClientId(), 'abc1');
		assert.strictEqual(toClientId(), 'abc2');
	});
});
