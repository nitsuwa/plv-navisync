import { useId } from "react";
import type { CampusGroundMaterial, CampusGroundTexture } from "./types";
import { CAMPUS_GROUND_DEFAULTS, campusGroundPatternId } from "../../lib/campusCanvas";

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
      <defs>
        {patternId && material === "grass" && <pattern id={patternId} width="32" height="32" patternUnits="userSpaceOnUse"><path d="M6 20l2-4m2 5 2-3m14-9 2-4m2 5 2-3" stroke="#4f7d53" strokeWidth="1" strokeLinecap="round" opacity="0.22" /><circle cx="17" cy="27" r="0.9" fill="#4f7d53" opacity="0.12" /></pattern>}
        {patternId && material === "concrete" && <pattern id={patternId} width="72" height="64" patternUnits="userSpaceOnUse"><path d="M0 32H72" fill="none" stroke="#b2aea7" strokeWidth="0.8" opacity="0.18" /><path d="M36 0V32M18 32V64" fill="none" stroke="#b2aea7" strokeWidth="0.8" opacity="0.12" /></pattern>}
        {patternId && material === "pavers" && <pattern id={patternId} width="64" height="40" patternUnits="userSpaceOnUse"><path d="M0 0H64M0 20H64" fill="none" stroke="#a59d91" strokeWidth="1" opacity="0.2" /><path d="M16 0V20M48 0V20M0 20V40M32 20V40" fill="none" stroke="#a59d91" strokeWidth="1" opacity="0.16" /></pattern>}
        {patternId && material === "asphalt" && <pattern id={patternId} width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="7" cy="9" r="0.8" fill="#d8dde0" opacity="0.16" /><circle cx="24" cy="19" r="0.7" fill="#d8dde0" opacity="0.13" /><circle cx="14" cy="29" r="0.6" fill="#d8dde0" opacity="0.12" /></pattern>}
        {patternId && material === "custom" && <pattern id={patternId} width="48" height="48" patternUnits="userSpaceOnUse"><circle cx="11" cy="16" r="0.7" fill="#64748b" opacity="0.1" /><circle cx="35" cy="31" r="0.6" fill="#64748b" opacity="0.08" /></pattern>}
      </defs>
      <rect width={Math.max(1, width)} height={Math.max(1, height)} fill={fill} />
      {patternId && <rect data-testid="canvas-ground-material-texture" width={Math.max(1, width)} height={Math.max(1, height)} fill={`url(#${patternId})`} opacity={0.82} />}
    </svg>
  );
}
