export type AsyncStatus = 'initial' | 'pending' | 'success' | 'failure';

/**
 * Waits for the given `duration` before resolving.
 */
export const wait = (duration = 0): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, duration));

/**
 * Checks if `value` is a `Promise` (or thenable).
 */
export const is_promise = (value: unknown): value is Promise<unknown> =>
	value != null && typeof (value as Promise<unknown>).then === 'function';

/**
 * Creates a deferred object with a promise and its resolve/reject handlers.
 */
export interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason: any) => void;
}

/**
 * Creates a object with a `promise` and its `resolve`/`reject` handlers.
 */
export const create_deferred = <T>(): Deferred<T> => {
	let resolve!: (value: T) => void;
	let reject!: (reason: any) => void;
	const promise: Promise<T> = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return {promise, resolve, reject};
};

/**
 * Maps over items with controlled concurrency, preserving input order.
 *
 * @param items array of items to process
 * @param fn async function to apply to each item
 * @param concurrency maximum number of concurrent operations
 * @returns promise resolving to array of results in same order as input
 *
 * @example
 * ```ts
 * const results = await map_concurrent(
 *   file_paths,
 *   async (path) => readFile(path, 'utf8'),
 *   5, // max 5 concurrent reads
 * );
 * ```
 */
export const map_concurrent = async <T, R>(
	items: Array<T>,
	fn: (item: T, index: number) => Promise<R>,
	concurrency: number,
): Promise<Array<R>> => {
	if (concurrency < 1) {
		throw new Error('concurrency must be at least 1');
	}

	const results: Array<R> = new Array(items.length);
	let next_index = 0;
	let active_count = 0;
	let rejected = false;
	let reject_error: unknown;

	return new Promise((resolve, reject) => {
		const run_next = (): void => {
			// Stop spawning if we've rejected
			if (rejected) return;

			// Check if we're done
			if (next_index >= items.length && active_count === 0) {
				resolve(results);
				return;
			}

			// Spawn workers up to concurrency limit
			while (active_count < concurrency && next_index < items.length) {
				const index = next_index++;
				const item = items[index]!;
				active_count++;

				fn(item, index)
					.then((result) => {
						if (rejected) return;
						results[index] = result;
						active_count--;
						run_next();
					})
					.catch((error) => {
						if (rejected) return;
						rejected = true;
						reject_error = error;
						reject(reject_error); // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors
					});
			}
		};

		// Handle empty array
		if (items.length === 0) {
			resolve(results);
			return;
		}

		run_next();
	});
};

/**
 * Like `map_concurrent` but collects all results/errors instead of failing fast.
 * Returns an array of settlement objects matching the `Promise.allSettled` pattern.
 *
 * @param items array of items to process
 * @param fn async function to apply to each item
 * @param concurrency maximum number of concurrent operations
 * @returns promise resolving to array of `PromiseSettledResult` objects in input order
 *
 * @example
 * ```ts
 * const results = await map_concurrent_settled(urls, fetch, 5);
 * for (const [i, result] of results.entries()) {
 *   if (result.status === 'fulfilled') {
 *     console.log(`${urls[i]}: ${result.value.status}`);
 *   } else {
 *     console.error(`${urls[i]}: ${result.reason}`);
 *   }
 * }
 * ```
 */
export const map_concurrent_settled = async <T, R>(
	items: Array<T>,
	fn: (item: T, index: number) => Promise<R>,
	concurrency: number,
): Promise<Array<PromiseSettledResult<R>>> => {
	if (concurrency < 1) {
		throw new Error('concurrency must be at least 1');
	}

	const results: Array<PromiseSettledResult<R>> = new Array(items.length);
	let next_index = 0;
	let active_count = 0;

	return new Promise((resolve) => {
		const run_next = (): void => {
			// Check if we're done
			if (next_index >= items.length && active_count === 0) {
				resolve(results);
				return;
			}

			// Spawn workers up to concurrency limit
			while (active_count < concurrency && next_index < items.length) {
				const index = next_index++;
				const item = items[index]!;
				active_count++;

				fn(item, index)
					.then((value) => {
						results[index] = {status: 'fulfilled', value};
					})
					.catch((reason: unknown) => {
						results[index] = {status: 'rejected', reason};
					})
					.finally(() => {
						active_count--;
						run_next();
					});
			}
		};

		// Handle empty array
		if (items.length === 0) {
			resolve(results);
			return;
		}

		run_next();
	});
};
