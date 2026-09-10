import { describe, expect, it } from "vitest";
import type { Campus, CampusPath, NavigationEdge, NavigationNode } from "../../components/map-builder/types";
import {
  convertPathwaysToNavigation,
  pathwayHasLegacyNavigationChain,
  reconcilePathwayNavigation,
} from "../campusPathNavigation";
import { syncCampusGateNavigation } from "../campusGates";
import { findNavigationRoute } from "../pathfinding";
import { serializeCampusStructure, hydrateCampusStructure } from "../../services/campusStructureService";

const makeIdFactory = () => {
  let sequence = 0;
  return (prefix: string) => prefix + "-" + (++sequence);
};

const makePath = (
  id: string,
  points: { x: number; y: number }[],
  navigationVertexIds?: string[],
  extra: Partial<CampusPath> = {},
): CampusPath => ({
  id,
  points,
  navigationVertexIds,
  type: "walkway",
  color: "#94a3b8",
  width: 10,
  ...extra,
});

const makeCampus = (
  paths: CampusPath[] = [],
  navNodes: NavigationNode[] = [],
  navEdges: NavigationEdge[] = [],
): Campus => ({
  id: "campus-1",
  name: "Regression Campus",
  code: "REG",
  description: "",
  address: "",
  city: "",
  province: "",
  postalCode: "",
  status: "active",
  publishStatus: "draft",
  visibleToStudents: false,
  features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
  canvasW: 1200,
  canvasH: 800,
  settings: { accessibility: true, emergency: true, eventLayer: true, gps: false },
  buildings: [],
  markers: [],
  paths,
  navNodes,
  navEdges,
  decorAssets: [],
  createdAt: "",
  updatedAt: "",
} as Campus);

const generatedNodesFor = (value: Campus, pathId: string) =>
  (value.navNodes ?? []).filter((node) => node.generatedFromPathVertices?.some((ref) => ref.pathId === pathId));

const generatedEdgesFor = (value: Campus, pathId: string) =>
  (value.navEdges ?? []).filter((edge) => edge.generatedFromPathIds?.includes(pathId));

const pathwaySnapshot = (value: Campus) => ({
  paths: (value.paths ?? []).map((path) => ({
    id: path.id,
    points: path.points.map((point) => ({ ...point })),
    navigationVertexIds: path.navigationVertexIds ? [...path.navigationVertexIds] : undefined,
    pathNetworkId: path.pathNetworkId,
    disconnectedJunctionKeys: path.disconnectedJunctionKeys ? [...path.disconnectedJunctionKeys] : undefined,
  })).sort((a, b) => a.id.localeCompare(b.id)),
  generatedNodes: (value.navNodes ?? [])
    .filter((node) => node.generatedFromPathVertices?.length)
    .map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      generatedFromPathVertices: node.generatedFromPathVertices?.map((ref) => ({ ...ref })),
    })).sort((a, b) => a.id.localeCompare(b.id)),
  generatedEdges: (value.navEdges ?? [])
    .filter((edge) => edge.generatedFromPathIds?.length)
    .map((edge) => ({
      id: edge.id,
      startNodeId: edge.startNodeId,
      endNodeId: edge.endNodeId,
      distance: edge.distance,
      generatedFromPathIds: edge.generatedFromPathIds ? [...edge.generatedFromPathIds] : undefined,
    })).sort((a, b) => a.id.localeCompare(b.id)),
  externalEdges: (value.navEdges ?? [])
    .filter((edge) => !edge.generatedFromPathIds?.length)
    .map((edge) => ({
      id: edge.id,
      startNodeId: edge.startNodeId,
      endNodeId: edge.endNodeId,
      bendPoints: edge.bendPoints?.map((point) => ({ ...point })),
    })).sort((a, b) => a.id.localeCompare(b.id)),
});

const rowsFromPayload = (payload: ReturnType<typeof serializeCampusStructure>) => ({
  buildings: payload.buildings.map((row) => ({ ...row, campus_id: "campus-1" }) as never),
  floors: payload.floors.map((row) => row as never),
  mapElements: payload.map_elements.map((row) => row as never),
  navigationNodes: payload.navigation_nodes.map((row) => row as never),
  navigationEdges: payload.navigation_edges.map((row) => row as never),
});

describe("Outdoor Pathway regression safety wall", () => {
  it("keeps Pathway, vertex, generated-node, and generated-edge IDs stable when a middle vertex moves", () => {
    const factory = makeIdFactory();
    const initial = convertPathwaysToNavigation(
      makeCampus([makePath("p1", [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 300, y: 140 }])]),
      ["p1"],
      factory,
    ).campus;
    const originalPath = initial.paths[0];
    const originalVertexIds = [...originalPath.navigationVertexIds!];
    const originalNodes = generatedNodesFor(initial, "p1");
    const originalEdges = generatedEdgesFor(initial, "p1");
    const moved = reconcilePathwayNavigation({
      ...initial,
      paths: [{ ...originalPath, points: [{ x: 100, y: 100 }, { x: 220, y: 130 }, { x: 300, y: 140 }] }],
    }, factory, { preserveAuthoredGeometry: true });

    expect(moved.paths[0].id).toBe("p1");
    expect(moved.paths[0].navigationVertexIds).toEqual(originalVertexIds);
    expect(generatedNodesFor(moved, "p1").map((node) => node.id)).toEqual(originalNodes.map((node) => node.id));
    expect(generatedEdgesFor(moved, "p1").map((edge) => edge.id)).toEqual(originalEdges.map((edge) => edge.id));
    expect(generatedNodesFor(moved, "p1").find((node) => node.id === originalNodes[1].id)).toMatchObject({ x: 220, y: 130 });
    expect(generatedNodesFor(moved, "p1").filter((node) => node.id !== originalNodes[1].id)).toEqual(
      originalNodes.filter((node) => node.id !== originalNodes[1].id),
    );
    const movedMiddle = generatedNodesFor(moved, "p1").find((node) => node.id === originalNodes[1].id)!;
    expect(generatedEdgesFor(moved, "p1").every((edge) => [edge.startNodeId, edge.endNodeId].includes(movedMiddle.id))).toBe(true);
  });

  it("inserts exactly one owned midpoint vertex while preserving both endpoint identities", () => {
    const factory = makeIdFactory();
    const initial = convertPathwaysToNavigation(
      makeCampus([makePath("p1", [{ x: 0, y: 0 }, { x: 200, y: 0 }])]),
      ["p1"],
      factory,
    ).campus;
    const [startVertexId, endVertexId] = initial.paths[0].navigationVertexIds!;
    const beforeNodes = generatedNodesFor(initial, "p1");
    const inserted = reconcilePathwayNavigation({
      ...initial,
      paths: [makePath("p1", [{ x: 0, y: 0 }, { x: 100, y: 20 }, { x: 200, y: 0 }], [startVertexId, "junction-v", endVertexId])],
    }, factory);
    const afterNodes = generatedNodesFor(inserted, "p1");
    const afterEdges = generatedEdgesFor(inserted, "p1");
    const insertedNode = afterNodes.find((node) => node.generatedFromPathVertices?.some((ref) => ref.vertexId === "junction-v"));

    expect(afterNodes).toHaveLength(beforeNodes.length + 1);
    expect(insertedNode).toMatchObject({ x: 100, y: 20 });
    expect(afterNodes.filter((node) => node.id !== insertedNode?.id).map((node) => node.id)).toEqual(beforeNodes.map((node) => node.id));
    expect(afterEdges).toHaveLength(2);
    expect(afterEdges.map((edge) => [edge.startNodeId, edge.endNodeId])).toEqual([
      [beforeNodes[0].id, insertedNode!.id],
      [insertedNode!.id, beforeNodes[1].id],
    ]);
  });

  it("reuses an existing generated Pathway vertex when an external connector is authored to it", () => {
    const factory = makeIdFactory();
    const initial = convertPathwaysToNavigation(
      makeCampus([makePath("p1", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }])]),
      ["p1"],
      factory,
    ).campus;
    const target = generatedNodesFor(initial, "p1")[1];
    const source: NavigationNode = { id: "source", name: "Entrance", type: "entrance", x: 100, y: 80, accessible: true, color: "#16a34a" };
    const withConnector = reconcilePathwayNavigation({
      ...initial,
      navNodes: [...(initial.navNodes ?? []), source],
      navEdges: [...(initial.navEdges ?? []), {
        id: "external-edge", startNodeId: source.id, endNodeId: target.id, distance: 80,
        bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4,
      }],
    }, factory, { preserveAuthoredGeometry: true });

    expect(generatedNodesFor(withConnector, "p1")).toHaveLength(3);
    expect(withConnector.navNodes?.filter((node) => node.id === target.id)).toHaveLength(1);
    expect(withConnector.navEdges?.find((edge) => edge.id === "external-edge")).toMatchObject({ endNodeId: target.id });
  });

  it("creates one canonical owned junction when a segment midpoint is inserted for an external connector", () => {
    const factory = makeIdFactory();
    const initial = convertPathwaysToNavigation(
      makeCampus([makePath("p1", [{ x: 0, y: 0 }, { x: 200, y: 0 }])]),
      ["p1"],
      factory,
    ).campus;
    const ids = initial.paths[0].navigationVertexIds!;
    const withJunction = reconcilePathwayNavigation({
      ...initial,
      paths: [makePath("p1", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }], [ids[0], "mid-v", ids[1]])],
    }, factory);
    const junction = generatedNodesFor(withJunction, "p1").find((node) => node.generatedFromPathVertices?.some((ref) => ref.vertexId === "mid-v"))!;
    const source: NavigationNode = { id: "source", name: "Gate", type: "outdoor", x: 100, y: 80, accessible: true, color: "#16a34a" };
    const committed = reconcilePathwayNavigation({
      ...withJunction,
      navNodes: [...(withJunction.navNodes ?? []), source],
      navEdges: [...(withJunction.navEdges ?? []), {
        id: "connector", startNodeId: source.id, endNodeId: junction.id, distance: 80,
        bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4,
      }],
    }, factory, { preserveAuthoredGeometry: true });

    expect(committed.paths[0].navigationVertexIds).toEqual([ids[0], "mid-v", ids[1]]);
    expect(generatedNodesFor(committed, "p1").filter((node) => node.x === 100 && node.y === 0)).toHaveLength(1);
    expect(committed.navEdges?.find((edge) => edge.id === "connector")).toMatchObject({ endNodeId: junction.id });
    expect(committed.navNodes?.filter((node) => node.id === junction.id)).toHaveLength(1);
  });

  it("keeps an externally referenced generated node instead of deleting or retargeting it during a preserved edit", () => {
    const factory = makeIdFactory();
    const initial = convertPathwaysToNavigation(
      makeCampus([makePath("p1", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }])]),
      ["p1"],
      factory,
    ).campus;
    const target = generatedNodesFor(initial, "p1")[1];
    const source: NavigationNode = { id: "source", name: "Entrance", type: "entrance", x: 80, y: 80, accessible: true, color: "#16a34a" };
    const before = {
      ...initial,
      navNodes: [...(initial.navNodes ?? []), source],
      navEdges: [...(initial.navEdges ?? []), {
        id: "authored", startNodeId: source.id, endNodeId: target.id, distance: 80,
        bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4,
        bendPoints: [{ x: 80, y: 40 }, { x: 60, y: 20 }],
      }],
    } as Campus;
    const ids = before.paths[0].navigationVertexIds!;
    const after = reconcilePathwayNavigation({
      ...before,
      paths: [makePath("p1", [{ x: 0, y: 0 }, { x: 200, y: 0 }], [ids[0], ids[2]])],
    }, factory, { preserveAuthoredGeometry: true });
    const authored = after.navEdges?.find((edge) => edge.id === "authored");
    const preserved = after.navNodes?.find((node) => node.id === target.id);

    expect(preserved).toBeDefined();
    expect(preserved?.generatedFromPathVertices).toBeUndefined();
    expect(authored).toMatchObject({
      startNodeId: source.id,
      endNodeId: target.id,
      bendPoints: before.navEdges?.find((edge) => edge.id === "authored")?.bendPoints,
    });
    expect(after.navEdges?.some((edge) => edge.id === "authored" && edge.endNodeId !== target.id)).toBe(false);
  });

  it("deleting one Pathway leaves unrelated generated topology and external geometry unchanged", () => {
    const factory = makeIdFactory();
    const initial = convertPathwaysToNavigation(makeCampus([
      makePath("p1", [{ x: 0, y: 0 }, { x: 100, y: 0 }]),
      makePath("p2", [{ x: 400, y: 300 }, { x: 500, y: 300 }]),
    ]), ["p1", "p2"], factory).campus;
    const p2Target = generatedNodesFor(initial, "p2")[1];
    const source: NavigationNode = { id: "source", name: "Gate", type: "outdoor", x: 400, y: 360, accessible: true, color: "#16a34a" };
    const before = {
      ...initial,
      navNodes: [...(initial.navNodes ?? []), source],
      navEdges: [...(initial.navEdges ?? []), {
        id: "p2-external", startNodeId: source.id, endNodeId: p2Target.id, distance: 60,
        bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4,
        bendPoints: [{ x: 410, y: 340 }],
      }],
    } as Campus;
    const unrelatedBefore = pathwaySnapshot(before);
    const after = reconcilePathwayNavigation({ ...before, paths: before.paths.filter((path) => path.id !== "p1") }, factory, { preserveAuthoredGeometry: true });

    expect(after.paths.map((path) => path.id)).toEqual(["p2"]);
    expect(generatedNodesFor(after, "p2").map((node) => node.id)).toEqual(generatedNodesFor(before, "p2").map((node) => node.id));
    expect(generatedEdgesFor(after, "p2").map((edge) => edge.id)).toEqual(generatedEdgesFor(before, "p2").map((edge) => edge.id));
    expect(after.navEdges?.find((edge) => edge.id === "p2-external")).toEqual(before.navEdges?.find((edge) => edge.id === "p2-external"));
    expect(pathwaySnapshot({ ...after, paths: after.paths.filter((path) => path.id === "p2") }).paths).toEqual(unrelatedBefore.paths.filter((path) => path.id === "p2"));
  });

  it("does not bridge a gap when a separate Pathway object is deleted", () => {
    const factory = makeIdFactory();
    const initial = convertPathwaysToNavigation(makeCampus([
      makePath("left", [{ x: 0, y: 0 }, { x: 100, y: 0 }]),
      makePath("right", [{ x: 200, y: 0 }, { x: 300, y: 0 }]),
    ]), ["left", "right"], factory).campus;
    const leftIds = initial.paths.find((path) => path.id === "left")!.navigationVertexIds!;
    const rightIds = initial.paths.find((path) => path.id === "right")!.navigationVertexIds!;
    const after = reconcilePathwayNavigation({ ...initial, paths: initial.paths.filter((path) => path.id !== "right") }, factory);
    expect(after.navEdges?.some((edge) =>
      [edge.startNodeId, edge.endNodeId].includes(leftIds[1]) && [edge.startNodeId, edge.endNodeId].includes(rightIds[0]),
    )).toBe(false);
    expect(generatedEdgesFor(after, "left")).toHaveLength(1);
  });

  it("keeps manual nodes distinct from nearby generated nodes and never merges by proximity", () => {
    const factory = makeIdFactory();
    const manual: NavigationNode = { id: "manual", name: "Manual", type: "outdoor", x: 0.4, y: 0.4, accessible: true, color: "#16a34a" };
    const result = convertPathwaysToNavigation(makeCampus([makePath("p1", [{ x: 0, y: 0 }, { x: 100, y: 0 }])], [manual]), ["p1"], factory).campus;
    expect(result.navNodes?.some((node) => node.id === "manual")).toBe(true);
    expect(generatedNodesFor(result, "p1")).toHaveLength(2);
    expect(generatedNodesFor(result, "p1").some((node) => node.id === "manual")).toBe(false);
  });

  it("detects legacy geometry without claiming it or rewriting its IDs", () => {
    const legacyPath = makePath("legacy", [{ x: 10, y: 10 }, { x: 110, y: 10 }]);
    const nodes: NavigationNode[] = [
      { id: "legacy-a", name: "Walking Point", type: "outdoor", x: 10, y: 10, accessible: true, color: "#16a34a" },
      { id: "legacy-b", name: "Walking Point", type: "outdoor", x: 110, y: 10, accessible: true, color: "#16a34a" },
    ];
    const edges: NavigationEdge[] = [{ id: "legacy-edge", startNodeId: "legacy-a", endNodeId: "legacy-b", distance: 100, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4 }];
    const value = makeCampus([legacyPath], nodes, edges);
    expect(pathwayHasLegacyNavigationChain(legacyPath, nodes, edges)).toBe(true);
    const result = convertPathwaysToNavigation(value, ["legacy"], makeIdFactory());
    expect(result.legacyPathIds).toEqual(["legacy"]);
    expect(result.campus.paths[0].navigationVertexIds).toBeUndefined();
    expect(result.campus.navNodes?.map((node) => node.id)).toEqual(["legacy-a", "legacy-b"]);
    expect(result.campus.navEdges?.map((edge) => edge.id)).toEqual(["legacy-edge"]);
  });

  it("keeps generated routing edge identity and flags while updating distance from moved endpoints", () => {
    const factory = makeIdFactory();
    const initial = convertPathwaysToNavigation(makeCampus([makePath("p1", [{ x: 0, y: 0 }, { x: 3, y: 4 }])]), ["p1"], factory).campus;
    const originalEdge = generatedEdgesFor(initial, "p1")[0];
    const flagged = {
      ...initial,
      navEdges: initial.navEdges?.map((edge) => edge.id === originalEdge.id
        ? { ...edge, bidirectional: false, accessible: false, emergencySafe: false }
        : edge),
    } as Campus;
    const startId = originalEdge.startNodeId;
    const endId = originalEdge.endNodeId;
    const moved = reconcilePathwayNavigation({
      ...flagged,
      paths: [makePath("p1", [{ x: 0, y: 0 }, { x: 6, y: 8 }], flagged.paths[0].navigationVertexIds)],
    }, factory);
    const edge = moved.navEdges?.find((candidate) => candidate.id === originalEdge.id)!;
    expect(edge).toMatchObject({ id: originalEdge.id, startNodeId: startId, endNodeId: endId, bidirectional: false, accessible: false, emergencySafe: false, distance: 10 });
    expect(findNavigationRoute(moved.navNodes ?? [], moved.navEdges ?? [], startId, endId)?.nodeIds).toEqual([startId, endId]);
  });

  it("keeps a Campus Gate connector attached while its Pathway target moves", () => {
    const factory = makeIdFactory();
    const withGate = syncCampusGateNavigation({
      ...makeCampus(),
      markers: [{ id: "gate-1", name: "Main Gate", type: "gate", purpose: "general", x: 20, y: 80, color: "#2563eb" }],
    }, (prefix) => prefix + "-stable");
    const converted = convertPathwaysToNavigation({
      ...withGate,
      paths: [makePath("p1", [{ x: 200, y: 100 }, { x: 300, y: 100 }])],
    }, ["p1"], factory).campus;
    const gateNode = converted.navNodes?.find((node) => node.gateId === "gate-1")!;
    const target = generatedNodesFor(converted, "p1")[0];
    const bends = [{ x: 80, y: 100 }, { x: 140, y: 120 }];
    const before = {
      ...converted,
      navEdges: [...(converted.navEdges ?? []), {
        id: "gate-connector", startNodeId: gateNode.id, endNodeId: target.id, distance: 180,
        bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#2563eb", width: 4,
        bendPoints: bends,
      }],
    } as Campus;
    const moved = reconcilePathwayNavigation({
      ...before,
      paths: [makePath("p1", [{ x: 240, y: 140 }, { x: 340, y: 140 }], before.paths[0].navigationVertexIds)],
    }, factory, { preserveAuthoredGeometry: true });

    expect(moved.navNodes?.filter((node) => node.gateId === "gate-1")).toHaveLength(1);
    expect(moved.navNodes?.find((node) => node.gateId === "gate-1")?.id).toBe(gateNode.id);
    expect(moved.navEdges?.find((edge) => edge.id === "gate-connector")).toMatchObject({
      startNodeId: gateNode.id,
      endNodeId: target.id,
      bendPoints: bends,
    });
    expect(moved.paths[0].points).toEqual([{ x: 240, y: 140 }, { x: 340, y: 140 }]);
  });

  it("keeps a Ground Discharge connector identity and authored bends through a Pathway move", () => {
    const factory = makeIdFactory();
    const discharge: NavigationNode = {
      id: "discharge-1", name: "Ground Discharge", type: "stair", x: 20, y: 100,
      campusId: "campus-1", buildingId: "building-1", exteriorEmergencyStairId: "stair-1",
      accessible: false, emergencySafe: true, color: "#dc2626",
    };
    const converted = convertPathwaysToNavigation(makeCampus([
      makePath("p1", [{ x: 200, y: 100 }, { x: 300, y: 100 }]),
    ], [discharge]), ["p1"], factory).campus;
    const target = generatedNodesFor(converted, "p1")[0];
    const bends = [{ x: 80, y: 100 }, { x: 140, y: 120 }];
    const before = {
      ...converted,
      navEdges: [...(converted.navEdges ?? []), {
        id: "discharge-connector", startNodeId: discharge.id, endNodeId: target.id, distance: 180,
        bidirectional: true, accessible: false, emergencySafe: true, type: "walkway", color: "#dc2626", width: 4,
        bendPoints: bends,
      }],
    } as Campus;
    const moved = reconcilePathwayNavigation({
      ...before,
      paths: [makePath("p1", [{ x: 240, y: 140 }, { x: 340, y: 140 }], before.paths[0].navigationVertexIds)],
    }, factory, { preserveAuthoredGeometry: true });

    expect(moved.navNodes?.find((node) => node.id === discharge.id)).toMatchObject({ exteriorEmergencyStairId: "stair-1" });
    expect(moved.navEdges?.find((edge) => edge.id === "discharge-connector")).toMatchObject({
      startNodeId: discharge.id,
      endNodeId: target.id,
      bendPoints: bends,
    });
    expect(moved.navNodes?.filter((node) => node.exteriorEmergencyStairId === "stair-1")).toHaveLength(1);
  });

  it("round-trips Pathway provenance, generated graph identity, and authored connector bends", () => {
    const path = makePath("p1", [{ x: 30, y: 40 }, { x: 130, y: 40 }, { x: 230, y: 80 }], ["pv-a", "pv-j", "pv-b"], {
      pathNetworkId: "network-1",
      disconnectedJunctionKeys: ["130:40"],
    });
    const nodes: NavigationNode[] = [
      { id: "node-a", name: "Walking Point", type: "outdoor", x: 30, y: 40, accessible: true, color: "#16a34a", generatedFromPathVertices: [{ pathId: "p1", vertexId: "pv-a" }] },
      { id: "node-j", name: "Walking Point", type: "outdoor", x: 130, y: 40, accessible: true, color: "#16a34a", generatedFromPathVertices: [{ pathId: "p1", vertexId: "pv-j" }] },
      { id: "node-b", name: "Walking Point", type: "outdoor", x: 230, y: 80, accessible: true, color: "#16a34a", generatedFromPathVertices: [{ pathId: "p1", vertexId: "pv-b" }] },
      { id: "external", name: "Entrance", type: "entrance", x: 30, y: 100, accessible: true, color: "#16a34a" },
    ];
    const edges: NavigationEdge[] = [
      { id: "path-edge-a", startNodeId: "node-a", endNodeId: "node-j", distance: 100, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4, generatedFromPathIds: ["p1"] },
      { id: "path-edge-b", startNodeId: "node-j", endNodeId: "node-b", distance: 108, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4, generatedFromPathIds: ["p1"] },
      { id: "external-edge", startNodeId: "external", endNodeId: "node-j", distance: 60, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4, bendPoints: [{ x: 30, y: 70 }, { x: 80, y: 60 }] },
    ];
    const value = makeCampus([path], nodes, edges);
    const payload = serializeCampusStructure(value);
    const hydrated = hydrateCampusStructure(value, rowsFromPayload(payload));
    const roundTrip = pathwaySnapshot(hydrated);

    expect(payload.map_elements.find((row) => (row.metadata as { kind?: string })?.kind === "campus_path")).toMatchObject({ element_type: "custom", geometry: { points: path.points } });
    expect(hydrated.paths).toEqual([path]);
    expect(hydrated.navNodes?.filter((node) => node.generatedFromPathVertices).map((node) => node.id)).toEqual(["node-a", "node-j", "node-b"]);
    expect(hydrated.navEdges?.find((edge) => edge.id === "external-edge")?.bendPoints).toEqual(edges[2].bendPoints);
    expect(roundTrip).toEqual(pathwaySnapshot(value));
  });

  it("does not accumulate duplicate Pathways, generated nodes, edges, or junctions across repeated save/load cycles", () => {
    const initial = convertPathwaysToNavigation(makeCampus([
      makePath("p1", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 40 }], ["a", "j", "b"]),
    ]), ["p1"], makeIdFactory()).campus;
    let value = initial;
    for (let index = 0; index < 3; index += 1) {
      value = hydrateCampusStructure(value, rowsFromPayload(serializeCampusStructure(value)));
    }
    expect(pathwaySnapshot(value)).toEqual(pathwaySnapshot(initial));
    expect(new Set(value.paths.map((path) => path.id)).size).toBe(value.paths.length);
    expect(new Set((value.navNodes ?? []).map((node) => node.id)).size).toBe(value.navNodes?.length);
    expect(new Set((value.navEdges ?? []).map((edge) => edge.id)).size).toBe(value.navEdges?.length);
  });

  it("preserves the same first-entry hydrated snapshot as a reopened entry", () => {
    const initial = convertPathwaysToNavigation(makeCampus([
      makePath("p1", [{ x: 10, y: 20 }, { x: 110, y: 20 }], ["a", "b"]),
    ]), ["p1"], makeIdFactory()).campus;
    const rows = rowsFromPayload(serializeCampusStructure(initial));
    const firstEntry = hydrateCampusStructure(makeCampus(), rows);
    const secondEntry = hydrateCampusStructure(makeCampus(), rows);
    expect(pathwaySnapshot(firstEntry)).toEqual(pathwaySnapshot(secondEntry));
    expect(pathwaySnapshot(firstEntry)).toEqual(pathwaySnapshot(initial));
  });
});
