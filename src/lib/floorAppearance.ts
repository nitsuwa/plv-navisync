import type { FloorAppearance, FloorMaterial, FloorTexture } from "../components/map-builder/types";

export const FLOOR_MATERIAL_OPTIONS: ReadonlyArray<{ value: FloorMaterial; label: string }> = [
  { value: "neutral", label: "Neutral" },
  { value: "ceramic_tile", label: "Ceramic Tile" },
  { value: "terrazzo", label: "Terrazzo" },
  { value: "concrete", label: "Concrete" },
  { value: "vinyl", label: "Vinyl" },
  { value: "wood", label: "Wood" },
  { value: "custom", label: "Custom" },
];

export const FLOOR_TEXTURE_OPTIONS: ReadonlyArray<{ value: FloorTexture; label: string }> = [
  { value: "none", label: "None" },
  { value: "subtle", label: "Subtle" },
];

/** Material-appropriate starting tints. These are intentionally restrained so
 * structure and authored objects remain legible on top of the surface. */
export const FLOOR_MATERIAL_DEFAULT_COLORS: Readonly<Record<FloorMaterial, string>> = {
  neutral: "#e8e1d7",
  ceramic_tile: "#e5e7eb",
  terrazzo: "#eeeae2",
  concrete: "#c7c9c7",
  vinyl: "#d7d3c8",
  wood: "#c99a6b",
  custom: "#e8e1d7",
};

export const DEFAULT_FLOOR_APPEARANCE: FloorAppearance = {
  material: "neutral",
  texture: "subtle",
  color: FLOOR_MATERIAL_DEFAULT_COLORS.neutral,
};

const MATERIALS = new Set<FloorMaterial>(FLOOR_MATERIAL_OPTIONS.map((item) => item.value));
const TEXTURES = new Set<FloorTexture>(FLOOR_TEXTURE_OPTIONS.map((item) => item.value));

export function defaultFloorColorForMaterial(material: FloorMaterial): string {
  return FLOOR_MATERIAL_DEFAULT_COLORS[material] ?? FLOOR_MATERIAL_DEFAULT_COLORS.neutral;
}

/** The authoring grid is intentionally reserved for a quiet drafting surface.
 * Grid snapping remains an independent editor preference. */
export function isFloorAuthoringGridEligible(material: FloorMaterial, texture: FloorTexture): boolean {
  return material === "neutral" && texture === "none";
}

/** Resolve persisted/legacy floor metadata without mutating the source. */
export function normalizeFloorAppearance(
  value: Partial<FloorAppearance> | null | undefined,
  legacyColor = DEFAULT_FLOOR_APPEARANCE.color,
): FloorAppearance {
  const material = MATERIALS.has(value?.material as FloorMaterial)
    ? value!.material as FloorMaterial
    : DEFAULT_FLOOR_APPEARANCE.material;
  const texture = TEXTURES.has(value?.texture as FloorTexture)
    ? value!.texture as FloorTexture
    : DEFAULT_FLOOR_APPEARANCE.texture;
  const color = typeof value?.color === "string" && value.color.trim().length > 0
    ? value.color
    // A partially persisted appearance is still an authored material choice,
    // so use that material's sensible tint. Only truly legacy floors (with no
    // appearance object at all) inherit their historical background color.
    : value != null
      ? defaultFloorColorForMaterial(material)
      : (typeof legacyColor === "string" && legacyColor.trim().length > 0 ? legacyColor : DEFAULT_FLOOR_APPEARANCE.color);
  return { material, texture, color };
}

export type FloorPatternKind = "neutral" | "tile" | "terrazzo" | "concrete" | "vinyl" | "wood";

export interface FloorPatternSpec {
  kind: FloorPatternKind;
  size: number;
  /** Relative opacity for the light/dark pattern strokes. */
  opacity: number;
}

/** Canonical material → pattern mapping used by both editor and read-only SVGs. */
export function floorPatternSpec(material: FloorMaterial, texture: FloorTexture): FloorPatternSpec | null {
  if (texture === "none") return null;
  switch (material) {
    // The authoring grid is the primary alignment aid. Keep material cues
    // visible but quiet enough that the two systems never visually compete.
    // Keep joints on a different cadence from the default 20-unit authoring
    // grid so the two layers read as separate systems instead of a dark
    // doubled grid.
    case "ceramic_tile": return { kind: "tile", size: 48, opacity: 0.12 };
    case "terrazzo": return { kind: "terrazzo", size: 36, opacity: 0.11 };
    case "concrete": return { kind: "concrete", size: 30, opacity: 0.095 };
    case "vinyl": return { kind: "vinyl", size: 52, opacity: 0.105 };
    case "wood": return { kind: "wood", size: 56, opacity: 0.125 };
    case "neutral":
    case "custom":
    default: return { kind: "neutral", size: 44, opacity: 0.06 };
  }
}

/** Stable, SVG-safe identifier for a floor surface pattern. */
export function floorPatternId(prefix: string, appearance: FloorAppearance): string {
  const safePrefix = prefix.replace(/[^A-Za-z0-9_-]/g, "-");
  return `${safePrefix || "floor"}-pattern-${appearance.material}`;
}
