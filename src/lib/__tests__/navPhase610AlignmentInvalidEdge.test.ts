/**
 * B5 Phase 6.10 — Waypoint alignment assistance + obstacle invalid edge state
 *
 * Tests the pure library helpers for:
 *  1. navAlignSnap connected-node priority
 *  2. indoor edge blocking by furniture (navEdgeIsBlockedExtended / edgeCrossesBlockingFurniture)
 *  3. outdoor edge blocking by buildings/assets (outdoorEdgeIsBlocked)
 *  4. validateNavigationGraph obstacle-blocked edge issue
 */

import { describe, it, expect } from "vitest";
import {
  navAlignSnap,
  navEdgeIsBlocked,
  navEdgeIsBlockedExtended,
  edgeCrossesBlockingFurniture,
  edgePolylinePoints,
} from "../indoorNavigationGraph";
import { outdoorEdgeIsBlocked, polylineCrossesObstacle, polylineCrossesPlacedObject, pointInBuilding } from "../editorPlacement";
import { validateNavigationGraph } from "../validateNavigationGraph";
import type { Campus } from "../../components/map-builder/types";

// ── navAlignSnap: connected-node priority ──────────────────────────────────

describe("navAlignSnap — connected-node priority", () => {
  it("snaps Y to a connected node when within threshold", () => {
    const target = { x: 305, y: 203 };
    const others = [
      { x: 300, y: 200, id: "connectedA" },  // connected, Y difference 3
      { x: 310, y: 200, id: "unrelated" },    // unconnected, Y difference 3
    ];
    const connectedIds = new Set(["connectedA"]);
    const result = navAlignSnap(target, others, 8, connectedIds);
    expect(result.y).toBe(200);
    expect(result.x).toBe(300); // X snaps to connected node (300 vs 310)
    expect(result.guides.length).toBeGreaterThanOrEqual(1);
    const yGuide = result.guides.find((g) => g.type === "h");
    expect(yGuide?.pos).toBe(200);
  });

  it("snaps X to a connected node when within threshold", () => {
    const target = { x: 202, y: 500 };
    const others = [
      { x: 200, y: 400, id: "conn" },
    ];
    const connectedIds = new Set(["conn"]);
    const result = navAlignSnap(target, others, 8, connectedIds);
    expect(result.x).toBe(200);
    // Y=500 is far from other.y=400, so no Y snap
    expect(result.y).toBe(500);
    const vGuide = result.guides.find((g) => g.type === "v");
    expect(vGuide).toBeDefined();
    expect(vGuide?.pos).toBe(200);
    const hGuide = result.guides.find((g) => g.type === "h");
    expect(hGuide).toBeUndefined();
  });

  it("connected node wins over closer unconnected node on same axis", () => {
    const target = { x: 500, y: 200 };
    const others = [
      { x: 505, y: 206, id: "farConnected" },   // connected, Y diff 6
      { x: 503, y: 201, id: "closeUnconnected" }, // unconnected, Y diff 1
    ];
    const connectedIds = new Set(["farConnected"]);
    const result = navAlignSnap(target, others, 8, connectedIds);
    // The connected reference wins even though the unrelated reference is
    // closer on both axes; this is the Door/connected-Walking-Point rule.
    expect(result.y).toBe(206);
    expect(result.x).toBe(505);
    const yGuide = result.guides.find((g) => g.type === "h");
    expect(yGuide?.pos).toBe(206);
    expect(yGuide).toBeDefined();
  });

  it("does NOT snap X when beyond threshold", () => {
    const target = { x: 100, y: 500 };
    const others = [{ x: 200, y: 200, id: "far" }]; // both X and Y difference > threshold
    const result = navAlignSnap(target, others, 8);
    expect(result.x).toBe(100);
    expect(result.y).toBe(500);
    expect(result.guides).toHaveLength(0);
  });

  it("snaps both X and Y when both within threshold", () => {
    const target = { x: 201, y: 302 };
    const others = [{ x: 200, y: 300, id: "both" }];
    const result = navAlignSnap(target, others, 8);
    expect(result.x).toBe(200);
    expect(result.y).toBe(300);
    expect(result.guides).toHaveLength(2);
  });
});

// ── edgeCrossesBlockingFurniture ────────────────────────────────────────────

describe("edgeCrossesBlockingFurniture", () => {
  const furniture = [
    { x: 145, y: 195, width: 20, height: 20, type: "table" },
  ];

  it("returns true when segment passes through a table", () => {
    const pts = [{ x: 100, y: 205 }, { x: 200, y: 205 }]; // horizontal line through table center
    expect(edgeCrossesBlockingFurniture(pts, furniture)).toBe(true);
  });

  it("returns false when segment passes around the table", () => {
    const pts = [{ x: 100, y: 180 }, { x: 200, y: 180 }]; // above the table
    expect(edgeCrossesBlockingFurniture(pts, furniture)).toBe(false);
  });

  it("returns true for ANY placed furniture — plant now blocks too (placement-reality fix)", () => {
    const plant = [
      { x: 145, y: 195, width: 20, height: 20, type: "plant" },
    ];
    const pts = [{ x: 100, y: 205 }, { x: 200, y: 205 }];
    expect(edgeCrossesBlockingFurniture(pts, plant)).toBe(true);
  });

  it("returns false when no furniture", () => {
    const pts = [{ x: 100, y: 205 }, { x: 200, y: 205 }];
    expect(edgeCrossesBlockingFurniture(pts, undefined)).toBe(false);
  });

  it("checks desk, cabinet, bookshelf as blocking", () => {
    const types = ["desk", "cabinet", "bookshelf", "chair", "sofa", "bench", "computer-workstation"];
    for (const type of types) {
      const fb = [{ x: 145, y: 195, width: 20, height: 20, type }];
      const pts = [{ x: 100, y: 205 }, { x: 200, y: 205 }];
      expect(edgeCrossesBlockingFurniture(pts, fb)).toBe(true);
    }
  });

  it("ignores hidden furniture", () => {
    const hidden = [
      { x: 145, y: 195, width: 20, height: 20, type: "table", visible: false },
    ];
    const pts = [{ x: 100, y: 205 }, { x: 200, y: 205 }];
    expect(edgeCrossesBlockingFurniture(pts, hidden)).toBe(false);
  });
});

// ── navEdgeIsBlockedExtended ────────────────────────────────────────────────

describe("navEdgeIsBlockedExtended", () => {
  const nodes = [
    { id: "a", x: 100, y: 200 },
    { id: "b", x: 200, y: 200 },
  ];

  it("detects wall crossing (same as navEdgeIsBlocked)", () => {
    const walls = [
      { id: "w1", x1: 148, y1: 180, x2: 152, y2: 220, thickness: 4, visible: true },
    ];
    const edge = { startNodeId: "a", endNodeId: "b", bendPoints: undefined };
    expect(navEdgeIsBlocked(edge, nodes, walls, undefined)).toBe(true);
    expect(navEdgeIsBlockedExtended(edge, nodes, walls, undefined, undefined)).toBe(true);
  });

  it("detects blocking furniture", () => {
    const furniture = [
      { x: 145, y: 195, width: 20, height: 20, type: "table" },
    ];
    const edge = { startNodeId: "a", endNodeId: "b", bendPoints: undefined };
    expect(navEdgeIsBlockedExtended(edge, nodes, undefined, undefined, furniture)).toBe(true);
  });

  it("any placed furniture (plant) blocks via the extended check too", () => {
    const furniture = [
      { x: 145, y: 195, width: 20, height: 20, type: "plant" },
    ];
    const edge = { startNodeId: "a", endNodeId: "b", bendPoints: undefined };
    expect(navEdgeIsBlockedExtended(edge, nodes, undefined, undefined, furniture)).toBe(true);
  });

  it("returns false for clear path with no wall and no furniture", () => {
    const edge = { startNodeId: "a", endNodeId: "b", bendPoints: undefined };
    expect(navEdgeIsBlockedExtended(edge, nodes, undefined, undefined, undefined)).toBe(false);
  });

  it("wall behavior unchanged — door clears wall block", () => {
    const walls = [
      { id: "w1", x1: 148, y1: 180, x2: 152, y2: 220, thickness: 4, visible: true },
    ];
    const doors = [
      { id: "d1", x: 150, y: 200, width: 8, wallId: "w1", visible: true },
    ];
    const edge = { startNodeId: "a", endNodeId: "b", bendPoints: undefined };
    // Door opening clears wall block
    expect(navEdgeIsBlocked(edge, nodes, walls, doors)).toBe(false);
    // But furniture still blocks even when door is present
    const furniture = [
      { x: 145, y: 195, width: 20, height: 20, type: "table" },
    ];
    expect(navEdgeIsBlockedExtended(edge, nodes, walls, doors, furniture)).toBe(true);
  });
});

// ── outdoorEdgeIsBlocked ────────────────────────────────────────────────────

describe("outdoorEdgeIsBlocked", () => {
  const buildings = [
    { x: 140, y: 190, width: 30, height: 20, rotation: 0 },
  ];
  const assets = [
    { x: 300, y: 200, width: 16, height: 16, type: "tree", rotation: 0, scale: 1 },
  ];

  it("returns true when edge crosses building", () => {
    const pts = [{ x: 100, y: 200 }, { x: 200, y: 200 }];
    expect(outdoorEdgeIsBlocked(pts, buildings, [])).toBe(true);
  });

  it("returns true when edge crosses solid asset", () => {
    const pts = [{ x: 280, y: 208 }, { x: 320, y: 208 }];
    expect(outdoorEdgeIsBlocked(pts, [], assets)).toBe(true);
  });

  it("returns false when edge avoids all obstacles", () => {
    const pts = [{ x: 100, y: 100 }, { x: 200, y: 100 }]; // above the building
    expect(outdoorEdgeIsBlocked(pts, buildings, assets)).toBe(false);
  });

  it("returns false for non-solid assets (ground/path)", () => {
    const pathAssets = [
      { x: 300, y: 200, width: 50, height: 10, type: "walkway", rotation: 0, scale: 1 },
    ];
    const pts = [{ x: 280, y: 205 }, { x: 320, y: 205 }];
    expect(outdoorEdgeIsBlocked(pts, [], pathAssets)).toBe(false);
  });
});

// ── polylineCrossesPlacedObject — ANY placed object red-lines the edge ─────

describe("polylineCrossesPlacedObject — placement-reality red indicator", () => {
  const edgePts = [{ x: 100, y: 200 }, { x: 300, y: 200 }];

  it("blocks when a NON-solid decor (fountain) sits on the edge", () => {
    const assets = [{ x: 190, y: 186, width: 28, height: 28, type: "fountain", rotation: 0, scale: 1 }];
    expect(polylineCrossesPlacedObject(edgePts, [], assets)).toBe(true);
  });

  it("blocks for every placed non-ground decor type (bench-long, flower, trash-bin, gazebo, picnic-table, flag)", () => {
    const types = ["bench-long", "flower", "trash-bin", "gazebo", "picnic-table", "flag", "lamp-post", "recycle-bin"];
    for (const type of types) {
      const assets = [{ x: 190, y: 192, width: 24, height: 16, type, rotation: 0, scale: 1 }];
      expect(polylineCrossesPlacedObject(edgePts, [], assets), type).toBe(true);
    }
  });

  it("does NOT block for ground-area (background terrain paths are painted on)", () => {
    const assets = [{ x: 190, y: 180, width: 120, height: 40, type: "ground-area", rotation: 0, scale: 1 }];
    expect(polylineCrossesPlacedObject(edgePts, [], assets)).toBe(false);
  });

  it("does NOT block for hidden assets", () => {
    const assets = [{ x: 190, y: 192, width: 24, height: 16, type: "bench-long", rotation: 0, scale: 1, visible: false }];
    expect(polylineCrossesPlacedObject(edgePts, [], assets)).toBe(false);
  });

  it("still blocks on buildings", () => {
    const buildings = [{ x: 140, y: 190, width: 30, height: 20, rotation: 0 }];
    expect(polylineCrossesPlacedObject(edgePts, buildings, [])).toBe(true);
  });

  it("returns false when nothing touches the edge", () => {
    const assets = [{ x: 500, y: 500, width: 20, height: 20, type: "fountain", rotation: 0, scale: 1 }];
    expect(polylineCrossesPlacedObject(edgePts, [], assets)).toBe(false);
  });
});

// ── validateNavigationGraph — obstacle-blocked edges ────────────────────────

describe("validateNavigationGraph — obstacle-blocked edges", () => {
  function makeCampus(overrides?: Partial<Campus>): Campus {
    return {
      id: "c1", name: "Test", code: "T", description: "", address: "", city: "", province: "",
      postalCode: "", status: "active", publishStatus: "published", visibleToStudents: false,
      features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
      canvasW: 900, canvasH: 680,
      settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
      buildings: [], markers: [], paths: [], navNodes: [], navEdges: [],
      createdAt: "", updatedAt: "",
      ...overrides,
    };
  }

  it("reports outdoor edge blocked by building as warning", () => {
    const campus = makeCampus({
      buildings: [{ id: "b1", name: "B1", code: "B1", category: "Academic", description: "", x: 140, y: 190, width: 30, height: 20, color: "#000", expanded: false, floors: [] }],
      navNodes: [
        { id: "n1", name: "A", type: "outdoor", x: 100, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
        { id: "n2", name: "B", type: "outdoor", x: 200, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
      ],
      navEdges: [
        { id: "e1", startNodeId: "n1", endNodeId: "n2", distance: 100, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 },
      ],
    });
    const result = validateNavigationGraph(campus);
    const blocked = result.issues.filter((i) => i.type === "nav_edge_blocked_by_obstacle");
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked[0].severity).toBe("warning");
    expect(blocked[0].edgeId).toBe("e1");
  });

  it("reports outdoor edge blocked by solid decor asset as warning", () => {
    const campus = makeCampus({
      decorAssets: [{ id: "d1", type: "tree", name: "Tree", x: 145, y: 198, width: 16, height: 16, color: "#22c55e", rotation: 0, scale: 1 }],
      navNodes: [
        { id: "n1", name: "A", type: "outdoor", x: 100, y: 206, campusId: "c1", accessible: true, color: "#16a34a" },
        { id: "n2", name: "B", type: "outdoor", x: 200, y: 206, campusId: "c1", accessible: true, color: "#16a34a" },
      ],
      navEdges: [
        { id: "e1", startNodeId: "n1", endNodeId: "n2", distance: 100, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 },
      ],
    });
    const result = validateNavigationGraph(campus);
    const blocked = result.issues.filter((i) => i.type === "nav_edge_blocked_by_obstacle");
    expect(blocked.length).toBeGreaterThan(0);
  });

  it("no blocked-edge issue for clear outdoor path", () => {
    const campus = makeCampus({
      buildings: [{ id: "b1", name: "B1", code: "B1", category: "Academic", description: "", x: 500, y: 500, width: 30, height: 20, color: "#000", expanded: false, floors: [] }],
      navNodes: [
        { id: "n1", name: "A", type: "outdoor", x: 100, y: 100, campusId: "c1", accessible: true, color: "#16a34a" },
        { id: "n2", name: "B", type: "outdoor", x: 200, y: 100, campusId: "c1", accessible: true, color: "#16a34a" },
      ],
      navEdges: [
        { id: "e1", startNodeId: "n1", endNodeId: "n2", distance: 100, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 },
      ],
    });
    const result = validateNavigationGraph(campus);
    const blocked = result.issues.filter((i) => i.type === "nav_edge_blocked_by_obstacle");
    expect(blocked).toHaveLength(0);
  });

  it("indoor wall-blocked edge is also reported", () => {
    const campus = makeCampus({
      buildings: [{
        id: "b1", name: "B1", code: "B1", category: "Academic", description: "", x: 0, y: 0, width: 200, height: 200, color: "#000", expanded: false,
        floors: [{
          id: "f1", buildingId: "b1", number: 1, label: "G",
          rooms: [], paths: [],
          walls: [{ id: "w1", x1: 148, y1: 150, x2: 152, y2: 250, thickness: 4, visible: true }],
          doors: [],
        }],
      }],
      navNodes: [
        { id: "n1", name: "A", type: "waypoint", x: 100, y: 200, buildingId: "b1", floorId: "f1", accessible: true, color: "#3f6212" },
        { id: "n2", name: "B", type: "waypoint", x: 200, y: 200, buildingId: "b1", floorId: "f1", accessible: true, color: "#3f6212" },
      ],
      navEdges: [
        { id: "e1", startNodeId: "n1", endNodeId: "n2", distance: 100, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#3f6212", width: 2 },
      ],
    });
    const result = validateNavigationGraph(campus);
    const blocked = result.issues.filter((i) => i.type === "nav_edge_blocked_by_obstacle");
    expect(blocked.length).toBeGreaterThan(0);
  });
});
