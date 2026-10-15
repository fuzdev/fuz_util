import { test, assert } from 'vitest';
import * as s from '@fuzdev/fuz_schema/schema.ts';

import { format_url, Url } from '#lib/url.ts';

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

test('`Url` accepts what `URL` parses', () => {
	for (const value of [
		'https://fuz.dev/',
		'http:fuz.dev',
		'mailto:a@b.co',
		'git+https://github.com/fuzdev/fuz_util.git',
		'github:fuzdev/fuz_util'
	]) {
		assert.ok(s.parse(Url, value).ok, value);
	}
	// `URL` strips only ASCII whitespace and controls, so other padding is refused
	for (const value of ['', 'fuz.dev', '/path', 'not a url', '\u00a0https://fuz.dev', 1, null]) {
		assert.ok(!s.parse(Url, value).ok, String(value));
	}
});

test('`Url` returns the text unchanged, without trimming or normalizing it', () => {
	for (const value of [
		' https://fuz.dev/ ',
		'\thttps://fuz.dev/\n',
		'https://fu\tz.dev',
		'HTTPS://FUZ.DEV'
	]) {
		const parsed = s.parse(Url, value);
		assert.ok(parsed.ok);
		assert.strictEqual(parsed.value, value);
	}
});
