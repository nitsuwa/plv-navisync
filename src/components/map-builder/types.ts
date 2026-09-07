/** Campus status */
export type CampusStatus = "active" | "hidden" | "archived";

/** Publish workflow status */
export type PublishStatus = "draft" | "published";

/** Tools available on the campus canvas */
export type SimpleTool = "select" | "marker" | "gate" | "decor" | "building" | "path" | "connect" | "erase" | "room" | "pan" | "wall" | "door" | "window" | "stairs" | "elevator" | "ramp" | "furniture" | "text" | "measure" | "exterior-zone" | "entrance-steps" | "entrance-ramp";

/** Layer modes for the editor */
export type EditorLayer = "campus" | "navigation" | "accessibility" | "emergency" | "events";

/** Route type (Navigation layer) */
export type RouteType = "walking" | "accessible" | "emergency";

/** Accessibility feature type (Accessibility layer) */
export type AccessFeatureType = "ramp" | "elevator" | "accessible_entrance" | "accessible_restroom" | "wide_corridor";

/** Status for accessibility features */
export type FeatureStatus = "present" | "missing" | "under_maintenance";

// ── Floor Editor Mode ──────────────────────────────────────────────────────

export type FloorEditorMode = "structure" | "interior" | "navigation";

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
  /** Building-owned Entrance relationship for an automatically generated
   * Ground-floor entrance Door. Manual Doors leave this unset. */
  buildingEntranceId?: string;
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
  /** Optional host exterior zone for stable outdoor coordinate semantics. */
  exteriorZoneId?: string;
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
  /** Mirrors the half-landing layout across its local vertical axis (left/right entry flight). */
  flip?: boolean;
  direction: StairDirection;
  label: string;
  floors?: number[];
  /** Shared ID linking the same physical stairwell across multiple floors */
  sharedId?: string;
  /** Whether this staircase is wheelchair-accessible */
  accessible?: boolean;
  /** Emergency-safe designation for emergency egress routing. */
  emergencySafe?: boolean;
  /** Links a generated landing to a building-attached Exterior Emergency Stair. */
  exteriorEmergencyStairId?: string;
  /** Building perimeter attachment copied onto generated exterior landings. */
  attachment?: { edge: BuildingEntranceEdge; offset: number };
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
  /**
   * Stable, generated system number used only as a matching hint.  It is
   * intentionally separate from the editable display label and from the
   * authoritative sharedId shaft identity.  Legacy records may omit it; the
   * editor derives it from a generated `Elevator N` label when possible.
   */
  systemNumber?: number;
  label: string;
  floors?: number[];
  /** Shared ID linking the same physical elevator across multiple floors */
  sharedId?: string;
  /** Whether this elevator is wheelchair-accessible (always true for elevators) */
  accessible?: boolean;
  /** Optional explicit opt-in for emergency evacuation use. */
  emergencySafe?: boolean;
  zOrder?: number;
  visible?: boolean;
  locked?: boolean;
}

/** Optional rectangular semi-outdoor architectural space attached to a Floor wall. */
export type ExteriorZoneType = "veranda" | "entrance_landing" | "covered_walkway" | "exterior_platform";
export interface FloorExteriorZone {
  id: string;
  type: ExteriorZoneType;
  side: BuildingEntranceEdge;
  /** Normalized center position along the attached wall. */
  offset: number;
  /** Wall-parallel span in authoring units. */
  width: number;
  /** Outward depth from the wall in authoring units. */
  depth: number;
  /** Optional persisted projection coordinates for compatibility/read-only renderers. */
  x?: number;
  y?: number;
  rotation?: number;
  label?: string;
  /** Presentation-only label offset in floor canvas units. */
  labelOffsetX?: number;
  labelOffsetY?: number;
  /** Presentation-only visibility toggle. */
  labelVisible?: boolean;
  zOrder?: number;
  visible?: boolean;
  locked?: boolean;
}

/** Local entrance steps. This is architectural circulation, not a floor Stair. */
export interface FloorEntranceSteps {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  label: string;
  accessible?: false;
  emergencySafe?: boolean;
  zOrder?: number;
  visible?: boolean;
  locked?: boolean;
  /** Optional authored parent exterior zone. Legacy records may omit this. */
  parentZoneId?: string;
  /** Local attachment on the parent's outside edge. */
  /** Outer or side edge of the parent zone. Legacy records default to outer. */
  attachmentEdge?: "outer" | "start" | "end";
  /** Normalized position along the parent's outside edge. */
  attachmentOffset?: number;
  /** Reverses the local approach cue without changing its parent edge. */
  direction?: "forward" | "reverse";
  /** Mirrors the local presentation without changing the parent attachment. */
  flipHorizontal?: boolean;
  flipVertical?: boolean;
}

/** Local accessible entrance ramp. It never creates a cross-floor transition. */
export interface FloorEntranceRamp {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  label: string;
  accessible?: true;
  emergencySafe?: boolean;
  handrails?: boolean;
  zOrder?: number;
  visible?: boolean;
  locked?: boolean;
  /** Optional authored parent exterior zone. Legacy records may omit this. */
  parentZoneId?: string;
  /** Local attachment on the parent's outside edge. */
  /** Outer or side edge of the parent zone. Legacy records default to outer. */
  attachmentEdge?: "outer" | "start" | "end";
  /** Normalized position along the parent's outside edge. */
  attachmentOffset?: number;
  /** Reverses the local approach cue without changing its parent edge. */
  direction?: "forward" | "reverse";
  /** Mirrors the local presentation without changing the parent attachment. */
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  /** Constrained visual presentation for a local ramp. */
  layout?: "straight" | "l_turn_left" | "l_turn_right";
}

/** Resolve the immutable generated Elevator number for matching hints.
 * Custom display labels are deliberately not parsed as identity. */
export function elevatorSystemNumberOf(
  item: Pick<FloorElevatorItem, "label" | "systemNumber"> | undefined,
): number | undefined {
  const explicit = item?.systemNumber;
  if (Number.isInteger(explicit) && (explicit as number) > 0) return explicit;
  const match = item?.label?.trim().match(/^elevator\s+(\d+)$/i);
  return match ? Number(match[1]) : undefined;
}

/** Return the next monotonically increasing generated system number on the
 * current Floor.  Numbers are not recycled after a removal, which keeps the
 * authoring history legible while still guaranteeing uniqueness. */
export function nextElevatorSystemNumber(
  elevators: Pick<FloorElevatorItem, "label" | "systemNumber">[],
): number {
  const used = new Set(
    elevators
      .map((elevator) => elevatorSystemNumberOf(elevator))
      .filter((number): number is number => number !== undefined),
  );
  let number = used.size > 0 ? Math.max(...used) + 1 : 1;
  while (used.has(number)) number += 1;
  return number;
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

export interface FloorPlanBackground {
  storagePath: string;
  fileName: string;
  mimeType: string;
  size: number;
  visible: boolean;
  opacity: number;
  locked: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  naturalWidth?: number;
  naturalHeight?: number;
  uploadedAt?: string;
}

export interface FloorScaleCalibration {
  metersPerUnit: number;
  points: [{ x: number; y: number }, { x: number; y: number }];
  editorDistance: number;
  realDistanceM: number;
  calibratedAt?: string;
}

export interface FloorRoom {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Optional custom Room fill color; absent values continue using room type palette. */
  color?: string;
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
  /** Physical Door used as this Room's access point; persisted in floor metadata. */
  accessDoorId?: string;
  /** Optional multi-door extension. The legacy accessDoorId remains the primary compatibility field. */
  accessDoorIds?: string[];
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
  /** Visual and snap grid spacing in floor authoring units. */
  gridSize?: 10 | 20 | 40;
  backgroundImage?: FloorPlanBackground;
  calibration?: FloorScaleCalibration;
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
  /** Optional semi-outdoor authored architecture. Legacy floors omit these. */
  exteriorZones?: FloorExteriorZone[];
  entranceSteps?: FloorEntranceSteps[];
  entranceRamps?: FloorEntranceRamp[];
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
  circulationGroups?: CirculationGroup[];
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
  /** Building-attached Exterior Emergency Stairs; occurrences are derived on served Floors. */
  exteriorEmergencyStairs?: ExteriorEmergencyStair[];
}

export interface CirculationGroup {
  id: string;
  buildingId: string;
  kind: "stair" | "elevator";
  name: string;
}

export type BuildingEntranceEdge = "top" | "right" | "bottom" | "left";
export type BuildingEntranceType = "general" | "service" | "emergency_exit";
export type LegacyBuildingEntranceType = "main" | "secondary" | "emergency";
/** Presentation scale for a generated Exterior Emergency Stair module. */
export type ExteriorEmergencyStairVisualSize = "small" | "medium" | "large";

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

/** One physical Emergency Stair attached to a Building perimeter. */
export interface ExteriorEmergencyStair {
  id: string;
  buildingId: string;
  label: string;
  state: "open" | "closed";
  width: number;
  height: number;
  attachment: { edge: BuildingEntranceEdge; offset: number };
  /** Explicitly served Floor IDs; no occurrence is created for other Floors. */
  servedFloorIds: string[];
  /** Existing circulation identity used by the canonical Stair transition graph. */
  sharedId: string;
  /** Stable generated occurrence IDs, keyed by Floor ID. */
  occurrenceIds?: Record<string, string>;
  /** Stable generated navigation-node IDs, keyed by served Floor ID. */
  occurrenceNodeIds?: Record<string, string>;
  /** Stable outdoor discharge/navigation anchor. */
  outdoorNodeId?: string;
  /**
   * Authored local Walking Network edges temporarily retained while a Floor
   * is removed from servedFloorIds.  This is optional compatibility metadata,
   * not a second graph: live edges are restored only when their target nodes
   * still exist.
   */
  floorConnectionSnapshots?: Record<string, NavigationEdge[]>;
  emergencySafe?: boolean;
  /** Optional presentation-only scale; legacy records default to medium. */
  visualSize?: ExteriorEmergencyStairVisualSize;
  zOrder?: number;
  visible?: boolean;
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
  gridSize?: 10 | 20 | 40;
  backgroundImage?: FloorPlanBackground;
  calibration?: FloorScaleCalibration;
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
  exteriorZones?: FloorExteriorZone[];
  entranceSteps?: FloorEntranceSteps[];
  entranceRamps?: FloorEntranceRamp[];
  /** B5 Phase 2: floor-scoped nav graph snapshot for undo/redo integration. */
  navNodes?: NavigationNode[];
  navEdges?: NavigationEdge[];
  /**
   * Editor-only snapshot of the Building-owned exterior emergency stair
   * records.  A generated occurrence is never authoritative for attachment
   * position; keeping this alongside floor history lets undo/redo restore the
   * canonical stair and every served-floor occurrence together.
   */
  exteriorEmergencyStairs?: ExteriorEmergencyStair[];
}

/** B5 Phase 2: floor-scoped indoor nav graph state (reused by undo entries). */
export interface FloorNavGraphState {
  navNodes: NavigationNode[];
  navEdges: NavigationEdge[];
}

// ── Marker & Path ───────────────────────────────────────────────────────────

export interface CampusMarker {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  color: string;
  /** Optional physical display dimensions; legacy markers use the default. */
  width?: number;
  height?: number;
  /** Optional functional campus-gate metadata. Gate markers remain in the
   * existing top-level outdoor collection for backward-compatible persistence,
   * while their linked NavigationNode provides the routable identity. */
  purpose?: "general" | "emergency_exit";
  navNodeId?: string;
}

export interface CampusPath {
  id: string;
  points: { x: number; y: number }[];
  /** Stable per-vertex IDs used only when this pathway owns generated navigation. */
  navigationVertexIds?: string[];
  type: "walkway" | "road" | "accessible" | string;
  color: string;
  width: number;
  /** Optional editor grouping identity for joined physical Pathway networks. */
  pathNetworkId?: string;
  /** Shared-coordinate junction keys intentionally disconnected for this path. */
  disconnectedJunctionKeys?: string[];
  name?: string;
  visible?: boolean;
  locked?: boolean;
}

// ── Navigation Node (Waypoint) ──────────────────────────────────────────────

export type NavigationNodeType = "outdoor" | "entrance" | "hallway" | "room_access" | "stair" | "elevator" | "ramp" | "transition" | "emergency_exit" | "assembly" | "safe_area";

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
  /** Building-entrance ID when this node represents a building entrance target */
  entranceId?: string;
  /** Building-owned Entrance relationship for a generated indoor Door node. */
  buildingEntranceId?: string;
  /** Shared stair/elevator transition ID — links nav nodes across floors for the same physical stair/elevator */
  transitionSharedId?: string;
  /** Indoor linked physical objects (B5 Phase 2) — exactly one is set for a linked node. */
  roomId?: string;
  doorId?: string;
  stairId?: string;
  /** Building-attached exterior Emergency Stair owner, when applicable. */
  exteriorEmergencyStairId?: string;
  /** Canonical Campus Gate owner, when this node is a generated gate anchor. */
  gateId?: string;
  elevatorId?: string;
  rampId?: string;
  /** Explicit provenance for pathway-generated vertices. Manual/linked nodes omit this. */
  generatedFromPathVertices?: { pathId: string; vertexId: string }[];
  /** A manually inserted point that split an authored indoor path.  This is
   * persisted as ordinary navigation metadata (no schema change) so the
   * editor can keep the junction constrained to its parent corridor. */
  pathJunction?: boolean;
  accessible: boolean;
  /** Optional explicit emergency override for semantic transition nodes. */
  emergencySafe?: boolean;
  /** Marks a designated emergency evacuation stair for route preference. */
  emergencyStair?: boolean;
  /** Reason this node is not accessible (only relevant when accessible=false) */
  inaccessibleReason?: "stairs" | "narrow_path" | "restricted_access" | "uneven_surface" | "other";
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
  /** Whether this connection is temporarily closed/disabled in route planning */
  closed?: boolean;
  /**
   * B5 Phase 2.5: optional intermediate bend/control points (polyline geometry).
   * Indoor paths use orthogonal bends so routes follow hallways instead of a
   * diagonal A→B cut. GEOMETRY ONLY — the routing endpoints stay
   * startNodeId/endNodeId; bends are never independent nodes. Persisted via the
   * edge's metadata JSON (no DB migration).
   */
  bendPoints?: { x: number; y: number }[];
  type: string;
  color: string;
  width: number;
  /** Pathway IDs that explicitly generated this edge. Manual edges omit this. */
  generatedFromPathIds?: string[];
  /** Provenance for the two corridor segments created by an explicit path
   * junction split.  These flags are editor metadata, not a new edge type. */
  pathJunctionId?: string;
  pathJunctionParent?: boolean;
  /** Supports a later junction split on an already segmented corridor without
   * losing the parent relationship of the earlier junction. */
  pathJunctionIds?: string[];
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
  /** Base outdoor canvas appearance. Optional for backwards-compatible maps. */
  canvasGroundMaterial?: CampusGroundMaterial;
  canvasGroundColor?: string;
  canvasGroundTexture?: CampusGroundTexture;
  /** Legacy canvas color field retained for older drafts/published snapshots. */
  canvasColor?: string;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundOpacity?: number;
  backgroundFit?: "cover" | "contain" | "center";
  defaultZoom?: number;
  settings: CampusSettings;
  buildings: CampusBuilding[];
  /** Persisted structure summary used by campus-list previews before full editor hydration. */
  previewBuildingCount?: number;
  /** Persisted floor summary used by campus-list previews before full editor hydration. */
  previewFloorCount?: number;
  /** Persisted room summary used by campus-list previews before full editor hydration. */
  previewRoomCount?: number;
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
  | { type: "floor"; campusId: string; buildingId: string; floorId: string; initialSelection?: FloorSelection }
  | { type: "success"; campusId: string }
  | { type: "create-map"; campusId: string }
  | { type: "map-settings"; campusId: string };

// ── Selection types ─────────────────────────────────────────────────────────

export type CampusSelection =
  | { type: "building"; id: string }
  | { type: "entrance"; id: string; buildingId: string }
  | { type: "marker"; id: string }
  | { type: "gate"; id: string }
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
  | { type: "label"; id: string }
  | { type: "exteriorZone"; id: string }
  | { type: "entranceSteps"; id: string }
  | { type: "entranceRamp"; id: string }
  // B5 Final: issue-locate selections for indoor navigation targets. When the
  // Floor Editor receives one of these via onOpenFloor's initialSelection it
  // switches to Navigation mode and selects the node/edge directly.
  | { type: "navNode"; id: string }
  | { type: "navEdge"; id: string };

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
  /** Optional short description shown in the editor's rich asset tooltip. */
  description?: string;
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
export type CampusGroundMaterial = "neutral" | "grass" | "concrete" | "pavers" | "asphalt" | "custom";
export type CampusGroundTexture = "none" | "subtle";

// ── Decorative Asset (outdoor campus visual-only objects) ─────────────────

export type DecorAssetType =
  | "ground-area"
  | "lawn-area" | "garden-area" | "plaza-area"
  | "monument"
  | "tree" | "tree-large" | "palm"
  | "bench" | "bench-long"
  | "plant" | "bush" | "flower"
  | "sign" | "flag" | "directory-board" | "philippine-flag"
  | "gate-scanner"
  | "trash-bin" | "recycle-bin"
  | "lamp-post" | "bollard"
  | "bike-rack" | "fountain" | "guard-booth"
  | "picnic-table" | "gazebo" | "parking-lot";

export interface CampusDecorAsset {
  id: string;
  type: DecorAssetType;
  x: number;
  y: number;
  /** Optional explicit size for non-uniform outdoor areas such as Ground Area. */
  width?: number;
  height?: number;
  /** Appearance variant for the flexible Ground Area asset. */
  groundType?: "grass" | "planted" | "plaza" | "field" | "parking";
  /** Sparse grid cells for the tile-painted Campus Surface layer.  Coordinates
   * are integer grid indices; legacy rectangular ground assets leave this
   * field undefined and continue using their existing geometry. */
  surfaceCells?: { x: number; y: number }[];
  /** Grid spacing captured when the surface was authored. */
  surfaceCellSize?: number;
  rotation?: number;
  scale?: number;
  /** Whether this asset is visible on the canvas */
  visible?: boolean;
  /** Whether this asset is locked against canvas movement/resizing */
  locked?: boolean;
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
