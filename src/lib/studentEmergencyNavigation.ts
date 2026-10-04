import type { Campus } from "../components/map-builder/types";
import {
  buildTestRouteEdges,
  chooseEmergencyDestinationCandidate,
  resolveNodeId,
} from "../components/map-builder/TestNavigationPanel";
import type { Destination } from "./combinedPathfinding";
import { plannedRouteFromAuthoredPath, type PlannedRoute } from "./routePlanner";

/** Use the exact admin Test Route evacuation contract, including obstacle
 * checks, designated-stair priority, gate targeting and safe general fallback. */
export function planStudentEmergencyRoute(
  campus: Campus | null,
  origin: Destination | { type: "point"; x: number; y: number } | null,
): PlannedRoute | null {
  if (!campus || !origin) return null;
  const nodes = campus.navNodes ?? [];
  const edges = buildTestRouteEdges(campus);
  let startIds: string[] = [];
  let label = "You are here";
  if (origin.type === "point") {
    const nearest = nodes.filter((node) => !node.floorId)
      .filter((node) => edges.some((edge) => !edge.closed && edge.emergencySafe !== false
        && (edge.startNodeId === node.id || edge.endNodeId === node.id)))
      .sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y))[0];
    if (nearest) startIds = [nearest.id];
  } else if (origin.type === "room") {
    label = origin.roomName;
    const floor = campus.buildings.find((building) => building.id === origin.buildingId)
      ?.floors.find((floor) => floor.number === origin.floorNumber);
    const room = floor?.rooms.find((room) => room.id === origin.roomId);
    const doorIds = new Set([origin.accessDoorId, ...(origin.accessDoorIds ?? []), room?.accessDoorId, ...(room?.accessDoorIds ?? [])].filter(Boolean));
    const semanticRoomIds = new Set(nodes.filter((node) => node.buildingId === origin.buildingId
      && node.floorId === floor?.id && node.roomId === origin.roomId).map((node) => node.id));
    const semanticDoorIds = new Set(edges.filter((edge) => edge.type === "room_door_transition")
      .flatMap((edge) => semanticRoomIds.has(edge.startNodeId) ? [edge.endNodeId]
        : semanticRoomIds.has(edge.endNodeId) ? [edge.startNodeId] : []));
    startIds = nodes.filter((node) => node.buildingId === origin.buildingId
      && node.floorId === floor?.id && !!node.doorId
      && (doorIds.has(node.doorId) || semanticDoorIds.has(node.id) || node.id === origin.accessNodeId)
      && edges.some((edge) => edge.type !== "room_door_transition" && !edge.closed && edge.emergencySafe !== false
        && (edge.startNodeId === node.id || edge.endNodeId === node.id))).map((node) => node.id);
  } else if (origin.type === "campus_place") {
    label = origin.label;
    const node = nodes.find((candidate) => candidate.id === origin.nodeId
      && (candidate.gateId === origin.campusPlaceId || !candidate.gateId));
    if (node && edges.some((edge) => !edge.closed && edge.emergencySafe !== false
      && (edge.startNodeId === node.id || (edge.bidirectional && edge.endNodeId === node.id)))) startIds = [node.id];
  } else {
    label = origin.label;
    const id = resolveNodeId(`building:${origin.buildingId}`, campus, edges, false, true);
    if (id) startIds = [id];
  }
  const choices = startIds.flatMap((id) => {
    const selected = chooseEmergencyDestinationCandidate(campus, edges, id);
    return selected ? [selected] : [];
  }).sort((a, b) => a.candidate.priority - b.candidate.priority
    || (a.candidate.campusGatePurpose === "emergency_exit" ? 0 : 1) - (b.candidate.campusGatePurpose === "emergency_exit" ? 0 : 1)
    || a.path.distanceM - b.path.distanceM);
  const selected = choices[0];
  if (!selected) return null;
  const planned = plannedRouteFromAuthoredPath(selected.path, campus, edges, label, selected.candidate.label);
  return planned ? { ...planned, emergencyDestinationLabel: selected.candidate.label } : null;
}
