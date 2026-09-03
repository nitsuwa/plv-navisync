/**
 * Pure geometry/state helpers for the Map Builder canvas.
 *
 * Extracted so that:
 *  - the canvas preview and the final building share ONE placement function
 *    (they can never disagree), and
 *  - the coordinate conversion and cleanup rules are unit-testable.
 *
 * These functions are intentionally free of React/DOM dependencies.
 */

export interface PlacementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Minimum drag-to-create building footprint (matches the editor's floor plan minimums). */
export const MIN_BUILDING_W = 40;
export const MIN_BUILDING_H = 30;

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SvgContentBox {
  /** Horizontal offset (px) of the viewBox content inside the SVG element. */
  offsetX: number;
  /** Vertical offset (px) of the viewBox content inside the SVG element. */
  offsetY: number;
  /** Scale factor from viewBox units to screen px. */
  scale: number;
}

/**
 * Compute where the viewBox content actually sits inside the SVG element.
 *
 * The editor canvas is an <svg viewBox="0 0 W H"> stretched to fill its
 * container (w-full h-full) with the default preserveAspectRatio="xMidYMid
 * meet". When the container's aspect ratio differs from the canvas, the
 * content is LETTERBOXED (scaled to fit and centered), leaving empty margins
 * on two sides. Pointer conversion MUST subtract those margins and divide by
 * the real content scale — a naive `(clientX - rect.left) / rect.width * W`
 * stretches the whole element box and places objects offset from the cursor
 * (the rubber-band box visibly shifted to the right).
 *
 * Returns a sane fallback (offset 0, element-box scale) for degenerate rects
 * so a freshly-created campus whose SVG has not laid out yet can never push
 * placements toward the top-left corner.
 */
export function getSvgContentBox(
  rect: ScreenRect,
  canvasW: number,
  canvasH: number
): SvgContentBox {
  if (rect.width <= 0 || rect.height <= 0 || canvasW <= 0 || canvasH <= 0) {
    const scale = rect.width > 0 && canvasW > 0 ? rect.width / canvasW : 1;
    return { offsetX: 0, offsetY: 0, scale };
  }
  const scale = Math.min(rect.width / canvasW, rect.height / canvasH);
  return {
    offsetX: (rect.width - canvasW * scale) / 2,
    offsetY: (rect.height - canvasH * scale) / 2,
    scale,
  };
}

/**
 * Convert a client (screen) point into canvas/world coordinates.
 *
 * This is the SINGLE pointer→world conversion path for the whole editor:
 * screen/client coordinates → content-box (letterbox-aware) → undo pan → undo
 * zoom → world/campus coordinates. Placement, rubber-band selection, item
 * drags, resize/rotate handles, drag-and-drop and zoom-to-cursor all call it
 * (directly or via useCanvasControls.getPoint) so the visible cursor and the
 * interaction location always match, at any zoom, after any pan.
 */
export function screenToWorld(
  clientX: number,
  clientY: number,
  rect: ScreenRect,
  canvasW: number,
  canvasH: number,
  pan: { x: number; y: number },
  zoom: number
): { x: number; y: number } {
  const box = getSvgContentBox(rect, canvasW, canvasH);
  const z = zoom > 0 ? zoom : 1;
  return {
    x: ((clientX - rect.left - box.offsetX) / box.scale - pan.x) / z,
    y: ((clientY - rect.top - box.offsetY) / box.scale - pan.y) / z,
  };
}

/**
 * Inverse helper for zoom-to-cursor: compute the pan that keeps the world
 * point (worldX, worldY) exactly under the client point (clientX, clientY)
 * at the given zoom, respecting the letterbox content box. Returns the
 * resulting pan.
 */
export function panToKeepWorldPoint(
  clientX: number,
  clientY: number,
  rect: ScreenRect,
  canvasW: number,
  canvasH: number,
  worldX: number,
  worldY: number,
  zoom: number
): { x: number; y: number } {
  const box = getSvgContentBox(rect, canvasW, canvasH);
  const z = zoom > 0 ? zoom : 1;
  return {
    x: (clientX - rect.left - box.offsetX) / box.scale - worldX * z,
    y: (clientY - rect.top - box.offsetY) / box.scale - worldY * z,
  };
}

/**
 * Single source of truth for drag-to-create building geometry.
 *
 * The canvas drag preview AND the final building both call this with the
 * same drag box, so the preview always matches the created building exactly
 * (same clamping, same minimum size). A degenerate click (no drag) still
 * yields the minimum 40×30 footprint at the click point — never an
 * accidental placement at (0,0) unless the user actually clicked at (0,0).
 */
export function computeBuildingPlacement(
  sx: number,
  sy: number,
  cx: number,
  cy: number,
  canvasW: number,
  canvasH: number
): PlacementRect {
  const rx = Math.min(sx, cx);
  const ry = Math.min(sy, cy);
  const rw = Math.max(Math.abs(cx - sx), MIN_BUILDING_W);
  const rh = Math.max(Math.abs(cy - sy), MIN_BUILDING_H);
  return {
    x: Math.round(Math.max(0, Math.min(canvasW - rw, rx))),
    y: Math.round(Math.max(0, Math.min(canvasH - rh, ry))),
    width: Math.round(rw),
    height: Math.round(rh),
  };
}

/**
 * True when a world-space point falls inside a building's footprint,
 * including its rotation (the point is inverse-rotated around the building
 * center before the axis-aligned check). Used by the Navigation layer to
 * reject outdoor waypoints placed on arbitrary building bodies — outdoor
 * graph nodes belong to outdoor navigable space, so a click inside a
 * building should prompt "connect through a building entrance" instead of
 * silently creating a waypoint.
 */
export function pointInBuilding(
  building: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
  },
  point: { x: number; y: number }
): boolean {
  const rotation = building.rotation ?? 0;
  const cx = building.x + building.width / 2;
  const cy = building.y + building.height / 2;
  const radians = (-rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - cx;
  const dy = point.y - cy;
  const unrotatedX = dx * cos - dy * sin;
  const unrotatedY = dx * sin + dy * cos;
  const halfW = building.width / 2;
  const halfH = building.height / 2;
  return unrotatedX >= -halfW && unrotatedX <= halfW && unrotatedY >= -halfH && unrotatedY <= halfH;
}

/**
 * B5 Phase 6.2: true if any segment of a polyline crosses through a building
 * footprint (excluding the start/end points which may sit on entrances). Used
 * for outdoor Connect blocked-preview validation.
 */
export function polylineCrossesBuilding(
  points: { x: number; y: number }[],
  buildings: { x: number; y: number; width: number; height: number; rotation?: number }[],
): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    // Sample the segment at 5 interior points (skip endpoints — they may be
    // on building boundaries / entrances).
    for (let t = 0.15; t <= 0.85; t += 0.175) {
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      if (buildings.some((bldg) => pointInBuilding(bldg, { x: px, y: py }))) return true;
    }
  }
  return false;
}

/**
 * B5 Phase 6.4: true if any segment of a polyline crosses through a solid
 * outdoor obstacle (building or solid decor asset). Asset types that are
 * considered solid obstacles: tree, tree-large, palm, bush, plant, bench,
 * bollard, bike-rack, and similar placed objects.
 */
const SOLID_ASSET_TYPES = new Set([
  "tree", "tree-large", "palm", "bush", "plant",
  "bench", "bollard", "bike-rack",
  "light-post", "sign",
]);

export function polylineCrossesObstacle(
  points: { x: number; y: number }[],
  buildings: { x: number; y: number; width: number; height: number; rotation?: number }[],
  assets: { x: number; y: number; width?: number; height?: number; type: string; rotation?: number; scale?: number }[],
): boolean {
  // Check buildings first
  if (polylineCrossesBuilding(points, buildings)) return true;
  // Check solid assets
  const solidAssets = assets.filter((a) => SOLID_ASSET_TYPES.has(a.type) && a.width != null && a.height != null);
  if (solidAssets.length === 0) return false;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (let t = 0.15; t <= 0.85; t += 0.175) {
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      for (const asset of solidAssets) {
        const scale = asset.scale ?? 1;
        const w = (asset.width ?? 0) * scale;
        const h = (asset.height ?? 0) * scale;
        if (pointInBuilding({ x: asset.x, y: asset.y, width: w, height: h, rotation: asset.rotation }, { x: px, y: py })) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * B5 Phase 6.10: check if an outdoor NavigationEdge (as a polyline of points)
 * is blocked by buildings or solid obstacles. This is the LIVE revalidation
 * function — called on every render to mark invalid edges red.
 * Returns true when any segment of the polyline intersects a blocking obstacle
 * (building footprint or solid decor asset).
 */
export function outdoorEdgeIsBlocked(
  points: { x: number; y: number }[],
  buildings: { x: number; y: number; width: number; height: number; rotation?: number }[],
  assets: { x: number; y: number; width?: number; height?: number; type: string; rotation?: number; scale?: number }[],
): boolean {
  return polylineCrossesObstacle(points, buildings, assets);
}

/**
 * B5 placement-reality fix: the LIVE red-edge indicator rule. Checks whether
 * ANY placed outdoor object — a building OR any non-background decor asset —
 * intersects a nav-edge polyline, so placing a bench, fountain, flower bed,
 * trash bin, gazebo, flag, sign post, etc. ON a nav line immediately marks
 * that edge blocked/red in BOTH the Campus layer overlay and the Navigation
 * layer (and recomputes live on every placement/move). Ground Areas are
 * background terrain you deliberately paint paths over, so they never block;
 * hidden assets don't block either.
 */
const NON_BLOCKING_ASSET_TYPES = new Set(["ground-area"]);

export function polylineCrossesPlacedObject(
  points: { x: number; y: number }[],
  buildings: { x: number; y: number; width: number; height: number; rotation?: number }[],
  assets: { x: number; y: number; width?: number; height?: number; type: string; rotation?: number; scale?: number; visible?: boolean }[],
): boolean {
  // Buildings always block
  if (polylineCrossesBuilding(points, buildings)) return true;
  // EVERY placed non-background asset blocks (visible ones only)
  const blockers = assets.filter((a) => a.visible !== false && !NON_BLOCKING_ASSET_TYPES.has(a.type) && a.width != null && a.height != null);
  if (blockers.length === 0) return false;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (let t = 0.15; t <= 0.85; t += 0.175) {
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      for (const asset of blockers) {
        const scale = asset.scale ?? 1;
        const w = (asset.width ?? 0) * scale;
        const h = (asset.height ?? 0) * scale;
        if (pointInBuilding({ x: asset.x, y: asset.y, width: w, height: h, rotation: asset.rotation }, { x: px, y: py })) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Transient tool/drawing state that must be cleared when switching tools,
 * switching layers, or cancelling an in-progress gesture. Returns a fresh
 * fully-reset object so callers can spread it into state setters.
 */
export function resetTransientToolState(): {
  drawingPath: { x: number; y: number }[];
  buildingDrag: null;
  rubberBand: null;
  selectedBuildingType: null;
  guides: { type: "h" | "v"; pos: number }[];
} {
  return {
    drawingPath: [],
    buildingDrag: null,
    rubberBand: null,
    selectedBuildingType: null,
    guides: [],
  };
}
