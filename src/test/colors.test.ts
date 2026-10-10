import { describe, test, assert } from 'vitest';

import {
	hex_to_rgb,
	rgb_to_hex,
	hex_string_to_rgb,
	rgb_to_hex_string,
	parse_hsl_string,
	type Hsl,
	hsl_to_hex,
	hsl_to_hex_string,
	hsl_to_rgb,
	hsl_to_string,
	rgb_to_hsl,
	hex_string_to_hsl,
	to_hex_component,
	hue_to_rgb_component,
	parse_hue,
	type Rgb
} from '#lib/colors.ts';

test('hex_to_rgb and rgb_to_hex', () => {
	const rgb: Rgb = [157, 100, 50];
	const hex = rgb_to_hex(...rgb);
	const rgb2 = hex_to_rgb(hex);
	assert.deepEqual(rgb, rgb2);
});

test('rgb_to_hex_string and hex_string_to_rgb', () => {
	const rgb: Rgb = [157, 100, 50];
	const hex = rgb_to_hex_string(...rgb);
	const rgb2 = hex_string_to_rgb(hex);
	assert.deepEqual(rgb, rgb2);
});

test('parse_hsl_string', () => {
	const parsed: Hsl = [210, 0.55, 0.62];
	assert.deepEqual(parse_hsl_string('hsl(210 55% 62%)'), parsed);
	assert.deepEqual(parse_hsl_string('hsl(210, 55%, 62%)'), parsed); // older form with commas
	assert.deepEqual(parse_hsl_string('hsl(210,55%,62%)'), parsed); // older form with commas
	assert.deepEqual(parse_hsl_string('hsl(210 55% 62%'), parsed);
	assert.deepEqual(parse_hsl_string('hsl(   210    55%  62%)'), parsed);
	assert.deepEqual(parse_hsl_string('hsl(210 55% 62% / 0.5)'), parsed);
	assert.deepEqual(parse_hsl_string('hsl(210 55% 62% / 0.5'), parsed);
	assert.deepEqual(parse_hsl_string('210 55% 62%'), parsed);
	assert.deepEqual(parse_hsl_string('210, 55%, 62%'), parsed); // older form with commas
	assert.deepEqual(parse_hsl_string('210,55%,62%'), parsed); // older form with commas
	assert.deepEqual(parse_hsl_string('210 55% 62%'), parsed);
	assert.deepEqual(parse_hsl_string('   210    55%  62%'), parsed);
	assert.deepEqual(parse_hsl_string('210 55% 62% / 0.5'), parsed);
});

test('to_hex_component', () => {
	assert.strictEqual(to_hex_component(0), '00');
	assert.strictEqual(to_hex_component(15), '0f');
	assert.strictEqual(to_hex_component(16), '10');
	assert.strictEqual(to_hex_component(255), 'ff');
	assert.strictEqual(to_hex_component(128), '80');
});

test('hue_to_rgb_component', () => {
	// t < 1/6 branch
	assert.strictEqual(hue_to_rgb_component(0, 1, 0.1), 0 + (1 - 0) * 6 * 0.1);
	// t < 1/2 branch (returns q)
	assert.strictEqual(hue_to_rgb_component(0, 1, 0.3), 1);
	// t < 2/3 branch
	const t = 0.6;
	assert.strictEqual(hue_to_rgb_component(0, 1, t), 0 + (1 - 0) * (2 / 3 - t) * 6);
	// t >= 2/3 branch (returns p)
	assert.strictEqual(hue_to_rgb_component(0.2, 1, 0.8), 0.2);
	// t < 0 normalization (t2 = t+1, both land in t >= 2/3 returning p)
	assert.strictEqual(hue_to_rgb_component(0.2, 1, -0.1), 0.2); // same as t=0.9
	// t > 1 normalization (t2 = t-1)
	assert.ok(Math.abs(hue_to_rgb_component(0, 1, 1.1) - hue_to_rgb_component(0, 1, 0.1)) < 1e-10);
});

test('hex_string_to_rgb error on invalid hex', () => {
	assert.throws(() => hex_string_to_rgb('abc'), /invalid hex string/);
	assert.throws(() => hex_string_to_rgb('#abc'), /invalid hex string/);
	assert.throws(() => hex_string_to_rgb('abcde'), /invalid hex string/);
	assert.throws(() => hex_string_to_rgb(''), /invalid hex string/);
});

test('hex_string_to_rgb with 8-character hex (alpha ignored)', () => {
	// 8-char hex should not throw, alpha channel is ignored
	const rgb = hex_string_to_rgb('#9d6432ff');
	assert.deepEqual(rgb, [157, 100, 50]);
});

test('parse_hsl_string error on invalid string', () => {
	assert.throws(() => parse_hsl_string('not a color'), /invalid HSL string/);
	assert.throws(() => parse_hsl_string(''), /invalid HSL string/);
	assert.throws(() => parse_hsl_string('rgb(255, 0, 0)'), /invalid HSL string/);
});

test('achromatic colors (r=g=b)', () => {
	// Pure gray: rgb_to_hsl should return s=0
	const hsl = rgb_to_hsl(128, 128, 128);
	assert.strictEqual(hsl[1], 0); // saturation = 0
	// And back
	const rgb = hsl_to_rgb(0, 0, 0.5);
	assert.strictEqual<number>(rgb[0], rgb[1]);
	assert.strictEqual<number>(rgb[1], rgb[2]);
});

test('boundary colors', () => {
	// Pure black
	assert.deepEqual(rgb_to_hsl(0, 0, 0), [0, 0, 0]);
	// Pure white
	assert.deepEqual(rgb_to_hsl(255, 255, 255), [0, 0, 1]);
});

test('conversions between hsl, rgb, and hex', () => {
	const hsl: Hsl = [210, 0.55, 0.62];
	assert.strictEqual(hsl_to_string(...hsl), 'hsl(210 55% 62%)');
	const hex_string = hsl_to_hex_string(...hsl);
	assert.strictEqual(hex_string, '#699ed3');
	const hex = hsl_to_hex(...hsl);
	const rgb = hex_to_rgb(hex);
	assert.strictEqual(rgb_to_hex_string(...rgb), hex_string);
	assert.strictEqual(rgb_to_hex(...rgb), hex);
	assert.deepEqual(rgb, [105, 158, 211]);
	assert.deepEqual(rgb, hsl_to_rgb(...hsl));
	assert.deepEqual(hex_string_to_rgb(hex_string), rgb);
	assert.deepEqual(hex_string_to_hsl(hex_string), hsl);
	assert.deepEqual(rgb_to_hsl(...rgb), hsl);
});

test('hsl hues are degrees across the primaries', () => {
	assert.deepEqual(rgb_to_hsl(255, 0, 0), [0, 1, 0.5]);
	assert.deepEqual(rgb_to_hsl(0, 255, 0), [120, 1, 0.5]);
	assert.deepEqual(rgb_to_hsl(0, 0, 255), [240, 1, 0.5]);
	assert.deepEqual(hsl_to_rgb(120, 1, 0.5), [0, 255, 0]);
	assert.deepEqual(hsl_to_rgb(240, 1, 0.5), [0, 0, 255]);
	assert.deepEqual(hsl_to_rgb(360, 1, 0.5), [255, 0, 0]); // a full turn wraps to red
});

test('hsl_to_rgb wraps any hue angle', () => {
	for (const h of [0, 45, 120, 210, 300]) {
		const expected = hsl_to_rgb(h, 0.6, 0.4);
		assert.deepEqual(hsl_to_rgb(h + 360, 0.6, 0.4), expected, `${h} + 360`);
		assert.deepEqual(hsl_to_rgb(h + 720, 0.6, 0.4), expected, `${h} + 720`);
		assert.deepEqual(hsl_to_rgb(h - 360, 0.6, 0.4), expected, `${h} - 360`);
	}
});

test('rgb_to_hsl and hsl_to_rgb round-trip hues in degrees', () => {
	for (const rgb of [
		[255, 128, 0],
		[64, 200, 160],
		[90, 30, 220],
		[240, 20, 120]
	] satisfies Array<Rgb>) {
		const [h, s, l] = rgb_to_hsl(...rgb);
		assert(h >= 0 && h < 360, `hue ${h} of ${rgb}`);
		// s/l are rounded to 2 decimals, so allow a few units of drift
		const back = hsl_to_rgb(h, s, l);
		for (let i = 0; i < 3; i++) assert.closeTo(back[i]!, rgb[i]!, 4, `${rgb} [${i}]`);
	}
});

describe('parse_hue', () => {
	test('accepts finite numbers as-is', () => {
		assert.strictEqual(parse_hue(0), 0);
		assert.strictEqual(parse_hue(250.5), 250.5);
		assert.strictEqual(parse_hue(-30), -30); // not normalized
		assert.strictEqual(parse_hue(400), 400);
	});

	test('accepts numeric strings with an optional deg unit', () => {
		assert.strictEqual(parse_hue('250'), 250);
		assert.strictEqual(parse_hue('  250  '), 250);
		assert.strictEqual(parse_hue('250deg'), 250);
		assert.strictEqual(parse_hue('250DEG'), 250);
		assert.strictEqual(parse_hue('1e2'), 100);
		assert.strictEqual(parse_hue('.5'), 0.5);
		assert.strictEqual(parse_hue('-30'), -30);
	});

	test('rejects empty, non-numeric, and non-finite input', () => {
		assert.strictEqual(parse_hue(''), null);
		assert.strictEqual(parse_hue('   '), null);
		assert.strictEqual(parse_hue('deg'), null);
		assert.strictEqual(parse_hue('red'), null);
		assert.strictEqual(parse_hue('0x10'), null); // no hex/binary/octal via `Number`
		assert.strictEqual(parse_hue('0b1'), null);
		assert.strictEqual(parse_hue('250 deg'), null);
		assert.strictEqual(parse_hue('250turn'), null);
		assert.strictEqual(parse_hue('1e400'), null); // overflows to Infinity
		assert.strictEqual(parse_hue(NaN), null);
		assert.strictEqual(parse_hue(Infinity), null);
		assert.strictEqual(parse_hue('Infinity'), null);
		assert.strictEqual(parse_hue(null), null);
		assert.strictEqual(parse_hue(undefined), null);
		assert.strictEqual(parse_hue({}), null);
	});
});
