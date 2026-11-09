import { describe, test, assert } from 'vitest';
import { spawnSync } from 'node:child_process';

const LOG_URL = new URL('../lib/log.ts', import.meta.url).href;

// runs in a child, since the test runner itself needs `process`
const run_without_process = (
	body: string
): { status: number | null; stdout: string; stderr: string } => {
	const script = `delete globalThis.process;\nconst {Logger} = await import(${JSON.stringify(LOG_URL)});\n${body}`;
	return spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
		encoding: 'utf8'
	});
};

describe('log.ts without a `process` global', () => {
	test('loads and logs', () => {
		const { status, stdout, stderr } = run_without_process(`
			const out = [];
			const log = new Logger('x', {colors: true, console: {log: (...a) => out.push(a), error() {}, warn() {}}});
			log.info('hi');
			console.log(JSON.stringify({level: log.level, colors: new Logger('y').colors, out}));
		`);
		assert.strictEqual(status, 0, stderr);
		const parsed = JSON.parse(stdout);
		assert.isString(parsed.level);
		assert.strictEqual(parsed.colors, true);
		assert.deepEqual(parsed.out[0][1], 'hi');
	});
});
