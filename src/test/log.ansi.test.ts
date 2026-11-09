import { describe, test, assert } from 'vitest';

import { Logger, type LogConsole } from '#lib/log.ts';

const OPEN = {
	gray: '\u001b[90m',
	magenta: '\u001b[35m',
	red: '\u001b[31m',
	yellow: '\u001b[33m'
} as const;
const CLOSE = '\u001b[39m';

const create_logger = (
	label: string | undefined
): { log: Logger; lines: Array<Array<unknown>> } => {
	const lines: Array<Array<unknown>> = [];
	const console: LogConsole = {
		error: (...args) => lines.push(args),
		warn: (...args) => lines.push(args),
		log: (...args) => lines.push(args)
	};
	return { log: new Logger(label, { colors: true, console, level: 'debug' }), lines };
};

const CHARS = { error: '🞩error🞩', warn: '⚑warn⚑', debug: '┆debug┆' };

describe('Logger colored output', () => {
	test('writes the literal escape sequences of each format', () => {
		const { log, lines } = create_logger('app');
		log.error('e');
		log.warn('w');
		log.info('i');
		log.debug('d');
		const label = `${OPEN.gray}[${CLOSE}${OPEN.magenta}app${CLOSE}${OPEN.gray}]${CLOSE}`;
		assert.deepEqual(lines, [
			[`${OPEN.red}${CHARS.error}${CLOSE} ${label}`, 'e'],
			[`${OPEN.yellow}${CHARS.warn}${CLOSE} ${label}`, 'w'],
			[label, 'i'],
			[`${OPEN.gray}${CHARS.debug}${CLOSE} ${label}`, 'd']
		]);
	});

	test('unstyled text is unchanged with colors off', () => {
		const lines: Array<Array<unknown>> = [];
		const log = new Logger('a\u001b[39mb', {
			colors: false,
			level: 'info',
			console: { error: () => {}, warn: () => {}, log: (...args) => lines.push(args) }
		});
		log.info('i');
		assert.deepEqual(lines, [['[a\u001b[39mb]', 'i']]);
	});
});
