import { describe, test, assert } from 'vitest';
import * as s from '@fuzdev/fuz_schema/schema.ts';
import { meta } from '@fuzdev/fuz_schema/meta.ts';

import { args_parse, argv_parse } from '#lib/args.ts';

/* eslint-disable no-proto, @typescript-eslint/dot-notation */

const Strict = s.object({
	_: s.with_default_fn(s.array(s.string), () => []),
	a: s.optional(s.string)
});

describe('args_parse with keys named like `Object.prototype` members', () => {
	test('an object schema refuses a `__proto__` arg', () => {
		const parsed = args_parse(argv_parse(['--__proto__', 'x']), Strict);
		assert.ok(!parsed.ok);
		assert.deepEqual(
			parsed.issues.map((issue) => [issue.kind, issue.path, issue.received]),
			[['unknown_key', ['__proto__'], 'string']]
		);
	});

	test('an object schema refuses a repeated `__proto__` arg as one key', () => {
		const parsed = args_parse(argv_parse(['--__proto__', 'x', '--__proto__', 'y']), Strict);
		assert.ok(!parsed.ok);
		assert.deepEqual(
			parsed.issues.map((issue) => [issue.kind, issue.path, issue.received]),
			[['unknown_key', ['__proto__'], 'array']]
		);
	});

	test('an object schema refuses `constructor` and `toString` args', () => {
		const parsed = args_parse(argv_parse(['--constructor', 'x', '--toString', 'y']), Strict);
		assert.ok(!parsed.ok);
		assert.deepEqual(
			parsed.issues.map((issue) => [issue.kind, issue.path]),
			[
				['unknown_key', ['constructor']],
				['unknown_key', ['toString']]
			]
		);
	});

	test('a loose object keeps a `__proto__` arg as an own key of an ordinary object', () => {
		// a loose object's output type has an `unknown` index, wider than `ArgValue`
		const Loose = s.loose_object({ a: s.optional(s.string) }) as any;
		const parsed = args_parse(argv_parse(['--__proto__', 'x']), Loose);
		assert.ok(parsed.ok);
		assert.strictEqual(Object.getPrototypeOf(parsed.value), Object.prototype);
		assert.ok(Object.hasOwn(parsed.value, '__proto__'));
		assert.strictEqual((parsed.value as Record<string, unknown>)['__proto__'], 'x');
	});

	test('a `no-__proto__` pair syncs to an own `__proto__` key', () => {
		const Named = s.object({
			_: s.with_default_fn(s.array(s.string), () => []),
			['__proto__']: s.optional(s.boolean),
			'no-__proto__': s.optional(s.boolean)
		});
		const parsed = args_parse(argv_parse(['--no-no-__proto__']), Named);
		assert.ok(parsed.ok, JSON.stringify(parsed));
		assert.strictEqual(Object.getPrototypeOf(parsed.value), Object.prototype);
		assert.ok(Object.hasOwn(parsed.value, '__proto__'));
		assert.strictEqual(parsed.value['__proto__'], true);
	});

	test('a transform keeps the prototype of what it returns', () => {
		const Bare = s.pipe(
			Strict,
			s.transform((value) => Object.assign(Object.create(null), value))
		);
		const parsed = args_parse({ a: 'x' }, Bare);
		assert.ok(parsed.ok);
		assert.strictEqual(Object.getPrototypeOf(parsed.value), null);
	});

	test('a loose object that applies a default copies the args and drops `__proto__`', () => {
		const Loose = s.loose_object({ a: s.with_default(s.string, 'd') }) as any;
		const parsed = args_parse(argv_parse(['--__proto__', 'x']), Loose);
		assert.ok(parsed.ok);
		assert.strictEqual(Object.getPrototypeOf(parsed.value), Object.prototype);
		assert.ok(!Object.hasOwn(parsed.value, '__proto__'));
		assert.strictEqual((parsed.value as Record<string, unknown>).a, 'd');
	});

	test('the output is an ordinary object', () => {
		const parsed = args_parse({ _: [], a: 'x' }, Strict);
		assert.ok(parsed.ok);
		assert.strictEqual(Object.getPrototypeOf(parsed.value), Object.prototype);
		const defaulted = args_parse({}, Strict);
		assert.ok(defaulted.ok);
		assert.strictEqual(Object.getPrototypeOf(defaulted.value), Object.prototype);
	});

	test('entries named `constructor` and `toString` read as absent when not given', () => {
		const Named = s.object({
			constructor: s.optional(s.string),
			toString: s.optional(s.string)
		});
		const parsed = args_parse({}, Named);
		assert.ok(parsed.ok, JSON.stringify(parsed));
		assert.ok(!Object.hasOwn(parsed.value, 'constructor'));
		assert.ok(!Object.hasOwn(parsed.value, 'toString'));
	});

	test('an alias expands to a `constructor` entry', () => {
		const Named = s.object({
			constructor: meta(s.optional(s.string), { aliases: ['k'] })
		});
		const parsed = args_parse({ k: 'x' }, Named);
		assert.ok(parsed.ok, JSON.stringify(parsed));
		assert.strictEqual(parsed.value['constructor'], 'x');
	});

	test('a `no-constructor` pair syncs', () => {
		const Named = s.object({
			constructor: s.with_default(s.boolean, false),
			'no-constructor': s.with_default(s.boolean, true)
		});
		const parsed = args_parse({ 'no-constructor': false }, Named);
		assert.ok(parsed.ok, JSON.stringify(parsed));
		assert.deepEqual(
			{ ...parsed.value },
			{
				constructor: true,
				'no-constructor': false
			}
		);
	});
});
