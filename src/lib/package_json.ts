import * as s from '@fuzdev/fuz_schema/schema.ts';
import { meta } from '@fuzdev/fuz_schema/meta.ts';

import { count_graphemes } from './string.ts';
import { transform_empty_object_to_undefined } from './object.ts';
import { Url } from './url.ts';

// the email pattern of Zod's `z.email()`, in the form without lookaheads
const EMAIL =
	/^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
const Email = s.pipe(s.string, s.regex(EMAIL, 'an email'));

export const PackageJsonRepository = s.union([
	s.string,
	s.loose_object({
		type: s.string,
		url: Url,
		directory: s.optional(s.string)
	})
]);
export type PackageJsonRepository = s.Infer<typeof PackageJsonRepository>;

export const PackageJsonAuthor = s.union([
	s.string,
	s.loose_object({
		name: s.string,
		email: s.optional(Email),
		url: s.optional(Url)
	})
]);
export type PackageJsonAuthor = s.Infer<typeof PackageJsonAuthor>;

export const PackageJsonFunding = s.union([
	s.string,
	s.loose_object({
		type: s.string,
		url: Url
	})
]);
export type PackageJsonFunding = s.Infer<typeof PackageJsonFunding>;

/**
 * An export target or a map of conditions: a string, `null` to block the
 * path, or an object whose values are export values.
 */
export type ExportValue = string | null | { [key: string]: ExportValue };
export const ExportValue: s.Schema<ExportValue, ExportValue> = s.lazy(() =>
	s.union([s.string, s.literal(null), s.record(ExportValue)])
);

/**
 * Package exports can be:
 * 1. A string (shorthand for main export)
 * 2. null (to block exports)
 * 3. A record of export conditions/paths
 */
export const PackageJsonExports = s.union([s.string, s.literal(null), s.record(ExportValue)]);
export type PackageJsonExports = s.Infer<typeof PackageJsonExports>;

/**
 * Keeps unknown keys. The output is the input itself when nothing in it changed.
 *
 * @see https://docs.npmjs.com/cli/v10/configuring-npm/package-json
 */
export const PackageJson = s.loose_object({
	// according to the npm docs, `name` and `version` are the only required properties
	name: s.string,
	version: s.optional(s.string),
	private: s.optional(
		meta(s.boolean, { description: 'disallow publishing to the configured registry' })
	),
	description: s.optional(s.string),
	tagline: s.optional(
		meta(s.string, {
			description: "a Fuz extension that's a short phrase that represents this project"
		})
	),
	glyph: s.optional(
		meta(
			s.pipe(
				s.string,
				s.check((v: string) => count_graphemes(v) === 1, 'must be a single unicode character')
			),
			{
				description:
					"a Fuz extension that's a single unicode character that represents this project"
			}
		)
	),
	logo: s.optional(
		meta(s.string, {
			description:
				"a Fuz extension that's a link relative to the `homepage` to an image that represents this project"
		})
	),
	logo_alt: s.optional(
		meta(s.string, { description: "a Fuz extension that's the alt text for the `logo`" })
	),
	license: s.optional(s.string),
	scripts: s.optional(s.record(s.string)),
	homepage: s.optional(Url),
	author: s.optional(s.union([s.string, PackageJsonAuthor])),
	repository: s.optional(s.union([s.string, Url, PackageJsonRepository])),
	contributors: s.optional(s.array(s.union([s.string, PackageJsonAuthor]))),
	bugs: s.optional(
		s.union([s.string, s.loose_object({ url: s.optional(Url), email: s.optional(Email) })])
	),
	funding: s.optional(
		s.union([Url, PackageJsonFunding, s.array(s.union([Url, PackageJsonFunding]))])
	),
	keywords: s.optional(s.array(s.string)),

	type: s.optional(s.string),
	engines: s.optional(s.record(s.string)),
	os: s.optional(s.array(s.string)),
	cpu: s.optional(s.array(s.string)),

	dependencies: s.optional(s.record(s.string)),
	devDependencies: s.optional(s.record(s.string)),
	peerDependencies: s.optional(s.record(s.string)),
	peerDependenciesMeta: s.optional(s.record(s.loose_object({ optional: s.boolean }))),
	optionalDependencies: s.optional(s.record(s.string)),

	bin: s.optional(s.record(s.string)),
	sideEffects: s.optional(
		meta(s.union([s.boolean, s.array(s.string)]), {
			description:
				'whether the package has side effects, `false` if none, or the list of files that do'
		})
	),
	files: s.optional(s.array(s.string)),
	main: s.optional(s.string),
	exports: s.optional(s.pipe(PackageJsonExports, s.transform(transform_empty_object_to_undefined)))
});
export type PackageJson = s.Infer<typeof PackageJson>;
