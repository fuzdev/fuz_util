import {vitePreprocess} from '@sveltejs/vite-plugin-svelte';
import adapter from '@sveltejs/adapter-static';
import {svelte_preprocess_mdz} from '@fuzdev/fuz_ui/svelte_preprocess_mdz.js';
import {svelte_preprocess_fuz_code} from '@fuzdev/fuz_code/svelte_preprocess_fuz_code.js';
import {csp_directives_of_fuzdev} from '@fuzdev/fuz_ui/csp_of_fuzdev.js';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: [svelte_preprocess_mdz(), svelte_preprocess_fuz_code(), vitePreprocess()],
	compilerOptions: {runes: true},
	vitePlugin: {inspector: true},
	kit: {
		adapter: adapter(),
		paths: {relative: false}, // use root-absolute paths for SSR path comparison: https://svelte.dev/docs/kit/configuration#paths
		alias: {
			$routes: 'src/routes',
			'@fuzdev/fuz_util': 'src/lib',
		},
		csp: {directives: csp_directives_of_fuzdev},
	},
};
