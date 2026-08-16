/**
 * Pure geometry/artwork helpers shared by every decorative-asset renderer
 * (canvas, property-panel preview, hierarchy palette, drag preview).
 *
 * Decorative assets are positioned by their CENTER (x, y) and sized by a
 * single uniform `scale` factor. The canvas renders them at a fixed display
 * factor of 3 screen units per asset unit. Centralizing that factor here means
 * hit-testing, rubber-band extents, group movement and rendering can never
 * disagree about the asset's on-canvas size.
 */
import type { DecorAssetDescriptor, DecorPart } from "../components/map-builder/constants";

/** Fixed canvas display factor: 1 asset unit → 3 screen units. */
export const DECOR_RENDER_SCALE = 3;

/** Rendered world-space scale factor for an asset (defaults to 1). */
export function decorRenderScale(scale?: number): number {
  return (scale ?? 1) * DECOR_RENDER_SCALE;
}

/** Unrotated world-space size of an asset at the given uniform scale. */
export function decorWorldSize(
  template: Pick<DecorAssetDescriptor, "defaultWidth" | "defaultHeight">,
  scale?: number
): { width: number; height: number } {
  const s = decorRenderScale(scale);
  return { width: template.defaultWidth * s, height: template.defaultHeight * s };
}

export const DECOR_SELECTION_OUTLINE_PADDING = 6;

export function decorSelectionOutlineBox(
  template: Pick<DecorAssetDescriptor, "defaultWidth" | "defaultHeight">,
  scale?: number
): { width: number; height: number; rx: number } {
  const size = decorWorldSize(template, scale);
  return {
    width: size.width + DECOR_SELECTION_OUTLINE_PADDING * 2,
    height: size.height + DECOR_SELECTION_OUTLINE_PADDING * 2,
    rx: Math.min(10, Math.max(4, Math.min(size.width, size.height) * 0.12)),
  };
}

/**
 * The SVG artwork of a descriptor, in local 0..defaultWidth × 0..defaultHeight
 * space. Prefers the multi-part `parts` definition; falls back to the legacy
 * single `svgPath` + `color` shape for descriptors without parts.
 */
export function getDecorParts(descriptor: DecorAssetDescriptor | undefined): DecorPart[] {
  if (!descriptor) return [];
  if (descriptor.parts && descriptor.parts.length > 0) return descriptor.parts;
  return [{ d: descriptor.svgPath, fill: descriptor.color }];
}
