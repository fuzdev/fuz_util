import {library_gen} from '@fuzdev/fuz_ui/library_gen.js';
import {library_throw_on_duplicates} from '@fuzdev/svelte-docinfo/library_analyze.js';

// Use `as any` to bypass type portability check. The inferred type references fuz_ui's
// @ryanatkn/gro which differs from fuz_util's instance. This is correct at runtime but
// TypeScript cannot express the type portably across separate node_modules boundaries.
export const gen = library_gen({on_duplicates: library_throw_on_duplicates}) as any;
