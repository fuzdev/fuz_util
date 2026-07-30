/**
 * Fractional indexing — generate ordered keys that admit insertion between
 * any two existing positions without rebalancing.
 *
 * Used by `cell_item.position` to give parent → child membership a stable,
 * lex-sortable order. Two clients editing the same parent each compute keys
 * locally; the server applies them with `(parent_id, position)` as the
 * primary key. Concurrent inserts that hit the same key surface as a
 * `cell_item_position_taken` error; helper-side jitter (a small random
 * suffix on every generated key) keeps the collision probability negligible
 * at realistic UX concurrency.
 *
 * Jitter is on by default and opts out per call via `{jitter: false}`, which
 * yields the bare deterministic mid-key. Turn it off for callers that must be
 * reproducible — seeders, fixtures, conformance tests — and leave it on for
 * anything where two clients can race the same `(prev, next)` view. The bare
 * keys are what the Rust twin `fuz_sys::fractional_index` computes, so
 * `{jitter: false}` output is comparable across the two languages.
 *
 * **Alphabet**: base62 (`0`-`9`, `A`-`Z`, `a`-`z`). `'0'` is the least
 * digit; `'z'` the greatest. Keys are read as base62 fractions: lex order
 * over keys equals numeric order over fractions.
 *
 * **Invariants emitted by this generator**:
 * - No emitted key ends in `'0'`. Without this rule, `key + '0'` would
 *   lex-equal `key` for ordering purposes, losing the room-to-insert that
 *   the trailing-`'0'` extension would otherwise provide.
 * - Every emitted key is non-empty and matches `FRACTIONAL_INDEX_REGEX`.
 * - Every emitted key is `≤ FRACTIONAL_INDEX_LENGTH_MAX`. The cap is checked
 *   on both inputs and output: bounds within a few digits of the cap can
 *   push a generated key over it, and the generator throws in that case
 *   rather than emitting an oversized key the wire would reject. In
 *   realistic use keys stay far under 100 chars, so this never fires.
 *
 * **Wire vs. emitted invariants**: `FRACTIONAL_INDEX_REGEX` enforces the
 * alphabet + non-empty contract for any client-supplied position. The
 * no-trailing-`'0'` rule is stricter and lives only in this generator;
 * the wire admits the looser form so a future encoder can sit alongside
 * this one without a wire-schema bump.
 *
 * **MVP scope — unsupported bracket shapes**:
 * - Unbounded prepend below `'0…'`: a long sequence of front-inserts
 *   eventually requires a key lex-less than every `'0'`-only key.
 * - Brackets shaped `(a, a + '0…0')` for any non-empty zero tail: the
 *   no-trailing-`'0'` invariant means no valid key fits the gap.
 *
 * Both surface as explicit throws. Realistic UX bounds keep emitted
 * keys well under 100 chars after thousands of consecutive front- or
 * back-inserts; consumers that genuinely need the prepend extension
 * should request a negative-prefix scheme.
 *
 * @module
 */

/** Base62 alphabet, monotonic in lex order: digits, then upper, then lower. */
export const FRACTIONAL_INDEX_ALPHABET =
	'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const ALPHABET_LEN = FRACTIONAL_INDEX_ALPHABET.length;
const FIRST_DIGIT = FRACTIONAL_INDEX_ALPHABET[0]!; // '0'
// Alphabet midpoint — `'V'` while the alphabet stays base62. Recomputed
// from `ALPHABET_LEN` so the literal in tests/docs (`'V'`) is downstream
// of the constant, not the other way around.
const MID_DIGIT = FRACTIONAL_INDEX_ALPHABET[Math.floor(ALPHABET_LEN / 2)]!;

/**
 * Wire-grammar regex for `cell_item.position`: at least one base62 digit.
 * The stricter no-trailing-`'0'` rule is an invariant of *this* generator,
 * not the wire. See module docstring §"Wire vs. emitted invariants".
 */
export const FRACTIONAL_INDEX_REGEX = /^[0-9A-Za-z]+$/;

/**
 * Soft length cap on positions, mirrored at the wire. Primarily DOS
 * protection; the algorithm has no inherent length limit but realistic
 * UX bounds keep emitted keys under 100 chars even after thousands of
 * consecutive front- or back-inserts. Inputs above this cap surface as
 * an explicit throw rather than producing oversized output the wire
 * would later reject.
 */
export const FRACTIONAL_INDEX_LENGTH_MAX = 200;

const digit_index = (ch: string): number => {
	const i = FRACTIONAL_INDEX_ALPHABET.indexOf(ch);
	if (i === -1) throw new Error(`fractional_index: invalid digit ${JSON.stringify(ch)}`);
	return i;
};

const validate_bound = (label: string, value: string): void => {
	if (!FRACTIONAL_INDEX_REGEX.test(value)) {
		throw new Error(
			`fractional_index: ${label} must match alphabet (got ${JSON.stringify(value)})`
		);
	}
	if (value.length > FRACTIONAL_INDEX_LENGTH_MAX) {
		throw new Error(
			`fractional_index: ${label} exceeds length cap (${value.length} > ${
				FRACTIONAL_INDEX_LENGTH_MAX
			})`
		);
	}
};

const validate_bracket = (a: string | null, b: string | null): void => {
	if (a !== null) validate_bound('a', a);
	if (b !== null) validate_bound('b', b);
	if (a !== null && b !== null && a >= b) {
		throw new Error(
			`fractional_index: bracket invalid (${JSON.stringify(a)} >= ${JSON.stringify(b)})`
		);
	}
};

/** Random jitter suffix length when bracket admits one. ~62^3 keyspace per slot. */
const JITTER_LEN = 3;

/**
 * Generate a small random base62 suffix, stripped of trailing `'0'`s.
 *
 * Adding ~62^JITTER_LEN of randomness to every emitted key reduces the
 * probability of a unique-violation race from "deterministic" to
 * "negligible at realistic UX concurrency." Note: with probability
 * `1/62^JITTER_LEN ≈ 4.2e-6`, all sampled digits are `'0'` and the
 * stripped result is empty — the caller falls through to the bare
 * deterministic mid in that case, and two concurrent callers in the
 * empty-suffix branch will collide on the bare mid. The server's
 * `cell_item_position_taken` error catches that residual.
 */
const jitter_suffix = (random: () => number): string => {
	let out = '';
	for (let i = 0; i < JITTER_LEN; i++) {
		// Clamp both ends so a misbehaving callback returning ≥ 1.0 (over) or
		// < 0 (under) can't index past the alphabet and silently emit
		// `'undefined'` into a wire-grammar string. `Math.random` and
		// `create_random_xoshiro` honor [0, 1), so the clamp is
		// defense-in-depth for injected callbacks.
		const idx = Math.max(0, Math.min(Math.floor(random() * ALPHABET_LEN), ALPHABET_LEN - 1));
		out += FRACTIONAL_INDEX_ALPHABET[idx];
	}
	let end = out.length;
	while (end > 0 && out[end - 1] === FIRST_DIGIT) end--;
	return out.slice(0, end);
};

/**
 * Options for the key generators.
 */
export interface FractionalIndexOptions {
	/**
	 * Append a random jitter suffix to each emitted key. Defaults to `true`.
	 *
	 * Leave it on wherever two clients can compute a key against the same
	 * `(prev, next)` view — it widens the keyspace within the slot so the two
	 * rarely land on the same string. Set `false` for reproducible output (the
	 * bare deterministic mid), which is what seeders, fixtures, and the
	 * cross-language conformance suite want; the Rust twin
	 * `fuz_sys::fractional_index` emits exactly these keys.
	 */
	jitter?: boolean;

	/**
	 * Source of randomness for the jitter suffix. Defaults to `Math.random`.
	 *
	 * Inject a seeded source to make jittered output reproducible while keeping
	 * the suffix present. Must honor the standard `[0, 1)` contract;
	 * `jitter_suffix` clamps defensively anyway. Ignored when `jitter` is
	 * `false`.
	 */
	random?: () => number;
}

/**
 * Returns a key strictly between `a` and `b` in lex order.
 *
 * Either bound may be `null` (open). Throws when the bracket is invalid
 * (`a >= b` lex-wise) or when the gap is structurally too tight to fit
 * a key under the no-trailing-`'0'` invariant (only happens with bounds
 * shaped `(a, a + '0…0')`; the helper itself never produces those).
 *
 * Emits a deterministic mid-key, then appends a random jitter suffix unless
 * `{jitter: false}`. The deterministic mid is what guarantees lex order; the
 * jitter widens the keyspace within the slot to defend against
 * concurrent-insert collisions on the same `(prev, next)` view. It is
 * best-effort collision avoidance, not a security primitive — the server's
 * `cell_item_position_taken` error is the load-bearing safety net.
 *
 * @throws Error if the bracket is invalid (`a >= b`), a bound breaks the
 * alphabet or exceeds the length cap, the gap is structurally too tight
 * (shaped `(a, a + '0…0')`), or the bounds are so long the generated key
 * would itself exceed the length cap.
 */
export const fractional_index_between = (
	a: string | null,
	b: string | null,
	options?: FractionalIndexOptions
): string => {
	const {jitter = true, random = Math.random} = options ?? {};
	validate_bracket(a, b);
	const base = mid_between(a, b);
	const suffix = jitter ? jitter_suffix(random) : '';
	const result = suffix === '' ? base : base + suffix;
	// Enforce the cap on output, not just inputs: bounds within a few digits
	// of the cap can push a generated key one tier (plus jitter) over it.
	// Fail fast here with a clear cause rather than emitting a key the wire —
	// or the next call's input validation — would later reject opaquely.
	if (result.length > FRACTIONAL_INDEX_LENGTH_MAX) {
		throw new Error(
			`fractional_index: generated key exceeds length cap (${result.length} > ${
				FRACTIONAL_INDEX_LENGTH_MAX
			}); bounds too long to fit a key under it`
		);
	}
	return result;
};

/**
 * Generate `n` strictly-ordered keys between `a` and `b`.
 *
 * Used for batch inserts (paste, bulk-import) so positions don't all
 * collapse onto a single deterministic mid-point. Output is monotonically
 * increasing; equal spacing is not guaranteed (clumping under the same
 * mid is acceptable and rare in practice).
 *
 * Implemented by recursive bisection: pick the deterministic mid of
 * `(a, b)`, generate `floor(n/2)` keys in `(a, mid)`, the mid itself,
 * and the rest in `(mid, b)`. Each emitted key carries its own jitter.
 *
 * Atomic on failure: if the bracket is structurally too tight at any
 * recursion depth, the whole call throws and no partial array is
 * returned. (Sub-brackets generated by `mid_between` never have the
 * tight shape, so this only fires when the *initial* bracket is tight.)
 *
 * @throws Error if `n` is negative or non-integer, or if the initial bracket
 * is invalid (per `fractional_index_between`) or structurally too tight.
 */
export const fractional_indices_between = (
	a: string | null,
	b: string | null,
	n: number,
	options?: FractionalIndexOptions
): Array<string> => {
	if (n < 0 || !Number.isInteger(n)) {
		throw new Error(`fractional_index: n must be a non-negative integer (got ${n})`);
	}
	// Validate the bracket regardless of `n`, so a structurally invalid
	// bracket (bad alphabet, over-length, or `a >= b`) is always an error —
	// matching `fractional_index_between` rather than being silently accepted
	// at `n === 0`. A too-tight *gap* is feasibility, not structure, so it
	// only surfaces once keys are actually generated below.
	validate_bracket(a, b);
	if (n === 0) return [];
	const out: Array<string> = [];
	emit_n(a, b, n, out, options);
	return out;
};

const emit_n = (
	a: string | null,
	b: string | null,
	n: number,
	out: Array<string>,
	options: FractionalIndexOptions | undefined
): void => {
	if (n === 0) return;
	const mid = fractional_index_between(a, b, options);
	if (n === 1) {
		out.push(mid);
		return;
	}
	const left = Math.floor(n / 2);
	emit_n(a, mid, left, out, options);
	out.push(mid);
	emit_n(mid, b, n - left - 1, out, options);
};

/**
 * Deterministic midpoint between `a` and `b`, no jitter.
 *
 * - `(null, null)` → `'V'` (alphabet midpoint).
 * - `(a, null)` → a non-trailing-`'0'` key strictly greater than `a`,
 *   via single-step bump (see `larger_than`).
 * - `(null, b)` → a non-trailing-`'0'` key strictly less than `b`, via
 *   single-step decrement (see `smaller_than`).
 * - `(a, b)` → walk shared prefix; pick a digit strictly between in the
 *   first divergent position, or extend.
 */
const mid_between = (a: string | null, b: string | null): string => {
	if (a === null && b === null) return MID_DIGIT;
	if (a === null) return smaller_than(b!);
	if (b === null) return larger_than(a);
	return strict_between(a, b);
};

/**
 * A non-trailing-`'0'` key strictly less than `b`, modifying only
 * positions `≥ start_j`. Returns `null` when `b[start_j..]` is all
 * `'0'`s — the gap is structurally too tight under the no-trailing-`'0'`
 * invariant, and the caller surfaces an error appropriate to its context.
 *
 * Walks `b` from `start_j` for the first `b[j] > '0'`:
 * - `digit_index(b[j]) > 1` → decrement `b[j]` and truncate the rest.
 *   Not the largest representable key < `b` — keys like
 *   `b[0..j-1] + (b[j]-1) + 'z…z'` are also lex-less and longer — but
 *   a compact representative that leaves room for further prepends.
 * - `digit_index(b[j]) === 1` → replace with `'0'` and append `'V'`,
 *   keeping the no-trailing-`'0'` invariant.
 *
 * Decrementing (rather than halving) gives one step per alphabet digit —
 * symmetric to `larger_than`, tens of inserts per length tier instead
 * of log₂(62) ≈ 6 (exact count depends on the leading non-`'0'` digit
 * of the bound; up to 61 in the worst case). The "leave room in the
 * middle" semantics of halving is unused for sequential prepend (each
 * call sees only the new bound, never inserts back into the gap it
 * just stepped over).
 */
const step_below = (b: string, start_j: number): string | null => {
	let j = start_j;
	while (j < b.length && b[j] === FIRST_DIGIT) j++;
	if (j === b.length) return null;
	const idx = digit_index(b[j]!);
	if (idx > 1) {
		return b.slice(0, j) + FRACTIONAL_INDEX_ALPHABET[idx - 1];
	}
	// idx === 1 — extend with '0' + mid digit.
	return b.slice(0, j) + FIRST_DIGIT + MID_DIGIT;
};

/**
 * A non-trailing-`'0'` key strictly less than `b`, via single-step
 * decrement of `b`'s leading non-`'0'` digit (see `step_below`).
 *
 * If `b` is all `'0'`s (or empty), the gap below `b` is too tight for
 * the MVP — throws to surface the unbounded-prepend bound to callers.
 */
const smaller_than = (b: string): string => {
	const result = step_below(b, 0);
	if (result === null) {
		throw new Error(
			`fractional_index: smaller_than(${JSON.stringify(b)}) requires unbounded-prepend support`
		);
	}
	return result;
};

/**
 * A compact non-trailing-`'0'` key strictly greater than `a`.
 *
 * Not the *smallest* such key — `a + '1'` (e.g. `'V1' > 'V'`) is lex-less
 * than the single-step bump this returns (`'W'`). The single-step bump is
 * chosen for its compactness and length symmetry with `step_below`, not
 * minimality.
 *
 * Walks `a` left-to-right looking for the first non-`'z'` to increment,
 * truncating everything after — the result keeps the bumped prefix and
 * discards `a`'s tail (including any prior jitter). Symmetric to
 * `smaller_than`, which already truncates `b`'s tail at its step point
 * (the first non-`'0'` digit `step_below` walks to). Without this truncation, append-only sequences would compound
 * each call's jitter into the next bound and grow keys linearly with
 * insert count.
 *
 * If `a` is all `'z'`s, extends with the mid digit so the result lives
 * strictly between `a` and the open upper bound.
 *
 * Correctness: result > a because at the bumped position the digit is
 * one greater and earlier positions are unchanged. When called from
 * `strict_between`'s gap-1 branch, result < b is guaranteed by the
 * outer prefix (b's divergent digit is one greater than a's), so
 * truncating the tail can't violate the upper bound.
 */
const larger_than = (a: string): string => {
	for (let i = 0; i < a.length; i++) {
		const idx = digit_index(a[i]!);
		if (idx < ALPHABET_LEN - 1) {
			return a.slice(0, i) + FRACTIONAL_INDEX_ALPHABET[idx + 1];
		}
	}
	return a + MID_DIGIT;
};

/**
 * Deterministic key strictly between `a` and `b` (precondition: `a < b`,
 * both non-empty).
 *
 * Walks the shared prefix. At the first divergent position (or past
 * `a`'s end when `a` is a strict prefix of `b`), picks a digit in the
 * gap; if the gap admits no single-digit key, extends with `larger_than`
 * (to drag past `a`) or `smaller_than`-style extension (to drag below `b`).
 */
const strict_between = (a: string, b: string): string => {
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;

	if (i === a.length) {
		// `a` is a strict prefix of `b` — extend `a` toward `b`.
		return between_prefix_and_extension(a, b, i);
	}

	const a_idx = digit_index(a[i]!);
	const b_idx = digit_index(b[i]!);
	if (b_idx - a_idx > 1) {
		const mid_idx = Math.floor((a_idx + b_idx) / 2);
		return a.slice(0, i) + FRACTIONAL_INDEX_ALPHABET[mid_idx];
	}
	// Gap === 1 (b_idx - a_idx === 1). Keep `a[i]` (the smaller divergent
	// digit) and extend `a`'s tail past i. Any extension keeps the result
	// < b (b's i-th digit is one greater) and > a (`larger_than` is strict).
	return a.slice(0, i + 1) + larger_than(a.slice(i + 1));
};

/**
 * `a` is a strict prefix of `b` (with `i = a.length`). Returns
 * `step_below(b, i)` — a key `a < k < b`.
 *
 * Correctness:
 * - `result < b`: `step_below` modifies position `j ≥ i` with a smaller
 *   digit, so the result diverges from `b` at `j`.
 * - `result > a`: both `step_below` branches return `b.slice(0, j)`
 *   followed by a non-empty tail. Since `j ≥ i = a.length` and `b`
 *   shares `a` as a prefix at position `i`, the result starts with `a`
 *   and is strictly longer — a strict extension is lex-greater.
 *
 * If `b` is `a + '0'^k` for some `k ≥ 1`, the gap is structurally too
 * tight — surfaces as an explicit error.
 */
const between_prefix_and_extension = (a: string, b: string, i: number): string => {
	const result = step_below(b, i);
	if (result === null) {
		throw new Error(
			`fractional_index: strict_between(${JSON.stringify(a)}, ${JSON.stringify(b)}) gap too tight`
		);
	}
	return result;
};
