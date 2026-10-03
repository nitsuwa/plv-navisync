import type { LayoutItem } from "./eventLayoutGeometry";

export interface EventAlignmentGuide {
  axis: "x" | "y";
  value: number;
  from: number;
  to: number;
  kind: "edge" | "center";
  itemId: string;
  delta: number;
}

export interface EventGapGuide {
  axis: "x" | "y";
  from: number;
  to: number;
  cross: number;
  distance: number;
  itemId: string;
}

const clean = (value: number) => Math.round(value * 1e9) / 1e9;

function footprint(item: LayoutItem) {
  const angle = (item.rotation ?? 0) * Math.PI / 180;
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  const halfWidth = (Math.abs(Math.cos(angle)) * item.width + Math.abs(Math.sin(angle)) * item.height) / 2;
  const halfHeight = (Math.abs(Math.sin(angle)) * item.width + Math.abs(Math.cos(angle)) * item.height) / 2;
  return { left: clean(cx - halfWidth), right: clean(cx + halfWidth), top: clean(cy - halfHeight), bottom: clean(cy + halfHeight), cx, cy };
}

/** Advisory guides in map units. Rotated assets use their axis-aligned footprint.
 * Returns at most one nearest alignment and one nearest positive gap per axis.
 * Never changes furniture coordinates or implies a calibrated physical distance.
 */
export function eventPlacementGuides(selected: LayoutItem, items: readonly LayoutItem[], tolerance = 3): { alignments: EventAlignmentGuide[]; gaps: EventGapGuide[] } {
  const current = footprint(selected);
  const alignments = new Map<"x" | "y", EventAlignmentGuide>();
  const gaps = new Map<"x" | "y", EventGapGuide>();
  for (const item of items) {
    if (item.id === selected.id) continue;
    const other = footprint(item);
    for (const axis of ["x", "y"] as const) {
      const currentEdges = axis === "x" ? [current.left, current.right] : [current.top, current.bottom];
      const otherEdges = axis === "x" ? [other.left, other.right] : [other.top, other.bottom];
      const candidates: Pick<EventAlignmentGuide, "value" | "delta" | "kind">[] = currentEdges.flatMap((value) => otherEdges.map((target) => ({ value: target, delta: clean(target - value), kind: "edge" })));
      candidates.push({ value: axis === "x" ? other.cx : other.cy, delta: clean(axis === "x" ? other.cx - current.cx : other.cy - current.cy), kind: "center" });
      for (const candidate of candidates) {
        if (Math.abs(candidate.delta) > Math.max(0, tolerance)) continue;
        const previous = alignments.get(axis);
        if (previous && Math.abs(previous.delta) <= Math.abs(candidate.delta)) continue;
        alignments.set(axis, { ...candidate, axis, itemId: item.id, from: axis === "x" ? Math.min(current.top, other.top) : Math.min(current.left, other.left), to: axis === "x" ? Math.max(current.bottom, other.bottom) : Math.max(current.right, other.right) });
      }
      const overlapStart = axis === "x" ? Math.max(current.top, other.top) : Math.max(current.left, other.left);
      const overlapEnd = axis === "x" ? Math.min(current.bottom, other.bottom) : Math.min(current.right, other.right);
      if (overlapEnd <= overlapStart) continue;
      let from: number;
      let to: number;
      if (currentEdges[1] < otherEdges[0]) { from = currentEdges[1]; to = otherEdges[0]; }
      else if (otherEdges[1] < currentEdges[0]) { from = otherEdges[1]; to = currentEdges[0]; }
      else continue;
      const distance = clean(to - from);
      if (!gaps.has(axis) || distance < gaps.get(axis)!.distance) gaps.set(axis, { axis, from, to, cross: clean((overlapStart + overlapEnd) / 2), distance, itemId: item.id });
    }
  }
  return { alignments: [...alignments.values()], gaps: [...gaps.values()] };
}
