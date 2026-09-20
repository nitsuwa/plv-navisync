import { describe, expect, it } from "vitest";
import { applyLayoutAction, nudgeItems, selectionBounds, snapLayoutPosition, snapValue } from "../eventLayoutGeometry";

const items = [
  { id: "a", x: 10, y: 20, width: 20, height: 10, rotation: 15 },
  { id: "b", x: 60, y: 40, width: 30, height: 20 },
  { id: "c", x: 120, y: 60, width: 20, height: 10 },
];

describe("event layout geometry", () => {
  it("snaps values and nudges selected items within bounds", () => {
    expect(snapValue(27, 20)).toBe(20);
    expect(snapValue(31, 20)).toBe(40);
    expect(nudgeItems(items, ["a", "b"], 100, -100, { width: 150, height: 100 })).toEqual([
      { ...items[0], x: 70, y: 0 },
      { ...items[1], x: 120, y: 20 },
      items[2],
    ]);
  });

  it("snaps a moving item to nearby sibling edges and reports alignment guides", () => {
    const result = snapLayoutPosition({
      item: { id: "moving", x: 20, y: 20, width: 20, height: 10 },
      x: 78,
      y: 52,
      items: [
        { id: "moving", x: 20, y: 20, width: 20, height: 10 },
        { id: "target", x: 100, y: 50, width: 40, height: 20 },
      ],
      selectedIds: ["moving"],
      grid: 10,
      threshold: 6,
    });

    expect(result).toMatchObject({ x: 80, y: 50 });
    expect(result.guides).toEqual(expect.arrayContaining([
      { axis: "x", value: 100, kind: "edge", itemId: "target" },
      { axis: "y", value: 50, kind: "edge", itemId: "target" },
    ]));
  });

  it("chooses the closest snap target instead of the first candidate within range", () => {
    const result = snapLayoutPosition({
      item: { id: "moving", x: 20, y: 20, width: 20, height: 10 },
      x: 82,
      y: 20,
      items: [
        { id: "moving", x: 20, y: 20, width: 20, height: 10 },
        { id: "target", x: 100, y: 20, width: 40, height: 10 },
      ],
      selectedIds: ["moving"],
      grid: 0,
      threshold: 25,
      snapToGrid: false,
    });

    expect(result.x).toBe(80);
    expect(result.guides).toContainEqual({ axis: "x", value: 100, kind: "edge", itemId: "target" });
  });

  it("leaves distant positions unchanged and does not snap to selected siblings", () => {
    const result = snapLayoutPosition({
      item: { id: "moving", x: 20, y: 20, width: 20, height: 10 },
      x: 71,
      y: 73,
      items: [
        { id: "moving", x: 20, y: 20, width: 20, height: 10 },
        { id: "selected-peer", x: 70, y: 70, width: 20, height: 10 },
      ],
      selectedIds: ["moving", "selected-peer"],
      grid: 0,
      threshold: 4,
      snapToGrid: false,
    });

    expect(result).toEqual({ x: 71, y: 73, guides: [] });
  });

  it("aligns selected items without changing dimensions or unselected items", () => {
    const result = applyLayoutAction(items, ["a", "b"], "align-top");
    expect(result[0]).toMatchObject({ x: 10, y: 20, width: 20, height: 10, rotation: 15 });
    expect(result[1]).toMatchObject({ x: 60, y: 20, width: 30, height: 20 });
    expect(result[2]).toEqual(items[2]);
  });

  it("distributes three selected items with equal gaps", () => {
    const result = applyLayoutAction(items, ["a", "b", "c"], "distribute-horizontal");
    expect(result.map((item) => item.x)).toEqual([10, 60, 120]);
  });

  it("returns null for an empty selection and bounds selected items", () => {
    expect(selectionBounds(items, [])).toBeNull();
    expect(selectionBounds(items, ["a", "c"])).toEqual({ x: 10, y: 20, width: 130, height: 50 });
  });
});
