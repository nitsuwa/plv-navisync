import type { FloorFurniture } from "../components/map-builder/types";
import { rotatedRectBounds, resizeFurnitureWithinFloor } from "./floorGeometry";

export type EventSizeContext = "indoor" | "outdoor";
export interface EventSizePreset { id: string; label: string; width: number; depth: number }
const presetRatios: Record<string, EventSizePreset[]> = {
  chair: [{ id: "compact", label: "Compact", width: 0.875, depth: 0.875 }, { id: "wide", label: "Wide", width: 1.25, depth: 1.25 }],
  table: [{ id: "compact", label: "Compact", width: 0.8, depth: 1 }, { id: "large", label: "Large", width: 1.4, depth: 7 / 6 }],
  tent: [{ id: "compact", label: "Compact", width: 2 / 3, depth: 2 / 3 }, { id: "large", label: "Large", width: 1.5, depth: 1.5 }],
  booth: [{ id: "compact", label: "Compact", width: 0.75, depth: 2 / 3 }, { id: "large", label: "Large", width: 1.5, depth: 4 / 3 }],
  stage: [{ id: "compact", label: "Compact", width: 2 / 3, depth: 0.75 }, { id: "large", label: "Large", width: 1.5, depth: 1.5 }],
  "registration-desk": [{ id: "compact", label: "Compact", width: 0.8, depth: 1 }, { id: "large", label: "Large", width: 1.3, depth: 1.25 }],
  barrier: [{ id: "long", label: "Long", width: 2, depth: 1 }],
  signage: [{ id: "portrait", label: "Portrait", width: 2 / 3, depth: 1.5 }],
};
const resizableKinds = new Set(["table", "tent", "booth", "stage", "registration-desk", "barrier", "signage"]);
export function eventAssetAllowsResize(item: Pick<FloorFurniture, "type" | "assetKey">) {
  return resizableKinds.has(item.assetKey || item.type);
}
export function eventAssetReferenceFactor(variant?: string) {
  return /^event-outdoor-reference-v1:(standard|compact|wide|large|long|portrait)$/.test(variant || "") ? 0.4 : 1;
}
export function eventAssetSizePresets(type: string): EventSizePreset[] {
  return [{ id: "standard", label: "Standard", width: 1, depth: 1 }, ...(presetRatios[type] || [])];
}
export function eventReferenceSize(base: { type: string; width: number; height: number }, context: EventSizeContext = "indoor", presetId = "standard") {
  const preset = eventAssetSizePresets(base.type).find(preset => preset.id === presetId) || eventAssetSizePresets(base.type)[0];
  const factor = context === "outdoor" ? 0.4 : 1;
  return { width: Math.round(base.width * preset.width * factor * 100) / 100,
    height: Math.round(base.height * preset.depth * factor * 100) / 100,
    assetVariant: `event-${context}-reference-v1:${preset.id}` };
}
export function resetEventAssetSize(item: FloorFurniture, base: { type: string; width: number; height: number }, context: EventSizeContext, bounds: { width: number; height: number }, preset = "standard"): FloorFurniture {
  if (item.locked || item.groupId) return item;
  const size = eventReferenceSize(base, context, preset);
  return constrainEventAsset({ ...item, ...size, x: item.x + (item.width - size.width) / 2, y: item.y + (item.height - size.height) / 2 }, bounds.width, bounds.height);
}
/** Constrain position only. An impossible footprint is returned for placement validation to reject. */
export function constrainEventAsset(item: FloorFurniture, width: number, height: number): FloorFurniture {
  const bounds = rotatedRectBounds(item.x, item.y, item.width, item.height, item.rotation || 0);
  if (bounds.w > width || bounds.h > height) return item;
  // Keep corrected edges infinitesimally inside: the validator computes rotated
  // corners separately, whose floating-point arithmetic can differ at zero.
  const marginX = Math.min(0.000001, (width - bounds.w) / 2);
  const marginY = Math.min(0.000001, (height - bounds.h) / 2);
  const dx = bounds.x < 0 ? -bounds.x + marginX : bounds.x + bounds.w > width ? width - bounds.x - bounds.w - marginX : 0;
  const dy = bounds.y < 0 ? -bounds.y + marginY : bounds.y + bounds.h > height ? height - bounds.y - bounds.h - marginY : 0;
  return { ...item, x: item.x + dx, y: item.y + dy };
}
export function resizeEventAsset(item: FloorFurniture, corner: string, dx: number, dy: number, bounds: { width: number; height: number }, preserveAspect = false): FloorFurniture {
  if (!eventAssetAllowsResize(item) || item.locked || item.groupId) return item;
  const factor = eventAssetReferenceFactor(item.assetVariant);
  const result = resizeFurnitureWithinFloor({ ...item, x: item.x / factor, y: item.y / factor, width: item.width / factor, height: item.height / factor }, corner as Parameters<typeof resizeFurnitureWithinFloor>[1], dx / factor, dy / factor, bounds.width / factor, bounds.height / factor, preserveAspect);
  return { ...result, x: result.x * factor, y: result.y * factor, width: result.width * factor, height: result.height * factor };
}
