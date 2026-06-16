import {describe, test, assert} from 'vitest';

import {Datetime, DatetimeNow, get_datetime_now} from '$lib/datetime.ts';

describe('get_datetime_now', () => {
	test('returns a value parseable by the Datetime schema', () => {
		const now = get_datetime_now();
		assert.equal(Datetime.parse(now), now);
	});

	test('reflects the current time within a small tolerance', () => {
		const before = Date.now();
		const now = get_datetime_now();
		const after = Date.now();
		const t = new Date(now).getTime();
		assert.ok(t >= before && t <= after, `${t} not in [${before}, ${after}]`);
	});

	test('returns distinct values when system time advances', async () => {
		const a = get_datetime_now();
		await new Promise((resolve) => setTimeout(resolve, 5));
		const b = get_datetime_now();
		assert.notEqual(a, b);
	});
});

describe('Datetime schema', () => {
	test('parses a canonical ISO 8601 datetime', () => {
		const value = '2024-01-02T03:04:05.678Z';
		assert.equal(Datetime.parse(value), value);
	});

	test('rejects malformed datetimes', () => {
		assert.equal(Datetime.safeParse('not a datetime').success, false);
		assert.equal(Datetime.safeParse('2024-01-02').success, false);
		assert.equal(Datetime.safeParse('').success, false);
	});

	test('rejects non-string input', () => {
		assert.equal(Datetime.safeParse(0).success, false);
		assert.equal(Datetime.safeParse(null).success, false);
		assert.equal(Datetime.safeParse(undefined).success, false);
	});
});

describe('DatetimeNow schema', () => {
	test('produces a valid datetime when no value is supplied', () => {
		const result = DatetimeNow.parse(undefined);
		assert.equal(Datetime.parse(result), result);
	});

	test('preserves an explicit value', () => {
		const value = '2024-01-02T03:04:05.678Z';
		assert.equal(DatetimeNow.parse(value), value);
	});

	test('rejects an explicit invalid value', () => {
		assert.equal(DatetimeNow.safeParse('nope').success, false);
	});
});
