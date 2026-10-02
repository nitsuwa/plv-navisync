import { describe, expect, it } from "vitest";
import { eventPlacementGuides } from "../eventPlacementGuides";

describe("event placement guides", () => {
  it("finds nearest aligned edges without changing the selected asset", () => {
    const selected = { id: "chair", x: 11, y: 20, width: 10, height: 10 };
    const result = eventPlacementGuides(selected, [{ id: "table", x: 10, y: 50, width: 30, height: 10 }], 2);
    expect(result.alignments).toEqual([{ axis: "x", value: 10, from: 20, to: 60, kind: "edge", itemId: "table", delta: -1 }]);
    expect(result.gaps).toEqual([{ axis: "y", from: 30, to: 50, cross: 16, distance: 20, itemId: "table" }]);
    expect(selected.x).toBe(11);
  });

  it("uses the nearest candidate and ignores the selected item and distant alignments", () => {
    const selected = { id: "a", x: 20, y: 20, width: 10, height: 10 };
    const result = eventPlacementGuides(selected, [selected, { id: "b", x: 22, y: 100, width: 10, height: 10 }, { id: "c", x: 21, y: 60, width: 10, height: 10 }], 2);
    expect(result.alignments).toHaveLength(1);
    expect(result.alignments[0]).toMatchObject({ axis: "x", itemId: "c", delta: 1 });
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({ axis: "y", itemId: "c", distance: 30 });
  });

  it("measures rotated footprints and avoids reporting gaps for overlap or diagonal items", () => {
    const result = eventPlacementGuides({ id: "a", x: 0, y: 0, width: 20, height: 10, rotation: 90 }, [{ id: "b", x: 5, y: 25, width: 10, height: 10 }, { id: "overlap", x: 7, y: 8, width: 2, height: 2 }, { id: "diagonal", x: 40, y: 40, width: 10, height: 10 }], 0);
    expect(result.gaps).toEqual([{ axis: "y", from: 15, to: 25, cross: 10, distance: 10, itemId: "b" }]);
  });
});
