import { describe, expect, it } from "vitest";
import {
  defaultStairDirectionForFloor,
  defaultStairDirectionForFloorInOrder,
  nextFloorNumberForBuilding,
  stairDirectionsForFloor,
  stairDirectionsForFloorInOrder,
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
});
