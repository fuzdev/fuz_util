import {
	parse,
	type AnySchema,
	type Schema,
	type SchemaIssue,
	type SchemaResult
} from '@fuzdev/fuz_schema/schema.ts';
import {
	get_schema_entries,
	get_schema_meta,
	unwrap_schema
} from '@fuzdev/fuz_schema/introspect.ts';

declare module '@fuzdev/fuz_schema/meta.ts' {
	interface SchemaMeta {
		/**
		 * Other names a CLI arg can be given by, on an entry of an args schema:
		 * `meta(s.with_default(s.boolean, false), {aliases: ['v']})`.
		 * Read by `args_parse`, `args_serialize`, `args_validate_schema`, and `args_extract_aliases`.
		 */
		aliases?: Array<string>;
	}
}

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
 * Not used by `args_parse`/`args_serialize` directly - provided for consumers
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
	conflict_issues: Array<SchemaIssue> | null; // null if schema is valid
}

// WeakMap cache for schema analysis - avoids redundant reflection
const schema_cache: WeakMap<AnySchema, SchemaCacheEntry> = new WeakMap();

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
const analyze_schema = (schema: AnySchema): SchemaAnalysisResult => {
	const aliases: Map<string, string> = new Map();
	const canonical_keys: Set<string> = new Set();
	const boolean_keys: Set<string> = new Set();
	const errors: SchemaAnalysisResult['errors'] = [];

	// the object's entries under any wrappers (optional, with_default, pipe, etc.)
	const entries = get_schema_entries(schema);
	if (!entries) return { aliases, canonical_keys, boolean_keys, errors };

	// First pass: collect all canonical keys
	for (const key of Object.keys(entries)) {
		canonical_keys.add(key);
	}

	// Second pass: process fields for aliases and booleans
	for (const [key, field_schema] of Object.entries(entries)) {
		// Track boolean fields for no- prefix sync
		if (unwrap_schema(field_schema).kind === 'boolean') {
			boolean_keys.add(key);
		}

		// found on any wrapper layer of the entry, the outermost that has it
		const field_aliases = get_schema_meta(field_schema, 'aliases');
		if (field_aliases) {
			for (const alias of field_aliases) {
				// Check for alias-canonical conflict
				if (canonical_keys.has(alias)) {
					errors.push({
						type: 'alias_canonical_conflict',
						alias,
						canonical: key,
						conflict_with: alias
					});
				}
				// Check for duplicate alias
				else if (aliases.has(alias)) {
					errors.push({
						type: 'duplicate_alias',
						alias,
						canonical: key,
						conflict_with: aliases.get(alias)!
					});
				} else {
					aliases.set(alias, key);
				}
			}
		}
	}
	return { aliases, canonical_keys, boolean_keys, errors };
};

// Internal: Convert analysis errors to schema issues, the shape `parse` reports
const to_conflict_issues = (errors: SchemaAnalysisResult['errors']): Array<SchemaIssue> =>
	errors.map((err) => ({
		kind: err.type,
		expected: 'a unique alias',
		received: 'string',
		path: [err.alias],
		message:
			err.type === 'alias_canonical_conflict'
				? `Alias '${err.alias}' for '${err.canonical}' conflicts with canonical key '${
						err.conflict_with
					}'`
				: `Alias '${err.alias}' is used by both '${err.canonical}' and '${err.conflict_with}'`
	}));

// Internal: Get or create cache entry for schema
const get_schema_cache = (schema: AnySchema): SchemaCacheEntry => {
	let entry = schema_cache.get(schema);
	if (!entry) {
		const analysis = analyze_schema(schema);
		entry = {
			aliases: analysis.aliases,
			canonical_keys: analysis.canonical_keys,
			boolean_keys: analysis.boolean_keys,
			conflict_issues: analysis.errors.length > 0 ? to_conflict_issues(analysis.errors) : null
		};
		schema_cache.set(schema, entry);
	}
	return entry;
};

/**
 * Validates a fuz_schema schema for CLI arg usage.
 *
 * Checks for:
 * - Alias conflicts with canonical keys
 * - Duplicate aliases across different keys
 *
 * Each conflict is a `SchemaIssue` whose `kind` is `'alias_canonical_conflict'`
 * or `'duplicate_alias'`, whose `path` is the alias, and whose `message` says
 * what it conflicts with.
 *
 * Results are cached per schema (WeakMap). Safe to call multiple times.
 *
 * @param schema - object schema with optional `aliases` metadata on its entries
 * @returns `ok`, or not `ok` with the conflicts as `issues`, the same array on every call
 */
export const args_validate_schema = (
	schema: AnySchema
): { ok: true } | { ok: false; issues: Array<SchemaIssue> } => {
	const cache = get_schema_cache(schema);
	if (cache.conflict_issues) {
		return { ok: false, issues: cache.conflict_issues };
	}
	return { ok: true };
};

/**
 * Validates parsed CLI args against a fuz_schema schema.
 *
 * Handles CLI-specific concerns before validation:
 * 1. Validates schema (cached) - returns its conflict issues if aliases conflict
 * 2. Expands aliases defined with `meta(entry, {aliases: ['v']})`
 * 3. Strips alias keys (required for `object` schemas, which refuse unknown keys)
 * 4. Validates with `parse`
 * 5. After validation, syncs `no-` prefixed boolean flags with their base keys
 *
 * A boolean `x` and `no-x` given both ways, as by `-C --color` with `C` an alias of
 * `no-color`, resolve to the side whose key comes later in `unparsed_args` (`argv_parse` orders
 * keys by their last appearance in argv, so the side given last), and the other is set to its
 * negation. An alias given with its canonical key gives way to it, and of two aliases of one key
 * the earlier key wins; a key that gives way counts for neither value nor order, so
 * `--color -C -c` with `c` an alias of `color` resolves to `no-color`. Only a `no-x` pair
 * resolves by order.
 *
 * Every arg key is an own key of what `schema` parses, `__proto__`, `constructor`, and
 * `toString` included, so an `object` schema refuses them as unknown keys, and an entry
 * named like an `Object.prototype` member reads as absent when it isn't given.
 *
 * Schema analysis is cached per schema (WeakMap) for performance.
 *
 * No array of the output is one of `unparsed_args`: those are copied. A `with_default`
 * value is the same object on every parse: give an array or object entry its
 * default with `with_default_fn`, as `_: s.with_default_fn(s.array(s.string), () => [])`.
 *
 * @param unparsed_args - args object from CLI parser (mri, minimist, etc.)
 * @param schema - object schema with optional `aliases` metadata on its entries
 * @returns `SchemaResult` with expanded/synced `value` on success
 */
export const args_parse = <TOutput extends Record<string, ArgValue> = Args>(
	unparsed_args: Args,
	schema: Schema<TOutput, any>
): SchemaResult<TOutput> => {
	const cache = get_schema_cache(schema);

	// Return conflict issues if schema has them
	if (cache.conflict_issues) {
		return { ok: false, issues: cache.conflict_issues };
	}

	// Build expanded args - copy canonical, expand aliases, strip alias keys,
	// copying arrays so the output never shares one with the caller's args.
	// A null prototype makes every key an own key, `__proto__` included,
	// and keeps `Object.prototype` members from reading as given args.
	const expanded: Record<string, ArgValue> = Object.create(null);
	// each given key's position in `unparsed_args`, for the `no-` sync to find the later one
	const positions: Map<string, number> = new Map();
	let position = 0;
	for (const [key, value] of Object.entries(unparsed_args)) {
		const canonical = cache.aliases.get(key);
		if (canonical === undefined) {
			expanded[key] = Array.isArray(value) ? [...value] : value;
			if (value !== undefined) positions.set(key, position);
		} else if (!Object.hasOwn(expanded, canonical) && !Object.hasOwn(unparsed_args, canonical)) {
			// only expand if canonical not already present (canonical takes precedence),
			// the alias key itself is stripped
			expanded[canonical] = Array.isArray(value) ? [...value] : value;
			if (value !== undefined) positions.set(canonical, position);
		}
		position++;
	}

	const parsed = parse(schema, expanded);

	if (parsed.ok) {
		// the output is `expanded` itself or what the schema made of it, never the caller's object
		const data = parsed.value as Record<string, ArgValue>;
		// sync each boolean `no-x` with its boolean `x`: the one given last wins, and when
		// only one is given it wins; when neither is, `no-x` follows `x` if `x` has a value
		for (const key in data) {
			if (!key.startsWith('no-')) continue;
			const base_key = key.substring(3);
			if (!cache.boolean_keys.has(key) || !cache.boolean_keys.has(base_key)) continue;
			const key_position = positions.get(key);
			const base_position = positions.get(base_key);
			if (
				key_position === undefined ||
				(base_position !== undefined && base_position > key_position)
			) {
				if (data[base_key] !== undefined) data[key] = !data[base_key];
			} else if (data[key] !== undefined) {
				data[base_key] = !data[key];
			}
		}
		// last, so a synced `__proto__` entry lands as an own key; a copy or a
		// transform's output keeps its own prototype
		if (data === expanded) Object.setPrototypeOf(data, Object.prototype);
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
 * - A `no-x` and `x` both truthy keep only the later key, the one `args_parse` and `argv_parse` let win
 * - When schema provided, extracts aliases and prefers shortest form
 *
 * Schema analysis is cached per schema (WeakMap) for performance.
 *
 * @param schema - optional object schema whose `aliases` metadata gives the short forms
 */
export const args_serialize = (args: Args, schema?: AnySchema): Array<string> => {
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

	const keys = Object.keys(args);
	// whether `key` and `other` are both truthy and `other` comes later, so `key` is skipped
	// (an index of -1 is never later, so an inherited `other` never counts)
	const loses_to = (key: string, other: string): boolean =>
		keys.indexOf(other) > keys.indexOf(key) && !!args[key] && !!args[other];

	let positionals: Array<string> | null = null;
	for (const [key, value] of Object.entries(args)) {
		if (key === '_') {
			positionals = value ? (value as Array<string | number | boolean>).map((v) => v + '') : [];
		} else {
			// a `no-x` and `x` given both ways keep the later one, as parsing the output would
			if (key.startsWith('no-') ? loses_to(key, key.substring(3)) : loses_to(key, 'no-' + key)) {
				continue;
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
 * Extracts alias mappings and canonical keys from a schema's metadata.
 *
 * Useful for consumers building custom tooling (help generators, conflict detection, etc.).
 * Results are cached per schema (WeakMap).
 *
 * Note: Returns copies of the cached data to prevent mutation of internal cache.
 *
 * @param schema - object schema with optional `aliases` metadata on its entries
 */
export const args_extract_aliases = (schema: AnySchema): ArgsAliasesResult => {
	const cache = get_schema_cache(schema);
	return {
		aliases: new Map(cache.aliases),
		canonical_keys: new Set(cache.canonical_keys)
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

// Internal: Set a key on args as its last key, so the keys are in the order of their last appearance
const set_last = (args: Args, key: string, value: ArgValue): void => {
	// deleting first moves an existing key to the end
	// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
	delete args[key];
	args[key] = value;
};

// Internal: Set a value on args, handling arrays for repeated flags
const set_arg = (args: Args, key: string, value: string | number | boolean): void => {
	if (key in args) {
		// Convert to array or push to existing array
		const existing = args[key];
		if (Array.isArray(existing)) {
			existing.push(value);
			set_last(args, key, existing);
		} else {
			set_last(args, key, [existing!, value]);
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
 * - Keys are in the order of their last appearance, so `args_parse` can tell which of
 *   a `no-x` pair given both ways came last: `--b --a --b` → keys `a`, `b`
 *   (integer-like keys excepted, which JS always lists first)
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
 * @param argv - raw argument array (typically process.argv.slice(2))
 * @returns parsed `Args` object with guaranteed `_` array (null prototype)
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
				set_last(args, key, false);
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
				set_last(args, key, true);
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
					set_last(args, key[j]!, true);
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
					set_last(args, char, true);
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
