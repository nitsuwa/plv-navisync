import { describe, expect, it } from "vitest";
import {
  alignFurnitureItems,
  canGroupFurniture,
  distributeFurnitureItems,
  findEqualSpacingCandidate,
  furnitureGroupId,
  furnitureSelectionBounds,
  furnitureVisibleBounds,
  withFurnitureGroupId,
  withoutFurnitureGroupId,
  reorderFurnitureItems,
} from "../floorFurnitureEditing";
import type { FloorFurniture } from "../../components/map-builder/types";

const item = (id: string, x: number, y: number, width = 20, height = 10): FloorFurniture => ({
  id, type: "table", name: id, category: "Tables / Work", x, y, width, height, rotation: 0, color: "#999",
});

describe("floor furniture editing helpers", () => {
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
