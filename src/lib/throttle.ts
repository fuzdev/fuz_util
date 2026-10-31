import { create_deferred, wait, type Deferred } from './async.ts';
import { noop } from './function.ts';
import { EMPTY_OBJECT } from './object.ts';

export interface ThrottleOptions {
	/**
	 * Enforced milliseconds between calls. For `when='trailing'` this is the debounce delay.
	 */
	delay?: number;
	/**
	 * When to call the throttled function. Defaults to `both`.
	 */
	when?: 'both' | 'leading' | 'trailing';
}

/**
 * Throttles calls to a callback that returns a void promise.
 * Immediately invokes the callback on the first call unless `when` is `'trailing'`.
 * If the throttled function is called while a call is pending or queued,
 * the call is queued to run `delay` after it's made,
 * or, if a call is still running then, `delay` after that call settles,
 * and only the last call's args run.
 * In other words, all calls and their args are discarded
 * during the pending window except for the most recent.
 * Calls never overlap: a call made while the queued call runs opens a new window.
 * Unlike debouncing, this calls the throttled callback
 * both on the leading and trailing edges of the delay window by default,
 * and this can be customized by setting `when` to `'leading'` or `'trailing'`.
 * It also differs from a queue where every call to the throttled callback eventually runs.
 * The promise returned for a queued call settles like the callback's,
 * rejecting with its error, and the throttle keeps working after a rejection.
 * @returns same as `cb`
 */
export const throttle = <T extends (...args: Array<any>) => Promise<void>>(
	cb: T,
	{ delay = 0, when = 'both' }: ThrottleOptions = EMPTY_OBJECT
): T => {
	let pending_promise: Promise<void> | null = null;
	let next_args: Array<any> | null = null;
	let next_deferred: Deferred<void> | null = null;

	const defer = (args: Array<any>): Promise<void> => {
		next_args = args;
		if (!next_deferred) {
			next_deferred = create_deferred<void>();
			setTimeout(flush, delay);
		}
		return next_deferred.promise;
	};

	const flush = async (): Promise<void> => {
		// calls never overlap, so a call still running delays this one until it settles plus `delay`
		if (pending_promise) {
			await pending_promise.then(noop, noop);
			await wait(delay);
		}
		// take the queued call and clear it before calling,
		// so a call made while this one runs opens a new window instead of being dropped
		const args = next_args!;
		const deferred = next_deferred!;
		next_args = null;
		next_deferred = null;
		try {
			await call(args);
		} catch (error) {
			deferred.reject(error);
			return;
		}
		deferred.resolve(); // resolve last to prevent synchronous call issues
	};

	const call = (args: Array<any>): Promise<void> => {
		const promise: Promise<void> = cb(...args).finally(() => {
			if (pending_promise === promise) pending_promise = null;
		});
		pending_promise = promise;
		return promise; // the one chain, so an unhandled rejection surfaces like a plain async call
	};

	return ((...args) => {
		if (pending_promise || next_deferred || when === 'trailing') {
			return when === 'leading' ? pending_promise : defer(args); // discarded when pending and not trailing
		} else {
			return call(args);
		}
	}) as T;
};
