<script lang="ts">
	import LibrarySummary from '@fuzdev/fuz_ui/LibrarySummary.svelte';
	import DocsFooter from '@fuzdev/fuz_ui/DocsFooter.svelte';
	import {site_context} from '@fuzdev/fuz_ui/site.svelte.js';
	import {FUZ_DEV_URL} from '@fuzdev/fuz_ui/constants.js';
	import Card from '@fuzdev/fuz_ui/Card.svelte';
	import Svg from '@fuzdev/fuz_ui/Svg.svelte';
	import {logo_fuz_util} from '@fuzdev/fuz_ui/logos.js';
	import {resolve} from '$app/paths';
	import {library_context} from '@fuzdev/fuz_ui/library.svelte.js';

	const library = library_context.get();
	const site = site_context.get();
</script>

<main class="box mb_xl5">
	<section>
		<LibrarySummary {library}>
			{#snippet repo_name()}<h1 class="mt_xl mb_xl">fuz_util</h1>{/snippet}
			{#snippet logo()}<div class="logo"><Svg data={logo_fuz_util} /></div>{/snippet}
		</LibrarySummary>
	</section>
	<section class="box">
		<Card href={resolve('/docs')}>docs{#snippet icon()}{site.glyph}{/snippet}</Card>
	</section>
	<section>
		<DocsFooter repo_url={site.repo_url} root_url={FUZ_DEV_URL} />
	</section>
</main>

<style>
	.logo {
		margin: 0 auto;
		width: 256px;
		height: 256px;
	}
	/* TODO with utility classes */
	@media (min-width: 450px) {
		.logo {
			width: 400px;
			height: 400px;
		}
	}
</style>
