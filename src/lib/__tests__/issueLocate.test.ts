import { describe, it, expect } from "vitest";
import {
  issueKey,
  dedupeValidationIssues,
  resolveIssueTarget,
  resolveIssueLocateTarget,
  floorSelectionForTarget,
  polylineMidpoint,
  floorObjectCenter,
} from "../issueLocate";
import type { ValidationIssue } from "../../components/map-builder/ValidationErrorsDialog";
import type { Campus, NavigationNode } from "../../components/map-builder/types";

function makeCampus(overrides?: Partial<Campus>): Campus {
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
    publishStatus: "published",
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

function navNode(overrides: Partial<NavigationNode> & { id: string; type: NavigationNode["type"] }): NavigationNode {
  return { name: overrides.id, x: 200, y: 200, accessible: true, color: "#16a34a", ...overrides };
}

function issue(overrides: Partial<ValidationIssue> & { type: ValidationIssue["type"] }): ValidationIssue {
  return {
    severity: "warning",
    message: "test issue",
    ...overrides,
  };
}

// ── Dedup ──────────────────────────────────────────────────────────────────

describe("dedupeValidationIssues", () => {
  it("keeps distinct issues", () => {
    const issues = [
      issue({ type: "nav_orphan_node", nodeId: "n1" }),
      issue({ type: "nav_orphan_node", nodeId: "n2" }),
    ];
    expect(dedupeValidationIssues(issues)).toHaveLength(2);
  });

  it("drops exact duplicates (same type + same references)", () => {
    const issues = [
      issue({ type: "nav_edge_blocked_by_obstacle", edgeId: "e1" }),
      issue({ type: "nav_edge_blocked_by_obstacle", edgeId: "e1" }),
    ];
    const out = dedupeValidationIssues(issues);
    expect(out).toHaveLength(1);
  });

  it("keeps same-type issues for different targets", () => {
    const issues = [
      issue({ type: "nav_edge_blocked_by_obstacle", edgeId: "e1" }),
      issue({ type: "nav_edge_blocked_by_obstacle", edgeId: "e2" }),
    ];
    expect(dedupeValidationIssues(issues)).toHaveLength(2);
  });

  it("dedupes by structured target when flat fields are absent", () => {
    const base: ValidationIssue = {
      type: "nav_entrance_bridge_missing",
      severity: "warning",
      message: "no waypoint",
      target: { scope: "campus", mode: "navigation", buildingId: "b1", selectionType: "entrance", id: "e1" },
    };
    const out = dedupeValidationIssues([base, { ...base }]);
    expect(out).toHaveLength(1);
  });

  it("preserves first-seen order", () => {
    const issues = [
      issue({ type: "nav_broken_edge", edgeId: "e1", severity: "error" }),
      issue({ type: "nav_broken_edge", edgeId: "e1", severity: "error" }),
      issue({ type: "nav_orphan_node", nodeId: "n1" }),
    ];
    expect(dedupeValidationIssues(issues).map((i) => i.type)).toEqual(["nav_broken_edge", "nav_orphan_node"]);
  });

  it("issueKey is stable across calls", () => {
    const a = issue({ type: "nav_orphan_node", nodeId: "n1", buildingId: "b1", floorId: "f1" });
    const b = issue({ type: "nav_orphan_node", nodeId: "n1", buildingId: "b1", floorId: "f1" });
    expect(issueKey(a)).toBe(issueKey(b));
  });
});

// ── Target resolution ─────────────────────────────────────────────────────

describe("resolveIssueTarget", () => {
  it("prefers the attached structured target", () => {
    const target = { scope: "floor", mode: "navigation", buildingId: "b1", floorId: "f1", selectionType: "navNode", id: "n1" };
    const out = resolveIssueTarget(issue({ type: "nav_orphan_node", target }));
    expect(out).toEqual(target);
  });

  it("derives a campus building target from buildingId", () => {
    const out = resolveIssueTarget(issue({ type: "missing_name", buildingId: "b1" }));
    expect(out).toEqual({
      scope: "campus",
      mode: "design",
      buildingId: "b1",
      selectionType: "building",
      id: "b1",
    });
  });

  it("derives a floor navNode target from nodeId + floorId", () => {
    const out = resolveIssueTarget(issue({ type: "nav_orphan_node", nodeId: "n1", buildingId: "b1", floorId: "f1" }));
    expect(out).toEqual({
      scope: "floor",
      mode: "navigation",
      buildingId: "b1",
      floorId: "f1",
      selectionType: "navNode",
      id: "n1",
    });
  });

  it("derives a campus navNode target when no floorId", () => {
    const out = resolveIssueTarget(issue({ type: "nav_orphan_node", nodeId: "n1" }));
    expect(out?.scope).toBe("campus");
    expect(out?.selectionType).toBe("navNode");
    expect(out?.id).toBe("n1");
  });

  it("derives a navEdge target from edgeId", () => {
    const out = resolveIssueTarget(issue({ type: "nav_edge_blocked_by_obstacle", edgeId: "e1" }));
    expect(out?.selectionType).toBe("navEdge");
    expect(out?.id).toBe("e1");
  });

  it("returns null when nothing is locatable", () => {
    expect(resolveIssueTarget(issue({ type: "nav_disconnected_component" }))).toBeNull();
  });
});

// ── Locate target validation against the CURRENT campus (B5 correction) ──

describe("resolveIssueLocateTarget", () => {
  it("returns campus for outdoor-scope targets", () => {
    const target = { scope: "campus", mode: "navigation", selectionType: "navNode", id: "n1" };
    const res = resolveIssueLocateTarget(issue({ type: "nav_orphan_node", target }), makeCampus());
    expect(res.kind).toBe("campus");
    if (res.kind === "campus") expect(res.target).toEqual(target);
  });

  it("returns floor when the building AND floor exist in the current campus", () => {
    const campus = makeCampus({
      buildings: [{
        id: "b1", name: "B", code: "B", category: "Academic", description: "",
        x: 0, y: 0, width: 10, height: 10, color: "#000", expanded: false,
        floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground", rooms: [], paths: [] }],
      }],
      navNodes: [navNode({ id: "n1", type: "hallway", buildingId: "b1", floorId: "f1" })],
    });
    const target = { scope: "floor", mode: "navigation", buildingId: "b1", floorId: "f1", selectionType: "navNode", id: "n1" };
    const res = resolveIssueLocateTarget(issue({ type: "nav_orphan_node", target }), campus);
    expect(res.kind).toBe("floor");
  });

  it("falls back to the surviving nav node when the floor was deleted", () => {
    const campus = makeCampus({
      // Building exists but floor f1 is gone; the node survives with coords.
      buildings: [{
        id: "b1", name: "B", code: "B", category: "Academic", description: "",
        x: 0, y: 0, width: 10, height: 10, color: "#000", expanded: false,
        floors: [{ id: "f2", buildingId: "b1", number: 2, label: "Second", rooms: [], paths: [] }],
      }],
      navNodes: [navNode({ id: "n1", type: "room_access", buildingId: "b1", floorId: "f1", doorId: "missing" })],
    });
    const target = { scope: "floor", mode: "navigation", buildingId: "b1", floorId: "f1", selectionType: "navNode", id: "n1" };
    const res = resolveIssueLocateTarget(issue({ type: "nav_broken_edge", target }), campus);
    expect(res.kind).toBe("staleNavNode");
    if (res.kind === "staleNavNode") expect(res.node.id).toBe("n1");
  });

  it("falls back to the surviving nav node when the building was deleted", () => {
    const campus = makeCampus({
      buildings: [],
      navNodes: [navNode({ id: "n1", type: "room_access", buildingId: "b1", floorId: "f1", roomId: "missing" })],
    });
    const target = { scope: "floor", mode: "navigation", buildingId: "b1", floorId: "f1", selectionType: "navNode", id: "n1" };
    const res = resolveIssueLocateTarget(issue({ type: "nav_broken_edge", target }), campus);
    expect(res.kind).toBe("staleNavNode");
  });

  it("is unlocatable when the referenced node no longer exists", () => {
    const campus = makeCampus({ buildings: [], navNodes: [] });
    const target = { scope: "floor", mode: "navigation", buildingId: "b1", floorId: "f1", selectionType: "navNode", id: "gone" };
    const res = resolveIssueLocateTarget(issue({ type: "nav_broken_edge", target }), campus);
    expect(res.kind).toBe("unlocatable");
  });

  it("is unlocatable when the issue has no target at all", () => {
    const res = resolveIssueLocateTarget(issue({ type: "nav_disconnected_component" }), makeCampus());
    expect(res.kind).toBe("unlocatable");
  });

  it("derives a target from flat fields before validating the floor", () => {
    const campus = makeCampus({
      buildings: [{
        id: "b1", name: "B", code: "B", category: "Academic", description: "",
        x: 0, y: 0, width: 10, height: 10, color: "#000", expanded: false,
        floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground", rooms: [], paths: [] }],
      }],
      navNodes: [navNode({ id: "n1", type: "hallway", buildingId: "b1", floorId: "f1" })],
    });
    // No attached target — the flat nodeId/floorId fields derive one, and the
    // floor is valid, so the resolution is a safe floor hop.
    const res = resolveIssueLocateTarget(
      issue({ type: "nav_orphan_node", nodeId: "n1", buildingId: "b1", floorId: "f1" }),
      campus,
    );
    expect(res.kind).toBe("floor");
    if (res.kind === "floor") expect(res.target.selectionType).toBe("navNode");
  });
});

// ── Floor selection mapping ────────────────────────────────────────────────

describe("floorSelectionForTarget", () => {
  it("maps navNode targets", () => {
    const out = floorSelectionForTarget({ scope: "floor", mode: "navigation", buildingId: "b1", floorId: "f1", selectionType: "navNode", id: "n1" });
    expect(out).toEqual({ type: "navNode", id: "n1" });
  });

  it("maps stairs targets (design-mode transition fixes)", () => {
    const out = floorSelectionForTarget({ scope: "floor", mode: "design", buildingId: "b1", floorId: "f1", selectionType: "stairs", id: "s1" });
    expect(out).toEqual({ type: "stairs", id: "s1" });
  });

  it("returns null for campus-scope targets", () => {
    expect(floorSelectionForTarget({ scope: "campus", mode: "navigation", selectionType: "navNode", id: "n1" })).toBeNull();
  });
});

describe("B7 Phase 1 — dedup stability for new issue types", () => {
  const duplicateRoomIssue = {
    type: "duplicate_room_name" as const,
    severity: "warning" as const,
    message: "Room name \"Room 201\" is duplicated on floor \"Ground Floor\".",
    buildingId: "b1",
    floorId: "f1",
    roomId: "r2",
    target: { scope: "floor" as const, mode: "design" as const, buildingId: "b1", floorId: "f1", selectionType: "room" as const, id: "r2" },
  };
  const emergencyExitIssue = {
    type: "emergency_exit_no_nav" as const,
    severity: "warning" as const,
    message: "Emergency exit door \"d1\" has no navigation waypoint.",
    buildingId: "b1",
    floorId: "f1",
    target: { scope: "floor" as const, mode: "design" as const, buildingId: "b1", floorId: "f1", selectionType: "door" as const, id: "d1" },
  };

  it("collapses repeated duplicate_room_name issues with identical targets", () => {
    const out = dedupeValidationIssues([duplicateRoomIssue, duplicateRoomIssue, duplicateRoomIssue]);
    expect(out).toHaveLength(1);
  });

  it("keeps duplicate_room_name issues for different rooms", () => {
    const other = { ...duplicateRoomIssue, roomId: "r3", target: { ...duplicateRoomIssue.target, id: "r3" } };
    const out = dedupeValidationIssues([duplicateRoomIssue, other]);
    expect(out).toHaveLength(2);
  });

  it("collapses repeated emergency_exit_no_nav issues for the same door", () => {
    const out = dedupeValidationIssues([emergencyExitIssue, emergencyExitIssue]);
    expect(out).toHaveLength(1);
  });
});

// ── Locate geometry (B7 Phase 1) ───────────────────────────────────────────

describe("polylineMidpoint", () => {
  it("returns the segment midpoint for a straight edge", () => {
    const mid = polylineMidpoint([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(mid).toEqual({ x: 50, y: 0 });
  });

  it("returns a point ON the polyline for a bent L-shaped edge (not the bbox center)", () => {
    // L-shape: (0,0) → (0,200) → (100,200). BBox center is (50,100) which is
    // NOT on the polyline; the path-length midpoint (total 300, half 150)
    // lands on the first segment at (0,150).
    const mid = polylineMidpoint([{ x: 0, y: 0 }, { x: 0, y: 200 }, { x: 100, y: 200 }]);
    expect(mid).toEqual({ x: 0, y: 150 });
    // The point must lie on one of the polyline segments.
    const onSeg1 = mid.x === 0 && mid.y >= 0 && mid.y <= 200;
    const onSeg2 = mid.y === 200 && mid.x >= 0 && mid.x <= 100;
    expect(onSeg1 || onSeg2).toBe(true);
  });

  it("handles unequal segment lengths", () => {
    // (0,0) → (0,100) → (100,100): total length 200, midpoint at length 100 → (0,100).
    const mid = polylineMidpoint([{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }]);
    expect(mid).toEqual({ x: 0, y: 100 });
  });

  it("returns the node position for degenerate/empty input", () => {
    expect(polylineMidpoint([{ x: 5, y: 5 }])).toEqual({ x: 5, y: 5 });
    expect(polylineMidpoint([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toEqual({ x: 1, y: 1 });
    expect(polylineMidpoint([])).toEqual({ x: 0, y: 0 });
  });
});

describe("floorObjectCenter", () => {
  it("centers a room on its bounds center", () => {
    expect(floorObjectCenter("room", { x: 10, y: 20, w: 40, h: 30 })).toEqual({ x: 30, y: 35 });
  });

  it("centers stairs/elevator/ramp/furniture/window on their bounds center", () => {
    expect(floorObjectCenter("stairs", { x: 10, y: 20, width: 40, height: 30 })).toEqual({ x: 30, y: 35 });
    expect(floorObjectCenter("elevator", { x: 10, y: 20, width: 40, height: 30 })).toEqual({ x: 30, y: 35 });
    expect(floorObjectCenter("ramp", { x: 10, y: 20, width: 40, height: 30 })).toEqual({ x: 30, y: 35 });
    expect(floorObjectCenter("furniture", { x: 10, y: 20, width: 40, height: 30 })).toEqual({ x: 30, y: 35 });
    expect(floorObjectCenter("window", { x: 10, y: 20, width: 40, height: 30 })).toEqual({ x: 30, y: 35 });
  });

  it("treats doors and labels as point objects", () => {
    expect(floorObjectCenter("door", { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
    expect(floorObjectCenter("label", { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
  });
});
