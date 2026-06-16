import {test, assert, describe} from 'vitest';

import {pkg_json_keys, pkg_json_from_package_json} from '../lib/pkg_json.ts';

// `pkg_json_keys` is the allowlist `vite_plugin_pkg_json` strips package.json down
// to. These fields must NEVER appear in it — they'd ship to the client bundle.
const FOOTGUN_KEYS = [
	'scripts',
	'dependencies',
	'devDependencies',
	'peerDependencies',
	'peerDependenciesMeta',
	'optionalDependencies',
	'engines',
	'bin',
	'files',
	'os',
	'cpu',
];

const keys: ReadonlyArray<string> = pkg_json_keys;

test('pkg_json_keys excludes every footgun field', () => {
	for (const key of FOOTGUN_KEYS) {
		assert.ok(!keys.includes(key), `${key} must not be in pkg_json_keys`);
	}
});

test('pkg_json_keys keeps package identity', () => {
	for (const key of ['name', 'version', 'glyph', 'repository', 'homepage']) {
		assert.ok(keys.includes(key), `${key} must be in pkg_json_keys`);
	}
});

describe('pkg_json_from_package_json', () => {
	test('drops every footgun field', () => {
		const result = pkg_json_from_package_json({
			name: 'p',
			version: '1.0.0',
			scripts: {build: 'x'},
			dependencies: {a: '1'},
			devDependencies: {b: '2'},
			engines: {node: '>=22'},
			files: ['dist'],
		});
		for (const key of FOOTGUN_KEYS) {
			assert.ok(!(key in result), `${key} must be stripped`);
		}
	});

	test('keeps curated identity and Fuz extension fields', () => {
		const result = pkg_json_from_package_json({
			name: '@fuzdev/fuz_ui',
			version: '1.0.0',
			glyph: '🦊',
			homepage: 'https://fuz.dev',
		});
		assert.equal(result.name, '@fuzdev/fuz_ui');
		assert.equal(result.version, '1.0.0');
		assert.equal(result.glyph, '🦊');
		assert.equal(result.homepage, 'https://fuz.dev');
	});

	test('skips undefined keys rather than emitting holes', () => {
		const result = pkg_json_from_package_json({name: 'p', version: '1.0.0'});
		assert.ok(!('homepage' in result));
		assert.ok(!('glyph' in result));
	});

	test('is idempotent on an already-curated PkgJson', () => {
		const once = pkg_json_from_package_json({
			name: 'p',
			version: '1.0.0',
			private: true,
			exports: {'.': './index.js'},
		});
		assert.deepEqual(pkg_json_from_package_json(once as any), once);
	});

	test('a custom keys list overrides the default allowlist', () => {
		const source = {name: 'p', version: '1.0.0', keywords: ['a'], glyph: '🦊'};

		// default keys: keywords is not curated, so it's dropped
		assert.ok(!('keywords' in pkg_json_from_package_json(source)));

		// widened keys: keywords survives, default fields still kept
		const widened = pkg_json_from_package_json(source, [...pkg_json_keys, 'keywords']);
		assert.deepEqual((widened as any).keywords, ['a']);
		assert.equal(widened.glyph, '🦊');

		// narrowed keys: only the listed fields survive
		const narrowed = pkg_json_from_package_json(source, ['name', 'version']);
		assert.deepEqual(Object.keys(narrowed), ['name', 'version']);
	});
});
