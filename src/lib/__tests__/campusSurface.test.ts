import { describe, expect, it } from "vitest";
import { applySurfaceStroke, surfaceCellKey, surfaceCellRuns, surfaceCellsBetween } from "../campusSurface";

describe("campus surface painter", () => {
  it("fills skipped pointer samples and groups adjacent cells into seamless runs", () => {
    expect(surfaceCellsBetween({ x: 0, y: 1 }, { x: 3, y: 1 })).toEqual([
      { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 },
    ]);
    expect(surfaceCellRuns([{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 3, y: 1 }])).toEqual([
      { x: 0, y: 1, width: 2 }, { x: 3, y: 1, width: 1 },
    ]);
  });

  it("keeps one sparse asset per material and erases touched cells", () => {
    const painted = applySurfaceStroke([], new Set([surfaceCellKey(1, 2), surfaceCellKey(2, 2)]), "grass", false, 20);
    expect(painted).toHaveLength(1);
    expect(painted[0].surfaceCells).toEqual([{ x: 1, y: 2 }, { x: 2, y: 2 }]);
    const erased = applySurfaceStroke(painted, new Set([surfaceCellKey(1, 2)]), "grass", true, 20);
    expect(erased[0].surfaceCells).toEqual([{ x: 2, y: 2 }]);
  });
});
