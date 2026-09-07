import { describe, expect, it } from "vitest";
import type { Campus, CampusPath, NavigationEdge, NavigationNode } from "../../components/map-builder/types";
import { convertPathwaysToNavigation, reconcilePathwayNavigation } from "../campusPathNavigation";
import { pathNetworkNavigationStatus } from "../campusPathNetwork";
import { validateNavigationGraph } from "../validateNavigationGraph";

const makeIdFactory = () => {
  let sequence = 0;
  return (prefix: string) => `${prefix}-${++sequence}`;
};

function path(id: string, points: { x: number; y: number }[], navigationVertexIds?: string[]): CampusPath {
  return { id, points, navigationVertexIds, type: "walkway", color: "#94a3b8", width: 10 };
}

function campus(paths: CampusPath[], navNodes: NavigationNode[] = [], navEdges: NavigationEdge[] = []): Campus {
  return {
    id: "campus-1", name: "Test Campus", code: "TEST", description: "", address: "", city: "", province: "", postalCode: "",
    status: "draft", publishStatus: "draft", visibleToStudents: false,
    features: { accessibility: true, emergency: true, events: true }, canvasW: 900, canvasH: 600,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: false },
    buildings: [], markers: [], paths, navNodes, navEdges, createdAt: "", updatedAt: "",
  } as Campus;
}

function ownedNodes(value: Campus, pathId: string) {
  return (value.navNodes ?? []).filter((node) => node.generatedFromPathVertices?.some((ref) => ref.pathId === pathId));
}

function ownedEdges(value: Campus, pathId: string) {
  return (value.navEdges ?? []).filter((edge) => edge.generatedFromPathIds?.includes(pathId));
}

describe("campus Pathway navigation ownership reconciliation", () => {
  it("converts each physical vertex into one owned node and each segment into one edge", () => {
    const result = convertPathwaysToNavigation(
      campus([path("p1", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 40 }])]),
      ["p1"],
      makeIdFactory(),
    );
    expect(ownedNodes(result.campus, "p1")).toHaveLength(3);
    expect(ownedEdges(result.campus, "p1")).toHaveLength(2);
    expect(result.campus.paths[0].navigationVertexIds).toHaveLength(3);
  });

  it("updates the same node and edge IDs across repeated whole-path and vertex moves", () => {
    const factory = makeIdFactory();
    let value = convertPathwaysToNavigation(campus([path("p1", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 40 }])]), ["p1"], factory).campus;
    const nodeIds = ownedNodes(value, "p1").map((node) => node.id);
    const edgeIds = ownedEdges(value, "p1").map((edge) => edge.id);
    for (let offset = 1; offset <= 5; offset += 1) {
      value = reconcilePathwayNavigation({
        ...value,
        paths: value.paths.map((candidate) => candidate.id === "p1"
          ? { ...candidate, points: candidate.points.map((point) => ({ x: point.x + offset, y: point.y + offset })) }
          : candidate),
      }, factory);
    }
    value = reconcilePathwayNavigation({
      ...value,
      paths: value.paths.map((candidate) => candidate.id === "p1"
        ? { ...candidate, points: candidate.points.map((point, index) => ({ x: point.x + index, y: point.y - index })) }
        : candidate),
    }, factory);
    expect(ownedNodes(value, "p1").map((node) => node.id)).toEqual(nodeIds);
    expect(ownedEdges(value, "p1").map((edge) => edge.id)).toEqual(edgeIds);
    expect(ownedNodes(value, "p1")).toHaveLength(3);
  });

  it("is idempotent when called repeatedly with unchanged input", () => {
    const factory = makeIdFactory();
    const initial = convertPathwaysToNavigation(campus([path("p1", [{ x: 0, y: 0 }, { x: 80, y: 0 }])]), ["p1"], factory).campus;
    const once = reconcilePathwayNavigation(initial, factory);
    const twice = reconcilePathwayNavigation(once, factory);
    expect(twice).toEqual(once);
  });

  it("adds exactly one node/edge chain for an inserted vertex and removes only that vertex", () => {
    const factory = makeIdFactory();
    let value = convertPathwaysToNavigation(campus([path("p1", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }])]), ["p1"], factory).campus;
    const originalPath = value.paths[0];
    const ids = originalPath.navigationVertexIds!;
    const inserted = path("p1", [{ x: 0, y: 0 }, { x: 50, y: 10 }, { x: 100, y: 0 }, { x: 200, y: 0 }], [ids[0], "vertex-new", ids[1], ids[2]]);
    value = reconcilePathwayNavigation({ ...value, paths: [inserted] }, factory);
    expect(ownedNodes(value, "p1")).toHaveLength(4);
    expect(ownedEdges(value, "p1")).toHaveLength(3);
    value = reconcilePathwayNavigation({ ...value, paths: [path("p1", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }], [ids[0], ids[1], ids[2]])] }, factory);
    expect(ownedNodes(value, "p1")).toHaveLength(3);
    expect(ownedNodes(value, "p1").some((node) => node.generatedFromPathVertices?.some((ref) => ref.vertexId === "vertex-new"))).toBe(false);
    expect(ownedEdges(value, "p1")).toHaveLength(2);
  });

  it("does not claim or move a manual Walking Point at the same coordinate", () => {
    const manual: NavigationNode = { id: "manual", name: "Manual", type: "outdoor", x: 100, y: 0, accessible: true, color: "#16a34a" };
    const result = convertPathwaysToNavigation(campus([path("p1", [{ x: 0, y: 0 }, { x: 100, y: 0 }])], [manual]), ["p1"], makeIdFactory());
    expect(result.campus.navNodes?.find((node) => node.id === "manual")).toEqual(manual);
    expect(ownedNodes(result.campus, "p1")).toHaveLength(2);
  });

  it("preserves shared junction ownership and separates only the moved pathway", () => {
    const factory = makeIdFactory();
    let value = convertPathwaysToNavigation(campus([
      path("a", [{ x: 0, y: 0 }, { x: 100, y: 0 }], ["a0", "aj"]),
      path("b", [{ x: 100, y: 0 }, { x: 100, y: 100 }], ["bj", "b1"]),
    ]), ["a", "b"], factory).campus;
    const shared = value.navNodes?.find((node) => (node.generatedFromPathVertices?.length ?? 0) === 2);
    expect(shared).toBeDefined();
    value = reconcilePathwayNavigation({
      ...value,
      paths: value.paths.map((candidate) => candidate.id === "a"
        ? { ...candidate, points: [{ x: 0, y: 0 }, { x: 120, y: 0 }] }
        : candidate),
    }, factory);
    expect(value.navNodes?.find((node) => node.id === shared?.id)?.generatedFromPathVertices).toEqual([{ pathId: "b", vertexId: "bj" }]);
    expect(ownedNodes(value, "a")).toHaveLength(2);
    expect(ownedNodes(value, "b")).toHaveLength(2);
  });

  it("forms one validated graph component for generated pathways sharing a junction", () => {
    const result = convertPathwaysToNavigation(campus([
      path("a", [{ x: 0, y: 0 }, { x: 100, y: 0 }]),
      path("b", [{ x: 100, y: 0 }, { x: 100, y: 100 }]),
    ]), ["a", "b"], makeIdFactory());
    const shared = result.campus.navNodes?.filter((node) => (node.generatedFromPathVertices?.length ?? 0) > 1);
    expect(shared).toHaveLength(1);
    expect(validateNavigationGraph(result.campus).issues.filter((issue) => issue.type === "nav_disconnected_component")).toHaveLength(0);
  });

  it("canonicalizes a shared junction when members are enabled in separate operations", () => {
    const factory = makeIdFactory();
    const source = campus([
      { ...path("a", [{ x: 0, y: 0 }, { x: 100, y: 0 }]), pathNetworkId: "network-1" },
      { ...path("b", [{ x: 100, y: 0 }, { x: 100, y: 100 }]), pathNetworkId: "network-1" },
    ]);
    const first = convertPathwaysToNavigation(source, ["a"], factory).campus;
    const second = convertPathwaysToNavigation(first, ["b"], factory).campus;
    const shared = second.navNodes?.filter((node) => (node.generatedFromPathVertices ?? []).length === 2) ?? [];
    expect(shared).toHaveLength(1);
    expect(second.navEdges?.filter((edge) => edge.generatedFromPathIds?.includes("a"))).toHaveLength(1);
    expect(second.navEdges?.filter((edge) => edge.generatedFromPathIds?.includes("b"))).toHaveLength(1);
    expect(validateNavigationGraph(second).issues.filter((issue) => issue.type === "nav_disconnected_component")).toHaveLength(0);
  });

  it("collapses duplicate explicitly-owned copies without touching manual nodes", () => {
    const manual: NavigationNode = { id: "manual", name: "Manual", type: "outdoor", x: 10, y: 10, accessible: true, color: "#16a34a" };
    const canonical: NavigationNode = { id: "owned-1", name: "Walking Point", type: "outdoor", x: 0, y: 0, accessible: true, color: "#16a34a", generatedFromPathVertices: [{ pathId: "p1", vertexId: "v1" }] };
    const duplicate: NavigationNode = { id: "owned-duplicate", name: "Walking Point", type: "outdoor", x: 40, y: 40, accessible: true, color: "#16a34a", generatedFromPathVertices: [{ pathId: "p1", vertexId: "v1" }] };
    const value = reconcilePathwayNavigation(campus([path("p1", [{ x: 0, y: 0 }, { x: 100, y: 0 }], ["v1", "v2"])], [manual, canonical, duplicate]), makeIdFactory());
    expect(value.navNodes?.filter((node) => node.generatedFromPathVertices?.some((ref) => ref.vertexId === "v1"))).toHaveLength(1);
    expect(value.navNodes?.find((node) => node.id === "manual")).toEqual(manual);
  });

  it("collapses duplicate explicitly-owned edges without removing a manual parallel edge", () => {
    const first = convertPathwaysToNavigation(
      campus([path("p1", [{ x: 0, y: 0 }, { x: 100, y: 0 }], ["v1", "v2"])]),
      ["p1"],
      makeIdFactory(),
    ).campus;
    const generated = first.navEdges![0];
    const duplicate: NavigationEdge = { ...generated, id: "generated-duplicate" };
    const manual: NavigationEdge = { ...generated, id: "manual-parallel", generatedFromPathIds: undefined };
    const value = reconcilePathwayNavigation({
      ...first,
      navEdges: [...first.navEdges!, duplicate, manual],
    }, makeIdFactory());
    expect(value.navEdges?.filter((edge) => edge.generatedFromPathIds?.includes("p1"))).toHaveLength(1);
    expect(value.navEdges?.find((edge) => edge.id === "manual-parallel")).toBeDefined();
  });

  it("converts only missing members of a mixed network and preserves existing generated IDs", () => {
    const factory = makeIdFactory();
    const paths = [
      path("a", [{ x: 0, y: 0 }, { x: 100, y: 0 }]),
      path("b", [{ x: 100, y: 0 }, { x: 100, y: 100 }]),
    ];
    const first = convertPathwaysToNavigation(campus(paths), ["a"], factory).campus;
    const existingNodeIds = ownedNodes(first, "a").map((node) => node.id);
    const existingEdgeIds = ownedEdges(first, "a").map((edge) => edge.id);
    const status = pathNetworkNavigationStatus(first.paths);
    expect(status).toMatchObject({ enabled: 1, missingPathIds: ["b"], state: "partial" });
    const second = convertPathwaysToNavigation(first, status.missingPathIds, factory).campus;
    expect(ownedNodes(second, "a").map((node) => node.id)).toEqual(existingNodeIds);
    expect(ownedEdges(second, "a").map((edge) => edge.id)).toEqual(existingEdgeIds);
    expect(pathNetworkNavigationStatus(second.paths).state).toBe("complete");
    expect(convertPathwaysToNavigation(second, [], factory).campus).toEqual(second);
  });

  it("adds missing explicit ownership even when every node and edge is safely reused", () => {
    const factory = makeIdFactory();
    const first = convertPathwaysToNavigation(campus([
      path("a", [{ x: 0, y: 0 }, { x: 100, y: 0 }]),
      // Explicit vertex identity exists, but its canonical node/edge ownership
      // is missing. The strict status check must repair rather than no-op.
      path("b", [{ x: 0, y: 0 }, { x: 100, y: 0 }], ["b0", "b1"]),
    ]), ["a"], factory).campus;
    const aNodeIds = ownedNodes(first, "a").map((node) => node.id);
    const aEdgeIds = ownedEdges(first, "a").map((edge) => edge.id);
    const result = convertPathwaysToNavigation(first, ["b"], factory);
    expect(result.createdNodes).toBe(0);
    expect(result.createdEdges).toBe(0);
    expect(ownedNodes(result.campus, "b").map((node) => node.id)).toEqual(aNodeIds);
    expect(ownedEdges(result.campus, "b").map((edge) => edge.id)).toEqual(aEdgeIds);
    expect(pathNetworkNavigationStatus(result.campus.paths, result.campus.navNodes, result.campus.navEdges).state).toBe("complete");
  });

  it("removes stale generated-edge bends while preserving routing metadata", () => {
    const factory = makeIdFactory();
    const converted = convertPathwaysToNavigation(
      campus([path("p1", [{ x: 0, y: 0 }, { x: 100, y: 0 }])]),
      ["p1"],
      factory,
    ).campus;
    const stale = {
      ...converted,
      navEdges: converted.navEdges?.map((edge) => ({
        ...edge,
        bendPoints: [{ x: 50, y: 40 }],
        accessible: false,
        emergencySafe: false,
        closed: true,
        bidirectional: false,
      })),
    };
    const reconciled = reconcilePathwayNavigation(stale, factory);
    expect(reconciled.navEdges?.[0]).toMatchObject({
      bendPoints: undefined,
      accessible: false,
      emergencySafe: false,
      closed: true,
      bidirectional: false,
    });
  });

  it("removes an Entrance bridge when its generated target vertex is structurally removed", () => {
    const factory = makeIdFactory();
    const converted = convertPathwaysToNavigation(
      campus([path("p1", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }])]),
      ["p1"],
      factory,
    ).campus;
    const target = ownedNodes(converted, "p1")[1];
    const entrance: NavigationNode = {
      id: "entrance-node", name: "Main Entrance", type: "entrance", x: 100, y: 30,
      buildingId: "b1", entranceId: "e1", accessible: true, color: "#16a34a",
    };
    const bridged: Campus = {
      ...converted,
      navNodes: [...(converted.navNodes ?? []), entrance],
      navEdges: [...(converted.navEdges ?? []), {
        id: "entrance-bridge", startNodeId: entrance.id, endNodeId: target.id, distance: 30,
        bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4,
      }],
    };
    const ids = bridged.paths[0].navigationVertexIds!;
    const after = reconcilePathwayNavigation({
      ...bridged,
      paths: [path("p1", [{ x: 0, y: 0 }, { x: 200, y: 0 }], [ids[0], ids[2]])],
    }, factory);
    expect(after.navEdges?.some((edge) => edge.id === "entrance-bridge")).toBe(false);
    expect(after.navNodes?.some((node) => node.id === target.id)).toBe(false);
    expect(after.navNodes?.some((node) => node.id === entrance.id)).toBe(true);
  });

  it("preserves committed Entrance→Pathway bends while a Pathway target translates", () => {
    const factory = makeIdFactory();
    const source = campus([path("p1", [{ x: 220, y: 220 }, { x: 320, y: 220 }], ["v1", "v2"])]);
    const converted = convertPathwaysToNavigation(source, ["p1"], factory).campus;
    const target = ownedNodes(converted, "p1")[1];
    const entrance = { id: "entrance-node", name: "Main Entrance", type: "entrance" as const, x: 140, y: 140, buildingId: "b1", entranceId: "e1", accessible: true, color: "#16a34a" } as NavigationNode;
    const building = {
      id: "b1", name: "Building", code: "B1", category: "Academic", description: "",
      x: 100, y: 100, width: 100, height: 80, entrances: [{ id: "e1", name: "Main Entrance", edge: "bottom", offset: 0.5, type: "general", accessible: true, isPrimary: true }], floors: [],
    } as Campus["buildings"][number];
    const authoredBends = [{ x: 140, y: 180 }, { x: 180, y: 210 }];
    const before: Campus = {
      ...converted,
      buildings: [building],
      navNodes: [...(converted.navNodes ?? []), entrance],
      navEdges: [{ id: "entrance-bridge", startNodeId: entrance.id, endNodeId: target.id, distance: 0, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4, bendPoints: authoredBends }],
    };
    const moved = reconcilePathwayNavigation({
      ...before,
      paths: [path("p1", [{ x: 240, y: 240 }, { x: 340, y: 240 }], ["v1", "v2"])],
    }, factory, { preserveAuthoredGeometry: true });
    const afterEdge = moved.navEdges?.find((edge) => edge.id === "entrance-bridge");
    const afterTarget = moved.navNodes?.find((node) => node.id === target.id);
    expect(afterTarget).toMatchObject({ x: 340, y: 240 });
    expect(afterEdge?.startNodeId).toBe(entrance.id);
    expect(afterEdge?.endNodeId).toBe(target.id);
    expect(afterEdge?.bendPoints).toEqual(authoredBends);
    expect(afterEdge?.distance).toBeGreaterThan(0);
  });

  it("keeps a zero-movement Pathway reconciliation logically unchanged", () => {
    const factory = makeIdFactory();
    const converted = convertPathwaysToNavigation(campus([path("p1", [{ x: 20, y: 20 }, { x: 120, y: 20 }])]), ["p1"], factory).campus;
    const again = reconcilePathwayNavigation({ ...converted, paths: converted.paths.map((item) => ({ ...item, points: item.points.map((point) => ({ ...point })) })) }, factory, { preserveAuthoredGeometry: true });
    expect(again).toEqual(converted);
  });

  it("preserves an external connection when an unrelated Pathway is deleted", () => {
    const factory = makeIdFactory();
    const converted = convertPathwaysToNavigation(campus([
      path("main", [{ x: 100, y: 100 }, { x: 200, y: 100 }], ["main-a", "main-b"]),
      path("other", [{ x: 500, y: 300 }, { x: 600, y: 300 }], ["other-a", "other-b"]),
    ]), ["main", "other"], factory).campus;
    const target = ownedNodes(converted, "main")[1];
    const entrance: NavigationNode = {
      id: "entrance-external", name: "Entrance", type: "entrance", x: 100, y: 140,
      buildingId: "building-1", entranceId: "entrance-1", accessible: true, color: "#16a34a",
    };
    const authoredBends = [{ x: 100, y: 170 }, { x: 160, y: 190 }];
    const before: Campus = {
      ...converted,
      navNodes: [...(converted.navNodes ?? []), entrance],
      navEdges: [...(converted.navEdges ?? []), {
        id: "external-connection", startNodeId: entrance.id, endNodeId: target.id,
        distance: 0, bidirectional: true, accessible: true, emergencySafe: true,
        type: "walkway", color: "#16a34a", width: 4, bendPoints: authoredBends,
      }],
    };
    const after = reconcilePathwayNavigation({
      ...before,
      paths: before.paths.filter((item) => item.id !== "other"),
    }, factory, { preserveAuthoredGeometry: true });
    const edge = after.navEdges?.find((item) => item.id === "external-connection");
    expect(edge).toMatchObject({ startNodeId: entrance.id, endNodeId: target.id, bendPoints: authoredBends });
    expect(after.navNodes?.some((node) => node.id === target.id)).toBe(true);
    expect(after.navNodes?.some((node) => node.generatedFromPathVertices?.some((ref) => ref.pathId === "other"))).toBe(false);
  });

  it("keeps a shared vertex and leaves a gap when the trailing Pathway segment is removed", () => {
    const factory = makeIdFactory();
    const converted = convertPathwaysToNavigation(
      campus([path("p1", [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 300, y: 100 }], ["a", "b", "c"])]),
      ["p1"],
      factory,
    ).campus;
    const beforeIds = converted.paths[0].navigationVertexIds!;
    const beforeNodeIds = beforeIds.map((vertexId) => converted.navNodes?.find((node) =>
      node.generatedFromPathVertices?.some((ref) => ref.pathId === "p1" && ref.vertexId === vertexId),
    )?.id);
    const after = reconcilePathwayNavigation({
      ...converted,
      paths: [path("p1", [{ x: 100, y: 100 }, { x: 200, y: 100 }], [beforeIds[0], beforeIds[1]])],
    }, factory, { preserveAuthoredGeometry: true });
    expect(after.paths[0].navigationVertexIds).toEqual([beforeIds[0], beforeIds[1]]);
    expect(after.navEdges?.some((edge) => edge.generatedFromPathIds?.includes("p1")
      && [edge.startNodeId, edge.endNodeId].includes(beforeNodeIds[0]!))).toBe(true);
    expect(after.navEdges?.some((edge) => edge.generatedFromPathIds?.includes("p1")
      && [edge.startNodeId, edge.endNodeId].includes(beforeNodeIds[2]!))).toBe(false);
    expect(after.navEdges?.some((edge) =>
      [edge.startNodeId, edge.endNodeId].includes(beforeNodeIds[0]!)
      && [edge.startNodeId, edge.endNodeId].includes(beforeNodeIds[2]!))).toBe(false);
  });

  it("preserves canonical endpoint IDs when a diagonal Pathway receives an authored bend", () => {
    const factory = makeIdFactory();
    const converted = convertPathwaysToNavigation(
      campus([path("diagonal", [{ x: 100, y: 100 }, { x: 300, y: 300 }])]),
      ["diagonal"],
      factory,
    ).campus;
    const originalVertexIds = converted.paths[0].navigationVertexIds!;
    const withBend = reconcilePathwayNavigation({
      ...converted,
      paths: [path("diagonal", [
        { x: 100, y: 100 }, { x: 200, y: 170 }, { x: 300, y: 300 },
      ], [originalVertexIds[0], "diagonal-bend", originalVertexIds[1]])],
    }, factory, { preserveAuthoredGeometry: true });
    expect(withBend.paths[0].navigationVertexIds).toEqual([
      originalVertexIds[0], "diagonal-bend", originalVertexIds[1],
    ]);
    expect(ownedNodes(withBend, "diagonal")).toHaveLength(3);
    expect(ownedNodes(withBend, "diagonal").some((node) =>
      node.generatedFromPathVertices?.some((ref) => ref.vertexId === originalVertexIds[0]),
    )).toBe(true);
    expect(ownedNodes(withBend, "diagonal").some((node) =>
      node.generatedFromPathVertices?.some((ref) => ref.vertexId === originalVertexIds[1]),
    )).toBe(true);
  });
});
