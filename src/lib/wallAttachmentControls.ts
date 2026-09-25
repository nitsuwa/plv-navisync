import type { BuildingEntranceEdge } from "../components/map-builder/types";

export type WallAttachmentAxis = "horizontal" | "vertical";

type WallGeometry = { x1: number; y1: number; x2: number; y2: number };

/** Return the dominant axis used by a wall-attached object's position. */
export function wallAttachmentAxis(wall: WallGeometry): WallAttachmentAxis {
  return Math.abs(wall.x2 - wall.x1) >= Math.abs(wall.y2 - wall.y1)
    ? "horizontal"
    : "vertical";
}

/**
 * Convert a physical arrow key into a normalized wall-offset percentage step.
 * The sign follows the wall's authored direction, so the object always moves
 * in the direction indicated by the arrow even when a wall was drawn reversed.
 */
export function wallAttachmentArrowDelta(
  wall: WallGeometry,
  key: string,
  step = 1,
): number | null {
  const axis = wallAttachmentAxis(wall);
  if (axis === "horizontal") {
    if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
    const authoredDirection = wall.x2 >= wall.x1 ? 1 : -1;
    return (key === "ArrowRight" ? 1 : -1) * authoredDirection * step;
  }
  if (key !== "ArrowUp" && key !== "ArrowDown") return null;
  const authoredDirection = wall.y2 >= wall.y1 ? 1 : -1;
  return (key === "ArrowDown" ? 1 : -1) * authoredDirection * step;
}

/** Map-builder entrance controls use the building's canonical edge direction. */
export function entranceAttachmentArrowDelta(
  edge: BuildingEntranceEdge,
  key: string,
  step = 1,
): number | null {
  if (edge === "top" || edge === "bottom") {
    if (key === "ArrowLeft") return -step;
    if (key === "ArrowRight") return step;
    return null;
  }
  if (key === "ArrowUp") return -step;
  if (key === "ArrowDown") return step;
  return null;
}

export function clampNormalizedOffset(offset: number): number {
  return Math.max(0, Math.min(1, offset));
}

