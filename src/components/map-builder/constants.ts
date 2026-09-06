import {
  MousePointer2, MapPin, Square, GitBranch, Trash2, Map,
  Navigation, Star, Hand, DoorOpen,
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
  { id: "path",     icon: GitBranch,     label: "Path",     hint: "Drag one clean pathway or road segment",      key: "P" },
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
    { id: "building", icon: Square,        label: "Add Building", hint: "Click & drag on the canvas to draw a building footprint. Give it a name and floors in the Properties panel on the right.", key: "B" },
    { id: "path",     icon: GitBranch,     label: "Pathway", hint: "Drag one clean walkway, road, or accessible path segment. End near another path to create a junction.", key: "P" },
    { id: "erase",    icon: Trash2,        label: "Erase",    hint: "Click any building, marker, path, or asset to remove it from the campus", key: "E" },
  ],
  navigation: [
    { id: "select",   icon: MousePointer2, label: "Select",   hint: "Select waypoints and connections to edit routing properties. Campus objects stay visible as context.", key: "V" },
    { id: "pan",      icon: Hand,          label: "Pan",      hint: "Hold Space + drag to pan around the canvas", key: "Space" },
    { id: "marker",   icon: MapPin,        label: "Add Walking Point", hint: "Add a Walking Point when physical pathways do not provide the routing point you need.", key: "M" },
    { id: "path",     icon: GitBranch,     label: "Connect", hint: "Connect Walking Points and entrances for routes that need a manual connection.", key: "P" },
    { id: "erase",    icon: Trash2,        label: "Remove",   hint: "Click a waypoint or connection to remove it from the navigation network. Deleting a waypoint removes all its connections.", key: "E" },
  ],
  // Accessibility and Emergency are ROUTING PROPERTIES of the navigation graph
  // (edge/node accessible + emergency-safe flags), not separate drawing modes.
  events: [
    { id: "select",   icon: MousePointer2, label: "Select",    hint: "Click an event marker to edit its name, date, and location", key: "V" },
    { id: "pan",      icon: Hand,          label: "Pan",       hint: "Hold Space + drag to pan around the canvas", key: "Space" },
    { id: "marker",   icon: MapPin,        label: "Add Event", hint: "Click to place an event pin on the map, then assign it to a building or room in the Properties panel", key: "M" },
    { id: "building", icon: Square,        label: "Restrict Area", hint: "Click & drag to draw an area that should be restricted during the event", key: "B" },
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
  { id: "campus",        icon: Map,          label: "Campus",       color: "var(--primary)",     accent: "color-mix(in srgb,var(--primary) 12%,transparent)",      hint: "Start here: add buildings, give them floors, and draw outdoor walkways" },
  { id: "navigation",    icon: Navigation,   label: "Navigation",   color: "#16a34a",             accent: "color-mix(in srgb,#16a34a 12%,transparent)",              hint: "Add waypoints and connect them into a walking network. Accessibility and emergency flags are properties of each waypoint/connection." },
  { id: "events",        icon: Star,         label: "Events",       color: "#d97706",             accent: "color-mix(in srgb,#d97706 12%,transparent)",              hint: "Add event pins and link them to existing campus locations" },
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
  { id: "admin",         label: "Administration",  category: "Administrative",color: "#1e3a8a", icon: "Building2",   defaultWidth: 110, defaultHeight: 75,  description: "Admin offices, registrar, and services" },
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
  // Outdoor areas
  {
    type: "ground-area", label: "Ground Area", category: "Outdoor Areas", color: "#86b879",
    svgPath: "M2 2 L38 2 L38 26 L2 26 Z",
    parts: [
      { d: "M2 2 L38 2 L38 26 L2 26 Z", fill: "#d8ead0" },
      { d: "M6 7 L34 7 M6 14 L34 14 M6 21 L34 21", fill: "none", stroke: "#86b879", strokeWidth: 0.8, strokeLinecap: "round", strokeLinejoin: "round" },
    ],
    defaultWidth: 40, defaultHeight: 28,
  },
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
    description: "Main campus of Pamantasan ng Lungsod ng Valenzuela — Student Center, Canteen, CABA, COED, CEIT buildings around the central Quadrangle.",
    address: "Tongco Street, Brgy. Maysan",
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
    updatedAt: "2026-08-10",
    publishedAt: "2024-12-15",
    createdBy: "Admin",
    // ── Markers (red dots = entrances, per the real campus map) ─────────────
    markers: [
      { id: "mm_gate", name: "Main Gate", type: "entrance", x: 110, y: 300, color: "#dc2626" },
      { id: "mm_quad", name: "Quadrangle", type: "landmark", x: 440, y: 355, color: "#16a34a" },
    ],
    // ── Visual paths: closed paths render as filled areas (Tongco St + Quadrangle),
    //    open polylines render as the red brick walkways. ───────────────────
    paths: [
      { id: "p_tongco", name: "Tongco Street", type: "road", points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 680 }, { x: 0, y: 680 }, { x: 0, y: 0 }], color: "#475569", width: 24 },
      { id: "p_quad", name: "Quadrangle", type: "green", points: [{ x: 310, y: 250 }, { x: 570, y: 250 }, { x: 570, y: 460 }, { x: 310, y: 460 }, { x: 310, y: 250 }], color: "#166534", width: 16 },
      // Red brick walkways
      { id: "p_gate", name: "Main Gate Walkway", type: "walkway", points: [{ x: 110, y: 300 }, { x: 310, y: 300 }], color: "#c2410c", width: 6 },
      { id: "p_perim", name: "Quadrangle Perimeter", type: "walkway", points: [{ x: 310, y: 250 }, { x: 570, y: 250 }, { x: 570, y: 460 }, { x: 310, y: 460 }], color: "#c2410c", width: 5 },
      { id: "p_scb", name: "SCB Walkway", type: "walkway", points: [{ x: 310, y: 250 }, { x: 280, y: 180 }], color: "#c2410c", width: 4 },
      { id: "p_canteen", name: "Canteen Walkway", type: "walkway", points: [{ x: 570, y: 250 }, { x: 520, y: 150 }], color: "#c2410c", width: 4 },
      { id: "p_coed", name: "COED Walkway", type: "walkway", points: [{ x: 570, y: 250 }, { x: 650, y: 125 }], color: "#c2410c", width: 4 },
      { id: "p_caba", name: "CABA Walkway", type: "walkway", points: [{ x: 310, y: 460 }, { x: 230, y: 495 }], color: "#c2410c", width: 4 },
      { id: "p_ceit", name: "CEIT Walkway", type: "walkway", points: [{ x: 570, y: 460 }, { x: 660, y: 445 }], color: "#c2410c", width: 4 },
      { id: "p_guard", name: "Guard House Walkway", type: "walkway", points: [{ x: 110, y: 300 }, { x: 130, y: 360 }], color: "#c2410c", width: 4 },
    ],
    buildings: [
      {
        id: "b_scb", name: "Student Center Building", code: "SCB", category: "Administrative",
        description: "Home of student services, organizations, and the Office of Student Affairs.",
        x: 170, y: 70, width: 240, height: 110, color: "#7c3aed", expanded: false,
        floors: [
          {
            id: "f_scb_1", buildingId: "b_scb", number: 1, label: "Ground Floor", paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
            rooms: [
              { id: "scb_r1", name: "Lobby", type: "lobby", x: 20, y: 60, w: 80, h: 50, floorId: "f_scb_1", buildingId: "b_scb" },
              { id: "scb_r2", name: "Registration", type: "office", x: 120, y: 60, w: 70, h: 45, floorId: "f_scb_1", buildingId: "b_scb" },
              { id: "scb_r3", name: "Student Lounge", type: "lounge", x: 200, y: 60, w: 90, h: 50, floorId: "f_scb_1", buildingId: "b_scb" },
              { id: "scb_r4", name: "Stairs A", type: "stairs", x: 310, y: 60, w: 30, h: 30, floorId: "f_scb_1", buildingId: "b_scb" },
              { id: "scb_r5", name: "Restroom", type: "restroom", x: 350, y: 60, w: 40, h: 30, floorId: "f_scb_1", buildingId: "b_scb" },
            ],
          },
          {
            id: "f_scb_2", buildingId: "b_scb", number: 2, label: "Floor 2", paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
            rooms: [
              { id: "scb_r6", name: "Org Room 201", type: "office", x: 20, y: 60, w: 80, h: 50, floorId: "f_scb_2", buildingId: "b_scb" },
              { id: "scb_r7", name: "Org Room 202", type: "office", x: 120, y: 60, w: 80, h: 50, floorId: "f_scb_2", buildingId: "b_scb" },
              { id: "scb_r8", name: "Stairs A", type: "stairs", x: 310, y: 60, w: 30, h: 30, floorId: "f_scb_2", buildingId: "b_scb" },
            ],
          },
          { id: "f_scb_3", buildingId: "b_scb", number: 3, label: "Floor 3", paths: [], rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] },
        ],
      },
      {
        id: "b_canteen", name: "University Canteen", code: "CANTEEN", category: "Facility",
        description: "Main dining area with food stalls and seating for students.",
        x: 480, y: 85, width: 110, height: 70, color: "#d97706", expanded: false,
        floors: [
          {
            id: "f_can_1", buildingId: "b_canteen", number: 1, label: "Ground Floor", paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
            rooms: [
              { id: "can_r1", name: "Dining Area", type: "canteen", x: 20, y: 40, w: 180, h: 90, floorId: "f_can_1", buildingId: "b_canteen" },
              { id: "can_r2", name: "Kitchen", type: "kitchen", x: 220, y: 40, w: 100, h: 70, floorId: "f_can_1", buildingId: "b_canteen" },
              { id: "can_r3", name: "Stairs", type: "stairs", x: 340, y: 40, w: 30, h: 30, floorId: "f_can_1", buildingId: "b_canteen" },
              { id: "can_r4", name: "Restroom", type: "restroom", x: 380, y: 40, w: 40, h: 30, floorId: "f_can_1", buildingId: "b_canteen" },
            ],
          },
        ],
      },
      {
        id: "b_caba", name: "CABA Building", code: "CABA", category: "Academic",
        description: "College of Accountancy and Business Administration — Ground Floor.",
        x: 130, y: 400, width: 100, height: 190, color: "#1e40af", expanded: false,
        floors: [
          {
            id: "f_caba_1", buildingId: "b_caba", number: 1, label: "Ground Floor", windows: [], furniture: [], ramps: [],
            canvasW: 600, canvasH: 260,
            paths: [
              { id: "path_hallway", points: [{ x: 8, y: 110 }, { x: 300, y: 110 }, { x: 592, y: 110 }], type: "walkway", color: "#94a3b8", width: 3 },
              { id: "path_veranda", points: [{ x: 257, y: 130 }, { x: 257, y: 245 }], type: "walkway", color: "#94a3b8", width: 2 },
              { id: "path_fire_l", points: [{ x: 8, y: 110 }, { x: 0, y: 110 }], type: "emergency", color: "#dc2626", width: 2 },
              { id: "path_fire_r", points: [{ x: 592, y: 110 }, { x: 600, y: 110 }], type: "emergency", color: "#dc2626", width: 2 },
            ],
            rooms: [
              // ── Upper Row (above hallway) ──────────────────────────────
              { id: "caba_r_stairs_l", name: "Stairs (Left)",             x: 8,   y: 10,  w: 34,  h: 80,  type: "stairs", floorId: "f_caba_1", buildingId: "b_caba"    },
              { id: "caba_r_elec",     name: "Electrical Room",           x: 42,  y: 10,  w: 50,  h: 36,  type: "storage", floorId: "f_caba_1", buildingId: "b_caba"   },
              { id: "caba_r_stor1",    name: "Storage (Left)",            x: 42,  y: 46,  w: 50,  h: 44,  type: "storage", floorId: "f_caba_1", buildingId: "b_caba"   },
              { id: "caba_r102",       name: "CABA-102",                  x: 92,  y: 10,  w: 106, h: 80,  type: "classroom", floorId: "f_caba_1", buildingId: "b_caba" },
              { id: "caba_r103",       name: "CABA-103",                  x: 198, y: 10,  w: 106, h: 80,  type: "classroom", floorId: "f_caba_1", buildingId: "b_caba" },
              { id: "caba_r104",       name: "CABA-104",                  x: 304, y: 10,  w: 106, h: 80,  type: "classroom", floorId: "f_caba_1", buildingId: "b_caba" },
              { id: "caba_r_cr_f",     name: "Female CR",                 x: 410, y: 10,  w: 26,  h: 80,  type: "restroom", floorId: "f_caba_1", buildingId: "b_caba"  },
              { id: "caba_r_cr_m",     name: "Male CR",                   x: 436, y: 10,  w: 27,  h: 45,  type: "restroom", floorId: "f_caba_1", buildingId: "b_caba"  },
              { id: "caba_r_pwd",      name: "PWD CR",                    x: 436, y: 55,  w: 27,  h: 35,  type: "restroom", floorId: "f_caba_1", buildingId: "b_caba"  },
              { id: "caba_r_elev",     name: "Elevator",                  x: 463, y: 35,  w: 45,  h: 55,  type: "elevator", floorId: "f_caba_1", buildingId: "b_caba"  },
              { id: "caba_r_stor_rt",  name: "Storage Room (Right Top)",  x: 508, y: 10,  w: 50,  h: 36,  type: "storage", floorId: "f_caba_1", buildingId: "b_caba"   },
              { id: "caba_r_stor_rb",  name: "Storage (Right)",           x: 508, y: 46,  w: 50,  h: 44,  type: "storage", floorId: "f_caba_1", buildingId: "b_caba"   },
              { id: "caba_r_stairs_r", name: "Stairs (Right)",            x: 558, y: 10,  w: 34,  h: 80,  type: "stairs", floorId: "f_caba_1", buildingId: "b_caba"    },

              // ── Middle Corridor / Hallway ─────────────────────────────
              { id: "caba_r_hallway",  name: "Hallway",                   x: 8,   y: 90,  w: 584, h: 40,  type: "hallway", floorId: "f_caba_1", buildingId: "b_caba"   },

              // ── Lower Row (below hallway) ──────────────────────────────
              { id: "caba_r_biz",      name: "Business Office Sim Room",  x: 8,   y: 130, w: 90,  h: 80,  type: "lab", floorId: "f_caba_1", buildingId: "b_caba"       },
              { id: "caba_r101",       name: "CABA-101",                  x: 98,  y: 130, w: 106, h: 80,  type: "classroom", floorId: "f_caba_1", buildingId: "b_caba" },
              { id: "caba_r_lobby",    name: "Lobby",                     x: 204, y: 130, w: 106, h: 80,  type: "lobby", floorId: "f_caba_1", buildingId: "b_caba"     },
              { id: "caba_r_veranda",  name: "Veranda",                   x: 204, y: 210, w: 106, h: 35,  type: "lobby", floorId: "f_caba_1", buildingId: "b_caba"     },
              { id: "caba_r_grad",     name: "Graduate Studies Office",   x: 310, y: 130, w: 78,  h: 80,  type: "office", floorId: "f_caba_1", buildingId: "b_caba"    },
              { id: "caba_r_sim",      name: "Simulation Room",           x: 388, y: 130, w: 170, h: 80,  type: "lab", floorId: "f_caba_1", buildingId: "b_caba"       },
            ],
            walls: [
              // ── Outer Perimeter ─────────────────────────────────────────
              { id: "wall_top",          x1: 8,   y1: 10,  x2: 592, y2: 10,  thickness: 4, color: "#1e293b" },
              { id: "wall_bot",          x1: 8,   y1: 210, x2: 558, y2: 210, thickness: 4, color: "#1e293b" },
              { id: "wall_left",         x1: 8,   y1: 10,  x2: 8,   y2: 210, thickness: 4, color: "#1e293b" },
              { id: "wall_right_top",    x1: 592, y1: 10,  x2: 592, y2: 130, thickness: 4, color: "#1e293b" },
              { id: "wall_right_bot",    x1: 558, y1: 130, x2: 558, y2: 210, thickness: 4, color: "#1e293b" },
              // ── Veranda Perimeter ───────────────────────────────────────
              { id: "wall_veranda_l",    x1: 204, y1: 210, x2: 204, y2: 245, thickness: 3, color: "#1e293b" },
              { id: "wall_veranda_r",    x1: 310, y1: 210, x2: 310, y2: 245, thickness: 3, color: "#1e293b" },
              { id: "wall_veranda_b",    x1: 204, y1: 245, x2: 310, y2: 245, thickness: 3, color: "#1e293b" },
              // ── Hallway Horizontal Walls ────────────────────────────────
              { id: "wall_hall_top",     x1: 8,   y1: 90,  x2: 592, y2: 90,  thickness: 3, color: "#475569" },
              { id: "wall_hall_bot",     x1: 8,   y1: 130, x2: 558, y2: 130, thickness: 3, color: "#475569" },
              // ── Upper Row Partitions ────────────────────────────────────
              { id: "w_u_stairs_l",      x1: 42,  y1: 10,  x2: 42,  y2: 90,  thickness: 2, color: "#64748b" },
              { id: "w_u_elec_stor",     x1: 42,  y1: 46,  x2: 92,  y2: 46,  thickness: 2, color: "#64748b" },
              { id: "w_u_stor1",         x1: 92,  y1: 10,  x2: 92,  y2: 90,  thickness: 2, color: "#64748b" },
              { id: "w_u_102",           x1: 198, y1: 10,  x2: 198, y2: 90,  thickness: 2, color: "#64748b" },
              { id: "w_u_103",           x1: 304, y1: 10,  x2: 304, y2: 90,  thickness: 2, color: "#64748b" },
              { id: "w_u_104",           x1: 410, y1: 10,  x2: 410, y2: 90,  thickness: 2, color: "#64748b" },
              { id: "w_u_cr_fm",         x1: 436, y1: 10,  x2: 436, y2: 90,  thickness: 2, color: "#64748b" },
              { id: "w_u_cr_pwd",        x1: 436, y1: 55,  x2: 463, y2: 55,  thickness: 2, color: "#64748b" },
              { id: "w_u_elev",          x1: 463, y1: 10,  x2: 463, y2: 90,  thickness: 2, color: "#64748b" },
              { id: "w_u_stor_r",        x1: 508, y1: 10,  x2: 508, y2: 90,  thickness: 2, color: "#64748b" },
              { id: "w_u_stor_rt_rb",    x1: 508, y1: 46,  x2: 558, y2: 46,  thickness: 2, color: "#64748b" },
              { id: "w_u_stairs_r",      x1: 558, y1: 10,  x2: 558, y2: 90,  thickness: 2, color: "#64748b" },
              // ── Lower Row Partitions ────────────────────────────────────
              { id: "w_l_biz",           x1: 98,  y1: 130, x2: 98,  y2: 210, thickness: 2, color: "#64748b" },
              { id: "w_l_101",           x1: 204, y1: 130, x2: 204, y2: 210, thickness: 2, color: "#64748b" },
              { id: "w_l_lobby",         x1: 310, y1: 130, x2: 310, y2: 210, thickness: 2, color: "#64748b" },
              { id: "w_l_grad",          x1: 388, y1: 130, x2: 388, y2: 210, thickness: 2, color: "#64748b" },
            ],
            doors: [
              // ── Upper Row Doors (Attached to wall_hall_top) ─────────────
              { id: "d_stairs_l", wallId: "wall_hall_top", offset: 0.029, x: 25,  y: 90, width: 14, doorType: "single", direction: "left", color: "#ec4899", label: "Stairs (Left)" },
              { id: "d_stor_l",   wallId: "wall_hall_top", offset: 0.101, x: 67,  y: 90, width: 14, doorType: "single", direction: "left", color: "#eab308", label: "Storage (Left)" },
              { id: "d_102_1",    wallId: "wall_hall_top", offset: 0.183, x: 115, y: 90, width: 16, doorType: "single", direction: "left", color: "#f59e0b", label: "CABA-102 (Door 1)" },
              { id: "d_102_2",    wallId: "wall_hall_top", offset: 0.286, x: 175, y: 90, width: 16, doorType: "single", direction: "right", color: "#f59e0b", label: "CABA-102 (Door 2)" },
              { id: "d_103_1",    wallId: "wall_hall_top", offset: 0.365, x: 221, y: 90, width: 16, doorType: "single", direction: "left", color: "#f59e0b", label: "CABA-103 (Door 1)" },
              { id: "d_103_2",    wallId: "wall_hall_top", offset: 0.467, x: 281, y: 90, width: 16, doorType: "single", direction: "right", color: "#f59e0b", label: "CABA-103 (Door 2)" },
              { id: "d_104_1",    wallId: "wall_hall_top", offset: 0.546, x: 327, y: 90, width: 16, doorType: "single", direction: "left", color: "#f59e0b", label: "CABA-104 (Door 1)" },
              { id: "d_104_2",    wallId: "wall_hall_top", offset: 0.649, x: 387, y: 90, width: 16, doorType: "single", direction: "right", color: "#f59e0b", label: "CABA-104 (Door 2)" },
              { id: "d_cr_f",     wallId: "wall_hall_top", offset: 0.711, x: 423, y: 90, width: 14, doorType: "single", direction: "left", color: "#94a3b8", label: "Female CR" },
              { id: "d_cr_m",     wallId: "wall_hall_top", offset: 0.755, x: 449, y: 90, width: 14, doorType: "single", direction: "right", color: "#94a3b8", label: "Male / PWD CR" },
              { id: "d_elev",     wallId: "wall_hall_top", offset: 0.817, x: 485, y: 90, width: 18, doorType: "double", direction: "double", color: "#8b5cf6", label: "Elevator Door" },
              { id: "d_stor_r",   wallId: "wall_hall_top", offset: 0.899, x: 533, y: 90, width: 14, doorType: "single", direction: "left", color: "#eab308", label: "Storage (Right)" },
              { id: "d_stairs_r", wallId: "wall_hall_top", offset: 0.971, x: 575, y: 90, width: 14, doorType: "single", direction: "right", color: "#ec4899", label: "Stairs (Right)" },
              // ── Lower Row Doors (Attached to wall_hall_bot) ─────────────
              { id: "d_biz_1",    wallId: "wall_hall_bot", offset: 0.040, x: 30,  y: 130, width: 16, doorType: "single", direction: "left", color: "#22c55e", label: "Business Office Sim (Door 1)" },
              { id: "d_biz_2",    wallId: "wall_hall_bot", offset: 0.124, x: 76,  y: 130, width: 16, doorType: "single", direction: "right", color: "#22c55e", label: "Business Office Sim (Door 2)" },
              { id: "d_101_1",    wallId: "wall_hall_bot", offset: 0.204, x: 120, y: 130, width: 16, doorType: "single", direction: "left", color: "#f59e0b", label: "CABA-101 (Door 1)" },
              { id: "d_101_2",    wallId: "wall_hall_bot", offset: 0.313, x: 180, y: 130, width: 16, doorType: "single", direction: "right", color: "#f59e0b", label: "CABA-101 (Door 2)" },
              { id: "d_lobby_in", wallId: "wall_hall_bot", offset: 0.453, x: 257, y: 130, width: 24, doorType: "double", direction: "double", color: "#22c55e", label: "Lobby Entrance" },
              { id: "d_grad",     wallId: "wall_hall_bot", offset: 0.620, x: 349, y: 130, width: 16, doorType: "single", direction: "left", color: "#6366f1", label: "Graduate Studies Office" },
              { id: "d_sim_1",    wallId: "wall_hall_bot", offset: 0.767, x: 430, y: 130, width: 16, doorType: "single", direction: "left", color: "#22c55e", label: "Simulation Room (Door 1)" },
              { id: "d_sim_2",    wallId: "wall_hall_bot", offset: 0.913, x: 510, y: 130, width: 16, doorType: "single", direction: "right", color: "#22c55e", label: "Simulation Room (Door 2)" },
              // ── Fire Exits & Main Veranda Exit ──────────────────────────
              { id: "d_fire_l",   wallId: "wall_left",     offset: 0.500, x: 8,   y: 110, width: 20, doorType: "double", direction: "double", color: "#dc2626", isEmergencyExit: true, label: "Fire Exit (Left)" },
              { id: "d_fire_r",   wallId: "wall_right_top", offset: 0.833, x: 592, y: 110, width: 20, doorType: "double", direction: "double", color: "#dc2626", isEmergencyExit: true, label: "Fire Exit (Right)" },
              { id: "d_veranda",  wallId: "wall_veranda_b", offset: 0.500, x: 257, y: 245, width: 24, doorType: "double", direction: "double", color: "#22c55e", label: "Main Exit to Veranda" },
            ],
            stairs: [
              { id: "stairs_left",  x: 8,   y: 10, width: 34, height: 80, direction: "both", label: "Stairs (Left)",  sharedId: "caba_stairs_l" },
              { id: "stairs_right", x: 558, y: 10, width: 34, height: 80, direction: "both", label: "Stairs (Right)", sharedId: "caba_stairs_r" },
            ],
            elevators: [
              { id: "elevator_main", x: 463, y: 35, width: 45, height: 55, doorWidth: 14, label: "Elevator", sharedId: "caba_elevator", accessible: true },
            ],
            labels: [
              { id: "lbl_hallway", x: 300, y: 110, text: "MAIN HALLWAY", fontSize: 11, color: "#64748b", rotation: 0 },
              { id: "lbl_veranda", x: 257, y: 228, text: "VERANDA", fontSize: 10, color: "#64748b", rotation: 0 },
            ],
          },
        ],
      },{
        id: "b_coed", name: "COED Building", code: "COED", category: "Academic",
        description: "College of Education — teacher education programs.",
        x: 620, y: 60, width: 230, height: 130, color: "#0d9488", expanded: false,
        floors: [
          {
            id: "f_coed_1", buildingId: "b_coed", number: 1, label: "Ground Floor", paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
            rooms: [
              { id: "coed_r1", name: "Lobby", type: "lobby", x: 20, y: 60, w: 80, h: 50, floorId: "f_coed_1", buildingId: "b_coed" },
              { id: "coed_r2", name: "Room 301", type: "classroom", x: 120, y: 60, w: 70, h: 45, floorId: "f_coed_1", buildingId: "b_coed" },
              { id: "coed_r3", name: "Room 302", type: "classroom", x: 200, y: 60, w: 70, h: 45, floorId: "f_coed_1", buildingId: "b_coed" },
              { id: "coed_r4", name: "Room 303", type: "classroom", x: 280, y: 60, w: 70, h: 45, floorId: "f_coed_1", buildingId: "b_coed" },
              { id: "coed_r5", name: "Stairs A", type: "stairs", x: 360, y: 60, w: 30, h: 30, floorId: "f_coed_1", buildingId: "b_coed" },
            ],
          },
          {
            id: "f_coed_2", buildingId: "b_coed", number: 2, label: "Floor 2", paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
            rooms: [
              { id: "coed_r6", name: "Room 401", type: "classroom", x: 20, y: 60, w: 80, h: 50, floorId: "f_coed_2", buildingId: "b_coed" },
              { id: "coed_r7", name: "Room 402", type: "classroom", x: 120, y: 60, w: 70, h: 45, floorId: "f_coed_2", buildingId: "b_coed" },
              { id: "coed_r8", name: "Room 403", type: "classroom", x: 200, y: 60, w: 70, h: 45, floorId: "f_coed_2", buildingId: "b_coed" },
              { id: "coed_r9", name: "Stairs A", type: "stairs", x: 360, y: 60, w: 30, h: 30, floorId: "f_coed_2", buildingId: "b_coed" },
            ],
          },
        ],
      },
      {
        id: "b_ceit", name: "CEIT Building", code: "CEIT", category: "Academic",
        description: "College of Engineering and Information Technology.",
        x: 660, y: 330, width: 100, height: 230, color: "#059669", expanded: false,
        floors: [
          {
            id: "f_ceit_1", buildingId: "b_ceit", number: 1, label: "Ground Floor", paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
            rooms: [
              { id: "ceit_r1", name: "Lobby", type: "lobby", x: 20, y: 60, w: 80, h: 50, floorId: "f_ceit_1", buildingId: "b_ceit" },
              { id: "ceit_r2", name: "Lab 501", type: "lab", x: 120, y: 60, w: 90, h: 55, floorId: "f_ceit_1", buildingId: "b_ceit" },
              { id: "ceit_r3", name: "Lab 502", type: "lab", x: 230, y: 60, w: 90, h: 55, floorId: "f_ceit_1", buildingId: "b_ceit" },
              { id: "ceit_r4", name: "Stairs A", type: "stairs", x: 340, y: 60, w: 30, h: 30, floorId: "f_ceit_1", buildingId: "b_ceit" },
            ],
          },
          {
            id: "f_ceit_2", buildingId: "b_ceit", number: 2, label: "Floor 2", paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
            rooms: [
              { id: "ceit_r5", name: "Lab 601", type: "lab", x: 20, y: 60, w: 90, h: 55, floorId: "f_ceit_2", buildingId: "b_ceit" },
              { id: "ceit_r6", name: "Lab 602", type: "lab", x: 130, y: 60, w: 90, h: 55, floorId: "f_ceit_2", buildingId: "b_ceit" },
              { id: "ceit_r7", name: "Stairs A", type: "stairs", x: 340, y: 60, w: 30, h: 30, floorId: "f_ceit_2", buildingId: "b_ceit" },
            ],
          },
        ],
      },
      {
        id: "b_guard", name: "Guard House", code: "GUARD", category: "Facility",
        description: "Security guard house at the main gate entrance.",
        x: 110, y: 300, width: 80, height: 55, color: "#64748b", expanded: false,
        floors: [
          {
            id: "f_guard_1", buildingId: "b_guard", number: 1, label: "Ground Floor", paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
            rooms: [
              { id: "guard_r1", name: "Guard Post", type: "office", x: 20, y: 60, w: 120, h: 70, floorId: "f_guard_1", buildingId: "b_guard" },
            ],
          },
        ],
      },
    ],
    // ── Navigation graph — edges follow ONLY the red brick walkways ─────────
    navNodes: [
      { id: "nn_gate", name: "Main Gate", type: "entrance", x: 110, y: 300, accessible: true, color: "#dc2626" },
      { id: "nn_guard", name: "Guard House Entrance", type: "entrance", x: 130, y: 360, buildingId: "b_guard", accessible: true, color: "#16a34a" },
      { id: "nn_scb", name: "SCB Entrance", type: "entrance", x: 280, y: 180, buildingId: "b_scb", accessible: true, color: "#16a34a" },
      { id: "nn_canteen", name: "Canteen Entrance", type: "entrance", x: 520, y: 150, buildingId: "b_canteen", accessible: true, color: "#16a34a" },
      { id: "nn_coed", name: "COED Entrance", type: "entrance", x: 650, y: 125, buildingId: "b_coed", accessible: true, color: "#16a34a" },
      { id: "nn_caba", name: "CABA Entrance", type: "entrance", x: 230, y: 495, buildingId: "b_caba", accessible: true, color: "#16a34a" },
      { id: "nn_ceit", name: "CEIT Entrance", type: "entrance", x: 660, y: 445, buildingId: "b_ceit", accessible: true, color: "#16a34a" },
      { id: "nn_jct_w", name: "West Junction", type: "outdoor", x: 310, y: 300, accessible: true, color: "#16a34a" },
      { id: "nn_qnw", name: "Quadrangle NW", type: "outdoor", x: 310, y: 250, accessible: true, color: "#16a34a" },
      { id: "nn_qne", name: "Quadrangle NE", type: "outdoor", x: 570, y: 250, accessible: true, color: "#16a34a" },
      { id: "nn_qse", name: "Quadrangle SE", type: "outdoor", x: 570, y: 460, accessible: true, color: "#16a34a" },
      { id: "nn_qsw", name: "Quadrangle SW", type: "outdoor", x: 310, y: 460, accessible: true, color: "#16a34a" },
    ],
    navEdges: [
      { id: "ne_gate_w", startNodeId: "nn_gate", endNodeId: "nn_jct_w", distance: 200, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#c2410c", width: 6 },
      { id: "ne_w_qnw", startNodeId: "nn_jct_w", endNodeId: "nn_qnw", distance: 50, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#c2410c", width: 5 },
      { id: "ne_w_qsw", startNodeId: "nn_jct_w", endNodeId: "nn_qsw", distance: 160, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#c2410c", width: 5 },
      { id: "ne_perim_n", startNodeId: "nn_qnw", endNodeId: "nn_qne", distance: 260, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#c2410c", width: 5 },
      { id: "ne_perim_e", startNodeId: "nn_qne", endNodeId: "nn_qse", distance: 210, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#c2410c", width: 5 },
      { id: "ne_perim_s", startNodeId: "nn_qse", endNodeId: "nn_qsw", distance: 260, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#c2410c", width: 5 },
      { id: "ne_perim_w", startNodeId: "nn_qsw", endNodeId: "nn_qnw", distance: 210, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#c2410c", width: 5 },
      { id: "ne_scb", startNodeId: "nn_qnw", endNodeId: "nn_scb", distance: 67, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#c2410c", width: 4 },
      { id: "ne_canteen", startNodeId: "nn_qne", endNodeId: "nn_canteen", distance: 103, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#c2410c", width: 4 },
      { id: "ne_coed", startNodeId: "nn_qne", endNodeId: "nn_coed", distance: 136, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#c2410c", width: 4 },
      { id: "ne_caba", startNodeId: "nn_qsw", endNodeId: "nn_caba", distance: 97, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#c2410c", width: 4 },
      { id: "ne_ceit", startNodeId: "nn_qse", endNodeId: "nn_ceit", distance: 84, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#c2410c", width: 4 },
      { id: "ne_gate_guard", startNodeId: "nn_gate", endNodeId: "nn_guard", distance: 60, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#c2410c", width: 4 },
    ],
    // ── Decorative assets (visual only) ─────────────────────────────────────
    decorAssets: [
      { id: "da_tl_01", type: "tree-large", x: 90, y: 60 },
      { id: "da_tl_02", type: "tree-large", x: 460, y: 60 },
      { id: "da_tl_03", type: "tree-large", x: 620, y: 250 },
      { id: "da_tl_04", type: "tree-large", x: 800, y: 320 },
      { id: "da_tl_05", type: "tree-large", x: 260, y: 620 },
      { id: "da_tr_01", type: "tree", x: 300, y: 330 },
      { id: "da_tr_02", type: "tree", x: 400, y: 300 },
      { id: "da_tr_03", type: "tree", x: 500, y: 400 },
      { id: "da_be_01", type: "bench", x: 340, y: 275 },
      { id: "da_be_02", type: "bench", x: 540, y: 275 },
      { id: "da_lp_01", type: "lamp-post", x: 200, y: 300 },
      { id: "da_lp_02", type: "lamp-post", x: 420, y: 300 },
      { id: "da_fn_01", type: "fountain", x: 440, y: 355 },
    ],
    // ── Assembly points (emergency gathering areas) ─────────────────────────
    assemblyPoints: [
      { id: "ap_quad", name: "Quadrangle", x: 440, y: 355, capacity: 800, accessible: true },
      { id: "ap_gate", name: "Main Gate Area", x: 110, y: 320, capacity: 200, accessible: true },
      { id: "ap_guard", name: "Guard House Area", x: 130, y: 380, capacity: 100, accessible: true },
    ],
    // ── Accessibility features ──────────────────────────────────────────────
    accessibilityFeatures: [
      { id: "af_scb_ramp", buildingId: "b_scb", type: "ramp", label: "SCB Entrance Ramp", status: "present", notes: "Wheelchair ramp at the main entrance" },
      { id: "af_caba_ramp", buildingId: "b_caba", type: "ramp", label: "CABA Entrance Ramp", status: "present" },
      { id: "af_ceit_elv", buildingId: "b_ceit", type: "elevator", label: "CEIT Elevator", status: "present", notes: "Elevator to all floors" },
      { id: "af_coed_ramp", buildingId: "b_coed", type: "ramp", label: "COED Side Ramp", status: "present" },
      { id: "af_scb_rstr", buildingId: "b_scb", type: "accessible_restroom", label: "SCB Accessible Restroom", status: "present" },
    ],
    // ── Predefined routes (all follow the brick walkways) ───────────────────
    routes: [
      {
        id: "rt_gate_scb", name: "Main Gate → Student Center",
        description: "From the main gate to the Student Center via the quadrangle walkway",
        fromBuildingId: "b_scb", toBuildingId: "",
        waypoints: [{ x: 110, y: 300 }, { x: 310, y: 300 }, { x: 310, y: 250 }, { x: 280, y: 180 }],
        type: "walking", distanceM: 140, durationMin: 2, color: "#c2410c", isActive: true,
      },
      {
        id: "rt_caba_coed", name: "CABA → COED",
        description: "Across the quadrangle diagonal to the College of Education",
        fromBuildingId: "b_caba", toBuildingId: "b_coed",
        waypoints: [{ x: 230, y: 495 }, { x: 310, y: 460 }, { x: 570, y: 250 }, { x: 650, y: 125 }],
        type: "walking", distanceM: 210, durationMin: 3, color: "#c2410c", isActive: true,
      },
      {
        id: "rt_scb_ceit", name: "Student Center → CEIT",
        description: "From the Student Center to the College of Engineering & IT",
        fromBuildingId: "b_scb", toBuildingId: "b_ceit",
        waypoints: [{ x: 280, y: 180 }, { x: 310, y: 250 }, { x: 570, y: 460 }, { x: 660, y: 445 }],
        type: "walking", distanceM: 180, durationMin: 3, color: "#c2410c", isActive: true,
      },
      {
        id: "rt_canteen_ceit", name: "Canteen → CEIT",
        description: "From the canteen to CEIT along the east walkway",
        fromBuildingId: "b_canteen", toBuildingId: "b_ceit",
        waypoints: [{ x: 520, y: 150 }, { x: 570, y: 250 }, { x: 570, y: 460 }, { x: 660, y: 445 }],
        type: "walking", distanceM: 130, durationMin: 2, color: "#c2410c", isActive: true,
      },
    ],
    // ── Event overlays ──────────────────────────────────────────────────────
    eventOverlays: [
      {
        id: "ev_foundation",
        title: "PLV Foundation Week",
        description: "Booth activities along the quadrangle walkway",
        dateStart: "2026-02-15",
        dateEnd: "2026-02-21",
        organizer: "Office of Student Affairs",
        markers: [
          { x: 330, y: 265, color: "#d97706", label: "Booth 1 — Student Council" },
          { x: 370, y: 265, color: "#d97706", label: "Booth 2 — Org Fair" },
          { x: 410, y: 265, color: "#d97706", label: "Booth 3 — Food Stalls" },
          { x: 450, y: 265, color: "#d97706", label: "Booth 4 — Games" },
          { x: 490, y: 265, color: "#d97706", label: "Booth 5 — Merch" },
          { x: 530, y: 265, color: "#d97706", label: "Booth 6 — Info Desk" },
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
            id: "fn_1_1", buildingId: "bn_1", number: 1, label: "Ground Floor", paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
            rooms: [
              { id: "rn1", name: "Chemistry Lab", type: "lab", x: 20, y: 40, w: 100, h: 60, floorId: "fn_1_1", buildingId: "bn_1" },
              { id: "rn2", name: "Physics Lab", type: "lab", x: 140, y: 40, w: 100, h: 60, floorId: "fn_1_1", buildingId: "bn_1" },
            ],
          },
        ],
      },
      {
        id: "bn_2", name: "Student Dormitory", code: "DORM", category: "Dormitory",
        description: "On-campus student housing.",
        x: 350, y: 100, width: 100, height: 80, color: "#1e3a8a", expanded: false,
        floors: [{ id: "fn_2_1", buildingId: "bn_2", number: 1, label: "Ground Floor", paths: [], rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
      },
    ],
  },
];
