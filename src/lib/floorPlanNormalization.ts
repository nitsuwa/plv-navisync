import type { FloorPlan, FloorUndoEntry, FloorWall, FloorWallEndpointAnchor } from "../components/map-builder/types";
import { normalizeFloorPlanBackground } from "./floorPlanBackground";
import { DEFAULT_FLOOR_CANVAS, normalizeFloorCanvasSize } from "./floorGeometry";

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
] as const;

type FloorCollectionKey = typeof FLOOR_COLLECTION_KEYS[number];

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

function normalizeManagedPerimeterWallIds(walls: FloorWall[]) {
  const remap = new Map<string, string>();
  const idsBySide = new Map<NonNullable<FloorWall["perimeterSide"]>, string>();
  const nextWalls = walls.map((wall) => {
    const side = syntheticManagedPerimeterSide(wall);
    if (!side && wall.managedKind !== "perimeter") return wall;
    const existingForSide = side ? idsBySide.get(side) : undefined;
    const nextId = validUuid(wall.id) ? wall.id : existingForSide ?? generateEntityId();
    if (side) idsBySide.set(side, nextId);
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
    backgroundColor: typeof source.backgroundColor === "string" && source.backgroundColor ? source.backgroundColor : DEFAULT_FLOOR_BACKGROUND,
    showGrid: source.showGrid !== false,
    gridSize: normalizeGridSize(source.gridSize),
    backgroundImage: normalizeFloorPlanBackground(source.backgroundImage, canvas.w, canvas.h),
    calibration: normalizeCalibration(source.calibration),
    rooms: arrayCopy<FloorPlan["rooms"][number]>(source.rooms).map((room, index) => ({
      ...room,
      buildingId: room.buildingId ?? buildingId,
      floorId: room.floorId ?? id,
      rotation: normalizedNumber(room.rotation, 0),
      zOrder: normalizedNumber(room.zOrder, index),
      visible: room.visible !== false,
      locked: room.locked === true,
    })),
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
  };
  return normalized as FloorPlan;
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
}

/**
 * Deep-duplicate a floor. When `outIdMaps` is supplied it is filled with the
 * old→new element id maps so callers (e.g. B5 Phase 2 floor-nav duplication)
 * can remap linked references that live OUTSIDE the FloorPlan object.
 */
export function duplicateFloorForBuilding(
  source: Partial<FloorPlan>,
  defaults: FloorDefaults & { buildingId: string },
  outIdMaps?: FloorDuplicateIdMaps
): FloorPlan {
  const floor = normalizeFloor(source, defaults);
  const id = defaults.id ?? generateFloorId();
  const buildingId = defaults.buildingId;
  const roomIdMap = new Map(floor.rooms.map((room) => [room.id, generateFloorId()]));
  const wallIdMap = new Map(floor.walls.map((wall) => [wall.id, generateFloorId()]));
  const doorIdMap = new Map(floor.doors.map((door) => [door.id, generateFloorId()]));
  const windowIdMap = new Map(floor.windows.map((win) => [win.id, generateFloorId()]));
  const stairIdMap = new Map(floor.stairs.map((s) => [s.id, generateFloorId()]));
  const rampIdMap = new Map(floor.ramps.map((r) => [r.id, generateFloorId()]));
  const elevatorIdMap = new Map(floor.elevators.map((e) => [e.id, generateFloorId()]));
  if (outIdMaps) {
    outIdMaps.rooms = roomIdMap;
    outIdMaps.walls = wallIdMap;
    outIdMaps.doors = doorIdMap;
    outIdMaps.windows = windowIdMap;
    outIdMaps.stairs = stairIdMap;
    outIdMaps.ramps = rampIdMap;
    outIdMaps.elevators = elevatorIdMap;
  }
  const remapAnchor = (anchor: FloorWallEndpointAnchor | undefined) => {
    const nextRoomId = anchor ? roomIdMap.get(anchor.roomId) : undefined;
    return anchor && nextRoomId ? { ...anchor, roomId: nextRoomId } : undefined;
  };
  return normalizeFloor({
    ...floor,
    id,
    buildingId,
    number: defaults.number ?? floor.number,
    label: defaults.label ?? `${floor.label} (copy)`,
    rooms: floor.rooms.map((room) => ({ ...room, id: roomIdMap.get(room.id) ?? generateFloorId(), buildingId, floorId: id })),
    paths: floor.paths.map((item) => ({ ...item, id: generateFloorId() })),
    walls: floor.walls.map((item) => ({ ...item, id: wallIdMap.get(item.id) ?? generateFloorId(), startAnchor: remapAnchor(item.startAnchor), endAnchor: remapAnchor(item.endAnchor) })),
    doors: floor.doors.map((item) => ({ ...item, id: doorIdMap.get(item.id) ?? generateFloorId(), wallId: item.wallId ? wallIdMap.get(item.wallId) : undefined })),
    windows: floor.windows.map((item) => ({ ...item, id: windowIdMap.get(item.id) ?? generateFloorId(), wallId: item.wallId ? wallIdMap.get(item.wallId) : undefined })),
    furniture: floor.furniture.map((item) => ({ ...item, id: generateFloorId() })),
    stairs: floor.stairs.map((item) => ({ ...item, id: stairIdMap.get(item.id) ?? generateFloorId() })),
    ramps: floor.ramps.map((item) => ({ ...item, id: rampIdMap.get(item.id) ?? generateFloorId() })),
    elevators: floor.elevators.map((item) => ({ ...item, id: elevatorIdMap.get(item.id) ?? generateFloorId() })),
    labels: floor.labels.map((item) => ({ ...item, id: generateFloorId() })),
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
      ["showGrid", normalized.showGrid],
      ["gridSize", normalized.gridSize],
      ["backgroundImage", normalized.backgroundImage],
      ["calibration", normalized.calibration],
      ["label", normalized.label],
      ...FLOOR_COLLECTION_KEYS.map((key: FloorCollectionKey) => [key, normalized[key]]),
    ]
  ) as FloorUndoEntry;
}
