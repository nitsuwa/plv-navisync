import type { FloorFurniture } from "../components/map-builder/types";
import { rotatedRectBounds } from "./floorGeometry";
import { reorderFloorLayerItems, type FloorLayerAction } from "./floorRenderLayers";

export type FurnitureAlignment = "left" | "center-x" | "right" | "top" | "center-y" | "bottom";
export type FurnitureDistributionAxis = "horizontal" | "vertical";
export type FurnitureLayerAction = FloorLayerAction;

export interface FurnitureBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EqualSpacingCandidate {
  axis: FurnitureDistributionAxis;
  delta: number;
  gap: number;
  position: number;
  referenceIds: [string, string];
}

export const FURNITURE_DUPLICATE_OFFSET = 16;

export interface FurnitureDuplicateOffset {
  dx: number;
  dy: number;
}

/** Visible, rotation-aware bounds used by all furniture-only editor commands. */
export function furnitureVisibleBounds(item: Pick<FloorFurniture, "x" | "y" | "width" | "height" | "rotation">): FurnitureBounds {
  const bounds = rotatedRectBounds(item.x, item.y, item.width, item.height, item.rotation ?? 0);
  return { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h };
}

export function furnitureSelectionBounds(items: FloorFurniture[]): FurnitureBounds | null {
  if (items.length === 0) return null;
  const bounds = items.map(furnitureVisibleBounds);
  const x = Math.min(...bounds.map((b) => b.x));
  const y = Math.min(...bounds.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...bounds.map((b) => b.x + b.w)) - x,
    h: Math.max(...bounds.map((b) => b.y + b.h)) - y,
  };
}

/** Translate furniture so the requested visible edge/center matches the target. */
export function alignFurnitureItems(items: FloorFurniture[], alignment: FurnitureAlignment, target?: number): FloorFurniture[] {
  if (items.length < 2) return items;
  const bounds = items.map(furnitureVisibleBounds);
  const values = bounds.map((b) => alignment === "left" ? b.x : alignment === "center-x" ? b.x + b.w / 2 : alignment === "right" ? b.x + b.w : alignment === "top" ? b.y : alignment === "center-y" ? b.y + b.h / 2 : b.y + b.h);
  const resolvedTarget = target ?? (alignment === "left" || alignment === "center-x" || alignment === "right"
    ? (alignment === "left" ? Math.min(...values) : alignment === "right" ? Math.max(...values) : (Math.min(...values) + Math.max(...values)) / 2)
    : (alignment === "top" ? Math.min(...values) : alignment === "bottom" ? Math.max(...values) : (Math.min(...values) + Math.max(...values)) / 2));
  return items.map((item, index) => {
    const current = values[index];
    const delta = resolvedTarget - current;
    // Only move the relevant axis; retaining the original orthogonal coordinate
    // is important for rigid furniture authoring and undo identity.
    return {
      ...items[index],
      x: alignment === "left" || alignment === "center-x" || alignment === "right" ? items[index].x + delta : items[index].x,
      y: alignment === "top" || alignment === "center-y" || alignment === "bottom" ? items[index].y + delta : items[index].y,
    };
  });
}

/** Distribute by visible bounds while preserving the outermost items and sizes. */
export function distributeFurnitureItems(items: FloorFurniture[], axis: FurnitureDistributionAxis): FloorFurniture[] {
  if (items.length < 3) return items;
  const entries = items.map((item) => ({ item, bounds: furnitureVisibleBounds(item) })).sort((a, b) => axis === "horizontal" ? a.bounds.x - b.bounds.x : a.bounds.y - b.bounds.y);
  const first = entries[0].bounds;
  const last = entries[entries.length - 1].bounds;
  const span = axis === "horizontal" ? last.x + last.w - first.x : last.y + last.h - first.y;
  const occupied = entries.reduce((sum, entry) => sum + (axis === "horizontal" ? entry.bounds.w : entry.bounds.h), 0);
  const gap = (span - occupied) / Math.max(1, entries.length - 1);
  let cursor = axis === "horizontal" ? first.x : first.y;
  return entries.map((entry, index) => {
    const b = entry.bounds;
    const target = index === 0 ? (axis === "horizontal" ? b.x : b.y) : index === entries.length - 1
      ? (axis === "horizontal" ? b.x : b.y)
      : cursor;
    const delta = target - (axis === "horizontal" ? b.x : b.y);
    if (index < entries.length - 1) cursor = target + (axis === "horizontal" ? b.w : b.h) + gap;
    return {
      ...entry.item,
      x: axis === "horizontal" ? entry.item.x + delta : entry.item.x,
      y: axis === "vertical" ? entry.item.y + delta : entry.item.y,
    };
  });
}

/** Find the nearest equal-gap landing for a moving item; no proximity merge. */
export function findEqualSpacingCandidate(
  moving: FloorFurniture,
  refs: FloorFurniture[],
  axis: FurnitureDistributionAxis,
  threshold = 8,
): EqualSpacingCandidate | null {
  if (refs.length < 2) return null;
  const source = furnitureVisibleBounds(moving);
  const ordered = refs.map((item) => ({ item, bounds: furnitureVisibleBounds(item) })).sort((a, b) => axis === "horizontal" ? a.bounds.x - b.bounds.x : a.bounds.y - b.bounds.y);
  let best: EqualSpacingCandidate | null = null;
  const start = axis === "horizontal" ? source.x : source.y;
  const size = axis === "horizontal" ? source.w : source.h;
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const a = ordered[i];
    const b = ordered[i + 1];
    const aStart = axis === "horizontal" ? a.bounds.x : a.bounds.y;
    const aEnd = axis === "horizontal" ? a.bounds.x + a.bounds.w : a.bounds.y + a.bounds.h;
    const bStart = axis === "horizontal" ? b.bounds.x : b.bounds.y;
    const bEnd = axis === "horizontal" ? b.bounds.x + b.bounds.w : b.bounds.y + b.bounds.h;
    const gap = Math.max(0, bStart - aEnd);
    const candidates = [bEnd + gap, aStart - gap - size];
    for (const position of candidates) {
      const delta = position - start;
      if (Math.abs(delta) > threshold) continue;
      if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { axis, delta, gap, position, referenceIds: [a.item.id, b.item.id] };
    }
  }
  return best;
}

export function furnitureGroupId(items: FloorFurniture[]): string | null {
  const ids = Array.from(new Set(items.map((item) => item.groupId).filter((value): value is string => Boolean(value))));
  return ids.length === 1 && items.every((item) => item.groupId === ids[0]) ? ids[0] : null;
}

/**
 * Pick a nearby canvas-unit offset for a Furniture duplicate. Candidate order
 * is deliberate and stable so repeated Ctrl+D never depends on randomness,
 * screen zoom, or a Floor-wide empty-space search.
 */
export function findNearbyDuplicatePosition(
  sourceItems: readonly FloorFurniture[],
  existingItems: readonly FloorFurniture[],
  canvasW: number,
  canvasH: number,
  canPlace?: (candidate: FloorFurniture, source: FloorFurniture) => boolean,
): FurnitureDuplicateOffset | null {
  if (sourceItems.length === 0) return null;
  const offset = FURNITURE_DUPLICATE_OFFSET;
  const candidates: FurnitureDuplicateOffset[] = [
    { dx: offset, dy: offset },
    { dx: offset, dy: -offset },
    { dx: -offset, dy: offset },
    { dx: -offset, dy: -offset },
    { dx: offset, dy: 0 },
    { dx: 0, dy: offset },
    { dx: -offset, dy: 0 },
    { dx: 0, dy: -offset },
  ];
  const sourceIds = new Set(sourceItems.map((item) => item.id));
  const occupied = existingItems.filter((item) => !sourceIds.has(item.id) && item.visible !== false);
  const overlaps = (a: FurnitureBounds, b: FurnitureBounds) =>
    a.x < b.x + b.w - 0.01 && a.x + a.w > b.x + 0.01
      && a.y < b.y + b.h - 0.01 && a.y + a.h > b.y + 0.01;

  return candidates.find(({ dx, dy }) => sourceItems.every((source) => {
    const candidate = { ...source, x: source.x + dx, y: source.y + dy };
    const bounds = furnitureVisibleBounds(candidate);
    const validPlacement = canPlace
      ? canPlace(candidate, source)
      : bounds.x >= -0.5 && bounds.y >= -0.5
        && bounds.x + bounds.w <= canvasW + 0.5
        && bounds.y + bounds.h <= canvasH + 0.5;
    return validPlacement && occupied.every((item) => !overlaps(bounds, furnitureVisibleBounds(item)));
  })) ?? null;
}

/** Reindex copies directly above their sources while preserving the other local order. */
export function placeFurnitureCopiesAboveSources(
  items: readonly FloorFurniture[],
  copies: readonly { sourceId: string; copyId: string }[],
): FloorFurniture[] {
  if (copies.length === 0) return items as FloorFurniture[];
  const copyIdsBySource = new Map<string, string[]>();
  for (const { sourceId, copyId } of copies) {
    const ids = copyIdsBySource.get(sourceId) ?? [];
    ids.push(copyId);
    copyIdsBySource.set(sourceId, ids);
  }
  const itemById = new Map(items.map((item) => [item.id, item]));
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (a.item.zOrder ?? 0) - (b.item.zOrder ?? 0) || a.index - b.index)
    .map(({ item }) => item);
  const result: FloorFurniture[] = [];
  const included = new Set<string>();
  for (const item of ordered) {
    if (included.has(item.id)) continue;
    result.push(item);
    included.add(item.id);
    for (const copyId of copyIdsBySource.get(item.id) ?? []) {
      const copy = itemById.get(copyId);
      if (copy && !included.has(copyId)) {
        result.push(copy);
        included.add(copyId);
      }
    }
  }
  for (const item of ordered) if (!included.has(item.id)) result.push(item);
  return result.map((item, index) => item.zOrder === index ? item : { ...item, zOrder: index });
}

export function canGroupFurniture(items: FloorFurniture[]): boolean {
  return items.length >= 2 && items.every((item) => !item.locked);
}

export function withFurnitureGroupId(items: FloorFurniture[], groupId: string): FloorFurniture[] {
  return items.map((item) => ({ ...item, groupId }));
}

export function withoutFurnitureGroupId(items: FloorFurniture[]): FloorFurniture[] {
  return items.map(({ groupId: _groupId, ...item }) => item);
}

/**
 * Reorder only the furniture layer domain. Structural floor objects keep their
 * own z-order values, while the selected furniture retains its internal order
 * when moved as a block. This is intentionally pure so layer commands can use
 * the same deterministic behavior for individual and persistent groups.
 */
export function reorderFurnitureItems(
  items: FloorFurniture[],
  selectedIds: Iterable<string>,
  action: FurnitureLayerAction,
): FloorFurniture[] {
  return reorderFloorLayerItems(items, selectedIds, action);
}
