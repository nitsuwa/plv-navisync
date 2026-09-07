import { describe, expect, it } from "vitest";
import type { Campus } from "../../components/map-builder/types";
import { CAMPUS_GROUND_DEFAULTS, CAMPUS_OBJECT_SAFE_INSET, campusContentBounds, campusGroundAppearance, campusGroundPatternId, campusObjectSafeBounds, fitCampusCanvas, resizeCampusCanvasFromHandle } from "../campusCanvas";

const base: Pick<Campus, "canvasW" | "canvasH" | "buildings" | "markers" | "paths" | "navNodes" | "decorAssets" | "gridSize"> = {
  canvasW: 500, canvasH: 400,
  gridSize: 20,
  buildings: [], markers: [], paths: [], navNodes: [], decorAssets: [],
};

describe("campus canvas bounds", () => {
  it("resolves distinct material defaults and fixed-size texture patterns", () => {
    expect(CAMPUS_GROUND_DEFAULTS.grass).not.toBe(CAMPUS_GROUND_DEFAULTS.concrete);
    expect(campusGroundPatternId("grass", "subtle")).toBe("campus-ground-grass-pattern");
    expect(campusGroundPatternId("pavers", "subtle")).toBe("campus-ground-pavers-pattern");
    expect(campusGroundPatternId("asphalt", "none")).toBeUndefined();
    expect(campusGroundAppearance({ canvasGroundMaterial: "asphalt", canvasGroundTexture: "subtle" })).toMatchObject({ material: "asphalt", texture: "subtle" });
  });

  it("keeps legacy canvas colors as safe defaults", () => {
    expect(campusGroundAppearance({ canvasColor: "#decdb7" })).toMatchObject({ material: "neutral", color: "#decdb7" });
    expect(campusGroundAppearance({})).toMatchObject({ material: "neutral", color: CAMPUS_GROUND_DEFAULTS.neutral, texture: "subtle" });
  });

  it("fits visible content without moving authored positions", () => {
    const value = {
      ...base,
      buildings: [{ id: "b", name: "B", code: "B", category: "academic", description: "", x: 620, y: 40, width: 120, height: 80, floors: [] }],
      markers: [{ id: "m", name: "M", type: "custom", x: 100, y: 700, color: "#000" }],
    } as typeof base;
    // Buildings and ordinary markers contribute their rendered bounds, not
    // just their anchor point, so the marker's 24px frame extends to y=712.
    expect(campusContentBounds(value)).toMatchObject({ maxX: 740, maxY: 712 });
    const fitted = fitCampusCanvas(value, 40);
    expect(fitted.width).toBeGreaterThanOrEqual(780);
    expect(fitted.height).toBeGreaterThanOrEqual(740);
  });

  it("does not let hidden decor force the canvas larger", () => {
    const value = { ...base, decorAssets: [{ id: "d", type: "tree", x: 1200, y: 1200, visible: false }] } as typeof base;
    expect(fitCampusCanvas(value).width).toBe(500);
    expect(fitCampusCanvas(value).height).toBe(400);
  });

  it("uses painted surface cells for Fit to Content instead of the compatibility anchor", () => {
    const value = {
      ...base,
      decorAssets: [{ id: "surface", type: "ground-area", x: 0, y: 0, groundType: "grass", surfaceCellSize: 20, surfaceCells: [{ x: 20, y: 10 }] }],
    } as typeof base;
    expect(campusContentBounds(value)).toMatchObject({ minX: 400, minY: 200, maxX: 420, maxY: 220 });
    expect(fitCampusCanvas(value, 40).width).toBeGreaterThanOrEqual(460);
    expect(fitCampusCanvas(value, 40).height).toBeGreaterThanOrEqual(260);
  });

  it("snaps visual resize handles to grid increments without moving content", () => {
    expect(resizeCampusCanvasFromHandle({ width: 500, height: 400 }, "se", { x: 27, y: 39 }, 20)).toEqual({ width: 520, height: 440 });
    expect(resizeCampusCanvasFromHandle({ width: 500, height: 400 }, "nw", { x: -27, y: -39 }, 20)).toEqual({ width: 520, height: 440 });
  });

  it("exposes a small inner safe frame for physical authored objects", () => {
    expect(campusObjectSafeBounds(500, 400)).toEqual({
      minX: CAMPUS_OBJECT_SAFE_INSET,
      minY: CAMPUS_OBJECT_SAFE_INSET,
      maxX: 500 - CAMPUS_OBJECT_SAFE_INSET,
      maxY: 400 - CAMPUS_OBJECT_SAFE_INSET,
    });
  });
});
