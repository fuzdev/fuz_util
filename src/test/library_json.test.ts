import {test, assert, describe} from 'vitest';

import {library_json_from_modules} from '../lib/library_json.ts';
import {pkg_json_keys} from '../lib/pkg_json.ts';

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

	test('a custom keys list widens the curated subset', () => {
		const source = {name: 'p', version: '1.0.0', keywords: ['a']};

		// default keys drop keywords
		assert.ok(!('keywords' in library_json_from_modules(source, undefined).pkg_json));

		// shared widened list keeps keywords through the re-strip
		const library_json = library_json_from_modules(source, undefined, [
			...pkg_json_keys,
			'keywords',
		]);
		assert.deepEqual((library_json.pkg_json as any).keywords, ['a']);
	});
});
