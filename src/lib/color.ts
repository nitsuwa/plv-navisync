/**
 * Pure color helpers (no React/DOM) — unit-testable directly.
 */

/**
 * Mix a hex color toward white (positive percent) or black (negative percent).
 * Accepts `#rgb` or `#rrggbb` (with or without the leading `#`). Returns the
 * input unchanged when it cannot be parsed as a hex color.
 */
export function shade(hex: string, percent: number): string {
  const m = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(hex.trim());
  if (!m) return hex;

  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");

  const value = parseInt(h, 16);
  let r = (value >> 16) & 0xff;
  let g = (value >> 8) & 0xff;
  let b = value & 0xff;

  const target = percent < 0 ? 0 : 255;
  const p = Math.min(100, Math.abs(percent)) / 100;
  r = Math.round((target - r) * p + r);
  g = Math.round((target - g) * p + g);
  b = Math.round((target - b) * p + b);

  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
