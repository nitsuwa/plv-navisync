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
  return `${p}_${Date.now().toString(36)}`;
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
    { id: "select",   icon: MousePointer2, label: "Select",   hint: "Click to select · Drag empty space to pan · Shift+click to multi-select", key: "V" },    { id: "pan",      icon: Hand,          label: "Pan",      hint: "Hold Space + drag to pan around the canvas",                                            key: "Space" },
    { id: "marker",   icon: MapPin,        label: "Marker",   hint: "Click to place a location marker",                                       key: "M" },
    { id: "building", icon: Square,        label: "Building", hint: "Click & drag on the canvas to draw a building",                          key: "B" },
    { id: "path",     icon: GitBranch,     label: "Path",     hint: "Click waypoints · Double-click to finish · Esc to cancel",               key: "P" },
    { id: "erase",    icon: Trash2,        label: "Erase",    hint: "Click any item to remove it",                                            key: "E" },
  ],
  navigation: [
    { id: "select",   icon: MousePointer2, label: "Select",   hint: "Click a route or waypoint to edit",                 key: "V" },
    { id: "pan",      icon: Hand,          label: "Pan",      hint: "Hold Space + drag to pan around the canvas",                     key: "Space" },
    { id: "path",     icon: GitBranch,     label: "Route",    hint: "Draw walkable route · Double-click to finish",      key: "P" },
    { id: "marker",   icon: MapPin,        label: "Waypoint", hint: "Click to place a navigation waypoint",              key: "W" },
    { id: "erase",    icon: Trash2,        label: "Erase",    hint: "Click a route or waypoint to remove",              key: "E" },
  ],
  accessibility: [
    { id: "select",   icon: MousePointer2, label: "Select",   hint: "Select a building to edit accessibility features", key: "V" },  { id: "pan",      icon: Hand,          label: "Pan",       hint: "Hold Space + drag to pan around the canvas",           key: "Space" },
    { id: "marker",   icon: MapPin,        label: "Ramp",     hint: "Click to place a ramp marker",                    key: "R" },
    { id: "room",     icon: Square,        label: "Elevator", hint: "Click to place an elevator marker",               key: "L" },
    { id: "erase",    icon: Trash2,        label: "Erase",    hint: "Click a feature to remove",                       key: "X" },
  ],
  emergency: [
    { id: "select",   icon: MousePointer2, label: "Select",   hint: "Select an emergency item",            key: "V" },
    { id: "pan",      icon: Hand,          label: "Pan",      hint: "Hold Space + drag to pan around the canvas",        key: "Space" },
    { id: "marker",   icon: MapPin,        label: "Exit",     hint: "Click to place an emergency exit",    key: "X" },
    { id: "building", icon: Square,        label: "Assembly", hint: "Click & drag to draw assembly area",  key: "A" },
    { id: "erase",    icon: Trash2,        label: "Erase",    hint: "Click an item to remove",             key: "E" },
  ],
  events: [
    { id: "select",   icon: MousePointer2, label: "Select",    hint: "Select an event marker",                  key: "V" },
    { id: "pan",      icon: Hand,          label: "Pan",       hint: "Hold Space + drag to pan around the canvas",           key: "Space" },
    { id: "marker",   icon: MapPin,        label: "Event Pin", hint: "Click to place an event marker",         key: "P" },
    { id: "building", icon: Square,        label: "Restrict",  hint: "Click & drag to draw restricted area",   key: "R" },
    { id: "erase",    icon: Trash2,        label: "Erase",     hint: "Click an event item to remove",         key: "E" },
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
  { id: "campus",        icon: Map,          label: "Campus",       color: "var(--primary)",     accent: "color-mix(in srgb,var(--primary) 12%,transparent)",      hint: "Place buildings, markers, and outdoor paths" },
  { id: "navigation",    icon: Navigation,   label: "Navigation",   color: "#16a34a",             accent: "color-mix(in srgb,#16a34a 12%,transparent)",              hint: "Draw walkable routes the navigation engine uses" },
  { id: "accessibility", icon: Accessibility,label: "Accessibility",color: "#2563eb",             accent: "color-mix(in srgb,#2563eb 12%,transparent)",              hint: "Mark ramps, accessible entrances, elevators" },
  { id: "emergency",     icon: Flame,        label: "Emergency",    color: "#dc2626",             accent: "color-mix(in srgb,#dc2626 12%,transparent)",              hint: "Place exits, assembly areas, fire extinguishers" },
  { id: "events",        icon: Star,         label: "Events",       color: "#d97706",             accent: "color-mix(in srgb,#d97706 12%,transparent)",              hint: "Add event markers and temporary overlays" },
];

// ── Building color palette ──────────────────────────────────────────────────

export const BUILDING_COLORS = [
  "#1e40af", "#1e3a8a", "#1d4ed8", "#2563eb", "#3b82f6", "#0e2a6e",
];

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

