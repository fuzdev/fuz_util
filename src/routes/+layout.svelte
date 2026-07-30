<script lang="ts">
	import 'virtual:fuz.css';
	import '@fuzdev/fuz_code/theme.css';
	import './style.css';

	import ThemeRoot from '@fuzdev/fuz_ui/ThemeRoot.svelte';
	import { SiteState, site_context } from '@fuzdev/fuz_ui/site.svelte.ts';
	import { logo_fuz_util } from '@fuzdev/fuz_ui/logos.ts';
	import pkg_json from 'virtual:pkg.json';
	import type { Snippet } from 'svelte';

	const {
		children
	}: {
		children: Snippet;
	} = $props();

	site_context.set(new SiteState({ icon: logo_fuz_util, pkg_json }));
</script>

<svelte:head>
	<title>@fuzdev/fuz_util</title>
</svelte:head>

<ThemeRoot>
	{@render children()}
</ThemeRoot>
