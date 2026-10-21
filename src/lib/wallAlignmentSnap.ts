export type WallAlignmentSegment = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  visible?: boolean;
  locked?: boolean;
};

export type WallAlignmentGuide = "h" | "v";

export type WallAlignmentSnap = {
  x: number;
  y: number;
  guide?: WallAlignmentGuide;
  edge?: { x1: number; y1: number; x2: number; y2: number };
  kind: "intersection" | "endpoint" | "segment" | "axis";
  distance: number;
  targetId: string;
};

export type WallTranslationSnap = {
  dx: number;
  dy: number;
  guide?: WallAlignmentGuide;
  point: { x: number; y: number };
  edge?: { x1: number; y1: number; x2: number; y2: number };
  kind: "intersection" | "endpoint" | "segment" | "axis";
  distance: number;
  targetId: string;
};

export type WallAlignmentAxisFeature = {
  axis: "x" | "y";
  value: number;
  targetId: string;
  edge: { x1: number; y1: number; x2: number; y2: number };
};

export type WallAlignmentAxisIndex = {
  x: WallAlignmentAxisFeature[];
  y: WallAlignmentAxisFeature[];
};

const EPSILON = 1e-8;

function pointDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function projectToSegment(point: { x: number; y: number }, wall: WallAlignmentSegment) {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared <= EPSILON ? 0 : Math.max(0, Math.min(1,
    ((point.x - wall.x1) * dx + (point.y - wall.y1) * dy) / lengthSquared));
  return { x: wall.x1 + t * dx, y: wall.y1 + t * dy };
}

function intersection(a: WallAlignmentSegment, b: WallAlignmentSegment) {
  const r = { x: a.x2 - a.x1, y: a.y2 - a.y1 };
  const s = { x: b.x2 - b.x1, y: b.y2 - b.y1 };
  const denominator = r.x * s.y - r.y * s.x;
  if (Math.abs(denominator) <= EPSILON) return null;
  const q = { x: b.x1 - a.x1, y: b.y1 - a.y1 };
  const t = (q.x * s.y - q.y * s.x) / denominator;
  const u = (q.x * r.y - q.y * r.x) / denominator;
  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return null;
  return { x: a.x1 + t * r.x, y: a.y1 + t * r.y };
}

function usable(wall: WallAlignmentSegment) {
  return wall.visible !== false && wall.locked !== true && Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) > EPSILON;
}

function wallFeatures(wall: WallAlignmentSegment) {
  const horizontal = Math.abs(wall.y2 - wall.y1) <= Math.abs(wall.x2 - wall.x1) * 0.1;
  const vertical = Math.abs(wall.x2 - wall.x1) <= Math.abs(wall.y2 - wall.y1) * 0.1;
  return {
    points: [
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 },
      { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 },
    ],
    horizontalY: horizontal ? (wall.y1 + wall.y2) / 2 : undefined,
    verticalX: vertical ? (wall.x1 + wall.x2) / 2 : undefined,
  };
}

/** Build once when the current floor's walls change. Sorted features let drag
 * handlers find same-X/Y alignments with a binary search, even when the guide
 * crosses a large empty part of the floor. */
export function buildWallAlignmentAxisIndex(walls: WallAlignmentSegment[]): WallAlignmentAxisIndex {
  const x: WallAlignmentAxisFeature[] = [];
  const y: WallAlignmentAxisFeature[] = [];
  for (const wall of walls.filter(usable)) {
    const edge = { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 };
    const features = wallFeatures(wall);
    for (const point of features.points) {
      x.push({ axis: "x", value: point.x, targetId: wall.id, edge });
      y.push({ axis: "y", value: point.y, targetId: wall.id, edge });
    }
    if (features.verticalX !== undefined) x.push({ axis: "x", value: features.verticalX, targetId: wall.id, edge });
    if (features.horizontalY !== undefined) y.push({ axis: "y", value: features.horizontalY, targetId: wall.id, edge });
  }
  const sort = (features: WallAlignmentAxisFeature[]) => features.sort((a, b) => a.value - b.value || a.targetId.localeCompare(b.targetId));
  return { x: sort(x), y: sort(y) };
}

function lowerBound(features: WallAlignmentAxisFeature[], value: number) {
  let low = 0;
  let high = features.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (features[middle].value < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function nearbyAxisFeatures(index: WallAlignmentAxisIndex, axis: "x" | "y", value: number, tolerance: number) {
  const features = index[axis];
  const start = lowerBound(features, value - tolerance);
  const result: WallAlignmentAxisFeature[] = [];
  for (let i = start; i < features.length && features[i].value <= value + tolerance; i += 1) result.push(features[i]);
  return result;
}

function choose<T extends { distance: number; priority: number; targetId: string }>(candidates: T[]) {
  return candidates.sort((a, b) => a.priority - b.priority
    || a.distance - b.distance
    || a.targetId.localeCompare(b.targetId))[0] ?? null;
}

/** Resolve a wall endpoint/draw cursor against local visible wall geometry.
 * Candidate selection is stateless, so moving outside tolerance releases the
 * snap on the very next pointer sample. */
export function resolveWallPointAlignment(
  point: { x: number; y: number },
  walls: WallAlignmentSegment[],
  tolerance: number,
  axisIndex = buildWallAlignmentAxisIndex(walls),
  excludedTargetIds: Set<string> = new Set(),
): WallAlignmentSnap | null {
  const targets = walls.filter(usable);
  const candidates: Array<WallAlignmentSnap & { priority: number }> = [];
  const add = (snap: WallAlignmentSnap, priority: number) => candidates.push({ ...snap, priority });

  for (let i = 0; i < targets.length; i += 1) {
    const wall = targets[i];
    const features = wallFeatures(wall);
    for (const other of targets.slice(i + 1)) {
      const crossing = intersection(wall, other);
      if (!crossing) continue;
      const distance = pointDistance(point, crossing);
      if (distance <= tolerance) add({ ...crossing, edge: { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 }, kind: "intersection", distance, targetId: `${wall.id}:${other.id}` }, 0);
    }
    for (const endpoint of [features.points[0], features.points[1]]) {
      const distance = pointDistance(point, endpoint);
      if (distance <= tolerance) {
        const dx = endpoint.x - point.x;
        const dy = endpoint.y - point.y;
        add({ ...endpoint, guide: Math.abs(dx) <= EPSILON ? "h" : Math.abs(dy) <= EPSILON ? "v" : undefined,
          kind: "endpoint", distance, targetId: wall.id }, 1);
      }
    }
    const projected = projectToSegment(point, wall);
    const projectionDistance = pointDistance(point, projected);
    if (projectionDistance <= tolerance) {
      const horizontal = Math.abs(wall.y2 - wall.y1) <= Math.abs(wall.x2 - wall.x1) * 0.1;
      const vertical = Math.abs(wall.x2 - wall.x1) <= Math.abs(wall.y2 - wall.y1) * 0.1;
      add({ ...projected, guide: horizontal ? "h" : vertical ? "v" : undefined,
        edge: { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 }, kind: "segment", distance: projectionDistance, targetId: wall.id }, 2);
    }

  }

  for (const axis of ["x", "y"] as const) {
    for (const feature of nearbyAxisFeatures(axisIndex, axis, point[axis], tolerance)) {
      if (excludedTargetIds.has(feature.targetId)) continue;
      const delta = feature.value - point[axis];
      const distance = Math.abs(delta);
      add({
        x: axis === "x" ? feature.value : point.x,
        y: axis === "y" ? feature.value : point.y,
        guide: axis === "x" ? "v" : "h",
        edge: feature.edge,
        kind: "axis", distance, targetId: feature.targetId,
      }, 3);
    }
  }

  const best = choose(candidates);
  if (!best) return null;
  const { priority: _priority, ...result } = best;
  return result;
}

/** Resolve one rigid translation for one or more walls. Full endpoint,
 * intersection, and segment connections win before one-axis alignment. */
export function resolveWallTranslationAlignment(
  movingWalls: WallAlignmentSegment[],
  targetWalls: WallAlignmentSegment[],
  tolerance: number,
  axisIndex = buildWallAlignmentAxisIndex(targetWalls),
  excludedTargetIds: Set<string> = new Set(),
): WallTranslationSnap | null {
  const moving = movingWalls.filter(usable);
  const targets = targetWalls.filter(usable);
  const candidates: Array<WallTranslationSnap & { priority: number }> = [];
  const add = (snap: WallTranslationSnap, priority: number) => candidates.push({ ...snap, priority });

  for (const source of moving) {
    const sourceFeatures = wallFeatures(source).points;
    for (const target of targets) {
      const targetFeatures = wallFeatures(target);
      for (const point of sourceFeatures) {
        for (const crossingWall of targets) {
          if (crossingWall.id === target.id) continue;
          const crossing = intersection(target, crossingWall);
          if (!crossing) continue;
          const dx = crossing.x - point.x;
          const dy = crossing.y - point.y;
          const distance = Math.hypot(dx, dy);
          if (distance <= tolerance) add({ dx, dy, point: crossing, edge: { x1: target.x1, y1: target.y1, x2: target.x2, y2: target.y2 }, kind: "intersection", distance, targetId: `${target.id}:${crossingWall.id}` }, 0);
        }
        for (const endpoint of [targetFeatures.points[0], targetFeatures.points[1]]) {
          const dx = endpoint.x - point.x;
          const dy = endpoint.y - point.y;
          const distance = Math.hypot(dx, dy);
          if (distance <= tolerance) add({ dx, dy, point: endpoint, guide: Math.abs(dx) <= EPSILON ? "h" : Math.abs(dy) <= EPSILON ? "v" : undefined, kind: "endpoint", distance, targetId: target.id }, 1);
        }
        const projection = projectToSegment(point, target);
        const projectionDistance = pointDistance(point, projection);
        if (projectionDistance <= tolerance) {
          const dx = projection.x - point.x;
          const dy = projection.y - point.y;
          add({ dx, dy, point: projection, guide: Math.abs(dx) <= EPSILON ? "h" : Math.abs(dy) <= EPSILON ? "v" : undefined,
            edge: { x1: target.x1, y1: target.y1, x2: target.x2, y2: target.y2 }, kind: "segment", distance: projectionDistance, targetId: target.id }, 2);
        }
      }

    }
  }

  for (const source of moving) for (const point of wallFeatures(source).points) for (const axis of ["x", "y"] as const) {
    for (const feature of nearbyAxisFeatures(axisIndex, axis, point[axis], tolerance)) {
      if (excludedTargetIds.has(feature.targetId)) continue;
      const delta = feature.value - point[axis];
      add({ dx: axis === "x" ? delta : 0, dy: axis === "y" ? delta : 0,
        point: { x: point.x + (axis === "x" ? delta : 0), y: point.y + (axis === "y" ? delta : 0) },
        guide: axis === "x" ? "v" : "h", edge: feature.edge, kind: "axis", distance: Math.abs(delta), targetId: feature.targetId }, 3);
    }
  }

  const best = choose(candidates);
  if (!best) return null;
  const { priority: _priority, ...result } = best;
  return result;
}
