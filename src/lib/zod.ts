/**
 * Zod schema introspection utilities.
 *
 * Generic helpers for extracting metadata from Zod schemas.
 * Designed for CLI argument parsing but applicable elsewhere.
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
