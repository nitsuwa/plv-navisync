/** Structural subset of the published Campus graph used to identify
 * emergency-only infrastructure in routine (Standard/Accessible) routes. */
export interface RoutineNavigationCampus {
  buildings?: Array<{
    id: string;
    entrances?: Array<{ id: string; type?: string }>;
    floors?: Array<{
      id: string;
      stairs?: Array<{ id: string; exteriorEmergencyStairId?: string }>;
      doors?: Array<{ id: string; isEmergencyExit?: boolean }>;
    }>;
  }>;
}

export interface RoutineNavigationNode {
  id: string;
  buildingId?: string;
  floorId?: string;
  entranceId?: string;
  doorId?: string;
  stairId?: string;
  exteriorEmergencyStairId?: string;
  emergencyStair?: boolean;
  type?: string;
}

export interface RoutineNavigationEdge {
  id?: string;
  startNodeId: string;
  endNodeId: string;
  type?: string;
}

const emergencyEntranceType = (type?: string): boolean => {
  const normalized = type?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return normalized === "emergency" || normalized === "emergency_exit";
};

/**
 * Return a routine-route view of the authored nodes. Keep this rule shared
 * between Admin Test Route and student routing so evacuation-only stair,
 * exit-door, and entrance nodes cannot leak into Standard/Accessible paths.
 */
export function filterRoutineNavigationNodes<T extends RoutineNavigationNode>(
  campus: RoutineNavigationCampus,
  nodes: readonly T[],
): T[] {
  const emergencyStairs = new Set<string>();
  const emergencyDoors = new Set<string>();
  const emergencyEntrances = new Set<string>();
  const scopedId = (buildingId: string, floorId: string, objectId: string) => `${buildingId}\u0000${floorId}\u0000${objectId}`;

  for (const building of campus.buildings ?? []) {
    for (const entrance of building.entrances ?? []) {
      if (emergencyEntranceType(entrance.type)) emergencyEntrances.add(`${building.id}\u0000${entrance.id}`);
    }
    for (const floor of building.floors ?? []) {
      for (const stair of floor.stairs ?? []) {
        if (stair.exteriorEmergencyStairId) emergencyStairs.add(scopedId(building.id, floor.id, stair.id));
      }
      for (const door of floor.doors ?? []) {
        if (door.isEmergencyExit) emergencyDoors.add(scopedId(building.id, floor.id, door.id));
      }
    }
  }

  return nodes.filter((node) => {
    if (node.exteriorEmergencyStairId || node.emergencyStair || node.type === "emergency_exit") return false;
    if (node.stairId && node.buildingId && node.floorId
      && emergencyStairs.has(scopedId(node.buildingId, node.floorId, node.stairId))) return false;
    if (node.doorId && node.buildingId && node.floorId
      && emergencyDoors.has(scopedId(node.buildingId, node.floorId, node.doorId))) return false;
    if (node.entranceId && node.buildingId && !node.floorId
      && emergencyEntrances.has(`${node.buildingId}\u0000${node.entranceId}`)) return false;
    return true;
  });
}

/** Emergency-layer connections are not valid shortcuts for routine travel,
 * even when their endpoints are shared with the ordinary waypoint network. */
export function filterRoutineNavigationEdges<T extends RoutineNavigationEdge>(edges: readonly T[]): T[] {
  return edges.filter((edge) => edge.type?.trim().toLowerCase() !== "emergency");
}
