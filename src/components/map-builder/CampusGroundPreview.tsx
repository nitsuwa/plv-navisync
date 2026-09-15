import { useId } from "react";
import type { CampusGroundMaterial, CampusGroundTexture } from "./types";
import { campusGroundPatternId } from "../../lib/campusCanvas";
import { CampusGroundPatternDefs } from "./CampusGroundPatternDefs";
import { CampusGroundSurface } from "./CampusGroundSurface";

interface CampusGroundPreviewProps {
  material: CampusGroundMaterial;
  color?: string;
  texture: CampusGroundTexture;
  width: number;
  height: number;
}

/**
 * Small preview renderer shared with the canvas material vocabulary.  The
 * patterns intentionally use user-space units, matching the authored canvas,
 * so the preview demonstrates the material rather than stretching a bitmap.
 */
export function CampusGroundPreview({ material, color, texture, width, height }: CampusGroundPreviewProps) {
  const rawId = useId();
  const suffix = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const basePattern = campusGroundPatternId(material, texture);
  const patternId = basePattern ? `${basePattern}-preview-${suffix}` : undefined;
  // Keep the canonical world-space pattern definitions, but enlarge their
  // repeated tile in the compact thumbnail so fine marks remain perceptible
  // after the preview viewBox is reduced to a few hundred screen pixels.
  const patternScale = basePattern ? Math.max(1, Math.max(width, height) / 240) : 1;
  return (
    <svg
      data-testid="canvas-ground-material-preview"
      data-ground-material={material}
      data-ground-texture={texture}
      role="img"
      viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`}
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      aria-label={`${material} ground preview`}
    >
      <defs>{patternId && <CampusGroundPatternDefs idSuffix={`-preview-${suffix}`} patternScale={patternScale} />}</defs>
      <CampusGroundSurface
        material={material}
        color={color}
        texture={texture}
        width={width}
        height={height}
        patternIdOverride={patternId}
        textureTestId="canvas-ground-material-texture"
      />
    </svg>
  );
}
