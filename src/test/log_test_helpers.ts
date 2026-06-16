import {Logger, type LogConsole} from '$lib/log.ts';

const log = new Logger();

export interface TestContext {
	logged_args?: Array<unknown>;
	error_args?: Array<unknown>;
	warn_args?: Array<unknown>;
	console: LogConsole;
}

export const create_test_context = (): TestContext => {
	const ctx: TestContext = {
		logged_args: undefined,
		error_args: undefined,
		warn_args: undefined,
		console: {
			error: (...args: Array<unknown>) => {
				ctx.error_args = args;
				log.debug('error_args', args);
			},
			warn: (...args: Array<unknown>) => {
				ctx.warn_args = args;
				log.debug('warn_args', args);
			},
			log: (...args: Array<unknown>) => {
				ctx.logged_args = args;
				log.debug('logged_args', args);
			},
		},
	};
	return ctx;
};
