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

  it("aligns visual top edges while preserving dimensions, rotation, and unselected items", () => {
    const result = applyLayoutAction(items, ["a", "b"], "align-top");
    expect(result[0]).toMatchObject({ x: 10, y: 20, width: 20, height: 10, rotation: 15 });
    expect(result[1].y).toBeCloseTo(25 - (Math.sin(15 * Math.PI / 180) * 20 + Math.cos(15 * Math.PI / 180) * 10) / 2);
    expect(result[1]).toMatchObject({ x: 60, width: 30, height: 20 });
    expect(result[2]).toEqual(items[2]);
  });

  it("aligns rotated visual left edges and supports two selected items", () => {
    const selected = [
      { id: "rotated", x: 20, y: 10, width: 40, height: 20, rotation: 90 },
      { id: "plain", x: 100, y: 40, width: 30, height: 20 },
      { id: "untouched", x: 150, y: 50, width: 10, height: 10 },
    ];

    const result = applyLayoutAction(selected, ["rotated", "plain"], "align-left");

    expect(result[0].x + result[0].width / 2 - 20 / 2).toBeCloseTo(30);
    expect(result[1].x).toBe(30);
    expect(result[2]).toEqual(selected[2]);
  });

  it("aligns selected item centers to the center of their visual selection bounds", () => {
    const selected = [
      { id: "rotated", x: 20, y: 10, width: 40, height: 20, rotation: 90 },
      { id: "plain", x: 100, y: 40, width: 30, height: 20 },
    ];

    const result = applyLayoutAction(selected, ["rotated", "plain"], "align-center");

    expect(result.map((item) => item.x + item.width / 2)).toEqual([80, 80]);
  });

  it("aligns rotated visual top edges", () => {
    const selected = [
      { id: "rotated", x: 20, y: 10, width: 20, height: 40, rotation: 90 },
      { id: "plain", x: 100, y: 80, width: 30, height: 20 },
    ];

    const result = applyLayoutAction(selected, ["rotated", "plain"], "align-top");

    expect(result[0].y + result[0].height / 2 - 20 / 2).toBe(20);
    expect(result[1].y).toBe(20);
  });

  it("aligns selected item centers to the center of their visual vertical bounds", () => {
    const selected = [
      { id: "rotated", x: 20, y: 10, width: 20, height: 40, rotation: 90 },
      { id: "plain", x: 100, y: 80, width: 30, height: 20 },
    ];

    const result = applyLayoutAction(selected, ["rotated", "plain"], "align-middle");

    expect(result.map((item) => item.y + item.height / 2)).toEqual([60, 60]);
  });

  it("keeps aligned visual bounds inside the map when bounds are supplied", () => {
    const selected = [
      { id: "first", x: -20, y: -10, width: 20, height: 20 },
      { id: "second", x: 60, y: 60, width: 20, height: 20 },
    ];

    const left = applyLayoutAction(selected, ["first", "second"], "align-left", { width: 100, height: 100 });
    const top = applyLayoutAction(selected, ["first", "second"], "align-top", { width: 100, height: 100 });

    expect(left.map((item) => item.x)).toEqual([0, 0]);
    expect(top.map((item) => item.y)).toEqual([0, 0]);
  });

  it("clamps center alignments to the map when the selected group starts outside it", () => {
    const selected = [
      { id: "first", x: -130, y: 170, width: 20, height: 20 },
      { id: "second", x: -90, y: 210, width: 20, height: 20 },
    ];

    const center = applyLayoutAction(selected, ["first", "second"], "align-center", { width: 100, height: 100 });
    const middle = applyLayoutAction(selected, ["first", "second"], "align-middle", { width: 100, height: 100 });

    expect(center.map((item) => item.x + item.width / 2)).toEqual([10, 10]);
    expect(middle.map((item) => item.y + item.height / 2)).toEqual([90, 90]);
  });

  it("distributes three selected items with equal gaps", () => {
    const result = applyLayoutAction(items, ["a", "b", "c"], "distribute-horizontal");
    const horizontalEdges = result.map((item) => {
      const radians = (item.rotation ?? 0) * Math.PI / 180;
      const width = Math.abs(Math.cos(radians)) * item.width + Math.abs(Math.sin(radians)) * item.height;
      const centerX = item.x + item.width / 2;
      return { left: centerX - width / 2, right: centerX + width / 2 };
    });

    expect(horizontalEdges[1].left - horizontalEdges[0].right).toBeCloseTo(horizontalEdges[2].left - horizontalEdges[1].right);
  });

  it("distributes two selected items vertically as an evenly spaced column", () => {
    const selected = [
      { id: "first", x: 20, y: 10, width: 20, height: 20 },
      { id: "second", x: 50, y: 30, width: 20, height: 20 },
    ];

    const result = applyLayoutAction(selected, ["first", "second"], "distribute-vertical", { width: 100, height: 100 });

    expect(result.map((item) => item.y)).toEqual([2, 38]);
  });

  it("returns null for an empty selection and bounds selected items", () => {
    expect(selectionBounds(items, [])).toBeNull();
    expect(selectionBounds(items, ["a", "c"])).toEqual({ x: 10, y: 20, width: 130, height: 50 });
  });
});
