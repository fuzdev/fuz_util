import {describe, test, assert} from 'vitest';

import {Logger} from '$lib/log.ts';
import {create_test_context} from './log_test_helpers.ts';

describe('Logger > Child Loggers', () => {
	test('child() creates logger with concatenated label', () => {
		const parent = new Logger('parent');
		const child = parent.child('child');

		assert.equal(child.label, 'parent:child');
	});

	test('child() without parent label', () => {
		const parent = new Logger();
		const child = parent.child('child');

		assert.equal(child.label, 'child');
	});

	test('deep nesting of children', () => {
		const root = new Logger('root');
		const level1 = root.child('l1');
		const level2 = level1.child('l2');
		const level3 = level2.child('l3');

		assert.equal(level3.label, 'root:l1:l2:l3');
	});

	test('child logger output includes full label path', () => {
		const ctx = create_test_context();
		const parent = new Logger('parent', {console: ctx.console, colors: false, level: 'info'});
		const child = parent.child('child');

		child.info('message');

		assert.ok(ctx.logged_args);
		assert.ok(
			ctx.logged_args.some((arg) => typeof arg === 'string' && arg.includes('[parent:child]')),
		);
	});
});

describe('Logger > Inheritance', () => {
	test('child inherits parent level', () => {
		const ctx = create_test_context();
		const parent = new Logger('parent', {level: 'warn', console: ctx.console, colors: false});
		const child = parent.child('child');

		child.info('should be muted');
		assert.equal(ctx.logged_args, undefined);

		child.warn('should show');
		assert.ok(ctx.warn_args);
	});

	test('child can override parent level', () => {
		const ctx = create_test_context();
		const parent = new Logger('parent', {level: 'warn', console: ctx.console, colors: false});
		const child = parent.child('child', {level: 'info'});

		child.info('should show');
		assert.ok(ctx.logged_args);
	});

	test('child inherits console from parent', () => {
		const ctx = create_test_context();
		const parent = new Logger('parent', {console: ctx.console, colors: false, level: 'info'});
		const child = parent.child('child');

		child.info('message');
		assert.ok(ctx.logged_args); // Should use parent's console
	});

	test('child inherits colors from parent', () => {
		const parent = new Logger('parent', {colors: true});
		const child = parent.child('child');

		assert.equal(parent.colors, child.colors);
	});

	test('grandchild inherits from parent chain', () => {
		const ctx = create_test_context();
		const root = new Logger('root', {
			level: 'info',
			console: ctx.console,
			colors: false,
		});
		const parent = root.child('parent');
		const child = parent.child('child');

		// Check console inheritance
		child.debug('hidden');
		assert.equal(ctx.logged_args, undefined);

		child.info('shown');
		assert.ok(ctx.logged_args);

		// Check label inheritance
		assert.equal(child.label, 'root:parent:child');
	});
});

describe('Logger > Dynamic Inheritance', () => {
	test('child sees parent level changes', () => {
		const ctx = create_test_context();
		const parent = new Logger('parent', {level: 'warn', console: ctx.console, colors: false});
		const child = parent.child('child');

		// Initially child inherits warn level
		child.info('muted');
		assert.equal(ctx.logged_args, undefined);

		// Parent changes to debug
		parent.level = 'debug';
		assert.equal(child.level, 'debug');

		// Child now sees info logs
		child.info('visible');
		assert.ok(ctx.logged_args);
	});

	test('child with override ignores parent changes', () => {
		const parent = new Logger('parent', {level: 'warn'});
		const child = parent.child('child', {level: 'info'});

		assert.equal(child.level, 'info');

		// Parent changes but child has override
		parent.level = 'debug';
		assert.equal(parent.level, 'debug');
		assert.equal(child.level, 'info'); // Unchanged
	});

	test('child sees parent color changes', () => {
		const parent = new Logger('parent', {colors: true});
		const child = parent.child('child');

		assert.equal(child.colors, true);

		parent.colors = false;
		assert.equal(child.colors, false); // Dynamically inherited
	});

	test('child sees parent console changes', () => {
		const ctx1 = create_test_context();
		const ctx2 = create_test_context();
		const parent = new Logger('parent', {console: ctx1.console, level: 'info'});
		const child = parent.child('child');

		child.info('to ctx1');
		assert.ok(ctx1.logged_args);
		assert.equal(ctx2.logged_args, undefined);

		// Change parent console
		parent.console = ctx2.console;

		ctx1.logged_args = undefined;
		ctx2.logged_args = undefined;

		child.info('to ctx2');
		assert.equal(ctx1.logged_args, undefined);
		assert.ok(ctx2.logged_args); // Child now uses ctx2
	});

	test('grandchild sees root changes', () => {
		const root = new Logger('root', {level: 'warn'});
		const parent = root.child('parent');
		const child = parent.child('child');

		assert.equal(child.level, 'warn');

		root.level = 'debug';
		assert.equal(root.level, 'debug');
		assert.equal(parent.level, 'debug');
		assert.equal(child.level, 'debug'); // All see the change
	});

	test('mixed overrides in chain', () => {
		const root = new Logger('root', {level: 'info'});
		const parent = root.child('parent', {level: 'warn'}); // Has override
		const child = parent.child('child'); // Inherits from parent

		assert.equal(root.level, 'info');
		assert.equal(parent.level, 'warn');
		assert.equal(child.level, 'warn');

		// Change root - parent unaffected (has override)
		root.level = 'debug';
		assert.equal(root.level, 'debug');
		assert.equal(parent.level, 'warn'); // Still warn (override)
		assert.equal(child.level, 'warn'); // Inherits from parent

		// Change parent - child sees it
		parent.level = 'error';
		assert.equal(parent.level, 'error');
		assert.equal(child.level, 'error'); // Sees parent change
	});

	test('order of setting does not matter', () => {
		const root = new Logger('root', {level: 'info'});
		const child = root.child('child');
		const grandchild = child.child('grandchild');

		// Initially all inherit from root
		assert.equal(grandchild.level, 'info');

		// Set child AFTER grandchild was created
		child.level = 'warn';
		assert.equal(grandchild.level, 'warn'); // Sees child immediately

		// Change root AFTER child was set
		root.level = 'debug';
		assert.equal(root.level, 'debug');
		assert.equal(child.level, 'warn'); // Child has override, blocks root change
		assert.equal(grandchild.level, 'warn'); // Stops at child's override

		// Change child again
		child.level = 'error';
		assert.equal(grandchild.level, 'error'); // Sees change immediately
	});

	test('override in middle of chain blocks propagation', () => {
		const root = new Logger('root', {level: 'info'});
		const child = root.child('child');
		const grandchild = child.child('grandchild');
		const great_grandchild = grandchild.child('great');

		// All start inheriting from root
		assert.equal(great_grandchild.level, 'info');

		// Set override in middle of chain (child)
		child.level = 'warn';
		assert.equal(great_grandchild.level, 'warn'); // Inherits from child

		// Change root - blocked by child's override
		root.level = 'debug';
		assert.equal(great_grandchild.level, 'warn'); // Still gets 'warn' from child

		// Set override on grandchild (between child and great_grandchild)
		grandchild.level = 'error';
		assert.equal(great_grandchild.level, 'error'); // Now gets from grandchild

		// Change child - grandchild's override blocks it
		child.level = 'off';
		assert.equal(great_grandchild.level, 'error'); // Still gets from grandchild
	});
});

describe('Logger > Parent Reference', () => {
	test('child has reference to parent', () => {
		const parent = new Logger('parent');
		const child = parent.child('child');

		assert.equal(child.parent, parent);
	});

	test('root logger has no parent', () => {
		const log = new Logger('root');

		assert.equal(log.parent, undefined);
	});
});
