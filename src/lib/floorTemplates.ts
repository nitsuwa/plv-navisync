import { createDefaultFloor, normalizeFloor } from "./floorPlanNormalization";
// Room-scale definitions are internal physical archetypes for composing a
// Floor Template. They are never exposed as a separate editor feature.
import { ROOM_TEMPLATES, instantiateRoomTemplate, type RoomTemplateDefinition, type RoomTemplateObject, type TemplateDefinitionBase } from "./roomTemplates";
import { isFloorAuthoringGridEligible } from "./floorAppearance";
import type { FloorAppearance, FloorDoor, FloorFurniture, FloorPlan, FloorWall, FloorWindow } from "../components/map-builder/types";
import { nearestPointOnWall, syncOpeningsToWalls } from "./floorGeometry";

/** Legacy Floor template metadata kept for compatibility with older payloads. */
export type FloorTemplateCategory = "Academic" | "Laboratory" | "Office" | "Library / Services" | "Facilities" | "Other";
export type FloorTemplateSource = "builtin" | "campus" | "shared";

export interface FloorTemplateRoomInstance {
  kind: "room-template";
  /** Legacy definitions reference the registry; custom Floor templates may embed a
   * sanitized Room definition so their preview/use does not depend on another
   * database row. */
  templateId?: string;
  template?: RoomTemplateDefinition;
  x: number;
  y: number;
}

export interface FloorTemplateWindowObject {
  kind: "window";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  rotation?: number;
  /** Template-local key for the physical wall this opening belongs to. */
  wallRef?: string;
  /** Normalized position along `wallRef`, retained across instantiation. */
  offset?: number;
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
}

/** A physical Door in a starter layout. It carries only a template-local wall
 * reference, never a live wall/entrance/navigation identity. */
export interface FloorTemplateDoorObject {
  kind: "door";
  x: number;
  y: number;
  width: number;
  direction: FloorDoor["direction"];
  color: string;
  doorType?: FloorDoor["doorType"];
  hinge?: FloorDoor["hinge"];
  swingSide?: FloorDoor["swingSide"];
  wallRef?: string;
  offset?: number;
}

export type FloorTemplateObject =
  | FloorTemplateRoomInstance
  | FloorTemplateDoorObject
  | FloorTemplateWindowObject
  | FloorTemplateWallObject
  | Extract<RoomTemplateObject, { kind: "furniture" }>;

export interface FloorTemplateDefinition extends TemplateDefinitionBase<FloorTemplateCategory> {
  scope: "floor";
  source: FloorTemplateSource;
  canvasWidth: number;
  canvasHeight: number;
  appearance: FloorAppearance;
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
  const usedIds = new Set<string>(UUID_RE.test(context.baseFloor.id) ? [context.baseFloor.id] : []);
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
    backgroundColor: template.appearance.color,
    appearance: template.appearance,
    showGrid: isFloorAuthoringGridEligible(template.appearance.material, template.appearance.texture),
  }, { buildingId: context.buildingId });
  const perimeterEnabled = template.perimeterEnabled !== false;
  const perimeterSettings = {
    perimeterThickness: template.perimeterThickness ?? 6,
    perimeterMaterial: template.perimeterMaterial ?? "concrete",
    perimeterColor: template.perimeterColor ?? "#64748b",
  };
  const perimeterWalls = perimeterEnabled
    ? baseWithAppearance.walls.map((wall) => wall.managedKind === "perimeter"
      ? { ...wall, thickness: perimeterSettings.perimeterThickness, material: perimeterSettings.perimeterMaterial, color: perimeterSettings.perimeterColor }
      : wall)
    : baseWithAppearance.walls.filter((wall) => wall.managedKind !== "perimeter");
  const rooms = [] as FloorPlan["rooms"];
  const walls = [...perimeterWalls] as FloorWall[];
  const doors = [] as FloorPlan["doors"];
  const furniture = [] as FloorFurniture[];
  const windows = [] as FloorPlan["windows"];
  const templateWallIds = new Map<string, string>();
  const pendingDoors: FloorTemplateDoorObject[] = [];
  const pendingWindows: FloorTemplateWindowObject[] = [];
  for (const object of template.objects) {
    if (object.kind === "room-template") {
      const nested = object.template ?? ROOM_TEMPLATES.find((candidate) => candidate.id === object.templateId);
      if (!nested) continue;
      const created = instantiateRoomTemplate(nested, { x: object.x, y: object.y }, {
        floorId: baseWithAppearance.id,
        buildingId: context.buildingId,
        existingFurnitureCount: furniture.length,
        idFactory: makeId,
      });
      rooms.push(created.room);
      for (const wall of created.walls) {
        const { wallKey, ...physicalWall } = wall as FloorWall & { wallKey?: string };
        walls.push(physicalWall);
        if (wallKey) templateWallIds.set(wallKey, physicalWall.id);
      }
      furniture.push(...created.furniture);
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
        color: object.color ?? "#64748b",
        material: object.material ?? "drywall",
        layer: "structure",
        visible: true,
        locked: false,
      } satisfies FloorWall;
      walls.push(wall);
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
      zOrder: (baseWithAppearance.furniture.length ?? 0) + furniture.length,
      visible: true,
      locked: false,
    });
  }
  // Resolve all openings only after every fresh wall exists. Explicit
  // template-local references win; built-ins from legacy room archetypes use
  // the nearest physical wall as a deterministic compatibility fallback.
  const attachToWall = (
    opening: FloorTemplateDoorObject | FloorTemplateWindowObject,
    kind: "door" | "window",
  ) => {
    const explicitWallId = opening.wallRef ? templateWallIds.get(opening.wallRef) : undefined;
    const explicitWall = explicitWallId ? walls.find((wall) => wall.id === explicitWallId) : undefined;
    const nearestWall = explicitWall ?? walls
      .filter((wall) => Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) > 1)
      .map((wall) => ({ wall, distance: nearestPointOnWall({ x: opening.x, y: opening.y }, wall).d }))
      .sort((a, b) => a.distance - b.distance)[0]?.wall;
    if (!nearestWall) return null;
    const nearest = nearestPointOnWall({ x: opening.x, y: opening.y }, nearestWall);
    const base = kind === "door"
      ? {
          id: makeId("dr"),
          x: opening.x,
          y: opening.y,
          width: opening.width,
          direction: opening.direction,
          doorType: opening.doorType,
          hinge: opening.hinge,
          swingSide: opening.swingSide,
          color: opening.color,
          wallId: nearestWall.id,
          offset: opening.offset ?? nearest.t,
          visible: true,
          locked: false,
        } satisfies FloorDoor
      : {
          id: makeId("win"),
          x: opening.x,
          y: opening.y,
          width: opening.width,
          height: opening.height,
          color: opening.color,
          rotation: opening.rotation ?? 0,
          wallId: nearestWall.id,
          offset: opening.offset ?? nearest.t,
          visible: true,
          locked: false,
        } satisfies FloorWindow;
    return kind === "door"
      ? syncOpeningsToWalls([base as FloorDoor], [], walls).doors[0]
      : syncOpeningsToWalls([], [base as FloorWindow], walls).windows[0];
  };
  pendingDoors.forEach((opening) => {
    const attached = attachToWall(opening, "door");
    if (attached) doors.push(attached as FloorPlan["doors"][number]);
  });
  pendingWindows.forEach((opening) => {
    const attached = attachToWall(opening, "window");
    if (attached) windows.push(attached as FloorPlan["windows"][number]);
  });
  const floor = normalizeFloor({
    ...baseWithAppearance,
    walls,
    rooms,
    furniture,
    // Navigation remains empty. Physical Doors/Windows above are ordinary
    // editable openings and carry no graph or entrance identity.
    doors,
    windows,
    paths: [],
    stairs: [],
    ramps: [],
    elevators: [],
    labels: [],
  }, { buildingId: context.buildingId });
  return { floor, roomCount: rooms.length, furnitureCount: furniture.length, doorCount: doors.length, windowCount: windows.length };
}
