import type { CampusBuilding, CampusDecorAsset } from "../components/map-builder/types";
import type { DecorAssetDescriptor } from "../components/map-builder/constants";
import { buildingSelectionBounds, decorSelectionBounds, type OutdoorSelectableBounds } from "./campusSelection";

export type OutdoorArrangementAction =
  | "align-left"
  | "align-center-h"
  | "align-right"
  | "align-top"
  | "align-center-v"
  | "align-bottom"
  | "distribute-h"
  | "distribute-v";

export interface ArrangementResult {
  changed: boolean;
  buildings: CampusBuilding[];
  decorAssets: CampusDecorAsset[];
}

interface ArrangementMember {
  id: string;
  kind: "building" | "decorAsset";
  bounds: OutdoorSelectableBounds;
  locked: boolean;
}

function selectedMembers(
  buildings: CampusBuilding[],
  decorAssets: CampusDecorAsset[],
  selectedIds: Set<string>,
  decorTemplates: Record<string, DecorAssetDescriptor>
): ArrangementMember[] {
  const members: ArrangementMember[] = [];
  for (const building of buildings) {
    if (!selectedIds.has(building.id)) continue;
    const bounds = buildingSelectionBounds(building, { includeHidden: true });
    if (bounds) members.push({ id: building.id, kind: "building", bounds, locked: building.locked ?? false });
  }
  for (const asset of decorAssets) {
    if (!selectedIds.has(asset.id)) continue;
    const bounds = decorSelectionBounds(asset, decorTemplates[asset.type], { includeHidden: true });
    if (bounds) members.push({ id: asset.id, kind: "decorAsset", bounds, locked: false });
  }
  return members;
}

function groupBounds(members: ArrangementMember[]) {
  const left = Math.min(...members.map((m) => m.bounds.x));
  const top = Math.min(...members.map((m) => m.bounds.y));
  const right = Math.max(...members.map((m) => m.bounds.x + m.bounds.width));
  const bottom = Math.max(...members.map((m) => m.bounds.y + m.bounds.height));
  return { left, top, right, bottom, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}

function deltaForAlign(action: OutdoorArrangementAction, member: ArrangementMember, group: ReturnType<typeof groupBounds>) {
  switch (action) {
    case "align-left":
      return { dx: group.left - member.bounds.x, dy: 0 };
    case "align-center-h":
      return { dx: group.centerX - (member.bounds.x + member.bounds.width / 2), dy: 0 };
    case "align-right":
      return { dx: group.right - (member.bounds.x + member.bounds.width), dy: 0 };
    case "align-top":
      return { dx: 0, dy: group.top - member.bounds.y };
    case "align-center-v":
      return { dx: 0, dy: group.centerY - (member.bounds.y + member.bounds.height / 2) };
    case "align-bottom":
      return { dx: 0, dy: group.bottom - (member.bounds.y + member.bounds.height) };
    default:
      return { dx: 0, dy: 0 };
  }
}

function distributionDeltas(axis: "h" | "v", members: ArrangementMember[]) {
  const sorted = [...members].sort((a, b) => {
    const aStart = axis === "h" ? a.bounds.x : a.bounds.y;
    const bStart = axis === "h" ? b.bounds.x : b.bounds.y;
    return aStart - bStart;
  });
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const start = axis === "h" ? first.bounds.x : first.bounds.y;
  const end = axis === "h" ? last.bounds.x + last.bounds.width : last.bounds.y + last.bounds.height;
  const totalSize = sorted.reduce((sum, member) => sum + (axis === "h" ? member.bounds.width : member.bounds.height), 0);
  const gap = (end - start - totalSize) / (sorted.length - 1);
  let cursor = start;
  const deltas = new Map<string, { dx: number; dy: number }>();

  for (const member of sorted) {
    const currentStart = axis === "h" ? member.bounds.x : member.bounds.y;
    const delta = cursor - currentStart;
    deltas.set(member.id, axis === "h" ? { dx: delta, dy: 0 } : { dx: 0, dy: delta });
    cursor += (axis === "h" ? member.bounds.width : member.bounds.height) + gap;
  }

  return deltas;
}

export function selectedOutdoorCount(
  buildings: CampusBuilding[],
  decorAssets: CampusDecorAsset[],
  selectedIds: Iterable<string>,
  decorTemplates: Record<string, DecorAssetDescriptor>
): number {
  return selectedMembers(buildings, decorAssets, new Set(selectedIds), decorTemplates).length;
}

export function arrangeSelectedOutdoorObjects(
  buildings: CampusBuilding[],
  decorAssets: CampusDecorAsset[],
  selectedIds: Iterable<string>,
  action: OutdoorArrangementAction,
  decorTemplates: Record<string, DecorAssetDescriptor>
): ArrangementResult {
  const selected = new Set(selectedIds);
  const allMembers = selectedMembers(buildings, decorAssets, selected, decorTemplates);
  const movableMembers = allMembers.filter((member) => !member.locked);
  const minCount = action === "distribute-h" || action === "distribute-v" ? 3 : 2;
  if (movableMembers.length < minCount) return { changed: false, buildings, decorAssets };

  const group = groupBounds(movableMembers);
  const deltas = action === "distribute-h"
    ? distributionDeltas("h", movableMembers)
    : action === "distribute-v"
      ? distributionDeltas("v", movableMembers)
      : new Map(movableMembers.map((member) => [member.id, deltaForAlign(action, member, group)]));

  let changed = false;
  const moveBy = (id: string) => deltas.get(id) ?? { dx: 0, dy: 0 };
  const nextBuildings = buildings.map((building) => {
    const delta = moveBy(building.id);
    if (delta.dx === 0 && delta.dy === 0) return building;
    changed = true;
    return { ...building, x: Math.round(building.x + delta.dx), y: Math.round(building.y + delta.dy) };
  });
  const nextDecorAssets = decorAssets.map((asset) => {
    const delta = moveBy(asset.id);
    if (delta.dx === 0 && delta.dy === 0) return asset;
    changed = true;
    return { ...asset, x: Math.round(asset.x + delta.dx), y: Math.round(asset.y + delta.dy) };
  });

  return changed
    ? { changed: true, buildings: nextBuildings, decorAssets: nextDecorAssets }
    : { changed: false, buildings, decorAssets };
}
