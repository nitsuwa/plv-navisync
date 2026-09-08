import type { CampusBuilding, CampusDecorAsset, CampusMarker, CampusPath } from "../components/map-builder/types";
import type { DecorAssetDescriptor } from "../components/map-builder/constants";
import { getRotatedAABB } from "../components/map-builder/constants";
import { decorWorldSize } from "./decorVisual";
import { campusGateSize, isCampusGate } from "./campusGates";
import { isDecorAreaType } from "../components/map-builder/constants";

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OutdoorSelectableBounds extends SelectionRect {
  id: string;
  kind: "building" | "decorAsset" | "path" | "marker";
}

export interface SelectionBoundsOptions {
  includeHidden?: boolean;
}

export interface TransformControlMetrics {
  /** Visible grip size in world units (screen-size is zoom independent). */
  handleSize: number;
  /** Transparent pointer target size in world units. */
  hitSize: number;
  /** Radius of the visible circular rotation grip in world units. */
  rotationRadius: number;
  /** Distance from the object's top edge to the rotation grip in world units. */
  rotationOffset: number;
  /** Selection-stroke width in world units. */
  strokeWidth: number;
}

/**
 * Resolve transform-control dimensions from the visible object's screen size.
 * The SVG canvas is zoom-scaled, so world-unit constants make tiny assets
 * acquire enormous grips at high zoom (and microscopic grips when zoomed out).
 * Keep the visible controls in a compact screen-pixel clamp while retaining a
 * modestly larger, independent pointer target for accessibility.
 */
export function transformControlMetrics(width: number, height: number, zoom: number): TransformControlMetrics {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const visibleSpanPx = Math.max(0, Math.min(Math.abs(width), Math.abs(height))) * safeZoom;
  const visibleSizePx = Math.max(4.5, Math.min(7, 4.5 + visibleSpanPx / 60));
  const hitSizePx = Math.max(9, Math.min(13, visibleSizePx + 4));
  const rotationOffsetPx = Math.max(10, Math.min(18, 10 + visibleSpanPx / 40));
  return {
    handleSize: visibleSizePx / safeZoom,
    hitSize: hitSizePx / safeZoom,
    rotationRadius: visibleSizePx / (2 * safeZoom),
    rotationOffset: rotationOffsetPx / safeZoom,
    strokeWidth: Math.max(0.55, Math.min(2.4, 1.35 / safeZoom)),
  };
}

export function selectionRectFromPoints(sx: number, sy: number, cx: number, cy: number): SelectionRect {
  return {
    x: Math.min(sx, cx),
    y: Math.min(sy, cy),
    width: Math.abs(cx - sx),
    height: Math.abs(cy - sy),
  };
}

export function rectsIntersect(a: SelectionRect, b: SelectionRect): boolean {
  return a.x <= b.x + b.width
    && a.x + a.width >= b.x
    && a.y <= b.y + b.height
    && a.y + a.height >= b.y;
}

export function buildingSelectionBounds(
  building: CampusBuilding,
  options: SelectionBoundsOptions = {}
): OutdoorSelectableBounds | null {
  if (building.visible === false && !options.includeHidden) return null;
  const box = getRotatedAABB(
    building.x,
    building.y,
    building.width,
    building.height,
    building.rotation ?? 0
  );
  return { id: building.id, kind: "building", x: box.x, y: box.y, width: box.width, height: box.height };
}

export function decorSelectionBounds(
  asset: CampusDecorAsset,
  template: Pick<DecorAssetDescriptor, "defaultWidth" | "defaultHeight"> | undefined,
  options: SelectionBoundsOptions = {}
): OutdoorSelectableBounds | null {
  if ((asset.visible === false && !options.includeHidden) || !template) return null;
  const fallback = decorWorldSize(template, asset.scale);
  const width = isDecorAreaType(asset.type) ? (asset.width ?? fallback.width) : fallback.width;
  const height = isDecorAreaType(asset.type) ? (asset.height ?? fallback.height) : fallback.height;
  const box = getRotatedAABB(
    asset.x - width / 2,
    asset.y - height / 2,
    width,
    height,
    asset.rotation ?? 0
  );
  return { id: asset.id, kind: "decorAsset", x: box.x, y: box.y, width: box.width, height: box.height };
}

export function pathSelectionBounds(
  path: CampusPath,
  options: SelectionBoundsOptions = {}
): OutdoorSelectableBounds | null {
  if ((path.visible === false && !options.includeHidden) || path.points.length === 0) return null;
  const halfWidth = Math.max(3, path.width ?? 6) / 2;
  const minX = Math.min(...path.points.map((point) => point.x)) - halfWidth;
  const minY = Math.min(...path.points.map((point) => point.y)) - halfWidth;
  const maxX = Math.max(...path.points.map((point) => point.x)) + halfWidth;
  const maxY = Math.max(...path.points.map((point) => point.y)) + halfWidth;
  return { id: path.id, kind: "path", x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Physical bounds for functional outdoor markers. Only Campus Gates are
 * currently group/box-selectable; generated navigation anchors remain graph
 * infrastructure and are intentionally not included here. */
export function markerSelectionBounds(
  marker: CampusMarker,
  options: SelectionBoundsOptions = {},
): OutdoorSelectableBounds | null {
  if (!isCampusGate(marker) || (marker as CampusMarker & { visible?: boolean }).visible === false && !options.includeHidden) return null;
  const size = campusGateSize(marker);
  return { id: marker.id, kind: "marker", x: marker.x - size.width / 2, y: marker.y - size.height / 2, width: size.width, height: size.height };
}

export function outdoorGroupSelectionBounds(
  ids: string[],
  buildings: CampusBuilding[],
  decorAssets: CampusDecorAsset[],
  decorTemplates: Record<string, DecorAssetDescriptor>,
  pathsOrOptions: CampusPath[] | SelectionBoundsOptions = [],
  options: SelectionBoundsOptions = {},
  markers: CampusMarker[] = [],
): SelectionRect | null {
  const paths = Array.isArray(pathsOrOptions) ? pathsOrOptions : [];
  const opts = Array.isArray(pathsOrOptions) ? options : pathsOrOptions;
  if (ids.length < 2) return null;
  const selected = new Set(ids);
  // Pathways can move rigidly with a physical selection.  Their dedicated
  // point/scale semantics remain separate from generic resize; including their
  // visible bounds here keeps the mixed-selection frame honest and makes group
  // alignment use the complete selected geometry.
  const rects: SelectionRect[] = [];
  for (const building of buildings) {
    if (!selected.has(building.id) || building.locked) continue;
    const bounds = buildingSelectionBounds(building, opts);
    if (bounds) rects.push(bounds);
  }
  for (const asset of decorAssets) {
    if (!selected.has(asset.id) || asset.locked) continue;
    const bounds = decorSelectionBounds(asset, decorTemplates[asset.type], opts);
    if (bounds) rects.push(bounds);
  }
  for (const path of paths) {
    if (!selected.has(path.id) || path.locked) continue;
    const bounds = pathSelectionBounds(path, opts);
    if (bounds) rects.push(bounds);
  }
  for (const marker of markers) {
    if (!selected.has(marker.id)) continue;
    const bounds = markerSelectionBounds(marker, opts);
    if (bounds) rects.push(bounds);
  }
  if (rects.length < 2) return null;
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function outdoorSelectionIdsInRect(
  rect: SelectionRect,
  buildings: CampusBuilding[],
  decorAssets: CampusDecorAsset[],
  decorTemplates: Record<string, DecorAssetDescriptor>,
  pathsOrOptions: CampusPath[] | SelectionBoundsOptions = [],
  options: SelectionBoundsOptions = {},
  markers: CampusMarker[] = [],
): string[] {
  const paths = Array.isArray(pathsOrOptions) ? pathsOrOptions : [];
  const opts = Array.isArray(pathsOrOptions) ? options : pathsOrOptions;
  const ids: string[] = [];
  for (const building of buildings) {
    if (building.locked) continue;
    const bounds = buildingSelectionBounds(building, opts);
    if (bounds && rectsIntersect(rect, bounds)) ids.push(building.id);
  }
  for (const asset of decorAssets) {
    if (asset.locked) continue;
    const bounds = decorSelectionBounds(asset, decorTemplates[asset.type], opts);
    if (bounds && rectsIntersect(rect, bounds)) ids.push(asset.id);
  }
  for (const path of paths) {
    if (path.locked) continue;
    const bounds = pathSelectionBounds(path, opts);
    if (bounds && rectsIntersect(rect, bounds)) ids.push(path.id);
  }
  for (const marker of markers) {
    const bounds = markerSelectionBounds(marker, opts);
    if (bounds && rectsIntersect(rect, bounds)) ids.push(marker.id);
  }
  return ids;
}
