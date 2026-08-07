import { describe, it, expect } from "vitest";
import { validateCampusData, computeBuildingOverlaps, type CampusValidationInput } from "../campusValidation";
import { getRotatedAABB } from "../../components/map-builder/constants";
import type { CampusBuilding } from "../../components/map-builder/types";

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

function issueTypes(errors: { type: string }[]): string[] {
  return errors.map((e) => e.type);
}

// ── validateCampusData ──────────────────────────────────────────────────────

describe("validateCampusData", () => {
  it("returns no issues for a valid campus", () => {
    expect(validateCampusData(campus())).toEqual([]);
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
