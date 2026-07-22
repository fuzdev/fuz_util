<script lang="ts">
	import LibraryDetail from '@fuzdev/fuz_ui/LibraryDetail.svelte';
	import DocsFooter from '@fuzdev/fuz_ui/DocsFooter.svelte';
	import { site_context } from '@fuzdev/fuz_ui/site.svelte.ts';
	import { FUZ_DEV_URL } from '@fuzdev/fuz_ui/constants.ts';
	import EcosystemLinksPanel from '@fuzdev/fuz_ui/EcosystemLinksPanel.svelte';
	import Breadcrumb from '@fuzdev/fuz_ui/Breadcrumb.svelte';
	import { Library, library_context } from '@fuzdev/fuz_ui/library.svelte.ts';

	import { library_json } from '$routes/library.ts';

	const library = new Library(library_json);
	library_context.set(() => library);
	const site = site_context.get();
</script>

<main class="width_atmost_md">
	<section>
		<header class="box">
			<h1 class="mt_xl5">{library.repo_name}</h1>
		</header>
		<Breadcrumb />
	</section>
	<section class="box width:100% mb_lg">
		<div class="panel p_md width_atmost_md">
			<LibraryDetail {library} />
		</div>
	</section>
	<EcosystemLinksPanel />
	<section class="box">
		<DocsFooter repo_url={site.repo_url} root_url={FUZ_DEV_URL} />
	</section>
	<section class="box mb_lg">
		<Breadcrumb />
	</section>
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin: 0 auto;
	}
</style>
