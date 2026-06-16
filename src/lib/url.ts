import {z} from 'zod';

import {strip_end, strip_start} from './string.ts';
import type {Flavored} from './types.ts';

/**
 * Formats a URL by removing 'https://', 'www.', and trailing slashes.
 * Notably it does not remove 'http://', so the user can see that it's insecure.
 */
export const format_url = (url: string): string =>
	strip_end(strip_start(strip_start(url, 'https://'), 'www.'), '/');

export const Url = z.url();
export type Url = Flavored<z.infer<typeof Url>, 'Url'>; // TODO brand is too annoying to use, but this doesn't work for schema composition
