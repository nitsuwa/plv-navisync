import type {
  FloorFurniture,
  FloorDoor,
  FloorPlan,
  FloorRoom,
  FloorWall,
  FloorWindow,
} from "../components/map-builder/types";
import { normalizeFloorAppearance } from "./floorAppearance";
import { assertFloorPhysicalReferences, normalizeRoomAccessDoors } from "./floorPlanNormalization";
import { nearestPointOnWall, rotatePoint } from "./floorGeometry";
import { furnitureFullyContainedInRoom, wallBelongsToRoom } from "./roomSetup";
import { pointInRoomShape, roomOutlinePoints } from "./roomShape";
import type {
  FloorTemplateDefinition,
  FloorTemplateDoorObject,
  FloorTemplateEntranceRampObject,
  FloorTemplateEntranceStepsObject,
  FloorTemplateExteriorZoneObject,
  FloorTemplatePathObject,
  FloorTemplateObject,
  FloorTemplateRoomInstance,
  FloorTemplateRoomObject,
  FloorTemplateWindowObject,
} from "./floorTemplates";
import type { RoomTemplateDefinition, RoomTemplateObject, RoomTemplateCategory, TemplateSource } from "./roomTemplates";

/** Positive allow-list payload for persisted Room templates. Navigation-owned
 * properties remain deliberately unrepresentable. */
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

function roomDefinitionFromPhysical(
  room: FloorRoom,
  walls: FloorWall[],
  furniture: FloorFurniture[],
  wallKeyForId?: (wallId: string) => string | undefined,
  doors: FloorDoor[] = [],
  windows: FloorWindow[] = [],
  groupKeyForId?: (groupId: string) => string,
): RoomTemplateDefinition {
  const groupKeys = new Map<string, string>();
  const objectByWallId = new Map<string, string>();
  walls.forEach((wall, index) => {
    if (wall.managedKind !== "perimeter" && wallBelongsToRoom(wall, room)) {
      objectByWallId.set(wall.id, wallKeyForId?.(wall.id) ?? `room-wall-${index}`);
    }
  });
  const boundaryPoints = roomOutlinePoints(room);
  const boundary = boundaryPoints.map((point, index, points) => {
    const next = points[(index + 1) % points.length];
    const x1 = point.x - room.x;
    const y1 = point.y - room.y;
    const x2 = next.x - room.x;
    const y2 = next.y - room.y;
    const matchesSegment = (wall: FloorWall) => {
      const a = nearestPointOnWall(point, wall);
      const b = nearestPointOnWall(next, wall);
      return a.d <= 3 && b.d <= 3 && Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) > 1;
    };
    const perimeter = walls
      .filter((wall) => wall.managedKind === "perimeter")
      .find(matchesSegment);
    const authored = perimeter ? undefined : walls
      .filter((wall) => wall.managedKind !== "perimeter" && wallBelongsToRoom(wall, room))
      .find(matchesSegment);
    const sourceWall = perimeter ?? authored;
    // A template needs the Room's complete enclosure even when a side had no
    // separate Wall record in the source Floor. Missing sides become ordinary
    // authored Walls when placed; managed perimeter Walls remain blueprints.
    const key = perimeter ? `perimeter-boundary-${index}` : (sourceWall ? objectByWallId.get(sourceWall.id) : undefined) ?? `room-boundary-${index}`;
    return {
      x1, y1, x2, y2,
      perimeterProvided: !!perimeter,
      wallKey: key,
      thickness: sourceWall?.thickness ?? 4,
      color: sourceWall?.color ?? "#64748b",
      material: sourceWall?.material ?? "drywall",
    };
  });
  const objects: RoomTemplateObject[] = [
    {
      kind: "room", x: 0, y: 0, width: room.w, height: room.h, type: room.type, name: room.name,
      ...(room.color ? { color: room.color } : {}), ...(room.rotation ? { rotation: room.rotation } : {}),
      ...(room.description ? { description: room.description } : {}),
      ...(room.accessibility !== undefined ? { accessibility: room.accessibility } : {}),
      ...(room.shapePoints ? { shapePoints: room.shapePoints.map((point) => ({ x: point.x - room.x, y: point.y - room.y })) } : {}),
    },
  ];
  // Managed perimeter walls are represented as boundary blueprints. At place
  // time they reuse a matching target perimeter or become authored Walls.
  walls.filter((wall) => wall.managedKind !== "perimeter" && wallBelongsToRoom(wall, room)).forEach((wall, index) => {
    const wallKey = objectByWallId.get(wall.id) ?? `room-wall-${index}`;
    objects.push({
      kind: "wall",
      x1: wall.x1 - room.x,
      y1: wall.y1 - room.y,
      x2: wall.x2 - room.x,
      y2: wall.y2 - room.y,
      thickness: wall.thickness,
      color: wall.color,
      material: wall.material,
      wallKey,
      ...(wall.zOrder !== undefined ? { zOrder: wall.zOrder } : {}),
    });
  });
  const wallKeyForOpening = (wallId: string | undefined, point: { x: number; y: number }) => {
    if (wallId) {
      const authoredKey = objectByWallId.get(wallId);
      if (authoredKey) return authoredKey;
      const perimeter = walls.find((wall) => wall.id === wallId && wall.managedKind === "perimeter");
      if (perimeter) {
        const match = boundary.find((segment) => {
          const world = { x1: room.x + segment.x1, y1: room.y + segment.y1, x2: room.x + segment.x2, y2: room.y + segment.y2 };
          const a = nearestPointOnWall({ x: world.x1, y: world.y1 }, perimeter);
          const b = nearestPointOnWall({ x: world.x2, y: world.y2 }, perimeter);
          return a.d <= 3 && b.d <= 3 && Math.abs(a.t - b.t) > 0.05;
        });
        if (match) return match.wallKey;
      }
    }
    const nearbyWall = walls.filter((wall) => wall.managedKind !== "perimeter")
      .map((wall) => ({ wall, distance: nearestPointOnWall(point, wall).d }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearbyWall && nearbyWall.distance <= Math.max(4, nearbyWall.wall.thickness)) return objectByWallId.get(nearbyWall.wall.id);
    const nearbyBoundary = boundary.map((segment) => ({
      segment,
      distance: nearestPointOnWall(point, { ...segment, id: segment.wallKey, thickness: segment.thickness ?? 4, color: segment.color ?? "#64748b" }).d,
    })).sort((a, b) => a.distance - b.distance)[0];
    return nearbyBoundary && nearbyBoundary.distance <= 4 ? nearbyBoundary.segment.wallKey : undefined;
  };
  doors.filter((door) => !door.buildingEntranceId).forEach((door) => {
    const wallKey = wallKeyForOpening(door.wallId, door);
    if (!wallKey) return;
    objects.push({
      kind: "door", x: door.x - room.x, y: door.y - room.y, width: door.width, direction: door.direction, color: door.color,
      ...(door.doorType ? { doorType: door.doorType } : {}), ...(door.hinge ? { hinge: door.hinge } : {}),
      ...(door.swingSide ? { swingSide: door.swingSide } : {}), ...(door.openingType ? { openingType: door.openingType } : {}),
      ...(door.accessDirection ? { accessDirection: door.accessDirection } : {}), wallKey, offset: door.offset,
      ...(door.zOrder !== undefined ? { zOrder: door.zOrder } : {}),
    });
  });
  windows.forEach((window) => {
    const wallKey = wallKeyForOpening(window.wallId, window);
    if (!wallKey) return;
    objects.push({ kind: "window", x: window.x - room.x, y: window.y - room.y, width: window.width, height: window.height, color: window.color, wallKey, offset: window.offset, ...(window.zOrder !== undefined ? { zOrder: window.zOrder } : {}) });
  });
  furniture.filter((item) => furnitureFullyContainedInRoom(item, room)).forEach((item) => {
    const groupKey = item.groupId
      ? groupKeyForId?.(item.groupId) ?? groupKeys.get(item.groupId) ?? (() => { const key = `group-${groupKeys.size + 1}`; groupKeys.set(item.groupId!, key); return key; })()
      : undefined;
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
      ...(item.flipX ? { flipX: true } : {}), ...(item.flipY ? { flipY: true } : {}),
      ...(item.zOrder !== undefined ? { zOrder: item.zOrder } : {}),
      ...(item.assetKey ? { assetKey: item.assetKey } : {}), ...(item.assetVariant ? { assetVariant: item.assetVariant } : {}),
      ...(item.assetConfig ? { assetConfig: { ...item.assetConfig } } : {}), ...(groupKey ? { groupKey } : {}),
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
    boundary,
  };
}

/**
 * Positive allow-list sanitizer for a selected Room. Room access fields,
 * navigation nodes/edges, and all other graph metadata are never read into
 * the resulting payload.
 */
export function sanitizeRoomForTemplate(
  room: FloorRoom,
  floor: Pick<FloorPlan, "walls" | "furniture" | "doors" | "windows">,
  metadata: TemplateMetadataInput,
  campusId: string,
): SanitizedRoomTemplate {
  const name = validateTemplateName(metadata.name);
  const roomPolygon = roomOutlinePoints(room);
  const pointInsideOrOnBoundary = (point: { x: number; y: number }) => {
    if (pointInRoomShape(point, roomPolygon)) return true;
    for (let index = 0; index < roomPolygon.length; index += 1) {
      const a = roomPolygon[index];
      const b = roomPolygon[(index + 1) % roomPolygon.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      if (!lengthSquared) continue;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
      if (Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)) <= 0.5) return true;
    }
    return false;
  };
  const furnitureIsFullyInsideRoom = (item: FloorFurniture) => {
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    const corners = [
      { x: item.x, y: item.y },
      { x: item.x + item.width, y: item.y },
      { x: item.x + item.width, y: item.y + item.height },
      { x: item.x, y: item.y + item.height },
    ].map((point) => rotatePoint(point, cx, cy, item.rotation ?? 0));
    if (!corners.every(pointInsideOrOnBoundary)) return false;
    const orientation = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
      (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    // A concave Room can contain all four Furniture corners while one side
    // crosses through an inward notch. Reject any proper boundary crossing.
    for (let corner = 0; corner < corners.length; corner += 1) {
      const a = corners[corner];
      const b = corners[(corner + 1) % corners.length];
      for (let edge = 0; edge < roomPolygon.length; edge += 1) {
        const c = roomPolygon[edge];
        const d = roomPolygon[(edge + 1) % roomPolygon.length];
        const o1 = orientation(a, b, c);
        const o2 = orientation(a, b, d);
        const o3 = orientation(c, d, a);
        const o4 = orientation(c, d, b);
        if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return false;
      }
    }
    return pointInsideOrOnBoundary({ x: cx, y: cy });
  };
  const groupKeys = new Map<string, string>();
  const roomObject: RoomTemplateObject = {
    kind: "room",
    x: 0,
    y: 0,
    width: room.w,
    height: room.h,
    type: room.type,
    name: room.name,
    ...(room.color ? { color: room.color } : {}),
    ...(room.rotation !== undefined ? { rotation: room.rotation } : {}),
    ...(room.zOrder !== undefined ? { zOrder: room.zOrder } : {}),
    ...(room.shapePoints ? { shapePoints: room.shapePoints.map((point) => ({ x: point.x - room.x, y: point.y - room.y })) } : {}),
  };
  const furnitureObjects: RoomTemplateObject[] = (floor.furniture ?? [])
    .filter(furnitureIsFullyInsideRoom)
    .map((item) => {
      const groupKey = item.groupId
        ? groupKeys.get(item.groupId) ?? (() => { const key = `group-${groupKeys.size + 1}`; groupKeys.set(item.groupId!, key); return key; })()
        : undefined;
      return {
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
        ...(item.flipX ? { flipX: true } : {}),
        ...(item.flipY ? { flipY: true } : {}),
        ...(item.zOrder !== undefined ? { zOrder: item.zOrder } : {}),
        ...(item.assetKey ? { assetKey: item.assetKey } : {}),
        ...(item.assetVariant ? { assetVariant: item.assetVariant } : {}),
        ...(item.assetConfig ? { assetConfig: { ...item.assetConfig } } : {}),
        ...(groupKey ? { groupKey } : {}),
      };
    });
  return {
    scope: "room",
    id: `custom-room-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "template"}`,
    name,
    category: "Other" as RoomTemplateCategory,
    description: "",
    width: room.w,
    height: room.h,
    tags: [room.type],
    objects: [roomObject, ...furnitureObjects],
    source: metadata.source,
    campusId,
  };
}

function floorWindowObject(window: FloorWindow, wallKeyForId: (wallId: string) => string | undefined, fallbackWallRef?: string): FloorTemplateWindowObject | null {
  const wallRef = window.wallId ? wallKeyForId(window.wallId) : fallbackWallRef;
  if (window.wallId && !wallRef) throw new Error(`Floor Template Window refers to missing Wall "${window.wallId}".`);
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
    wallRef: wallRef ?? null,
    offset: window.offset,
    ...(window.zOrder !== undefined ? { zOrder: window.zOrder } : {}),
    ...(window.visible !== undefined ? { visible: window.visible } : {}),
    ...(window.locked !== undefined ? { locked: window.locked } : {}),
  };
}

function floorDoorObject(door: FloorDoor, wallKeyForId: (wallId: string) => string | undefined, fallbackWallRef?: string): FloorTemplateDoorObject | null {
  const wallRef = door.wallId ? wallKeyForId(door.wallId) : fallbackWallRef;
  if (door.wallId && !wallRef) throw new Error(`Floor Template Door refers to missing Wall "${door.wallId}".`);
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
    openingType: door.openingType,
    accessDirection: door.accessDirection,
    wallRef: wallRef ?? null,
    offset: door.offset,
    ...(door.zOrder !== undefined ? { zOrder: door.zOrder } : {}),
    ...(door.label !== undefined ? { label: door.label } : {}),
    ...(door.visible !== undefined ? { visible: door.visible } : {}),
    ...(door.locked !== undefined ? { locked: door.locked } : {}),
  };
}

/**
 * Positive allow-list sanitizer for a whole Floor. Physical objects are stored
 * directly with template-local keys for relationships, so previews and
 * instantiation share one self-contained snapshot. Managed perimeter walls are
 * recreated by the canonical Floor constructor.
 */
export function sanitizeFloorForTemplate(
  floor: FloorPlan,
  metadata: TemplateMetadataInput,
  campusId: string,
): SanitizedFloorTemplate {
  const rooms = normalizeRoomAccessDoors(floor.rooms ?? [], floor.doors ?? [], floor.walls ?? []);
  // Sanitization operates on a detached, relationship-clean view. This repairs
  // only stale Room→Door metadata and never mutates the source Floor.
  assertFloorPhysicalReferences({ ...floor, rooms });
  const name = validateTemplateName(metadata.name);
  const width = floor.canvasW ?? 600;
  const height = floor.canvasH ?? 450;
  const wallKeyById = new Map<string, string>();
  const roomKeyById = new Map<string, string>();
  const doorKeyById = new Map<string, string>();
  const zoneKeyById = new Map<string, string>();
  (floor.walls ?? []).forEach((wall, index) => {
    if (wall.managedKind !== "perimeter") {
      wallKeyById.set(wall.id, `wall-${index}`);
    } else if (wall.perimeterSide) {
      wallKeyById.set(wall.id, `perimeter-${wall.perimeterSide}`);
    }
  });
  rooms.forEach((room, index) => roomKeyById.set(room.id, `room-${index + 1}`));
  (floor.doors ?? []).forEach((door, index) => doorKeyById.set(door.id, `door-${index + 1}`));
  (floor.exteriorZones ?? []).forEach((zone, index) => zoneKeyById.set(zone.id, `zone-${index + 1}`));
  const wallKeyForId = (wallId: string) => wallKeyById.get(wallId);
  const templateAnchor = (anchor: FloorWall["startAnchor"] | undefined) => {
    if (!anchor || anchor.targetType !== "room") return undefined;
    const roomRef = roomKeyById.get(anchor.roomId);
    if (!roomRef) throw new Error(`Floor Template Wall anchor refers to missing Room "${anchor.roomId}".`);
    return { roomRef, edge: anchor.edge, offset: anchor.offset };
  };
  const floorGroupKeys = new Map<string, string>();
  const groupKeyForId = (groupId: string) => {
    const existing = floorGroupKeys.get(groupId);
    if (existing) return existing;
    const key = `floor-group-${floorGroupKeys.size + 1}`;
    floorGroupKeys.set(groupId, key);
    return key;
  };
  // Store detached physical records directly. The old Room-template conversion
  // rebuilt Room boundary Walls and rounded their geometry; this allow-list
  // snapshot preserves authored geometry and relationships without live IDs.
  const objects: FloorTemplateObject[] = rooms.map((room, index): FloorTemplateRoomObject => ({
    kind: "room",
    roomKey: roomKeyById.get(room.id) ?? `room-${index + 1}`,
    ...(() => {
      const accessDoorRefs = [room.accessDoorId, ...(room.accessDoorIds ?? [])]
        .filter((doorId): doorId is string => !!doorId)
        .map((doorId) => doorKeyById.get(doorId))
        .filter((doorKey): doorKey is string => !!doorKey);
      return accessDoorRefs.length > 0 ? { accessDoorRefs: [...new Set(accessDoorRefs)] } : {};
    })(),
    x: room.x, y: room.y, w: room.w, h: room.h,
    type: room.type, name: room.name,
    ...(room.color !== undefined ? { color: room.color } : {}),
    ...(room.rotation !== undefined ? { rotation: room.rotation } : {}),
    ...(room.shapePoints ? { shapePoints: room.shapePoints.map((point) => ({ x: point.x, y: point.y })) } : {}),
    ...(room.zOrder !== undefined ? { zOrder: room.zOrder } : {}),
    ...(room.visible !== undefined ? { visible: room.visible } : {}),
    ...(room.locked !== undefined ? { locked: room.locked } : {}),
    ...(room.description !== undefined ? { description: room.description } : {}),
    ...(room.accessibility !== undefined ? { accessibility: room.accessibility } : {}),
  }));
  (floor.paths ?? []).forEach((path) => objects.push({
    kind: "path",
    points: path.points.map((point) => ({ x: point.x, y: point.y })),
    type: path.type,
    color: path.color,
    width: path.width,
  } satisfies FloorTemplatePathObject));
  (floor.walls ?? []).filter((wall) => wall.managedKind !== "perimeter").forEach((wall) => {
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
      ...(wall.height !== undefined ? { height: wall.height } : {}),
      ...(wall.layer !== undefined ? { layer: wall.layer } : {}),
      ...(wall.visible !== undefined ? { visible: wall.visible } : {}),
      ...(wall.locked !== undefined ? { locked: wall.locked } : {}),
      ...(wall.junctionBlocks !== undefined ? { junctionBlocks: wall.junctionBlocks } : {}),
      ...(templateAnchor(wall.startAnchor) ? { startAnchor: templateAnchor(wall.startAnchor) } : {}),
      ...(templateAnchor(wall.endAnchor) ? { endAnchor: templateAnchor(wall.endAnchor) } : {}),
      ...(wall.zOrder !== undefined ? { zOrder: wall.zOrder } : {}),
    });
  });
  (floor.furniture ?? []).forEach((item) => {
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
      ...(item.flipX ? { flipX: true } : {}), ...(item.flipY ? { flipY: true } : {}),
      ...(item.zOrder !== undefined ? { zOrder: item.zOrder } : {}),
      ...(item.layer !== undefined ? { layer: item.layer } : {}),
      ...(item.visible !== undefined ? { visible: item.visible } : {}),
      ...(item.locked !== undefined ? { locked: item.locked } : {}),
      ...(item.assetKey ? { assetKey: item.assetKey } : {}), ...(item.assetVariant ? { assetVariant: item.assetVariant } : {}),
      ...(item.assetConfig ? { assetConfig: { ...item.assetConfig } } : {}),
      ...(item.groupId ? { groupKey: groupKeyForId(item.groupId) } : {}),
      ...(item.exteriorZoneId ? { zoneRef: zoneKeyById.get(item.exteriorZoneId) } : {}),
    });
  });
  (floor.windows ?? []).forEach((window) => {
    const object = floorWindowObject(window, wallKeyForId);
    if (object) objects.push(object);
  });
  // Preserve the physical opening appearance of Entrance-generated Doors,
  // while omitting their canonical Entrance identity and all graph linkage.
  (floor.doors ?? []).forEach((door) => {
    const object = floorDoorObject(door, wallKeyForId);
    if (object) objects.push({ ...object, doorKey: doorKeyById.get(door.id) });
  });
  // Keep Stair geometry as physical starter content, but deliberately omit
  // canonical/shared emergency identity so the template cannot inherit a
  // cross-Floor evacuation system from its source Building.
  (floor.stairs ?? []).forEach((stair) => {
    objects.push({ kind: "stairs", x: stair.x, y: stair.y, width: stair.width, height: stair.height, rotation: stair.rotation, flip: stair.flip, direction: stair.direction, label: stair.label, zOrder: stair.zOrder, visible: stair.visible, locked: stair.locked });
  });
  (floor.ramps ?? []).forEach((ramp) => {
    objects.push({ kind: "ramp", x: ramp.x, y: ramp.y, width: ramp.width, height: ramp.height, rotation: ramp.rotation, direction: ramp.direction, label: ramp.label, handrails: ramp.handrails, slope: ramp.slope, zOrder: ramp.zOrder, visible: ramp.visible, locked: ramp.locked });
  });
  (floor.elevators ?? []).forEach((elevator) => {
    objects.push({ kind: "elevator", x: elevator.x, y: elevator.y, width: elevator.width, height: elevator.height, rotation: elevator.rotation, doorWidth: elevator.doorWidth, label: elevator.label, zOrder: elevator.zOrder, visible: elevator.visible, locked: elevator.locked });
  });
  (floor.labels ?? []).forEach((label) => {
    objects.push({ kind: "label", x: label.x, y: label.y, text: label.text, fontSize: label.fontSize, color: label.color, rotation: label.rotation, align: label.align, zOrder: label.zOrder, visible: label.visible, locked: label.locked });
  });
  (floor.exteriorZones ?? []).forEach((zone) => {
    const { id: _id, linkedEntranceId: _entranceId, linkedEntranceIds: _entranceIds, ...physicalZone } = zone;
    objects.push({ ...physicalZone, kind: "exterior-zone", zoneKey: zoneKeyById.get(zone.id)! } satisfies FloorTemplateExteriorZoneObject);
  });
  (floor.entranceSteps ?? []).forEach((item) => {
    const { id: _id, parentZoneId, linkedEntranceId: _entranceId, ...physicalItem } = item;
    objects.push({
      ...physicalItem,
      kind: "entrance-steps",
      ...(parentZoneId ? { parentZoneRef: zoneKeyById.get(parentZoneId) } : {}),
    } satisfies FloorTemplateEntranceStepsObject);
  });
  (floor.entranceRamps ?? []).forEach((item) => {
    const { id: _id, parentZoneId, linkedEntranceId: _entranceId, ...physicalItem } = item;
    objects.push({
      ...physicalItem,
      kind: "entrance-ramp",
      ...(parentZoneId ? { parentZoneRef: zoneKeyById.get(parentZoneId) } : {}),
    } satisfies FloorTemplateEntranceRampObject);
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
    extensions: (floor.extensions ?? []).map(({ side, offset, width: extensionWidth, depth }) => ({ side, offset, width: extensionWidth, depth })),
    appearance: floorAppearance,
    backgroundColor: floor.backgroundColor,
    showGrid: floor.showGrid,
    gridSize: floor.gridSize,
    showWallJunctions: floor.showWallJunctions,
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
