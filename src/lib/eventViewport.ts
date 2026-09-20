import type {
  FloorFurniture,
  FloorLabel,
  FloorPlan,
  FloorSelection,
} from "../components/map-builder/types";
import { itemBounds } from "./floorGeometry";

export interface EventViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EventWheelDeltaInput {
  deltaX: number;
  deltaY: number;
  deltaMode?: number;
  shiftKey?: boolean;
  viewportHeight?: number;
}

export interface EventViewportFitInput {
  canvasWidth: number;
  canvasHeight: number;
  contentBounds: EventViewportRect;
  viewportWidth: number;
  viewportHeight: number;
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
}

export interface EventViewportFitState {
  zoom: number;
  pan: { x: number; y: number };
}

export interface EventContentPanBoundsInput {
  contentBounds: EventViewportRect;
  viewportWidth: number;
  viewportHeight: number;
  zoom: number;
  padding?: number;
}

const DEFAULT_CANVAS_WIDTH = 800;
const DEFAULT_CANVAS_HEIGHT = 600;
const WHEEL_LINE_HEIGHT = 16;
const WHEEL_PAGE_HEIGHT = 800;
const WHEEL_ZOOM_SENSITIVITY = 0.0012;

const finite = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Convert browser wheel units to predictable screen-space pan deltas. */
export function normalizeWheelDelta(input: EventWheelDeltaInput) {
  const mode = input.deltaMode ?? 0;
  const unit = mode === 1
    ? WHEEL_LINE_HEIGHT
    : mode === 2
      ? Math.max(1, finite(input.viewportHeight, WHEEL_PAGE_HEIGHT))
      : 1;
  const deltaX = finite(input.deltaX, 0) * unit;
  const deltaY = finite(input.deltaY, 0) * unit;

  if (input.shiftKey && Math.abs(deltaX) < 0.01 && Math.abs(deltaY) >= 0.01) {
    return { x: -deltaY, y: 0 };
  }
  return { x: deltaX === 0 ? 0 : -deltaX, y: deltaY === 0 ? 0 : -deltaY };
}

/** Apply a small exponential wheel step and keep the zoom in safe bounds. */
export function getSmoothZoomTarget(
  zoom: number,
  deltaY: number,
  minZoom: number,
  maxZoom: number,
  deltaMode = 0,
  viewportHeight = WHEEL_PAGE_HEIGHT,
) {
  const unit = deltaMode === 1
    ? WHEEL_LINE_HEIGHT
    : deltaMode === 2
      ? Math.max(1, viewportHeight)
      : 1;
  const normalizedDelta = clamp(finite(deltaY, 0) * unit, -240, 240);
  const safeMin = Math.min(minZoom, maxZoom);
  const safeMax = Math.max(minZoom, maxZoom);
  const next = finite(zoom, 1) * Math.exp(-normalizedDelta * WHEEL_ZOOM_SENSITIVITY);
  return clamp(next, safeMin, safeMax);
}

/** Pan limits that keep the authored content reachable inside the workspace. */
export function getContentPanBounds(input: EventContentPanBoundsInput) {
  const viewportWidth = Math.max(1, finite(input.viewportWidth, DEFAULT_CANVAS_WIDTH));
  const viewportHeight = Math.max(1, finite(input.viewportHeight, DEFAULT_CANVAS_HEIGHT));
  const zoom = Math.max(0.01, finite(input.zoom, 1));
  const padding = Math.max(0, finite(input.padding, 48));
  const contentWidth = Math.max(1, finite(input.contentBounds.width, 1));
  const contentHeight = Math.max(1, finite(input.contentBounds.height, 1));
  const contentX = finite(input.contentBounds.x, 0);
  const contentY = finite(input.contentBounds.y, 0);
  const horizontal = {
    min: padding - (contentX + contentWidth) * zoom,
    max: viewportWidth - padding - contentX * zoom,
  };
  const vertical = {
    min: padding - (contentY + contentHeight) * zoom,
    max: viewportHeight - padding - contentY * zoom,
  };
  const x = horizontal.min <= horizontal.max
    ? horizontal
    : { min: viewportWidth / 2 - (contentX + contentWidth / 2) * zoom, max: viewportWidth / 2 - (contentX + contentWidth / 2) * zoom };
  const y = vertical.min <= vertical.max
    ? vertical
    : { min: viewportHeight / 2 - (contentY + contentHeight / 2) * zoom, max: viewportHeight / 2 - (contentY + contentHeight / 2) * zoom };
  return { minX: x.min, maxX: x.max, minY: y.min, maxY: y.max };
}

function rectFromFloorItem(type: FloorSelection["type"], item: unknown): EventViewportRect | null {
  const bounds = itemBounds(type, item);
  if (!bounds) return null;
  return {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(1, bounds.w),
    height: Math.max(1, bounds.h),
  };
}

/** Find the visible authored geometry that should be framed on entry. */
export function getFloorPlanContentBounds(
  floorPlan: FloorPlan,
  overlayFurniture: readonly FloorFurniture[] = [],
  overlayLabels: readonly FloorLabel[] = [],
): EventViewportRect {
  const canvasWidth = Math.max(1, finite(floorPlan.canvasW, DEFAULT_CANVAS_WIDTH));
  const canvasHeight = Math.max(1, finite(floorPlan.canvasH, DEFAULT_CANVAS_HEIGHT));
  const rects: EventViewportRect[] = [];

  const add = (rect: EventViewportRect | null) => {
    if (!rect) return;
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return;
    if (rect.width <= 0 || rect.height <= 0) return;
    rects.push(rect);
  };

  const floorCollections: Array<[FloorSelection["type"], readonly unknown[] | undefined]> = [
    ["room", floorPlan.rooms],
    ["wall", floorPlan.walls],
    ["door", floorPlan.doors],
    ["window", floorPlan.windows],
    ["furniture", floorPlan.furniture],
    ["stairs", floorPlan.stairs],
    ["ramp", floorPlan.ramps],
    ["elevator", floorPlan.elevators],
    ["label", floorPlan.labels],
    ["exteriorZone", floorPlan.exteriorZones],
    ["entranceSteps", floorPlan.entranceSteps],
    ["entranceRamp", floorPlan.entranceRamps],
  ];

  for (const [type, items] of floorCollections) {
    for (const item of items ?? []) {
      if ((item as { visible?: boolean }).visible === false) continue;
      add(rectFromFloorItem(type, item));
    }
  }

  for (const path of floorPlan.paths ?? []) {
    const points = path.points ?? [];
    if (points.length === 0) continue;
    const halfWidth = Math.max(1, finite(path.width, 2) / 2);
    add({
      x: Math.min(...points.map((point) => point.x)) - halfWidth,
      y: Math.min(...points.map((point) => point.y)) - halfWidth,
      width: Math.max(1, Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x)) + halfWidth * 2),
      height: Math.max(1, Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y)) + halfWidth * 2),
    });
  }

  if (floorPlan.backgroundImage?.visible !== false) {
    add(floorPlan.backgroundImage ? {
      x: floorPlan.backgroundImage.x,
      y: floorPlan.backgroundImage.y,
      width: floorPlan.backgroundImage.width,
      height: floorPlan.backgroundImage.height,
    } : null);
  }

  for (const item of overlayFurniture) add(rectFromFloorItem("furniture", item));
  for (const item of overlayLabels) add(rectFromFloorItem("label", item));

  if (rects.length === 0) {
    return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
  }

  const minX = Math.max(0, Math.min(...rects.map((rect) => rect.x)));
  const minY = Math.max(0, Math.min(...rects.map((rect) => rect.y)));
  const maxX = Math.min(canvasWidth, Math.max(...rects.map((rect) => rect.x + rect.width)));
  const maxY = Math.min(canvasHeight, Math.max(...rects.map((rect) => rect.y + rect.height)));

  if (maxX <= minX || maxY <= minY) {
    return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Compute a centered fit transform without mutating the authored canvas. */
export function fitEventViewport(input: EventViewportFitInput): EventViewportFitState {
  const canvasWidth = Math.max(1, finite(input.canvasWidth, DEFAULT_CANVAS_WIDTH));
  const canvasHeight = Math.max(1, finite(input.canvasHeight, DEFAULT_CANVAS_HEIGHT));
  const viewportWidth = Math.max(1, finite(input.viewportWidth, canvasWidth));
  const viewportHeight = Math.max(1, finite(input.viewportHeight, canvasHeight));
  const padding = Math.max(0, finite(input.padding, 48));
  const minZoom = Math.max(0.01, finite(input.minZoom, 0.25));
  const maxZoom = Math.max(minZoom, finite(input.maxZoom, 4));
  const contentWidth = Math.max(1, finite(input.contentBounds.width, canvasWidth));
  const contentHeight = Math.max(1, finite(input.contentBounds.height, canvasHeight));
  const availableWidth = Math.max(1, viewportWidth - padding * 2);
  const availableHeight = Math.max(1, viewportHeight - padding * 2);
  const zoom = clamp(
    Math.min(availableWidth / contentWidth, availableHeight / contentHeight),
    minZoom,
    maxZoom,
  );

  return {
    zoom,
    pan: {
      x: viewportWidth / 2 - (input.contentBounds.x + contentWidth / 2) * zoom,
      y: viewportHeight / 2 - (input.contentBounds.y + contentHeight / 2) * zoom,
    },
  };
}
