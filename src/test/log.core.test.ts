import {describe, test, assert} from 'vitest';

import {Logger, log_level_to_number, log_level_parse} from '$lib/log.ts';
import {create_test_context} from './log_test_helpers.ts';

describe('Logger > Core Functionality', () => {
	test('Logger with label formats prefix', () => {
		const ctx = create_test_context();
		const log = new Logger('test', {console: ctx.console, colors: false, level: 'info'});

		log.info('message');

		assert.ok(ctx.logged_args);
		assert.ok(ctx.logged_args.some((arg) => typeof arg === 'string' && arg.includes('[test]')));
	});

	test('Logger without label has no bracket prefix', () => {
		const ctx = create_test_context();
		const log = new Logger(undefined, {console: ctx.console, colors: false, level: 'info'});

		log.info('message');

		assert.ok(ctx.logged_args);
		assert.ok(!ctx.logged_args.some((arg) => typeof arg === 'string' && arg.includes('[')));
	});

	test('Log level filtering', () => {
		const ctx = create_test_context();
		const log = new Logger('test', {level: 'warn', console: ctx.console, colors: false});

		log.info('hidden');
		assert.equal(ctx.logged_args, undefined);

		log.warn('shown');
		assert.ok(ctx.warn_args);
	});

	test('All log methods work', () => {
		const ctx = create_test_context();
		const log = new Logger('test', {level: 'debug', console: ctx.console, colors: false});

		log.error('error message');
		assert.ok(ctx.error_args);
		assert.ok(ctx.error_args.some((arg) => typeof arg === 'string' && arg.includes('error')));
		ctx.error_args = undefined;

		log.warn('warn message');
		assert.ok(ctx.warn_args);
		assert.ok(ctx.warn_args.some((arg) => typeof arg === 'string' && arg.includes('warn')));
		ctx.warn_args = undefined;

		log.info('info message');
		assert.ok(ctx.logged_args);
		ctx.logged_args = undefined as any;

		log.debug('debug message');
		assert.ok(ctx.logged_args);
		assert.ok(ctx.logged_args.some((arg) => typeof arg === 'string' && arg.includes('debug')));
		ctx.logged_args = undefined;
	});

	test('raw() bypasses level filtering and formatting', () => {
		const ctx = create_test_context();
		const log = new Logger('test', {level: 'off', console: ctx.console, colors: false});

		log.info('hidden');
		assert.equal(ctx.logged_args, undefined);

		log.raw('shown');
		assert.deepStrictEqual(ctx.logged_args, ['shown']);
	});

	test('boundary level check - logging at exact threshold', () => {
		const ctx = create_test_context();
		const log = new Logger('test', {level: 'warn', console: ctx.console, colors: false});

		// At threshold - should show
		log.warn('shown');
		assert.ok(ctx.warn_args);
		ctx.warn_args = undefined;

		// Below threshold - should be hidden
		log.info('hidden');
		assert.equal(ctx.logged_args, undefined);

		// Above threshold - should show
		log.error('shown');
		assert.ok(ctx.error_args);
	});
});

describe('Logger > Label Validation', () => {
	test('label with colon is allowed', () => {
		const log = new Logger('user:123');
		assert.equal(log.label, 'user:123');
	});

	test('empty child label throws error', () => {
		const parent = new Logger('parent');
		assert.throws(() => parent.child(''), /cannot be empty/);
	});

	test('empty root label is allowed', () => {
		const log = new Logger('');
		assert.equal(log.label, '');
	});

	test('empty label produces no brackets in output', () => {
		const ctx = create_test_context();
		const log = new Logger('', {console: ctx.console, colors: false, level: 'info'});

		log.info('message');

		assert.ok(ctx.logged_args);
		// Should not contain brackets since label is empty
		assert.ok(!ctx.logged_args.some((arg) => typeof arg === 'string' && arg.includes('[')));
		assert.ok(!ctx.logged_args.some((arg) => typeof arg === 'string' && arg.includes(']')));
	});

	test('label with multiple colons is allowed', () => {
		const log = new Logger('user:123:456');
		assert.equal(log.label, 'user:123:456');
	});
});

describe('Logger > Configuration', () => {
	test('colors option controls styling', () => {
		const ctx = create_test_context();

		const colored = new Logger('test', {colors: true, console: ctx.console});
		assert.equal(colored.colors, true);

		const plain = new Logger('test', {colors: false, console: ctx.console});
		assert.equal(plain.colors, false);
	});

	test('default log level is used when not specified', () => {
		const log = new Logger('test');

		// Default level should be set (varies by environment: 'off' in vitest, 'debug' in DEV, 'info' in prod)
		assert.ok(['off', 'info', 'debug'].includes(log.level));
	});

	test('custom level overrides default', () => {
		const log = new Logger('test', {level: 'error'});

		assert.equal(log.level, 'error');
	});

	test('level off silences all logging', () => {
		const ctx = create_test_context();
		const log = new Logger('test', {level: 'off', console: ctx.console, colors: false});

		log.error('hidden');
		assert.equal(ctx.error_args, undefined);

		log.warn('hidden');
		assert.equal(ctx.warn_args, undefined);

		log.info('hidden');
		assert.equal(ctx.logged_args, undefined);

		log.debug('hidden');
		assert.equal(ctx.logged_args, undefined);
	});

	test('level debug shows all messages', () => {
		const ctx = create_test_context();
		const log = new Logger('test', {level: 'debug', console: ctx.console, colors: false});

		log.debug('shown');
		assert.ok(ctx.logged_args);
		ctx.logged_args = undefined;

		log.info('shown');
		assert.ok(ctx.logged_args);
		ctx.logged_args = undefined;

		log.warn('shown');
		assert.ok(ctx.warn_args);
		ctx.warn_args = undefined;

		log.error('shown');
		assert.ok(ctx.error_args);
	});
});

describe('Logger > Multiple Arguments', () => {
	test('logger passes through multiple arguments', () => {
		const ctx = create_test_context();
		const log = new Logger('test', {console: ctx.console, colors: false, level: 'info'});

		log.info('message', 42, {foo: 'bar'}, ['array']);

		assert.ok(ctx.logged_args);
		assert.ok(ctx.logged_args.includes('message'));
		assert.ok(ctx.logged_args.includes(42));
		assert.ok(
			ctx.logged_args.some(
				(arg) =>
					typeof arg === 'object' && arg !== null && 'foo' in arg && (arg as any).foo === 'bar',
			),
		);
		assert.ok(ctx.logged_args.some((arg) => Array.isArray(arg)));
	});
});

describe('log_level_to_number', () => {
	test('returns correct numeric values in order', () => {
		assert.strictEqual(log_level_to_number('off'), 0);
		assert.strictEqual(log_level_to_number('error'), 1);
		assert.strictEqual(log_level_to_number('warn'), 2);
		assert.strictEqual(log_level_to_number('info'), 3);
		assert.strictEqual(log_level_to_number('debug'), 4);
	});

	test('ordering is monotonically increasing', () => {
		assert.isBelow(log_level_to_number('off'), log_level_to_number('error'));
		assert.isBelow(log_level_to_number('error'), log_level_to_number('warn'));
		assert.isBelow(log_level_to_number('warn'), log_level_to_number('info'));
		assert.isBelow(log_level_to_number('info'), log_level_to_number('debug'));
	});
});

describe('log_level_parse', () => {
	test('returns valid log levels', () => {
		assert.strictEqual(log_level_parse('off'), 'off');
		assert.strictEqual(log_level_parse('error'), 'error');
		assert.strictEqual(log_level_parse('warn'), 'warn');
		assert.strictEqual(log_level_parse('info'), 'info');
		assert.strictEqual(log_level_parse('debug'), 'debug');
	});

	test('returns undefined for undefined and empty string', () => {
		assert.strictEqual(log_level_parse(undefined), undefined);
		assert.strictEqual(log_level_parse(''), undefined);
	});

	test('throws for invalid values', () => {
		assert.throws(() => log_level_parse('verbose'), /Invalid log level/);
		assert.throws(() => log_level_parse('INFO'), /Invalid log level/);
		assert.throws(() => log_level_parse('1'), /Invalid log level/);
	});
});
