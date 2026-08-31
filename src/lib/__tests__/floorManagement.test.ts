import { describe, expect, it } from "vitest";
import {
  defaultStairDirectionForFloor,
  defaultStairDirectionForFloorInOrder,
  nextFloorNumberForBuilding,
  stairDirectionsForFloor,
  stairDirectionsForFloorInOrder,
  stairContinuationDirectionAllows,
  validateStairContinuation,
  reconcileStairDirectionsForFloorOrder,
  stairLabelForEntrySide,
  isDefaultStairLabel,
} from "../floorManagement";

// ── B5 Phase 3.1 — floor-number uniqueness + stair direction context ────────

describe("nextFloorNumberForBuilding", () => {
  it("returns 1 for an empty building", () => {
    expect(nextFloorNumberForBuilding([])).toBe(1);
  });

  it("uses max existing number + 1 (never array length + 1)", () => {
    expect(nextFloorNumberForBuilding([{ number: 1 }, { number: 2 }])).toBe(3);
  });

  it("handles non-contiguous numbers — [1, 3] produces 4, not 3", () => {
    expect(nextFloorNumberForBuilding([{ number: 1 }, { number: 3 }])).toBe(4);
  });

  it("never duplicates a persisted building+floor number", () => {
    // Existing [1, 3] with a duplicate-prone length+1 would produce 3 — the
    // helper must always stay clear of every persisted number.
    expect(nextFloorNumberForBuilding([{ number: 1 }, { number: 3 }])).not.toBe(3);
    expect(nextFloorNumberForBuilding([{ number: 5 }])).toBe(6);
  });

  it("ignores non-finite numbers", () => {
    expect(nextFloorNumberForBuilding([{ number: 2 }, { number: Number.NaN } as never])).toBe(3);
  });
});

describe("stairDirectionsForFloor", () => {
  it("lowest floor allows only Up when a higher floor exists", () => {
    expect(stairDirectionsForFloor(1, [1, 2, 3])).toEqual(["up"]);
  });

  it("highest floor allows only Down when a lower floor exists", () => {
    expect(stairDirectionsForFloor(3, [1, 2, 3])).toEqual(["down"]);
  });

  it("middle floor allows Up, Down and Both", () => {
    expect(stairDirectionsForFloor(2, [1, 2, 3])).toEqual(["up", "down", "both"]);
  });

  it("single-floor building offers no cross-floor direction", () => {
    expect(stairDirectionsForFloor(1, [1])).toEqual([]);
  });
});

describe("defaultStairDirectionForFloor", () => {
  it("lowest floor defaults to Up", () => {
    expect(defaultStairDirectionForFloor(1, [1, 2])).toBe("up");
  });

  it("highest floor defaults to Down", () => {
    expect(defaultStairDirectionForFloor(2, [1, 2])).toBe("down");
  });

  it("middle floor defaults to Both", () => {
    expect(defaultStairDirectionForFloor(2, [1, 2, 3])).toBe("both");
  });

  it("single-floor building stays neutral (no cross-floor implication)", () => {
    expect(defaultStairDirectionForFloor(1, [1])).toBe("both");
  });
});

describe("canonical floor-order stair helpers", () => {
  const misleadingOrder = [
    { id: "f4", number: 4, label: "Floor 4" },
    { id: "f1", number: 1, label: "Ground Floor" },
    { id: "f2", number: 2, label: "Floor 2" },
  ];

  it("uses array order, not floor number/name, for lowest/middle/highest", () => {
    expect(stairDirectionsForFloorInOrder("f4", misleadingOrder)).toEqual(["up"]);
    expect(stairDirectionsForFloorInOrder("f1", misleadingOrder)).toEqual(["up", "down", "both"]);
    expect(stairDirectionsForFloorInOrder("f2", misleadingOrder)).toEqual(["down"]);
  });

  it("defaults by canonical order after reorder", () => {
    expect(defaultStairDirectionForFloorInOrder("f4", misleadingOrder)).toBe("up");
    expect(defaultStairDirectionForFloorInOrder("f1", misleadingOrder)).toBe("both");
    expect(defaultStairDirectionForFloorInOrder("f2", misleadingOrder)).toBe("down");
  });

  it("filters Stair continuations by ordered floor direction", () => {
    expect(stairContinuationDirectionAllows("up", 0, 1)).toBe(true);
    expect(stairContinuationDirectionAllows("up", 1, 0)).toBe(false);
    expect(stairContinuationDirectionAllows("down", 1, 0)).toBe(true);
    expect(stairContinuationDirectionAllows("down", 0, 1)).toBe(false);
    expect(stairContinuationDirectionAllows("both", 1, 0)).toBe(true);
    expect(stairContinuationDirectionAllows("both", 1, 2)).toBe(true);
  });

  const stairFloor = (id: string, stair: { id: string; sharedId?: string; direction: "up" | "down" | "both" }) => ({
    id,
    stairs: [{ ...stair, x: 0, y: 0, width: 20, height: 20, label: stair.id }],
  } as any);

  it("reports a direction mismatch when Up points to a lower continuation", () => {
    const floors = [stairFloor("f1", { id: "s1", sharedId: "core", direction: "both" }), stairFloor("f2", { id: "s2", sharedId: "core", direction: "up" })];
    expect(validateStairContinuation(floors[1].stairs[0], "f2", floors).state).toBe("direction-mismatch");
  });

  it("reports a direction mismatch when Down points to a higher continuation", () => {
    const floors = [stairFloor("f1", { id: "s1", sharedId: "core", direction: "down" }), stairFloor("f2", { id: "s2", sharedId: "core", direction: "both" })];
    expect(validateStairContinuation(floors[0].stairs[0], "f1", floors).state).toBe("direction-mismatch");
  });

  it("does not warn when the selected direction has a valid adjacent continuation", () => {
    const floors = [
      stairFloor("f1", { id: "s1", sharedId: "core", direction: "both" }),
      stairFloor("f2", { id: "s2", sharedId: "core", direction: "up" }),
      stairFloor("f3", { id: "s3", sharedId: "core", direction: "down" }),
    ];
    // The lower occurrence is outside the selected Up direction, but Floor 3
    // is a valid adjacent continuation and therefore satisfies this Stair.
    expect(validateStairContinuation(floors[1].stairs[0], "f2", floors).state).toBe("none");
  });

  it("ignores non-adjacent identity occurrences when checking continuation readiness", () => {
    const floors = [
      stairFloor("f1", { id: "s1", sharedId: "core", direction: "up" }),
      stairFloor("f2", { id: "s2", sharedId: "other", direction: "both" }),
      stairFloor("f3", { id: "s3", sharedId: "core", direction: "down" }),
    ];
    expect(validateStairContinuation(floors[0].stairs[0], "f1", floors).state).toBe("none");
  });

  it("reports a missing continuation when a shared Stair has no valid transition", () => {
    const floors = [stairFloor("f1", { id: "s1", sharedId: "core", direction: "up" }), stairFloor("f2", { id: "s2", sharedId: "core", direction: "down" })];
    const nodes = [{ id: "n1", floorId: "f1", stairId: "s1" }, { id: "n2", floorId: "f2", stairId: "s2" }];
    const result = validateStairContinuation(floors[0].stairs[0], "f1", floors, nodes, []);
    expect(result.state).toBe("missing");
    expect(result.unavailableFloorIds).toEqual(["f2"]);
  });

  it("clears the direction warning once the continuation direction is valid", () => {
    const floors = [stairFloor("f1", { id: "s1", sharedId: "core", direction: "up" }), stairFloor("f2", { id: "s2", sharedId: "core", direction: "down" })];
    const nodes = [{ id: "n1", floorId: "f1", stairId: "s1" }, { id: "n2", floorId: "f2", stairId: "s2" }];
    const edges = [{ startNodeId: "n1", endNodeId: "n2", type: "floor_transition", bidirectional: true, closed: false }];
    const result = validateStairContinuation(floors[0].stairs[0], "f1", floors, nodes, edges);
    expect(result.state).toBe("none");
  });

  it("recognizes legacy cross_floor edges when checking a connected continuation", () => {
    const floors = [stairFloor("f1", { id: "s1", sharedId: "core", direction: "up" }), stairFloor("f2", { id: "s2", sharedId: "core", direction: "down" })];
    const nodes = [{ id: "n1", floorId: "f1", stairId: "s1" }, { id: "n2", floorId: "f2", stairId: "s2" }];
    const edges = [{ startNodeId: "n1", endNodeId: "n2", type: "cross_floor", bidirectional: true, closed: false }];
    expect(validateStairContinuation(floors[0].stairs[0], "f1", floors, nodes, edges).state).toBe("none");
  });

  it("leaves a missing local anchor to the existing Navigation connectivity issue", () => {
    const floors = [stairFloor("f1", { id: "s1", sharedId: "core", direction: "up" }), stairFloor("f2", { id: "s2", sharedId: "core", direction: "down" })];
    expect(validateStairContinuation(floors[0].stairs[0], "f1", floors, [], []).state).toBe("none");
  });
});

describe("generated Stair labels", () => {
  it("uses the opposite physical side name for the corridor entry side", () => {
    expect(stairLabelForEntrySide(false)).toBe("Right Stair");
    expect(stairLabelForEntrySide(true)).toBe("Left Stair");
  });

  it("recognizes only system/default labels as renameable", () => {
    expect(isDefaultStairLabel("Stairs")).toBe(true);
    expect(isDefaultStairLabel("Left Stair")).toBe(true);
    expect(isDefaultStairLabel(" right stair ")).toBe(true);
    expect(isDefaultStairLabel("West Stair")).toBe(false);
    expect(isDefaultStairLabel("Emergency Stair")).toBe(false);
  });
});

describe("reconcileStairDirectionsForFloorOrder", () => {
  const floor = (id: string, direction: "up" | "down" | "both") => ({
    id,
    buildingId: "b1",
    number: 1,
    label: id,
    canvasW: 100,
    canvasH: 100,
    rooms: [], walls: [], doors: [], windows: [], furniture: [],
    stairs: [{ id: `st-${id}`, x: 10, y: 10, width: 20, height: 20, direction, label: "Stair" }],
    ramps: [], elevators: [], labels: [], paths: [],
  } as any);

  it("repairs an impossible boundary direction and reports the adjustment", () => {
    const result = reconcileStairDirectionsForFloorOrder([
      floor("f1", "down"),
      floor("f2", "down"),
    ]);
    expect(result.floors[0].stairs[0].direction).toBe("up");
    expect(result.adjustments).toMatchObject([{ floorId: "f1", from: "down", to: "up" }]);
  });

  it("preserves an intentional middle-floor direction", () => {
    const result = reconcileStairDirectionsForFloorOrder([
      floor("f1", "up"),
      floor("f2", "down"),
      floor("f3", "down"),
    ]);
    expect(result.floors[1].stairs[0].direction).toBe("down");
    expect(result.adjustments).toHaveLength(0);
  });

  it("normalizes a single-floor direction to the neutral Both value", () => {
    const result = reconcileStairDirectionsForFloorOrder([floor("f1", "up")]);
    expect(result.floors[0].stairs[0].direction).toBe("both");
    expect(result.adjustments).toMatchObject([{ floorId: "f1", from: "up", to: "both" }]);
  });
});
