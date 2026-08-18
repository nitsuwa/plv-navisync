/**
 * Pure helpers for B2 multi-object movement on the outdoor campus canvas.
 *
 * A multi-selection of buildings and decorative assets is dragged as ONE rigid
 * group: the anchor (the grabbed object) is grid-snapped, the group bounding
 * box is edge-snapped against non-group buildings, and the whole group is
 * clamped to the canvas — all without distorting the internal spacing between
 * members (every member receives the exact same translation).
 *
 * Alignment compares ACTUAL VISIBLE WORLD-SPACE BOUNDS: when a member or a
 * reference carries a rotation, its visible axis-aligned bounding box (AABB)
 * is derived first and all edge/center comparisons use those visible extents,
 * so a rotated building's visible side can align with another building's
 * visible bottom/top/left/right regardless of rotation angle.
 *
 * These functions contain no React or DOM logic so they can be unit-tested
 * directly (see src/lib/__tests__/campusGroupMove.test.ts).
 */

import { rotatedRectBounds } from "./floorGeometry";

/**
 * A member of a group drag. Buildings are positioned by their top-left corner
 * (x, y); decorative assets are positioned by their CENTER (x, y), so the
 * helper treats the provided width/height as the full world-space extent
 * centered on (x, y).
 */
export interface GroupMoveMember {
  kind: "building" | "decorAsset" | "path";
  id: string;
  /** Building/path bounds: top-left x. Decor asset: center x. */
  x: number;
  /** Building/path bounds: top-left y. Decor asset: center y. */
  y: number;
  /** Full world-space width (decor uses the shared rendered decorWorldSize). */
  width: number;
  /** Full world-space height. */
  height: number;
  /** Rotation in degrees (buildings only). When set, visible AABB is used. */
  rotation?: number;
}

/** A rectangle used as an edge-snap target (other, non-group buildings). */
export interface GroupEdgeRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation in degrees. When set, visible AABB is used. */
  rotation?: number;
}

/**
 * The visible axis-aligned bounding box (world-space extents) of a member.
 * Rotated buildings use their rotated AABB; everything else is unrotated.
 */
export function memberVisibleBounds(m: GroupMoveMember): { x: number; y: number; width: number; height: number } {
  if (m.kind === "decorAsset") {
    // Center-positioned: translate to top-left bounds.
    const left = m.x - m.width / 2;
    const top = m.y - m.height / 2;
    if (m.rotation) {
      const b = rotatedRectBounds(left, top, m.width, m.height, m.rotation);
      return { x: b.x, y: b.y, width: b.w, height: b.h };
    }
    return { x: left, y: top, width: m.width, height: m.height };
  }
  if (m.rotation) {
    const b = rotatedRectBounds(m.x, m.y, m.width, m.height, m.rotation);
    return { x: b.x, y: b.y, width: b.w, height: b.h };
  }
  return { x: m.x, y: m.y, width: m.width, height: m.height };
}

/** The visible AABB of a reference rect (other building). */
export function rectVisibleBounds(r: GroupEdgeRect): { x: number; y: number; width: number; height: number } {
  if (r.rotation) {
    const b = rotatedRectBounds(r.x, r.y, r.width, r.height, r.rotation);
    return { x: b.x, y: b.y, width: b.w, height: b.h };
  }
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/**
 * A rotatable rectangular building (used by the single-building drag path).
 */
export interface RotatableRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

/**
 * Snap a dragged building's VISIBLE bounds to nearby buildings' VISIBLE
 * bounds and produce the alignment guides from the SAME result.
 *
 * Both the dragged rect and every reference are converted to their visible
 * world-space AABB (rotation-aware), and the dragged AABB's left/right/
 * top/bottom/center X/center Y are compared against each reference AABB's
 * matching extents. When a pair is within `threshold` world units, the
 * dragged building is shifted by the exact delta that makes the two extents
 * coincide and a guide line is emitted at the matched reference extent.
 *
 * Returns the shifted top-left position (dx applied to x/y — translation of
 * a rotated rect translates its AABB 1:1) plus the guide lines.
 */
export function snapRectToVisibleBounds(
  rect: RotatableRect,
  refs: GroupEdgeRect[],
  threshold = 12,
): { x: number; y: number; guides: { type: "h" | "v"; pos: number }[] } {
  const aabb = rectVisibleBounds(rect);
  let bestDx = 0;
  let bestDy = 0;
  let bestXDist = threshold + 1;
  let bestYDist = threshold + 1;
  // The matched reference extent (world-space coordinate the guide is drawn at).
  let bestGuideX: number | null = null;
  let bestGuideY: number | null = null;
  const guides: { type: "h" | "v"; pos: number }[] = [];

  const candLeft = aabb.x;
  const candRight = aabb.x + aabb.width;
  const candCX = aabb.x + aabb.width / 2;
  const candTop = aabb.y;
  const candBottom = aabb.y + aabb.height;
  const candCY = aabb.y + aabb.height / 2;

  for (const ref of refs) {
    const rb = rectVisibleBounds(ref);
    const rLeft = rb.x;
    const rRight = rb.x + rb.width;
    const rCX = rb.x + rb.width / 2;
    const rTop = rb.y;
    const rBottom = rb.y + rb.height;
    const rCY = rb.y + rb.height / 2;

    // ── X-axis: left / right / center X vs reference left / right / center X ──
    for (const from of [candLeft, candRight, candCX]) {
      for (const target of [rLeft, rRight, rCX]) {
        const d = Math.abs(from - target);
        if (d <= threshold && d < bestXDist) {
          bestXDist = d;
          bestDx = target - from;
          bestGuideX = target;
        }
      }
    }
    // ── Y-axis: top / bottom / center Y vs reference top / bottom / center Y ──
    for (const from of [candTop, candBottom, candCY]) {
      for (const target of [rTop, rBottom, rCY]) {
        const d = Math.abs(from - target);
        if (d <= threshold && d < bestYDist) {
          bestYDist = d;
          bestDy = target - from;
          bestGuideY = target;
        }
      }
    }
  }

  // Build guides from the SAME match that drove the snap: emit a guide line
  // at the matched reference extent when the snap actually fired.
  if (bestXDist <= threshold && bestGuideX !== null) {
    guides.push({ type: "v", pos: bestGuideX });
  }
  if (bestYDist <= threshold && bestGuideY !== null) {
    guides.push({ type: "h", pos: bestGuideY });
  }

  return {
    x: rect.x + (bestXDist <= threshold ? bestDx : 0),
    y: rect.y + (bestYDist <= threshold ? bestDy : 0),
    guides,
  };
}

export interface ComputeGroupTranslationParams {
  /** Every selected movable member of the group (buildings + decor assets). */
  members: GroupMoveMember[];
  /** The member the pointer grabbed (must exist in `members`). */
  draggedId: string;
  /** Raw pointer delta in world units since the drag started. */
  rawDx: number;
  rawDy: number;
  canvasW: number;
  canvasH: number;
  /** When true, the group anchor snaps to the grid as a rigid unit. */
  snapGrid: boolean;
  /** Grid size in canvas units (default 20 — matches the editor's snap()). */
  gridSize?: number;
  /** Non-group buildings that the group's bounding box may edge-snap to. */
  otherBuildings?: GroupEdgeRect[];
  /** When false, skips edge snapping (default true). */
  edgeSnap?: boolean;
  /** Edge-snap distance threshold in canvas units (default 12). */
  edgeThreshold?: number;
}

export interface GroupTranslation {
  /** Final translation to apply to EVERY group member (rigid). */
  dx: number;
  dy: number;
}

/**
 * Compute the rigid group translation for one drag gesture step.
 *
 * Order of operations:
 * 1. Grid-snap the anchor's new position (the grabbed object) — the same
 *    snap() the editor uses for single-object drags.
 * 2. Edge-snap the group's bounding box against non-group buildings so the
 *    whole box aligns as one unit (internal spacing untouched).
 * 3. Clamp the whole group inside the canvas bounds.
 *
 * @returns the single (dx, dy) to add to every member's original position.
 */
export function computeGroupTranslation(p: ComputeGroupTranslationParams): GroupTranslation {
  const grid = p.gridSize ?? 20;
  const snapV = (v: number) => (p.snapGrid ? Math.round(v / grid) * grid : Math.round(v));

  const anchor = p.members.find((m) => m.id === p.draggedId) ?? p.members[0];
  if (!anchor) return { dx: 0, dy: 0 };

  // 1. Grid-snap the anchor position (preserving the pointer grab offset).
  const snappedX = snapV(anchor.x + p.rawDx);
  const snappedY = snapV(anchor.y + p.rawDy);
  let dx = snappedX - anchor.x;
  let dy = snappedY - anchor.y;

  // Group bounding box (top-left based) BEFORE translation — computed from each
  // member's VISIBLE bounds so rotated buildings participate with their AABB.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const m of p.members) {
    const b = memberVisibleBounds(m);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;

  // 2. Rigid edge-snap of the group bounding box against non-group buildings.
  // References are also compared by their visible AABB (rotation-aware).
  if (p.edgeSnap !== false && p.otherBuildings && p.otherBuildings.length > 0) {
    const threshold = p.edgeThreshold ?? 12;
    const snapVal = (val: number, target: number) => (Math.abs(val - target) <= threshold ? target : val);
    let bx = minX + dx;
    let by = minY + dy;
    for (const o of p.otherBuildings) {
      const ob = rectVisibleBounds(o);
      bx = snapVal(bx, ob.x);
      bx = snapVal(bx, ob.x + ob.width);
      bx = snapVal(bx + bboxW, ob.x) - bboxW;
      bx = snapVal(bx + bboxW, ob.x + ob.width) - bboxW;
      by = snapVal(by, ob.y);
      by = snapVal(by, ob.y + ob.height);
      by = snapVal(by + bboxH, ob.y) - bboxH;
      by = snapVal(by + bboxH, ob.y + ob.height) - bboxH;
    }
    dx += bx - (minX + dx);
    dy += by - (minY + dy);
  }

  // 3. Canvas-boundary clamp (rigid — shifts the entire group).
  const afterMinX = minX + dx;
  const afterMaxX = minX + bboxW + dx;
  const afterMinY = minY + dy;
  const afterMaxY = minY + bboxH + dy;
  if (afterMinX < 0) dx += -afterMinX;
  if (afterMaxX > p.canvasW) dx -= afterMaxX - p.canvasW;
  if (afterMinY < 0) dy += -afterMinY;
  if (afterMaxY > p.canvasH) dy -= afterMaxY - p.canvasH;

  return { dx, dy };
}

/**
 * Compute the group's top-left based bounding box AFTER applying a rigid
 * translation (dx, dy) to every member. Used for overlap checks and guides.
 */
export function groupBBoxAfterTranslation(
  members: GroupMoveMember[],
  dx: number,
  dy: number
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const m of members) {
    const b = memberVisibleBounds(m);
    minX = Math.min(minX, b.x + dx);
    minY = Math.min(minY, b.y + dy);
    maxX = Math.max(maxX, b.x + dx + b.width);
    maxY = Math.max(maxY, b.y + dy + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Compute alignment-guide positions for a group drag: the group's bounding box
 * edges and center aligned (within `threshold` world units) to non-group
 * building edges and centers. Visual-only — the guides never alter geometry.
 */
export function computeGroupAlignmentGuides(
  minX: number,
  minY: number,
  width: number,
  height: number,
  others: GroupEdgeRect[],
  threshold = 6
): { type: "h" | "v"; pos: number }[] {
  const guides: { type: "h" | "v"; pos: number }[] = [];
  const bboxCenterX = minX + width / 2;
  const bboxCenterY = minY + height / 2;
  const pushVertical = (pos: number) => {
    if (Math.abs(pos - minX) < threshold) guides.push({ type: "v", pos: minX });
    if (Math.abs(pos - (minX + width)) < threshold) guides.push({ type: "v", pos: minX + width });
    if (Math.abs(pos - bboxCenterX) < threshold) guides.push({ type: "v", pos: bboxCenterX });
  };
  for (const o of others) {
    // Compare against the reference's VISIBLE AABB so a rotated building's
    // visible side/center participates in the alignment comparison.
    const ob = rectVisibleBounds(o);
    // Vertical alignment targets
    pushVertical(ob.x);
    pushVertical(ob.x + ob.width);
    pushVertical(ob.x + ob.width / 2);
    // Horizontal alignment targets
    if (Math.abs(ob.y - minY) < threshold) guides.push({ type: "h", pos: minY });
    if (Math.abs(ob.y - (minY + height)) < threshold) guides.push({ type: "h", pos: minY + height });
    if (Math.abs(ob.y + ob.height - minY) < threshold) guides.push({ type: "h", pos: minY });
    if (Math.abs(ob.y + ob.height - (minY + height)) < threshold) guides.push({ type: "h", pos: minY + height });
    if (Math.abs(ob.y + ob.height / 2 - bboxCenterY) < threshold) guides.push({ type: "h", pos: bboxCenterY });
  }
  return guides;
}
