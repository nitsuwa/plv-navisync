import type { CampusBuilding, CampusDecorAsset, CampusPath } from "../components/map-builder/types";
import type { DecorAssetDescriptor } from "../components/map-builder/constants";
import { getRotatedAABB } from "../components/map-builder/constants";
import { decorWorldSize } from "./decorVisual";

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OutdoorSelectableBounds extends SelectionRect {
  id: string;
  kind: "building" | "decorAsset" | "path";
}

export interface SelectionBoundsOptions {
  includeHidden?: boolean;
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
  const width = asset.type === "ground-area" ? (asset.width ?? fallback.width) : fallback.width;
  const height = asset.type === "ground-area" ? (asset.height ?? fallback.height) : fallback.height;
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

export function outdoorGroupSelectionBounds(
  ids: string[],
  buildings: CampusBuilding[],
  decorAssets: CampusDecorAsset[],
  decorTemplates: Record<string, DecorAssetDescriptor>,
  pathsOrOptions: CampusPath[] | SelectionBoundsOptions = [],
  options: SelectionBoundsOptions = {}
): SelectionRect | null {
  const paths = Array.isArray(pathsOrOptions) ? pathsOrOptions : [];
  const opts = Array.isArray(pathsOrOptions) ? options : pathsOrOptions;
  if (ids.length < 2) return null;
  const selected = new Set(ids);
  const rects: SelectionRect[] = [];
  for (const building of buildings) {
    if (!selected.has(building.id)) continue;
    const bounds = buildingSelectionBounds(building, opts);
    if (bounds) rects.push(bounds);
  }
  for (const asset of decorAssets) {
    if (!selected.has(asset.id)) continue;
    const bounds = decorSelectionBounds(asset, decorTemplates[asset.type], opts);
    if (bounds) rects.push(bounds);
  }
  for (const path of paths) {
    if (!selected.has(path.id)) continue;
    const bounds = pathSelectionBounds(path, opts);
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
  options: SelectionBoundsOptions = {}
): string[] {
  const paths = Array.isArray(pathsOrOptions) ? pathsOrOptions : [];
  const opts = Array.isArray(pathsOrOptions) ? options : pathsOrOptions;
  const ids: string[] = [];
  for (const building of buildings) {
    const bounds = buildingSelectionBounds(building, opts);
    if (bounds && rectsIntersect(rect, bounds)) ids.push(building.id);
  }
  for (const asset of decorAssets) {
    const bounds = decorSelectionBounds(asset, decorTemplates[asset.type], opts);
    if (bounds && rectsIntersect(rect, bounds)) ids.push(asset.id);
  }
  for (const path of paths) {
    const bounds = pathSelectionBounds(path, opts);
    if (bounds && rectsIntersect(rect, bounds)) ids.push(path.id);
  }
  return ids;
}
