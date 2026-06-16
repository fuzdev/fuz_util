import {describe, test, assert} from 'vitest';

import {
	FRACTIONAL_INDEX_ALPHABET,
	FRACTIONAL_INDEX_REGEX,
	FRACTIONAL_INDEX_LENGTH_MAX,
	fractional_index_between,
	fractional_indices_between,
} from '$lib/fractional_index.ts';

/** Deterministic "no jitter" source: every sample is 0 → empty jitter suffix. */
const no_jitter = (): number => 0;

/** Assert a generated key obeys the generator's emitted invariants. */
const assert_valid_key = (key: string): void => {
	assert.ok(key.length > 0, `non-empty: ${JSON.stringify(key)}`);
	assert.ok(FRACTIONAL_INDEX_REGEX.test(key), `alphabet: ${JSON.stringify(key)}`);
	assert.notStrictEqual(key[key.length - 1], '0', `no trailing 0: ${JSON.stringify(key)}`);
	assert.ok(key.length <= FRACTIONAL_INDEX_LENGTH_MAX, `under length cap: ${key.length}`);
};

describe('alphabet', () => {
	test('is base62, strictly increasing in lex order with no duplicate digits', () => {
		assert.strictEqual(FRACTIONAL_INDEX_ALPHABET.length, 62);
		for (let i = 1; i < FRACTIONAL_INDEX_ALPHABET.length; i++) {
			// strictly increasing (not just sorted) also rules out a repeated digit
			assert.ok(
				FRACTIONAL_INDEX_ALPHABET[i - 1]! < FRACTIONAL_INDEX_ALPHABET[i]!,
				`monotonic at ${i}: ${FRACTIONAL_INDEX_ALPHABET[i - 1]} < ${FRACTIONAL_INDEX_ALPHABET[i]}`,
			);
		}
	});
});

describe('fractional_index_between — deterministic mids (no jitter)', () => {
	test('(null, null) → alphabet midpoint V', () => {
		assert.strictEqual(fractional_index_between(null, null, no_jitter), 'V');
	});

	test('(a, null) bumps one step above a', () => {
		assert.strictEqual(fractional_index_between('V', null, no_jitter), 'W');
	});

	test('(null, b) steps one below b', () => {
		assert.strictEqual(fractional_index_between(null, 'V', no_jitter), 'U');
	});

	test('a key always lands strictly between its bounds', () => {
		const brackets: Array<[string, string]> = [
			['a', 'b'],
			['1', '2'],
			['A', 'z'],
			['aa', 'ab'],
			['abc', 'abd'],
			['V', 'W'],
		];
		for (const [a, b] of brackets) {
			const mid = fractional_index_between(a, b, no_jitter);
			assert.ok(a < mid, `${JSON.stringify(a)} < ${JSON.stringify(mid)}`);
			assert.ok(mid < b, `${JSON.stringify(mid)} < ${JSON.stringify(b)}`);
			assert_valid_key(mid);
		}
	});

	test('larger_than extends when a is all-z', () => {
		const k = fractional_index_between('z', null, no_jitter);
		assert.ok('z' < k);
		assert_valid_key(k);
	});

	test('exact deterministic outputs for representative bracket shapes', () => {
		// Regression pins on the four mid_between branches. Changing the
		// alphabet midpoint or step strategy should fail here loudly.
		const cases: Array<[string | null, string | null, string]> = [
			[null, null, 'V'], // both open → alphabet midpoint
			['V', null, 'W'], // open upper → single-step bump
			[null, 'V', 'U'], // open lower → single-step decrement
			['1', '3', '2'], // gap ≥ 2 → numeric midpoint digit
			['a', 'b', 'aV'], // gap === 1 → keep `a[i]`, extend with mid
			['1', '2', '1V'], // gap === 1 across digit tier
			['a', 'aa', 'aZ'], // `a` is a strict prefix of `b` → step below b
		];
		for (const [a, b, expected] of cases) {
			assert.strictEqual(
				fractional_index_between(a, b, no_jitter),
				expected,
				`(${JSON.stringify(a)}, ${JSON.stringify(b)})`,
			);
		}
	});

	test('is deterministic for a fixed bracket and random source', () => {
		assert.strictEqual(
			fractional_index_between('a', 'z', no_jitter),
			fractional_index_between('a', 'z', no_jitter),
		);
	});

	test('a bound one digit under the cap still generates (key lands exactly at cap)', () => {
		// Complements the over-cap throw: 199 all-'z' extends to 200 (≤ cap) and
		// succeeds; 200 would extend to 201 and throw. Pins the exact boundary.
		const near = 'z'.repeat(FRACTIONAL_INDEX_LENGTH_MAX - 1);
		const k = fractional_index_between(near, null, no_jitter);
		assert.strictEqual(k.length, FRACTIONAL_INDEX_LENGTH_MAX);
		assert.ok(near < k);
		assert_valid_key(k);
	});
});

describe('fractional_index_between — invariant violations throw', () => {
	test('inverted bracket (a >= b)', () => {
		assert.throws(() => fractional_index_between('b', 'a', no_jitter));
		assert.throws(() => fractional_index_between('m', 'm', no_jitter));
	});

	test('non-alphabet bound', () => {
		assert.throws(() => fractional_index_between('a-b', null, no_jitter));
		assert.throws(() => fractional_index_between(null, '!!', no_jitter));
	});

	test('over-length bound', () => {
		const huge = 'a'.repeat(FRACTIONAL_INDEX_LENGTH_MAX + 1);
		assert.throws(() => fractional_index_between(huge, null, no_jitter));
	});

	test('throws when bounds are too long to fit a key under the cap', () => {
		// An at-cap all-'z' lower bound forces `larger_than` to extend by a
		// digit, pushing the generated key over the cap. The output check
		// fails fast here rather than emitting a key the wire would reject.
		const at_cap = 'z'.repeat(FRACTIONAL_INDEX_LENGTH_MAX);
		assert.throws(
			() => fractional_index_between(at_cap, null, no_jitter),
			/generated key exceeds length cap/,
		);
	});

	test('unbounded prepend below an all-zero bound', () => {
		assert.throws(() => fractional_index_between(null, '0', no_jitter), /unbounded-prepend/);
	});

	test('structurally too-tight gap (b = a + "0…")', () => {
		assert.throws(() => fractional_index_between('a', 'a0', no_jitter), /too tight/);
	});
});

describe('jitter', () => {
	test('jittered keys remain valid and strictly between bounds', () => {
		// A real-ish source: many distinct samples, none ≥ 1.
		let seed = 0.123456789;
		const random = (): number => {
			seed = (seed * 9301 + 0.49297) % 1;
			return seed;
		};
		for (let i = 0; i < 200; i++) {
			const k = fractional_index_between('a', 'b', random);
			assert.ok('a' < k && k < 'b', JSON.stringify(k));
			assert_valid_key(k);
		}
	});

	test('a callback returning ≥ 1.0 cannot index past the alphabet', () => {
		// Defense-in-depth clamp: a misbehaving source must not emit "undefined".
		const k = fractional_index_between('a', 'b', () => 1.5);
		assert.ok('a' < k && k < 'b');
		assert_valid_key(k);
	});

	test('a callback returning < 0 cannot index before the alphabet', () => {
		// The lower-end twin of the clamp above — a negative sample must not
		// index `alphabet[-n]` and splice "undefined" into the key.
		const k = fractional_index_between('a', 'b', () => -0.5);
		assert.ok('a' < k && k < 'b');
		assert_valid_key(k);
		assert.ok(!k.includes('undefined'), JSON.stringify(k));
	});

	test('defaults to Math.random when no source is injected (production path)', () => {
		// Every other test injects a source, so the default-parameter branch
		// is otherwise uncovered. Between-ness holds for any sample in [0, 1).
		for (let i = 0; i < 50; i++) {
			const k = fractional_index_between('a', 'b');
			assert.ok('a' < k && k < 'b', JSON.stringify(k));
			assert_valid_key(k);
		}
	});
});

describe('fractional_indices_between', () => {
	test('n = 0 yields the empty array', () => {
		assert.deepStrictEqual(fractional_indices_between(null, null, 0, no_jitter), []);
	});

	test('n = 0 still validates bracket structure but not gap feasibility', () => {
		// An inverted bracket is structurally invalid → always an error, even
		// at n=0 (consistent with `fractional_index_between`).
		assert.throws(() => fractional_indices_between('b', 'a', 0, no_jitter));
		// A too-tight gap is generative feasibility, not structure; n=0
		// generates nothing, so it short-circuits to [] without surfacing it.
		assert.deepStrictEqual(fractional_indices_between('a', 'a0', 0, no_jitter), []);
	});

	test('n = 1 yields a single key, the bare deterministic mid', () => {
		assert.deepStrictEqual(fractional_indices_between(null, null, 1, no_jitter), ['V']);
	});

	test('produces the expected deterministic bisection for (null,null,3)', () => {
		assert.deepStrictEqual(fractional_indices_between(null, null, 3, no_jitter), ['U', 'V', 'W']);
	});

	test('every key lands strictly inside a closed bracket', () => {
		const keys = fractional_indices_between('a', 'z', 16, no_jitter);
		assert.strictEqual(keys.length, 16);
		assert.ok('a' < keys[0]!, `first > a: ${keys[0]}`);
		assert.ok(keys[keys.length - 1]! < 'z', `last < b: ${keys[keys.length - 1]}`);
		for (const k of keys) assert_valid_key(k);
		for (let i = 1; i < keys.length; i++) assert.ok(keys[i - 1]! < keys[i]!);
	});

	test('output is strictly increasing and all keys valid (no jitter)', () => {
		const keys = fractional_indices_between(null, null, 25, no_jitter);
		assert.strictEqual(keys.length, 25);
		for (const k of keys) assert_valid_key(k);
		for (let i = 1; i < keys.length; i++) {
			assert.ok(keys[i - 1]! < keys[i]!, `${keys[i - 1]} < ${keys[i]}`);
		}
	});

	test('output is strictly increasing with jitter too', () => {
		let seed = 0.314159;
		const random = (): number => {
			seed = (seed * 7919 + 0.271828) % 1;
			return seed;
		};
		const keys = fractional_indices_between('a', 'z', 50, random);
		assert.strictEqual(keys.length, 50);
		const sorted = [...keys].sort();
		assert.deepStrictEqual(keys, sorted, 'monotonic');
		assert.strictEqual(new Set(keys).size, keys.length, 'no duplicates');
	});

	test('defaults to Math.random when no source is injected (production path)', () => {
		const keys = fractional_indices_between('a', 'z', 20);
		assert.strictEqual(keys.length, 20);
		for (const k of keys) assert_valid_key(k);
		for (let i = 1; i < keys.length; i++) assert.ok(keys[i - 1]! < keys[i]!);
		assert.strictEqual(new Set(keys).size, keys.length, 'no duplicates');
	});

	test('rejects negative / non-integer n', () => {
		assert.throws(() => fractional_indices_between(null, null, -1, no_jitter));
		assert.throws(() => fractional_indices_between(null, null, 2.5, no_jitter));
	});

	test('atomic: a too-tight initial bracket throws (no partial array)', () => {
		assert.throws(() => fractional_indices_between('a', 'a0', 4, no_jitter));
	});
});

describe('sequential insert stress — keys stay ordered and bounded', () => {
	test('repeated back-insert (append at the end)', () => {
		let prev: string | null = null;
		const keys: Array<string> = [];
		for (let i = 0; i < 500; i++) {
			const k = fractional_index_between(prev, null, no_jitter);
			if (prev !== null) assert.ok(prev < k);
			assert_valid_key(k);
			keys.push(k);
			prev = k;
		}
		assert.deepStrictEqual([...keys].sort(), keys);
	});

	test('repeated front-insert (prepend at the head)', () => {
		let next: string | null = 'V'; // start above the all-zero floor
		const keys: Array<string> = [];
		for (let i = 0; i < 300; i++) {
			const k = fractional_index_between(null, next, no_jitter);
			assert.ok(k < next);
			assert_valid_key(k);
			keys.unshift(k);
			next = k;
		}
		assert.deepStrictEqual([...keys].sort(), keys);
	});

	test('repeated middle-insert (always split the current first gap)', () => {
		// Worst case for `strict_between` growth: keep inserting between the
		// fixed lower bound and the most-recent key, so the gap shrinks every
		// step and the algorithm must extend length monotonically.
		let next = 'b';
		for (let i = 0; i < 200; i++) {
			const k = fractional_index_between('a', next, no_jitter);
			assert.ok('a' < k && k < next, `${JSON.stringify(k)} in (a, ${JSON.stringify(next)})`);
			assert_valid_key(k);
			next = k;
		}
	});
});

describe('random neighbor-insertion simulation', () => {
	test('inserting at random positions keeps the list globally ordered and unique', () => {
		// The gold-standard fractional-index property: build a list by
		// repeatedly inserting between actual neighbors at random positions,
		// then assert the array order equals lex order with no collisions.
		// With `no_jitter` and strict-between-neighbors inserts, every key is
		// distinct from all others by construction — so any duplicate or
		// out-of-order key is a real generator bug. No key ends in `'0'`, so
		// the tight-bracket and all-zero-prepend throws never fire.
		let s = 123456789;
		const rand_int = (n: number): number => {
			s = (s * 1103515245 + 12345) & 0x7fffffff;
			return s % n;
		};
		const keys: Array<string> = [];
		for (let i = 0; i < 500; i++) {
			const pos = keys.length === 0 ? 0 : rand_int(keys.length + 1);
			const a = pos === 0 ? null : keys[pos - 1]!;
			const b = pos === keys.length ? null : keys[pos]!;
			const k = fractional_index_between(a, b, no_jitter);
			assert_valid_key(k);
			if (a !== null) assert.ok(a < k, `${JSON.stringify(a)} < ${JSON.stringify(k)}`);
			if (b !== null) assert.ok(k < b, `${JSON.stringify(k)} < ${JSON.stringify(b)}`);
			keys.splice(pos, 0, k);
		}
		assert.strictEqual(new Set(keys).size, keys.length, 'all keys unique');
		assert.deepStrictEqual(keys, [...keys].sort(), 'array order equals lex order');
	});

	test('same simulation holds under jitter', () => {
		// Jitter widens each slot; re-running the insertion walk with a live
		// random source must still yield a globally ordered, collision-free
		// list (collisions are astronomically unlikely at this scale).
		let s = 0.987654321;
		const random = (): number => {
			s = (s * 16807 + 0.123) % 1;
			return s;
		};
		let p = 12345;
		const rand_int = (n: number): number => {
			p = (p * 1103515245 + 12345) & 0x7fffffff;
			return p % n;
		};
		const keys: Array<string> = [];
		for (let i = 0; i < 500; i++) {
			const pos = keys.length === 0 ? 0 : rand_int(keys.length + 1);
			const a = pos === 0 ? null : keys[pos - 1]!;
			const b = pos === keys.length ? null : keys[pos]!;
			const k = fractional_index_between(a, b, random);
			assert_valid_key(k);
			if (a !== null) assert.ok(a < k);
			if (b !== null) assert.ok(k < b);
			keys.splice(pos, 0, k);
		}
		assert.strictEqual(new Set(keys).size, keys.length, 'all keys unique');
		assert.deepStrictEqual(keys, [...keys].sort(), 'array order equals lex order');
	});
});
