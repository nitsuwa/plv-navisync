import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { FloorGroundSurface } from "../../components/map-builder/FloorGroundSurface";
import { ReadonlyFloorPlanScene } from "../../components/map-builder/ReadonlyFloorPlanVisuals";
import {
  DEFAULT_FLOOR_APPEARANCE,
  FLOOR_MATERIAL_OPTIONS,
  FLOOR_MATERIAL_DEFAULT_COLORS,
  defaultFloorColorForMaterial,
  floorPatternId,
  floorPatternSpec,
  isFloorAuthoringGridEligible,
  normalizeFloorAppearance,
} from "../floorAppearance";

describe("floor appearance", () => {
  it("keeps legacy floors visually compatible while adding the canonical default", () => {
    expect(normalizeFloorAppearance(undefined, "#faf7f0")).toEqual({
      material: "neutral",
      texture: "subtle",
      color: "#faf7f0",
    });
    expect(DEFAULT_FLOOR_APPEARANCE.material).toBe("neutral");
  });

  it("uses the selected material default when appearance metadata is partial", () => {
    expect(normalizeFloorAppearance({ material: "wood", texture: "subtle" }, "#ffffff").color)
      .toBe(FLOOR_MATERIAL_DEFAULT_COLORS.wood);
  });

  it("provides a distinct subtle pattern language for every indoor material", () => {
    const specs = FLOOR_MATERIAL_OPTIONS.map(({ value }) => floorPatternSpec(value, "subtle"));
    expect(specs.every(Boolean)).toBe(true);
    expect(new Set(specs.map((spec) => spec?.kind)).size).toBe(6);
    expect(specs.map((spec) => spec?.size).every((size) => typeof size === "number" && size > 0)).toBe(true);
  });

  it("provides restrained material defaults without overriding an explicit tint", () => {
    expect(defaultFloorColorForMaterial("wood")).toBe(FLOOR_MATERIAL_DEFAULT_COLORS.wood);
    expect(defaultFloorColorForMaterial("ceramic_tile")).toBe(FLOOR_MATERIAL_DEFAULT_COLORS.ceramic_tile);
    expect(normalizeFloorAppearance({ material: "wood", texture: "subtle", color: "#9b2c2c" }).color).toBe("#9b2c2c");
  });

  it("removes the pattern entirely for Texture=None", () => {
    for (const { value } of FLOOR_MATERIAL_OPTIONS) expect(floorPatternSpec(value, "none")).toBeNull();
  });

  it("allows the authoring grid only on the neutral, texture-free surface", () => {
    expect(isFloorAuthoringGridEligible("neutral", "none")).toBe(true);
    expect(isFloorAuthoringGridEligible("neutral", "subtle")).toBe(false);
    expect(isFloorAuthoringGridEligible("wood", "none")).toBe(false);
  });

  it("keeps tint as the surface color without changing material identity", () => {
    const appearance = normalizeFloorAppearance({ material: "ceramic_tile", texture: "subtle", color: "#abc123" });
    expect(appearance).toEqual({ material: "ceramic_tile", texture: "subtle", color: "#abc123" });
    expect(floorPatternSpec(appearance.material, appearance.texture)?.kind).toBe("tile");
    expect(floorPatternId("floor:42", appearance)).toContain("ceramic_tile");
  });

  it("uses the same pattern-bearing surface component for preview and live SVG", () => {
    const { container } = render(createElement("svg", null, createElement(FloorGroundSurface, { width: 240, height: 120, appearance: { material: "wood", texture: "subtle", color: "#c08457" }, idPrefix: "parity" })));
    expect(container.querySelector("pattern")).not.toBeNull();
    expect(container.querySelector('g[data-floor-material="wood"] rect[fill^="url(#parity-pattern-wood)"]')).not.toBeNull();
    expect(container.querySelector('rect[fill="#c08457"]')).not.toBeNull();
  });

  it("keeps the authoring grid out of read-only floor rendering", () => {
    const floor = {
      id: "floor-readonly", canvasW: 240, canvasH: 120, backgroundColor: "#e8e1d7", showGrid: true,
      rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
    } as never;
    const { container } = render(createElement("svg", null, createElement(ReadonlyFloorPlanScene, { floor })));
    expect(container.querySelector('[data-testid="readonly-floor-surface"]')).not.toBeNull();
    expect(container.querySelector('line[stroke="var(--map-boundary, #cbd5e1)"]')).toBeNull();
  });

  it("rejects unsupported persisted values without dropping the safe color", () => {
    expect(normalizeFloorAppearance({ material: "bogus" as never, texture: "bogus" as never, color: "#123456" })).toEqual({
      material: "neutral", texture: "subtle", color: "#123456",
    });
  });
});
