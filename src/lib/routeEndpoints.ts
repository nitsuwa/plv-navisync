import type { SearchResult } from "../hooks/useCampusSearch";
import type { Building } from "../types";
import type { RoomDest } from "./combinedPathfinding";

export type RouteEndpoint =
  | { kind: "manual-pin"; point: { x: number; y: number }; label: "You are here" }
  | { kind: "building"; building: Building }
  | { kind: "room"; room: RoomDest; building: Building };

function findBuilding(result: SearchResult, buildings: readonly Building[]): Building | null {
  const identity = result.buildingId ?? result.id;
  return buildings.find((building) =>
    building.id === identity
    || building.code.toLowerCase() === identity.toLowerCase()
    || building.name.toLowerCase() === result.name.toLowerCase(),
  ) ?? null;
}

export function routeEndpointFromSearchResult(
  result: SearchResult,
  buildings: readonly Building[],
  rooms: readonly RoomDest[],
): RouteEndpoint | null {
  if (result.kind === "building") {
    const building = findBuilding(result, buildings);
    return building ? { kind: "building", building } : null;
  }

  const room = rooms.find((candidate) =>
    candidate.roomId === result.id
    && candidate.buildingId === result.buildingId
    && (result.floorNumber === undefined || candidate.floorNumber === result.floorNumber),
  );
  if (room) {
    const building = buildings.find((candidate) => candidate.id === room.buildingId) ?? null;
    return building ? { kind: "room", room, building } : null;
  }

  return null;
}

export function routeEndpointLabel(endpoint: RouteEndpoint): string {
  if (endpoint.kind === "manual-pin") return endpoint.label;
  return endpoint.kind === "building" ? endpoint.building.name : endpoint.room.roomName;
}

export function routeEndpointContext(endpoint: RouteEndpoint): string {
  if (endpoint.kind === "manual-pin") return "Dropped pin";
  if (endpoint.kind === "building") return `${endpoint.building.code} · Building`;
  return `${endpoint.room.buildingLabel} · Floor ${endpoint.room.floorNumber}`;
}

export function routeEndpointKey(endpoint: RouteEndpoint): string {
  if (endpoint.kind === "manual-pin") return `pin:${endpoint.point.x}:${endpoint.point.y}`;
  if (endpoint.kind === "building") return `building:${endpoint.building.id}`;
  return `room:${endpoint.room.buildingId}:${endpoint.room.floorNumber}:${endpoint.room.roomId}`;
}
