import {describe, test, assert} from 'vitest';

import {
	string_is_binary,
	escape_js_string,
	plural,
	truncate,
	strip_start,
	strip_end,
	strip_after,
	strip_before,
	ensure_start,
	ensure_end,
	deindent,
	count_graphemes,
	strip_ansi,
	stringify,
	string_display_width,
	pad_width,
	levenshtein_distance,
} from '../lib/string.ts';

describe('truncate', () => {
	test('basic behavior', () => {
		assert.strictEqual(truncate('foobarbaz', 5), 'fo...');
	});

	test('no truncation needed', () => {
		assert.strictEqual(truncate('foobarbaz', 9), 'foobarbaz');
	});

	test('custom suffix', () => {
		assert.strictEqual(truncate('foobarbaz', 5, '-'), 'foob-');
	});

	test('no suffix', () => {
		assert.strictEqual(truncate('foobarbaz', 5, ''), 'fooba');
	});

	test('zero length', () => {
		assert.strictEqual(truncate('foobarbaz', 0), '');
	});

	test('zero length and no suffix', () => {
		assert.strictEqual(truncate('foobarbaz', 0, ''), '');
	});

	test('negative length', () => {
		assert.strictEqual(truncate('foobarbaz', -5), '');
	});

	test('length equal to suffix', () => {
		assert.strictEqual(truncate('foobarbaz', 2, '..'), '..');
	});

	test('length shorter than suffix returns empty string', () => {
		assert.strictEqual(truncate('foobarbaz', 2, '...'), '');
	});
});

describe('strip_start', () => {
	test('basic behavior', () => {
		assert.strictEqual(strip_start('foobar', 'foo'), 'bar');
	});

	test('single character', () => {
		assert.strictEqual(strip_start('foobar', 'f'), 'oobar');
	});

	test('single character of multiple', () => {
		assert.strictEqual(strip_start('ffoobar', 'f'), 'foobar');
	});

	test('noop for partial match', () => {
		assert.strictEqual(strip_start('foobar', 'fob'), 'foobar');
	});

	test('noop for matching end but not start', () => {
		assert.strictEqual(strip_start('foobar', 'bar'), 'foobar');
	});

	test('noop for empty string', () => {
		assert.strictEqual(strip_start('foobar', ''), 'foobar');
	});
});

describe('strip_end', () => {
	test('basic behavior', () => {
		assert.strictEqual(strip_end('foobar', 'bar'), 'foo');
	});

	test('single character', () => {
		assert.strictEqual(strip_end('foobar', 'r'), 'fooba');
	});

	test('single character of multiple', () => {
		assert.strictEqual(strip_end('foobarr', 'r'), 'foobar');
	});

	test('noop for partial match', () => {
		assert.strictEqual(strip_end('foobar', 'oar'), 'foobar');
	});

	test('noop for matching start but not end', () => {
		assert.strictEqual(strip_end('foobar', 'foo'), 'foobar');
	});

	test('noop for empty string', () => {
		assert.strictEqual(strip_end('foobar', ''), 'foobar');
	});
});

describe('strip_after', () => {
	test('basic behavior', () => {
		assert.strictEqual(strip_after('foobar', 'oo'), 'f');
	});

	test('starting characters', () => {
		assert.strictEqual(strip_after('foobar', 'foo'), '');
	});

	test('ending characters', () => {
		assert.strictEqual(strip_after('foobar', 'bar'), 'foo');
	});

	test('single character', () => {
		assert.strictEqual(strip_after('foobar', 'b'), 'foo');
	});

	test('first of many characters', () => {
		assert.strictEqual(strip_after('foobar', 'o'), 'f');
	});

	test('strips after first character', () => {
		assert.strictEqual(strip_after('foobar', 'f'), '');
	});

	test('strips last character', () => {
		assert.strictEqual(strip_after('foobar', 'r'), 'fooba');
	});

	test('noop for missing character', () => {
		assert.strictEqual(strip_after('foobar', 'x'), 'foobar');
	});

	test('noop for partial match', () => {
		assert.strictEqual(strip_after('foobar', 'bo'), 'foobar');
	});

	test('empty string', () => {
		assert.strictEqual(strip_after('foobar', ''), 'foobar');
	});
});

describe('strip_before', () => {
	test('basic behavior', () => {
		assert.strictEqual(strip_before('foobar', 'oo'), 'bar');
	});

	test('starting characters', () => {
		assert.strictEqual(strip_before('foobar', 'foo'), 'bar');
	});

	test('ending characters', () => {
		assert.strictEqual(strip_before('foobar', 'bar'), '');
	});

	test('single character', () => {
		assert.strictEqual(strip_before('foobar', 'b'), 'ar');
	});

	test('first of many characters', () => {
		assert.strictEqual(strip_before('foobar', 'o'), 'obar');
	});

	test('strips after first character', () => {
		assert.strictEqual(strip_before('foobar', 'f'), 'oobar');
	});

	test('strips last character', () => {
		assert.strictEqual(strip_before('foobar', 'r'), '');
	});

	test('noop for missing character', () => {
		assert.strictEqual(strip_before('foobar', 'x'), 'foobar');
	});

	test('noop for partial match', () => {
		assert.strictEqual(strip_before('foobar', 'bo'), 'foobar');
	});

	test('empty string', () => {
		assert.strictEqual(strip_before('foobar', ''), 'foobar');
	});
});

describe('ensure_start', () => {
	test('basic behavior', () => {
		assert.strictEqual(ensure_start('foobar', 'food'), 'foodfoobar');
	});

	test('existing text', () => {
		assert.strictEqual(ensure_start('foobar', 'foo'), 'foobar');
	});

	test('existing character', () => {
		assert.strictEqual(ensure_start('foobar', 'f'), 'foobar');
	});

	test('second character', () => {
		assert.strictEqual(ensure_start('foobar', 'o'), 'ofoobar');
	});

	test('empty string', () => {
		assert.strictEqual(ensure_start('foobar', ''), 'foobar');
	});

	test('whole string', () => {
		assert.strictEqual(ensure_start('foobar', 'foobar'), 'foobar');
	});

	test('whole string plus a start character', () => {
		assert.strictEqual(ensure_start('foobar', 'xfoobar'), 'xfoobarfoobar');
	});

	test('whole string plus an end character', () => {
		assert.strictEqual(ensure_start('foobar', 'foobarx'), 'foobarxfoobar');
	});

	test('empty strings', () => {
		assert.strictEqual(ensure_start('', ''), '');
	});

	test('empty source string', () => {
		assert.strictEqual(ensure_start('', 'foo'), 'foo');
	});
});

describe('ensure_end', () => {
	test('basic behavior', () => {
		assert.strictEqual(ensure_end('foobar', 'abar'), 'foobarabar');
	});

	test('existing text', () => {
		assert.strictEqual(ensure_end('foobar', 'bar'), 'foobar');
	});

	test('existing character', () => {
		assert.strictEqual(ensure_end('foobar', 'r'), 'foobar');
	});

	test('second to last character', () => {
		assert.strictEqual(ensure_end('foobar', 'a'), 'foobara');
	});

	test('empty string', () => {
		assert.strictEqual(ensure_end('foobar', ''), 'foobar');
	});

	test('whole string', () => {
		assert.strictEqual(ensure_end('foobar', 'foobar'), 'foobar');
	});

	test('whole string plus a start character', () => {
		assert.strictEqual(ensure_end('foobar', 'xfoobar'), 'foobarxfoobar');
	});

	test('whole string plus an end character', () => {
		assert.strictEqual(ensure_end('foobar', 'foobarx'), 'foobarfoobarx');
	});

	test('empty strings', () => {
		assert.strictEqual(ensure_end('', ''), '');
	});

	test('empty source string', () => {
		assert.strictEqual(ensure_end('', 'foo'), 'foo');
	});
});

describe('deindent', () => {
	test('basic behavior', () => {
		assert.strictEqual(
			deindent(`
			hello
			world
				- nested
					- more
				- less
	`),
			`hello
world
- nested
- more
- less
`,
		);
	});

	test('single line', () => {
		assert.strictEqual(deindent('  hey'), 'hey');
	});

	test('strips trailing spaces', () => {
		assert.strictEqual(deindent('  hey  '), 'hey');
	});

	test('empty string', () => {
		assert.strictEqual(deindent(''), '');
	});

	test('no indentation', () => {
		assert.strictEqual(deindent('a\nb'), 'a\nb');
	});
});

describe('plural', () => {
	test('pluralizes 0', () => {
		assert.strictEqual(plural(0), 's');
	});

	test('pluralizes a positive float', () => {
		assert.strictEqual(plural(45.8), 's');
	});

	test('pluralizes a negative number', () => {
		assert.strictEqual(plural(-3), 's');
	});

	test('does not pluralize 1', () => {
		assert.strictEqual(plural(1), '');
	});

	test('undefined returns suffix', () => {
		assert.strictEqual(plural(undefined), 's');
	});

	test('null returns suffix', () => {
		assert.strictEqual(plural(null), 's');
	});
});

describe('count_graphemes', () => {
	test('counts graphemes of a string, where compound emoji are one grapheme', () => {
		assert.strictEqual(count_graphemes('👩‍👩‍👧‍👦'), 1);
		assert.strictEqual(count_graphemes('🙋‍♂️'), 1);
		assert.strictEqual(count_graphemes('👩‍👩‍👧‍👦🙋‍♂️👩‍👩‍👧‍👦'), 3);
		assert.strictEqual(count_graphemes('a👩‍👩‍👧‍👦5🙋‍♂️👩‍❤️‍💋‍👩~'), 6);
	});

	test('empty string', () => {
		assert.strictEqual(count_graphemes(''), 0);
	});

	test('simple ASCII', () => {
		assert.strictEqual(count_graphemes('abc'), 3);
	});
});

describe('strip_ansi', () => {
	test('counts graphemes of a string, where compound emoji are one grapheme', () => {
		assert.strictEqual(strip_ansi('\x1B[31mred text\x1B[0m'), 'red text');
		assert.strictEqual(
			strip_ansi(' \x1B[1;33;40m Yellow on black \x1B[0m '),
			'  Yellow on black  ',
		);
		assert.strictEqual(strip_ansi('/[39msrc[39m/'), '/src/');
	});
});

describe('string_display_width', () => {
	test('basic ASCII strings', () => {
		assert.strictEqual(string_display_width('hello'), 5);
		assert.strictEqual(string_display_width(''), 0);
		assert.strictEqual(string_display_width('a'), 1);
	});

	test('simple emoji take 2 columns', () => {
		assert.strictEqual(string_display_width('🐆'), 2);
		assert.strictEqual(string_display_width('🐇'), 2);
		assert.strictEqual(string_display_width('🐢'), 2);
		assert.strictEqual(string_display_width('🐌'), 2);
	});

	test('compound emoji (ZWJ sequences) take 2 columns', () => {
		// Family emoji is a ZWJ sequence but displays as one character
		assert.strictEqual(string_display_width('👨‍👩‍👧‍👦'), 2);
		// Man raising hand
		assert.strictEqual(string_display_width('🙋‍♂️'), 2);
	});

	test('mixed strings', () => {
		assert.strictEqual(string_display_width('abc🐆'), 5); // 3 + 2
		assert.strictEqual(string_display_width('🐆🐇'), 4); // 2 + 2
		assert.strictEqual(string_display_width('Task Name'), 9);
	});

	test('CJK characters take 2 columns', () => {
		assert.strictEqual(string_display_width('中'), 2);
		assert.strictEqual(string_display_width('日本'), 4);
	});

	test('tab characters take 4 columns', () => {
		assert.strictEqual(string_display_width('\t'), 4);
		assert.strictEqual(string_display_width('a\tb'), 6); // 1 + 4 + 1
		assert.strictEqual(string_display_width('\t\t'), 8);
	});

	test('newlines and other control characters have 0 width', () => {
		assert.strictEqual(string_display_width('\n'), 0);
		assert.strictEqual(string_display_width('hello\nworld'), 10); // 5 + 0 + 5
		assert.strictEqual(string_display_width('\r'), 0);
		assert.strictEqual(string_display_width('\x00'), 0); // NUL
	});

	test('ANSI escape codes are stripped (0 width)', () => {
		assert.strictEqual(string_display_width('\x1B[31mred\x1B[0m'), 3);
		assert.strictEqual(string_display_width('\x1B[1;33;40mhello\x1B[0m'), 5);
		assert.strictEqual(string_display_width('\x1B[31m🐆\x1B[0m'), 2);
	});

	test('only emoji', () => {
		assert.strictEqual(string_display_width('🐆🐇🐢'), 6);
	});
});

describe('pad_width', () => {
	test('left-align padding (default)', () => {
		assert.strictEqual(pad_width('foo', 6), 'foo   ');
		assert.strictEqual(pad_width('hello', 5), 'hello');
		assert.strictEqual(pad_width('hi', 4), 'hi  ');
	});

	test('right-align padding', () => {
		assert.strictEqual(pad_width('foo', 6, 'right'), '   foo');
		assert.strictEqual(pad_width('hello', 5, 'right'), 'hello');
		assert.strictEqual(pad_width('hi', 4, 'right'), '  hi');
	});

	test('handles strings longer than target width', () => {
		assert.strictEqual(pad_width('hello', 3), 'hello');
		assert.strictEqual(pad_width('hello', 3, 'right'), 'hello');
	});

	test('handles emoji (double-width characters)', () => {
		// 🐆 is 2 columns, so pad to 4 needs 2 more spaces
		assert.strictEqual(pad_width('🐆', 4), '🐆  ');
		assert.strictEqual(pad_width('🐆', 4, 'right'), '  🐆');
	});

	test('handles mixed content', () => {
		// 'a🐆' = 1 + 2 = 3 columns, pad to 5 needs 2 more
		assert.strictEqual(pad_width('a🐆', 5), 'a🐆  ');
	});

	test('empty string gets padded', () => {
		assert.strictEqual(pad_width('', 5), '     ');
		assert.strictEqual(pad_width('', 5, 'right'), '     ');
	});

	test('zero target width', () => {
		assert.strictEqual(pad_width('hello', 0), 'hello');
	});
});

describe('levenshtein_distance', () => {
	test('identical strings', () => {
		assert.strictEqual(levenshtein_distance('hello', 'hello'), 0);
		assert.strictEqual(levenshtein_distance('', ''), 0);
	});

	test('empty strings', () => {
		assert.strictEqual(levenshtein_distance('', 'hello'), 5);
		assert.strictEqual(levenshtein_distance('hello', ''), 5);
	});

	test('single character difference', () => {
		assert.strictEqual(levenshtein_distance('cat', 'bat'), 1); // substitution
		assert.strictEqual(levenshtein_distance('cat', 'cats'), 1); // insertion
		assert.strictEqual(levenshtein_distance('cats', 'cat'), 1); // deletion
	});

	test('multiple edits', () => {
		assert.strictEqual(levenshtein_distance('kitten', 'sitting'), 3);
		assert.strictEqual(levenshtein_distance('saturday', 'sunday'), 3);
	});

	test('completely different strings', () => {
		assert.strictEqual(levenshtein_distance('abc', 'xyz'), 3);
	});

	test('typo detection cases', () => {
		assert.strictEqual(levenshtein_distance('display', 'dispaly'), 2); // transposition
		assert.strictEqual(levenshtein_distance('opacity', 'opacty'), 1); // missing i
		assert.strictEqual(levenshtein_distance('hover', 'hvoer'), 2); // typo
	});

	test('case sensitive', () => {
		assert.strictEqual(levenshtein_distance('Hello', 'hello'), 1);
		assert.strictEqual(levenshtein_distance('ABC', 'abc'), 3);
	});

	test('single character strings', () => {
		assert.strictEqual(levenshtein_distance('a', 'b'), 1);
		assert.strictEqual(levenshtein_distance('a', 'a'), 0);
		assert.strictEqual(levenshtein_distance('a', ''), 1);
		assert.strictEqual(levenshtein_distance('', 'a'), 1);
	});
});

describe('stringify', () => {
	test('string', () => {
		assert.strictEqual(stringify('hello'), '"hello"');
	});

	test('number', () => {
		assert.strictEqual(stringify(42), '42');
		assert.strictEqual(stringify(3.14), '3.14');
		assert.strictEqual(stringify(0), '0');
	});

	test('boolean', () => {
		assert.strictEqual(stringify(true), 'true');
		assert.strictEqual(stringify(false), 'false');
	});

	test('null', () => {
		assert.strictEqual(stringify(null), 'null');
	});

	test('undefined', () => {
		assert.strictEqual(stringify(undefined), 'undefined');
	});

	test('bigint', () => {
		assert.strictEqual(stringify(42n), '42n');
		assert.strictEqual(stringify(0n), '0n');
		assert.strictEqual(stringify(-100n), '-100n');
	});

	test('object', () => {
		assert.strictEqual(stringify({a: 1}), '{"a":1}');
	});

	test('array', () => {
		assert.strictEqual(stringify([1, 2, 3]), '[1,2,3]');
	});

	test('symbol', () => {
		assert.strictEqual(stringify(Symbol('test')), 'Symbol(test)');
	});
});

describe('escape_js_string', () => {
	test('escapes single quotes', () => {
		assert.equal(escape_js_string("it's"), "it\\'s");
	});

	test('escapes backslashes', () => {
		assert.equal(escape_js_string('a\\b'), 'a\\\\b');
	});

	test('escapes newlines', () => {
		assert.equal(escape_js_string('line 1\nline 2'), 'line 1\\nline 2');
	});

	test('escapes carriage returns', () => {
		assert.equal(escape_js_string('line 1\rline 2'), 'line 1\\rline 2');
	});

	test('escapes mixed special characters', () => {
		assert.equal(escape_js_string("it's a\nnew\\day"), "it\\'s a\\nnew\\\\day");
	});

	test('returns empty string unchanged', () => {
		assert.equal(escape_js_string(''), '');
	});

	test('returns string without special chars unchanged', () => {
		assert.equal(escape_js_string('hello world'), 'hello world');
	});

	test('backslashes are escaped before quotes', () => {
		// Input: \'  (backslash then quote)
		// Expected: \\\' (escaped backslash then escaped quote)
		assert.equal(escape_js_string("\\'"), "\\\\\\'");
	});

	test('escapes CRLF line endings', () => {
		assert.equal(escape_js_string('a\r\nb'), 'a\\r\\nb');
	});

	test('escapes line separator U+2028', () => {
		assert.equal(escape_js_string('a\u2028b'), 'a\\u2028b');
	});

	test('escapes paragraph separator U+2029', () => {
		assert.equal(escape_js_string('a\u2029b'), 'a\\u2029b');
	});

	test('escapes mixed line terminators', () => {
		assert.equal(escape_js_string('\n\r\u2028\u2029'), '\\n\\r\\u2028\\u2029');
	});
});

describe('string_is_binary', () => {
	test('empty string is not binary', () => {
		assert.isFalse(string_is_binary(''));
	});

	test('plain text is not binary', () => {
		assert.isFalse(string_is_binary('hello world\nline two\n'));
	});

	test('string with null byte is binary', () => {
		assert.isTrue(string_is_binary('hello\0world'));
	});

	test('null byte at start is binary', () => {
		assert.isTrue(string_is_binary('\0rest of content'));
	});

	test('null byte at end is binary', () => {
		assert.isTrue(string_is_binary('content\0'));
	});

	test('checks only first 8KB', () => {
		const content = 'a'.repeat(8192) + '\0';
		assert.isFalse(string_is_binary(content));
	});

	test('null byte within first 8KB is detected', () => {
		const content = 'a'.repeat(8191) + '\0';
		assert.isTrue(string_is_binary(content));
	});
});
