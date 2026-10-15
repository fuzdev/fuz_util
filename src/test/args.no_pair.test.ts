import { describe, test, assert } from 'vitest';
import * as s from '@fuzdev/fuz_schema/schema.ts';
import { meta } from '@fuzdev/fuz_schema/meta.ts';

import { args_parse, args_serialize, argv_parse, type Args } from '#lib/args.ts';

const Args = s.object({
	_: s.with_default_fn(s.array(s.string), () => []),
	color: meta(s.with_default(s.boolean, true), { aliases: ['c'] }),
	'no-color': meta(s.with_default(s.boolean, false), { aliases: ['C'] })
});

// parses `argv` and returns the pair, asserting the two sides agree
const parse_pair = (argv: Array<string>): { color: boolean; 'no-color': boolean } => {
	const parsed = args_parse(argv_parse(argv), Args);
	assert.ok(parsed.ok, JSON.stringify(parsed));
	const { color, 'no-color': no_color } = parsed.value as Record<string, unknown>;
	assert.strictEqual(color, !no_color, `${argv.join(' ')} gives both sides the same value`);
	return { color: color as boolean, 'no-color': no_color as boolean };
};

describe('args_parse with a `no-` pair given both ways', () => {
	// [argv, the `color` the last one given sets]
	const cases: Array<[Array<string>, boolean]> = [
		// an alias of `no-color` and `color` itself
		[['-C', '--color'], true],
		[['--color', '-C'], false],
		// `--no-no-color` sets `no-color` to false, `--no-color` sets `color` to false
		[['--no-no-color', '--no-color'], false],
		[['--no-color', '--no-no-color'], true],
		// short-flag clusters of the two aliases
		[['-cC'], false],
		[['-Cc'], true],
		// a repeated flag counts where it was last given
		[['-C', '--color', '-C'], false],
		[['--color', '-C', '--color'], true],
		// the ways that never conflicted keep their results
		[['--no-color', '-C'], false],
		[['-C', '--no-color'], false],
		[['--color'], true],
		[['-C'], false],
		[[], true]
	];

	test.each(cases)('%j sets color to %s', (argv, color) => {
		assert.deepEqual(parse_pair(argv), { color, 'no-color': !color });
	});

	test('args from another parser resolve by key order', () => {
		const later_color = args_parse({ 'no-color': true, color: true }, Args);
		assert.ok(later_color.ok);
		assert.deepEqual(later_color.value, { _: [], color: true, 'no-color': false });
		const later_no_color = args_parse({ color: true, 'no-color': true }, Args);
		assert.ok(later_no_color.ok);
		assert.deepEqual(later_no_color.value, { _: [], color: false, 'no-color': true });
	});

	test('a key whose value is `undefined` counts as not given', () => {
		const parsed = args_parse({ 'no-color': true, color: undefined }, Args);
		assert.ok(parsed.ok);
		assert.deepEqual(parsed.value, { _: [], color: false, 'no-color': true });
	});

	test('an alias whose value is `undefined` counts as not given', () => {
		const parsed = args_parse({ color: false, C: undefined }, Args);
		assert.ok(parsed.ok);
		assert.deepEqual(parsed.value, { _: [], color: false, 'no-color': true });
	});

	test('a `no-x` keeps its default when neither side is given and `x` has none', () => {
		const Mixed = s.object({
			color: s.optional(s.boolean),
			'no-color': s.with_default(s.boolean, false)
		});
		const parsed = args_parse({}, Mixed);
		assert.ok(parsed.ok);
		assert.deepEqual({ ...parsed.value }, { 'no-color': false });
	});

	test('a pair given only as `undefined` stays unset', () => {
		const Optional = s.object({
			color: s.optional(s.boolean),
			'no-color': s.optional(s.boolean)
		});
		const parsed = args_parse({ color: undefined, 'no-color': undefined }, Optional);
		assert.ok(parsed.ok);
		assert.strictEqual(parsed.value.color, undefined);
		assert.strictEqual(parsed.value['no-color'], undefined);
	});
});

describe('argv_parse key order', () => {
	test('keys are in the order of their last appearance', () => {
		assert.deepEqual(Object.keys(argv_parse(['--b', '--a', '--b'])), ['_', 'a', 'b']);
		assert.deepEqual(Object.keys(argv_parse(['--b', '--no-a', '--no-b'])), ['_', 'a', 'b']);
		assert.deepEqual(Object.keys(argv_parse(['-ba', '-b'])), ['_', 'a', 'b']);
		assert.deepEqual(Object.keys(argv_parse(['-ba=1', '-b=2'])), ['_', 'a', 'b']);
		assert.deepEqual(Object.keys(argv_parse(['--b', '1', '--a', '--b', '2'])), ['_', 'a', 'b']);
		assert.deepEqual(Object.keys(argv_parse(['--b', '1', '--a', '--b=2', '--b', '3'])), [
			'_',
			'a',
			'b'
		]);
		assert.deepEqual(Object.keys(argv_parse(['--b', '1', '--b', '2', '--a', '--b', '3'])), [
			'_',
			'a',
			'b'
		]);
		assert.deepEqual(Object.keys(argv_parse(['-a', '-b', '-ac=1'])), ['_', 'b', 'a', 'c']);
	});

	test('a repeated value keeps its array', () => {
		const args = argv_parse(['--b', '1', '--a', '--b', '2', '--b', '3']);
		assert.deepEqual(args, { _: [], a: true, b: [1, 2, 3] });
	});
});

describe('args_serialize with a `no-` pair given both ways', () => {
	const cases: Array<[Args, Array<string>]> = [
		[{ color: true, 'no-color': true }, ['--no-color']],
		[{ 'no-color': true, color: true }, ['--color']],
		[{ 'no-color': true, color: false }, ['--no-color']],
		[{ color: true, 'no-color': false }, ['--color']]
	];

	test.each(cases)('%j serializes to %j', (args, expected) => {
		assert.deepEqual(args_serialize(args), expected);
	});

	test.each(cases)('%j parses the same after a round trip', (args) => {
		const direct = args_parse(args, Args);
		const round_trip = args_parse(argv_parse(args_serialize(args)), Args);
		assert.ok(direct.ok && round_trip.ok);
		assert.deepEqual(round_trip.value, direct.value);
	});

	test('a pair named after an `Object.prototype` member', () => {
		assert.deepEqual(args_serialize({ 'no-constructor': true }), ['--no-constructor']);
		assert.deepEqual(args_serialize({ 'no-toString': true }), ['--no-toString']);
	});
});
