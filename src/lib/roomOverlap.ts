/**
 * Room overlap detection utilities.
 *
 * Two rooms "overlap" when they share meaningful interior area — edge-touching
 * and boundary-adjacent rooms are ALLOWED (they share a wall). A small
 * tolerance prevents floating-point snap artifacts from false positives.
 */

import type { FloorRoom } from "../components/map-builder/types";
import { clamp } from "./floorGeometry";

/** Tolerance in units. Rooms whose overlap is entirely within this margin are
 *  treated as edge-touching (allowed). */
const OVERLAP_TOLERANCE = 2;

/**
 * Room-to-room edge snap threshold in units. When a candidate room's edge is
 * within this distance of an existing room's edge, snap it into alignment so
 * adjacent rooms line up cleanly.
 */
// Keep edge assistance close to the cursor.  A wide threshold made every
// movable Floor object feel magnetically locked to distant room edges.
const ROOM_EDGE_SNAP_THRESHOLD = 8;

/**
 * Axis-aligned bounding-box test (rooms are axis-aligned in the floor model).
 * Returns true when `a` and `b` share interior area beyond the tolerance.
 */
export function roomsOverlap(a: FloorRoom, b: FloorRoom): boolean {
  if (a.id === b.id) return false;

  // Rooms use (x, y, w, h) in world coordinates.
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);

  // No overlap at all — clearly fine.
  if (overlapX <= 0 || overlapY <= 0) return false;

  // Edge-touching: the overlap area is smaller than the tolerance on at least
  // one axis — two rooms that share a boundary (adjacent rooms separated by a
  // wall) should be allowed.
  if (overlapX <= OVERLAP_TOLERANCE || overlapY <= OVERLAP_TOLERANCE) return false;

  // Meaningful interior overlap.
  return true;
}

/**
 * Check whether a proposed room rectangle overlaps any existing room on the
 * floor. Returns the first overlapping room (or null if clear).
 */
export function findOverlappingRoom(
  candidate: { x: number; y: number; w: number; h: number; id?: string },
  rooms: FloorRoom[],
): FloorRoom | null {
  for (const room of rooms) {
    if (candidate.id && room.id === candidate.id) continue;
    const overlapX = Math.min(candidate.x + candidate.w, room.x + room.w) - Math.max(candidate.x, room.x);
    const overlapY = Math.min(candidate.y + candidate.h, room.y + room.h) - Math.max(candidate.y, room.y);
    if (overlapX > OVERLAP_TOLERANCE && overlapY > OVERLAP_TOLERANCE) return room;
  }
  return null;
}

/**
 * Strict room overlap check with ZERO tolerance. Used for keyboard movement
 * where even 1 unit of overlap must be prevented.
 */
export function findOverlappingRoomStrict(
  candidate: { x: number; y: number; w: number; h: number; id?: string },
  rooms: FloorRoom[],
): FloorRoom | null {
  for (const room of rooms) {
    if (candidate.id && room.id === candidate.id) continue;
    const overlapX = Math.min(candidate.x + candidate.w, room.x + room.w) - Math.max(candidate.x, room.x);
    const overlapY = Math.min(candidate.y + candidate.h, room.y + room.h) - Math.max(candidate.y, room.y);
    if (overlapX > 0 && overlapY > 0) return room;
  }
  return null;
}

/**
 * Clamp a keyboard nudge delta so the room cannot enter another room.
 * Returns the maximum valid {dx, dy} within the given step. Edge-to-edge
 * contact is allowed (overlapX or overlapY === 0).
 */
export function clampNudgeToEdge(
  room: FloorRoom,
  dx: number,
  dy: number,
  otherRooms: FloorRoom[],
  FP_W: number,
  FP_H: number,
): { dx: number; dy: number } {
  // Floor-bounds clamp first.
  let clampedDx = dx;
  let clampedDy = dy;
  if (room.x + dx < 0) clampedDx = -room.x;
  if (room.y + dy < 0) clampedDy = -room.y;
  if (room.x + room.w + dx > FP_W) clampedDx = FP_W - room.x - room.w;
  if (room.y + room.h + dy > FP_H) clampedDy = FP_H - room.y - room.h;
  // Now try the full clamped delta. If it overlaps, try each axis independently.
  const fullCandidate = { x: room.x + clampedDx, y: room.y + clampedDy, w: room.w, h: room.h, id: room.id };
  if (!findOverlappingRoomStrict(fullCandidate, otherRooms)) {
    return { dx: clampedDx, dy: clampedDy };
  }
  // Try X-only movement.
  const xOnly = { x: room.x + clampedDx, y: room.y, w: room.w, h: room.h, id: room.id };
  const yOnly = { x: room.x, y: room.y + clampedDy, w: room.w, h: room.h, id: room.id };
  const xBlocked = findOverlappingRoomStrict(xOnly, otherRooms);
  const yBlocked = findOverlappingRoomStrict(yOnly, otherRooms);
  // For each axis, find the exact maximum delta that avoids overlap.
  let bestDx = clampedDx;
  let bestDy = clampedDy;
  if (xBlocked) {
    // Find the nearest blocking edge in the movement direction.
    if (dx > 0) {
      // Moving right — find the nearest left edge of a room to our right.
      let maxRight = room.x + room.w + dx;
      for (const other of otherRooms) {
        if (other.id === room.id) continue;
        const otherLeft = other.x;
        const overlapY = Math.min(room.y + room.h, other.y + other.h) - Math.max(room.y, other.y);
        if (overlapY > 0 && otherLeft >= room.x + room.w && otherLeft < maxRight) {
          maxRight = otherLeft;
        }
      }
      bestDx = Math.min(clampedDx, maxRight - room.x - room.w);
    } else if (dx < 0) {
      // Moving left — find the nearest right edge of a room to our left.
      let minLeft = room.x + dx;
      for (const other of otherRooms) {
        if (other.id === room.id) continue;
        const otherRight = other.x + other.w;
        const overlapY = Math.min(room.y + room.h, other.y + other.h) - Math.max(room.y, other.y);
        if (overlapY > 0 && otherRight <= room.x && otherRight > minLeft) {
          minLeft = otherRight;
        }
      }
      bestDx = Math.max(clampedDx, minLeft - room.x);
    }
  }
  if (yBlocked) {
    if (dy > 0) {
      let maxBottom = room.y + room.h + dy;
      for (const other of otherRooms) {
        if (other.id === room.id) continue;
        const otherTop = other.y;
        const overlapX = Math.min(room.x + room.w, other.x + other.w) - Math.max(room.x, other.x);
        if (overlapX > 0 && otherTop >= room.y + room.h && otherTop < maxBottom) {
          maxBottom = otherTop;
        }
      }
      bestDy = Math.min(clampedDy, maxBottom - room.y - room.h);
    } else if (dy < 0) {
      let minTop = room.y + dy;
      for (const other of otherRooms) {
        if (other.id === room.id) continue;
        const otherBottom = other.y + other.h;
        const overlapX = Math.min(room.x + room.w, other.x + other.w) - Math.max(room.x, other.x);
        if (overlapX > 0 && otherBottom <= room.y && otherBottom > minTop) {
          minTop = otherBottom;
        }
      }
      bestDy = Math.max(clampedDy, minTop - room.y);
    }
  }
  return { dx: bestDx, dy: bestDy };
}

/**
 * Snap a candidate room's edges to align with nearby existing room edges.
 * When the candidate's left/right/top/bottom edge is within
 * `ROOM_EDGE_SNAP_THRESHOLD` of an existing room's corresponding edge, snap
 * it into exact alignment. This makes placing adjacent rooms feel natural —
 * two rooms side by side share a clean boundary.
 *
 * Returns the snapped {x, y} position (w/h are unchanged). If no snapping
 * occurred the original position is returned.
 */
export function snapRoomToNearbyEdges(
  candidate: { x: number; y: number; w: number; h: number; id?: string },
  rooms: FloorRoom[],
): { x: number; y: number } {
  let sx = candidate.x;
  let sy = candidate.y;
  const right = candidate.x + candidate.w;
  const bottom = candidate.y + candidate.h;

  let bestDx = ROOM_EDGE_SNAP_THRESHOLD + 1;
  let bestDy = ROOM_EDGE_SNAP_THRESHOLD + 1;

  for (const room of rooms) {
    if (candidate.id && room.id === candidate.id) continue;
    const rRight = room.x + room.w;
    const rBottom = room.y + room.h;

    // Snap left edge to existing room's left or right edge
    for (const target of [room.x, rRight]) {
      const d = Math.abs(candidate.x - target);
      if (d < bestDx) { bestDx = d; sx = target; }
    }
    // Snap right edge to existing room's left or right edge
    for (const target of [room.x, rRight]) {
      const d = Math.abs(right - target);
      if (d < bestDx) { bestDx = d; sx = target - candidate.w; }
    }
    // Snap top edge to existing room's top or bottom edge
    for (const target of [room.y, rBottom]) {
      const d = Math.abs(candidate.y - target);
      if (d < bestDy) { bestDy = d; sy = target; }
    }
    // Snap bottom edge to existing room's top or bottom edge
    for (const target of [room.y, rBottom]) {
      const d = Math.abs(bottom - target);
      if (d < bestDy) { bestDy = d; sy = target - candidate.h; }
    }
  }

  return {
    x: bestDx <= ROOM_EDGE_SNAP_THRESHOLD ? Math.round(sx) : candidate.x,
    y: bestDy <= ROOM_EDGE_SNAP_THRESHOLD ? Math.round(sy) : candidate.y,
  };
}

/**
 * Alignment guide threshold in units. When a candidate room's edge or center
 * is within this distance of an existing room's corresponding edge or center,
 * an alignment guide is shown and the position is snapped.
 */
// Alignment is an aid, not a magnetic lock. Keep activation tighter than the
// old six-unit window so Rooms, Stairs, and other Floor objects release as the
// pointer moves away.
const ALIGN_GUIDE_THRESHOLD = 5;

/**
 * Width/height match threshold in units. When a candidate room's width (or
 * height) is within this tolerance of another room's width (height), a
 * same-size guide is shown.
 */
const SAME_SIZE_THRESHOLD = 8;

export type RoomAlignGuide = {
  type: "h" | "v";
  pos: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/** A single axis target retained for the duration of one drag gesture. */
export interface AlignmentAxisSnapLock {
  /** Absolute displayed position of the snapped object edge/center. */
  snapPosition: number;
  /** The guide that corresponds to the locked target. */
  guide: RoomAlignGuide;
}

export interface StableAxisSnapResult {
  position: number;
  delta: number;
  lock: AlignmentAxisSnapLock | null;
  snapped: boolean;
}

/**
 * Resolve one axis of universal alignment without feeding the snapped
 * position back into candidate selection.  A lock remains active while the
 * raw drag position is close to its fixed target, which prevents two nearly
 * equal edges/centres from oscillating as the displayed object moves.
 */
export function resolveStableAlignmentAxis(
  rawPosition: number,
  candidatePosition: number,
  candidateGuide: RoomAlignGuide | undefined,
  lock: AlignmentAxisSnapLock | null,
  activationThreshold = ALIGN_GUIDE_THRESHOLD,
  releaseThreshold = ALIGN_GUIDE_THRESHOLD + 3,
): StableAxisSnapResult {
  if (lock && Math.abs(rawPosition - lock.snapPosition) <= releaseThreshold) {
    return {
      position: lock.snapPosition,
      delta: lock.snapPosition - rawPosition,
      lock,
      snapped: true,
    };
  }

  if (candidateGuide && Math.abs(candidatePosition - rawPosition) <= activationThreshold) {
    const nextLock: AlignmentAxisSnapLock = { snapPosition: candidatePosition, guide: candidateGuide };
    return {
      position: candidatePosition,
      delta: candidatePosition - rawPosition,
      lock: nextLock,
      snapped: true,
    };
  }

  return { position: rawPosition, delta: 0, lock: null, snapped: false };
}

/**
 * Compute Canva/Figma-style alignment guides for a candidate room relative
 * to a set of stationary rooms. Returns:
 * - guides: thin line segments to render temporarily
 * - snappedX / snappedY: adjusted position if alignment was found
 *
 * Supports:
 * - left / right / top / bottom edge alignment
 * - horizontal / vertical center alignment
 * - same-width / same-height matching (only when `checkSameSize` is true,
 *   i.e. during resize)
 */
export function computeRoomAlignmentGuides(
  candidate: { x: number; y: number; w: number; h: number; id?: string },
  rooms: FloorRoom[],
  checkSameSize = false,
): { guides: RoomAlignGuide[]; snappedX: number; snappedY: number; snappedW?: number; snappedH?: number } {
  const guides: RoomAlignGuide[] = [];
  let bestDx = ALIGN_GUIDE_THRESHOLD + 1;
  let snappedX = candidate.x;
  let bestDy = ALIGN_GUIDE_THRESHOLD + 1;
  let snappedY = candidate.y;
  let bestDw = checkSameSize ? SAME_SIZE_THRESHOLD + 1 : Infinity;
  let snappedW = candidate.w;
  let bestDh = checkSameSize ? SAME_SIZE_THRESHOLD + 1 : Infinity;
  let snappedH = candidate.h;

  const candRight = candidate.x + candidate.w;
  const candBottom = candidate.y + candidate.h;
  const candCX = candidate.x + candidate.w / 2;
  const candCY = candidate.y + candidate.h / 2;

  for (const room of rooms) {
    if (candidate.id && room.id === candidate.id) continue;
    const rRight = room.x + room.w;
    const rBottom = room.y + room.h;
    const rCX = room.x + room.w / 2;
    const rCY = room.y + room.h / 2;

    // ── X-axis edge alignment (vertical guide lines) ──
    const xEdges = [
      { target: room.x, from: candidate.x },       // left → left
      { target: room.x, from: candRight },          // left → right (right edge → left edge)
      { target: rRight, from: candidate.x },        // right → left
      { target: rRight, from: candRight },          // right → right
    ];
    for (const { target, from } of xEdges) {
      const d = Math.abs(from - target);
      if (d < bestDx) {
        bestDx = d;
        snappedX = target - (from - candidate.x);
      }
    }
    // Center X alignment
    const dCX = Math.abs(candCX - rCX);
    if (dCX < bestDx) {
      bestDx = dCX;
      snappedX = rCX - candidate.w / 2;
    }

    // ── Y-axis edge alignment (horizontal guide lines) ──
    const yEdges = [
      { target: room.y, from: candidate.y },
      { target: room.y, from: candBottom },
      { target: rBottom, from: candidate.y },
      { target: rBottom, from: candBottom },
    ];
    for (const { target, from } of yEdges) {
      const d = Math.abs(from - target);
      if (d < bestDy) {
        bestDy = d;
        snappedY = target - (from - candidate.y);
      }
    }
    // Center Y alignment
    const dCY = Math.abs(candCY - rCY);
    if (dCY < bestDy) {
      bestDy = dCY;
      snappedY = rCY - candidate.h / 2;
    }

    // ── Same-size matching (width/height) ──
    if (checkSameSize) {
      const dw = Math.abs(candidate.w - room.w);
      if (dw < bestDw) { bestDw = dw; snappedW = room.w; }
      const dh = Math.abs(candidate.h - room.h);
      if (dh < bestDh) { bestDh = dh; snappedH = room.h; }
    }
  }

  // ── Build guide lines from best alignments ──
  const floorBottom = Math.max(...rooms.map((r) => r.y + r.h), 100);
  const floorRight = Math.max(...rooms.map((r) => r.x + r.w), 100);

  if (bestDx <= ALIGN_GUIDE_THRESHOLD) {
    const guideX = bestDx <= ALIGN_GUIDE_THRESHOLD ? snappedX + (snappedX === candidate.x ? 0 : candidate.w) : snappedX;
    // Determine which edge matched for a more precise guide line
    let matchX = snappedX;
    for (const room of rooms) {
      if (candidate.id && room.id === candidate.id) continue;
      const rRight = room.x + room.w;
      if (Math.abs(candidate.x - room.x) <= ALIGN_GUIDE_THRESHOLD) { matchX = room.x; break; }
      if (Math.abs(candidate.x - rRight) <= ALIGN_GUIDE_THRESHOLD) { matchX = rRight; break; }
      if (Math.abs(candRight - room.x) <= ALIGN_GUIDE_THRESHOLD) { matchX = room.x; break; }
      if (Math.abs(candRight - rRight) <= ALIGN_GUIDE_THRESHOLD) { matchX = rRight; break; }
    }
    guides.push({
      type: "v", pos: matchX,
      x1: matchX, y1: 0,
      x2: matchX, y2: floorBottom,
    });
  }
  if (bestDy <= ALIGN_GUIDE_THRESHOLD) {
    let matchY = snappedY;
    for (const room of rooms) {
      if (candidate.id && room.id === candidate.id) continue;
      const rBottom = room.y + room.h;
      if (Math.abs(candidate.y - room.y) <= ALIGN_GUIDE_THRESHOLD) { matchY = room.y; break; }
      if (Math.abs(candidate.y - rBottom) <= ALIGN_GUIDE_THRESHOLD) { matchY = rBottom; break; }
      if (Math.abs(candBottom - room.y) <= ALIGN_GUIDE_THRESHOLD) { matchY = room.y; break; }
      if (Math.abs(candBottom - rBottom) <= ALIGN_GUIDE_THRESHOLD) { matchY = rBottom; break; }
    }
    guides.push({
      type: "h", pos: matchY,
      x1: 0, y1: matchY,
      x2: floorRight, y2: matchY,
    });
  }
  if (checkSameSize && bestDw <= SAME_SIZE_THRESHOLD) {
    // Same-width: show vertical guide lines at both edges of the matched width
    guides.push({
      type: "v", pos: snappedX,
      x1: snappedX, y1: snappedY - 8,
      x2: snappedX, y2: snappedY + snappedH + 8,
    });
    guides.push({
      type: "v", pos: snappedX + snappedW,
      x1: snappedX + snappedW, y1: snappedY - 8,
      x2: snappedX + snappedW, y2: snappedY + snappedH + 8,
    });
  }
  if (checkSameSize && bestDh <= SAME_SIZE_THRESHOLD) {
    // Same-height: show horizontal guide lines at both edges
    guides.push({
      type: "h", pos: snappedY,
      x1: snappedX - 8, y1: snappedY,
      x2: snappedX + snappedW + 8, y2: snappedY,
    });
    guides.push({
      type: "h", pos: snappedY + snappedH,
      x1: snappedX - 8, y1: snappedY + snappedH,
      x2: snappedX + snappedW + 8, y2: snappedY + snappedH,
    });
  }

  return {
    guides,
    snappedX: bestDx <= ALIGN_GUIDE_THRESHOLD ? Math.round(snappedX) : candidate.x,
    snappedY: bestDy <= ALIGN_GUIDE_THRESHOLD ? Math.round(snappedY) : candidate.y,
    snappedW: checkSameSize && bestDw <= SAME_SIZE_THRESHOLD ? Math.round(snappedW!) : undefined,
    snappedH: checkSameSize && bestDh <= SAME_SIZE_THRESHOLD ? Math.round(snappedH!) : undefined,
  };
}

// ── Resize hard-limit computation ─────────────────────────────────────────
// Single source of truth for the valid interior bounds a room may occupy
// during a resize gesture.  Returns axis-aligned limits that the candidate
// must satisfy AFTER anchor restoration.

export interface ResizeLimits {
  /** Left edge of the valid horizontal range (inclusive). */
  minX: number;
  /** Right edge of the valid horizontal range (inclusive — the room's
   *  right edge may equal maxX). */
  maxX: number;
  /** Top edge of the valid vertical range (inclusive). */
  minY: number;
  /** Bottom edge of the valid vertical range (inclusive). */
  maxY: number;
}

/**
 * Compute the hard limits for a room resize gesture.
 *
 * The limits account for:
 * (a) the handle being dragged (which edge is anchored)
 * (b) the floor canvas bounds
 * (c) neighboring rooms as hard boundaries
 *
 * A neighboring room is only considered a hard boundary when it lies ENTIRELY
 * on the expanding side of the anchored edge — rooms that are already inside
 * the current bounds are NOT treated as limits (they may represent a legacy
 * overlap that the user is trying to fix).
 */
export function computeResizeLimits(
  origin: { x: number; y: number; w: number; h: number },
  corner: string,
  otherRooms: FloorRoom[],
  canvasW: number,
  canvasH: number,
): ResizeLimits {
  let minX = 0;
  let maxX = canvasW;
  let minY = 0;
  let maxY = canvasH;

  // ── Horizontal ──
  if (corner.includes("e")) {
    // East handle: LEFT edge fixed at origin.x, RIGHT edge moves rightward.
    minX = origin.x;
    maxX = canvasW;
    for (const other of otherRooms) {
      const otherLeft = other.x;
      // Only rooms ENTIRELY to the right of our current right edge block expansion.
      if (otherLeft >= origin.x + origin.w && otherLeft < maxX) {
        const overlapY = Math.min(origin.y + origin.h, other.y + other.h) - Math.max(origin.y, other.y);
        if (overlapY > 0) maxX = otherLeft;
      }
    }
  } else if (corner.includes("w")) {
    // West handle: RIGHT edge fixed, LEFT edge moves leftward.
    const rightEdge = origin.x + origin.w;
    minX = 0;
    maxX = rightEdge;
    for (const other of otherRooms) {
      const otherRight = other.x + other.w;
      // Only rooms ENTIRELY to the left of our current left edge block expansion.
      if (otherRight <= origin.x && otherRight > minX) {
        const overlapY = Math.min(origin.y + origin.h, other.y + other.h) - Math.max(origin.y, other.y);
        if (overlapY > 0) minX = otherRight;
      }
    }
  }

  // ── Vertical ──
  if (corner.includes("s")) {
    // South handle: TOP edge fixed, BOTTOM edge moves downward.
    minY = origin.y;
    maxY = canvasH;
    for (const other of otherRooms) {
      const otherTop = other.y;
      if (otherTop >= origin.y + origin.h && otherTop < maxY) {
        const overlapX = Math.min(origin.x + origin.w, other.x + other.w) - Math.max(origin.x, other.x);
        if (overlapX > 0) maxY = otherTop;
      }
    }
  } else if (corner.includes("n")) {
    // North handle: BOTTOM edge fixed, TOP edge moves upward.
    const bottomEdge = origin.y + origin.h;
    minY = 0;
    maxY = bottomEdge;
    for (const other of otherRooms) {
      const otherBottom = other.y + other.h;
      if (otherBottom <= origin.y && otherBottom > minY) {
        const overlapX = Math.min(origin.x + origin.w, other.x + other.w) - Math.max(origin.x, other.x);
        if (overlapX > 0) minY = otherBottom;
      }
    }
  }

  return { minX, maxX, minY, maxY };
}

// ── Resize-edge snap ──────────────────────────────────────────────────────
// Snaps the MOVING edge(s) of a resize candidate to nearby room edges,
// then clamps the result to the valid limits.  This avoids the oscillation
// bug where full alignment snapping changes the size, which the anchor
// restoration then overwrites, creating frame-to-frame instability.

export interface ResizeSnapResult {
  x: number;
  y: number;
  w: number;
  h: number;
  guides: RoomAlignGuide[];
}

/**
 * Snap the moving edge(s) of a resize candidate to nearby room edges,
 * respecting hard limits.  Only the edges that are moving (per the corner
 * handle) are snapped — anchored edges are left untouched.
 */
export function snapResizeEdges(
  candidate: { x: number; y: number; w: number; h: number; id?: string },
  corner: string,
  limits: ResizeLimits,
  otherRooms: FloorRoom[],
): ResizeSnapResult {
  let result = { x: candidate.x, y: candidate.y, w: candidate.w, h: candidate.h };
  const guides: RoomAlignGuide[] = [];
  let bestDx = ALIGN_GUIDE_THRESHOLD + 1;
  let bestDy = ALIGN_GUIDE_THRESHOLD + 1;
  // Same-size (width/height match) tracking — Issue 3: snapping a resize to
  // exactly match another object's width or height.
  let bestDw = SAME_SIZE_THRESHOLD + 1;
  let bestDh = SAME_SIZE_THRESHOLD + 1;

  // Compute the moving edge(s) and anchor edge(s)
  const movingRight = corner.includes("e");
  const movingLeft = corner.includes("w");
  const movingBottom = corner.includes("s");
  const movingTop = corner.includes("n");

  for (const room of otherRooms) {
    if (candidate.id && room.id === candidate.id) continue;
    const rRight = room.x + room.w;
    const rBottom = room.y + room.h;

    // ── X-axis: snap the moving vertical edge ──
    if (movingRight) {
      // Moving right edge; anchor is left edge (result.x stays fixed).
      // Try snapping right edge to other rooms' left or right edges.
      for (const target of [room.x, rRight]) {
        const d = Math.abs(candidate.w + candidate.x - target);
        if (d < bestDx) {
          bestDx = d;
          const newW = clamp(target - result.x, 20, limits.maxX - result.x);
          result.w = newW;
        }
      }
      // Same-width: match the other room's width (within valid limits).
      const dw = Math.abs(candidate.w - room.w);
      if (dw < bestDw) {
        bestDw = dw;
        const newW = clamp(room.w, 20, limits.maxX - result.x);
        result.w = newW;
      }
    } else if (movingLeft) {
      // Moving left edge; anchor is right edge.
      const anchorRight = candidate.x + candidate.w;
      for (const target of [room.x, rRight]) {
        const d = Math.abs(candidate.x - target);
        if (d < bestDx) {
          bestDx = d;
          const newW = clamp(anchorRight - target, 20, anchorRight - limits.minX);
          result.w = newW;
          result.x = anchorRight - result.w;
        }
      }
      // Same-width: match the other room's width (right edge anchored).
      const dw = Math.abs(candidate.w - room.w);
      if (dw < bestDw) {
        bestDw = dw;
        const newW = clamp(room.w, 20, anchorRight - limits.minX);
        result.w = newW;
        result.x = anchorRight - result.w;
      }
    }

    // ── Y-axis: snap the moving horizontal edge ──
    if (movingBottom) {
      // Moving bottom edge; anchor is top edge (result.y stays fixed).
      for (const target of [room.y, rBottom]) {
        const d = Math.abs(candidate.h + candidate.y - target);
        if (d < bestDy) {
          bestDy = d;
          const newH = clamp(target - result.y, 15, limits.maxY - result.y);
          result.h = newH;
        }
      }
      // Same-height: match the other room's height.
      const dh = Math.abs(candidate.h - room.h);
      if (dh < bestDh) {
        bestDh = dh;
        const newH = clamp(room.h, 15, limits.maxY - result.y);
        result.h = newH;
      }
    } else if (movingTop) {
      // Moving top edge; anchor is bottom edge.
      const anchorBottom = candidate.y + candidate.h;
      for (const target of [room.y, rBottom]) {
        const d = Math.abs(candidate.y - target);
        if (d < bestDy) {
          bestDy = d;
          const newH = clamp(anchorBottom - target, 15, anchorBottom - limits.minY);
          result.h = newH;
          result.y = anchorBottom - result.h;
        }
      }
      // Same-height: match the other room's height (bottom edge anchored).
      const dh = Math.abs(candidate.h - room.h);
      if (dh < bestDh) {
        bestDh = dh;
        const newH = clamp(room.h, 15, anchorBottom - limits.minY);
        result.h = newH;
        result.y = anchorBottom - result.h;
      }
    }
  }

  // Build guide lines for edges that actually snapped
  if (bestDx <= ALIGN_GUIDE_THRESHOLD) {
    const guideX = movingRight ? result.x + result.w : result.x;
    guides.push({ type: "v", pos: guideX, x1: guideX, y1: 0, x2: guideX, y2: Math.max(canvasHForGuideLines(otherRooms), candidate.y + candidate.h + 20) });
  }
  if (bestDy <= ALIGN_GUIDE_THRESHOLD) {
    const guideY = movingBottom ? result.y + result.h : result.y;
    guides.push({ type: "h", pos: guideY, x1: 0, y1: guideY, x2: Math.max(canvasWForGuideLines(otherRooms), candidate.x + candidate.w + 20), y2: guideY });
  }
  // Same-size guides: outline the matched width/height with dashed lines at
  // BOTH edges so the user sees the object now matches the neighbor's size.
  if (bestDw <= SAME_SIZE_THRESHOLD) {
    guides.push({
      type: "v", pos: result.x,
      x1: result.x, y1: result.y - 8,
      x2: result.x, y2: result.y + result.h + 8,
    });
    guides.push({
      type: "v", pos: result.x + result.w,
      x1: result.x + result.w, y1: result.y - 8,
      x2: result.x + result.w, y2: result.y + result.h + 8,
    });
  }
  if (bestDh <= SAME_SIZE_THRESHOLD) {
    guides.push({
      type: "h", pos: result.y,
      x1: result.x - 8, y1: result.y,
      x2: result.x + result.w + 8, y2: result.y,
    });
    guides.push({
      type: "h", pos: result.y + result.h,
      x1: result.x - 8, y1: result.y + result.h,
      x2: result.x + result.w + 8, y2: result.y + result.h,
    });
  }

  return { x: Math.round(result.x), y: Math.round(result.y), w: Math.round(result.w), h: Math.round(result.h), guides };
}

/** Heuristic floor width from bounds extents (used for guide line length). */
function canvasWForGuideLines(bounds: { x: number; w: number }[]): number {
  return bounds.length > 0 ? Math.max(...bounds.map((b) => b.x + b.w)) + 40 : 600;
}
/** Heuristic floor height from bounds extents (used for guide line length). */
function canvasHForGuideLines(bounds: { y: number; h: number }[]): number {
  return bounds.length > 0 ? Math.max(...bounds.map((b) => b.y + b.h)) + 40 : 450;
}

// ── Universal alignment engine ──────────────────────────────────────────────
// Works with generic {x, y, w, h} bounds — used for ALL rectangular floor
// objects (rooms, furniture, stairs, ramps, elevators, labels).

export interface AlignResult {
  snappedX: number;
  snappedY: number;
  guides: RoomAlignGuide[];
}

/**
 * Compute Canva/Figma-style alignment guides and snapping for a candidate
 * rectangle against a set of reference rectangles.
 *
 * Checks: left/right/top/bottom edge alignment + horizontal/vertical center.
 * Returns the snapped position and thin violet guide lines.
 */
export function computeAlignmentGuides(
  candidate: { x: number; y: number; w: number; h: number; id?: string },
  refs: { x: number; y: number; w: number; h: number; id?: string }[],
): AlignResult {
  const guides: RoomAlignGuide[] = [];
  let bestDx = ALIGN_GUIDE_THRESHOLD + 1;
  let snappedX = candidate.x;
  // The world-space coordinate of the MATCHED reference edge (the shared edge
  // the guide line must be drawn at). Tracked separately from the snapped
  // position so left/right/center matches all place the line correctly.
  let guideX = candidate.x;
  let bestDy = ALIGN_GUIDE_THRESHOLD + 1;
  let snappedY = candidate.y;
  let guideY = candidate.y;

  const candRight = candidate.x + candidate.w;
  const candBottom = candidate.y + candidate.h;
  const candCX = candidate.x + candidate.w / 2;
  const candCY = candidate.y + candidate.h / 2;

  for (const ref of refs) {
    if (candidate.id && ref.id === candidate.id) continue;
    const rRight = ref.x + ref.w;
    const rBottom = ref.y + ref.h;
    const rCX = ref.x + ref.w / 2;
    const rCY = ref.y + ref.h / 2;

    // ── X-axis edge alignment ──
    for (const { target, from } of [
      { target: ref.x, from: candidate.x },
      { target: ref.x, from: candRight },
      { target: rRight, from: candidate.x },
      { target: rRight, from: candRight },
    ]) {
      const d = Math.abs(from - target);
      if (d < bestDx) {
        bestDx = d;
        snappedX = target - (from - candidate.x);
        guideX = target;
      }
    }
    const dCX = Math.abs(candCX - rCX);
    if (dCX < bestDx) {
      bestDx = dCX;
      snappedX = rCX - candidate.w / 2;
      guideX = rCX;
    }

    // ── Y-axis edge alignment ──
    for (const { target, from } of [
      { target: ref.y, from: candidate.y },
      { target: ref.y, from: candBottom },
      { target: rBottom, from: candidate.y },
      { target: rBottom, from: candBottom },
    ]) {
      const d = Math.abs(from - target);
      if (d < bestDy) {
        bestDy = d;
        snappedY = target - (from - candidate.y);
        guideY = target;
      }
    }
    const dCY = Math.abs(candCY - rCY);
    if (dCY < bestDy) {
      bestDy = dCY;
      snappedY = rCY - candidate.h / 2;
      guideY = rCY;
    }
  }

  // Build guide lines
  const floorW = canvasWForGuideLines(refs.length > 0 ? refs : [candidate]);
  const floorH = canvasHForGuideLines(refs.length > 0 ? refs : [candidate]);

  if (bestDx <= ALIGN_GUIDE_THRESHOLD) {
    guides.push({ type: "v", pos: guideX, x1: guideX, y1: 0, x2: guideX, y2: floorH });
  }
  if (bestDy <= ALIGN_GUIDE_THRESHOLD) {
    guides.push({ type: "h", pos: guideY, x1: 0, y1: guideY, x2: floorW, y2: guideY });
  }

  return {
    snappedX: bestDx <= ALIGN_GUIDE_THRESHOLD ? Math.round(snappedX) : candidate.x,
    snappedY: bestDy <= ALIGN_GUIDE_THRESHOLD ? Math.round(snappedY) : candidate.y,
    guides,
  };
}

// ── Universal same-size matching ────────────────────────────────────────────
// For resize: matches width/height to nearby objects.

export interface ResizeAlignResult extends AlignResult {
  snappedW?: number;
  snappedH?: number;
}

/**
 * Like computeAlignmentGuides but also returns same-size width/height
 * snapping when checkSameSize is true. Used during resize for all
 * rectangular objects.
 */
export function computeResizeAlignmentGuides(
  candidate: { x: number; y: number; w: number; h: number; id?: string },
  refs: { x: number; y: number; w: number; h: number; id?: string }[],
  checkSameSize = false,
): ResizeAlignResult {
  const alignResult = computeAlignmentGuides(candidate, refs);
  let bestDw = checkSameSize ? SAME_SIZE_THRESHOLD + 1 : Infinity;
  let snappedW: number | undefined;
  let bestDh = checkSameSize ? SAME_SIZE_THRESHOLD + 1 : Infinity;
  let snappedH: number | undefined;

  for (const ref of refs) {
    if (candidate.id && ref.id === candidate.id) continue;
    if (checkSameSize) {
      const dw = Math.abs(candidate.w - ref.w);
      if (dw < bestDw) { bestDw = dw; snappedW = ref.w; }
      const dh = Math.abs(candidate.h - ref.h);
      if (dh < bestDh) { bestDh = dh; snappedH = ref.h; }
    }
  }

  const wSnapped = checkSameSize && bestDw <= SAME_SIZE_THRESHOLD;
  const hSnapped = checkSameSize && bestDh <= SAME_SIZE_THRESHOLD;
  const guides = [...alignResult.guides];
  // Same-size guide lines: dashed lines at BOTH edges of the matched width /
  // height so the user sees the object now matches the neighbor's size.
  const sizeW = wSnapped ? Math.round(snappedW!) : candidate.w;
  const sizeH = hSnapped ? Math.round(snappedH!) : candidate.h;
  const sx = alignResult.snappedX;
  const sy = alignResult.snappedY;
  if (wSnapped) {
    guides.push({ type: "v", pos: sx, x1: sx, y1: sy - 8, x2: sx, y2: sy + sizeH + 8 });
    guides.push({ type: "v", pos: sx + sizeW, x1: sx + sizeW, y1: sy - 8, x2: sx + sizeW, y2: sy + sizeH + 8 });
  }
  if (hSnapped) {
    guides.push({ type: "h", pos: sy, x1: sx - 8, y1: sy, x2: sx + sizeW + 8, y2: sy });
    guides.push({ type: "h", pos: sy + sizeH, x1: sx - 8, y1: sy + sizeH, x2: sx + sizeW + 8, y2: sy + sizeH });
  }

  return {
    ...alignResult,
    guides,
    snappedW: wSnapped ? Math.round(snappedW!) : undefined,
    snappedH: hSnapped ? Math.round(snappedH!) : undefined,
  };
}
