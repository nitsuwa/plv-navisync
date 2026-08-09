/** Campus status */
export type CampusStatus = "active" | "hidden" | "archived";

/** Publish workflow status */
export type PublishStatus = "draft" | "published";

/** Tools available on the campus canvas */
export type SimpleTool = "select" | "marker" | "building" | "path" | "erase" | "room" | "pan" | "wall" | "door" | "window" | "stairs" | "elevator" | "ramp" | "furniture" | "text" | "measure";

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
  startAnchor?: FloorWallEndpointAnchor;
  endAnchor?: FloorWallEndpointAnchor;
  managedKind?: "perimeter";
  perimeterSide?: "top" | "right" | "bottom" | "left";
  zOrder?: number;
  visible?: boolean;
  locked?: boolean;
}

export type FloorRoomAnchorEdge = "top" | "right" | "bottom" | "left";

export interface FloorWallEndpointAnchor {
  targetType: "room";
  roomId: string;
  edge: FloorRoomAnchorEdge;
  offset: number;
}

// ── Indoor Door ─────────────────────────────────────────────────────────────

export interface FloorDoor {
  id: string;
  x: number;
  y: number;
  width: number;
  wallId?: string;
  offset?: number;
  doorType?: "single" | "double";
  hinge?: "left" | "right";
  swingSide?: "a" | "b";
  direction: "left" | "right" | "double" | "sliding";
  color: string;
  locked?: boolean;
  visible?: boolean;
  zOrder?: number;
  label?: string;
  /** Whether this door is designated as an emergency exit */
  isEmergencyExit?: boolean;
}

// ── Indoor Window ───────────────────────────────────────────────────────────

export interface FloorWindow {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  wallId?: string;
  offset?: number;
  color: string;
  zOrder?: number;
  visible?: boolean;
  locked?: boolean;
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
  zOrder?: number;
  visible?: boolean;
  locked?: boolean;
}

// ── Indoor Stairs (free placement) ──────────────────────────────────────────

export interface FloorStairs {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation in degrees. Optional for legacy saved stair objects. */
  rotation?: number;
  direction: StairDirection;
  label: string;
  floors?: number[];
  /** Shared ID linking the same physical stairwell across multiple floors */
  sharedId?: string;
  /** Whether this staircase is wheelchair-accessible */
  accessible?: boolean;
  zOrder?: number;
  visible?: boolean;
  locked?: boolean;
}

// ── Indoor Ramp (free placement) ───────────────────────────────────────────

export interface FloorRamp {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation in degrees. Optional for legacy saved ramp objects. */
  rotation?: number;
  label: string;
  /** Ramp direction: which floor it connects from/to */
  direction?: "up" | "down" | "both";
  /** Shared ID linking the same ramp across floors */
  sharedId?: string;
  /** Whether this ramp has handrails */
  handrails?: boolean;
  /** Slope steepness */
  slope?: "gentle" | "medium" | "steep";
  /** Ramps are always wheelchair-accessible */
  accessible?: boolean;
  zOrder?: number;
  visible?: boolean;
  locked?: boolean;
}

// ── Indoor Elevator (free placement) ────────────────────────────────────────

export interface FloorElevatorItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation in degrees. Optional for legacy saved elevator objects. */
  rotation?: number;
  doorWidth: number;
  label: string;
  floors?: number[];
  /** Shared ID linking the same physical elevator across multiple floors */
  sharedId?: string;
  /** Whether this elevator is wheelchair-accessible (always true for elevators) */
  accessible?: boolean;
  zOrder?: number;
  visible?: boolean;
  locked?: boolean;
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
  /** Horizontal anchor of the label relative to (x, y). Defaults to left. */
  align?: "left" | "center" | "right";
  zOrder?: number;
  visible?: boolean;
  locked?: boolean;
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
  rotation?: number;
  zOrder?: number;
  visible?: boolean;
  locked?: boolean;
  description?: string;
  accessibility?: boolean;
  /** Parent floor ID this room belongs to */
  floorId: string;
  /** Parent building ID this room belongs to */
  buildingId: string;
  /** For stairs: which direction this staircase travels from this floor */
  stairDirection?: StairDirection;
  /** For elevators: explicit list of floor numbers this elevator stops at (empty = all floors) */
  elevatorFloors?: number[];
  /** Navigation connection point — the door position where pathfinding enters this room.
   * Auto-detected from the room edge closest to floor center. */
  navConnection?: { x: number; y: number };
  /** Campus navigation node ID — links this room to the campus-level navigation graph.
   * Set when the admin assigns a nav access point to this room. */
  accessNodeId?: string;
  /** How this room is accessed from the navigation graph */
  accessType?: "door" | "access_point";
}

export interface FloorPlan {
  id: string;
  /** Parent building ID */
  buildingId: string;
  number: number;
  label: string;
  /** Editable floor-canvas dimensions in authoring units. */
  canvasW?: number;
  canvasH?: number;
  /** Floor surface background color (appearance). Defaults to the warm canvas tone. */
  backgroundColor?: string;
  /** Whether the canvas grid lines are visible (persistent appearance preference). */
  showGrid?: boolean;
  rooms: FloorRoom[];
  paths: FloorPath[];
  walls: FloorWall[];
  doors: FloorDoor[];
  windows: FloorWindow[];
  furniture: FloorFurniture[];
  stairs: FloorStairs[];
  ramps: FloorRamp[];
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
  /** Visual stacking order shared with decorative assets (cross-type layer ordering).
   *  Optional — legacy data defaults to array order (buildings below decor). */
  zOrder?: number;
  /** Which editor layer the building belongs to */
  layer?: string;
  /** Entrance point on the campus map (canvas coordinates) */
  entrance?: { x: number; y: number; label?: string };
  entrances?: CampusEntrance[];
  /** Navigation node ID for the building entrance — links building to the campus nav graph */
  entranceNodeId?: string;
  /** Basic accessibility summary */
  accessibility?: {
    wheelchairAccessible: boolean;
    hasElevator: boolean;
    hasRamp: boolean;
    accessibleEntrance: boolean;
  };
}

export type BuildingEntranceEdge = "top" | "right" | "bottom" | "left";
export type BuildingEntranceType = "general" | "service" | "emergency_exit";
export type LegacyBuildingEntranceType = "main" | "secondary" | "emergency";

export interface CampusEntrance {
  id: string;
  buildingId: string;
  edge: BuildingEntranceEdge;
  offset: number;
  type?: BuildingEntranceType | LegacyBuildingEntranceType;
  name?: string;
  isPrimary?: boolean;
  accessible?: boolean;
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
  rotation?: number;
}

export interface FloorUndoEntry {
  canvasW?: number;
  canvasH?: number;
  backgroundColor?: string;
  showGrid?: boolean;
  label?: string;
  rooms: FloorRoom[];
  paths: FloorPath[];
  walls: FloorWall[];
  doors: FloorDoor[];
  windows: FloorWindow[];
  furniture: FloorFurniture[];
  stairs: FloorStairs[];
  ramps: FloorRamp[];
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

// ── Navigation Node (Waypoint) ──────────────────────────────────────────────

export type NavigationNodeType = "outdoor" | "entrance" | "hallway" | "room_access" | "stair" | "elevator" | "transition";

export interface NavigationNode {
  id: string;
  name: string;
  type: NavigationNodeType;
  x: number;
  y: number;
  /** Campus ID this node belongs to */
  campusId?: string;
  /** Building ID if this node is associated with a building */
  buildingId?: string;
  /** Floor ID if this node is inside a specific floor */
  floorId?: string;
  /** Shared stair/elevator transition ID — links nav nodes across floors for the same physical stair/elevator */
  transitionSharedId?: string;
  accessible: boolean;
  color: string;
}

export interface NavigationEdge {
  id: string;
  startNodeId: string;
  endNodeId: string;
  /** Auto-calculated distance in canvas units (converted to meters in student view) */
  distance: number;
  bidirectional: boolean;
  accessible: boolean;
  /** Reason this edge is not accessible (only relevant when accessible=false) */
  inaccessibleReason?: "stairs" | "narrow_path" | "restricted_access" | "uneven_surface" | "other";
  /** Whether this edge is safe to use during an emergency (defaults to true) */
  emergencySafe?: boolean;
  /** Reason this edge is unsafe during an emergency */
  emergencyReason?: "hazard" | "blocked" | "restricted" | "construction" | "other";
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

// ── Assembly Point ─────────────────────────────────────────────────────────

export interface AssemblyPoint {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Campus ID this assembly point belongs to */
  campusId?: string;
  /** Optional navigation node ID — links assembly point to the campus nav graph */
  navNodeId?: string;
  /** Capacity estimate */
  capacity?: number;
  /** Whether this assembly point is accessible */
  accessible?: boolean;
}

// ── Event Overlay ───────────────────────────────────────────────────────────

export interface EventLocationRef {
  type: "building" | "room";
  buildingId: string;
  floorId?: string;
  roomId?: string;
  /** Human-readable label like "Engineering Building — Floor 2 — Room 204" */
  label: string;
}

export interface CampusEventOverlay {
  id: string;
  title: string;
  description: string;
  dateStart: string;
  dateEnd: string;
  organizer: string;
  markers: { x: number; y: number; color: string; label: string }[];
  /** Reference to an existing campus location (room or building) */
  locationRef?: EventLocationRef;
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
  /** Persisted structure summary used by campus-list previews before full editor hydration. */
  previewBuildingCount?: number;
  /** Lightweight persisted outdoor footprint rows for campus-list thumbnails. */
  previewBuildingsLoaded?: boolean;
  markers: CampusMarker[];
  paths: CampusPath[];
  /** Navigation graph nodes (waypoints) */
  navNodes?: NavigationNode[];
  /** Navigation graph edges (connections between nodes) */
  navEdges?: NavigationEdge[];
  routes?: CampusRoute[];
  accessibilityFeatures?: AccessibilityFeature[];
  assemblyPoints?: AssemblyPoint[];
  eventOverlays?: CampusEventOverlay[];
  /** Decorative outdoor assets (visual only — trees, benches, signs, etc.) */
  decorAssets?: CampusDecorAsset[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  createdBy?: string;
  /** Database metadata used for optimistic concurrency and private asset previews. */
  databaseUpdatedAt?: string;
  logoPath?: string;
  overviewImagePath?: string;
  isDefault?: boolean;
  lifecycleStatus?: "draft" | "published" | "unpublished" | "archived";
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
  | { type: "entrance"; id: string; buildingId: string }
  | { type: "marker"; id: string }
  | { type: "path"; id: string }
  | { type: "route"; id: string }
  | { type: "navNode"; id: string }
  | { type: "decorAsset"; id: string }
  | { type: "navEdge"; id: string }
  | { type: "eventOverlay"; id: string };

export type FloorSelection =
  | { type: "room"; id: string }
  | { type: "path"; id: string }
  | { type: "wall"; id: string }
  | { type: "door"; id: string }
  | { type: "window"; id: string }
  | { type: "furniture"; id: string }
  | { type: "stairs"; id: string }
  | { type: "elevator"; id: string }
  | { type: "ramp"; id: string }
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

// ── Decorative Asset (outdoor campus visual-only objects) ─────────────────

export type DecorAssetType =
  | "tree" | "tree-large" | "palm"
  | "bench" | "bench-long"
  | "plant" | "bush" | "flower"
  | "sign" | "flag"
  | "trash-bin" | "recycle-bin"
  | "lamp-post" | "bollard"
  | "bike-rack" | "fountain"
  | "picnic-table" | "gazebo";

export interface CampusDecorAsset {
  id: string;
  type: DecorAssetType;
  x: number;
  y: number;
  rotation?: number;
  scale?: number;
  /** Whether this asset is visible on the canvas */
  visible?: boolean;
  /** Optional custom display name (separate from the asset type label) */
  name?: string;
  /** Visual stacking order shared with buildings (cross-type layer ordering).
   *  Optional — legacy data defaults to array order (decor above buildings). */
  zOrder?: number;
}

// ── Building Type Descriptor (palette presets) ─────────────────────────────

export interface BuildingTypeDescriptor {
  id: string;
  label: string;
  category: string;
  color: string;
  icon: string;
  /** Default width when placed on canvas */
  defaultWidth: number;
  /** Default height when placed on canvas */
  defaultHeight: number;
  description: string;
}
