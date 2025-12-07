import type {OmitStrict} from './types.js';

/**
 * Returns a boolean indicating if `value` is
 * a plain object, possibly created with `Object.create(null)`.
 * But warning! This fails for some obscure corner cases, use a proper library for weird things.
 */
export const is_plain_object = (value: any): boolean =>
	value ? value.constructor === Object || value.constructor === undefined : false;

/**
 * Iterated keys in `for..in` are always returned as strings,
 * so to prevent usage errors the key type of `mapper` is always a string.
 * Symbols are not enumerable as keys, so they're excluded.
 */
export const map_record = <T, K extends string | number, U>(
	obj: Record<K, T>,
	mapper: (value: T, key: string) => U,
): Record<K, U> => {
	const result = {} as Record<K, U>;
	for (const key in obj) {
		result[key] = mapper(obj[key], key);
	}
	return result;
};

/**
 * Creates a new object without the specified `keys`.
 */
export const omit = <T extends Record<K, any>, K extends keyof T>(
	obj: T,
	keys: Array<K>,
): OmitStrict<T, K> => {
	const result = {} as T;
	for (const key in obj) {
		if (!keys.includes(key as any)) {
			result[key] = obj[key];
		}
	}
	return result;
};

/**
 * Creates a new object with properties that pass the `should_pick` predicate.
 */
export const pick_by = <T extends Record<K, any>, K extends string | number>(
	obj: T,
	should_pick: (value: any, key: K) => boolean,
): Partial<T> => {
	const result = {} as Partial<T>;
	for (const key in obj) {
		const value = obj[key];
		if (should_pick(value, key as any)) {
			result[key] = value;
		}
	}
	return result;
};

/**
 * `omit_undefined` is a commonly used form of `pick_by`.
 * See this issue for why it's used so much:
 * https://github.com/Microsoft/TypeScript/issues/13195
 * @param obj
 * @returns `obj` with all `undefined` properties removed
 */
export const omit_undefined = <T extends Record<string | number, any>>(obj: T): T =>
	pick_by(obj, (v) => v !== undefined) as T;

/**
 * A more explicit form of `{put_this_first: obj.put_this_first, ...obj}`.
 */
export const reorder = <T extends Record<K, any>, K extends string | number>(
	obj: T,
	keys: Array<K>,
): T => {
	const result = {} as T;
	for (const k of keys) result[k] = obj[k];
	// overwriting is probably faster than using
	// a `Set` to track what's already been added
	for (const k in obj) result[k] = obj[k];
	return result;
};

/**
 * Frozen empty object with no properties, good for options default values.
 */
export const EMPTY_OBJECT: Record<string | number | symbol, undefined> & object = Object.freeze({});

/**
 * Performs a depth-first traversal of an object's enumerable properties,
 * calling `cb` for every key and value with the current `obj` context.
 * @param obj - any object with enumerable properties
 * @param cb - receives the key, value, and `obj` for every enumerable property on `obj` and its descendents
 */
export const traverse = (obj: any, cb: (key: string, value: any, obj: any) => void): void => {
	if (!obj || typeof obj !== 'object') return;
	for (const k in obj) {
		const v = obj[k];
		cb(k, v, obj);
		traverse(v, cb);
	}
};

export const transform_empty_object_to_undefined = <T>(obj: T): T | undefined => {
	if (obj && Object.keys(obj).length === 0) {
		return;
	}
	return obj;
};
