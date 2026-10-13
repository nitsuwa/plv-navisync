import type { FloorFurniture, FloorLabel } from "../components/map-builder/types";
import type { LayoutRect } from "./eventLayoutGeometry";
import type { Student3dCameraTargetBounds } from "./student3dInput";

export interface Event3DFrame { scale: number; originX: number; originY: number }
export interface Event3DCameraRequest { nonce: number; kind: "fit" | "focus" | "zoom-in" | "zoom-out"; bounds: LayoutRect; maxHeight?: number }
export function eventAsset3DTransform(item: FloorFurniture, frame: Event3DFrame) {
  if (item.visible === false || ![item.x, item.y, item.width, item.height, item.rotation ?? 0, frame.scale, frame.originX, frame.originY].every(Number.isFinite)
    || item.width <= 0 || item.height <= 0 || frame.scale <= 0) return null;
  const width = item.width * frame.scale, depth = item.height * frame.scale;
  // Footprint resizing changes floor coverage, not the object's vertical
  // height. These illustrative heights use the existing authored map units.
  const heights: Record<string, number> = { chair: 34, table: 32, "registration-desk": 32, stage: 12, tent: 100, booth: 96, signage: 64, podium: 44, microphone: 64, "queue-post": 40, speaker: 52, monitor: 34, projector: 8, barrier: 36 };
  const kind = item.assetKey || item.type;
  return {
    position: [(item.x + item.width / 2 - frame.originX) * frame.scale, 0.025, (item.y + item.height / 2 - frame.originY) * frame.scale] as [number, number, number],
    width, depth, height: (heights[kind] ?? 24) * eventAssetReferenceFactor(item.assetVariant) * frame.scale,
    rotation: -(item.rotation ?? 0) * Math.PI / 180,
  };
}

export function event3DLayoutBounds(furniture: readonly FloorFurniture[], labels: readonly FloorLabel[]): LayoutRect | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of furniture) {
    if (!eventAsset3DTransform(item, { scale: 1, originX: 0, originY: 0 })) continue;
    const radians = (item.rotation ?? 0) * Math.PI / 180;
    const halfW = (Math.abs(Math.cos(radians)) * item.width + Math.abs(Math.sin(radians)) * item.height) / 2;
    const halfH = (Math.abs(Math.sin(radians)) * item.width + Math.abs(Math.cos(radians)) * item.height) / 2;
    const cx = item.x + item.width / 2, cy = item.y + item.height / 2;
    minX = Math.min(minX, cx - halfW); maxX = Math.max(maxX, cx + halfW);
    minY = Math.min(minY, cy - halfH); maxY = Math.max(maxY, cy + halfH);
  }
  for (const label of labels) {
    if (label.visible === false || !Number.isFinite(label.x) || !Number.isFinite(label.y)) continue;
    minX = Math.min(minX, label.x); maxX = Math.max(maxX, label.x);
    minY = Math.min(minY, label.y); maxY = Math.max(maxY, label.y);
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
}

export function event3DCameraPose(bounds: LayoutRect, frame: Event3DFrame, aspect: number, fov: number, maxHeight = 0) {
  const target: [number, number, number] = [(bounds.x + bounds.width / 2 - frame.originX) * frame.scale, 0.025 + maxHeight / 2, (bounds.y + bounds.height / 2 - frame.originY) * frame.scale];
  const verticalFov = Math.max(15, Math.min(90, fov)) * Math.PI / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(0.1, aspect));
  const radius = Math.hypot(Math.max(1, bounds.width) * frame.scale, Math.max(1, bounds.height) * frame.scale, maxHeight) / 2 + 0.3;
  const distance = Math.max(2, radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2) * 1.15);
  const norm = Math.hypot(0.65, 0.95, 0.72);
  const position: [number, number, number] = [target[0] + distance * 0.65 / norm, target[1] + distance * 0.95 / norm, target[2] + distance * 0.72 / norm];
  return { target, position, distance };
}

export function event3DOutdoorTargetBounds(base: Student3dCameraTargetBounds, width: number, height: number, scale: number, hasEventLayout: boolean, maxHeight = 0): Student3dCameraTargetBounds {
  return hasEventLayout ? { ...base, minX: Math.min(base.minX, 0), maxX: Math.max(base.maxX, width * scale), minZ: Math.min(base.minZ, 0), maxZ: Math.max(base.maxZ, height * scale), maxY: Math.max(base.maxY, maxHeight / 2 + 0.025) } : base;
}
import { eventAssetReferenceFactor } from "./eventAssetSizing";
