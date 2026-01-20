<script lang="ts">
	import LibraryDetail from '@fuzdev/fuz_ui/LibraryDetail.svelte';
	import DocsFooter from '@fuzdev/fuz_ui/DocsFooter.svelte';
	import EcosystemLinksPanel from '@fuzdev/fuz_ui/EcosystemLinksPanel.svelte';
	import Breadcrumb from '@fuzdev/fuz_ui/Breadcrumb.svelte';
	import {library_context} from '@fuzdev/fuz_ui/library.svelte.js';

	const library = library_context.get();
</script>

<main class="width_atmost_md">
	<section>
		<header class="box">
			<h1 class="mt_xl5">{library.repo_name}</h1>
		</header>
		<Breadcrumb>{library.package_json.glyph}</Breadcrumb>
	</section>
	<section class="box width:100% mb_lg">
		<div class="panel p_md width_atmost_md">
			<LibraryDetail {library} />
		</div>
	</section>
	<EcosystemLinksPanel />
	<section class="box">
		<DocsFooter {library} root_url="https://www.fuz.dev/" />
	</section>
	<section class="box mb_lg">
		<Breadcrumb>{library.package_json.glyph}</Breadcrumb>
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
