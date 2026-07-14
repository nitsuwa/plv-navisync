// ── Map entity types ──────────────────────────────────────────────────────────

export type MarkerType = "entrance" | "parking" | "landmark" | "restroom" | "canteen" | "atm" | "clinic" | "building" | "custom";
export type PathType   = "footpath" | "road" | "route" | "emergency";
export type LayerType  = "buildings" | "markers" | "paths" | "background" | "custom";

export interface MapMarker {
  id: string;
  name: string;
  type: MarkerType;
  x: number;
  y: number;
  description?: string;
  building_id?: string;
  layer_id: string;
  color?: string;
  /** Supabase-ready real-world coordinates */
  latitude?: number;
  longitude?: number;
}

export interface MapBuilding {
  id: string;
  name: string;
  code: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  layer_id: string;
  /** FK to buildings table */
  building_id?: string;
  floors?: number;
}

export interface MapPath {
  id: string;
  name: string;
  points: { x: number; y: number }[];
  type: PathType;
  color: string;
  width: number;
  layer_id: string;
  from_marker_id?: string;
  to_marker_id?: string;
  distance_m?: number;
}

export interface MapLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  type: LayerType;
  order: number;
}

export interface MapRoute {
  id: string;
  name: string;
  description?: string;
  from_marker_id: string;
  to_marker_id: string;
  waypoints: { x: number; y: number }[];
  distance_m: number;
  duration_min: number;
  type: "walking" | "accessible" | "emergency";
  is_active: boolean;
  created_at: string;
}

/** Full exportable map state — mirrors the Supabase schema */
export interface MapState {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  default_zoom: number;
  layers: MapLayer[];
  buildings: MapBuilding[];
  markers: MapMarker[];
  paths: MapPath[];
  created_at: string;
  updated_at: string;
}

/** Selection union */
export type MapSelection =
  | { type: "building"; id: string }
  | { type: "marker";   id: string }
  | { type: "path";     id: string }
  | null;

export type MapTool = "select" | "marker" | "building" | "path" | "pan" | "delete";
