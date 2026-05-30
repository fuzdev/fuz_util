<script lang="ts">
	import type {Snippet} from 'svelte';
	import Docs from '@fuzdev/fuz_ui/Docs.svelte';

	import {tomes} from '$routes/docs/tomes.js';

	const {
		children,
	}: {
		children: Snippet;
	} = $props();
</script>

<Docs {tomes}>
	{@render children()}
</Docs>
