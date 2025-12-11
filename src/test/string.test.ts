import {describe, test, assert} from 'vitest';

import {
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
	string_display_width,
	pad_width,
} from '$lib/string.ts';

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
});

describe('count_graphemes', () => {
	test('counts graphemes of a string, where compound emoji are one grapheme', () => {
		assert.strictEqual(count_graphemes('👩‍👩‍👧‍👦'), 1);
		assert.strictEqual(count_graphemes('🙋‍♂️'), 1);
		assert.strictEqual(count_graphemes('👩‍👩‍👧‍👦🙋‍♂️👩‍👩‍👧‍👦'), 3);
		assert.strictEqual(count_graphemes('a👩‍👩‍👧‍👦5🙋‍♂️👩‍❤️‍💋‍👩~'), 6);
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
});
