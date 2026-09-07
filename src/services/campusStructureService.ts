import { getSupabase } from "../lib/supabase";
import { normalizeFloor } from "../lib/floorPlanNormalization";
import { nextFloorNumberForBuilding } from "../lib/floorManagement";
import { syncEntranceNodePositions } from "../lib/navigationGraph";
import { syncIndoorLinkedNodePositions } from "../lib/indoorNavigationGraph";
import { ENTRANCE_TRANSITION_EDGE_TYPE, reconcileEntranceTransitions } from "../lib/entranceTransitions";
import { syncExteriorEmergencyStairGraph } from "../lib/exteriorEmergencyStairs";
import { syncCampusGateNavigation } from "../lib/campusGates";
import type { Database, Json, Tables, TablesInsert, TablesUpdate } from "../types/database.generated";
import type {
  AccessibilityFeature, AssemblyPoint, Campus, CampusBuilding, CampusDecorAsset,
  CampusEventOverlay, CampusMarker, CampusPath, CampusRoute, FloorPlan, FloorWall, NavigationEdge, NavigationNode,
} from "../components/map-builder/types";

export type BuildingRow = Tables<"buildings">;
export type FloorRow = Tables<"floors">;
export type MapElementRow = Tables<"map_elements">;
export type NavigationNodeRow = Tables<"navigation_nodes">;
export type NavigationEdgeRow = Tables<"navigation_edges">;

type JsonObject = Record<string, Json | undefined>;
type StructureKind =
  | "marker" | "campus_path" | "route" | "accessibility_feature" | "assembly_point" | "decor" | "event_overlay"
  | "gate" | "canvas_appearance" | "room" | "floor_path" | "wall" | "door" | "window" | "furniture" | "stairs" | "ramp" | "elevator" | "label";

export interface CampusStructurePayload {
  buildings: JsonObject[];
  floors: JsonObject[];
  map_elements: JsonObject[];
  navigation_nodes: JsonObject[];
  navigation_edges: JsonObject[];
}

export interface CampusStructureRows {
  buildings: BuildingRow[];
  floors: FloorRow[];
  mapElements: MapElementRow[];
  navigationNodes: NavigationNodeRow[];
  navigationEdges: NavigationEdgeRow[];
}

export interface PublishedDirectoryEntry {
  id: string;
  campusId: string;
  buildingId?: string;
  floorId?: string;
  kind: "building" | "room" | "facility" | "destination";
  name: string;
  code?: string;
  accessible: boolean;
}

const ROOM_TYPES = new Set(["room", "classroom", "laboratory", "office", "restroom", "clinic", "library", "canteen"]);
const BUILDING_CATEGORIES = new Set(["academic", "administration", "library", "laboratory", "sports", "parking", "facility", "dormitory", "other"]);

function jsonUi<T>(value: T): JsonObject { return { ui: value as Json }; }
function uiFrom<T>(metadata: Json | null): T | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  // Current rows wrap the editor snapshot in metadata.ui. Older map-element
  // rows stored that same snapshot directly in metadata; accepting both
  // shapes makes the first hydration complete instead of silently dropping
  // legacy paths, gates, entrances, or floor content.
  const object = metadata as JsonObject;
  if (object.ui && typeof object.ui === "object" && !Array.isArray(object.ui)) return object.ui as T;
  return metadata as T;
}

function metadataKind(metadata: Json | null | undefined): string | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const object = metadata as JsonObject;
  const ui = object.ui;
  if (ui && typeof ui === "object" && !Array.isArray(ui)) {
    const kind = (ui as JsonObject).kind;
    if (typeof kind === "string" && kind.trim()) return kind;
  }
  return typeof object.kind === "string" && object.kind.trim() ? object.kind : undefined;
}

function structureKindForRow(row: Pick<MapElementRow, "element_type" | "metadata">): string | undefined {
  const explicit = metadataKind(row.metadata);
  if (explicit) return explicit;
  // These first-class element types were introduced after the original
  // editor serializer. They are safe fallbacks for rows that predate the
  // metadata.kind discriminator.
  if (row.element_type === "gate") return "gate";
  if (row.element_type === "canvas_appearance") return "canvas_appearance";
  if (row.element_type === "landmark") return "marker";
  return undefined;
}

/**
 * Older navigation rows were written before the editor UI snapshot was
 * consistently stored under metadata.ui. Keep those rows authoritative by
 * hydrating from their first-class database columns (and retain any legacy
 * metadata fields that are still useful). Current rows still round-trip the
 * complete UI object through metadata.ui, including bends and semantic refs.
 */
function jsonRecord(value: Json | null | undefined): Record<string, Json | undefined> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : undefined;
}

/** Read metadata written by the removed Building Accessible Approach feature. */
function removedAccessibleApproachMetadata(value: Json | null | undefined): Record<string, Json | undefined> | undefined {
  const metadata = jsonRecord(value);
  const source = jsonRecord(metadata?.ui as Json | undefined) ?? metadata;
  return source && (typeof source.accessibleApproachId === "string"
    || typeof source.accessibleApproachLeg === "string") ? source : undefined;
}

/** Drop removed ramp graph legs while restoring the old direct Entrance edge
 * that was temporarily disabled by the former ramp implementation. */
function restoreLegacyAccessibleApproachEdge(row: NavigationEdgeRow): NavigationEdgeRow | undefined {
  const metadata = jsonRecord(row.metadata);
  const ui = jsonRecord(metadata?.ui as Json | undefined);
  const source = removedAccessibleApproachMetadata(row.metadata);
  if (!source) return row;
  if (source.accessibleApproachLeg !== "bypass") return undefined;
  const cleanSource = { ...source };
  const originalAccessible = cleanSource.accessibleApproachBypassOriginalAccessible;
  const originalReason = cleanSource.accessibleApproachBypassOriginalInaccessibleReason;
  delete cleanSource.accessibleApproachId;
  delete cleanSource.accessibleApproachLeg;
  delete cleanSource.accessibleApproachBypassOriginalAccessible;
  delete cleanSource.accessibleApproachBypassOriginalInaccessibleReason;
  if (typeof originalAccessible === "boolean") cleanSource.accessible = originalAccessible;
  if (typeof originalReason === "string") cleanSource.inaccessibleReason = originalReason;
  else delete cleanSource.inaccessibleReason;
  const cleanMetadata = ui
    ? { ...(metadata ?? {}), ui: cleanSource as Json }
    : cleanSource as Json;
  return {
    ...row,
    is_accessible: typeof originalAccessible === "boolean" ? originalAccessible : row.is_accessible,
    metadata: cleanMetadata as Json,
  };
}

function finiteOr(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nodeTypeFromDatabase(value: string | null | undefined): NavigationNode["type"] {
  switch (value) {
    case "entrance": return "entrance";
    case "destination": return "room_access";
    case "stairs": return "stair";
    case "elevator": return "elevator";
    case "ramp": return "ramp";
    case "exit": return "emergency_exit";
    case "assembly_area": return "assembly";
    case "floor_transition": return "transition";
    case "waypoint":
    default: return "outdoor";
  }
}

function edgeTypeFromDatabase(value: string | null | undefined): string {
  if (value === "transition") return "floor_transition";
  return value && value.trim().length > 0 ? value : "walkway";
}

function navigationNodeFromRow(row: NavigationNodeRow): NavigationNode {
  const metadata = jsonRecord(row.metadata);
  const ui = jsonRecord(metadata?.ui as Json | undefined);
  const source = ui ?? metadata ?? {};
  const hasUiSnapshot = Boolean(ui);
  return {
    ...(source as unknown as Partial<NavigationNode>),
    id: row.id,
    name: row.name ?? String(source.name ?? "Walking Point"),
    type: (source.type as NavigationNode["type"] | undefined) ?? nodeTypeFromDatabase(row.node_type),
    x: finiteOr(row.x, finiteOr(source.x)),
    y: finiteOr(row.y, finiteOr(source.y)),
    campusId: (typeof source.campusId === "string" ? source.campusId : undefined) ?? row.campus_id,
    buildingId: row.building_id ?? (typeof source.buildingId === "string" ? source.buildingId : undefined),
    floorId: row.floor_id ?? (typeof source.floorId === "string" ? source.floorId : undefined),
    accessible: hasUiSnapshot && typeof source.accessible === "boolean" ? source.accessible : row.is_accessible,
    ...(hasUiSnapshot
      ? (typeof source.emergencySafe === "boolean" ? { emergencySafe: source.emergencySafe } : {})
      : { emergencySafe: row.is_emergency_safe }),
    color: typeof source.color === "string" ? source.color : "#3b82f6",
  };
}

function navigationEdgeFromRow(row: NavigationEdgeRow): NavigationEdge {
  const metadata = jsonRecord(row.metadata);
  const ui = jsonRecord(metadata?.ui as Json | undefined);
  const source = ui ?? metadata ?? {};
  const hasUiSnapshot = Boolean(ui);
  return {
    ...(source as unknown as Partial<NavigationEdge>),
    id: row.id,
    startNodeId: row.from_node_id,
    endNodeId: row.to_node_id,
    distance: finiteOr(source.distance, finiteOr(row.distance_m)),
    bidirectional: hasUiSnapshot && typeof source.bidirectional === "boolean" ? source.bidirectional : row.is_bidirectional,
    accessible: hasUiSnapshot && typeof source.accessible === "boolean" ? source.accessible : row.is_accessible,
    ...(hasUiSnapshot
      ? (typeof source.emergencySafe === "boolean" ? { emergencySafe: source.emergencySafe } : {})
      : { emergencySafe: row.is_emergency_safe }),
    type: (source.type as string | undefined) ?? edgeTypeFromDatabase(row.edge_type),
    color: typeof source.color === "string" ? source.color : "#3b82f6",
    width: finiteOr(source.width, 2),
    // `closed` remains part of the UI snapshot; is_temporarily_closed is the
    // persistence retirement flag filtered by selectStructure. Do not add an
    // explicit undefined property, or a reload would mutate JSON on next save.
  };
}
function normalizedBuildingCategory(value: string): string {
  const category = value.trim().toLowerCase();
  return BUILDING_CATEGORIES.has(category) ? category : "other";
}
function normalizedElementType(value: string): string {
  const type = value.trim().toLowerCase();
  return ROOM_TYPES.has(type) ? type : "room";
}
function normalizedNodeType(value: NavigationNode["type"]): string {
  // navigation_nodes.node_type has a DB CHECK constraint allowing only
  // waypoint/entrance/destination/stairs/elevator/ramp/exit/assembly_area/
  // floor_transition. Map every UI type onto a DB-safe value; the full UI type
  // round-trips through metadata JSON, so no information is lost on save.
  return ({
    outdoor: "waypoint", hallway: "waypoint", room_access: "destination",
    stair: "stairs", elevator: "elevator", ramp: "ramp", transition: "floor_transition",
    emergency_exit: "exit", assembly: "assembly_area", safe_area: "assembly_area",
    entrance: "entrance",
  } as Record<string, string>)[value] ?? "waypoint";
}
function normalizedEdgeType(value: string): string {
  // B5 Phase 3: the UI "floor_transition" edge type maps onto the DB's allowed
  // "transition" value (the full UI type round-trips through metadata JSON).
  if (value === "floor_transition") return "transition";
  if (value === ENTRANCE_TRANSITION_EDGE_TYPE) return "transition";
  return new Set(["walkway", "hallway", "stairs", "elevator", "ramp", "door", "crossing", "transition"]).has(value) ? value : "walkway";
}

/**
 * `map_elements.name` is a required searchable display field even when the
 * editor's optional label/name field is empty. Keep the fallback in the
 * persistence mapper (rather than mutating the editor object) so unnamed
 * objects remain visually optional while every database row is valid.
 */
function defaultElementName(kind: StructureKind): string {
  return ({
    floor_path: "Walking Path",
    campus_path: "Campus Path",
    accessibility_feature: "Accessibility Feature",
    assembly_point: "Assembly Point",
    event_overlay: "Event Overlay",
    marker: "Marker",
    route: "Route",
    room: "Room",
    wall: "Wall",
    door: "Door",
    window: "Window",
    furniture: "Furniture",
    stairs: "Stairs",
    ramp: "Ramp",
    elevator: "Elevator",
    label: "Label",
    decor: "Decorative Asset",
    gate: "Campus Gate",
    canvas_appearance: "Canvas Appearance",
  } as Record<StructureKind, string>)[kind];
}

interface ExistingNavigationEdgePair {
  id: string;
  campus_id: string;
  from_node_id: string;
  to_node_id: string;
  is_temporarily_closed?: boolean | null;
  edge_type?: string | null;
  metadata?: Json | null;
}

/** Coerce a numeric field to a finite number, throwing a descriptive, developer-facing
 * error that names the element type + id when the data is genuinely corrupt. The DB
 * contract requires map_elements.x/y and rotation to be NOT NULL, so we must never
 * emit NaN (which JSON.stringify turns into null) for those columns. */
function finiteNumber(value: unknown, kind: string, id: unknown, label: string): number {
  if (value === undefined || value === null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`map_elements (${kind} "${String(id)}"): invalid ${label} value ${String(value)}. Fix or delete this element in the Floor Editor.`);
  }
  return n;
}

function element(kind: StructureKind, campusId: string, value: Record<string, unknown>, buildingId?: string, floorId?: string): JsonObject {
  const points = "points" in value ? value.points as Json : undefined;
  const width = Number("w" in value ? value.w : value.width);
  const height = Number("h" in value ? value.h : value.height);
  const rawName = [value.name, value.title, value.label, value.text]
    .find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0);
  const name = (rawName ?? defaultElementName(kind)).trim();
  const roomType = kind === "room" ? normalizedElementType(String(value.type ?? "room")) : undefined;
  // Walls are endpoint-based (x1/y1/x2/y2). Their canonical anchor location is
  // the START point; the full segment geometry is retained in metadata.ui and
  // geometry.points. This avoids emitting null/NaN for the NOT NULL x/y columns.
  const anchorX = kind === "wall" ? value.x1 : value.x;
  const anchorY = kind === "wall" ? value.y1 : value.y;
  const rawRotation = value.rotation;
  const rotationValue = finiteNumber(rawRotation, kind, value.id, "rotation");
  const typeMap: Partial<Record<StructureKind, string>> = {
    marker: "landmark", gate: "gate", route: "custom", campus_path: "custom", accessibility_feature: "custom",
    assembly_point: "assembly_area", decor: "custom", event_overlay: "custom", floor_path: "hallway", wall: "wall",
    door: value.isEmergencyExit ? "emergency_exit" : "door", window: "window", furniture: "furniture",
    stairs: "stairs", ramp: "ramp", elevator: "elevator", label: "custom", canvas_appearance: "canvas_appearance",
  };
  return {
    id: String(value.id), campus_id: campusId, building_id: buildingId, floor_id: floorId,
    element_type: roomType ?? typeMap[kind] ?? "custom", name,
    code: kind === "room" ? String(value.name ?? "") : undefined,
    description: typeof value.description === "string" ? value.description : undefined,
    search_keywords: [name.toLowerCase()],
    x: finiteNumber(anchorX, kind, value.id, "x"), y: finiteNumber(anchorY, kind, value.id, "y"),
    width: Number.isFinite(width) && width > 0 ? width : undefined,
    height: Number.isFinite(height) && height > 0 ? height : undefined,
    rotation: ((rotationValue % 360) + 360) % 360, z_index: Number.isFinite(Number(value.zOrder)) ? Number(value.zOrder) : 0,
    geometry: points ? { points } : undefined,
    style: { color: typeof value.color === "string" ? value.color : undefined, width: typeof value.width === "number" ? value.width : undefined },
    metadata: { kind, ui: value as Json },
    is_accessible: Boolean(value.accessibility ?? value.accessible),
    is_emergency_asset: Boolean(value.isEmergencyExit || kind === "assembly_point"),
    is_searchable: !["wall", "window", "furniture", "decor", "floor_path", "campus_path", "label", "canvas_appearance"].includes(kind),
    is_visible: value.visible !== false,
  };
}

/**
 * Return a deterministic RFC-4122 UUID for records that need a stable
 * identity but do not have a dedicated database row.  `map_elements.id` is a
 * UUID column, so semantic keys such as `${campusId}:canvas-appearance` must
 * never be sent directly to Supabase.  This intentionally uses a tiny
 * dependency-free hash rather than introducing another UUID/client library.
 */
export function canvasAppearanceRecordId(campusId: string): string {
  const source = String(campusId);
  const hex = source.replace(/[^0-9a-f]/gi, "").toLowerCase();
  let seed = 0x811c9dc5;
  for (const char of `${source}:canvas-appearance`) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 0x01000193) >>> 0;
  }
  const bytes: number[] = [];
  for (let index = 0; index < 16; index += 1) {
    const offset = (index * 2) % Math.max(2, hex.length);
    const sourceByte = hex.length >= 2 ? Number.parseInt(hex.slice(offset, offset + 2), 16) : 0;
    seed = Math.imul(seed ^ (index * 0x9e3779b9), 0x45d9f3b) >>> 0;
    bytes.push((sourceByte ^ (seed >>> ((index % 4) * 8))) & 0xff);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5 (name-based/deterministic)
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC-4122 variant
  const groups = [4, 2, 2, 2, 6];
  let cursor = 0;
  return groups.map((length) => {
    const group = bytes.slice(cursor, cursor + length).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    cursor += length;
    return group;
  }).join("-");
}

/**
 * Building codes are a table-wide campus key in the persistence schema. Keep
 * the payload valid even when a legacy/editor draft contains two buildings
 * with the same (or blank) code. The first authored code wins; later
 * collisions receive the same short, human-readable default identity used by
 * the editor's create/duplicate actions.
 */
function nextPayloadBuildingCode(candidate: unknown, usedCodes: Set<string>): string {
  const authored = typeof candidate === "string" ? candidate.trim() : "";
  if (authored && !usedCodes.has(authored.toUpperCase())) {
    usedCodes.add(authored.toUpperCase());
    return authored;
  }
  let index = 1;
  let generated = `BLDG-${String(index).padStart(2, "0")}`;
  while (usedCodes.has(generated)) {
    index += 1;
    generated = `BLDG-${String(index).padStart(2, "0")}`;
  }
  usedCodes.add(generated);
  return generated;
}

/**
 * The database keeps removed Buildings as archived rows and the historical
 * `(campus_id, code)` constraint still covers them. A fresh draft Building can
 * therefore collide with a code that is no longer visible in the editor. Read
 * the campus code ledger before the RPC and move only new/conflicting payload
 * rows to the next short default code. Existing row IDs retain their authored
 * code; the loaded RPC result becomes the new canonical editor state.
 */
async function avoidArchivedBuildingCodeConflicts(
  campusId: string,
  payload: CampusStructurePayload,
): Promise<CampusStructurePayload> {
  try {
    const { data, error } = await getSupabase()
      .from("buildings")
      .select("id,code")
      .eq("campus_id", campusId);
    if (error || !Array.isArray(data)) return payload;

    const payloadIds = new Set(payload.buildings.map((building) => String(building.id)));
    const occupiedCodes = new Set(
      data
        .filter((row) => !payloadIds.has(String(row.id)))
        .map((row) => String(row.code ?? "").trim().toUpperCase())
        .filter(Boolean),
    );
    const authoredCodes = new Set(
      payload.buildings
        .map((building) => String(building.code ?? "").trim().toUpperCase())
        .filter(Boolean),
    );
    const claimedCodes = new Set<string>();
    let changed = false;
    const buildings = payload.buildings.map((building) => {
      const authored = String(building.code ?? "").trim();
      const normalized = authored.toUpperCase();
      if (authored && !occupiedCodes.has(normalized) && !claimedCodes.has(normalized)) {
        claimedCodes.add(normalized);
        return building;
      }

      let index = 1;
      let replacement = `BLDG-${String(index).padStart(2, "0")}`;
      while (occupiedCodes.has(replacement) || authoredCodes.has(replacement) || claimedCodes.has(replacement)) {
        index += 1;
        replacement = `BLDG-${String(index).padStart(2, "0")}`;
      }
      claimedCodes.add(replacement);
      changed = true;
      return { ...building, code: replacement };
    });
    return changed ? { ...payload, buildings } : payload;
  } catch {
    // This is a defensive ledger read. The authoritative RPC remains the
    // source of truth if a transient read is unavailable.
    return payload;
  }
}

export function serializeCampusStructure(campus: Campus): CampusStructurePayload {
  // Persist the canonical Campus Gate anchor alongside the physical marker.
  // Hydrated/editor state normally already contains it, but reconciling here
  // also makes legacy/partially-authored campuses safe to save and prevents a
  // gate from silently round-tripping without its routable navigation node.
  const canonicalCampus = syncCampusGateNavigation(reconcileEntranceTransitions(campus));
  const buildings: JsonObject[] = [];
  const usedBuildingCodes = new Set<string>();
  const floors: JsonObject[] = [];
  const map_elements: JsonObject[] = [];
  (canonicalCampus.buildings ?? []).forEach((building, buildingOrder) => {
    const { floors: buildingFloors, accessibleApproach: _removedApproach, ...buildingUi } = building as CampusBuilding & { accessibleApproach?: unknown };
    const code = nextPayloadBuildingCode(building.code, usedBuildingCodes);
    buildings.push({
      id: building.id, name: building.name, code, description: building.description,
      category: normalizedBuildingCategory(building.category),
      x: finiteNumber(building.x, "building", building.id, "x"),
      y: finiteNumber(building.y, "building", building.id, "y"),
      width: building.width, height: building.height,
      rotation: ((finiteNumber(building.rotation, "building", building.id, "rotation") % 360) + 360) % 360,
      is_searchable: true, is_visible: building.visible !== false,
      is_accessible: Boolean(building.accessibility?.wheelchairAccessible),
      metadata: { ...jsonUi(buildingUi), display_order: buildingOrder },
    });
    // B5 Phase 3.1: defensive per-building unique renumbering. Local editor
    // state could drift (e.g. a floor added with a stale next-number) — the DB
    // `floors_building_number_uq (building_id, floor_number)` constraint must
    // never reject a save because of it. Keep each floor's own number when it is
    // still unused in this building; deterministically bump colliding ones to
    // the next free number (max used + 1).
    const usedFloorNumbers = new Set<number>();
    const seenFloorIds = new Set<string>();
    (buildingFloors ?? []).forEach((rawFloor, floorOrder) => {
      const normalizedFloor = normalizeFloor(rawFloor, { buildingId: building.id, number: floorOrder + 1 });
      // B5 Phase 3.1.2: a duplicated local floor object (same id appended
      // twice) would be persisted as a duplicate row — fail early with a
      // clear developer-facing error instead of sending invalid rows.
      if (seenFloorIds.has(normalizedFloor.id)) {
        throw new Error(`Building "${building.name}" contains a duplicate floor id "${normalizedFloor.id}" — remove the duplicated floor before saving.`);
      }
      seenFloorIds.add(normalizedFloor.id);
      let floorNumber = normalizedFloor.number;
      if (usedFloorNumbers.has(floorNumber)) {
        floorNumber = nextFloorNumberForBuilding([...usedFloorNumbers].map((n) => ({ number: n })));
      }
      usedFloorNumbers.add(floorNumber);
      const floor = { ...normalizedFloor, number: floorNumber };
      const {
        rooms = [], paths = [], walls = [], doors = [], windows = [], furniture = [],
        stairs = [], ramps = [], elevators = [], labels = [], ...floorUi
      } = floor;
      floors.push({ id: floor.id, building_id: building.id, name: floor.label, floor_number: floor.number,
        display_order: floorOrder, floor_plan_path: floor.backgroundImage?.storagePath,
        canvas_width: floor.canvasW ?? campus.canvasW, canvas_height: floor.canvasH ?? campus.canvasH,
        map_scale_m_per_unit: floor.calibration?.metersPerUnit ?? null, is_visible: true, metadata: jsonUi(floorUi) });
      rooms.forEach((v) => map_elements.push(element("room", campus.id, v as unknown as Record<string, unknown>, building.id, floor.id)));
      paths.forEach((v) => map_elements.push(element("floor_path", campus.id, v as unknown as Record<string, unknown>, building.id, floor.id)));
      walls.forEach((v) => map_elements.push(element("wall", campus.id, v as unknown as Record<string, unknown>, building.id, floor.id)));
      doors.forEach((v) => map_elements.push(element("door", campus.id, v as unknown as Record<string, unknown>, building.id, floor.id)));
      windows.forEach((v) => map_elements.push(element("window", campus.id, v as unknown as Record<string, unknown>, building.id, floor.id)));
      furniture.forEach((v) => map_elements.push(element("furniture", campus.id, v as unknown as Record<string, unknown>, building.id, floor.id)));
      stairs.forEach((v) => map_elements.push(element("stairs", campus.id, v as unknown as Record<string, unknown>, building.id, floor.id)));
      ramps.forEach((v) => map_elements.push(element("ramp", campus.id, v as unknown as Record<string, unknown>, building.id, floor.id)));
      elevators.forEach((v) => map_elements.push(element("elevator", campus.id, v as unknown as Record<string, unknown>, building.id, floor.id)));
      labels.forEach((v) => map_elements.push(element("label", campus.id, v as unknown as Record<string, unknown>, building.id, floor.id)));
    });
  });
  (campus.markers ?? []).forEach((v) => map_elements.push(element(v.type === "gate" ? "gate" : "marker", campus.id, v as unknown as Record<string, unknown>)));
  (campus.paths ?? []).forEach((v) => map_elements.push(element("campus_path", campus.id, v as unknown as Record<string, unknown>)));
  (campus.routes ?? []).forEach((v) => map_elements.push(element("route", campus.id, v as unknown as Record<string, unknown>)));
  (campus.accessibilityFeatures ?? []).forEach((v) => map_elements.push(element("accessibility_feature", campus.id, v as unknown as Record<string, unknown>, v.buildingId)));
  (campus.assemblyPoints ?? []).forEach((v) => map_elements.push(element("assembly_point", campus.id, v as unknown as Record<string, unknown>)));
  (campus.decorAssets ?? []).forEach((v) => map_elements.push(element("decor", campus.id, v as unknown as Record<string, unknown>)));
  (campus.eventOverlays ?? []).forEach((v) => map_elements.push(element("event_overlay", campus.id, v as unknown as Record<string, unknown>, v.locationRef?.buildingId)));
  // Campus appearance lives in the existing map_elements JSON channel. This
  // deterministic, non-rendered record avoids a schema migration while still
  // round-tripping ground material/tint for editor reloads and published
  // snapshots. It is intentionally not a decor asset or navigation object.
  if (campus.canvasGroundMaterial !== undefined || campus.canvasGroundColor !== undefined
    || campus.canvasGroundTexture !== undefined || campus.canvasColor !== undefined) {
    map_elements.push(element("canvas_appearance", campus.id, {
      // Keep the logical record stable across repeated saves while satisfying
      // the UUID type of map_elements.id.  The semantic discriminator is
      // carried by element_type/metadata, not encoded into the UUID string.
      id: canvasAppearanceRecordId(campus.id),
      canvasAppearanceKey: "canvas-appearance",
      canvasGroundMaterial: campus.canvasGroundMaterial,
      canvasGroundColor: campus.canvasGroundColor,
      canvasGroundTexture: campus.canvasGroundTexture,
      canvasColor: campus.canvasColor,
    }));
  }
  return {
    buildings, floors, map_elements,
    navigation_nodes: (canonicalCampus.navNodes ?? []).map((node) => ({
      id: node.id, building_id: node.buildingId, floor_id: node.floorId, node_type: normalizedNodeType(node.type),
      name: node.name,
      x: finiteNumber(node.x, "navigation_node", node.id, "x"),
      y: finiteNumber(node.y, "navigation_node", node.id, "y"),
      is_accessible: node.accessible, is_emergency_safe: true, is_active: true, metadata: jsonUi(node),
    })),
    navigation_edges: (canonicalCampus.navEdges ?? []).map((edge) => ({
      id: edge.id, from_node_id: edge.startNodeId, to_node_id: edge.endNodeId,
      distance_m: Math.max(edge.distance, 0.001), weight: 1, edge_type: normalizedEdgeType(edge.type),
      is_bidirectional: edge.bidirectional, is_accessible: edge.accessible,
      is_emergency_safe: edge.emergencySafe !== false, is_temporarily_closed: false, metadata: jsonUi(edge),
    })),
  };
}

export function hydrateCampusStructure(campus: Campus, rows: CampusStructureRows): Campus {
  const floorElements = new Map<string, MapElementRow[]>();
  rows.mapElements.forEach((item) => { if (item.floor_id) floorElements.set(item.floor_id, [...(floorElements.get(item.floor_id) ?? []), item]); });
  const floorsByBuilding = new Map<string, FloorPlan[]>();
  [...rows.floors].sort((a, b) => a.display_order - b.display_order || a.floor_number - b.floor_number).forEach((row) => {
    const values = floorElements.get(row.id) ?? [];
    const byKind = <T>(kind: StructureKind) => values
      .filter((item) => structureKindForRow(item) === kind)
      .map((item) => uiFrom<T>(item.metadata))
      .filter((v): v is T => Boolean(v));
    // Legacy normalization: walls are endpoint-based (x1/y1/x2/y2). Older editor
    // builds could leave stray non-finite x/y fields on wall objects (a broken
    // drag wrote NaN there). Strip those so they never render or re-serialize.
    const walls = byKind<Record<string, unknown>>("wall").map((w) => {
      const cleaned = { ...w };
      if (!Number.isFinite(cleaned.x as number)) delete cleaned.x;
      if (!Number.isFinite(cleaned.y as number)) delete cleaned.y;
      return cleaned as FloorWall;
    });
    const base = uiFrom<Partial<FloorPlan>>(row.metadata) ?? {};
    const floor = normalizeFloor({ ...base, id: row.id, buildingId: row.building_id, number: row.floor_number, label: row.name,
      canvasW: row.canvas_width, canvasH: row.canvas_height,
      backgroundImage: base.backgroundImage ?? (row.floor_plan_path ? { storagePath: row.floor_plan_path } : undefined),
      calibration: base.calibration ?? (row.map_scale_m_per_unit ? {
        metersPerUnit: row.map_scale_m_per_unit,
        editorDistance: 1,
        realDistanceM: row.map_scale_m_per_unit,
        points: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      } : undefined),
      rooms: byKind("room"), paths: byKind("floor_path"), walls, doors: byKind("door"),
      windows: byKind("window"), furniture: byKind("furniture"), stairs: byKind("stairs"), ramps: byKind("ramp"),
      elevators: byKind("elevator"), labels: byKind("label") } as Partial<FloorPlan>, { buildingId: row.building_id });
    floorsByBuilding.set(row.building_id, [...(floorsByBuilding.get(row.building_id) ?? []), floor]);
  });
  const buildings = [...rows.buildings].sort((a, b) => Number((a.metadata as JsonObject)?.display_order ?? 0) - Number((b.metadata as JsonObject)?.display_order ?? 0)).map((row) => {
    const { accessibleApproach: _removedApproach, ...buildingUi } = uiFrom<Partial<CampusBuilding> & { accessibleApproach?: unknown }>(row.metadata) ?? {};
    return ({
    ...buildingUi, id: row.id, name: row.name, code: row.code,
    category: row.category, description: row.description ?? "", x: row.x, y: row.y, width: row.width,
    height: row.height, rotation: row.rotation, visible: row.is_visible, floors: floorsByBuilding.get(row.id) ?? [],
  });
  }) as CampusBuilding[];
  const top = <T>(kind: StructureKind) => rows.mapElements
    .filter((item) => !item.floor_id && structureKindForRow(item) === kind)
    .map((item) => uiFrom<T>(item.metadata))
    .filter((v): v is T => Boolean(v));
  const canvasAppearance = top<Pick<Campus, "canvasGroundMaterial" | "canvasGroundColor" | "canvasGroundTexture" | "canvasColor">>("canvas_appearance")[0];
  const hydratedNavNodes = rows.navigationNodes
    .filter((row) => row.is_active !== false)
    .filter((row) => !removedAccessibleApproachMetadata(row.metadata))
    .map(navigationNodeFromRow);
  const hydratedNavEdges = rows.navigationEdges
    .filter((row) => row.is_temporarily_closed !== true)
    .map(restoreLegacyAccessibleApproachEdge)
    .filter((row): row is NavigationEdgeRow => Boolean(row))
    .map(navigationEdgeFromRow);
  // B5 Phase 1.8: entrance-linked nav nodes are DERIVED geometry — a stale
  // persisted x/y (older save, hand-edited metadata) is re-synced against the
  // linked building entrance on load. IDs + graph relationships are preserved.
  const navNodes = syncEntranceNodePositions(buildings, hydratedNavNodes);
  // B5 Phase 2: indoor linked nodes (room/door/stair/elevator/ramp) are DERIVED
  // geometry too — re-sync their x/y against the hydrated floor objects so a
  // stale persisted position never drifts from its physical owner on load.
  const indoorNodes = navNodes.filter((n) => !!n.floorId);
  const indoorLinkedIds = new Set(indoorNodes.filter((n) => !!n.roomId || !!n.doorId || !!n.stairId || !!n.elevatorId || !!n.rampId).map((n) => n.id));
  const syncedIndoorNodes = buildings.flatMap((b) =>
    syncIndoorLinkedNodePositions(
      indoorNodes.filter((n) => n.buildingId === b.id),
      { rooms: (b.floors ?? []).flatMap((f) => f.rooms ?? []), doors: (b.floors ?? []).flatMap((f) => f.doors ?? []),
        stairs: (b.floors ?? []).flatMap((f) => f.stairs ?? []), ramps: (b.floors ?? []).flatMap((f) => f.ramps ?? []),
        elevators: (b.floors ?? []).flatMap((f) => f.elevators ?? []) }
    )
  );
  const byId = new Map(syncedIndoorNodes.map((n) => [n.id, n]));
  const finalNodes = navNodes.map((n) => (indoorLinkedIds.has(n.id) ? byId.get(n.id) ?? n : n));
  // Only drop dangling edges (missing endpoints); cross-side indoor↔outdoor
  // links (entrance → room access) are a legitimate future graph pattern.
  const finalEdges = hydratedNavEdges.filter((e) => {
    const a = finalNodes.find((n) => n.id === e.startNodeId);
    const b = finalNodes.find((n) => n.id === e.endNodeId);
    return Boolean(a && b);
  });
  const reconciledGraph = reconcileEntranceTransitions({ ...campus, buildings, navNodes: finalNodes, navEdges: finalEdges });
  const withExteriorEmergencyStairs = syncExteriorEmergencyStairGraph({ ...campus, buildings, markers: [...top<CampusMarker>("marker"), ...top<CampusMarker>("gate")], navNodes: finalNodes, navEdges: reconciledGraph.navEdges ?? [] });
  const withCampusGates = syncCampusGateNavigation({ ...withExteriorEmergencyStairs, markers: [...top<CampusMarker>("marker"), ...top<CampusMarker>("gate")] });
  return { ...withCampusGates,
    ...(canvasAppearance ? {
      canvasGroundMaterial: canvasAppearance.canvasGroundMaterial,
      canvasGroundColor: canvasAppearance.canvasGroundColor,
      canvasGroundTexture: canvasAppearance.canvasGroundTexture,
      canvasColor: canvasAppearance.canvasColor,
    } : {}),
    markers: withCampusGates.markers, paths: top<CampusPath>("campus_path"),
    routes: top<CampusRoute>("route"), accessibilityFeatures: top<AccessibilityFeature>("accessibility_feature"),
    assemblyPoints: top<AssemblyPoint>("assembly_point"), decorAssets: top<CampusDecorAsset>("decor"),
    eventOverlays: top<CampusEventOverlay>("event_overlay"),
    navNodes: withCampusGates.navNodes ?? [], navEdges: withCampusGates.navEdges ?? [], buildings: withCampusGates.buildings };
}

async function selectStructure(campusId: string): Promise<CampusStructureRows> {
  const db = getSupabase();
  // B6 Phase 2: deterministic load order. Postgres returns rows in arbitrary
  // order without ORDER BY, which made repeated loads of identical persisted
  // data produce different collection orders and therefore false dirty-state
  // differences after Save → reload. Semantic editor order is preserved where a
  // column exists (floors.display_order/floor_number; buildings carry their
  // explicit order in metadata.display_order and the hydrator re-sorts by it),
  // and every collection gets a stable created_at → id tie-break so two loads
  // of the same rows always hydrate to the same JSON.
  const [buildings, floors, mapElements, navigationNodes, navigationEdges] = await Promise.all([
    db.from("buildings").select("*").eq("campus_id", campusId)
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .is("archived_at", null),
    db.from("floors").select("*, buildings!inner(campus_id)").eq("buildings.campus_id", campusId)
      .order("display_order", { ascending: true }).order("floor_number", { ascending: true }).order("id", { ascending: true })
      .is("archived_at", null),
    db.from("map_elements").select("*").eq("campus_id", campusId)
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .is("archived_at", null),
    db.from("navigation_nodes").select("*").eq("campus_id", campusId).eq("is_active", true)
      .order("created_at", { ascending: true }).order("id", { ascending: true }),
    db.from("navigation_edges").select("*").eq("campus_id", campusId).eq("is_temporarily_closed", false)
      .order("created_at", { ascending: true }).order("id", { ascending: true }),
  ]);
  const failure = [buildings, floors, mapElements, navigationNodes, navigationEdges].find((result) => result.error)?.error;
  if (failure) throw failure;
  return { buildings: buildings.data ?? [], floors: (floors.data ?? []).map(({ buildings: _, ...row }) => row) as FloorRow[],
    mapElements: mapElements.data ?? [], navigationNodes: navigationNodes.data ?? [], navigationEdges: navigationEdges.data ?? [] };
}

function repository<TName extends "buildings" | "floors" | "map_elements" | "navigation_nodes" | "navigation_edges">(table: TName) {
  return {
    async create(value: TablesInsert<TName>) { const { data, error } = await getSupabase().from(table).insert(value as never).select().single(); if (error) throw error; return data; },
    async update(id: string, value: TablesUpdate<TName>) { const { data, error } = await getSupabase().from(table).update(value as never).eq("id", id).select().single(); if (error) throw error; return data; },
    async remove(id: string) { const { error } = await getSupabase().from(table).delete().eq("id", id); if (error) throw error; },
  };
}

export const buildingService = repository("buildings");
export const floorService = repository("floors");
export const mapElementService = repository("map_elements");
export const navigationNodeService = repository("navigation_nodes");
export const navigationEdgeService = repository("navigation_edges");
export const roomService = { ...mapElementService, list: async (campusId: string) => (await selectStructure(campusId)).mapElements.filter((row) => ROOM_TYPES.has(row.element_type)) };
export const entranceService = { ...mapElementService, list: async (campusId: string) => (await selectStructure(campusId)).mapElements.filter((row) => row.element_type === "entrance") };

export const campusStructureService = {
  async load(campus: Campus): Promise<Campus> { return hydrateCampusStructure(campus, await selectStructure(campus.id)); },
  async save(campus: Campus): Promise<Campus> {
    const payload = await avoidArchivedBuildingCodeConflicts(campus.id, serializeCampusStructure(campus));
    validateNavigationEdgePayload(payload);
    const payloadWithStableEdgeRows = await reuseExistingNavigationEdgePairRows(campus.id, payload);
    validateNavigationEdgePayload(payloadWithStableEdgeRows);
    const { error } = await getSupabase().rpc("save_campus_structure", { p_campus_id: campus.id, p_payload: payloadWithStableEdgeRows as unknown as Json });
    if (error) {
      await logCampusStructureSaveDiagnostics(campus.id, payloadWithStableEdgeRows, error);
      throw new Error(`Campus structure was not saved: ${error.message}`);
    }
    return this.load(campus);
  },
  async publishedDirectory(campusId?: string): Promise<PublishedDirectoryEntry[]> {
    let query = getSupabase().from("campus_versions").select("campus_id,snapshot").eq("state", "published");
    if (campusId) query = query.eq("campus_id", campusId);
    const { data, error } = await query; if (error) throw error;
    return (data ?? []).flatMap((version) => directoryFromSnapshot(version.campus_id, version.snapshot));
  },
};

function navigationEdgeRowType(edge: JsonObject): string | undefined {
  const metadata = edge.metadata;
  const ui = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as JsonObject).ui : undefined;
  return ui && typeof ui === "object" && !Array.isArray(ui) ? String((ui as JsonObject).type ?? "") || undefined : undefined;
}

export function validateNavigationEdgePayload(payload: CampusStructurePayload): void {
  const nodeIds = new Set(payload.navigation_nodes.map((node) => String(node.id)));
  const edgeIds = new Set<string>();
  const pairIds = new Map<string, string>();
  const entranceById = new Map<string, string>();
  for (const edge of payload.navigation_edges) {
    const id = String(edge.id ?? "");
    const from = String(edge.from_node_id ?? "");
    const to = String(edge.to_node_id ?? "");
    if (!id) throw new Error("navigation edge payload contains an edge without an id.");
    if (edgeIds.has(id)) throw new Error(`navigation edge payload contains duplicate edge id "${id}".`);
    edgeIds.add(id);
    if (!nodeIds.has(from) || !nodeIds.has(to)) {
      throw new Error(`navigation edge "${id}" references missing endpoint node(s): ${from} -> ${to}.`);
    }
    const pairKey = `${from}|${to}`;
    const existingPairId = pairIds.get(pairKey);
    if (existingPairId) {
      throw new Error(`navigation edge payload contains duplicate active pair ${from} -> ${to} (${existingPairId}, ${id}).`);
    }
    pairIds.set(pairKey, id);
    if (navigationEdgeRowType(edge) === ENTRANCE_TRANSITION_EDGE_TYPE) {
      const metadata = edge.metadata as JsonObject | undefined;
      const ui = metadata?.ui as JsonObject | undefined;
      const startId = String(ui?.startNodeId ?? from);
      const endId = String(ui?.endNodeId ?? to);
      const startNode = payload.navigation_nodes.find((node) => String(node.id) === startId);
      const endNode = payload.navigation_nodes.find((node) => String(node.id) === endId);
      const entranceNode = startNode && !startNode.floor_id ? startNode : endNode && !endNode.floor_id ? endNode : undefined;
      const entranceId = entranceNode?.metadata && typeof entranceNode.metadata === "object" && !Array.isArray(entranceNode.metadata)
        ? ((entranceNode.metadata as JsonObject).ui as JsonObject | undefined)?.entranceId
        : undefined;
      if (entranceId) {
        const entranceKey = String(entranceId);
        const existingEntranceEdge = entranceById.get(entranceKey);
        if (existingEntranceEdge) {
          throw new Error(`navigation edge payload contains multiple entrance transitions for entrance "${entranceKey}" (${existingEntranceEdge}, ${id}).`);
        }
        entranceById.set(entranceKey, id);
      }
    }
  }
}

export function rekeyNavigationEdgePayloadPairs(payload: CampusStructurePayload, existingRows: NavigationEdgePairRow[], campusId: string): CampusStructurePayload {
  const byPair = new Map(existingRows.filter((row) => row.campusId === campusId).map((row) => [`${row.fromNodeId}|${row.toNodeId}`, row.id]));
  const navigation_edges = payload.navigation_edges.map((edge) => {
    const pairOwnerId = byPair.get(`${String(edge.from_node_id)}|${String(edge.to_node_id)}`);
    if (!pairOwnerId || pairOwnerId === edge.id) return edge;
    const metadata = edge.metadata && typeof edge.metadata === "object" && !Array.isArray(edge.metadata)
      ? { ...(edge.metadata as JsonObject) }
      : edge.metadata;
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      const ui = (metadata as JsonObject).ui;
      if (ui && typeof ui === "object" && !Array.isArray(ui)) {
        (metadata as JsonObject).ui = { ...(ui as JsonObject), id: pairOwnerId } as Json;
      }
    }
    return { ...edge, id: pairOwnerId, metadata };
  });
  return { ...payload, navigation_edges };
}

async function reuseExistingNavigationEdgePairRows(campusId: string, payload: CampusStructurePayload): Promise<CampusStructurePayload> {
  if (payload.navigation_edges.length === 0) return payload;
  const { data, error } = await getSupabase()
    .from("navigation_edges")
    .select("id,campus_id,from_node_id,to_node_id,is_temporarily_closed,edge_type,metadata")
    .eq("campus_id", campusId);
  if (error) throw new Error(`Could not inspect existing navigation edge pairs before save: ${error.message}`);
  const existingRows: NavigationEdgePairRow[] = ((data ?? []) as ExistingNavigationEdgePair[]).map((row) => ({
    id: row.id,
    campusId: row.campus_id,
    fromNodeId: row.from_node_id,
    toNodeId: row.to_node_id,
  }));
  return rekeyNavigationEdgePayloadPairs(payload, existingRows, campusId);
}

async function logCampusStructureSaveDiagnostics(campusId: string, payload: CampusStructurePayload, error: unknown): Promise<void> {
  const floors = payload.floors.map((f) => ({
    id: String(f.id),
    buildingId: String(f.building_id),
    requestedNumber: Number(f.floor_number),
    name: String(f.name ?? ""),
  }));
  const keyCounts = new Map<string, number>();
  floors.forEach((f) => {
    const key = `${f.buildingId}|${f.requestedNumber}`;
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  });
  const duplicatePayloadKeys = [...keyCounts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
  let persistedConflicts: unknown[] = [];
  try {
    const buildingIds = [...new Set(floors.map((f) => f.buildingId))];
    const requestedNumbers = [...new Set(floors.map((f) => f.requestedNumber))];
    if (buildingIds.length > 0 && requestedNumbers.length > 0) {
      const { data, error: conflictError } = await getSupabase()
        .from("floors")
        .select("id,building_id,name,floor_number,display_order,archived_at,updated_at")
        .in("building_id", buildingIds)
        .in("floor_number", requestedNumbers);
      if (conflictError) throw conflictError;
      const payloadIds = new Set(floors.map((f) => f.id));
      persistedConflicts = (data ?? []).map((row) => ({
        id: row.id,
        buildingId: row.building_id,
        name: row.name,
        floorNumber: row.floor_number,
        archivedAt: row.archived_at,
        alsoInPayload: payloadIds.has(row.id),
      }));
    }
  } catch (diagnosticError) {
    persistedConflicts = [{ diagnosticQueryFailed: diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError) }];
  }
  console.error("[CampusStructure] save_campus_structure failed", {
    rpc: "save_campus_structure",
    args: ["p_campus_id", "p_payload"],
    campusId,
    error,
    floors,
    duplicatePayloadKeys,
    persistedConflicts,
  });
}

/**
 * B5 Phase 3.1.2 — pure TS mirror of the two-phase floor-number resolution
 * executed inside the `save_campus_structure` RPC (migration
 * 20260812120000_two_phase_floor_number_save.sql) BEFORE its single-statement
 * `INSERT ... ON CONFLICT (id) DO UPDATE`:
 *
 * 1. every existing row that will be rewritten in place (id + building match a
 *    payload row) OR that currently holds a (building_id, floor_number) a
 *    payload row claims (a stale live/archived blocker) is moved to a unique
 *    temporary negative number;
 * 2. the final payload numbers are then written with no intermediate
 *    `floors_building_number_uq` collision — a swap (A:1→2 while B still holds
 *    2, B→1) or a new floor taking a number held by an archived stale row can
 *    no longer abort the save.
 *
 * Exported so the write-order contract is regression-testable without a live
 * database; the SQL migration is the authoritative implementation.
 */
export interface FloorNumberRow { id: string; buildingId: string; number: number; }
export interface FloorNumberWritePlan {
  /** Existing rows to move to temporary numbers before the final write. */
  moves: Array<{ id: string; tempNumber: number }>;
  /** Final rows to upsert (the payload floors). */
  finals: FloorNumberRow[];
}
export function planFloorNumberWrites(payload: FloorNumberRow[], existing: FloorNumberRow[]): FloorNumberWritePlan {
  const claimed = new Map<string, string>(); // `${buildingId}|${number}` → payload id
  for (const f of payload) claimed.set(`${f.buildingId}|${f.number}`, f.id);
  const payloadIds = new Set(payload.map((f) => f.id));
  const moves: Array<{ id: string; tempNumber: number }> = [];
  const minByBuilding = new Map<string, number>();
  for (const row of existing) {
    minByBuilding.set(row.buildingId, Math.min(minByBuilding.get(row.buildingId) ?? 0, row.number));
  }
  const nextTempByBuilding = new Map<string, number>();
  [...existing]
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((row) => {
      const rewrittenInPlace = payload.some((f) => f.id === row.id && f.buildingId === row.buildingId);
      const claimedBy = claimed.get(`${row.buildingId}|${row.number}`);
      const staleBlocker = claimedBy !== undefined && claimedBy !== row.id && !payloadIds.has(row.id);
      if (rewrittenInPlace || staleBlocker) {
        const tempNumber = (nextTempByBuilding.get(row.buildingId) ?? (minByBuilding.get(row.buildingId) ?? 0)) - 1;
        nextTempByBuilding.set(row.buildingId, tempNumber);
        moves.push({ id: row.id, tempNumber });
      }
    });
  return { moves, finals: payload.map((f) => ({ ...f })) };
}

export interface NavigationEdgePairRow { id: string; campusId: string; fromNodeId: string; toNodeId: string; }
export function navigationEdgePairConflictIds(payload: NavigationEdgePairRow[], existing: NavigationEdgePairRow[], campusId: string): string[] {
  const payloadIds = new Set(payload.map((edge) => edge.id));
  const payloadPairs = new Set(payload.filter((edge) => edge.campusId === campusId).map((edge) => `${edge.fromNodeId}|${edge.toNodeId}`));
  return existing
    .filter((edge) =>
      edge.campusId === campusId &&
      !payloadIds.has(edge.id) &&
      payloadPairs.has(`${edge.fromNodeId}|${edge.toNodeId}`)
    )
    .map((edge) => edge.id);
}

export function directoryFromSnapshot(campusId: string, snapshot: Json): PublishedDirectoryEntry[] {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [];
  const root = snapshot as JsonObject;
  const payload = (root.structure && typeof root.structure === "object" && !Array.isArray(root.structure) ? root.structure : root) as JsonObject;
  const buildings = Array.isArray(payload.buildings) ? payload.buildings as JsonObject[] : [];
  const elements = Array.isArray(payload.map_elements) ? payload.map_elements as JsonObject[] : [];
  const result: PublishedDirectoryEntry[] = buildings.filter((b) => b.is_visible !== false).map((b) => ({
    id: String(b.id), campusId, kind: "building" as const, name: String(b.name), code: b.code ? String(b.code) : undefined,
    accessible: Boolean(b.is_accessible),
  }));
  elements.filter((e) => e.is_visible !== false && e.is_searchable !== false).forEach((e) => {
    const type = String(e.element_type ?? "custom");
    result.push({ id: String(e.id), campusId, buildingId: e.building_id ? String(e.building_id) : undefined,
      floorId: e.floor_id ? String(e.floor_id) : undefined, kind: ROOM_TYPES.has(type) ? "room" : type === "landmark" ? "destination" : "facility",
      name: String(e.name), code: e.code ? String(e.code) : undefined, accessible: Boolean(e.is_accessible) });
  });
  return result;
}
