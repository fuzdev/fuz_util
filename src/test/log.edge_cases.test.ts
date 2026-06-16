import {describe, test, assert} from 'vitest';

import {Logger} from '$lib/log.ts';
import {create_test_context} from './log_test_helpers.ts';

describe('Logger > Edge Cases', () => {
	test('very long label is handled', () => {
		const long_label = 'a'.repeat(1000);
		const log = new Logger(long_label);

		assert.equal(log.label, long_label);
	});

	test('label with multiple underscores', () => {
		const log = new Logger('foo__bar__baz');

		assert.equal(log.label, 'foo__bar__baz');
	});

	test('label with leading underscores', () => {
		const log = new Logger('__foo');

		assert.equal(log.label, '__foo');
	});

	test('label with trailing underscores', () => {
		const log = new Logger('foo__');

		assert.equal(log.label, 'foo__');
	});

	test('label with only underscores', () => {
		const log = new Logger('____');

		assert.equal(log.label, '____');
	});

	test('unicode emoji label', () => {
		const log = new Logger('🚀app');

		assert.equal(log.label, '🚀app');
	});

	test('deep inheritance chain with mixed overrides', () => {
		const ctx = create_test_context();
		const root = new Logger('root', {level: 'error', console: ctx.console, colors: false});
		const level1 = root.child('l1', {level: 'warn'});
		const level2 = level1.child('l2'); // Inherits 'warn'
		const level3 = level2.child('l3', {level: 'debug'}); // Override to 'debug'
		const level4 = level3.child('l4'); // Inherits 'debug'

		// Check levels
		assert.equal(root.level, 'error');
		assert.equal(level1.level, 'warn');
		assert.equal(level2.level, 'warn');
		assert.equal(level3.level, 'debug');
		assert.equal(level4.level, 'debug');

		// Check labels
		assert.equal(level4.label, 'root:l1:l2:l3:l4');

		// Check console inheritance
		level4.error('test');
		assert.ok(ctx.error_args);
	});

	test('child of child of child label concatenation', () => {
		const root = new Logger('a');
		const child1 = root.child('b');
		const child2 = child1.child('c');
		const child3 = child2.child('d');
		const child4 = child3.child('e');

		assert.equal(child4.label, 'a:b:c:d:e');
		assert.equal(child4.parent, child3);
		assert.equal(child3.parent, child2);
		assert.equal(child2.parent, child1);
		assert.equal(child1.parent, root);
	});

	test('single character label', () => {
		const ctx = create_test_context();
		const log = new Logger('x', {console: ctx.console, colors: false, level: 'info'});

		log.info('test');

		assert.ok(ctx.logged_args);
		assert.ok(ctx.logged_args.some((arg) => typeof arg === 'string' && arg.includes('[x]')));
	});

	test('numeric-looking label is still string', () => {
		const log = new Logger('123');

		assert.equal(log.label, '123');
		assert.equal(typeof log.label, 'string');
	});

	test('label with spaces', () => {
		const log = new Logger('my app');

		assert.equal(log.label, 'my app');
	});

	test('label with special characters', () => {
		const log = new Logger('app-v2.0');

		assert.equal(log.label, 'app-v2.0');
	});
});
