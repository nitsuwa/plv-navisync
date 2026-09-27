import { describe, expect, it } from "vitest";
import { normalizedWallJointHalfSize, snapPointToWallCenterline } from "../wallJunctionVisual";
import { rotateObjectLocalPoint, rotationAwareResizeCursor } from "../floorGeometry";

describe("Floor Editor wall junction and transform visuals", () => {
  it("snaps an endpoint to the exact target wall centerline without overshoot", () => {
    const target = { x1: 500, y1: 100, x2: 500, y2: 420 };
    const result = snapPointToWallCenterline({ x: 497, y: 260 }, target);
    expect(result.x).toBe(500);
    expect(result.y).toBe(260);
    expect(result.offset).toBe(0.5);
  });

  it("uses the target endpoint when the candidate approaches its endpoint", () => {
    const target = { x1: 120, y1: 200, x2: 420, y2: 200 };
    const result = snapPointToWallCenterline({ x: 420.5, y: 204 }, target);
    expect(result.x).toBe(420);
    expect(result.y).toBe(200);
    expect(result.offset).toBe(1);
  });

  it("keeps a perimeter joint cap normalized to the authored wall", () => {
    expect(normalizedWallJointHalfSize([
      { thickness: 6, managedKind: "perimeter" },
      { thickness: 6, managedKind: undefined },
    ])).toBeCloseTo(5.7, 8);
  });

  it("maps circulation resize cursors into screen space", () => {
    expect(rotationAwareResizeCursor("e", 0)).toBe("ew-resize");
    expect(rotationAwareResizeCursor("e", 90)).toBe("ns-resize");
    expect(rotationAwareResizeCursor("n", 0)).toBe("ns-resize");
    expect(rotationAwareResizeCursor("n", 90)).toBe("ew-resize");
    expect(rotationAwareResizeCursor("nw", 0)).toBe("nwse-resize");
    expect(rotationAwareResizeCursor("nw", 90)).toBe("nesw-resize");
  });

  it("rotates a local circulation control point around the current object center", () => {
    expect(rotateObjectLocalPoint(100, 100, 40, 20, 20, -10, 0)).toEqual({ x: 120, y: 90 });
    const quarterTurn = rotateObjectLocalPoint(100, 100, 40, 20, 20, -10, 90);
    expect(quarterTurn.x).toBeCloseTo(140, 8);
    expect(quarterTurn.y).toBeCloseTo(110, 8);

    // The same local anchor is recalculated from resized bounds rather than
    // retaining a stale pre-resize world coordinate.
    const resized = rotateObjectLocalPoint(100, 100, 60, 20, 30, -10, 90);
    expect(resized.x).toBeCloseTo(150, 8);
    expect(resized.y).toBeCloseTo(110, 8);
  });
});
