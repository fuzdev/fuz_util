/**
 * Metadata types for library source code analysis.
 *
 * These types represent the structure of `src/lib/` exports,
 * extracted at build time via TypeScript compiler analysis.
 * Used for generating API documentation and enabling code search.
 *
 * Hierarchy: SourceJson → ModuleJson → DeclarationJson
 *
 * @module
 */

import {z} from 'zod';

/**
 * The kind of exported declaration.
 */
export const DeclarationKind = z.enum([
	'type',
	'function',
	'variable',
	'class',
	'constructor',
	'component',
	'json',
	'css',
]);
export type DeclarationKind = z.infer<typeof DeclarationKind>;

/**
 * Generic type parameter information.
 */
export const GenericParamInfo = z.looseObject({
	/** Parameter name like `T`. */
	name: z.string(),
	/** Constraint like `string` from `T extends string`. */
	constraint: z.string().optional(),
	/** Default type like `unknown` from `T = unknown`. */
	default_type: z.string().optional(),
});
export type GenericParamInfo = z.infer<typeof GenericParamInfo>;

/**
 * Parameter information for functions and methods.
 *
 * Kept distinct from ComponentPropInfo despite structural similarity.
 * Function parameters form a tuple with positional semantics:
 * calling order matters (`fn(a, b)` vs `fn(b, a)`),
 * may include rest parameters and destructuring patterns.
 */
export const ParameterInfo = z.looseObject({
	name: z.string(),
	type: z.string(),
	optional: z.boolean().optional(),
	description: z.string().optional(),
	default_value: z.string().optional(),
});
export type ParameterInfo = z.infer<typeof ParameterInfo>;

/**
 * Component prop information for Svelte components.
 *
 * Kept distinct from ParameterInfo despite structural similarity.
 * Component props are named attributes with different semantics:
 * no positional order when passing (`<Foo {a} {b} />` = `<Foo {b} {a} />`),
 * support two-way binding via `$bindable` rune.
 */
export const ComponentPropInfo = z.looseObject({
	name: z.string(),
	type: z.string(),
	optional: z.boolean().optional(),
	description: z.string().optional(),
	default_value: z.string().optional(),
	bindable: z.boolean().optional(),
});
export type ComponentPropInfo = z.infer<typeof ComponentPropInfo>;

/**
 * Metadata for an exported declaration (function, type, class, component, etc.).
 *
 * Extracted from TypeScript source and JSDoc/TSDoc comments at build time.
 */
export const DeclarationJson = z.looseObject({
	/** The exported name. */
	name: z.string(),
	kind: DeclarationKind,
	/** JSDoc/TSDoc comment in mdz format. */
	doc_comment: z.string().optional(),
	/** Full TypeScript type signature. */
	type_signature: z.string().optional(),
	/** TypeScript modifiers like `readonly`, `private`, or `static`. */
	modifiers: z.array(z.string()).optional(),
	/** 1-indexed line number in source file. */
	source_line: z.number().optional(),
	/** Function/method parameters. */
	parameters: z.array(ParameterInfo).optional(),
	/** Function/method return type. */
	return_type: z.string().optional(),
	/** Return value description from `@returns` tag. */
	return_description: z.string().optional(),
	/** Generic type parameters like `<T, U>`. */
	generic_params: z.array(GenericParamInfo).optional(),
	/** Code examples from `@example` tags. */
	examples: z.array(z.string()).optional(),
	/** Deprecation message from `@deprecated` tag. */
	deprecated_message: z.string().optional(),
	/** Related items from `@see` tags, in raw TSDoc format. */
	see_also: z.array(z.string()).optional(),
	/** Exceptions from `@throws` tags. */
	throws: z.array(z.looseObject({type: z.string().optional(), description: z.string()})).optional(),
	/** Version introduced, from `@since` tag. */
	since: z.string().optional(),
	/** Extended classes/interfaces. */
	extends: z.array(z.string()).optional(),
	/** Implemented interfaces. */
	implements: z.array(z.string()).optional(),
	/** Class or interface members (recursive). */
	get members() {
		return z.array(DeclarationJson).optional();
	},
	/** Type/interface properties (recursive). */
	get properties() {
		return z.array(DeclarationJson).optional();
	},
	/** Svelte component props. */
	props: z.array(ComponentPropInfo).optional(),
	/**
	 * Module paths (relative to src/lib) that re-export this declaration.
	 * The canonical location is this module's `declarations` array.
	 */
	also_exported_from: z.array(z.string()).optional(),
	/**
	 * For renamed re-exports (`export {foo as bar}`), the original declaration.
	 */
	alias_of: z
		.object({
			module: z.string(),
			name: z.string(),
		})
		.optional(),
});
export type DeclarationJson = z.infer<typeof DeclarationJson>;

/**
 * A source file in `src/lib/` with its exported declarations.
 */
export const ModuleJson = z.looseObject({
	/** Path relative to src/lib (e.g., `helpers.ts`). */
	path: z.string(),
	declarations: z.array(DeclarationJson).optional(),
	/** File-level JSDoc comment. */
	module_comment: z.string().optional(),
	/** Modules this imports (paths relative to src/lib). */
	dependencies: z.array(z.string()).optional(),
	/** Modules that import this (paths relative to src/lib). */
	dependents: z.array(z.string()).optional(),
	/**
	 * Modules fully re-exported via `export * from './module'`.
	 * Paths are relative to src/lib.
	 */
	star_exports: z.array(z.string()).optional(),
});
export type ModuleJson = z.infer<typeof ModuleJson>;

/**
 * Metadata for a library's `src/lib/` exports.
 */
export const SourceJson = z.looseObject({
	name: z.string(),
	version: z.string(),
	modules: z.array(ModuleJson).optional(),
});
export type SourceJson = z.infer<typeof SourceJson>;

/**
 * Format declaration name with generic parameters for display.
 * @example declaration_get_display_name({name: 'Map', kind: 'type', generic_params: [{name: 'K'}, {name: 'V'}]})
 * // => 'Map<K, V>'
 */
export const declaration_get_display_name = (declaration: DeclarationJson): string => {
	if (!declaration.generic_params?.length) return declaration.name;
	const params = declaration.generic_params.map((p) => {
		let param = p.name;
		if (p.constraint) param += ` extends ${p.constraint}`;
		if (p.default_type) param += ` = ${p.default_type}`;
		return param;
	});
	return `${declaration.name}<${params.join(', ')}>`;
};

/**
 * Generate TypeScript import statement for a declaration.
 * @example declaration_generate_import({name: 'Foo', kind: 'type'}, 'foo.ts', '@pkg/lib')
 * // => "import type {Foo} from '@pkg/lib/foo.js';"
 */
export const declaration_generate_import = (
	declaration: DeclarationJson,
	module_path: string,
	library_name: string,
): string => {
	const js_path = module_path.replace(/\.ts$/, '.js');
	const specifier = `${library_name}/${js_path}`;

	// Handle default exports by converting module name to PascalCase
	if (declaration.name === 'default') {
		const module_name = module_path.replace(/\.(js|ts|svelte)$/, '');
		const pascal_case = module_name
			.split(/[-_]/)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join('');
		return `import ${pascal_case} from '${specifier}';`;
	}

	const import_keyword = declaration.kind === 'type' ? 'import type' : 'import';
	return `${import_keyword} {${declaration.name}} from '${specifier}';`;
};
