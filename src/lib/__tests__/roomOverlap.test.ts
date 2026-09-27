/**
 * Unit tests for room overlap detection and room-to-room edge snapping.
 */

import { describe, it, expect } from "vitest";
import { classifyRoomOverlap, findContainedRoomOutsideResizedParent, findNearbyRoomDuplicateOffset, resolveRoomAtPoint, roomsOverlap, findOverlappingRoom, snapRoomToNearbyEdges, computeRoomAlignmentGuides, computeAlignmentGuides, computeResizeAlignmentGuides, computeResizeLimits, snapResizeEdges, resolveStableAlignmentAxis, screenSpaceAlignmentThreshold, computeRoomCenterAlignment, relevantRoomForBounds } from "../roomOverlap";
import type { FloorRoom } from "../../components/map-builder/types";

function makeRoom(overrides: Partial<FloorRoom> = {}): FloorRoom {
  return {
    id: "r1",
    name: "Room",
    type: "classroom",
    x: 10,
    y: 10,
    w: 100,
    h: 80,
    floorId: "f1",
    buildingId: "b1",
    ...overrides,
  };
}

describe("roomsOverlap", () => {
  it("returns false for the same room", () => {
    const a = makeRoom({ id: "r1" });
    expect(roomsOverlap(a, a)).toBe(false);
  });

  it("returns false for completely separate rooms", () => {
    const a = makeRoom({ x: 10, y: 10, w: 100, h: 80 });
    const b = makeRoom({ id: "r2", x: 200, y: 200, w: 100, h: 80 });
    expect(roomsOverlap(a, b)).toBe(false);
  });

  it("returns false for edge-touching rooms (adjacent horizontal)", () => {
    const a = makeRoom({ x: 10, y: 10, w: 100, h: 80 });
    const b = makeRoom({ id: "r2", x: 110, y: 10, w: 100, h: 80 });
    expect(roomsOverlap(a, b)).toBe(false);
  });

  it("returns false for edge-touching rooms (adjacent vertical)", () => {
    const a = makeRoom({ x: 10, y: 10, w: 100, h: 80 });
    const b = makeRoom({ id: "r2", x: 10, y: 90, w: 100, h: 80 });
    expect(roomsOverlap(a, b)).toBe(false);
  });

  it("returns false for corner-touching rooms", () => {
    const a = makeRoom({ x: 10, y: 10, w: 100, h: 80 });
    const b = makeRoom({ id: "r2", x: 110, y: 90, w: 100, h: 80 });
    expect(roomsOverlap(a, b)).toBe(false);
  });

  it("returns true for significantly overlapping rooms", () => {
    const a = makeRoom({ x: 10, y: 10, w: 100, h: 80 });
    const b = makeRoom({ id: "r2", x: 50, y: 40, w: 100, h: 80 });
    expect(roomsOverlap(a, b)).toBe(true);
  });

  it("detects a partial strip overlap when parallel Room edges share the same y span", () => {
    const a = makeRoom({ id: "a", x: 80, y: 80, w: 240, h: 70 });
    const b = makeRoom({ id: "b", x: 300, y: 80, w: 100, h: 70 });
    expect(roomsOverlap(a, b)).toBe(true);
  });

  it("returns false for rooms overlapping within tolerance (1 unit)", () => {
    const a = makeRoom({ x: 10, y: 10, w: 100, h: 80 });
    const b = makeRoom({ id: "r2", x: 109, y: 10, w: 100, h: 80 });
    expect(roomsOverlap(a, b)).toBe(false);
  });

  it("treats a coincident duplicate footprint as overlap rather than nested containment", () => {
    const source = makeRoom({ id: "source", x: 100, y: 80, w: 120, h: 90 });
    const copy = makeRoom({ id: "copy", x: 100, y: 80, w: 120, h: 90 });
    expect(roomsOverlap(source, copy)).toBe(true);
  });

  it("allows a fully contained Room while keeping partial overlap invalid", () => {
    const outer = makeRoom({ id: "library", x: 20, y: 20, w: 300, h: 200 });
    const inner = makeRoom({ id: "journal", x: 80, y: 70, w: 90, h: 60 });
    const partial = makeRoom({ id: "partial", x: 280, y: 70, w: 80, h: 70 });
    expect(roomsOverlap(outer, inner)).toBe(false);
    expect(findOverlappingRoom(inner, [outer])).toBeNull();
    expect(roomsOverlap(outer, partial)).toBe(true);
    expect(findOverlappingRoom(partial, [outer])).toBe(outer);
  });

  it("classifies containment, partial overlap, and clear space distinctly", () => {
    const outer = makeRoom({ id: "library", x: 0, y: 0, w: 300, h: 300 });
    const inner = makeRoom({ id: "collab", x: 80, y: 60, w: 80, h: 80 });
    const partial = makeRoom({ id: "crossing", x: 290, y: 100, w: 60, h: 60 });
    const separate = makeRoom({ id: "separate", x: 400, y: 400, w: 40, h: 40 });
    expect(classifyRoomOverlap(outer, inner)).toBe("VALID_CONTAINMENT");
    expect(classifyRoomOverlap(outer, partial)).toBe("INVALID_PARTIAL_OVERLAP");
    expect(classifyRoomOverlap(outer, separate)).toBe("NO_OVERLAP");
  });

  it("allows a contained Room to share one or two parent walls", () => {
    const outer = makeRoom({ id: "parent", x: 0, y: 0, w: 300, h: 300 });
    const oneWall = makeRoom({ id: "one-wall", x: 220, y: 50, w: 80, h: 100 });
    const twoWalls = makeRoom({ id: "two-walls", x: 220, y: 220, w: 80, h: 80 });
    expect(classifyRoomOverlap(outer, oneWall)).toBe("VALID_CONTAINMENT");
    expect(classifyRoomOverlap(outer, twoWalls)).toBe("VALID_CONTAINMENT");
  });

  it("treats same and near-identical footprints as duplicate overlap, not containment", () => {
    const outer = makeRoom({ id: "source", x: 100, y: 80, w: 300, h: 300 });
    const exact = makeRoom({ id: "exact", x: 100, y: 80, w: 300, h: 300 });
    const near = makeRoom({ id: "near", x: 101, y: 80, w: 298, h: 299 });
    expect(classifyRoomOverlap(outer, exact)).toBe("INVALID_DUPLICATE_OVERLAP");
    expect(classifyRoomOverlap(outer, near)).toBe("INVALID_DUPLICATE_OVERLAP");
    expect(roomsOverlap(outer, near)).toBe(true);
  });

  it("allows multiple independent children but rejects overlap between children", () => {
    const parent = makeRoom({ id: "parent", x: 0, y: 0, w: 300, h: 300 });
    const childA = makeRoom({ id: "child-a", x: 30, y: 40, w: 80, h: 80 });
    const childB = makeRoom({ id: "child-b", x: 160, y: 40, w: 80, h: 80 });
    const overlappingChild = makeRoom({ id: "child-c", x: 90, y: 70, w: 80, h: 80 });
    expect(classifyRoomOverlap(parent, childA)).toBe("VALID_CONTAINMENT");
    expect(classifyRoomOverlap(parent, childB)).toBe("VALID_CONTAINMENT");
    expect(classifyRoomOverlap(childA, childB)).toBe("NO_OVERLAP");
    expect(classifyRoomOverlap(childA, overlappingChild)).toBe("INVALID_PARTIAL_OVERLAP");
  });

  it("uses custom polygon boundaries for containment and partial overlap", () => {
    const outer = makeRoom({
      id: "custom-library", x: 20, y: 20, w: 300, h: 220,
      shapePoints: [{ x: 20, y: 60 }, { x: 240, y: 20 }, { x: 320, y: 240 }, { x: 20, y: 240 }],
    });
    const inner = makeRoom({ id: "inside", x: 80, y: 90, w: 70, h: 55 });
    const outsideInBounds = makeRoom({ id: "outside-polygon", x: 260, y: 25, w: 25, h: 20 });
    const crossing = makeRoom({ id: "crossing", x: 210, y: 75, w: 80, h: 60 });
    expect(roomsOverlap(outer, inner)).toBe(false);
    expect(roomsOverlap(outer, outsideInBounds)).toBe(false);
    expect(roomsOverlap(outer, crossing)).toBe(true);
    expect(classifyRoomOverlap(outer, inner)).toBe("VALID_CONTAINMENT");
    expect(classifyRoomOverlap(outer, crossing)).toBe("INVALID_PARTIAL_OVERLAP");
  });
});

describe("findContainedRoomOutsideResizedParent", () => {
  it("blocks shrinking a parent so an existing child would be left outside", () => {
    const original = makeRoom({ id: "parent", x: 0, y: 0, w: 300, h: 300 });
    const child = makeRoom({ id: "child", x: 220, y: 80, w: 60, h: 60 });
    const resized = { ...original, w: 250 };
    expect(findContainedRoomOutsideResizedParent(original, resized, [child])).toBe(child);
  });

  it("does not block parent resizing while all children remain contained", () => {
    const original = makeRoom({ id: "parent", x: 0, y: 0, w: 300, h: 300 });
    const child = makeRoom({ id: "child", x: 80, y: 80, w: 60, h: 60 });
    const resized = { ...original, w: 250 };
    expect(findContainedRoomOutsideResizedParent(original, resized, [child])).toBeNull();
  });
});

describe("resolveRoomAtPoint", () => {
  it("chooses the deepest nested Room regardless of parent z-order, while preserving parent-only clicks", () => {
    const parent = makeRoom({ id: "library", x: 0, y: 0, w: 300, h: 300, zOrder: 100 });
    const childA = makeRoom({ id: "a", x: 30, y: 30, w: 100, h: 100, zOrder: 0 });
    const childB = makeRoom({ id: "b", x: 170, y: 30, w: 100, h: 100, zOrder: 0 });
    const grandchild = makeRoom({ id: "a-inner", x: 55, y: 55, w: 25, h: 25, zOrder: -5 });
    const rooms = [parent, childA, childB, grandchild];
    expect(resolveRoomAtPoint(rooms, { x: 60, y: 60 })?.id).toBe("a-inner");
    expect(resolveRoomAtPoint(rooms, { x: 40, y: 40 })?.id).toBe("a");
    expect(resolveRoomAtPoint(rooms, { x: 190, y: 50 })?.id).toBe("b");
    expect(resolveRoomAtPoint(rooms, { x: 10, y: 10 })?.id).toBe("library");
  });

  it("uses selected then frontmost z-order for coincident duplicates and partial-overlap peers", () => {
    const parent = makeRoom({ id: "parent", x: 0, y: 0, w: 300, h: 300 });
    const low = makeRoom({ id: "low", x: 50, y: 50, w: 100, h: 80, zOrder: 1 });
    const high = makeRoom({ id: "high", x: 50, y: 50, w: 100, h: 80, zOrder: 2 });
    const exactRooms = [parent, low, high];
    expect(resolveRoomAtPoint(exactRooms, { x: 70, y: 70 }, "low")?.id).toBe("low");
    expect(resolveRoomAtPoint(exactRooms, { x: 70, y: 70 })?.id).toBe("high");

    const overlapA = makeRoom({ id: "overlap-a", x: 20, y: 20, w: 100, h: 80, zOrder: 1 });
    const overlapB = makeRoom({ id: "overlap-b", x: 80, y: 20, w: 100, h: 80, zOrder: 3 });
    expect(resolveRoomAtPoint([overlapA, overlapB], { x: 90, y: 30 })?.id).toBe("overlap-b");
    expect(resolveRoomAtPoint([overlapA, overlapB], { x: 90, y: 30 }, "overlap-a")?.id).toBe("overlap-a");
  });

  it("ignores hidden Rooms and tests actual rotated and custom polygon outlines", () => {
    const parent = makeRoom({ id: "parent", x: 0, y: 0, w: 300, h: 300 });
    const hidden = makeRoom({ id: "hidden", x: 40, y: 40, w: 100, h: 100, visible: false });
    expect(resolveRoomAtPoint([parent, hidden], { x: 60, y: 60 })?.id).toBe("parent");

    const rotated = makeRoom({ id: "rotated", x: 100, y: 100, w: 100, h: 40, rotation: 45 });
    expect(resolveRoomAtPoint([parent, rotated], { x: 150, y: 120 })?.id).toBe("rotated");
    expect(resolveRoomAtPoint([parent, rotated], { x: 100, y: 120 })?.id).toBe("parent");

    const custom = makeRoom({
      id: "custom",
      x: 100,
      y: 100,
      w: 100,
      h: 100,
      shapePoints: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 100, y: 200 }],
    });
    expect(resolveRoomAtPoint([parent, custom], { x: 120, y: 120 })?.id).toBe("custom");
    expect(resolveRoomAtPoint([parent, custom], { x: 180, y: 180 })?.id).toBe("parent");
  });
});

describe("findNearbyRoomDuplicateOffset", () => {
  it("chooses a deterministic nearby edge-adjacent position when available", () => {
    const source = makeRoom({ id: "source", x: 20, y: 20, w: 100, h: 80 });
    expect(findNearbyRoomDuplicateOffset(source, [], 500, 400)).toEqual({ dx: 0, dy: 80 });
    expect(findNearbyRoomDuplicateOffset(source, [], 500, 400)).toEqual({ dx: 0, dy: 80 });
  });

  it("uses the custom polygon footprint when choosing a copy position", () => {
    const source = makeRoom({
      id: "custom-source", x: 20, y: 20, w: 100, h: 80,
      shapePoints: [{ x: 20, y: 35 }, { x: 100, y: 20 }, { x: 120, y: 90 }, { x: 35, y: 100 }],
    });
    expect(findNearbyRoomDuplicateOffset(source, [], 500, 400)).toEqual({ dx: 0, dy: 80 });
  });
});

describe("findOverlappingRoom", () => {
  it("returns null for non-overlapping candidate", () => {
    const rooms = [makeRoom({ x: 10, y: 10, w: 100, h: 80 })];
    const candidate = { x: 200, y: 200, w: 50, h: 50 };
    expect(findOverlappingRoom(candidate, rooms)).toBeNull();
  });

  it("returns the overlapping room", () => {
    const rooms = [makeRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80, name: "Existing" })];
    const candidate = { x: 50, y: 40, w: 100, h: 80, id: "r2" };
    const result = findOverlappingRoom(candidate, rooms);
    expect(result).toBeTruthy();
    expect(result!.name).toBe("Existing");
  });

  it("skips the candidate's own room id", () => {
    const rooms = [makeRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80 })];
    const candidate = { x: 10, y: 10, w: 100, h: 80, id: "r1" };
    expect(findOverlappingRoom(candidate, rooms)).toBeNull();
  });

  it("returns null for edge-touching candidate", () => {
    const rooms = [makeRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80 })];
    const candidate = { x: 110, y: 10, w: 100, h: 80, id: "r2" };
    expect(findOverlappingRoom(candidate, rooms)).toBeNull();
  });
});

describe("snapRoomToNearbyEdges", () => {
  it("returns original position when no rooms nearby", () => {
    const rooms = [makeRoom({ id: "r1", x: 500, y: 500, w: 100, h: 80 })];
    const candidate = { x: 10, y: 10, w: 100, h: 80, id: "r2" };
    const result = snapRoomToNearbyEdges(candidate, rooms);
    expect(result.x).toBe(10);
    expect(result.y).toBe(10);
  });

  it("snaps left edge to existing room's right edge", () => {
    const rooms = [makeRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80 })];
    // Candidate left edge is at 112, 2 units away from room right edge at 110
    const candidate = { x: 112, y: 10, w: 100, h: 80, id: "r2" };
    const result = snapRoomToNearbyEdges(candidate, rooms);
    expect(result.x).toBe(110);
    expect(result.y).toBe(10);
  });

  it("snaps right edge to existing room's right edge when closest", () => {
    const rooms = [makeRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80 })];
    // Candidate right edge at 108, 2 units from room right (110)
    // No overlap: candidate is well below room (y=200)
    const candidate = { x: 0, y: 200, w: 108, h: 80, id: "r2" };
    const result = snapRoomToNearbyEdges(candidate, rooms);
    expect(result.x).toBe(2);
    expect(result.y).toBe(200);
  });

  it("snaps top edge to existing room's bottom edge", () => {
    const rooms = [makeRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80 })];
    // Room bottom = 90. Candidate y=92, 2 units away
    const candidate = { x: 10, y: 92, w: 100, h: 80, id: "r2" };
    const result = snapRoomToNearbyEdges(candidate, rooms);
    expect(result.x).toBe(10);
    expect(result.y).toBe(90);
  });

  it("snaps bottom edge to existing room's top edge", () => {
    const rooms = [makeRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80 })];
    // Room top = 10. Candidate y=0, h=88 → bottom edge = 88, 2 units from 90
    const candidate = { x: 10, y: 0, w: 100, h: 88, id: "r2" };
    const result = snapRoomToNearbyEdges(candidate, rooms);
    expect(result.x).toBe(10);
    expect(result.y).toBe(2);
  });

  it("snaps to the closest edge (not the first found)", () => {
    // Two rooms: one far right, one close right
    const rooms = [
      makeRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80 }),
      makeRoom({ id: "r3", x: 200, y: 10, w: 100, h: 80 }),
    ];
    // Candidate left edge at 111, 1 unit from r1 right (110) and 89 units from r3 left (200)
    const candidate = { x: 111, y: 10, w: 50, h: 80, id: "r2" };
    const result = snapRoomToNearbyEdges(candidate, rooms);
    expect(result.x).toBe(110);
  });

  it("does not snap when beyond threshold (13+ units away)", () => {
    const rooms = [makeRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80 })];
    // Candidate left edge at 125, 15 units from room right (110)
    const candidate = { x: 125, y: 10, w: 50, h: 80, id: "r2" };
    const result = snapRoomToNearbyEdges(candidate, rooms);
    expect(result.x).toBe(125);
  });

  it("releases the lighter edge snap once the cursor is clearly outside the 8-unit assistance range", () => {
    const rooms = [makeRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80 })];
    const candidate = { x: 119, y: 10, w: 50, h: 80, id: "r2" };
    const result = snapRoomToNearbyEdges(candidate, rooms);
    expect(result.x).toBe(119);
  });

  it("does not snap to itself", () => {
    const rooms = [makeRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80 })];
    const candidate = { x: 10, y: 10, w: 100, h: 80, id: "r1" };
    const result = snapRoomToNearbyEdges(candidate, rooms);
    expect(result.x).toBe(10);
    expect(result.y).toBe(10);
  });

  it("snaps both axes when close to both edges", () => {
    const rooms = [makeRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80 })];
    // Room right=110, room bottom=90. Candidate at (112, 92) → snaps to (110, 90)
    const candidate = { x: 112, y: 92, w: 50, h: 50, id: "r2" };
    const result = snapRoomToNearbyEdges(candidate, rooms);
    expect(result.x).toBe(110);
    expect(result.y).toBe(90);
  });
});

describe("computeRoomAlignmentGuides", () => {
  const refRoom = makeRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80 });

  it("snaps left edge to left edge and produces a vertical guide", () => {
    const candidate = { x: 12, y: 50, w: 60, h: 40, id: "r2" };
    const result = computeRoomAlignmentGuides(candidate, [refRoom]);
    expect(result.snappedX).toBe(10);
    expect(result.guides.length).toBeGreaterThan(0);
    expect(result.guides[0].type).toBe("v");
  });

  it("snaps top edge to top edge and produces a horizontal guide", () => {
    const candidate = { x: 200, y: 12, w: 60, h: 40, id: "r2" };
    const result = computeRoomAlignmentGuides(candidate, [refRoom]);
    expect(result.snappedY).toBe(10);
    expect(result.guides.length).toBeGreaterThan(0);
    expect(result.guides[0].type).toBe("h");
  });

  it("supports center alignment (horizontal center)", () => {
    // refRoom cx = 10 + 100/2 = 60. Candidate cx should be 60 → x = 60 - 30 = 30
    const candidate = { x: 32, y: 200, w: 60, h: 40, id: "r2" };
    const result = computeRoomAlignmentGuides(candidate, [refRoom]);
    expect(result.snappedX).toBe(30);
  });

  it("snaps width to same width when checkSameSize=true", () => {
    // refRoom w=100. Candidate w=98 → snap to 100
    const candidate = { x: 200, y: 200, w: 98, h: 40, id: "r2" };
    const result = computeRoomAlignmentGuides(candidate, [refRoom], true);
    expect(result.snappedW).toBe(100);
  });

  it("snaps height to same height when checkSameSize=true", () => {
    // refRoom h=80. Candidate h=78 → snap to 80
    const candidate = { x: 200, y: 200, w: 60, h: 78, id: "r2" };
    const result = computeRoomAlignmentGuides(candidate, [refRoom], true);
    expect(result.snappedH).toBe(80);
  });

  it("does not produce guides when far from any room", () => {
    const candidate = { x: 400, y: 400, w: 60, h: 40, id: "r2" };
    const result = computeRoomAlignmentGuides(candidate, [refRoom]);
    expect(result.guides.length).toBe(0);
    expect(result.snappedX).toBe(400);
    expect(result.snappedY).toBe(400);
  });

  it("does not snap to itself", () => {
    const candidate = { x: 10, y: 10, w: 100, h: 80, id: "r1" };
    const result = computeRoomAlignmentGuides(candidate, [refRoom]);
    expect(result.guides.length).toBe(0);
  });

  it("no same-size snapping when checkSameSize=false (move mode)", () => {
    const candidate = { x: 200, y: 200, w: 98, h: 78, id: "r2" };
    const result = computeRoomAlignmentGuides(candidate, [refRoom], false);
    expect(result.snappedW).toBeUndefined();
    expect(result.snappedH).toBeUndefined();
  });
});

describe("contextual Room center alignment", () => {
  it("snaps an object to the exact horizontal and vertical Room axes", () => {
    const room = makeRoom({ id: "study", x: 100, y: 80, w: 300, h: 220 });
    const candidate = { x: 242, y: 182, w: 20, h: 16 };
    const result = computeRoomCenterAlignment(candidate, room, 8);
    expect(result.snappedX).toBe(240);
    expect(result.snappedY).toBe(182);
    expect(result.xGuide?.pos).toBe(250);
    expect(result.yGuide?.pos).toBe(190);
  });

  it("chooses the containing or immediately approached Room only", () => {
    const room = makeRoom({ id: "r1", x: 100, y: 100, w: 200, h: 160 });
    const other = makeRoom({ id: "r2", x: 500, y: 100, w: 200, h: 160 });
    expect(relevantRoomForBounds({ x: 150, y: 140, w: 20, h: 20 }, [room, other])?.id).toBe("r1");
    expect(relevantRoomForBounds({ x: 476, y: 140, w: 20, h: 20 }, [room, other], undefined, 8)?.id).toBe("r2");
    expect(relevantRoomForBounds({ x: 340, y: 140, w: 20, h: 20 }, [room, other], undefined, 8)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// computeResizeLimits — single source of truth for resize hard limits
// ═══════════════════════════════════════════════════════════════════════════

describe("computeResizeLimits", () => {
  const canvasW = 600;
  const canvasH = 450;

  it("east handle: floor right bound is the limit when no neighbors", () => {
    const origin = { x: 100, y: 100, w: 200, h: 100 };
    const limits = computeResizeLimits(origin, "e", [], canvasW, canvasH);
    expect(limits.minX).toBe(100); // left edge fixed
    expect(limits.maxX).toBe(600); // floor right
  });

  it("east handle: neighbor entirely to the right blocks expansion", () => {
    const origin = { x: 100, y: 100, w: 200, h: 100 };
    const neighbor = makeRoom({ id: "r2", x: 400, y: 100, w: 100, h: 80 });
    const limits = computeResizeLimits(origin, "e", [neighbor], canvasW, canvasH);
    expect(limits.maxX).toBe(400); // neighbor's left edge
  });

  it("east handle: room inside current bounds is NOT a hard limit", () => {
    const origin = { x: 100, y: 100, w: 300, h: 100 };
    // This room is inside origin's bounds (x=200 is between 100 and 400)
    const inside = makeRoom({ id: "r2", x: 200, y: 120, w: 50, h: 50 });
    const limits = computeResizeLimits(origin, "e", [inside], canvasW, canvasH);
    expect(limits.maxX).toBe(600); // not blocked by inside room
  });

  it("west handle: floor left bound is the limit when no neighbors", () => {
    const origin = { x: 300, y: 100, w: 200, h: 100 };
    const limits = computeResizeLimits(origin, "w", [], canvasW, canvasH);
    expect(limits.minX).toBe(0); // floor left
    expect(limits.maxX).toBe(500); // right edge fixed
  });

  it("west handle: neighbor entirely to the left blocks expansion", () => {
    const origin = { x: 300, y: 100, w: 200, h: 100 };
    const neighbor = makeRoom({ id: "r2", x: 50, y: 100, w: 100, h: 80 });
    const limits = computeResizeLimits(origin, "w", [neighbor], canvasW, canvasH);
    expect(limits.minX).toBe(150); // neighbor's right edge
  });

  it("west handle: room inside current bounds is NOT a hard limit", () => {
    const origin = { x: 100, y: 100, w: 300, h: 100 };
    // This room is inside origin's bounds (x=200, right=250, inside 100..400)
    const inside = makeRoom({ id: "r2", x: 200, y: 120, w: 50, h: 50 });
    const limits = computeResizeLimits(origin, "w", [inside], canvasW, canvasH);
    expect(limits.minX).toBe(0); // not blocked by inside room
  });

  it("south handle: floor bottom bound is the limit when no neighbors", () => {
    const origin = { x: 100, y: 50, w: 200, h: 100 };
    const limits = computeResizeLimits(origin, "s", [], canvasW, canvasH);
    expect(limits.minY).toBe(50); // top edge fixed
    expect(limits.maxY).toBe(450); // floor bottom
  });

  it("south handle: neighbor below blocks expansion", () => {
    const origin = { x: 100, y: 50, w: 200, h: 100 };
    const neighbor = makeRoom({ id: "r2", x: 150, y: 200, w: 100, h: 80 });
    const limits = computeResizeLimits(origin, "s", [neighbor], canvasW, canvasH);
    expect(limits.maxY).toBe(200); // neighbor's top edge
  });

  it("north handle: floor top bound is the limit when no neighbors", () => {
    const origin = { x: 100, y: 200, w: 200, h: 150 };
    const limits = computeResizeLimits(origin, "n", [], canvasW, canvasH);
    expect(limits.minY).toBe(0); // floor top
    expect(limits.maxY).toBe(350); // bottom edge fixed
  });

  it("north handle: neighbor above blocks expansion", () => {
    const origin = { x: 100, y: 200, w: 200, h: 150 };
    const neighbor = makeRoom({ id: "r2", x: 150, y: 50, w: 100, h: 100 });
    const limits = computeResizeLimits(origin, "n", [neighbor], canvasW, canvasH);
    expect(limits.minY).toBe(150); // neighbor's bottom edge
  });    it("handles corner se by computing both horizontal and vertical limits", () => {
    const origin = { x: 100, y: 100, w: 200, h: 100 };
    const neighborRight = makeRoom({ id: "r2", x: 400, y: 100, w: 100, h: 80 });
    const neighborBelow = makeRoom({ id: "r3", x: 150, y: 250, w: 100, h: 80 });
    const limits = computeResizeLimits(origin, "se", [neighborRight, neighborBelow], canvasW, canvasH);
    expect(limits.maxX).toBe(400); // right neighbor
    expect(limits.maxY).toBe(250); // below neighbor
  });

  it("only counts rooms that overlap vertically for horizontal limits", () => {
    const origin = { x: 100, y: 100, w: 200, h: 100 };
    // This neighbor is far below — no vertical overlap
    const farBelow = makeRoom({ id: "r2", x: 350, y: 400, w: 100, h: 40 });
    const limits = computeResizeLimits(origin, "e", [farBelow], canvasW, canvasH);
    expect(limits.maxX).toBe(600); // not blocked — no vertical overlap
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// snapResizeEdges — resize-specific edge snapping within valid limits
// ═══════════════════════════════════════════════════════════════════════════

describe("snapResizeEdges", () => {
  const canvasW = 600;
  const canvasH = 450;

  it("east handle: snaps right edge to neighbor's left edge", () => {
    const origin = { x: 100, y: 100, w: 200, h: 100 };
    const neighbor = makeRoom({ id: "r2", x: 303, y: 100, w: 100, h: 80 });
    const limits = computeResizeLimits(origin, "e", [neighbor], canvasW, canvasH);
    const candidate = { x: 100, y: 100, w: 205, h: 100, id: "r1" };
    const result = snapResizeEdges(candidate, "e", limits, [neighbor]);
    // Right edge (305) should snap to neighbor left (303) — within threshold 2
    expect(result.w).toBe(203); // 303 - 100
    expect(result.x).toBe(100); // anchor preserved
  });

  it("west handle: snaps left edge to neighbor's right edge", () => {
    const origin = { x: 200, y: 100, w: 200, h: 100 };
    const neighbor = makeRoom({ id: "r2", x: 50, y: 100, w: 148, h: 80 });
    // neighbor right = 198
    const limits = computeResizeLimits(origin, "w", [neighbor], canvasW, canvasH);
    const candidate = { x: 197, y: 100, w: 203, h: 100, id: "r1" };
    // candidate left = 197, distance to neighbor right = 1 (within threshold 2)
    const result = snapResizeEdges(candidate, "w", limits, [neighbor]);
    expect(result.x).toBe(198);
    expect(result.w).toBe(202); // rightEdge(400) - 198
  });

  it("east handle: snap respects limits.maxX when clamping width", () => {
    const origin = { x: 500, y: 100, w: 80, h: 100 };
    // Neighbor at x=550 limits expansion
    const neighbor = makeRoom({ id: "r2", x: 550, y: 100, w: 40, h: 80 });
    const limits = computeResizeLimits(origin, "e", [neighbor], canvasW, canvasH);
    const candidate = { x: 500, y: 100, w: 60, h: 100, id: "r1" };
    const result = snapResizeEdges(candidate, "e", limits, [neighbor]);
    // Right edge (560) snaps to neighbor left (550), clamped to limits
    expect(result.x + result.w).toBeLessThanOrEqual(limits.maxX);
    expect(result.x).toBe(500); // anchor preserved
  });

  it("west handle: snap respects limits.minX when clamping width", () => {
    const origin = { x: 10, y: 100, w: 80, h: 100 };
    // Neighbor at x=0..5 limits expansion leftward
    const neighbor = makeRoom({ id: "r2", x: 0, y: 100, w: 5, h: 80 });
    const limits = computeResizeLimits(origin, "w", [neighbor], canvasW, canvasH);
    const candidate = { x: 5, y: 100, w: 85, h: 100, id: "r1" };
    const result = snapResizeEdges(candidate, "w", limits, [neighbor]);
    expect(result.x).toBeGreaterThanOrEqual(limits.minX);
    // Right edge preserved (anchor)
    expect(result.x + result.w).toBe(origin.x + origin.w);
  });

  it("does not snap to rooms outside the valid range", () => {
    const origin = { x: 100, y: 100, w: 200, h: 100 };
    const blocking = makeRoom({ id: "r2", x: 300, y: 100, w: 50, h: 80 });
    // Far-away room to the right — should not be snap target because blocking
    const far = makeRoom({ id: "r3", x: 450, y: 100, w: 50, h: 80 });
    const limits = computeResizeLimits(origin, "e", [blocking, far], canvasW, canvasH);
    const candidate = { x: 100, y: 100, w: 198, h: 100, id: "r1" };
    const result = snapResizeEdges(candidate, "e", limits, [blocking, far]);
    // Right edge (298) is 2 from blocking left (300) — should snap to 300
    expect(result.w).toBe(200); // 300 - 100
    expect(result.x + result.w).toBeLessThanOrEqual(limits.maxX);
  });

  it("south handle: snaps bottom edge to neighbor's top edge", () => {
    const origin = { x: 100, y: 50, w: 200, h: 148 };
    const neighbor = makeRoom({ id: "r2", x: 150, y: 202, w: 100, h: 80 });
    const limits = computeResizeLimits(origin, "s", [neighbor], canvasW, canvasH);
    // candidate bottom = 50 + 154 = 204, neighbor top = 202, distance = 2 (within threshold)
    const candidate = { x: 100, y: 50, w: 200, h: 154, id: "r1" };
    const result = snapResizeEdges(candidate, "s", limits, [neighbor]);
    expect(result.h).toBe(152); // 202 - 50
    expect(result.y).toBe(50); // anchor preserved
  });

  it("north handle: snaps top edge to neighbor's bottom edge", () => {
    const origin = { x: 100, y: 150, w: 200, h: 150 };
    const neighbor = makeRoom({ id: "r2", x: 150, y: 30, w: 100, h: 118 });
    // neighbor bottom = 148
    const limits = computeResizeLimits(origin, "n", [neighbor], canvasW, canvasH);
    // candidate top = 147, distance to neighbor bottom = 1 (within threshold 2)
    const candidate = { x: 100, y: 147, w: 200, h: 153, id: "r1" };
    const result = snapResizeEdges(candidate, "n", limits, [neighbor]);
    expect(result.y).toBe(148);
    expect(result.h).toBe(152); // bottomEdge(300) - 148
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Issue 2A — computeAlignmentGuides guide positions (left/right/center)
// ═══════════════════════════════════════════════════════════════════════════

describe("computeAlignmentGuides (universal move/placement alignment)", () => {
  const refs = [{ id: "r1", x: 100, y: 100, w: 100, h: 80 }];

  it("left-edge match places the vertical guide at the MATCHED left edge", () => {
    // Candidate left (102) within 3 of ref left (100) → snap left→left.
    const result = computeAlignmentGuides({ x: 102, y: 150, w: 60, h: 40, id: "r2" }, refs);
    expect(result.snappedX).toBe(100);
    const v = result.guides.find((g) => g.type === "v");
    expect(v).toBeDefined();
    // Guide must be at the shared edge (100), NOT the candidate's right edge.
    expect(v!.pos).toBe(100);
  });

  it("right-edge match places the vertical guide at the matched right edge", () => {
    // Candidate right (203) within 3 of ref right (200) → snap right→right.
    const result = computeAlignmentGuides({ x: 143, y: 150, w: 60, h: 40, id: "r2" }, refs);
    expect(result.snappedX).toBe(140); // right edge 200 - w 60
    const v = result.guides.find((g) => g.type === "v");
    expect(v).toBeDefined();
    expect(v!.pos).toBe(200);
  });

  it("center-X match places the vertical guide at the shared center", () => {
    // ref cx = 150; candidate cx should be 150 → x = 150 - 30 = 120.
    const result = computeAlignmentGuides({ x: 122, y: 200, w: 60, h: 40, id: "r2" }, refs);
    expect(result.snappedX).toBe(120);
    const v = result.guides.find((g) => g.type === "v");
    expect(v).toBeDefined();
    expect(v!.pos).toBe(150);
  });

  it("top-edge match places the horizontal guide at the matched top edge", () => {
    const result = computeAlignmentGuides({ x: 300, y: 101, w: 60, h: 40, id: "r2" }, refs);
    expect(result.snappedY).toBe(100);
    const h = result.guides.find((g) => g.type === "h");
    expect(h).toBeDefined();
    expect(h!.pos).toBe(100);
  });

  it("no guide when nothing is within threshold", () => {
    const result = computeAlignmentGuides({ x: 400, y: 400, w: 60, h: 40, id: "r2" }, refs);
    expect(result.guides.length).toBe(0);
    expect(result.snappedX).toBe(400);
    expect(result.snappedY).toBe(400);
  });

  it("keeps a snap target stable while raw movement stays within release hysteresis", () => {
    const guide = { type: "v" as const, pos: 100, x1: 100, y1: 0, x2: 100, y2: 400 };
    const first = resolveStableAlignmentAxis(103, 100, guide, null);
    const next = resolveStableAlignmentAxis(106, 108, { ...guide, pos: 108, x1: 108, x2: 108 }, first.lock);
    expect(first.snapped).toBe(true);
    expect(next.lock).toBe(first.lock);
    expect(next.position).toBe(100);
    expect(next.delta).toBe(-6);
  });

  it("releases a locked target only after the raw position leaves the release range", () => {
    const guide = { type: "v" as const, pos: 100, x1: 100, y1: 0, x2: 100, y2: 400 };
    const first = resolveStableAlignmentAxis(103, 100, guide, null);
    const released = resolveStableAlignmentAxis(109, 109, undefined, first.lock);
    expect(released.lock).toBeNull();
    expect(released.snapped).toBe(false);
    expect(released.position).toBe(109);
  });
});

describe("screen-space alignment tolerance", () => {
  it("keeps the physical snap window stable across zoom levels", () => {
    expect(screenSpaceAlignmentThreshold(1)).toBe(6);
    expect(screenSpaceAlignmentThreshold(2)).toBe(3);
    expect(screenSpaceAlignmentThreshold(0.25)).toBe(12);
  });

  it("allows callers to keep guides visible without broad world-unit snapping", () => {
    const ref = makeRoom({ id: "ref", x: 100, y: 100, w: 80, h: 60 });
    const candidate = { x: 107, y: 220, w: 40, h: 30, id: "moving" };
    expect(computeAlignmentGuides(candidate, [{ x: ref.x, y: ref.y, w: ref.w, h: ref.h, id: ref.id }], 4).guides).toHaveLength(0);
    expect(computeAlignmentGuides(candidate, [{ x: ref.x, y: ref.y, w: ref.w, h: ref.h, id: ref.id }], 8).guides.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Issue 3 — same-width / same-height resize snapping + guides
// ═══════════════════════════════════════════════════════════════════════════

describe("snapResizeEdges — same-size snapping (Issue 3)", () => {
  const canvasW = 600;
  const canvasH = 450;

  it("east handle: snaps width to a nearby room's exact width", () => {
    const origin = { x: 100, y: 100, w: 200, h: 100 };
    // Neighbor width 240 — candidate resized to ~241 should snap to exactly 240.
    const neighbor = makeRoom({ id: "r2", x: 320, y: 300, w: 240, h: 80 });
    const limits = computeResizeLimits(origin, "e", [neighbor], canvasW, canvasH);
    const candidate = { x: 100, y: 100, w: 241, h: 100, id: "r1" };
    const result = snapResizeEdges(candidate, "e", limits, [neighbor]);
    expect(result.w).toBe(240);
    expect(result.x).toBe(100); // anchor preserved
    // Same-size guides: vertical lines at BOTH edges of the matched width.
    expect(result.guides.some((g) => g.type === "v" && g.pos === 100)).toBe(true);
    expect(result.guides.some((g) => g.type === "v" && g.pos === 340)).toBe(true);
  });

  it("south handle: snaps height to a nearby room's exact height", () => {
    const origin = { x: 100, y: 50, w: 200, h: 100 };
    const neighbor = makeRoom({ id: "r2", x: 400, y: 300, w: 100, h: 132 });
    const limits = computeResizeLimits(origin, "s", [neighbor], canvasW, canvasH);
    const candidate = { x: 100, y: 50, w: 200, h: 131, id: "r1" };
    const result = snapResizeEdges(candidate, "s", limits, [neighbor]);
    expect(result.h).toBe(132);
    expect(result.y).toBe(50); // anchor preserved
    expect(result.guides.some((g) => g.type === "h" && g.pos === 50)).toBe(true);
    expect(result.guides.some((g) => g.type === "h" && g.pos === 182)).toBe(true);
  });

  it("same-size snap never violates floor bounds or overlap limits", () => {
    const origin = { x: 100, y: 100, w: 200, h: 100 };
    // Neighbor width 500 is far beyond what the east handle can reach.
    const neighbor = makeRoom({ id: "r2", x: 350, y: 300, w: 500, h: 80 });
    const limits = computeResizeLimits(origin, "e", [neighbor], canvasW, canvasH);
    const candidate = { x: 100, y: 100, w: 498, h: 100, id: "r1" };
    const result = snapResizeEdges(candidate, "e", limits, [neighbor]);
    // Width must be clamped inside the valid range (cannot cross neighbor left edge).
    expect(result.x + result.w).toBeLessThanOrEqual(limits.maxX);
    expect(result.w).toBeGreaterThanOrEqual(20);
  });

  it("does NOT same-size snap when the difference is beyond threshold", () => {
    const origin = { x: 100, y: 100, w: 200, h: 100 };
    const neighbor = makeRoom({ id: "r2", x: 320, y: 300, w: 240, h: 80 });
    const limits = computeResizeLimits(origin, "e", [neighbor], canvasW, canvasH);
    const candidate = { x: 100, y: 100, w: 260, h: 100, id: "r1" };
    const result = snapResizeEdges(candidate, "e", limits, [neighbor]);
    expect(result.w).toBe(260);
  });
});

describe("computeResizeAlignmentGuides — same-size (Issue 3, furniture/circulation)", () => {
  const refs = [{ id: "r1", x: 100, y: 100, w: 240, h: 132 }];

  it("snaps width and height and emits same-size guide lines", () => {
    const result = computeResizeAlignmentGuides({ x: 200, y: 200, w: 241, h: 131, id: "r2" }, refs, true);
    expect(result.snappedW).toBe(240);
    expect(result.snappedH).toBe(132);
    expect(result.guides.some((g) => g.type === "v" && g.pos === result.snappedX)).toBe(true);
    expect(result.guides.some((g) => g.type === "h" && g.pos === result.snappedY)).toBe(true);
  });

  it("no same-size snap when checkSameSize is false", () => {
    const result = computeResizeAlignmentGuides({ x: 200, y: 200, w: 241, h: 131, id: "r2" }, refs, false);
    expect(result.snappedW).toBeUndefined();
    expect(result.snappedH).toBeUndefined();
  });
});
