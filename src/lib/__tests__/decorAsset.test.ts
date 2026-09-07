import { describe, it, expect } from "vitest";
import {
  normalizeRotation,
  clampDecorScale,
  duplicateDecorAsset,
  DECOR_SCALE_MIN,
  DECOR_SCALE_MAX,
} from "../decorAsset";

describe("normalizeRotation", () => {
  it("keeps values already in [0, 360)", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(45)).toBe(45);
    expect(normalizeRotation(359)).toBe(359);
  });

  it("wraps values above 360", () => {
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(400)).toBe(40);
    expect(normalizeRotation(720)).toBe(0);
  });

  it("wraps negative values", () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(-360)).toBe(0);
    expect(normalizeRotation(-1)).toBe(359);
  });

  it("handles fractional and large inputs", () => {
    expect(normalizeRotation(721.5)).toBe(1.5);
    expect(normalizeRotation(-721.5)).toBe(358.5);
  });
});

describe("clampDecorScale", () => {
  it("keeps values within the canvas resize-handle bounds", () => {
    expect(clampDecorScale(1)).toBe(1);
    expect(clampDecorScale(2.5)).toBe(2.5);
  });

  it("clamps below the minimum", () => {
    expect(clampDecorScale(0.01)).toBe(DECOR_SCALE_MIN);
    expect(clampDecorScale(-3)).toBe(DECOR_SCALE_MIN);
  });

  it("clamps above the maximum", () => {
    expect(clampDecorScale(50)).toBe(DECOR_SCALE_MAX);
    expect(clampDecorScale(12.5)).toBe(DECOR_SCALE_MAX);
  });
});

describe("duplicateDecorAsset", () => {
  const base = { id: "da1", type: "tree", x: 100, y: 200, rotation: 45, scale: 2, visible: false, name: "Old Oak" };

  it("returns a new id and a visible 20px offset, preserving other properties", () => {
    const copy = duplicateDecorAsset(base, "da2");
    expect(copy.id).toBe("da2");
    expect(copy.id).not.toBe(base.id);
    expect(copy.x).toBe(120);
    expect(copy.y).toBe(220);
    expect(copy.type).toBe("tree");
    expect(copy.rotation).toBe(45);
    expect(copy.scale).toBe(2);
    expect(copy.visible).toBe(false);
    expect(copy.name).toBe("Old Oak");
  });

  it("does not mutate the original asset", () => {
    const original = { ...base };
    duplicateDecorAsset(original, "da2");
    expect(original).toEqual(base);
    expect(original.id).toBe("da1");
    expect(original.x).toBe(100);
  });

  it("supports custom offsets", () => {
    const copy = duplicateDecorAsset(base, "da2", 40, 0);
    expect(copy.x).toBe(140);
    expect(copy.y).toBe(200);
  });

  it("does not share legacy surface-cell arrays between copies", () => {
    const original = {
      id: "surface-1",
      type: "ground-area",
      x: 100,
      y: 200,
      surfaceCells: [{ x: 1, y: 2 }],
    };
    const copy = duplicateDecorAsset(original, "surface-2");
    expect(copy.surfaceCells).toEqual(original.surfaceCells);
    expect(copy.surfaceCells).not.toBe(original.surfaceCells);
    copy.surfaceCells[0].x = 99;
    expect(original.surfaceCells[0].x).toBe(1);
  });
});
