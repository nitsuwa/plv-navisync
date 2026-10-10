import type { FloorWall } from "../components/map-builder/types";
import { normalizedWallJointHalfSize } from "./wallJunctionVisual";

export interface ReadonlyWallJunction {
  x: number;
  y: number;
  radius: number;
  color: string;
  casingColor: string;
  wallIds: string[];
}

const roundHundredth = (value: number) => Math.round(value * 100) / 100;

function casingColor(material?: string) {
  if (material === "glass") return "#60a5fa";
  if (material === "brick") return "#991b1b";
  if (material === "wood") return "#92400e";
  if (material === "drywall") return "#64748b";
  return "#2f3a46";
}

/**
 * Recreate the Student Map's renderer-only square wall unions used by the
 * Floor Editor. Authored walls remain untouched; endpoint-to-endpoint and
 * endpoint-to-segment junctions get one small overlay to close butt-cap gaps.
 */
export function readonlyWallJunctions(
  sourceWalls: readonly FloorWall[],
  showWallJunctions: boolean | undefined,
): ReadonlyWallJunction[] {
  const walls = sourceWalls.filter((wall) => wall.visible !== false
    && Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) >= 1);
  const joints = new Map<string, {
    x: number; y: number; count: number; managedCount: number;
    radius: number; color: string; casingColor: string;
    appearanceKey: string; wallIds: Set<string>;
  }>();

  for (const wall of walls) {
    for (const point of [{ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }]) {
      const x = roundHundredth(point.x);
      const y = roundHundredth(point.y);
      const key = `${x},${y}`;
      const radius = normalizedWallJointHalfSize([wall]);
      const appearanceKey = `${wall.color}|${wall.material ?? "concrete"}|${wall.thickness}`;
      const joint = joints.get(key);
      if (joint) {
        if (appearanceKey !== joint.appearanceKey && radius > joint.radius) {
          joint.color = wall.color;
          joint.casingColor = casingColor(wall.material);
          joint.appearanceKey = appearanceKey;
        }
        joint.radius = Math.max(joint.radius, radius);
        joint.count += 1;
        if (wall.managedKind === "perimeter") joint.managedCount += 1;
        joint.wallIds.add(wall.id);
      } else {
        joints.set(key, {
          x: point.x, y: point.y, count: 1,
          managedCount: wall.managedKind === "perimeter" ? 1 : 0,
          radius, color: wall.color, casingColor: casingColor(wall.material),
          appearanceKey, wallIds: new Set([wall.id]),
        });
      }
    }
  }

  // Admin junction caps also account for a wall endpoint that lands on the
  // middle of another segment. Mirror that conservative 1.2-unit tolerance.
  for (const joint of joints.values()) {
    for (const wall of walls) {
      if (joint.wallIds.has(wall.id)) continue;
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared < 0.001) continue;
      const t = ((joint.x - wall.x1) * dx + (joint.y - wall.y1) * dy) / lengthSquared;
      const clampedT = Math.max(0, Math.min(1, t));
      const px = wall.x1 + clampedT * dx;
      const py = wall.y1 + clampedT * dy;
      if (Math.hypot(joint.x - px, joint.y - py) > 1.2) continue;
      joint.wallIds.add(wall.id);
      const atEndpoint = clampedT <= 0.01 || clampedT >= 0.99;
      joint.count += atEndpoint ? 1 : 2;
      if (wall.managedKind === "perimeter") joint.managedCount += atEndpoint ? 1 : 2;
      const radius = normalizedWallJointHalfSize([wall]);
      const appearanceKey = `${wall.color}|${wall.material ?? "concrete"}|${wall.thickness}`;
      if (joint.appearanceKey !== appearanceKey && radius > joint.radius) {
        joint.color = wall.color;
        joint.casingColor = casingColor(wall.material);
        joint.appearanceKey = appearanceKey;
      }
      joint.radius = Math.max(joint.radius, radius);
    }
  }

  return [...joints.values()].flatMap((joint) => {
    if (joint.count <= 1 || joint.managedCount >= joint.count) return [];
    const incidentWalls = walls.filter((wall) => joint.wallIds.has(wall.id));
    if (incidentWalls.some((wall) => wall.junctionBlocks === "hide")) return [];
    const explicitlyShown = incidentWalls.some((wall) => wall.junctionBlocks === "show");
    if (showWallJunctions === false && !explicitlyShown) return [];
    return [{
      x: joint.x, y: joint.y, radius: joint.radius,
      color: joint.color, casingColor: joint.casingColor,
      wallIds: [...joint.wallIds],
    }];
  });
}
