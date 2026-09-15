import type {
  FloorFurniture,
  FloorDoor,
  FloorPlan,
  FloorRoom,
  FloorWall,
  FloorWindow,
} from "../components/map-builder/types";
import { normalizeFloorAppearance } from "./floorAppearance";
import { nearestPointOnWall } from "./floorGeometry";
import type {
  FloorTemplateDefinition,
  FloorTemplateDoorObject,
  FloorTemplateObject,
  FloorTemplateRoomInstance,
  FloorTemplateWindowObject,
} from "./floorTemplates";
import type { RoomTemplateDefinition, RoomTemplateObject, RoomTemplateCategory, TemplateSource } from "./roomTemplates";

/** Legacy allow-list payload retained for old Room-template records. The active
 * editor workflow saves Floor templates only; navigation-owned properties are
 * deliberately not representable in this compatibility type. */
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
  /**
   * Legacy catalogue metadata. Floor Templates no longer expose categories in
   * the active UI, but older callers/rows may still provide one. When absent,
   * the sanitizer uses the neutral compatibility value "Other".
   */
  category?: string;
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

function roomDefinitionFromPhysical(
  room: FloorRoom,
  walls: FloorWall[],
  furniture: FloorFurniture[],
  wallKeyForId?: (wallId: string) => string | undefined,
): RoomTemplateDefinition {
  const objects: RoomTemplateObject[] = [
    { kind: "room", x: 0, y: 0, width: room.w, height: room.h, type: room.type, name: room.name },
  ];
  // Managed perimeter walls belong to the Floor's structural boundary, not to
  // an individual Room.  Excluding them here keeps a Room template portable
  // and prevents a room placed against another Floor edge from carrying stale
  // perimeter identity into its new Floor.
  walls.filter((wall) => wall.managedKind !== "perimeter" && wallBelongsToRoom(wall, room)).forEach((wall, index) => {
    objects.push({
      kind: "wall",
      x1: wall.x1 - room.x,
      y1: wall.y1 - room.y,
      x2: wall.x2 - room.x,
      y2: wall.y2 - room.y,
      thickness: wall.thickness,
      color: wall.color,
      material: wall.material,
      wallKey: wallKeyForId?.(wall.id) ?? `room-wall-${index}`,
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
 * Positive allow-list sanitizer for a selected Room. Room access fields,
 * navigation nodes/edges, and all other graph metadata are never read into
 * the resulting payload. Doors remain an admin-authored follow-up for the
 * legacy Room workflow.
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
    category: (metadata.category ?? "Other") as RoomTemplateCategory,
    description: normalizeTemplateDescription(metadata.description),
    source: metadata.source,
    campusId,
  };
}

function floorWindowObject(window: FloorWindow, wallKeyForId: (wallId: string) => string | undefined, fallbackWallRef?: string): FloorTemplateWindowObject | null {
  const wallRef = window.wallId ? wallKeyForId(window.wallId) : fallbackWallRef;
  if (!wallRef) return null;
  return {
    kind: "window",
    x: window.x,
    y: window.y,
    width: window.width,
    height: window.height,
    color: window.color,
    // Legacy FloorWindow records may carry an optional rotation even though
    // the public interface predates that field; retain it when present while
    // keeping the allow-list payload explicit.
    rotation: (window as FloorWindow & { rotation?: number }).rotation,
    wallRef,
    offset: window.offset,
  };
}

function floorDoorObject(door: FloorDoor, wallKeyForId: (wallId: string) => string | undefined, fallbackWallRef?: string): FloorTemplateDoorObject | null {
  const wallRef = door.wallId ? wallKeyForId(door.wallId) : fallbackWallRef;
  if (!wallRef) return null;
  return {
    kind: "door",
    x: door.x,
    y: door.y,
    width: door.width,
    direction: door.direction,
    color: door.color,
    doorType: door.doorType,
    hinge: door.hinge,
    swingSide: door.swingSide,
    wallRef,
    offset: door.offset,
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
  const wallKeyById = new Map<string, string>();
  const physicalWalls: FloorWall[] = [];
  (floor.walls ?? []).forEach((wall, index) => {
    if (wall.managedKind !== "perimeter") {
      wallKeyById.set(wall.id, `wall-${index}`);
      physicalWalls.push(wall);
    }
  });
  const wallKeyForId = (wallId: string) => wallKeyById.get(wallId);
  const fallbackWallRefForOpening = (opening: { x: number; y: number }) => {
    const nearest = physicalWalls
      .map((wall) => ({ wall, distance: nearestPointOnWall(opening, wall).d }))
      .sort((a, b) => a.distance - b.distance)[0]?.wall;
    return nearest ? wallKeyById.get(nearest.id) : undefined;
  };
  const nestedRooms = (floor.rooms ?? []).map((room) => {
    const nested = roomDefinitionFromPhysical(room, floor.walls ?? [], floor.furniture ?? [], wallKeyForId);
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
      kind: "wall" as const,
      x1: wall.x1,
      y1: wall.y1,
      x2: wall.x2,
      y2: wall.y2,
      thickness: wall.thickness,
      color: wall.color,
      material: wall.material,
      wallKey: wallKeyById.get(wall.id),
    });
  });
  // Furniture hosted by a Veranda/Exterior Zone belongs to exterior campus
  // infrastructure, not to an indoor Floor starter. Keep it out of the
  // positive allow-list so custom templates cannot capture another Floor's
  // exterior objects.
  (floor.furniture ?? []).filter((item) => !roomFurnitureIds.has(item.id) && !item.exteriorZoneId).forEach((item) => {
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
  (floor.windows ?? []).forEach((window) => {
    const object = floorWindowObject(window, wallKeyForId, fallbackWallRefForOpening(window));
    if (object) objects.push(object);
  });
  // Manual Doors are physical openings and safe to reuse. Entrance-owned
  // generated Doors are intentionally omitted so a custom template cannot
  // capture a Building/Entrance relationship from another Floor.
  (floor.doors ?? []).filter((door) => !door.buildingEntranceId).forEach((door) => {
    const object = floorDoorObject(door, wallKeyForId, fallbackWallRefForOpening(door));
    if (object) objects.push(object);
  });
  const floorAppearance = normalizeFloorAppearance(floor.appearance, floor.backgroundColor ?? "#e8e1d7");
  const managedPerimeter = (floor.walls ?? []).find((wall) => wall.managedKind === "perimeter");
  return {
    id: `custom-floor-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "template"}`,
    scope: "floor",
    source: metadata.source,
    campusId,
    name,
    category: (metadata.category ?? "Other") as FloorTemplateDefinition["category"],
    description: normalizeTemplateDescription(metadata.description),
    width,
    height,
    canvasWidth: width,
    canvasHeight: height,
    appearance: floorAppearance,
    perimeterEnabled: !!managedPerimeter,
    ...(managedPerimeter ? {
      perimeterThickness: managedPerimeter.thickness,
      perimeterMaterial: managedPerimeter.material,
      perimeterColor: managedPerimeter.color,
    } : {}),
    objects,
    tags: [...(metadata.category ? [metadata.category.toLowerCase()] : []), "custom", "physical-only"],
  };
}

export function templatePayloadContainsNavigation(payload: unknown): boolean {
  // Physical `objects: [{ kind: "door" | "window" }]` are valid template
  // content. Reject only graph/ownership collections and metadata that could
  // carry a relationship from the source Floor into a new one.
  const forbidden = /^(doors|entrance|stairs?|elevators?|ramps?|pathways?|navnodes?|navedges?|navigation|transition|grounddischarge|exterioremergencystair|veranda|buildingentranceid|accessnodeid|accessdoorid|navigationvertexids|routemetadata|crossfloortransitions|emergencygraph|accessiblegraph|astar)$/i;
  const visit = (value: unknown): boolean => {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(visit);
    return Object.entries(value as Record<string, unknown>).some(([key, child]) => forbidden.test(key) || visit(child));
  };
  return visit(payload);
}
