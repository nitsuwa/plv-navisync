import type { ExteriorEmergencyStair, FloorEntranceRamp, FloorEntranceSteps, FloorPlan } from "./types";
import { exteriorStairPresentationBounds } from "./ExteriorEmergencyFloorModule";
import {
  exteriorZoneAccessFeatureGeometry,
  exteriorZoneGeometry,
} from "../../lib/exteriorFloorZones";

const DEFAULT_FLOOR_CANVAS_W = 440;
const DEFAULT_FLOOR_CANVAS_H = 290;
const FLOOR_VIEWPORT_PADDING = 8;

export interface ReadonlyFloorPlanViewport {
  /** Width/height used by the student SVG viewBox. */
  width: number;
  height: number;
  /** Translation that places authored floor coordinates inside that viewBox. */
  offsetX: number;
  offsetY: number;
}

/**
 * Return a viewBox that includes authored semi-outdoor floor content.
 * Exterior zones intentionally live outside the indoor canvas, so a
 * student-facing SVG using only `0 0 canvasW canvasH` would clip verandas and
 * their entrance steps/ramp even though the Admin editor shows them.
 */
export function readonlyFloorPlanViewport(
  floor?: FloorPlan | null,
  exteriorEmergencyStairs: readonly ExteriorEmergencyStair[] = [],
): ReadonlyFloorPlanViewport {
  const canvasW = Math.max(1, floor?.canvasW || DEFAULT_FLOOR_CANVAS_W);
  const canvasH = Math.max(1, floor?.canvasH || DEFAULT_FLOOR_CANVAS_H);
  let minX = 0;
  let minY = 0;
  let maxX = canvasW;
  let maxY = canvasH;

  const includeRect = (x: number, y: number, width: number, height: number) => {
    if (![x, y, width, height].every(Number.isFinite)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + Math.max(0, width));
    maxY = Math.max(maxY, y + Math.max(0, height));
  };

  const includeRotatedRect = (x: number, y: number, width: number, height: number, rotation = 0) => {
    const angle = (rotation * Math.PI) / 180;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const corners = [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ].map((point) => ({
      x: cx + (point.x - cx) * Math.cos(angle) - (point.y - cy) * Math.sin(angle),
      y: cy + (point.x - cx) * Math.sin(angle) + (point.y - cy) * Math.cos(angle),
    }));
    includeRect(
      Math.min(...corners.map((point) => point.x)),
      Math.min(...corners.map((point) => point.y)),
      Math.max(...corners.map((point) => point.x)) - Math.min(...corners.map((point) => point.x)),
      Math.max(...corners.map((point) => point.y)) - Math.min(...corners.map((point) => point.y)),
    );
  };

  const zones = floor?.exteriorZones ?? [];
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
  zones.forEach((zone) => {
    const geometry = exteriorZoneGeometry(zone, canvasW, canvasH);
    includeRect(geometry.x, geometry.y, geometry.width, geometry.height);
  });

  const includeAccessFeature = (feature: FloorEntranceSteps | FloorEntranceRamp) => {
    const parent = feature.parentZoneId ? zoneById.get(feature.parentZoneId) : undefined;
    const geometry = parent
      ? exteriorZoneAccessFeatureGeometry(parent, feature, canvasW, canvasH)
      : { x: feature.x, y: feature.y, width: feature.width, height: feature.height };
    if (!geometry) return;
    includeRect(geometry.x, geometry.y, geometry.width, geometry.height);
  };
  (floor?.entranceSteps ?? []).forEach(includeAccessFeature);
  (floor?.entranceRamps ?? []).forEach(includeAccessFeature);

  // Legacy floors can contain a free-standing item beyond the indoor canvas.
  // Include those authored bounds too, while preserving the normal viewBox for
  // the common case where every object is inside the floor.
  (floor?.furniture ?? []).forEach((item) => includeRotatedRect(item.x, item.y, item.width, item.height, item.rotation));
  (floor?.stairs ?? []).forEach((item) => {
    if (item.exteriorEmergencyStairId) {
      const owner = exteriorEmergencyStairs.find((stair) => stair.id === item.exteriorEmergencyStairId);
      const bounds = exteriorStairPresentationBounds(item, canvasW, canvasH, owner?.visualSize);
      includeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      return;
    }
    includeRotatedRect(item.x, item.y, item.width, item.height, item.rotation);
  });
  (floor?.ramps ?? []).forEach((item) => includeRotatedRect(item.x, item.y, item.width, item.height, item.rotation));
  (floor?.elevators ?? []).forEach((item) => includeRotatedRect(item.x, item.y, item.width, item.height, item.rotation));

  const viewMinX = minX < 0 ? minX - FLOOR_VIEWPORT_PADDING : 0;
  const viewMinY = minY < 0 ? minY - FLOOR_VIEWPORT_PADDING : 0;
  const viewMaxX = maxX > canvasW ? maxX + FLOOR_VIEWPORT_PADDING : canvasW;
  const viewMaxY = maxY > canvasH ? maxY + FLOOR_VIEWPORT_PADDING : canvasH;
  return {
    width: viewMaxX - viewMinX,
    height: viewMaxY - viewMinY,
    offsetX: viewMinX === 0 ? 0 : -viewMinX,
    offsetY: viewMinY === 0 ? 0 : -viewMinY,
  };
}
