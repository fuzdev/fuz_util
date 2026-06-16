import {test, assert} from 'vitest';

import {format_url} from '$lib/url.ts';

test('format_url', () => {
	assert.strictEqual(format_url('https://www.fuz.dev/'), 'fuz.dev');
	assert.strictEqual(format_url('www.fuz.dev/'), 'fuz.dev');
	assert.strictEqual(format_url('www.fuz.dev'), 'fuz.dev');
	assert.strictEqual(format_url('https://fuz.dev/'), 'fuz.dev');
	assert.strictEqual(format_url('https://fuz.dev'), 'fuz.dev');
	assert.strictEqual(format_url('fuz.dev'), 'fuz.dev');
	assert.strictEqual(format_url('http://fuz.dev'), 'http://fuz.dev'); // user-facing, so alert to the lack of security
	assert.strictEqual(format_url('/'), '');
});
