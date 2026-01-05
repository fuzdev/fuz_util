import {library_gen} from '@fuzdev/fuz_ui/library_gen.js';
// TODO BLOCK move to fuz_ui/library_gen.ts?
import {library_throw_on_duplicates} from '@fuzdev/svelte-docinfo/library_analyze.js';

export const gen = library_gen({on_duplicates: library_throw_on_duplicates});
