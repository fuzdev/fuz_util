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
 * @param data - string or `BufferSource` to convert
 * @returns `Uint8Array` view of the data
 */
export const to_bytes = (data: BufferSource | string): Uint8Array => {
	if (typeof data === 'string') return encoder.encode(data);
	if (data instanceof Uint8Array) return data;
	if (data instanceof ArrayBuffer) return new Uint8Array(data);
	return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
};

/**
 * Formats a byte count as a human-readable string.
 *
 * @param n - byte count
 * @returns formatted string like `'1.2 KB'` or `'3.4 MB'`
 */
export const format_bytes = (n: number): string => {
	if (n < 1024) return n + ' B';
	if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
	if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
	return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
};
