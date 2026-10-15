import * as s from '@fuzdev/fuz_schema/schema.ts';
import type { Flavored } from '@fuzdev/fuz_schema/schema.ts';

import { strip_end, strip_start } from './string.ts';

/**
 * Formats a URL by removing 'https://', 'www.', and trailing slashes.
 * Notably it does not remove 'http://', so the user can see that it's insecure.
 */
export const format_url = (url: string): string =>
	strip_end(strip_start(strip_start(url, 'https://'), 'www.'), '/');

/**
 * A string that parses as an absolute URL, by `URL.canParse`.
 * The output is the input unchanged: the text is not trimmed or normalized.
 */
export const Url = s.pipe(
	s.string,
	s.check((v: string) => URL.canParse(v), 'a URL')
);
export type Url = Flavored<s.Infer<typeof Url>, 'Url'>; // TODO brand is too annoying to use, but this doesn't work for schema composition
