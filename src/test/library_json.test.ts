import {test, assert, describe} from 'vitest';

import {library_json_from_modules} from '$lib/library_json.ts';

describe('library_json_from_modules', () => {
	test('curates package_json to the publish-safe subset', () => {
		const library_json = library_json_from_modules(
			{
				name: '@fuzdev/fuz_ui',
				version: '1.0.0',
				scripts: {build: 'x'},
				dependencies: {a: '1'},
			},
			undefined,
		);
		assert.equal(library_json.pkg_json.name, '@fuzdev/fuz_ui');
		assert.ok(!('scripts' in library_json.pkg_json), 'scripts must be stripped');
		assert.ok(!('dependencies' in library_json.pkg_json), 'dependencies must be stripped');
	});

	test('wraps modules in source_json', () => {
		const modules = [{path: 'index.ts'}] as any;
		const library_json = library_json_from_modules({name: 'p', version: '1.0.0'}, modules);
		assert.equal(library_json.source_json.modules, modules);
	});

	test('accepts undefined modules', () => {
		const library_json = library_json_from_modules({name: 'p', version: '1.0.0'}, undefined);
		assert.equal(library_json.source_json.modules, undefined);
	});
});
