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
  kind: "building" | "decorAsset" | "path" | "marker";
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

/** A rectangle used as an edge-snap target for another physical object. */
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
  if (m.kind === "decorAsset" || m.kind === "marker") {
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
  /** Small physical-object inset from the canvas frame. */
  boundsInset?: number;
}

export interface GroupTranslation {
  /** Final translation to apply to EVERY group member (rigid). */
  dx: number;
  dy: number;
}

export type GroupResizeCorner = "nw" | "ne" | "sw" | "se";

export interface GroupResizeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Resolve the new outer frame for a physical multi-selection resize.  The
 * opposite corner stays fixed; the dragged corner is grid-snapped and the
 * frame is clamped to the canvas instead of moving any content implicitly.
 */
export function computeGroupResizeBounds(
  bounds: GroupResizeBounds,
  corner: GroupResizeCorner,
  pointer: { x: number; y: number },
  canvasW: number,
  canvasH: number,
  snapGrid = false,
  gridSize = 20,
  minSize = 20,
  boundsInset = 0,
): GroupResizeBounds {
  const snap = (value: number) => snapGrid ? Math.round(value / Math.max(1, gridSize)) * Math.max(1, gridSize) : Math.round(value);
  const fixedX = corner.includes("w") ? bounds.x + bounds.width : bounds.x;
  const fixedY = corner.includes("n") ? bounds.y + bounds.height : bounds.y;
  const pointerX = snap(pointer.x);
  const pointerY = snap(pointer.y);
  const dx = (pointerX - fixedX) * (corner.includes("w") ? -1 : 1);
  const dy = (pointerY - fixedY) * (corner.includes("n") ? -1 : 1);
  // A group keeps one aspect ratio while resizing.  Use the dominant pointer
  // axis so a corner drag feels responsive while the other axis follows the
  // original selection proportions.  This avoids the compounded/non-uniform
  // distortion that occurred when each member was resized from its previous
  // frame on every mousemove.
  const requestedScale = Math.max(
    dx / Math.max(1, bounds.width),
    dy / Math.max(1, bounds.height),
  );
  const inset = Math.max(0, Math.min(Math.min(canvasW, canvasH) / 2, boundsInset));
  const safeMaxX = Math.max(inset, canvasW - inset);
  const safeMaxY = Math.max(inset, canvasH - inset);
  const availableW = corner.includes("w") ? fixedX - inset : safeMaxX - fixedX;
  const availableH = corner.includes("n") ? fixedY - inset : safeMaxY - fixedY;
  const minimumScale = minSize / Math.max(1, Math.min(bounds.width, bounds.height));
  const maximumScale = Math.max(0.01, Math.min(
    availableW / Math.max(1, bounds.width),
    availableH / Math.max(1, bounds.height),
  ));
  // The fixed corner is assumed to be inside the canvas (as it is for a
  // normal selection).  Clamping the scale, rather than width and height
  // independently, keeps the outer frame and every member proportional.
  const scale = Math.min(maximumScale, Math.max(minimumScale, requestedScale));
  const width = Math.max(minSize, bounds.width * scale);
  const height = Math.max(minSize, bounds.height * scale);
  const x = corner.includes("w") ? fixedX - width : fixedX;
  const y = corner.includes("n") ? fixedY - height : fixedY;
  return { x, y, width, height };
}

/** Apply an outer-frame scale to physical members while preserving their
 * relative location in the original selection.  Building positions are
 * top-left based; decor and markers are center based. */
export function resizeGroupMembers(
  members: GroupMoveMember[],
  from: GroupResizeBounds,
  to: GroupResizeBounds,
): GroupMoveMember[] {
  const sx = from.width > 0 ? to.width / from.width : 1;
  const sy = from.height > 0 ? to.height / from.height : 1;
  return members.map((member) => {
    const visible = memberVisibleBounds(member);
    const centerX = visible.x + visible.width / 2;
    const centerY = visible.y + visible.height / 2;
    const nextCenterX = to.x + (centerX - from.x) * sx;
    const nextCenterY = to.y + (centerY - from.y) * sy;
    const width = Math.max(1, member.width * Math.abs(sx));
    const height = Math.max(1, member.height * Math.abs(sy));
    const centerPositioned = member.kind === "decorAsset" || member.kind === "marker";
    return {
      ...member,
      x: centerPositioned ? nextCenterX : nextCenterX - width / 2,
      y: centerPositioned ? nextCenterY : nextCenterY - height / 2,
      width,
      height,
    };
  });
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
  const inset = Math.max(0, Math.min(Math.min(p.canvasW, p.canvasH) / 2, p.boundsInset ?? 0));
  const safeMinX = inset;
  const safeMinY = inset;
  const safeMaxX = Math.max(safeMinX, p.canvasW - inset);
  const safeMaxY = Math.max(safeMinY, p.canvasH - inset);
  const afterMinX = minX + dx;
  const afterMaxX = minX + bboxW + dx;
  const afterMinY = minY + dy;
  const afterMaxY = minY + bboxH + dy;
  if (afterMinX < safeMinX) dx += safeMinX - afterMinX;
  if (afterMaxX > safeMaxX) dx -= afterMaxX - safeMaxX;
  if (afterMinY < safeMinY) dy += safeMinY - afterMinY;
  if (afterMaxY > safeMaxY) dy -= afterMaxY - safeMaxY;

  return { dx, dy };
}

/** Clamp a single rigidly-translated physical object by its visible bounds.
 * The returned delta applies equally to center- and top-left-positioned
 * objects and preserves size/rotation. */
export function clampMemberTranslation(
  member: GroupMoveMember,
  rawDx: number,
  rawDy: number,
  canvasW: number,
  canvasH: number,
  boundsInset = 0,
): GroupTranslation {
  const visible = memberVisibleBounds(member);
  const inset = Math.max(0, Math.min(Math.min(canvasW, canvasH) / 2, boundsInset));
  const minDx = inset - visible.x;
  const maxDx = Math.max(minDx, canvasW - inset - (visible.x + visible.width));
  const minDy = inset - visible.y;
  const maxDy = Math.max(minDy, canvasH - inset - (visible.y + visible.height));
  return {
    dx: Math.max(minDx, Math.min(maxDx, rawDx)),
    dy: Math.max(minDy, Math.min(maxDy, rawDy)),
  };
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
  const groupX = [minX, minX + width / 2, minX + width];
  const groupY = [minY, minY + height / 2, minY + height];
  let bestX: { distance: number; pos: number } | null = null;
  let bestY: { distance: number; pos: number } | null = null;
  for (const other of others) {
    const ref = rectVisibleBounds(other);
    const refX = [ref.x, ref.x + ref.width / 2, ref.x + ref.width];
    const refY = [ref.y, ref.y + ref.height / 2, ref.y + ref.height];
    for (const source of groupX) for (const target of refX) {
      const distance = Math.abs(source - target);
      if (distance <= threshold && (!bestX || distance < bestX.distance)) bestX = { distance, pos: target };
    }
    for (const source of groupY) for (const target of refY) {
      const distance = Math.abs(source - target);
      if (distance <= threshold && (!bestY || distance < bestY.distance)) bestY = { distance, pos: target };
    }
  }
  if (bestX) guides.push({ type: "v", pos: bestX.pos });
  if (bestY) guides.push({ type: "h", pos: bestY.pos });
  return guides;
}
