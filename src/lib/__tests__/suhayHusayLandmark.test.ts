import { describe, expect, it } from "vitest";
import { SUHAY_HUSAY_V3_LIMBS, SUHAY_HUSAY_V3_POINTS, SUHAY_HUSAY_V3_ROCKS, SUHAY_HUSAY_V4_LIMBS, SUHAY_HUSAY_V4_POINTS, SUHAY_HUSAY_V4_SUPPORTS, SUHAY_HUSAY_V5_LIMBS, SUHAY_HUSAY_V5_POINTS, SUHAY_HUSAY_V5_ROCKS, SUHAY_HUSAY_V6_SHAPES, SUHAY_HUSAY_V7_SHAPES, SUHAY_HUSAY_V8_SHAPES, SUHAY_HUSAY_V9_SHAPES, SUHAY_HUSAY_V10_SHAPES, SUHAY_HUSAY_V11_SHAPES, suhayHusayV6SymbolPoint, suhayHusayV7SymbolPoint, suhayHusayV8SymbolPoint, suhayHusayV9SymbolPoint, suhayHusayV10SymbolPoint, suhayHusayV11SymbolPoint } from "../suhayHusayLandmark";

describe("Suhay Husay V3 presentation pose", () => {
  it("keeps the lower figure low and inside the standing figure's separated stance", () => {
    const p = SUHAY_HUSAY_V3_POINTS;
    expect(p.upperHead[1]).toBeGreaterThan(p.upperNeck[1]);
    expect(p.lowerHead[1]).toBeLessThan(p.upperPelvis[1] + 0.1);
    expect(p.lowerPelvis[0]).toBeGreaterThan(p.upperHipLeft[0]);
    expect(p.lowerPelvis[0]).toBeLessThan(p.upperHipRight[0]);
    expect(p.upperFootLeft[0]).toBeLessThan(p.upperHipLeft[0]);
    expect(p.upperFootRight[0]).toBeGreaterThan(p.upperHipRight[0]);
  });

  it("connects both figures at two shared hand anchors and builds a faceted rock base", () => {
    const ids = new Set(SUHAY_HUSAY_V3_LIMBS.map((limb) => `${limb.from}:${limb.to}`));
    expect(ids.has("upperElbowLeft:claspLeft")).toBe(true);
    expect(ids.has("lowerElbowLeft:claspLeft")).toBe(true);
    expect(ids.has("upperElbowRight:claspRight")).toBe(true);
    expect(ids.has("lowerElbowRight:claspRight")).toBe(true);
    expect(SUHAY_HUSAY_V3_ROCKS.length).toBeGreaterThanOrEqual(6);
  });
});

describe("Suhay Husay V4 presentation pose", () => {
  it("keeps the lower figure seated within the standing figure's open stance", () => {
    const p = SUHAY_HUSAY_V4_POINTS;
    expect(p.upperHead[1]).toBeGreaterThan(p.upperNeck[1]);
    expect(p.lowerHead[1]).toBeLessThan(p.upperPelvis[1]);
    expect(p.lowerPelvis[0]).toBeGreaterThan(p.upperHipLeft[0]);
    expect(p.lowerPelvis[0]).toBeLessThan(p.upperHipRight[0]);
    expect(p.lowerFootLeft[0]).toBeGreaterThan(p.upperFootLeft[0]);
    expect(p.lowerFootRight[0]).toBeLessThan(p.upperFootRight[0]);
  });

  it("joins both figures at two hand anchors over a compact, intentional stone support", () => {
    const ids = new Set(SUHAY_HUSAY_V4_LIMBS.map((limb) => limb.id));
    expect(ids.has("upper-left-forearm")).toBe(true);
    expect(ids.has("lower-left-forearm")).toBe(true);
    expect(ids.has("upper-right-forearm")).toBe(true);
    expect(ids.has("lower-right-forearm")).toBe(true);
    expect(SUHAY_HUSAY_V4_SUPPORTS).toHaveLength(3);
    expect(SUHAY_HUSAY_V3_ROCKS.length).toBeGreaterThan(SUHAY_HUSAY_V4_SUPPORTS.length);
  });
});

describe("Suhay Husay V5 side-profile pose", () => {
  it("places the skyward standing figure left and the folded figure low on its right", () => {
    const p = SUHAY_HUSAY_V5_POINTS;
    expect(p.upperHead[1]).toBeGreaterThan(p.upperNeck[1]);
    expect(p.upperHead[0]).toBeLessThan(p.lowerHead[0]);
    expect(p.lowerPelvis[1]).toBeLessThan(p.upperPelvis[1]);
    expect(p.lowerKneeLeft[1]).toBeLessThan(p.lowerPelvis[1]);
    expect(p.lowerKneeRight[1]).toBeLessThan(p.lowerPelvis[1]);
    expect(p.lowerFootLeft[1]).toBeLessThanOrEqual(0.2);
    expect(p.lowerFootRight[1]).toBeLessThanOrEqual(0.2);
    expect(p.lowerPelvis[0]).toBeGreaterThan(p.upperHipLeft[0]);
    expect(p.lowerPelvis[0]).toBeLessThan(p.upperKneeRight[0]);
  });

  it("joins both figures at shared hand anchors above a supported stone base", () => {
    const ids = new Set(SUHAY_HUSAY_V5_LIMBS.map((limb) => `${limb.from}:${limb.to}`));
    expect(ids.has("upperElbowLeft:claspLeft")).toBe(true);
    expect(ids.has("lowerElbowLeft:claspLeft")).toBe(true);
    expect(ids.has("upperElbowRight:claspRight")).toBe(true);
    expect(ids.has("lowerElbowRight:claspRight")).toBe(true);
    expect(SUHAY_HUSAY_V5_ROCKS.length).toBeGreaterThanOrEqual(4);
    expect(SUHAY_HUSAY_V5_ROCKS.some((rock) => rock.id === "seated-figure-seat")).toBe(true);
    expect(SUHAY_HUSAY_V4_SUPPORTS).toHaveLength(3);
  });
});

describe("Suhay Husay V6 shared side-profile sculpture", () => {
  it("keeps the standing figure left and visibly higher than the folded figure", () => {
    const s = SUHAY_HUSAY_V6_SHAPES;
    const centerX = (polygon: readonly (readonly [number, number])[]) => polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length;
    const maxY = (polygon: readonly (readonly [number, number])[]) => Math.max(...polygon.map((point) => point[1]));
    const minY = (polygon: readonly (readonly [number, number])[]) => Math.min(...polygon.map((point) => point[1]));
    expect(centerX(s.standingTorso)).toBeLessThan(centerX(s.lowerTorso));
    expect(maxY(s.standingHead)).toBeGreaterThan(maxY(s.lowerHead));
    expect(maxY(s.lowerRaisedThigh)).toBeLessThan(maxY(s.standingTorso));
    expect(minY(s.lowerBentShin)).toBeLessThan(minY(s.lowerRaisedThigh));
    expect(maxY(s.standingRaisedArm)).toBeGreaterThan(1.8);
  });

  it("uses a shared hand clasp and a broad, defined pedestal beneath both figures", () => {
    const s = SUHAY_HUSAY_V6_SHAPES;
    const claspX = s.clasp.reduce((sum, point) => sum + point[0], 0) / s.clasp.length;
    const claspY = s.clasp.reduce((sum, point) => sum + point[1], 0) / s.clasp.length;
    const containsNearClasp = (polygon: readonly (readonly [number, number])[]) => polygon.some(([x, y]) => Math.hypot(x - claspX, y - claspY) < 0.16);
    expect(containsNearClasp(s.standingLinkedArm)).toBe(true);
    expect(containsNearClasp(s.lowerLinkedArm)).toBe(true);
    expect(s.pedestal.some(([x]) => x < -0.6)).toBe(true);
    expect(s.pedestal.some(([x]) => x > 0.6)).toBe(true);
    expect(s.outcrop.length).toBeLessThanOrEqual(10);
    expect(suhayHusayV6SymbolPoint([-0.7, 1.9])[0]).toBeLessThan(suhayHusayV6SymbolPoint([0.4, 0.7])[0]);
  });
});

describe("Suhay Husay V7 side-profile composition", () => {
  it("places a low folded figure inside the standing figure's wider stance", () => {
    const s = SUHAY_HUSAY_V7_SHAPES;
    const centerX = (polygon: readonly (readonly [number, number])[]) => polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length;
    const minY = (polygon: readonly (readonly [number, number])[]) => Math.min(...polygon.map((point) => point[1]));
    const maxY = (polygon: readonly (readonly [number, number])[]) => Math.max(...polygon.map((point) => point[1]));
    const left = Math.min(...s.standingLeftLeg.map(([x]) => x));
    const right = Math.max(...s.standingRightLeg.map(([x]) => x));
    expect(centerX(s.standingTorso)).toBeLessThan(centerX(s.lowerTorso));
    expect(centerX(s.lowerTorso)).toBeGreaterThan(left);
    expect(centerX(s.lowerTorso)).toBeLessThan(right);
    expect(minY(s.lowerFoldedLeg)).toBeGreaterThan(minY(s.pedestal));
    expect(maxY(s.lowerHead)).toBeLessThan(maxY(s.standingHead));
    expect(maxY(s.standingRaisedArm)).toBeGreaterThan(1.9);
  });

  it("keeps the clasp joined and the support a formal tapered monument base", () => {
    const s = SUHAY_HUSAY_V7_SHAPES;
    const claspX = s.clasp.reduce((sum, point) => sum + point[0], 0) / s.clasp.length;
    const claspY = s.clasp.reduce((sum, point) => sum + point[1], 0) / s.clasp.length;
    const nearClasp = (polygon: readonly (readonly [number, number])[]) => polygon.some(([x, y]) => Math.hypot(x - claspX, y - claspY) < 0.16);
    expect(nearClasp(s.standingLinkedArm)).toBe(true);
    expect(nearClasp(s.lowerLinkedArm)).toBe(true);
    expect(s.pedestal[0][0]).toBeLessThan(s.pedestal[2][0]);
    expect(s.pedestal[0][1]).toBeGreaterThan(s.pedestal[2][1]);
    expect(s.outcrop.length).toBeLessThanOrEqual(10);
    expect(suhayHusayV7SymbolPoint([-0.68, 1.94])[0]).toBeLessThan(suhayHusayV7SymbolPoint([0.58, 0.9])[0]);
  });
});

describe("Suhay Husay V8 connected monument rollback", () => {
  it("preserves the prior foot profile and compact pedestal dimensions", () => {
    expect(Math.min(...SUHAY_HUSAY_V8_SHAPES.lowerFoldedLeg.map(([, y]) => y))).toBe(0.34);
    expect(SUHAY_HUSAY_V8_SHAPES.seatedSupport[0][0]).toBe(0.04);
  });
});

describe("Suhay Husay V9 connected monument composition", () => {
  it("uses one continuous head-neck-torso mass for each figure", () => {
    const s = SUHAY_HUSAY_V9_SHAPES;
    const minY = (polygon: readonly (readonly [number, number])[]) => Math.min(...polygon.map((point) => point[1]));
    const maxY = (polygon: readonly (readonly [number, number])[]) => Math.max(...polygon.map((point) => point[1]));
    expect(s.standingCore).toBeDefined();
    expect(s.lowerCore).toBeDefined();
    expect("standingHead" in s).toBe(false);
    expect("standingNeck" in s).toBe(false);
    expect("lowerHead" in s).toBe(false);
    expect(maxY(s.standingCore)).toBeGreaterThan(maxY(s.lowerCore));
    expect(minY(s.standingCore)).toBeLessThan(0.95);
    expect(minY(s.lowerCore)).toBeLessThan(0.55);
  });

  it("seats the lower figure inside the stance and directly on the pedestal support", () => {
    const s = SUHAY_HUSAY_V9_SHAPES;
    const centerX = (polygon: readonly (readonly [number, number])[]) => polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length;
    const left = Math.min(...s.standingLeftLeg.map(([x]) => x));
    const right = Math.max(...s.standingRightLeg.map(([x]) => x));
    const footMinY = Math.min(...s.lowerFoldedLeg.map(([, y]) => y));
    const topY = Math.max(...s.pedestalTop.map(([, y]) => y));
    const topWidth = s.pedestal[1][0] - s.pedestal[0][0];
    const bottomWidth = s.pedestal[2][0] - s.pedestal[3][0];
    expect(centerX(s.lowerCore)).toBeGreaterThan(left);
    expect(centerX(s.lowerCore)).toBeLessThan(right);
    // The folded foot intentionally sinks a little into the plinth top, so
    // it cannot read as floating or hanging beyond the edge in oblique 3D.
    expect(footMinY).toBeLessThan(topY);
    expect(footMinY).toBeGreaterThan(Math.min(...s.pedestal.map(([, y]) => y)));
    expect(Math.max(...s.lowerFoldedLeg.map(([x]) => x))).toBeLessThan(Math.max(...s.pedestalTop.map(([x]) => x)));
    expect(bottomWidth).toBeGreaterThan(topWidth);
    expect(s.seatedSupport.some(([, y]) => y >= 0.5)).toBe(true);
  });

  it("keeps the joined hands inside both arm silhouettes and the icon footprint", () => {
    const s = SUHAY_HUSAY_V9_SHAPES;
    const claspX = s.clasp.reduce((sum, point) => sum + point[0], 0) / s.clasp.length;
    const claspY = s.clasp.reduce((sum, point) => sum + point[1], 0) / s.clasp.length;
    const nearClasp = (polygon: readonly (readonly [number, number])[]) => polygon.some(([x, y]) => Math.hypot(x - claspX, y - claspY) < 0.13);
    const projected = s.pedestal.map((point) => suhayHusayV9SymbolPoint(point));
    expect(nearClasp(s.standingLinkedArm)).toBe(true);
    expect(nearClasp(s.lowerLinkedArm)).toBe(true);
    expect(Math.min(...projected.map(([x]) => x))).toBeGreaterThan(0);
    expect(Math.max(...projected.map(([x]) => x))).toBeLessThan(32);
    expect(Math.min(...projected.map(([, y]) => y))).toBeGreaterThan(0);
  });
});

describe("Suhay Husay V10 reference composition", () => {
  it("keeps the upper figure tall and places the folded lower figure inside its stance", () => {
    const s = SUHAY_HUSAY_V10_SHAPES;
    const bounds = (polygon: readonly (readonly [number, number])[]) => ({
      minX: Math.min(...polygon.map(([x]) => x)),
      maxX: Math.max(...polygon.map(([x]) => x)),
      minY: Math.min(...polygon.map(([, y]) => y)),
      maxY: Math.max(...polygon.map(([, y]) => y)),
      centerX: polygon.reduce((sum, [x]) => sum + x, 0) / polygon.length,
    });
    const standing = bounds(s.standingCore);
    const seated = bounds(s.lowerCore);
    const stanceMin = Math.min(bounds(s.standingLeftLeg).minX, bounds(s.standingRightLeg).minX);
    const stanceMax = Math.max(bounds(s.standingLeftLeg).maxX, bounds(s.standingRightLeg).maxX);
    expect(standing.maxY).toBeGreaterThan(seated.maxY + 0.9);
    expect(seated.centerX).toBeGreaterThan(stanceMin);
    expect(seated.centerX).toBeLessThan(stanceMax);
    expect(bounds(s.lowerFoldedLeg).maxY).toBeLessThan(1);
    expect(bounds(s.lowerFoldedLeg).minY).toBeGreaterThan(bounds(s.pedestal).minY);
  });

  it("keeps clasped hands within reach and the complete slim artwork in the icon bounds", () => {
    const s = SUHAY_HUSAY_V10_SHAPES;
    const center = (polygon: readonly (readonly [number, number])[]) => polygon.reduce(([x, y], [px, py]) => [x + px / polygon.length, y + py / polygon.length], [0, 0] as [number, number]);
    const [cx, cy] = center(s.clasp);
    const nearClasp = (polygon: readonly (readonly [number, number])[]) => polygon.some(([x, y]) => Math.hypot(x - cx, y - cy) < 0.18);
    expect(nearClasp(s.standingLinkedArm)).toBe(true);
    expect(nearClasp(s.lowerLinkedArm)).toBe(true);
    const projected = [...s.pedestal, ...s.standingCore].map((point) => suhayHusayV10SymbolPoint(point));
    expect(Math.min(...projected.map(([x]) => x))).toBeGreaterThan(0);
    expect(Math.max(...projected.map(([x]) => x))).toBeLessThan(32);
    expect(Math.min(...projected.map(([, y]) => y))).toBeGreaterThan(0);
  });
});

describe("Suhay Husay V11 compact reference composition", () => {
  it("keeps one taller upper silhouette and a lower folded figure inside its planted stance", () => {
    const s = SUHAY_HUSAY_V11_SHAPES;
    const bounds = (polygon: readonly (readonly [number, number])[]) => ({
      minX: Math.min(...polygon.map(([x]) => x)),
      maxX: Math.max(...polygon.map(([x]) => x)),
      minY: Math.min(...polygon.map(([, y]) => y)),
      maxY: Math.max(...polygon.map(([, y]) => y)),
      centerX: polygon.reduce((sum, [x]) => sum + x, 0) / polygon.length,
    });
    const standing = bounds(s.standingCore);
    const seated = bounds(s.lowerCore);
    const stanceMin = bounds(s.standingLeftLeg).minX;
    const stanceMax = bounds(s.standingRightLeg).maxX;
    expect(standing.maxY).toBeGreaterThan(seated.maxY + 1.2);
    expect(seated.centerX).toBeGreaterThan(stanceMin);
    expect(seated.centerX).toBeLessThan(0.15);
    expect(seated.centerX).toBeLessThan(stanceMax);
    expect(bounds(s.lowerFoldedLeg).maxY).toBeLessThan(0.75);
    expect(bounds(s.lowerFoldedLeg).minY).toBeGreaterThan(bounds(s.pedestal).minY);
  });

  it("joins both reaching arms at one clasp and keeps the whole icon in bounds", () => {
    const s = SUHAY_HUSAY_V11_SHAPES;
    const center = (polygon: readonly (readonly [number, number])[]) => polygon.reduce(([x, y], [px, py]) => [x + px / polygon.length, y + py / polygon.length], [0, 0] as [number, number]);
    const [cx, cy] = center(s.clasp);
    const nearClasp = (polygon: readonly (readonly [number, number])[]) => polygon.some(([x, y]) => Math.hypot(x - cx, y - cy) < 0.17);
    expect(nearClasp(s.standingLinkedArm)).toBe(true);
    expect(nearClasp(s.lowerLinkedArm)).toBe(true);
    const projected = [...s.pedestal, ...s.standingCore].map((point) => suhayHusayV11SymbolPoint(point));
    expect(Math.min(...projected.map(([x]) => x))).toBeGreaterThan(0);
    expect(Math.max(...projected.map(([x]) => x))).toBeLessThan(32);
    expect(Math.min(...projected.map(([, y]) => y))).toBeGreaterThan(0);
  });
});
