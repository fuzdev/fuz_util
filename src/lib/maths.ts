/**
 * Returns `n` bounded to `min` and `max`.
 */
export const clamp = (n: number, min: number, max: number): number =>
	Math.min(Math.max(n, min), max);

/**
 * Linear interpolation between `a` and `b` by `amount`.
 */
export const lerp = (a: number, b: number, amount: number): number => (1 - amount) * a + amount * b;

/**
 * Rounds a number to a specified number of decimal places.
 */
export const round = (n: number, decimals: number): number => {
	const mult = 10 ** decimals;
	return Math.round(n * mult) / mult;
};

/**
 * golden ratio/mean constants, useful for scaling: https://wikipedia.org/wiki/Golden_ratio
 */
export const GR = 1.618033988749895;
/**
 * golden ratio/mean constants, `1/GR`, useful for scaling: https://wikipedia.org/wiki/Golden_ratio
 */
export const GR_i = 0.6180339887498948;
/**
 * golden ratio/mean constants, `GR**2`, useful for scaling: https://wikipedia.org/wiki/Golden_ratio
 */
export const GR_2 = 2.618033988749895;
/**
 * golden ratio/mean constants, `1/(GR**2)`, useful for scaling: https://wikipedia.org/wiki/Golden_ratio
 */
export const GR_2i = 0.38196601125010515;
/**
 * golden ratio/mean constants, `GR**3`, useful for scaling: https://wikipedia.org/wiki/Golden_ratio
 */
export const GR_3 = 4.23606797749979;
/**
 * golden ratio/mean constants, `1/(GR**3)`, useful for scaling: https://wikipedia.org/wiki/Golden_ratio
 */
export const GR_3i = 0.2360679774997897;
/**
 * golden ratio/mean constants, `GR**4`, useful for scaling: https://wikipedia.org/wiki/Golden_ratio
 */
export const GR_4 = 6.854101966249686;
/**
 * golden ratio/mean constants, `1/(GR**4)`, useful for scaling: https://wikipedia.org/wiki/Golden_ratio
 */
export const GR_4i = 0.14589803375031543;
/**
 * golden ratio/mean constants, `GR**5`, useful for scaling: https://wikipedia.org/wiki/Golden_ratio
 */
export const GR_5 = 11.090169943749476;
/**
 * golden ratio/mean constants, `1/(GR**5)`, useful for scaling: https://wikipedia.org/wiki/Golden_ratio
 */
export const GR_5i = 0.09016994374947422;
/**
 * golden ratio/mean constants, `GR**6`, useful for scaling: https://wikipedia.org/wiki/Golden_ratio
 */
export const GR_6 = 17.944271909999163;
/**
 * golden ratio/mean constants, `1/(GR**6)`, useful for scaling: https://wikipedia.org/wiki/Golden_ratio
 */
export const GR_6i = 0.0557280900008412;
/**
 * golden ratio/mean constants, `GR**7`, useful for scaling: https://wikipedia.org/wiki/Golden_ratio
 */
export const GR_7 = 29.03444185374864;
/**
 * golden ratio/mean constants, `1/(GR**7)`, useful for scaling: https://wikipedia.org/wiki/Golden_ratio
 */
export const GR_7i = 0.03444185374863302;
/**
 * golden ratio/mean constants, `GR**8`, useful for scaling: https://wikipedia.org/wiki/Golden_ratio
 */
export const GR_8 = 46.978713763747805;
/**
 * golden ratio/mean constants, `1/(GR**8)`, useful for scaling: https://wikipedia.org/wiki/Golden_ratio
 */
export const GR_8i = 0.02128623625220818;
/**
 * golden ratio/mean constants, `GR**9`, useful for scaling: https://wikipedia.org/wiki/Golden_ratio
 */
export const GR_9 = 76.01315561749645;
/**
 * golden ratio/mean constants, `1/(GR**9)`, useful for scaling: https://wikipedia.org/wiki/Golden_ratio
 */
export const GR_9i = 0.013155617496424835;

/**
 * Format a number with fixed decimal places and thousands separators.
 */
export const format_number = (n: number, decimals: number = 2): string => {
	if (!isFinite(n)) return String(n);
	return n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};
