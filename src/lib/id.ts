import { z } from 'zod';

import { create_counter } from './counter.ts';

export const create_uuid = (): Uuid => crypto.randomUUID() as Uuid;

export const Uuid = z.uuid().brand('Uuid');
export type Uuid = z.infer<typeof Uuid>;
export const UuidWithDefault = Uuid.default(create_uuid);
export type UuidWithDefault = z.infer<typeof UuidWithDefault>;

/**
 * Loosely validates a UUID string.
 */
export const is_uuid = (str: string): boolean => UUID_MATCHER.test(str);

/**
 * Postgres doesn't support the namespace prefix, so neither does fuz_app.
 * For more see the UUID RFC - https://tools.ietf.org/html/rfc4122
 * The Ajv validator does support the namespace, hence this custom implementation.
 */
export const UUID_MATCHER = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;

export type ClientIdCreator = () => string;

/**
 * Creates a string id generator function, outputting `${name}_${count}` by default.
 */
export const create_client_id_creator = (
	name: string,
	count?: number,
	separator = '_'
): ClientIdCreator => {
	const counter = create_counter(count);
	return () => `${name}${separator}${counter()}`;
};
