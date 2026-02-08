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

import type {
	ConditionalExpression,
	Expression,
	ImportDeclaration,
	ImportDefaultSpecifier,
	ImportSpecifier,
	VariableDeclaration,
} from 'estree';
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
	/** The `ImportDeclaration` AST node that provides this name. */
	import_node: ImportDeclaration;
	/** The specific import specifier for this name. */
	specifier: ImportSpecifier | ImportDefaultSpecifier;
}

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
 * Handles string `Literal`, `TemplateLiteral` (including interpolations when all
 * expressions resolve), `BinaryExpression` with `+`, and `Identifier` lookup
 * via an optional bindings map built by `build_static_bindings`.
 * Returns `null` for dynamic expressions, non-string literals, or unsupported node types.
 *
 * @param expr An ESTree expression AST node.
 * @param bindings Optional map of variable names to their resolved static string values.
 * @returns The resolved static string, or `null` if the expression is dynamic.
 */
export const evaluate_static_expr = (
	expr: Expression,
	bindings?: ReadonlyMap<string, string>,
): string | null => {
	if (expr.type === 'Literal' && typeof expr.value === 'string') return expr.value;
	if (expr.type === 'TemplateLiteral') {
		if (expr.expressions.length === 0) {
			return expr.quasis.map((q) => q.value.cooked ?? q.value.raw).join('');
		}
		// Try resolving interpolations through bindings
		const parts: Array<string> = [];
		for (let i = 0; i < expr.quasis.length; i++) {
			const quasi = expr.quasis[i]!;
			parts.push(quasi.value.cooked ?? quasi.value.raw);
			if (i < expr.expressions.length) {
				const val = evaluate_static_expr(expr.expressions[i]!, bindings);
				if (val === null) return null;
				parts.push(val);
			}
		}
		return parts.join('');
	}
	if (expr.type === 'BinaryExpression' && expr.operator === '+') {
		if (expr.left.type === 'PrivateIdentifier') return null;
		const left = evaluate_static_expr(expr.left, bindings);
		if (left === null) return null;
		const right = evaluate_static_expr(expr.right, bindings);
		if (right === null) return null;
		return left + right;
	}
	if (expr.type === 'Identifier' && bindings?.has(expr.name)) {
		return bindings.get(expr.name)!;
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
 * @param bindings Optional map of variable names to their resolved static string values.
 * @returns The resolved static string, or `null` if the value is dynamic.
 */
export const extract_static_string = (
	value: AST.Attribute['value'],
	bindings?: ReadonlyMap<string, string>,
): string | null => {
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
	return evaluate_static_expr(expr, bindings);
};

/** A single branch in a conditional chain extracted from nested ternary expressions. */
export interface ConditionalChainBranch {
	/** The source text of the test expression, or `null` for the final else branch. */
	test_source: string | null;
	/** The resolved static string value for this branch. */
	value: string;
}

/**
 * Extracts a chain of conditional expressions where all leaf values are static strings.
 *
 * Handles nested ternaries like `a ? 'x' : b ? 'y' : 'z'` by iteratively walking
 * the right-recursive `ConditionalExpression` chain. At each level, evaluates the
 * consequent via `evaluate_static_expr` and continues into the alternate if it is
 * another `ConditionalExpression`. The final alternate is the else branch.
 *
 * Returns `null` if the attribute value is not an `ExpressionTag` containing a
 * `ConditionalExpression`, if any leaf fails to resolve to a static string, or
 * if the chain exceeds 10 branches (safety limit).
 *
 * A 2-branch result covers the simple ternary case (`a ? 'x' : 'y'`).
 *
 * @param value The attribute value from `AST.Attribute['value']`.
 * @param source The full source string (needed to slice test expression source text).
 * @param bindings Map of variable names to their resolved static string values.
 * @returns Array of conditional chain branches, or `null` if not extractable.
 */
export const try_extract_conditional_chain = (
	value: AST.Attribute['value'],
	source: string,
	bindings: ReadonlyMap<string, string>,
): Array<ConditionalChainBranch> | null => {
	if (value === true || Array.isArray(value)) return null;
	const expr = value.expression;
	if (expr.type !== 'ConditionalExpression') return null;

	const MAX_BRANCHES = 10;
	const branches: Array<ConditionalChainBranch> = [];
	let current: ConditionalExpression = expr;

	for (;;) {
		const consequent = evaluate_static_expr(current.consequent, bindings);
		if (consequent === null) return null;

		const test = current.test as any;
		const test_source = source.slice(test.start, test.end);
		branches.push({test_source, value: consequent});

		if (branches.length >= MAX_BRANCHES) return null;

		if (current.alternate.type === 'ConditionalExpression') {
			current = current.alternate;
		} else {
			// Final else branch
			const alternate = evaluate_static_expr(current.alternate, bindings);
			if (alternate === null) return null;
			branches.push({test_source: null, value: alternate});
			break;
		}
	}

	return branches;
};

// TODO cross-import tracing: resolve `import {x} from './constants.js'` by reading
// and parsing the imported module, extracting `export const` values. Would need path
// resolution ($lib, tsconfig paths), a Program-node variant of this function, and
// cache invalidation when the imported file changes. Start with relative .ts/.js only.

/**
 * Builds a map of statically resolvable `const` bindings from a Svelte AST.
 *
 * Scans top-level `const` variable declarations in both instance and module scripts.
 * For each declarator with a plain `Identifier` pattern and a statically evaluable
 * initializer, adds the binding to the map. Processes declarations in source order
 * so that chained references resolve: `const a = 'x'; const b = a;` maps `b` to `'x'`.
 *
 * Skips destructuring patterns, `let`/`var` declarations, and declarations
 * whose initializers reference dynamic values.
 *
 * @param ast The parsed Svelte AST root node.
 * @returns Map of variable names to their resolved static string values.
 */
export const build_static_bindings = (ast: AST.Root): Map<string, string> => {
	const bindings: Map<string, string> = new Map();
	for (const script of [ast.instance, ast.module]) {
		if (!script) continue;
		for (const node of script.content.body) {
			if (node.type !== 'VariableDeclaration' || node.kind !== 'const') continue;
			for (const declarator of node.declarations) {
				if (declarator.id.type !== 'Identifier') continue;
				if (!declarator.init) continue;
				const value = evaluate_static_expr(declarator.init, bindings);
				if (value !== null) {
					bindings.set(declarator.id.name, value);
				}
			}
		}
	}
	return bindings;
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
 * Generates indented import statement lines from an import map.
 *
 * Default imports produce `import Name from 'path';` lines.
 * Named imports are grouped by path into `import {a, b} from 'path';` lines.
 *
 * @param imports Map of local names to their import info.
 * @param indent Indentation prefix for each line. @default '\t'
 * @returns A string of newline-separated import statements.
 */
export const generate_import_lines = (
	imports: Map<string, PreprocessImportInfo>,
	indent: string = '\t',
): string => {
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
		lines.push(`${indent}import ${name} from '${path}';`);
	}
	for (const [path, names] of named_by_path) {
		lines.push(`${indent}import {${names.join(', ')}} from '${path}';`);
	}
	return lines.join('\n');
};

/**
 * ESTree node fields that contain `Identifier` nodes which are NOT binding references.
 *
 * Keyed by node type. Each entry lists fields to skip during identifier search,
 * optionally conditioned on the node's `computed` property being falsy.
 *
 * Examples of non-reference positions:
 * - `obj.Mdz` — `MemberExpression.property` when `computed: false`
 * - `{ Mdz: value }` — `Property.key` when `computed: false`
 * - `label: for(...)` — `LabeledStatement.label`
 */
const NON_REFERENCE_FIELDS: Map<
	string,
	Array<{field: string; when_not_computed?: boolean}>
> = new Map([
	['MemberExpression', [{field: 'property', when_not_computed: true}]],
	['Property', [{field: 'key', when_not_computed: true}]],
	['PropertyDefinition', [{field: 'key', when_not_computed: true}]],
	['MethodDefinition', [{field: 'key', when_not_computed: true}]],
	['LabeledStatement', [{field: 'label'}]],
	['BreakStatement', [{field: 'label'}]],
	['ContinueStatement', [{field: 'label'}]],
]);

/**
 * Checks if an identifier with the given name appears anywhere in an AST subtree.
 *
 * Recursively walks all object and array properties of the tree, matching
 * ESTree `Identifier` nodes (`{type: 'Identifier', name}`). Nodes in the
 * `skip` set are excluded from traversal — used to skip `ImportDeclaration`
 * nodes so the import's own specifier identifier doesn't false-positive.
 *
 * Skips `Identifier` nodes in non-reference positions defined by
 * `NON_REFERENCE_FIELDS` — for example, `obj.Mdz` (non-computed member property),
 * `{ Mdz: value }` (non-computed object key), and statement labels.
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
	const rules = NON_REFERENCE_FIELDS.get(record.type as string);
	for (const key of Object.keys(record)) {
		if (rules?.some((r) => r.field === key && (!r.when_not_computed || !record.computed))) {
			continue;
		}
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
export const escape_svelte_text = (text: string): string =>
	text.replace(/[{}<&]/g, (ch) => {
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

/**
 * Removes a single-declarator `VariableDeclaration` from source using MagicString.
 *
 * Consumes leading whitespace (tabs/spaces) and trailing newline to avoid leaving
 * blank lines. Only safe for single-declarator statements (`const x = 'val';`);
 * callers must verify `node.declarations.length === 1` before calling.
 *
 * @param s The MagicString instance to modify.
 * @param declaration_node The `VariableDeclaration` AST node with Svelte position data.
 * @param source The original source string.
 */
export const remove_variable_declaration = (
	s: {remove: (start: number, end: number) => unknown},
	declaration_node: VariableDeclaration & {start: number; end: number},
	source: string,
): void => {
	remove_positioned_node(s, declaration_node, source);
};

/**
 * Removes an `ImportDeclaration` from source using MagicString.
 *
 * Consumes leading whitespace (tabs/spaces) and trailing newline to avoid leaving
 * blank lines.
 *
 * @param s The MagicString instance to modify.
 * @param import_node The `ImportDeclaration` AST node with Svelte position data.
 * @param source The original source string.
 */
export const remove_import_declaration = (
	s: {remove: (start: number, end: number) => unknown},
	import_node: ImportDeclaration & {start: number; end: number},
	source: string,
): void => {
	remove_positioned_node(s, import_node, source);
};

/**
 * Removes a positioned AST node from source, consuming surrounding whitespace.
 *
 * Consumes leading whitespace (tabs/spaces) and trailing newline to avoid leaving
 * blank lines. Shared implementation for `remove_variable_declaration` and
 * `remove_import_declaration`.
 */
const remove_positioned_node = (
	s: {remove: (start: number, end: number) => unknown},
	node: {start: number; end: number},
	source: string,
): void => {
	let start: number = node.start;
	let end: number = node.end;

	// Consume trailing newline
	if (source[end] === '\n') {
		end++;
	} else if (source[end] === '\r' && source[end + 1] === '\n') {
		end += 2;
	}

	// Consume leading whitespace on the same line
	while (start > 0 && (source[start - 1] === '\t' || source[start - 1] === ' ')) {
		start--;
	}

	s.remove(start, end);
};

/**
 * Removes a specifier from a multi-specifier import declaration by
 * reconstructing the statement without the removed specifier.
 *
 * Overwrites the entire declaration range to avoid character-level comma surgery.
 *
 * Handles:
 * - `import Mdz, {other} from '...'` → `import {other} from '...'`
 * - `import {default as Mdz, other} from '...'` → `import {other} from '...'`
 * - `import {Mdz, other} from '...'` → `import {other} from '...'`
 *
 * @param s The MagicString instance to modify.
 * @param node The positioned `ImportDeclaration` AST node.
 * @param specifier_to_remove The specifier to remove from the import.
 * @param source The original source string.
 * @param additional_lines Extra content appended after the reconstructed import
 *   (used to bundle new imports into the overwrite to avoid MagicString boundary conflicts).
 */
export const remove_import_specifier = (
	s: {overwrite: (start: number, end: number, content: string) => unknown},
	node: ImportDeclaration & {start: number; end: number},
	specifier_to_remove: ImportDeclaration['specifiers'][number],
	source: string,
	additional_lines: string = '',
): void => {
	const remaining = node.specifiers.filter((spec) => spec !== specifier_to_remove);
	if (remaining.length === 0) return;

	const source_path = node.source.value as string;

	// Reconstruct the import statement
	const default_specs = remaining.filter((sp) => sp.type === 'ImportDefaultSpecifier');
	const named_specs = remaining.filter(
		(sp) => sp.type === 'ImportSpecifier' || sp.type === 'ImportNamespaceSpecifier',
	);

	let import_clause = '';
	if (default_specs.length > 0) {
		import_clause = default_specs[0]!.local.name;
		if (named_specs.length > 0) {
			import_clause += `, {${format_named_specifiers(named_specs)}}`;
		}
	} else if (named_specs.length > 0) {
		import_clause = `{${format_named_specifiers(named_specs)}}`;
	}

	const reconstructed = `import ${import_clause} from '${source_path}';`;

	// Find leading whitespace to preserve indentation
	let line_start = node.start;
	while (line_start > 0 && (source[line_start - 1] === '\t' || source[line_start - 1] === ' ')) {
		line_start--;
	}
	const indent = source.slice(line_start, node.start);

	s.overwrite(line_start, node.end, `${indent}${reconstructed}${additional_lines}`);
};

/** Formats named/namespace specifiers as comma-separated string. */
const format_named_specifiers = (specs: Array<ImportDeclaration['specifiers'][number]>): string =>
	specs
		.map((spec) => {
			if (spec.type === 'ImportNamespaceSpecifier') return `* as ${spec.local.name}`;
			if (spec.type !== 'ImportSpecifier') return spec.local.name;
			const imported_name =
				spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value;
			if (imported_name !== spec.local.name) {
				return `${imported_name} as ${spec.local.name}`;
			}
			return spec.local.name;
		})
		.join(', ');

/**
 * Handles errors during Svelte preprocessing with configurable behavior.
 *
 * @param error The caught error.
 * @param prefix Log prefix (e.g. `'[fuz-mdz]'`, `'[fuz-code]'`).
 * @param filename The file being processed.
 * @param on_error `'throw'` to re-throw as a new Error, `'log'` to console.error.
 */
export const handle_preprocess_error = (
	error: unknown,
	prefix: string,
	filename: string | undefined,
	on_error: 'throw' | 'log',
): void => {
	const message = `${prefix} Preprocessing failed${filename ? ` in ${filename}` : ''}: ${error instanceof Error ? error.message : String(error)}`;
	if (on_error === 'throw') {
		throw new Error(message, {cause: error});
	}
	// eslint-disable-next-line no-console
	console.error(message);
};
