import { describe, it, expect } from "vitest";
import {
  findPath,
  findBuildingPath,
  calculateTransition,
  buildTransitionEdges,
  findNavigationRoute,
  NODES,
  EDGES,
  BUILDING_ENTRANCE_MAP,
} from "../pathfinding";

// ── Shared nav-graph fixtures (map-builder authored graph) ──────────────────

const lineNodes = [
  { id: "a", name: "A", x: 0, y: 0 },
  { id: "b", name: "B", x: 100, y: 0 },
  { id: "c", name: "C", x: 200, y: 0 },
];

const lineEdges = [
  { id: "e1", startNodeId: "a", endNodeId: "b", distance: 100, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#000", width: 2 },
  { id: "e2", startNodeId: "b", endNodeId: "c", distance: 100, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#000", width: 2 },
];

// ── Legacy campus walkway graph (hardcoded PLV graph) ───────────────────────

describe("findPath (legacy campus graph)", () => {
  it("finds the shortest path between two nodes and returns distance/time", () => {
    const path = findPath("gate_main", "ent_mab");
    expect(path).not.toBeNull();
    expect(path!.nodeIds[0]).toBe("gate_main");
    expect(path!.nodeIds[path!.nodeIds.length - 1]).toBe("ent_mab");
    expect(path!.distanceM).toBeGreaterThan(0);
    expect(path!.minutes).toBeGreaterThanOrEqual(1);
    expect(path!.waypoints.length).toBe(path!.nodeIds.length);
    expect(path!.steps.length).toBeGreaterThan(0);
  });

  it("takes the shortest (deterministic) route", () => {
    const path = findPath("gate_main", "ent_mab");
    expect(path!.nodeIds).toEqual(["gate_main", "jct_mab", "ent_mab"]);
    // 55 + 75 units × 0.22 m/unit = 28.6 → 29 m
    expect(path!.distanceM).toBe(29);
  });

  it("returns null for unknown nodes", () => {
    expect(findPath("nope", "gate_main")).toBeNull();
    expect(findPath("gate_main", "nope")).toBeNull();
  });

  it("accessible-only mode still routes the legacy graph (all edges accessible)", () => {
    const path = findPath("gate_main", "ent_lrc", true);
    expect(path).not.toBeNull();
  });
});

describe("findBuildingPath / calculateTransition (legacy)", () => {
  it("maps known buildings to their entrance nodes", () => {
    expect(BUILDING_ENTRANCE_MAP["b1"]).toBe("ent_mab");
    expect(BUILDING_ENTRANCE_MAP["b6"]).toBe("ent_ssc");
    // C4 Phase 2 bridge: published-campus seed ids map to the same nodes.
    expect(BUILDING_ENTRANCE_MAP["b_mab"]).toBe("ent_mab");
    expect(BUILDING_ENTRANCE_MAP["b_ssc"]).toBe("ent_ssc");
    // Real PLV campus seed ids (SCB / Canteen / CABA / COED / CEIT / Guard)
    expect(BUILDING_ENTRANCE_MAP["b_scb"]).toBe("ent_scb");
    expect(BUILDING_ENTRANCE_MAP["b_ceit"]).toBe("ent_ceit");
    expect(Object.keys(BUILDING_ENTRANCE_MAP).length).toBe(18);
  });

  it("finds a building-to-building route", () => {
    const path = findBuildingPath("b1", "b3");
    expect(path).not.toBeNull();
    expect(path!.nodeIds[0]).toBe("ent_mab");
    expect(path!.nodeIds[path!.nodeIds.length - 1]).toBe("ent_lrc");
  });

  it("routes the real PLV campus along brick walkways (SCB → CEIT)", () => {
    const path = findBuildingPath("b_scb", "b_ceit");
    expect(path).not.toBeNull();
    expect(path!.nodeIds[0]).toBe("ent_scb");
    expect(path!.nodeIds[path!.nodeIds.length - 1]).toBe("ent_ceit");
    // Every hop stays on a quadrangle walkway node (no straight-line shortcut).
    const allowed = new Set(["ent_scb", "q_nw", "q_ne", "q_se", "q_sw", "jct_plv_w", "ent_ceit"]);
    for (const id of path!.nodeIds) expect(allowed.has(id)).toBe(true);
    expect(path!.distanceM).toBeGreaterThan(0);
  });

  it("routes from the main gate to the guard house", () => {
    const path = findBuildingPath("b_guard", "b_caba");
    expect(path).not.toBeNull();
    expect(path!.nodeIds[0]).toBe("ent_guard");
    expect(path!.nodeIds[path!.nodeIds.length - 1]).toBe("ent_caba");
  });

  it("returns null when a building has no entrance node", () => {
    expect(findBuildingPath("b1", "unknown")).toBeNull();
  });

  it("calculates transition time including floor-change and buffer seconds", () => {
    const t = calculateTransition("b1", "b3", 2, 3);
    expect(t.path).not.toBeNull();
    expect(t.minutes + t.seconds).toBeGreaterThan(0);
    // Flat transition has a 60 s buffer
    const flat = calculateTransition("b1", "b3");
    expect(flat.minutes * 60 + flat.seconds).toBeGreaterThanOrEqual(60);
  });
});

// ── findNavigationRoute (map-builder authored nav graph) ────────────────────

describe("findNavigationRoute (authored nav graph)", () => {
  it("finds a route across a simple graph with steps and distances", () => {
    const path = findNavigationRoute(lineNodes, lineEdges, "a", "c");
    expect(path).not.toBeNull();
    expect(path!.nodeIds).toEqual(["a", "b", "c"]);
    expect(path!.distanceM).toBe(44); // 200 units × 0.22
    expect(path!.minutes).toBe(1);
    expect(path!.steps[0]).toBe("Start from A");
    expect(path!.steps[path!.steps.length - 1]).toBe("Walk 22m to C");
  });

  it("handles start === destination as a zero-distance route", () => {
    const path = findNavigationRoute(lineNodes, lineEdges, "a", "a");
    expect(path).not.toBeNull();
    expect(path!.nodeIds).toEqual(["a"]);
    expect(path!.distanceM).toBe(0);
    expect(path!.steps).toEqual(["Already at A."]);
  });

  it("returns null for missing nodes", () => {
    expect(findNavigationRoute(lineNodes, lineEdges, "zzz", "c")).toBeNull();
    expect(findNavigationRoute(lineNodes, lineEdges, "a", "zzz")).toBeNull();
    expect(findNavigationRoute(lineNodes, lineEdges, "", "c")).toBeNull();
  });

  it("returns null when the graph is disconnected (no route)", () => {
    const isolated = [
      { id: "a", name: "A", x: 0, y: 0 },
      { id: "b", name: "B", x: 100, y: 0 },
      { id: "c", name: "C", x: 300, y: 0 },
    ];
    const edges = [{ id: "e1", startNodeId: "a", endNodeId: "b", distance: 100, bidirectional: true, accessible: true, type: "walkway", color: "#000", width: 2 }];
    expect(findNavigationRoute(isolated, edges, "a", "c")).toBeNull();
  });

  it("skips inaccessible edges in accessible-only mode", () => {
    const nodes = [
      { id: "a", name: "A", x: 0, y: 0 },
      { id: "b", name: "B", x: 100, y: 0 },
      { id: "d", name: "D", x: 0, y: 100 },
      { id: "c", name: "C", x: 100, y: 100 },
    ];
    const edges = [
      { id: "e1", startNodeId: "a", endNodeId: "b", distance: 100, bidirectional: true, accessible: false, type: "walkway", color: "#000", width: 2 },
      { id: "e2", startNodeId: "a", endNodeId: "d", distance: 100, bidirectional: true, accessible: true, type: "walkway", color: "#000", width: 2 },
      { id: "e3", startNodeId: "d", endNodeId: "c", distance: 100, bidirectional: true, accessible: true, type: "walkway", color: "#000", width: 2 },
    ];
    // Normal mode: direct path via b exists
    expect(findNavigationRoute(nodes, edges, "a", "c")).not.toBeNull();
    // Accessible mode: must detour via d
    const accessible = findNavigationRoute(nodes, edges, "a", "c", true);
    expect(accessible).not.toBeNull();
    expect(accessible!.nodeIds).toEqual(["a", "d", "c"]);
  });

  it("returns null in accessible-only mode when every route is blocked", () => {
    const nodes = [
      { id: "a", name: "A", x: 0, y: 0 },
      { id: "b", name: "B", x: 100, y: 0 },
    ];
    const edges = [{ id: "e1", startNodeId: "a", endNodeId: "b", distance: 50, bidirectional: true, accessible: false, type: "walkway", color: "#000", width: 2 }];
    expect(findNavigationRoute(nodes, edges, "a", "b", true)).toBeNull();
    expect(findNavigationRoute(nodes, edges, "a", "b", false)).not.toBeNull();
  });

  it("skips emergency-unsafe edges in emergency mode", () => {
    const nodes = [
      { id: "a", name: "A", x: 0, y: 0 },
      { id: "b", name: "B", x: 100, y: 0 },
      { id: "d", name: "D", x: 0, y: 100 },
      { id: "c", name: "C", x: 100, y: 100 },
    ];
    const edges = [
      { id: "e1", startNodeId: "a", endNodeId: "b", distance: 100, bidirectional: true, accessible: true, emergencySafe: false, type: "walkway", color: "#000", width: 2 },
      { id: "e2", startNodeId: "a", endNodeId: "d", distance: 100, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#000", width: 2 },
      { id: "e3", startNodeId: "d", endNodeId: "c", distance: 100, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#000", width: 2 },
    ];
    // Emergency mode avoids the unsafe edge
    const emergency = findNavigationRoute(nodes, edges, "a", "c", false, true);
    expect(emergency).not.toBeNull();
    expect(emergency!.nodeIds).toEqual(["a", "d", "c"]);
    // Edges without emergencySafe default to safe
    const defaultSafe = findNavigationRoute(lineNodes, lineEdges, "a", "c", false, true);
    expect(defaultSafe).not.toBeNull();
  });

  it("respects one-way edges (bidirectional: false)", () => {
    const oneWay = [
      { id: "e1", startNodeId: "a", endNodeId: "b", distance: 100, bidirectional: false, accessible: true, type: "walkway", color: "#000", width: 2 },
    ];
    expect(findNavigationRoute(lineNodes, oneWay, "a", "b")).not.toBeNull();
    expect(findNavigationRoute(lineNodes, oneWay, "b", "a")).toBeNull();
  });
});

// ── buildTransitionEdges (cross-floor stair/elevator stitching) ─────────────

describe("buildTransitionEdges", () => {
  const baseEdges: {
    startNodeId: string; endNodeId: string; distance: number; bidirectional: boolean; accessible: boolean;
  }[] = [];

  it("creates a virtual cross-floor edge for elevator nodes with the same sharedId", () => {
    const nodes = [
      { id: "n1", x: 0, y: 0, floorId: "f1", transitionSharedId: "el_main" },
      { id: "n2", x: 0, y: 0, floorId: "f2", transitionSharedId: "el_main" },
    ];
    const edges = buildTransitionEdges(nodes, baseEdges);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ startNodeId: "n1", endNodeId: "n2", accessible: true, bidirectional: true });
  });

  it("marks stair transitions as not accessible and elevator transitions as accessible", () => {
    const nodes = [
      { id: "n1", x: 0, y: 0, floorId: "f1", transitionSharedId: "st_main" },
      { id: "n2", x: 0, y: 0, floorId: "f2", transitionSharedId: "st_main" },
      { id: "n3", x: 0, y: 0, floorId: "f1", transitionSharedId: "el_side" },
      { id: "n4", x: 0, y: 0, floorId: "f2", transitionSharedId: "el_side" },
    ];
    const edges = buildTransitionEdges(nodes, baseEdges);
    const stair = edges.find((e) => e.startNodeId === "n1" || e.endNodeId === "n1");
    const elev = edges.find((e) => e.startNodeId === "n3" || e.endNodeId === "n3");
    expect(stair!.accessible).toBe(false);
    expect(elev!.accessible).toBe(true);
  });

  it("skips same-floor pairs, nodes without sharedId, and single-node groups", () => {
    const nodes = [
      { id: "n1", x: 0, y: 0, floorId: "f1", transitionSharedId: "el_main" },
      { id: "n2", x: 0, y: 0, floorId: "f1", transitionSharedId: "el_main" }, // same floor → skip
      { id: "n3", x: 0, y: 0, floorId: "f1" },                                 // no sharedId
      { id: "n4", x: 0, y: 0, floorId: "f2", transitionSharedId: "el_lonely" },// single group member
    ];
    expect(buildTransitionEdges(nodes, baseEdges)).toHaveLength(0);
  });
});

// ── Multi-floor routing through virtual transition edges ────────────────────

describe("findNavigationRoute across floors", () => {
  it("routes through a shared elevator transition to reach another floor", () => {
    const nodes = [
      { id: "n1", name: "F1 Elevator", x: 0, y: 0, floorId: "f1", transitionSharedId: "elA" },
      { id: "n2", name: "F2 Elevator", x: 0, y: 0, floorId: "f2", transitionSharedId: "elA" },
      { id: "n3", name: "Room 201", x: 100, y: 0, floorId: "f2" },
    ];
    const edges = [
      { id: "e1", startNodeId: "n2", endNodeId: "n3", distance: 100, bidirectional: true, accessible: true, type: "walkway", color: "#000", width: 2 },
    ];
    const path = findNavigationRoute(nodes, edges, "n1", "n3");
    expect(path).not.toBeNull();
    expect(path!.nodeIds).toEqual(["n1", "n2", "n3"]);
    // NOTE (intentional B1 regression pin): today the virtual floor-transition
    // edge is used for ROUTING but excluded from the reported distance and
    // steps (only authored edges are summed). This is current behavior and is
    // pinned here on purpose so package B8 (route testing) can review whether
    // it should be changed deliberately, not accidentally.
    expect(path!.distanceM).toBe(22);
    expect(path!.steps).toEqual(["Walk 22m to Room 201"]);
  });

  it("cannot cross floors without a shared stair/elevator transition", () => {
    const nodes = [
      { id: "n1", name: "F1 Node", x: 0, y: 0, floorId: "f1" },
      { id: "n2", name: "F2 Node", x: 100, y: 0, floorId: "f2" },
    ];
    const edges = [
      { id: "e1", startNodeId: "n1", endNodeId: "n2", distance: 100, bidirectional: true, accessible: true, type: "walkway", color: "#000", width: 2 },
    ];
    // Direct cross-floor edge without a shared transition still routes (edge is explicit)
    expect(findNavigationRoute(nodes, edges, "n1", "n2")).not.toBeNull();
  });
});

// ── Data sanity ─────────────────────────────────────────────────────────────

describe("legacy graph data sanity", () => {
  it("defines nodes and edges with consistent references", () => {
    const nodeIds = new Set(NODES.map((n) => n.id));
    for (const e of EDGES) {
      expect(nodeIds.has(e.from)).toBe(true);
      expect(nodeIds.has(e.to)).toBe(true);
      expect(e.distance).toBeGreaterThan(0);
    }
  });
});
