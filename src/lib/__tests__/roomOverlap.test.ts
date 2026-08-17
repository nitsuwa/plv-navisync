/**
 * Unit tests for room overlap detection utility.
 */

import { describe, it, expect } from "vitest";
import { roomsOverlap, findOverlappingRoom } from "../roomOverlap";
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

  it("returns true for clearly overlapping rooms", () => {
    const a = makeRoom({ x: 10, y: 10, w: 100, h: 80 });
    const b = makeRoom({ id: "r2", x: 50, y: 50, w: 100, h: 80 });
    expect(roomsOverlap(a, b)).toBe(true);
  });

  it("returns true when one room fully contains another", () => {
    const a = makeRoom({ x: 10, y: 10, w: 200, h: 200 });
    const b = makeRoom({ id: "r2", x: 30, y: 30, w: 50, h: 50 });
    expect(roomsOverlap(a, b)).toBe(true);
  });

  it("returns false for rooms that only overlap by a tiny margin (floating-point snap)", () => {
    // Overlap of 1px on one axis only — this is within the tolerance
    const a = makeRoom({ x: 10, y: 10, w: 100, h: 80 });
    const b = makeRoom({ id: "r2", x: 109, y: 10, w: 100, h: 80 });
    expect(roomsOverlap(a, b)).toBe(false);
  });
});

describe("findOverlappingRoom", () => {
  it("returns null for empty room list", () => {
    const result = findOverlappingRoom({ x: 10, y: 10, w: 100, h: 80 }, []);
    expect(result).toBeNull();
  });

  it("returns null when no overlap exists", () => {
    const rooms = [
      makeRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80 }),
    ];
    const result = findOverlappingRoom({ x: 200, y: 200, w: 100, h: 80 }, rooms);
    expect(result).toBeNull();
  });

  it("returns the overlapping room", () => {
    const rooms = [
      makeRoom({ id: "r1", x: 200, y: 200, w: 100, h: 80 }),
      makeRoom({ id: "r2", x: 50, y: 50, w: 100, h: 80 }),
    ];
    const result = findOverlappingRoom({ x: 60, y: 60, w: 80, h: 60 }, rooms);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("r2");
  });

  it("skips the candidate's own id", () => {
    const rooms = [
      makeRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80 }),
    ];
    const result = findOverlappingRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80 }, rooms);
    expect(result).toBeNull();
  });

  it("allows edge-touching candidates", () => {
    const rooms = [
      makeRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80 }),
    ];
    // Adjacent — edge at x=110
    const result = findOverlappingRoom({ x: 110, y: 10, w: 100, h: 80 }, rooms);
    expect(result).toBeNull();
  });

  it("detects overlap with multiple rooms", () => {
    const rooms = [
      makeRoom({ id: "r1", x: 10, y: 10, w: 100, h: 80 }),
      makeRoom({ id: "r2", x: 200, y: 200, w: 100, h: 80 }),
      makeRoom({ id: "r3", x: 50, y: 50, w: 100, h: 80 }),
    ];
    const result = findOverlappingRoom({ x: 60, y: 60, w: 80, h: 60 }, rooms);
    expect(result).not.toBeNull();
    expect(["r1", "r3"]).toContain(result!.id);
  });
});
