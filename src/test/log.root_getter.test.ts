import {describe, test, assert} from 'vitest';

import {Logger} from '$lib/log.ts';
import {create_test_context} from './log_test_helpers.ts';

describe('Logger > Root Getter', () => {
	test('returns self when logger has no parent', () => {
		const log = new Logger('root');
		assert.equal(log.root, log);
	});

	test('returns parent for single-level child', () => {
		const root = new Logger('root');
		const child = root.child('child');
		assert.equal(child.root, root);
	});

	test('traverses 3-level hierarchy', () => {
		const root = new Logger('root');
		const child = root.child('child');
		const grandchild = child.child('grandchild');

		assert.equal(grandchild.root, root);
		assert.equal(child.root, root);
		assert.equal(root.root, root);
	});

	test('is idempotent', () => {
		const root = new Logger('root');
		const child = root.child('child');
		const grandchild = child.child('grandchild');

		assert.equal(grandchild.root.root.root, root);
	});
});

describe('Logger > Root Getter > Dynamic Configuration', () => {
	test('changing root level affects all descendants without overrides', () => {
		const ctx = create_test_context();
		const root = new Logger('root', {level: 'warn', console: ctx.console, colors: false});
		const child = root.child('child');
		const grandchild = child.child('grandchild');

		// Initially all inherit 'warn' level
		grandchild.info('hidden');
		assert.equal(ctx.logged_args, undefined);

		child.info('also hidden');
		assert.equal(ctx.logged_args, undefined);

		// Change root level via root getter from grandchild
		grandchild.root.level = 'info';

		// All levels should now see info logs
		assert.equal(root.level, 'info');
		assert.equal(child.level, 'info');
		assert.equal(grandchild.level, 'info');

		grandchild.info('visible from grandchild');
		assert.ok(ctx.logged_args);
		assert.ok(
			ctx.logged_args.some(
				(arg) => typeof arg === 'string' && arg.includes('visible from grandchild'),
			),
		);

		ctx.logged_args = undefined;
		child.info('visible from child');
		assert.ok(ctx.logged_args);
		assert.ok(
			ctx.logged_args.some((arg) => typeof arg === 'string' && arg.includes('visible from child')),
		);
	});

	test('changing root level respects override at middle level', () => {
		const ctx = create_test_context();
		const root = new Logger('root', {level: 'warn', console: ctx.console, colors: false});
		const child = root.child('child', {level: 'error'}); // Override at middle level
		const grandchild = child.child('grandchild');

		// Grandchild inherits from child (error level)
		assert.equal(grandchild.level, 'error');
		assert.equal(child.level, 'error');

		// Change root level via grandchild's root getter
		grandchild.root.level = 'debug';

		// Root changed, but child's override blocks propagation
		assert.equal(root.level, 'debug');
		assert.equal(child.level, 'error'); // Still overridden
		assert.equal(grandchild.level, 'error'); // Inherits from child's override

		// Verify actual logging behavior
		root.debug('root can debug');
		assert.ok(ctx.logged_args);
		assert.ok(
			ctx.logged_args.some((arg) => typeof arg === 'string' && arg.includes('root can debug')),
		);

		ctx.warn_args = undefined;
		child.warn('child warn blocked');
		assert.equal(ctx.warn_args, undefined); // error level blocks warn

		child.error('child error works');
		assert.ok(ctx.error_args);

		ctx.warn_args = undefined;
		grandchild.warn('grandchild warn blocked');
		assert.equal(ctx.warn_args, undefined); // inherits error level
	});

	test('changing root colors affects entire hierarchy', () => {
		const root = new Logger('root', {colors: false});
		const child = root.child('child');
		const grandchild = child.child('grandchild');

		assert.equal(grandchild.colors, false);
		assert.equal(child.colors, false);
		assert.equal(root.colors, false);

		// Change colors via root getter from grandchild
		grandchild.root.colors = true;

		assert.equal(root.colors, true);
		assert.equal(child.colors, true);
		assert.equal(grandchild.colors, true);
	});

	test('changing root console affects entire hierarchy', () => {
		const ctx1 = create_test_context();
		const ctx2 = create_test_context();
		const root = new Logger('root', {console: ctx1.console, level: 'info', colors: false});
		const child = root.child('child');
		const grandchild = child.child('grandchild');

		// Initially logs to ctx1
		grandchild.info('to ctx1');
		assert.ok(ctx1.logged_args);
		assert.ok(ctx1.logged_args.some((arg) => typeof arg === 'string' && arg.includes('to ctx1')));
		ctx1.logged_args = undefined;

		// Change console via root getter from grandchild
		grandchild.root.console = ctx2.console;

		// Now logs to ctx2
		grandchild.info('to ctx2');
		assert.equal(ctx1.logged_args, undefined);
		assert.ok(ctx2.logged_args);
		assert.ok(ctx2.logged_args.some((arg) => typeof arg === 'string' && arg.includes('to ctx2')));

		// Verify child and root also log to ctx2
		ctx2.logged_args = undefined;
		child.info('child to ctx2');
		assert.ok(ctx2.logged_args);

		ctx2.logged_args = undefined;
		root.info('root to ctx2');
		assert.ok(ctx2.logged_args);
	});

	test('multiple overrides at different levels', () => {
		const ctx = create_test_context();
		const root = new Logger('root', {level: 'info', colors: false, console: ctx.console});
		const child = root.child('child', {colors: true}); // Color override at middle
		const grandchild = child.child('grandchild', {level: 'debug'}); // Level override at leaf

		// Initial state
		assert.equal(root.level, 'info');
		assert.equal(child.level, 'info'); // Inherits from root
		assert.equal(grandchild.level, 'debug'); // Has override

		assert.equal(root.colors, false);
		assert.equal(child.colors, true); // Has override
		assert.equal(grandchild.colors, true); // Inherits from child

		// Change root level - grandchild unaffected due to override
		grandchild.root.level = 'error';
		assert.equal(root.level, 'error');
		assert.equal(child.level, 'error'); // Inherits from root
		assert.equal(grandchild.level, 'debug'); // Still has override

		// Change root colors - child unaffected due to override, grandchild inherits from child
		grandchild.root.colors = true;
		assert.equal(root.colors, true);
		assert.equal(child.colors, true); // Still has override (but same value now)
		assert.equal(grandchild.colors, true); // Inherits from child's override

		// Verify actual logging behavior with grandchild's debug override
		grandchild.debug('grandchild debug works');
		assert.ok(ctx.logged_args);
		assert.ok(
			ctx.logged_args.some(
				(arg) => typeof arg === 'string' && arg.includes('grandchild debug works'),
			),
		);

		ctx.logged_args = undefined;
		child.debug('child debug blocked');
		assert.equal(ctx.logged_args, undefined); // child has error level from root
	});

	test('setting config on root before creating children', () => {
		const ctx = create_test_context();
		const root = new Logger('root', {console: ctx.console, colors: false});

		// Set configuration on root before children exist
		root.level = 'debug';
		root.colors = true;

		// Create children after configuration
		const child = root.child('child');
		const grandchild = child.child('grandchild');

		// Children should inherit the configuration
		assert.equal(child.level, 'debug');
		assert.equal(grandchild.level, 'debug');
		assert.equal(child.colors, true);
		assert.equal(grandchild.colors, true);

		// Verify actual logging works
		grandchild.debug('visible');
		assert.ok(ctx.logged_args);
		assert.ok(ctx.logged_args.some((arg) => typeof arg === 'string' && arg.includes('visible')));
	});

	test('changing multiple properties via root simultaneously', () => {
		const ctx1 = create_test_context();
		const ctx2 = create_test_context();
		const root = new Logger('root', {level: 'warn', colors: false, console: ctx1.console});
		const child = root.child('child');
		const grandchild = child.child('grandchild');

		// Access root once and change multiple properties
		const rootLogger = grandchild.root;
		rootLogger.level = 'debug';
		rootLogger.colors = true;
		rootLogger.console = ctx2.console;

		// All properties should have changed throughout hierarchy
		assert.equal(grandchild.level, 'debug');
		assert.equal(grandchild.colors, true);
		assert.equal(grandchild.console, ctx2.console);

		// Verify logging works with all new settings
		grandchild.debug('test message');
		assert.ok(ctx2.logged_args);
		assert.equal(ctx1.logged_args, undefined);
	});
});

describe('Logger > Root Getter > Edge Cases', () => {
	test('root getter returns same instance from all levels (siblings)', () => {
		const root = new Logger('root');
		const child1 = root.child('child1');
		const child2 = root.child('child2');
		const grandchild1 = child1.child('gc1');
		const grandchild2 = child2.child('gc2');

		// All should return the same root instance
		assert.equal(child1.root, root);
		assert.equal(child2.root, root);
		assert.equal(grandchild1.root, root);
		assert.equal(grandchild2.root, root);
		assert.equal(child1.root, child2.root); // Same instance
		assert.equal(grandchild1.root, grandchild2.root); // Same instance
	});

	test('root getter traverses 5-level hierarchy', () => {
		const ctx = create_test_context();
		const l0 = new Logger('l0', {level: 'warn', console: ctx.console, colors: false});
		const l1 = l0.child('l1');
		const l2 = l1.child('l2');
		const l3 = l2.child('l3');
		const l4 = l3.child('l4');

		// Verify all point to same root
		assert.equal(l4.root, l0);
		assert.equal(l3.root, l0);
		assert.equal(l2.root, l0);
		assert.equal(l1.root, l0);

		// Change via deepest level
		l4.root.level = 'debug';
		assert.equal(l0.level, 'debug');
		assert.equal(l1.level, 'debug');
		assert.equal(l2.level, 'debug');
		assert.equal(l3.level, 'debug');
		assert.equal(l4.level, 'debug');

		// Verify actual logging works
		l4.debug('from level 4');
		assert.ok(ctx.logged_args);
	});

	test('multiple siblings can access and modify same root', () => {
		const ctx = create_test_context();
		const root = new Logger('root', {level: 'info', console: ctx.console, colors: false});
		const child1 = root.child('child1');
		const child2 = root.child('child2');
		const grandchild1 = child1.child('gc1');
		const grandchild2 = child2.child('gc2');

		// Change via one grandchild
		grandchild1.root.level = 'debug';

		// All should see the change
		assert.equal(root.level, 'debug');
		assert.equal(child1.level, 'debug');
		assert.equal(child2.level, 'debug');
		assert.equal(grandchild2.level, 'debug');

		// Verify both grandchildren can log debug
		grandchild1.debug('from gc1');
		assert.ok(ctx.logged_args);
		ctx.logged_args = undefined;

		grandchild2.debug('from gc2');
		assert.ok(ctx.logged_args);

		// Change via other grandchild
		grandchild2.root.level = 'warn';

		// All should see this change too
		assert.equal(root.level, 'warn');
		assert.equal(child1.level, 'warn');
		assert.equal(child2.level, 'warn');
		assert.equal(grandchild1.level, 'warn');

		// Verify debug is now blocked for both
		ctx.logged_args = undefined;
		grandchild1.debug('hidden from gc1');
		assert.equal(ctx.logged_args, undefined);

		grandchild2.debug('hidden from gc2');
		assert.equal(ctx.logged_args, undefined);
	});

	test('root getter with alternating overrides in 5-level hierarchy', () => {
		const ctx = create_test_context();
		const l0 = new Logger('l0', {level: 'info', console: ctx.console, colors: false});
		const l1 = l0.child('l1', {level: 'warn'}); // Override at level 1
		const l2 = l1.child('l2'); // Inherits from l1
		const l3 = l2.child('l3', {level: 'debug'}); // Override at level 3
		const l4 = l3.child('l4'); // Inherits from l3

		// Verify initial state
		assert.equal(l0.level, 'info');
		assert.equal(l1.level, 'warn'); // Override
		assert.equal(l2.level, 'warn'); // Inherits from l1
		assert.equal(l3.level, 'debug'); // Override
		assert.equal(l4.level, 'debug'); // Inherits from l3

		// Change via deepest level
		l4.root.level = 'error';

		// Verify propagation stops at overrides
		assert.equal(l0.level, 'error'); // Changed
		assert.equal(l1.level, 'warn'); // Override blocks
		assert.equal(l2.level, 'warn'); // Gets from l1
		assert.equal(l3.level, 'debug'); // Override blocks
		assert.equal(l4.level, 'debug'); // Gets from l3

		// Verify actual logging behavior
		l0.error('l0 sees error');
		assert.ok(ctx.error_args);

		ctx.logged_args = undefined;
		l2.info('l2 blocked by l1 warn');
		assert.equal(ctx.logged_args, undefined); // warn level blocks info

		l4.debug('l4 can debug');
		assert.ok(ctx.logged_args);
	});

	test('root getter with all properties overridden at different levels', () => {
		const ctx1 = create_test_context();
		const ctx2 = create_test_context();
		const root = new Logger('root', {
			level: 'info',
			colors: false,
			console: ctx1.console,
		});
		const child = root.child('child', {level: 'warn'}); // Level override
		const grandchild = child.child('grandchild', {colors: true}); // Color override
		const great = grandchild.child('great', {console: ctx2.console}); // Console override

		// Verify initial state with overrides
		assert.equal(root.level, 'info');
		assert.equal(child.level, 'warn'); // Override
		assert.equal(grandchild.level, 'warn'); // Inherits from child
		assert.equal(great.level, 'warn'); // Inherits from child

		assert.equal(root.colors, false);
		assert.equal(child.colors, false); // Inherits from root
		assert.equal(grandchild.colors, true); // Override
		assert.equal(great.colors, true); // Inherits from grandchild

		assert.equal(root.console, ctx1.console);
		assert.equal(child.console, ctx1.console); // Inherits from root
		assert.equal(grandchild.console, ctx1.console); // Inherits from root
		assert.equal(great.console, ctx2.console); // Override

		// Change all via root getter from deepest level
		const ctx3 = create_test_context();
		great.root.level = 'debug';
		great.root.colors = true;
		great.root.console = ctx3.console;

		// Verify override boundaries are respected
		assert.equal(root.level, 'debug'); // Changed
		assert.equal(child.level, 'warn'); // Override blocks level change
		assert.equal(grandchild.level, 'warn'); // Gets from child's override

		assert.equal(root.colors, true); // Changed
		assert.equal(child.colors, true); // Inherits new value
		assert.equal(grandchild.colors, true); // Override blocks (same value though)

		assert.equal(root.console, ctx3.console); // Changed
		assert.equal(child.console, ctx3.console); // Inherits new console
		assert.equal(grandchild.console, ctx3.console); // Inherits new console
		assert.equal(great.console, ctx2.console); // Override blocks console change

		// Verify actual logging behavior
		root.debug('root can debug');
		assert.ok(ctx3.logged_args);

		ctx3.logged_args = undefined;
		child.debug('child blocked');
		assert.equal(ctx3.logged_args, undefined); // child has warn level (override)

		// great inherits warn level from child, so use warn (not info which would be blocked)
		great.warn('great logs to ctx2');
		assert.ok(ctx2.warn_args); // great uses its override console (ctx2)
		assert.equal(ctx3.warn_args, undefined); // not to ctx3
	});
});
