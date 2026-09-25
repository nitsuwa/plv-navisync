import type { FloorWall } from "../components/map-builder/types";

/**
 * Render-only size for a wall junction cap. Managed perimeter Walls may have
 * a heavier stroke than authored Walls, but they must not inflate the shared
 * square. A perimeter-only junction returns zero because the Floor perimeter
 * owns that geometry and does not need an authored junction cap.
 */
export function normalizedWallJointHalfSize(
  walls: Pick<FloorWall, "thickness" | "managedKind">[],
): number {
  const authoredThicknesses = walls
    .filter((wall) => wall.managedKind !== "perimeter")
    .map((wall) => Number(wall.thickness))
    .filter((thickness) => Number.isFinite(thickness) && thickness > 0);
  if (authoredThicknesses.length === 0) return 0;
  return Math.max(4.5, Math.max(...authoredThicknesses) * 0.95);
}

/**
 * Project an endpoint candidate onto a Wall's centerline segment.  The
 * returned point is always the exact segment coordinate, including when the
 * nearest point is one of the target endpoints.  Keeping this primitive
 * separate prevents draw/endpoint callers from requiring an artificial
 * overshoot before a structural junction can be recognized.
 */
export function snapPointToWallCenterline(
  point: { x: number; y: number },
  wall: Pick<FloorWall, "x1" | "y1" | "x2" | "y2">,
) {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.000001) {
    return { x: wall.x1, y: wall.y1, distance: Math.hypot(point.x - wall.x1, point.y - wall.y1), offset: 0 };
  }
  const rawOffset = ((point.x - wall.x1) * dx + (point.y - wall.y1) * dy) / lengthSquared;
  const offset = Math.max(0, Math.min(1, rawOffset));
  const x = wall.x1 + dx * offset;
  const y = wall.y1 + dy * offset;
  return { x, y, distance: Math.hypot(point.x - x, point.y - y), offset };
}
