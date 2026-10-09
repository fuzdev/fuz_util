---
'@fuzdev/fuz_util': minor
---

**breaking** feat: `Hue` is degrees [0, 360) instead of [0, 1], matching CSS — `rgb_to_hsl`, `hsl_to_rgb`, `hsl_to_hex`, `hsl_to_hex_string`, `hsl_to_string`, `parse_hsl_string`, and `hex_string_to_hsl` take and return degrees, so callers drop their `* 360` / `/ 360`, and `hsl_to_rgb` now wraps any angle; `Hsl` and `Rgb` are no longer `readonly`. Adds `parse_hue` to `colors.ts`, and the `oklch.ts` module (moved from `@fuzdev/fuz_css`) with OKLCH/OKLab ↔ sRGB conversions, `clamp_oklch`, `oklch_in_srgb_gamut`, `oklch_max_srgb_chroma`, the allocation-free `oklch_to_srgb_into`, and `oklch_to_string` / `parse_oklch_string`; unlike the fuz_css original, `oklab_to_oklch` gives grays hue 0 rather than matrix-noise hues
