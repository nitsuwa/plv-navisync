import type {
  FloorFurniture,
  FloorPlan,
  FloorRoom,
  FloorWall,
  FloorWindow,
} from "../components/map-builder/types";
import { normalizeFloorAppearance } from "./floorAppearance";
import type {
  FloorTemplateDefinition,
  FloorTemplateObject,
  FloorTemplateRoomInstance,
  FloorTemplateWindowObject,
} from "./floorTemplates";
import type { RoomTemplateDefinition, RoomTemplateObject, RoomTemplateCategory, TemplateSource } from "./roomTemplates";

/** Explicit allow-list payload for a custom Room template.  Navigation-owned
 * properties are deliberately not representable in this type. */
export interface SanitizedRoomTemplate extends RoomTemplateDefinition {
  source: Exclude<TemplateSource, "builtin">;
  campusId: string;
  persistedId?: string;
}

/** Explicit allow-list payload for a custom Floor template. */
export interface SanitizedFloorTemplate extends FloorTemplateDefinition {
  source: Exclude<TemplateSource, "builtin">;
  campusId: string;
  persistedId?: string;
}

export interface TemplateMetadataInput {
  name: string;
  description?: string;
  category: string;
  source: Exclude<TemplateSource, "builtin">;
}

export function validateTemplateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Template name is required.");
  if (trimmed.length > 80) throw new Error("Template name must be 80 characters or fewer.");
  return trimmed;
}

export function normalizeTemplateDescription(description: string | undefined): string {
  return (description ?? "").trim().slice(0, 500);
}

function withinRoom(item: { x: number; y: number; width: number; height: number }, room: FloorRoom) {
  return item.x >= room.x
    && item.y >= room.y
    && item.x + item.width <= room.x + room.w
    && item.y + item.height <= room.y + room.h;
}

function wallBelongsToRoom(wall: FloorWall, room: FloorRoom) {
  const anchored = wall.startAnchor?.roomId === room.id || wall.endAnchor?.roomId === room.id;
  if (anchored) return true;
  return wall.x1 >= room.x && wall.x1 <= room.x + room.w
    && wall.y1 >= room.y && wall.y1 <= room.y + room.h
    && wall.x2 >= room.x && wall.x2 <= room.x + room.w
    && wall.y2 >= room.y && wall.y2 <= room.y + room.h;
}

function roomDefinitionFromPhysical(room: FloorRoom, walls: FloorWall[], furniture: FloorFurniture[]): RoomTemplateDefinition {
  const objects: RoomTemplateObject[] = [
    { kind: "room", x: 0, y: 0, width: room.w, height: room.h, type: room.type, name: room.name },
  ];
  walls.filter((wall) => wallBelongsToRoom(wall, room)).forEach((wall) => {
    objects.push({
      kind: "wall",
      x1: wall.x1 - room.x,
      y1: wall.y1 - room.y,
      x2: wall.x2 - room.x,
      y2: wall.y2 - room.y,
      thickness: wall.thickness,
      color: wall.color,
      material: wall.material,
    });
  });
  furniture.filter((item) => withinRoom(item, room)).forEach((item) => {
    objects.push({
      kind: "furniture",
      x: item.x - room.x,
      y: item.y - room.y,
      width: item.width,
      height: item.height,
      type: item.type,
      name: item.name,
      category: item.category,
      color: item.color,
      rotation: item.rotation,
    });
  });
  return {
    id: "custom-room-definition",
    scope: "room",
    name: room.name,
    category: "Other" as RoomTemplateCategory,
    description: room.description ?? "",
    width: room.w,
    height: room.h,
    tags: [room.type],
    objects,
  };
}

/**
 * Positive allow-list sanitizer for a selected Room.  Doors, room access
 * fields, navigation nodes/edges, and all other graph metadata are never read
 * into the resulting payload.
 */
export function sanitizeRoomForTemplate(
  room: FloorRoom,
  floor: Pick<FloorPlan, "walls" | "furniture">,
  metadata: TemplateMetadataInput,
  campusId: string,
): SanitizedRoomTemplate {
  const name = validateTemplateName(metadata.name);
  const definition = roomDefinitionFromPhysical(room, floor.walls ?? [], floor.furniture ?? []);
  return {
    ...definition,
    id: `custom-room-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "template"}`,
    name,
    category: metadata.category as RoomTemplateCategory,
    description: normalizeTemplateDescription(metadata.description),
    source: metadata.source,
    campusId,
  };
}

function floorWindowObject(window: FloorWindow): FloorTemplateWindowObject {
  return {
    kind: "window",
    x: window.x,
    y: window.y,
    width: window.width,
    height: window.height,
    color: window.color,
    rotation: window.rotation,
  };
}

/**
 * Positive allow-list sanitizer for a whole Floor. Rooms are embedded as
 * sanitized Room definitions so template previews and instantiation remain
 * self-contained. Managed perimeter walls are recreated by the canonical
 * Floor constructor; all other physical walls, windows, and Furniture are
 * copied as relative physical data only.
 */
export function sanitizeFloorForTemplate(
  floor: FloorPlan,
  metadata: TemplateMetadataInput,
  campusId: string,
): SanitizedFloorTemplate {
  const name = validateTemplateName(metadata.name);
  const width = floor.canvasW ?? 600;
  const height = floor.canvasH ?? 450;
  const nestedRooms = (floor.rooms ?? []).map((room) => {
    const nested = roomDefinitionFromPhysical(room, floor.walls ?? [], floor.furniture ?? []);
    const instance: FloorTemplateRoomInstance = {
      kind: "room-template",
      templateId: nested.id,
      template: nested,
      x: room.x,
      y: room.y,
    };
    return { room, nested, instance };
  });
  const roomWallIds = new Set((floor.walls ?? []).filter((wall) => nestedRooms.some(({ room }) => wallBelongsToRoom(wall, room))).map((wall) => wall.id));
  const roomFurnitureIds = new Set((floor.furniture ?? []).filter((item) => nestedRooms.some(({ room }) => withinRoom(item, room))).map((item) => item.id));
  const objects: FloorTemplateObject[] = nestedRooms.map(({ instance }) => instance);
  (floor.walls ?? []).filter((wall) => !roomWallIds.has(wall.id) && wall.managedKind !== "perimeter").forEach((wall) => {
    objects.push({
      kind: "wall",
      x1: wall.x1,
      y1: wall.y1,
      x2: wall.x2,
      y2: wall.y2,
      thickness: wall.thickness,
      color: wall.color,
      material: wall.material,
    });
  });
  (floor.furniture ?? []).filter((item) => !roomFurnitureIds.has(item.id)).forEach((item) => {
    objects.push({
      kind: "furniture",
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      type: item.type,
      name: item.name,
      category: item.category,
      color: item.color,
      rotation: item.rotation,
    });
  });
  (floor.windows ?? []).forEach((window) => objects.push(floorWindowObject(window)));
  const floorAppearance = normalizeFloorAppearance(floor.appearance, floor.backgroundColor ?? "#e8e1d7");
  return {
    id: `custom-floor-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "template"}`,
    scope: "floor",
    source: metadata.source,
    campusId,
    name,
    category: metadata.category as FloorTemplateDefinition["category"],
    description: normalizeTemplateDescription(metadata.description),
    width,
    height,
    canvasWidth: width,
    canvasHeight: height,
    appearance: floorAppearance,
    objects,
    tags: [metadata.category.toLowerCase(), "custom", "physical-only"],
  };
}

export function templatePayloadContainsNavigation(payload: unknown): boolean {
  const forbidden = /^(door|doors|entrance|stairs?|elevators?|ramps?|pathways?|navnodes?|navedges?|navigation|transition|grounddischarge|exterioremergencystair|veranda)$/i;
  const visit = (value: unknown): boolean => {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(visit);
    return Object.entries(value as Record<string, unknown>).some(([key, child]) => forbidden.test(key) || visit(child));
  };
  return visit(payload);
}
