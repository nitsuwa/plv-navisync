import type { FloorFurniture, FloorRoom, FloorWall } from "../components/map-builder/types";

/**
 * Legacy room-scale definitions retained for persisted-data compatibility and
 * for composing built-in Floor Template archetypes. The Room Template feature
 * is no longer exposed by the Floor Editor: admins use Floor Templates only.
 * Definitions intentionally contain no live object IDs or navigation data.
 */
export type RoomTemplateCategory = "Academic" | "Laboratory" | "Office" | "Study / Library" | "Facilities" | "Other";
export type TemplateScope = "room" | "floor";
export type TemplateSource = "builtin" | "campus" | "shared";

export type RoomTemplateObject =
  | { kind: "room"; x: number; y: number; width: number; height: number; type: string; name?: string }
  | { kind: "wall"; x1: number; y1: number; x2: number; y2: number; thickness?: number; color?: string; material?: string; wallKey?: string }
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
    280,
    200,
    [
      room(280, 200, "classroom", "Classroom — 40 Seats"),
      ...wallObjects(280, 200),
      ...studentStations(8, 5, 18, 58, 32, 28),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 122, 20, 34, 26, "#7a5c3a"),
      furniture("whiteboard", "Whiteboard / Teaching Board", "tables", 100, 6, 80, 6, "#f8fafc"),
      furniture("projector", "Projector", "electronics", 136, 36, 12, 10, "#64748b"),
    ],
    ["classroom", "academic", "40 seats", "teaching"],
  ),
  makeTemplate(
    "classroom-60",
    "Classroom — 60 Seats",
    "Academic",
    "A large lecture classroom with six rows of ten student stations and a dedicated teaching wall.",
    360,
    240,
    [
      room(360, 240, "classroom", "Classroom — 60 Seats"),
      ...wallObjects(360, 240),
      ...studentStations(10, 6, 18, 56, 32, 28),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 162, 18, 34, 26, "#7a5c3a"),
      furniture("whiteboard", "Whiteboard / Teaching Board", "tables", 130, 5, 100, 6, "#f8fafc"),
      furniture("projector", "Projector", "electronics", 174, 34, 12, 10, "#64748b"),
    ],
    ["classroom", "academic", "60 seats", "lecture"],
  ),
  makeTemplate(
    "computer-laboratory",
    "Computer Laboratory",
    "Laboratory",
    "Shared computer lab tables with aligned monitors, chairs, teaching wall, and equipment storage.",
    360,
    260,
    [
      room(360, 260, "lab", "Computer Laboratory"),
      ...wallObjects(360, 260),
      furniture("computer-lab-table-6", "Computer Lab Table 6", "electronics", 20, 74, 92, 34, "#475569"),
      furniture("computer-lab-table-6", "Computer Lab Table 6", "electronics", 134, 74, 92, 34, "#475569"),
      furniture("computer-lab-table-6", "Computer Lab Table 6", "electronics", 248, 74, 92, 34, "#475569"),
      furniture("computer-lab-table-4", "Computer Lab Table 4", "electronics", 72, 140, 64, 34, "#475569"),
      furniture("computer-lab-table-4", "Computer Lab Table 4", "electronics", 224, 140, 64, 34, "#475569"),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 162, 210, 34, 26, "#7a5c3a"),
      furniture("equipment-cabinet", "Equipment Cabinet", "storage", 318, 42, 24, 18, "#64748b"),
      furniture("whiteboard", "Whiteboard / Teaching Board", "tables", 130, 6, 100, 6, "#f8fafc"),
      furniture("projector", "Projector", "electronics", 174, 34, 12, 10, "#64748b"),
    ],
    ["computer", "lab", "workstations", "monitors"],
  ),
  makeTemplate(
    "engineering-laboratory",
    "Engineering Laboratory",
    "Laboratory",
    "A practical engineering lab with workbenches, drafting stations, storage, and teaching space.",
    380,
    280,
    [
      room(380, 280, "lab", "Engineering Laboratory"),
      ...wallObjects(380, 280),
      furniture("lab-workbench", "Laboratory Workbench", "tables", 24, 78, 52, 20, "#64748b"),
      furniture("lab-workbench", "Laboratory Workbench", "tables", 112, 78, 52, 20, "#64748b"),
      furniture("lab-workbench", "Laboratory Workbench", "tables", 200, 78, 52, 20, "#64748b"),
      furniture("drafting-table-stool", "Drafting Table + Stool", "tables", 24, 152, 46, 30, "#8b6f4e"),
      furniture("drafting-table-stool", "Drafting Table + Stool", "tables", 110, 152, 46, 30, "#8b6f4e"),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 170, 232, 34, 26, "#7a5c3a"),
      furniture("equipment-cabinet", "Equipment Cabinet", "storage", 332, 52, 24, 18, "#64748b"),
      furniture("whiteboard", "Whiteboard / Teaching Board", "tables", 140, 6, 100, 6, "#f8fafc"),
    ],
    ["engineering", "lab", "workbench", "drafting"],
  ),
  makeTemplate(
    "faculty-office",
    "Faculty / Administrative Office",
    "Office",
    "A focused office layout with a faculty workstation, visitor seating, and storage.",
    220,
    180,
    [
      room(220, 180, "office", "Faculty / Administrative Office"),
      ...wallObjects(220, 180),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 82, 82, 34, 26, "#7a5c3a"),
      furniture("chair", "Chair", "seating", 134, 86, 12, 12, "#4b5563"),
      furniture("chair", "Chair", "seating", 166, 86, 12, 12, "#4b5563"),
      furniture("cabinet", "Cabinet", "storage", 24, 42, 18, 12, "#71717a"),
      furniture("library-bookshelf", "Bookshelf", "storage", 174, 42, 30, 10, "#6b5b45"),
    ],
    ["faculty", "office", "administrative", "visitor"],
  ),
  makeTemplate(
    "conference-room",
    "Conference Room",
    "Office",
    "A meeting room centered on a conference table with surrounding seating and presentation space.",
    280,
    200,
    [
      room(280, 200, "conference", "Conference Room"),
      ...wallObjects(280, 200),
      furniture("conference-table", "Conference Table", "tables", 92, 78, 68, 36, "#795548"),
      furniture("wall-display", "Wall Display / TV", "electronics", 48, 18, 48, 6, "#334155"),
      furniture("whiteboard", "Whiteboard / Teaching Board", "tables", 180, 18, 70, 6, "#f8fafc"),
    ],
    ["meeting", "conference", "office", "presentation"],
  ),
  makeTemplate(
    "study-room",
    "Study Room",
    "Study / Library",
    "A quiet study room with a six-seat study table and reference shelving.",
    240,
    180,
    [
      room(240, 180, "study", "Study Room"),
      ...wallObjects(240, 180),
      furniture("study-table-6", "Study Table + 6 Chairs", "tables", 78, 76, 54, 38, "#8b6f4e"),
      furniture("library-bookshelf", "Bookshelf", "storage", 24, 38, 30, 10, "#6b5b45"),
      furniture("library-bookshelf", "Bookshelf", "storage", 186, 38, 30, 10, "#6b5b45"),
    ],
    ["study", "library", "quiet", "reading"],
  ),
  makeTemplate(
    "library-reading-area",
    "Library Reading Area",
    "Study / Library",
    "A flexible reading area with library study tables and double-sided shelving.",
    360,
    240,
    [
      room(360, 240, "library", "Library Reading Area"),
      ...wallObjects(360, 240),
      furniture("library-study-table", "Library Study Table + Chairs", "tables", 38, 82, 48, 30, "#8b6f4e"),
      furniture("library-study-table", "Library Study Table + Chairs", "tables", 146, 82, 48, 30, "#8b6f4e"),
      furniture("library-study-table", "Library Study Table + Chairs", "tables", 254, 82, 48, 30, "#8b6f4e"),
      furniture("double-sided-library-shelf", "Double-Sided Library Shelf", "storage", 30, 174, 42, 12, "#6b5b45"),
      furniture("double-sided-library-shelf", "Double-Sided Library Shelf", "storage", 136, 174, 42, 12, "#6b5b45"),
      furniture("double-sided-library-shelf", "Double-Sided Library Shelf", "storage", 242, 174, 42, 12, "#6b5b45"),
    ],
    ["library", "reading", "shelves", "study"],
  ),
  makeTemplate(
    "standard-restroom",
    "Standard Restroom",
    "Facilities",
    "An essential restroom layout with stalls, wash basin, mirror, and urinal fixtures.",
    220,
    180,
    [
      room(220, 180, "restroom", "Standard Restroom"),
      ...wallObjects(220, 180),
      furniture("toilet-stall", "Toilet Stall", "restroom", 24, 42, 26, 28, "#e2e8f0"),
      furniture("toilet-stall", "Toilet Stall", "restroom", 66, 42, 26, 28, "#e2e8f0"),
      furniture("urinal", "Urinal", "restroom", 114, 46, 10, 14, "#dbe4ea"),
      furniture("double-sink", "Double Sink", "restroom", 158, 46, 26, 10, "#cbd5e1"),
      furniture("mirror", "Mirror", "restroom", 160, 26, 22, 5, "#93c5fd"),
      furniture("restroom-trash-bin", "Restroom Trash Bin", "restroom", 188, 154, 10, 10, "#64748b"),
    ],
    ["restroom", "washroom", "toilet", "fixtures"],
  ),
  makeTemplate(
    "pwd-restroom",
    "PWD Restroom",
    "Facilities",
    "An accessible restroom with a larger clearance envelope, accessible stall, sink, and mirror.",
    240,
    200,
    [
      room(240, 200, "restroom", "PWD Restroom"),
      ...wallObjects(240, 200),
      furniture("pwd-toilet-stall", "Accessible / PWD Stall", "restroom", 34, 70, 34, 34, "#dbeafe"),
      furniture("double-sink", "Double Sink", "restroom", 166, 70, 26, 10, "#cbd5e1"),
      furniture("mirror", "Mirror", "restroom", 168, 48, 22, 5, "#93c5fd"),
      furniture("restroom-trash-bin", "Restroom Trash Bin", "restroom", 208, 174, 10, 10, "#64748b"),
    ],
    ["pwd", "accessible", "restroom", "clearance"],
  ),
  makeTemplate(
    "student-lounge",
    "Student Lounge",
    "Facilities",
    "A compact lounge with sofa seating, a shared table, vending, and a drinking fountain.",
    320,
    220,
    [
      room(320, 220, "lounge", "Student Lounge"),
      ...wallObjects(320, 220),
      furniture("sofa", "Sofa", "seating", 28, 56, 34, 16, "#3f3f46"),
      furniture("sofa", "Sofa", "seating", 28, 136, 34, 16, "#3f3f46"),
      furniture("study-table-4", "Study Table + 4 Chairs", "tables", 126, 102, 44, 34, "#8b6f4e"),
      furniture("vending-machine", "Vending Machine", "facilities", 276, 46, 16, 24, "#64748b"),
      furniture("drinking-fountain", "Drinking Fountain / Water Dispenser", "facilities", 276, 98, 18, 12, "#38bdf8"),
    ],
    ["lounge", "student", "amenities", "common area"],
  ),
  // PLV-oriented room archetypes.  These deliberately remain room-scale and
  // use the same local-coordinate conventions as the original catalogue.
  makeTemplate(
    "plv-standard-classroom",
    "PLV Standard Classroom",
    "Academic",
    "A PLV-style teaching room with a clear front wall, five aligned seating rows, and a compact instructor zone.",
    280,
    200,
    [
      room(280, 200, "classroom", "PLV Standard Classroom"),
      ...wallObjects(280, 200),
      ...studentStations(8, 5, 18, 58, 32, 28),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 122, 20, 34, 26, "#7a5c3a"),
      furniture("whiteboard", "Whiteboard / Teaching Board", "tables", 100, 6, 80, 6, "#f8fafc"),
      furniture("projector", "Projector", "electronics", 136, 36, 12, 10, "#64748b"),
    ],
    ["plv", "classroom", "standard", "teaching"],
  ),
  makeTemplate(
    "plv-large-classroom",
    "PLV Large Classroom",
    "Academic",
    "A larger PLV teaching room with six seating rows, generous aisles, and a dedicated presentation wall.",
    360,
    240,
    [
      room(360, 240, "classroom", "PLV Large Classroom"),
      ...wallObjects(360, 240),
      ...studentStations(10, 6, 18, 56, 32, 28),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 162, 18, 34, 26, "#7a5c3a"),
      furniture("whiteboard", "Whiteboard / Teaching Board", "tables", 130, 5, 100, 6, "#f8fafc"),
      furniture("projector", "Projector", "electronics", 174, 34, 12, 10, "#64748b"),
    ],
    ["plv", "classroom", "large", "lecture"],
  ),
  makeTemplate(
    "lecture-room",
    "Lecture Room",
    "Academic",
    "A presentation-focused room with forward-facing seats and a clear instructor/display wall.",
    420,
    260,
    [
      room(420, 260, "classroom", "Lecture Room"),
      ...wallObjects(420, 260),
      ...studentStations(10, 6, 28, 64, 38, 28),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 192, 20, 34, 26, "#7a5c3a"),
      furniture("whiteboard", "Whiteboard / Teaching Board", "tables", 150, 6, 120, 6, "#f8fafc"),
      furniture("projector", "Projector", "electronics", 204, 38, 12, 10, "#64748b"),
    ],
    ["lecture", "academic", "presentation", "plv"],
  ),
  makeTemplate(
    "lecture-hall",
    "Lecture Hall",
    "Academic",
    "A compact lecture-hall archetype with dense oriented seating and a presentation zone at the front.",
    500,
    300,
    [
      room(500, 300, "lecture-hall", "Lecture Hall"),
      ...wallObjects(500, 300),
      ...studentStations(12, 7, 34, 70, 36, 28),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 232, 20, 34, 26, "#7a5c3a"),
      furniture("whiteboard", "Whiteboard / Teaching Board", "tables", 180, 6, 140, 6, "#f8fafc"),
      furniture("projector", "Projector", "electronics", 254, 38, 12, 10, "#64748b"),
    ],
    ["lecture", "hall", "assembly", "plv"],
  ),
  makeTemplate(
    "administrative-office",
    "Administrative Office",
    "Office",
    "A practical PLV administration office with a staff workstation, visitor seating, and compact storage.",
    240,
    190,
    [
      room(240, 190, "office", "Administrative Office"),
      ...wallObjects(240, 190),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 92, 86, 34, 26, "#7a5c3a"),
      furniture("chair", "Chair", "seating", 144, 90, 12, 12, "#4b5563"),
      furniture("chair", "Chair", "seating", 176, 90, 12, 12, "#4b5563"),
      furniture("cabinet", "Cabinet", "storage", 26, 44, 18, 12, "#71717a"),
    ],
    ["administration", "office", "staff", "plv"],
  ),
  makeTemplate(
    "library-stack-area",
    "Library Shelving / Stack Area",
    "Study / Library",
    "A compact stack-room module with double-sided shelving and an open reading aisle.",
    360,
    240,
    [
      room(360, 240, "library", "Library Shelving / Stack Area"),
      ...wallObjects(360, 240),
      furniture("double-sided-library-shelf", "Double-Sided Library Shelf", "storage", 32, 48, 42, 12, "#6b5b45"),
      furniture("double-sided-library-shelf", "Double-Sided Library Shelf", "storage", 136, 48, 42, 12, "#6b5b45"),
      furniture("double-sided-library-shelf", "Double-Sided Library Shelf", "storage", 240, 48, 42, 12, "#6b5b45"),
      furniture("library-study-table", "Library Study Table + Chairs", "tables", 118, 140, 48, 30, "#8b6f4e"),
    ],
    ["library", "shelving", "stacks", "plv"],
  ),
  makeTemplate(
    "mens-restroom",
    "Men's Restroom",
    "Facilities",
    "A visual restroom module with stalls, urinal, wash basin, mirror, and service clearance.",
    240,
    190,
    [
      room(240, 190, "restroom", "Men's Restroom"),
      ...wallObjects(240, 190),
      furniture("toilet-stall", "Toilet Stall", "restroom", 24, 44, 26, 28, "#e2e8f0"),
      furniture("toilet-stall", "Toilet Stall", "restroom", 66, 44, 26, 28, "#e2e8f0"),
      furniture("urinal", "Urinal", "restroom", 114, 48, 10, 14, "#dbe4ea"),
      furniture("double-sink", "Double Sink", "restroom", 170, 48, 26, 10, "#cbd5e1"),
      furniture("mirror", "Mirror", "restroom", 172, 28, 22, 5, "#93c5fd"),
    ],
    ["restroom", "mens", "facilities", "plv"],
  ),
  makeTemplate(
    "womens-restroom",
    "Women's Restroom",
    "Facilities",
    "A visual restroom module with repeated stalls, wash basins, mirrors, and clear circulation space.",
    240,
    190,
    [
      room(240, 190, "restroom", "Women's Restroom"),
      ...wallObjects(240, 190),
      furniture("toilet-stall", "Toilet Stall", "restroom", 26, 44, 26, 28, "#e2e8f0"),
      furniture("toilet-stall", "Toilet Stall", "restroom", 68, 44, 26, 28, "#e2e8f0"),
      furniture("toilet-stall", "Toilet Stall", "restroom", 110, 44, 26, 28, "#e2e8f0"),
      furniture("double-sink", "Double Sink", "restroom", 172, 48, 26, 10, "#cbd5e1"),
      furniture("mirror", "Mirror", "restroom", 174, 28, 22, 5, "#93c5fd"),
    ],
    ["restroom", "womens", "facilities", "plv"],
  ),
  makeTemplate(
    "drafting-technical-laboratory",
    "Drafting / Technical Laboratory",
    "Academic",
    "A PLV-oriented technical room with drafting stations, shared work surfaces, storage, and a presentation wall.",
    380,
    280,
    [
      room(380, 280, "lab", "Drafting / Technical Laboratory"),
      ...wallObjects(380, 280),
      furniture("drafting-table-stool", "Drafting Table + Stool", "tables", 28, 72, 46, 30, "#8b6f4e"),
      furniture("drafting-table-stool", "Drafting Table + Stool", "tables", 112, 72, 46, 30, "#8b6f4e"),
      furniture("drafting-table-stool", "Drafting Table + Stool", "tables", 196, 72, 46, 30, "#8b6f4e"),
      furniture("lab-workbench", "Laboratory Workbench", "tables", 28, 150, 52, 20, "#64748b"),
      furniture("lab-workbench", "Laboratory Workbench", "tables", 116, 150, 52, 20, "#64748b"),
      furniture("equipment-cabinet", "Equipment Cabinet", "storage", 326, 54, 24, 18, "#64748b"),
      furniture("whiteboard", "Whiteboard / Teaching Board", "tables", 138, 8, 104, 6, "#f8fafc"),
    ],
    ["drafting", "technical", "laboratory", "academic", "plv"],
  ),
  makeTemplate(
    "faculty-room",
    "Faculty Room",
    "Office",
    "A shared PLV faculty room with workstations, visitor seating, storage, and a clear collaboration aisle.",
    300,
    220,
    [
      room(300, 220, "office", "Faculty Room"),
      ...wallObjects(300, 220),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 30, 54, 34, 26, "#7a5c3a"),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 92, 54, 34, 26, "#7a5c3a"),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 154, 54, 34, 26, "#7a5c3a"),
      furniture("chair", "Chair", "seating", 44, 120, 12, 12, "#4b5563"),
      furniture("chair", "Chair", "seating", 106, 120, 12, 12, "#4b5563"),
      furniture("cabinet", "Cabinet", "storage", 244, 52, 18, 12, "#71717a"),
    ],
    ["faculty", "staff", "office", "collaboration", "plv"],
  ),
  makeTemplate(
    "reception-service-office",
    "Reception / Service Office",
    "Office",
    "A service-facing room with a reception counter, waiting seats, staff workstation, and compact records storage.",
    300,
    210,
    [
      room(300, 210, "office", "Reception / Service Office"),
      ...wallObjects(300, 210),
      furniture("reception-counter", "Reception / Service Counter", "facilities", 34, 54, 60, 18, "#7a5c3a"),
      furniture("waiting-bench", "Waiting Bench", "seating", 34, 104, 72, 16, "#475569"),
      furniture("faculty-desk-chair", "Faculty Desk + Chair", "tables", 160, 54, 34, 26, "#7a5c3a"),
      furniture("cabinet", "Cabinet", "storage", 248, 48, 18, 12, "#71717a"),
    ],
    ["reception", "service", "office", "waiting", "plv"],
  ),
  makeTemplate(
    "library-service-counter-area",
    "Library Service / Counter Area",
    "Study / Library",
    "A library service module with a staffed counter, queue space, reference shelving, and a small study point.",
    360,
    240,
    [
      room(360, 240, "library", "Library Service / Counter Area"),
      ...wallObjects(360, 240),
      furniture("reception-counter", "Reception / Service Counter", "facilities", 28, 50, 60, 18, "#7a5c3a"),
      furniture("waiting-bench", "Waiting Bench", "seating", 28, 94, 72, 16, "#475569"),
      furniture("double-sided-library-shelf", "Double-Sided Library Shelf", "storage", 162, 48, 42, 12, "#6b5b45"),
      furniture("library-study-table", "Library Study Table + Chairs", "tables", 244, 140, 48, 30, "#8b6f4e"),
    ],
    ["library", "service", "counter", "reference", "plv"],
  ),
  makeTemplate(
    "pwd-accessible-restroom",
    "PWD / Accessible Restroom",
    "Facilities",
    "An accessible restroom module with a generous turning area, PWD stall, sink, mirror, and grab-bar fixture cues.",
    260,
    220,
    [
      room(260, 220, "restroom", "PWD / Accessible Restroom"),
      ...wallObjects(260, 220),
      furniture("pwd-toilet-stall", "Accessible / PWD Stall", "restroom", 30, 74, 34, 34, "#dbeafe"),
      furniture("double-sink", "Double Sink", "restroom", 184, 74, 26, 10, "#cbd5e1"),
      furniture("mirror", "Mirror", "restroom", 186, 52, 22, 5, "#93c5fd"),
      furniture("hand-dryer", "Hand Dryer", "restroom", 216, 116, 12, 12, "#94a3b8"),
      furniture("restroom-trash-bin", "Restroom Trash Bin", "restroom", 220, 178, 10, 10, "#64748b"),
    ],
    ["pwd", "accessible", "restroom", "facilities", "plv"],
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function newUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function instantiateRoomTemplate(
  template: RoomTemplateDefinition,
  origin: { x: number; y: number },
  context: RoomTemplateInstantiationContext,
): InstantiatedRoomTemplate {
  const usedIds = new Set<string>(UUID_RE.test(context.floorId) ? [context.floorId] : []);
  const makeId = (prefix: string) => {
    // The prefix is retained only as a semantic hint for legacy test/caller
    // factories. Persisted Floor entities always receive a bare RFC UUID.
    const candidate = context.idFactory?.(prefix);
    let id = candidate && UUID_RE.test(candidate) && !usedIds.has(candidate) ? candidate : newUuid();
    while (usedIds.has(id)) id = newUuid();
    usedIds.add(id);
    return id;
  };
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
    .map((object, index) => ({
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
      // This is only used while a containing Floor Template remaps physical
      // openings. It is not persisted as a live wall identity.
      wallKey: object.wallKey ?? `room-wall-${index}`,
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
