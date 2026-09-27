import { describe, expect, it } from "vitest";
import {
  alignFurnitureItems,
  canGroupFurniture,
  distributeFurnitureItems,
  findEqualSpacingCandidate,
  furnitureGroupId,
  furnitureSelectionBounds,
  furnitureVisibleBounds,
  findNearbyDuplicatePosition,
  placeFurnitureCopiesAboveSources,
  FURNITURE_DUPLICATE_OFFSET,
  withFurnitureGroupId,
  withoutFurnitureGroupId,
  reorderFurnitureItems,
} from "../floorFurnitureEditing";
import type { FloorFurniture } from "../../components/map-builder/types";

const item = (id: string, x: number, y: number, width = 20, height = 10): FloorFurniture => ({
  id, type: "table", name: id, category: "Tables / Work", x, y, width, height, rotation: 0, color: "#999",
});

describe("floor furniture editing helpers", () => {
  it("uses a stable near-source duplicate offset and the requested fallback order", () => {
    const source = item("source", 100, 100, 10, 10);
    const nearbyObstacle = item("obstacle", 116, 116, 10, 10);
    expect(FURNITURE_DUPLICATE_OFFSET).toBe(16);
    expect(findNearbyDuplicatePosition([source], [source, nearbyObstacle], 220, 160))
      .toEqual({ dx: 16, dy: -16 });
    expect(findNearbyDuplicatePosition([source], [source], 220, 160))
      .toEqual({ dx: 16, dy: 16 });
  });

  it("keeps duplicates within floor edges and honors host-zone validation", () => {
    const edgeSource = item("edge", 200, 140, 10, 10);
    expect(findNearbyDuplicatePosition([edgeSource], [edgeSource], 220, 160))
      .toEqual({ dx: -16, dy: -16 });
    const hostedSource = item("hosted", 220, 220, 10, 10);
    expect(findNearbyDuplicatePosition([hostedSource], [hostedSource], 220, 160, (candidate) =>
      candidate.x >= 180 && candidate.y >= 180 && candidate.x + candidate.width <= 260 && candidate.y + candidate.height <= 260,
    )).toEqual({ dx: 16, dy: 16 });
  });

  it("places a new Furniture item immediately above its source without changing other relative order", () => {
    const chair = { ...item("chair", 0, 0), zOrder: 0 };
    const desk = { ...item("desk", 20, 0), zOrder: 1 };
    const bookshelf = { ...item("shelf", 40, 0), zOrder: 2 };
    const copy = { ...chair, id: "chair-copy", zOrder: 0 };
    const result = placeFurnitureCopiesAboveSources(
      [bookshelf, chair, desk, copy],
      [{ sourceId: "chair", copyId: "chair-copy" }],
    );
    expect(result.map((entry) => entry.id)).toEqual(["chair", "chair-copy", "desk", "shelf"]);
    expect(result.map((entry) => entry.zOrder)).toEqual([0, 1, 2, 3]);
  });

  it("uses visible bounds for deterministic alignment", () => {
    const result = alignFurnitureItems([item("a", 10, 20), item("b", 80, 60)], "top");
    expect(result.map((entry) => entry.y)).toEqual([20, 20]);
    expect(furnitureSelectionBounds(result)).toEqual({ x: 10, y: 20, w: 90, h: 10 });
  });

  it("distributes three items by equal visible gaps while preserving outer items", () => {
    const source = [item("a", 0, 10), item("b", 80, 10), item("c", 220, 10)];
    const result = distributeFurnitureItems(source, "horizontal");
    expect(result[0].x).toBe(0);
    expect(result[2].x).toBe(220);
    expect(result[1].x).toBe(110);
    expect(furnitureVisibleBounds(result[1]).x).toBe(110);
  });

  it("finds a nearby equal-spacing landing without proximity merging", () => {
    const moving = item("moving", 132, 40);
    const candidate = findEqualSpacingCandidate(moving, [item("a", 0, 40), item("b", 70, 40)], "horizontal", 12);
    expect(candidate?.referenceIds).toEqual(["a", "b"]);
    expect(candidate?.position).toBe(140);
    expect(candidate?.delta).toBe(8);
  });

  it("supports persistent group metadata without changing identity or geometry", () => {
    const source = [item("a", 0, 0), item("b", 30, 0)];
    expect(canGroupFurniture(source)).toBe(true);
    const grouped = withFurnitureGroupId(source, "group-1");
    expect(furnitureGroupId(grouped)).toBe("group-1");
    expect(grouped.map(({ groupId: _groupId, ...entry }) => entry)).toEqual(source);
    expect(withoutFurnitureGroupId(grouped).every((entry) => !entry.groupId)).toBe(true);
    expect(canGroupFurniture([{ ...source[0], locked: true }, source[1]])).toBe(false);
  });

  it("layers furniture within its own domain and preserves selected order", () => {
    const source = [
      { ...item("a", 0, 0), zOrder: 10 },
      { ...item("b", 30, 0), zOrder: 20 },
      { ...item("c", 60, 0), zOrder: 30 },
    ];
    const front = reorderFurnitureItems(source, ["a", "c"], "bring-front");
    expect([...front].sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0)).map((entry) => entry.id)).toEqual(["b", "a", "c"]);
    const down = reorderFurnitureItems(source, ["b"], "send-backward");
    expect([...down].sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0)).map((entry) => entry.id)).toEqual(["b", "a", "c"]);
    expect(front.find((entry) => entry.id === "a")?.id).toBe("a");
    expect(front.find((entry) => entry.id === "c")?.id).toBe("c");
  });
});
