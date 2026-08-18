import { describe, it, expect } from "vitest";
import {
  computeLiveValidationIssues,
  validationIssuesForFloor,
  validationIssuesForBuilding,
  mergeFloorIssueLists,
  validationIssueToFloorIssue,
} from "../liveValidation";
import type { Campus, CampusBuilding, FloorRoom, FloorPlan } from "../../components/map-builder/types";
import type { ValidationIssue } from "../../components/map-builder/ValidationErrorsDialog";
import type { FloorIssue } from "../floorGeometry";

// ── Fixtures ────────────────────────────────────────────────────────────────

function room(overrides: Partial<FloorRoom> & { id: string; name: string }): FloorRoom {
  return {
    type: "classroom",
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    floorId: "f1",
    buildingId: "b1",
    ...overrides,
  };
}

function floor(overrides: Partial<FloorPlan> & { id: string; number: number; label: string; rooms?: FloorRoom[] }): FloorPlan {
  return {
    id: overrides.id,
    buildingId: "b1",
    number: overrides.number,
    label: overrides.label,
    rooms: overrides.rooms ?? [],
    paths: [],
    walls: [],
    doors: [],
    windows: [],
    furniture: [],
    stairs: [],
    ramps: [],
    elevators: [],
    labels: [],
    ...overrides,
  };
}

function building(overrides: Partial<CampusBuilding> & { floors: FloorPlan[] }): CampusBuilding {
  return {
    id: "b1",
    name: "Building One",
    code: "B1",
    category: "Academic",
    description: "",
    x: 100,
    y: 100,
    width: 120,
    height: 80,
    color: "#1e40af",
    expanded: false,
    entrances: [{ id: "e1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general", isPrimary: true }],
    ...overrides,
  };
}

function campus(overrides: Partial<Campus> = {}): Campus {
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
    buildings: [building({
      floors: [floor({ id: "f1", number: 1, label: "Ground Floor" })],
    })],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

describe("computeLiveValidationIssues (B7 Phase 1 shared canonical list)", () => {
  it("flags duplicate room names as ONE locatable warning per affected room", () => {
    const c = campus({
      buildings: [building({
        floors: [floor({
          id: "f1", number: 1, label: "Ground Floor",
          rooms: [
            room({ id: "r1", name: "Room 201" }),
            room({ id: "r2", name: "room 201" }),
          ],
        })],
      })],
    });
    const issues = computeLiveValidationIssues(c);
    const dup = issues.filter((i) => i.type === "duplicate_room_name");
    expect(dup).toHaveLength(1);
    expect(dup[0].severity).toBe("warning");
    expect(dup[0].roomId).toBe("r2");
  });

  it("allows the same room name on different floors", () => {
    const c = campus({
      buildings: [building({
        floors: [
          floor({ id: "f1", number: 1, label: "Floor 1", rooms: [room({ id: "r1", name: "Room 201" })] }),
          floor({ id: "f2", number: 2, label: "Floor 2", rooms: [room({ id: "r2", name: "Room 201", floorId: "f2" })] }),
        ],
      })],
    });
    expect(computeLiveValidationIssues(c).some((i) => i.type === "duplicate_room_name")).toBe(false);
  });

  it("deduplicates repeated validation runs", () => {
    const c = campus({
      buildings: [building({
        floors: [floor({
          id: "f1", number: 1, label: "Ground Floor",
          rooms: [room({ id: "r1", name: "Lobby" }), room({ id: "r2", name: "lobby" }), room({ id: "r3", name: "LOBBY" })],
        })],
      })],
    });
    const issues = computeLiveValidationIssues(c);
    expect(issues.filter((i) => i.type === "duplicate_room_name")).toHaveLength(2);
  });
});

describe("validationIssuesForFloor (B7 Phase 1 floor filtering)", () => {
  it("shows the duplicate-room issue for the CURRENT floor only", () => {
    const c = campus({
      buildings: [building({
        floors: [
          floor({ id: "f1", number: 1, label: "Floor 1", rooms: [room({ id: "r1", name: "Room 201" }), room({ id: "r2", name: "room 201" })] }),
          floor({ id: "f2", number: 2, label: "Floor 2", rooms: [room({ id: "r3", name: "Room 202", floorId: "f2" })] }),
        ],
      })],
    });
    const f1 = validationIssuesForFloor(c, "f1");
    const f2 = validationIssuesForFloor(c, "f2");
    expect(f1.some((i) => i.type === "duplicate_room_name")).toBe(true);
    // An issue that belongs to floor 1 must NOT leak into floor 2's list.
    expect(f2.some((i) => i.type === "duplicate_room_name")).toBe(false);
  });

  it("excludes campus-scope issues (building-level warnings) from a floor list", () => {
    const c = campus({
      name: "", // missing campus name is campus-scope
      buildings: [building({
        name: "", // missing_name is campus-scope (targets the building)
        floors: [floor({ id: "f1", number: 1, label: "Ground Floor" })],
      })],
    });
    const issues = validationIssuesForFloor(c, "f1");
    expect(issues.some((i) => i.type === "missing_campus_name")).toBe(false);
    expect(issues.some((i) => i.type === "missing_name")).toBe(false);
  });

  it("fixing the duplicate removes it from the canonical list AND the floor list", () => {
    const withDuplicate = campus({
      buildings: [building({
        floors: [floor({
          id: "f1", number: 1, label: "Ground Floor",
          rooms: [room({ id: "r1", name: "Room 201" }), room({ id: "r2", name: "Room 201" })],
        })],
      })],
    });
    expect(validationIssuesForFloor(withDuplicate, "f1").some((i) => i.type === "duplicate_room_name")).toBe(true);

    const renamed = campus({
      buildings: [building({
        floors: [floor({
          id: "f1", number: 1, label: "Ground Floor",
          rooms: [room({ id: "r1", name: "Room 201" }), room({ id: "r2", name: "Room 202" })],
        })],
      })],
    });
    expect(validationIssuesForFloor(renamed, "f1").some((i) => i.type === "duplicate_room_name")).toBe(false);
    expect(computeLiveValidationIssues(renamed).some((i) => i.type === "duplicate_room_name")).toBe(false);
  });

describe("validationIssuesForBuilding (Issue 1 — building surfaces its floor issues)", () => {
  it("aggregates the building's own issue AND descendant floor issues", () => {
    const c = campus({
      buildings: [building({
        id: "b1",
        name: "", // building-level missing_name warning
        floors: [
          floor({
            id: "f1", number: 1, label: "Ground Floor",
            rooms: [room({ id: "r1", name: "Lab A" }), room({ id: "r2", name: "lab a" })], // duplicate_room_name
          }),
          floor({ id: "f2", number: 2, label: "Floor 2" }),
        ],
      })],
    });
    const issues = validationIssuesForBuilding(computeLiveValidationIssues(c), "b1");
    // Building-level issue present.
    expect(issues.some((i) => i.type === "missing_name" && i.buildingId === "b1")).toBe(true);
    // Descendant floor issue present (floor-scoped, buildingId = b1).
    expect(issues.some((i) => i.type === "duplicate_room_name")).toBe(true);
    const floorIssue = issues.find((i) => i.type === "duplicate_room_name")!;
    expect(floorIssue.floorId).toBe("f1");
  });

  it("issue retains floor identity and severity", () => {
    const c = campus({
      buildings: [building({
        floors: [floor({
          id: "f1", number: 1, label: "Ground Floor",
          rooms: [room({ id: "r1", name: "Room X" }), room({ id: "r2", name: "Room X" })],
        })],
      })],
    });
    const issues = validationIssuesForBuilding(computeLiveValidationIssues(c), "b1");
    const dup = issues.find((i) => i.type === "duplicate_room_name");
    expect(dup).toBeDefined();
    expect(dup!.severity).toBe("warning");
    expect(dup!.floorId).toBe("f1");
    const target = dup!.target ?? { scope: "floor" as const };
    expect(target.scope).toBe("floor");
    expect(target.buildingId).toBe("b1");
    expect(target.floorId).toBe("f1");
  });

  it("excludes issues from OTHER buildings' floors", () => {
    const c = campus({
      buildings: [
        building({
          id: "b1",
          floors: [floor({ id: "f1", number: 1, label: "Floor 1", rooms: [room({ id: "r1", name: "Dup" }), room({ id: "r2", name: "dup" })] })],
        }),
        building({
          id: "b2",
          x: 300,
          floors: [floor({ id: "f2", number: 1, label: "Floor 1", rooms: [room({ id: "r3", name: "Unique", floorId: "f2" })] })],
        }),
      ],
    });
    const b1Issues = validationIssuesForBuilding(computeLiveValidationIssues(c), "b1");
    expect(b1Issues.some((i) => i.type === "duplicate_room_name")).toBe(true);
    // b2's floor issues must NOT leak into b1's list.
    expect(b1Issues.some((i) => i.buildingId === "b2" || i.floorId === "f2")).toBe(false);
  });

  it("no duplicate issue when the building-level issue is already represented", () => {
    const c = campus({
      buildings: [building({ id: "b1", name: "", floors: [floor({ id: "f1", number: 1, label: "Ground Floor" })] })],
    });
    const issues = validationIssuesForBuilding(computeLiveValidationIssues(c), "b1");
    // missing_name must appear exactly once.
    expect(issues.filter((i) => i.type === "missing_name").length).toBe(1);
  });

  it("issue clears automatically when the underlying floor problem is fixed", () => {
    const withDup = campus({
      buildings: [building({
        floors: [floor({
          id: "f1", number: 1, label: "Ground Floor",
          rooms: [room({ id: "r1", name: "Lab" }), room({ id: "r2", name: "Lab" })],
        })],
      })],
    });
    expect(validationIssuesForBuilding(computeLiveValidationIssues(withDup), "b1").some((i) => i.type === "duplicate_room_name")).toBe(true);
    const fixed = campus({
      buildings: [building({
        floors: [floor({
          id: "f1", number: 1, label: "Ground Floor",
          rooms: [room({ id: "r1", name: "Lab" }), room({ id: "r2", name: "Office" })],
        })],
      })],
    });
    expect(validationIssuesForBuilding(computeLiveValidationIssues(fixed), "b1").some((i) => i.type === "duplicate_room_name")).toBe(false);
  });
});

  it("emergency_exit_no_nav is floor-scoped and locatable to the door", () => {
    const c = campus({
      buildings: [building({
        floors: [floor({
          id: "f1", number: 1, label: "Ground Floor",
          doors: [{ id: "d1", x: 10, y: 10, width: 8, direction: "left", color: "#000", isEmergencyExit: true }],
        })],
      })],
      navNodes: [],
      navEdges: [],
    });
    const issues = validationIssuesForFloor(c, "f1");
    const issue = issues.find((i) => i.type === "emergency_exit_no_nav")!;
    expect(issue).toBeTruthy();
    expect(issue.target).toEqual({
      scope: "floor",
      mode: "design",
      buildingId: "b1",
      floorId: "f1",
      selectionType: "door",
      id: "d1",
    });
  });
});

describe("mergeFloorIssueLists (B7 Phase 1 floor panel composition)", () => {
  const local: FloorIssue[] = [
    { id: "room-r1-bounds", severity: "error", message: "Room is outside the floor canvas.", selection: { type: "room", id: "r1" } },
  ];
  const campusIssue: ValidationIssue = {
    type: "emergency_exit_no_nav",
    severity: "warning",
    message: "Emergency exit door \"d1\" has no navigation waypoint.",
    buildingId: "b1",
    floorId: "f1",
    target: { scope: "floor", mode: "design", buildingId: "b1", floorId: "f1", selectionType: "door", id: "d1" },
  };

  it("keeps local issues first and appends canonical floor rows", () => {
    const merged = mergeFloorIssueLists(local, [campusIssue]);
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe("room-r1-bounds");
    expect(merged[1].severity).toBe("warning");
    expect(merged[1].selection).toEqual({ type: "door", id: "d1" });
    expect(merged[1].message).toContain("d1");
  });

  it("drops canonical nav_edge_blocked_by_obstacle rows already tracked locally", () => {
    const blockedEdgeIssue: ValidationIssue = {
      type: "nav_edge_blocked_by_obstacle",
      severity: "warning",
      message: "Navigation connection intersects a blocking obstacle.",
      edgeId: "edge-1",
      target: { scope: "floor", mode: "navigation", buildingId: "b1", floorId: "f1", selectionType: "navEdge", id: "edge-1" },
    };
    const merged = mergeFloorIssueLists(local, [blockedEdgeIssue], new Set(["edge-1"]));
    expect(merged.some((i) => i.selection?.type === "navEdge")).toBe(false);
  });

  it("converts a canonical issue to a clickable FloorIssue row", () => {
    const row = validationIssueToFloorIssue(campusIssue);
    expect(row).not.toBeNull();
    expect(row!.selection).toEqual({ type: "door", id: "d1" });
    expect(row!.id).toContain("emergency_exit_no_nav");
  });
});
