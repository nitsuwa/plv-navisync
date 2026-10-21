import { describe, expect, it } from "vitest";
import { screenSpaceAlignmentThreshold } from "./roomOverlap";
import { buildWallAlignmentAxisIndex, resolveWallPointAlignment, resolveWallTranslationAlignment, type WallAlignmentSegment } from "./wallAlignmentSnap";

const horizontal = (id: string, y: number, x1 = 0, x2 = 100): WallAlignmentSegment => ({ id, x1, y1: y, x2, y2: y });
const vertical = (id: string, x: number, y1 = 0, y2 = 100): WallAlignmentSegment => ({ id, x1: x, y1, x2: x, y2 });

describe("wall alignment snapping", () => {
  it("aligns a wall endpoint to the same X/Y axis with a clear guide", () => {
    expect(resolveWallPointAlignment({ x: 49, y: 60 }, [vertical("v1", 53)], 6)).toMatchObject({
      x: 53, y: 60, guide: "v", kind: "segment",
    });
    expect(resolveWallPointAlignment({ x: 50, y: 64 }, [horizontal("h1", 60)], 6)).toMatchObject({
      x: 50, y: 60, guide: "h", kind: "segment",
    });
  });

  it("prioritizes exact endpoints, projected points, and perpendicular intersections", () => {
    expect(resolveWallPointAlignment({ x: 98, y: 52 }, [horizontal("h1", 50)], 5)).toMatchObject({
      x: 100, y: 50, kind: "endpoint",
    });
    expect(resolveWallPointAlignment({ x: 52, y: 45 }, [horizontal("h1", 50)], 6)).toMatchObject({
      x: 52, y: 50, kind: "segment",
    });
    expect(resolveWallPointAlignment({ x: 49, y: 51 }, [horizontal("h1", 50), vertical("v1", 50)], 4)).toMatchObject({
      x: 50, y: 50, kind: "intersection",
    });
  });

  it("resolves collinear continuation and whole-wall same-axis movement as one delta", () => {
    expect(resolveWallPointAlignment({ x: 101, y: 51 }, [horizontal("existing", 50, 20, 100)], 4)).toMatchObject({
      x: 100, y: 50, kind: "endpoint",
    });
    const snap = resolveWallTranslationAlignment(
      [horizontal("moving", 105, 120, 180)],
      [horizontal("target", 100, 0, 100)],
      6,
    );
    expect(snap).toMatchObject({ dx: 0, dy: -5, guide: "h", kind: "axis" });
  });

  it("aligns an endpoint to the middle of another wall without changing the target", () => {
    const target = horizontal("target", 80, 20, 180);
    const snap = resolveWallPointAlignment({ x: 100, y: 84 }, [target], 6);
    expect(snap).toMatchObject({ x: 100, y: 80, guide: "h", kind: "segment" });
    expect(target).toEqual(horizontal("target", 80, 20, 180));
  });

  it("releases immediately outside tolerance and ignores hidden or locked walls", () => {
    const targets = [{ ...horizontal("hidden", 50, 0, 100), visible: false }, { ...vertical("locked", 50), locked: true }];
    expect(resolveWallPointAlignment({ x: 40, y: 53 }, targets, 4)).toBeNull();
  });

  it("keeps the perceived snap radius stable as zoom changes", () => {
    const toleranceAtZoomedOut = screenSpaceAlignmentThreshold(0.5, 8, 3, 16);
    const toleranceAtZoomedIn = screenSpaceAlignmentThreshold(2, 8, 3, 16);
    expect(toleranceAtZoomedOut).toBe(16);
    expect(toleranceAtZoomedIn).toBe(4);
    expect(resolveWallPointAlignment({ x: 108, y: 30 }, [vertical("target", 100)], toleranceAtZoomedOut)).not.toBeNull();
    expect(resolveWallPointAlignment({ x: 108, y: 30 }, [vertical("target", 100)], toleranceAtZoomedIn)).toBeNull();
  });

  it("keeps same-X/Y guides available across long empty spans and ignores the moving wall itself", () => {
    const target = vertical("target", 200, 10, 80);
    const axisIndex = buildWallAlignmentAxisIndex([target]);
    expect(resolveWallPointAlignment({ x: 196, y: 300 }, [], 5, axisIndex)).toMatchObject({
      x: 200, y: 300, guide: "v", kind: "axis", targetId: "target",
    });
    expect(resolveWallPointAlignment({ x: 196, y: 300 }, [], 5, axisIndex, new Set(["target"]))).toBeNull();

    const moving = horizontal("moving", 300, 100, 150);
    const targetHorizontal = horizontal("far-y", 296, 10, 80);
    const movementIndex = buildWallAlignmentAxisIndex([targetHorizontal]);
    expect(resolveWallTranslationAlignment([moving], [], 5, movementIndex)).toMatchObject({
      dx: 0, dy: -4, guide: "h", kind: "axis", targetId: "far-y",
    });
  });

  it("returns one group correction for multiple moving walls", () => {
    const snap = resolveWallTranslationAlignment(
      [horizontal("moving-a", 105, 120, 160), horizontal("moving-b", 125, 120, 160)],
      [horizontal("target", 100, 100, 200), horizontal("target-b", 120, 100, 200)],
      6,
    );
    // One correction is shared by the entire dragged set, not per-wall.
    expect(snap).toMatchObject({ dx: 0, dy: -5, guide: "h" });
  });
});
