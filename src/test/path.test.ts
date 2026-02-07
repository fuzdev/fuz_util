import {test, assert, describe} from 'vitest';

import {
	parse_path_parts,
	parse_path_pieces,
	parse_path_segments,
	should_exclude_path,
	slugify,
	to_file_path,
} from '$lib/path.ts';

test('to_file_path', () => {
	assert.strictEqual(to_file_path('/foo/bar/baz.ts'), '/foo/bar/baz.ts');
	assert.strictEqual(to_file_path('./foo/bar.ts'), './foo/bar.ts');
	assert.strictEqual(to_file_path('foo.ts'), 'foo.ts');
	assert.strictEqual(to_file_path(''), '');
	assert.strictEqual(to_file_path(new URL('file:///foo/bar/baz.ts')), '/foo/bar/baz.ts');
	assert.strictEqual(to_file_path(new URL('file:///foo/bar%20baz.ts')), '/foo/bar baz.ts');
});

test('parse_path_parts', () => {
	assert.deepEqual(parse_path_parts('/foo/bar/baz/'), ['/foo', '/foo/bar', '/foo/bar/baz']);
	assert.deepEqual(parse_path_parts('./foo/bar/baz.ts'), ['foo', 'foo/bar', 'foo/bar/baz.ts']);
	assert.deepEqual(parse_path_parts('foo/bar/baz.ts'), ['foo', 'foo/bar', 'foo/bar/baz.ts']);
	assert.deepEqual(parse_path_parts('foo/bar/baz/'), ['foo', 'foo/bar', 'foo/bar/baz']);
	assert.deepEqual(parse_path_parts('foo'), ['foo']);
	assert.deepEqual(parse_path_parts('/foo'), ['/foo']);
	assert.deepEqual(parse_path_parts('/'), []);
	assert.deepEqual(parse_path_parts(''), []);
});

test('parse_path_segments', () => {
	assert.deepEqual(parse_path_segments('/foo/bar/baz.ts'), ['foo', 'bar', 'baz.ts']);
	assert.deepEqual(parse_path_segments('./foo/bar/baz.ts'), ['foo', 'bar', 'baz.ts']);
	assert.deepEqual(parse_path_segments('foo/bar/baz.ts'), ['foo', 'bar', 'baz.ts']);
	assert.deepEqual(parse_path_segments('foo/bar/baz/'), ['foo', 'bar', 'baz']);
	assert.deepEqual(parse_path_segments('../foo/bar'), ['foo', 'bar']);
	assert.deepEqual(parse_path_segments('/'), []);
	assert.deepEqual(parse_path_segments(''), []);
});

test('parse_path_pieces', () => {
	assert.deepEqual(parse_path_pieces('/foo/bar/baz/'), [
		{type: 'separator', path: '/'},
		{type: 'piece', name: 'foo', path: '/foo'},
		{type: 'separator', path: '/foo'},
		{type: 'piece', name: 'bar', path: '/foo/bar'},
		{type: 'separator', path: '/foo/bar'},
		{type: 'piece', name: 'baz', path: '/foo/bar/baz'},
	]);
	assert.deepEqual(parse_path_pieces('./foo'), [
		{type: 'separator', path: '/'},
		{type: 'piece', name: 'foo', path: '/foo'},
	]);
	assert.deepEqual(parse_path_pieces('foo'), [
		{type: 'separator', path: '/'},
		{type: 'piece', name: 'foo', path: '/foo'},
	]);
	assert.deepEqual(parse_path_pieces('/'), []);
	assert.deepEqual(parse_path_pieces(''), []);
});

describe('should_exclude_path', () => {
	test('returns false when filename is undefined', () => {
		assert.equal(should_exclude_path(undefined, ['foo']), false);
	});

	test('returns false when filename is empty string', () => {
		assert.equal(should_exclude_path('', ['anything']), false);
	});

	test('returns false when exclude list is empty', () => {
		assert.equal(should_exclude_path('src/Foo.svelte', []), false);
	});

	test('matches string pattern as substring', () => {
		assert.equal(should_exclude_path('src/routes/page.svelte', ['routes/']), true);
	});

	test('returns false when string pattern does not match', () => {
		assert.equal(should_exclude_path('src/lib/Mdz.svelte', ['routes/']), false);
	});

	test('matches regex pattern', () => {
		assert.equal(should_exclude_path('Test.svelte', [/Test\.svelte$/]), true);
	});

	test('returns false when regex does not match', () => {
		assert.equal(should_exclude_path('Other.svelte', [/Test\.svelte$/]), false);
	});

	test('matches second pattern when first does not match', () => {
		assert.equal(should_exclude_path('src/lib/Mdz.svelte', ['routes/', 'lib/']), true);
	});

	test('matches with mixed string and regex patterns', () => {
		assert.equal(should_exclude_path('src/Test.svelte', ['routes/', /Test\.svelte$/]), true);
	});
});

test('slugify', () => {
	assert.strictEqual(slugify('AB'), 'ab');
	assert.strictEqual(slugify('A B'), 'a-b');
	assert.strictEqual(slugify('a, b!'), 'a-b');
	assert.strictEqual(slugify("a's b"), 'as-b');
	assert.strictEqual(slugify('a--b'), 'a-b');
	assert.strictEqual(slugify('-a-----b-'), 'a-b');
	assert.strictEqual(slugify('a_b'), 'a_b');
	assert.strictEqual(slugify('a_ b'), 'a_-b');
	assert.strictEqual(slugify('a _ b'), 'a-_-b');
	assert.strictEqual(slugify('   a b    c   '), 'a-b-c');
	assert.strictEqual(slugify(''), '');
	assert.strictEqual(slugify('123'), '123');
	assert.strictEqual(slugify('foo-bar-123'), 'foo-bar-123');
	assert.strictEqual(slugify('ñoño', false), 'oo');
	assert.strictEqual(
		slugify(
			'ÁÄÂÀÃÅÆÞČÇĆĎĐÉĚËÈÊẼĔȆĞÍÌÎÏİŇÑÓÖÒÔÕØŘŔŠŞŤÚŮÜÙÛÝŸŽáäâàãåþčçćďđéěëèêẽĕȇğíìîïıňñóöòôõøðřŕšşßťúůüùûýÿž',
		),
		'aaaaaabcccddeeeeeeeegiiiiinnoooooorrsstuuuuuyyzaaaaaabcccddeeeeeeeegiiiiinnooooooorrssstuuuuuyyz',
	);
});
