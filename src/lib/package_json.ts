import {z} from 'zod';

import {count_graphemes} from './string.js';
import {transform_empty_object_to_undefined} from './object.js';
import {Url} from './url.js';

export const PackageJsonRepository = z.union([
	z.string(),
	z.looseObject({
		type: z.string(),
		url: Url,
		directory: z.string().optional(),
	}),
]);
export type PackageJsonRepository = z.infer<typeof PackageJsonRepository>;

export const PackageJsonAuthor = z.union([
	z.string(),
	z.looseObject({
		name: z.string(),
		email: z.email().optional(),
		url: Url.optional(),
	}),
]);
export type PackageJsonAuthor = z.infer<typeof PackageJsonAuthor>;

export const PackageJsonFunding = z.union([
	z.string(),
	z.looseObject({
		type: z.string(),
		url: Url,
	}),
]);
export type PackageJsonFunding = z.infer<typeof PackageJsonFunding>;

// The base export value schema that can be a string, null, or nested conditions
const export_value_schema: z.ZodType = z.lazy(() =>
	z.union([
		z.string(),
		z.null(),
		z.record(
			z.string(),
			z.lazy(() => export_value_schema),
		),
	]),
);
export const ExportValue = export_value_schema;
export type ExportValue = z.infer<typeof ExportValue>;

/**
 * Package exports can be:
 * 1. A string (shorthand for main export)
 * 2. null (to block exports)
 * 3. A record of export conditions/paths
 */
export const PackageJsonExports = z.union([
	z.string(),
	z.null(),
	z.record(z.string(), export_value_schema),
]);
export type PackageJsonExports = z.infer<typeof PackageJsonExports>;

/**
 * @see https://docs.npmjs.com/cli/v10/configuring-npm/package-json
 */
export const PackageJson = z.looseObject({
	// according to the npm docs, `name` and `version` are the only required properties
	name: z.string(),
	version: z.string(),
	private: z
		.boolean()
		.meta({description: 'disallow publishing to the configured registry'})
		.optional(),
	description: z.string().optional(),
	motto: z
		.string()
		.meta({description: "a Gro extension that's a short phrase that represents this project"})
		.optional(),
	glyph: z
		.string()
		.meta({
			description: "a Gro extension that's a single unicode character that represents this project",
		})
		.refine((v) => count_graphemes(v) === 1, 'must be a single unicode character')
		.optional(),
	logo: z
		.string()
		.meta({
			description:
				"a Gro extension that's a link relative to the `homepage` to an image that represents this project",
		})
		.optional(),
	logo_alt: z
		.string()
		.meta({description: "a Gro extension that's the alt text for the `logo`"})
		.optional(),
	license: z.string().optional(),
	scripts: z.record(z.string(), z.string()).optional(),
	homepage: Url.optional(),
	author: z.union([z.string(), PackageJsonAuthor.optional()]),
	repository: z.union([z.string(), Url, PackageJsonRepository]).optional(),
	contributors: z.array(z.union([z.string(), PackageJsonAuthor])).optional(),
	bugs: z
		.union([z.string(), z.looseObject({url: Url.optional(), email: z.email().optional()})])
		.optional(),
	funding: z
		.union([Url, PackageJsonFunding, z.array(z.union([Url, PackageJsonFunding]))])
		.optional(),
	keywords: z.array(z.string()).optional(),

	type: z.string().optional(),
	engines: z.record(z.string(), z.string()).optional(),
	os: z.array(z.string()).optional(),
	cpu: z.array(z.string()).optional(),

	dependencies: z.record(z.string(), z.string()).optional(),
	devDependencies: z.record(z.string(), z.string()).optional(),
	peerDependencies: z.record(z.string(), z.string()).optional(),
	peerDependenciesMeta: z.record(z.string(), z.looseObject({optional: z.boolean()})).optional(),
	optionalDependencies: z.record(z.string(), z.string()).optional(),

	bin: z.record(z.string(), z.string()).optional(),
	sideEffects: z.array(z.string()).optional(),
	files: z.array(z.string()).optional(),
	main: z.string().optional(),
	exports: PackageJsonExports.transform(transform_empty_object_to_undefined).optional(),
});
export type PackageJson = z.infer<typeof PackageJson>;
