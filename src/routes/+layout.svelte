<script lang="ts">
	import '$routes/fuz.css';
	import '@fuzdev/fuz_code/theme.css';
	import '$routes/style.css';

	import ThemeRoot from '@fuzdev/fuz_ui/ThemeRoot.svelte';
	import {Library, library_context} from '@fuzdev/fuz_ui/library.svelte.js';
	import {library_json_parse} from '@fuzdev/fuz_util/library_json.js';
	import type {PackageJson} from '@fuzdev/fuz_util/package_json.js';
	import {modules} from 'virtual:svelte-docinfo';
	import type {Snippet} from 'svelte';

	import package_json from '../../package.json' with {type: 'json'};

	const {
		children,
	}: {
		children: Snippet;
	} = $props();

	const library_json = library_json_parse(package_json as PackageJson, {
		name: package_json.name,
		version: package_json.version,
		modules,
	});

	library_context.set(new Library(library_json));
</script>

<svelte:head>
	<title>@fuzdev/fuz_util</title>
</svelte:head>

<ThemeRoot>
	{@render children()}
</ThemeRoot>
