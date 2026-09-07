import type { CampusGroundMaterial } from "./types";

interface CampusGroundPatternDefsProps {
  /** Optional suffix keeps preview pattern ids isolated from the editor SVG. */
  idSuffix?: string;
}

/**
 * Canonical material pattern definitions used by both the live campus canvas
 * and Canvas Settings preview.  Patterns use user-space units so resizing the
 * canvas changes the area covered, never the scale of the material itself.
 */
export function CampusGroundPatternDefs({ idSuffix = "" }: CampusGroundPatternDefsProps) {
  const id = (material: CampusGroundMaterial) => `campus-ground-${material}-pattern${idSuffix}`;
  return (
    <>
      <pattern id={id("grass")} width="32" height="32" patternUnits="userSpaceOnUse">
        <path d="M6 20l2-4m2 5 2-3m14-9 2-4m2 5 2-3" stroke="#4f7d53" strokeWidth="1" strokeLinecap="round" opacity="0.22" />
        <circle cx="17" cy="27" r="0.9" fill="#4f7d53" opacity="0.12" />
      </pattern>
      <pattern id={id("concrete")} width="72" height="64" patternUnits="userSpaceOnUse">
        <circle cx="9" cy="12" r="0.9" fill="#8f8b85" opacity="0.18" />
        <circle cx="44" cy="23" r="0.7" fill="#8f8b85" opacity="0.15" />
        <circle cx="61" cy="52" r="0.8" fill="#8f8b85" opacity="0.13" />
        <path d="M18 48l7-2m27-31 6 2" stroke="#aaa59d" strokeWidth="0.7" opacity="0.12" />
      </pattern>
      <pattern id={id("pavers")} width="64" height="40" patternUnits="userSpaceOnUse">
        <path d="M0 0H64M0 20H64" fill="none" stroke="#8f887d" strokeWidth="1" opacity="0.2" />
        <path d="M16 0V20M48 0V20M0 20V40M32 20V40" fill="none" stroke="#8f887d" strokeWidth="1" opacity="0.16" />
      </pattern>
      <pattern id={id("asphalt")} width="34" height="34" patternUnits="userSpaceOnUse">
        <circle cx="7" cy="9" r="0.8" fill="#e5e7eb" opacity="0.2" />
        <circle cx="24" cy="19" r="0.7" fill="#e5e7eb" opacity="0.16" />
        <circle cx="14" cy="29" r="0.6" fill="#e5e7eb" opacity="0.14" />
      </pattern>
      <pattern id={id("custom")} width="48" height="48" patternUnits="userSpaceOnUse">
        <circle cx="11" cy="16" r="0.7" fill="#64748b" opacity="0.1" />
        <circle cx="35" cy="31" r="0.6" fill="#64748b" opacity="0.08" />
      </pattern>
    </>
  );
}
