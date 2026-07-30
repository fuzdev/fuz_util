import { test, assert } from 'vitest';

import { UnreachableError, unreachable } from '$lib/error.ts';

const custom_message = 'Custom message';

test('UnreachableError is an Error', () => {
	const error = new UnreachableError('test' as never);
	assert.instanceOf(error, Error);
	assert.ok(error instanceof UnreachableError);
});

test('UnreachableError accepts custom message', () => {
	const error = new UnreachableError('test' as never, custom_message);
	assert.strictEqual(error.message, custom_message);
});

test('UnreachableError requires never type parameter', () => {
	// @ts-expect-error
	new UnreachableError('test'); // eslint-disable-line no-new
});

test('unreachable helper throws UnreachableError', () => {
	let caught_error: unknown;

	try {
		unreachable('test' as never);
	} catch (error) {
		caught_error = error;
	}

	assert.ok(caught_error instanceof UnreachableError);
});

test('unreachable helper with custom message', () => {
	let caught_error: unknown;

	try {
		unreachable('test' as never, custom_message);
	} catch (error) {
		caught_error = error;
	}

	assert.ok(caught_error instanceof UnreachableError);
	assert.strictEqual(caught_error.message, custom_message);
});

test('unreachable helper requires never type parameter', () => {
	assert.throws(() => {
		// @ts-expect-error
		unreachable('test');
	});
});
