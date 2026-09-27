import { describe, expect, it } from "vitest";
import type { FloorRoom, FloorWall } from "../../components/map-builder/types";
import {
  fitRoomToWalls,
  isValidRoomShape,
  roomOutlinePoints,
  roomShapeArea,
  roomShapeBounds,
  translateRoomShape,
} from "../roomShape";
import { resizeRoomWithinFloor, rotateFloorItem, scaleFloorItemFromBounds } from "../floorGeometry";
import { floorShapeContainsPolygon, getFloorShapeRegions } from "../floorShape";

const room: FloorRoom = {
  id: "room-1",
  name: "Slanted Room",
  type: "classroom",
  x: 100,
  y: 20,
  w: 200,
  h: 200,
  floorId: "floor-1",
  buildingId: "building-1",
};

function wall(id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<FloorWall> = {}): FloorWall {
  return { id, x1, y1, x2, y2, thickness: 4, color: "#334155", ...extra };
}

describe("Room custom shape authoring geometry", () => {
  it("keeps legacy Rooms rectangular", () => {
    expect(roomOutlinePoints(room)).toEqual([
      { x: 100, y: 20 },
      { x: 300, y: 20 },
      { x: 300, y: 220 },
      { x: 100, y: 220 },
    ]);
  });

  it("validates and measures a Room with one slanted side", () => {
    const points = [
      { x: 100, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 220 },
      { x: 100, y: 200 },
    ];
    expect(isValidRoomShape(points, 600, 450)).toBe(true);
    expect(roomShapeArea(points)).toBe(42000);
    expect(roomShapeBounds(points)).toEqual({ x: 100, y: 0, w: 200, h: 220 });
  });

  it("fits a Room to authored Walls plus a managed perimeter", () => {
    const fitted = fitRoomToWalls(room, [
      wall("top", 0, 0, 600, 0, { managedKind: "perimeter", perimeterSide: "top" }),
      wall("left", 100, 0, 100, 200),
      wall("right", 300, 0, 300, 220),
      wall("slanted-bottom", 100, 200, 300, 220),
    ], 600, 450);
    expect(fitted).not.toBeNull();
    expect(fitted?.[2]).toEqual({ x: 300, y: 220 });
    expect(fitted?.[3]).toEqual({ x: 100, y: 200 });
  });

  it("rejects self-intersecting Room outlines", () => {
    expect(isValidRoomShape([
      { x: 20, y: 20 },
      { x: 100, y: 100 },
      { x: 20, y: 100 },
      { x: 100, y: 20 },
    ], 600, 450)).toBe(false);
  });

  it("translates every custom vertex rigidly", () => {
    const source = { ...room, shapePoints: [{ x: 100, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 220 }, { x: 100, y: 200 }] };
    const moved = translateRoomShape(source, 12, -4);
    expect(moved.shapePoints).toEqual([
      { x: 112, y: -4 },
      { x: 312, y: -4 },
      { x: 312, y: 216 },
      { x: 112, y: 196 },
    ]);
    expect(moved.x).toBe(112);
    expect(moved.y).toBe(16);
  });

  it("keeps custom vertices in the same relative shape when the Room bounds resize", () => {
    const source: FloorRoom = {
      ...room,
      shapePoints: [
        { x: 100, y: 20 },
        { x: 300, y: 20 },
        { x: 300, y: 220 },
        { x: 100, y: 200 },
      ],
    };
    const resized = resizeRoomWithinFloor(source, "se", 50, 40, 600, 450);

    expect(resized).toMatchObject({ x: 100, y: 20, w: 250, h: 240 });
    expect(resized.shapePoints).toEqual([
      { x: 100, y: 20 },
      { x: 350, y: 20 },
      { x: 350, y: 260 },
      { x: 100, y: 236 },
    ]);
    expect(resized.shapePoints?.[2].y! - resized.shapePoints?.[3].y!).toBe(24);
  });

  it("resizes a Room inside an Extension without clamping to the base canvas", () => {
    const regions = getFloorShapeRegions({
      canvasW: 220,
      canvasH: 160,
      extensions: [{ id: "right", side: "right", offset: 30, width: 100, depth: 100 }],
    });
    const source: FloorRoom = { ...room, x: 235, y: 55, w: 45, h: 40 };
    const resized = resizeRoomWithinFloor(source, "e", 25, 0, 220, 160, regions);

    expect(resized).toMatchObject({ x: 235, y: 55, w: 70, h: 40 });
    expect(floorShapeContainsPolygon(regions, roomOutlinePoints(resized))).toBe(true);
  });

  it("supports all eight Room resize handles inside an Extension", () => {
    const regions = getFloorShapeRegions({
      canvasW: 220,
      canvasH: 160,
      extensions: [{ id: "right", side: "right", offset: 0, width: 160, depth: 180 }],
    });
    const source: FloorRoom = { ...room, x: 270, y: 55, w: 30, h: 30 };
    for (const corner of ["nw", "n", "ne", "w", "e", "sw", "s", "se"]) {
      const resized = resizeRoomWithinFloor(source, corner, corner.includes("w") || corner === "nw" || corner === "sw" ? -5 : corner.includes("e") ? 5 : 0,
        corner.includes("n") ? -5 : corner.includes("s") ? 5 : 0, 220, 160, regions);
      expect(floorShapeContainsPolygon(regions, roomOutlinePoints(resized)), corner).toBe(true);
      expect(resized.w >= source.w && resized.h >= source.h, corner).toBe(true);
    }
  });

  it("uses the rotated Room footprint while resizing inside an Extension", () => {
    const regions = getFloorShapeRegions({
      canvasW: 220,
      canvasH: 160,
      extensions: [{ id: "right", side: "right", offset: 0, width: 160, depth: 180 }],
    });
    const source: FloorRoom = { ...room, x: 270, y: 55, w: 30, h: 30, rotation: 45 };
    const resized = resizeRoomWithinFloor(source, "e", 5, 0, 220, 160, regions);
    expect(resized.w).toBeGreaterThan(30);
    expect(resized.w).toBeLessThanOrEqual(35);
    expect(floorShapeContainsPolygon(regions, roomOutlinePoints(resized))).toBe(true);
  });

  it("allows a Room to span the base/Extension seam but rejects the gray notch", () => {
    const regions = getFloorShapeRegions({
      canvasW: 220,
      canvasH: 160,
      extensions: [{ id: "right", side: "right", offset: 30, width: 100, depth: 100 }],
    });
    const seamRoom: FloorRoom = { ...room, x: 180, y: 50, w: 100, h: 60 };
    expect(floorShapeContainsPolygon(regions, roomOutlinePoints(seamRoom))).toBe(true);

    const bottomRegions = getFloorShapeRegions({
      canvasW: 220,
      canvasH: 160,
      extensions: [{ id: "bottom", side: "bottom", offset: 80, width: 60, depth: 80 }],
    });
    const notchRoom: FloorRoom = { ...room, x: 150, y: 155, w: 100, h: 50 };
    expect(floorShapeContainsPolygon(bottomRegions, roomOutlinePoints(notchRoom))).toBe(false);
  });

  it("renders a rotated custom outline from raw points without baking rotation into them", () => {
    const source: FloorRoom = {
      ...room,
      shapePoints: [
        { x: 100, y: 20 },
        { x: 300, y: 20 },
        { x: 300, y: 220 },
        { x: 100, y: 200 },
      ],
      rotation: 90,
    };
    const rendered = roomOutlinePoints(source);

    expect(source.shapePoints?.[0]).toEqual({ x: 100, y: 20 });
    expect(rendered[0].x).toBeCloseTo(300);
    expect(rendered[0].y).toBeCloseTo(20);
    expect(roomShapeBounds(rendered).x).toBeCloseTo(100);
    expect(roomShapeBounds(rendered).y).toBeCloseTo(20);
    expect(roomShapeBounds(rendered).w).toBeCloseTo(200);
    expect(roomShapeBounds(rendered).h).toBeCloseTo(200);
  });

  it("preserves the Room rotation while resizing a rotated custom outline", () => {
    const source: FloorRoom = {
      ...room,
      shapePoints: [
        { x: 100, y: 20 },
        { x: 300, y: 20 },
        { x: 300, y: 220 },
        { x: 100, y: 200 },
      ],
      rotation: 30,
    };
    const resized = resizeRoomWithinFloor(source, "e", 30, 0, 600, 450);

    expect(resized.rotation).toBe(30);
    expect(resized.w).toBeGreaterThan(source.w);
    expect(resized.shapePoints?.[1].x).toBeGreaterThan(source.shapePoints[1].x);
    expect(resized.shapePoints).toHaveLength(4);
    expect(isValidRoomShape(resized.shapePoints ?? [], 600, 450)).toBe(true);
  });

  it("keeps custom points in the Room local frame during grouped rotation", () => {
    const source: FloorRoom = {
      ...room,
      shapePoints: [
        { x: 100, y: 20 },
        { x: 300, y: 20 },
        { x: 300, y: 220 },
        { x: 100, y: 200 },
      ],
    };
    const rotated = rotateFloorItem("room", source, 400, 300, 90, 600, 450) as FloorRoom;

    expect(rotated.rotation).toBe(90);
    expect(rotated.shapePoints?.[0].x).toBeCloseTo(480);
    expect(rotated.shapePoints?.[0].y).toBeCloseTo(0);
    expect(roomOutlinePoints(rotated)[0].x).toBeCloseTo(680);
    expect(roomOutlinePoints(rotated)[0].y).toBeCloseTo(0);
  });

  it("scales custom points with the Room in a grouped resize", () => {
    const source: FloorRoom = {
      ...room,
      shapePoints: [
        { x: 100, y: 20 },
        { x: 300, y: 20 },
        { x: 300, y: 220 },
        { x: 100, y: 200 },
      ],
    };
    const scaled = scaleFloorItemFromBounds(
      "room",
      source,
      { x: 0, y: 0, w: 600, h: 450 },
      { x: 0, y: 0, w: 300, h: 225 },
      600,
      450,
    ) as FloorRoom;

    expect(scaled.shapePoints).toEqual([
      { x: 50, y: 10 },
      { x: 150, y: 10 },
      { x: 150, y: 110 },
      { x: 50, y: 100 },
    ]);
  });
});
