import { getSupabase } from "../lib/supabase";
import { normalizeFloor } from "../lib/floorPlanNormalization";
import type { Database, Json, Tables, TablesInsert, TablesUpdate } from "../types/database.generated";
import type {
  AccessibilityFeature, AssemblyPoint, Campus, CampusBuilding, CampusDecorAsset,
  CampusMarker, CampusPath, CampusRoute, FloorPlan, FloorWall, NavigationEdge, NavigationNode,
} from "../components/map-builder/types";

export type BuildingRow = Tables<"buildings">;
export type FloorRow = Tables<"floors">;
export type MapElementRow = Tables<"map_elements">;
export type NavigationNodeRow = Tables<"navigation_nodes">;
export type NavigationEdgeRow = Tables<"navigation_edges">;

type JsonObject = Record<string, Json | undefined>;
type StructureKind =
  | "marker" | "campus_path" | "route" | "accessibility_feature" | "assembly_point" | "decor"
  | "room" | "floor_path" | "wall" | "door" | "window" | "furniture" | "stairs" | "ramp" | "elevator" | "label";

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
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata.ui as T | undefined) : undefined;
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
  return ({ outdoor: "waypoint", hallway: "waypoint", room_access: "destination", stair: "stairs", transition: "floor_transition" } as Record<string, string>)[value] ?? value;
}
function normalizedEdgeType(value: string): string {
  return new Set(["walkway", "hallway", "stairs", "elevator", "ramp", "door", "crossing", "transition"]).has(value) ? value : "walkway";
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
  const name = String(value.name ?? value.label ?? value.text ?? kind.replaceAll("_", " "));
  const roomType = kind === "room" ? normalizedElementType(String(value.type ?? "room")) : undefined;
  // Walls are endpoint-based (x1/y1/x2/y2). Their canonical anchor location is
  // the START point; the full segment geometry is retained in metadata.ui and
  // geometry.points. This avoids emitting null/NaN for the NOT NULL x/y columns.
  const anchorX = kind === "wall" ? value.x1 : value.x;
  const anchorY = kind === "wall" ? value.y1 : value.y;
  const rawRotation = value.rotation;
  const rotationValue = finiteNumber(rawRotation, kind, value.id, "rotation");
  const typeMap: Partial<Record<StructureKind, string>> = {
    marker: "landmark", route: "custom", campus_path: "custom", accessibility_feature: "custom",
    assembly_point: "assembly_area", decor: "custom", floor_path: "hallway", wall: "wall",
    door: value.isEmergencyExit ? "emergency_exit" : "door", window: "window", furniture: "furniture",
    stairs: "stairs", ramp: "ramp", elevator: "elevator", label: "custom",
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
    is_searchable: !["wall", "window", "furniture", "decor", "floor_path", "campus_path", "label"].includes(kind),
    is_visible: value.visible !== false,
  };
}

export function serializeCampusStructure(campus: Campus): CampusStructurePayload {
  const buildings: JsonObject[] = [];
  const floors: JsonObject[] = [];
  const map_elements: JsonObject[] = [];
  (campus.buildings ?? []).forEach((building, buildingOrder) => {
    const { floors: buildingFloors, ...buildingUi } = building;
    buildings.push({
      id: building.id, name: building.name, code: building.code, description: building.description,
      category: normalizedBuildingCategory(building.category),
      x: finiteNumber(building.x, "building", building.id, "x"),
      y: finiteNumber(building.y, "building", building.id, "y"),
      width: building.width, height: building.height,
      rotation: ((finiteNumber(building.rotation, "building", building.id, "rotation") % 360) + 360) % 360,
      is_searchable: true, is_visible: building.visible !== false,
      is_accessible: Boolean(building.accessibility?.wheelchairAccessible),
      metadata: { ...jsonUi(buildingUi), display_order: buildingOrder },
    });
    (buildingFloors ?? []).forEach((rawFloor, floorOrder) => {
      const floor = normalizeFloor(rawFloor, { buildingId: building.id, number: floorOrder + 1 });
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
  (campus.markers ?? []).forEach((v) => map_elements.push(element("marker", campus.id, v as unknown as Record<string, unknown>)));
  (campus.paths ?? []).forEach((v) => map_elements.push(element("campus_path", campus.id, v as unknown as Record<string, unknown>)));
  (campus.routes ?? []).forEach((v) => map_elements.push(element("route", campus.id, v as unknown as Record<string, unknown>)));
  (campus.accessibilityFeatures ?? []).forEach((v) => map_elements.push(element("accessibility_feature", campus.id, v as unknown as Record<string, unknown>, v.buildingId)));
  (campus.assemblyPoints ?? []).forEach((v) => map_elements.push(element("assembly_point", campus.id, v as unknown as Record<string, unknown>)));
  (campus.decorAssets ?? []).forEach((v) => map_elements.push(element("decor", campus.id, v as unknown as Record<string, unknown>)));
  return {
    buildings, floors, map_elements,
    navigation_nodes: (campus.navNodes ?? []).map((node) => ({
      id: node.id, building_id: node.buildingId, floor_id: node.floorId, node_type: normalizedNodeType(node.type),
      name: node.name,
      x: finiteNumber(node.x, "navigation_node", node.id, "x"),
      y: finiteNumber(node.y, "navigation_node", node.id, "y"),
      is_accessible: node.accessible, is_emergency_safe: true, is_active: true, metadata: jsonUi(node),
    })),
    navigation_edges: (campus.navEdges ?? []).map((edge) => ({
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
    const byKind = <T>(kind: StructureKind) => values.filter((item) => uiFrom<{ kind?: string }>(item.metadata)?.kind === kind || (item.metadata as JsonObject | null)?.kind === kind).map((item) => uiFrom<T>(item.metadata)).filter((v): v is T => Boolean(v));
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
  const buildings = [...rows.buildings].sort((a, b) => Number((a.metadata as JsonObject)?.display_order ?? 0) - Number((b.metadata as JsonObject)?.display_order ?? 0)).map((row) => ({
    ...(uiFrom<Partial<CampusBuilding>>(row.metadata) ?? {}), id: row.id, name: row.name, code: row.code,
    category: row.category, description: row.description ?? "", x: row.x, y: row.y, width: row.width,
    height: row.height, rotation: row.rotation, visible: row.is_visible, floors: floorsByBuilding.get(row.id) ?? [],
  })) as CampusBuilding[];
  const top = <T>(kind: StructureKind) => rows.mapElements.filter((item) => !item.floor_id && (item.metadata as JsonObject | null)?.kind === kind).map((item) => uiFrom<T>(item.metadata)).filter((v): v is T => Boolean(v));
  return { ...campus, buildings, markers: top<CampusMarker>("marker"), paths: top<CampusPath>("campus_path"),
    routes: top<CampusRoute>("route"), accessibilityFeatures: top<AccessibilityFeature>("accessibility_feature"),
    assemblyPoints: top<AssemblyPoint>("assembly_point"), decorAssets: top<CampusDecorAsset>("decor"),
    navNodes: rows.navigationNodes.map((row) => uiFrom<NavigationNode>(row.metadata)).filter((v): v is NavigationNode => Boolean(v)),
    navEdges: rows.navigationEdges.map((row) => uiFrom<NavigationEdge>(row.metadata)).filter((v): v is NavigationEdge => Boolean(v)) };
}

async function selectStructure(campusId: string): Promise<CampusStructureRows> {
  const db = getSupabase();
  const [buildings, floors, mapElements, navigationNodes, navigationEdges] = await Promise.all([
    db.from("buildings").select("*").eq("campus_id", campusId).is("archived_at", null),
    db.from("floors").select("*, buildings!inner(campus_id)").eq("buildings.campus_id", campusId).is("archived_at", null),
    db.from("map_elements").select("*").eq("campus_id", campusId).is("archived_at", null),
    db.from("navigation_nodes").select("*").eq("campus_id", campusId),
    db.from("navigation_edges").select("*").eq("campus_id", campusId),
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
    const { error } = await getSupabase().rpc("save_campus_structure", { p_campus_id: campus.id, p_payload: serializeCampusStructure(campus) as unknown as Json });
    if (error) throw new Error(`Campus structure was not saved: ${error.message}`);
    return this.load(campus);
  },
  async publishedDirectory(campusId?: string): Promise<PublishedDirectoryEntry[]> {
    let query = getSupabase().from("campus_versions").select("campus_id,snapshot").eq("state", "published");
    if (campusId) query = query.eq("campus_id", campusId);
    const { data, error } = await query; if (error) throw error;
    return (data ?? []).flatMap((version) => directoryFromSnapshot(version.campus_id, version.snapshot));
  },
};

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
