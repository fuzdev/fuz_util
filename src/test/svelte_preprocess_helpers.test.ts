import {test, assert, describe} from 'vitest';
import {parse} from 'svelte/compiler';

import {
	should_exclude,
	find_attribute,
	evaluate_static_expr,
	extract_static_string,
	resolve_component_names,
	generate_import_lines,
	find_import_insert_position,
	has_identifier_in_tree,
	escape_svelte_text,
	escape_js_string,
	type PreprocessImportInfo,
} from '$lib/svelte_preprocess_helpers.js';

describe('escape_svelte_text', () => {
	test('escapes opening curly brace', () => {
		assert.equal(escape_svelte_text('{'), "{'{'}");
	});

	test('escapes closing curly brace', () => {
		assert.equal(escape_svelte_text('}'), "{'}'}");
	});

	test('escapes less-than sign', () => {
		assert.equal(escape_svelte_text('<'), '&lt;');
	});

	test('escapes ampersand', () => {
		assert.equal(escape_svelte_text('&'), '&amp;');
	});

	test('escapes mixed special characters', () => {
		assert.equal(escape_svelte_text('{foo} < bar & baz'), "{'{'}foo{'}'} &lt; bar &amp; baz");
	});

	test('returns empty string unchanged', () => {
		assert.equal(escape_svelte_text(''), '');
	});

	test('returns string without special chars unchanged', () => {
		assert.equal(escape_svelte_text('hello world'), 'hello world');
	});

	test('regression: single-pass prevents sequential replace corruption', () => {
		// With sequential .replace() calls, {foo} would corrupt to {'{'{'}'} foo{'}'}
		// because the } in {'{'} from the first replace gets caught by the second replace.
		// Single-pass correctly produces {'{'}foo{'}'}.
		assert.equal(escape_svelte_text('{foo}'), "{'{'}foo{'}'}");
	});

	test('handles Svelte-like syntax in text', () => {
		assert.equal(
			escape_svelte_text('Use {#if} for conditionals'),
			"Use {'{'}#if{'}'} for conditionals",
		);
	});

	test('handles multiple adjacent special characters', () => {
		assert.equal(escape_svelte_text('{}'), "{'{'}{'}'}");
		assert.equal(escape_svelte_text('<<'), '&lt;&lt;');
		assert.equal(escape_svelte_text('&&'), '&amp;&amp;');
	});

	test('preserves whitespace including newlines', () => {
		assert.equal(escape_svelte_text('line 1\nline 2'), 'line 1\nline 2');
		assert.equal(escape_svelte_text('\t\tindented'), '\t\tindented');
	});

	test('does not escape greater-than sign', () => {
		assert.equal(escape_svelte_text('a > b'), 'a > b');
	});

	test('handles HTML entity-like content', () => {
		// If mdz text contains &amp; literally, it must be escaped to &amp;amp;
		// so the browser renders &amp; (matching runtime behavior).
		assert.equal(escape_svelte_text('&amp;'), '&amp;amp;');
		assert.equal(escape_svelte_text('&lt;'), '&amp;lt;');
	});
});

describe('escape_js_string', () => {
	test('escapes single quotes', () => {
		assert.equal(escape_js_string("it's"), "it\\'s");
	});

	test('escapes backslashes', () => {
		assert.equal(escape_js_string('a\\b'), 'a\\\\b');
	});

	test('escapes newlines', () => {
		assert.equal(escape_js_string('line 1\nline 2'), 'line 1\\nline 2');
	});

	test('escapes carriage returns', () => {
		assert.equal(escape_js_string('line 1\rline 2'), 'line 1\\rline 2');
	});

	test('escapes mixed special characters', () => {
		assert.equal(escape_js_string("it's a\nnew\\day"), "it\\'s a\\nnew\\\\day");
	});

	test('returns empty string unchanged', () => {
		assert.equal(escape_js_string(''), '');
	});

	test('returns string without special chars unchanged', () => {
		assert.equal(escape_js_string('hello world'), 'hello world');
	});

	test('backslashes are escaped before quotes', () => {
		// Input: \'  (backslash then quote)
		// Expected: \\\' (escaped backslash then escaped quote)
		assert.equal(escape_js_string("\\'"), "\\\\\\'");
	});

	test('escapes CRLF line endings', () => {
		assert.equal(escape_js_string('a\r\nb'), 'a\\r\\nb');
	});

	test('escapes line separator U+2028', () => {
		assert.equal(escape_js_string('a\u2028b'), 'a\\u2028b');
	});

	test('escapes paragraph separator U+2029', () => {
		assert.equal(escape_js_string('a\u2029b'), 'a\\u2029b');
	});

	test('escapes mixed line terminators', () => {
		assert.equal(escape_js_string('\n\r\u2028\u2029'), '\\n\\r\\u2028\\u2029');
	});
});

describe('should_exclude', () => {
	test('returns false when filename is undefined', () => {
		assert.equal(should_exclude(undefined, ['foo']), false);
	});

	test('returns false when filename is empty string', () => {
		assert.equal(should_exclude('', ['anything']), false);
	});

	test('returns false when exclude list is empty', () => {
		assert.equal(should_exclude('src/Foo.svelte', []), false);
	});

	test('matches string pattern as substring', () => {
		assert.equal(should_exclude('src/routes/page.svelte', ['routes/']), true);
	});

	test('returns false when string pattern does not match', () => {
		assert.equal(should_exclude('src/lib/Mdz.svelte', ['routes/']), false);
	});

	test('matches regex pattern', () => {
		assert.equal(should_exclude('Test.svelte', [/Test\.svelte$/]), true);
	});

	test('returns false when regex does not match', () => {
		assert.equal(should_exclude('Other.svelte', [/Test\.svelte$/]), false);
	});

	test('matches second pattern when first does not match', () => {
		assert.equal(should_exclude('src/lib/Mdz.svelte', ['routes/', 'lib/']), true);
	});

	test('matches with mixed string and regex patterns', () => {
		assert.equal(should_exclude('src/Test.svelte', ['routes/', /Test\.svelte$/]), true);
	});
});

describe('evaluate_static_expr', () => {
	test('returns value for string literal', () => {
		assert.equal(evaluate_static_expr({type: 'Literal', value: 'hello'}), 'hello');
	});

	test('returns null for number literal', () => {
		assert.equal(evaluate_static_expr({type: 'Literal', value: 42}), null);
	});

	test('returns null for boolean literal', () => {
		assert.equal(evaluate_static_expr({type: 'Literal', value: true}), null);
	});

	test('returns null for null literal', () => {
		assert.equal(evaluate_static_expr({type: 'Literal', value: null}), null);
	});

	test('returns cooked value for template literal without interpolation', () => {
		assert.equal(
			evaluate_static_expr({
				type: 'TemplateLiteral',
				expressions: [],
				quasis: [{value: {cooked: 'hello', raw: 'hello'}}],
			}),
			'hello',
		);
	});

	test('returns null for template literal with interpolation', () => {
		assert.equal(
			evaluate_static_expr({
				type: 'TemplateLiteral',
				expressions: [{type: 'Identifier', name: 'x'}],
				quasis: [{value: {cooked: 'a', raw: 'a'}}, {value: {cooked: 'b', raw: 'b'}}],
			}),
			null,
		);
	});

	test('concatenates string literals with +', () => {
		assert.equal(
			evaluate_static_expr({
				type: 'BinaryExpression',
				operator: '+',
				left: {type: 'Literal', value: 'hello '},
				right: {type: 'Literal', value: 'world'},
			}),
			'hello world',
		);
	});

	test('handles nested concatenation', () => {
		assert.equal(
			evaluate_static_expr({
				type: 'BinaryExpression',
				operator: '+',
				left: {
					type: 'BinaryExpression',
					operator: '+',
					left: {type: 'Literal', value: 'a'},
					right: {type: 'Literal', value: 'b'},
				},
				right: {type: 'Literal', value: 'c'},
			}),
			'abc',
		);
	});

	test('returns null when left side of concat is dynamic', () => {
		assert.equal(
			evaluate_static_expr({
				type: 'BinaryExpression',
				operator: '+',
				left: {type: 'Identifier', name: 'x'},
				right: {type: 'Literal', value: 'b'},
			}),
			null,
		);
	});

	test('returns null for non-plus binary operator', () => {
		assert.equal(
			evaluate_static_expr({
				type: 'BinaryExpression',
				operator: '-',
				left: {type: 'Literal', value: 'a'},
				right: {type: 'Literal', value: 'b'},
			}),
			null,
		);
	});

	test('returns null when right side of concat is dynamic', () => {
		assert.equal(
			evaluate_static_expr({
				type: 'BinaryExpression',
				operator: '+',
				left: {type: 'Literal', value: 'a'},
				right: {type: 'Identifier', name: 'x'},
			}),
			null,
		);
	});

	test('concatenates string literal with template literal', () => {
		assert.equal(
			evaluate_static_expr({
				type: 'BinaryExpression',
				operator: '+',
				left: {type: 'Literal', value: 'hello '},
				right: {
					type: 'TemplateLiteral',
					expressions: [],
					quasis: [{value: {cooked: 'world', raw: 'world'}}],
				},
			}),
			'hello world',
		);
	});

	test('returns value for empty string literal', () => {
		assert.equal(evaluate_static_expr({type: 'Literal', value: ''}), '');
	});

	test('returns null for call expression', () => {
		assert.equal(
			evaluate_static_expr({type: 'CallExpression', callee: {type: 'Identifier', name: 'fn'}}),
			null,
		);
	});

	test('returns null for identifier', () => {
		assert.equal(evaluate_static_expr({type: 'Identifier', name: 'x'}), null);
	});

	test('falls back to raw when cooked is null', () => {
		assert.equal(
			evaluate_static_expr({
				type: 'TemplateLiteral',
				expressions: [],
				quasis: [{value: {cooked: null, raw: '\\x41'}}],
			}),
			'\\x41',
		);
	});
});

describe('extract_static_string', () => {
	test('returns null for boolean true', () => {
		assert.equal(extract_static_string(true), null);
	});

	test('returns text data for single Text array', () => {
		assert.equal(extract_static_string([{type: 'Text', data: 'hello'}] as any), 'hello');
	});

	test('returns empty string for single empty Text', () => {
		assert.equal(extract_static_string([{type: 'Text', data: ''}] as any), '');
	});

	test('returns null for empty array', () => {
		assert.equal(extract_static_string([] as any), null);
	});

	test('returns null for mixed Text and ExpressionTag', () => {
		assert.equal(
			extract_static_string([
				{type: 'Text', data: 'a '},
				{type: 'ExpressionTag', expression: {type: 'Identifier', name: 'x'}},
			] as any),
			null,
		);
	});

	test('evaluates ExpressionTag with string literal', () => {
		assert.equal(
			extract_static_string({
				type: 'ExpressionTag',
				expression: {type: 'Literal', value: 'hello'},
			} as any),
			'hello',
		);
	});

	test('returns null for ExpressionTag with null literal', () => {
		assert.equal(
			extract_static_string({
				type: 'ExpressionTag',
				expression: {type: 'Literal', value: null},
			} as any),
			null,
		);
	});

	test('returns null for ExpressionTag with dynamic expression', () => {
		assert.equal(
			extract_static_string({
				type: 'ExpressionTag',
				expression: {type: 'Identifier', name: 'x'},
			} as any),
			null,
		);
	});

	test('returns null for array with multiple Text nodes', () => {
		assert.equal(
			extract_static_string([
				{type: 'Text', data: 'a'},
				{type: 'Text', data: 'b'},
			] as any),
			null,
		);
	});

	// Svelte parses content="{expr}" (quoted) as an array-wrapped ExpressionTag,
	// vs content={expr} (unquoted) as a bare ExpressionTag. The array form is
	// not delegated to evaluate_static_expr — only bare ExpressionTags are.
	test('returns null for array with single ExpressionTag', () => {
		assert.equal(
			extract_static_string([
				{type: 'ExpressionTag', expression: {type: 'Literal', value: 'hello'}},
			] as any),
			null,
		);
	});
});

describe('find_attribute', () => {
	test('finds attribute by name', () => {
		const node = {
			attributes: [
				{type: 'Attribute', name: 'content', value: 'test'},
				{type: 'Attribute', name: 'class', value: 'foo'},
			],
		} as any;
		const result = find_attribute(node, 'content');
		assert.equal(result?.name, 'content');
	});

	test('returns undefined when attribute not found', () => {
		const node = {
			attributes: [{type: 'Attribute', name: 'class', value: 'foo'}],
		} as any;
		assert.equal(find_attribute(node, 'content'), undefined);
	});

	test('skips SpreadAttribute nodes', () => {
		const node = {
			attributes: [
				{type: 'SpreadAttribute', expression: {}},
				{type: 'Attribute', name: 'content', value: 'test'},
			],
		} as any;
		const result = find_attribute(node, 'content');
		assert.equal(result?.name, 'content');
	});

	test('returns undefined for empty attributes array', () => {
		const node = {attributes: []} as any;
		assert.equal(find_attribute(node, 'content'), undefined);
	});

	test('skips directive nodes', () => {
		const node = {
			attributes: [
				{type: 'BindDirective', name: 'value'},
				{type: 'Attribute', name: 'content', value: 'test'},
			],
		} as any;
		const result = find_attribute(node, 'content');
		assert.equal(result?.name, 'content');
	});
});

describe('generate_import_lines', () => {
	test('generates single default import', () => {
		const imports: Map<string, PreprocessImportInfo> = new Map([
			['DocsLink', {path: '@fuzdev/fuz_ui/DocsLink.svelte', kind: 'default'}],
		]);
		assert.equal(
			generate_import_lines(imports),
			"\timport DocsLink from '@fuzdev/fuz_ui/DocsLink.svelte';",
		);
	});

	test('generates single named import', () => {
		const imports: Map<string, PreprocessImportInfo> = new Map([
			['resolve', {path: '$app/paths', kind: 'named'}],
		]);
		assert.equal(generate_import_lines(imports), "\timport {resolve} from '$app/paths';");
	});

	test('groups multiple named imports from same path', () => {
		const imports: Map<string, PreprocessImportInfo> = new Map([
			['resolve', {path: '$app/paths', kind: 'named'}],
			['base', {path: '$app/paths', kind: 'named'}],
		]);
		assert.equal(generate_import_lines(imports), "\timport {resolve, base} from '$app/paths';");
	});

	test('handles mixed default and named imports', () => {
		const imports: Map<string, PreprocessImportInfo> = new Map([
			['DocsLink', {path: '@fuzdev/fuz_ui/DocsLink.svelte', kind: 'default'}],
			['resolve', {path: '$app/paths', kind: 'named'}],
		]);
		assert.equal(
			generate_import_lines(imports),
			"\timport DocsLink from '@fuzdev/fuz_ui/DocsLink.svelte';\n\timport {resolve} from '$app/paths';",
		);
	});

	test('returns empty string for empty map', () => {
		assert.equal(generate_import_lines(new Map()), '');
	});

	test('generates multiple default imports on separate lines', () => {
		const imports: Map<string, PreprocessImportInfo> = new Map([
			['DocsLink', {path: '@fuzdev/fuz_ui/DocsLink.svelte', kind: 'default'}],
			['Code', {path: '@fuzdev/fuz_code/Code.svelte', kind: 'default'}],
		]);
		assert.equal(
			generate_import_lines(imports),
			"\timport DocsLink from '@fuzdev/fuz_ui/DocsLink.svelte';\n\timport Code from '@fuzdev/fuz_code/Code.svelte';",
		);
	});

	test('generates separate lines for named imports from different paths', () => {
		const imports: Map<string, PreprocessImportInfo> = new Map([
			['resolve', {path: '$app/paths', kind: 'named'}],
			['getContext', {path: 'svelte', kind: 'named'}],
		]);
		assert.equal(
			generate_import_lines(imports),
			"\timport {resolve} from '$app/paths';\n\timport {getContext} from 'svelte';",
		);
	});

	test('uses custom indent for default import', () => {
		const imports: Map<string, PreprocessImportInfo> = new Map([
			['DocsLink', {path: '@fuzdev/fuz_ui/DocsLink.svelte', kind: 'default'}],
		]);
		assert.equal(
			generate_import_lines(imports, '  '),
			"  import DocsLink from '@fuzdev/fuz_ui/DocsLink.svelte';",
		);
	});

	test('uses custom indent for named imports', () => {
		const imports: Map<string, PreprocessImportInfo> = new Map([
			['resolve', {path: '$app/paths', kind: 'named'}],
			['base', {path: '$app/paths', kind: 'named'}],
		]);
		assert.equal(
			generate_import_lines(imports, '    '),
			"    import {resolve, base} from '$app/paths';",
		);
	});

	test('uses empty indent', () => {
		const imports: Map<string, PreprocessImportInfo> = new Map([
			['resolve', {path: '$app/paths', kind: 'named'}],
		]);
		assert.equal(generate_import_lines(imports, ''), "import {resolve} from '$app/paths';");
	});
});

describe('resolve_component_names', () => {
	test('resolves default import', () => {
		const ast = parse(`<script lang="ts">import Mdz from '@fuzdev/fuz_ui/Mdz.svelte';</script>`, {
			modern: true,
		});
		const names = resolve_component_names(ast, ['@fuzdev/fuz_ui/Mdz.svelte']);
		assert.ok(names.has('Mdz'));
		assert.equal(names.size, 1);
	});

	test('resolves renamed default import', () => {
		const ast = parse(
			`<script lang="ts">import Markdown from '@fuzdev/fuz_ui/Mdz.svelte';</script>`,
			{modern: true},
		);
		const names = resolve_component_names(ast, ['@fuzdev/fuz_ui/Mdz.svelte']);
		assert.ok(names.has('Markdown'));
		assert.equal(names.size, 1);
	});

	test('returns empty map for unrelated import', () => {
		const ast = parse(`<script lang="ts">import Foo from './Foo.svelte';</script>`, {modern: true});
		const names = resolve_component_names(ast, ['@fuzdev/fuz_ui/Mdz.svelte']);
		assert.equal(names.size, 0);
	});

	test('returns empty map when no script', () => {
		const ast = parse(`<p>No script</p>`, {modern: true});
		const names = resolve_component_names(ast, ['@fuzdev/fuz_ui/Mdz.svelte']);
		assert.equal(names.size, 0);
	});

	test('resolves from multiple import sources', () => {
		const ast = parse(
			`<script lang="ts">
	import Mdz from '@fuzdev/fuz_ui/Mdz.svelte';
	import Markdown from '$lib/Mdz.svelte';
</script>`,
			{modern: true},
		);
		const names = resolve_component_names(ast, ['@fuzdev/fuz_ui/Mdz.svelte', '$lib/Mdz.svelte']);
		assert.ok(names.has('Mdz'));
		assert.ok(names.has('Markdown'));
		assert.equal(names.size, 2);
	});

	test('ignores namespace imports', () => {
		const ast = parse(
			`<script lang="ts">import * as Mdz from '@fuzdev/fuz_ui/Mdz.svelte';</script>`,
			{modern: true},
		);
		const names = resolve_component_names(ast, ['@fuzdev/fuz_ui/Mdz.svelte']);
		assert.equal(names.size, 0);
	});

	test('ignores non-matching imports from same file', () => {
		const ast = parse(
			`<script lang="ts">
	import Mdz from '@fuzdev/fuz_ui/Mdz.svelte';
	import Foo from './Foo.svelte';
</script>`,
			{modern: true},
		);
		const names = resolve_component_names(ast, ['@fuzdev/fuz_ui/Mdz.svelte']);
		assert.ok(names.has('Mdz'));
		assert.ok(!names.has('Foo'));
		assert.equal(names.size, 1);
	});

	test('returns import node references', () => {
		const ast = parse(`<script lang="ts">import Mdz from '@fuzdev/fuz_ui/Mdz.svelte';</script>`, {
			modern: true,
		});
		const names = resolve_component_names(ast, ['@fuzdev/fuz_ui/Mdz.svelte']);
		const info = names.get('Mdz');
		assert.ok(info);
		assert.equal(info.import_node.type, 'ImportDeclaration');
		assert.equal(info.specifier.local.name, 'Mdz');
	});

	test('resolves named import', () => {
		const ast = parse(
			`<script lang="ts">import {Mdz} from '@fuzdev/fuz_ui/Mdz.svelte';</script>`,
			{modern: true},
		);
		const names = resolve_component_names(ast, ['@fuzdev/fuz_ui/Mdz.svelte']);
		assert.ok(names.has('Mdz'));
		assert.equal(names.size, 1);
	});

	test('resolves aliased named import', () => {
		const ast = parse(
			`<script lang="ts">import {default as Markdown} from '@fuzdev/fuz_ui/Mdz.svelte';</script>`,
			{modern: true},
		);
		const names = resolve_component_names(ast, ['@fuzdev/fuz_ui/Mdz.svelte']);
		assert.ok(names.has('Markdown'));
		assert.equal(names.size, 1);
	});

	test('resolves import from module script', () => {
		const ast = parse(
			`<script module>import Mdz from '@fuzdev/fuz_ui/Mdz.svelte';</script>`,
			{modern: true},
		);
		const names = resolve_component_names(ast, ['@fuzdev/fuz_ui/Mdz.svelte']);
		assert.ok(names.has('Mdz'));
		assert.equal(names.size, 1);
	});

	test('resolves multiple specifiers from same import', () => {
		const ast = parse(
			`<script lang="ts">import Mdz, {helper} from '@fuzdev/fuz_ui/Mdz.svelte';</script>`,
			{modern: true},
		);
		const names = resolve_component_names(ast, ['@fuzdev/fuz_ui/Mdz.svelte']);
		assert.ok(names.has('Mdz'));
		assert.ok(names.has('helper'));
		assert.equal(names.size, 2);
		// Both specifiers share the same import_node
		assert.equal(names.get('Mdz')!.import_node, names.get('helper')!.import_node);
	});
});

describe('find_import_insert_position', () => {
	test('returns end of last import declaration', () => {
		const source = `<script lang="ts">
	import Mdz from '@fuzdev/fuz_ui/Mdz.svelte';
	import {resolve} from '$app/paths';
	const x = 1;
</script>`;
		const ast = parse(source, {modern: true});
		const pos = find_import_insert_position(ast.instance!);
		// Position should be immediately after the last import's semicolon
		const last_import_end = source.indexOf("from '$app/paths';") + "from '$app/paths';".length;
		assert.equal(pos, last_import_end);
	});

	test('returns script body start when no imports', () => {
		const source = `<script lang="ts">
	const x = 1;
</script>`;
		const ast = parse(source, {modern: true});
		const pos = find_import_insert_position(ast.instance!);
		assert.equal(pos, (ast.instance!.content as any).start);
	});

	test('returns end of single import declaration', () => {
		const source = `<script lang="ts">
	import Mdz from '@fuzdev/fuz_ui/Mdz.svelte';
	const x = 1;
</script>`;
		const ast = parse(source, {modern: true});
		const pos = find_import_insert_position(ast.instance!);
		const import_end = source.indexOf("from '@fuzdev/fuz_ui/Mdz.svelte';") + "from '@fuzdev/fuz_ui/Mdz.svelte';".length;
		assert.equal(pos, import_end);
	});
});

describe('has_identifier_in_tree', () => {
	test('returns false for null', () => {
		assert.equal(has_identifier_in_tree(null, 'Mdz'), false);
	});

	test('returns false for undefined', () => {
		assert.equal(has_identifier_in_tree(undefined, 'Mdz'), false);
	});

	test('returns false for number', () => {
		assert.equal(has_identifier_in_tree(42, 'Mdz'), false);
	});

	test('returns false for string', () => {
		assert.equal(has_identifier_in_tree('Mdz', 'Mdz'), false);
	});

	test('returns false for boolean', () => {
		assert.equal(has_identifier_in_tree(true, 'Mdz'), false);
	});

	test('returns false for empty object', () => {
		assert.equal(has_identifier_in_tree({type: 'Program', body: []}, 'Mdz'), false);
	});

	test('returns true for direct identifier match', () => {
		assert.equal(has_identifier_in_tree({type: 'Identifier', name: 'Mdz'}, 'Mdz'), true);
	});

	test('returns false for different identifier name', () => {
		assert.equal(has_identifier_in_tree({type: 'Identifier', name: 'Foo'}, 'Mdz'), false);
	});

	test('returns false for string literal with matching value', () => {
		assert.equal(has_identifier_in_tree({type: 'Literal', value: 'Mdz'}, 'Mdz'), false);
	});

	test('finds identifier in variable declaration init', () => {
		const node = {
			type: 'VariableDeclaration',
			declarations: [
				{
					type: 'VariableDeclarator',
					id: {type: 'Identifier', name: 'X'},
					init: {type: 'Identifier', name: 'Mdz'},
				},
			],
		};
		assert.equal(has_identifier_in_tree(node, 'Mdz'), true);
	});

	test('finds identifier in function call argument', () => {
		const node = {
			type: 'CallExpression',
			callee: {type: 'Identifier', name: 'fn'},
			arguments: [{type: 'Identifier', name: 'Mdz'}],
		};
		assert.equal(has_identifier_in_tree(node, 'Mdz'), true);
	});

	test('finds identifier in member expression object', () => {
		const node = {
			type: 'MemberExpression',
			object: {type: 'Identifier', name: 'Mdz'},
			property: {type: 'Identifier', name: 'foo'},
		};
		assert.equal(has_identifier_in_tree(node, 'Mdz'), true);
	});

	test('finds identifier in assignment right side', () => {
		const node = {
			type: 'AssignmentExpression',
			left: {type: 'Identifier', name: 'X'},
			right: {type: 'Identifier', name: 'Mdz'},
		};
		assert.equal(has_identifier_in_tree(node, 'Mdz'), true);
	});

	test('finds identifier in deeply nested structure', () => {
		const node = {
			type: 'ExpressionStatement',
			expression: {
				type: 'CallExpression',
				callee: {type: 'Identifier', name: 'outer'},
				arguments: [
					{
						type: 'CallExpression',
						callee: {type: 'Identifier', name: 'inner'},
						arguments: [{type: 'Identifier', name: 'Mdz'}],
					},
				],
			},
		};
		assert.equal(has_identifier_in_tree(node, 'Mdz'), true);
	});

	test('skips nodes in the skip set', () => {
		const import_node = {
			type: 'ImportDeclaration',
			specifiers: [{type: 'ImportDefaultSpecifier', local: {type: 'Identifier', name: 'Mdz'}}],
			source: {type: 'Literal', value: '@fuzdev/fuz_ui/Mdz.svelte'},
		};
		assert.equal(has_identifier_in_tree(import_node, 'Mdz', new Set([import_node])), false);
	});

	test('finds identifier in array elements', () => {
		const node = [
			{type: 'Identifier', name: 'Foo'},
			{type: 'Identifier', name: 'Mdz'},
		];
		assert.equal(has_identifier_in_tree(node, 'Mdz'), true);
	});

	test('returns false for empty array', () => {
		assert.equal(has_identifier_in_tree([], 'Mdz'), false);
	});
});

describe('has_identifier_in_tree with parsed Svelte ASTs', () => {
	test('finds identifier in template ExpressionTag', () => {
		const ast = parse(
			`<script lang="ts">
	import Mdz from '@fuzdev/fuz_ui/Mdz.svelte';
</script>

{Mdz}`,
			{modern: true},
		);
		assert.equal(has_identifier_in_tree(ast.fragment, 'Mdz'), true);
	});

	test('finds identifier in template attribute expression', () => {
		const ast = parse(
			`<script lang="ts">
	import Mdz from '@fuzdev/fuz_ui/Mdz.svelte';
	import Foo from './Foo.svelte';
</script>

<Foo comp={Mdz} />`,
			{modern: true},
		);
		assert.equal(has_identifier_in_tree(ast.fragment, 'Mdz'), true);
	});

	test('finds identifier in if block test', () => {
		const ast = parse(
			`<script lang="ts">
	import Mdz from '@fuzdev/fuz_ui/Mdz.svelte';
</script>

{#if Mdz}yes{/if}`,
			{modern: true},
		);
		assert.equal(has_identifier_in_tree(ast.fragment, 'Mdz'), true);
	});

	test('does not match Component.name (plain string, not Identifier)', () => {
		const ast = parse(
			`<script lang="ts">
	import Mdz from '@fuzdev/fuz_ui/Mdz.svelte';
</script>

<Mdz content="text" />`,
			{modern: true},
		);
		assert.equal(has_identifier_in_tree(ast.fragment, 'Mdz'), false);
	});

	test('finds identifier in script body (outside import)', () => {
		const ast = parse(
			`<script lang="ts">
	import Mdz from '@fuzdev/fuz_ui/Mdz.svelte';
	const X = Mdz;
</script>`,
			{modern: true},
		);
		const import_node = ast.instance!.content.body[0];
		assert.equal(
			has_identifier_in_tree(ast.instance!.content, 'Mdz', new Set([import_node])),
			true,
		);
	});

	test('returns false for script body with only the import', () => {
		const ast = parse(
			`<script lang="ts">
	import Mdz from '@fuzdev/fuz_ui/Mdz.svelte';
</script>`,
			{modern: true},
		);
		const import_node = ast.instance!.content.body[0];
		assert.equal(
			has_identifier_in_tree(ast.instance!.content, 'Mdz', new Set([import_node])),
			false,
		);
	});
});
