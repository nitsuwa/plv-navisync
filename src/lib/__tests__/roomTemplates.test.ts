import { describe, expect, it } from "vitest";
import {
  FLOOR_TEMPLATE_ROOM_ARCHETYPES,
  ROOM_TEMPLATES,
  getRoomTemplates,
  instantiateRoomFurnitureTemplate,
  instantiateRoomTemplate,
  roomFurnitureOnlyTemplate,
  validateRoomTemplatePlacement,
} from "../roomTemplates";
import { FLOOR_TEMPLATES, getFloorTemplates } from "../floorTemplates";
import type { RoomTemplateDefinition } from "../roomTemplates";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("PLV Room Templates", () => {
  it("keeps the Room Templates library user-created only", () => {
    expect(ROOM_TEMPLATES).toEqual([]);
    expect(getRoomTemplates()).toEqual([]);
    expect(getRoomTemplates("classroom", "Academic")).toEqual([]);
  });

  it("keeps legacy room archetypes available only for Floor Template composition", () => {
    expect(FLOOR_TEMPLATE_ROOM_ARCHETYPES.map((template) => template.name)).toContain("PLV Standard Classroom");
    expect(FLOOR_TEMPLATES).toEqual([]);
    expect(getFloorTemplates("computer")).toEqual([]);
    const template = FLOOR_TEMPLATE_ROOM_ARCHETYPES.find((candidate) => candidate.id === "classroom-40")!;
    const created = instantiateRoomTemplate(template, { x: 12, y: 18 }, { floorId: "f1", buildingId: "b1" });
    expect(created.walls).toHaveLength(4);
    expect(created.furniture).toHaveLength(43);
  });

  it("validates the Room footprint against Floor bounds and existing Rooms", () => {
    const template: RoomTemplateDefinition = {
      id: "room-visual", scope: "room", source: "campus", name: "Clinic", category: "Other", description: "", width: 100, height: 80, tags: [],
      objects: [{ kind: "room", x: 0, y: 0, width: 100, height: 80, type: "clinic", name: "Clinic" }],
    };
    expect(validateRoomTemplatePlacement(template, { x: 10, y: 10 }, 500, 500).valid).toBe(true);
    expect(validateRoomTemplatePlacement(template, { x: 401, y: 10 }, 500, 500).valid).toBe(false);
    expect(validateRoomTemplatePlacement(template, { x: 10, y: 10 }, 500, 500, [{ x: 20, y: 20, w: 40, h: 40 }]).reason).toContain("overlaps");
  });

  it("sanitizes legacy objects and places only Room plus Furniture with fresh IDs and groups", () => {
    const legacy: RoomTemplateDefinition = {
      id: "legacy-room", scope: "room", source: "campus", name: "Clinic", category: "Other", description: "", width: 100, height: 80, tags: [],
      boundary: [{ wallKey: "wall-a", x1: 0, y1: 0, x2: 100, y2: 0, perimeterProvided: true }],
      objects: [
        { kind: "room", x: 0, y: 0, width: 100, height: 80, type: "clinic", name: "Clinic", shapePoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 82, y: 80 }, { x: 0, y: 80 }] },
        { kind: "wall", wallKey: "wall-a", x1: 0, y1: 0, x2: 100, y2: 0 },
        { kind: "door", wallKey: "wall-a", x: 40, y: 0, width: 14, direction: "left", color: "#92400e" },
        { kind: "window", wallKey: "wall-a", x: 70, y: 0, width: 18, height: 4, color: "#38bdf8" },
        { kind: "furniture", x: 12, y: 18, width: 22, height: 16, type: "desk", name: "Desk", category: "tables", color: "#7a5c3a", rotation: 30, flipX: true, zOrder: 5, groupKey: "set-a" },
        { kind: "furniture", x: 46, y: 18, width: 14, height: 14, type: "chair", name: "Chair", category: "seating", color: "#475569", groupKey: "set-a" },
      ],
    };
    const safe = roomFurnitureOnlyTemplate(legacy);
    expect(safe.objects.map((object) => object.kind)).toEqual(["room", "furniture", "furniture"]);
    expect(safe).not.toHaveProperty("boundary");

    const first = instantiateRoomFurnitureTemplate(legacy, { x: 120, y: 130 }, { floorId: "f1", buildingId: "b1" });
    const second = instantiateRoomFurnitureTemplate(legacy, { x: 220, y: 230 }, { floorId: "f1", buildingId: "b1" });
    const ids = [first.room.id, ...first.furniture.map((item) => item.id), ...second.furniture.map((item) => item.id), second.room.id];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => UUID_RE.test(id))).toBe(true);
    expect(first.room).toMatchObject({ x: 120, y: 130, type: "clinic", floorId: "f1", buildingId: "b1" });
    expect(first.room.shapePoints?.[2]).toEqual({ x: 202, y: 210 });
    expect(first.room).not.toHaveProperty("accessDoorId");
    expect(first.furniture[0]).toMatchObject({ x: 132, y: 148, rotation: 30, flipX: true, zOrder: 5 });
    expect(first.furniture[0].groupId).toBe(first.furniture[1].groupId);
    expect(first.furniture[0].groupId).not.toBe("set-a");
    expect(first.furniture[0].groupId).not.toBe(second.furniture[0].groupId);
    expect(first).not.toHaveProperty("walls");
    expect(first).not.toHaveProperty("doors");
    expect(first).not.toHaveProperty("windows");
  });
});
