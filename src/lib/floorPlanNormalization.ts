import type { FloorPlan, FloorUndoEntry, FloorWall, FloorWallEndpointAnchor, FloorRoom, FloorDoor } from "../components/map-builder/types";
import { normalizeFloorPlanBackground } from "./floorPlanBackground";
import { DEFAULT_FLOOR_CANVAS, normalizeFloorCanvasSize } from "./floorGeometry";
import { normalizeFloorAppearance } from "./floorAppearance";
import { normalizeFloorExtensions } from "./floorShape";
import { roomDoorIsValid, roomAccessDoorIds } from "./indoorNavigationGraph";

const FLOOR_COLLECTION_KEYS = [
  "rooms",
  "paths",
  "walls",
  "doors",
  "windows",
  "furniture",
  "stairs",
  "ramps",
  "elevators",
  "labels",
  "exteriorZones",
  "entranceSteps",
  "entranceRamps",
  "extensions",
] as const;

type FloorCollectionKey = typeof FLOOR_COLLECTION_KEYS[number];

function sameFloorValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => sameFloorValue(value, right[index]));
  }
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && sameFloorValue(a[key], b[key]));
}

/** Preserve authored object identities across normalization when a record did
 * not change. Memoized SVG children then render only objects whose authored
 * geometry or properties actually changed. */
export function reuseUnchangedFloorObjectReferences(previous: FloorPlan, normalized: FloorPlan): FloorPlan {
  let result = normalized;
  for (const key of FLOOR_COLLECTION_KEYS) {
    const oldItems = previous[key] as unknown as { id: string }[] | undefined;
    const nextItems = normalized[key] as unknown as { id: string }[] | undefined;
    if (!Array.isArray(oldItems) || !Array.isArray(nextItems)) continue;
    const oldById = new Map(oldItems.map((item) => [item.id, item]));
    const stableItems = nextItems.map((item) => {
      const old = oldById.get(item.id);
      return old && sameFloorValue(old, item) ? old : item;
    });
    const stableCollection = stableItems.length === oldItems.length
      && stableItems.every((item, index) => item === oldItems[index])
      ? oldItems
      : stableItems;
    if (stableCollection !== nextItems) result = { ...result, [key]: stableCollection };
  }
  return result;
}

export interface FloorDefaults {
  id?: string;
  buildingId?: string;
  number?: number;
  label?: string;
  canvasW?: number;
  canvasH?: number;
}

function generateFloorId() {
  return crypto.randomUUID();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERIMETER_SIDES = new Set(["top", "right", "bottom", "left"]);

function generateEntityId() {
  return crypto.randomUUID();
}

function validUuid(value: unknown) {
  return typeof value === "string" && UUID_RE.test(value);
}

function syntheticManagedPerimeterSide(wall: Partial<FloorWall>) {
  if (wall.perimeterSide && PERIMETER_SIDES.has(wall.perimeterSide)) return wall.perimeterSide;
  const id = typeof wall.id === "string" ? wall.id : "";
  const match = /^managed-perimeter-.+-(top|right|bottom|left)$/.exec(id);
  return match?.[1] as FloorWall["perimeterSide"] | undefined;
}

/**
 * Older floors persisted managed perimeter walls without perimeterSide
 * metadata. Recover that metadata from the complete perimeter geometry so a
 * resize can update the existing wall IDs instead of creating a second set
 * and orphaning wall-attached openings.
 */
function inferredManagedPerimeterSide(wall: Partial<FloorWall>, walls: FloorWall[]) {
  const explicit = syntheticManagedPerimeterSide(wall);
  if (explicit) return explicit;
  const managed = walls.filter((candidate) => candidate.managedKind === "perimeter");
  if (managed.length === 0) return undefined;
  const maxX = Math.max(...managed.flatMap((candidate) => [candidate.x1, candidate.x2]));
  const maxY = Math.max(...managed.flatMap((candidate) => [candidate.y1, candidate.y2]));
  const horizontal = Math.abs((wall.y2 ?? 0) - (wall.y1 ?? 0)) <= 0.01;
  const vertical = Math.abs((wall.x2 ?? 0) - (wall.x1 ?? 0)) <= 0.01;
  if (horizontal) {
    if (Math.abs((wall.y1 ?? 0)) <= 0.01) return "top" as const;
    if (Math.abs((wall.y1 ?? 0) - maxY) <= 0.01) return "bottom" as const;
  }
  if (vertical) {
    if (Math.abs((wall.x1 ?? 0)) <= 0.01) return "left" as const;
    if (Math.abs((wall.x1 ?? 0) - maxX) <= 0.01) return "right" as const;
  }
  return undefined;
}

function normalizeManagedPerimeterWallIds(walls: FloorWall[]) {
  const remap = new Map<string, string>();
  const usedIds = new Set<string>();
  const nextWalls = walls.map((wall) => {
    const side = inferredManagedPerimeterSide(wall, walls);
    if (!side && wall.managedKind !== "perimeter") return wall;
    const nextId = validUuid(wall.id) && !usedIds.has(wall.id) ? wall.id : generateEntityId();
    usedIds.add(nextId);
    if (wall.id !== nextId) remap.set(wall.id, nextId);
    return { ...wall, id: nextId, managedKind: "perimeter" as const, perimeterSide: side ?? wall.perimeterSide };
  });
  return { walls: nextWalls, remap };
}

function arrayCopy<T>(value: unknown): T[] {
  return Array.isArray(value) ? value.map((item) => ({ ...(item as object) }) as T) : [];
}

function normalizedNumber(value: unknown, fallback: number): number {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeWallAnchor(anchor: unknown): FloorWallEndpointAnchor | undefined {
  const value = anchor as Partial<FloorWallEndpointAnchor> | null | undefined;
  if (!value || value.targetType !== "room" || typeof value.roomId !== "string") return undefined;
  if (value.edge !== "top" && value.edge !== "right" && value.edge !== "bottom" && value.edge !== "left") return undefined;
  return {
    targetType: "room",
    roomId: value.roomId,
    edge: value.edge,
    offset: Math.max(0, Math.min(1, normalizedNumber(value.offset, 0))),
  };
}

function normalizeWallAttachment(item: { wallId?: unknown; offset?: unknown }) {
  return {
    wallId: typeof item.wallId === "string" && item.wallId ? item.wallId : undefined,
    offset: item.wallId ? Math.max(0, Math.min(1, normalizedNumber(item.offset, 0.5))) : undefined,
  };
}

/**
 * Canonicalize Room → Door links against the destination Floor's actual Door
 * set. An optional old→new map is applied before validation so clone/template
 * callers can retain links to copied Doors. Missing external/stale IDs are
 * removed without touching Rooms or any other physical data.
 */
export function normalizeRoomAccessDoors(
  rooms: FloorRoom[],
  doors: FloorDoor[],
  walls: FloorWall[],
  doorIdRemap?: ReadonlyMap<string, string>,
): FloorRoom[] {
  const doorsById = new Map(doors.map((door) => [door.id, door]));
  return rooms.map((room) => {
    const orderedIds = roomAccessDoorIds(room);
    const mappedIds = Array.from(new Set(orderedIds.flatMap((doorId) => {
      const nextId = doorIdRemap?.get(doorId) ?? (doorsById.has(doorId) ? doorId : undefined);
      return nextId && doorsById.has(nextId) ? [nextId] : [];
    })));
    const candidateRoom = {
      ...room,
      accessDoorId: mappedIds[0],
      accessDoorIds: mappedIds.length > 0 ? mappedIds : undefined,
    };
    const validIds = mappedIds.filter((doorId) => roomDoorIsValid(candidateRoom, doorsById.get(doorId), walls));
    return {
      ...candidateRoom,
      accessDoorId: validIds[0],
      accessDoorIds: validIds.length > 0 ? validIds : undefined,
      ...(validIds.length === 0 && candidateRoom.accessType === "door" ? { accessType: undefined } : {}),
    };
  });
}

function normalizeCalibration(value: unknown): FloorPlan["calibration"] {
  const item = value as FloorPlan["calibration"] | null | undefined;
  if (!item || !Array.isArray(item.points) || item.points.length !== 2) return undefined;
  const metersPerUnit = normalizedNumber(item.metersPerUnit, 0);
  const editorDistance = normalizedNumber(item.editorDistance, 0);
  const realDistanceM = normalizedNumber(item.realDistanceM, 0);
  if (metersPerUnit <= 0 || editorDistance <= 0 || realDistanceM <= 0) return undefined;
  return {
    metersPerUnit,
    editorDistance,
    realDistanceM,
    points: [
      { x: normalizedNumber(item.points[0]?.x, 0), y: normalizedNumber(item.points[0]?.y, 0) },
      { x: normalizedNumber(item.points[1]?.x, 0), y: normalizedNumber(item.points[1]?.y, 0) },
    ],
    calibratedAt: typeof item.calibratedAt === "string" ? item.calibratedAt : undefined,
  };
}

export function defaultFloorLabel(number: number) {
  return number === 1 ? "Ground Floor" : `Floor ${number}`;
}

/** Canonical floor surface tone used when a floor record has no background color. */
export const DEFAULT_FLOOR_BACKGROUND = "#e8e1d7";
export const DEFAULT_FLOOR_GRID_SIZE = 20;

function normalizeGridSize(value: unknown): FloorPlan["gridSize"] {
  return value === 10 || value === 20 || value === 40 ? value : DEFAULT_FLOOR_GRID_SIZE;
}

export function normalizeFloor(input: Partial<FloorPlan> | null | undefined, defaults: FloorDefaults = {}): FloorPlan {
  const source = input ?? {};
  const number = normalizedNumber(source.number, defaults.number ?? 1);
  const id = String(source.id ?? defaults.id ?? generateFloorId());
  const buildingId = String(source.buildingId ?? defaults.buildingId ?? "");
  const canvas = normalizeFloorCanvasSize(source.canvasW ?? defaults.canvasW, source.canvasH ?? defaults.canvasH);
  const rawWalls = arrayCopy<FloorPlan["walls"][number]>(source.walls).map((item, index) => ({
    ...item,
    startAnchor: normalizeWallAnchor(item.startAnchor),
    endAnchor: normalizeWallAnchor(item.endAnchor),
    zOrder: normalizedNumber(item.zOrder, index),
    visible: item.visible !== false,
    locked: item.locked === true,
    ...(item.junctionBlocks === "show" || item.junctionBlocks === "hide" ? { junctionBlocks: item.junctionBlocks } : {}),
  }));
  const normalizedWalls = normalizeManagedPerimeterWallIds(rawWalls);
  const remapWallAttachment = (item: { wallId?: unknown; offset?: unknown }) => {
    const attachment = normalizeWallAttachment(item);
    return {
      ...attachment,
      wallId: attachment.wallId ? normalizedWalls.remap.get(attachment.wallId) ?? attachment.wallId : undefined,
    };
  };
  const normalized = {
    ...source,
    id,
    buildingId,
    number,
    label: String(source.label ?? defaults.label ?? defaultFloorLabel(number)),
    canvasW: canvas.w,
    canvasH: canvas.h,
    extensions: normalizeFloorExtensions(source.extensions, canvas.w, canvas.h),
    backgroundColor: typeof source.backgroundColor === "string" && source.backgroundColor ? source.backgroundColor : DEFAULT_FLOOR_BACKGROUND,
    appearance: normalizeFloorAppearance(source.appearance, typeof source.backgroundColor === "string" ? source.backgroundColor : DEFAULT_FLOOR_BACKGROUND),
    showGrid: source.showGrid !== false,
    gridSize: normalizeGridSize(source.gridSize),
    backgroundImage: normalizeFloorPlanBackground(source.backgroundImage, canvas.w, canvas.h),
    calibration: normalizeCalibration(source.calibration),
    rooms: arrayCopy<FloorPlan["rooms"][number]>(source.rooms).map((room, index) => {
      const accessDoorIds = Array.from(new Set([
        ...(room.accessDoorId ? [room.accessDoorId] : []),
        ...(Array.isArray(room.accessDoorIds) ? room.accessDoorIds : []),
      ].filter((doorId): doorId is string => typeof doorId === "string" && doorId.trim().length > 0)));
      return {
        ...room,
        ...(Array.isArray(room.accessDoorIds) ? { accessDoorIds: accessDoorIds.length > 0 ? accessDoorIds : undefined } : {}),
        buildingId: room.buildingId ?? buildingId,
        floorId: room.floorId ?? id,
        rotation: normalizedNumber(room.rotation, 0),
        zOrder: normalizedNumber(room.zOrder, index),
        visible: room.visible !== false,
        locked: room.locked === true,
      };
    }),
    paths: arrayCopy<FloorPlan["paths"][number]>(source.paths),
    walls: normalizedWalls.walls,
    doors: arrayCopy<FloorPlan["doors"][number]>(source.doors).map((item, index) => ({
      ...item,
      ...remapWallAttachment(item),
      zOrder: normalizedNumber(item.zOrder, index),
      visible: item.visible !== false,
      locked: item.locked === true,
    })),
    windows: arrayCopy<FloorPlan["windows"][number]>(source.windows).map((item, index) => ({
      ...item,
      ...remapWallAttachment(item),
      zOrder: normalizedNumber(item.zOrder, index),
      visible: item.visible !== false,
      locked: item.locked === true,
    })),
    furniture: arrayCopy<FloorPlan["furniture"][number]>(source.furniture).map((item, index) => ({
      ...item,
      zOrder: normalizedNumber(item.zOrder, index),
      visible: item.visible !== false,
      locked: item.locked === true,
    })),
    stairs: arrayCopy<FloorPlan["stairs"][number]>(source.stairs).map((item, index) => ({
      ...item,
      rotation: normalizedNumber(item.rotation, 0),
      zOrder: normalizedNumber(item.zOrder, index),
      visible: item.visible !== false,
      locked: item.locked === true,
    })),
    ramps: arrayCopy<FloorPlan["ramps"][number]>(source.ramps).map((item, index) => ({
      ...item,
      rotation: normalizedNumber(item.rotation, 0),
      zOrder: normalizedNumber(item.zOrder, index),
      visible: item.visible !== false,
      locked: item.locked === true,
    })),
    elevators: arrayCopy<FloorPlan["elevators"][number]>(source.elevators).map((item, index) => ({
      ...item,
      rotation: normalizedNumber(item.rotation, 0),
      zOrder: normalizedNumber(item.zOrder, index),
      visible: item.visible !== false,
      locked: item.locked === true,
    })),
    labels: arrayCopy<FloorPlan["labels"][number]>(source.labels).map((label, index) => ({
      ...label,
      align: label.align ?? "left",
      zOrder: normalizedNumber(label.zOrder, index),
      visible: label.visible !== false,
      locked: label.locked === true,
    })),
    exteriorZones: arrayCopy<NonNullable<FloorPlan["exteriorZones"]>[number]>(source.exteriorZones).map((zone, index) => ({
      ...zone,
      side: zone.side === "top" || zone.side === "right" || zone.side === "bottom" || zone.side === "left" ? zone.side : "bottom",
      offset: Math.max(0, Math.min(1, normalizedNumber(zone.offset, 0.5))),
      width: Math.max(48, normalizedNumber(zone.width, 180)),
      depth: Math.max(32, normalizedNumber(zone.depth, 72)),
      labelOffsetX: normalizedNumber(zone.labelOffsetX, 0),
      labelOffsetY: normalizedNumber(zone.labelOffsetY, 0),
      labelVisible: zone.labelVisible !== false,
      zOrder: normalizedNumber(zone.zOrder, index),
      visible: zone.visible !== false,
      locked: zone.locked === true,
    })),
    entranceSteps: arrayCopy<NonNullable<FloorPlan["entranceSteps"]>[number]>(source.entranceSteps).map((item, index) => ({
      ...item,
      rotation: normalizedNumber(item.rotation, 0),
      ...(item.parentZoneId ? { parentZoneId: item.parentZoneId, attachmentEdge: item.attachmentEdge === "start" || item.attachmentEdge === "end" ? item.attachmentEdge : "outer" as const, attachmentOffset: Math.max(0, Math.min(1, normalizedNumber(item.attachmentOffset, 0.5))) } : {}),
      accessible: false as const,
      zOrder: normalizedNumber(item.zOrder, index),
      visible: item.visible !== false,
      locked: item.locked === true,
    })),
    entranceRamps: arrayCopy<NonNullable<FloorPlan["entranceRamps"]>[number]>(source.entranceRamps).map((item, index) => ({
      ...item,
      rotation: normalizedNumber(item.rotation, 0),
      ...(item.parentZoneId ? { parentZoneId: item.parentZoneId, attachmentEdge: item.attachmentEdge === "start" || item.attachmentEdge === "end" ? item.attachmentEdge : "outer" as const, attachmentOffset: Math.max(0, Math.min(1, normalizedNumber(item.attachmentOffset, 0.5))) } : {}),
      accessible: true as const,
      zOrder: normalizedNumber(item.zOrder, index),
      visible: item.visible !== false,
      locked: item.locked === true,
    })),
  };
  const normalizedFloor = normalized as FloorPlan;
  return {
    ...normalizedFloor,
    rooms: normalizeRoomAccessDoors(normalizedFloor.rooms, normalizedFloor.doors, normalizedFloor.walls),
  };
}

/**
 * Refuse to persist a Floor whose physical relationships point outside that
 * Floor. Normalization deliberately preserves editor geometry and therefore
 * does not repair dangling references by dropping objects.
 */
export function assertFloorPhysicalReferences(
  floor: FloorPlan,
  options: { entranceIds?: ReadonlySet<string>; exteriorEmergencyStairIds?: ReadonlySet<string> } = {},
): void {
  const floorLabel = `Floor "${floor.label}" (${floor.id})`;
  const roomIds = new Set((floor.rooms ?? []).map((room) => room.id));
  const wallIds = new Set((floor.walls ?? []).map((wall) => wall.id));
  const doorIds = new Set((floor.doors ?? []).map((door) => door.id));
  const zoneIds = new Set((floor.exteriorZones ?? []).map((zone) => zone.id));
  const physicalIds = [
    ...(floor.rooms ?? []), ...(floor.paths ?? []), ...(floor.walls ?? []), ...(floor.doors ?? []),
    ...(floor.windows ?? []), ...(floor.furniture ?? []), ...(floor.stairs ?? []), ...(floor.ramps ?? []),
    ...(floor.elevators ?? []), ...(floor.labels ?? []), ...(floor.exteriorZones ?? []),
    ...(floor.entranceSteps ?? []), ...(floor.entranceRamps ?? []), ...(floor.extensions ?? []),
  ].map((item) => item.id);
  if (physicalIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw new Error(`${floorLabel} contains a physical object with a missing ID.`);
  }
  if (new Set(physicalIds).size !== physicalIds.length) {
    throw new Error(`${floorLabel} contains duplicate physical object IDs.`);
  }
  for (const wall of floor.walls ?? []) {
    for (const [endpoint, anchor] of [["start", wall.startAnchor], ["end", wall.endAnchor]] as const) {
      if (anchor?.targetType === "room" && !roomIds.has(anchor.roomId)) {
        throw new Error(`${floorLabel} Wall anchor refers to missing Room "${anchor.roomId}" on Wall "${wall.id}" (${endpoint} endpoint).`);
      }
    }
  }
  for (const door of floor.doors ?? []) {
    if (door.wallId && !wallIds.has(door.wallId)) {
      throw new Error(`${floorLabel} Door refers to missing Wall "${door.wallId}" (Door "${door.id}").`);
    }
    if (door.buildingEntranceId && options.entranceIds && !options.entranceIds.has(door.buildingEntranceId)) {
      throw new Error(`${floorLabel} Door refers to missing Building Entrance "${door.buildingEntranceId}" (Door "${door.id}").`);
    }
  }
  for (const window of floor.windows ?? []) {
    if (window.wallId && !wallIds.has(window.wallId)) {
      throw new Error(`${floorLabel} Window refers to missing Wall "${window.wallId}" (Window "${window.id}").`);
    }
  }
  for (const room of floor.rooms ?? []) {
    if (room.accessDoorId && !doorIds.has(room.accessDoorId)) {
      throw new Error(`${floorLabel} Room "${room.name}" accessDoorId refers to missing same-Floor Door "${room.accessDoorId}".`);
    }
    for (const doorId of new Set(room.accessDoorIds ?? [])) {
      if (!doorIds.has(doorId)) {
        throw new Error(`${floorLabel} Room "${room.name}" accessDoorIds[] refers to missing same-Floor Door "${doorId}".`);
      }
    }
  }
  for (const item of floor.furniture ?? []) {
    if (item.exteriorZoneId && !zoneIds.has(item.exteriorZoneId)) {
      throw new Error(`${floorLabel} Furniture "${item.id}" refers to missing Exterior Zone "${item.exteriorZoneId}".`);
    }
  }
  for (const zone of floor.exteriorZones ?? []) {
    for (const entranceId of new Set([...(zone.linkedEntranceId ? [zone.linkedEntranceId] : []), ...(zone.linkedEntranceIds ?? [])])) {
      if (options.entranceIds && !options.entranceIds.has(entranceId)) {
        throw new Error(`${floorLabel} Exterior Zone "${zone.id}" refers to missing Building Entrance "${entranceId}".`);
      }
    }
  }
  for (const feature of [...(floor.entranceSteps ?? []), ...(floor.entranceRamps ?? [])]) {
    if (feature.parentZoneId && !zoneIds.has(feature.parentZoneId)) {
      throw new Error(`${floorLabel} Entrance feature "${feature.id}" refers to missing Exterior Zone "${feature.parentZoneId}".`);
    }
    if (feature.linkedEntranceId && options.entranceIds && !options.entranceIds.has(feature.linkedEntranceId)) {
      throw new Error(`${floorLabel} Entrance feature "${feature.id}" refers to missing Building Entrance "${feature.linkedEntranceId}".`);
    }
  }
  if (options.exteriorEmergencyStairIds) {
    for (const stair of floor.stairs ?? []) {
      if (stair.exteriorEmergencyStairId && !options.exteriorEmergencyStairIds.has(stair.exteriorEmergencyStairId)) {
        throw new Error(`${floorLabel} Stair "${stair.id}" refers to missing Exterior Emergency Stair "${stair.exteriorEmergencyStairId}".`);
      }
    }
  }
}

export function createDefaultFloor(defaults: FloorDefaults = {}): FloorPlan {
  const canvas = normalizeFloorCanvasSize(defaults.canvasW ?? DEFAULT_FLOOR_CANVAS.w, defaults.canvasH ?? DEFAULT_FLOOR_CANVAS.h);
  // B7 QA: new floors include managed structural perimeter walls by default.
  const id = defaults.id ?? crypto.randomUUID();
  const perimeterSides = ["top", "right", "bottom", "left"] as const;
  const perimeterWalls: FloorWall[] = perimeterSides.map((side, index) => ({
    id: `managed-perimeter-${id}-${side}`,
    x1: side === "top" ? 0 : side === "right" ? canvas.w : side === "bottom" ? canvas.w : 0,
    y1: side === "top" ? 0 : side === "right" ? 0 : side === "bottom" ? canvas.h : canvas.h,
    x2: side === "top" ? canvas.w : side === "right" ? canvas.w : side === "bottom" ? 0 : 0,
    y2: side === "top" ? 0 : side === "right" ? canvas.h : side === "bottom" ? canvas.h : 0,
    thickness: 6,
    color: "#64748b",
    material: "concrete",
    managedKind: "perimeter" as const,
    perimeterSide: side,
    layer: "structure",
    visible: true,
    locked: true,
    zOrder: -100 + index,
  }));
  return normalizeFloor({ walls: perimeterWalls }, { canvasW: canvas.w, canvasH: canvas.h, ...defaults });
}

export interface FloorDuplicateIdMaps {
  rooms: Map<string, string>;
  walls: Map<string, string>;
  doors: Map<string, string>;
  windows: Map<string, string>;
  stairs: Map<string, string>;
  ramps: Map<string, string>;
  elevators: Map<string, string>;
  furniture?: Map<string, string>;
  exteriorZones?: Map<string, string>;
  furnitureGroups?: Map<string, string>;
  paths?: Map<string, string>;
  labels?: Map<string, string>;
  entranceSteps?: Map<string, string>;
  entranceRamps?: Map<string, string>;
  extensions?: Map<string, string>;
  /** Fresh local identities for cloned cross-floor circulation references. */
  sharedIds?: Map<string, string>;
  /** System-owned Exterior Stair occurrences deliberately omitted by a Floor-only copy. */
  excludedExteriorEmergencyStairIds?: ReadonlySet<string>;
}

export interface FloorDuplicateOptions {
  /** Building duplication copies the owner and its explicitly served occurrences together. */
  includeExteriorEmergencyStairOccurrences?: boolean;
}

/** Building-scoped relationship maps shared while duplicating all its Floors. */
export interface FloorDuplicateRelationshipMaps {
  sharedIds: Map<string, string>;
  entranceIds: Map<string, string>;
  exteriorEmergencyStairs: Map<string, string>;
  furnitureGroups: Map<string, string>;
}

function buildEntityIdMap<T extends { id: string }>(items: T[], supplied?: Map<string, string>, idFactory: () => string = generateEntityId) {
  const map = supplied ?? new Map<string, string>();
  items.forEach((item) => {
    if (!map.has(item.id)) map.set(item.id, idFactory());
  });
  return map;
}

/** Allocate a Floor's identity map before cloning any objects or references. */
export function createFloorDuplicateIdMaps(
  floor: FloorPlan,
  idFactory: () => string = generateEntityId,
  options: FloorDuplicateOptions = {},
): FloorDuplicateIdMaps {
  const copiedStairs = options.includeExteriorEmergencyStairOccurrences
    ? floor.stairs
    : floor.stairs.filter((stair) => !stair.exteriorEmergencyStairId);
  return {
    rooms: buildEntityIdMap(floor.rooms, undefined, idFactory),
    walls: buildEntityIdMap(floor.walls, undefined, idFactory),
    doors: buildEntityIdMap(floor.doors, undefined, idFactory),
    windows: buildEntityIdMap(floor.windows, undefined, idFactory),
    stairs: buildEntityIdMap(copiedStairs, undefined, idFactory),
    ramps: buildEntityIdMap(floor.ramps, undefined, idFactory),
    elevators: buildEntityIdMap(floor.elevators, undefined, idFactory),
    furniture: buildEntityIdMap(floor.furniture, undefined, idFactory),
    exteriorZones: buildEntityIdMap(floor.exteriorZones ?? [], undefined, idFactory),
    furnitureGroups: new Map(),
    paths: buildEntityIdMap(floor.paths, undefined, idFactory),
    labels: buildEntityIdMap(floor.labels, undefined, idFactory),
    entranceSteps: buildEntityIdMap(floor.entranceSteps ?? [], undefined, idFactory),
    entranceRamps: buildEntityIdMap(floor.entranceRamps ?? [], undefined, idFactory),
    extensions: buildEntityIdMap(floor.extensions ?? [], undefined, idFactory),
    sharedIds: new Map(),
    excludedExteriorEmergencyStairIds: new Set(
      options.includeExteriorEmergencyStairOccurrences
        ? []
        : floor.stairs.filter((stair) => !!stair.exteriorEmergencyStairId).map((stair) => stair.id),
    ),
  };
}

/**
 * Deep-duplicate a floor. When `outIdMaps` is supplied it is filled with the
 * old→new element id maps so callers (e.g. B5 Phase 2 floor-nav duplication)
 * can remap linked references that live OUTSIDE the FloorPlan object.
 */
export function duplicateFloorForBuilding(
  source: Partial<FloorPlan>,
  defaults: FloorDefaults & { buildingId: string },
  outIdMaps?: FloorDuplicateIdMaps,
  relationshipMaps?: FloorDuplicateRelationshipMaps,
  idFactory: () => string = generateEntityId,
  options: FloorDuplicateOptions = {},
): FloorPlan {
  // Work from a detached snapshot so nested arrays/metadata in the duplicate
  // cannot remain mutable aliases of the source Floor.
  const floor = structuredClone(normalizeFloor(source, defaults));
  const id = defaults.id ?? generateFloorId();
  const buildingId = defaults.buildingId;
  const roomIdMap = buildEntityIdMap(floor.rooms, outIdMaps?.rooms, idFactory);
  const wallIdMap = buildEntityIdMap(floor.walls, outIdMaps?.walls, idFactory);
  const doorIdMap = buildEntityIdMap(floor.doors, outIdMaps?.doors, idFactory);
  const windowIdMap = buildEntityIdMap(floor.windows, outIdMaps?.windows, idFactory);
  const copiedStairs = options.includeExteriorEmergencyStairOccurrences
    ? floor.stairs
    : floor.stairs.filter((stair) => !stair.exteriorEmergencyStairId);
  const excludedExteriorEmergencyStairIds = new Set(
    options.includeExteriorEmergencyStairOccurrences
      ? []
      : floor.stairs.filter((stair) => !!stair.exteriorEmergencyStairId).map((stair) => stair.id),
  );
  const stairIdMap = buildEntityIdMap(copiedStairs, outIdMaps?.stairs, idFactory);
  const rampIdMap = buildEntityIdMap(floor.ramps, outIdMaps?.ramps, idFactory);
  const elevatorIdMap = buildEntityIdMap(floor.elevators, outIdMaps?.elevators, idFactory);
  const exteriorZoneIdMap = buildEntityIdMap(floor.exteriorZones ?? [], outIdMaps?.exteriorZones, idFactory);
  const pathIdMap = buildEntityIdMap(floor.paths, outIdMaps?.paths, idFactory);
  const labelIdMap = buildEntityIdMap(floor.labels, outIdMaps?.labels, idFactory);
  const entranceStepsIdMap = buildEntityIdMap(floor.entranceSteps ?? [], outIdMaps?.entranceSteps, idFactory);
  const entranceRampsIdMap = buildEntityIdMap(floor.entranceRamps ?? [], outIdMaps?.entranceRamps, idFactory);
  const extensionIdMap = buildEntityIdMap(floor.extensions ?? [], outIdMaps?.extensions, idFactory);
  const furnitureGroupIdMap = relationshipMaps?.furnitureGroups ?? outIdMaps?.furnitureGroups ?? new Map<string, string>();
  const sharedIdMap = relationshipMaps?.sharedIds ?? outIdMaps?.sharedIds ?? new Map<string, string>();
  const furnitureIdMap = buildEntityIdMap(floor.furniture, outIdMaps?.furniture, idFactory);
  floor.furniture.forEach((item) => {
    if (item.groupId && !furnitureGroupIdMap.has(item.groupId)) furnitureGroupIdMap.set(item.groupId, idFactory());
  });
  const remapSharedId = (sharedId: string | undefined) => {
    if (!sharedId) return undefined;
    if (!sharedIdMap.has(sharedId)) sharedIdMap.set(sharedId, idFactory());
    return sharedIdMap.get(sharedId);
  };
  if (outIdMaps) {
    outIdMaps.rooms = roomIdMap;
    outIdMaps.walls = wallIdMap;
    outIdMaps.doors = doorIdMap;
    outIdMaps.windows = windowIdMap;
    outIdMaps.stairs = stairIdMap;
    outIdMaps.ramps = rampIdMap;
    outIdMaps.elevators = elevatorIdMap;
    outIdMaps.furniture = furnitureIdMap;
    outIdMaps.exteriorZones = exteriorZoneIdMap;
    outIdMaps.furnitureGroups = furnitureGroupIdMap;
    outIdMaps.paths = pathIdMap;
    outIdMaps.labels = labelIdMap;
    outIdMaps.entranceSteps = entranceStepsIdMap;
    outIdMaps.entranceRamps = entranceRampsIdMap;
    outIdMaps.extensions = extensionIdMap;
    outIdMaps.sharedIds = sharedIdMap;
    outIdMaps.excludedExteriorEmergencyStairIds = excludedExteriorEmergencyStairIds;
  }
  const requireMapped = (map: Map<string, string>, sourceId: string, relation: string) => {
    const targetId = map.get(sourceId);
    if (!targetId) throw new Error(`Cannot duplicate Floor "${floor.label}": ${relation} refers to unmapped identity "${sourceId}".`);
    return targetId;
  };
  const remapEntranceId = (entranceId: string | undefined) => {
    if (!entranceId) return undefined;
    if (!relationshipMaps) return entranceId;
    // A legacy Door may retain a Building Entrance UUID after the Entrance
    // itself was removed. That optional attachment cannot be reconstructed
    // safely, but the physical Door is still valid and must survive cloning.
    // Never preserve a dangling/source Entrance identity in the destination.
    return relationshipMaps.entranceIds.get(entranceId);
  };
  const remapAnchor = (anchor: FloorWallEndpointAnchor | undefined) => {
    return anchor ? { ...anchor, roomId: requireMapped(roomIdMap, anchor.roomId, "Wall Room anchor") } : undefined;
  };
  return normalizeFloor({
    ...floor,
    id,
    buildingId,
    number: defaults.number ?? floor.number,
    label: defaults.label ?? `${floor.label} (copy)`,
    rooms: floor.rooms.map((room) => ({
      ...room,
      id: requireMapped(roomIdMap, room.id, "Room identity"),
      buildingId,
      floorId: id,
      accessDoorId: room.accessDoorId ? requireMapped(doorIdMap, room.accessDoorId, "Room Door link") : undefined,
      accessDoorIds: Array.isArray(room.accessDoorIds)
        ? room.accessDoorIds.map((doorId) => requireMapped(doorIdMap, doorId, "Room Door link"))
        : undefined,
      // Navigation nodes are copied separately by duplicateFloorInBuilding.
      // Never return a physical Floor clone carrying a source graph identity.
      accessNodeId: undefined,
      ...(relationshipMaps ? { navConnection: undefined } : {}),
      accessType: undefined,
    })),
    paths: floor.paths.map((item) => ({ ...item, id: requireMapped(pathIdMap, item.id, "Floor Path identity") })),
    walls: floor.walls.map((item) => ({ ...item, id: requireMapped(wallIdMap, item.id, "Wall identity"), startAnchor: remapAnchor(item.startAnchor), endAnchor: remapAnchor(item.endAnchor) })),
    doors: floor.doors.map((item) => ({
      ...item,
      id: requireMapped(doorIdMap, item.id, "Door identity"),
      wallId: item.wallId ? requireMapped(wallIdMap, item.wallId, "Door Wall link") : undefined,
      buildingEntranceId: relationshipMaps ? remapEntranceId(item.buildingEntranceId) : undefined,
    })),
    windows: floor.windows.map((item) => ({ ...item, id: requireMapped(windowIdMap, item.id, "Window identity"), wallId: item.wallId ? requireMapped(wallIdMap, item.wallId, "Window Wall link") : undefined })),
    furniture: floor.furniture.map((item) => ({
      ...item,
      id: requireMapped(furnitureIdMap, item.id, "Furniture identity"),
      ...(item.groupId ? { groupId: furnitureGroupIdMap.get(item.groupId) } : {}),
      ...(item.exteriorZoneId ? { exteriorZoneId: requireMapped(exteriorZoneIdMap, item.exteriorZoneId, "Furniture Exterior Zone link") } : {}),
    })),
    stairs: copiedStairs.map((item) => ({
      ...item,
      id: requireMapped(stairIdMap, item.id, "Stair identity"),
      ...(relationshipMaps ? {
        sharedId: remapSharedId(item.sharedId),
        exteriorEmergencyStairId: item.exteriorEmergencyStairId
          ? relationshipMaps.exteriorEmergencyStairs.get(item.exteriorEmergencyStairId)
          : undefined,
      } : { sharedId: remapSharedId(item.sharedId), exteriorEmergencyStairId: undefined }),
    })),
    ramps: floor.ramps.map((item) => ({ ...item, id: requireMapped(rampIdMap, item.id, "Ramp identity"), sharedId: remapSharedId(item.sharedId) })),
    exteriorZones: (floor.exteriorZones ?? []).map((item) => ({
      ...item,
      id: requireMapped(exteriorZoneIdMap, item.id, "Exterior Zone identity"),
      ...(relationshipMaps ? {
        linkedEntranceId: remapEntranceId(item.linkedEntranceId),
        linkedEntranceIds: item.linkedEntranceIds?.map((entranceId) => remapEntranceId(entranceId)).filter((entranceId): entranceId is string => Boolean(entranceId)),
      } : { linkedEntranceId: undefined, linkedEntranceIds: undefined }),
    })),
    entranceSteps: (floor.entranceSteps ?? []).map((item) => ({
      ...item,
      id: requireMapped(entranceStepsIdMap, item.id, "Entrance steps identity"),
      parentZoneId: item.parentZoneId ? requireMapped(exteriorZoneIdMap, item.parentZoneId, "Entrance feature Exterior Zone link") : undefined,
      ...(relationshipMaps && item.linkedEntranceId ? { linkedEntranceId: relationshipMaps.entranceIds.get(item.linkedEntranceId) } : { linkedEntranceId: undefined }),
    })),
    entranceRamps: (floor.entranceRamps ?? []).map((item) => ({
      ...item,
      id: requireMapped(entranceRampsIdMap, item.id, "Entrance ramp identity"),
      parentZoneId: item.parentZoneId ? requireMapped(exteriorZoneIdMap, item.parentZoneId, "Entrance feature Exterior Zone link") : undefined,
      ...(relationshipMaps && item.linkedEntranceId ? { linkedEntranceId: relationshipMaps.entranceIds.get(item.linkedEntranceId) } : { linkedEntranceId: undefined }),
    })),
    extensions: (floor.extensions ?? []).map((item) => ({ ...item, id: requireMapped(extensionIdMap, item.id, "Floor extension identity") })),
    elevators: floor.elevators.map((item) => ({ item, id: requireMapped(elevatorIdMap, item.id, "Elevator identity") })).map(({ item, id }) => ({
      ...item,
      id,
      sharedId: remapSharedId(item.sharedId),
    })),
    labels: floor.labels.map((item) => ({ ...item, id: requireMapped(labelIdMap, item.id, "Label identity") })),
  }, { ...defaults, id, buildingId });
}

export function normalizeFloors(floors: Partial<FloorPlan>[] | null | undefined, buildingId: string): FloorPlan[] {
  return (Array.isArray(floors) ? floors : []).map((floor, idx) =>
    normalizeFloor(floor, { buildingId, number: idx + 1 })
  );
}

export function floorUndoEntryFromFloor(floor: Partial<FloorPlan>): FloorUndoEntry {
  const normalized = normalizeFloor(floor);
  return Object.fromEntries(
    [
      ["canvasW", normalized.canvasW],
      ["canvasH", normalized.canvasH],
      ["backgroundColor", normalized.backgroundColor],
      ["appearance", normalized.appearance],
      ["showGrid", normalized.showGrid],
      ["showWallJunctions", normalized.showWallJunctions],
      ["gridSize", normalized.gridSize],
      ["backgroundImage", normalized.backgroundImage],
      ["calibration", normalized.calibration],
      ["label", normalized.label],
      ...FLOOR_COLLECTION_KEYS.map((key: FloorCollectionKey) => [key, normalized[key]]),
    ]
  ) as FloorUndoEntry;
}
