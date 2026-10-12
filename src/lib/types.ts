/*

These are convenient global types that can be used in both library and user code.
It probably makes more sense to give this file a `.d.ts` extension,
but that complicates the build because TypeScript does not output them.

TODO probably make this `.d.ts` when we make a proper build process

*/

export type ClassConstructor<TInstance, TArgs extends Array<any> = Array<any>> = new (
	...args: TArgs
) => TInstance;

export type OmitStrict<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

/**
 * Like `Pick` but works for type unions.
 *
 * @see https://stackoverflow.com/questions/75271774/creating-a-type-using-pick-with-a-type-that-is-defined-as-a-union-of-types
 * @see https://stackoverflow.com/users/5770132/oblosys
 */
export type PickUnion<T, K extends KeyofUnion<T>> = T extends unknown
	? K & keyof T extends never
		? never
		: Pick<T, K & keyof T>
	: never;

/**
 * Like `keyof` but works for type unions.
 *
 * @see https://stackoverflow.com/questions/75271774/creating-a-type-using-pick-with-a-type-that-is-defined-as-a-union-of-types
 * @see https://stackoverflow.com/users/5770132/oblosys
 */
export type KeyofUnion<T> = T extends unknown ? keyof T : never;

// these were thrown together quickly - is there a better way to do this?
// there are probably better names for them!
// see `Required`, `Exclude` and `Extract` for possible leads for improvements
export type PartialExcept<T, K extends keyof T> = { [P in K]: T[P] } & {
	[P in Exclude<keyof T, K>]?: T[P];
};
export type PartialOnly<T, K extends keyof T> = { [P in K]?: T[P] } & {
	[P in Exclude<keyof T, K>]: T[P];
};

export type PartialValues<T> = {
	[P in keyof T]: Partial<T[P]>;
};

export type Assignable<T, K extends keyof T = keyof T> = {
	-readonly [P in K]: T[P];
};

export type Defined<T> = T extends undefined ? never : T;
export type NotNull<T> = T extends null ? never : T;

export type ArrayElement<T> = T extends ReadonlyArray<infer U> ? U : never;

/**
 * The `Flavored` and `Branded` type helpers add varying degrees of nominal typing to other types.
 * This is especially useful with primitives like strings and numbers.
 *
 * They are defined in `@fuzdev/fuz_schema`, whose `flavor` and `brand` schema
 * helpers produce the same types, and re-exported here so a flavored or
 * branded type is one type wherever it was declared.
 *
 * `Flavored` is a looser form of `Branded` that trades
 * explicitness and a little safety in some cases for ergonomics.
 * With `Flavored` you don't need to cast unflavored types:
 *
 * ```ts
 * type Email = Flavored<string, 'Email'>;
 * const email1: Email = 'foo'; // ok
 * type Address = Flavored<string, 'Address'>;
 * const email2: Email = 'foo' as Address; // error!
 * ```
 *
 * `Branded` requires casting:
 *
 * ```ts
 * type PhoneNumber = Branded<string, 'PhoneNumber'>;
 * const phone1: PhoneNumber = 'foo'; // error!
 * const phone2: PhoneNumber = 'foo' as PhoneNumber; // ok
 * ```
 *
 * @see https://spin.atomicobject.com/typescript-flexible-nominal-typing/
 */
export type { Flavored, Flavor, Branded, Brand } from '@fuzdev/fuz_schema/schema.ts';
