import type { FloorFurniture, FloorRoom, FloorWall } from "../components/map-builder/types";

/** Room-only authoring templates.  Definitions intentionally contain no live
 * object IDs and no navigation data; placement creates ordinary Floor
 * objects through the existing editor update path. */
export type RoomTemplateCategory = "Academic" | "Laboratory" | "Office" | "Study / Library" | "Facilities" | "Other";
export type TemplateScope = "room" | "floor";
export type TemplateSource = "builtin" | "campus" | "shared";

export type RoomTemplateObject =
  | { kind: "room"; x: number; y: number; width: number; height: number; type: string; name?: string }
  | { kind: "wall"; x1: number; y1: number; x2: number; y2: number; thickness?: number; color?: string; material?: string }
  | { kind: "furniture"; x: number; y: number; width: number; height: number; type: string; name: string; category: string; color: string; rotation?: number };

export interface TemplateDefinitionBase<Category extends string = string> {
  id: string;
  scope: TemplateScope;
  name: string;
  category: Category;
  description: string;
  width: number;
  height: number;
  tags: string[];
  /** Built-ins omit this for backwards compatibility; persisted records set it. */
  source?: TemplateSource;
  /** Database identity is metadata only and never becomes a Floor object ID. */
  persistedId?: string;
  campusId?: string | null;
  createdBy?: string | null;
}

export interface RoomTemplateDefinition extends TemplateDefinitionBase<RoomTemplateCategory> {
  scope: "room";
  objects: RoomTemplateObject[];
}

const wallObjects = (width: number, height: number): RoomTemplateObject[] => [
  { kind: "wall", x1: 0, y1: 0, x2: width, y2: 0 },
  { kind: "wall", x1: width, y1: 0, x2: width, y2: height },
  { kind: "wall", x1: width, y1: height, x2: 0, y2: height },
  { kind: "wall", x1: 0, y1: height, x2: 0, y2: 0 },
];

const room = (width: number, height: number, type: string, name: string): RoomTemplateObject => ({
  kind: "room", x: 0, y: 0, width, height, type, name,
});

const furniture = (
  type: string,
  name: string,
  category: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  rotation = 0,
): RoomTemplateObject => ({ kind: "furniture", type, name, category, x, y, width, height, color, rotation });

const studentStations = (cols: number, rows: number, startX: number, startY: number, gapX: number, gapY: number): RoomTemplateObject[] => {
  const result: RoomTemplateObject[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      result.push(furniture("student-desk-chair", "Student Desk + Chair", "tables", startX + col * gapX, startY + row * gapY, 30, 24, "#7a5c3a"));
    }
  }
  return result;
};

const makeTemplate = (
  id: string,
  name: string,
  category: RoomTemplateCategory,
  description: string,
  width: number,
  height: number,
  objects: RoomTemplateObject[],
  tags: string[],
): RoomTemplateDefinition => ({ id, scope: "room", source: "builtin", name, category, description, width, height, objects, tags });

export const ROOM_TEMPLATES: RoomTemplateDefinition[] = [
  makeTemplate(
    "classroom-40",
    "Classroom — 40 Seats",
    "Academic",
    "A compact classroom with five rows of eight student stations, teaching wall, and faculty station.",
    560,
    420,
    [
      room(560, 420, "classroom", "Classroom — 40 Seats"),
      ...wallObjects(560, 420),
      ...studentStations(8, 5, 42, 82, 60, 54),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 248, 348, 34, 26, "#7a5c3a"),
      furniture("whiteboard", "Whiteboard / Teaching Board", "tables", 260, 20, 40, 6, "#f8fafc"),
      furniture("projector", "Projector", "electronics", 274, 50, 12, 10, "#64748b"),
    ],
    ["classroom", "academic", "40 seats", "teaching"],
  ),
  makeTemplate(
    "classroom-60",
    "Classroom — 60 Seats",
    "Academic",
    "A large lecture classroom with six rows of ten student stations and a dedicated teaching wall.",
    680,
    500,
    [
      room(680, 500, "classroom", "Classroom — 60 Seats"),
      ...wallObjects(680, 500),
      ...studentStations(10, 6, 44, 88, 61, 55),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 310, 420, 34, 26, "#7a5c3a"),
      furniture("whiteboard", "Whiteboard / Teaching Board", "tables", 320, 20, 40, 6, "#f8fafc"),
      furniture("projector", "Projector", "electronics", 334, 52, 12, 10, "#64748b"),
    ],
    ["classroom", "academic", "60 seats", "lecture"],
  ),
  makeTemplate(
    "computer-laboratory",
    "Computer Laboratory",
    "Laboratory",
    "Shared computer lab tables with aligned monitors, chairs, teaching wall, and equipment storage.",
    640,
    500,
    [
      room(640, 500, "lab", "Computer Laboratory"),
      ...wallObjects(640, 500),
      furniture("computer-lab-table-6", "Computer Lab Table 6", "electronics", 58, 92, 92, 34, "#475569"),
      furniture("computer-lab-table-6", "Computer Lab Table 6", "electronics", 208, 92, 92, 34, "#475569"),
      furniture("computer-lab-table-6", "Computer Lab Table 6", "electronics", 358, 92, 92, 34, "#475569"),
      furniture("computer-lab-table-4", "Computer Lab Table 4", "electronics", 170, 228, 64, 34, "#475569"),
      furniture("computer-lab-table-4", "Computer Lab Table 4", "electronics", 300, 228, 64, 34, "#475569"),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 300, 410, 34, 26, "#7a5c3a"),
      furniture("equipment-cabinet", "Equipment Cabinet", "storage", 548, 82, 24, 18, "#64748b"),
      furniture("whiteboard", "Whiteboard / Teaching Board", "tables", 300, 20, 40, 6, "#f8fafc"),
      furniture("projector", "Projector", "electronics", 314, 52, 12, 10, "#64748b"),
    ],
    ["computer", "lab", "workstations", "monitors"],
  ),
  makeTemplate(
    "engineering-laboratory",
    "Engineering Laboratory",
    "Laboratory",
    "A practical engineering lab with workbenches, drafting stations, storage, and teaching space.",
    660,
    520,
    [
      room(660, 520, "lab", "Engineering Laboratory"),
      ...wallObjects(660, 520),
      furniture("lab-workbench", "Laboratory Workbench", "tables", 44, 90, 52, 20, "#64748b"),
      furniture("lab-workbench", "Laboratory Workbench", "tables", 132, 90, 52, 20, "#64748b"),
      furniture("lab-workbench", "Laboratory Workbench", "tables", 220, 90, 52, 20, "#64748b"),
      furniture("drafting-table-stool", "Drafting Table + Stool", "tables", 44, 190, 46, 30, "#8b6f4e"),
      furniture("drafting-table-stool", "Drafting Table + Stool", "tables", 128, 190, 46, 30, "#8b6f4e"),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 302, 430, 34, 26, "#7a5c3a"),
      furniture("equipment-cabinet", "Equipment Cabinet", "storage", 560, 84, 24, 18, "#64748b"),
      furniture("whiteboard", "Whiteboard / Teaching Board", "tables", 310, 20, 40, 6, "#f8fafc"),
    ],
    ["engineering", "lab", "workbench", "drafting"],
  ),
  makeTemplate(
    "faculty-office",
    "Faculty / Administrative Office",
    "Office",
    "A focused office layout with a faculty workstation, visitor seating, and storage.",
    360,
    300,
    [
      room(360, 300, "office", "Faculty / Administrative Office"),
      ...wallObjects(360, 300),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 124, 88, 34, 26, "#7a5c3a"),
      furniture("chair", "Chair", "seating", 176, 92, 12, 12, "#4b5563"),
      furniture("chair", "Chair", "seating", 208, 92, 12, 12, "#4b5563"),
      furniture("cabinet", "Cabinet", "storage", 42, 46, 18, 12, "#71717a"),
      furniture("library-bookshelf", "Bookshelf", "storage", 292, 46, 30, 10, "#6b5b45"),
    ],
    ["faculty", "office", "administrative", "visitor"],
  ),
  makeTemplate(
    "conference-room",
    "Conference Room",
    "Office",
    "A meeting room centered on a conference table with surrounding seating and presentation space.",
    440,
    340,
    [
      room(440, 340, "conference", "Conference Room"),
      ...wallObjects(440, 340),
      furniture("conference-table", "Conference Table", "tables", 128, 112, 68, 36, "#795548"),
      furniture("wall-display", "Wall Display / TV", "electronics", 210, 24, 24, 6, "#334155"),
      furniture("whiteboard", "Whiteboard / Teaching Board", "tables", 300, 24, 40, 6, "#f8fafc"),
    ],
    ["meeting", "conference", "office", "presentation"],
  ),
  makeTemplate(
    "study-room",
    "Study Room",
    "Study / Library",
    "A quiet study room with a six-seat study table and reference shelving.",
    380,
    300,
    [
      room(380, 300, "study", "Study Room"),
      ...wallObjects(380, 300),
      furniture("study-table-6", "Study Table + 6 Chairs", "tables", 108, 108, 54, 38, "#8b6f4e"),
      furniture("library-bookshelf", "Bookshelf", "storage", 38, 42, 30, 10, "#6b5b45"),
      furniture("library-bookshelf", "Bookshelf", "storage", 312, 42, 30, 10, "#6b5b45"),
    ],
    ["study", "library", "quiet", "reading"],
  ),
  makeTemplate(
    "library-reading-area",
    "Library Reading Area",
    "Study / Library",
    "A flexible reading area with library study tables and double-sided shelving.",
    620,
    420,
    [
      room(620, 420, "library", "Library Reading Area"),
      ...wallObjects(620, 420),
      furniture("library-study-table", "Library Study Table + Chairs", "tables", 88, 108, 48, 30, "#8b6f4e"),
      furniture("library-study-table", "Library Study Table + Chairs", "tables", 198, 108, 48, 30, "#8b6f4e"),
      furniture("library-study-table", "Library Study Table + Chairs", "tables", 308, 108, 48, 30, "#8b6f4e"),
      furniture("double-sided-library-shelf", "Double-Sided Library Shelf", "storage", 72, 270, 42, 12, "#6b5b45"),
      furniture("double-sided-library-shelf", "Double-Sided Library Shelf", "storage", 188, 270, 42, 12, "#6b5b45"),
      furniture("double-sided-library-shelf", "Double-Sided Library Shelf", "storage", 304, 270, 42, 12, "#6b5b45"),
    ],
    ["library", "reading", "shelves", "study"],
  ),
  makeTemplate(
    "standard-restroom",
    "Standard Restroom",
    "Facilities",
    "An essential restroom layout with stalls, wash basin, mirror, and urinal fixtures.",
    360,
    300,
    [
      room(360, 300, "restroom", "Standard Restroom"),
      ...wallObjects(360, 300),
      furniture("toilet-stall", "Toilet Stall", "restroom", 34, 42, 26, 28, "#e2e8f0"),
      furniture("toilet-stall", "Toilet Stall", "restroom", 76, 42, 26, 28, "#e2e8f0"),
      furniture("urinal", "Urinal", "restroom", 124, 46, 10, 14, "#dbe4ea"),
      furniture("double-sink", "Double Sink", "restroom", 212, 46, 26, 10, "#cbd5e1"),
      furniture("mirror", "Mirror", "restroom", 214, 26, 22, 5, "#93c5fd"),
      furniture("restroom-trash-bin", "Restroom Trash Bin", "restroom", 292, 246, 10, 10, "#64748b"),
    ],
    ["restroom", "washroom", "toilet", "fixtures"],
  ),
  makeTemplate(
    "pwd-restroom",
    "PWD Restroom",
    "Facilities",
    "An accessible restroom with a larger clearance envelope, accessible stall, sink, and mirror.",
    390,
    340,
    [
      room(390, 340, "restroom", "PWD Restroom"),
      ...wallObjects(390, 340),
      furniture("pwd-toilet-stall", "Accessible / PWD Stall", "restroom", 52, 80, 34, 34, "#dbeafe"),
      furniture("double-sink", "Double Sink", "restroom", 230, 82, 26, 10, "#cbd5e1"),
      furniture("mirror", "Mirror", "restroom", 232, 60, 22, 5, "#93c5fd"),
      furniture("restroom-trash-bin", "Restroom Trash Bin", "restroom", 320, 286, 10, 10, "#64748b"),
    ],
    ["pwd", "accessible", "restroom", "clearance"],
  ),
  makeTemplate(
    "student-lounge",
    "Student Lounge",
    "Facilities",
    "A compact lounge with sofa seating, a shared table, vending, and a drinking fountain.",
    520,
    360,
    [
      room(520, 360, "lounge", "Student Lounge"),
      ...wallObjects(520, 360),
      furniture("sofa", "Sofa", "seating", 52, 76, 34, 16, "#3f3f46"),
      furniture("sofa", "Sofa", "seating", 52, 164, 34, 16, "#3f3f46"),
      furniture("study-table-4", "Study Table + 4 Chairs", "tables", 188, 130, 44, 34, "#8b6f4e"),
      furniture("vending-machine", "Vending Machine", "facilities", 424, 62, 16, 24, "#64748b"),
      furniture("drinking-fountain", "Drinking Fountain / Water Dispenser", "facilities", 424, 114, 18, 12, "#38bdf8"),
    ],
    ["lounge", "student", "amenities", "common area"],
  ),
];

export const ROOM_TEMPLATE_CATEGORIES: Array<RoomTemplateCategory | "All"> = [
  "All", "Academic", "Laboratory", "Office", "Study / Library", "Facilities", "Other",
];

export function getRoomTemplates(query = "", category: RoomTemplateCategory | "All" = "All"): RoomTemplateDefinition[] {
  const normalized = query.trim().toLowerCase();
  return ROOM_TEMPLATES.filter((template) => {
    if (category !== "All" && template.category !== category) return false;
    if (!normalized) return true;
    return `${template.name} ${template.category} ${template.description} ${template.tags.join(" ")}`.toLowerCase().includes(normalized);
  });
}

export function roomTemplateBounds(template: RoomTemplateDefinition, origin: { x: number; y: number }) {
  return { x: origin.x, y: origin.y, w: template.width, h: template.height };
}

export function validateRoomTemplatePlacement(
  template: RoomTemplateDefinition,
  origin: { x: number; y: number },
  floorWidth: number,
  floorHeight: number,
  existingRooms: Pick<FloorRoom, "x" | "y" | "w" | "h">[] = [],
): { valid: boolean; reason?: string } {
  const bounds = roomTemplateBounds(template, origin);
  if (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.w > floorWidth || bounds.y + bounds.h > floorHeight) {
    return { valid: false, reason: "Template footprint exceeds the Floor bounds." };
  }
  const overlaps = existingRooms.some((candidate) => (
    bounds.x < candidate.x + candidate.w
    && bounds.x + bounds.w > candidate.x
    && bounds.y < candidate.y + candidate.h
    && bounds.y + bounds.h > candidate.y
  ));
  if (overlaps) return { valid: false, reason: "Template Room overlaps an existing Room." };
  return { valid: true };
}

export interface InstantiatedRoomTemplate {
  room: FloorRoom;
  walls: FloorWall[];
  furniture: FloorFurniture[];
}

export interface RoomTemplateInstantiationContext {
  floorId: string;
  buildingId: string;
  existingFurnitureCount?: number;
  idFactory?: (prefix: string) => string;
}

function defaultIdFactory(prefix: string): string {
  const uuid = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
}

export function instantiateRoomTemplate(
  template: RoomTemplateDefinition,
  origin: { x: number; y: number },
  context: RoomTemplateInstantiationContext,
): InstantiatedRoomTemplate {
  const makeId = context.idFactory ?? defaultIdFactory;
  const roomDefinition = template.objects.find((object): object is Extract<RoomTemplateObject, { kind: "room" }> => object.kind === "room");
  const room: FloorRoom = {
    id: makeId("rm"),
    name: roomDefinition?.name ?? template.name,
    type: roomDefinition?.type ?? "classroom",
    x: Math.round(origin.x + (roomDefinition?.x ?? 0)),
    y: Math.round(origin.y + (roomDefinition?.y ?? 0)),
    w: roomDefinition?.width ?? template.width,
    h: roomDefinition?.height ?? template.height,
    floorId: context.floorId,
    buildingId: context.buildingId,
  };
  const walls: FloorWall[] = template.objects
    .filter((object): object is Extract<RoomTemplateObject, { kind: "wall" }> => object.kind === "wall")
    .map((object) => ({
      id: makeId("wl"),
      x1: Math.round(origin.x + object.x1),
      y1: Math.round(origin.y + object.y1),
      x2: Math.round(origin.x + object.x2),
      y2: Math.round(origin.y + object.y2),
      thickness: object.thickness ?? 4,
      color: object.color ?? "#64748b",
      material: object.material ?? "drywall",
      layer: "structure",
      visible: true,
      locked: false,
    }));
  const zBase = context.existingFurnitureCount ?? 0;
  const furnitureItems: FloorFurniture[] = template.objects
    .filter((object): object is Extract<RoomTemplateObject, { kind: "furniture" }> => object.kind === "furniture")
    .map((object, index) => ({
      id: makeId("fn"),
      type: object.type,
      name: object.name,
      category: object.category,
      x: Math.round(origin.x + object.x),
      y: Math.round(origin.y + object.y),
      width: object.width,
      height: object.height,
      rotation: object.rotation ?? 0,
      color: object.color,
      zOrder: zBase + index,
      visible: true,
      locked: false,
    }));
  return { room, walls, furniture: furnitureItems };
}
