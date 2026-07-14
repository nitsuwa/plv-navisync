/** Campus status */
export type CampusStatus = "active" | "hidden";

/** Publish workflow status */
export type PublishStatus = "draft" | "published";

/** Tools available on the campus canvas */
export type SimpleTool = "select" | "marker" | "building" | "path" | "erase" | "room";

/** Layer modes for the editor */
export type EditorLayer = "campus" | "navigation" | "accessibility" | "emergency" | "events";

// ── Room types ──────────────────────────────────────────────────────────────

export interface FloorRoom {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  description?: string;
  accessibility?: boolean;
}

export interface FloorPlan {
  id: string;
  number: number;
  label: string;
  rooms: FloorRoom[];
  paths: FloorPath[];
}

export interface FloorPath {
  id: string;
  points: { x: number; y: number }[];
  type: string;
  color: string;
  width: number;
}

// ── Building ────────────────────────────────────────────────────────────────

export interface CampusBuilding {
  id: string;
  name: string;
  code: string;
  category: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  floors: FloorPlan[];
  expanded?: boolean;
  /** Rotation in degrees (0-360), default 0 */
  rotation?: number;
  /** Whether the building is visible on the canvas */
  visible?: boolean;
  /** Opacity 0-1, default 1 */
  opacity?: number;
  /** Whether the building is locked (prevents drag/resize/delete) */
  locked?: boolean;
  /** Which editor layer the building belongs to */
  layer?: string;
}

export interface RoomResizeState {
  id: string;
  corner: string;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  ow: number;
  oh: number;
}

export interface FloorUndoEntry {
  rooms: FloorRoom[];
  paths: FloorPath[];
}

// ── Marker & Path ───────────────────────────────────────────────────────────

export interface CampusMarker {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  color: string;
}

export interface CampusPath {
  id: string;
  points: { x: number; y: number }[];
  type: string;
  color: string;
  width: number;
}

// ── Campus ──────────────────────────────────────────────────────────────────

export interface CampusSettings {
  accessibility: boolean;
  emergency: boolean;
  eventLayer: boolean;
  gps: boolean;
}

export interface Campus {
  id: string;
  name: string;
  code: string;
  description: string;
  address: string;
  status: CampusStatus;
  publishStatus: PublishStatus;
  canvasW: number;
  canvasH: number;
  settings: CampusSettings;
  buildings: CampusBuilding[];
  markers: CampusMarker[];
  paths: CampusPath[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

// ── View navigation ─────────────────────────────────────────────────────────

export type View =
  | { type: "home" }
  | { type: "wizard"; step: 1 | 2 | 3 | 4 | 5; draft: Partial<Campus> }
  | { type: "campus"; campusId: string }
  | { type: "floor"; campusId: string; buildingId: string; floorId: string };

// ── Selection types ─────────────────────────────────────────────────────────

export type CampusSelection =
  | { type: "building"; id: string }
  | { type: "marker"; id: string }
  | { type: "path"; id: string };

export type FloorSelection =
  | { type: "room"; id: string }
  | { type: "path"; id: string };

// ── Building wizard omit type ───────────────────────────────────────────────

export type BuildingWizardData = Omit<
  CampusBuilding,
  "id" | "x" | "y" | "width" | "height" | "color" | "expanded"
>;

// ── Room type descriptor ────────────────────────────────────────────────────

export interface RoomTypeDescriptor {
  type: string;
  label: string;
  fill: string;
  stroke: string;
  text: string;
}

// ── Canvas size option ──────────────────────────────────────────────────────

export interface CanvasSizeOption {
  id: string;
  label: string;
  w: number;
  h: number;
  desc: string;
}
