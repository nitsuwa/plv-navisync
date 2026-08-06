import {
  MousePointer2, MapPin, Square, GitBranch, Trash2, Map,
  Navigation, Accessibility, Flame, Star, Hand, DoorOpen,
  MoveVertical, SeparatorHorizontal, Binary, Text, Ruler, Sofa,
  Container, Table, Monitor, Lamp, BookOpen,
  PanelRightOpen,
} from "lucide-react";
import type {
  SimpleTool, EditorLayer, RoomTypeDescriptor, CanvasSizeOption,
  Campus, CampusBuilding, FloorPlan, FurnitureCategory,
} from "./types";
import { INITIAL_MARKERS, INITIAL_PATHS, MARKER_STYLES } from "../../data/mapData";

// ── ID generator ────────────────────────────────────────────────────────────

export function genId(p = "x") {
  // Database authoring entities use UUID primary keys. The prefix remains in
  // the signature for backwards-compatible call sites and human intent only.
  void p;
  return crypto.randomUUID();
}

// ── Canvas size options ─────────────────────────────────────────────────────

export const CANVAS_SIZES: CanvasSizeOption[] = [
  { id: "small",  label: "Small",  w: 600,  h: 450,  desc: "Good for a single building or compact campus. Up to ~5 buildings." },
  { id: "medium", label: "Medium", w: 900,  h: 680,  desc: "Ideal for most campuses. Up to ~12 buildings." },
  { id: "large",  label: "Large",  w: 1200, h: 900,  desc: "Large campuses with many buildings. Up to ~20 buildings." },
  { id: "custom", label: "Custom", w: 0,    h: 0,    desc: "Enter custom dimensions" },
];

export const CANVAS_SIZE_RECOMMENDED = "medium";

export const GRID_PRESETS = [
  { size: 10,  label: "Fine",   desc: "Precise placement" },
  { size: 20,  label: "Normal", desc: "Balanced spacing" },
  { size: 40,  label: "Wide",   desc: "Loose alignment" },
  { size: 80,  label: "Large",  desc: "Coarse grid" },
];

// ── Building categories ─────────────────────────────────────────────────────

export const BUILDING_CATEGORIES = [
  "Academic", "Administrative", "Library", "Laboratory", "Sports",
  "Dormitory", "Medical", "Canteen", "Security", "Other",
];

// ── Room types (visual palette) ─────────────────────────────────────────────

export const ROOM_TYPES: RoomTypeDescriptor[] = [
  { type: "classroom",  label: "Classroom",     fill: "#dbeafe", stroke: "#93c5fd", text: "#1e40af" },
  { type: "lab",        label: "Laboratory",    fill: "#fef9c3", stroke: "#fde047", text: "#854d0e" },
  { type: "office",     label: "Office",        fill: "#dcfce7", stroke: "#86efac", text: "#14532d" },
  { type: "restroom",   label: "Restroom",      fill: "#f0f9ff", stroke: "#7dd3fc", text: "#0c4a6e" },
  { type: "elevator",   label: "Elevator",      fill: "#f0fdf4", stroke: "#86efac", text: "#14532d" },
  { type: "stairs",     label: "Staircase",     fill: "#f3f4f6", stroke: "#9ca3af", text: "#374151" },
  { type: "hallway",    label: "Hallway",       fill: "#f8fafc", stroke: "#cbd5e1", text: "#64748b" },
  { type: "lobby",      label: "Lobby",         fill: "#fef6ee", stroke: "#fdba74", text: "#7c2d12" },
  { type: "emergency",  label: "Emergency Exit",fill: "#fee2e2", stroke: "#fca5a5", text: "#991b1b" },
  { type: "storage",    label: "Storage",       fill: "#fdf4ff", stroke: "#d8b4fe", text: "#6b21a8" },
];

export const ROOM_MAP = Object.fromEntries(ROOM_TYPES.map((r) => [r.type, r]));

// ── Path colors ─────────────────────────────────────────────────────────────

export const PATH_COLORS: Record<string, string> = {
  footpath: "#94a3b8",
  road: "#cbd5e1",
  route: "#0e2a6e",
  emergency: "#dc2626",
};

// ── Canvas tools (campus editor) ────────────────────────────────────────────

export interface ToolDescriptor {
  id: SimpleTool;
  icon: React.ElementType;
  label: string;
  hint: string;
  key: string;
}

export const TOOLS: ToolDescriptor[] = [
  { id: "select",   icon: MousePointer2, label: "Select",   hint: "Click to select · Drag empty space to pan · Shift+click to multi-select",                    key: "V" },
  { id: "pan",      icon: Hand,          label: "Pan",      hint: "Hold Space + drag to pan the canvas freely",                                               key: "Space" },
  { id: "marker",   icon: MapPin,        label: "Marker",   hint: "Click to place a location marker",                              key: "M" },
  { id: "building", icon: Square,        label: "Building", hint: "Click & drag on the canvas to draw a building",                 key: "B" },
  { id: "path",     icon: GitBranch,     label: "Path",     hint: "Click waypoints · Double-click to finish · Esc to cancel",      key: "P" },
  { id: "erase",    icon: Trash2,        label: "Erase",    hint: "Click any item to remove it",                                   key: "E" },
];

// ── Contextual tool palette per layer ────────────────────────────────────────

export interface LayerToolDescriptor {
  id: string;
  icon: React.ElementType;
  label: string;
  hint: string;
  key: string;
}

export const LAYER_TOOLS: Record<string, LayerToolDescriptor[]> = {
  campus: [
    { id: "select",   icon: MousePointer2, label: "Select",   hint: "Click a building to edit its name, floors, and properties in the right panel. Drag to move. Shift+click to select multiple.", key: "V" },
    { id: "pan",      icon: Hand,          label: "Pan",      hint: "Hold Space + drag, or middle-click + drag, to move around the canvas freely", key: "Space" },
    { id: "marker",   icon: MapPin,        label: "Marker",   hint: "Click to place a point of interest (cafeteria, entrance, info booth) on the campus map", key: "M" },
    { id: "building", icon: Square,        label: "Add Building", hint: "Click & drag on the canvas to draw a building footprint. Give it a name and floors in the Properties panel on the right.", key: "B" },
    { id: "path",     icon: GitBranch,     label: "Walkway",  hint: "Click points to draw outdoor walkways between buildings. Double-click to finish, Esc to cancel.", key: "P" },
    { id: "erase",    icon: Trash2,        label: "Erase",    hint: "Click any building, marker, or path to remove it from the campus", key: "E" },
  ],
  navigation: [
    { id: "select",   icon: MousePointer2, label: "Select",   hint: "Click a navigation waypoint (green dot) or connection line to edit its properties", key: "V" },
    { id: "pan",      icon: Hand,          label: "Pan",      hint: "Hold Space + drag to pan around the canvas", key: "Space" },
    { id: "marker",   icon: MapPin,        label: "Add Waypoint", hint: "Click to place a navigation waypoint (a point in the walking network). Add several, then connect them with the Connect tool.", key: "W" },
    { id: "path",     icon: GitBranch,     label: "Connect",  hint: "Click one waypoint, then click a second waypoint to create a walkable connection between them. Repeat to build the walking network.", key: "P" },
    { id: "erase",    icon: Trash2,        label: "Remove",   hint: "Click a waypoint or connection to remove it from the navigation network. Deleting a waypoint removes all its connections.", key: "E" },
  ],
  accessibility: [
    { id: "select",   icon: MousePointer2, label: "Select",   hint: "Click a path, entrance, or elevator to mark it as accessible or inaccessible", key: "V" },
    { id: "pan",      icon: Hand,          label: "Pan",      hint: "Hold Space + drag to pan around the canvas", key: "Space" },
    { id: "marker",   icon: MapPin,        label: "Add Ramp", hint: "Click to place a wheelchair ramp marker. Students using accessible routing will prefer paths near ramps.", key: "R" },
    { id: "room",     icon: Square,        label: "Add Elevator", hint: "Click to place an elevator marker. Elevators are accessible by default and connect upper floors.", key: "L" },
    { id: "erase",    icon: Trash2,        label: "Remove",   hint: "Click a marker or accessibility feature to remove it", key: "X" },
  ],
  emergency: [
    { id: "select",   icon: MousePointer2, label: "Select",   hint: "Click an exit, path, or assembly point to edit its emergency properties", key: "V" },
    { id: "pan",      icon: Hand,          label: "Pan",      hint: "Hold Space + drag to pan around the canvas", key: "Space" },
    { id: "marker",   icon: MapPin,        label: "Add Exit", hint: "Click to mark an emergency exit location. Students will be routed toward exits during evacuations.", key: "X" },
    { id: "building", icon: Square,        label: "Assembly Area", hint: "Click & drag to draw an outdoor assembly/evacuation gathering point on the map", key: "A" },
    { id: "erase",    icon: Trash2,        label: "Remove",   hint: "Click an emergency item to remove it", key: "E" },
  ],
  events: [
    { id: "select",   icon: MousePointer2, label: "Select",    hint: "Click an event marker to edit its name, date, and location", key: "V" },
    { id: "pan",      icon: Hand,          label: "Pan",       hint: "Hold Space + drag to pan around the canvas", key: "Space" },
    { id: "marker",   icon: MapPin,        label: "Add Event", hint: "Click to place an event pin on the map, then assign it to a building or room in the Properties panel", key: "P" },
    { id: "building", icon: Square,        label: "Restrict Area", hint: "Click & drag to draw an area that should be restricted during the event", key: "R" },
    { id: "erase",    icon: Trash2,        label: "Remove",    hint: "Click an event marker or restricted area to remove it", key: "E" },
  ],
};

// ── Floor editor structure tools ────────────────────────────────────────────

export const FLOOR_STRUCTURE_TOOLS: { id: SimpleTool; icon: React.ElementType; label: string; key: string }[] = [
  { id: "select",   icon: MousePointer2, label: "Select",   key: "V" },
  { id: "pan",      icon: Hand,          label: "Pan",      key: "Space" },
  { id: "wall",     icon: SeparatorHorizontal, label: "Wall",     key: "W" },
  { id: "room",     icon: Square,               label: "Room",     key: "R" },
  { id: "door",     icon: DoorOpen,             label: "Door",     key: "D" },
  { id: "window",   icon: PanelRightOpen,       label: "Window",   key: "I" },
  { id: "stairs",   icon: MoveVertical,           label: "Stairs",   key: "S" },
  { id: "elevator", icon: Binary,               label: "Elevator", key: "L" },
  { id: "text",     icon: Text,                 label: "Label",    key: "T" },
  { id: "measure",  icon: Ruler,                label: "Measure",  key: "M" },
  { id: "path",     icon: GitBranch,            label: "Path",     key: "P" },
  { id: "erase",    icon: Trash2,               label: "Erase",    key: "E" },
];

// ── Floor editor interior tools ─────────────────────────────────────────────

export const FLOOR_INTERIOR_TOOLS: { id: SimpleTool; icon: React.ElementType; label: string; key: string }[] = [
  { id: "select",    icon: MousePointer2, label: "Select",    key: "V" },
  { id: "pan",       icon: Hand,          label: "Pan",       key: "Space" },
  { id: "furniture", icon: Sofa,          label: "Furniture", key: "F" },
  { id: "room",      icon: Square,        label: "Room",      key: "R" },
  { id: "text",      icon: Text,          label: "Label",     key: "T" },
  { id: "measure",   icon: Ruler,         label: "Measure",   key: "M" },
  { id: "erase",     icon: Trash2,        label: "Erase",     key: "E" },
];

// ── Indoor layer definitions ────────────────────────────────────────────────

export const INDOOR_LAYERS = [
  { id: "walls",       label: "Walls",       color: "#64748b" },
  { id: "rooms",       label: "Rooms",       color: "#3b82f6" },
  { id: "doors",       label: "Doors",       color: "#f59e0b" },
  { id: "windows",     label: "Windows",     color: "#06b6d4" },
  { id: "furniture",   label: "Furniture",   color: "#8b5cf6" },
  { id: "labels",      label: "Labels",      color: "#10b981" },
  { id: "utilities",   label: "Utilities",   color: "#ef4444" },
];

// ── Furniture categories ────────────────────────────────────────────────────

export const FURNITURE_CATEGORIES: FurnitureCategory[] = [
  {
    id: "seating",
    label: "Seating",
    icon: "Armchair",
    items: [
      { type: "student-chair",   name: "Student Chair",    width: 12, height: 12, color: "#2563eb" },
      { type: "armchair",        name: "Armchair",         width: 18, height: 16, color: "#7c3aed" },
      { type: "sofa",            name: "Sofa",             width: 30, height: 14, color: "#db2777" },
      { type: "bench",           name: "Bench",            width: 28, height: 10, color: "#ca8a04" },
      { type: "stool",           name: "Stool",            width: 8,  height: 8,  color: "#d97706" },
    ],
  },
  {
    id: "tables",
    label: "Tables",
    icon: "Table",
    items: [
      { type: "desk",             name: "Desk",              width: 24, height: 14, color: "#1e40af" },
      { type: "student-desk",     name: "Student Desk",      width: 18, height: 12, color: "#3b82f6" },
      { type: "conference-table", name: "Conference Table",  width: 40, height: 20, color: "#6366f1" },
      { type: "lab-table",        name: "Lab Table",         width: 26, height: 16, color: "#a855f7" },
      { type: "round-table",      name: "Round Table",       width: 20, height: 20, color: "#eab308" },
      { type: "reception-desk",   name: "Reception Desk",    width: 22, height: 14, color: "#f97316" },
    ],
  },
  {
    id: "storage",
    label: "Storage",
    icon: "Container",
    items: [
      { type: "bookshelf",       name: "Bookshelf",       width: 14, height: 8,  color: "#92400e" },
      { type: "cabinet",         name: "Cabinet",         width: 16, height: 10, color: "#78716c" },
      { type: "filing-cabinet",  name: "Filing Cabinet",  width: 10, height: 14, color: "#a8a29e" },
      { type: "locker",          name: "Locker",          width: 6,  height: 10, color: "#64748b" },
    ],
  },
  {
    id: "electronics",
    label: "Electronics",
    icon: "Monitor",
    items: [
      { type: "computer",         name: "Computer",        width: 8,  height: 6,  color: "#475569" },
      { type: "monitor",          name: "Monitor",         width: 10, height: 6,  color: "#334155" },
      { type: "printer",          name: "Printer",         width: 10, height: 8,  color: "#64748b" },
      { type: "projector",        name: "Projector",       width: 14, height: 8,  color: "#94a3b8" },
      { type: "tv-screen",        name: "TV/Screen",       width: 20, height: 4,  color: "#0f172a" },
    ],
  },
  {
    id: "lab",
    label: "Lab Equipment",
    icon: "Flask",
    items: [
      { type: "microscope",       name: "Microscope",      width: 6,  height: 6,  color: "#a855f7" },
      { type: "sink",             name: "Sink",            width: 12, height: 8,  color: "#94a3b8" },
      { type: "fume-hood",        name: "Fume Hood",       width: 20, height: 10, color: "#d4d4d8" },
      { type: "centrifuge",       name: "Centrifuge",      width: 10, height: 8,  color: "#e4e4e7" },
    ],
  },
  {
    id: "decor",
    label: "Decor & Plants",
    icon: "Lamp",
    items: [
      { type: "plant",            name: "Plant Pot",       width: 8,  height: 8,  color: "#22c55e" },
      { type: "trash-bin",        name: "Trash Bin",       width: 6,  height: 6,  color: "#78716c" },
      { type: "water-cooler",     name: "Water Cooler",    width: 8,  height: 8,  color: "#3b82f6" },
      { type: "whiteboard",       name: "Whiteboard",      width: 24, height: 4,  color: "#f8fafc" },
      { type: "bulletin-board",   name: "Bulletin Board",  width: 20, height: 6,  color: "#fef08a" },
    ],
  },
];

// ── Wall material colors ────────────────────────────────────────────────────

export const WALL_COLORS: Record<string, string> = {
  concrete: "#94a3b8",
  brick: "#b91c1c",
  wood: "#92400e",
  glass: "#7dd3fc",
  drywall: "#e2e8f0",
};

// ── Default wall thickness options ──────────────────────────────────────────

export const WALL_THICKNESSES = [
  { label: "Thin (2px)",  value: 2 },
  { label: "Standard (4px)", value: 4 },
  { label: "Thick (6px)", value: 6 },
  { label: "Very Thick (8px)", value: 8 },
];


// ── Layer definitions ───────────────────────────────────────────────────────

export interface LayerDescriptor {
  id: EditorLayer;
  icon: React.ElementType;
  label: string;
  color: string;
  accent: string;
  hint: string;
}

export const LAYERS: LayerDescriptor[] = [
  { id: "campus",        icon: Map,          label: "1. Campus",       color: "var(--primary)",     accent: "color-mix(in srgb,var(--primary) 12%,transparent)",      hint: "Start here: add buildings, give them floors, and draw outdoor walkways" },
  { id: "navigation",    icon: Navigation,   label: "2. Navigation",   color: "#16a34a",             accent: "color-mix(in srgb,#16a34a 12%,transparent)",              hint: "Add waypoints (nav nodes) and connect them into a walking network" },
  { id: "accessibility", icon: Accessibility,label: "3. Accessibility",color: "#2563eb",             accent: "color-mix(in srgb,#2563eb 12%,transparent)",              hint: "Mark which paths, entrances, and elevators are wheelchair-accessible" },
  { id: "emergency",     icon: Flame,        label: "4. Emergency",    color: "#dc2626",             accent: "color-mix(in srgb,#dc2626 12%,transparent)",              hint: "Place emergency exits and outdoor assembly points for evacuations" },
  { id: "events",        icon: Star,         label: "5. Events",       color: "#d97706",             accent: "color-mix(in srgb,#d97706 12%,transparent)",              hint: "Add event pins and link them to existing campus locations" },
];

// ── Building color palette ──────────────────────────────────────────────────

export const BUILDING_COLORS = [
  "#1e40af", "#1e3a8a", "#1d4ed8", "#2563eb", "#3b82f6", "#0e2a6e",
];

// ── Building type palette (prebuilt building types for placement) ──────────

import type { BuildingTypeDescriptor, DecorAssetType } from "./types";

export const BUILDING_TYPES: BuildingTypeDescriptor[] = [
  { id: "academic",      label: "Academic",       category: "Academic",      color: "#1e40af", icon: "BookOpen",   defaultWidth: 140, defaultHeight: 90,  description: "Lecture halls, classrooms, and faculty offices" },
  { id: "laboratory",    label: "Laboratory",     category: "Laboratory",    color: "#7c3aed", icon: "Flask",       defaultWidth: 120, defaultHeight: 80,  description: "Science labs, research facilities, and workshops" },
  { id: "library",       label: "Library",        category: "Library",       color: "#0891b2", icon: "Library",     defaultWidth: 130, defaultHeight: 85,  description: "Reading rooms, media sections, and study areas" },
  { id: "gym",           label: "Gymnasium",      category: "Sports",        color: "#059669", icon: "Dumbbell",    defaultWidth: 160, defaultHeight: 100, description: "Sports complex, gym, and athletic facilities" },
  { id: "dormitory",     label: "Dormitory",      category: "Dormitory",     color: "#d97706", icon: "Home",        defaultWidth: 110, defaultHeight: 80,  description: "Student housing and residential buildings" },
  { id: "admin",         label: "Administration",  category: "Administrative",color: "#1e3a8a", icon: "Building2",   defaultWidth: 110, defaultHeight: 75,  description: "Admin offices, registrar, and services" },
  { id: "canteen",       label: "Canteen",        category: "Canteen",       color: "#ea580c", icon: "UtensilsCrossed", defaultWidth: 100, defaultHeight: 70,  description: "Cafeteria, food court, and dining areas" },
  { id: "medical",       label: "Medical",        category: "Medical",       color: "#dc2626", icon: "HeartPulse",  defaultWidth: 90,  defaultHeight: 70,  description: "Clinic, infirmary, and health services" },
  { id: "security",      label: "Security",       category: "Security",      color: "#475569", icon: "Shield",      defaultWidth: 70,  defaultHeight: 55,  description: "Guard house, security office, and checkpoint" },
  { id: "other",         label: "Other",          category: "Other",         color: "#64748b", icon: "Box",         defaultWidth: 100, defaultHeight: 70,  description: "Miscellaneous buildings and structures" },
];

export const BUILDING_TYPE_MAP = Object.fromEntries(BUILDING_TYPES.map((t) => [t.id, t]));

// ── Decorative asset palette (visual-only outdoor objects) ─────────────────

export interface DecorAssetDescriptor {
  type: DecorAssetType;
  label: string;
  category: string;
  color: string;
  /** SVG path data for rendering on canvas */
  svgPath: string;
  /** Default width in canvas units */
  defaultWidth: number;
  /** Default height in canvas units */
  defaultHeight: number;
}

export const DECOR_ASSET_TYPES: DecorAssetDescriptor[] = [
  // Greenery
  { type: "tree",          label: "Tree",           category: "Greenery",    color: "#22c55e", svgPath: "M16 4 Q20 0 24 4 Q28 8 24 14 L20 20 L16 14 Q12 8 16 4Z", defaultWidth: 24, defaultHeight: 28 },
  { type: "tree-large",    label: "Large Tree",     category: "Greenery",    color: "#16a34a", svgPath: "M12 4 Q18 -2 24 4 Q30 10 24 20 L20 30 L16 20 Q10 10 12 4Z", defaultWidth: 32, defaultHeight: 36 },
  { type: "palm",          label: "Palm Tree",      category: "Greenery",    color: "#15803d", svgPath: "M16 6 Q12 0 8 4 M16 6 Q20 0 24 4 M14 8 L16 30 L18 8", defaultWidth: 28, defaultHeight: 34 },
  { type: "bush",          label: "Bush",           category: "Greenery",    color: "#4ade80", svgPath: "M4 16 Q4 8 12 8 Q20 8 20 16 Q20 20 12 20 Q4 20 4 16Z", defaultWidth: 24, defaultHeight: 20 },
  { type: "plant",         label: "Plant Pot",      category: "Greenery",    color: "#22c55e", svgPath: "M10 8 L8 18 L20 18 L18 8Z M12 4 Q16 2 16 8 L12 8Z", defaultWidth: 18, defaultHeight: 22 },
  { type: "flower",        label: "Flower Bed",     category: "Greenery",    color: "#f472b6", svgPath: "M8 16 Q4 12 8 8 Q12 4 16 8 Q20 12 16 16 Q12 20 8 16Z", defaultWidth: 20, defaultHeight: 20 },
  // Seating
  { type: "bench",         label: "Bench",          category: "Seating",     color: "#a16207", svgPath: "M2 10 L22 10 L22 14 L2 14Z M4 14 L4 18 M18 14 L18 18", defaultWidth: 24, defaultHeight: 18 },
  { type: "bench-long",    label: "Long Bench",     category: "Seating",     color: "#92400e", svgPath: "M2 10 L34 10 L34 14 L2 14Z M4 14 L4 18 M30 14 L30 18", defaultWidth: 36, defaultHeight: 18 },
  { type: "picnic-table",  label: "Picnic Table",   category: "Seating",     color: "#78350f", svgPath: "M4 6 L28 6 L28 10 L4 10Z M6 10 L6 18 M26 10 L26 18 M4 18 L28 18", defaultWidth: 32, defaultHeight: 22 },
  // Wayfinding
  { type: "sign",          label: "Sign Post",      category: "Wayfinding",  color: "#2563eb", svgPath: "M14 4 L14 28 M6 4 L22 4 L22 12 L6 12Z", defaultWidth: 24, defaultHeight: 30 },
  { type: "flag",          label: "Flag",           category: "Wayfinding",  color: "#dc2626", svgPath: "M8 4 L8 28 M8 4 L24 8 L8 12", defaultWidth: 26, defaultHeight: 30 },
  // Utilities
  { type: "trash-bin",     label: "Trash Bin",      category: "Utilities",   color: "#78716c", svgPath: "M6 8 L6 22 L22 22 L22 8 M4 8 L24 8 M10 4 L18 4 L18 8 L10 8Z", defaultWidth: 24, defaultHeight: 26 },
  { type: "recycle-bin",   label: "Recycle Bin",    category: "Utilities",   color: "#16a34a", svgPath: "M6 8 L6 22 L22 22 L22 8 M4 8 L24 8 M12 12 L16 18 M16 12 L12 18", defaultWidth: 24, defaultHeight: 26 },
  { type: "lamp-post",     label: "Lamp Post",      category: "Utilities",   color: "#eab308", svgPath: "M14 4 L14 28 M10 4 Q14 0 18 4 M12 8 L16 8", defaultWidth: 20, defaultHeight: 30 },
  { type: "bollard",       label: "Bollard",        category: "Utilities",   color: "#94a3b8", svgPath: "M10 12 L10 24 L18 24 L18 12 Q14 8 10 12Z", defaultWidth: 16, defaultHeight: 26 },
  // Facilities
  { type: "bike-rack",     label: "Bike Rack",      category: "Facilities",  color: "#64748b", svgPath: "M4 10 L4 22 M10 10 L10 22 M16 10 L16 22 M22 10 L22 22 M4 10 L22 10", defaultWidth: 26, defaultHeight: 24 },
  { type: "fountain",      label: "Fountain",       category: "Facilities",  color: "#38bdf8", svgPath: "M4 20 L24 20 L24 26 L4 26Z M10 20 L10 12 M18 20 L18 12 M14 8 Q14 4 14 8", defaultWidth: 28, defaultHeight: 28 },
  { type: "gazebo",        label: "Gazebo",         category: "Facilities",  color: "#92400e", svgPath: "M4 14 L24 14 L24 24 L4 24Z M6 14 L6 24 M22 14 L22 24 M4 14 L14 4 L24 14", defaultWidth: 30, defaultHeight: 28 },
];

export const DECOR_ASSET_MAP = Object.fromEntries(DECOR_ASSET_TYPES.map((a) => [a.type, a]));

// ── Decor categories for the panel ────────────────────────────────────────

export const DECOR_CATEGORIES = [
  { id: "greenery",   label: "Greenery",  types: ["tree", "tree-large", "palm", "bush", "plant", "flower"] },
  { id: "seating",    label: "Seating",   types: ["bench", "bench-long", "picnic-table"] },
  { id: "wayfinding", label: "Wayfinding", types: ["sign", "flag"] },
  { id: "utilities",  label: "Utilities", types: ["trash-bin", "recycle-bin", "lamp-post", "bollard"] },
  { id: "facilities", label: "Facilities", types: ["bike-rack", "fountain", "gazebo"] },
];

// ── Rotated bounding box helper ─────────────────────────────────────────────
// Compute the axis-aligned bounding box (AABB) of a potentially rotated rectangle.
// This is used for overlap detection so rotated buildings don't use stale AABBs.
/** @returns {{ x: number, y: number, width: number, height: number }} */
export function getRotatedAABB(
  x: number, y: number, w: number, h: number, rotationDeg: number
): { x: number; y: number; width: number; height: number } {
  const rot = rotationDeg ?? 0;
  if (rot === 0) return { x, y, width: w, height: h };

  const cx = x + w / 2;
  const cy = y + h / 2;
  const cos = Math.cos(rot * (Math.PI / 180));
  const sin = Math.sin(rot * (Math.PI / 180));

  // Four corners relative to center
  const corners = [
    { dx: -w / 2, dy: -h / 2 },
    { dx: w / 2,  dy: -h / 2 },
    { dx: w / 2,  dy: h / 2 },
    { dx: -w / 2, dy: h / 2 },
  ];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of corners) {
    const rx = c.dx * cos - c.dy * sin + cx;
    const ry = c.dx * sin + c.dy * cos + cy;
    if (rx < minX) minX = rx;
    if (ry < minY) minY = ry;
    if (rx > maxX) maxX = rx;
    if (ry > maxY) maxY = ry;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export const DEFAULT_FEATURES = {
  indoorNavigation: true,
  accessibilityNavigation: true,
  emergencyRoutes: true,
  issueReporting: true,
};

// ── Avatar gradients ────────────────────────────────────────────────────────

export const AVATAR_GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-green-600",
  "from-amber-500 to-orange-600",
  "from-purple-500 to-violet-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-sky-600",
];


// ── Theme color palette ─────────────────────────────────────────────────────

export const THEME_COLORS = [
  { name: "Navy",       value: "#1e3a5f" },
  { name: "Royal Blue", value: "#1e40af" },
  { name: "Emerald",    value: "#059669" },
  { name: "Crimson",    value: "#dc2626" },
  { name: "Purple",     value: "#7c3aed" },
  { name: "Orange",     value: "#ea580c" },
  { name: "Teal",       value: "#0d9488" },
  { name: "Rose",       value: "#e11d48" },
];

// ── SEED DATA: PLV Main Campus ──────────────────────────────────────────────

export const SEED_CAMPUSES: Campus[] = [
  {
    id: "campus_plv",
    name: "PLV Main Campus",
    code: "PLV-MAIN",
    description: "Main campus of Pamantasan ng Lungsod ng Valenzuela, featuring academic buildings, library, gymnasium, and student services.",
    address: "Tongco Street, Karuhatan",
    city: "Valenzuela",
    province: "Metro Manila",
    postalCode: "1442",
    coordinates: { lat: 14.7062, lng: 120.9813 },
    status: "active",
    publishStatus: "published",
    visibleToStudents: true,
    features: {
      indoorNavigation: true,
      accessibilityNavigation: true,
      emergencyRoutes: true,
      issueReporting: true,
    },
    canvasW: 900,
    canvasH: 680,
    canvasConfigured: true,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    createdAt: "2024-12-01",
    updatedAt: "2025-01-15",
    publishedAt: "2024-12-15",
    createdBy: "Admin",
    markers: INITIAL_MARKERS.map((m) => ({
      id: m.id, name: m.name, type: m.type, x: m.x, y: m.y, color: m.color || "#0e2a6e",
    })),
    paths: INITIAL_PATHS.map((p) => ({
      id: p.id, points: p.points, type: p.type, color: p.color, width: p.width,
    })),
    buildings: [
      {
        id: "b_mab", name: "Main Academic Building", code: "MAB", category: "Academic",
        description: "Primary academic building housing major college departments.",
        x: 155, y: 130, width: 125, height: 80, color: "#1e40af", expanded: false,
        floors: [
          {
            id: "f_mab_1", number: 1, label: "Ground Floor", paths: [],
            rooms: [
              { id: "r1", name: "Lobby",     type: "lobby",     x: 20,  y: 60,  w: 80,  h: 50 },
              { id: "r2", name: "Room 101",  type: "classroom", x: 120, y: 60,  w: 70,  h: 45 },
              { id: "r3", name: "Room 102",  type: "classroom", x: 200, y: 60,  w: 70,  h: 45 },
              { id: "r4", name: "Stairs A",  type: "stairs",    x: 300, y: 60,  w: 30,  h: 30 },
              { id: "r5", name: "Restroom",  type: "restroom",  x: 350, y: 60,  w: 40,  h: 30 },
            ],
          },
          {
            id: "f_mab_2", number: 2, label: "Floor 2", paths: [],
            rooms: [
              { id: "r6",  name: "Room 201", type: "classroom", x: 20,  y: 60, w: 80,  h: 50 },
              { id: "r7",  name: "Room 202", type: "classroom", x: 120, y: 60, w: 70,  h: 45 },
              { id: "r8",  name: "Lab 201",  type: "lab",       x: 200, y: 60, w: 90,  h: 55 },
              { id: "r9",  name: "Stairs A", type: "stairs",    x: 300, y: 60, w: 30,  h: 30 },
            ],
          },
          { id: "f_mab_3", number: 3, label: "Floor 3", paths: [], rooms: [] },
        ],
      },
      {
        id: "b_adm", name: "Administration Building", code: "ADM", category: "Administrative",
        description: "Houses administrative offices, registrar, and cashier.",
        x: 395, y: 115, width: 105, height: 72, color: "#1e3a8a", expanded: false,
        floors: [
          {
            id: "f_adm_1", number: 1, label: "Ground Floor", paths: [],
            rooms: [
              { id: "ra1", name: "Registrar", type: "office", x: 20,  y: 60,  w: 100, h: 60 },
              { id: "ra2", name: "Cashier",   type: "office", x: 140, y: 60,  w: 80,  h: 60 },
              { id: "ra3", name: "Lobby",     type: "lobby",  x: 240, y: 60,  w: 60,  h: 60 },
            ],
          },
          { id: "f_adm_2", number: 2, label: "Floor 2", paths: [], rooms: [] },
        ],
      },
      {
        id: "b_lrc", name: "Library & Learning Resource", code: "LRC", category: "Library",
        description: "Main library with reading rooms, computer access, and media section.",
        x: 545, y: 295, width: 115, height: 78, color: "#1d4ed8", expanded: false,
        floors: [
          {
            id: "f_lrc_1", number: 1, label: "Ground Floor", paths: [],
            rooms: [
              { id: "rl1", name: "Main Library", type: "office", x: 20,  y: 50,  w: 150, h: 80 },
              { id: "rl2", name: "Reading Room", type: "lobby",  x: 180, y: 50,  w: 80,  h: 80 },
            ],
          },
        ],
      },
      {
        id: "b_elb", name: "Engineering Laboratory Bldg", code: "ELB", category: "Laboratory",
        description: "Engineering labs and workshop areas.",
        x: 165, y: 305, width: 105, height: 62, color: "#1e40af", expanded: false,
        floors: [{ id: "f_elb_1", number: 1, label: "Ground Floor", paths: [], rooms: [] }],
      },
      {
        id: "b_gym", name: "Gymnasium & Sports Complex", code: "GYM", category: "Sports",
        description: "Main gymnasium and sports facilities.",
        x: 305, y: 435, width: 145, height: 82, color: "#2563eb", expanded: false,
        floors: [{ id: "f_gym_1", number: 1, label: "Main Floor", paths: [], rooms: [] }],
      },
      {
        id: "b_ssc", name: "Student Services Center", code: "SSC", category: "Administrative",
        description: "Student services and canteen area.",
        x: 605, y: 415, width: 112, height: 72, color: "#1d4ed8", expanded: false,
        floors: [{ id: "f_ssc_1", number: 1, label: "Ground Floor", paths: [], rooms: [] }],
      },
    ],

    // ── Navigation Graph ──────────────────────────────────────────────────────
    navNodes: [
      // Gates
      { id: "nn_gate", name: "Main Gate", type: "entrance", x: 108, y: 285, accessible: true, color: "#16a34a" },
      { id: "nn_eastgate", name: "East Gate", type: "entrance", x: 680, y: 285, accessible: true, color: "#16a34a" },
      // Central plaza
      { id: "nn_plaza", name: "Flagpole Plaza", type: "outdoor", x: 404, y: 285, accessible: true, color: "#16a34a" },
      // Building entrances
      { id: "nn_mab", name: "MAB Entrance", type: "entrance", x: 280, y: 170, buildingId: "b_mab", accessible: true, color: "#16a34a" },
      { id: "nn_adm", name: "Admin Entrance", type: "entrance", x: 450, y: 195, buildingId: "b_adm", accessible: true, color: "#16a34a" },
      { id: "nn_elb", name: "ELB Entrance", type: "entrance", x: 270, y: 336, buildingId: "b_elb", accessible: true, color: "#16a34a" },
      { id: "nn_lrc", name: "Library Entrance", type: "entrance", x: 545, y: 295, buildingId: "b_lrc", accessible: true, color: "#16a34a" },
      { id: "nn_gym", name: "Gym Entrance", type: "entrance", x: 375, y: 476, buildingId: "b_gym", accessible: true, color: "#16a34a" },
      { id: "nn_ssc", name: "SSC Entrance", type: "entrance", x: 605, y: 415, buildingId: "b_ssc", accessible: true, color: "#16a34a" },
      // Junctions
      { id: "nn_south", name: "South Junction", type: "outdoor", x: 404, y: 462, accessible: true, color: "#16a34a" },
      { id: "nn_parking", name: "Student Parking", type: "outdoor", x: 250, y: 490, accessible: true, color: "#16a34a" },
    ],
    navEdges: [
      // Main gate to central plaza (horizontal spine)
      { id: "ne_gate_plaza", startNodeId: "nn_gate", endNodeId: "nn_plaza", distance: 296, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4 },
      // East gate to central plaza (horizontal spine)
      { id: "ne_east_plaza", startNodeId: "nn_eastgate", endNodeId: "nn_plaza", distance: 276, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4 },
      // Plaza to MAB (north-west)
      { id: "ne_plaza_mab", startNodeId: "nn_plaza", endNodeId: "nn_mab", distance: 169, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 },
      // Plaza to Admin (north-east)
      { id: "ne_plaza_adm", startNodeId: "nn_plaza", endNodeId: "nn_adm", distance: 101, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 },
      // Plaza to ELB (south-west)
      { id: "ne_plaza_elb", startNodeId: "nn_plaza", endNodeId: "nn_elb", distance: 143, bidirectional: true, accessible: true, emergencySafe: false, type: "walkway", color: "#16a34a", width: 3 },
      // Plaza to Library (east)
      { id: "ne_plaza_lrc", startNodeId: "nn_plaza", endNodeId: "nn_lrc", distance: 141, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 },
      // Plaza to south junction (vertical spine)
      { id: "ne_plaza_south", startNodeId: "nn_plaza", endNodeId: "nn_south", distance: 177, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4 },
      // South junction to Gym
      { id: "ne_south_gym", startNodeId: "nn_south", endNodeId: "nn_gym", distance: 32, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 },
      // South junction to SSC
      { id: "ne_south_ssc", startNodeId: "nn_south", endNodeId: "nn_ssc", distance: 206, bidirectional: true, accessible: true, emergencySafe: false, type: "walkway", color: "#16a34a", width: 3 },
      // SSC to Library (cross-connection)
      { id: "ne_ssc_lrc", startNodeId: "nn_ssc", endNodeId: "nn_lrc", distance: 134, bidirectional: true, accessible: true, emergencySafe: false, type: "walkway", color: "#16a34a", width: 2 },
      // MAB to ELB (direct diagonal)
      { id: "ne_mab_elb", startNodeId: "nn_mab", endNodeId: "nn_elb", distance: 166, bidirectional: true, accessible: true, emergencySafe: false, type: "walkway", color: "#16a34a", width: 2 },
      // South junction to student parking
      { id: "ne_south_parking", startNodeId: "nn_south", endNodeId: "nn_parking", distance: 157, bidirectional: true, accessible: true, emergencySafe: false, type: "walkway", color: "#16a34a", width: 2 },
      // Gym to parking (direct)
      { id: "ne_gym_parking", startNodeId: "nn_gym", endNodeId: "nn_parking", distance: 126, bidirectional: true, accessible: true, emergencySafe: false, type: "walkway", color: "#16a34a", width: 2 },
      // Main gate to ELB (shortcut via west path)
      { id: "ne_gate_elb", startNodeId: "nn_gate", endNodeId: "nn_elb", distance: 170, bidirectional: true, accessible: false, inaccessibleReason: "uneven_surface", emergencySafe: false, type: "walkway", color: "#16a34a", width: 2 },
    ],

    // ── Decorative Assets (visual-only outdoor objects) ────────────────────────
    decorAssets: [
      // ══ Perimeter Trees (large) ══
      { id: "da_tl_01", type: "tree-large", x: 30, y: 30 },
      { id: "da_tl_02", type: "tree-large", x: 90, y: 40 },
      { id: "da_tl_03", type: "tree-large", x: 350, y: 35 },
      { id: "da_tl_04", type: "tree-large", x: 480, y: 30 },
      { id: "da_tl_05", type: "tree-large", x: 650, y: 40 },
      { id: "da_tl_06", type: "tree-large", x: 820, y: 55 },
      { id: "da_tl_07", type: "tree-large", x: 30, y: 200 },
      { id: "da_tl_08", type: "tree-large", x: 30, y: 420 },
      { id: "da_tl_09", type: "tree-large", x: 50, y: 580 },
      { id: "da_tl_10", type: "tree-large", x: 200, y: 600 },
      { id: "da_tl_11", type: "tree-large", x: 400, y: 610 },
      { id: "da_tl_12", type: "tree-large", x: 600, y: 600 },
      { id: "da_tl_13", type: "tree-large", x: 790, y: 590 },
      { id: "da_tl_14", type: "tree-large", x: 850, y: 170 },
      { id: "da_tl_15", type: "tree-large", x: 850, y: 400 },

      // ══ Interior Trees (between buildings) ══
      { id: "da_tr_01", type: "tree", x: 320, y: 200 },
      { id: "da_tr_02", type: "tree", x: 360, y: 160 },
      { id: "da_tr_03", type: "tree", x: 500, y: 180 },
      { id: "da_tr_04", type: "tree", x: 200, y: 270 },
      { id: "da_tr_05", type: "tree", x: 220, y: 380 },
      { id: "da_tr_06", type: "tree", x: 480, y: 350 },
      { id: "da_tr_07", type: "tree", x: 510, y: 380 },
      { id: "da_tr_08", type: "tree", x: 460, y: 500 },
      { id: "da_tr_09", type: "tree", x: 530, y: 490 },
      { id: "da_tr_10", type: "tree", x: 350, y: 550 },
      { id: "da_tr_11", type: "tree", x: 700, y: 380 },
      { id: "da_tr_12", type: "tree", x: 720, y: 480 },

      // ══ Palm Trees (for tropical vibe) ══
      { id: "da_pm_01", type: "palm", x: 310, y: 270 },
      { id: "da_pm_02", type: "palm", x: 500, y: 270 },
      { id: "da_pm_03", type: "palm", x: 380, y: 440 },
      { id: "da_pm_04", type: "palm", x: 590, y: 440 },

      // ══ Bushes (near buildings and walkways) ══
      { id: "da_bu_01", type: "bush", x: 270, y: 125 },
      { id: "da_bu_02", type: "bush", x: 290, y: 125 },
      { id: "da_bu_03", type: "bush", x: 380, y: 105 },
      { id: "da_bu_04", type: "bush", x: 480, y: 105 },
      { id: "da_bu_05", type: "bush", x: 530, y: 280 },
      { id: "da_bu_06", type: "bush", x: 560, y: 280 },
      { id: "da_bu_07", type: "bush", x: 155, y: 350 },
      { id: "da_bu_08", type: "bush", x: 155, y: 370 },
      { id: "da_bu_09", type: "bush", x: 290, y: 420 },
      { id: "da_bu_10", type: "bush", x: 320, y: 420 },
      { id: "da_bu_11", type: "bush", x: 600, y: 400 },
      { id: "da_bu_12", type: "bush", x: 620, y: 400 },

      // ══ Flower Beds (decorative color) ══
      { id: "da_fl_01", type: "flower", x: 385, y: 265 },
      { id: "da_fl_02", type: "flower", x: 425, y: 265 },
      { id: "da_fl_03", type: "flower", x: 220, y: 145 },
      { id: "da_fl_04", type: "flower", x: 460, y: 160 },

      // ══ Plant Pots (entrance decorations) ══
      { id: "da_pt_01", type: "plant", x: 260, y: 160 },
      { id: "da_pt_02", type: "plant", x: 300, y: 160 },
      { id: "da_pt_03", type: "plant", x: 430, y: 185 },
      { id: "da_pt_04", type: "plant", x: 470, y: 185 },
      { id: "da_pt_05", type: "plant", x: 525, y: 295 },
      { id: "da_pt_06", type: "plant", x: 565, y: 295 },
      { id: "da_pt_07", type: "plant", x: 360, y: 466 },
      { id: "da_pt_08", type: "plant", x: 390, y: 466 },
      { id: "da_pt_09", type: "plant", x: 585, y: 425 },
      { id: "da_pt_10", type: "plant", x: 625, y: 425 },

      // ══ Benches (rest areas near buildings) ══
      { id: "da_be_01", type: "bench", x: 250, y: 155 },
      { id: "da_be_02", type: "bench", x: 475, y: 210 },
      { id: "da_be_03", type: "bench", x: 530, y: 310 },
      { id: "da_be_04", type: "bench", x: 585, y: 430 },
      { id: "da_be_05", type: "bench", x: 360, y: 490 },
      { id: "da_be_06", type: "bench", x: 390, y: 300 },
      // Long benches
      { id: "da_bl_01", type: "bench-long", x: 340, y: 270 },
      { id: "da_bl_02", type: "bench-long", x: 600, y: 370 },

      // ══ Lamp Posts (along main paths) ══
      { id: "da_lp_01", type: "lamp-post", x: 150, y: 275 },
      { id: "da_lp_02", type: "lamp-post", x: 250, y: 275 },
      { id: "da_lp_03", type: "lamp-post", x: 350, y: 275 },
      { id: "da_lp_04", type: "lamp-post", x: 460, y: 275 },
      { id: "da_lp_05", type: "lamp-post", x: 560, y: 275 },
      { id: "da_lp_06", type: "lamp-post", x: 650, y: 275 },
      { id: "da_lp_07", type: "lamp-post", x: 394, y: 210 },
      { id: "da_lp_08", type: "lamp-post", x: 394, y: 340 },
      { id: "da_lp_09", type: "lamp-post", x: 394, y: 420 },
      { id: "da_lp_10", type: "lamp-post", x: 394, y: 520 },

      // ══ Trash & Recycle Bins ══
      { id: "da_tb_01", type: "trash-bin", x: 395, y: 275 },
      { id: "da_tb_02", type: "trash-bin", x: 280, y: 165 },
      { id: "da_tb_03", type: "trash-bin", x: 450, y: 185 },
      { id: "da_tb_04", type: "trash-bin", x: 540, y: 305 },
      { id: "da_tb_05", type: "trash-bin", x: 375, y: 465 },
      { id: "da_tb_06", type: "trash-bin", x: 610, y: 410 },
      { id: "da_rb_01", type: "recycle-bin", x: 414, y: 275 },

      // ══ Wayfinding Signs ══
      { id: "da_sg_01", type: "sign", x: 100, y: 275 },
      { id: "da_sg_02", type: "sign", x: 690, y: 275 },
      { id: "da_sg_03", type: "sign", x: 395, y: 310 },

      // ══ Flags ══
      { id: "da_fg_01", type: "flag", x: 390, y: 255 },

      // ══ Facilities ══
      { id: "da_fn_01", type: "fountain", x: 395, y: 285 },
      { id: "da_br_01", type: "bike-rack", x: 285, y: 140 },
      { id: "da_br_02", type: "bike-rack", x: 465, y: 150 },
      { id: "da_pt_11", type: "picnic-table", x: 340, y: 550 },
      { id: "da_pt_12", type: "picnic-table", x: 660, y: 350 },
      { id: "da_gz_01", type: "gazebo", x: 170, y: 250 },
    ],

    // ── Assembly Points (emergency gathering areas) ───────────────────────────
    assemblyPoints: [
      { id: "ap_plaza", name: "Flagpole Plaza", x: 404, y: 285, capacity: 500, accessible: true },
      { id: "ap_field", name: "Open Field (Gym Area)", x: 375, y: 540, capacity: 300, accessible: true },
      { id: "ap_gate", name: "Main Gate Area", x: 108, y: 300, capacity: 200, accessible: true },
      { id: "ap_parking", name: "Student Parking Lot", x: 250, y: 510, capacity: 150, accessible: true },
    ],

    // ── Accessibility Features ────────────────────────────────────────────────
    accessibilityFeatures: [
      { id: "af_mab_ramp", buildingId: "b_mab", type: "ramp", label: "MAB Entrance Ramp", status: "present", notes: "Wheelchair ramp at main entrance" },
      { id: "af_adm_ramp", buildingId: "b_adm", type: "ramp", label: "Admin Entrance Ramp", status: "present", notes: "Ramp at north entrance" },
      { id: "af_lrc_elv", buildingId: "b_lrc", type: "elevator", label: "Library Elevator", status: "present", notes: "Public elevator to all floors" },
      { id: "af_ssc_entr", buildingId: "b_ssc", type: "accessible_entrance", label: "SSC Accessible Entrance", status: "present" },
      { id: "af_elb_ramp", buildingId: "b_elb", type: "ramp", label: "ELB Side Ramp", status: "present" },
      { id: "af_mab_rstr", buildingId: "b_mab", type: "accessible_restroom", label: "MAB Accessible Restroom", status: "present" },
      { id: "af_lrc_rstr", buildingId: "b_lrc", type: "accessible_restroom", label: "Library Accessible Restroom", status: "present" },
      { id: "af_gym_ramp", buildingId: "b_gym", type: "ramp", label: "Gym Entrance Ramp", status: "under_maintenance", notes: "Scheduled for repair next month" },
      { id: "af_adm_corr", buildingId: "b_adm", type: "wide_corridor", label: "Admin Wide Corridor", status: "present" },
    ],

    // ── Predefined Routes ─────────────────────────────────────────────────────
    routes: [
      {
        id: "rt_gate_mab", name: "Main Gate → MAB",
        description: "Standard walking route from the main entrance to the Main Academic Building",
        fromBuildingId: "b_mab", toBuildingId: "",
        waypoints: [{ x: 108, y: 285 }, { x: 404, y: 285 }, { x: 280, y: 170 }],
        type: "walking", distanceM: 120, durationMin: 2, color: "#0e2a6e", isActive: true,
      },
      {
        id: "rt_gate_lrc", name: "Main Gate → Library",
        description: "Route from main gate to the Library & Learning Resource Center",
        fromBuildingId: "b_lrc", toBuildingId: "",
        waypoints: [{ x: 108, y: 285 }, { x: 404, y: 285 }, { x: 545, y: 295 }],
        type: "walking", distanceM: 150, durationMin: 3, color: "#0e2a6e", isActive: true,
      },
      {
        id: "rt_east_gym", name: "East Gate → Gymnasium",
        description: "From the east campus entrance to the sports complex",
        fromBuildingId: "b_gym", toBuildingId: "",
        waypoints: [{ x: 680, y: 285 }, { x: 404, y: 285 }, { x: 404, y: 462 }, { x: 375, y: 476 }],
        type: "walking", distanceM: 200, durationMin: 4, color: "#0e2a6e", isActive: true,
      },
      {
        id: "rt_adm_ssc", name: "Admin → SSC (Accessible)",
        description: "Wheelchair-accessible route from Administration to Student Services",
        fromBuildingId: "b_adm", toBuildingId: "b_ssc",
        waypoints: [{ x: 450, y: 195 }, { x: 404, y: 285 }, { x: 404, y: 462 }, { x: 605, y: 415 }],
        type: "accessible", distanceM: 220, durationMin: 5, color: "#2563eb", isActive: true,
      },
      {
        id: "rt_mab_lrc", name: "MAB → Library",
        description: "Quick route between academic buildings",
        fromBuildingId: "b_mab", toBuildingId: "b_lrc",
        waypoints: [{ x: 280, y: 170 }, { x: 404, y: 285 }, { x: 545, y: 295 }],
        type: "walking", distanceM: 180, durationMin: 3, color: "#0e2a6e", isActive: true,
      },
      {
        id: "rt_gym_parking", name: "Gymnasium → Student Parking",
        description: "Route from the sports complex to the student parking area",
        fromBuildingId: "b_gym", toBuildingId: "",
        waypoints: [{ x: 375, y: 476 }, { x: 250, y: 490 }],
        type: "walking", distanceM: 80, durationMin: 1, color: "#0e2a6e", isActive: true,
      },
    ],

    // ── Event Overlays ────────────────────────────────────────────────────────
    eventOverlays: [
      {
        id: "ev_foundation",
        title: "PLV Foundation Week",
        description: "Annual foundation celebration with booth activities along the main walkway",
        dateStart: "2026-02-15",
        dateEnd: "2026-02-21",
        organizer: "Office of Student Affairs",
        markers: [
          { x: 320, y: 280, color: "#d97706", label: "Booth 1 — Student Council" },
          { x: 350, y: 280, color: "#d97706", label: "Booth 2 — Org Fair" },
          { x: 380, y: 280, color: "#d97706", label: "Booth 3 — Food Stalls" },
          { x: 410, y: 280, color: "#d97706", label: "Booth 4 — Games" },
          { x: 440, y: 280, color: "#d97706", label: "Booth 5 — Merch Booth" },
          { x: 470, y: 280, color: "#d97706", label: "Booth 6 — Info Desk" },
        ],
        restrictedAreas: [
          {
            points: [
              { x: 300, y: 270 }, { x: 500, y: 270 },
              { x: 500, y: 300 }, { x: 300, y: 300 },
            ],
          },
        ],
        isActive: true,
      },
      {
        id: "ev_enrollment",
        title: "Enrollment Period",
        description: "Enrollment assistance tent near the Administration Building",
        dateStart: "2026-05-20",
        dateEnd: "2026-06-10",
        organizer: "Registrar's Office",
        markers: [
          { x: 420, y: 150, color: "#2563eb", label: "Enrollment Tent" },
          { x: 440, y: 150, color: "#2563eb", label: "Help Desk" },
          { x: 460, y: 150, color: "#2563eb", label: "Payment Counter" },
        ],
        restrictedAreas: [],
        isActive: true,
      },
    ],
  },
  // ── Additional seed campus: North Campus ──────────────────────────────────
  {
    id: "campus_north",
    name: "PLV North Campus",
    code: "PLV-NTH",
    description: "North campus expansion featuring modern facilities and specialized laboratories.",
    address: "North Boulevard, Malinta",
    city: "Valenzuela",
    province: "Metro Manila",
    postalCode: "1443",
    coordinates: { lat: 14.7150, lng: 120.9700 },
    status: "active",
    publishStatus: "draft",
    visibleToStudents: false,
    features: {
      indoorNavigation: false,
      accessibilityNavigation: true,
      emergencyRoutes: true,
      issueReporting: true,
    },
    canvasW: 800,
    canvasH: 600,
    canvasConfigured: true,
    settings: { accessibility: true, emergency: true, eventLayer: false, gps: false },
    createdAt: "2025-02-01",
    updatedAt: "2025-02-10",
    createdBy: "Admin",
    markers: [],
    paths: [],
    buildings: [
      {
        id: "bn_1", name: "Science Building", code: "SCI", category: "Laboratory",
        description: "Modern science and research laboratories.",
        x: 100, y: 80, width: 120, height: 75, color: "#1e40af", expanded: false,
        floors: [
          {
            id: "fn_1_1", number: 1, label: "Ground Floor", paths: [],
            rooms: [
              { id: "rn1", name: "Chemistry Lab", type: "lab", x: 20, y: 40, w: 100, h: 60 },
              { id: "rn2", name: "Physics Lab", type: "lab", x: 140, y: 40, w: 100, h: 60 },
            ],
          },
        ],
      },
      {
        id: "bn_2", name: "Student Dormitory", code: "DORM", category: "Dormitory",
        description: "On-campus student housing.",
        x: 350, y: 100, width: 100, height: 80, color: "#1e3a8a", expanded: false,
        floors: [{ id: "fn_2_1", number: 1, label: "Ground Floor", paths: [], rooms: [] }],
      },
    ],
  },
];

