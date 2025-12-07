<script lang="ts">
	import '@fuzdev/fuz_css/style.css';
	import '@fuzdev/fuz_css/theme.css';
	import '$routes/fuz.css';
	import '$routes/style.css';

	import Themed from '@fuzdev/fuz_ui/Themed.svelte';
	import {Library, library_context} from '@fuzdev/fuz_ui/library.svelte.js';
	import type {Snippet} from 'svelte';

	import {library_json} from '$routes/library.js';

	interface Props {
		children: Snippet;
	}

	const {children}: Props = $props();

	library_context.set(new Library(library_json));
</script>

<svelte:head>
	<title>@fuzdev/fuz_util</title>
</svelte:head>

<Themed>
	{@render children()}
</Themed>
