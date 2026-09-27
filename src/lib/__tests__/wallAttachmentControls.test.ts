import { describe, expect, it } from "vitest";
import {
  entranceAttachmentArrowDelta,
  wallAttachmentArrowDelta,
} from "../wallAttachmentControls";

describe("wall attachment keyboard controls", () => {
  it("uses horizontal arrows for horizontal walls", () => {
    const wall = { x1: 0, y1: 10, x2: 100, y2: 10 };
    expect(wallAttachmentArrowDelta(wall, "ArrowRight")).toBe(1);
    expect(wallAttachmentArrowDelta(wall, "ArrowLeft")).toBe(-1);
    expect(wallAttachmentArrowDelta(wall, "ArrowUp")).toBeNull();
  });

  it("uses vertical arrows for side walls", () => {
    const wall = { x1: 10, y1: 0, x2: 10, y2: 100 };
    expect(wallAttachmentArrowDelta(wall, "ArrowDown")).toBe(1);
    expect(wallAttachmentArrowDelta(wall, "ArrowUp")).toBe(-1);
    expect(wallAttachmentArrowDelta(wall, "ArrowRight")).toBeNull();
  });

  it("keeps physical arrow direction when a wall was authored backwards", () => {
    const wall = { x1: 100, y1: 10, x2: 0, y2: 10 };
    expect(wallAttachmentArrowDelta(wall, "ArrowRight")).toBe(-1);
  });

  it("uses left/right on top and bottom entrances and up/down on side entrances", () => {
    expect(entranceAttachmentArrowDelta("bottom", "ArrowRight")).toBe(1);
    expect(entranceAttachmentArrowDelta("right", "ArrowDown")).toBe(1);
    expect(entranceAttachmentArrowDelta("left", "ArrowLeft")).toBeNull();
  });
});
