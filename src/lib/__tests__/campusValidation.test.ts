import { describe, it, expect } from "vitest";
import { validateCampusData, computeBuildingOverlaps, type CampusValidationInput } from "../campusValidation";
import { getRotatedAABB } from "../../components/map-builder/constants";
import type { CampusBuilding, ExteriorEmergencyStair, FloorRoom } from "../../components/map-builder/types";

// ── Fixtures ────────────────────────────────────────────────────────────────

function building(overrides: Partial<CampusBuilding> = {}): CampusBuilding {
  return {
    id: "b1",
    name: "Main Building",
    code: "MAB",
    category: "Academic",
    description: "",
    x: 10,
    y: 10,
    width: 100,
    height: 80,
    color: "#123456",
    entrances: [{ id: "ent1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general", isPrimary: true, accessible: false }],
    floors: [{ id: "f1", number: 1, label: "Ground Floor", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
    ...overrides,
  };
}

function campus(overrides: Partial<CampusValidationInput> = {}): CampusValidationInput {
  return {
    name: "PLV Main Campus",
    canvasW: 900,
    canvasH: 680,
    buildings: [building()],
    ...overrides,
  };
}

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

/** Building with one floor containing the given rooms. */
function buildingWithRooms(rooms: FloorRoom[], floorId = "f1"): CampusBuilding {
  return building({
    floors: [{
      id: floorId,
      number: 1,
      label: "Ground Floor",
      rooms,
      paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
    }],
  });
}

function issueTypes(errors: { type: string }[]): string[] {
  return errors.map((e) => e.type);
}

// ── validateCampusData ──────────────────────────────────────────────────────

describe("validateCampusData", () => {
  it("returns no issues for a valid campus", () => {
    expect(validateCampusData(campus())).toEqual([]);
  });

  it("can warn when Emergency mode is enabled without a designated exit", () => {
    const issues = validateCampusData(campus(), undefined, true);
    expect(issues.find((issue) => issue.type === "no_emergency_exit_configured")).toMatchObject({
      severity: "warning",
      buildingId: "b1",
    });
  });

  it("treats a ready Exterior Emergency Stair as dedicated emergency egress", () => {
    const exterior: ExteriorEmergencyStair = {
      id: "stair-1", buildingId: "b1", label: "legacy label", state: "open", width: 28, height: 42,
      attachment: { edge: "right", offset: 0.5 }, servedFloorIds: ["f1"], sharedId: "shared-1", emergencySafe: true,
    };
    const issues = validateCampusData(campus({ buildings: [building({ exteriorEmergencyStairs: [exterior] })] }), undefined, true);
    expect(issues.some((issue) => issue.type === "no_emergency_exit_configured")).toBe(false);
    expect(issues.some((issue) => issue.type === "exterior_emergency_stair_incomplete")).toBe(false);
  });

  it("reports an incomplete Exterior Emergency Stair without the generic missing-egress warning", () => {
    const exterior: ExteriorEmergencyStair = {
      id: "stair-1", buildingId: "b1", label: "legacy label", state: "open", width: 28, height: 42,
      attachment: { edge: "right", offset: 0.5 }, servedFloorIds: [], sharedId: "shared-1", emergencySafe: true,
    };
    const issues = validateCampusData(campus({ buildings: [building({ exteriorEmergencyStairs: [exterior] })] }), undefined, true);
    expect(issues.some((issue) => issue.type === "exterior_emergency_stair_incomplete")).toBe(true);
    expect(issues.some((issue) => issue.type === "no_emergency_exit_configured")).toBe(false);
  });

  it("flags duplicate room names within the same floor as warnings", () => {
    const errs = validateCampusData(campus({ buildings: [buildingWithRooms([
      room({ id: "r1", name: "Room 201" }),
      room({ id: "r2", name: "room 201" }),
    ])] }));
    const duplicates = errs.filter((e) => e.type === "duplicate_room_name");
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].severity).toBe("warning");
  });

  it("duplicate-name comparison is case-insensitive", () => {
    const errs = validateCampusData(campus({ buildings: [buildingWithRooms([
      room({ id: "r1", name: "Lecture Hall" }),
      room({ id: "r2", name: "LECTURE HALL" }),
    ])] }));
    expect(errs.some((e) => e.type === "duplicate_room_name")).toBe(true);
  });

  it("normalizes surrounding whitespace before comparing", () => {
    const errs = validateCampusData(campus({ buildings: [buildingWithRooms([
      room({ id: "r1", name: "  Room   201  " }),
      room({ id: "r2", name: "room 201" }),
    ])] }));
    expect(errs.some((e) => e.type === "duplicate_room_name")).toBe(true);
  });

  it("allows the same room name on different floors", () => {
    const errs = validateCampusData(campus({ buildings: [building({
      floors: [
        { id: "f1", number: 1, label: "Floor 1", rooms: [room({ id: "r1", name: "Room 201" })], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] },
        { id: "f2", number: 2, label: "Floor 2", rooms: [room({ id: "r2", name: "Room 201", floorId: "f2" })], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] },
      ],
    })] }));
    expect(errs.some((e) => e.type === "duplicate_room_name")).toBe(false);
  });

  it("emits one locatable issue per affected duplicate room with the correct target", () => {
    const errs = validateCampusData(campus({ buildings: [buildingWithRooms([
      room({ id: "r1", name: "Lobby" }),
      room({ id: "r2", name: "lobby" }),
      room({ id: "r3", name: "LOBBY" }),
    ])] }));
    const duplicates = errs.filter((e) => e.type === "duplicate_room_name");
    expect(duplicates.map((e) => e.roomId).sort()).toEqual(["r2", "r3"]);
    for (const issue of duplicates) {
      expect(issue.target).toEqual({
        scope: "floor",
        mode: "design",
        buildingId: "b1",
        floorId: "f1",
        selectionType: "room",
        id: issue.roomId,
      });
    }
  });

  it("renaming the duplicate removes the issue", () => {
    const withDuplicate = campus({ buildings: [buildingWithRooms([
      room({ id: "r1", name: "Room 201" }),
      room({ id: "r2", name: "Room 201" }),
    ])] });
    expect(validateCampusData(withDuplicate).some((e) => e.type === "duplicate_room_name")).toBe(true);

    const renamed = campus({ buildings: [buildingWithRooms([
      room({ id: "r1", name: "Room 201" }),
      room({ id: "r2", name: "Room 202" }),
    ])] });
    expect(validateCampusData(renamed).some((e) => e.type === "duplicate_room_name")).toBe(false);
  });

  it("ignores empty and whitespace-only room names", () => {
    const errs = validateCampusData(campus({ buildings: [buildingWithRooms([
      room({ id: "r1", name: "" }),
      room({ id: "r2", name: "   " }),
    ])] }));
    expect(errs.some((e) => e.type === "duplicate_room_name")).toBe(false);
  });

  it("flags a missing campus name", () => {
    expect(issueTypes(validateCampusData(campus({ name: "" })))).toContain("missing_campus_name");
    expect(issueTypes(validateCampusData(campus({ name: "   " })))).toContain("missing_campus_name");
  });

  it("flags buildings that still use placeholder names or codes", () => {
    const errs = validateCampusData(campus({ buildings: [building({ name: "New Building" })] }));
    expect(issueTypes(errs)).toContain("missing_name");
    const codeErrs = validateCampusData(campus({ buildings: [building({ code: "NEW" })] }));
    expect(issueTypes(codeErrs)).toContain("missing_code");
  });

  it("flags buildings that extend beyond the canvas boundary", () => {
    const outside = building({ x: 850, width: 100 }); // x + width = 950 > 900
    const errs = validateCampusData(campus({ buildings: [outside] }));
    expect(issueTypes(errs)).toContain("boundary");
  });

  it("detects boundary violations introduced by rotation", () => {
    // 100×80 box at x=880 rotated 45° extends past the 900 canvas edge
    const rotated = building({ x: 880, y: 10, width: 100, height: 80, rotation: 45 });
    const errs = validateCampusData(campus({ buildings: [rotated] }));
    expect(issueTypes(errs)).toContain("boundary");
  });

  it("flags buildings without floors", () => {
    const errs = validateCampusData(campus({ buildings: [building({ floors: [] })] }));
    expect(issueTypes(errs)).toContain("no_floors");
  });

  it("flags buildings without entrances", () => {
    const errs = validateCampusData(campus({ buildings: [building({ entrances: [] })] }));
    expect(issueTypes(errs)).toContain("no_building_entrance");
  });

  it("flags buildings with entrances but no primary entrance", () => {
    const errs = validateCampusData(campus({
      buildings: [building({
        entrances: [{ id: "ent1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general", accessible: false }],
      })],
    }));
    expect(issueTypes(errs)).toContain("no_primary_entrance");
  });

  it("does not treat Service or Emergency Exit as a primary entrance", () => {
    const errs = validateCampusData(campus({
      buildings: [building({
        entrances: [
          { id: "ent1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "service", isPrimary: true },
          { id: "ent2", buildingId: "b1", edge: "top", offset: 0.5, type: "emergency_exit", isPrimary: true },
        ],
      })],
    }));
    expect(issueTypes(errs)).toContain("no_primary_entrance");
    expect(errs.find((e) => e.type === "no_primary_entrance")?.message).toContain("has no primary entrance");
  });

  it("flags corrupted buildings with multiple primary entrances", () => {
    const errs = validateCampusData(campus({
      buildings: [building({
        entrances: [
          { id: "ent1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general", isPrimary: true },
          { id: "ent2", buildingId: "b1", edge: "top", offset: 0.5, type: "general", isPrimary: true },
        ],
      })],
    }));
    expect(issueTypes(errs)).toContain("multiple_primary_entrances");
  });

  it("reports an issue per building and never duplicates an issue type per building", () => {
    const errs = validateCampusData(
      campus({
        buildings: [
          building({ id: "b1" }),
          building({ id: "b2", x: 900, width: 100 }), // out of bounds
          building({ id: "b3", x: 900, width: 100 }), // out of bounds again
        ],
      })
    );
    const boundary = errs.filter((e) => e.type === "boundary");
    expect(boundary.map((e) => e.buildingId).sort()).toEqual(["b2", "b3"]);
  });

  it("flags overlapping buildings (derived from geometry when no set is passed)", () => {
    const a = building({ id: "a" });
    const b = building({ id: "b", x: 50, y: 50 }); // overlaps a (a: 10..110 x 10..90)
    const errs = validateCampusData(campus({ buildings: [a, b] }));
    const overlaps = errs.filter((e) => e.type === "overlap");
    expect(overlaps.map((e) => e.buildingId).sort()).toEqual(["a", "b"]);
  });

  it("uses the passed-in overlap set when provided (editor live state)", () => {
    const errs = validateCampusData(campus({ buildings: [building()] }), new Set(["b1"]));
    expect(issueTypes(errs)).toContain("overlap");
  });

  it("does not flag non-overlapping buildings", () => {
    const a = building({ id: "a" });
    const b = building({ id: "b", x: 200, y: 200 });
    expect(validateCampusData(campus({ buildings: [a, b] }))).toEqual([]);
  });
});

// ── computeBuildingOverlaps ─────────────────────────────────────────────────

describe("computeBuildingOverlaps", () => {
  it("marks both buildings in an overlap pair", () => {
    const a = building({ id: "a" });
    const b = building({ id: "b", x: 50, y: 50 });
    expect([...computeBuildingOverlaps([a, b])].sort()).toEqual(["a", "b"]);
  });

  it("detects overlaps between rotated buildings via rotated AABB", () => {
    const a = building({ id: "a" });
    const b = building({ id: "b", x: 80, y: 60, rotation: 45 }); // rotated near the corner of a
    const overlaps = computeBuildingOverlaps([a, b]);
    expect(overlaps.size).toBe(2);
  });

  it("returns an empty set for disjoint buildings", () => {
    const a = building({ id: "a" });
    const b = building({ id: "b", x: 300, y: 300 });
    expect(computeBuildingOverlaps([a, b]).size).toBe(0);
  });
});

// ── getRotatedAABB (map-builder constants transform) ────────────────────────

describe("getRotatedAABB", () => {
  it("returns the original box for zero rotation", () => {
    expect(getRotatedAABB(10, 20, 100, 50, 0)).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it("swaps width and height at 90°", () => {
    const box = getRotatedAABB(0, 0, 100, 50, 90);
    expect(box.width).toBeCloseTo(50, 5);
    expect(box.height).toBeCloseTo(100, 5);
  });

  it("grows the bounding box for diagonal rotation", () => {
    const box = getRotatedAABB(0, 0, 100, 100, 45);
    expect(box.width).toBeCloseTo(Math.sqrt(100 ** 2 * 2), 5);
    expect(box.height).toBeCloseTo(Math.sqrt(100 ** 2 * 2), 5);
  });

  it("normalizes negative rotations the same as positive", () => {
    const neg = getRotatedAABB(0, 0, 100, 50, -90);
    const pos = getRotatedAABB(0, 0, 100, 50, 90);
    expect(neg.width).toBeCloseTo(pos.width, 5);
    expect(neg.height).toBeCloseTo(pos.height, 5);
  });
});
