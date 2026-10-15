/**
 * Zod schema introspection utilities.
 *
 * Generic helpers for walking, unwrapping, and extracting field info from Zod schemas.
 * Used by adversarial input testing, test-data generation, and surface generation.
 *
 * @module
 */

import type { z } from 'zod';

//
// Schema Introspection
//

/**
 * Unwrap nested schema types (optional, default, nullable, etc).
 *
 * @returns inner schema if wrapped, undefined otherwise
 */
export const zod_to_subschema = (def: z.core.$ZodTypeDef): z.ZodType | undefined => {
	if ('innerType' in def) {
		return def.innerType as z.ZodType;
	} else if ('in' in def) {
		return def.in as z.ZodType;
	} else if ('schema' in def) {
		return def.schema as z.ZodType;
	}
	return undefined;
};

/** Zod wrapper type names that `zod_unwrap_def` traverses through. */
export const ZOD_WRAPPER_TYPES = new Set([
	'optional',
	'nullable',
	'default',
	'transform',
	'pipe',
	'prefault'
]);

/**
 * Unwrap Zod wrappers (optional, default, nullable, pipe, transform)
 * to get the base type definition.
 *
 * @returns the innermost non-wrapper type definition
 */
export const zod_unwrap_def = (schema: z.ZodType): z.core.$ZodTypeDef => {
	const { def } = schema;
	if (ZOD_WRAPPER_TYPES.has(def.type)) {
		const sub = zod_to_subschema(def);
		if (sub) return zod_unwrap_def(sub);
	}
	return def;
};

/**
 * Get the base type name for a Zod schema, unwrapping all wrappers.
 *
 * @returns base type name (e.g. `'string'`, `'object'`, `'uuid'`)
 */
export const zod_get_base_type = (schema: z.ZodType): string => zod_unwrap_def(schema).type;

/**
 * Check if a schema is optional at the outermost level.
 */
export const zod_is_optional = (schema: z.ZodType): boolean => schema.def.type === 'optional';

/**
 * Check if a schema accepts null at any wrapping level.
 */
export const zod_is_nullable = (schema: z.ZodType): boolean => {
	const { def } = schema;
	if (def.type === 'nullable') return true;
	if (ZOD_WRAPPER_TYPES.has(def.type)) {
		const sub = zod_to_subschema(def);
		if (sub) return zod_is_nullable(sub);
	}
	return false;
};

/**
 * Check if a schema has a default value at any wrapping level.
 * Distinguishes "no default" from "default is undefined".
 */
export const zod_has_default = (schema: z.ZodType): boolean => {
	const { def } = schema;
	if ('defaultValue' in def) return true;
	const sub = zod_to_subschema(def);
	if (sub) return zod_has_default(sub);
	return false;
};

/**
 * Unwrap a schema through every wrapper type (optional, nullable, default,
 * transform, pipe, prefault) to reach the innermost schema. Like `zod_unwrap_def`
 * but returns the schema (so callers can `.shape`, `instanceof`-check, etc.)
 * instead of the def.
 *
 * @returns the innermost non-wrapper schema
 */
export const zod_get_innermost_type = (schema: z.ZodType): z.ZodType => {
	if (ZOD_WRAPPER_TYPES.has(schema.def.type)) {
		const sub = zod_to_subschema(schema.def);
		if (sub) return zod_get_innermost_type(sub);
	}
	return schema;
};

/**
 * Get all property keys from an object schema, unwrapping wrappers.
 * Returns an empty array if the innermost type is not an object.
 *
 * @param schema - Zod schema (typically a `ZodObject` with possible wrappers)
 */
export const zod_get_schema_keys = <T extends z.ZodType>(
	schema: T
): Array<keyof z.infer<T> & string> => {
	const obj = zod_unwrap_to_object(schema);
	return obj ? (Object.keys(obj.shape) as Array<keyof z.infer<T> & string>) : [];
};

/**
 * Get the field schema for a key in an object schema, returning `undefined` if
 * the schema is not an object or the key is missing.
 *
 * @param schema - Zod schema (typically a `ZodObject` with possible wrappers)
 * @param key - the property name
 * @returns the field's schema, or `undefined`
 */
export const zod_maybe_get_field_schema = (schema: z.ZodType, key: string): z.ZodType | undefined =>
	zod_unwrap_to_object(schema)?.shape[key];

/**
 * Get the field schema for a key in an object schema.
 *
 * @param schema - Zod schema (typically a `ZodObject` with possible wrappers)
 * @throws Error if the schema is not an object or the key is missing
 */
export const zod_get_field_schema = (schema: z.ZodType, key: string): z.ZodType => {
	const field = zod_maybe_get_field_schema(schema, key);
	if (!field) throw new Error(`Field "${key}" not found in schema`);
	return field;
};

/**
 * Unwrap a schema to find the inner `ZodObject`, or `null` if not an object schema.
 * Handles wrappers like `z.strictObject({...}).default({...})`.
 */
export const zod_unwrap_to_object = (schema: z.ZodType): z.ZodObject | null => {
	const def = zod_unwrap_def(schema);
	if (def.type !== 'object') return null;
	let s: z.ZodType = schema;
	while (s.def.type !== 'object') {
		const sub = zod_to_subschema(s.def);
		if (!sub) return null;
		s = sub;
	}
	return s as z.ZodObject;
};

// --- Field extraction ---

/** Metadata extracted from a single field of a Zod object schema. */
export interface ZodFieldInfo {
	name: string;
	base_type: string;
	required: boolean;
	has_default: boolean;
	nullable: boolean;
}

/**
 * Extract field metadata from a Zod object schema.
 */
export const zod_extract_fields = (schema: z.ZodObject): Array<ZodFieldInfo> => {
	const fields: Array<ZodFieldInfo> = [];
	for (const [name, field_schema] of Object.entries(schema.shape)) {
		const field = field_schema as z.ZodType;
		fields.push({
			name,
			base_type: zod_get_base_type(field),
			required: !zod_is_optional(field),
			has_default: zod_has_default(field),
			nullable: zod_is_nullable(field)
		});
	}
	return fields;
};
