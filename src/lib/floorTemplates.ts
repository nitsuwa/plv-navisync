import { assertFloorPhysicalReferences, createDefaultFloor, normalizeFloor } from "./floorPlanNormalization";
// Room-scale definitions are internal physical archetypes for composing a
// Floor Template. They are never exposed as a separate editor feature.
import { FLOOR_TEMPLATE_ROOM_ARCHETYPES, instantiateRoomTemplate, type RoomTemplateDefinition, type RoomTemplateObject, type TemplateDefinitionBase } from "./roomTemplates";
import { isFloorAuthoringGridEligible } from "./floorAppearance";
import type { FloorAppearance, FloorDoor, FloorElevatorItem, FloorEntranceRamp, FloorEntranceSteps, FloorExteriorZone, FloorExtension, FloorFurniture, FloorLabel, FloorPath, FloorPlan, FloorRamp, FloorRoom, FloorStairs, FloorWall, FloorWallEndpointAnchor, FloorWindow } from "../components/map-builder/types";
import { nearestPointOnWall } from "./floorGeometry";
import { createFloorPerimeterWalls } from "./floorShape";

/** Legacy Floor template metadata kept for compatibility with older payloads. */
export type FloorTemplateCategory = "Academic" | "Laboratory" | "Office" | "Library / Services" | "Facilities" | "Other";
export type FloorTemplateSource = "builtin" | "campus" | "shared";

export interface FloorTemplateRoomInstance {
  kind: "room-template";
  /** Optional local identity for legacy embedded Room Template instances. */
  roomKey?: string;
  /** Legacy definitions reference the registry; custom Floor templates may embed a
   * sanitized Room definition so their preview/use does not depend on another
   * database row. */
  templateId?: string;
  template?: RoomTemplateDefinition;
  x: number;
  y: number;
}

/** Exact visual Room snapshot. `roomKey` is template-local and is used only
 * to remap anchored Wall endpoints after fresh Room IDs exist. */
export type FloorTemplateRoomObject = Pick<FloorRoom, "x" | "y" | "w" | "h" | "type" | "name"> & {
  kind: "room";
  roomKey: string;
  /** Template-local identities for physical access Doors; no source UUIDs. */
  accessDoorRefs?: string[];
  color?: string;
  rotation?: number;
  shapePoints?: Array<{ x: number; y: number }>;
  zOrder?: number;
  visible?: boolean;
  locked?: boolean;
  description?: string;
  accessibility?: boolean;
};

export type FloorTemplateWallAnchor = Pick<FloorWallEndpointAnchor, "edge" | "offset"> & { roomRef: string };

export type FloorTemplateFurnitureObject = Pick<FloorFurniture, "x" | "y" | "width" | "height" | "type" | "name" | "category" | "color"> & {
  kind: "furniture";
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  zOrder?: number;
  layer?: string;
  visible?: boolean;
  locked?: boolean;
  assetKey?: string;
  assetVariant?: string;
  assetConfig?: Record<string, string | number | boolean>;
  groupKey?: string;
  /** Template-local exterior-zone identity for furniture hosted by a zone. */
  zoneRef?: string;
};

export type FloorTemplatePathObject = Pick<FloorPath, "points" | "type" | "color" | "width"> & { kind: "path" };
export type FloorTemplateExteriorZoneObject = Omit<FloorExteriorZone, "id" | "linkedEntranceId" | "linkedEntranceIds"> & {
  kind: "exterior-zone";
  zoneKey: string;
};
export type FloorTemplateEntranceStepsObject = Omit<FloorEntranceSteps, "id" | "parentZoneId" | "linkedEntranceId"> & {
  kind: "entrance-steps";
  parentZoneRef?: string;
};
export type FloorTemplateEntranceRampObject = Omit<FloorEntranceRamp, "id" | "parentZoneId" | "linkedEntranceId"> & {
  kind: "entrance-ramp";
  parentZoneRef?: string;
};

export interface FloorTemplateWindowObject {
  kind: "window";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  rotation?: number;
  /** Template-local key for the physical wall this opening belongs to. */
  wallRef?: string | null;
  /** Normalized position along `wallRef`, retained across instantiation. */
  offset?: number;
  zOrder?: number;
  visible?: boolean;
  locked?: boolean;
}

export interface FloorTemplateWallObject {
  kind: "wall";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness?: number;
  color?: string;
  material?: string;
  /** Stable template-local key; never a live Floor wall ID. */
  wallKey?: string;
  height?: number;
  layer?: string;
  visible?: boolean;
  locked?: boolean;
  junctionBlocks?: FloorWall["junctionBlocks"];
  zOrder?: number;
  startAnchor?: FloorTemplateWallAnchor;
  endAnchor?: FloorTemplateWallAnchor;
}

/** A physical Door in a starter layout. It carries only a template-local wall
 * reference, never a live wall/entrance/navigation identity. */
export interface FloorTemplateDoorObject {
  kind: "door";
  /** Template-local Door identity used by Room access links. */
  doorKey?: string;
  x: number;
  y: number;
  width: number;
  direction: FloorDoor["direction"];
  color: string;
  doorType?: FloorDoor["doorType"];
  hinge?: FloorDoor["hinge"];
  swingSide?: FloorDoor["swingSide"];
  wallRef?: string | null;
  offset?: number;
  openingType?: FloorDoor["openingType"];
  accessDirection?: FloorDoor["accessDirection"];
  zOrder?: number;
  label?: string;
  visible?: boolean;
  locked?: boolean;
}

export type FloorTemplateStairsObject = Pick<FloorStairs, "x" | "y" | "width" | "height" | "rotation" | "flip" | "label" | "zOrder" | "visible" | "locked"> & { kind: "stairs"; direction?: FloorStairs["direction"] };
export type FloorTemplateRampObject = Pick<FloorRamp, "x" | "y" | "width" | "height" | "rotation" | "label" | "handrails" | "slope" | "zOrder" | "visible" | "locked"> & { kind: "ramp"; direction?: NonNullable<FloorRamp["direction"]> };
export type FloorTemplateElevatorObject = Pick<FloorElevatorItem, "x" | "y" | "width" | "height" | "rotation" | "doorWidth" | "label" | "zOrder" | "visible" | "locked"> & { kind: "elevator" };
export type FloorTemplateLabelObject = Pick<FloorLabel, "x" | "y" | "text" | "fontSize" | "color" | "rotation" | "align" | "zOrder" | "visible" | "locked"> & { kind: "label" };

export type FloorTemplateObject =
  | FloorTemplateRoomObject
  | FloorTemplateRoomInstance
  | FloorTemplateDoorObject
  | FloorTemplateWindowObject
  | FloorTemplateWallObject
  | FloorTemplateStairsObject
  | FloorTemplateRampObject
  | FloorTemplateElevatorObject
  | FloorTemplateLabelObject
  | FloorTemplateFurnitureObject
  | FloorTemplatePathObject
  | FloorTemplateExteriorZoneObject
  | FloorTemplateEntranceStepsObject
  | FloorTemplateEntranceRampObject;

export interface FloorTemplateDefinition extends TemplateDefinitionBase<FloorTemplateCategory> {
  scope: "floor";
  source: FloorTemplateSource;
  canvasWidth: number;
  canvasHeight: number;
  /** Rectangular additions to the usable outline, without Floor-local IDs. */
  extensions?: Array<Omit<FloorExtension, "id">>;
  appearance: FloorAppearance;
  backgroundColor?: string;
  showGrid?: boolean;
  gridSize?: FloorPlan["gridSize"];
  showWallJunctions?: boolean;
  /** Whether the physical starter includes the managed structural perimeter.
   * This is presentation/authoring metadata only; it never implies doors or
   * navigation connectivity.  Legacy definitions default to enabled for a safe blank
   * floor, while custom definitions persist the author's explicit choice. */
  perimeterEnabled?: boolean;
  perimeterThickness?: number;
  perimeterMaterial?: string;
  perimeterColor?: string;
  objects: FloorTemplateObject[];
  /** Database metadata for campus/shared definitions; legacy definitions leave these unset. */
  persistedId?: string;
  campusId?: string | null;
  createdBy?: string | null;
}

const roomInstance = (templateId: string, x: number, y: number): FloorTemplateRoomInstance => ({
  kind: "room-template", templateId, x, y,
});

const directFurniture = (
  type: string,
  name: string,
  category: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): Extract<RoomTemplateObject, { kind: "furniture" }> => ({
  kind: "furniture", type, name, category, x, y, width, height, color,
});

const directDoor = (
  x: number,
  y: number,
  width = 24,
  direction: FloorDoor["direction"] = "left",
): FloorTemplateDoorObject => ({
  kind: "door",
  x,
  y,
  width,
  direction,
  doorType: width >= 32 ? "double" : "single",
  color: "#b45309",
});

const directWindow = (x: number, y: number, width = 56, height = 5): FloorTemplateWindowObject => ({
  kind: "window",
  x,
  y,
  width,
  height,
  color: "#38bdf8",
});

const directWall = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness = 4,
): Extract<RoomTemplateObject, { kind: "wall" }> => ({
  kind: "wall", x1, y1, x2, y2, thickness,
});

const appearance = (material: FloorAppearance["material"], texture: FloorAppearance["texture"], color: string): FloorAppearance => ({
  material, texture, color,
});

const makeFloorTemplate = (
  id: string,
  name: string,
  category: FloorTemplateCategory,
  description: string,
  canvasWidth: number,
  canvasHeight: number,
  floorAppearance: FloorAppearance,
  objects: FloorTemplateObject[],
  tags: string[],
): FloorTemplateDefinition => ({
  id,
  scope: "floor",
  source: "builtin",
  name,
  category,
  description,
  width: canvasWidth,
  height: canvasHeight,
  canvasWidth,
  canvasHeight,
  appearance: floorAppearance,
  perimeterEnabled: true,
  objects,
  tags,
});

const corridorSpine = (width: number, y: number, height: number): Extract<RoomTemplateObject, { kind: "wall" }>[] => [
  directWall(0, y, width, y, 3),
  directWall(0, y + height, width, y + height, 3),
];

/** Legacy generated layouts retained only for backwards-compatible payload
 * interpretation. Doors and Windows here are physical opening
 * cues only. They intentionally contain no Stairs, Elevators, Ramps,
 * Pathways, navigation nodes, navigation edges, or route metadata. */
const FLOOR_TEMPLATE_DEFINITIONS: FloorTemplateDefinition[] = [
  makeFloorTemplate(
    "academic-classroom-floor",
    "Academic Classroom Floor",
    "Academic",
    "A classroom-focused starter floor with teaching rooms, a shared corridor, and compact faculty support spaces.",
    1100,
    760,
    appearance("neutral", "none", "#e8e1d7"),
    [
      roomInstance("plv-standard-classroom", 40, 36),
      roomInstance("plv-standard-classroom", 344, 36),
      roomInstance("plv-large-classroom", 700, 28),
      roomInstance("faculty-office", 40, 440),
      roomInstance("study-room", 300, 440),
      roomInstance("conference-room", 620, 430),
      ...corridorSpine(1100, 350, 26),
      directDoor(180, 236), directDoor(484, 236), directDoor(880, 268, 32),
      directDoor(150, 440), directDoor(420, 440), directDoor(760, 430, 32),
      directWindow(94, 33, 72), directWindow(450, 33, 72), directWindow(820, 25, 72),
      directWindow(92, 618, 72), directWindow(360, 618, 72), directWindow(720, 610, 72),
    ],
    ["classroom", "academic", "teaching", "lecture", "corridor", "plv"],
  ),
  makeFloorTemplate(
    "computer-laboratory-floor",
    "Computer Laboratory Floor",
    "Laboratory",
    "Three aligned computer laboratories share a central circulation spine with faculty and study support rooms.",
    1380,
    900,
    appearance("vinyl", "subtle", "#d7d3c8"),
    [
      roomInstance("computer-laboratory", 40, 36),
      roomInstance("computer-laboratory", 500, 36),
      roomInstance("computer-laboratory", 960, 36),
      roomInstance("faculty-office", 40, 500),
      roomInstance("faculty-office", 300, 500),
      roomInstance("study-room", 560, 500),
      roomInstance("faculty-office", 840, 500),
      ...corridorSpine(1380, 390, 30),
      directDoor(220, 296, 32), directDoor(680, 296, 32), directDoor(1140, 296, 32),
      directDoor(150, 500), directDoor(410, 500), directDoor(680, 500), directDoor(950, 500),
      directWindow(120, 33, 76), directWindow(580, 33, 76), directWindow(1040, 33, 76),
      directWindow(120, 680, 76), directWindow(380, 680, 76), directWindow(900, 680, 76),
    ],
    ["computer", "laboratory", "workstations", "technician", "support"],
  ),
  makeFloorTemplate(
    "engineering-laboratory-floor",
    "Engineering Laboratory Floor",
    "Laboratory",
    "An engineering teaching floor with a main laboratory, technical work area, and faculty support room.",
    1380,
    900,
    appearance("concrete", "subtle", "#c7c9c7"),
    [
      roomInstance("engineering-laboratory", 30, 30),
      roomInstance("engineering-laboratory", 710, 30),
      roomInstance("faculty-office", 30, 570),
      roomInstance("study-room", 710, 570),
      ...corridorSpine(1380, 540, 30),
    ],
    ["engineering", "laboratory", "workbench", "drafting", "technical"],
  ),
  makeFloorTemplate(
    "office-administration-floor",
    "Office / Administration Floor",
    "Office",
    "A compact administration floor with staff offices, a meeting room, and a dedicated reception/service suite.",
    1040,
    720,
    appearance("vinyl", "subtle", "#d7d3c8"),
    [
      roomInstance("faculty-office", 40, 36),
      roomInstance("faculty-office", 300, 36),
      roomInstance("administrative-office", 560, 36),
      roomInstance("conference-room", 40, 330),
      roomInstance("faculty-office", 360, 330),
      roomInstance("reception-service-office", 680, 300),
      ...corridorSpine(1040, 270, 24),
      directDoor(150, 216), directDoor(410, 216), directDoor(680, 216, 32),
      directDoor(180, 330), directDoor(470, 330), directDoor(830, 300, 32),
      directWindow(100, 33, 64), directWindow(360, 33, 64), directWindow(650, 33, 64),
      directWindow(100, 510, 64), directWindow(440, 510, 64), directWindow(900, 500, 64),
    ],
    ["office", "administration", "faculty", "conference", "reception", "service"],
  ),
  makeFloorTemplate(
    "library-study-floor",
    "Library / Study Floor",
    "Library / Services",
    "A quiet library starter floor with reading areas, study rooms, and generous shelving zones.",
    1280,
    820,
    appearance("wood", "subtle", "#c99a6b"),
    [
      roomInstance("library-reading-area", 30, 30),
      roomInstance("study-room", 690, 30),
      roomInstance("study-room", 690, 380),
      roomInstance("faculty-office", 30, 500),
      directFurniture("reception-counter", "Reception / Service Counter", "facilities", 1010, 560, 60, 18, "#7a5c3a"),
    ],
    ["library", "study", "reading", "shelving", "services"],
  ),
  makeFloorTemplate(
    "student-services-floor",
    "Student Services Floor",
    "Facilities",
    "A student-facing services floor with lounge and service rooms, support offices, and a dedicated restroom cluster.",
    1180,
    820,
    appearance("ceramic_tile", "subtle", "#e5e7eb"),
    [
      roomInstance("student-lounge", 40, 36),
      roomInstance("reception-service-office", 400, 36),
      roomInstance("faculty-office", 760, 48),
      roomInstance("standard-restroom", 40, 420),
      roomInstance("womens-restroom", 300, 420),
      roomInstance("pwd-accessible-restroom", 560, 410),
      roomInstance("library-service-counter-area", 820, 390),
      ...corridorSpine(1180, 330, 26),
      directDoor(200, 256, 32), directDoor(550, 246, 32), directDoor(870, 228),
      directDoor(150, 420), directDoor(420, 420), directDoor(690, 410), directDoor(1000, 390, 32),
      directWindow(120, 33, 80), directWindow(510, 33, 80), directWindow(820, 45, 64),
      directWindow(110, 606, 64), directWindow(380, 606, 64), directWindow(660, 596, 64), directWindow(1010, 622, 64),
    ],
    ["student", "services", "lounge", "restroom", "amenities", "support"],
  ),
  makeFloorTemplate(
    "plv-academic-corridor-floor",
    "PLV Academic Corridor Floor",
    "Academic",
    "A PLV-oriented corridor plan with four compact teaching rooms and a clear shared circulation spine.",
    1000,
    680,
    appearance("neutral", "none", "#e8e1d7"),
    [
      roomInstance("plv-standard-classroom", 40, 36),
      roomInstance("plv-standard-classroom", 360, 36),
      roomInstance("plv-large-classroom", 620, 26),
      roomInstance("faculty-office", 40, 390),
      roomInstance("study-room", 360, 390),
      ...corridorSpine(1000, 330, 26),
    ],
    ["plv", "academic", "corridor", "classrooms", "ceit", "caba"],
  ),
  makeFloorTemplate(
    "plv-administration-faculty-floor",
    "PLV Administration / Faculty Floor",
    "Office",
    "A compact PLV administration archetype with offices, a conference room, and a visible service/reception zone.",
    900,
    620,
    appearance("vinyl", "subtle", "#d7d3c8"),
    [
      roomInstance("administrative-office", 36, 36),
      roomInstance("faculty-office", 320, 36),
      roomInstance("conference-room", 36, 300),
      roomInstance("faculty-office", 390, 300),
      directFurniture("reception-counter", "Reception / Service Counter", "facilities", 690, 320, 60, 18, "#7a5c3a"),
      directFurniture("waiting-bench", "Waiting Bench", "seating", 682, 370, 72, 16, "#475569"),
    ],
    ["plv", "administration", "faculty", "office", "caba", "service"],
  ),
  makeFloorTemplate(
    "plv-library-student-services-floor",
    "PLV Library / Student Services Floor",
    "Library / Services",
    "A PLV student-facing plan combining reading, shelving, service counters, lounge space, and accessible restroom provision.",
    1100,
    720,
    appearance("wood", "subtle", "#c99a6b"),
    [
      roomInstance("library-reading-area", 36, 36),
      roomInstance("library-stack-area", 430, 36),
      roomInstance("student-lounge", 36, 330),
      roomInstance("standard-restroom", 430, 330),
      roomInstance("pwd-restroom", 700, 330),
      directFurniture("reception-counter", "Reception / Service Counter", "facilities", 900, 520, 60, 18, "#7a5c3a"),
    ],
    ["plv", "library", "student-services", "reading", "shelving", "coed"],
  ),
  makeFloorTemplate(
    "plv-lecture-assembly-floor",
    "PLV Lecture / Assembly Floor",
    "Academic",
    "A presentation-oriented PLV starter with a lecture hall, support lecture room, and faculty preparation space.",
    1100,
    720,
    appearance("terrazzo", "subtle", "#d6d3d1"),
    [
      roomInstance("lecture-hall", 36, 36),
      roomInstance("lecture-room", 570, 36),
      roomInstance("faculty-office", 570, 370),
      roomInstance("conference-room", 36, 500),
    ],
    ["plv", "lecture", "assembly", "orientation", "coed"],
  ),
  makeFloorTemplate(
    "plv-classroom-laboratory-floor",
    "PLV Classroom + Laboratory Floor",
    "Academic",
    "A PLV teaching archetype pairing a standard classroom with a technical laboratory and compact faculty support room.",
    1100,
    720,
    appearance("concrete", "subtle", "#c7c9c7"),
    [
      roomInstance("plv-standard-classroom", 36, 36),
      roomInstance("engineering-laboratory", 430, 36),
      roomInstance("faculty-office", 36, 380),
      roomInstance("study-room", 430, 390),
      ...corridorSpine(1100, 350, 24),
    ],
    ["plv", "classroom", "laboratory", "teaching", "ceit", "caba"],
  ),
  makeFloorTemplate(
    "plv-laboratory-floor",
    "PLV Laboratory Floor",
    "Academic",
    "A PLV-oriented laboratory plan with engineering work areas, digital workstations, equipment support, and faculty space.",
    1200,
    760,
    appearance("vinyl", "subtle", "#d7d3c8"),
    [
      roomInstance("engineering-laboratory", 36, 36),
      roomInstance("computer-laboratory", 450, 36),
      roomInstance("drafting-technical-laboratory", 36, 410),
      roomInstance("faculty-office", 450, 430),
      ...corridorSpine(1200, 385, 24),
    ],
    ["plv", "laboratory", "engineering", "technical", "ceit"],
  ),
];

/**
 * The active catalogue is intentionally user-created only.  The former
 * generated starters remain in this module as inert, source-only definitions
 * so persisted/legacy imports can still be interpreted, but they are never
 * returned to the Floor Editor catalogue or counted as available templates.
 */
export const FLOOR_TEMPLATES: FloorTemplateDefinition[] = [];

export const FLOOR_TEMPLATE_CATEGORIES: Array<FloorTemplateCategory | "All"> = [
  "All", "Academic", "Laboratory", "Office", "Library / Services", "Facilities", "Other",
];

export function getFloorTemplates(query = "", category: FloorTemplateCategory | "All" = "All"): FloorTemplateDefinition[] {
  const normalized = query.trim().toLowerCase();
  return FLOOR_TEMPLATES.filter((template) => {
    if (category !== "All" && template.category !== category) return false;
    if (!normalized) return true;
    return `${template.name} ${template.category} ${template.description} ${template.tags.join(" ")}`.toLowerCase().includes(normalized);
  });
}

export interface FloorTemplateInstantiationContext {
  baseFloor: FloorPlan;
  buildingId: string;
  idFactory?: (prefix: string) => string;
  /** Campus-wide IDs reserved so new template entities cannot reuse live or archived identities. */
  reservedIds?: Iterable<string>;
}

export interface InstantiatedFloorTemplate {
  floor: FloorPlan;
  roomCount: number;
  furnitureCount: number;
  doorCount: number;
  windowCount: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function newUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Instantiates a visual Floor template on top of the canonical blank Floor
 * allocated by addFloorToBuilding.  The base Floor supplies its fresh ID and
 * canonical number; all nested physical records receive fresh IDs.  No graph
 * arrays or navigation-owned objects are produced.
 */
export function instantiateFloorTemplate(
  template: FloorTemplateDefinition,
  context: FloorTemplateInstantiationContext,
): InstantiatedFloorTemplate {
  const usedIds = new Set<string>(context.reservedIds ?? []);
  if (UUID_RE.test(context.baseFloor.id)) usedIds.add(context.baseFloor.id);
  const makeId = (prefix: string) => {
    // Prefixes are only semantic hints for legacy callers. Any physical
    // entity that can reach campus persistence must use a bare RFC UUID.
    const candidate = context.idFactory?.(prefix);
    let id = candidate && UUID_RE.test(candidate) && !usedIds.has(candidate) ? candidate : newUuid();
    while (usedIds.has(id)) id = newUuid();
    usedIds.add(id);
    return id;
  };
  // Re-run the canonical blank-floor constructor at the template dimensions so
  // managed perimeter walls are born at the correct corners rather than being
  // copied from the default 600×450 canvas and stretched later.
  const base = createDefaultFloor({
    id: context.baseFloor.id,
    buildingId: context.buildingId,
    number: context.baseFloor.number,
    label: context.baseFloor.label,
    canvasW: template.canvasWidth,
    canvasH: template.canvasHeight,
  });
  const baseWithAppearance = normalizeFloor({
    ...base,
    backgroundColor: template.backgroundColor ?? template.appearance.color,
    appearance: template.appearance,
    showGrid: template.showGrid ?? isFloorAuthoringGridEligible(template.appearance.material, template.appearance.texture),
    ...(template.gridSize !== undefined ? { gridSize: template.gridSize } : {}),
    ...(template.showWallJunctions !== undefined ? { showWallJunctions: template.showWallJunctions } : {}),
    extensions: (template.extensions ?? []).map((extension, index) => ({ ...extension, id: makeId(`floor-extension-${index + 1}`) })),
  }, { buildingId: context.buildingId });
  const perimeterEnabled = template.perimeterEnabled !== false;
  const perimeterSettings = {
    perimeterThickness: template.perimeterThickness ?? 6,
    perimeterMaterial: template.perimeterMaterial ?? "concrete",
    perimeterColor: template.perimeterColor ?? "#64748b",
  };
  const perimeterWalls = perimeterEnabled
    ? createFloorPerimeterWalls(baseWithAppearance.id, template.canvasWidth, template.canvasHeight, baseWithAppearance.extensions, perimeterSettings, baseWithAppearance.walls)
    : baseWithAppearance.walls.filter((wall) => wall.managedKind !== "perimeter");
  const rooms = [] as FloorPlan["rooms"];
  const paths = [] as FloorPlan["paths"];
  const walls = [...perimeterWalls] as FloorWall[];
  const doors = [] as FloorPlan["doors"];
  const furniture = [] as FloorFurniture[];
  const windows = [] as FloorPlan["windows"];
  const stairs = [] as FloorPlan["stairs"];
  const ramps = [] as FloorPlan["ramps"];
  const elevators = [] as FloorPlan["elevators"];
  const labels = [] as FloorPlan["labels"];
  const exteriorZones = [] as NonNullable<FloorPlan["exteriorZones"]>;
  const entranceSteps = [] as NonNullable<FloorPlan["entranceSteps"]>;
  const entranceRamps = [] as NonNullable<FloorPlan["entranceRamps"]>;
  const templateWallIds = new Map<string, string>();
  const templateRoomIds = new Map<string, string>();
  const templateDoorIds = new Map<string, string>();
  const roomAccessDoorRefsById = new Map<string, string[]>();
  const templateZoneIds = new Map<string, string>();
  const furnitureGroupIds = new Map<string, string>();
  const mapRoomIdentityAliases = (value: unknown, roomId: string) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    for (const key of ["roomKey", "roomRef", "roomId", "templateRoomId", "id"]) {
      const alias = record[key];
      if (typeof alias !== "string" || !alias.trim()) continue;
      const existing = templateRoomIds.get(alias);
      if (existing && existing !== roomId) throw new Error(`Floor template Room identity "${alias}" is ambiguous.`);
      templateRoomIds.set(alias, roomId);
    }
  };
  const remapAnchor = (anchor: FloorTemplateWallAnchor | undefined): FloorWallEndpointAnchor | undefined => {
    if (!anchor) return undefined;
    const legacyAnchor = anchor as FloorTemplateWallAnchor & { roomId?: string; templateRoomId?: string };
    const roomRef = anchor.roomRef ?? legacyAnchor.templateRoomId ?? legacyAnchor.roomId;
    const roomId = roomRef ? templateRoomIds.get(roomRef) : undefined;
    if (!roomId) throw new Error(`Floor template Wall refers to missing Room key "${roomRef ?? "(empty)"}".`);
    return { targetType: "room", roomId, edge: anchor.edge, offset: anchor.offset };
  };
  for (const wall of perimeterWalls) {
    if (wall.perimeterSide) templateWallIds.set(`perimeter-${wall.perimeterSide}`, wall.id);
  }
  // Allocate all local Exterior Zone identities before restoring Furniture and
  // local access-feature parent references.
  for (const object of template.objects) {
    if (object.kind !== "exterior-zone") continue;
    if (!object.zoneKey || templateZoneIds.has(object.zoneKey)) {
      throw new Error(`Floor template contains a missing or duplicate Exterior Zone key "${object.zoneKey ?? ""}".`);
    }
    const { kind: _kind, zoneKey, linkedEntranceId: _entranceId, linkedEntranceIds: _entranceIds, ...physicalZone } = object as FloorTemplateExteriorZoneObject & { linkedEntranceId?: string; linkedEntranceIds?: string[] };
    const id = makeId("zone");
    templateZoneIds.set(zoneKey, id);
    exteriorZones.push({ ...physicalZone, id });
  }
  const resolveZoneRef = (zoneRef: string | undefined) => {
    if (!zoneRef) return undefined;
    const id = templateZoneIds.get(zoneRef);
    if (!id) throw new Error(`Floor template object refers to missing Exterior Zone key "${zoneRef}".`);
    return id;
  };
  const pendingDoors: FloorTemplateDoorObject[] = [];
  const pendingWindows: FloorTemplateWindowObject[] = [];
  const pendingWallAnchors: Array<{ wallId: string; object: Extract<FloorTemplateObject, { kind: "wall" }> }> = [];
  // Pass one creates every direct Room and makes its new identity available to
  // anchored Walls in pass two. Old payloads without roomKey use the same
  // deterministic local ordering used by their wall roomRef values. Room
  // access/navigation fields are never copied.
  const directRoomObjects = template.objects.filter((object): object is FloorTemplateRoomObject => object.kind === "room");
  const roomKeyFor = (object: FloorTemplateRoomObject, index: number) =>
    typeof object.roomKey === "string" && object.roomKey.trim() ? object.roomKey : `room-${index + 1}`;
  const seenRoomKeys = new Set<string>();
  directRoomObjects.forEach((object, index) => {
    const roomKey = roomKeyFor(object, index);
    if (seenRoomKeys.has(roomKey)) throw new Error(`Floor template contains duplicate Room key "${roomKey}".`);
    seenRoomKeys.add(roomKey);
  });
  for (const [roomIndex, object] of directRoomObjects.entries()) {
    const room: FloorPlan["rooms"][number] = {
      id: makeId("rm"),
      name: object.name,
      type: object.type,
      x: object.x,
      y: object.y,
      w: object.w,
      h: object.h,
      floorId: baseWithAppearance.id,
      buildingId: context.buildingId,
      ...(object.color !== undefined ? { color: object.color } : {}),
      ...(object.rotation !== undefined ? { rotation: object.rotation } : {}),
      ...(object.shapePoints ? { shapePoints: object.shapePoints.map((point) => ({ x: point.x, y: point.y })) } : {}),
      ...(object.zOrder !== undefined ? { zOrder: object.zOrder } : {}),
      ...(object.visible !== undefined ? { visible: object.visible } : {}),
      ...(object.locked !== undefined ? { locked: object.locked } : {}),
      ...(object.description !== undefined ? { description: object.description } : {}),
      ...(object.accessibility !== undefined ? { accessibility: object.accessibility } : {}),
    };
    rooms.push(room);
    if (object.accessDoorRefs?.length) roomAccessDoorRefsById.set(room.id, [...object.accessDoorRefs]);
    mapRoomIdentityAliases({ ...object, roomKey: roomKeyFor(object, roomIndex) }, room.id);
  }
  for (const object of template.objects) {
    if (object.kind === "room") continue;
    if (object.kind === "exterior-zone") continue;
    if (object.kind === "path") {
      const { kind: _kind, ...path } = object;
      paths.push({ ...path, id: makeId("path"), points: path.points.map((point) => ({ x: point.x, y: point.y })) });
      continue;
    }
    if (object.kind === "entrance-steps") {
      const { kind: _kind, parentZoneRef, linkedEntranceId: _entranceId, ...physicalItem } = object as FloorTemplateEntranceStepsObject & { linkedEntranceId?: string };
      entranceSteps.push({ ...physicalItem, id: makeId("steps"), ...(parentZoneRef ? { parentZoneId: resolveZoneRef(parentZoneRef) } : {}) });
      continue;
    }
    if (object.kind === "entrance-ramp") {
      const { kind: _kind, parentZoneRef, linkedEntranceId: _entranceId, ...physicalItem } = object as FloorTemplateEntranceRampObject & { linkedEntranceId?: string };
      entranceRamps.push({ ...physicalItem, id: makeId("entrance-ramp"), ...(parentZoneRef ? { parentZoneId: resolveZoneRef(parentZoneRef) } : {}) });
      continue;
    }
    if (object.kind === "room-template") {
      const nested = object.template ?? FLOOR_TEMPLATE_ROOM_ARCHETYPES.find((candidate) => candidate.id === object.templateId);
      if (!nested) continue;
      const created = instantiateRoomTemplate(nested, { x: object.x, y: object.y }, {
        floorId: baseWithAppearance.id,
        buildingId: context.buildingId,
        existingFurnitureCount: furniture.length,
        existingWalls: walls,
        groupIdMap: furnitureGroupIds,
        idFactory: makeId,
      });
      rooms.push(created.room);
      if (object.roomKey && seenRoomKeys.has(object.roomKey)) throw new Error(`Floor template contains duplicate Room key "${object.roomKey}".`);
      mapRoomIdentityAliases(object, created.room.id);
      for (const wall of created.walls) {
        const { wallKey, ...physicalWall } = wall as FloorWall & { wallKey?: string };
        walls.push(physicalWall);
        if (wallKey) templateWallIds.set(wallKey, physicalWall.id);
      }
      furniture.push(...created.furniture);
      doors.push(...created.doors);
      windows.push(...created.windows);
      continue;
    }
    if (object.kind === "wall") {
      const wall = {
        id: makeId("wl"),
        x1: object.x1,
        y1: object.y1,
        x2: object.x2,
        y2: object.y2,
        thickness: object.thickness ?? 4,
        ...(object.height !== undefined ? { height: object.height } : {}),
        color: object.color ?? "#64748b",
        material: object.material ?? "drywall",
        layer: object.layer ?? "structure",
        ...(object.junctionBlocks !== undefined ? { junctionBlocks: object.junctionBlocks } : {}),
        visible: object.visible !== false,
        locked: object.locked === true,
        ...(object.zOrder !== undefined ? { zOrder: object.zOrder } : {}),
      } satisfies FloorWall;
      walls.push(wall);
      if (object.startAnchor || object.endAnchor) pendingWallAnchors.push({ wallId: wall.id, object });
      if (object.wallKey) templateWallIds.set(object.wallKey, wall.id);
      continue;
    }
    if (object.kind === "door") {
      pendingDoors.push(object);
      continue;
    }
    if (object.kind === "window") {
      pendingWindows.push(object);
      continue;
    }
    if (object.kind === "stairs") {
      stairs.push({
        id: makeId("st"), x: object.x, y: object.y, width: object.width, height: object.height,
        rotation: object.rotation, flip: object.flip, direction: object.direction ?? "both", label: object.label,
        visible: object.visible !== false, locked: object.locked === true,
        ...(object.zOrder !== undefined ? { zOrder: object.zOrder } : {}),
      });
      continue;
    }
    if (object.kind === "ramp") {
      ramps.push({
        id: makeId("rp"), x: object.x, y: object.y, width: object.width, height: object.height,
        rotation: object.rotation, label: object.label, direction: object.direction ?? "both", handrails: object.handrails,
        slope: object.slope, visible: object.visible !== false, locked: object.locked === true,
        ...(object.zOrder !== undefined ? { zOrder: object.zOrder } : {}),
      });
      continue;
    }
    if (object.kind === "elevator") {
      elevators.push({
        id: makeId("el"), x: object.x, y: object.y, width: object.width, height: object.height,
        rotation: object.rotation, doorWidth: object.doorWidth, label: object.label,
        visible: object.visible !== false, locked: object.locked === true,
        ...(object.zOrder !== undefined ? { zOrder: object.zOrder } : {}),
      });
      continue;
    }
    if (object.kind === "label") {
      labels.push({
        id: makeId("lb"), x: object.x, y: object.y, text: object.text, fontSize: object.fontSize,
        color: object.color, rotation: object.rotation, align: object.align, visible: object.visible !== false,
        locked: object.locked === true, ...(object.zOrder !== undefined ? { zOrder: object.zOrder } : {}),
      });
      continue;
    }
    furniture.push({
      id: makeId("fn"),
      type: object.type,
      name: object.name,
      category: object.category,
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      rotation: object.rotation ?? 0,
      color: object.color,
      zOrder: object.zOrder ?? (baseWithAppearance.furniture.length ?? 0) + furniture.length,
      ...(object.flipX ? { flipX: true } : {}),
      ...(object.flipY ? { flipY: true } : {}),
      ...(object.assetKey ? { assetKey: object.assetKey } : {}),
      ...(object.assetVariant ? { assetVariant: object.assetVariant } : {}),
      ...(object.assetConfig ? { assetConfig: { ...object.assetConfig } } : {}),
      ...(object.layer !== undefined ? { layer: object.layer } : {}),
      ...(object.groupKey ? { groupId: furnitureGroupIds.get(object.groupKey) ?? (() => { const id = makeId("fg"); furnitureGroupIds.set(object.groupKey!, id); return id; })() } : {}),
      ...(object.zoneRef ? { exteriorZoneId: resolveZoneRef(object.zoneRef) } : {}),
      visible: object.visible !== false,
      locked: object.locked === true,
    });
  }
  // Resolve endpoint anchors only after every legacy Room-template object has
  // also contributed its fresh Room identity to the local map.
  pendingWallAnchors.forEach(({ wallId, object }) => {
    const index = walls.findIndex((wall) => wall.id === wallId);
    if (index < 0) throw new Error(`Floor template Wall "${wallId}" was lost during instantiation.`);
    walls[index] = {
      ...walls[index],
      ...(object.startAnchor ? { startAnchor: remapAnchor(object.startAnchor) } : {}),
      ...(object.endAnchor ? { endAnchor: remapAnchor(object.endAnchor) } : {}),
    };
  });
  // Resolve all openings only after every fresh wall exists. Explicit
  // template-local references win; built-ins from legacy room archetypes use
  // the nearest physical wall as a deterministic compatibility fallback.
  const attachToWall = (
    opening: FloorTemplateDoorObject | FloorTemplateWindowObject,
    kind: "door" | "window",
  ) => {
    if (opening.wallRef === null) {
      const id = makeId(kind === "door" ? "dr" : "win");
      if (kind === "door") {
        const door = opening as FloorTemplateDoorObject;
        return {
          id, x: door.x, y: door.y, width: door.width, direction: door.direction, color: door.color,
          ...(door.doorType ? { doorType: door.doorType } : {}), ...(door.hinge ? { hinge: door.hinge } : {}),
          ...(door.swingSide ? { swingSide: door.swingSide } : {}), ...(door.openingType ? { openingType: door.openingType } : {}),
          ...(door.accessDirection ? { accessDirection: door.accessDirection } : {}), ...(door.label !== undefined ? { label: door.label } : {}),
          ...(door.zOrder !== undefined ? { zOrder: door.zOrder } : {}), visible: door.visible !== false, locked: door.locked === true,
        } satisfies FloorDoor;
      }
      const window = opening as FloorTemplateWindowObject;
      return {
        id, x: window.x, y: window.y, width: window.width, height: window.height, color: window.color,
        ...(window.rotation !== undefined ? { rotation: window.rotation } : {}), ...(window.zOrder !== undefined ? { zOrder: window.zOrder } : {}),
        visible: window.visible !== false, locked: window.locked === true,
      } as FloorWindow;
    }
    const explicitWallId = opening.wallRef ? templateWallIds.get(opening.wallRef) : undefined;
    if (opening.wallRef && !explicitWallId) throw new Error(`Floor template opening refers to missing Wall key "${opening.wallRef}".`);
    const perimeterRef = opening.wallRef?.match(/^perimeter-(top|right|bottom|left)$/)?.[1];
    const perimeterCandidates = perimeterRef
      ? walls.filter((wall) => wall.managedKind === "perimeter" && wall.perimeterSide === perimeterRef)
      : [];
    const explicitWall = perimeterCandidates.length > 0
      ? perimeterCandidates.slice().sort((a, b) => nearestPointOnWall({ x: opening.x, y: opening.y }, a).d - nearestPointOnWall({ x: opening.x, y: opening.y }, b).d)[0]
      : explicitWallId ? walls.find((wall) => wall.id === explicitWallId) : undefined;
    const nearestWall = explicitWall ?? walls
      .filter((wall) => Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) > 1)
      .map((wall) => ({ wall, distance: nearestPointOnWall({ x: opening.x, y: opening.y }, wall).d }))
      .sort((a, b) => a.distance - b.distance)[0]?.wall;
    if (!nearestWall) return null;
    const nearest = nearestPointOnWall({ x: opening.x, y: opening.y }, nearestWall);
    const base: FloorDoor | FloorWindow = kind === "door"
      ? (() => {
          const door = opening as FloorTemplateDoorObject;
          return {
          id: makeId("dr"),
          x: door.x,
          y: door.y,
          width: door.width,
          direction: door.direction,
          doorType: door.doorType,
          hinge: door.hinge,
          swingSide: door.swingSide,
          color: door.color,
          wallId: nearestWall.id,
          offset: door.offset ?? nearest.t,
          openingType: door.openingType,
          accessDirection: door.accessDirection,
          label: door.label,
          zOrder: door.zOrder,
          visible: door.visible !== false,
          locked: door.locked === true,
        } satisfies FloorDoor;
      })()
      : (() => {
          const window = opening as FloorTemplateWindowObject;
          return {
          id: makeId("win"),
          x: window.x,
          y: window.y,
          width: window.width,
          height: window.height,
          color: window.color,
          ...(window.rotation !== undefined ? { rotation: window.rotation } : {}),
          wallId: nearestWall.id,
          offset: window.offset ?? nearest.t,
          zOrder: window.zOrder,
          visible: window.visible !== false,
          locked: window.locked === true,
        } as FloorWindow;
      })();
    // The snapshot already carries exact physical coordinates and normalized
    // offsets. Re-synchronizing here rounds position/width, causing a visible
    // jump after the first normal Floor update/save.
    return base;
  };
  pendingDoors.forEach((opening) => {
    const attached = attachToWall(opening, "door");
    if (attached) {
      const door = attached as FloorPlan["doors"][number];
      doors.push(door);
      if (opening.doorKey) {
        if (templateDoorIds.has(opening.doorKey)) throw new Error(`Floor template contains duplicate Door key "${opening.doorKey}".`);
        templateDoorIds.set(opening.doorKey, door.id);
      }
    }
  });
  pendingWindows.forEach((opening) => {
    const attached = attachToWall(opening, "window");
    if (attached) windows.push(attached as FloorPlan["windows"][number]);
  });
  const roomsWithAccessDoors = rooms.map((room) => {
    const refs = roomAccessDoorRefsById.get(room.id);
    if (!refs) return room;
    const ids = Array.from(new Set(refs.map((ref) => {
      const id = templateDoorIds.get(ref);
      if (!id) throw new Error(`Floor template Room refers to missing Door key "${ref}".`);
      return id;
    })));
    return { ...room, accessDoorId: ids[0], accessDoorIds: ids.length > 0 ? ids : undefined };
  });
  const floor = normalizeFloor({
    ...baseWithAppearance,
    walls,
    rooms: roomsWithAccessDoors,
    furniture,
    // Navigation remains empty. Physical Doors/Windows above are ordinary
    // editable openings and carry no graph or entrance identity.
    doors,
    windows,
    paths,
    stairs,
    ramps,
    elevators,
    labels,
    exteriorZones,
    entranceSteps,
    entranceRamps,
    extensions: baseWithAppearance.extensions,
  }, { buildingId: context.buildingId });
  assertFloorPhysicalReferences(floor);
  return { floor, roomCount: rooms.length, furnitureCount: furniture.length, doorCount: doors.length, windowCount: windows.length };
}

export interface FloorTemplateFitResult {
  template: FloorTemplateDefinition;
  scale: number;
  safe: boolean;
  reason?: string;
}

function scaleRoomTemplateDefinition(template: RoomTemplateDefinition, scale: number): RoomTemplateDefinition {
  const scalePoint = (point: { x: number; y: number }) => ({ x: point.x * scale, y: point.y * scale });
  return {
    ...template,
    width: template.width * scale,
    height: template.height * scale,
    objects: template.objects.map((object) => {
      if (object.kind === "room") return {
        ...object, x: object.x * scale, y: object.y * scale, width: object.width * scale, height: object.height * scale,
        ...(object.shapePoints ? { shapePoints: object.shapePoints.map(scalePoint) } : {}),
      };
      if (object.kind === "wall") return { ...object, x1: object.x1 * scale, y1: object.y1 * scale, x2: object.x2 * scale, y2: object.y2 * scale, thickness: object.thickness == null ? undefined : object.thickness * scale };
      return { ...object, x: object.x * scale, y: object.y * scale, width: object.width * scale, height: "height" in object ? object.height * scale : undefined } as RoomTemplateObject;
    }),
    ...(template.boundary ? { boundary: template.boundary.map((segment) => ({
      ...segment, x1: segment.x1 * scale, y1: segment.y1 * scale, x2: segment.x2 * scale, y2: segment.y2 * scale,
      thickness: segment.thickness == null ? undefined : segment.thickness * scale,
    })) } : {}),
  };
}

function scaleFloorTemplateObject(object: FloorTemplateObject, scale: number, offsetX: number, offsetY: number): FloorTemplateObject {
  if (object.kind === "room") return {
    ...object,
    x: object.x * scale + offsetX,
    y: object.y * scale + offsetY,
    w: object.w * scale,
    h: object.h * scale,
    ...(object.shapePoints ? { shapePoints: object.shapePoints.map((point) => ({ x: point.x * scale + offsetX, y: point.y * scale + offsetY })) } : {}),
  };
  if (object.kind === "room-template") return {
    ...object,
    x: object.x * scale + offsetX,
    y: object.y * scale + offsetY,
    ...(object.template ? { template: scaleRoomTemplateDefinition(object.template, scale) } : {}),
  };
  if (object.kind === "wall") return {
    ...object, x1: object.x1 * scale + offsetX, y1: object.y1 * scale + offsetY,
    x2: object.x2 * scale + offsetX, y2: object.y2 * scale + offsetY,
    thickness: object.thickness == null ? undefined : object.thickness * scale,
  };
  if (object.kind === "path") return {
    ...object,
    points: object.points.map((point) => ({ x: point.x * scale + offsetX, y: point.y * scale + offsetY })),
    width: object.width * scale,
  };
  if (object.kind === "exterior-zone") return {
    ...object,
    ...(object.x !== undefined ? { x: object.x * scale + offsetX } : {}),
    ...(object.y !== undefined ? { y: object.y * scale + offsetY } : {}),
    width: object.width * scale,
    depth: object.depth * scale,
    labelOffsetX: object.labelOffsetX === undefined ? undefined : object.labelOffsetX * scale,
    labelOffsetY: object.labelOffsetY === undefined ? undefined : object.labelOffsetY * scale,
  };
  if (object.kind === "stairs" || object.kind === "ramp" || object.kind === "elevator") return {
    ...object, x: object.x * scale + offsetX, y: object.y * scale + offsetY,
    width: object.width * scale, height: object.height * scale,
    ...(object.kind === "elevator" ? { doorWidth: object.doorWidth * scale } : {}),
  };
  if (object.kind === "label") return { ...object, x: object.x * scale + offsetX, y: object.y * scale + offsetY, fontSize: object.fontSize * scale };
  return {
    ...object, x: object.x * scale + offsetX, y: object.y * scale + offsetY,
    width: object.width * scale, height: "height" in object ? object.height * scale : undefined,
  } as FloorTemplateObject;
}

/** Uniformly scale and center a physical Floor template. The returned `safe`
 * flag is false if a physical dimension would fall below the editor's usable
 * minimums; callers should require Use Template Size instead. */
export function fitFloorTemplateToSize(template: FloorTemplateDefinition, targetWidth: number, targetHeight: number): FloorTemplateFitResult {
  const sourceWidth = template.canvasWidth || template.width;
  const sourceHeight = template.canvasHeight || template.height;
  if (!(sourceWidth > 0 && sourceHeight > 0 && targetWidth > 0 && targetHeight > 0)) {
    return { template, scale: 0, safe: false, reason: "Floor dimensions must be positive." };
  }
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const offsetX = (targetWidth - sourceWidth * scale) / 2;
  const offsetY = (targetHeight - sourceHeight * scale) / 2;
  const fitted: FloorTemplateDefinition = {
    ...template,
    width: targetWidth,
    height: targetHeight,
    canvasWidth: targetWidth,
    canvasHeight: targetHeight,
    ...(template.perimeterThickness !== undefined ? { perimeterThickness: template.perimeterThickness * scale } : {}),
    ...(template.extensions ? { extensions: template.extensions.map((extension) => ({ ...extension, offset: extension.offset * scale, width: extension.width * scale, depth: extension.depth * scale })) } : {}),
    objects: template.objects.map((object) => scaleFloorTemplateObject(object, scale, offsetX, offsetY)),
  };
  const allObjects: FloorTemplateObject[] = [];
  const collect = (objects: FloorTemplateObject[]) => objects.forEach((object) => {
    allObjects.push(object);
    if (object.kind === "room-template" && object.template) collect(object.template.objects as FloorTemplateObject[]);
  });
  collect(fitted.objects);
  const unsafe = allObjects.some((object) => {
    if (object.kind === "door") return object.width < (object.doorType === "double" ? 28 : 10);
    if (object.kind === "window") return object.width < 8;
    if (object.kind === "stairs" || object.kind === "elevator") return object.width < 24 || object.height < 24;
    // Ramps are commonly drawn as long, shallow plan rectangles (for example
    // 80 × 20), so validate the short axis against a smaller usable minimum.
    if (object.kind === "ramp") return Math.max(object.width, object.height) < 24 || Math.min(object.width, object.height) < 12;
    if (object.kind === "furniture") return object.width < 8 || object.height < 8;
    if (object.kind === "wall") return (object.thickness ?? 4) < 1.5;
    if (object.kind === "room-template" && object.template) return object.template.width < 30 || object.template.height < 30;
    return false;
  });
  return unsafe
    ? { template: fitted, scale, safe: false, reason: "Template is too large to safely scale to this Floor. Use Template Size instead." }
    : { template: fitted, scale, safe: true };
}
