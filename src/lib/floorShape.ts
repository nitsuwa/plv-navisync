import type { FloorExtension, FloorExtensionSide, FloorPlan, FloorWall } from "../components/map-builder/types";

export interface FloorShapeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FloorShapeBoundarySegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  side: FloorExtensionSide;
}

export function normalizeFloorExtensions(
  extensions: FloorExtension[] | undefined,
  canvasW: number,
  canvasH: number,
): FloorExtension[] {
  if (!Array.isArray(extensions)) return [];
  return extensions.flatMap((item, index) => {
    if (!item || !["top", "bottom", "left", "right"].includes(item.side)) return [];
    const edgeLength = item.side === "top" || item.side === "bottom" ? canvasW : canvasH;
    const width = Number(item.width);
    const depth = Number(item.depth);
    if (!Number.isFinite(width) || !Number.isFinite(depth) || width < 1 || depth < 1) return [];
    const span = Math.min(edgeLength, Math.max(1, Math.round(width)));
    const offset = Math.max(0, Math.min(edgeLength - span, Number.isFinite(Number(item.offset)) ? Number(item.offset) : 0));
    return [{
      id: typeof item.id === "string" && item.id ? item.id : `floor-extension-${index + 1}`,
      side: item.side,
      offset: Math.round(offset),
      width: span,
      depth: Math.max(1, Math.round(depth)),
    }];
  });
}

/** Keep extension geometry fixed during base Floor Resize. Its absolute span
 * and depth remain unchanged; the existing offset is retained when possible
 * and clamped along the same host edge when the resized edge is shorter. A
 * span longer than the resized edge is intentionally preserved so resize
 * validation can block Apply instead of silently shrinking the extension. */
export function resizeFloorExtensions(
  extensions: FloorExtension[] | undefined,
  oldCanvasW: number,
  oldCanvasH: number,
  newCanvasW: number,
  newCanvasH: number,
): FloorExtension[] {
  const source = normalizeFloorExtensions(extensions, oldCanvasW, oldCanvasH);
  return source.map((extension) => {
    const edgeLength = extension.side === "top" || extension.side === "bottom" ? newCanvasW : newCanvasH;
    const maxOffset = Math.max(0, edgeLength - extension.width);
    return {
      ...extension,
      offset: Math.round(Math.max(0, Math.min(maxOffset, extension.offset))),
    };
  });
}

export function getFloorShapeRegions(
  floor: Pick<FloorPlan, "canvasW" | "canvasH" | "extensions">,
  override?: { canvasW?: number; canvasH?: number; extensions?: FloorExtension[]; preserveExtensionDimensions?: boolean },
): FloorShapeRect[] {
  const canvasW = Math.max(1, override?.canvasW ?? floor.canvasW ?? 600);
  const canvasH = Math.max(1, override?.canvasH ?? floor.canvasH ?? 450);
  const extensions = override?.preserveExtensionDimensions
    ? (override.extensions ?? floor.extensions ?? []).filter((item) => item && ["top", "bottom", "left", "right"].includes(item.side)
      && Number.isFinite(item.offset) && Number.isFinite(item.width) && Number.isFinite(item.depth) && item.width > 0 && item.depth > 0)
    : normalizeFloorExtensions(override?.extensions ?? floor.extensions, canvasW, canvasH);
  return [
    { x: 0, y: 0, width: canvasW, height: canvasH },
    ...extensions.map((extension) => getFloorExtensionRect(extension, canvasW, canvasH)),
  ];
}

export function getFloorExtensionRect(extension: FloorExtension, canvasW: number, canvasH: number): FloorShapeRect {
  if (extension.side === "top") return { x: extension.offset, y: -extension.depth, width: extension.width, height: extension.depth };
  if (extension.side === "bottom") return { x: extension.offset, y: canvasH, width: extension.width, height: extension.depth };
  if (extension.side === "left") return { x: -extension.depth, y: extension.offset, width: extension.depth, height: extension.width };
  return { x: canvasW, y: extension.offset, width: extension.depth, height: extension.width };
}

export function getFloorShapeBounds(regions: FloorShapeRect[]): FloorShapeRect {
  const x = Math.min(...regions.map((region) => region.x));
  const y = Math.min(...regions.map((region) => region.y));
  const right = Math.max(...regions.map((region) => region.x + region.width));
  const bottom = Math.max(...regions.map((region) => region.y + region.height));
  return { x, y, width: right - x, height: bottom - y };
}

export function floorShapeContainsPoint(regions: FloorShapeRect[], x: number, y: number, tolerance = 0.001) {
  return regions.some((region) => x >= region.x - tolerance && x <= region.x + region.width + tolerance
    && y >= region.y - tolerance && y <= region.y + region.height + tolerance);
}

function pointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Tests a whole line segment against the rectangular union. Splitting at
 * every region edge catches narrow concave notches without coarse sampling. */
export function floorShapeContainsSegment(
  regions: FloorShapeRect[],
  start: { x: number; y: number },
  end: { x: number; y: number },
  tolerance = 0.001,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const cuts = new Set<number>([0, 1]);
  for (const region of regions) {
    for (const x of [region.x, region.x + region.width]) {
      if (Math.abs(dx) > 1e-9) {
        const t = (x - start.x) / dx;
        if (t > 0 && t < 1) cuts.add(t);
      }
    }
    for (const y of [region.y, region.y + region.height]) {
      if (Math.abs(dy) > 1e-9) {
        const t = (y - start.y) / dy;
        if (t > 0 && t < 1) cuts.add(t);
      }
    }
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  const at = (t: number) => ({ x: start.x + dx * t, y: start.y + dy * t });
  if (!floorShapeContainsPoint(regions, start.x, start.y, tolerance)
    || !floorShapeContainsPoint(regions, end.x, end.y, tolerance)) return false;
  return sorted.slice(0, -1).every((t, index) => {
    const midpoint = at((t + sorted[index + 1]) / 2);
    return floorShapeContainsPoint(regions, midpoint.x, midpoint.y, tolerance);
  });
}

/** Checks every segment in an authored polyline against the combined Floor
 * union. This permits travel across internal base/extension seams while
 * rejecting any segment that cuts through a concave outside notch. */
export function floorShapeContainsPolyline(
  regions: FloorShapeRect[],
  points: { x: number; y: number }[],
  tolerance = 0.001,
) {
  return points.every((point) => floorShapeContainsPoint(regions, point.x, point.y, tolerance))
    && points.slice(1).every((point, index) => floorShapeContainsSegment(regions, points[index], point, tolerance));
}

/** Checks a complete physical polygon against the union, including concave
 * outside notches. Polygon edges may cross the base/extension seam freely. */
export function floorShapeContainsPolygon(
  regions: FloorShapeRect[],
  polygon: { x: number; y: number }[],
  tolerance = 0.001,
) {
  if (polygon.length < 3) return polygon.every((point) => floorShapeContainsPoint(regions, point.x, point.y, tolerance));
  for (let index = 0; index < polygon.length; index += 1) {
    if (!floorShapeContainsSegment(regions, polygon[index], polygon[(index + 1) % polygon.length], tolerance)) return false;
  }

  const minX = Math.min(...polygon.map((point) => point.x));
  const maxX = Math.max(...polygon.map((point) => point.x));
  const minY = Math.min(...polygon.map((point) => point.y));
  const maxY = Math.max(...polygon.map((point) => point.y));
  const xs = [...new Set([minX, maxX, ...regions.flatMap((region) => [region.x, region.x + region.width]).filter((x) => x > minX && x < maxX)])].sort((a, b) => a - b);
  const ys = [...new Set([minY, maxY, ...regions.flatMap((region) => [region.y, region.y + region.height]).filter((y) => y > minY && y < maxY)])].sort((a, b) => a - b);
  const cellIntersectsPolygon = (left: number, top: number, right: number, bottom: number) => {
    const strictlyInsideCell = (point: { x: number; y: number }) => point.x > left + 1e-8 && point.x < right - 1e-8
      && point.y > top + 1e-8 && point.y < bottom - 1e-8;
    if (polygon.some(strictlyInsideCell)) return true;
    const corners = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
    if (corners.some((point) => pointInPolygon(point, polygon))) return true;
    if (pointInPolygon({ x: (left + right) / 2, y: (top + bottom) / 2 }, polygon)) return true;
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      // A segment intersects the open cell when its parameter interval inside
      // the cell has non-zero length. This rejects even a thin diagonal sliver.
      let lo = 0;
      let hi = 1;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      for (const [p, q] of [[-dx, a.x - left], [dx, right - a.x], [-dy, a.y - top], [dy, bottom - a.y]]) {
        if (Math.abs(p) < 1e-12) {
          if (q < 1e-8) { lo = 1; hi = 0; break; }
          continue;
        }
        const t = q / p;
        if (p < 0) lo = Math.max(lo, t);
        else hi = Math.min(hi, t);
      }
      if (hi - lo > 1e-8) {
        const midpoint = { x: a.x + dx * (lo + hi) / 2, y: a.y + dy * (lo + hi) / 2 };
        if (strictlyInsideCell(midpoint)) return true;
      }
    }
    return false;
  };

  for (let ix = 0; ix < xs.length - 1; ix += 1) {
    for (let iy = 0; iy < ys.length - 1; iy += 1) {
      const left = xs[ix];
      const right = xs[ix + 1];
      const top = ys[iy];
      const bottom = ys[iy + 1];
      if (!floorShapeContainsPoint(regions, (left + right) / 2, (top + bottom) / 2, 0)
        && cellIntersectsPolygon(left, top, right, bottom)) return false;
    }
  }
  return true;
}

/** Returns the nearest point in the physical Floor union. Used for authoring
 * gestures that need a valid starting point near an outer or concave edge. */
export function closestPointInFloorShape(regions: FloorShapeRect[], point: { x: number; y: number }) {
  if (floorShapeContainsPoint(regions, point.x, point.y)) return point;
  let closest = { x: regions[0]?.x ?? 0, y: regions[0]?.y ?? 0 };
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const region of regions) {
    const candidate = {
      x: Math.max(region.x, Math.min(region.x + region.width, point.x)),
      y: Math.max(region.y, Math.min(region.y + region.height, point.y)),
    };
    const distance = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
    if (distance < bestDistance) { bestDistance = distance; closest = candidate; }
  }
  return closest;
}

/** Snap to the actual external outline of the combined Floor shape. Shared
 * base/extension edges are omitted from the derived boundary, so authoring
 * never treats the internal seam as an outside wall. */
export function snapPointToFloorShapeBoundary(
  regions: FloorShapeRect[],
  point: { x: number; y: number },
  threshold = 8,
) {
  let best: { x: number; y: number; distance: number } | null = null;
  for (const segment of getFloorShapeBoundarySegments(regions)) {
    const minX = Math.min(segment.x1, segment.x2);
    const maxX = Math.max(segment.x1, segment.x2);
    const minY = Math.min(segment.y1, segment.y2);
    const maxY = Math.max(segment.y1, segment.y2);
    const candidate = {
      x: Math.max(minX, Math.min(maxX, point.x)),
      y: Math.max(minY, Math.min(maxY, point.y)),
    };
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (distance <= threshold && (!best || distance < best.distance)) best = { ...candidate, distance };
  }
  return best ? { x: best.x, y: best.y } : null;
}

/** Constrains a rigid set of authored points to the Floor union. */
export function constrainFloorShapePointsDelta(
  regions: FloorShapeRect[],
  points: { x: number; y: number }[],
  dx: number,
  dy: number,
) {
  const fits = (fraction: number) => points.every((point) => floorShapeContainsPoint(regions, point.x + dx * fraction, point.y + dy * fraction));
  if (fits(1)) return { dx, dy };
  if (!fits(0)) return { dx: 0, dy: 0 };
  let low = 0;
  let high = 1;
  for (let index = 0; index < 24; index += 1) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return { dx: dx * low, dy: dy * low };
}

/** Checks rectangular object bounds against the union without treating the
 * internal base/extension seam as an outside edge. */
export function floorShapeContainsRect(regions: FloorShapeRect[], rect: FloorShapeRect, tolerance = 0.5) {
  const x0 = rect.x + tolerance;
  const y0 = rect.y + tolerance;
  const x1 = rect.x + rect.width - tolerance;
  const y1 = rect.y + rect.height - tolerance;
  if (x1 < x0 || y1 < y0) return floorShapeContainsPoint(regions, (rect.x * 2 + rect.width) / 2, (rect.y * 2 + rect.height) / 2);
  const xs = new Set<number>([x0, x1]);
  const ys = new Set<number>([y0, y1]);
  for (const region of regions) {
    if (region.x > x0 && region.x < x1) xs.add(region.x);
    if (region.x + region.width > x0 && region.x + region.width < x1) xs.add(region.x + region.width);
    if (region.y > y0 && region.y < y1) ys.add(region.y);
    if (region.y + region.height > y0 && region.y + region.height < y1) ys.add(region.y + region.height);
  }
  const sortedX = [...xs].sort((a, b) => a - b);
  const sortedY = [...ys].sort((a, b) => a - b);
  for (let ix = 0; ix < sortedX.length - 1; ix += 1) {
    for (let iy = 0; iy < sortedY.length - 1; iy += 1) {
      if (!floorShapeContainsPoint(regions, (sortedX[ix] + sortedX[ix + 1]) / 2, (sortedY[iy] + sortedY[iy + 1]) / 2, 0)) return false;
    }
  }
  return floorShapeContainsPoint(regions, (x0 + x1) / 2, (y0 + y1) / 2, 0);
}

/** Find the least-disruptive placement of an axis-aligned footprint wholly in
 * the usable union. A footprint already crossing an internal seam is kept as
 * is whenever the union contains it. */
export function constrainRectToFloorShape(regions: FloorShapeRect[], rect: FloorShapeRect) {
  if (floorShapeContainsRect(regions, rect)) return { x: rect.x, y: rect.y };
  let best: { x: number; y: number; distance: number } | null = null;
  for (const region of regions) {
    if (rect.width > region.width || rect.height > region.height) continue;
    const x = Math.max(region.x, Math.min(region.x + region.width - rect.width, rect.x));
    const y = Math.max(region.y, Math.min(region.y + region.height - rect.height, rect.y));
    if (!floorShapeContainsRect(regions, { ...rect, x, y })) continue;
    const distance = (x - rect.x) ** 2 + (y - rect.y) ** 2;
    if (!best || distance < best.distance) best = { x, y, distance };
  }
  return best ? { x: best.x, y: best.y } : closestPointInFloorShape(regions, { x: rect.x, y: rect.y });
}

/** Finds the external outline of the rectangle union. Shared base/extension
 * edges cancel, so the connection seam never becomes a perimeter wall. */
export function getFloorShapeBoundarySegments(regions: FloorShapeRect[]): FloorShapeBoundarySegment[] {
  const xs = [...new Set(regions.flatMap((region) => [region.x, region.x + region.width]))].sort((a, b) => a - b);
  const ys = [...new Set(regions.flatMap((region) => [region.y, region.y + region.height]))].sort((a, b) => a - b);
  const occupied = (ix: number, iy: number) => {
    if (ix < 0 || iy < 0 || ix >= xs.length - 1 || iy >= ys.length - 1) return false;
    return floorShapeContainsPoint(regions, (xs[ix] + xs[ix + 1]) / 2, (ys[iy] + ys[iy + 1]) / 2, 0);
  };
  const raw: FloorShapeBoundarySegment[] = [];
  for (let ix = 0; ix < xs.length - 1; ix += 1) {
    for (let iy = 0; iy < ys.length - 1; iy += 1) {
      if (!occupied(ix, iy)) continue;
      if (!occupied(ix, iy - 1)) raw.push({ x1: xs[ix], y1: ys[iy], x2: xs[ix + 1], y2: ys[iy], side: "top" });
      if (!occupied(ix, iy + 1)) raw.push({ x1: xs[ix + 1], y1: ys[iy + 1], x2: xs[ix], y2: ys[iy + 1], side: "bottom" });
      if (!occupied(ix - 1, iy)) raw.push({ x1: xs[ix], y1: ys[iy + 1], x2: xs[ix], y2: ys[iy], side: "left" });
      if (!occupied(ix + 1, iy)) raw.push({ x1: xs[ix + 1], y1: ys[iy], x2: xs[ix + 1], y2: ys[iy + 1], side: "right" });
    }
  }
  const merged: FloorShapeBoundarySegment[] = [];
  for (const segment of raw) {
    const horizontal = Math.abs(segment.y2 - segment.y1) < 0.001;
    const key = (candidate: FloorShapeBoundarySegment) => horizontal
      ? candidate.side === segment.side && Math.abs(candidate.y1 - segment.y1) < 0.001 && Math.abs(candidate.y2 - candidate.y1) < 0.001
      : candidate.side === segment.side && Math.abs(candidate.x1 - segment.x1) < 0.001 && Math.abs(candidate.x2 - candidate.x1) < 0.001;
    const low = horizontal ? Math.min(segment.x1, segment.x2) : Math.min(segment.y1, segment.y2);
    const high = horizontal ? Math.max(segment.x1, segment.x2) : Math.max(segment.y1, segment.y2);
    const candidate = merged.find((item) => key(item) && (horizontal
      ? low <= Math.max(item.x1, item.x2) + 0.001 && high >= Math.min(item.x1, item.x2) - 0.001
      : low <= Math.max(item.y1, item.y2) + 0.001 && high >= Math.min(item.y1, item.y2) - 0.001));
    if (!candidate) {
      merged.push({ ...segment });
      continue;
    }
    if (horizontal) {
      const left = Math.min(low, candidate.x1, candidate.x2);
      const right = Math.max(high, candidate.x1, candidate.x2);
      const forward = candidate.x2 >= candidate.x1;
      candidate.x1 = forward ? left : right;
      candidate.x2 = forward ? right : left;
    } else {
      const top = Math.min(low, candidate.y1, candidate.y2);
      const bottom = Math.max(high, candidate.y1, candidate.y2);
      const forward = candidate.y2 >= candidate.y1;
      candidate.y1 = forward ? top : bottom;
      candidate.y2 = forward ? bottom : top;
    }
  }
  return merged;
}

function samePoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001;
}

function segmentDirection(segment: FloorShapeBoundarySegment) {
  if (Math.abs(segment.x2 - segment.x1) >= Math.abs(segment.y2 - segment.y1)) return segment.x2 >= segment.x1 ? 0 : 2;
  return segment.y2 >= segment.y1 ? 1 : 3;
}

/** Orders the exterior segments into closed loops and removes collinear
 * intermediate points. Each loop is one continuous SVG outline, so miter joins
 * close concave and convex corners without per-segment butt-cap gaps. */
export function getFloorShapeOutlineLoops(segments: FloorShapeBoundarySegment[]) {
  const remaining = new Set(segments.map((_, index) => index));
  const loops: { x: number; y: number }[][] = [];
  const turnRank = (from: number, to: number) => {
    const turn = (to - from + 4) % 4;
    // Boundary edges keep the filled Floor on their right: at a junction,
    // prefer the rightmost continuation so corner-touching contours stay apart.
    return turn === 1 ? 0 : turn === 0 ? 1 : turn === 3 ? 2 : 3;
  };

  while (remaining.size > 0) {
    const firstIndex = remaining.values().next().value as number;
    const first = segments[firstIndex];
    const start = { x: first.x1, y: first.y1 };
    const points = [start];
    let current = first;
    remaining.delete(firstIndex);
    let guard = segments.length + 1;

    while (guard-- > 0) {
      const end = { x: current.x2, y: current.y2 };
      if (samePoint(end, start)) break;
      points.push(end);
      const fromDirection = segmentDirection(current);
      const nextIndex = [...remaining]
        .filter((index) => samePoint({ x: segments[index].x1, y: segments[index].y1 }, end))
        .sort((a, b) => turnRank(fromDirection, segmentDirection(segments[a])) - turnRank(fromDirection, segmentDirection(segments[b])) || a - b)[0];
      if (nextIndex === undefined) break;
      current = segments[nextIndex];
      remaining.delete(nextIndex);
    }

    if (points.length < 3) continue;
    const simplified = points.filter((point, index) => {
      const previous = points[(index - 1 + points.length) % points.length];
      const next = points[(index + 1) % points.length];
      return Math.abs((point.x - previous.x) * (next.y - point.y) - (point.y - previous.y) * (next.x - point.x)) >= 0.001;
    });
    loops.push(simplified.length >= 3 ? simplified : points);
  }
  return loops;
}

export function floorShapeBoundaryPath(segments: FloorShapeBoundarySegment[]) {
  return getFloorShapeOutlineLoops(segments)
    .map((points) => `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} Z`)
    .join(" ");
}

export function createFloorPerimeterWalls(
  floorId: string,
  canvasW: number,
  canvasH: number,
  extensions: FloorExtension[] | undefined,
  settings: { perimeterThickness: number; perimeterMaterial: string; perimeterColor: string },
  existingWalls: FloorWall[] = [],
  preserveExtensionDimensions = false,
): FloorWall[] {
  const existing = existingWalls.filter((wall) => wall.managedKind === "perimeter");
  const used = new Set<string>();
  return getFloorShapeBoundarySegments(getFloorShapeRegions({ canvasW, canvasH, extensions, preserveExtensionDimensions })).map((segment, index) => {
    const sameSegment = existing.find((wall) => !used.has(wall.id)
      && ((Math.hypot(wall.x1 - segment.x1, wall.y1 - segment.y1) < 0.1 && Math.hypot(wall.x2 - segment.x2, wall.y2 - segment.y2) < 0.1)
        || (Math.hypot(wall.x1 - segment.x2, wall.y1 - segment.y2) < 0.1 && Math.hypot(wall.x2 - segment.x1, wall.y2 - segment.y1) < 0.1)));
    if (sameSegment) used.add(sameSegment.id);
    const priorSide = existing.find((wall) => wall.perimeterSide === segment.side && !used.has(wall.id));
    const id = sameSegment?.id ?? priorSide?.id ?? `managed-perimeter-${floorId}-${segment.side}-${index + 1}`;
    if (!sameSegment && priorSide) used.add(priorSide.id);
    return {
      ...(sameSegment ?? {}),
      id,
      x1: segment.x1,
      y1: segment.y1,
      x2: segment.x2,
      y2: segment.y2,
      thickness: settings.perimeterThickness,
      material: settings.perimeterMaterial,
      color: settings.perimeterColor,
      managedKind: "perimeter",
      perimeterSide: segment.side,
      layer: "structure",
      visible: sameSegment?.visible ?? priorSide?.visible ?? true,
      locked: true,
      zOrder: sameSegment?.zOrder ?? -100 + index,
    };
  });
}
