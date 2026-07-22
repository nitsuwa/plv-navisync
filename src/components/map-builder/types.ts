/** Campus status */
export type CampusStatus = "active" | "hidden" | "archived";

/** Publish workflow status */
export type PublishStatus = "draft" | "published";

/** Tools available on the campus canvas */
export type SimpleTool = "select" | "marker" | "building" | "path" | "erase" | "room" | "pan" | "wall" | "door" | "window" | "stairs" | "elevator" | "furniture" | "text" | "measure";

/** Layer modes for the editor */
export type EditorLayer = "campus" | "navigation" | "accessibility" | "emergency" | "events";

/** Route type (Navigation layer) */
export type RouteType = "walking" | "accessible" | "emergency";

/** Accessibility feature type (Accessibility layer) */
export type AccessFeatureType = "ramp" | "elevator" | "accessible_entrance" | "accessible_restroom" | "wide_corridor";

/** Status for accessibility features */
export type FeatureStatus = "present" | "missing" | "under_maintenance";

// ── Floor Editor Mode ──────────────────────────────────────────────────────

export type FloorEditorMode = "structure" | "interior";

// ── Indoor Wall ─────────────────────────────────────────────────────────────

export interface FloorWall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  height?: number;
  material?: string;
  color: string;
  layer?: string;
}

// ── Indoor Door ─────────────────────────────────────────────────────────────

export interface FloorDoor {
  id: string;
  x: number;
  y: number;
  width: number;
  direction: "left" | "right" | "double" | "sliding";
  color: string;
  locked?: boolean;
  label?: string;
}

// ── Indoor Window ───────────────────────────────────────────────────────────

export interface FloorWindow {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

// ── Indoor Furniture ────────────────────────────────────────────────────────

export interface FloorFurniture {
  id: string;
  type: string;
  name: string;
  category: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  layer?: string;
}

// ── Indoor Stairs (free placement) ──────────────────────────────────────────

export interface FloorStairs {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  direction: StairDirection;
  label: string;
  floors?: number[];
}

// ── Indoor Elevator (free placement) ────────────────────────────────────────

export interface FloorElevatorItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  doorWidth: number;
  label: string;
  floors?: number[];
}

// ── Indoor Label / Text ─────────────────────────────────────────────────────

export interface FloorLabel {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  rotation: number;
}

// ── Room types ──────────────────────────────────────────────────────────────

/** Direction a staircase travels */
export type StairDirection = "up" | "down" | "both";

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
  /** For stairs: which direction this staircase travels from this floor */
  stairDirection?: StairDirection;
  /** For elevators: explicit list of floor numbers this elevator stops at (empty = all floors) */
  elevatorFloors?: number[];
}

export interface FloorPlan {
  id: string;
  number: number;
  label: string;
  rooms: FloorRoom[];
  paths: FloorPath[];
  walls: FloorWall[];
  doors: FloorDoor[];
  windows: FloorWindow[];
  furniture: FloorFurniture[];
  stairs: FloorStairs[];
  elevators: FloorElevatorItem[];
  labels: FloorLabel[];
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
  walls: FloorWall[];
  doors: FloorDoor[];
  windows: FloorWindow[];
  furniture: FloorFurniture[];
  stairs: FloorStairs[];
  elevators: FloorElevatorItem[];
  labels: FloorLabel[];
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

// ── Route (Navigation layer) ────────────────────────────────────────────────

export interface CampusRoute {
  id: string;
  name: string;
  description?: string;
  fromBuildingId: string;
  toBuildingId: string;
  waypoints: { x: number; y: number }[];
  type: RouteType;
  distanceM: number;
  durationMin: number;
  color: string;
  isActive: boolean;
}

// ── Accessibility Feature ───────────────────────────────────────────────────

export interface AccessibilityFeature {
  id: string;
  buildingId: string;
  type: AccessFeatureType;
  label: string;
  status: FeatureStatus;
  notes?: string;
}

// ── Event Overlay ───────────────────────────────────────────────────────────

export interface CampusEventOverlay {
  id: string;
  title: string;
  description: string;
  dateStart: string;
  dateEnd: string;
  organizer: string;
  markers: { x: number; y: number; color: string; label: string }[];
  restrictedAreas: { points: { x: number; y: number }[] }[];
  isActive: boolean;
}

// ── Campus Features (replaces CampusSettings) ────────────────────────────────

export interface CampusFeatures {
  indoorNavigation: boolean;
  accessibilityNavigation: boolean;
  emergencyRoutes: boolean;
  issueReporting: boolean;
}

// ── Coordinates ─────────────────────────────────────────────────────────────

export interface CampusCoordinates {
  lat: number;
  lng: number;
}

// ── Campus ──────────────────────────────────────────────────────────────────

export interface Campus {
  id: string;
  name: string;
  code: string;
  description: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  coordinates?: CampusCoordinates;
  thumbnail?: string;
  logo?: string;
  themeColor?: string;
  status: CampusStatus;
  publishStatus: PublishStatus;
  visibleToStudents: boolean;
  features: CampusFeatures;
  canvasW: number;
  canvasH: number;
  canvasConfigured?: boolean;
  measurementUnit?: MeasurementUnit;
  mapType?: MapType;
  gridSize?: number;
  snapToGrid?: boolean;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundOpacity?: number;
  backgroundFit?: "cover" | "contain" | "center";
  defaultZoom?: number;
  settings: CampusSettings;
  buildings: CampusBuilding[];
  markers: CampusMarker[];
  paths: CampusPath[];
  routes?: CampusRoute[];
  accessibilityFeatures?: AccessibilityFeature[];
  eventOverlays?: CampusEventOverlay[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  createdBy?: string;
}

// ── Keep CampusSettings for backward compatibility with editor ──────────────

export interface CampusSettings {
  accessibility: boolean;
  emergency: boolean;
  eventLayer: boolean;
  gps: boolean;
}

// ── Rubber-band selection state ─────────────────────────────────────────────

export interface RubberBand {
  sx: number;
  sy: number;
  cx: number;
  cy: number;
}

// ── View navigation ─────────────────────────────────────────────────────────

export type View =
  | { type: "home" }
  | { type: "wizard"; step: 1 | 2 | 3 | 4 | 5; draft: Partial<Campus> }
  | { type: "campus"; campusId: string }
  | { type: "floor"; campusId: string; buildingId: string; floorId: string }
  | { type: "success"; campusId: string }
  | { type: "create-map"; campusId: string }
  | { type: "map-settings"; campusId: string };

// ── Selection types ─────────────────────────────────────────────────────────

export type CampusSelection =
  | { type: "building"; id: string }
  | { type: "marker"; id: string }
  | { type: "path"; id: string }
  | { type: "route"; id: string };

export type FloorSelection =
  | { type: "room"; id: string }
  | { type: "path"; id: string }
  | { type: "wall"; id: string }
  | { type: "door"; id: string }
  | { type: "window"; id: string }
  | { type: "furniture"; id: string }
  | { type: "stairs"; id: string }
  | { type: "elevator"; id: string }
  | { type: "label"; id: string };

// ── Building wizard omit type ───────────────────────────────────────────────

export type BuildingWizardData = Omit<
  CampusBuilding,
  "id" | "x" | "y" | "width" | "height" | "color" | "expanded"
>;

// ── Furniture category ────────────────────────────────────────────────────

export interface FurnitureCategory {
  id: string;
  label: string;
  icon: string;
  items: FurnitureItemTemplate[];
}

export interface FurnitureItemTemplate {
  type: string;
  name: string;
  width: number;
  height: number;
  color: string;
}

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

// ── Map type ────────────────────────────────────────────────────────────────

export type MapType = "campus-overview" | "building" | "floor-plan" | "outdoor-area" | "parking" | "other";

export type MeasurementUnit = "pixels" | "meters" | "feet";
