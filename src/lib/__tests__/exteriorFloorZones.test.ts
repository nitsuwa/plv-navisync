import { describe, expect, it } from "vitest";
import { clampExteriorZone, exteriorZoneGeometry, exteriorZoneSpansOverlap, exteriorZoneTypeLabel, isExteriorAccessParent, exteriorZoneAccessFeatureGeometry, exteriorZoneAccessFeatureEdgeForPoint, exteriorZoneAccessFeatureFits, exteriorZoneAccessFeaturesOverlap, exteriorZoneSideForPointStable, resizeExteriorZoneAtPoint, resizeExteriorAccessFeatureAtPoint, mirrorExteriorZoneAccessAttachment } from "../exteriorFloorZones";

describe("optional exterior floor zones", () => {
  const base = { id: "z1", type: "veranda" as const, side: "bottom" as const, offset: 0.5, width: 180, depth: 72 };
  it("projects attached rectangles outside the indoor footprint", () => {
    expect(exteriorZoneGeometry(base, 1000, 700)).toEqual({ x: 410, y: 700, width: 180, height: 72, rotation: 0 });
    expect(exteriorZoneGeometry({ ...base, side: "right" }, 1000, 700)).toEqual({ x: 1000, y: 260, width: 72, height: 180, rotation: 0 });
  });
  it("clamps wall positions and detects same-wall span overlap", () => {
    const clamped = clampExteriorZone({ ...base, offset: 0 }, 1000, 700);
    expect(clamped.offset).toBeGreaterThan(0);
    expect(clampExteriorZone({ ...base, width: 1200 }, 1000, 700).width).toBe(1000);
    expect(exteriorZoneSpansOverlap(base, { ...base, id: "z2", offset: 0.55 }, 1000, 700)).toBe(true);
    expect(exteriorZoneSpansOverlap(base, { ...base, id: "z2", side: "left", offset: 0.5 }, 1000, 700)).toBe(false);
  });
  it("keeps friendly labels for the four initial types", () => {
    expect(exteriorZoneTypeLabel("entrance_landing")).toBe("Entrance Landing");
    expect(exteriorZoneTypeLabel("covered_walkway")).toBe("Covered Walkway");
  });
  it("models steps and ramps as children on the zone outer edge", () => {
    expect(isExteriorAccessParent(base)).toBe(true);
    expect(isExteriorAccessParent({ type: "covered_walkway" })).toBe(false);
    const feature = { width: 80, height: 32, attachmentOffset: 0.5 };
    const geometry = exteriorZoneAccessFeatureGeometry(base, feature, 1000, 700);
    expect(geometry?.y).toBe(772);
    expect(geometry?.edge).toBe("outer");
    expect(exteriorZoneAccessFeatureFits(base, feature)).toBe(true);
    expect(exteriorZoneAccessFeatureFits({ ...base, width: 60 }, feature)).toBe(false);
    expect(exteriorZoneAccessFeaturesOverlap(feature, { ...feature, attachmentOffset: 0.52 }, base)).toBe(true);
  });
  it("keeps a wall candidate sticky in the corner dead zone", () => {
    expect(exteriorZoneSideForPointStable({ x: 1005, y: -4 }, 1000, 700, "right", 24)).toBe("right");
    expect(exteriorZoneSideForPointStable({ x: 900, y: -45 }, 1000, 700, "right", 24)).toBe("top");
    expect(exteriorZoneSideForPointStable({ x: -4, y: 705 }, 1000, 700, "bottom", 24)).toBe("bottom");
  });
  it("resizes attached zones and access features without free XY coordinates", () => {
    const resized = resizeExteriorZoneAtPoint(base, "span-end", { x: 700, y: 700 }, 1000, 700);
    expect(resized.side).toBe("bottom");
    expect(resized.width).toBeGreaterThan(base.width);
    const child = { id: "s1", x: 0, y: 0, width: 84, height: 70, label: "Steps", parentZoneId: "z1", attachmentOffset: 0.5, attachmentEdge: "outer" as const, accessible: false as const };
    const childResize = resizeExteriorAccessFeatureAtPoint(base, child, "span-end", { x: 650, y: 770 }, 1000, 700);
    expect(childResize.attachmentOffset).toBeGreaterThan(child.attachmentOffset ?? 0);
    expect(childResize.height).toBe(70);
    const childDepthResize = resizeExteriorAccessFeatureAtPoint(base, child, "depth", { x: 500, y: 850 }, 1000, 700);
    expect(childDepthResize.height).toBeGreaterThan(child.height);
  });
  it("keeps child placement on exposed parent edges and rejects the wall edge", () => {
    const south = exteriorZoneAccessFeatureEdgeForPoint({ x: 500, y: 810 }, base, 1000, 700);
    expect(south.edge).toBe("outer");
    const southSide = exteriorZoneAccessFeatureEdgeForPoint({ x: 412, y: 742 }, base, 1000, 700);
    expect(southSide.edge).toBe("start");
    const southSideApproach = exteriorZoneAccessFeatureEdgeForPoint({ x: 350, y: 736 }, base, 1000, 700);
    expect(southSideApproach.edge).toBe("start");
    expect(southSideApproach.blocked).toBe(false);
    const beyondCorner = exteriorZoneAccessFeatureEdgeForPoint({ x: 350, y: 900 }, base, 1000, 700);
    expect(beyondCorner.blocked).toBe(true);
    const child = { width: 56, height: 28, attachmentOffset: 0.5, attachmentEdge: "start" as const };
    const sideGeometry = exteriorZoneAccessFeatureGeometry(base, child, 1000, 700);
    expect(sideGeometry?.edge).toBe("start");
    expect(sideGeometry?.side).toBe("left");
    expect(sideGeometry?.x).toBeLessThan(410);
    expect(exteriorZoneAccessFeatureFits(base, child)).toBe(true);
    const wallEdge = exteriorZoneAccessFeatureEdgeForPoint({ x: 500, y: 700 }, base, 1000, 700);
    expect(wallEdge.blocked).toBe(true);
    // A pointer just inside the upper-left corner is still a valid left-edge
    // approach; it should not inherit the wall-facing edge's blocked state.
    const nearCorner = exteriorZoneAccessFeatureEdgeForPoint({ x: 416, y: 706 }, base, 1000, 700);
    expect(nearCorner.edge).toBe("start");
    expect(nearCorner.blocked).toBe(false);
  });

  it("accepts each exposed edge for every parent orientation and rejects only the building-facing edge", () => {
    const cases = [
      { side: "bottom" as const, exposed: [{ x: 412, y: 742 }, { x: 500, y: 772 }, { x: 588, y: 742 }], wall: { x: 500, y: 700 } },
      { side: "top" as const, exposed: [{ x: 412, y: -36 }, { x: 500, y: -72 }, { x: 588, y: -36 }], wall: { x: 500, y: 0 } },
      { side: "right" as const, exposed: [{ x: 1036, y: 262 }, { x: 1072, y: 350 }, { x: 1036, y: 438 }], wall: { x: 1000, y: 350 } },
      { side: "left" as const, exposed: [{ x: -36, y: 262 }, { x: -72, y: 350 }, { x: -36, y: 438 }], wall: { x: 0, y: 350 } },
    ];
    for (const entry of cases) {
      const parent = { ...base, side: entry.side };
      for (const point of entry.exposed) expect(exteriorZoneAccessFeatureEdgeForPoint(point, parent, 1000, 700).blocked).toBeFalsy();
      expect(exteriorZoneAccessFeatureEdgeForPoint(entry.wall, parent, 1000, 700).blocked).toBe(true);
    }
  });

  it("allows multiple access features on separate exposed spans while blocking only real overlap", () => {
    const steps = { width: 56, height: 28, attachmentOffset: 0.22, attachmentEdge: "outer" as const };
    const ramp = { width: 64, height: 36, attachmentOffset: 0.78, attachmentEdge: "outer" as const };
    expect(exteriorZoneAccessFeatureFits(base, steps)).toBe(true);
    expect(exteriorZoneAccessFeatureFits(base, ramp)).toBe(true);
    expect(exteriorZoneAccessFeaturesOverlap(steps, ramp, base)).toBe(false);
    expect(exteriorZoneAccessFeaturesOverlap(steps, { ...ramp, attachmentOffset: 0.3 }, base)).toBe(true);
    // A left-edge feature and an outer-edge feature may sit near the same
    // corner without colliding: their physical rectangles meet only at the
    // parent boundary, while their interaction handles are intentionally not
    // part of the collision model.
    const left = { width: 48, height: 32, attachmentOffset: 0.18, attachmentEdge: "start" as const };
    const outerNearCorner = { width: 48, height: 32, attachmentOffset: 0.18, attachmentEdge: "outer" as const };
    expect(exteriorZoneAccessFeaturesOverlap(left, outerNearCorner, base)).toBe(false);
  });

  it("mirrors local access attachments without creating an absolute-position orphan", () => {
    expect(mirrorExteriorZoneAccessAttachment({ attachmentEdge: "start", attachmentOffset: 0.2 })).toEqual({ attachmentEdge: "end", attachmentOffset: 0.8 });
    expect(mirrorExteriorZoneAccessAttachment({ attachmentEdge: "end", attachmentOffset: 0.8 })).toEqual({ attachmentEdge: "start", attachmentOffset: 0.2 });
    expect(mirrorExteriorZoneAccessAttachment({ attachmentEdge: "outer", attachmentOffset: 0.2 })).toEqual({ attachmentEdge: "outer", attachmentOffset: 0.8 });
  });
});
