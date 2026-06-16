import type {Flavored} from './types.ts';
import {round} from './maths.ts';

// TODO for high-performance usecases, we may want to add variants for any that return a new array to reuse a single array
// I've run into cases where this is a massive perceptible UX difference

// https://stackoverflow.com/questions/2353211/hsl-to-rgb-color-conversion

export type Hsl = readonly [Hue, Saturation, Lightness];
export type Hue = Flavored<number, 'Hue'>; // [0, 1]
export type Saturation = Flavored<number, 'Saturation'>; // [0, 1]
export type Lightness = Flavored<number, 'Lightness'>; // [0, 1]

export type Rgb = readonly [Red, Green, Blue];
export type Red = Flavored<number, 'Red'>; // [0, 255]
export type Green = Flavored<number, 'Green'>; // [0, 255]
export type Blue = Flavored<number, 'Blue'>; // [0, 255]

/**
 * Converts an RGB color to a hex color.
 */
export const rgb_to_hex = (r: number, g: number, b: number): number => (r << 16) + (g << 8) + b;

/**
 * Converts a hex color to an RGB color.
 */
export const hex_to_rgb = (hex: number): Rgb => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

export const hex_string_to_rgb = (hex: string): Rgb => {
	var h = hex[0] === '#' ? hex.substring(1) : hex;
	if (h.length !== 6 && h.length !== 8) throw new Error('invalid hex string');
	return [parseInt(h[0]! + h[1]!, 16), parseInt(h[2]! + h[3]!, 16), parseInt(h[4]! + h[5]!, 16)];
};

export const rgb_to_hex_string = (r: number, g: number, b: number): string =>
	'#' + to_hex_component(r) + to_hex_component(g) + to_hex_component(b);

export const to_hex_component = (v: number): string => {
	var h = v.toString(16);
	return h.length === 1 ? '0' + h : h;
};

/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://wikipedia.org/wiki/HSL_color_space.
 * Values r/g/b are in the range [0,255] and
 * returns h/s/l in the range [0,1].
 */
export const rgb_to_hsl = (r: number, g: number, b: number): Hsl => {
	var r2 = r / 255;
	var g2 = g / 255;
	var b2 = b / 255;
	var max = Math.max(r2, g2, b2);
	var min = Math.min(r2, g2, b2);
	var l: Lightness = (max + min) / 2;
	var h!: Hue, s: Saturation;
	if (max === min) {
		h = s = 0; // achromatic
	} else {
		var d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r2:
				h = (g2 - b2) / d + (g2 < b2 ? 6 : 0);
				break;
			case g2:
				h = (b2 - r2) / d + 2;
				break;
			case b2:
				h = (r2 - g2) / d + 4;
				break;
		}
		h /= 6;
	}
	return [h, round(s, 2), round(l, 2)];
};

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://wikipedia.org/wiki/HSL_color_space.
 * Values h/s/l are in the range [0,1] and
 * returns r/g/b in the range [0,255].
 */
export const hsl_to_rgb = (h: Hue, s: Saturation, l: Lightness): Rgb => {
	var r: number, g: number, b: number;
	if (s === 0) {
		r = g = b = l; // achromatic
	} else {
		var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		var p = 2 * l - q;
		r = hue_to_rgb_component(p, q, h + 1 / 3);
		g = hue_to_rgb_component(p, q, h);
		b = hue_to_rgb_component(p, q, h - 1 / 3);
	}
	return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};

export const hue_to_rgb_component = (p: number, q: number, t: number): number => {
	var t2 = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
	if (t2 < 1 / 6) return p + (q - p) * 6 * t2;
	if (t2 < 1 / 2) return q;
	if (t2 < 2 / 3) return p + (q - p) * (2 / 3 - t2) * 6;
	return p;
};

export const hsl_to_hex = (h: Hue, s: Saturation, l: Lightness): number => {
	var rgb = hsl_to_rgb(h, s, l); // TODO could safely use the optimized variant
	return rgb_to_hex(rgb[0], rgb[1], rgb[2]);
};

export const hsl_to_hex_string = (h: Hue, s: Saturation, l: Lightness): string => {
	var rgb = hsl_to_rgb(h, s, l); // TODO could safely use the optimized variant
	return rgb_to_hex_string(rgb[0], rgb[1], rgb[2]);
};

export const hsl_to_string = (h: Hue, s: Saturation, l: Lightness): string =>
	`hsl(${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

export const hex_string_to_hsl = (hex: string): Hsl => {
	var rgb = hex_string_to_rgb(hex); // TODO could safely use the optimized variant
	return rgb_to_hsl(rgb[0], rgb[1], rgb[2]);
};

const HSL_STRING_MATCHER = /^(hsl\()?\s*(\d+),?\s*(\d+)%,?\s*(\d+)%/;

export const parse_hsl_string = (hsl: string): Hsl => {
	var match = HSL_STRING_MATCHER.exec(hsl);
	if (!match) throw new Error('invalid HSL string');
	return [Number(match[2]) / 360, Number(match[3]) / 100, Number(match[4]) / 100];
};

// TODO either add an hsla variant or support alpha in the hsl variant
