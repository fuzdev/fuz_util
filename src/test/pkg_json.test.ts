import {test, assert} from 'vitest';

import {pkg_json_keys} from '$lib/pkg_json.ts';

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
