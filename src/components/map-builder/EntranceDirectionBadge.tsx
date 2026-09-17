import type { BuildingEntranceDirection, BuildingEntranceEdge, BuildingEntranceType } from "./types";
import { normalizeEntranceDirection, normalizeEntranceType } from "../../lib/buildingEntrances";

const EDGE_ANGLES: Record<BuildingEntranceEdge, number> = {
  top: 0,
  right: 90,
  bottom: 180,
  left: -90,
};

/** Return the world-space centre for the one direction badge owned by an entrance. */
export function entranceDirectionBadgePlacement(
  x: number,
  y: number,
  edge: BuildingEntranceEdge,
  rotation = 0,
  distance = 17,
): { x: number; y: number; angle: number } {
  const angle = EDGE_ANGLES[edge] + rotation;
  const radians = (angle * Math.PI) / 180;
  return {
    x: x + Math.sin(radians) * distance,
    y: y - Math.cos(radians) * distance,
    angle,
  };
}

export interface EntranceDirectionBadgeProps {
  x: number;
  y: number;
  edge: BuildingEntranceEdge;
  direction?: BuildingEntranceDirection;
  type?: BuildingEntranceType | "main" | "secondary" | "emergency";
  rotation?: number;
  /** Allows the badge to be identified in editor/public rendering tests. */
  testId?: string;
}

/**
 * The single semantic Entrance/Exit indicator.  The physical door keeps its
 * own door/exit styling; direction is shown once, in this blue badge outside
 * the object so it remains legible on both the editor and public maps.
 */
export function EntranceDirectionBadge({
  x,
  y,
  edge,
  direction,
  type,
  rotation = 0,
  testId = "entrance-direction-badge",
}: EntranceDirectionBadgeProps) {
  if (normalizeEntranceType(type) === "emergency_exit") return null;

  const normalizedDirection = normalizeEntranceDirection({ direction, type });
  const placement = entranceDirectionBadgePlacement(x, y, edge, rotation);
  const label = normalizedDirection === "entrance_only"
    ? "Entrance only"
    : normalizedDirection === "exit_only"
      ? "Exit only"
      : "Entrance and exit";
  // The badge is placed on the outside normal of the wall.  The physical
  // meaning of an Entrance-only arrow is the opposite direction (outside to
  // inside), while an Exit-only arrow follows the outside normal.  Applying
  // this local half-turn after the wall rotation keeps the semantics correct
  // for all four sides without changing the badge placement.
  const arrowRotation = normalizedDirection === "entrance_only" ? 180 : 0;

  return (
    <g
      data-testid={testId}
      data-entrance-direction={normalizedDirection}
      data-entrance-edge={edge}
      aria-label={label}
      transform={`translate(${placement.x},${placement.y}) rotate(${placement.angle})`}
      pointerEvents="none"
    >
      <circle r={7.5} fill="#2563eb" stroke="white" strokeWidth={1.2} />
      <g transform={`rotate(${arrowRotation})`} data-testid="entrance-direction-arrows" data-arrow-relative-rotation={arrowRotation}>
        {normalizedDirection === "both" ? (
          <>
            <path d="M-2.2,3 V-2.2 M-4,-0.4 L-2.2,-2.2 L-0.4,-0.4" fill="none" stroke="white" strokeWidth={1.05} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2.2,-3 V2.2 M0.4,0.4 L2.2,2.2 L4,0.4" fill="none" stroke="white" strokeWidth={1.05} strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : normalizedDirection === "entrance_only" ? (
          <path d="M0,3 V-2.5 M-2,-0.5 L0,-2.5 L2,-0.5" fill="none" stroke="white" strokeWidth={1.15} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          /* Exit-only follows the outside wall normal. The badge's local
             +Y axis is the building-facing direction, so an outward arrow
             uses the same upward glyph as the unrotated top-edge normal. */
          <path d="M0,3 V-2.5 M-2,-0.5 L0,-2.5 L2,-0.5" fill="none" stroke="white" strokeWidth={1.15} strokeLinecap="round" strokeLinejoin="round" />
        )}
      </g>
    </g>
  );
}
