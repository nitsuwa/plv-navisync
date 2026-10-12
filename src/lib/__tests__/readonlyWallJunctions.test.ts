import { describe, expect, it } from "vitest";
import type { FloorWall } from "../../components/map-builder/types";
import { readonlyWallJunctions } from "../readonlyWallJunctions";

const wall = (id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<FloorWall> = {}): FloorWall => ({
  id, x1, y1, x2, y2, thickness: 6, color: "#334155", ...extra,
});

describe("readonlyWallJunctions", () => {
  it("adds one shared cap for an authored L junction", () => {
    const joints = readonlyWallJunctions([
      wall("horizontal", 20, 40, 100, 40),
      wall("vertical", 100, 40, 100, 110),
    ], true);

    expect(joints).toHaveLength(1);
    expect(joints[0]).toMatchObject({ x: 100, y: 40, wallIds: ["horizontal", "vertical"] });
    expect(joints[0].radius).toBeGreaterThanOrEqual(4.5);
  });

  it("closes endpoint-to-segment T junctions without changing authored segments", () => {
    const walls = [
      wall("through", 20, 60, 120, 60),
      wall("branch", 70, 20, 70, 60),
    ];

    expect(readonlyWallJunctions(walls, true)).toEqual([expect.objectContaining({ x: 70, y: 60, wallIds: ["branch", "through"] })]);
    expect(walls[0]).toMatchObject({ x1: 20, y1: 60, x2: 120, y2: 60 });
  });

  it("respects floor preference and authored per-wall overrides", () => {
    const walls = [wall("a", 0, 0, 40, 0), wall("b", 40, 0, 40, 40)];
    expect(readonlyWallJunctions(walls, false)).toHaveLength(0);
    expect(readonlyWallJunctions([{ ...walls[0], junctionBlocks: "show" }, walls[1]], false)).toHaveLength(1);
    expect(readonlyWallJunctions([{ ...walls[0], junctionBlocks: "hide" }, walls[1]], true)).toHaveLength(0);
  });
});
