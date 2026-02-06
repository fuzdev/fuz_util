/**
 * Shared helper functions for Svelte preprocessors.
 *
 * Provides AST utilities for detecting static content, resolving imports,
 * managing import statements, and escaping strings for Svelte templates.
 * Used by `svelte_preprocess_mdz` in fuz_ui, `svelte_preprocess_fuz_code`
 * in fuz_code, and potentially other Svelte preprocessors.
 *
 * Uses `import type` from `svelte/compiler` for AST types only — no runtime
 * Svelte dependency. Consumers must have `svelte` installed for type resolution.
 *
 * @module
 */

import type {AST} from 'svelte/compiler';

/** Import metadata for a single import specifier. */
export interface PreprocessImportInfo {
	/** The module path to import from. */
	path: string;
	/** Whether this is a default or named import. */
	kind: 'default' | 'named';
}

/** Information about a resolved component import. */
export interface ResolvedComponentImport {
	// TODO: use proper ESTree types (e.g. import('estree').ImportDeclaration)
	/** The `ImportDeclaration` AST node that provides this name. */
	import_node: any;
	// TODO: use proper ESTree types (e.g. import('estree').ImportSpecifier | ImportDefaultSpecifier)
	/** The specific import specifier for this name. */
	specifier: any;
}

/**
 * Checks if a filename matches any exclusion pattern.
 *
 * Returns `false` when `filename` is `undefined` or `exclude` is empty.
 * String patterns use substring matching. RegExp patterns use `.test()`.
 *
 * @param filename The file path to check, or `undefined` for virtual files.
 * @param exclude Array of string or RegExp exclusion patterns.
 * @returns `true` if the file should be excluded from processing.
 */
export const should_exclude = (
	filename: string | undefined,
	exclude: Array<string | RegExp>,
): boolean => {
	if (!filename || exclude.length === 0) return false;
	return exclude.some((pattern) =>
		typeof pattern === 'string' ? filename.includes(pattern) : pattern.test(filename),
	);
};

/**
 * Finds an attribute by name on a component AST node.
 *
 * Iterates the node's `attributes` array and returns the first `Attribute`
 * node whose `name` matches. Skips `SpreadAttribute`, directive, and other node types.
 *
 * @param node The component AST node to search.
 * @param name The attribute name to find.
 * @returns The matching `Attribute` node, or `undefined` if not found.
 */
export const find_attribute = (node: AST.Component, name: string): AST.Attribute | undefined => {
	for (const attr of node.attributes) {
		if (attr.type === 'Attribute' && attr.name === name) {
			return attr;
		}
	}
	return undefined;
};

/**
 * Recursively evaluates an expression AST node to a static string value.
 *
 * Handles string `Literal`, `TemplateLiteral` without interpolation, and
 * `BinaryExpression` with the `+` operator (string concatenation).
 * Returns `null` for dynamic expressions, non-string literals, or unsupported node types.
 *
 * @param expr An ESTree-compatible expression AST node.
 * @returns The resolved static string, or `null` if the expression is dynamic.
 */
// TODO: use proper ESTree expression type instead of `any`
export const evaluate_static_expr = (expr: any): string | null => {
	if (expr.type === 'Literal' && typeof expr.value === 'string') return expr.value;
	if (expr.type === 'TemplateLiteral' && expr.expressions.length === 0) {
		// TODO: use proper ESTree TemplateElement type instead of `any`
		return expr.quasis.map((q: any) => q.value.cooked ?? q.value.raw).join('');
	}
	if (expr.type === 'BinaryExpression' && expr.operator === '+') {
		const left = evaluate_static_expr(expr.left);
		if (left === null) return null;
		const right = evaluate_static_expr(expr.right);
		if (right === null) return null;
		return left + right;
	}
	return null;
};

/**
 * Extracts a static string value from a Svelte attribute value AST node.
 *
 * Handles three forms:
 * - Boolean `true` (bare attribute like `inline`) -- returns `null`.
 * - Array with a single `Text` node (quoted attribute like `content="text"`) --
 *   returns the text data.
 * - `ExpressionTag` (expression like `content={'text'}`) -- delegates to `evaluate_static_expr`.
 *
 * Returns `null` for null literals, mixed arrays, dynamic expressions, and non-string values.
 *
 * @param value The attribute value from `AST.Attribute['value']`.
 * @returns The resolved static string, or `null` if the value is dynamic.
 */
export const extract_static_string = (value: AST.Attribute['value']): string | null => {
	// Boolean attribute (e.g., <Mdz inline />)
	if (value === true) return null;

	// Plain attribute: content="text"
	if (Array.isArray(value)) {
		const first = value[0];
		if (value.length === 1 && first?.type === 'Text') {
			return first.data;
		}
		return null;
	}

	// ExpressionTag: content={expr}
	const expr = value.expression;
	// Null literal
	if (expr.type === 'Literal' && expr.value === null) return null;
	return evaluate_static_expr(expr);
};

/**
 * Resolves local names that import from specified source paths.
 *
 * Scans `ImportDeclaration` nodes in both the instance and module scripts.
 * Handles default, named, and aliased imports. Skips namespace imports.
 * Returns import node references alongside names to support import removal.
 *
 * @param ast The parsed Svelte AST root node.
 * @param component_imports Array of import source paths to match against.
 * @returns Map of local names to their resolved import info.
 */
export const resolve_component_names = (
	ast: AST.Root,
	component_imports: Array<string>,
): Map<string, ResolvedComponentImport> => {
	const names: Map<string, ResolvedComponentImport> = new Map();
	for (const script of [ast.instance, ast.module]) {
		if (!script) continue;
		for (const node of script.content.body) {
			if (node.type !== 'ImportDeclaration') continue;
			if (!component_imports.includes(node.source.value as string)) continue;
			for (const specifier of node.specifiers) {
				if (specifier.type === 'ImportNamespaceSpecifier') continue;
				names.set(specifier.local.name, {import_node: node, specifier});
			}
		}
	}
	return names;
};

/**
 * Finds the position to insert new import statements within a script block.
 *
 * Returns the end position of the last `ImportDeclaration`, or the start
 * of the script body content if no imports exist.
 *
 * @param script The parsed `AST.Script` node.
 * @returns The character position where new imports should be inserted.
 */
export const find_import_insert_position = (script: AST.Script): number => {
	let last_import_end = -1;
	for (const node of script.content.body) {
		if (node.type === 'ImportDeclaration') {
			// Svelte's parser always provides position data on AST nodes
			last_import_end = (node as unknown as AST.BaseNode).end;
		}
	}
	if (last_import_end !== -1) {
		return last_import_end;
	}
	return (script.content as unknown as AST.BaseNode).start;
};

/**
 * Generates tab-indented import statement lines from an import map.
 *
 * Default imports produce `import Name from 'path';` lines.
 * Named imports are grouped by path into `import {a, b} from 'path';` lines.
 *
 * @param imports Map of local names to their import info.
 * @returns A string of newline-separated import statements.
 */
export const generate_import_lines = (imports: Map<string, PreprocessImportInfo>): string => {
	const default_imports: Array<[string, string]> = [];
	const named_by_path: Map<string, Array<string>> = new Map();

	for (const [name, {path, kind}] of imports) {
		if (kind === 'default') {
			default_imports.push([name, path]);
		} else {
			let names = named_by_path.get(path);
			if (!names) {
				names = [];
				named_by_path.set(path, names);
			}
			names.push(name);
		}
	}

	const lines: Array<string> = [];
	for (const [name, path] of default_imports) {
		lines.push(`\timport ${name} from '${path}';`);
	}
	for (const [path, names] of named_by_path) {
		lines.push(`\timport {${names.join(', ')}} from '${path}';`);
	}
	return lines.join('\n');
};

/**
 * Checks if an identifier with the given name appears anywhere in an AST subtree.
 *
 * Recursively walks all object and array properties of the tree, matching
 * ESTree `Identifier` nodes (`{type: 'Identifier', name}`). Nodes in the
 * `skip` set are excluded from traversal — used to skip `ImportDeclaration`
 * nodes so the import's own specifier identifier doesn't false-positive.
 *
 * Safe for Svelte template ASTs: `Component.name` is a plain string property
 * (not an `Identifier` node), so `<Mdz>` tags do not produce false matches.
 *
 * @param node The AST subtree to search.
 * @param name The identifier name to look for.
 * @param skip Set of AST nodes to skip during traversal.
 * @returns `true` if a matching `Identifier` node is found.
 */
export const has_identifier_in_tree = (
	node: unknown,
	name: string,
	skip?: Set<unknown>,
): boolean => {
	if (node === null || node === undefined || typeof node !== 'object') return false;
	if (skip?.has(node)) return false;
	if (Array.isArray(node)) {
		return node.some((child) => has_identifier_in_tree(child, name, skip));
	}
	const record = node as Record<string, unknown>;
	if (record.type === 'Identifier' && record.name === name) return true;
	for (const key of Object.keys(record)) {
		if (has_identifier_in_tree(record[key], name, skip)) return true;
	}
	return false;
};

/**
 * Escapes text for safe embedding in Svelte template markup.
 *
 * Uses a single-pass regex replacement to avoid corruption that occurs with sequential
 * `.replace()` calls (where the second replace matches characters introduced by the first).
 *
 * Escapes four characters:
 * - `{` → `{'{'}` and `}` → `{'}'}` — prevents Svelte expression interpretation
 * - `<` → `&lt;` — prevents HTML/Svelte tag interpretation
 * - `&` → `&amp;` — prevents HTML entity interpretation
 *
 * The `&` escaping is necessary because runtime `MdzNodeView.svelte` renders text
 * with `{node.content}` (a Svelte expression), which auto-escapes `&` to `&amp;`.
 * The preprocessor emits raw template text where `&` is NOT auto-escaped, so
 * manual escaping is required to match the runtime behavior.
 */
export const escape_svelte_text = (text: string): string => {
	return text.replace(/[{}<&]/g, (ch) => {
		switch (ch) {
			case '{':
				return "{'{'}";
			case '}':
				return "{'}'}";
			case '<':
				return '&lt;';
			case '&':
				return '&amp;';
			default:
				return ch;
		}
	});
};

/**
 * Escapes a string for use inside a single-quoted JS string literal in Svelte expressions.
 *
 * Used for attribute values like `reference={'escaped_value'}` and
 * `content={'escaped_value'}`. Single quotes are used because the emitted
 * markup may contain double quotes (e.g., in HTML attribute values).
 *
 * The sequential `.replace()` calls are safe here because no replacement introduces
 * characters matched by later patterns: backslashes produce `\\` (not matched by
 * subsequent patterns), quotes produce `\'`, and steps 3/4 match actual newline/CR
 * characters (not the two-char strings `\n`/`\r`).
 */
export const escape_js_string = (value: string): string => {
	return value
		.replace(/\\/g, '\\\\') // backslashes first
		.replace(/'/g, "\\'") // single quotes
		.replace(/\n/g, '\\n') // newlines
		.replace(/\r/g, '\\r'); // carriage returns
};
