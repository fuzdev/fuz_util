import {test, assert} from 'vitest';

import {PackageJson, PackageJsonExports} from '$lib/package_json.ts';

test('PackageJson.parse', () => {
	PackageJson.parse({name: 'abc', version: '123'});
});

test('PackageJson.parse fails with bad data', () => {
	let err;
	try {
		PackageJson.parse({version: '123'});
	} catch (_err) {
		err = _err;
	}
	assert.ok(err);
});

test('`PackageJsonExports` parses simple string exports', () => {
	const exports = {
		'.': './index.js',
		'./lib': './lib/index.js',
	};
	const parsed = PackageJsonExports.safeParse(exports);
	assert.ok(parsed.success);
	assert.deepEqual(exports, parsed.data);
});

test('`PackageJsonExports` parses null exports', () => {
	const exports = {
		'.': './index.js',
		'./internal/*': null,
	};
	const parsed = PackageJsonExports.safeParse(exports);
	assert.ok(parsed.success);
	assert.deepEqual(exports, parsed.data);
});

test('`PackageJsonExports` parses basic conditional exports', () => {
	const exports = {
		'.': {
			import: './index.mjs',
			require: './index.cjs',
			default: './index.js',
		},
	};
	const parsed = PackageJsonExports.safeParse(exports);
	assert.ok(parsed.success);
	assert.deepEqual(exports, parsed.data);
});

test('`PackageJsonExports` parses nested conditional exports', () => {
	const exports = {
		'./feature': {
			node: {
				import: './feature-node.mjs',
				require: './feature-node.cjs',
			},
			default: './feature.mjs',
		},
	};
	const parsed = PackageJsonExports.safeParse(exports);
	assert.ok(parsed.success);
	assert.deepEqual(exports, parsed.data);
});

test('`PackageJsonExports` parses deeply nested conditional exports', () => {
	const exports = {
		'./advanced': {
			node: {
				development: {
					import: './dev-node.mjs',
					require: './dev-node.cjs',
				},
				production: {
					import: './prod-node.mjs',
					require: './prod-node.cjs',
				},
			},
			default: './feature.mjs',
		},
	};
	const parsed = PackageJsonExports.safeParse(exports);
	assert.ok(parsed.success);
	assert.deepEqual(exports, parsed.data);
});

test('`PackageJsonExports` parses mixed exports types', () => {
	const exports = {
		'.': './index.js',
		'./lib': {
			node: './lib/node.js',
			default: './lib/index.js',
		},
		'./feature/*': null,
		'./advanced': {
			node: {
				import: './advanced-node.mjs',
				require: './advanced-node.cjs',
			},
		},
	};
	const parsed = PackageJsonExports.safeParse(exports);
	assert.ok(parsed.success);
	assert.deepEqual(exports, parsed.data);
});

test('rejects invalid exports', () => {
	const invalid_exports = [
		{
			'.': true, // boolean is not a valid export value
		},
		{
			'.': ['/path'], // array is not a valid export value
		},
		{
			'.': {
				default: true, // boolean is not a valid export value in conditions
			},
		},
		{
			'.': {
				node: {
					import: ['/path'], // array is not a valid nested export value
				},
			},
		},
	];

	for (const invalid_export of invalid_exports) {
		const parsed = PackageJsonExports.safeParse(invalid_export);
		assert.ok(!parsed.success);
	}
});
