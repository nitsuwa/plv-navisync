import type { Campus, CampusGroundMaterial, CampusGroundTexture } from "../components/map-builder/types";
import { DECOR_ASSET_MAP, isDecorAreaType } from "../components/map-builder/constants";
import { decorWorldSize } from "./decorVisual";

export const CAMPUS_GROUND_DEFAULTS: Record<CampusGroundMaterial, string> = {
  neutral: "#f3f1ec",
  grass: "#bfd4b8",
  concrete: "#d8d5ce",
  pavers: "#c9c2b5",
  asphalt: "#858c91",
  custom: "#f3f1ec",
};

/** Small inner frame reserved for ordinary physical authored objects.  Gate
 * markers and generated navigation infrastructure intentionally opt out. */
export const CAMPUS_OBJECT_SAFE_INSET = 12;

export function campusObjectSafeBounds(
  canvasW: number,
  canvasH: number,
  inset = CAMPUS_OBJECT_SAFE_INSET,
) {
  const safeInset = Math.max(0, Math.min(Math.min(canvasW, canvasH) / 2, inset));
  return {
    minX: safeInset,
    minY: safeInset,
    maxX: Math.max(safeInset, canvasW - safeInset),
    maxY: Math.max(safeInset, canvasH - safeInset),
  };
}

export const CAMPUS_GROUND_MATERIALS: ReadonlyArray<{ value: CampusGroundMaterial; label: string }> = [
  { value: "neutral", label: "Neutral" },
  { value: "grass", label: "Grass" },
  { value: "concrete", label: "Concrete" },
  { value: "pavers", label: "Pavers" },
  { value: "asphalt", label: "Asphalt" },
  { value: "custom", label: "Custom" },
];

export function normalizeCampusGroundMaterial(value: unknown): CampusGroundMaterial {
  return CAMPUS_GROUND_MATERIALS.some((item) => item.value === value)
    ? value as CampusGroundMaterial
    : "neutral";
}

export function normalizeCampusGroundTexture(value: unknown): CampusGroundTexture {
  return value === "none" ? "none" : "subtle";
}

/** Resolve presentation values without changing legacy canvas/background fields. */
export function campusGroundAppearance(campus: Pick<Campus, "canvasGroundMaterial" | "canvasGroundColor" | "canvasGroundTexture" | "canvasColor" | "backgroundColor">) {
  const hasExplicitMaterial = campus.canvasGroundMaterial !== undefined;
  const material = normalizeCampusGroundMaterial(campus.canvasGroundMaterial);
  const color = campus.canvasGroundColor || campus.canvasColor || ((!hasExplicitMaterial || material === "custom") ? campus.backgroundColor : undefined) || CAMPUS_GROUND_DEFAULTS[material];
  return { material, color, texture: normalizeCampusGroundTexture(campus.canvasGroundTexture) };
}

export function campusGroundPatternId(material: CampusGroundMaterial, texture: CampusGroundTexture): string | undefined {
  if (texture === "none" || material === "neutral") return undefined;
  return `campus-ground-${material}-pattern`;
}

export interface CampusContentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/** Axis-aligned bounds for a rectangle whose authored position is its center.
 * Outdoor decor and areas use center coordinates, while buildings use a
 * top-left origin (handled by the caller). Keeping this calculation here
 * makes canvas resize validation agree with what the canvas actually draws. */
export function centeredRotatedBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation = 0,
) {
  const radians = rotation * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const boundWidth = Math.abs(width) * cos + Math.abs(height) * sin;
  const boundHeight = Math.abs(width) * sin + Math.abs(height) * cos;
  return {
    minX: x - boundWidth / 2,
    minY: y - boundHeight / 2,
    maxX: x + boundWidth / 2,
    maxY: y + boundHeight / 2,
  };
}

export type CanvasResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** Compute a snapped canvas size while keeping the campus origin fixed. */
export function resizeCampusCanvasFromHandle(
  start: { width: number; height: number },
  handle: CanvasResizeHandle,
  delta: { x: number; y: number },
  gridSize = 20,
): { width: number; height: number } {
  const grid = Math.max(1, Number.isFinite(gridSize) ? gridSize : 20);
  const snap = (value: number) => Math.max(100, Math.min(5000, Math.round(value / grid) * grid));
  const widthDelta = handle.includes("e") ? delta.x : handle.includes("w") ? -delta.x : 0;
  const heightDelta = handle.includes("s") ? delta.y : handle.includes("n") ? -delta.y : 0;
  return { width: snap(start.width + widthDelta), height: snap(start.height + heightDelta) };
}

/** Compute the visible authored outdoor extent without mutating the campus. */
export function campusContentBounds(campus: Pick<Campus, "canvasW" | "canvasH" | "buildings" | "markers" | "paths" | "navNodes" | "decorAssets" | "gridSize">): CampusContentBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = 0;
  let maxY = 0;
  const include = (x: number, y: number, width = 0, height = 0) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + Math.max(0, width));
    maxY = Math.max(maxY, y + Math.max(0, height));
  };
  const includeBounds = (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
    if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) return;
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  };
  for (const building of campus.buildings ?? []) {
    includeBounds(centeredRotatedBounds(
      building.x + building.width / 2,
      building.y + building.height / 2,
      building.width,
      building.height,
      building.rotation ?? 0,
    ));
  }
  for (const marker of campus.markers ?? []) {
    // Campus Gates intentionally remain valid on the perimeter. Their
    // navigation anchor, rather than the decorative frame around it, is the
    // semantic canvas extent used by resize validation.
    if (marker.type === "gate" || marker.purpose) {
      include(marker.x, marker.y);
    } else {
      includeBounds(centeredRotatedBounds(marker.x, marker.y, marker.width ?? 24, marker.height ?? 24));
    }
  }
  for (const path of campus.paths ?? []) {
    const halfWidth = Math.max(0, Number(path.width) || 0) / 2;
    for (const point of path.points ?? []) include(point.x - halfWidth, point.y - halfWidth, halfWidth * 2, halfWidth * 2);
  }
  for (const node of campus.navNodes ?? []) include(node.x, node.y);
  for (const asset of campus.decorAssets ?? []) {
    if (asset.visible === false) continue;
    // Grid-painted Campus Surface assets store compact cell indices rather
    // than a heavyweight rectangle.  Their legacy x/y fields are only a
    // compatibility anchor (normally 0,0), so derive the authored extent
    // from the actual cells for Fit to Content and bounds validation.
    if (asset.surfaceCells?.length) {
      const size = Math.max(1, asset.surfaceCellSize ?? campus.gridSize ?? 20);
      for (const cell of asset.surfaceCells) {
        include(cell.x * size, cell.y * size, size, size);
      }
      continue;
    }
    const template = DECOR_ASSET_MAP[asset.type];
    const size = isDecorAreaType(asset.type)
      ? { width: asset.width ?? template?.defaultWidth ?? 0, height: asset.height ?? template?.defaultHeight ?? 0 }
      : template
        ? decorWorldSize(template, asset.scale)
        : { width: asset.width ?? 0, height: asset.height ?? 0 };
    includeBounds(centeredRotatedBounds(asset.x, asset.y, size.width, size.height, asset.rotation ?? 0));
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: campus.canvasW, maxY: campus.canvasH, width: campus.canvasW, height: campus.canvasH };
  return { minX, minY, maxX, maxY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

/** Return dimensions that contain all visible authored content with margin.
 * Existing objects are never moved; the caller only applies the dimensions. */
export function fitCampusCanvas(campus: Pick<Campus, "canvasW" | "canvasH" | "buildings" | "markers" | "paths" | "navNodes" | "decorAssets" | "gridSize">, margin = 80): { width: number; height: number; bounds: CampusContentBounds } {
  const bounds = campusContentBounds(campus);
  const safeMargin = Math.max(0, Number.isFinite(margin) ? margin : 80);
  const hasVisibleContent = (campus.buildings?.length ?? 0) > 0
    || (campus.markers?.length ?? 0) > 0
    || (campus.paths ?? []).some((path) => (path.points?.length ?? 0) > 0)
    || (campus.navNodes?.length ?? 0) > 0
    || (campus.decorAssets ?? []).some((asset) => asset.visible !== false && (asset.surfaceCells?.length ?? 1) > 0);
  if (!hasVisibleContent) return { width: campus.canvasW, height: campus.canvasH, bounds };
  return {
    width: Math.max(100, Math.min(5000, Math.ceil(Math.max(campus.canvasW, bounds.maxX + safeMargin, bounds.width + safeMargin * 2)))),
    height: Math.max(100, Math.min(5000, Math.ceil(Math.max(campus.canvasH, bounds.maxY + safeMargin, bounds.height + safeMargin * 2)))),
    bounds,
  };
}
