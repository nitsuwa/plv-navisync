import type { CampusBuilding, CampusDecorAsset } from "../components/map-builder/types";
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
  kind: "building" | "decorAsset";
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
  const { width, height } = decorWorldSize(template, asset.scale);
  const box = getRotatedAABB(
    asset.x - width / 2,
    asset.y - height / 2,
    width,
    height,
    asset.rotation ?? 0
  );
  return { id: asset.id, kind: "decorAsset", x: box.x, y: box.y, width: box.width, height: box.height };
}

export function outdoorSelectionIdsInRect(
  rect: SelectionRect,
  buildings: CampusBuilding[],
  decorAssets: CampusDecorAsset[],
  decorTemplates: Record<string, DecorAssetDescriptor>,
  options: SelectionBoundsOptions = {}
): string[] {
  const ids: string[] = [];
  for (const building of buildings) {
    const bounds = buildingSelectionBounds(building, options);
    if (bounds && rectsIntersect(rect, bounds)) ids.push(building.id);
  }
  for (const asset of decorAssets) {
    const bounds = decorSelectionBounds(asset, decorTemplates[asset.type], options);
    if (bounds && rectsIntersect(rect, bounds)) ids.push(asset.id);
  }
  return ids;
}
