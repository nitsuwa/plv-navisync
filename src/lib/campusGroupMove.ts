/**
 * Pure helpers for B2 multi-object movement on the outdoor campus canvas.
 *
 * A multi-selection of buildings and decorative assets is dragged as ONE rigid
 * group: the anchor (the grabbed object) is grid-snapped, the group bounding
 * box is edge-snapped against non-group buildings, and the whole group is
 * clamped to the canvas — all without distorting the internal spacing between
 * members (every member receives the exact same translation).
 *
 * These functions contain no React or DOM logic so they can be unit-tested
 * directly (see src/lib/__tests__/campusGroupMove.test.ts).
 */

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
}

/** A rectangle used as an edge-snap target (other, non-group buildings). */
export interface GroupEdgeRect {
  x: number;
  y: number;
  width: number;
  height: number;
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

  // Group bounding box (top-left based) BEFORE translation.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const m of p.members) {
    const left = m.kind === "decorAsset" ? m.x - m.width / 2 : m.x;
    const top = m.kind === "decorAsset" ? m.y - m.height / 2 : m.y;
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, left + m.width);
    maxY = Math.max(maxY, top + m.height);
  }
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;

  // 2. Rigid edge-snap of the group bounding box against non-group buildings.
  if (p.edgeSnap !== false && p.otherBuildings && p.otherBuildings.length > 0) {
    const threshold = p.edgeThreshold ?? 12;
    const snapVal = (val: number, target: number) => (Math.abs(val - target) <= threshold ? target : val);
    let bx = minX + dx;
    let by = minY + dy;
    for (const o of p.otherBuildings) {
      bx = snapVal(bx, o.x);
      bx = snapVal(bx, o.x + o.width);
      bx = snapVal(bx + bboxW, o.x) - bboxW;
      bx = snapVal(bx + bboxW, o.x + o.width) - bboxW;
      by = snapVal(by, o.y);
      by = snapVal(by, o.y + o.height);
      by = snapVal(by + bboxH, o.y) - bboxH;
      by = snapVal(by + bboxH, o.y + o.height) - bboxH;
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
    const left = (m.kind === "decorAsset" ? m.x - m.width / 2 : m.x) + dx;
    const top = (m.kind === "decorAsset" ? m.y - m.height / 2 : m.y) + dy;
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, left + m.width);
    maxY = Math.max(maxY, top + m.height);
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
    // Vertical alignment targets
    pushVertical(o.x);
    pushVertical(o.x + o.width);
    pushVertical(o.x + o.width / 2);
    // Horizontal alignment targets
    if (Math.abs(o.y - minY) < threshold) guides.push({ type: "h", pos: minY });
    if (Math.abs(o.y - (minY + height)) < threshold) guides.push({ type: "h", pos: minY + height });
    if (Math.abs(o.y + o.height - minY) < threshold) guides.push({ type: "h", pos: minY });
    if (Math.abs(o.y + o.height - (minY + height)) < threshold) guides.push({ type: "h", pos: minY + height });
    if (Math.abs(o.y + o.height / 2 - bboxCenterY) < threshold) guides.push({ type: "h", pos: bboxCenterY });
  }
  return guides;
}
