import type { CampusGroundMaterial, CampusGroundTexture } from "./types";
import { CAMPUS_GROUND_DEFAULTS, campusGroundPatternId } from "../../lib/campusCanvas";

interface CampusGroundSurfaceProps {
  material: CampusGroundMaterial;
  texture: CampusGroundTexture;
  color?: string;
  width: number;
  height: number;
  /** Preview instances use an isolated SVG pattern id. */
  patternIdOverride?: string;
  /** Preserve the canvas hit-test marker when used inside the live editor. */
  baseIsBackground?: boolean;
  textureTestId?: string;
}

/**
 * Shared SVG surface renderer for the live Outdoor canvas and Canvas Settings
 * preview. Both layers therefore resolve the same tint, fixed-size pattern,
 * and texture strength instead of maintaining two subtly different paint
 * implementations.
 */
export function CampusGroundSurface({
  material,
  texture,
  color,
  width,
  height,
  patternIdOverride,
  baseIsBackground = false,
  textureTestId,
}: CampusGroundSurfaceProps) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const pattern = patternIdOverride ?? campusGroundPatternId(material, texture);
  const fill = color || CAMPUS_GROUND_DEFAULTS[material];

  return (
    <>
      <rect
        {...(baseIsBackground ? { "data-bg": "true" } : {})}
        data-ground-material={material}
        width={safeWidth}
        height={safeHeight}
        fill={fill}
      />
      {pattern && (
        <rect
          data-testid={textureTestId}
          width={safeWidth}
          height={safeHeight}
          fill={`url(#${pattern})`}
          pointerEvents="none"
          opacity={0.82}
        />
      )}
    </>
  );
}
