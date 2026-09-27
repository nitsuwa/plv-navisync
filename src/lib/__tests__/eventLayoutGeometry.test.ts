import { describe, expect, it } from "vitest";
import { applyLayoutAction, nudgeItems, resolveLayoutMoveFromSnapshot, selectionBounds, snapLayoutPosition, snapValue } from "../eventLayoutGeometry";

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

  it("breaks equal-distance sibling ties by stable item ID regardless of array order", () => {
    const moving = { id: "moving", x: 120, y: 20, width: 20, height: 10 };
    const lowerId = { id: "a-target", x: 140, y: 100, width: 40, height: 10 };
    const higherId = { id: "z-target", x: 100, y: 100, width: 40, height: 10 };

    const forward = snapLayoutPosition({
      item: moving,
      x: 120,
      y: 20,
      items: [moving, higherId, lowerId],
      selectedIds: [moving.id],
      grid: 0,
      threshold: 0,
      snapToGrid: false,
    });
    const reversed = snapLayoutPosition({
      item: moving,
      x: 120,
      y: 20,
      items: [moving, lowerId, higherId],
      selectedIds: [moving.id],
      grid: 0,
      threshold: 0,
      snapToGrid: false,
    });

    expect(forward).toEqual(reversed);
    expect(forward.guides).toContainEqual({ axis: "x", value: 140, kind: "edge", itemId: "a-target" });
  });

  it("prefers a sibling tie over an equally close grid candidate", () => {
    const moving = { id: "moving", x: 20, y: 20, width: 20, height: 10 };
    const sibling = { id: "sibling", x: 100, y: 100, width: 40, height: 10 };
    const result = snapLayoutPosition({
      item: moving,
      x: 105,
      y: 20,
      items: [moving, sibling],
      selectedIds: [moving.id],
      grid: 10,
      threshold: 5,
      snapToGrid: true,
    });

    expect(result.x).toBe(100);
    expect(result.guides).toContainEqual({ axis: "x", value: 100, kind: "edge", itemId: "sibling" });
  });

  it("chooses a closer grid target over a farther sibling candidate", () => {
    const moving = { id: "moving", x: 20, y: 20, width: 10, height: 10 };
    const sibling = { id: "sibling", x: 96, y: 100, width: 10, height: 10 };
    const result = snapLayoutPosition({
      item: moving,
      x: 99,
      y: 20,
      items: [moving, sibling],
      selectedIds: [moving.id],
      grid: 10,
      threshold: 6,
      snapToGrid: true,
    });

    expect(result.x).toBe(100);
    expect(result.guides).toContainEqual({ axis: "x", value: 100, kind: "grid" });
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

  it("does not attract to grid or sibling edges when snapping is disabled", () => {
    const result = resolveLayoutMoveFromSnapshot({
      anchor: { id: "moving", x: 24, y: 20, width: 20, height: 10 },
      movingItems: [{ id: "moving", x: 24, y: 20, width: 20, height: 10 }],
      furnitureItems: [
        { id: "moving", x: 24, y: 20, width: 20, height: 10 },
        { id: "target", x: 100, y: 20, width: 40, height: 10 },
      ],
      selectedIds: ["moving"],
      startPointer: { x: 24, y: 20 },
      bounds: { width: 300, height: 200 },
      grid: 20,
      threshold: 6,
      snapToGrid: true,
      snapEnabled: false,
    }, { x: 98, y: 20 });

    expect(result.anchor).toEqual({ x: 98, y: 20 });
    expect(result.guides).toEqual([]);
  });

  it("resolves every drag frame from immutable start geometry", () => {
    const moving = { id: "moving", x: 20, y: 20, width: 20, height: 10 };
    const snapshot = {
      anchor: moving,
      movingItems: [moving],
      furnitureItems: [moving, { id: "target", x: 100, y: 20, width: 40, height: 20 }],
      selectedIds: ["moving"],
      startPointer: { x: 30, y: 30 },
      bounds: { width: 150, height: 100 },
      grid: 10,
      threshold: 6,
      snapToGrid: true,
    };

    const first = resolveLayoutMoveFromSnapshot(snapshot, { x: 88, y: 32 });
    const second = resolveLayoutMoveFromSnapshot(snapshot, { x: 89, y: 32 });

    expect(first.anchor).toEqual({ x: 80, y: 20 });
    expect(second.anchor).toEqual({ x: 80, y: 20 });
    expect(second.delta).toEqual({ x: 60, y: 0 });
  });

  it("constrains a snapshot drag using the complete moving selection", () => {
    const anchor = { id: "a", x: 20, y: 20, width: 20, height: 10 };
    const peer = { id: "b", x: 60, y: 40, width: 30, height: 20 };
    const result = resolveLayoutMoveFromSnapshot({
      anchor,
      movingItems: [anchor, peer],
      furnitureItems: [anchor, peer],
      selectedIds: ["a", "b"],
      startPointer: { x: 20, y: 20 },
      bounds: { width: 100, height: 80 },
      grid: 0,
      threshold: 0,
      snapToGrid: false,
    }, { x: 500, y: 500 });

    expect(result.delta).toEqual({ x: 10, y: 20 });
    expect(result.anchor).toEqual({ x: 30, y: 40 });
  });

  it("preserves a pre-existing out-of-bounds origin until the pointer moves it inward", () => {
    const item = { id: "legacy", x: -12, y: 20, width: 20, height: 20 };
    const snapshot = {
      anchor: item,
      movingItems: [item],
      furnitureItems: [item],
      selectedIds: [item.id],
      startPointer: { x: 0, y: 20 },
      bounds: { width: 100, height: 100 },
      snapEnabled: false,
    };

    expect(resolveLayoutMoveFromSnapshot(snapshot, { x: 0, y: 20 }).anchor.x).toBe(-12);
    expect(resolveLayoutMoveFromSnapshot(snapshot, { x: 20, y: 20 }).anchor.x).toBe(8);
  });

  it("keeps an oversized legacy group recoverable without an inverted clamp", () => {
    const item = { id: "oversized", x: 10, y: 10, width: 140, height: 20 };
    const snapshot = {
      anchor: item,
      movingItems: [item],
      furnitureItems: [item],
      selectedIds: [item.id],
      startPointer: { x: 10, y: 10 },
      bounds: { width: 100, height: 100 },
      snapEnabled: false,
    };

    expect(resolveLayoutMoveFromSnapshot(snapshot, { x: -50, y: 10 }).delta.x).toBe(-50);
    expect(resolveLayoutMoveFromSnapshot(snapshot, { x: 500, y: 10 }).delta.x).toBe(0);
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
