import type { FloorFurniture, FloorLabel } from "../components/map-builder/types";
import { resolveLayoutMoveFromSnapshot, type LayoutItem } from "./eventLayoutGeometry";

import { eventAsset3DTransform, type Event3DFrame } from "./event3dLayout";
import { constrainEventAsset, eventAssetAllowsResize, resizeEventAsset } from "./eventAssetSizing";

export interface Event3DLayout { furniture: FloorFurniture[]; labels: FloorLabel[] }
export interface Event3DPoint { x: number; y: number }
export type Event3DManipulation = "move" | "rotate" | "resize";
export type Event3DEditTool = Event3DManipulation | "pan" | "place-item" | "place-label";
export interface Event3DGesture {
  start: Event3DLayout;
  id: string;
  ids: string[];
  tool: Event3DManipulation;
  pointer: Event3DPoint;
  bounds: { width: number; height: number };
  grid: number;
  preserveAspect?: boolean;
}
export interface Event3DEditing {
  tool: Event3DEditTool;
  selectedIds: readonly string[];
  bounds: { width: number; height: number };
  grid: number;
  preserveAspect?: boolean;
  placement?: Event3DLayout;
  onSelect: (id: string) => void;
  onPlacementPoint: (point: Event3DPoint) => void;
  /** A click/tap commits one item; pointer hover only previews a location. */
  onPlace?: (point: Event3DPoint) => void;
  onCancelPlacement?: () => void;
  onCommit: (start: Event3DLayout, next: Event3DLayout) => void;
  onBusyChange: (busy: boolean) => void;
}

export function event3DPointToLayout(point: { x: number; z: number }, frame: Event3DFrame): Event3DPoint | null {
  if (frame.scale <= 0 || ![point.x, point.z, frame.scale, frame.originX, frame.originY].every(Number.isFinite)) return null;
  return { x: point.x / frame.scale + frame.originX, y: point.z / frame.scale + frame.originY };
}

export function event3DSelectionIds(layout: Event3DLayout, id: string): string[] {
  const item = layout.furniture.find(item => item.id === id);
  if (item?.groupId) return layout.furniture.filter(other => other.groupId === item.groupId).map(other => other.id);
  return item || layout.labels.some(label => label.id === id) ? [id] : [];
}

export function beginEvent3DGesture(layout: Event3DLayout, id: string, tool: Event3DManipulation, point: Event3DPoint, bounds: { width: number; height: number }, grid = 0, preserveAspect = false): Event3DGesture | null {
  const item = layout.furniture.find(item => item.id === id), label = layout.labels.find(label => label.id === id);
  const ids = event3DSelectionIds(layout, id);
  if (!ids.length || ![point.x, point.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) return null;
  if (item ? !eventAsset3DTransform(item, { scale: 1, originX: 0, originY: 0 }) : !label || label.visible === false) return null;
  if (layout.furniture.some(item => ids.includes(item.id) && item.locked) || label?.locked) return null;
  if (tool !== "move" && (!item || ids.length !== 1 || item.groupId)) return null;
  if (tool === "resize" && !eventAssetAllowsResize(item!)) return null;
  return { start: { furniture: layout.furniture.map(item => ({ ...item })), labels: layout.labels.map(label => ({ ...label })) }, id, ids, tool, pointer: { ...point }, bounds: { ...bounds }, grid: Math.max(0, grid), preserveAspect };
}

function moveBounds(item: FloorFurniture): LayoutItem {
  const angle = item.rotation * Math.PI / 180;
  const width = Math.abs(Math.cos(angle)) * item.width + Math.abs(Math.sin(angle)) * item.height;
  const height = Math.abs(Math.sin(angle)) * item.width + Math.abs(Math.cos(angle)) * item.height;
  return { id: item.id, x: item.x + (item.width - width) / 2, y: item.y + (item.height - height) / 2, width, height };
}

export function previewEvent3DGesture(gesture: Event3DGesture, point: Event3DPoint): Event3DLayout {
  const { start, id, ids, tool, pointer, bounds, grid } = gesture;
  if (![point.x, point.y].every(Number.isFinite)) return start;
  const item = start.furniture.find(item => item.id === id), label = start.labels.find(label => label.id === id);
  if (tool === "move") {
    const anchor = item || { ...label!, width: 0, height: label!.fontSize || 14 };
    const movingItems = item ? start.furniture.filter(item => ids.includes(item.id)).map(moveBounds) : [anchor];
    const result = resolveLayoutMoveFromSnapshot({ anchor, movingItems, furnitureItems: start.furniture, selectedIds: ids, startPointer: pointer, bounds, grid, threshold: 6, snapEnabled: grid > 0, snapToGrid: grid > 0 }, point);
    return {
      furniture: start.furniture.map(item => ids.includes(item.id) ? { ...item, x: item.x + result.delta.x, y: item.y + result.delta.y } : item),
      labels: start.labels.map(label => ids.includes(label.id) ? { ...label, x: label.x + result.delta.x, y: label.y + result.delta.y } : label),
    };
  }
  let next: FloorFurniture;
  if (tool === "rotate") {
    const cx = item!.x + item!.width / 2, cy = item!.y + item!.height / 2;
    if (Math.hypot(pointer.x - cx, pointer.y - cy) < 0.001 || Math.hypot(point.x - cx, point.y - cy) < 0.001) return start;
    const delta = (Math.atan2(point.y - cy, point.x - cx) - Math.atan2(pointer.y - cy, pointer.x - cx)) * 180 / Math.PI;
    const rotation = ((item!.rotation + delta) % 360 + 360) % 360;
    next = constrainEventAsset({ ...item!, rotation: grid > 0 ? Math.round(rotation / 15) * 15 % 360 : rotation }, bounds.width, bounds.height);
  } else {
    const snap = (value: number) => grid > 0 ? Math.round(value / grid) * grid : value;
    next = resizeEventAsset(item!, "se", snap(point.x - pointer.x), snap(point.y - pointer.y), bounds, gesture.preserveAspect);
  }
  return { furniture: start.furniture.map(item => item.id === id ? next : item), labels: start.labels };
}

/** Merge only changed geometry; reject a drag based on an obsolete/locked item. */
export function mergeEvent3DChanges(current: Event3DLayout, start: Event3DLayout, next: Event3DLayout): Event3DLayout | null {
  const furnitureKeys = ["x", "y", "width", "height", "rotation"] as const;
  const changedFurniture = next.furniture.filter(item => {
    const before = start.furniture.find(before => before.id === item.id);
    return !before || furnitureKeys.some(key => before[key] !== item[key]);
  });
  const changedLabels = next.labels.filter(label => {
    const before = start.labels.find(before => before.id === label.id);
    return !before || before.x !== label.x || before.y !== label.y;
  });
  if (!changedFurniture.length && !changedLabels.length) return null;
  for (const item of [...changedFurniture, ...changedLabels]) {
    const furniture = "width" in item;
    const before = (furniture ? start.furniture : start.labels).find(before => before.id === item.id);
    const latest = (furniture ? current.furniture : current.labels).find(latest => latest.id === item.id);
    if (!before || !latest || before.locked || latest.locked || latest.visible === false || JSON.stringify(before) !== JSON.stringify(latest)) return null;
    if (![item.x, item.y].every(Number.isFinite) || (furniture && (!furnitureKeys.every(key => Number.isFinite(item[key])) || item.width <= 0 || item.height <= 0))) return null;
  }
  return {
    furniture: current.furniture.map(item => {
      const change = changedFurniture.find(change => change.id === item.id);
      return change ? { ...item, x: change.x, y: change.y, width: change.width, height: change.height, rotation: change.rotation } : item;
    }),
    labels: current.labels.map(label => {
      const change = changedLabels.find(change => change.id === label.id);
      return change ? { ...label, x: change.x, y: change.y } : label;
    }),
  };
}
