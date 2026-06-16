import {describe, test, assert} from 'vitest';

import {Logger} from '$lib/log.ts';
import {create_test_context} from './log_test_helpers.ts';

describe('Logger > Runtime Configuration', () => {
	test('can change level after construction', () => {
		const ctx = create_test_context();
		const log = new Logger('test', {level: 'warn', console: ctx.console, colors: false});

		log.info('hidden');
		assert.equal(ctx.logged_args, undefined);

		log.level = 'info';
		log.info('visible');
		assert.ok(ctx.logged_args);
	});

	test('can change colors after construction', () => {
		const log = new Logger('test', {colors: true});
		assert.equal(log.colors, true);

		log.colors = false;
		assert.equal(log.colors, false);
	});

	test('can change console after construction', () => {
		const ctx1 = create_test_context();
		const ctx2 = create_test_context();
		const log = new Logger('test', {console: ctx1.console, level: 'info'});

		log.info('to ctx1');
		assert.ok(ctx1.logged_args);

		log.console = ctx2.console;
		ctx1.logged_args = undefined;

		log.info('to ctx2');
		assert.equal(ctx1.logged_args, undefined);
		assert.ok(ctx2.logged_args);
	});

	test('level setter validates input', () => {
		const log = new Logger('test');
		assert.throws(() => {
			log.level = 'invalid' as any;
		}, /Invalid log level/);
	});

	test('level setter recomputes cached values', () => {
		const ctx = create_test_context();
		const log = new Logger('test', {console: ctx.console, colors: false, level: 'off'});

		log.error('hidden');
		assert.equal(ctx.error_args, undefined);

		log.level = 'error';
		log.error('visible');
		assert.ok(ctx.error_args);
	});

	test('colors setter recomputes labels', () => {
		const log = new Logger('test', {colors: false});

		// Initially no colors
		assert.equal(log.colors, false);

		// Enable colors
		log.colors = true;
		assert.equal(log.colors, true);

		// Disable again
		log.colors = false;
		assert.equal(log.colors, false);

		// Verify cache recomputation by checking that logs still work correctly
		const ctx = create_test_context();
		log.console = ctx.console;
		log.level = 'info';

		log.info('test');
		assert.ok(ctx.logged_args); // Should still log correctly after color changes
	});

	test('idempotent operations - setting same value multiple times', () => {
		const ctx = create_test_context();
		const log = new Logger('test', {console: ctx.console, colors: false, level: 'info'});

		// Set level to same value multiple times
		log.level = 'info';
		log.level = 'info';
		log.level = 'info';

		// Should still work correctly
		log.info('test1');
		assert.ok(ctx.logged_args);
		ctx.logged_args = undefined;

		// Set colors to same value multiple times
		log.colors = false;
		log.colors = false;
		log.colors = false;

		// Should still work correctly
		log.info('test2');
		assert.ok(ctx.logged_args);
		ctx.logged_args = undefined;

		// Change and then set to same repeatedly
		log.level = 'debug';
		log.level = 'debug';
		log.debug('test3');
		assert.ok(ctx.logged_args);
	});

	test('can override and then reset by setting parent value', () => {
		const parent = new Logger('parent', {level: 'info'});
		const child = parent.child('child');

		// Initially inherits
		assert.equal(child.level, 'info');

		// Override
		child.level = 'debug';
		assert.equal(child.level, 'debug');

		// Can't "reset" to inherit - once overridden, stays overridden
		// (This is expected behavior - override is persistent)
		child.level = 'info'; // Set to same as parent
		assert.equal(child.level, 'info');

		// But now it's still an override, not inheritance
		parent.level = 'warn';
		assert.equal(child.level, 'info'); // Still has override
	});
});

describe('Logger > Child Overrides', () => {
	test('child can override parent colors', () => {
		const parent = new Logger('parent', {colors: true});
		const child = parent.child('child', {colors: false});

		assert.equal(parent.colors, true);
		assert.equal(child.colors, false); // Child overrides
	});

	test('child can override parent console', () => {
		const ctx1 = create_test_context();
		const ctx2 = create_test_context();
		const parent = new Logger('parent', {console: ctx1.console, level: 'info'});
		const child = parent.child('child', {console: ctx2.console});

		parent.info('to ctx1');
		assert.ok(ctx1.logged_args);

		ctx1.logged_args = undefined;
		child.info('to ctx2');
		assert.equal(ctx1.logged_args, undefined);
		assert.ok(ctx2.logged_args); // Child uses own console
	});

	test('child colors override blocks parent changes', () => {
		const parent = new Logger('parent', {colors: true});
		const child = parent.child('child', {colors: false});

		assert.equal(child.colors, false);

		parent.colors = false; // Parent changes
		assert.equal(parent.colors, false);
		assert.equal(child.colors, false); // Child unchanged (still overridden)

		parent.colors = true; // Parent changes again
		assert.equal(child.colors, false); // Child still unaffected
	});

	test('child console override blocks parent changes', () => {
		const ctx1 = create_test_context();
		const ctx2 = create_test_context();
		const ctx3 = create_test_context();
		const parent = new Logger('parent', {console: ctx1.console, level: 'info'});
		const child = parent.child('child', {console: ctx2.console});

		// Child uses ctx2
		child.info('test');
		assert.ok(ctx2.logged_args);
		ctx2.logged_args = undefined;

		// Parent changes to ctx3
		parent.console = ctx3.console;

		// Child still uses ctx2 (override blocks)
		child.info('test2');
		assert.ok(ctx2.logged_args);
		assert.equal(ctx3.logged_args, undefined);
	});

	test('child with all overrides is fully isolated', () => {
		const ctx1 = create_test_context();
		const ctx2 = create_test_context();
		const parent = new Logger('parent', {level: 'info', colors: true, console: ctx1.console});
		const child = parent.child('child', {level: 'debug', colors: false, console: ctx2.console});

		assert.equal(parent.level, 'info');
		assert.equal(child.level, 'debug');
		assert.equal(parent.colors, true);
		assert.equal(child.colors, false);

		// Change parent - child unaffected
		parent.level = 'error';
		parent.colors = false;

		assert.equal(child.level, 'debug'); // Still debug
		assert.equal(child.colors, false); // Still false (but for different reason - override)
		assert.equal(child.console, ctx2.console); // Still ctx2
	});

	test('multiple children with different color overrides', () => {
		const parent = new Logger('parent', {colors: true});
		const child1 = parent.child('c1', {colors: false});
		const child2 = parent.child('c2', {colors: true});
		const child3 = parent.child('c3'); // Inherits

		assert.equal(parent.colors, true);
		assert.equal(child1.colors, false); // Override to false
		assert.equal(child2.colors, true); // Override to true
		assert.equal(child3.colors, true); // Inherits true

		// Change parent
		parent.colors = false;

		assert.equal(parent.colors, false);
		assert.equal(child1.colors, false); // Still false (override)
		assert.equal(child2.colors, true); // Still true (override)
		assert.equal(child3.colors, false); // Now false (inherited)
	});
});

describe('Logger > Cache Invalidation', () => {
	test('prefix cache invalidates when colors change', () => {
		const ctx = create_test_context();
		const log = new Logger('test', {console: ctx.console, colors: false, level: 'info'});

		// Log with colors disabled
		log.info('test1');
		assert.ok(ctx.logged_args);
		ctx.logged_args = undefined;

		// Enable colors
		log.colors = true;

		// Log with colors enabled - should still work (cache invalidated and recomputed)
		log.info('test2');
		assert.ok(ctx.logged_args);
		ctx.logged_args = undefined;

		// Toggle back and verify still works
		log.colors = false;
		log.info('test3');
		assert.ok(ctx.logged_args);
	});

	test('all log methods update after color toggle', () => {
		const ctx = create_test_context();
		const log = new Logger('test', {console: ctx.console, colors: false, level: 'debug'});

		// Test all 4 methods with colors off
		log.error('e1');
		assert.ok(ctx.error_args);
		ctx.error_args = undefined;

		log.warn('w1');
		assert.ok(ctx.warn_args);
		ctx.warn_args = undefined;

		log.info('i1');
		assert.ok(ctx.logged_args);
		ctx.logged_args = undefined;

		log.debug('d1');
		assert.ok(ctx.logged_args);
		ctx.logged_args = undefined;

		// Toggle colors
		log.colors = true;

		// Test all 4 methods with colors on - should all work
		log.error('e2');
		assert.ok(ctx.error_args);
		ctx.error_args = undefined;

		log.warn('w2');
		assert.ok(ctx.warn_args);
		ctx.warn_args = undefined;

		log.info('i2');
		assert.ok(ctx.logged_args);
		ctx.logged_args = undefined;

		log.debug('d2');
		assert.ok(ctx.logged_args);
	});

	test('level cache updates when parent level changes', () => {
		const ctx = create_test_context();
		const parent = new Logger('parent', {level: 'error', console: ctx.console, colors: false});
		const child = parent.child('child');

		// Initially child inherits error level
		child.info('hidden');
		assert.equal(ctx.logged_args, undefined);

		child.error('shown');
		assert.ok(ctx.error_args);
		ctx.error_args = undefined;

		// Change parent to info
		parent.level = 'info';

		// Child should now log info
		child.info('now visible');
		assert.ok(ctx.logged_args);
	});

	test('sequential config changes maintain correctness', () => {
		const ctx = create_test_context();
		const log = new Logger('test', {console: ctx.console, colors: false, level: 'info'});

		// Change colors -> level -> colors
		log.colors = true;
		log.level = 'debug';
		log.colors = false;

		// Verify debug level works
		log.debug('test');
		assert.ok(ctx.logged_args);
		ctx.logged_args = undefined;

		// Change level -> colors -> level
		log.level = 'warn';
		log.colors = true;
		log.level = 'info';

		// Verify info level works
		log.info('test2');
		assert.ok(ctx.logged_args);
	});

	test('child created before parent color change sees change', () => {
		const ctx = create_test_context();
		const parent = new Logger('parent', {console: ctx.console, colors: false, level: 'info'});
		const child = parent.child('child'); // Created before change

		// Verify child inherits colors=false
		assert.equal(child.colors, false);

		// Change parent colors AFTER child was created
		parent.colors = true;

		// Child should see the change
		assert.equal(child.colors, true);

		// And logging should work correctly with new colors
		child.info('test');
		assert.ok(ctx.logged_args);
	});
});
