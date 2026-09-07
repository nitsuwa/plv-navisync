import { useId } from "react";
import type { CampusGroundMaterial, CampusGroundTexture } from "./types";
import { CAMPUS_GROUND_DEFAULTS, campusGroundPatternId } from "../../lib/campusCanvas";
import { CampusGroundPatternDefs } from "./CampusGroundPatternDefs";

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
  const fill = color || CAMPUS_GROUND_DEFAULTS[material];
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
      <defs>{patternId && <CampusGroundPatternDefs idSuffix={`-preview-${suffix}`} />}</defs>
      <rect width={Math.max(1, width)} height={Math.max(1, height)} fill={fill} />
      {patternId && <rect data-testid="canvas-ground-material-texture" width={Math.max(1, width)} height={Math.max(1, height)} fill={`url(#${patternId})`} opacity={0.82} />}
    </svg>
  );
}
