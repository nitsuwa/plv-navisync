import {
  MousePointer2, MapPin, Square, GitBranch, Trash2, Map,
  Navigation, Accessibility, Flame, Star, Hand, DoorOpen,
  MoveVertical, SeparatorHorizontal, Binary, Text, Sofa,
  Container, Table, Monitor, Lamp, BookOpen,
  PanelRightOpen,
} from "lucide-react";
import type {
  SimpleTool, EditorLayer, RoomTypeDescriptor, CanvasSizeOption,
  Campus, CampusBuilding, FloorPlan, FurnitureCategory,
} from "./types";
import { INITIAL_MARKERS, INITIAL_PATHS, MARKER_STYLES } from "../../data/mapData";
import { shade } from "../../lib/color";

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
    { id: "select",   icon: MousePointer2, label: "Select",   hint: "Select and move objects on the canvas.", key: "V" },
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
      { type: "chair",           name: "Chair",            width: 12, height: 12, color: "#4b5563" },
      { type: "bench",           name: "Bench",            width: 30, height: 10, color: "#6b5b45" },
      { type: "sofa",            name: "Sofa",             width: 34, height: 16, color: "#3f3f46" },
    ],
  },
  {
    id: "tables",
    label: "Tables / Work",
    icon: "Table",
    items: [
      { type: "desk",             name: "Desk",              width: 26, height: 16, color: "#7a5c3a" },
      { type: "table",            name: "Table",             width: 28, height: 18, color: "#8b6f4e" },
    ],
  },
  {
    id: "storage",
    label: "Storage",
    icon: "Container",
    items: [
      { type: "cabinet",         name: "Cabinet",         width: 18, height: 12, color: "#71717a" },
      { type: "bookshelf",       name: "Shelf",           width: 18, height: 10, color: "#6b5b45" },
    ],
  },
  {
    id: "electronics",
    label: "Electronics",
    icon: "Monitor",
    items: [
      { type: "computer-workstation", name: "Computer Workstation", width: 28, height: 16, color: "#475569" },
    ],
  },
  {
    id: "decor",
    label: "Decor",
    icon: "Lamp",
    items: [
      { type: "plant",            name: "Plant",           width: 10, height: 10, color: "#3f7d4a" },
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

/**
 * A single SVG sub-shape of a decorative asset. Coordinates live in the
 * asset's local 0..defaultWidth × 0..defaultHeight space; the renderer
 * centers that box on the asset position.
 */
export interface DecorPart {
  /** SVG path data in local asset space. */
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fillOpacity?: number;
  strokeLinecap?: "butt" | "round" | "square";
  strokeLinejoin?: "miter" | "round" | "bevel";
}

export interface DecorAssetDescriptor {
  type: DecorAssetType;
  label: string;
  category: string;
  color: string;
  /** SVG path data for rendering on canvas (primary body, kept for legacy/fallback rendering) */
  svgPath: string;
  /** Multi-part artwork — used by the shared visual renderer when present. */
  parts?: DecorPart[];
  /** Default width in canvas units */
  defaultWidth: number;
  /** Default height in canvas units */
  defaultHeight: number;
}

export const DECOR_ASSET_TYPES: DecorAssetDescriptor[] = [
  // Greenery
  {
    type: "tree", label: "Tree", category: "Greenery", color: "#22c55e",
    svgPath: "M12 1 C7 1 3 5 3 10 C3 16 8 19 12 19 C16 19 21 16 21 10 C21 5 17 1 12 1 Z",
    parts: [
      { d: "M10 14 L11 27 L13 27 L14 14 Z", fill: "#8a6a3f" },
      { d: "M12 1 C7 1 3 5 3 10 C3 16 8 19 12 19 C16 19 21 16 21 10 C21 5 17 1 12 1 Z", fill: shade("#22c55e", -10) },
      { d: "M8 5 C6 7 6 11 8 13 C10 15 13 14 14 11 C15 8 12 4 8 5 Z", fill: shade("#22c55e", 25) },
    ],
    defaultWidth: 24, defaultHeight: 28,
  },
  {
    type: "tree-large", label: "Large Tree", category: "Greenery", color: "#16a34a",
    svgPath: "M16 2 C9 2 4 7 4 13 C4 20 10 24 16 24 C22 24 28 20 28 13 C28 7 23 2 16 2 Z",
    parts: [
      { d: "M14 18 L15 34 L17 34 L18 18 Z", fill: "#8a6a3f" },
      { d: "M16 2 C9 2 4 7 4 13 C4 20 10 24 16 24 C22 24 28 20 28 13 C28 7 23 2 16 2 Z", fill: shade("#16a34a", -12) },
      { d: "M10 7 C7 9 6 14 9 17 C12 20 17 19 19 15 C21 11 16 5 10 7 Z", fill: shade("#16a34a", 22) },
    ],
    defaultWidth: 32, defaultHeight: 36,
  },
  {
    type: "palm", label: "Palm Tree", category: "Greenery", color: "#15803d",
    svgPath: "M13 32 Q12 22 13 9 L15 9 Q14 22 15 32 Z",
    parts: [
      { d: "M14 9 Q4 4 2 12 M14 9 Q24 2 26 10 M14 9 Q5 10 3 17 M14 9 Q23 12 25 18", fill: "none", stroke: "#15803d", strokeWidth: 2.2, strokeLinecap: "round" },
      { d: "M13 32 Q12 22 13 9 L15 9 Q14 22 15 32 Z", fill: "#a16207" },
      { d: "M11.4 10.6 m-1.7,0 a1.7,1.7 0 1 1 3.4,0 a1.7,1.7 0 1 1 -3.4,0 Z M16 12.8 m-1.4,0 a1.4,1.4 0 1 1 2.8,0 a1.4,1.4 0 1 1 -2.8,0 Z", fill: "#b45309" },
    ],
    defaultWidth: 28, defaultHeight: 34,
  },
  {
    type: "bush", label: "Bush", category: "Greenery", color: "#4ade80",
    svgPath: "M12 3 C7 3 3 7 3 12 C3 17 7 19 12 19 C17 19 21 17 21 12 C21 7 17 3 12 3 Z",
    parts: [
      { d: "M12 3 C7 3 3 7 3 12 C3 17 7 19 12 19 C17 19 21 17 21 12 C21 7 17 3 12 3 Z", fill: shade("#4ade80", -8) },
      { d: "M7 6 C5 8 5 11 7 13 C9 15 13 15 14 12 C15 9 12 4 7 6 Z", fill: shade("#4ade80", 20) },
    ],
    defaultWidth: 24, defaultHeight: 20,
  },
  {
    type: "plant", label: "Plant Pot", category: "Greenery", color: "#22c55e",
    svgPath: "M5.5 14 L7 21 L11 21 L12.5 14 Z",
    parts: [
      { d: "M5.5 14 L7 21 L11 21 L12.5 14 Z", fill: "#c2620a" },
      { d: "M4.5 12.5 L13.5 12.5 L13 15 L5 15 Z", fill: "#b45309" },
      { d: "M8.5 12.5 Q5 8 6.5 3 Q9.5 5.5 8.5 12.5 Z", fill: shade("#22c55e", 18) },
      { d: "M9.5 12.5 Q12.5 7.5 15.5 6 Q13.5 10 9.5 12.5 Z", fill: "#22c55e" },
      { d: "M9.3 12.5 Q8.5 7 10.5 3.5 Q12 7 9.3 12.5 Z", fill: shade("#22c55e", -8) },
    ],
    defaultWidth: 18, defaultHeight: 22,
  },
  {
    type: "flower", label: "Flower Bed", category: "Greenery", color: "#f472b6",
    svgPath: "M14.2 10.5 m-2.3,0 a2.3,2.3 0 1 1 4.6,0 a2.3,2.3 0 1 1 -4.6,0 Z M11.3 14.5 m-2.3,0 a2.3,2.3 0 1 1 4.6,0 a2.3,2.3 0 1 1 -4.6,0 Z M6.6 12.9 m-2.3,0 a2.3,2.3 0 1 1 4.6,0 a2.3,2.3 0 1 1 -4.6,0 Z M6.6 8.1 m-2.3,0 a2.3,2.3 0 1 1 4.6,0 a2.3,2.3 0 1 1 -4.6,0 Z M11.3 6.5 m-2.3,0 a2.3,2.3 0 1 1 4.6,0 a2.3,2.3 0 1 1 -4.6,0 Z",
    parts: [
      { d: "M14.2 10.5 m-2.3,0 a2.3,2.3 0 1 1 4.6,0 a2.3,2.3 0 1 1 -4.6,0 Z M11.3 14.5 m-2.3,0 a2.3,2.3 0 1 1 4.6,0 a2.3,2.3 0 1 1 -4.6,0 Z M6.6 12.9 m-2.3,0 a2.3,2.3 0 1 1 4.6,0 a2.3,2.3 0 1 1 -4.6,0 Z M6.6 8.1 m-2.3,0 a2.3,2.3 0 1 1 4.6,0 a2.3,2.3 0 1 1 -4.6,0 Z M11.3 6.5 m-2.3,0 a2.3,2.3 0 1 1 4.6,0 a2.3,2.3 0 1 1 -4.6,0 Z", fill: "#f472b6", fillOpacity: 0.95 },
      { d: "M10 10.5 m-2.1,0 a2.1,2.1 0 1 1 4.2,0 a2.1,2.1 0 1 1 -4.2,0 Z", fill: "#fbbf24" },
      { d: "M8 17.5 L12 17.5 L11 20 L9 20 Z", fill: "#16a34a" },
    ],
    defaultWidth: 20, defaultHeight: 20,
  },
  // Seating
  {
    type: "bench", label: "Bench", category: "Seating", color: "#a16207",
    svgPath: "M3 9 L21 9 L21 12 L3 12 Z",
    parts: [
      { d: "M4 5 L8 5 L8 9 L4 9 Z M10 5 L14 5 L14 9 L10 9 Z M16 5 L20 5 L20 9 L16 9 Z", fill: shade("#a16207", -5) },
      { d: "M3 9 L21 9 L21 12 L3 12 Z", fill: shade("#a16207", 10) },
      { d: "M3 12 L21 12 L21 13.5 L3 13.5 Z", fill: shade("#a16207", -15) },
      { d: "M5 13.5 L5 17 L6.5 17 L6.5 13.5 Z M18.5 13.5 L18.5 17 L20 17 L20 13.5 Z", fill: shade("#a16207", -25) },
    ],
    defaultWidth: 24, defaultHeight: 18,
  },
  {
    type: "bench-long", label: "Long Bench", category: "Seating", color: "#92400e",
    svgPath: "M4 9 L32 9 L32 12 L4 12 Z",
    parts: [
      { d: "M5 5 L9 5 L9 9 L5 9 Z M12 5 L16 5 L16 9 L12 9 Z M19 5 L23 5 L23 9 L19 9 Z M26 5 L30 5 L30 9 L26 9 Z", fill: shade("#92400e", -5) },
      { d: "M4 9 L32 9 L32 12 L4 12 Z", fill: shade("#92400e", 10) },
      { d: "M4 12 L32 12 L32 13.5 L4 13.5 Z", fill: shade("#92400e", -15) },
      { d: "M6 13.5 L6 17 L7.5 17 L7.5 13.5 Z M30.5 13.5 L30.5 17 L32 17 L32 13.5 Z", fill: shade("#92400e", -25) },
    ],
    defaultWidth: 36, defaultHeight: 18,
  },
  {
    type: "picnic-table", label: "Picnic Table", category: "Seating", color: "#78350f",
    svgPath: "M4 8 L28 8 L28 11 L4 11 Z",
    parts: [
      { d: "M4 8 L28 8 L28 11 L4 11 Z", fill: shade("#78350f", 12) },
      { d: "M4 11 L28 11 L28 12.5 L4 12.5 Z", fill: shade("#78350f", -12) },
      { d: "M3 15 L9 15 L9 17.5 L3 17.5 Z", fill: shade("#78350f", 8) },
      { d: "M23 15 L29 15 L29 17.5 L23 17.5 Z", fill: shade("#78350f", 8) },
      { d: "M7 12.5 L5.5 20 L7.5 20 L9 12.5 Z M23 12.5 L24.5 20 L26.5 20 L25 12.5 Z M14.5 12.5 L15 20 L17 20 L17.5 12.5 Z", fill: shade("#78350f", -25) },
    ],
    defaultWidth: 32, defaultHeight: 22,
  },
  // Wayfinding
  {
    type: "sign", label: "Sign Post", category: "Wayfinding", color: "#2563eb",
    svgPath: "M4 4 L20 4 L20 14 L4 14 Z",
    parts: [
      { d: "M11 11 L11 28 L13 28 L13 11 Z", fill: "#64748b" },
      { d: "M4 4 L20 4 L20 14 L4 14 Z", fill: "#2563eb" },
      { d: "M6 6 L18 6 L18 12 L6 12 Z", fill: "#ffffff", fillOpacity: 0.9 },
      { d: "M7.5 8.2 L16.5 8.2 M7.5 10 L13.5 10", fill: "none", stroke: "#334155", strokeWidth: 1.2, strokeLinecap: "round" },
    ],
    defaultWidth: 24, defaultHeight: 30,
  },
  {
    type: "flag", label: "Flag", category: "Wayfinding", color: "#dc2626",
    svgPath: "M13 4 L23 4 L21 7 L23 10 L13 10 Z",
    parts: [
      { d: "M11 3 L13 3 L13 27 L11 27 Z", fill: "#94a3b8" },
      { d: "M13 4 L23 4 L21 7 L23 10 L13 10 Z", fill: "#dc2626" },
      { d: "M9 27 L15 27 L14 29.5 L10 29.5 Z", fill: "#64748b" },
    ],
    defaultWidth: 26, defaultHeight: 30,
  },
  // Utilities
  {
    type: "trash-bin", label: "Trash Bin", category: "Utilities", color: "#78716c",
    svgPath: "M5.5 9 L7 23 L17 23 L18.5 9 Z",
    parts: [
      { d: "M6 5 L18 5 L17 8 L7 8 Z", fill: shade("#78716c", -10) },
      { d: "M5 8 L19 8 L18.5 10 L5.5 10 Z", fill: shade("#78716c", -20) },
      { d: "M5.5 9 L7 23 L17 23 L18.5 9 Z", fill: "#78716c" },
      { d: "M9 10.5 L9.5 21.5 M12 10.5 L12 21.5 M15 10.5 L15 21.5", fill: "none", stroke: "rgba(255,255,255,0.4)", strokeWidth: 1, strokeLinecap: "round" },
    ],
    defaultWidth: 24, defaultHeight: 26,
  },
  {
    type: "recycle-bin", label: "Recycle Bin", category: "Utilities", color: "#16a34a",
    svgPath: "M5.5 9 L7 23 L17 23 L18.5 9 Z",
    parts: [
      { d: "M6 5 L18 5 L17 8 L7 8 Z", fill: shade("#16a34a", -10) },
      { d: "M5 8 L19 8 L18.5 10 L5.5 10 Z", fill: shade("#16a34a", -20) },
      { d: "M5.5 9 L7 23 L17 23 L18.5 9 Z", fill: "#16a34a" },
      { d: "M12 12 L15.5 17.5 L8.5 17.5 Z M12 12 L12 13.8 M12 12 L14.4 14.2", fill: "none", stroke: "#ffffff", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" },
    ],
    defaultWidth: 24, defaultHeight: 26,
  },
  {
    type: "lamp-post", label: "Lamp Post", category: "Utilities", color: "#eab308",
    svgPath: "M10 4.4 m-2.2,0 a2.2,2.2 0 1 1 4.4,0 a2.2,2.2 0 1 1 -4.4,0 Z",
    parts: [
      { d: "M9 6 L9 28 L11 28 L11 6 Z", fill: "#64748b" },
      { d: "M7.5 27 L12.5 27 L12 29.5 L8 29.5 Z", fill: "#475569" },
      { d: "M6.5 6 Q10 2.5 13.5 6", fill: "none", stroke: "#64748b", strokeWidth: 1.6, strokeLinecap: "round" },
      { d: "M10 3.8 m-3.1,0 a3.1,3.1 0 1 1 6.2,0 a3.1,3.1 0 1 1 -6.2,0 Z", fill: "#fde047", fillOpacity: 0.35 },
      { d: "M10 4.4 m-2.2,0 a2.2,2.2 0 1 1 4.4,0 a2.2,2.2 0 1 1 -4.4,0 Z", fill: "#fef08a" },
    ],
    defaultWidth: 20, defaultHeight: 30,
  },
  {
    type: "bollard", label: "Bollard", category: "Utilities", color: "#94a3b8",
    svgPath: "M5 10 C5 6 11 6 11 10 L11 24 L5 24 Z",
    parts: [
      { d: "M5 10 C5 6 11 6 11 10 L11 12 L5 12 Z", fill: shade("#94a3b8", 18) },
      { d: "M5.5 12 L10.5 12 L10.5 24 L5.5 24 Z", fill: "#94a3b8" },
      { d: "M5.5 15 L10.5 15 L10.5 17.5 L5.5 17.5 Z", fill: "#e2e8f0", fillOpacity: 0.9 },
    ],
    defaultWidth: 16, defaultHeight: 26,
  },
  // Facilities
  {
    type: "bike-rack", label: "Bike Rack", category: "Facilities", color: "#64748b",
    svgPath: "M3.5 13 L3.5 6.5 Q3.5 3.5 6.5 3.5 L7 3.5 Q10 3.5 10 6.5 L10 13",
    parts: [
      { d: "M3 13 L23 13 L23 14.5 L3 14.5 Z", fill: shade("#64748b", 10) },
      { d: "M3.5 13 L3.5 6.5 Q3.5 3.5 6.5 3.5 L7 3.5 Q10 3.5 10 6.5 L10 13 M11.5 13 L11.5 6.5 Q11.5 3.5 14.5 3.5 L15 3.5 Q18 3.5 18 6.5 L18 13 M19.5 13 L19.5 6.5 Q19.5 3.5 22.5 3.5 L23 3.5 Q26 3.5 26 6.5 L26 13", fill: "none", stroke: "#64748b", strokeWidth: 2, strokeLinecap: "round" },
      { d: "M4 13 L3 21 L5 21 L6 13 Z M20 13 L21 21 L23 21 L22 13 Z", fill: shade("#64748b", -20) },
    ],
    defaultWidth: 26, defaultHeight: 24,
  },
  {
    type: "fountain", label: "Fountain", category: "Facilities", color: "#38bdf8",
    svgPath: "M2 20 a12 5 0 1 0 24 0 a12 5 0 1 0 -24 0 Z",
    parts: [
      { d: "M2 20 a12 5 0 1 0 24 0 a12 5 0 1 0 -24 0 Z", fill: "#7dd3fc" },
      { d: "M6.5 19 a7.5 3 0 1 0 15 0 a7.5 3 0 1 0 -15 0 Z", fill: "#38bdf8" },
      { d: "M12 19 L16 19 L15.5 21.5 L12.5 21.5 Z", fill: "#93c5fd" },
      { d: "M14 19 C12.5 14 12.5 10 14 7 C15.5 10 15.5 14 14 19 Z", fill: "#bae6fd" },
    ],
    defaultWidth: 28, defaultHeight: 28,
  },
  {
    type: "gazebo", label: "Gazebo", category: "Facilities", color: "#92400e",
    svgPath: "M5 12 L25 12 L15 2 Z",
    parts: [
      { d: "M5 12 L25 12 L15 2 Z", fill: shade("#92400e", -10) },
      { d: "M8 10.5 L22 10.5 L15 4.5 Z", fill: shade("#92400e", 12) },
      { d: "M7 12 L7 24 L8.5 24 L8.5 12 Z M21.5 12 L21.5 24 L23 24 L23 12 Z", fill: shade("#92400e", -15) },
      { d: "M5 24 L25 24 L24.5 26 L5.5 26 Z", fill: shade("#92400e", -25) },
    ],
    defaultWidth: 30, defaultHeight: 28,
  },
];

export const DECOR_ASSET_MAP = Object.fromEntries(DECOR_ASSET_TYPES.map((a) => [a.type, a]));

// ── Curated placement palette for outdoor decor ───────────────────────────
// A focused public-campus-map set (clean top-down map symbols). Types that are
// NOT listed here are still fully renderable and editable when loaded from
// existing saved campuses (backward compatible) — they are simply not offered
// in the placement palette because they read as clip-art at campus scale.
export const DECOR_PALETTE_TYPES: string[] = [
  // Greenery
  "tree", "tree-large", "palm", "bush", "plant",
  // Seating
  "bench", "bench-long",
  // Wayfinding
  "sign",
  // Utilities
  "trash-bin", "recycle-bin", "lamp-post",
  // Facilities
  "bike-rack", "gazebo",
];

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

