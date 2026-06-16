import {test, assert, describe} from 'vitest';

import {
	url_github_file,
	repo_url_github_owner,
	url_npm_package,
	url_logo,
	package_is_published,
	repo_name_parse,
	repo_url_parse,
} from '$lib/package_helpers.ts';

describe('url_github_file', () => {
	test('builds basic file URL', () => {
		assert.equal(
			url_github_file('https://github.com/foo/bar', 'src/index.ts'),
			'https://github.com/foo/bar/blob/main/src/index.ts',
		);
	});

	test('strips leading ./ from file path', () => {
		assert.equal(
			url_github_file('https://github.com/foo/bar', './src/index.ts'),
			'https://github.com/foo/bar/blob/main/src/index.ts',
		);
	});

	test('includes line number when provided', () => {
		assert.equal(
			url_github_file('https://github.com/foo/bar', 'src/index.ts', 42),
			'https://github.com/foo/bar/blob/main/src/index.ts#L42',
		);
	});

	test('handles nested paths', () => {
		assert.equal(
			url_github_file('https://github.com/foo/bar', 'src/lib/utils/helpers.ts'),
			'https://github.com/foo/bar/blob/main/src/lib/utils/helpers.ts',
		);
	});

	test('handles root-level files', () => {
		assert.equal(
			url_github_file('https://github.com/foo/bar', 'README.md'),
			'https://github.com/foo/bar/blob/main/README.md',
		);
	});
});

describe('repo_url_github_owner', () => {
	test('extracts owner from GitHub URL', () => {
		assert.equal(repo_url_github_owner('https://github.com/fuzdev/fuz_ui'), 'fuzdev');
	});

	test('returns null for non-GitHub URL', () => {
		assert.equal(repo_url_github_owner('https://gitlab.com/foo/bar'), null);
	});

	test('returns null for malformed GitHub URL', () => {
		assert.equal(repo_url_github_owner('https://github.com/'), null);
	});

	test('handles URLs with trailing content', () => {
		assert.equal(repo_url_github_owner('https://github.com/owner/repo/tree/main'), 'owner');
	});

	test('returns null for http (non-https) URL', () => {
		assert.equal(repo_url_github_owner('http://github.com/foo/bar'), null);
	});
});

describe('url_npm_package', () => {
	test('builds URL for unscoped package', () => {
		assert.equal(url_npm_package('lodash'), 'https://www.npmjs.com/package/lodash');
	});

	test('builds URL for scoped package', () => {
		assert.equal(url_npm_package('@fuzdev/fuz_ui'), 'https://www.npmjs.com/package/@fuzdev/fuz_ui');
	});
});

describe('url_logo', () => {
	test('resolves logo relative to homepage', () => {
		assert.equal(url_logo('https://fuz.dev', 'logo.svg'), 'https://fuz.dev/logo.svg');
	});

	test('keeps an existing trailing slash on the homepage', () => {
		assert.equal(url_logo('https://fuz.dev/', 'logo.svg'), 'https://fuz.dev/logo.svg');
	});

	test('strips a leading slash from the logo path', () => {
		assert.equal(url_logo('https://fuz.dev', '/logo.svg'), 'https://fuz.dev/logo.svg');
	});

	test('falls back to favicon.png when logo is undefined', () => {
		assert.equal(url_logo('https://fuz.dev', undefined), 'https://fuz.dev/favicon.png');
	});

	test('returns null without a homepage', () => {
		assert.equal(url_logo(null, 'logo.svg'), null);
	});
});

describe('package_is_published', () => {
	test('returns true for published package', () => {
		assert.equal(
			package_is_published({
				name: 'my-package',
				version: '1.0.0',
				exports: {'.': './index.js'},
			}),
			true,
		);
	});

	test('returns false for private package', () => {
		assert.equal(
			package_is_published({
				name: 'my-package',
				version: '1.0.0',
				private: true,
				exports: {'.': './index.js'},
			}),
			false,
		);
	});

	test('returns false for package without exports', () => {
		assert.equal(
			package_is_published({
				name: 'my-package',
				version: '1.0.0',
			}),
			false,
		);
	});

	test('returns false for initial version 0.0.1', () => {
		assert.equal(
			package_is_published({
				name: 'my-package',
				version: '0.0.1',
				exports: {'.': './index.js'},
			}),
			false,
		);
	});

	test('returns true for version 0.0.2', () => {
		assert.equal(
			package_is_published({
				name: 'my-package',
				version: '0.0.2',
				exports: {'.': './index.js'},
			}),
			true,
		);
	});
});

describe('repo_name_parse', () => {
	test('returns name for unscoped package', () => {
		assert.equal(repo_name_parse('lodash'), 'lodash');
	});

	test('extracts name from scoped package', () => {
		assert.equal(repo_name_parse('@fuzdev/fuz_ui'), 'fuz_ui');
	});

	test('throws for malformed scoped package', () => {
		assert.throws(() => repo_name_parse('@fuzdev'), /invalid scoped package name/);
	});

	test('handles package names with hyphens', () => {
		assert.equal(repo_name_parse('@org/my-package-name'), 'my-package-name');
	});
});

describe('repo_url_parse', () => {
	test('returns null for undefined', () => {
		assert.equal(repo_url_parse(undefined), null);
	});

	test('handles string URL directly', () => {
		assert.equal(repo_url_parse('https://github.com/foo/bar'), 'https://github.com/foo/bar');
	});

	test('extracts URL from object format', () => {
		assert.equal(
			repo_url_parse({type: 'git', url: 'https://github.com/foo/bar'}),
			'https://github.com/foo/bar',
		);
	});

	test('strips git+ prefix', () => {
		assert.equal(repo_url_parse('git+https://github.com/foo/bar'), 'https://github.com/foo/bar');
	});

	test('strips .git suffix', () => {
		assert.equal(repo_url_parse('https://github.com/foo/bar.git'), 'https://github.com/foo/bar');
	});

	test('strips both git+ prefix and .git suffix', () => {
		assert.equal(
			repo_url_parse({type: 'git', url: 'git+https://github.com/foo/bar.git'}),
			'https://github.com/foo/bar',
		);
	});

	test('strips trailing slash', () => {
		assert.equal(repo_url_parse('https://github.com/foo/bar/'), 'https://github.com/foo/bar');
	});

	test('strips a .git suffix even with a trailing slash', () => {
		assert.equal(repo_url_parse('https://github.com/foo/bar.git/'), 'https://github.com/foo/bar');
	});

	test('returns null for object without url', () => {
		assert.equal(repo_url_parse({type: 'git'} as any), null);
	});
});
