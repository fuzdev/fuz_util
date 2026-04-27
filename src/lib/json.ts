export type Json = JsonPrimitive | JsonObject | JsonArray;

export type JsonPrimitive = string | number | boolean | null;

export interface JsonObject extends Record<string, Json> {} // eslint-disable-line @typescript-eslint/no-empty-object-type

export interface JsonArray extends Array<Json> {} // eslint-disable-line @typescript-eslint/no-empty-object-type

/**
 * Like `typeof json`, but includes arrays. Excludes `'undefined'` because it's not valid JSON.
 */
export type JsonType = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';

/**
 * Returns the `JsonType` of `value`, which is like `typeof json`
 * but includes `'array'` and omits `'undefined'`.
 */
export const json_type_of = (value: Json): JsonType | undefined => {
	const type = typeof value;
	switch (type) {
		case 'string':
		case 'number':
		case 'boolean':
			return type;
		case 'object': {
			return value === null ? 'null' : Array.isArray(value) ? 'array' : 'object';
		}
		default: {
			// "undefined" | "function" | "bigint" | "symbol"
			return undefined;
		}
	}
};

/**
 * Embeds `data` as a JSON string, escaping single quotes.
 * Useful for optimizing JSON in JS because it parses faster.
 */
export const json_embed = <T>(data: T, stringify: (data: T) => string = JSON.stringify): string =>
	`JSON.parse('${stringify(data).replaceAll("'", "\\'").replaceAll('\n', '\\\n')}')`;

/**
 * Serializes a value to JSON with deterministic key ordering.
 * Recursively sorts object keys alphabetically for consistent hashing.
 *
 * @returns deterministic JSON string representation
 */
export const json_stringify_deterministic = (value: unknown): string =>
	JSON.stringify(value, (_key, val) => {
		if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
			const sorted: Record<string, unknown> = {};
			const keys = Object.keys(val).sort();
			for (const k of keys) {
				sorted[k] = val[k];
			}
			return sorted;
		}
		return val;
	});
