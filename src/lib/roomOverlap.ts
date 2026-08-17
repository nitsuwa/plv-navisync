/**
 * Room overlap detection utilities.
 *
 * Two rooms "overlap" when they share meaningful interior area — edge-touching
 * and boundary-adjacent rooms are ALLOWED (they share a wall). A small
 * tolerance prevents floating-point snap artifacts from false positives.
 */

import type { FloorRoom } from "../components/map-builder/types";

/** Tolerance in units. Rooms whose overlap is entirely within this margin are
 *  treated as edge-touching (allowed). */
const OVERLAP_TOLERANCE = 2;

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
