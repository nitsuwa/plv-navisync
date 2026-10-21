const fs = require("node:fs");
const data = JSON.parse(fs.readFileSync("verification-artifacts/navigation-reliability-20261017/accessible-candidate-internals.json", "utf8"));
const candidates = data.state.candidateArrays[0].candidates;
const candidateNodeIds = new Set(candidates.flatMap((candidate) => candidate.route.authoredGraphNodeIds ?? []));
const graph = data.state.graphStates.find((entry) => entry.navNodes.some((node) => candidateNodeIds.has(node.id)));
const nodes = new Map(graph.navNodes.map((node) => [node.id, node]));
const summary = candidates.map((candidate) => {
  const route = candidate.route;
  const endpoint = nodes.get(route.authoredGraphNodeIds?.at(-1));
  const floorFour = route.indoorSegments?.find((segment) => segment.floorNumber === 4);
  return {
    label: candidate.label,
    routeCost: route.dist,
    traversedAuthoredEdgeCount: route.authoredGraphEdgeIds?.length ?? 0,
    destinationDoor: endpoint ? { id: endpoint.doorId ?? endpoint.id, name: endpoint.name, x: endpoint.x, y: endpoint.y, floorId: endpoint.floorId } : null,
    elevatorTransitions: (route.contextHandoffs ?? []).filter((handoff) => handoff.kind === "elevator")
      .map((handoff) => ({ label: handoff.label, sharedId: handoff.detail?.transitionSharedId, fromFloorId: handoff.detail?.fromFloorId, toFloorId: handoff.detail?.toFloorId })),
    floorFourSegment: floorFour ? { start: floorFour.waypoints[0], end: floorFour.waypoints.at(-1), waypoints: floorFour.waypoints.length } : null,
  };
});
const result = { graphNodes: graph.navNodes.length, graphEdges: graph.navEdges.length, candidates: summary };
fs.writeFileSync("verification-artifacts/navigation-reliability-20261017/accessible-route-candidate-summary.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
