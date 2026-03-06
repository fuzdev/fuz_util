/**
 * Zod schema introspection utilities.
 *
 * Generic helpers for walking, unwrapping, and extracting metadata from Zod schemas.
 * Used by CLI argument parsing, adversarial input testing, and surface generation.
 *
 * @module
 */

import type {z} from 'zod';

//
// Schema Introspection
//

/**
 * Unwrap nested schema types (optional, default, nullable, etc).
 *
 * @param def - Zod type definition to unwrap.
 * @returns Inner schema if wrapped, undefined otherwise.
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
	'prefault',
]);

/**
 * Unwrap Zod wrappers (optional, default, nullable, pipe, transform)
 * to get the base type definition.
 *
 * @param schema - Zod schema to unwrap
 * @returns the innermost non-wrapper type definition
 */
export const zod_unwrap_def = (schema: z.ZodType): z.core.$ZodTypeDef => {
	const def = schema._zod.def;
	if (ZOD_WRAPPER_TYPES.has(def.type)) {
		const sub = zod_to_subschema(def);
		if (sub) return zod_unwrap_def(sub);
	}
	return def;
};

/**
 * Get the base type name for a Zod schema, unwrapping all wrappers.
 *
 * @param schema - Zod schema to inspect
 * @returns base type name (e.g. `'string'`, `'object'`, `'uuid'`)
 */
export const zod_get_base_type = (schema: z.ZodType): string => zod_unwrap_def(schema).type;

/**
 * Check if a schema is optional at the outermost level.
 *
 * @param schema - Zod schema to check
 */
export const zod_is_optional = (schema: z.ZodType): boolean => schema._zod.def.type === 'optional';

/**
 * Check if a schema accepts null at any wrapping level.
 *
 * @param schema - Zod schema to check
 */
export const zod_is_nullable = (schema: z.ZodType): boolean => {
	const def = schema._zod.def;
	if (def.type === 'nullable') return true;
	if (ZOD_WRAPPER_TYPES.has(def.type)) {
		const sub = zod_to_subschema(def);
		if (sub) return zod_is_nullable(sub);
	}
	return false;
};

/**
 * Check if a schema has a default value at any wrapping level.
 *
 * Unlike `zod_to_schema_default` (which returns the value), this returns a boolean.
 * Distinguishes "no default" from "default is undefined".
 *
 * @param schema - Zod schema to check
 */
export const zod_has_default = (schema: z.ZodType): boolean => {
	const def = schema._zod.def;
	if ('defaultValue' in def) return true;
	const sub = zod_to_subschema(def);
	if (sub) return zod_has_default(sub);
	return false;
};

/**
 * Unwrap a schema to find the inner `ZodObject`, or `null` if not an object schema.
 * Handles wrappers like `z.strictObject({...}).default({...})`.
 *
 * @param schema - Zod schema to unwrap
 * @returns the inner ZodObject or null
 */
export const zod_unwrap_to_object = (schema: z.ZodType): z.ZodObject | null => {
	const def = zod_unwrap_def(schema);
	if (def.type !== 'object') return null;
	let s: z.ZodType = schema;
	while (s._zod.def.type !== 'object') {
		const sub = zod_to_subschema(s._zod.def);
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
 *
 * @param schema - Zod object schema to extract from
 * @returns array of field info for each property
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
			nullable: zod_is_nullable(field),
		});
	}
	return fields;
};

// --- Metadata extraction ---

/**
 * Get the description from a schema's metadata, unwrapping if needed.
 *
 * @param schema - Zod schema to extract description from.
 * @returns Description string or null if not found.
 */
export const zod_to_schema_description = (schema: z.ZodType): string | null => {
	const meta = schema.meta();
	if (meta?.description) {
		return meta.description;
	}
	const subschema = zod_to_subschema(schema.def);
	if (subschema) {
		return zod_to_schema_description(subschema);
	}
	return null;
};

/**
 * Get the default value from a schema, unwrapping if needed.
 *
 * @param schema - Zod schema to extract default from.
 * @returns Default value or undefined.
 */
export const zod_to_schema_default = (schema: z.ZodType): unknown => {
	const {def} = schema._zod;
	if ('defaultValue' in def) {
		return def.defaultValue;
	}
	const subschema = zod_to_subschema(def);
	if (subschema) {
		return zod_to_schema_default(subschema);
	}
	return undefined;
};

/**
 * Get aliases from a schema's metadata, unwrapping if needed.
 *
 * @param schema - Zod schema to extract aliases from.
 * @returns Array of alias strings.
 */
export const zod_to_schema_aliases = (schema: z.ZodType): Array<string> => {
	const meta = schema.meta();
	if (meta?.aliases) {
		return meta.aliases as Array<string>;
	}
	const subschema = zod_to_subschema(schema.def);
	if (subschema) {
		return zod_to_schema_aliases(subschema);
	}
	return [];
};

/**
 * Get the type string for a schema, suitable for display.
 *
 * @param schema - Zod schema to get type string for.
 * @returns Human-readable type string.
 */
export const zod_to_schema_type_string = (schema: z.ZodType): string => {
	const {def} = schema._zod;
	switch (def.type) {
		case 'string':
			return 'string';
		case 'number':
			return 'number';
		case 'int':
			return 'int';
		case 'boolean':
			return 'boolean';
		case 'bigint':
			return 'bigint';
		case 'null':
			return 'null';
		case 'undefined':
			return 'undefined';
		case 'any':
			return 'any';
		case 'unknown':
			return 'unknown';
		case 'array':
			return 'Array<string>';
		case 'enum':
			return (schema as unknown as {options: Array<string>}).options
				.map((v) => `'${v}'`)
				.join(' | ');
		case 'literal':
			return (def as unknown as {values: Array<unknown>}).values
				.map((v) => zod_format_value(v))
				.join(' | ');
		case 'nullable': {
			const subschema = zod_to_subschema(def);
			return subschema ? zod_to_schema_type_string(subschema) + ' | null' : 'nullable';
		}
		case 'optional': {
			const subschema = zod_to_subschema(def);
			return subschema ? zod_to_schema_type_string(subschema) + ' | undefined' : 'optional';
		}
		default: {
			const subschema = zod_to_subschema(def);
			return subschema ? zod_to_schema_type_string(subschema) : def.type;
		}
	}
};

/**
 * Format a value for display in help text.
 *
 * @param value - Value to format.
 * @returns Formatted string representation.
 */
export const zod_format_value = (value: unknown): string => {
	if (value === undefined) return '';
	if (value === null) return 'null';
	if (typeof value === 'string') return `'${value}'`;
	if (Array.isArray(value)) return '[]';
	if (typeof value === 'object') return JSON.stringify(value);
	if (typeof value === 'boolean' || typeof value === 'number') return String(value);
	return '';
};

//
// Object Schema Helpers
//

/**
 * Property extracted from an object schema.
 */
export interface ZodSchemaProperty {
	name: string;
	type: string;
	description: string;
	default: unknown;
	aliases: Array<string>;
}

/**
 * Extract properties from a Zod object schema.
 *
 * @param schema - Zod object schema to extract from.
 * @returns Array of property definitions.
 */
export const zod_to_schema_properties = (schema: z.ZodType): Array<ZodSchemaProperty> => {
	const {def} = schema;

	if (!('shape' in def)) {
		return [];
	}
	const shape = (def as z.core.$ZodObjectDef).shape;

	const properties: Array<ZodSchemaProperty> = [];
	for (const name in shape) {
		// Skip no- prefixed fields (used for boolean negation)
		if ('no-' + name in shape) continue;

		const field = shape[name] as z.ZodType;
		properties.push({
			name,
			type: zod_to_schema_type_string(field),
			description: zod_to_schema_description(field) ?? '',
			default: zod_to_schema_default(field),
			aliases: zod_to_schema_aliases(field),
		});
	}
	return properties;
};

/**
 * Get all property names and their aliases from an object schema.
 *
 * @param schema - Zod object schema.
 * @returns Set of all names and aliases.
 */
export const zod_to_schema_names_with_aliases = (schema: z.ZodType): Set<string> => {
	const names: Set<string> = new Set();
	for (const prop of zod_to_schema_properties(schema)) {
		if (prop.name !== '_') {
			names.add(prop.name);
			for (const alias of prop.aliases) {
				names.add(alias);
			}
		}
	}
	return names;
};
