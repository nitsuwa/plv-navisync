import { describe, expect, it } from "vitest";
import { sanitizeFloorForTemplate, sanitizeRoomForTemplate, templatePayloadContainsNavigation } from "../templateSanitizer";
import type { FloorPlan } from "../../components/map-builder/types";

function fixture(): FloorPlan {
  return {
    id: "floor-1", buildingId: "building-1", number: 2, label: "Second Floor", canvasW: 600, canvasH: 450,
    rooms: [{ id: "room-1", name: "Lab", type: "laboratory", x: 40, y: 30, w: 240, h: 180, floorId: "floor-1", buildingId: "building-1", accessNodeId: "node-room", accessDoorId: "door-1" }],
    walls: [
      { id: "wall-room", x1: 40, y1: 30, x2: 280, y2: 30, thickness: 4, color: "#64748b", startAnchor: { targetType: "room", roomId: "room-1", edge: "top", offset: 0 }, endAnchor: { targetType: "room", roomId: "room-1", edge: "top", offset: 1 } },
      { id: "wall-free", x1: 320, y1: 30, x2: 500, y2: 30, thickness: 4, color: "#64748b" },
      { id: "wall-perimeter", x1: 0, y1: 0, x2: 600, y2: 0, thickness: 6, color: "#334155", managedKind: "perimeter", perimeterSide: "top" },
    ],
    doors: [
      { id: "door-1", x: 40, y: 100, width: 12, wallId: "wall-room", offset: 0.3, direction: "left", color: "#111827", buildingEntranceId: "entrance-1" },
      { id: "door-2", x: 320, y: 100, width: 18, direction: "right", color: "#b45309" },
    ],
    windows: [{ id: "window-1", x: 80, y: 30, width: 30, height: 5, wallId: "wall-room", offset: 0.2, color: "#38bdf8" }],
    furniture: [
      { id: "furniture-1", type: "computer-lab-table-4", name: "Computer Lab Table 4", category: "electronics", x: 60, y: 70, width: 80, height: 30, rotation: 0, color: "#475569" },
      { id: "veranda-chair", type: "chair", name: "Veranda Chair", category: "seating", x: 240, y: 430, width: 12, height: 12, rotation: 0, color: "#475569", exteriorZoneId: "veranda-1" },
    ],
    stairs: [{ id: "stairs-1", x: 450, y: 300, width: 60, height: 60, direction: "up", label: "Stair", sharedId: "shaft-1" }],
    ramps: [{ id: "ramp-1", x: 350, y: 300, width: 80, height: 20, label: "Ramp" }],
    elevators: [{ id: "elevator-1", x: 300, y: 300, width: 40, height: 40, doorWidth: 10, label: "Elevator", sharedId: "lift-1" }],
    paths: [], labels: [],
  };
}

describe("custom template sanitizers", () => {
  it("saves a Room as local physical content and excludes access/navigation fields", () => {
    const floor = fixture();
    const result = sanitizeRoomForTemplate(floor.rooms[0], floor, { name: "Lab Template", category: "Laboratory", source: "campus" }, "campus-1");
    expect(result.source).toBe("campus");
    expect(result.objects.some((object) => object.kind === "room" && object.x === 0 && object.y === 0)).toBe(true);
    expect(result.objects.some((object) => object.kind === "furniture")).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/accessNodeId|accessDoorId|door-1|navNode|navEdge/i);
  });

  it("uses a positive allow-list for a Floor and strips all navigation-sensitive collections", () => {
    const result = sanitizeFloorForTemplate(fixture(), { name: "Physical Lab Floor", category: "Laboratory", source: "shared" }, "campus-1");
    expect(result.source).toBe("shared");
    expect(result.objects.some((object) => object.kind === "room-template")).toBe(true);
    expect(result.objects.some((object) => object.kind === "window")).toBe(true);
    expect(result.objects.some((object) => object.kind === "door")).toBe(true);
    expect(result.objects.filter((object) => object.kind === "door" || object.kind === "window").every((object) => typeof object.wallRef === "string" && object.wallRef.length > 0)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("veranda-chair");
    expect(JSON.stringify(result)).not.toMatch(/buildingEntranceId|wallId|accessNodeId|accessDoorId|stairs|elevator|ramp|pathway|navNode|navEdge|entrance|transition|groundDischarge|exteriorEmergencyStair/i);
    expect(templatePayloadContainsNavigation(result)).toBe(false);
  });
});
