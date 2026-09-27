import { describe, expect, it } from "vitest";
import {
  floorLayerActionAvailability,
  getFloorLayerBand,
  reorderFloorLayerItems,
  sortFloorItemsByLocalZ,
  sortFloorRenderEntries,
} from "../floorRenderLayers";

const furniture = [
  { id: "chair", zOrder: 0 },
  { id: "desk", zOrder: 1 },
  { id: "bookshelf", zOrder: 2 },
];

describe("semantic Floor render layers", () => {
  it("keeps architectural priorities above Furniture regardless of persisted local values", () => {
    expect(getFloorLayerBand("room")).toBeLessThan(getFloorLayerBand("furniture"));
    expect(getFloorLayerBand("furniture")).toBeLessThan(getFloorLayerBand("wall"));
    expect(getFloorLayerBand("wall")).toBeLessThan(getFloorLayerBand("window"));
    expect(getFloorLayerBand("door")).toBe(getFloorLayerBand("open_passage"));

    const ordered = sortFloorRenderEntries([
      { type: "window", item: { id: "window", zOrder: -100 } },
      { type: "furniture", item: { id: "desk", zOrder: 999_999 } },
      { type: "wall", item: { id: "wall", zOrder: 80 } },
      { type: "room", item: { id: "room", zOrder: 500 } },
      { type: "door", item: { id: "door", zOrder: -200 } },
    ]);
    expect(ordered.map((entry) => entry.type)).toEqual(["room", "furniture", "wall", "door", "window"]);
  });

  it("moves Furniture one local step and normalizes changed zOrder values", () => {
    const downOnce = reorderFloorLayerItems(furniture, ["bookshelf"], "send-backward");
    expect(sortFloorItemsByLocalZ(downOnce).map((item) => item.id)).toEqual(["chair", "bookshelf", "desk"]);
    expect(downOnce.map((item) => item.zOrder).sort()).toEqual([0, 1, 2]);

    const downTwice = reorderFloorLayerItems(downOnce, ["bookshelf"], "send-backward");
    expect(sortFloorItemsByLocalZ(downTwice).map((item) => item.id)).toEqual(["bookshelf", "chair", "desk"]);
    expect(sortFloorItemsByLocalZ(reorderFloorLayerItems(furniture, ["bookshelf"], "bring-front")).map((item) => item.id))
      .toEqual(["chair", "desk", "bookshelf"]);
  });

  it("preserves multi-selection order and disables layer actions at local edges", () => {
    const moved = reorderFloorLayerItems(furniture, ["chair", "bookshelf"], "bring-front");
    expect(sortFloorItemsByLocalZ(moved).map((item) => item.id)).toEqual(["desk", "chair", "bookshelf"]);
    expect(floorLayerActionAvailability(moved, ["chair", "bookshelf"])).toMatchObject({
      "send-back": true,
      "send-backward": true,
      "bring-forward": false,
      "bring-front": false,
    });
  });

  it("sorts equal and missing local zOrder values deterministically by saved order", () => {
    const items = [{ id: "first" }, { id: "second", zOrder: 0 }, { id: "third" }];
    expect(sortFloorItemsByLocalZ(items).map((item) => item.id)).toEqual(["first", "second", "third"]);
  });
});
