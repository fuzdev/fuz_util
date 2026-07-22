/**
 * Datetime utilities — branded ISO 8601 datetime Zod schema and factory.
 *
 * @module
 */

import { z } from 'zod';

export const Datetime = z.iso.datetime().brand('Datetime');
export type Datetime = z.infer<typeof Datetime>;

/** Returns an ISO 8601 datetime string for the current time. */
export const get_datetime_now = (): Datetime => new Date().toISOString() as Datetime;

export const DatetimeNow = Datetime.default(get_datetime_now);
export type DatetimeNow = z.infer<typeof DatetimeNow>;
