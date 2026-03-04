/**
 * Binary data conversion helpers.
 *
 * @module
 */

const encoder = new TextEncoder();

/**
 * Converts string or binary data to a `Uint8Array`.
 * Strings are UTF-8 encoded. `Uint8Array` inputs are returned as-is.
 *
 * @param data - String or `BufferSource` to convert.
 * @returns `Uint8Array` view of the data.
 */
export const to_bytes = (data: BufferSource | string): Uint8Array => {
	if (typeof data === 'string') return encoder.encode(data);
	if (data instanceof Uint8Array) return data;
	if (data instanceof ArrayBuffer) return new Uint8Array(data);
	return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
};
