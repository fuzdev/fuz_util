import {describe, test, assert} from 'vitest';

import {Logger} from '$lib/log.ts';
import {create_test_context} from './log_test_helpers.ts';

describe('Logger > Additional Edge Cases', () => {
	test('invalid level string throws error', () => {
		assert.throws(() => {
			// eslint-disable-next-line no-new
			new Logger('test', {level: 'invalid' as any});
		});
	});

	test('setting invalid level throws error', () => {
		const log = new Logger('test');

		assert.throws(() => {
			log.level = 'invalid' as any;
		});
	});

	test('label with newline character', () => {
		const ctx = create_test_context();
		const log = new Logger('test\nwith\nnewlines', {
			console: ctx.console,
			colors: false,
			level: 'info',
		});

		log.info('message');

		assert.ok(ctx.logged_args);
		// Label should contain the newlines as-is
		assert.ok(
			ctx.logged_args.some(
				(arg) => typeof arg === 'string' && arg.includes('test\nwith\nnewlines'),
			),
		);
	});

	test('label with tab character', () => {
		const ctx = create_test_context();
		const log = new Logger('test\twith\ttabs', {
			console: ctx.console,
			colors: false,
			level: 'info',
		});

		log.info('message');

		assert.ok(ctx.logged_args);
		assert.ok(
			ctx.logged_args.some((arg) => typeof arg === 'string' && arg.includes('test\twith\ttabs')),
		);
	});

	test('label with square brackets', () => {
		const ctx = create_test_context();
		const log = new Logger('[already][bracketed]', {
			console: ctx.console,
			colors: false,
			level: 'info',
		});

		log.info('message');

		assert.ok(ctx.logged_args);
		// Should add outer brackets: [[already][bracketed]]
		assert.ok(
			ctx.logged_args.some(
				(arg) => typeof arg === 'string' && arg.includes('[[already][bracketed]]'),
			),
		);
	});

	test('label with colon (separator character)', () => {
		const ctx = create_test_context();
		const parent = new Logger('parent:with:colons', {
			console: ctx.console,
			colors: false,
			level: 'info',
		});
		const child = parent.child('child');

		// Label concatenation should work even with colons in parent label
		assert.equal(child.label, 'parent:with:colons:child');

		child.info('message');
		assert.ok(ctx.logged_args);
		assert.ok(
			ctx.logged_args.some(
				(arg) => typeof arg === 'string' && arg.includes('[parent:with:colons:child]'),
			),
		);
	});

	test('very deep hierarchy (10 levels)', () => {
		const ctx = create_test_context();
		let current = new Logger('l0', {level: 'info', console: ctx.console, colors: false});

		// Create 10-level deep hierarchy
		for (let i = 1; i <= 10; i++) {
			current = current.child(`l${i}`);
		}

		// Verify label concatenation
		assert.equal(current.label, 'l0:l1:l2:l3:l4:l5:l6:l7:l8:l9:l10');

		// Verify root getter traverses correctly
		assert.equal(current.root.label, 'l0');

		// Verify inheritance works
		assert.equal(current.level, 'info');

		// Verify logging works
		current.info('deep message');
		assert.ok(ctx.logged_args);
	});

	test('very deep hierarchy with override in middle (10 levels)', () => {
		const root = new Logger('l0', {level: 'info'});
		let current = root;

		// Create deep hierarchy with override at level 5
		for (let i = 1; i <= 10; i++) {
			const options = i === 5 ? {level: 'warn' as const} : undefined;
			current = current.child(`l${i}`, options);
		}

		// Level 10 should inherit from level 5's override
		assert.equal(current.level, 'warn');

		// Change root
		root.level = 'debug';

		// Level 5's override should block it
		assert.equal(root.level, 'debug');
		assert.equal(current.level, 'warn'); // Still gets warn from l5
	});

	test('label with only whitespace', () => {
		const ctx = create_test_context();
		const log = new Logger('   ', {console: ctx.console, colors: false, level: 'info'});

		assert.equal(log.label, '   ');

		log.info('message');
		assert.ok(ctx.logged_args);
		assert.ok(ctx.logged_args.some((arg) => typeof arg === 'string' && arg.includes('[   ]')));
	});

	test('logging empty message', () => {
		const ctx = create_test_context();
		const log = new Logger('test', {console: ctx.console, colors: false, level: 'info'});

		log.info('');

		assert.ok(ctx.logged_args);
		assert.equal(ctx.logged_args.length, 2); // prefix and empty string
		assert.equal(ctx.logged_args[1], '');
	});

	test('logging undefined', () => {
		const ctx = create_test_context();
		const log = new Logger('test', {console: ctx.console, colors: false, level: 'info'});

		log.info(undefined);

		assert.ok(ctx.logged_args);
		assert.equal(ctx.logged_args[1], undefined);
	});

	test('logging null', () => {
		const ctx = create_test_context();
		const log = new Logger('test', {console: ctx.console, colors: false, level: 'info'});

		log.info(null);

		assert.ok(ctx.logged_args);
		assert.equal(ctx.logged_args[1], null);
	});

	test('logging multiple arguments with various types', () => {
		const ctx = create_test_context();
		const log = new Logger('test', {console: ctx.console, colors: false, level: 'info'});

		const obj = {foo: 'bar'};
		const arr = [1, 2, 3];
		log.info('string', 42, true, obj, arr, null, undefined);

		assert.ok(ctx.logged_args);
		assert.equal(ctx.logged_args.length, 8); // prefix + 7 args
		assert.equal(ctx.logged_args[1], 'string');
		assert.equal(ctx.logged_args[2], 42);
		assert.equal(ctx.logged_args[3], true);
		assert.equal(ctx.logged_args[4], obj);
		assert.equal(ctx.logged_args[5], arr);
		assert.equal(ctx.logged_args[6], null);
		assert.equal(ctx.logged_args[7], undefined);
	});

	test('label with unicode emoji', () => {
		const ctx = create_test_context();
		const log = new Logger('🚀rocket🌟', {console: ctx.console, colors: false, level: 'info'});

		assert.equal(log.label, '🚀rocket🌟');

		log.info('message');
		assert.ok(ctx.logged_args);
		assert.ok(
			ctx.logged_args.some((arg) => typeof arg === 'string' && arg.includes('[🚀rocket🌟]')),
		);
	});

	test('child label with unicode emoji', () => {
		const parent = new Logger('parent');
		const child = parent.child('🎯');

		assert.equal(child.label, 'parent:🎯');
	});

	test('very long label (1000 characters)', () => {
		const ctx = create_test_context();
		const longLabel = 'a'.repeat(1000);
		const log = new Logger(longLabel, {console: ctx.console, colors: false, level: 'info'});

		assert.equal(log.label, longLabel);

		log.info('message');
		assert.ok(ctx.logged_args);
	});

	test('very long child label chain', () => {
		let current = new Logger('start');

		// Create 50 children
		for (let i = 0; i < 50; i++) {
			current = current.child('segment');
		}

		// Label should have 'start' + 50x ':segment'
		const expectedParts = ['start'];
		for (let i = 0; i < 50; i++) {
			expectedParts.push('segment');
		}
		assert.equal(current.label, expectedParts.join(':'));
	});

	test('root getter performance with 100-level hierarchy', () => {
		let current = new Logger('l0');

		// Create 100-level deep hierarchy
		for (let i = 1; i <= 100; i++) {
			current = current.child(`l${i}`);
		}

		// Call root getter multiple times - should always work
		for (let i = 0; i < 10; i++) {
			const root = current.root;
			assert.equal(root.label, 'l0');
		}
	});
});
