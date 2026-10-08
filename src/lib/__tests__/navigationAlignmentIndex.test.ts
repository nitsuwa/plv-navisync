import { describe, expect, it } from "vitest";
import { navAlignSnap } from "../indoorNavigationGraph";
import { createNavigationAlignmentIndex, navAlignSnapIndexed } from "../navigationAlignmentIndex";

describe("navigation alignment candidate index", () => {
  it("matches the existing resolver while querying only candidates near either aligned axis", () => {
    const candidates = [
      { id: "node-1", x: 100, y: 100 },
      { id: "connected", x: 107, y: 225 },
      { id: "node-2", x: 96, y: 230 },
      { id: "far-x", x: 600, y: 100 },
      { id: "far-y", x: 100, y: 700 },
      ...Array.from({ length: 500 }, (_, index) => ({ id: `far-${index}`, x: 1200 + index * 3, y: 1800 + index * 5 })),
    ];
    const connectedIds = new Set(["connected"]);
    const index = createNavigationAlignmentIndex(candidates);

    for (let x = 80; x <= 120; x += 2) {
      for (let y = 80; y <= 250; y += 7) {
        expect(navAlignSnapIndexed({ x, y }, index, 12, connectedIds))
          .toEqual(navAlignSnap({ x, y }, candidates, 12, connectedIds));
      }
    }
  });

  it("drops both alignment guides immediately outside the threshold", () => {
    const index = createNavigationAlignmentIndex([{ id: "target", x: 100, y: 100 }]);
    expect(navAlignSnapIndexed({ x: 109, y: 110 }, index, 10).guides).toEqual([
      { type: "v", pos: 100 },
      { type: "h", pos: 100 },
    ]);
    expect(navAlignSnapIndexed({ x: 111, y: 111 }, index, 10).guides).toEqual([]);
  });

  it("excludes the active Navigation node without rebuilding the candidate index", () => {
    const candidates = [
      { id: "moving", x: 100, y: 100 },
      { id: "target", x: 106, y: 100 },
    ];
    const index = createNavigationAlignmentIndex(candidates);
    expect(navAlignSnapIndexed({ x: 101, y: 100 }, index, 12, undefined, "moving"))
      .toEqual(navAlignSnap({ x: 101, y: 100 }, candidates.filter((candidate) => candidate.id !== "moving"), 12));
  });
});
