/**
 * OKLCH/OKLab ↔ sRGB conversions, gamut math, and `oklch()` strings.
 *
 * The tuple-returning conversions allocate a fresh array per call, which is
 * fine for most uses. Per-pixel or per-frame callers (a canvas gamut plane, a
 * live chroma clamp) should use `oklch_to_srgb_into`, which writes into a
 * caller-owned array. The gamut helpers allocate nothing.
 *
 * Matrices and constants follow css-color-4 and Björn Ottosson's reference
 * implementation.
 *
 * @module
 */

import type { Flavored } from './types.ts';
import type { Hue, Lightness } from './colors.ts';
import { round } from './maths.ts';

/** OKLCH chroma, 0 or more and unbounded; sRGB colors stay below about 0.37. */
export type Chroma = Flavored<number, 'Chroma'>;

/** A color in OKLCH: lightness in [0, 1], chroma ≥ 0 (unbounded), hue in degrees. */
export type Oklch = [lightness: Lightness, chroma: Chroma, hue: Hue];

/** A color in OKLab: lightness in [0, 1], `a`/`b` roughly in [-0.4, 0.4]. */
export type Oklab = [lightness: Lightness, a: number, b: number];

/**
 * An RGB color with components in the unit interval [0, 1].
 * Values are gamma-encoded sRGB unless a function documents linear-light.
 * Out-of-gamut results are not clamped, so components may fall outside [0, 1].
 */
export type RgbUnit = [r: number, g: number, b: number];

/**
 * Clamps an OKLCH color the way the browser clamps a computed `oklch()`:
 * lightness to [0, 1] and chroma to 0 or more. Derived values can overshoot
 * an end, and the browser renders the clamped color, so anything measuring
 * the rendered color has to clamp too.
 */
export const clamp_oklch = ([lightness, chroma, hue]: Readonly<Oklch>): Oklch => [
	Math.min(Math.max(lightness, 0), 1),
	Math.max(chroma, 0),
	hue
];

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Converts a gamma-encoded sRGB component in [0, 1] to linear-light.
 */
export const srgb_component_to_linear = (c: number): number =>
	c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

/**
 * Converts a linear-light sRGB component to gamma-encoded in [0, 1].
 */
export const linear_component_to_srgb = (c: number): number =>
	c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;

/**
 * Converts gamma-encoded sRGB to OKLab.
 */
export const srgb_to_oklab = ([r, g, b]: Readonly<RgbUnit>): Oklab => {
	const rl = srgb_component_to_linear(r);
	const gl = srgb_component_to_linear(g);
	const bl = srgb_component_to_linear(b);

	const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
	const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
	const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

	const l_ = Math.cbrt(l);
	const m_ = Math.cbrt(m);
	const s_ = Math.cbrt(s);

	return [
		0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
		1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
		0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
	];
};

// the shared OKLab -> sRGB core, on scalars so no caller allocates an intermediate tuple
const lab_to_srgb_into = (lightness: number, a: number, b: number, out: RgbUnit): RgbUnit => {
	const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = lightness - 0.0894841775 * a - 1.291485548 * b;

	const l = l_ * l_ * l_;
	const m = m_ * m_ * m_;
	const s = s_ * s_ * s_;

	out[0] = linear_component_to_srgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
	out[1] = linear_component_to_srgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
	out[2] = linear_component_to_srgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
	return out;
};

/**
 * Converts OKLab to gamma-encoded sRGB.
 *
 * @returns components that may fall outside [0, 1] when the color is out of gamut
 */
export const oklab_to_srgb = ([lightness, a, b]: Readonly<Oklab>): RgbUnit =>
	lab_to_srgb_into(lightness, a, b, [0, 0, 0]);

// below this chroma the hue is noise - the rounded published matrices leave sRGB grays
// with chroma near 4e-8, while a one-step 8-bit tint is near 1e-3
const ACHROMATIC_CHROMA = 1e-6;

/**
 * Converts OKLab to OKLCH. Hue is normalized to [0, 360); an achromatic color
 * (chroma below the float noise of the conversion matrices) gets hue 0.
 */
export const oklab_to_oklch = ([lightness, a, b]: Readonly<Oklab>): Oklch => {
	const chroma = Math.hypot(a, b);
	const hue = chroma < ACHROMATIC_CHROMA ? 0 : (Math.atan2(b, a) * RAD_TO_DEG + 360) % 360;
	return [lightness, chroma, hue];
};

/**
 * Converts OKLCH to OKLab.
 */
export const oklch_to_oklab = ([lightness, chroma, hue]: Readonly<Oklch>): Oklab => [
	lightness,
	chroma * Math.cos(hue * DEG_TO_RAD),
	chroma * Math.sin(hue * DEG_TO_RAD)
];

/**
 * Converts gamma-encoded sRGB to OKLCH.
 */
export const srgb_to_oklch = (rgb: Readonly<RgbUnit>): Oklch => oklab_to_oklch(srgb_to_oklab(rgb));

/**
 * Converts OKLCH to gamma-encoded sRGB.
 *
 * @returns components that may fall outside [0, 1] when the color is out of gamut
 */
export const oklch_to_srgb = (lch: Readonly<Oklch>): RgbUnit => oklch_to_srgb_into(lch, [0, 0, 0]);

/**
 * Converts OKLCH to gamma-encoded sRGB, writing into `out` instead of allocating.
 * For hot loops like per-pixel canvas fills; `out` may be reused across calls.
 *
 * @param lch - the color to convert
 * @param out - the array to write the sRGB components into
 * @returns `out`, with components that may fall outside [0, 1] when the color is out of gamut
 * @mutates out - overwrites all three components
 */
export const oklch_to_srgb_into = (lch: Readonly<Oklch>, out: RgbUnit): RgbUnit => {
	// indexed, not destructured - unoptimized code runs the iterator protocol to destructure
	const chroma = lch[1];
	const hue_rad = lch[2] * DEG_TO_RAD;
	return lab_to_srgb_into(lch[0], chroma * Math.cos(hue_rad), chroma * Math.sin(hue_rad), out);
};

// float-noise tolerance at the gamut boundary
const GAMUT_EPSILON = 1e-6;

// scratch for the gamut checks - safe to share because they're synchronous and never reenter
const scratch_rgb: RgbUnit = [0, 0, 0];

// the allocation-free gamut core, on OKLab scalars so callers can hoist the hue's cos/sin
const lab_in_srgb_gamut = (lightness: number, a: number, b: number, epsilon: number): boolean => {
	lab_to_srgb_into(lightness, a, b, scratch_rgb);
	const min = -epsilon;
	const max = 1 + epsilon;
	return (
		scratch_rgb[0] >= min &&
		scratch_rgb[0] <= max &&
		scratch_rgb[1] >= min &&
		scratch_rgb[1] <= max &&
		scratch_rgb[2] >= min &&
		scratch_rgb[2] <= max
	);
};

/**
 * Checks whether an OKLCH color converts to sRGB with all components inside [0, 1].
 * Allocates nothing, so it's safe in hot loops.
 *
 * @param epsilon - tolerance for float noise at the gamut boundary
 */
export const oklch_in_srgb_gamut = (lch: Readonly<Oklch>, epsilon = GAMUT_EPSILON): boolean => {
	// indexed for the same reason as `oklch_to_srgb_into`
	const chroma = lch[1];
	const hue_rad = lch[2] * DEG_TO_RAD;
	return lab_in_srgb_gamut(lch[0], chroma * Math.cos(hue_rad), chroma * Math.sin(hue_rad), epsilon);
};

/**
 * Finds the largest chroma at a given OKLCH lightness and hue such that every
 * chroma below it is also inside the sRGB gamut. Returns 0 when the lightness
 * itself is out of range. Allocates nothing.
 *
 * This is deliberately the *safe* maximum for ramps, not the outermost gamut
 * intersection: the sRGB gamut is non-convex in OKLab (most visibly near the
 * blue primary), so the constant-(L, H) chroma ray can exit and re-enter the
 * gamut. A ramp needs the whole `[0, C]` segment representable, so the scan
 * stops at the first exit.
 *
 * @param precision - terminate when the refinement interval is smaller than this
 */
export const oklch_max_srgb_chroma = (lightness: Lightness, hue: Hue, precision = 1e-5): Chroma => {
	if (lightness <= 0 || lightness >= 1) return 0;
	// the hue is fixed along the ray, so its direction is computed once
	const cos_h = Math.cos(hue * DEG_TO_RAD);
	const sin_h = Math.sin(hue * DEG_TO_RAD);
	const in_gamut = (c: number): boolean =>
		lab_in_srgb_gamut(lightness, c * cos_h, c * sin_h, GAMUT_EPSILON);
	// coarse outward scan to the first gamut exit, robust to non-convexity
	const step = 0.002;
	let low = 0;
	let high = 0.5; // beyond any sRGB chroma
	for (let c = step; c <= 0.5; c += step) {
		if (in_gamut(c)) {
			low = c;
		} else {
			high = c;
			break;
		}
	}
	// binary refinement inside the crossing interval
	while (high - low > precision) {
		const mid = (low + high) / 2;
		if (in_gamut(mid)) {
			low = mid;
		} else {
			high = mid;
		}
	}
	return low;
};

/**
 * Renders an OKLCH color as a CSS `oklch()` string, rounding lightness and
 * chroma to 4 decimals and hue to 2.
 */
export const oklch_to_string = (lightness: Lightness, chroma: Chroma, hue: Hue): string =>
	`oklch(${round(lightness, 4)} ${round(chroma, 4)} ${round(hue, 2)})`;

const OKLCH_NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`;
const OKLCH_STRING_MATCHER = new RegExp(
	String.raw`^\s*(?:oklch\(\s*)?(none|${OKLCH_NUMBER}%?)\s+(none|${OKLCH_NUMBER}%?)\s+(none|${OKLCH_NUMBER}(?:deg)?)\s*(?:\/\s*(?:none|${OKLCH_NUMBER}%?)\s*)?\)?\s*$`,
	'iu'
);

// css-color-4 reference ranges: 100% lightness is 1 and 100% chroma is 0.4
const parse_oklch_component = (raw: string, percent_base: number): number => {
	if (raw.toLowerCase() === 'none') return 0;
	if (raw.endsWith('%')) return (Number(raw.slice(0, -1)) / 100) * percent_base;
	return Number(raw.replace(/deg$/iu, ''));
};

/**
 * Parses a CSS `oklch()` string, with or without the `oklch(` wrapper.
 * Accepts percentages, a `deg` hue unit, `none` components (as 0), and
 * exponents. The alpha channel is accepted and ignored.
 *
 * @throws Error if the string isn't an `oklch()` color
 */
export const parse_oklch_string = (value: string): Oklch => {
	const match = OKLCH_STRING_MATCHER.exec(value);
	if (!match) throw new Error('invalid OKLCH string');
	return [
		parse_oklch_component(match[1]!, 1),
		parse_oklch_component(match[2]!, 0.4),
		parse_oklch_component(match[3]!, 0)
	];
};
