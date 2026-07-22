import { styleText } from 'node:util';
import { DEV } from 'esm-env';

/**
 * Log level hierarchy from least to most verbose.
 * - `'off'`: No logging
 * - `'error'`: Only errors
 * - `'warn'`: Errors and warnings
 * - `'info'`: Errors, warnings, and info (default)
 * - `'debug'`: All messages including debug
 */
export type LogLevel = 'off' | 'error' | 'warn' | 'info' | 'debug';

/**
 * Console interface subset used by `Logger` for output.
 * Allows custom console implementations for testing.
 */
export type LogConsole = Pick<typeof console, 'error' | 'warn' | 'log'>;

const CHAR_ERROR = '🞩';
const CHAR_WARN = '⚑';
// Info logs have no character prefix - they only show the label.
// This is by design: info is the "default" log level for standard output,
// so it gets minimal visual noise. Error, warn, and debug have distinctive
// prefixes to make them stand out from normal info logs.
const CHAR_DEBUG = '┆';

// Pre-computed method prefix strings
const PREFIX_ERROR = `${CHAR_ERROR}error${CHAR_ERROR}`;
const PREFIX_WARN = `${CHAR_WARN}warn${CHAR_WARN}`;
// Info has no prefix - see CHAR_DEBUG comment above
const PREFIX_DEBUG = `${CHAR_DEBUG}debug${CHAR_DEBUG}`;

const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
	off: 0,
	error: 1,
	warn: 2,
	info: 3,
	debug: 4
};

/**
 * Converts a log level to its numeric value for comparison.
 * Higher numbers indicate more verbose logging.
 * @returns numeric value (0-4)
 */
export const log_level_to_number = (level: LogLevel): number => LOG_LEVEL_VALUES[level];

/**
 * Parses and validates a log level string.
 * @returns the validated log level, or `undefined` if `value` is `undefined`
 * @throws Error if `value` is provided but invalid
 */
export const log_level_parse = (value: string | undefined): LogLevel | undefined => {
	if (!value) return undefined;
	if (value in LOG_LEVEL_VALUES) return value as LogLevel;
	throw new Error(`Invalid log level: '${value}'`);
};

const DEFAULT_LOG_LEVEL: LogLevel =
	(typeof process === 'undefined' ? undefined : log_level_parse(process.env.PUBLIC_LOG_LEVEL)) ??
	(process.env.VITEST ? 'off' : DEV ? 'debug' : 'info');

// Identity function for when colors are disabled
const NO_COLOR_ST: typeof styleText = (_: string | Array<string>, s: string) => s;

/**
 * Simple, flexible logger with support for child loggers and automatic context.
 *
 * Features:
 * - Instance-based configuration (no global state)
 * - Child loggers with automatic label concatenation
 * - Parent chain inheritance for level, console, and colors
 * - Respects NO_COLOR environment variable
 *
 * @example
 * ```ts
 * // Basic logger
 * const log = new Logger('app');
 * log.info('starting'); // [app] ➤ starting
 *
 * // Child logger
 * const db_log = log.child('db');
 * db_log.info('connected'); // [app:db] ➤ connected
 *
 * // Custom configuration
 * const verbose_log = new Logger('debug', { level: 'debug', colors: true });
 * ```
 */
export class Logger {
	readonly label?: string;
	readonly parent?: Logger;

	// Private override fields (undefined = inherit from parent)
	#level_override?: LogLevel;
	#colors_override?: boolean;
	#console_override?: LogConsole;

	// Lazy cache for formatted prefixes (individually cached and invalidated when colors change)
	#cached_colors?: boolean;
	#cached_st?: typeof styleText;
	#cached_error?: string;
	#cached_warn?: string;
	#cached_info?: string;
	#cached_debug?: string;

	#cached_level_string?: LogLevel;
	#cached_level?: number;

	/**
	 * Creates a new Logger instance.
	 *
	 * @param label - optional label for this logger. Can be `undefined` for no label, or an
	 *   empty string `''` which is functionally equivalent (both produce no brackets in output).
	 *   Note: Empty strings are only allowed for root loggers - child loggers cannot have empty labels.
	 * @param options - optional configuration for level, colors, and console
	 */
	constructor(label?: string, options: LoggerOptions = {}) {
		this.label = label;
		this.parent = (options as InternalLoggerOptions).parent;

		// Set overrides if provided (undefined = inherit from parent)
		if (options.level !== undefined) {
			log_level_parse(options.level); // throws if invalid
			this.#level_override = options.level;
		}
		if (options.colors !== undefined) {
			this.#colors_override = options.colors;
		}
		if (options.console !== undefined) {
			this.#console_override = options.console;
		}
	}

	/**
	 * Dynamic getter for level - checks override, then parent, then default.
	 */
	get level(): LogLevel {
		if (this.#level_override !== undefined) {
			return this.#level_override;
		}
		if (this.parent) {
			return this.parent.level;
		}
		return DEFAULT_LOG_LEVEL;
	}

	/**
	 * Setter for level - creates override.
	 */
	set level(value: LogLevel) {
		log_level_parse(value); // throws if invalid
		this.#level_override = value;
	}

	/**
	 * Dynamic getter for colors - checks override, then parent, then environment variables.
	 *
	 * Colors are disabled if either the `NO_COLOR` or `CLAUDECODE` environment variable is set.
	 * The `CLAUDECODE` check disables colors in Claude Code environments where ANSI color codes
	 * may not render correctly in the output.
	 */
	get colors(): boolean {
		if (this.#colors_override !== undefined) {
			return this.#colors_override;
		}
		if (this.parent) {
			return this.parent.colors;
		}
		const has_no_color =
			typeof process !== 'undefined' &&
			(process.env.NO_COLOR !== undefined || process.env.CLAUDECODE !== undefined);
		return !has_no_color;
	}

	/**
	 * Setter for colors - creates override.
	 */
	set colors(value: boolean) {
		this.#colors_override = value;
	}

	/**
	 * Dynamic getter for console - checks override, then parent, then global console.
	 */
	get console(): LogConsole {
		if (this.#console_override !== undefined) {
			return this.#console_override;
		}
		if (this.parent) {
			return this.parent.console;
		}
		return console;
	}

	/**
	 * Setter for console - creates override.
	 */
	set console(value: LogConsole) {
		this.#console_override = value;
	}

	/**
	 * Gets the root logger by walking up the parent chain.
	 * Useful for setting global configuration that affects all child loggers.
	 * @returns the root logger (the one without a parent)
	 */
	get root(): Logger {
		let current: Logger = this; // eslint-disable-line consistent-this, @typescript-eslint/no-this-alias
		while (current.parent) {
			current = current.parent;
		}
		return current;
	}

	/**
	 * Clears the level override for this logger, restoring inheritance from parent.
	 * After calling this, the logger will dynamically inherit the level from its parent
	 * (or use the default level if it has no parent).
	 * @mutates this - clears `#level_override` and the cached `#cached_level_string` / `#cached_level` so subsequent calls walk the parent chain
	 */
	clear_level_override(): void {
		this.#level_override = undefined;
		this.#cached_level_string = undefined;
		this.#cached_level = undefined;
	}

	/**
	 * Clears the colors override for this logger, restoring inheritance from parent.
	 * After calling this, the logger will dynamically inherit colors from its parent
	 * (or use the default colors behavior if it has no parent).
	 * @mutates this - clears `#colors_override` and invalidates the cached prefix strings (`#cached_colors`, `#cached_error`, `#cached_warn`, `#cached_info`, `#cached_debug`) so prefixes recompute on next log call
	 */
	clear_colors_override(): void {
		this.#colors_override = undefined;
		// Invalidate prefix caches since colors affect them
		this.#cached_colors = undefined;
		this.#cached_error = undefined;
		this.#cached_warn = undefined;
		this.#cached_info = undefined;
		this.#cached_debug = undefined;
	}

	/**
	 * Clears the console override for this logger, restoring inheritance from parent.
	 * After calling this, the logger will dynamically inherit the console from its parent
	 * (or use the global console if it has no parent).
	 */
	clear_console_override(): void {
		this.#console_override = undefined;
	}

	/**
	 * Ensures prefix cache is valid by checking if colors configuration changed.
	 * Uses pull-based invalidation: checks colors on each access and invalidates cached
	 * prefixes if colors changed. This automatically handles inheritance changes since
	 * `this.colors` getter walks the parent chain on each access.
	 *
	 * Invalidates all 4 cached prefix strings when colors change, since they all depend
	 * on the color configuration.
	 */
	#ensure_cache_valid(): void {
		const current_colors = this.colors;
		if (this.#cached_colors !== current_colors) {
			this.#cached_colors = current_colors;
			this.#cached_st = current_colors ? styleText : NO_COLOR_ST;
			this.#cached_error = undefined;
			this.#cached_warn = undefined;
			this.#cached_info = undefined;
			this.#cached_debug = undefined;
		}
	}

	/**
	 * Formats the label portion of log output with given styleText function.
	 * Applies color styling if enabled, otherwise returns plain bracketed label.
	 */
	#format_label(st: typeof styleText, colored: boolean): string {
		if (!this.label) return '';

		return colored
			? `${st('gray', '[')}${st('magenta', this.label)}${st('gray', ']')}`
			: `[${this.label}]`;
	}

	/**
	 * Gets the formatted error prefix, lazily computing and caching if needed.
	 * Lazy computation means prefixes are only built when the corresponding log method
	 * is first called, avoiding work for unused log levels.
	 */
	#get_error_prefix(): string {
		this.#ensure_cache_valid();
		if (this.#cached_error === undefined) {
			const st = this.#cached_st!;
			const prefix = st('red', PREFIX_ERROR);
			const label = this.#format_label(st, this.#cached_colors!);
			this.#cached_error = label ? `${prefix} ${label}` : prefix;
		}
		return this.#cached_error;
	}

	/**
	 * Gets the formatted warn prefix, lazily computing and caching if needed.
	 */
	#get_warn_prefix(): string {
		this.#ensure_cache_valid();
		if (this.#cached_warn === undefined) {
			const st = this.#cached_st!;
			const prefix = st('yellow', PREFIX_WARN);
			const label = this.#format_label(st, this.#cached_colors!);
			this.#cached_warn = label ? `${prefix} ${label}` : prefix;
		}
		return this.#cached_warn;
	}

	/**
	 * Gets the formatted info prefix, lazily computing and caching if needed.
	 * Note: info has no colored prefix character, only the label.
	 */
	#get_info_prefix(): string {
		this.#ensure_cache_valid();
		if (this.#cached_info === undefined) {
			const st = this.#cached_st!;
			const label = this.#format_label(st, this.#cached_colors!);
			this.#cached_info = label || '';
		}
		return this.#cached_info;
	}

	/**
	 * Gets the formatted debug prefix, lazily computing and caching if needed.
	 */
	#get_debug_prefix(): string {
		this.#ensure_cache_valid();
		if (this.#cached_debug === undefined) {
			const st = this.#cached_st!;
			const prefix = st('gray', PREFIX_DEBUG);
			const label = this.#format_label(st, this.#cached_colors!);
			this.#cached_debug = label ? `${prefix} ${label}` : prefix;
		}
		return this.#cached_debug;
	}

	/**
	 * Gets the cached numeric level value, updating cache if level changed.
	 * Called on every log method invocation to check if the message should be filtered.
	 * Caches the numeric value (from LOG_LEVEL_VALUES dictionary) to avoid repeated lookups.
	 * Uses pull-based invalidation: checks `this.level` getter which handles inheritance.
	 */
	#get_cached_level(): number {
		const current_level_string = this.level;
		if (this.#cached_level_string !== current_level_string) {
			this.#cached_level_string = current_level_string;
			this.#cached_level = LOG_LEVEL_VALUES[current_level_string];
		}
		return this.#cached_level!;
	}

	/**
	 * Creates a child logger with automatic label concatenation.
	 * Children inherit parent configuration unless overridden.
	 *
	 * @param label - child label (will be concatenated with parent label using `:`)
	 *   Cannot be an empty string - empty labels would result in confusing output like `parent:`
	 *   with a trailing colon. Use `undefined` or `''` only for root loggers.
	 * @param options - optional configuration overrides
	 * @returns new `Logger` instance with concatenated label
	 * @throws Error if label is an empty string
	 *
	 * @example
	 * ```ts
	 * const app_log = new Logger('app');
	 * const db_log = app_log.child('db'); // label: 'app:db'
	 * const query_log = db_log.child('query'); // label: 'app:db:query'
	 * ```
	 */
	child(label: string, options: LoggerOptions = {}): Logger {
		if (label === '') {
			throw new Error('Logger label cannot be empty when creating child');
		}

		const child_label = this.label ? `${this.label}:${label}` : label;

		// Pass parent reference and all config options
		const internal_options: InternalLoggerOptions = {
			...options,
			parent: this
		};
		return new Logger(child_label, internal_options);
	}

	/**
	 * Logs an error message with `🞩error🞩` prefix.
	 * Only outputs if current level is `error` or higher.
	 */
	error(...args: Array<unknown>): void {
		if (this.#get_cached_level() < LOG_LEVEL_VALUES.error) return;
		this.console.error(this.#get_error_prefix(), ...args);
	}

	/**
	 * Logs a warning message with `⚑warn⚑` prefix.
	 * Only outputs if current level is `warn` or higher.
	 */
	warn(...args: Array<unknown>): void {
		if (this.#get_cached_level() < LOG_LEVEL_VALUES.warn) return;
		this.console.warn(this.#get_warn_prefix(), ...args);
	}

	/**
	 * Logs an informational message.
	 * Unlike error/warn/debug, info has no character prefix - only the label is shown.
	 * This keeps standard output clean since info is the default log level.
	 * Only outputs if current level is `info` or higher.
	 */
	info(...args: Array<unknown>): void {
		if (this.#get_cached_level() < LOG_LEVEL_VALUES.info) return;
		const prefix = this.#get_info_prefix();
		if (prefix) {
			this.console.log(prefix, ...args);
		} else {
			this.console.log(...args);
		}
	}

	/**
	 * Logs a debug message with `┆debug┆` prefix.
	 * Only outputs if current level is `debug`.
	 */
	debug(...args: Array<unknown>): void {
		if (this.#get_cached_level() < LOG_LEVEL_VALUES.debug) return;
		this.console.log(this.#get_debug_prefix(), ...args);
	}

	/**
	 * Logs raw output without any prefix, formatting, or level filtering.
	 * Bypasses the logger's level checking, prefix formatting, and color application entirely.
	 *
	 * Note: This method ignores the configured log level - it always outputs regardless of
	 * whether the logger is set to `'off'` or any other level.
	 */
	raw(...args: Array<unknown>): void {
		this.console.log(...args);
	}
}

export interface LoggerOptions {
	/**
	 * Log level for this logger instance.
	 * Inherits from parent or defaults to 'info'.
	 */
	level?: LogLevel;

	/**
	 * Console interface for output.
	 * Inherits from parent or defaults to global console.
	 * Useful for testing.
	 */
	console?: LogConsole;

	/**
	 * Whether to use colors in output.
	 * Inherits from parent or defaults to enabled (unless NO_COLOR env var is set).
	 */
	colors?: boolean;
}

// Internal type for child() implementation
interface InternalLoggerOptions extends LoggerOptions {
	parent?: Logger;
}
