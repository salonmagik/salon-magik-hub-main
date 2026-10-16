/**
 * Color utility functions for dynamic theming
 */

/**
 * Convert hex color to RGB object
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Remove # if present
  const cleanHex = hex.replace(/^#/, '');
  
  // Handle 3-character hex
  const fullHex = cleanHex.length === 3
    ? cleanHex.split('').map(c => c + c).join('')
    : cleanHex;
  
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  
  if (!result) return null;
  
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Calculate relative luminance of a color
 * Using WCAG 2.0 formula
 */
export function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const sRGB = c / 255;
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Determine if a color is "light" (should use dark text)
 */
export function isLightColor(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  
  const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
  // WCAG threshold - colors with luminance > 0.179 are considered "light"
  return luminance > 0.179;
}

/**
 * Get the appropriate contrast text color for a background
 */
export function getContrastTextColor(hex: string): 'white' | 'black' {
  return isLightColor(hex) ? 'black' : 'white';
}

/**
 * Get contrast text color as hex value
 */
export function getContrastTextColorHex(hex: string): string {
  return isLightColor(hex) ? '#1a1a1a' : '#ffffff';
}

/**
 * Convert hex to HSL. Hue in degrees [0,360), saturation/lightness as
 * percentages [0,100].
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: Math.round(l * 100) };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      break;
    case g:
      h = ((b - r) / d + 2) * 60;
      break;
    default:
      h = ((r - g) / d + 4) * 60;
  }

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * "H S% L%" triplet, the format Tailwind's hsl(var(--token)) tokens expect
 * (e.g. "262 43% 21%"). Falls back to a neutral gray if the hex is invalid,
 * so a malformed stored color never breaks the whole page's theming.
 */
export function hexToHslTriplet(hex: string): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return '0 0% 50%';
  return `${hsl.h} ${hsl.s}% ${hsl.l}%`;
}

/**
 * Nudge a color's saturation/lightness by the given deltas (same hue),
 * clamped to valid ranges. Used to derive a muted secondary/accent color
 * from a tenant's primary color when they haven't picked one explicitly.
 */
export function adjustHsl(hex: string, delta: { s?: number; l?: number }): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  const s = clamp(hsl.s + (delta.s ?? 0), 0, 100);
  const l = clamp(hsl.l + (delta.l ?? 0), 0, 100);
  return hslToHex(hsl.h, s, l);
}

/**
 * Derive a muted/desaturated version of a color for use as a secondary
 * accent when the tenant hasn't set one explicitly.
 */
export function deriveMutedSecondary(hex: string): string {
  return adjustHsl(hex, { s: -35, l: 20 });
}

/**
 * Derive a very light tint of a color for pale chip/badge backgrounds
 * (e.g. a location pill), at a near-white lightness but keeping a little
 * of the hue so it still reads as "branded", not gray.
 */
export function deriveLightTint(hex: string): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return '#f5f5f5';
  return hslToHex(hsl.h, clamp(hsl.s, 15, 35), 95);
}
