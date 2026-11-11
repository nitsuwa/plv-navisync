import { describe, expect, it } from "vitest";
import { previousDiscoverTourTarget } from "../discoveryTourNavigation";

describe("previousDiscoverTourTarget", () => {
  it("wraps from the first stop to the last, including a one-building tour", () => {
    expect(previousDiscoverTourTarget(0, 5)).toEqual({ kind: "building", index: 4 });
    expect(previousDiscoverTourTarget(0, 1)).toEqual({ kind: "building", index: 0 });
  });

  it("moves to the preceding published stop", () => {
    expect(previousDiscoverTourTarget(2, 4)).toEqual({ kind: "building", index: 1 });
    expect(previousDiscoverTourTarget(1, 4)).toEqual({ kind: "building", index: 0 });
    expect(previousDiscoverTourTarget(4, 4)).toEqual({ kind: "building", index: 3 });
  });

  it("does nothing when the tour has no valid stops", () => {
    expect(previousDiscoverTourTarget(0, 0)).toEqual({ kind: "none" });
  });
});
