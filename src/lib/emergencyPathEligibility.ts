import type { Campus, NavigationEdge, NavigationNode } from "../components/map-builder/types";
import { normalizeEntranceDirection, normalizeEntranceType } from "./buildingEntrances";

export type EmergencyPathIssue = {
  kind: "stairs" | "door" | "path";
  id: string;
  buildingId?: string;
  floorId?: string;
  label: string;
  detail: string;
};

export type EmergencyPathAssessment = {
  /** Every hop is an authored, connected, open edge and the path reaches its endpoint. */
  connected: boolean;
  /** The connected path uses only assets currently designated for emergency use. */
  emergencyEligible: boolean;
  issues: EmergencyPathIssue[];
};

type EmergencyPathInput = {
  nodeIds: readonly string[];
  edgeIds: readonly (string | undefined)[];
  destinationNodeId: string;
  /** A room/building evacuation must not route through another building's interior. */
  originBuildingId?: string;
  /** Last authored waypoint from the route geometry, when validating a planned route. */
  destinationPoint?: { x: number; y: number };
};

const closeEnough = (a: number, b: number) => Math.abs(a - b) <= 0.01;

/**
 * Validate the exact authored graph path that SOS will show and play. The graph
 * stores emergencySafe as true-by-default for ordinary open Walking Network
 * edges; vertical/egress assets have their own explicit emergency designation
 * and are rejected unless that owner metadata is current and affirmative.
 */
export function assessEmergencyAuthoredPath(
  campus: Campus,
  edges: readonly NavigationEdge[],
  input: EmergencyPathInput,
): EmergencyPathAssessment {
  let connected = true;
  let emergencyEligible = true;
  const issues: EmergencyPathIssue[] = [];
  const issueKeys = new Set<string>();
  const addIssue = (issue: EmergencyPathIssue) => {
    const key = `${issue.kind}:${issue.buildingId ?? ""}:${issue.floorId ?? ""}:${issue.id}`;
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    issues.push(issue);
  };
  const pathIssue = (id: string, detail: string, node?: NavigationNode): EmergencyPathIssue => ({
    kind: "path",
    id,
    ...(node?.buildingId ? { buildingId: node.buildingId } : {}),
    ...(node?.floorId ? { floorId: node.floorId } : {}),
    label: node?.name?.trim() || "Emergency route connection",
    detail,
  });
  const nodes = campus.navNodes ?? [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));

  if (input.nodeIds.length < 2 || input.edgeIds.length !== input.nodeIds.length - 1
    || input.nodeIds.at(-1) !== input.destinationNodeId) {
    connected = false;
    addIssue(pathIssue(input.destinationNodeId, "The route does not contain a complete authored path to its selected destination."));
  }

  const pathNodes = input.nodeIds.map((id) => nodeById.get(id));
  if (pathNodes.some((node) => !node)) {
    connected = false;
    addIssue(pathIssue(input.destinationNodeId, "A route waypoint is missing from the current navigation graph."));
  }
  const destinationNode = nodeById.get(input.destinationNodeId);
  if (!destinationNode) {
    connected = false;
    addIssue(pathIssue(input.destinationNodeId, "The selected destination has no navigation anchor."));
  } else if (input.destinationPoint && (!closeEnough(input.destinationPoint.x, destinationNode.x)
    || !closeEnough(input.destinationPoint.y, destinationNode.y))) {
    connected = false;
    addIssue(pathIssue(input.destinationNodeId, "The route geometry does not end at the selected destination anchor.", destinationNode));
  }

  for (let index = 0; index < input.nodeIds.length - 1; index += 1) {
    const fromId = input.nodeIds[index];
    const toId = input.nodeIds[index + 1];
    const from = pathNodes[index];
    const to = pathNodes[index + 1];
    const edgeId = input.edgeIds[index];
    const edge = edgeId ? edgeById.get(edgeId) : undefined;
    const forward = edge?.startNodeId === fromId && edge.endNodeId === toId;
    const reverse = edge?.bidirectional === true && edge.startNodeId === toId && edge.endNodeId === fromId;
    if (!edge || !from || !to || (!forward && !reverse) || edge.closed) {
      connected = false;
      addIssue(pathIssue(edgeId ?? `${fromId}->${toId}`, "A route segment is missing, closed, or disconnected." , from));
      continue;
    }
    if (from.floorId && to.floorId && from.floorId !== to.floorId
      && edge.type !== "floor_transition" && edge.type !== "cross_floor") {
      connected = false;
      addIssue(pathIssue(edge.id, "A floor change is missing its authored stair or elevator transition.", from));
    }
    if (edge.emergencySafe === false || edge.emergencyReason) {
      emergencyEligible = false;
      addIssue(pathIssue(edge.id, edge.emergencyReason
        ? `This connection is marked unsafe for emergency use (${edge.emergencyReason}).`
        : "This connection has not been designated for emergency use.", from));
    }

    // An entrance link must be traversed in the physically authored direction.
    // Older snapshots can contain a bidirectional edge even when the owner
    // entrance is explicitly entrance-only, so validate the owner metadata in
    // addition to the graph edge direction.
    const entranceNode = from?.entranceId && !from.floorId ? from
      : to?.entranceId && !to.floorId ? to : undefined;
    const otherEndpoint = entranceNode?.id === fromId ? to : from;
    const isEntranceThresholdHop = Boolean(entranceNode?.entranceId && otherEndpoint?.floorId
      && otherEndpoint.buildingId === entranceNode.buildingId);
    if (isEntranceThresholdHop && entranceNode?.entranceId && entranceNode.buildingId) {
      const entrance = campus.buildings.find((building) => building.id === entranceNode.buildingId)
        ?.entrances?.find((item) => item.id === entranceNode.entranceId);
      const direction = normalizeEntranceDirection(entrance);
      const traversingOut = entranceNode.id === toId;
      if (!entrance || normalizeEntranceType(entrance.type) === "service"
        || traversingOut && direction === "entrance_only"
        || !traversingOut && direction === "exit_only") {
        connected = false;
        addIssue(pathIssue(entranceNode.id, "This route uses a missing, service-only, or directionally prohibited Building Entrance.", entranceNode));
      }
    }
  }

  const explicitElevatorOverride = new Set<string>();
  for (const edgeId of input.edgeIds) {
    const edge = edgeId ? edgeById.get(edgeId) : undefined;
    const metadata = edge as (NavigationEdge & { emergencySafeExplicit?: boolean; emergencySafeOverride?: boolean }) | undefined;
    if (edge && metadata && (metadata.emergencySafeExplicit === true || metadata.emergencySafeOverride === true)) {
      explicitElevatorOverride.add(edge.startNodeId);
      explicitElevatorOverride.add(edge.endNodeId);
    }
  }

  for (const maybeNode of pathNodes) {
    if (!maybeNode) continue;
    const node = maybeNode;
    if (node.emergencySafe === false) {
      emergencyEligible = false;
      addIssue(pathIssue(node.id, "This navigation anchor is explicitly excluded from emergency use.", node));
    }
    if (input.originBuildingId && node.floorId && node.buildingId !== input.originBuildingId) {
      connected = false;
      addIssue(pathIssue(node.id, "The route leaves the selected building through another building's interior.", node));
    }
    if (node.floorId && (!node.buildingId || !campus.buildings.some((building) => building.id === node.buildingId
      && building.floors.some((floor) => floor.id === node.floorId)))) {
      connected = false;
      addIssue(pathIssue(node.id, "This indoor route anchor is not owned by a current Building and Floor.", node));
    }

    // Exterior stair discharge nodes can also use the generic `stair` node
    // type. Their authoritative eligibility lives on the Building-owned
    // Exterior Emergency Stair record below; requiring a Floor.stairs match
    // here incorrectly marks a valid exterior exit as unreviewed.
    if (!node.exteriorEmergencyStairId && (node.stairId || node.type === "stair" || node.emergencyStair)) {
      const building = campus.buildings.find((item) => item.id === node.buildingId);
      const floor = building?.floors.find((item) => item.id === node.floorId);
      const stair = node.stairId ? floor?.stairs.find((item) => item.id === node.stairId) : undefined;
      // Ordinary indoor Stairs are part of the emergency graph by default.
      // `false` is the authored prohibition; absent legacy metadata must not
      // disable every ordinary stair run in older campus snapshots.
      if (!stair || stair.emergencySafe === false) {
        emergencyEligible = false;
        addIssue({
          kind: "stairs",
          id: node.stairId ?? node.id,
          ...(building ? { buildingId: building.id } : node.buildingId ? { buildingId: node.buildingId } : {}),
          ...(floor ? { floorId: floor.id } : node.floorId ? { floorId: node.floorId } : {}),
          label: stair?.label?.trim() || node.name?.trim() || "Stair",
          detail: "This Stair is explicitly excluded from emergency use.",
        });
      }
    }

    if (node.exteriorEmergencyStairId) {
      const building = campus.buildings.find((item) => item.id === node.buildingId);
      const stair = building?.exteriorEmergencyStairs?.find((item) => item.id === node.exteriorEmergencyStairId);
      if (!stair || stair.state !== "open" || stair.emergencySafe !== true) {
        emergencyEligible = false;
        addIssue({
          kind: "stairs",
          id: node.exteriorEmergencyStairId,
          ...(building ? { buildingId: building.id } : node.buildingId ? { buildingId: node.buildingId } : {}),
          label: stair?.label?.trim() || node.name?.trim() || "Exterior Emergency Stair",
          detail: "This Exterior Emergency Stair is closed or not currently designated for emergency use.",
        });
      }
    }

    if (node.elevatorId || node.type === "elevator") {
      const building = campus.buildings.find((item) => item.id === node.buildingId);
      const floor = building?.floors.find((item) => item.id === node.floorId);
      const elevator = floor?.elevators.find((item) => item.id === node.elevatorId);
      const designated = node.emergencySafe === true
        || elevator?.emergencySafe === true
        || explicitElevatorOverride.has(node.id);
      if (!elevator || !designated) {
        emergencyEligible = false;
        addIssue(pathIssue(node.elevatorId ?? node.id, "This Elevator is not explicitly designated for emergency use.", node));
      }
    }

    if (node.doorId) {
      const building = campus.buildings.find((item) => item.id === node.buildingId);
      const floor = building?.floors.find((item) => item.id === node.floorId);
      const door = floor?.doors.find((item) => item.id === node.doorId);
      if (!door || door.locked === true || door.visible === false) {
        connected = false;
        addIssue({
          kind: "door",
          id: node.doorId,
          ...(building ? { buildingId: building.id } : node.buildingId ? { buildingId: node.buildingId } : {}),
          ...(floor ? { floorId: floor.id } : node.floorId ? { floorId: node.floorId } : {}),
          label: node.name?.trim() || "Door",
          detail: !door
            ? "This navigation anchor is not linked to a current physical Door."
            : door.locked === true
              ? "This route passes through a locked Door."
              : "This route passes through a hidden Door.",
        });
      }
    }

    if (node.entranceId) {
      const building = campus.buildings.find((item) => item.id === node.buildingId);
      const entrance = building?.entrances?.find((item) => item.id === node.entranceId);
      if (!entrance || entrance.type === "service") {
        connected = false;
        addIssue(pathIssue(node.id, "This route uses a missing or service-only Building Entrance.", node));
      }
    }
  }

  return { connected, emergencyEligible: connected && emergencyEligible, issues };
}
