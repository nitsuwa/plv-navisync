import { describe, expect, it } from "vitest";
import type { NavigationNode, NavigationEdge } from "../../components/map-builder/types";
import {
  createNavNode,
  createNavEdge,
  navEdgeDistance,
  isSelfEdge,
  findDuplicateNavEdge,
  removeNavNode,
  findNavNodeAtPoint,
  normalizeNavGraph,
  validateNavGraphBasics,
  segmentIntersectsRect,
  navGraphSelectionIdsInRect,
  findEntranceNavNode,
  syncEntranceNodePositions,
  pruneOrphanedEntranceNodes,
  translateSelectedNavGraph,
  navGroupSelectionBounds,
  applyBulkRoutingAction,
} from "../navigationGraph";
import type { CampusBuilding } from "../../components/map-builder/types";

function building(overrides: Partial<CampusBuilding> = {}): CampusBuilding {
  return {
    id: "b1", name: "Building One", code: "B1", category: "Academic", description: "",
    x: 100, y: 100, width: 120, height: 80, rotation: 0,
    expanded: false, floors: [],
    ...overrides,
  } as CampusBuilding;
}

function node(id: string, x: number, y: number): NavigationNode {
  return { id, name: id, type: "outdoor", x, y, accessible: true, color: "#16a34a" };
}

describe("B5 Phase 1 — navigation graph helpers", () => {
  describe("createNavNode", () => {
    it("creates a canonical node with sensible defaults", () => {
      const n = createNavNode({ id: "nn1", x: 12.4, y: 33.6, campusId: "c1" });
      expect(n).toMatchObject({
        id: "nn1",
        name: "Waypoint",
        type: "outdoor",
        x: 12,
        y: 34,
        campusId: "c1",
        accessible: true,
        color: "#16a34a",
      });
    });

    it("honors overrides", () => {
      const n = createNavNode({ id: "nn2", x: 1, y: 2, name: "Front Gate", type: "entrance", accessible: false, color: "#dc2626" });
      expect(n.name).toBe("Front Gate");
      expect(n.type).toBe("entrance");
      expect(n.accessible).toBe(false);
      expect(n.color).toBe("#dc2626");
    });
  });

  describe("createNavEdge / navEdgeDistance", () => {
    it("auto-calculates the canvas-unit distance between endpoints", () => {
      const nodes = [node("a", 0, 0), node("b", 30, 40)];
      const e = createNavEdge({ id: "ne1", startNodeId: "a", endNodeId: "b", nodes });
      expect(e.distance).toBe(50);
      expect(e.bidirectional).toBe(true);
      expect(e.accessible).toBe(true);
      expect(e.emergencySafe).toBe(true);
    });

    it("falls back to 0 when endpoints are unknown", () => {
      const e = createNavEdge({ id: "ne2", startNodeId: "a", endNodeId: "missing", nodes: [node("a", 0, 0)] });
      expect(e.distance).toBe(0);
    });

    it("computes straight-line distance directly", () => {
      expect(navEdgeDistance(node("a", 0, 0), node("b", 3, 4))).toBe(5);
      expect(navEdgeDistance(undefined, node("b", 3, 4))).toBe(0);
    });
  });

  describe("self/duplicate detection", () => {
    it("detects self-edges", () => {
      expect(isSelfEdge("a", "a")).toBe(true);
      expect(isSelfEdge("a", "b")).toBe(false);
    });

    it("detects duplicate edges in BOTH directions (unordered pair)", () => {
      const edges: NavigationEdge[] = [
        { id: "ne1", startNodeId: "a", endNodeId: "b", distance: 10, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
      ];
      expect(findDuplicateNavEdge(edges, "a", "b")?.id).toBe("ne1");
      expect(findDuplicateNavEdge(edges, "b", "a")?.id).toBe("ne1");
      expect(findDuplicateNavEdge(edges, "a", "c")).toBeUndefined();
    });
  });

  describe("removeNavNode", () => {
    it("removes the node AND every connected edge, keeping unrelated edges", () => {
      const nodes = [node("a", 0, 0), node("b", 10, 0), node("c", 20, 0)];
      const edges: NavigationEdge[] = [
        { id: "e1", startNodeId: "a", endNodeId: "b", distance: 10, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
        { id: "e2", startNodeId: "b", endNodeId: "c", distance: 10, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
      ];
      const { nodes: nextNodes, edges: nextEdges } = removeNavNode(nodes, edges, "b");
      expect(nextNodes.map((n) => n.id)).toEqual(["a", "c"]);
      // e1 and e2 both touch b → gone; nothing dangling remains.
      expect(nextEdges).toEqual([]);
    });

    it("keeps edges that do not touch the removed node", () => {
      const nodes = [node("a", 0, 0), node("b", 10, 0), node("c", 20, 0)];
      const edges: NavigationEdge[] = [
        { id: "e1", startNodeId: "a", endNodeId: "b", distance: 10, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
        { id: "e2", startNodeId: "b", endNodeId: "c", distance: 10, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
      ];
      const { edges: nextEdges } = removeNavNode(nodes, edges, "a");
      expect(nextEdges.map((e) => e.id)).toEqual(["e2"]);
    });
  });

  describe("findNavNodeAtPoint", () => {
    it("returns the closest node within the threshold", () => {
      const nodes = [node("a", 0, 0), node("b", 100, 100)];
      expect(findNavNodeAtPoint(nodes, { x: 3, y: 4 }, 12)?.id).toBe("a");
      expect(findNavNodeAtPoint(nodes, { x: 90, y: 100 }, 12)?.id).toBe("b");
    });

    it("returns undefined when nothing is close enough", () => {
      expect(findNavNodeAtPoint([node("a", 0, 0)], { x: 50, y: 50 }, 12)).toBeUndefined();
    });
  });

  describe("normalizeNavGraph", () => {
    it("drops dangling and self edges, coerces numbers, fills defaults", () => {
      const nodes = [node("a", 0, 0), node("b", 10, 0)];
      const edges: NavigationEdge[] = [
        { id: "ok", startNodeId: "a", endNodeId: "b", distance: 10, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
        { id: "dangling", startNodeId: "a", endNodeId: "ghost", distance: 10, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
        { id: "self", startNodeId: "a", endNodeId: "a", distance: 0, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
      ];
      const { nodes: safeNodes, edges: safeEdges } = normalizeNavGraph(nodes, edges);
      expect(safeEdges.map((e) => e.id)).toEqual(["ok"]);
      expect(safeNodes).toHaveLength(2);
    });

    it("handles undefined input and coerces bad coordinates", () => {
      const { nodes, edges } = normalizeNavGraph(
        [{ ...node("a", NaN, 5) }],
        undefined
      );
      expect(nodes[0].x).toBe(0);
      expect(edges).toEqual([]);
    });
  });

  describe("validateNavGraphBasics", () => {
    it("flags self, duplicate, dangling, and invalid-coordinate issues", () => {
      const nodes = [node("a", 0, 0), node("b", 10, 0)];
      const edges: NavigationEdge[] = [
        { id: "self", startNodeId: "a", endNodeId: "a", distance: 0, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
        { id: "dangling", startNodeId: "a", endNodeId: "ghost", distance: 5, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
        { id: "dup1", startNodeId: "a", endNodeId: "b", distance: 10, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
        { id: "dup2", startNodeId: "b", endNodeId: "a", distance: 10, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
      ];
      const issues = validateNavGraphBasics([...nodes, { ...node("bad", NaN, 1) }], edges);
      expect(issues.selfEdges.map((e) => e.id)).toEqual(["self"]);
      expect(issues.danglingEdges.map((e) => e.id)).toEqual(["dangling"]);
      expect(issues.duplicateEdges.map((e) => e.id)).toEqual(["dup2"]);
      expect(issues.invalidCoords.map((n) => n.id)).toEqual(["bad"]);
    });
  });
});

describe("B5 Phase 1.6 — marquee selection + entrance-linked nodes", () => {
  function edge(id: string, a: string, b: string): NavigationEdge {
    return { id, startNodeId: a, endNodeId: b, distance: 10, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 };
  }

  describe("segmentIntersectsRect", () => {
    it("true when the segment lies fully inside the rect", () => {
      expect(segmentIntersectsRect({ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 0, y: 0, width: 50, height: 50 })).toBe(true);
    });

    it("true when the segment crosses the rect boundary (T-junction style)", () => {
      expect(segmentIntersectsRect({ x: -10, y: 5 }, { x: 60, y: 5 }, { x: 0, y: 0, width: 40, height: 40 })).toBe(true);
    });

    it("false when the segment is completely outside", () => {
      expect(segmentIntersectsRect({ x: -20, y: -20 }, { x: -10, y: -10 }, { x: 0, y: 0, width: 40, height: 40 })).toBe(false);
      expect(segmentIntersectsRect({ x: 60, y: 60 }, { x: 70, y: 70 }, { x: 0, y: 0, width: 40, height: 40 })).toBe(false);
    });
  });

  describe("navGraphSelectionIdsInRect", () => {
    it("captures nodes whose center is inside the rect", () => {
      const nodes = [node("a", 10, 10), node("b", 100, 100), node("c", 30, 30)];
      const { nodeIds } = navGraphSelectionIdsInRect({ x: 0, y: 0, width: 50, height: 50 }, nodes, []);
      expect(nodeIds.sort()).toEqual(["a", "c"]);
    });

    it("captures edges whose segment intersects the rect", () => {
      const nodes = [node("a", 0, 0), node("b", 60, 0)];
      const edges = [edge("e1", "a", "b")];
      const { edgeIds } = navGraphSelectionIdsInRect({ x: 20, y: -10, width: 10, height: 20 }, nodes, edges);
      expect(edgeIds).toEqual(["e1"]);
      const { edgeIds: none } = navGraphSelectionIdsInRect({ x: 20, y: 40, width: 10, height: 10 }, nodes, edges);
      expect(none).toEqual([]);
    });

    it("returns empty for an empty graph", () => {
      expect(navGraphSelectionIdsInRect({ x: 0, y: 0, width: 10, height: 10 }, [], [])).toEqual({ nodeIds: [], edgeIds: [] });
    });
  });

  describe("findEntranceNavNode", () => {
    it("finds the node linked to a building entrance (never duplicates it)", () => {
      const nodes = [
        { ...node("plain", 0, 0) },
        { ...node("entrance", 5, 5), buildingId: "b1", entranceId: "ent1", type: "entrance" as const },
      ];
      expect(findEntranceNavNode(nodes, "b1", "ent1")?.id).toBe("entrance");
      expect(findEntranceNavNode(nodes, "b1", "missing")).toBeUndefined();
    });

    it("ignores nodes for other buildings/entrances", () => {
      const nodes = [{ ...node("entrance", 0, 0), buildingId: "b2", entranceId: "ent9" }];
      expect(findEntranceNavNode(nodes, "b1", "ent9")).toBeUndefined();
    });
  });
});

describe("B5 Phase 1.8 — entrance-linked node synchronization", () => {
  function linkedNode(x: number, y: number): ReturnType<typeof node> {
    return { ...node("nnEnt", x, y), type: "entrance", buildingId: "b1", entranceId: "ent1" };
  }
  const entrance = { id: "ent1", edge: "bottom" as const, offset: 0.5, type: "general" as const, isPrimary: true, accessible: true };

  it("moves an entrance-linked node when the building moves (entrance world position is the source of truth)", () => {
    const b = building({ x: 100, y: 100, entrances: [entrance] });
    const nodes = [linkedNode(160, 180)];
    const moved = building({ ...b, x: 160, y: 150, entrances: [entrance] });
    const synced = syncEntranceNodePositions([moved], nodes);
    // bottom edge offset 0.5 → x = 160 + 60 = 220, y = 150 + 80 = 230
    expect(synced[0]).toMatchObject({ id: "nnEnt", x: 220, y: 230 });
  });

  it("follows a building resize (entrance offset re-resolves on the new width/height)", () => {
    const b = building({ width: 120, height: 80, entrances: [entrance] });
    const resized = building({ ...b, width: 200, height: 100, entrances: [entrance] });
    // bottom edge offset 0.5 → x = 100 + 100 = 200, y = 100 + 100 = 200
    expect(syncEntranceNodePositions([resized], [linkedNode(160, 180)])[0]).toMatchObject({ x: 200, y: 200 });
  });

  it("follows a building rotation (entrance world position rotates around the center)", () => {
    // b1 (100,100,120,80) center (160,140); bottom offset 0.5 → (160,180).
    // Rotate 90° about the center: (160,180) → (120,140).
    const b = building({ rotation: 90, entrances: [entrance] });
    expect(syncEntranceNodePositions([b], [linkedNode(160, 180)])[0]).toMatchObject({ x: 120, y: 140 });
  });

  it("follows an entrance reposition around the building perimeter", () => {
    const b = building({ entrances: [{ ...entrance, edge: "right", offset: 0.25 }] });
    // right edge offset 0.25 → x = 220, y = 100 + 20 = 120
    expect(syncEntranceNodePositions([b], [linkedNode(160, 180)])[0]).toMatchObject({ x: 220, y: 120 });
  });

  it("leaves plain outdoor nodes untouched and no-ops when already in sync", () => {
    const b = building({ entrances: [entrance] });
    const nodes = [linkedNode(160, 180), { ...node("plain", 300, 200) }];
    const synced = syncEntranceNodePositions([b], nodes);
    expect(synced[0]).toBe(nodes[0]); // in-sync entrance node keeps identity
    expect(synced[1]).toBe(nodes[1]); // plain node untouched
  });

  it("keeps a linked node in place when its entrance is missing (orphan cleanup is separate)", () => {
    const nodes = [linkedNode(160, 180)];
    expect(syncEntranceNodePositions([building({ entrances: [] })], nodes)[0]).toBe(nodes[0]);
  });

  it("prunes an orphaned entrance-linked node + its connected edges when the entrance is deleted", () => {
    const b = building({ entrances: [entrance] });
    const nodes = [linkedNode(160, 180), { ...node("nnA", 200, 200) }, { ...node("nnB", 300, 200) }];
    const edges = [
      { id: "ne1", startNodeId: "nnEnt", endNodeId: "nnA", distance: 50, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4 },
      { id: "ne2", startNodeId: "nnA", endNodeId: "nnB", distance: 100, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4 },
    ];
    const pruned = pruneOrphanedEntranceNodes([building({ entrances: [] })], nodes, edges);
    expect(pruned.nodes.map((n) => n.id)).toEqual(["nnA", "nnB"]);
    expect(pruned.edges.map((e) => e.id)).toEqual(["ne2"]);
  });

  it("prunes entrance-linked nodes when their building is deleted (no stale references)", () => {
    const nodes = [linkedNode(160, 180), { ...node("nnA", 200, 200) }];
    const edges = [{ id: "ne1", startNodeId: "nnEnt", endNodeId: "nnA", distance: 50, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4 }];
    const pruned = pruneOrphanedEntranceNodes([], nodes, edges);
    expect(pruned.nodes.map((n) => n.id)).toEqual(["nnA"]);
    expect(pruned.edges).toEqual([]);
  });

  it("is a no-op when every entrance-linked node still has its entrance", () => {
    const b = building({ entrances: [entrance] });
    const nodes = [linkedNode(160, 180), { ...node("nnA", 200, 200) }];
    const edges = [{ id: "ne1", startNodeId: "nnEnt", endNodeId: "nnA", distance: 50, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4 }];
    const pruned = pruneOrphanedEntranceNodes([b], nodes, edges);
    expect(pruned.nodes).toEqual(nodes);
    expect(pruned.edges).toEqual(edges);
  });
});

describe("B5 Final correction — shared nav graph group translation", () => {
  function edge(id: string, a: string, b: string, bends?: { x: number; y: number }[]): NavigationEdge {
    return { id, startNodeId: a, endNodeId: b, distance: 10, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4, bendPoints: bends };
  }

  describe("translateSelectedNavGraph", () => {
    it("moves every selected node AND the bends of edges whose both endpoints move", () => {
      const nodes = [node("A", 0, 0), node("B", 100, 0), node("C", 200, 0)];
      const edges = [edge("e1", "A", "B", [{ x: 50, y: -40 }]), edge("e2", "B", "C", [{ x: 150, y: -40 }])];
      const moving = new Set(["A", "B"]);
      const { nodes: nn, edges: ne } = translateSelectedNavGraph(nodes, edges, moving, 20, 30);

      // A and B move; C stays.
      expect(nn.find((n) => n.id === "A")).toMatchObject({ x: 20, y: 30 });
      expect(nn.find((n) => n.id === "B")).toMatchObject({ x: 120, y: 30 });
      expect(nn.find((n) => n.id === "C")).toMatchObject({ x: 200, y: 0 });
      // e1 (both endpoints moving) carries its bend; e2 (only B moving) keeps it.
      expect(ne.find((e) => e.id === "e1")?.bendPoints).toEqual([{ x: 70, y: -10 }]);
      expect(ne.find((e) => e.id === "e2")?.bendPoints).toEqual([{ x: 150, y: -40 }]);
    });

    it("keeps relative geometry identical across the whole selected substructure", () => {
      const nodes = [node("A", 0, 0), node("B", 100, 0), node("C", 100, 100)];
      const edges = [
        edge("e1", "A", "B", [{ x: 50, y: 0 }]),
        edge("e2", "B", "C", [{ x: 100, y: 50 }]),
      ];
      const moving = new Set(["A", "B", "C"]);
      const { nodes: nn, edges: ne } = translateSelectedNavGraph(nodes, edges, moving, 7, -3);
      expect(nn.map((n) => [n.x, n.y])).toEqual([[7, -3], [107, -3], [107, 97]]);
      expect(ne.find((e) => e.id === "e1")?.bendPoints).toEqual([{ x: 57, y: -3 }]);
      expect(ne.find((e) => e.id === "e2")?.bendPoints).toEqual([{ x: 107, y: 47 }]);
    });

    it("leaves edges with NO moving endpoint untouched (bends stay put)", () => {
      const nodes = [node("A", 0, 0), node("B", 100, 0), node("C", 200, 0)];
      const edges = [edge("e1", "A", "B", [{ x: 50, y: 0 }]), edge("e2", "C", "A", [{ x: 100, y: -10 }])];
      const moving = new Set(["B"]);
      const { nodes: nn, edges: ne } = translateSelectedNavGraph(nodes, edges, moving, 5, 5);
      expect(nn.find((n) => n.id === "B")).toMatchObject({ x: 105, y: 5 });
      // e2 does not touch B at all → identical edge object.
      expect(ne.find((e) => e.id === "e2")).toBe(edges[1]);
    });

    it("is a no-op for zero delta or an empty moving set (identity preserved)", () => {
      const nodes = [node("A", 0, 0)];
      const edges = [edge("e1", "A", "A", [{ x: 1, y: 2 }])];
      const out = translateSelectedNavGraph(nodes, edges, new Set(["A"]), 0, 0);
      expect(out.nodes).toBe(nodes);
      expect(out.edges).toBe(edges);
      const out2 = translateSelectedNavGraph(nodes, edges, new Set(), 5, 5);
      expect(out2.nodes).toBe(nodes);
    });

    it("translates multi-bend edges fully (every bend rides with the group)", () => {
      const nodes = [node("A", 0, 0), node("B", 100, 0)];
      const edges = [edge("e1", "A", "B", [{ x: 30, y: -20 }, { x: 70, y: -20 }, { x: 70, y: 20 }])];
      const { edges: ne } = translateSelectedNavGraph(nodes, edges, new Set(["A", "B"]), 10, 10);
      expect(ne[0].bendPoints).toEqual([{ x: 40, y: -10 }, { x: 80, y: -10 }, { x: 80, y: 30 }]);
    });
  });

  describe("navGroupSelectionBounds", () => {
    it("bounds selected nodes + bends of edges with both endpoints selected, with padding", () => {
      const nodes = [node("A", 0, 0), node("B", 100, 0)];
      const edges = [edge("e1", "A", "B", [{ x: 50, y: -40 }])];
      const bounds = navGroupSelectionBounds(nodes, edges, new Set(["A", "B"]), new Set(), 10);
      expect(bounds).toEqual({ x: -10, y: -50, width: 120, height: 60 });
    });

    it("includes bends of explicitly-selected edges even without both endpoints", () => {
      const nodes = [node("A", 0, 0), node("B", 100, 0)];
      const edges = [edge("e1", "A", "B", [{ x: 50, y: -40 }])];
      const bounds = navGroupSelectionBounds(nodes, edges, new Set(["A"]), new Set(["e1"]), 10);
      // Only A is a selected NODE, but the explicit edge selection brings its
      // bend into the bounds: A(0,0) + bend(50,-40) → width 70, height 60.
      expect(bounds).toEqual({ x: -10, y: -50, width: 70, height: 60 });
    });

    it("returns null when nothing is selected", () => {
      expect(navGroupSelectionBounds([node("A", 0, 0)], [], new Set(), new Set())).toBeNull();
    });
  });
});

describe("B5 Final bulk-routing state semantics — applyBulkRoutingAction", () => {
  function edge(
    overrides: Partial<NavigationEdge> & { id: string; startNodeId: string; endNodeId: string }
  ): NavigationEdge {
    return {
      id: overrides.id,
      startNodeId: overrides.startNodeId,
      endNodeId: overrides.endNodeId,
      distance: 10,
      bidirectional: true,
      accessible: true,
      emergencySafe: true,
      closed: false,
      type: "walkway",
      color: "#16a34a",
      width: 4,
      bendPoints: [{ x: 50, y: 0 }],
      ...overrides,
    };
  }

  it("mark_closed sets closed=true and preserves every unrelated field", () => {
    const edges = [edge({
      id: "e1", startNodeId: "A", endNodeId: "B",
      accessible: false, inaccessibleReason: "stairs",
      emergencySafe: false, emergencyReason: "hazard",
      bendPoints: [{ x: 30, y: 40 }],
    })];
    const out = applyBulkRoutingAction(edges, ["e1"], "mark_closed");
    const e = out[0];
    expect(e.closed).toBe(true);
    expect(e.accessible).toBe(false);
    expect(e.inaccessibleReason).toBe("stairs");
    expect(e.emergencySafe).toBe(false);
    expect(e.emergencyReason).toBe("hazard");
    expect(e.bidirectional).toBe(true);
    expect(e.bendPoints).toEqual([{ x: 30, y: 40 }]);
    expect(e.startNodeId).toBe("A");
    expect(e.endNodeId).toBe("B");
    expect(e.distance).toBe(10);
  });

  it("mark_closed then mark_accessible reopens: accessible=true, closed=false, reason cleared", () => {
    let edges = [edge({ id: "e1", startNodeId: "A", endNodeId: "B", closed: true })];
    edges = applyBulkRoutingAction(edges, ["e1"], "mark_accessible");
    expect(edges[0]).toMatchObject({ accessible: true, closed: false });
    expect(edges[0].inaccessibleReason).toBeUndefined();
    // unrelated metadata preserved
    expect(edges[0].bidirectional).toBe(true);
    expect(edges[0].emergencySafe).toBe(true);
    expect(edges[0].bendPoints).toEqual([{ x: 50, y: 0 }]);
  });

  it("mark_closed then mark_not_accessible: accessible=false, closed=false, reason preserved or defaulted", () => {
    // Existing per-edge reason is preserved
    let edges = [edge({ id: "e1", startNodeId: "A", endNodeId: "B", closed: true, inaccessibleReason: "uneven_surface" })];
    edges = applyBulkRoutingAction(edges, ["e1"], "mark_not_accessible");
    expect(edges[0]).toMatchObject({ accessible: false, closed: false, inaccessibleReason: "uneven_surface" });
    // No existing reason → defaults to "other" like the single-edge inspector
    let edges2 = [edge({ id: "e2", startNodeId: "B", endNodeId: "C", closed: true })];
    edges2 = applyBulkRoutingAction(edges2, ["e2"], "mark_not_accessible");
    expect(edges2[0]).toMatchObject({ accessible: false, closed: false, inaccessibleReason: "other" });
  });

  it("mark_closed then mark_emergency_safe: emergencySafe=true, closed=false, reason cleared", () => {
    let edges = [edge({ id: "e1", startNodeId: "A", endNodeId: "B", closed: true, emergencySafe: false, emergencyReason: "hazard" })];
    edges = applyBulkRoutingAction(edges, ["e1"], "mark_emergency_safe");
    expect(edges[0]).toMatchObject({ emergencySafe: true, closed: false });
    expect(edges[0].emergencyReason).toBeUndefined();
    expect(edges[0].accessible).toBe(true);
  });

  it("mark_open sets closed=false and preserves accessible/emergency/direction/reasons", () => {
    const edges = [edge({
      id: "e1", startNodeId: "A", endNodeId: "B", closed: true,
      accessible: false, inaccessibleReason: "narrow_path",
      emergencySafe: false, emergencyReason: "construction",
    })];
    const out = applyBulkRoutingAction(edges, ["e1"], "mark_open");
    expect(out[0].closed).toBe(false);
    expect(out[0].accessible).toBe(false);
    expect(out[0].inaccessibleReason).toBe("narrow_path");
    expect(out[0].emergencySafe).toBe(false);
    expect(out[0].emergencyReason).toBe("construction");
  });

  it("updates ALL selected edges but leaves unselected edges untouched", () => {
    const edges = [
      edge({ id: "e1", startNodeId: "A", endNodeId: "B" }),
      edge({ id: "e2", startNodeId: "B", endNodeId: "C" }),
      edge({ id: "e3", startNodeId: "C", endNodeId: "D" }),
    ];
    const out = applyBulkRoutingAction(edges, ["e1", "e3"], "mark_closed");
    expect(out[0].closed).toBe(true);
    expect(out[2].closed).toBe(true);
    expect(out[1]).toBe(edges[1]); // unselected edge identical by reference
    expect(out[1].closed).toBe(false);
  });

  it("never touches geometry, direction, or endpoints for ANY action", () => {
    const bends = [{ x: 11, y: 22 }, { x: 33, y: 44 }];
    const edges = [edge({ id: "e1", startNodeId: "A", endNodeId: "B", bidirectional: false, bendPoints: bends })];
    const actions = ["mark_accessible", "mark_not_accessible", "mark_emergency_safe", "mark_open", "mark_closed"] as const;
    for (const action of actions) {
      const out = applyBulkRoutingAction(edges, ["e1"], action);
      expect(out[0].bidirectional).toBe(false);
      expect(out[0].bendPoints).toEqual(bends);
      expect(out[0].startNodeId).toBe("A");
      expect(out[0].endNodeId).toBe("B");
      expect(out[0].distance).toBe(10);
    }
  });

  it("is a no-op for an empty id list (edges returned by identity)", () => {
    const edges = [edge({ id: "e1", startNodeId: "A", endNodeId: "B" })];
    const out = applyBulkRoutingAction(edges, [], "mark_closed");
    expect(out[0]).toBe(edges[0]);
    expect(out).toEqual(edges);
  });
});
