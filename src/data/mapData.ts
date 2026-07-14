import type { MapBuilding, MapLayer, MapMarker, MapPath, MapRoute, MapState } from "../types/map";

// ── SVG canvas dimensions used by the editor ─────────────────────────────────
export const CANVAS_W = 900;
export const CANVAS_H = 680;

// ── Layers ────────────────────────────────────────────────────────────────────
export const INITIAL_LAYERS: MapLayer[] = [
  { id: "bg",        name: "Background / Roads",  visible: true,  locked: true,  type: "background", order: 0 },
  { id: "buildings", name: "Campus Buildings",     visible: true,  locked: false, type: "buildings",  order: 1 },
  { id: "paths",     name: "Navigation Paths",     visible: true,  locked: false, type: "paths",      order: 2 },
  { id: "markers",   name: "Location Markers",     visible: true,  locked: false, type: "markers",    order: 3 },
];

// ── Buildings ─────────────────────────────────────────────────────────────────
export const INITIAL_BUILDINGS: MapBuilding[] = [
  { id: "mb1", name: "Main Academic Building",       code: "MAB", x: 155, y: 130, width: 125, height: 80,  color: "#1e40af", layer_id: "buildings", building_id: "b1", floors: 5 },
  { id: "mb2", name: "Administration Building",      code: "ADM", x: 395, y: 115, width: 105, height: 72,  color: "#1e3a8a", layer_id: "buildings", building_id: "b2", floors: 4 },
  { id: "mb3", name: "Library & Learning Resource",  code: "LRC", x: 545, y: 295, width: 115, height: 78,  color: "#1d4ed8", layer_id: "buildings", building_id: "b3", floors: 3 },
  { id: "mb4", name: "Engineering Laboratory Bldg",  code: "ELB", x: 165, y: 305, width: 105, height: 62,  color: "#1e40af", layer_id: "buildings", building_id: "b4", floors: 4 },
  { id: "mb5", name: "Gymnasium & Sports Complex",   code: "GYM", x: 305, y: 435, width: 145, height: 82,  color: "#2563eb", layer_id: "buildings", building_id: "b5", floors: 2 },
  { id: "mb6", name: "Student Services Center",      code: "SSC", x: 605, y: 415, width: 112, height: 72,  color: "#1d4ed8", layer_id: "buildings", building_id: "b6", floors: 3 },
];

// ── Markers ───────────────────────────────────────────────────────────────────
export const INITIAL_MARKERS: MapMarker[] = [
  { id: "mm1", name: "Main Gate",            type: "entrance",  x: 108, y: 285, layer_id: "markers", color: "#0e2a6e", latitude: 14.7115, longitude: 120.9655 },
  { id: "mm2", name: "East Gate",            type: "entrance",  x: 680, y: 285, layer_id: "markers", color: "#0e2a6e", latitude: 14.7114, longitude: 120.9670 },
  { id: "mm3", name: "Visitor Parking",      type: "parking",   x: 420, y: 125, layer_id: "markers", color: "#64748b" },
  { id: "mm4", name: "University Canteen",   type: "canteen",   x: 620, y: 440, layer_id: "markers", color: "#d97706" },
  { id: "mm5", name: "Health Services Clinic", type: "clinic",  x: 645, y: 390, layer_id: "markers", color: "#dc2626" },
  { id: "mm6", name: "BDO ATM",              type: "atm",       x: 548, y: 290, layer_id: "markers", color: "#16a34a" },
  { id: "mm7", name: "Flagpole Plaza",       type: "landmark",  x: 404, y: 285, layer_id: "markers", color: "#7c3aed" },
  { id: "mm8", name: "Student Parking Area", type: "parking",   x: 250, y: 490, layer_id: "markers", color: "#64748b" },
];

// ── Paths ─────────────────────────────────────────────────────────────────────
export const INITIAL_PATHS: MapPath[] = [
  {
    id: "pp1", name: "Main Horizontal Road", type: "road",
    points: [{ x: 0, y: 285 }, { x: 900, y: 285 }],
    color: "#cbd5e1", width: 24, layer_id: "paths",
  },
  {
    id: "pp2", name: "Main Vertical Road", type: "road",
    points: [{ x: 404, y: 0 }, { x: 404, y: 680 }],
    color: "#cbd5e1", width: 24, layer_id: "paths",
  },
  {
    id: "pp3", name: "East Side Road", type: "road",
    points: [{ x: 0, y: 462 }, { x: 900, y: 462 }],
    color: "#e2e8f0", width: 14, layer_id: "paths",
  },
  {
    id: "pp4", name: "West Side Road", type: "road",
    points: [{ x: 114, y: 0 }, { x: 114, y: 680 }],
    color: "#e2e8f0", width: 14, layer_id: "paths",
  },
  {
    id: "pp5", name: "Library Footpath", type: "footpath",
    points: [{ x: 404, y: 285 }, { x: 545, y: 285 }, { x: 600, y: 340 }],
    color: "#94a3b8", width: 4, layer_id: "paths",
  },
];

// ── Routes ────────────────────────────────────────────────────────────────────
export const INITIAL_ROUTES: MapRoute[] = [
  {
    id: "r1",
    name: "Main Gate → Library",
    description: "Standard route from the main entrance to the Library & LRC",
    from_marker_id: "mm1",
    to_marker_id: "mm6",
    waypoints: [{ x: 108, y: 285 }, { x: 404, y: 285 }, { x: 545, y: 285 }, { x: 600, y: 340 }],
    distance_m: 320,
    duration_min: 4,
    type: "walking",
    is_active: true,
    created_at: "2025-01-10T08:00:00Z",
  },
  {
    id: "r2",
    name: "Main Gate → Admin Building",
    description: "Direct route from main gate to the Administration Building",
    from_marker_id: "mm1",
    to_marker_id: "mm3",
    waypoints: [{ x: 108, y: 285 }, { x: 404, y: 285 }, { x: 404, y: 115 }, { x: 420, y: 125 }],
    distance_m: 280,
    duration_min: 3,
    type: "walking",
    is_active: true,
    created_at: "2025-01-10T09:00:00Z",
  },
  {
    id: "r3",
    name: "East Gate → Gymnasium",
    from_marker_id: "mm2",
    to_marker_id: "mm8",
    waypoints: [{ x: 680, y: 285 }, { x: 404, y: 285 }, { x: 404, y: 462 }, { x: 305, y: 462 }],
    distance_m: 410,
    duration_min: 5,
    type: "walking",
    is_active: true,
    created_at: "2025-01-11T10:00:00Z",
  },
  {
    id: "r4",
    name: "Accessible Route: Gate → SSC",
    description: "Wheelchair-accessible route from main gate to Student Services Center",
    from_marker_id: "mm1",
    to_marker_id: "mm4",
    waypoints: [{ x: 108, y: 285 }, { x: 404, y: 285 }, { x: 680, y: 285 }, { x: 680, y: 430 }, { x: 660, y: 440 }],
    distance_m: 480,
    duration_min: 8,
    type: "accessible",
    is_active: true,
    created_at: "2025-01-12T11:00:00Z",
  },
];

// ── Full initial map state ─────────────────────────────────────────────────────
export const INITIAL_MAP_STATE: MapState = {
  id: "plv-campus-map-v1",
  name: "PLV Main Campus Map",
  center_lat: 14.7116,
  center_lng: 120.9660,
  default_zoom: 17,
  layers:    INITIAL_LAYERS,
  buildings: INITIAL_BUILDINGS,
  markers:   INITIAL_MARKERS,
  paths:     INITIAL_PATHS,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: new Date().toISOString(),
};

// ── Marker visual config ──────────────────────────────────────────────────────
export const MARKER_STYLES: Record<string, { color: string; symbol: string; label: string }> = {
  entrance:  { color: "#0e2a6e", symbol: "E", label: "Entrance/Gate" },
  parking:   { color: "#64748b", symbol: "P", label: "Parking Area" },
  landmark:  { color: "#7c3aed", symbol: "★", label: "Landmark" },
  restroom:  { color: "#0891b2", symbol: "R", label: "Restroom" },
  canteen:   { color: "#d97706", symbol: "C", label: "Canteen/Food" },
  atm:       { color: "#16a34a", symbol: "$", label: "ATM / Bank" },
  clinic:    { color: "#dc2626", symbol: "+", label: "Clinic/Medical" },
  building:  { color: "#1e40af", symbol: "B", label: "Building" },
  custom:    { color: "#c8960c", symbol: "●", label: "Custom Point" },
};
