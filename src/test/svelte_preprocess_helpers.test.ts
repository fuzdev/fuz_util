import {test, assert, describe} from 'vitest';
import {parse} from 'svelte/compiler';
import type {Expression} from 'estree';

import {
	find_attribute,
	evaluate_static_expr,
	extract_static_string,
	build_static_bindings,
	resolve_component_names,
	generate_import_lines,
	find_import_insert_position,
	has_identifier_in_tree,
	escape_svelte_text,
	type PreprocessImportInfo,
} from '$lib/svelte_preprocess_helpers.js';

describe('evaluate_static_expr', () => {
	test('returns value for string literal', () => {
		assert.equal(evaluate_static_expr({type: 'Literal', value: 'hello'} as Expression), 'hello');
	});

	test('returns null for number literal', () => {
		assert.equal(evaluate_static_expr({type: 'Literal', value: 42} as Expression), null);
	});

	test('returns null for boolean literal', () => {
		assert.equal(evaluate_static_expr({type: 'Literal', value: true} as Expression), null);
	});

	test('returns null for null literal', () => {
		assert.equal(evaluate_static_expr({type: 'Literal', value: null} as Expression), null);
	});

	test('returns cooked value for template literal without interpolation', () => {
		assert.equal(
			evaluate_static_expr({
				type: 'TemplateLiteral',
				expressions: [],
				quasis: [{type: 'TemplateElement', tail: true, value: {cooked: 'hello', raw: 'hello'}}],
			} as Expression),
			'hello',
		);
	});

	test('returns null for template literal with interpolation', () => {
		assert.equal(
			evaluate_static_expr({
				type: 'TemplateLiteral',
				expressions: [{type: 'Identifier', name: 'x'}],
				quasis: [
					{type: 'TemplateElement', tail: false, value: {cooked: 'a', raw: 'a'}},
					{type: 'TemplateElement', tail: true, value: {cooked: 'b', raw: 'b'}},
				],
			} as Expression),
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
			} as Expression),
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
			} as Expression),
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
			} as Expression),
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
			} as Expression),
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
			} as Expression),
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
					quasis: [{type: 'TemplateElement', tail: true, value: {cooked: 'world', raw: 'world'}}],
				},
			} as Expression),
			'hello world',
		);
	});

	test('returns value for empty string literal', () => {
		assert.equal(evaluate_static_expr({type: 'Literal', value: ''} as Expression), '');
	});

	test('returns null for call expression', () => {
		assert.equal(
			evaluate_static_expr({
				type: 'CallExpression',
				callee: {type: 'Identifier', name: 'fn'},
			} as Expression),
			null,
		);
	});

	test('returns null for identifier', () => {
		assert.equal(evaluate_static_expr({type: 'Identifier', name: 'x'} as Expression), null);
	});

	test('falls back to raw when cooked is null', () => {
		assert.equal(
			evaluate_static_expr({
				type: 'TemplateLiteral',
				expressions: [],
				quasis: [{type: 'TemplateElement', tail: true, value: {cooked: null, raw: '\\x41'}}],
			} as Expression),
			'\\x41',
		);
	});

	test('returns null for PrivateIdentifier on left side of binary +', () => {
		assert.equal(
			evaluate_static_expr({
				type: 'BinaryExpression',
				operator: '+',
				left: {type: 'PrivateIdentifier', name: 'x'},
				right: {type: 'Literal', value: 'b'},
			} as unknown as Expression),
			null,
		);
	});

	test('resolves identifier from bindings', () => {
		const bindings = new Map([['x', 'hello']]);
		assert.equal(
			evaluate_static_expr({type: 'Identifier', name: 'x'} as Expression, bindings),
			'hello',
		);
	});

	test('returns null for identifier not in bindings', () => {
		const bindings = new Map([['y', 'hello']]);
		assert.equal(
			evaluate_static_expr({type: 'Identifier', name: 'x'} as Expression, bindings),
			null,
		);
	});

	test('returns null for identifier without bindings', () => {
		assert.equal(evaluate_static_expr({type: 'Identifier', name: 'x'} as Expression), null);
	});

	test('resolves identifier in binary concat', () => {
		const bindings = new Map([['x', 'hello']]);
		assert.equal(
			evaluate_static_expr(
				{
					type: 'BinaryExpression',
					operator: '+',
					left: {type: 'Identifier', name: 'x'},
					right: {type: 'Literal', value: ' world'},
				} as Expression,
				bindings,
			),
			'hello world',
		);
	});

	test('resolves template literal with identifier interpolation', () => {
		const bindings = new Map([['name', 'world']]);
		assert.equal(
			evaluate_static_expr(
				{
					type: 'TemplateLiteral',
					expressions: [{type: 'Identifier', name: 'name'}],
					quasis: [
						{type: 'TemplateElement', tail: false, value: {cooked: 'hello ', raw: 'hello '}},
						{type: 'TemplateElement', tail: true, value: {cooked: '!', raw: '!'}},
					],
				} as Expression,
				bindings,
			),
			'hello world!',
		);
	});

	test('returns null for template literal with unresolvable interpolation', () => {
		const bindings = new Map([['other', 'value']]);
		assert.equal(
			evaluate_static_expr(
				{
					type: 'TemplateLiteral',
					expressions: [{type: 'Identifier', name: 'name'}],
					quasis: [
						{type: 'TemplateElement', tail: false, value: {cooked: 'hello ', raw: 'hello '}},
						{type: 'TemplateElement', tail: true, value: {cooked: '', raw: ''}},
					],
				} as Expression,
				bindings,
			),
			null,
		);
	});

	test('resolves template literal with multiple interpolations', () => {
		const bindings = new Map([
			['greeting', 'hello'],
			['name', 'world'],
		]);
		assert.equal(
			evaluate_static_expr(
				{
					type: 'TemplateLiteral',
					expressions: [
						{type: 'Identifier', name: 'greeting'},
						{type: 'Identifier', name: 'name'},
					],
					quasis: [
						{type: 'TemplateElement', tail: false, value: {cooked: '', raw: ''}},
						{type: 'TemplateElement', tail: false, value: {cooked: ' ', raw: ' '}},
						{type: 'TemplateElement', tail: true, value: {cooked: '!', raw: '!'}},
					],
				} as Expression,
				bindings,
			),
			'hello world!',
		);
	});

	test('resolves template literal with literal expression', () => {
		assert.equal(
			evaluate_static_expr({
				type: 'TemplateLiteral',
				expressions: [{type: 'Literal', value: 'world'}],
				quasis: [
					{type: 'TemplateElement', tail: false, value: {cooked: 'hello ', raw: 'hello '}},
					{type: 'TemplateElement', tail: true, value: {cooked: '', raw: ''}},
				],
			} as Expression),
			'hello world',
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

	test('evaluates ExpressionTag with binary concat expression', () => {
		assert.equal(
			extract_static_string({
				type: 'ExpressionTag',
				expression: {
					type: 'BinaryExpression',
					operator: '+',
					left: {type: 'Literal', value: 'hello '},
					right: {type: 'Literal', value: 'world'},
				},
			} as any),
			'hello world',
		);
	});

	test('resolves identifier via bindings', () => {
		const bindings = new Map([['msg', 'hello']]);
		assert.equal(
			extract_static_string(
				{
					type: 'ExpressionTag',
					expression: {type: 'Identifier', name: 'msg'},
				} as any,
				bindings,
			),
			'hello',
		);
	});

	test('returns null for identifier without bindings', () => {
		assert.equal(
			extract_static_string({
				type: 'ExpressionTag',
				expression: {type: 'Identifier', name: 'msg'},
			} as any),
			null,
		);
	});
});

describe('build_static_bindings', () => {
	test('resolves const string literal', () => {
		const ast = parse(
			`<script lang="ts">
	const msg = 'hello';
</script>`,
			{modern: true},
		);
		const bindings = build_static_bindings(ast);
		assert.equal(bindings.get('msg'), 'hello');
	});

	test('resolves const template literal', () => {
		const ast = parse(
			`<script lang="ts">
	const msg = \`hello world\`;
</script>`,
			{modern: true},
		);
		const bindings = build_static_bindings(ast);
		assert.equal(bindings.get('msg'), 'hello world');
	});

	test('resolves chained const references', () => {
		const ast = parse(
			`<script lang="ts">
	const a = 'hello';
	const b = a;
</script>`,
			{modern: true},
		);
		const bindings = build_static_bindings(ast);
		assert.equal(bindings.get('a'), 'hello');
		assert.equal(bindings.get('b'), 'hello');
	});

	test('resolves const concatenation with identifier', () => {
		const ast = parse(
			`<script lang="ts">
	const prefix = 'hello';
	const msg = prefix + ' world';
</script>`,
			{modern: true},
		);
		const bindings = build_static_bindings(ast);
		assert.equal(bindings.get('msg'), 'hello world');
	});

	test('resolves template literal with interpolated const', () => {
		const ast = parse(
			`<script lang="ts">
	const name = 'world';
	const msg = \`hello \${name}\`;
</script>`,
			{modern: true},
		);
		const bindings = build_static_bindings(ast);
		assert.equal(bindings.get('msg'), 'hello world');
	});

	test('skips let declarations', () => {
		const ast = parse(
			`<script lang="ts">
	let msg = 'hello';
</script>`,
			{modern: true},
		);
		const bindings = build_static_bindings(ast);
		assert.equal(bindings.has('msg'), false);
	});

	test('skips dynamic initializers', () => {
		const ast = parse(
			`<script lang="ts">
	const el = document.getElementById('x');
</script>`,
			{modern: true},
		);
		const bindings = build_static_bindings(ast);
		assert.equal(bindings.has('el'), false);
	});

	test('skips destructuring patterns', () => {
		const ast = parse(
			`<script lang="ts">
	const {a} = {a: 'hello'};
</script>`,
			{modern: true},
		);
		const bindings = build_static_bindings(ast);
		assert.equal(bindings.has('a'), false);
	});

	test('skips const without initializer', () => {
		// TypeScript `declare const` has no init
		const ast = parse(
			`<script lang="ts">
	declare const x: string;
</script>`,
			{modern: true},
		);
		const bindings = build_static_bindings(ast);
		assert.equal(bindings.has('x'), false);
	});

	test('resolves number const to nothing (not a string)', () => {
		const ast = parse(
			`<script lang="ts">
	const x = 42;
</script>`,
			{modern: true},
		);
		const bindings = build_static_bindings(ast);
		assert.equal(bindings.has('x'), false);
	});

	test('resolves from both instance and module scripts', () => {
		const ast = parse(
			`<script module>
	const a = 'from module';
</script>
<script lang="ts">
	const b = 'from instance';
</script>`,
			{modern: true},
		);
		const bindings = build_static_bindings(ast);
		assert.equal(bindings.get('a'), 'from module');
		assert.equal(bindings.get('b'), 'from instance');
	});

	test('returns empty map when no scripts', () => {
		const ast = parse(`<p>No script</p>`, {modern: true});
		const bindings = build_static_bindings(ast);
		assert.equal(bindings.size, 0);
	});

	test('skips imports and non-const statements', () => {
		const ast = parse(
			`<script lang="ts">
	import Foo from './Foo.svelte';
	const msg = 'hello';
	function fn() { return 'world'; }
</script>`,
			{modern: true},
		);
		const bindings = build_static_bindings(ast);
		assert.equal(bindings.size, 1);
		assert.equal(bindings.get('msg'), 'hello');
	});

	test('does not resolve forward references', () => {
		const ast = parse(
			`<script lang="ts">
	const a = b;
	const b = 'hello';
</script>`,
			{modern: true},
		);
		const bindings = build_static_bindings(ast);
		assert.equal(bindings.has('a'), false);
		assert.equal(bindings.get('b'), 'hello');
	});

	test('resolves multiple const in same declaration', () => {
		const ast = parse(
			`<script lang="ts">
	const a = 'hello', b = 'world';
</script>`,
			{modern: true},
		);
		const bindings = build_static_bindings(ast);
		assert.equal(bindings.get('a'), 'hello');
		assert.equal(bindings.get('b'), 'world');
	});

	test('resolves template with multiple interpolations', () => {
		const ast = parse(
			`<script lang="ts">
	const first = 'hello';
	const last = 'world';
	const msg = \`\${first} \${last}!\`;
</script>`,
			{modern: true},
		);
		const bindings = build_static_bindings(ast);
		assert.equal(bindings.get('msg'), 'hello world!');
	});

	test('skips rune declarations like $state', () => {
		const ast = parse(
			`<script lang="ts">
	const msg = $state('hello');
</script>`,
			{modern: true},
		);
		const bindings = build_static_bindings(ast);
		assert.equal(bindings.has('msg'), false);
	});

	test('skips $derived declarations', () => {
		const ast = parse(
			`<script lang="ts">
	const base = 'hello';
	const msg = $derived(base + ' world');
</script>`,
			{modern: true},
		);
		const bindings = build_static_bindings(ast);
		assert.equal(bindings.get('base'), 'hello');
		assert.equal(bindings.has('msg'), false);
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
		const ast = parse(`<script lang="ts">import {Mdz} from '@fuzdev/fuz_ui/Mdz.svelte';</script>`, {
			modern: true,
		});
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
		const ast = parse(`<script module>import Mdz from '@fuzdev/fuz_ui/Mdz.svelte';</script>`, {
			modern: true,
		});
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

	test('returns empty map for side-effect-only import with no specifiers', () => {
		const ast = parse(`<script lang="ts">import '@fuzdev/fuz_ui/Mdz.svelte';</script>`, {
			modern: true,
		});
		const names = resolve_component_names(ast, ['@fuzdev/fuz_ui/Mdz.svelte']);
		assert.equal(names.size, 0);
	});

	test('resolves imports from both instance and module scripts', () => {
		const ast = parse(
			`<script module>import Mdz from '@fuzdev/fuz_ui/Mdz.svelte';</script>
<script lang="ts">import Code from '@fuzdev/fuz_code/Code.svelte';</script>`,
			{modern: true},
		);
		const names = resolve_component_names(ast, [
			'@fuzdev/fuz_ui/Mdz.svelte',
			'@fuzdev/fuz_code/Code.svelte',
		]);
		assert.ok(names.has('Mdz'));
		assert.ok(names.has('Code'));
		assert.equal(names.size, 2);
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
		const import_end =
			source.indexOf("from '@fuzdev/fuz_ui/Mdz.svelte';") +
			"from '@fuzdev/fuz_ui/Mdz.svelte';".length;
		assert.equal(pos, import_end);
	});

	test('returns end of last import when imports are non-contiguous', () => {
		const source = `<script lang="ts">
	import Mdz from '@fuzdev/fuz_ui/Mdz.svelte';
	const x = 1;
	import {resolve} from '$app/paths';
</script>`;
		const ast = parse(source, {modern: true});
		const pos = find_import_insert_position(ast.instance!);
		// Should return end of the last import, even though there's a statement in between
		const last_import_end = source.indexOf("from '$app/paths';") + "from '$app/paths';".length;
		assert.equal(pos, last_import_end);
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

	// Non-reference positions (should return false)

	test('returns false for non-computed member property (obj.Mdz)', () => {
		const node = {
			type: 'MemberExpression',
			object: {type: 'Identifier', name: 'obj'},
			property: {type: 'Identifier', name: 'Mdz'},
			computed: false,
		};
		assert.equal(has_identifier_in_tree(node, 'Mdz'), false);
	});

	test('returns false for non-computed object key ({ Mdz: 123 })', () => {
		const node = {
			type: 'Property',
			key: {type: 'Identifier', name: 'Mdz'},
			value: {type: 'Literal', value: 123},
			computed: false,
			shorthand: false,
		};
		assert.equal(has_identifier_in_tree(node, 'Mdz'), false);
	});

	test('returns false for non-computed destructuring key ({ Mdz: x } = obj)', () => {
		const node = {
			type: 'Property',
			key: {type: 'Identifier', name: 'Mdz'},
			value: {type: 'Identifier', name: 'x'},
			computed: false,
			shorthand: false,
		};
		assert.equal(has_identifier_in_tree(node, 'Mdz'), false);
	});

	test('returns false for non-computed method name (class { Mdz() {} })', () => {
		const node = {
			type: 'MethodDefinition',
			key: {type: 'Identifier', name: 'Mdz'},
			value: {type: 'FunctionExpression', body: {type: 'BlockStatement', body: []}},
			computed: false,
		};
		assert.equal(has_identifier_in_tree(node, 'Mdz'), false);
	});

	test('returns false for labeled statement (Mdz: for(;;){})', () => {
		const node = {
			type: 'LabeledStatement',
			label: {type: 'Identifier', name: 'Mdz'},
			body: {type: 'ForStatement', body: {type: 'BlockStatement', body: []}},
		};
		assert.equal(has_identifier_in_tree(node, 'Mdz'), false);
	});

	test('returns false for break statement label (break Mdz)', () => {
		const node = {
			type: 'BreakStatement',
			label: {type: 'Identifier', name: 'Mdz'},
		};
		assert.equal(has_identifier_in_tree(node, 'Mdz'), false);
	});

	test('returns false for continue statement label (continue Mdz)', () => {
		const node = {
			type: 'ContinueStatement',
			label: {type: 'Identifier', name: 'Mdz'},
		};
		assert.equal(has_identifier_in_tree(node, 'Mdz'), false);
	});

	test('returns false for non-computed class field (class { Mdz = 1 })', () => {
		const node = {
			type: 'PropertyDefinition',
			key: {type: 'Identifier', name: 'Mdz'},
			value: {type: 'Literal', value: 1},
			computed: false,
		};
		assert.equal(has_identifier_in_tree(node, 'Mdz'), false);
	});

	test('returns true for computed class field (class { [Mdz] = 1 })', () => {
		const node = {
			type: 'PropertyDefinition',
			key: {type: 'Identifier', name: 'Mdz'},
			value: {type: 'Literal', value: 1},
			computed: true,
		};
		assert.equal(has_identifier_in_tree(node, 'Mdz'), true);
	});

	// Reference positions (should return true)

	test('returns true for computed member property (obj[Mdz])', () => {
		const node = {
			type: 'MemberExpression',
			object: {type: 'Identifier', name: 'obj'},
			property: {type: 'Identifier', name: 'Mdz'},
			computed: true,
		};
		assert.equal(has_identifier_in_tree(node, 'Mdz'), true);
	});

	test('returns true for computed object key ({ [Mdz]: 123 })', () => {
		const node = {
			type: 'Property',
			key: {type: 'Identifier', name: 'Mdz'},
			value: {type: 'Literal', value: 123},
			computed: true,
			shorthand: false,
		};
		assert.equal(has_identifier_in_tree(node, 'Mdz'), true);
	});

	test('returns true for shorthand property ({ Mdz })', () => {
		const node = {
			type: 'Property',
			key: {type: 'Identifier', name: 'Mdz'},
			value: {type: 'Identifier', name: 'Mdz'},
			computed: false,
			shorthand: true,
		};
		assert.equal(has_identifier_in_tree(node, 'Mdz'), true);
	});

	test('returns true for member expression object (Mdz.foo)', () => {
		const node = {
			type: 'MemberExpression',
			object: {type: 'Identifier', name: 'Mdz'},
			property: {type: 'Identifier', name: 'foo'},
			computed: false,
		};
		assert.equal(has_identifier_in_tree(node, 'Mdz'), true);
	});
});

describe('escape_svelte_text', () => {
	test('returns empty string unchanged', () => {
		assert.equal(escape_svelte_text(''), '');
	});

	test('returns plain text unchanged', () => {
		assert.equal(escape_svelte_text('hello world'), 'hello world');
	});

	test('escapes opening brace', () => {
		assert.equal(escape_svelte_text('{value}'), "{'{'}value{'}'}");
	});

	test('escapes closing brace', () => {
		assert.equal(escape_svelte_text('}'), "{'}'}");
	});

	test('escapes less-than to &lt;', () => {
		assert.equal(escape_svelte_text('<div>'), '&lt;div>');
	});

	test('escapes ampersand to &amp;', () => {
		assert.equal(escape_svelte_text('a & b'), 'a &amp; b');
	});

	test('does not escape greater-than', () => {
		assert.equal(escape_svelte_text('a > b'), 'a > b');
	});

	test('escapes all special characters in mixed content', () => {
		assert.equal(escape_svelte_text('<div>{a & b}</div>'), "&lt;div>{'{'}a &amp; b{'}'}&lt;/div>");
	});

	test('escapes multiple braces', () => {
		assert.equal(escape_svelte_text('{{}}'), "{'{'}{'{'}{'}'}{'}'}");
	});

	test('escapes ampersand in HTML entities', () => {
		assert.equal(escape_svelte_text('&amp;'), '&amp;amp;');
	});

	test('handles text with only special characters', () => {
		assert.equal(escape_svelte_text('{<&'), "{'{'}&lt;&amp;");
	});

	test('preserves whitespace and newlines', () => {
		assert.equal(escape_svelte_text('line 1\nline 2\ttab'), 'line 1\nline 2\ttab');
	});

	test('escapes Svelte block syntax in text', () => {
		assert.equal(escape_svelte_text('{#if condition}'), "{'{'}#if condition{'}'}");
	});

	test('escapes Svelte expression tag syntax in text', () => {
		assert.equal(escape_svelte_text('{@html content}'), "{'{'}@html content{'}'}");
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

	test('returns false for obj.Mdz in script (non-reference member property)', () => {
		const ast = parse(
			`<script lang="ts">
	import Mdz from '@fuzdev/fuz_ui/Mdz.svelte';
	const x = obj.Mdz;
</script>`,
			{modern: true},
		);
		const import_node = ast.instance!.content.body[0];
		assert.equal(
			has_identifier_in_tree(ast.instance!.content, 'Mdz', new Set([import_node])),
			false,
		);
	});

	test('returns true for obj[Mdz] in script (computed member property)', () => {
		const ast = parse(
			`<script lang="ts">
	import Mdz from '@fuzdev/fuz_ui/Mdz.svelte';
	const x = obj[Mdz];
</script>`,
			{modern: true},
		);
		const import_node = ast.instance!.content.body[0];
		assert.equal(
			has_identifier_in_tree(ast.instance!.content, 'Mdz', new Set([import_node])),
			true,
		);
	});
});
