import { MousePointer2, MapPin, Square, GitBranch, Trash2, Map, Navigation, Accessibility, Flame, Star } from "lucide-react";
import type { SimpleTool, EditorLayer, RoomTypeDescriptor, CanvasSizeOption, Campus, CampusBuilding, FloorPlan } from "./types";
import { INITIAL_MARKERS, INITIAL_PATHS, MARKER_STYLES } from "../../data/mapData";

// ── ID generator ────────────────────────────────────────────────────────────

export function genId(p = "x") {
  return `${p}_${Date.now().toString(36)}`;
}

// ── Canvas size options ─────────────────────────────────────────────────────

export const CANVAS_SIZES: CanvasSizeOption[] = [
  { id: "small",  label: "Small",  w: 600,  h: 450,  desc: "Single building or compact campus" },
  { id: "medium", label: "Medium", w: 900,  h: 680,  desc: "Standard university campus (recommended)" },
  { id: "large",  label: "Large",  w: 1200, h: 900,  desc: "Large multi-building campus" },
  { id: "custom", label: "Custom", w: 0,    h: 0,    desc: "Enter custom dimensions" },
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
  { id: "select",   icon: MousePointer2, label: "Select",   hint: "Click to select · Drag empty space to pan",                    key: "V" },
  { id: "marker",   icon: MapPin,        label: "Marker",   hint: "Click to place a location marker",                              key: "M" },
  { id: "building", icon: Square,        label: "Building", hint: "Click & drag on the canvas to draw a building",                 key: "B" },
  { id: "path",     icon: GitBranch,     label: "Path",     hint: "Click waypoints · Double-click to finish · Esc to cancel",      key: "P" },
  { id: "erase",    icon: Trash2,        label: "Erase",    hint: "Click any item to remove it",                                   key: "E" },
];

// ── Floor editor tools ──────────────────────────────────────────────────────

export const FLOOR_TOOLS: { id: SimpleTool; icon: React.ElementType; label: string; key: string }[] = [
  { id: "select", icon: MousePointer2, label: "Select", key: "V" },
  { id: "room",   icon: Square,        label: "Room",   key: "R" },
  { id: "path",   icon: GitBranch,     label: "Path",   key: "P" },
  { id: "erase",  icon: Trash2,        label: "Erase",  key: "E" },
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

// ── Avatar gradients ────────────────────────────────────────────────────────

export const AVATAR_GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-green-600",
  "from-amber-500 to-orange-600",
  "from-purple-500 to-violet-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-sky-600",
];

// ── SEED DATA: PLV Main Campus ──────────────────────────────────────────────

export const SEED_CAMPUSES: Campus[] = [
  {
    id: "campus_plv",
    name: "PLV Main Campus",
    code: "PLV-MAIN",
    description: "Main campus of Pamantasan ng Lungsod ng Valenzuela.",
    address: "Tongco Street, Karuhatan, Valenzuela City",
    status: "active",
    publishStatus: "published",
    canvasW: 900,
    canvasH: 680,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    createdAt: "2024-12-01",
    updatedAt: "2025-01-15",
    publishedAt: "2024-12-15",
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
];

