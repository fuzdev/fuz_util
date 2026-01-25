import {z} from 'zod';

/**
 * CLI arguments container.
 * Positional arguments stored in `_`, named flags/options as string keys.
 * Produced by `argv_parse` or external parsers (mri, minimist, etc.).
 */
export interface Args {
	_?: Array<string>;
	[key: string]: ArgValue;
}

/**
 * Parsed CLI arguments with guaranteed positionals array.
 * Returned by `argv_parse` which always initializes `_`.
 */
export interface ParsedArgs extends Args {
	_: Array<string>;
}

/**
 * Value types supported in CLI arguments.
 */
export type ArgValue = string | number | boolean | undefined | Array<string | number | boolean>;

/**
 * Schema description for help text generation.
 * Not used by args_parse/args_serialize directly - provided for consumers
 * building CLI help output.
 */
export interface ArgSchema {
	type: string;
	default: ArgValue;
	description: string;
}

/**
 * Result of alias extraction from a schema.
 * Includes canonical keys for downstream conflict detection.
 */
export interface ArgsAliasesResult {
	aliases: Map<string, string>; // alias → canonical
	canonical_keys: Set<string>; // all canonical key names
}

// Internal cache entry structure
interface SchemaCacheEntry {
	aliases: Map<string, string>; // alias → canonical
	canonical_keys: Set<string>; // all canonical key names
	boolean_keys: Set<string>; // keys with boolean type (for no- sync)
	conflict_error: z.ZodError | null; // null if schema is valid
}

// WeakMap cache for schema analysis - avoids redundant reflection
const schema_cache: WeakMap<z.ZodType, SchemaCacheEntry> = new WeakMap();

// Internal: Unwrap nested schema types (Optional, Default, Transform, Pipe)
const unwrap_schema = (def: z.core.$ZodTypeDef): z.ZodType | undefined => {
	if ('innerType' in def) return def.innerType as z.ZodType; // Optional, Nullable
	if ('in' in def) return def.in as z.ZodType; // Pipe
	if ('schema' in def) return def.schema as z.ZodType; // Default, Transform
	return undefined;
};

// Internal: Check if schema type is boolean (recursing through wrappers)
const is_boolean_field = (schema: z.ZodType): boolean => {
	const def = schema._zod.def;
	if (def.type === 'boolean') return true;
	const inner = unwrap_schema(def);
	if (inner) return is_boolean_field(inner);
	return false;
};

// Internal: Schema analysis result
interface SchemaAnalysisResult {
	aliases: Map<string, string>;
	canonical_keys: Set<string>;
	boolean_keys: Set<string>;
	errors: Array<{
		type: 'alias_canonical_conflict' | 'duplicate_alias';
		alias: string;
		canonical: string;
		conflict_with: string;
	}>;
}

// Internal: Analyze schema for aliases, canonical keys, boolean keys, and conflicts
const analyze_schema = (schema: z.ZodType): SchemaAnalysisResult => {
	const aliases: Map<string, string> = new Map();
	const canonical_keys: Set<string> = new Set();
	const boolean_keys: Set<string> = new Set();
	const errors: SchemaAnalysisResult['errors'] = [];
	const def = schema._zod.def;

	// Unwrap to get object def (handle wrapped types like optional, default, etc.)
	let obj_def = def;
	while (!('shape' in obj_def)) {
		const inner = unwrap_schema(obj_def);
		if (!inner) return {aliases, canonical_keys, boolean_keys, errors};
		obj_def = inner._zod.def;
	}

	const shape = (obj_def as z.core.$ZodObjectDef).shape;

	// First pass: collect all canonical keys
	for (const key of Object.keys(shape)) {
		canonical_keys.add(key);
	}

	// Second pass: process fields for aliases and booleans
	for (const [key, field] of Object.entries(shape)) {
		const field_schema = field as z.ZodType;

		// Track boolean fields for no- prefix sync
		if (is_boolean_field(field_schema)) {
			boolean_keys.add(key);
		}

		const meta = field_schema.meta();
		if (meta?.aliases) {
			for (const alias of meta.aliases as Array<string>) {
				// Check for alias-canonical conflict
				if (canonical_keys.has(alias)) {
					errors.push({
						type: 'alias_canonical_conflict',
						alias,
						canonical: key,
						conflict_with: alias,
					});
				}
				// Check for duplicate alias
				else if (aliases.has(alias)) {
					errors.push({
						type: 'duplicate_alias',
						alias,
						canonical: key,
						conflict_with: aliases.get(alias)!,
					});
				} else {
					aliases.set(alias, key);
				}
			}
		}
	}
	return {aliases, canonical_keys, boolean_keys, errors};
};

// Internal: Convert analysis errors to ZodError for consistent API
const to_conflict_error = (errors: SchemaAnalysisResult['errors']): z.ZodError => {
	return new z.ZodError(
		errors.map((err) => ({
			code: 'custom' as const,
			path: [err.alias],
			message:
				err.type === 'alias_canonical_conflict'
					? `Alias '${err.alias}' for '${err.canonical}' conflicts with canonical key '${err.conflict_with}'`
					: `Alias '${err.alias}' is used by both '${err.canonical}' and '${err.conflict_with}'`,
		})),
	);
};

// Internal: Get or create cache entry for schema
const get_schema_cache = (schema: z.ZodType): SchemaCacheEntry => {
	let entry = schema_cache.get(schema);
	if (!entry) {
		const analysis = analyze_schema(schema);
		entry = {
			aliases: analysis.aliases,
			canonical_keys: analysis.canonical_keys,
			boolean_keys: analysis.boolean_keys,
			conflict_error: analysis.errors.length > 0 ? to_conflict_error(analysis.errors) : null,
		};
		schema_cache.set(schema, entry);
	}
	return entry;
};

/**
 * Validates a zod schema for CLI arg usage.
 *
 * Checks for:
 * - Alias conflicts with canonical keys
 * - Duplicate aliases across different keys
 *
 * Results are cached per schema (WeakMap). Safe to call multiple times.
 *
 * @param schema Zod object schema with optional alias metadata
 * @returns Validation result with success flag and optional error
 */
export const args_validate_schema = (
	schema: z.ZodType,
): {success: true} | {success: false; error: z.ZodError} => {
	const cache = get_schema_cache(schema);
	if (cache.conflict_error) {
		return {success: false, error: cache.conflict_error};
	}
	return {success: true};
};

/**
 * Validates parsed CLI args against a zod schema.
 *
 * Handles CLI-specific concerns before validation:
 * 1. Validates schema (cached) - returns error if alias conflicts exist
 * 2. Expands aliases defined in schema `.meta({aliases: ['v']})`
 * 3. Strips alias keys (required for strictObject schemas)
 * 4. Validates with zod
 * 5. After validation, syncs `no-` prefixed boolean flags with their base keys
 *
 * Schema analysis is cached per schema (WeakMap) for performance.
 *
 * @param unparsed_args Args object from CLI parser (mri, minimist, etc.)
 * @param schema Zod object schema with optional alias metadata
 * @returns Zod SafeParseResult with expanded/synced data on success
 */
export const args_parse = <TOutput extends Record<string, ArgValue> = Args>(
	unparsed_args: Args,
	schema: z.ZodType<TOutput>,
): z.ZodSafeParseResult<TOutput> => {
	const cache = get_schema_cache(schema);

	// Return conflict error if schema has issues
	if (cache.conflict_error) {
		return {success: false, error: cache.conflict_error as z.ZodError<TOutput>};
	}

	// Build expanded args - copy canonical, expand aliases, strip alias keys
	const expanded: Record<string, ArgValue> = {};
	for (const [key, value] of Object.entries(unparsed_args)) {
		if (cache.aliases.has(key)) {
			const canonical = cache.aliases.get(key)!;
			// Only expand if canonical not already present (canonical takes precedence)
			if (!(canonical in expanded) && !(canonical in unparsed_args)) {
				expanded[canonical] = value;
			}
			// Don't copy alias key (strip it)
		} else {
			expanded[key] = value;
		}
	}

	// Validate with zod
	const parsed = schema.safeParse(expanded);

	if (parsed.success) {
		// Mutate data with the correct source of truth for no- prefixed args
		const data = parsed.data as Record<string, ArgValue>;
		for (const key in data) {
			if (key.startsWith('no-')) {
				const base_key = key.substring(3);
				// Only sync if both keys are booleans in the schema
				if (cache.boolean_keys.has(key) && cache.boolean_keys.has(base_key)) {
					if (!(key in unparsed_args) && !(key in expanded)) {
						data[key] = !data[base_key];
					} else if (!(base_key in unparsed_args) && !(base_key in expanded)) {
						data[base_key] = !data[key];
					}
				}
			}
		}
	}

	return parsed;
};

/**
 * Serializes Args to CLI string array for subprocess forwarding.
 *
 * Handles CLI conventions:
 * - Positionals first, then flags
 * - Single-char keys get single dash, multi-char get double dash
 * - Boolean `true` becomes bare flag, `false` is skipped
 * - `undefined` values are skipped
 * - `no-` prefixed keys skipped when base key is truthy (avoid contradiction)
 * - When schema provided, extracts aliases and prefers shortest form
 *
 * Schema analysis is cached per schema (WeakMap) for performance.
 *
 * @param args Args object to serialize
 * @param schema Optional zod schema to extract aliases for short form preference
 * @returns Array of CLI argument strings
 */
export const args_serialize = (args: Args, schema?: z.ZodType): Array<string> => {
	const result: Array<string> = [];

	// Build reverse map (canonical → shortest alias) if schema provided
	let shortest_names: Map<string, string> | undefined;
	if (schema) {
		const cache = get_schema_cache(schema);
		shortest_names = new Map();
		// Group aliases by canonical key
		const aliases_by_canonical: Map<string, Array<string>> = new Map();
		for (const [alias, canonical] of cache.aliases) {
			if (!aliases_by_canonical.has(canonical)) {
				aliases_by_canonical.set(canonical, []);
			}
			aliases_by_canonical.get(canonical)!.push(alias);
		}
		// Find shortest for each canonical
		for (const [canonical, aliases] of aliases_by_canonical) {
			const all_names = [canonical, ...aliases];
			const shortest = all_names.reduce((a, b) => (a.length <= b.length ? a : b));
			shortest_names.set(canonical, shortest);
		}
	}

	const add_value = (name: string, value: string | number | boolean | undefined): void => {
		if (value === undefined) return;
		if (value === false) return; // Can't represent false as bare flag
		result.push(name);
		if (typeof value !== 'boolean') {
			result.push(value + '');
		}
	};

	let positionals: Array<string> | null = null;
	for (const [key, value] of Object.entries(args)) {
		if (key === '_') {
			positionals = value ? (value as Array<string | number | boolean>).map((v) => v + '') : [];
		} else {
			// Skip no-X if X exists and is truthy
			if (key.startsWith('no-')) {
				const base = key.substring(3);
				if (base in args && args[base]) {
					continue; // Skip redundant no- flag
				}
			}

			// Determine the name to use (prefer shortest if schema provided)
			const use_key = shortest_names?.get(key) ?? key;
			const name = `${use_key.length === 1 ? '-' : '--'}${use_key}`;

			if (Array.isArray(value)) {
				for (const v of value) add_value(name, v);
			} else {
				add_value(name, value);
			}
		}
	}

	return positionals ? [...positionals, ...result] : result;
};

/**
 * Extracts alias mappings and canonical keys from a zod schema's metadata.
 *
 * Useful for consumers building custom tooling (help generators, conflict detection, etc.).
 * Results are cached per schema (WeakMap).
 *
 * Note: Returns copies of the cached data to prevent mutation of internal cache.
 *
 * @param schema Zod object schema with optional `.meta({aliases})` on fields
 * @returns Object with aliases map and canonical_keys set
 */
export const args_extract_aliases = (schema: z.ZodType): ArgsAliasesResult => {
	const cache = get_schema_cache(schema);
	return {
		aliases: new Map(cache.aliases),
		canonical_keys: new Set(cache.canonical_keys),
	};
};

// Internal: Try to coerce a string value to number if it looks numeric
const coerce_value = (value: string): string | number => {
	// Handle empty string
	if (value === '') return value;
	// Try to parse as number
	const num = Number(value);
	// Return number if valid and finite, otherwise keep as string
	// This matches mri behavior: "123" -> 123, "12.5" -> 12.5, "1e5" -> 100000
	// But "123abc" -> "123abc", "NaN" -> "NaN", "Infinity" -> "Infinity"
	if (!Number.isNaN(num) && Number.isFinite(num) && value.trim() !== '') {
		return num;
	}
	return value;
};

// Internal: Set a value on args, handling arrays for repeated flags
const set_arg = (args: Args, key: string, value: string | number | boolean): void => {
	if (key in args) {
		// Convert to array or push to existing array
		const existing = args[key];
		if (Array.isArray(existing)) {
			existing.push(value);
		} else {
			args[key] = [existing!, value];
		}
	} else {
		args[key] = value;
	}
};

/**
 * Parses raw CLI argv array into an Args object.
 *
 * A lightweight, dependency-free alternative to mri/minimist with compatible behavior.
 *
 * Features:
 * - `--flag` → `{flag: true}`
 * - `--flag value` → `{flag: 'value'}` or `{flag: 123}` (numeric coercion)
 * - `--flag=value` → equals syntax
 * - `--flag=` → `{flag: ''}` (empty string, differs from mri which returns true)
 * - `-f` → `{f: true}` (short flag)
 * - `-f value` → `{f: 'value'}`
 * - `-abc` → `{a: true, b: true, c: true}` (combined short flags)
 * - `-abc value` → `{a: true, b: true, c: 'value'}` (last flag gets value)
 * - `--no-flag` → `{flag: false}` (negation prefix)
 * - `--` → stops flag parsing, rest become positionals
 * - Positionals collected in `_` array
 * - Repeated flags become arrays
 *
 * Intentional differences from mri:
 * - `--flag=` returns `''` (mri returns `true`)
 * - `--flag= next` returns `{flag: '', _: ['next']}` (mri takes `next` as the value)
 * - `---flag` returns `{'-flag': true}` (mri strips all dashes)
 * - `['--flag', '']` preserves `''` (mri coerces to `0`)
 * - `--__proto__` works as a normal key (mri silently fails)
 *
 * The returned object uses `Object.create(null)` to prevent prototype pollution
 * and allow any key name including `__proto__` and `constructor`.
 *
 * @param argv Raw argument array (typically process.argv.slice(2))
 * @returns Parsed Args object with guaranteed `_` array (null prototype)
 */
export const argv_parse = (argv: Array<string>): ParsedArgs => {
	// Use Object.create(null) to allow __proto__ as a normal key
	// This prevents prototype pollution and makes all key names work
	const args = Object.create(null) as ParsedArgs;
	args._ = [];
	const positionals = args._;

	let i = 0;
	let flags_done = false; // Set to true after seeing --

	while (i < argv.length) {
		const arg = argv[i]!;

		// After --, everything is a positional
		if (flags_done) {
			positionals.push(arg);
			i++;
			continue;
		}

		// -- stops flag parsing
		if (arg === '--') {
			flags_done = true;
			i++;
			continue;
		}

		// Long flag: --flag or --flag=value or --no-flag
		if (arg.startsWith('--')) {
			const rest = arg.slice(2);

			// Handle --flag=value
			const equals_index = rest.indexOf('=');
			if (equals_index !== -1) {
				const key = rest.slice(0, equals_index);
				const value = rest.slice(equals_index + 1);
				// Empty value after = becomes empty string (explicit value assignment)
				// This differs from mri which treats it as boolean true
				set_arg(args, key, coerce_value(value));
				i++;
				continue;
			}

			// Handle --no-flag (negation) - includes --no- which sets '' to false
			if (rest.startsWith('no-')) {
				const key = rest.slice(3); // May be empty string for --no-
				args[key] = false;
				i++;
				continue;
			}

			// Handle --flag or --flag value
			const key = rest;
			const next = argv[i + 1];

			// If next arg exists and doesn't look like a flag, it's the value
			if (next !== undefined && !next.startsWith('-')) {
				set_arg(args, key, coerce_value(next));
				i += 2;
			} else {
				// Boolean flag
				args[key] = true;
				i++;
			}
			continue;
		}

		// Single dash is ignored (matches mri)
		if (arg === '-') {
			i++;
			continue;
		}

		// Short flag(s): -f or -abc or -f value
		if (arg.startsWith('-') && arg.length > 1) {
			const chars = arg.slice(1);

			// Handle -f=value (short flag with equals)
			const equals_index = chars.indexOf('=');
			if (equals_index !== -1) {
				const key = chars.slice(0, equals_index);
				const value = chars.slice(equals_index + 1);
				// For -abc=value, set a and b to true, c gets value
				for (let j = 0; j < key.length - 1; j++) {
					args[key[j]!] = true;
				}
				if (key.length > 0) {
					set_arg(args, key[key.length - 1]!, coerce_value(value));
				}
				i++;
				continue;
			}

			// Handle combined flags: -abc means -a -b -c
			// Last flag can take a value if next arg isn't a flag
			const next = argv[i + 1];
			const has_value = next !== undefined && !next.startsWith('-');

			for (let j = 0; j < chars.length; j++) {
				const char = chars[j]!;
				const is_last = j === chars.length - 1;

				if (is_last && has_value) {
					// Last char gets the value
					set_arg(args, char, coerce_value(next));
					i += 2;
				} else {
					// Boolean flag
					args[char] = true;
					if (is_last) i++;
				}
			}
			continue;
		}

		// Positional argument
		positionals.push(arg);
		i++;
	}

	return args;
};
