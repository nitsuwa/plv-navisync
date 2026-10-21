import { describe, expect, it } from "vitest";
import type { FloorDoor, FloorWall, FloorWindow } from "../components/map-builder/types";
import { resolveWallOpeningGeometry, resizeWallOpeningAlongWall } from "./floorGeometry";

const horizontal: FloorWall = { id: "wall-h", x1: 0, y1: 0, x2: 200, y2: 0, thickness: 6, color: "#334155" };
const vertical: FloorWall = { id: "wall-v", x1: 10, y1: 0, x2: 10, y2: 200, thickness: 6, color: "#334155" };
const door = (wall: FloorWall, offset = 0.5, width = 32): FloorDoor => ({
  id: "door-a", x: wall.x1 + (wall.x2 - wall.x1) * offset, y: wall.y1 + (wall.y2 - wall.y1) * offset,
  wallId: wall.id, offset, width, direction: "left", hinge: "left", swingSide: "a", color: "#92400e",
});
const windowOpening = (wall: FloorWall, offset = 0.5, width = 32): FloorWindow => ({
  id: "window-a", x: wall.x1 + (wall.x2 - wall.x1) * offset, y: wall.y1 + (wall.y2 - wall.y1) * offset,
  wallId: wall.id, offset, width, height: 8, color: "#0284c7",
});

describe("wall-mounted Door and Window resizing", () => {
  it("resizes a horizontal Door along the wall and keeps the opposite endpoint fixed", () => {
    const original = door(horizontal);
    const result = resizeWallOpeningAlongWall({ wall: horizontal, opening: original, pointer: { x: 68, y: 8 }, handleSign: -1, minWidth: 10, maxWidth: 48 });
    expect(result).not.toBeNull();
    expect(result!.width).toBe(48);
    expect(result!.fixedEdge).toBeCloseTo(116);
    expect(result!.movingEdge).toBeCloseTo(68);
    expect(result!.y).toBe(0);
    expect(result!.offset).toBeCloseTo(0.46);
  });

  it("resizes a vertical Window only along Y and keeps it on the host centerline", () => {
    const original = windowOpening(vertical);
    const result = resizeWallOpeningAlongWall({ wall: vertical, opening: original, pointer: { x: 22, y: 68 }, handleSign: -1, minWidth: 10, maxWidth: 72 });
    expect(result).not.toBeNull();
    expect(result!.x).toBe(10);
    expect(result!.width).toBe(48);
    expect(result!.fixedEdge).toBeCloseTo(116);
    expect(result!.movingEdge).toBeCloseTo(68);
  });

  it("resizes a vertical Door along Y without moving its wall centerline", () => {
    const original = door(vertical, 0.5, 30);
    const result = resizeWallOpeningAlongWall({
      wall: vertical, opening: original, pointer: { x: 22, y: 66 }, handleSign: -1, minWidth: 10, maxWidth: 48,
    });
    expect(result).not.toBeNull();
    expect(result!.x).toBe(10);
    expect(result!.y).toBeCloseTo(91);
    expect(result!.width).toBe(48);
    expect(result!.fixedEdge).toBeCloseTo(115);
    expect(result!.movingEdge).toBeCloseTo(67);
  });

  it("projects pointer motion onto angled wall-local coordinates", () => {
    const angled: FloorWall = { id: "wall-angle", x1: 0, y1: 0, x2: 60, y2: 80, thickness: 6, color: "#334155" };
    const original = door(angled, 0.5, 30);
    const result = resizeWallOpeningAlongWall({
      wall: angled, opening: original, pointer: { x: -5.8, y: 25.6 }, handleSign: -1, minWidth: 10, maxWidth: 48,
    });
    expect(result).not.toBeNull();
    expect(result!.fixedEdge).toBeCloseTo(65);
    expect(result!.width).toBe(48);
    expect(result!.x).toBeCloseTo(24.6);
    expect(result!.y).toBeCloseTo(32.8);
  });

  it("clamps at the wall boundary without shifting the fixed end", () => {
    const original = door(horizontal, 0.15, 20);
    const result = resizeWallOpeningAlongWall({ wall: horizontal, opening: original, pointer: { x: -100, y: 0 }, handleSign: -1, minWidth: 10, maxWidth: 72 });
    expect(result).not.toBeNull();
    expect(result!.fixedEdge).toBeCloseTo(40);
    expect(result!.width).toBe(28);
    expect(result!.movingEdge).toBeCloseTo(12);
  });

  it("clamps the moving edge at a perpendicular wall intersection", () => {
    const original = door(horizontal, 0.6, 40);
    const intersectingWall: FloorWall = { id: "wall-cross", x1: 130, y1: -40, x2: 130, y2: 40, thickness: 6, color: "#334155" };
    const result = resizeWallOpeningAlongWall({
      wall: horizontal, opening: original, pointer: { x: 180, y: 0 }, handleSign: 1,
      minWidth: 10, maxWidth: 48, otherWalls: [intersectingWall],
    });
    expect(result).not.toBeNull();
    expect(result!.fixedEdge).toBeCloseTo(100);
    expect(result!.movingEdge).toBeCloseTo(130);
    expect(result!.width).toBe(30);
  });

  it("clamps at another opening and does not flip across the anchored edge", () => {
    const current = door(horizontal, 0.575, 30);
    const neighboring = { ...door(horizontal, 0.25, 20), id: "door-b" };
    const clamped = resizeWallOpeningAlongWall({
      wall: horizontal, opening: current, pointer: { x: 0, y: 0 }, handleSign: -1, minWidth: 10, maxWidth: 100, otherOpenings: [current, neighboring],
    });
    expect(clamped).not.toBeNull();
    expect(clamped!.fixedEdge).toBeCloseTo(130);
    expect(clamped!.movingEdge).toBeCloseTo(60);
    expect(clamped!.width).toBe(70);

    const reversed = resizeWallOpeningAlongWall({ wall: horizontal, opening: current, pointer: { x: 180, y: 0 }, handleSign: -1, minWidth: 10, maxWidth: 48 });
    expect(reversed).not.toBeNull();
    expect(reversed!.width).toBe(10);
    expect(reversed!.fixedEdge).toBeCloseTo(130);
    expect(reversed!.movingEdge).toBeCloseTo(120);
  });

  it("returns an opening center that resolves from its canonical wall offset", () => {
    const result = resizeWallOpeningAlongWall({ wall: vertical, opening: door(vertical), pointer: { x: 0, y: 70 }, handleSign: -1, minWidth: 10, maxWidth: 48 });
    expect(result).not.toBeNull();
    const resolved = resolveWallOpeningGeometry({ ...door(vertical), ...result }, vertical);
    expect(resolved?.x).toBe(10);
    expect(resolved?.y).toBeCloseTo(result!.y);
    expect(resolved?.width).toBe(result!.width);
  });
});
