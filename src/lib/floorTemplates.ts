import { createDefaultFloor, normalizeFloor } from "./floorPlanNormalization";
import { ROOM_TEMPLATES, instantiateRoomTemplate, type RoomTemplateDefinition, type RoomTemplateObject, type TemplateDefinitionBase } from "./roomTemplates";
import { isFloorAuthoringGridEligible } from "./floorAppearance";
import type { FloorAppearance, FloorFurniture, FloorPlan, FloorWall } from "../components/map-builder/types";

/** Built-in Floor starter templates are visual/physical authoring aids. */
export type FloorTemplateCategory = "Academic" | "Laboratory" | "Office" | "Library / Services" | "Facilities" | "Other";
export type FloorTemplateSource = "builtin" | "campus" | "shared";

export interface FloorTemplateRoomInstance {
  kind: "room-template";
  /** Built-ins reference the registry; custom Floor templates may embed a
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
}

export type FloorTemplateObject =
  | FloorTemplateRoomInstance
  | FloorTemplateWindowObject
  | Extract<RoomTemplateObject, { kind: "wall" | "furniture" }>;

export interface FloorTemplateDefinition extends TemplateDefinitionBase<FloorTemplateCategory> {
  scope: "floor";
  source: FloorTemplateSource;
  canvasWidth: number;
  canvasHeight: number;
  appearance: FloorAppearance;
  objects: FloorTemplateObject[];
  /** Database metadata for campus/shared definitions; built-ins leave these unset. */
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
  objects,
  tags,
});

const corridorSpine = (width: number, y: number, height: number): Extract<RoomTemplateObject, { kind: "wall" }>[] => [
  directWall(0, y, width, y, 3),
  directWall(0, y + height, width, y + height, 3),
];

/** Curated PLV starter layouts.  They intentionally contain no Doors,
 * Stairs, Elevators, Ramps, Pathways, navigation nodes, or navigation edges. */
export const FLOOR_TEMPLATES: FloorTemplateDefinition[] = [
  makeFloorTemplate(
    "academic-classroom-floor",
    "Academic Classroom Floor",
    "Academic",
    "A classroom-focused starter floor with four teaching rooms arranged around a clear shared corridor spine.",
    1280,
    900,
    appearance("neutral", "none", "#e8e1d7"),
    [
      roomInstance("classroom-40", 30, 30),
      roomInstance("classroom-40", 690, 30),
      roomInstance("classroom-40", 30, 480),
      roomInstance("classroom-40", 690, 480),
      ...corridorSpine(1280, 455, 30),
    ],
    ["classroom", "academic", "teaching", "lecture", "corridor"],
  ),
  makeFloorTemplate(
    "computer-laboratory-floor",
    "Computer Laboratory Floor",
    "Laboratory",
    "Two computer laboratories with a practical support room and compact equipment staging area.",
    1380,
    900,
    appearance("vinyl", "subtle", "#d7d3c8"),
    [
      roomInstance("computer-laboratory", 30, 30),
      roomInstance("computer-laboratory", 710, 30),
      roomInstance("faculty-office", 30, 570),
      roomInstance("faculty-office", 710, 570),
      ...corridorSpine(1380, 540, 30),
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
    "A balanced administrative floor with offices, a conference room, and an approachable reception area.",
    1040,
    720,
    appearance("vinyl", "subtle", "#d7d3c8"),
    [
      roomInstance("faculty-office", 30, 30),
      roomInstance("faculty-office", 430, 30),
      roomInstance("conference-room", 30, 380),
      roomInstance("faculty-office", 530, 380),
      directFurniture("reception-counter", "Reception / Service Counter", "facilities", 820, 210, 60, 18, "#7a5c3a"),
      directFurniture("waiting-bench", "Waiting Bench", "seating", 810, 290, 72, 16, "#475569"),
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
    "A student-facing services floor with a lounge, support offices, waiting space, and restroom provision.",
    1180,
    820,
    appearance("ceramic_tile", "subtle", "#e5e7eb"),
    [
      roomInstance("student-lounge", 30, 30),
      roomInstance("faculty-office", 590, 30),
      roomInstance("standard-restroom", 30, 450),
      roomInstance("pwd-restroom", 430, 450),
      roomInstance("faculty-office", 800, 30),
      directFurniture("reception-counter", "Reception / Service Counter", "facilities", 870, 450, 60, 18, "#7a5c3a"),
      directFurniture("vending-machine", "Vending Machine", "facilities", 970, 500, 16, 24, "#64748b"),
      directFurniture("drinking-fountain", "Drinking Fountain / Water Dispenser", "facilities", 1010, 500, 18, 12, "#38bdf8"),
    ],
    ["student", "services", "lounge", "restroom", "amenities", "support"],
  ),
];

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
}

/**
 * Instantiates a visual Floor starter on top of the canonical blank Floor
 * allocated by addFloorToBuilding.  The base Floor supplies its fresh ID and
 * canonical number; all nested physical records receive fresh IDs.  No graph
 * arrays or navigation-owned objects are produced.
 */
export function instantiateFloorTemplate(
  template: FloorTemplateDefinition,
  context: FloorTemplateInstantiationContext,
): InstantiatedFloorTemplate {
  const makeId = context.idFactory ?? ((prefix: string) => {
    const uuid = typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${uuid}`;
  });
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
  const rooms = [] as FloorPlan["rooms"];
  const walls = [...baseWithAppearance.walls] as FloorWall[];
  const furniture = [] as FloorFurniture[];
  const windows = [] as FloorPlan["windows"];
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
      walls.push(...created.walls);
      furniture.push(...created.furniture);
      continue;
    }
    if (object.kind === "wall") {
      walls.push({
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
      });
      continue;
    }
    if (object.kind === "window") {
      const windowId = makeId("win");
      const nextWindow = {
        id: windowId,
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
        color: object.color,
        rotation: object.rotation ?? 0,
        visible: true,
        locked: false,
      };
      // Window objects are visual-only template content.  They intentionally
      // do not carry a stale wall ID across a new Floor; admins can attach
      // them through the normal opening workflow after placement.
      windows.push(nextWindow);
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
  const floor = normalizeFloor({
    ...baseWithAppearance,
    walls,
    rooms,
    furniture,
    // Explicitly keep all navigation-adjacent physical collections empty in a
    // new starter; admins add Doors/circulation/navigation manually later.
    doors: [],
    windows,
    paths: [],
    stairs: [],
    ramps: [],
    elevators: [],
    labels: [],
  }, { buildingId: context.buildingId });
  return { floor, roomCount: rooms.length, furnitureCount: furniture.length };
}
