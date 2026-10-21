import type { AssemblyPoint, Campus, NavigationEdge, NavigationNode } from "../components/map-builder/types";
import { emergencyOutdoorNodesThatCanReachAssembly, isOutdoorAssemblyGraphNode } from "./emergencyAssemblyPoints";

export type EmergencyOutdoorConnectivityState = "connected" | "disconnected" | "blocked" | "invalid_anchor";

export interface EmergencyOutdoorComponent {
  nodeIds: string[];
  edgeIds: string[];
}

export interface EmergencyOutdoorGap {
  assemblyNodeId: string;
  networkNodeId: string;
  assemblyLabel: string;
  networkLabel: string;
  distance: number;
}

export interface EmergencyOutdoorBlockedEdge {
  edgeId: string;
  label: string;
  reason: string;
}

export interface EmergencyOutdoorConnectivityReport {
  pointId: string;
  state: EmergencyOutdoorConnectivityState;
  anchorNodeId?: string;
  assemblyComponent: EmergencyOutdoorComponent;
  mainComponent: EmergencyOutdoorComponent;
  nearestGap?: EmergencyOutdoorGap;
  blockedEdges: EmergencyOutdoorBlockedEdge[];
  summary: string;
  nextAction: string;
}

function outdoorNodes(campus: Campus): NavigationNode[] {
  return (campus.navNodes ?? []).filter((node) => isOutdoorAssemblyGraphNode(node, campus.id));
}

function graphComponents(
  nodes: NavigationNode[],
  edges: NavigationEdge[],
  eligibleOnly: boolean,
): EmergencyOutdoorComponent[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const usableEdges = edges.filter((edge) => nodeIds.has(edge.startNodeId) && nodeIds.has(edge.endNodeId)
    && edge.startNodeId !== edge.endNodeId
    && edge.type !== "room_door_transition"
    && (!eligibleOnly || (!edge.closed && edge.emergencySafe !== false && !edge.emergencyReason)));
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of usableEdges) {
    adjacency.get(edge.startNodeId)?.push(edge.endNodeId);
    adjacency.get(edge.endNodeId)?.push(edge.startNodeId);
  }
  const remaining = new Set(nodeIds);
  const components: EmergencyOutdoorComponent[] = [];
  while (remaining.size > 0) {
    const first = remaining.values().next().value as string;
    const seen = new Set([first]);
    const pending = [first];
    remaining.delete(first);
    while (pending.length > 0) {
      const current = pending.pop()!;
      for (const next of adjacency.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        remaining.delete(next);
        pending.push(next);
      }
    }
    components.push({
      nodeIds: [...seen],
      edgeIds: usableEdges.filter((edge) => seen.has(edge.startNodeId) && seen.has(edge.endNodeId)).map((edge) => edge.id),
    });
  }
  return components.sort((left, right) => right.nodeIds.length - left.nodeIds.length
    || left.nodeIds.slice().sort()[0].localeCompare(right.nodeIds.slice().sort()[0]));
}

function graphLabel(node: NavigationNode | undefined, fallbackId: string): string {
  const name = node?.name?.trim();
  return name && !/^(walking point|waypoint)$/i.test(name) ? `${name} (${fallbackId})` : `Walking Point ${fallbackId}`;
}

function nearestGap(
  assemblyNodeIds: string[],
  networkNodeIds: string[],
  nodesById: Map<string, NavigationNode>,
): EmergencyOutdoorGap | undefined {
  let best: EmergencyOutdoorGap | undefined;
  for (const assemblyNodeId of assemblyNodeIds) {
    const assemblyNode = nodesById.get(assemblyNodeId);
    if (!assemblyNode) continue;
    for (const networkNodeId of networkNodeIds) {
      const networkNode = nodesById.get(networkNodeId);
      if (!networkNode) continue;
      const distance = Math.hypot(assemblyNode.x - networkNode.x, assemblyNode.y - networkNode.y);
      if (!best || distance < best.distance) {
        best = {
          assemblyNodeId,
          networkNodeId,
          assemblyLabel: graphLabel(assemblyNode, assemblyNodeId),
          networkLabel: graphLabel(networkNode, networkNodeId),
          distance: Math.round(distance),
        };
      }
    }
  }
  return best;
}

/**
 * Inspect the Assembly Point's authored outdoor graph without changing it.
 * Emergency eligibility and physical connectivity are evaluated separately:
 * this can identify a closed or unreviewed link without treating it as usable.
 */
export function analyzeEmergencyOutdoorConnectivity(campus: Campus, point: AssemblyPoint): EmergencyOutdoorConnectivityReport {
  const nodes = outdoorNodes(campus);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const anchor = nodesById.get(point.navNodeId ?? "");
  if (!anchor || anchor.type !== "assembly" || anchor.assemblyPointId !== point.id) {
    return {
      pointId: point.id,
      state: "invalid_anchor",
      assemblyComponent: { nodeIds: [], edgeIds: [] },
      mainComponent: { nodeIds: [], edgeIds: [] },
      blockedEdges: [],
      summary: "The Assembly Point has no matching outdoor navigation anchor.",
      nextAction: "Restore or reconnect its linked Assembly Point waypoint in the outdoor Navigation layer.",
    };
  }

  const allEdges = campus.navEdges ?? [];
  const eligibleComponents = graphComponents(nodes, allEdges, true);
  const physicalComponents = graphComponents(nodes, allEdges, false);
  const eligibleAnchorComponent = eligibleComponents.find((component) => component.nodeIds.includes(anchor.id))
    ?? { nodeIds: [anchor.id], edgeIds: [] };
  const physicalAnchorComponent = physicalComponents.find((component) => component.nodeIds.includes(anchor.id))
    ?? { nodeIds: [anchor.id], edgeIds: [] };
  const anchorIsUniqueEligibleLargest = eligibleComponents.length === 1
    || eligibleAnchorComponent.nodeIds.length > Math.max(0, ...eligibleComponents
      .filter((component) => component !== eligibleAnchorComponent).map((component) => component.nodeIds.length));
  // Treat the Assembly Point component as the campus network only when it is
  // uniquely largest (or is the only component). On a tie there is not enough
  // topology evidence to claim the Assembly Point is connected to the campus;
  // keep a separate largest component visible so the Inspector can show the
  // actual gap instead of drawing the same component in both colors.
  const eligibleMain = anchorIsUniqueEligibleLargest
    ? eligibleAnchorComponent
    : eligibleComponents.find((component) => component !== eligibleAnchorComponent) ?? eligibleAnchorComponent;
  const physicalAnchorIsUniqueLargest = physicalComponents.length === 1
    || physicalAnchorComponent.nodeIds.length > Math.max(0, ...physicalComponents
      .filter((component) => component !== physicalAnchorComponent).map((component) => component.nodeIds.length));
  const physicalMain = physicalAnchorIsUniqueLargest
    ? physicalAnchorComponent
    : physicalComponents.find((component) => component !== physicalAnchorComponent) ?? physicalAnchorComponent;
  const canReachAssembly = emergencyOutdoorNodesThatCanReachAssembly(campus, anchor.id);
  const hasEligibleIncomingLink = eligibleAnchorComponent.nodeIds.some((nodeId) => nodeId !== anchor.id && canReachAssembly.has(nodeId));

  const outgoingOnlyAnchorLinks = allEdges.filter((edge) => edge.startNodeId === anchor.id && !edge.bidirectional
    && !edge.closed && edge.emergencySafe !== false && !edge.emergencyReason && edge.type !== "room_door_transition");
  if (!hasEligibleIncomingLink && outgoingOnlyAnchorLinks.length > 0) {
    const blockedEdges = outgoingOnlyAnchorLinks.map((edge) => ({
      edgeId: edge.id,
      label: nodesById.get(edge.endNodeId)?.name?.trim() || "Assembly Point anchor connection",
      reason: "This one-way connection only permits travel away from the Assembly Point.",
    }));
    return {
      pointId: point.id,
      state: "blocked",
      anchorNodeId: anchor.id,
      assemblyComponent: eligibleAnchorComponent,
      mainComponent: eligibleMain,
      blockedEdges,
      summary: `The Assembly Point is reachable only in the outward direction; incoming evacuation travel is blocked by ${blockedEdges[0].label} (${blockedEdges[0].edgeId}).`,
      nextAction: "Inspect the highlighted one-way edge and correct its direction only if the authored physical path permits evacuation toward the Assembly Point.",
    };
  }

  const connected = anchorIsUniqueEligibleLargest && eligibleAnchorComponent.nodeIds.length > 1 && hasEligibleIncomingLink;
  if (connected) {
    return {
      pointId: point.id,
      state: "connected",
      anchorNodeId: anchor.id,
      assemblyComponent: eligibleAnchorComponent,
      mainComponent: eligibleMain,
      blockedEdges: [],
      summary: `The Assembly Point is in the largest emergency-eligible outdoor component (${eligibleAnchorComponent.nodeIds.length} waypoints).`,
      nextAction: "No outdoor graph connection repair is indicated by this snapshot.",
    };
  }

  const eligibleBoundary = allEdges.filter((edge) => {
    const startsInside = eligibleAnchorComponent.nodeIds.includes(edge.startNodeId);
    const endsInside = eligibleAnchorComponent.nodeIds.includes(edge.endNodeId);
    return startsInside !== endsInside;
  });
  const blockedEdges = eligibleBoundary.flatMap((edge) => {
    if (edge.type === "room_door_transition") return [];
    const startsInside = eligibleAnchorComponent.nodeIds.includes(edge.startNodeId);
    const node = nodesById.get(startsInside ? edge.endNodeId : edge.startNodeId);
    if (edge.closed) return [{ edgeId: edge.id, label: node?.name?.trim() || "Outdoor connection", reason: "This authored connection is closed." }];
    if (edge.emergencySafe === false) return [{ edgeId: edge.id, label: node?.name?.trim() || "Outdoor connection", reason: "This authored connection is not designated for emergency use." }];
    if (edge.emergencyReason) return [{ edgeId: edge.id, label: node?.name?.trim() || "Outdoor connection", reason: "This authored connection is marked unsafe for emergency use." }];
    return [];
  });
  const directionBlockedEdges = allEdges.flatMap((edge) => {
    if (edge.closed || edge.emergencySafe === false || edge.emergencyReason || edge.bidirectional
      || edge.type === "room_door_transition" || edge.startNodeId === edge.endNodeId) return [];
    const startIsInComponent = eligibleAnchorComponent.nodeIds.includes(edge.startNodeId);
    const endIsInComponent = eligibleAnchorComponent.nodeIds.includes(edge.endNodeId);
    if (!startIsInComponent || !endIsInComponent) return [];
    // The start is on the side that can already reach the Assembly Point and
    // the end is not. This one-way edge therefore points away from the point
    // and cannot carry evacuation traffic from the disconnected side inward.
    if (!canReachAssembly.has(edge.startNodeId) || canReachAssembly.has(edge.endNodeId)) return [];
    return [{
      edgeId: edge.id,
      label: nodesById.get(edge.endNodeId)?.name?.trim() || "One-way outdoor connection",
      reason: "This one-way connection points away from the Assembly Point.",
    }];
  });
  blockedEdges.push(...directionBlockedEdges);
  const physicallySharesMain = physicalAnchorComponent === physicalMain && physicalAnchorComponent.nodeIds.length > 1;
  const otherMainIds = eligibleMain.nodeIds.filter((id) => !eligibleAnchorComponent.nodeIds.includes(id));
  const gap = nearestGap(eligibleAnchorComponent.nodeIds, otherMainIds, nodesById);
  const reportState: EmergencyOutdoorConnectivityState = blockedEdges.length > 0 && physicallySharesMain
    ? "blocked"
    : "disconnected";

  if (reportState === "blocked") {
    const first = blockedEdges[0];
    return {
      pointId: point.id,
      state: reportState,
      anchorNodeId: anchor.id,
      assemblyComponent: eligibleAnchorComponent,
      mainComponent: eligibleMain,
      nearestGap: gap,
      blockedEdges,
      summary: `Authored graph topology reaches the main outdoor component, but the connection ${first.label} (${first.edgeId}) blocks evacuation: ${first.reason}`,
      nextAction: "Inspect the highlighted connection. Correct its direction or emergency eligibility only when the authored physical path supports that change.",
    };
  }

  return {
    pointId: point.id,
    state: reportState,
    anchorNodeId: anchor.id,
    assemblyComponent: eligibleAnchorComponent,
    mainComponent: eligibleMain,
    nearestGap: gap,
    blockedEdges: [],
    summary: gap
      ? `The Assembly Point is disconnected from the main emergency-eligible outdoor network. Its component has ${eligibleAnchorComponent.nodeIds.length} waypoint${eligibleAnchorComponent.nodeIds.length === 1 ? "" : "s"}; the main component has ${eligibleMain.nodeIds.length}.`
      : "The Assembly Point is not connected to an emergency-eligible outdoor pathway component.",
    nextAction: gap
      ? `Inspect the existing endpoints ${gap.assemblyLabel} and ${gap.networkLabel} (about ${gap.distance} map units apart). Confirm the real walkway or junction, then author the missing physical connection in Navigation.`
      : "Connect the Assembly Point anchor to an authored outdoor pathway through the Navigation layer.",
  };
}
