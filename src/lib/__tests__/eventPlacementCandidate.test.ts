import { describe, expect, it } from "vitest";
import { assessEventPlacement } from "../eventPlacementCandidate";
import type { FloorFurniture } from "../../components/map-builder/types";

const item = (id: string, x: number, y: number, extra: Partial<FloorFurniture> = {}): FloorFurniture => ({
  id,
  type: "chair",
  name: id,
  category: "event",
  x,
  y,
  width: 16,
  height: 16,
  rotation: 0,
  color: "#1d4ed8",
  layer: "events",
  ...extra,
});

const input = (proposed: readonly FloorFurniture[], existing: readonly FloorFurniture[] = [], extra: Partial<Parameters<typeof assessEventPlacement>[0]> = {}) => ({
  proposed,
  existing,
  canvasWidth: 200,
  canvasHeight: 120,
  blockedRegions: [],
  blockOverlaps: false,
  ...extra,
});

describe("assessEventPlacement", () => {
  it("allows a valid candidate and returns its exact geometry", () => {
    const candidate = item("candidate", 40, 40, { rotation: 30 });
    const assessment = assessEventPlacement(input([candidate]));
    expect(assessment).toEqual({ items: [candidate], issues: [], canPlace: true, blockingReason: null });
  });

  it("blocks rotated candidates outside the map", () => {
    const assessment = assessEventPlacement(input([item("candidate", 0, 0, { width: 40, height: 20, rotation: 45 })]));
    expect(assessment.canPlace).toBe(false);
    expect(assessment.issues.map((issue) => issue.code)).toContain("outside-boundary");
    expect(assessment.blockingReason).toMatch(/outside the editable canvas/i);
  });

  it("blocks protected entrance access", () => {
    const assessment = assessEventPlacement(input([item("candidate", 8, 8)], [], {
      blockedRegions: [{ x: 0, y: 0, width: 30, height: 30, label: "Main entrance" }],
    }));
    expect(assessment.canPlace).toBe(false);
    expect(assessment.issues.map((issue) => issue.code)).toContain("blocked-access");
    expect(assessment.blockingReason).toMatch(/Main entrance/);
  });

  it("keeps overlapping candidates as reviewable warnings unless strict overlap blocking is requested", () => {
    const existing = [item("existing", 40, 40)];
    const candidate = item("candidate", 48, 48);
    const allowed = assessEventPlacement(input([candidate], existing));
    expect(allowed.canPlace).toBe(true);
    expect(allowed.issues.map((issue) => issue.code)).toContain("overlap");

    const strict = assessEventPlacement(input([candidate], existing, { blockOverlaps: true }));
    expect(strict.canPlace).toBe(false);
    expect(strict.blockingReason).toMatch(/overlaps/);
  });

  it("does not treat unrelated existing warnings as candidate issues", () => {
    const existing = [item("old-a", 40, 40), item("old-b", 48, 48)];
    const assessment = assessEventPlacement(input([item("candidate", 120, 70)], existing));
    expect(assessment.canPlace).toBe(true);
    expect(assessment.issues).toEqual([]);
  });

  it("rejects empty and nonfinite geometry without calling layout validation", () => {
    const empty = assessEventPlacement(input([]));
    expect(empty.canPlace).toBe(false);
    expect(empty.blockingReason).toMatch(/nothing to place/i);

    for (const candidate of [
      item("nan", Number.NaN, 10),
      item("infinite", 10, Number.POSITIVE_INFINITY),
      item("bad-width", 10, 10, { width: Number.NaN }),
      item("bad-height", 10, 10, { height: Number.POSITIVE_INFINITY }),
      item("bad-rotation", 10, 10, { rotation: Number.NaN }),
    ]) {
      const assessment = assessEventPlacement(input([candidate]));
      expect(assessment.canPlace).toBe(false);
      expect(assessment.blockingReason).toMatch(/valid finite/i);
    }
  });
});
