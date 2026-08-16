import { describe, it, expect } from "vitest";
import { validateNavigationGraph } from "../validateNavigationGraph";
import type { Campus, NavigationNode, NavigationEdge, CampusBuilding } from "../../components/map-builder/types";

// ── Helpers ──────────────────────────────────────────────────────────────

function baseCampus(overrides?: Partial<Campus>): Campus {
  return {
    id: "c1",
    name: "Test Campus",
    code: "TC",
    description: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    status: "active",
    publishStatus: "draft",
    visibleToStudents: false,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    canvasW: 900,
    canvasH: 680,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

function node(overrides: Partial<NavigationNode> & { id: string; type: NavigationNode["type"] }): NavigationNode {
  return {
    name: overrides.id,
    x: 0,
    y: 0,
    accessible: true,
    color: "#000",
    ...overrides,
  };
}

function edge(overrides: Partial<NavigationEdge> & { id: string; startNodeId: string; endNodeId: string }): NavigationEdge {
  return {
    distance: 100,
    bidirectional: true,
    accessible: true,
    type: "outdoor",
    color: "#000",
    width: 2,
    ...overrides,
  };
}

function building(overrides: Partial<CampusBuilding> & { id: string }): CampusBuilding {
  return {
    name: "Building",
    code: "B1",
    x: 100,
    y: 100,
    width: 200,
    height: 150,
    floors: [],
    entrances: [],
    visible: true,
    locked: false,
    rotation: 0,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("validateNavigationGraph", () => {
  it("returns ready for an empty graph", () => {
    const result = validateNavigationGraph(baseCampus());
    expect(result.status).toBe("ready");
    expect(result.issues).toHaveLength(0);
  });

  it("returns ready for a healthy simple graph", () => {
    const campus = baseCampus({
      navNodes: [
        node({ id: "outdoor-1", type: "outdoor" }),
        node({ id: "entrance-1", type: "entrance", buildingId: "b1", entranceId: "e1" }),
        node({ id: "indoor-1", type: "hallway", buildingId: "b1", floorId: "f1" }),
      ],
      navEdges: [
        edge({ id: "e1", startNodeId: "outdoor-1", endNodeId: "entrance-1" }),
        edge({ id: "e2", startNodeId: "entrance-1", endNodeId: "indoor-1", type: "entrance_transition" }),
      ],
    });
    const result = validateNavigationGraph(campus);
    expect(result.status).toBe("ready");
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("flags orphan node as warning", () => {
    const campus = baseCampus({
      navNodes: [
        node({ id: "orphan-1", type: "outdoor" }),
        node({ id: "connected-1", type: "outdoor" }),
        node({ id: "connected-2", type: "outdoor" }),
      ],
      navEdges: [edge({ id: "e1", startNodeId: "connected-1", endNodeId: "connected-2" })],
    });
    const result = validateNavigationGraph(campus);
    expect(result.issues.some((i) => i.type === "nav_orphan_node")).toBe(true);
    expect(result.issues.find((i) => i.type === "nav_orphan_node")?.nodeId).toBe("orphan-1");
  });

  it("flags missing-node edge as error", () => {
    const campus = baseCampus({
      navNodes: [node({ id: "n1", type: "outdoor" })],
      navEdges: [edge({ id: "e1", startNodeId: "n1", endNodeId: "missing-node" })],
    });
    const result = validateNavigationGraph(campus);
    expect(result.issues.some((i) => i.type === "nav_broken_edge" && i.severity === "error")).toBe(true);
    expect(result.status).toBe("not_ready");
  });

  it("flags duplicate edge as warning", () => {
    const campus = baseCampus({
      navNodes: [
        node({ id: "n1", type: "outdoor" }),
        node({ id: "n2", type: "outdoor" }),
      ],
      navEdges: [
        edge({ id: "e1", startNodeId: "n1", endNodeId: "n2" }),
        edge({ id: "e2", startNodeId: "n1", endNodeId: "n2" }),
      ],
    });
    const result = validateNavigationGraph(campus);
    expect(result.issues.some((i) => i.type === "nav_duplicate_edge")).toBe(true);
  });

  it("flags incomplete entrance bridge when building has floors", () => {
    const campus = baseCampus({
      buildings: [building({ id: "b1", floors: [{ id: "f1", doors: [], rooms: [], walls: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] } as any], entrances: [{ id: "e1", buildingId: "b1", edge: "bottom", offset: 0.5 }] })],
      navNodes: [node({ id: "entrance-1", type: "entrance", buildingId: "b1", entranceId: "e1" })],
      navEdges: [],
    });
    const result = validateNavigationGraph(campus);
    expect(result.issues.some((i) => i.type === "nav_entrance_door_missing")).toBe(true);
  });

  it("does not flag entrance bridge when building has no floors", () => {
    const campus = baseCampus({
      buildings: [building({ id: "b1", floors: [], entrances: [{ id: "e1", buildingId: "b1", edge: "bottom", offset: 0.5 }] })],
      navNodes: [],
      navEdges: [],
    });
    const result = validateNavigationGraph(campus);
    expect(result.issues.some((i) => i.type === "nav_entrance_bridge_missing")).toBe(false);
  });

  it("flags broken door reference as error", () => {
    const campus = baseCampus({
      buildings: [building({ id: "b1", floors: [{ id: "f1", doors: [], rooms: [], walls: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] } as any] })],
      navNodes: [node({ id: "n1", type: "hallway", buildingId: "b1", floorId: "f1", doorId: "missing-door" })],
      navEdges: [],
    });
    const result = validateNavigationGraph(campus);
    expect(result.issues.some((i) => i.type === "nav_broken_edge" && i.severity === "error" && i.message.includes("door"))).toBe(true);
  });

  it("flags valid floor_transition without issues", () => {
    const campus = baseCampus({
      navNodes: [
        node({ id: "stair-1", type: "stair", buildingId: "b1", floorId: "f1", transitionSharedId: "shared-1" }),
        node({ id: "stair-2", type: "stair", buildingId: "b1", floorId: "f2", transitionSharedId: "shared-1" }),
      ],
      navEdges: [edge({ id: "e1", startNodeId: "stair-1", endNodeId: "stair-2", type: "floor_transition" })],
    });
    const result = validateNavigationGraph(campus);
    expect(result.issues.filter((i) => i.type === "nav_floor_transition_invalid")).toHaveLength(0);
  });

  it("flags floor_transition with mismatched sharedId as error", () => {
    const campus = baseCampus({
      navNodes: [
        node({ id: "stair-1", type: "stair", buildingId: "b1", floorId: "f1", transitionSharedId: "shared-1" }),
        node({ id: "stair-2", type: "stair", buildingId: "b1", floorId: "f2", transitionSharedId: "shared-2" }),
      ],
      navEdges: [edge({ id: "e1", startNodeId: "stair-1", endNodeId: "stair-2", type: "floor_transition" })],
    });
    const result = validateNavigationGraph(campus);
    expect(result.issues.some((i) => i.type === "nav_floor_transition_invalid" && i.severity === "error")).toBe(true);
  });

  it("flags stairs floor_transition marked accessible as warning", () => {
    const campus = baseCampus({
      navNodes: [
        node({ id: "stair-1", type: "stair", buildingId: "b1", floorId: "f1", transitionSharedId: "s1" }),
        node({ id: "stair-2", type: "stair", buildingId: "b1", floorId: "f2", transitionSharedId: "s1" }),
      ],
      navEdges: [edge({ id: "e1", startNodeId: "stair-1", endNodeId: "stair-2", type: "floor_transition", accessible: true })],
    });
    const result = validateNavigationGraph(campus);
    expect(result.issues.some((i) => i.type === "nav_accessibility_contradiction")).toBe(true);
  });

  it("detects disconnected components with outdoor and indoor", () => {
    const campus = baseCampus({
      navNodes: [
        node({ id: "outdoor-1", type: "outdoor" }),
        node({ id: "outdoor-2", type: "outdoor" }),
        node({ id: "indoor-1", type: "hallway", buildingId: "b1", floorId: "f1" }),
        node({ id: "indoor-2", type: "hallway", buildingId: "b1", floorId: "f1" }),
      ],
      navEdges: [
        edge({ id: "e1", startNodeId: "outdoor-1", endNodeId: "outdoor-2" }),
        edge({ id: "e2", startNodeId: "indoor-1", endNodeId: "indoor-2" }),
      ],
    });
    const result = validateNavigationGraph(campus);
    expect(result.issues.some((i) => i.type === "nav_disconnected_component")).toBe(true);
  });

  it("complete outdoor→entrance→indoor→floor-transition chain has no errors", () => {
    const campus = baseCampus({
      buildings: [building({ id: "b1", floors: [
        { id: "f1", doors: [{ id: "d1" } as any], rooms: [], walls: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] } as any,
        { id: "f2", doors: [{ id: "d2" } as any], rooms: [], walls: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] } as any,
      ], entrances: [{ id: "e1", buildingId: "b1", edge: "bottom", offset: 0.5 }] })],
      navNodes: [
        node({ id: "out-1", type: "outdoor" }),
        node({ id: "ent-1", type: "entrance", buildingId: "b1", entranceId: "e1" }),
        node({ id: "door-1", type: "room_access", buildingId: "b1", floorId: "f1", doorId: "d1" }),
        node({ id: "stair-1", type: "stair", buildingId: "b1", floorId: "f1", transitionSharedId: "s1" }),
        node({ id: "stair-2", type: "stair", buildingId: "b1", floorId: "f2", transitionSharedId: "s1" }),
        node({ id: "dest-1", type: "room_access", buildingId: "b1", floorId: "f2", doorId: "d2" }),
      ],
      navEdges: [
        edge({ id: "e1", startNodeId: "out-1", endNodeId: "ent-1" }),
        edge({ id: "e2", startNodeId: "ent-1", endNodeId: "door-1", type: "entrance_transition" }),
        edge({ id: "e3", startNodeId: "door-1", endNodeId: "stair-1" }),
        edge({ id: "e4", startNodeId: "stair-1", endNodeId: "stair-2", type: "floor_transition", accessible: false }),
        edge({ id: "e5", startNodeId: "stair-2", endNodeId: "dest-1" }),
      ],
    });
    const result = validateNavigationGraph(campus);
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(result.status).toBe("ready");
  });

  it("readiness status is ready when only orphan warnings exist", () => {
    const campus = baseCampus({
      navNodes: [node({ id: "orphan-1", type: "outdoor" })],
      navEdges: [],
    });
    const result = validateNavigationGraph(campus);
    expect(result.status).toBe("ready");
  });

  it("readiness status is needs_attention when significant warnings exist", () => {
    const campus = baseCampus({
      navNodes: [
        node({ id: "n1", type: "outdoor" }),
        node({ id: "n2", type: "outdoor" }),
      ],
      navEdges: [
        edge({ id: "e1", startNodeId: "n1", endNodeId: "n2" }),
        edge({ id: "e2", startNodeId: "n1", endNodeId: "n2" }),
      ],
    });
    const result = validateNavigationGraph(campus);
    expect(result.status).toBe("needs_attention");
  });

  it("self-edge is flagged as warning", () => {
    const campus = baseCampus({
      navNodes: [node({ id: "n1", type: "outdoor" })],
      navEdges: [edge({ id: "e1", startNodeId: "n1", endNodeId: "n1" })],
    });
    const result = validateNavigationGraph(campus);
    expect(result.issues.some((i) => i.type === "nav_broken_edge" && i.severity === "warning")).toBe(true);
  });

  // ── B5 Final: structured locate metadata ──────────────────────────────

  it("orphan node issue carries a structured navNode target with scope", () => {
    const campus = baseCampus({
      navNodes: [node({ id: "orphan-out", type: "outdoor" })],
      navEdges: [],
    });
    const issue = validateNavigationGraph(campus).issues.find((i) => i.type === "nav_orphan_node")!;
    expect(issue.target).toEqual({
      scope: "campus",
      mode: "navigation",
      selectionType: "navNode",
      id: "orphan-out",
    });
  });

  it("indoor orphan node issue targets the floor scope", () => {
    const campus = baseCampus({
      navNodes: [node({ id: "indoor-orphan", type: "hallway", buildingId: "b1", floorId: "f1" })],
      navEdges: [],
    });
    const issue = validateNavigationGraph(campus).issues.find((i) => i.type === "nav_orphan_node")!;
    expect(issue.target).toMatchObject({
      scope: "floor",
      mode: "navigation",
      buildingId: "b1",
      floorId: "f1",
      selectionType: "navNode",
      id: "indoor-orphan",
    });
  });

  it("broken door reference targets the broken nav node (door is gone)", () => {
    const campus = baseCampus({
      buildings: [building({ id: "b1", floors: [{ id: "f1", doors: [], rooms: [], walls: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] } as any] })],
      navNodes: [node({ id: "n1", type: "hallway", buildingId: "b1", floorId: "f1", doorId: "missing-door" })],
      navEdges: [],
    });
    const issue = validateNavigationGraph(campus).issues.find((i) => i.type === "nav_broken_edge" && i.message.includes("door"))!;
    expect(issue.target).toMatchObject({
      scope: "floor",
      mode: "navigation",
      buildingId: "b1",
      floorId: "f1",
      selectionType: "navNode",
      id: "n1",
    });
  });

  it("broken room reference targets the broken nav node (room is gone)", () => {
    const campus = baseCampus({
      buildings: [building({ id: "b1", floors: [{ id: "f1", doors: [], rooms: [], walls: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] } as any] })],
      navNodes: [node({ id: "n1", type: "room_access", buildingId: "b1", floorId: "f1", roomId: "missing-room" })],
      navEdges: [],
    });
    const issue = validateNavigationGraph(campus).issues.find((i) => i.type === "nav_broken_edge" && i.message.includes("room"))!;
    expect(issue.target).toMatchObject({
      scope: "floor",
      mode: "navigation",
      buildingId: "b1",
      floorId: "f1",
      selectionType: "navNode",
      id: "n1",
    });
  });

  it("missing shared transition ID targets the physical stair in design mode", () => {
    const campus = baseCampus({
      navNodes: [
        node({ id: "stair-node-1", type: "stair", buildingId: "b1", floorId: "f1", stairId: "phys-stair-1" }),
        node({ id: "stair-node-2", type: "stair", buildingId: "b1", floorId: "f2", stairId: "phys-stair-2" }),
      ],
      navEdges: [edge({ id: "e1", startNodeId: "stair-node-1", endNodeId: "stair-node-2", type: "floor_transition" })],
    });
    const issue = validateNavigationGraph(campus).issues.find((i) => i.type === "nav_floor_transition_invalid" && i.message.includes("shared transition ID"))!;
    expect(issue.target).toMatchObject({
      scope: "floor",
      mode: "design",
      buildingId: "b1",
      floorId: "f1",
      selectionType: "stairs",
      id: "phys-stair-1",
    });
  });

  it("indoor blocked edge targets the floor-scoped nav edge", () => {
    const campus = baseCampus({
      buildings: [building({ id: "b1", floors: [{ id: "f1", doors: [], rooms: [], walls: [{
        id: "w1", x1: 50, y1: 50, x2: 250, y2: 50, thickness: 4, color: "#000",
      }], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] } as any] })],
      navNodes: [
        node({ id: "n1", type: "hallway", buildingId: "b1", floorId: "f1", x: 0, y: 50 }),
        node({ id: "n2", type: "hallway", buildingId: "b1", floorId: "f1", x: 300, y: 50 }),
      ],
      navEdges: [edge({ id: "e1", startNodeId: "n1", endNodeId: "n2" })],
    });
    const issue = validateNavigationGraph(campus).issues.find((i) => i.type === "nav_edge_blocked_by_obstacle")!;
    expect(issue.target).toMatchObject({
      scope: "floor",
      mode: "navigation",
      buildingId: "b1",
      floorId: "f1",
      selectionType: "navEdge",
      id: "e1",
    });
  });

  it("outdoor blocked edge targets a campus-scoped nav edge", () => {
    const campus = baseCampus({
      // Building straddles the y=0 polyline so the straight outdoor edge
      // (0,0) → (400,0) passes through its footprint.
      buildings: [building({ id: "b1", x: 150, y: -40, width: 100, height: 80, floors: [] })],
      navNodes: [
        node({ id: "n1", type: "outdoor", x: 0, y: 0 }),
        node({ id: "n2", type: "outdoor", x: 400, y: 0 }),
      ],
      navEdges: [edge({ id: "e1", startNodeId: "n1", endNodeId: "n2" })],
    });
    const issue = validateNavigationGraph(campus).issues.find((i) => i.type === "nav_edge_blocked_by_obstacle")!;
    expect(issue.target).toEqual({
      scope: "campus",
      mode: "navigation",
      selectionType: "navEdge",
      id: "e1",
    });
  });

  it("entrance bridge missing targets the building entrance", () => {
    const campus = baseCampus({
      buildings: [building({ id: "b1", floors: [{ id: "f1" } as any], entrances: [{ id: "e1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general" }] })],
      navNodes: [],
      navEdges: [],
    });
    const issue = validateNavigationGraph(campus).issues.find((i) => i.type === "nav_entrance_bridge_missing")!;
    expect(issue.target).toMatchObject({
      scope: "campus",
      mode: "navigation",
      buildingId: "b1",
      selectionType: "entrance",
      id: "e1",
    });
  });
});
