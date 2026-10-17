import { describe, test, assert, beforeEach, afterEach, vi } from 'vitest';

import { Logger } from '#lib/log.ts';
import { create_test_context } from './log_test_helpers.ts';

// the env vars the default colors decision reads, cleared per test so the runner's env doesn't leak in
const COLOR_ENV_NAMES = [
	'FORCE_COLOR',
	'NO_COLOR',
	'NODE_DISABLE_COLORS',
	'CLAUDECODE',
	'TERM'
] as const;

const has_ansi = (value: unknown): boolean => typeof value === 'string' && value.includes('\x1b[');

const stdout_is_tty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
const stderr_is_tty = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');

const set_tty = (stdout: boolean, stderr: boolean): void => {
	Object.defineProperty(process.stdout, 'isTTY', { value: stdout, configurable: true });
	Object.defineProperty(process.stderr, 'isTTY', { value: stderr, configurable: true });
};

const restore_property = (target: object, descriptor: PropertyDescriptor | undefined): void => {
	if (descriptor) {
		Object.defineProperty(target, 'isTTY', descriptor);
	} else {
		delete (target as { isTTY?: boolean }).isTTY;
	}
};

beforeEach(() => {
	for (const name of COLOR_ENV_NAMES) vi.stubEnv(name, undefined);
	set_tty(false, false);
});

afterEach(() => {
	vi.unstubAllEnvs();
	restore_property(process.stdout, stdout_is_tty);
	restore_property(process.stderr, stderr_is_tty);
});

describe('Logger > colors override', () => {
	test('true styles output when no stream is a terminal', () => {
		const ctx = create_test_context();
		const log = new Logger('test', { colors: true, console: ctx.console, level: 'debug' });

		log.info('a');
		assert.ok(has_ansi(ctx.logged_args?.[0]));
		log.debug('a');
		assert.ok(has_ansi(ctx.logged_args?.[0]));
		log.error('a');
		assert.ok(has_ansi(ctx.error_args?.[0]));
		log.warn('a');
		assert.ok(has_ansi(ctx.warn_args?.[0]));
	});

	test('false strips styling despite FORCE_COLOR and a terminal', () => {
		vi.stubEnv('FORCE_COLOR', '1');
		set_tty(true, true);
		const ctx = create_test_context();
		const log = new Logger('test', { colors: false, console: ctx.console, level: 'info' });

		log.info('a');
		assert.equal(ctx.logged_args?.[0], '[test]');
		log.error('a');
		assert.ok(!has_ansi(ctx.error_args?.[0]));
	});

	test('the setter forces colors on with a custom console', () => {
		const ctx = create_test_context();
		const log = new Logger('test', { console: ctx.console, level: 'info' });
		assert.equal(log.colors, false);

		log.colors = true;
		log.info('a');
		assert.ok(has_ansi(ctx.logged_args?.[0]));
	});
});

describe('Logger > colors default', () => {
	test('on when both stdout and stderr are terminals', () => {
		set_tty(true, true);
		assert.equal(new Logger('test').colors, true);
	});

	test('off when either stream is not a terminal', () => {
		set_tty(true, false);
		assert.equal(new Logger('test').colors, false);
		set_tty(false, true);
		assert.equal(new Logger('test').colors, false);
		set_tty(false, false);
		assert.equal(new Logger('test').colors, false);
	});

	test('off with a custom console even on a terminal', () => {
		set_tty(true, true);
		const ctx = create_test_context();
		const log = new Logger('test', { console: ctx.console, level: 'info' });
		assert.equal(log.colors, false);

		log.info('a');
		assert.equal(ctx.logged_args?.[0], '[test]');
	});

	test('empty NO_COLOR does not disable colors', () => {
		set_tty(true, true);
		vi.stubEnv('NO_COLOR', '');
		assert.equal(new Logger('test').colors, true);
	});

	test('non-empty NO_COLOR disables colors', () => {
		set_tty(true, true);
		vi.stubEnv('NO_COLOR', '1');
		assert.equal(new Logger('test').colors, false);
		vi.stubEnv('NO_COLOR', '0');
		assert.equal(new Logger('test').colors, false);
	});

	test('empty CLAUDECODE does not disable colors', () => {
		set_tty(true, true);
		vi.stubEnv('CLAUDECODE', '');
		assert.equal(new Logger('test').colors, true);
	});

	test('non-empty CLAUDECODE disables colors', () => {
		set_tty(true, true);
		vi.stubEnv('CLAUDECODE', '1');
		assert.equal(new Logger('test').colors, false);
	});

	test('empty NODE_DISABLE_COLORS does not disable colors', () => {
		set_tty(true, true);
		vi.stubEnv('NODE_DISABLE_COLORS', '');
		assert.equal(new Logger('test').colors, true);
	});

	test('non-empty NODE_DISABLE_COLORS disables colors', () => {
		set_tty(true, true);
		vi.stubEnv('NODE_DISABLE_COLORS', '1');
		assert.equal(new Logger('test').colors, false);
	});

	test('TERM of dumb disables colors', () => {
		set_tty(true, true);
		vi.stubEnv('TERM', 'dumb');
		assert.equal(new Logger('test').colors, false);
	});

	test('FORCE_COLOR turns colors on without a terminal', () => {
		for (const value of ['', '1', '2', '3', 'true']) {
			vi.stubEnv('FORCE_COLOR', value);
			assert.equal(new Logger('test').colors, true, `FORCE_COLOR=${JSON.stringify(value)}`);
		}
	});

	test('FORCE_COLOR turns colors on for a custom console', () => {
		vi.stubEnv('FORCE_COLOR', '1');
		const ctx = create_test_context();
		const log = new Logger('test', { console: ctx.console, level: 'info' });

		log.info('a');
		assert.ok(has_ansi(ctx.logged_args?.[0]));
	});

	test('FORCE_COLOR turns colors off on a terminal for other values', () => {
		set_tty(true, true);
		for (const value of ['0', 'false', 'yes']) {
			vi.stubEnv('FORCE_COLOR', value);
			assert.equal(new Logger('test').colors, false, `FORCE_COLOR=${JSON.stringify(value)}`);
		}
	});

	test('FORCE_COLOR takes precedence over NO_COLOR, NODE_DISABLE_COLORS, and CLAUDECODE', () => {
		vi.stubEnv('FORCE_COLOR', '1');
		vi.stubEnv('NO_COLOR', '1');
		vi.stubEnv('NODE_DISABLE_COLORS', '1');
		vi.stubEnv('CLAUDECODE', '1');
		assert.equal(new Logger('test').colors, true);
	});

	test('re-evaluates when the env changes', () => {
		const ctx = create_test_context();
		const log = new Logger('test', { console: ctx.console, level: 'info' });

		vi.stubEnv('FORCE_COLOR', '1');
		log.info('a');
		assert.ok(has_ansi(ctx.logged_args?.[0]));

		vi.stubEnv('FORCE_COLOR', '0');
		log.info('a');
		assert.equal(ctx.logged_args?.[0], '[test]');
	});
});

describe('Logger > colors inheritance', () => {
	test('a child inherits the parent override with a custom console', () => {
		const ctx = create_test_context();
		const parent = new Logger('parent', { colors: true });
		const child = parent.child('child', { console: ctx.console, level: 'info' });

		child.info('a');
		assert.ok(has_ansi(ctx.logged_args?.[0]));
	});

	test('a child default follows its own console, not the root console', () => {
		set_tty(true, true);
		const ctx = create_test_context();
		const parent = new Logger('parent');
		const child = parent.child('child', { console: ctx.console });

		assert.equal(parent.colors, true);
		assert.equal(child.colors, false);
	});

	test('a child inherits the env default', () => {
		const parent = new Logger('parent');
		const child = parent.child('child');
		assert.equal(child.colors, false);

		vi.stubEnv('FORCE_COLOR', '1');
		assert.equal(child.colors, true);
	});

	test('clearing an override restores the env default', () => {
		const ctx = create_test_context();
		const log = new Logger('test', { colors: true, console: ctx.console, level: 'info' });
		log.info('a');
		assert.ok(has_ansi(ctx.logged_args?.[0]));

		log.clear_colors_override();
		assert.equal(log.colors, false);
		log.info('a');
		assert.equal(ctx.logged_args?.[0], '[test]');
	});
});
