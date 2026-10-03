import type { Campus, CampusBuilding } from "./types";
import { roomDoorIsValid, roomAccessDoorIds } from "../../lib/indoorNavigationGraph";
import { doorHasIndoorNavigationConnection } from "../../lib/entranceTransitions";
import { buildTestRouteEdges, roomRouteInfo } from "./TestNavigationPanel";

export type RoomNavigationHealthStatus = "connected" | "needs_attention" | "no_usable_entrance";

export interface RoomNavigationHealthIssue {
  roomId: string;
  roomName: string;
  floorId: string;
  floorLabel: string;
  status: Exclude<RoomNavigationHealthStatus, "connected">;
  reason: string;
  doorId?: string;
  doorNodeId?: string;
}

export interface BuildingNavigationHealth {
  total: number;
  connected: number;
  issues: RoomNavigationHealthIssue[];
}

/**
 * Keep the Basic tab's status aligned with Test Route. A Room is only marked
 * connected when the same route adapter can resolve its physical Room→Door
 * endpoint against the authored campus graph.
 */
export function buildingNavigationHealth(campus: Campus, building: CampusBuilding): BuildingNavigationHealth {
  const routeEdges = buildTestRouteEdges(campus);
  const nodes = campus.navNodes ?? [];
  const issues: RoomNavigationHealthIssue[] = [];
  let total = 0;
  let connected = 0;

  for (const floor of building.floors ?? []) {
    for (const room of floor.rooms ?? []) {
      total += 1;
      const routeInfo = roomRouteInfo(campus, building.id, room.id, routeEdges);
      if (routeInfo) {
        connected += 1;
        continue;
      }

      const doorIds = roomAccessDoorIds(room);
      const physicalDoor = doorIds
        .map((doorId) => floor.doors.find((door) => door.id === doorId))
        .find((door) => roomDoorIsValid(room, door, floor.walls));
      const base = { roomId: room.id, roomName: room.name || "Unnamed room", floorId: floor.id, floorLabel: floor.label };
      if (!physicalDoor) {
        issues.push({ ...base, status: "no_usable_entrance", reason: "No usable linked room entrance." });
        continue;
      }

      const doorNode = nodes.find((node) => node.doorId === physicalDoor.id
        && node.buildingId === building.id && node.floorId === floor.id);
      const roomNode = nodes.find((node) => node.roomId === room.id
        && node.buildingId === building.id && node.floorId === floor.id);
      const reason = !doorNode
        ? "The linked door has no navigation node."
        : !roomNode
          ? "The room is not linked to the Test Route graph."
          : !doorHasIndoorNavigationConnection(nodes, campus.navEdges, doorNode)
            ? "Door is not connected to the walking network."
            : "This room is not currently available in Test Route.";
      issues.push({ ...base, status: "needs_attention", reason, doorId: physicalDoor.id, doorNodeId: doorNode?.id });
    }
  }

  return { total, connected, issues };
}

export function reviewTargetForRoomIssue(issue: RoomNavigationHealthIssue): { type: "room" | "door"; id: string } {
  if (issue.doorId) return { type: "door", id: issue.doorId };
  return { type: "room", id: issue.roomId };
}
