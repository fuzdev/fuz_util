/**
 * Deep equality comparison that checks both structure and type.
 *
 * Key behaviors:
 *
 * - Compares by constructor to prevent type confusion (security: `{}` ≠ `[]`, `{}` ≠ `new Map()`, `new ClassA()` ≠ `new ClassB()`)
 * - Prevents asymmetry bugs: `deep_equal(a, b)` always equals `deep_equal(b, a)`
 * - Compares only enumerable own properties (ignores prototypes, symbols, non-enumerable)
 * - Special handling for: Date (timestamp), Number/Boolean (boxed primitives), Error (message/name)
 * - Promises always return false (cannot be meaningfully compared)
 * - Maps/Sets compare by reference for object keys/values
 *
 * @param a first value to compare
 * @param b second value to compare
 * @returns true if deeply equal, false otherwise
 */
export const deep_equal = (a: unknown, b: unknown): boolean => {
	if (Object.is(a, b)) return true;

	const a_type = typeof a;

	if (a_type !== typeof b) return false;

	switch (a_type) {
		case 'string':
		case 'number':
		case 'bigint':
		case 'boolean':
		case 'symbol':
		case 'undefined':
		case 'function':
			return false;
		default:
			break;
	}

	// a_type === 'object'

	if (a === null || b === null) return false;

	// Constructor equality check prevents type confusion and ensures symmetry
	// This means: {} ≠ [], {} ≠ new Map(), new ClassA() ≠ new ClassB()
	// Security: prevents structural type confusion in equality checks
	// Cache constructor for reuse in subsequent checks (avoids repeated property access)
	const a_ctor = (a as any).constructor;
	if (a_ctor !== (b as any).constructor) return false;

	// Regular arrays: inline length check before function call (fast-fail for mismatched lengths)
	// Use Array.isArray() instead of instanceof Array (JIT-optimized, works cross-realm)
	if (Array.isArray(a)) {
		const len = a.length;
		if ((b as any).length !== len) return false;
		for (let i = 0; i < len; i++) {
			if (!deep_equal(a[i], (b as any)[i])) return false;
		}
		return true;
	}

	// Use cached constructor for type checks (faster than instanceof - avoids prototype chain walk)
	if (a_ctor === Set) {
		if ((a as Set<unknown>).size !== (b as Set<unknown>).size) return false;
		for (const a_value of a as Set<unknown>) {
			if (!(b as Set<unknown>).has(a_value)) return false;
		}
		return true;
	}
	if (a_ctor === Map) {
		if ((a as Map<unknown, unknown>).size !== (b as Map<unknown, unknown>).size) return false;
		for (const [key, a_value] of a as Map<unknown, unknown>) {
			if (
				!(b as Map<unknown, unknown>).has(key) ||
				!deep_equal(a_value, (b as Map<unknown, unknown>).get(key))
			)
				return false;
		}
		return true;
	}
	if (a_ctor === RegExp) {
		return (
			(a as RegExp).source === (b as RegExp).source && (a as RegExp).flags === (b as RegExp).flags
		);
	}

	// Date objects: compare by timestamp value
	if (a_ctor === Date) {
		// Using Object.is to handle NaN correctly (invalid dates)
		return Object.is((a as Date).getTime(), (b as Date).getTime());
	}

	// ArrayBuffer: convert to Uint8Array views for byte-by-byte comparison
	if (a_ctor === ArrayBuffer) {
		if ((a as ArrayBuffer).byteLength !== (b as ArrayBuffer).byteLength) return false;
		const a_view = new Uint8Array(a as ArrayBuffer);
		const b_view = new Uint8Array(b as ArrayBuffer);
		const len = (a as ArrayBuffer).byteLength;
		for (let i = 0; i < len; i++) {
			if (a_view[i] !== b_view[i]) return false;
		}
		return true;
	}

	// TypedArrays: specialized fast path (no recursion needed - elements are always primitives)
	// ArrayBuffer.isView() catches TypedArrays (Uint8Array, Int32Array, Float64Array, etc.)
	// DataView is also caught by isView but needs special handling (no indexed access)
	if (ArrayBuffer.isView(a)) {
		// DataView: compare byte-by-byte using getUint8
		if (a_ctor === DataView) {
			const byte_len = (a as DataView).byteLength;
			if ((b as DataView).byteLength !== byte_len) return false;
			for (let i = 0; i < byte_len; i++) {
				if ((a as DataView).getUint8(i) !== (b as DataView).getUint8(i)) return false;
			}
			return true;
		}
		// TypedArrays: use indexed access (much faster)
		if ((b as any).length !== (a as any).length) return false;
		const len = (a as any).length;
		for (let i = 0; i < len; i++) {
			if ((a as any)[i] !== (b as any)[i]) return false;
		}
		return true;
	}

	// Boxed Number objects: compare by primitive value
	if (a_ctor === Number) {
		return Object.is(a!.valueOf(), (b as number).valueOf());
	}

	// Boxed Boolean objects: compare by primitive value
	if (a_ctor === Boolean) {
		return a!.valueOf() === (b as boolean).valueOf();
	}

	// Error objects: compare by message and name
	if (a_ctor === Error) {
		return (a as Error).message === (b as Error).message && (a as Error).name === (b as Error).name;
	}

	// Promise objects: cannot be meaningfully compared for deep equality
	if (a_ctor === Promise) {
		return false;
	}

	// Plain objects: compare enumerable own properties
	const a_keys = Object.keys(a!);
	const a_keys_length = a_keys.length;
	if (a_keys_length !== Object.keys(b!).length) return false;
	for (let i = 0; i < a_keys_length; i++) {
		const key = a_keys[i]!;
		if (!Object.hasOwn(b as object, key)) return false;
		if (!deep_equal((a as any)[key], (b as any)[key])) return false;
	}

	return true;
};
