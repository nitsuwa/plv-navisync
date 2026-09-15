import type {
  FloorPlan,
  FloorDoor,
  FloorFurniture,
  FloorStairs,
  NavigationEdge,
  NavigationNode,
} from "../components/map-builder/types";
import type { FloorTemplateDefinition } from "./floorTemplates";

/** Counts shown in the replacement confirmation.  Exterior infrastructure is
 * intentionally not included in these indoor-layout counts. */
export interface FloorReplacementSummary {
  rooms: number;
  walls: number;
  doors: number;
  windows: number;
  furniture: number;
  fixtures: number;
  walkingPoints: number;
  navigationConnections: number;
}

export interface FloorTemplateReplacementResult {
  /** Physical floor assembled from the template plus preserved exterior data. */
  floor: FloorPlan;
  /** Existing generated Entrance Door records that remain floor-owned. */
  preservedDoors: FloorDoor[];
  /** Existing Exterior Emergency Stair occurrences that remain on this Floor. */
  preservedExteriorStairs: FloorStairs[];
  /** Furniture hosted by a preserved Exterior Zone. */
  preservedExteriorFurniture: FloorFurniture[];
  /** Existing floor nav nodes safe to retain (entrance/emergency anchors). */
  retainedNavNodes: NavigationNode[];
  /** Existing edges whose endpoints remain live after replacement. */
  retainedNavEdges: NavigationEdge[];
  summary: FloorReplacementSummary;
}

/** Return the indoor authored content that a Floor template replaces. */
export function summarizeFloorForTemplateReplacement(
  floor: FloorPlan,
  navNodes: NavigationNode[] = [],
  navEdges: NavigationEdge[] = [],
): FloorReplacementSummary {
  // Entrance-owned Doors normally carry buildingEntranceId themselves.  Keep
  // the node-side relationship as a compatibility fallback for older records
  // where only the generated Door node retained that provenance.
  const entranceDoorIdsFromNodes = new Set(navNodes
    .filter((node) => node.floorId === floor.id && node.buildingId === floor.buildingId && !!node.buildingEntranceId && !!node.doorId)
    .map((node) => node.doorId!));
  const preservedDoorIds = new Set((floor.doors ?? [])
    .filter((door) => !!door.buildingEntranceId || entranceDoorIdsFromNodes.has(door.id))
    .map((door) => door.id));
  const preservedStairIds = new Set((floor.stairs ?? []).filter((stair) => !!stair.exteriorEmergencyStairId).map((stair) => stair.id));
  const indoorNodes = navNodes.filter((node) => node.floorId === floor.id && node.buildingId === floor.buildingId);
  const preservedNodeIds = new Set(indoorNodes.filter((node) => (
    (node.doorId ? preservedDoorIds.has(node.doorId) : false)
    || (node.stairId ? preservedStairIds.has(node.stairId) : false)
    || !!node.exteriorEmergencyStairId
    || !!node.buildingEntranceId
  )).map((node) => node.id));
  return {
    rooms: floor.rooms?.length ?? 0,
    walls: (floor.walls ?? []).filter((wall) => wall.managedKind !== "perimeter").length,
    doors: (floor.doors ?? []).filter((door) => !preservedDoorIds.has(door.id)).length,
    windows: floor.windows?.length ?? 0,
    furniture: (floor.furniture ?? []).filter((item) => !item.exteriorZoneId).length,
    fixtures: 0,
    walkingPoints: indoorNodes.filter((node) => !preservedNodeIds.has(node.id)).length,
    navigationConnections: navEdges.filter((edge) => {
      const start = indoorNodes.some((node) => node.id === edge.startNodeId);
      const end = indoorNodes.some((node) => node.id === edge.endNodeId);
      return start && end && !(preservedNodeIds.has(edge.startNodeId) && preservedNodeIds.has(edge.endNodeId));
    }).length,
  };
}

/**
 * Assemble a replacement without mutating either source.  This is deliberately
 * a positive physical allow-list: template content is taken from the already
 * instantiated Floor, while only explicitly exterior/Entrance-owned records
 * from the previous Floor are carried forward.  Navigation nodes/edges are
 * filtered by ownership identity, never by proximity.
 */
export function prepareFloorTemplateReplacement(
  current: FloorPlan,
  instantiated: FloorPlan,
  navNodes: NavigationNode[] = [],
  navEdges: NavigationEdge[] = [],
): FloorTemplateReplacementResult {
  const entranceDoorIdsFromNodes = new Set(navNodes
    .filter((node) => node.floorId === current.id && node.buildingId === current.buildingId && !!node.buildingEntranceId && !!node.doorId)
    .map((node) => node.doorId!));
  const preservedDoors = (current.doors ?? [])
    .filter((door) => !!door.buildingEntranceId || entranceDoorIdsFromNodes.has(door.id))
    .map((door) => ({ ...door }));
  const preservedExteriorStairs = (current.stairs ?? [])
    .filter((stair) => !!stair.exteriorEmergencyStairId)
    .map((stair) => ({ ...stair }));
  const preservedZoneIds = new Set((current.exteriorZones ?? []).map((zone) => zone.id));
  const preservedExteriorFurniture = (current.furniture ?? [])
    .filter((item) => !!item.exteriorZoneId && preservedZoneIds.has(item.exteriorZoneId))
    .map((item) => ({ ...item }));
  const preservedDoorIds = new Set(preservedDoors.map((door) => door.id));
  const preservedStairIds = new Set(preservedExteriorStairs.map((stair) => stair.id));
  const nextFloor: FloorPlan = {
    ...instantiated,
    // Keep the source canvas dimensions until the caller runs the canonical
    // resize/projection seam.  This lets hosted Veranda Furniture and other
    // edge-attached records compute their delta from the old boundary to the
    // template's new boundary instead of treating the new size as unchanged.
    canvasW: current.canvasW ?? instantiated.canvasW,
    canvasH: current.canvasH ?? instantiated.canvasH,
    // Entrances and their generated physical Door are exterior-owned. Keep
    // their identity so the canonical Entrance -> Door bridge can reproject it.
    // Template Doors/Windows are physical starter content and were created
    // with fresh IDs by instantiateFloorTemplate. Keep them alongside any
    // externally owned Entrance Door records carried over from the source.
    doors: [...(instantiated.doors ?? []), ...preservedDoors],
    windows: [...(instantiated.windows ?? [])],
    furniture: [...(instantiated.furniture ?? []), ...preservedExteriorFurniture],
    exteriorZones: (current.exteriorZones ?? []).map((zone) => ({ ...zone })),
    entranceSteps: (current.entranceSteps ?? []).map((item) => ({ ...item })),
    entranceRamps: (current.entranceRamps ?? []).map((item) => ({ ...item })),
    stairs: preservedExteriorStairs,
  };
  const oldFloorNodes = navNodes.filter((node) => node.floorId === current.id && node.buildingId === current.buildingId);
  const retainedNavNodes = oldFloorNodes
    .filter((node) => (
      (node.doorId ? preservedDoorIds.has(node.doorId) : false)
      || (node.stairId ? preservedStairIds.has(node.stairId) : false)
      || !!node.exteriorEmergencyStairId
      || !!node.buildingEntranceId
    ))
    .map((node) => ({ ...node }));
  const retainedIds = new Set(retainedNavNodes.map((node) => node.id));
  const retainedNavEdges = navEdges
    // `buildFloorUpdates` merges the returned edges into the current floor
    // slice; unrelated outdoor edges remain in the campus arrays untouched.
    .filter((edge) => (retainedIds.has(edge.startNodeId) || retainedIds.has(edge.endNodeId))
      && !oldFloorNodes.some((node) => node.id === edge.startNodeId && !retainedIds.has(node.id))
      && !oldFloorNodes.some((node) => node.id === edge.endNodeId && !retainedIds.has(node.id)))
    .map((edge) => ({ ...edge, bendPoints: edge.bendPoints?.map((point) => ({ ...point })) }));
  return {
    floor: nextFloor,
    preservedDoors,
    preservedExteriorStairs,
    preservedExteriorFurniture,
    retainedNavNodes,
    retainedNavEdges,
    summary: summarizeFloorForTemplateReplacement(current, navNodes, navEdges),
  };
}

export function formatFloorReplacementSummary(summary: FloorReplacementSummary): string {
  const line = (count: number, singular: string, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;
  return [
    line(summary.rooms, "Room"),
    line(summary.walls, "indoor Wall", "indoor Walls"),
    line(summary.doors, "Door"),
    line(summary.windows, "Window"),
    line(summary.furniture, "Furniture item", "Furniture items"),
    line(summary.walkingPoints, "Walking Point"),
    line(summary.navigationConnections, "indoor navigation connection", "indoor navigation connections"),
  ].join("\n");
}

// Keep this import used as a type-level contract for callers that pass the
// selected definition alongside the already-instantiated Floor.
export type { FloorTemplateDefinition };
