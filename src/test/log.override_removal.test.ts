import { describe, test, assert } from 'vitest';

import { Logger } from '$lib/log.ts';
import { create_test_context } from './log_test_helpers.ts';

describe('Logger > Override Removal', () => {
	test('clear_level_override restores parent inheritance', () => {
		const ctx = create_test_context();
		const parent = new Logger('parent', { level: 'warn', console: ctx.console, colors: false });
		const child = parent.child('child', { level: 'info' }); // Override

		// Child has override
		assert.equal(child.level, 'info');

		// Remove override
		child.clear_level_override();

		// Child now inherits from parent
		assert.equal(child.level, 'warn');

		// Verify it's truly inheriting (dynamic)
		parent.level = 'debug';
		assert.equal(child.level, 'debug');
	});

	test('clear_colors_override restores parent inheritance', () => {
		const parent = new Logger('parent', { colors: false });
		const child = parent.child('child', { colors: true }); // Override

		// Child has override
		assert.equal(child.colors, true);

		// Remove override
		child.clear_colors_override();

		// Child now inherits from parent
		assert.equal(child.colors, false);

		// Verify it's truly inheriting (dynamic)
		parent.colors = true;
		assert.equal(child.colors, true);
	});

	test('clear_console_override restores parent inheritance', () => {
		const ctx1 = create_test_context();
		const ctx2 = create_test_context();
		const parent = new Logger('parent', { console: ctx1.console, level: 'info', colors: false });
		const child = parent.child('child', { console: ctx2.console }); // Override

		// Child has override
		assert.equal(child.console, ctx2.console);

		// Remove override
		child.clear_console_override();

		// Child now inherits from parent
		assert.equal(child.console, ctx1.console);

		// Verify actual logging works
		child.info('test');
		assert.ok(ctx1.logged_args);
		assert.equal(ctx2.logged_args, undefined);
	});

	test('clear_level_override on root logger uses default', () => {
		const log = new Logger('root', { level: 'error' });

		assert.equal(log.level, 'error');

		log.clear_level_override();

		// Should now use default level (depends on environment)
		// In VITEST it's 'off', otherwise 'debug' (DEV) or 'info' (PROD)
		const validLevels = ['off', 'error', 'warn', 'info', 'debug'];
		assert.ok(validLevels.includes(log.level));
		assert.notEqual(log.level, 'error'); // Should be different from our override
	});

	test('clear_colors_override on root logger uses default', () => {
		const log = new Logger('root', { colors: false });

		assert.equal(log.colors, false);

		log.clear_colors_override();

		// Should now use default colors (depends on NO_COLOR env)
		assert.equal(typeof log.colors, 'boolean');
	});

	test('clear_console_override on root logger uses global console', () => {
		const ctx = create_test_context();
		const log = new Logger('root', { console: ctx.console });

		assert.equal(log.console, ctx.console);

		log.clear_console_override();

		// Should now use global console
		assert.notEqual(log.console, ctx.console);
		assert.equal(log.console, console);
	});

	test('clearing non-existent override is safe', () => {
		const parent = new Logger('parent', { level: 'info' });
		const child = parent.child('child'); // No override

		assert.equal(child.level, 'info'); // Inherits from parent

		// This should be safe (no-op)
		child.clear_level_override();

		assert.equal(child.level, 'info'); // Still inherits
	});

	test('clearing override in middle of chain affects descendants', () => {
		const root = new Logger('root', { level: 'info' });
		const child = root.child('child', { level: 'warn' }); // Override
		const grandchild = child.child('grandchild');

		// Grandchild inherits from child's override
		assert.equal(grandchild.level, 'warn');

		// Remove child's override
		child.clear_level_override();

		// Now child and grandchild inherit from root
		assert.equal(child.level, 'info');
		assert.equal(grandchild.level, 'info');

		// Verify dynamic inheritance works
		root.level = 'debug';
		assert.equal(child.level, 'debug');
		assert.equal(grandchild.level, 'debug');
	});

	test('clearing override works with root getter', () => {
		const ctx = create_test_context();
		const root = new Logger('root', { level: 'warn', console: ctx.console, colors: false });
		const child = root.child('child', { level: 'info' }); // Override
		const grandchild = child.child('grandchild');

		// Grandchild inherits from child's override
		assert.equal(grandchild.level, 'info');

		// Change root via grandchild.root
		grandchild.root.level = 'debug';

		// Child still has override, grandchild gets from child
		assert.equal(child.level, 'info'); // Override blocks
		assert.equal(grandchild.level, 'info');

		// Clear child's override
		child.clear_level_override();

		// Now both inherit from root
		assert.equal(child.level, 'debug');
		assert.equal(grandchild.level, 'debug');
	});

	test('clear_level_override invalidates level cache', () => {
		const ctx = create_test_context();
		const parent = new Logger('parent', { level: 'warn', console: ctx.console, colors: false });
		const child = parent.child('child', { level: 'info' });

		// Info is visible with child's override
		child.info('visible');
		assert.ok(ctx.logged_args);

		// Clear override
		ctx.logged_args = undefined;
		child.clear_level_override();

		// Info should now be blocked (inherits warn from parent)
		child.info('hidden');
		assert.equal(ctx.logged_args, undefined);

		// Warn should work
		child.warn('shown');
		assert.ok(ctx.warn_args);
	});

	test('clear_colors_override invalidates prefix cache', () => {
		const ctx = create_test_context();
		const parent = new Logger('parent', { colors: false, console: ctx.console, level: 'info' });
		const child = parent.child('child', { colors: true }); // Override with colors

		// Child uses colors
		assert.equal(child.colors, true);

		// Clear override
		child.clear_colors_override();

		// Child now inherits no-colors from parent
		assert.equal(child.colors, false);

		// Verify logging works (prefix cache was invalidated)
		child.info('test');
		assert.ok(ctx.logged_args);
	});

	test('multiple override removals in sequence', () => {
		const ctx1 = create_test_context();
		const ctx2 = create_test_context();
		const parent = new Logger('parent', {
			level: 'warn',
			colors: false,
			console: ctx1.console
		});
		const child = parent.child('child', {
			level: 'info',
			colors: true,
			console: ctx2.console
		});

		// Verify overrides
		assert.equal(child.level, 'info');
		assert.equal(child.colors, true);
		assert.equal(child.console, ctx2.console);

		// Clear all overrides
		child.clear_level_override();
		child.clear_colors_override();
		child.clear_console_override();

		// All should now inherit from parent
		assert.equal(child.level, 'warn');
		assert.equal(child.colors, false);
		assert.equal(child.console, ctx1.console);
	});

	test('clearing and re-setting override', () => {
		const parent = new Logger('parent', { level: 'warn' });
		const child = parent.child('child', { level: 'info' }); // Override

		assert.equal(child.level, 'info');

		// Clear override
		child.clear_level_override();
		assert.equal(child.level, 'warn'); // Inherits

		// Set new override
		child.level = 'debug';
		assert.equal(child.level, 'debug'); // New override

		// Parent change doesn't affect child
		parent.level = 'error';
		assert.equal(child.level, 'debug'); // Still has override
	});
});
