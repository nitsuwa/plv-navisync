import { describe, expect, it } from "vitest";
import { measureRouteDoorCrossings, routeDoorTransitOpacity, shouldApplyDoorFocusOcclusion } from "../routeDoorTransit";

describe("route-progress Door transparency", () => {
  const route = [{ x: -2, y: 0 }, { x: 2, y: 0 }];
  const door = { start: { x: 0, y: -0.5 }, end: { x: 0, y: 0.5 } };

  it("finds the authored Door crossed by the route and leaves unrelated Doors unchanged", () => {
    const crossing = measureRouteDoorCrossings(route, door.start, door.end);
    const unrelated = measureRouteDoorCrossings(route, { x: 0, y: 2 }, { x: 0, y: 3 });

    expect(crossing).toMatchObject({ totalLength: 4, crossings: [{ distance: 2, progress: 0.5 }] });
    expect(routeDoorTransitOpacity(0.5, true, crossing)).toBe(0.35);
    expect(routeDoorTransitOpacity(0.5, true, unrelated)).toBe(1);
  });

  it("supports rotated Door geometry and ignores routes that run parallel to a Door", () => {
    const rotatedCrossing = measureRouteDoorCrossings(
      [{ x: 0, y: -2 }, { x: 0, y: 2 }],
      { x: -0.5, y: 0 },
      { x: 0.5, y: 0 },
    );
    const parallel = measureRouteDoorCrossings(
      [{ x: 0.1, y: -2 }, { x: 0.1, y: 2 }],
      door.start,
      door.end,
    );

    expect(rotatedCrossing.crossings).toHaveLength(1);
    expect(routeDoorTransitOpacity(0.5, true, rotatedCrossing)).toBe(0.35);
    expect(parallel.crossings).toHaveLength(0);
  });

  it("fades only while active progress is near the crossing and restores after pause, restart, or a skip", () => {
    const crossing = measureRouteDoorCrossings(route, door.start, door.end);

    expect(routeDoorTransitOpacity(0.39, true, crossing)).toBe(1);
    expect(routeDoorTransitOpacity(0.45, true, crossing)).toBe(0.35);
    expect(routeDoorTransitOpacity(0.5, false, crossing)).toBe(1);
    expect(routeDoorTransitOpacity(0, true, crossing)).toBe(1);
    expect(routeDoorTransitOpacity(0.8, true, crossing)).toBe(1);
  });

  it("does not let camera sight-line occlusion fade unrelated Doors during Follow", () => {
    expect(shouldApplyDoorFocusOcclusion("door", true)).toBe(false);
    expect(shouldApplyDoorFocusOcclusion("door", false)).toBe(true);
    expect(shouldApplyDoorFocusOcclusion("wall", true)).toBe(true);
    expect(shouldApplyDoorFocusOcclusion("window", true)).toBe(true);
  });
});
