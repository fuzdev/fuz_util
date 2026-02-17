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
 * Runs a function on each item with controlled concurrency.
 * Like `map_concurrent` but doesn't collect results (more efficient for side effects).
 *
 * @param items items to process
 * @param concurrency maximum number of concurrent operations
 * @param fn function to apply to each item
 * @param signal optional `AbortSignal` to cancel processing
 *
 * @example
 * ```ts
 * await each_concurrent(
 *   file_paths,
 *   5, // max 5 concurrent deletions
 *   async (path) => { await unlink(path); },
 * );
 * ```
 */
export const each_concurrent = async <T>(
	items: Iterable<T>,
	concurrency: number,
	fn: (item: T, index: number) => Promise<void> | void,
	signal?: AbortSignal,
): Promise<void> => {
	if (concurrency < 1) {
		throw new Error('concurrency must be at least 1');
	}

	const iterator = items[Symbol.iterator]();
	let next_index = 0;
	let active_count = 0;
	let rejected = false;

	return new Promise((resolve, reject) => {
		const cleanup = signal
			? () => signal.removeEventListener('abort', on_abort)
			: undefined;

		const done = (): void => {
			cleanup?.();
			resolve();
		};

		const fail = (error: unknown): void => {
			if (rejected) return;
			rejected = true;
			cleanup?.();
			reject(error); // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors
		};

		function on_abort(): void {
			fail(signal!.reason);
		}

		if (signal?.aborted) {
			reject(signal.reason); // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors
			return;
		}
		signal?.addEventListener('abort', on_abort);

		const run_next = (): void => {
			if (rejected) return;

			// Spawn workers up to concurrency limit
			while (active_count < concurrency) {
				const next = iterator.next();
				if (next.done) {
					if (active_count === 0) done();
					return;
				}
				const index = next_index++;
				const item = next.value;
				active_count++;

				new Promise<void>((r) => r(fn(item, index)))
					.then(() => {
						if (rejected) return;
						active_count--;
						run_next();
					})
					.catch(fail);
			}
		};

		run_next();
	});
};

/**
 * Maps over items with controlled concurrency, preserving input order.
 *
 * @param items items to process
 * @param concurrency maximum number of concurrent operations
 * @param fn function to apply to each item
 * @param signal optional `AbortSignal` to cancel processing
 * @returns promise resolving to array of results in same order as input
 *
 * @example
 * ```ts
 * const results = await map_concurrent(
 *   file_paths,
 *   5, // max 5 concurrent reads
 *   async (path) => readFile(path, 'utf8'),
 * );
 * ```
 */
export const map_concurrent = async <T, R>(
	items: Iterable<T>,
	concurrency: number,
	fn: (item: T, index: number) => Promise<R> | R,
	signal?: AbortSignal,
): Promise<Array<R>> => {
	if (concurrency < 1) {
		throw new Error('concurrency must be at least 1');
	}

	const results: Array<R> = [];
	const iterator = items[Symbol.iterator]();
	let next_index = 0;
	let active_count = 0;
	let rejected = false;

	return new Promise((resolve, reject) => {
		const cleanup = signal
			? () => signal.removeEventListener('abort', on_abort)
			: undefined;

		const done = (): void => {
			cleanup?.();
			resolve(results);
		};

		const fail = (error: unknown): void => {
			if (rejected) return;
			rejected = true;
			cleanup?.();
			reject(error); // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors
		};

		function on_abort(): void {
			fail(signal!.reason);
		}

		if (signal?.aborted) {
			reject(signal.reason); // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors
			return;
		}
		signal?.addEventListener('abort', on_abort);

		const run_next = (): void => {
			if (rejected) return;

			// Spawn workers up to concurrency limit
			while (active_count < concurrency) {
				const next = iterator.next();
				if (next.done) {
					if (active_count === 0) done();
					return;
				}
				const index = next_index++;
				const item = next.value;
				active_count++;

				new Promise<R>((r) => r(fn(item, index)))
					.then((result) => {
						if (rejected) return;
						results[index] = result;
						active_count--;
						run_next();
					})
					.catch(fail);
			}
		};

		run_next();
	});
};

/**
 * Like `map_concurrent` but collects all results/errors instead of failing fast.
 * Returns an array of settlement objects matching the `Promise.allSettled` pattern.
 *
 * On abort, resolves with partial results: completed items keep their real settlements,
 * in-flight and un-started items are settled as rejected with the abort reason.
 *
 * @param items items to process
 * @param concurrency maximum number of concurrent operations
 * @param fn function to apply to each item
 * @param signal optional `AbortSignal` to cancel processing
 * @returns promise resolving to array of `PromiseSettledResult` objects in input order
 *
 * @example
 * ```ts
 * const results = await map_concurrent_settled(urls, 5, fetch);
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
	items: Iterable<T>,
	concurrency: number,
	fn: (item: T, index: number) => Promise<R> | R,
	signal?: AbortSignal,
): Promise<Array<PromiseSettledResult<R>>> => {
	if (concurrency < 1) {
		throw new Error('concurrency must be at least 1');
	}

	const results: Array<PromiseSettledResult<R>> = [];
	const iterator = items[Symbol.iterator]();
	let next_index = 0;
	let active_count = 0;
	let aborted = false;

	return new Promise((resolve) => {
		const cleanup = signal
			? () => signal.removeEventListener('abort', on_abort)
			: undefined;

		const done = (): void => {
			cleanup?.();
			resolve(results);
		};

		function on_abort(): void {
			if (aborted) return;
			aborted = true;
			cleanup?.();
			// Settle in-flight items as rejected with the abort reason
			const reason: unknown = signal!.reason;
			for (let i = 0; i < next_index; i++) {
				if (!(i in results)) {
					results[i] = {status: 'rejected', reason};
				}
			}
			resolve(results);
		}

		if (signal?.aborted) {
			resolve(results);
			return;
		}
		signal?.addEventListener('abort', on_abort);

		const run_next = (): void => {
			if (aborted) return;

			// Spawn workers up to concurrency limit
			while (active_count < concurrency) {
				const next = iterator.next();
				if (next.done) {
					if (active_count === 0) done();
					return;
				}
				const index = next_index++;
				const item = next.value;
				active_count++;

				new Promise<R>((r) => r(fn(item, index)))
					.then((value) => {
						if (!aborted) results[index] = {status: 'fulfilled', value};
					})
					.catch((reason: unknown) => {
						if (!aborted) results[index] = {status: 'rejected', reason};
					})
					.finally(() => {
						if (aborted) return;
						active_count--;
						run_next();
					});
			}
		};

		run_next();
	});
};

/**
 * Async semaphore for concurrency limiting.
 *
 * With `Infinity` permits, `acquire()` always resolves immediately.
 */
export class AsyncSemaphore {
	#permits: number;
	#waiters: Array<() => void> = [];

	constructor(permits: number) {
		this.#permits = permits;
	}

	async acquire(): Promise<void> {
		if (this.#permits > 0) {
			this.#permits--;
			return;
		}
		return new Promise<void>((resolve) => {
			this.#waiters.push(resolve);
		});
	}

	release(): void {
		const next = this.#waiters.shift();
		if (next) {
			next();
		} else {
			this.#permits++;
		}
	}
}
