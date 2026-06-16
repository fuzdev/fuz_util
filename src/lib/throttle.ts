import {create_deferred, type Deferred} from './async.ts';
import {EMPTY_OBJECT} from './object.ts';

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
 * Immediately invokes the callback on the first call unless `leading=false`.
 * If the throttled function is called while the promise is already pending,
 * the call is queued to run after the pending promise completes plus `delay`,
 * and only the last call is invoked.
 * In other words, all calls and their args are discarded
 * during the pending window except for the most recent.
 * Unlike debouncing, this calls the throttled callback
 * both on the leading and trailing edges of the delay window by default,
 * and this can be customized by setting `when` to `'leading'` or `'trailing'`.
 * It also differs from a queue where every call to the throttled callback eventually runs.
 * @returns same as `cb`
 */
export const throttle = <T extends (...args: Array<any>) => Promise<void>>(
	cb: T,
	{delay = 0, when = 'both'}: ThrottleOptions = EMPTY_OBJECT,
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
		if (!next_deferred) return;
		const result = await call(next_args!);
		next_args = null;
		const {resolve} = next_deferred;
		next_deferred = null;
		resolve(result); // resolve last to prevent synchronous call issues
	};

	const call = (args: Array<any>): Promise<any> => {
		pending_promise = cb(...args);
		void pending_promise.finally(() => {
			pending_promise = null;
		});
		return pending_promise;
	};

	return ((...args) => {
		if (pending_promise || when === 'trailing') {
			return when === 'leading' ? pending_promise : defer(args); // discarded when pending and not trailing
		} else {
			return call(args);
		}
	}) as T;
};
