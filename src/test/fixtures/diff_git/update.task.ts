/**
 * Regenerates `diff_git_fixtures.json` by running the installed git on each
 * text pair and on a scratch repository, recording every capture's exact
 * command. git runs on gro's spawn host module with a fixed environment
 * (no host `GIT_*`, no user or system config), so only the flags shown in
 * each command apply and every write stays in a fresh temp directory.
 * Review the JSON diff as the assertion it is: a different git version may
 * place regions differently.
 *
 * @module
 */

import type { Task } from '@fuzdev/gro';
import { spawn_result_is_ok, to_spawn_result_message } from '@fuzdev/gro/cli.ts';
import { fs, type FsDir } from '@fuzdev/gro/fs.ts';
import { to_git_program } from '@fuzdev/gro/git.ts';
import { spawn, type SpawnProgram } from '@fuzdev/gro/spawn.ts';

/**
 * The flags zzz's producer passes: git's histogram diff with the indent
 * heuristic, over exact text (no textconv, no external differ, no color).
 */
const DIFF_FLAGS = [
	'--no-color',
	'--no-ext-diff',
	'--no-textconv',
	'--diff-algorithm=histogram',
	'--indent-heuristic'
];

/**
 * git's environment: gro's base set plus these, so no `GIT_*` from the host
 * (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` in a hook or `rebase --exec`)
 * can point the scratch repository's writes at another, and no user or
 * system config changes the output.
 */
const GIT_ENV = {
	GIT_CONFIG_GLOBAL: '/dev/null',
	GIT_CONFIG_NOSYSTEM: '1',
	LC_ALL: 'C'
};

const CODE_A = `import {foo} from './foo.ts';

export const add = (a: number, b: number): number => {
	return a + b;
};

export const sub = (a: number, b: number): number => {
	return a - b;
};

export const mul = (a: number, b: number): number => {
	return a * b;
};

export const div = (a: number, b: number): number => {
	return a / b;
};

const unused = 1;

export const neg = (a: number): number => -a;
`;

const CODE_B = `import {foo} from './foo.ts';
import {bar} from './bar.ts';

export const add = (a: number, b: number): number => {
	return a + b;
};

export const mul = (a: number, b: number): number => {
	const product = a * b;
	return product;
};

export const div = (a: number, b: number): number => {
	return a / b;
};

export const neg = (a: number): number => -a;

export const abs = (a: number): number => Math.abs(a);
`;

const numbered = (n: number, f: (i: number) => string): string =>
	Array.from({ length: n }, (_, i) => f(i + 1)).join('');

interface CaseInput {
	name: string;
	a: string;
	b: string;
	/** `-c` config passed before `diff`, for output a config changes. */
	config?: Array<string>;
}

const CASES: Array<CaseInput> = [
	{ name: 'code_edit', a: CODE_A, b: CODE_B },
	// the indent heuristic slides the insertion to start at a `{`, where
	// `diff_lines` keeps it after the matching `}`
	{
		name: 'slider',
		a: '{\n  a\n}\n{\n  b\n}\n',
		b: '{\n  a\n}\n{\n  new\n}\n{\n  b\n}\n'
	},
	{ name: 'newline_added', a: 'one\ntwo\nthree', b: 'one\ntwo\nthree\n' },
	{ name: 'newline_removed', a: 'one\ntwo\nthree\n', b: 'one\ntwo\nthree' },
	{ name: 'both_unterminated_last_changed', a: 'one\ntwo\nthree', b: 'one\ntwo\nTHREE' },
	{
		name: 'both_unterminated_middle_changed',
		a: numbered(10, (i) => `line ${i}\n`) + 'end',
		b: numbered(10, (i) => (i === 3 ? 'changed\n' : `line ${i}\n`)) + 'end'
	},
	{ name: 'unterminated_append', a: 'one\ntwo', b: 'one\ntwo\nthree\n' },
	{ name: 'single_unterminated_to_empty', a: 'only', b: '' },
	{ name: 'created', a: '', b: 'first\nsecond\n' },
	{ name: 'deleted', a: 'first\nsecond\n', b: '' },
	{
		name: 'insert_at_start',
		a: numbered(8, (i) => `l${i}\n`),
		b: 'new0\n' + numbered(8, (i) => `l${i}\n`)
	},
	{ name: 'delete_at_end', a: numbered(8, (i) => `l${i}\n`), b: numbered(6, (i) => `l${i}\n`) },
	{
		name: 'far_apart',
		a: numbered(30, (i) => `l${i}\n`),
		b: numbered(30, (i) => (i === 2 || i === 29 ? `L${i}\n` : `l${i}\n`))
	},
	{
		name: 'near_merge',
		a: numbered(20, (i) => `l${i}\n`),
		b: numbered(20, (i) => (i === 5 || i === 11 ? `L${i}\n` : `l${i}\n`))
	},
	{
		name: 'merge_gap_6',
		a: numbered(20, (i) => `l${i}\n`),
		b: numbered(20, (i) => (i === 5 || i === 12 ? `L${i}\n` : `l${i}\n`))
	},
	{
		name: 'merge_gap_7',
		a: numbered(20, (i) => `l${i}\n`),
		b: numbered(20, (i) => (i === 5 || i === 13 ? `L${i}\n` : `l${i}\n`))
	},
	{ name: 'crlf', a: 'one\r\ntwo\r\nthree\r\n', b: 'one\r\nTWO\r\nthree\r\n' },
	{ name: 'blank_lines', a: '\n\n\nx\n\n\n', b: '\n\nx\n\n\n\n' },
	// an empty context line prints as an empty row, not a lone space
	{
		name: 'suppress_blank_empty',
		a: 'x\n\ny\n\nz\n',
		b: 'x\n\nY\n\nz\n',
		config: ['diff.suppressBlankEmpty=true']
	},
	{
		name: 'diff_like_text',
		a: '--- a\n+++ b\n@@ -1 +1 @@\n-x\n+y\n',
		b: '--- a\n+++ c\n@@ -1 +1 @@\n-x\n+z\n'
	}
];

/**
 * Runs git in `cwd`, returning stdout. Any exit but 0 throws, unless
 * `differs_ok` admits the 1 that `git diff` exits with when its inputs
 * differ, with nothing on stderr.
 */
const run_git = async (
	git: SpawnProgram,
	cwd: FsDir,
	args: Array<string>,
	differs_ok = false
): Promise<string> => {
	const result = await git.out(args, { cwd });
	// a diff that errors exits 1 too, but says why on stderr
	const differs =
		differs_ok && result.kind === 'exited' && result.code === 1 && result.stderr === '';
	if ((spawn_result_is_ok(result) || differs) && !result.truncated) return result.stdout;
	throw Error(
		`git ${args.join(' ')} failed with ${to_spawn_result_message(result)}` +
			(result.truncated ? ', its output truncated' : '') +
			(result.stderr ? `: ${result.stderr.trim()}` : '')
	);
};

interface Capture {
	command: string;
	patch: string;
}

const capture = async (git: SpawnProgram, cwd: FsDir, args: Array<string>): Promise<Capture> => ({
	command: ['git', ...args].join(' '),
	patch: await run_git(git, cwd, args, true)
});

const capture_cases = async (git: SpawnProgram) => {
	await using dir = await fs.temp_dir('fuz_util-diff-git-');
	const cases = [];
	for (const c of CASES) {
		await dir.write('a.txt', c.a);
		await dir.write('b.txt', c.b);
		const args = (context: number): Array<string> => [
			...(c.config ?? []).flatMap((config) => ['-c', config]),
			'diff',
			'--no-index',
			...DIFF_FLAGS,
			`-U${context}`,
			'a.txt',
			'b.txt'
		];
		const u0 = await capture(git, dir, args(0));
		const u3 = await capture(git, dir, args(3));
		cases.push({
			name: c.name,
			a: c.a,
			b: c.b,
			command_u0: u0.command,
			u0: u0.patch,
			command_u3: u3.command,
			u3: u3.patch
		});
	}
	return cases;
};

const RENAME_A = numbered(12, (i) => `row ${i}\n`);
const RENAME_B = numbered(12, (i) => (i === 6 ? 'row six\n' : `row ${i}\n`));

/**
 * Patches that need a repository (rename, mode change, binary, new and
 * deleted files) or that print something other than a line diff.
 */
const capture_patches = async (git: SpawnProgram): Promise<Record<string, Capture>> => {
	await using dir = await fs.temp_dir('fuz_util-diff-git-');
	const run = (...args: Array<string>): Promise<string> => run_git(git, dir, args);
	await run('init', '-q');
	await run('config', 'user.email', 'fixture@example.com');
	await run('config', 'user.name', 'fixture');
	await dir.write('old_name.txt', RENAME_A);
	await dir.write('image.bin', new Uint8Array([0, 1, 2, 3, 0, 255]));
	await dir.write('gone.txt', 'bye\n');
	await dir.write('indented.txt', '  a\n  b\n  c\n');
	await run('add', '-A');
	await run('commit', '-qm', 'one');
	await run('mv', 'old_name.txt', 'new_name.txt');
	await dir.write('new_name.txt', RENAME_B);
	await dir.set_mode('new_name.txt', 0o755);
	await dir.write('image.bin', new Uint8Array([0, 9, 2, 3, 0, 255]));
	await dir.write('added.txt', 'hi\n');
	await dir.write('indented.txt', '  a\n  B x\n  c\n');
	await run('rm', '-q', 'gone.txt');
	await run('add', '-A');
	const diff = (...args: Array<string>): Promise<Capture> =>
		capture(git, dir, ['diff', '--cached', ...DIFF_FLAGS, '-M', ...args]);
	return {
		rename_mode_u3: await diff('-U3', '--', 'old_name.txt', 'new_name.txt'),
		rename_mode_u0: await diff('-U0', '--', 'old_name.txt', 'new_name.txt'),
		binary: await diff('--', 'image.bin'),
		added_file: await diff('--', 'added.txt'),
		deleted_file: await diff('--', 'gone.txt'),
		deleted_file_irreversible: await diff('-D', '--', 'gone.txt'),
		word_diff_u3: await diff('--word-diff', '-U3', '--', 'indented.txt'),
		word_diff_u0: await diff('--word-diff', '-U0', '--', 'indented.txt')
	};
};

export const task: Task = {
	summary: 'capture real git diffs into the diff fixtures',
	run: async ({ log }) => {
		const git = to_git_program(spawn, { env: GIT_ENV });
		const out_dir = await fs.open_dir(import.meta.dirname);
		const git_version = (await run_git(git, out_dir, ['--version'])).trim();
		const fixtures = {
			git_version,
			cases: await capture_cases(git),
			patches: await capture_patches(git),
			files: { rename_a: RENAME_A, rename_b: RENAME_B }
		};
		await out_dir.write('diff_git_fixtures.json', JSON.stringify(fixtures, null, '\t') + '\n');
		log.info(`wrote ${out_dir.path}/diff_git_fixtures.json with ${git_version}`);
	}
};
