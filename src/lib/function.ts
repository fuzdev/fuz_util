/**
 * Does nothing when called.
 */
export const noop: (...args: Array<any>) => any = () => {};

/**
 * Async function that returns a resolved promise.
 */
export const noop_async: (...args: Array<any>) => Promise<any> = () => resolved;

/**
 * A singleton resolved `Promise`.
 */
export const resolved = Promise.resolve();

/**
 * Returns the first arg.
 */
export const identity = <T>(t: T): T => t;

/**
 * Represents a value wrapped in a function.
 * Useful for lazy values and bridging reactive boundaries in Svelte.
 */
export type Thunk<T> = () => T;

/**
 * Returns the result of calling `value` if it's a function,
 * otherwise it's like the `identity` function and passes it through.
 */
export const unthunk = <T>(value: T | Thunk<T>): T =>
	typeof value === 'function' ? (value as any)() : value;
