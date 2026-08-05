import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MousePointer2, Hand, Square, Trash2, Undo2, Redo2, ZoomIn, ZoomOut,
  Maximize2, Grid3X3, PanelRightClose, PanelRightOpen, Plus, Minus,
  DoorOpen, SeparatorHorizontal, MoveVertical, Binary, Text, Sofa,
  Layers3, PaintBucket, Eye, EyeOff, Copy,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { genId, FURNITURE_CATEGORIES } from "../map-builder/constants";
import type { Campus, FloorPlan, FloorRoom, FloorWall, FloorDoor, FloorWindow, FloorFurniture, FloorStairs, FloorElevatorItem, FloorLabel } from "../map-builder/types";
import type { FurnitureCategory } from "../map-builder/types";

// ── Props ────────────────────────────────────────────────────────────────────

interface FloorPlansTabProps {
  campus: Campus;
  onUpdate: (campus: Campus) => void;
  /** When navigating from the Buildings tab, auto-select this building */
  initialBuildingId?: string;
  /** When navigating from the Buildings tab, auto-select this floor */
  initialFloorId?: string;
  /** Called after initial selection has been consumed (so the parent can clear the pending state) */
  onConsumedInitial?: () => void;
}

// ── Mode ─────────────────────────────────────────────────────────────────────

type EditMode = "structure" | "interior";

// ── Tool definitions ─────────────────────────────────────────────────────────

interface ToolDef {
  id: string;
  icon: React.ElementType;
  label: string;
}

const STRUCTURE_TOOLS: ToolDef[] = [
  { id: "select",   icon: MousePointer2,    label: "Select" },
  { id: "wall",     icon: SeparatorHorizontal, label: "Wall" },
  { id: "room",     icon: Square,           label: "Room" },
  { id: "door",     icon: DoorOpen,         label: "Door" },
  { id: "window",   icon: Eye,              label: "Window" },
  { id: "stairs",   icon: MoveVertical,     label: "Stairs" },
  { id: "elevator", icon: Binary,           label: "Elevator" },
  { id: "label",    icon: Text,             label: "Label" },
];

const INTERIOR_TOOLS: ToolDef[] = [
  { id: "select",    icon: MousePointer2, label: "Select" },
  { id: "furniture", icon: Sofa,          label: "Furniture" },
  { id: "room",      icon: Square,        label: "Room" },
  { id: "label",     icon: Text,          label: "Label" },
];

// ── Furniture quick-preset colors ────────────────────────────────────────────

const FURNITURE_COLORS = [
  "#1e3a5f", "#1e40af", "#2563eb", "#0284c7", "#0d9488",
  "#059669", "#16a34a", "#ca8a04", "#d97706", "#ea580c",
  "#dc2626", "#e11d48", "#9333ea", "#7c3aed", "#6366f1",
  "#64748b", "#475569", "#334155", "#1e293b", "#000000",
];

// ── Room type styles ─────────────────────────────────────────────────────────

const ROOM_STYLES: Record<string, { fill: string; stroke: string; text: string }> = {
  classroom:  { fill: "#dbeafe", stroke: "#93c5fd", text: "#1e40af" },
  lab:        { fill: "#fef9c3", stroke: "#fde047", text: "#854d0e" },
  office:     { fill: "#dcfce7", stroke: "#86efac", text: "#14532d" },
  restroom:   { fill: "#f0f9ff", stroke: "#7dd3fc", text: "#0c4a6e" },
  elevator:   { fill: "#f0fdf4", stroke: "#86efac", text: "#14532d" },
  stairs:     { fill: "#f3f4f6", stroke: "#9ca3af", text: "#374151" },
  hallway:    { fill: "#f8fafc", stroke: "#cbd5e1", text: "#64748b" },
  lobby:      { fill: "#fef6ee", stroke: "#fdba74", text: "#7c2d12" },
  storage:    { fill: "#fdf4ff", stroke: "#d8b4fe", text: "#6b21a8" },
  cafeteria:  { fill: "#fef3c7", stroke: "#fbbf24", text: "#92400e" },
  library:    { fill: "#ede9fe", stroke: "#a78bfa", text: "#5b21b6" },
};

// ── Wall angle snapping constants ────────────────────────────────────────────

const WALL_SNAP_ANGLE = 45; // degrees — snap to 45° increments when drawing walls

function snapAngleDeg(deg: number, increment: number): number {
  return Math.round(deg / increment) * increment;
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// ── Resize state type ────────────────────────────────────────────────────────

interface RoomResizeState {
  id: string;
  corner: string; // "nw" | "ne" | "sw" | "se"
  sx: number; // SVG-space start x
  sy: number; // SVG-space start y
  ox: number; // original room x
  oy: number; // original room y
  ow: number; // original room width
  oh: number; // original room height
}

// ══════════════════════════════════════════════════════════════════════════════

export function FloorPlansTab({ campus, onUpdate, initialBuildingId, initialFloorId, onConsumedInitial }: FloorPlansTabProps) {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(
    initialBuildingId ?? campus.buildings[0]?.id ?? null
  );
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(
    initialFloorId ?? campus.buildings[0]?.floors[0]?.id ?? null
  );

  // ── When initial props change (user navigated from Buildings tab), update selection ──
  useEffect(() => {
    if (initialBuildingId && initialFloorId) {
      setSelectedBuildingId(initialBuildingId);
      setSelectedFloorId(initialFloorId);
      onConsumedInitial?.();
    }
  }, [initialBuildingId, initialFloorId, onConsumedInitial]);
  const [mode, setMode] = useState<EditMode>("structure");
  const [tool, setTool] = useState("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [history, setHistory] = useState<FloorPlan[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [showFurniturePicker, setShowFurniturePicker] = useState(false);
  const [furnitureTemplate, setFurnitureTemplate] = useState<{
    type: string;
    name: string;
    width: number;
    height: number;
    color: string;
    category: string;
  } | null>(null);
  const [sidebarCategory, setSidebarCategory] = useState<string | null>(null);
  const [wallStart, setWallStart] = useState<{ x: number; y: number } | null>(null);
  const [wallPreview, setWallPreview] = useState<{ x: number; y: number } | null>(null);
  const [roomDrag, setRoomDrag] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<{
    type: string;
    id: string;
    origX: number;
    origY: number;
    sx: number;
    sy: number;
    /** Original wall endpoints (only for type === "wall") */
    origX1?: number;
    origY1?: number;
    origX2?: number;
    origY2?: number;
  } | null>(null);

  const resizing = useRef<RoomResizeState | null>(null);

  // ── Clear drawing state when tool changes (handles toolbar clicks too) ──
  useEffect(() => {
    setWallStart(null);
    setWallPreview(null);
    setRoomDrag(null);
  }, [tool]);

  const building = campus.buildings.find((b) => b.id === selectedBuildingId);
  const floor = building?.floors.find((f) => f.id === selectedFloorId);

  const SNAP = 10;

  // ── Push history ──────────────────────────────────────────────────────────
  const pushHistory = useCallback((fl: FloorPlan) => {
    setHistory((h) => {
      const truncated = h.slice(0, historyIdx + 1);
      truncated.push(structuredClone(fl));
      if (truncated.length > 30) truncated.shift();
      return truncated;
    });
    setHistoryIdx((i) => Math.min(i + 1, 29));
  }, [historyIdx]);

  // ── Update floor ──────────────────────────────────────────────────────────
  const updateFloor = useCallback((updates: Partial<FloorPlan>) => {
    if (!floor || !building) return;
    if (!history.length) pushHistory(floor);
    const updatedFloor = { ...floor, ...updates };
    const updatedFloors = building.floors.map((f) =>
      f.id === floor.id ? updatedFloor : f
    );
    const updatedBuildings = campus.buildings.map((b) =>
      b.id === building.id ? { ...b, floors: updatedFloors } : b
    );
    onUpdate({ ...campus, buildings: updatedBuildings });
  }, [floor, building, campus, onUpdate, history, pushHistory]);

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    if (historyIdx < 0 || !floor) return;
    const prevFloor = history[historyIdx];
    if (!prevFloor) return;
    updateFloor(prevFloor);
    setHistoryIdx((i) => i - 1);
  }, [history, historyIdx, floor, updateFloor]);

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1 || !floor) return;
    const nextFloor = history[historyIdx + 1];
    if (!nextFloor) return;
    updateFloor(nextFloor);
    setHistoryIdx((i) => i + 1);
  }, [history, historyIdx, floor, updateFloor]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (e.key === "Escape") {
        if (wallStart) {
          setWallStart(null);
          setWallPreview(null);
          return;
        }
      }
      switch (e.key.toLowerCase()) {
        case "v": setWallStart(null); setWallPreview(null); setTool("select"); break;
        case "w": if (mode === "structure") { setWallStart(null); setWallPreview(null); setTool("wall"); } break;
        case "r": setWallStart(null); setWallPreview(null); setTool("room"); break;
        case "d": if (mode === "structure") { setWallStart(null); setWallPreview(null); setTool("door"); } break;
        case "i": if (mode === "structure") { setWallStart(null); setWallPreview(null); setTool("window"); } break;
        case "s": if (mode === "structure") { setWallStart(null); setWallPreview(null); setTool("stairs"); } break;
        case "l": setWallStart(null); setWallPreview(null); setTool("label"); break;
        case "f": if (mode === "interior") { setWallStart(null); setWallPreview(null); setTool("furniture"); } break;
        case "+": case "=": setZoom((z) => Math.min(3, z + 0.1)); break;
        case "-": setZoom((z) => Math.max(0.3, z - 0.1)); break;
        case "delete": case "backspace":
          if (selectedId && floor) {
            updateFloor({
              rooms: floor.rooms.filter((r) => r.id !== selectedId),
              walls: floor.walls.filter((w) => w.id !== selectedId),
              doors: floor.doors.filter((d) => d.id !== selectedId),
              windows: floor.windows.filter((w) => w.id !== selectedId),
              furniture: floor.furniture.filter((f) => f.id !== selectedId),
              stairs: floor.stairs.filter((s) => s.id !== selectedId),
              elevators: floor.elevators.filter((e) => e.id !== selectedId),
              labels: floor.labels.filter((l) => l.id !== selectedId),
            });
            setSelectedId(null);
          }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, selectedId, floor, updateFloor, undo, redo, wallStart]);

  // ── SVG point ───────────────────────────────────────────────────────────
  const getPoint = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const cw = floor?.rooms.reduce((max, r) => Math.max(max, r.x + r.w), 400) ?? 400;
    const ch = floor?.rooms.reduce((max, r) => Math.max(max, r.y + r.h), 300) ?? 300;
    const scaleX = cw / rect.width;
    const scaleY = ch / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX / zoom,
      y: (e.clientY - rect.top) * scaleY / zoom,
    };
  }, [floor, zoom]);

  const snap = (v: number) => snapToGrid ? Math.round(v / SNAP) * SNAP : Math.round(v);

  // ── Canvas dimensions ───────────────────────────────────────────────────
  const floorW = Math.max(400, ...((floor?.rooms ?? []).map((r) => r.x + r.w)));
  const floorH = Math.max(300, ...((floor?.rooms ?? []).map((r) => r.y + r.h)));

  // ── Resize start handler ────────────────────────────────────────────────
  const onResizeStart = useCallback((e: React.MouseEvent, room: FloorRoom, corner: string) => {
    e.stopPropagation();
    if (tool !== "select") return;
    const pt = getPoint(e);
    resizing.current = {
      id: room.id,
      corner,
      sx: pt.x,
      sy: pt.y,
      ox: room.x,
      oy: room.y,
      ow: room.w,
      oh: room.h,
    };
  }, [tool, getPoint]);

  // ── SVG handlers ────────────────────────────────────────────────────────
  // ── Item mouse down (select, erase, drag-to-move) ────────────────────────
  const onItemDown = useCallback((e: React.MouseEvent, type: string, id: string, item: { x: number; y: number; x1?: number; y1?: number; x2?: number; y2?: number }) => {
    e.stopPropagation();
    if (tool === "erase" && floor) {
      pushHistory(floor);
      if (type === "room") updateFloor({ rooms: floor.rooms.filter((r) => r.id !== id) });
      else if (type === "door") updateFloor({ doors: floor.doors.filter((d) => d.id !== id) });
      else if (type === "furniture") updateFloor({ furniture: floor.furniture.filter((f) => f.id !== id) });
      else if (type === "stairs") updateFloor({ stairs: floor.stairs.filter((s) => s.id !== id) });
      else if (type === "elevator") updateFloor({ elevators: floor.elevators.filter((e) => e.id !== id) });
      else if (type === "label") updateFloor({ labels: floor.labels.filter((l) => l.id !== id) });
      else if (type === "wall") updateFloor({ walls: floor.walls.filter((w) => w.id !== id) });
      else if (type === "window") updateFloor({ windows: floor.windows.filter((w) => w.id !== id) });
      setSelectedId(null);
      return;
    }
    if (tool !== "select") return;
    setSelectedId(id);
    const pt = getPoint(e);
    dragging.current = {
      type, id,
      origX: item.x, origY: item.y,
      sx: pt.x, sy: pt.y,
      // Store original wall endpoints for drift-free dragging
      ...(type === "wall" ? { origX1: item.x1!, origY1: item.y1!, origX2: item.x2!, origY2: item.y2! } : {}),
    };
  }, [tool, floor, updateFloor, pushHistory, getPoint]);

  const handleSvgDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!floor) return;
    const pt = getPoint(e);
    const target = e.target as SVGElement;
    const isBg = target === svgRef.current || target.dataset.bg === "true";
    if (!isBg && tool === "select") return;

    if (tool === "room" && floor) {
      setRoomDrag({ sx: snap(pt.x), sy: snap(pt.y), cx: snap(pt.x), cy: snap(pt.y) });
      return;
    }

    if (tool === "wall" && floor) {
      if (!wallStart) {
        setWallStart({ x: snap(pt.x), y: snap(pt.y) });
      } else {
        pushHistory(floor);
        const endPt = wallPreview ?? { x: snap(pt.x), y: snap(pt.y) };
        const newWall: FloorWall = {
          id: genId("wl"),
          x1: wallStart.x,
          y1: wallStart.y,
          x2: endPt.x,
          y2: endPt.y,
          thickness: 4,
          color: "#64748b",
        };
        updateFloor({ walls: [...floor.walls, newWall] });
        setWallStart(null);
        setWallPreview(null);
      }
      return;
    }

    if (tool === "door" && floor) {
      pushHistory(floor);
      const newDoor: FloorDoor = {
        id: genId("dr"),
        x: snap(pt.x),
        y: snap(pt.y),
        width: 16,
        direction: "left",
        color: "#f59e0b",
      };
      updateFloor({ doors: [...floor.doors, newDoor] });
      return;
    }

    if (tool === "window" && floor) {
      pushHistory(floor);
      const newWindow: FloorWindow = {
        id: genId("wn"),
        x: snap(pt.x),
        y: snap(pt.y),
        width: 24,
        height: 6,
        color: "#06b6d4",
      };
      updateFloor({ windows: [...floor.windows, newWindow] });
      return;
    }

    if (tool === "stairs" && floor) {
      pushHistory(floor);
      const newStairs: FloorStairs = {
        id: genId("st"),
        x: snap(pt.x),
        y: snap(pt.y),
        width: 30,
        height: 30,
        direction: "both",
        label: "Stairs",
      };
      updateFloor({ stairs: [...floor.stairs, newStairs] });
      return;
    }

    if (tool === "elevator" && floor) {
      pushHistory(floor);
      const newElevator: FloorElevatorItem = {
        id: genId("el"),
        x: snap(pt.x),
        y: snap(pt.y),
        width: 24,
        height: 24,
        doorWidth: 8,
        label: "Elevator",
      };
      updateFloor({ elevators: [...floor.elevators, newElevator] });
      return;
    }

    if (tool === "label" && floor) {
      pushHistory(floor);
      const newLabel: FloorLabel = {
        id: genId("lb"),
        x: snap(pt.x),
        y: snap(pt.y),
        text: "Label",
        fontSize: 14,
        color: "#374151",
        rotation: 0,
      };
      updateFloor({ labels: [...floor.labels, newLabel] });
      setSelectedId(newLabel.id);
      return;
    }

    if (tool === "furniture" && floor) {
      setRoomDrag({ sx: snap(pt.x), sy: snap(pt.y), cx: snap(pt.x), cy: snap(pt.y) });
      return;
    }

    if (tool === "select" && isBg) {
      setSelectedId(null);
    }
  }, [floor, tool, getPoint, snap, updateFloor, pushHistory, wallStart, wallPreview]);

  const handleSvgMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!floor) return;
    const pt = getPoint(e);

    // Resize room via corner handles
    if (resizing.current && tool === "select" && floor) {
      const r = resizing.current;
      const dx = Math.round(pt.x - r.sx);
      const dy = Math.round(pt.y - r.sy);
      const MIN_DIM = 20;
      let newX = r.ox;
      let newY = r.oy;
      let newW = r.ow;
      let newH = r.oh;
      switch (r.corner) {
        case "se": newW = Math.max(MIN_DIM, r.ow + dx); newH = Math.max(MIN_DIM, r.oh + dy); break;
        case "sw": newX = r.ox + dx; newW = Math.max(MIN_DIM, r.ow - dx); newH = Math.max(MIN_DIM, r.oh + dy); break;
        case "ne": newW = Math.max(MIN_DIM, r.ow + dx); newY = r.oy + dy; newH = Math.max(MIN_DIM, r.oh - dy); break;
        case "nw": newX = r.ox + dx; newW = Math.max(MIN_DIM, r.ow - dx); newY = r.oy + dy; newH = Math.max(MIN_DIM, r.oh - dy); break;
      }
      updateFloor({ rooms: floor.rooms.map((rm) => rm.id === r.id ? { ...rm, x: newX, y: newY, w: newW, h: newH } : rm) });
      return;
    }

    // Drag-to-move items in select tool
    if (dragging.current && tool === "select") {
      const d = dragging.current;
      // Delta in SVG coordinate space (getPoint accounts for zoom + viewBox scaling)
      const dx = Math.round(pt.x - d.sx);
      const dy = Math.round(pt.y - d.sy);
      const newX = d.origX + dx;
      const newY = d.origY + dy;

      if (d.type === "room") {
        updateFloor({ rooms: floor.rooms.map((r) => r.id === d.id ? { ...r, x: newX, y: newY } : r) });
      } else if (d.type === "door") {
        updateFloor({ doors: floor.doors.map((r) => r.id === d.id ? { ...r, x: newX, y: newY } : r) });
      } else if (d.type === "furniture") {
        updateFloor({ furniture: floor.furniture.map((r) => r.id === d.id ? { ...r, x: newX, y: newY } : r) });
      } else if (d.type === "stairs") {
        updateFloor({ stairs: floor.stairs.map((r) => r.id === d.id ? { ...r, x: newX, y: newY } : r) });
      } else if (d.type === "elevator") {
        updateFloor({ elevators: floor.elevators.map((r) => r.id === d.id ? { ...r, x: newX, y: newY } : r) });
      } else if (d.type === "label") {
        updateFloor({ labels: floor.labels.map((r) => r.id === d.id ? { ...r, x: newX, y: newY } : r) });
      } else if (d.type === "wall") {
        updateFloor({ walls: floor.walls.map((w) => w.id === d.id ? {
          ...w,
          x1: Math.round(d.origX1! + (pt.x - d.sx)),
          y1: Math.round(d.origY1! + (pt.y - d.sy)),
          x2: Math.round(d.origX2! + (pt.x - d.sx)),
          y2: Math.round(d.origY2! + (pt.y - d.sy)),
        } : w) });
      } else if (d.type === "window") {
        updateFloor({ windows: floor.windows.map((r) => r.id === d.id ? { ...r, x: newX, y: newY } : r) });
      }
      return;
    }

    // Wall drawing preview with angle snapping
    if (wallStart && tool === "wall") {
      let ex = snap(pt.x);
      let ey = snap(pt.y);
      // Snap to 45° angles if Shift is not held
      if (!e.shiftKey) {
        const dx = ex - wallStart.x;
        const dy = ey - wallStart.y;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        const snappedAngle = snapAngleDeg(angle, WALL_SNAP_ANGLE);
        const len = Math.sqrt(dx * dx + dy * dy);
        ex = wallStart.x + Math.cos(snappedAngle * (Math.PI / 180)) * len;
        ey = wallStart.y + Math.sin(snappedAngle * (Math.PI / 180)) * len;
      }
      setWallPreview({ x: ex, y: ey });
      return;
    }

    // Room/furniture drag preview
    if (roomDrag && (tool === "room" || tool === "furniture")) {
      setRoomDrag({ ...roomDrag, cx: snap(pt.x), cy: snap(pt.y) });
      return;
    }
  }, [floor, tool, getPoint, snap, wallStart, roomDrag, updateFloor]);

  const handleSvgUp = useCallback(() => {
    dragging.current = null;
    resizing.current = null;
    if (!floor) return;

    // Finalize room creation from drag
    if (roomDrag && tool === "room") {
      pushHistory(floor);
      const rx = Math.min(roomDrag.sx, roomDrag.cx);
      const ry = Math.min(roomDrag.sy, roomDrag.cy);
      const rw = Math.max(Math.abs(roomDrag.cx - roomDrag.sx), 20);
      const rh = Math.max(Math.abs(roomDrag.cy - roomDrag.sy), 15);
      const newRoom: FloorRoom = {
        id: genId("rm"),
        name: "New Room",
        type: "classroom",
        x: Math.round(rx),
        y: Math.round(ry),
        w: Math.round(rw),
        h: Math.round(rh),
      };
      updateFloor({ rooms: [...floor.rooms, newRoom] });
      setSelectedId(newRoom.id);
      setTool("select");
      setShowRoomPicker(true);
      setTimeout(() => setShowRoomPicker(false), 1500);
      setRoomDrag(null);
      return;
    }

    // Finalize furniture creation from drag
    if (roomDrag && tool === "furniture") {
      pushHistory(floor);
      const rx = Math.min(roomDrag.sx, roomDrag.cx);
      const ry = Math.min(roomDrag.sy, roomDrag.cy);
      const tmpl = furnitureTemplate ?? {
        type: "desk", name: "Desk", width: 24, height: 14, color: "#8b5cf6", category: "tables",
      };
      const rw = Math.max(Math.abs(roomDrag.cx - roomDrag.sx), 10);
      const rh = Math.max(Math.abs(roomDrag.cy - roomDrag.sy), 10);
      const newFurniture: FloorFurniture = {
        id: genId("fn"),
        type: tmpl.type,
        name: tmpl.name,
        category: tmpl.category,
        x: Math.round(rx),
        y: Math.round(ry),
        width: Math.round(rw),
        height: Math.round(rh),
        rotation: 0,
        color: tmpl.color,
      };
      updateFloor({ furniture: [...floor.furniture, newFurniture] });
      setSelectedId(newFurniture.id);
      setTool("select");
      setShowFurniturePicker(true);
      setTimeout(() => setShowFurniturePicker(false), 1500);
      setRoomDrag(null);
      return;
    }

    setRoomDrag(null);
  }, [floor, tool, roomDrag, updateFloor, pushHistory, furnitureTemplate]);

  // ── If no building or floor selected, show selector ──────────────────────
  if (!building) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8">
          <Layers3 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-bold text-muted-foreground">No buildings available</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Add buildings in the Buildings tab first</p>
        </div>
      </div>
    );
  }

  if (!floor) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8">
          <Layers3 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-bold text-muted-foreground">No floor selected</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Select a floor from the dropdown above</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* ── Left sidebar — Building/Floor selector ──────────────────────────── */}
      <div className="w-56 border-r border-border bg-card p-3 space-y-3 shrink-0 overflow-y-auto">
        <select
          value={selectedBuildingId ?? ""}
          onChange={(e) => {
            const b = campus.buildings.find((b) => b.id === e.target.value);
            setSelectedBuildingId(e.target.value);
            setSelectedFloorId(b?.floors[0]?.id ?? null);
          }}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {campus.buildings.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        <div className="space-y-1">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Floors</p>
          {building.floors.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedFloorId(f.id)}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold transition-all text-left",
                selectedFloorId === f.id
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-foreground hover:bg-muted border border-transparent"
              )}
            >
              <Layers3 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{f.label}</span>
              <span className="ml-auto text-[9px] text-muted-foreground">{f.rooms.length}r</span>
            </button>
          ))}
        </div>

        {/* Mode toggle */}
        <div className="pt-2 border-t border-border">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Mode</p>
          <div className="flex rounded-lg bg-muted/50 p-0.5">
            {(["structure", "interior"] as EditMode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setTool("select"); }}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                  mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* ── Furniture categories (interior mode only) ── */}
        {mode === "interior" && (
          <div className="pt-2 border-t border-border">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Furniture
              {furnitureTemplate && (
                <span className="ml-1.5 text-[8px] font-normal normal-case text-primary">
                  · {furnitureTemplate.name}
                </span>
              )}
            </p>
            <div className="max-h-64 overflow-y-auto space-y-0.5 scrollbar-show-on-hover">
              {FURNITURE_CATEGORIES.map((cat: FurnitureCategory) => (
                <div key={cat.id}>
                  <button
                    onClick={() => setSidebarCategory(sidebarCategory === cat.id ? null : cat.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/60 transition-all text-left"
                  >
                    <span className="flex-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {cat.label}
                    </span>
                    <svg
                      className={cn(
                        "h-3 w-3 text-muted-foreground transition-transform",
                        sidebarCategory === cat.id && "rotate-90"
                      )}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                  {sidebarCategory === cat.id && (
                    <div className="pl-1 space-y-0.5">
                      {cat.items.map((item) => {
                        const isActive = furnitureTemplate?.type === item.type;
                        return (
                          <button
                            key={item.type}
                            onClick={() => {
                              setFurnitureTemplate({
                                type: item.type,
                                name: item.name,
                                width: item.width,
                                height: item.height,
                                color: item.color,
                                category: cat.id,
                              });
                              setTool("furniture");
                            }}
                            className={cn(
                              "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all text-left",
                              isActive
                                ? "bg-primary/10 border border-primary/20"
                                : "hover:bg-muted/50 border border-transparent"
                            )}
                          >
                            <div
                              className="w-3.5 h-3.5 rounded shrink-0"
                              style={{ background: item.color }}
                            />
                            <span className="flex-1 text-[10px] font-semibold text-foreground truncate">
                              {item.name}
                            </span>
                            <span className="text-[8px] text-muted-foreground font-mono shrink-0">
                              {item.width}×{item.height}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Main canvas ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 relative bg-[#f8f9fc] dark:bg-[#0f1117]">
        {/* Floating toolbar */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1.5 rounded-xl bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border border-border/60 shadow-lg shadow-black/5">
          {(mode === "structure" ? STRUCTURE_TOOLS : INTERIOR_TOOLS).map((t) => {
            const Icon = t.icon;
            const isActive = tool === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                title={t.label}
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
          <div className="w-px h-5 bg-border mx-1" />
          <button
            onClick={undo}
            disabled={historyIdx < 0}
            title="Undo (Ctrl+Z)"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30 transition-all"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={redo}
            disabled={historyIdx >= history.length - 1}
            title="Redo (Ctrl+Shift+Z)"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30 transition-all"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <button
            onClick={() => setSnapToGrid(!snapToGrid)}
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-lg transition-all",
              snapToGrid ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
        </div>

        {/* Zoom */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1.5 rounded-xl bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border border-border/60 shadow-lg">
          <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))} className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:bg-muted transition-all"><ZoomOut className="h-3.5 w-3.5" /></button>
          <span className="text-[11px] font-bold text-foreground min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(3, z + 0.1))} className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:bg-muted transition-all"><ZoomIn className="h-3.5 w-3.5" /></button>
          <div className="w-px h-4 bg-border mx-1" />
          <button onClick={() => setZoom(1)} className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:bg-muted transition-all"><Maximize2 className="h-3.5 w-3.5" /></button>
        </div>

        {/* SVG Canvas */}
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${floorW + 40} ${floorH + 40}`}
          preserveAspectRatio="xMidYMid meet"
          className="cursor-crosshair"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "center center",
          }}
          onMouseDown={handleSvgDown}
          onMouseMove={handleSvgMove}
          onMouseUp={handleSvgUp}
          onMouseLeave={handleSvgUp}
        >
          {/* Background */}
          <rect data-bg="true" width={floorW + 40} height={floorH + 40} fill="var(--background)" />

          {/* Grid */}
          {snapToGrid && (
            <>
              <defs>
                <pattern id="floor-grid" width={SNAP} height={SNAP} patternUnits="userSpaceOnUse">
                  <path d={`M ${SNAP} 0 L 0 0 0 ${SNAP}`} fill="none" stroke="var(--border)" strokeWidth="0.3" opacity="0.25" />
                </pattern>
              </defs>
              <rect width={floorW + 40} height={floorH + 40} fill="url(#floor-grid)" />
            </>
          )}

          {/* Room/furniture drag preview */}
          {roomDrag && (tool === "room" || tool === "furniture") && (() => {
            const rx = Math.min(roomDrag.sx, roomDrag.cx);
            const ry = Math.min(roomDrag.sy, roomDrag.cy);
            const rw = Math.abs(roomDrag.cx - roomDrag.sx);
            const rh = Math.abs(roomDrag.cy - roomDrag.sy);
            const isFurniture = tool === "furniture";
            const fColor = furnitureTemplate?.color ?? "#8b5cf6";
            return (
              <rect x={rx} y={ry} width={rw} height={rh} rx={isFurniture ? 4 : 2}
                fill={isFurniture ? fColor : "var(--primary)"} fillOpacity={0.1}
                stroke={isFurniture ? fColor : "var(--primary)"} strokeWidth={2} strokeDasharray="6 3" />
            );
          })()}

          {/* Wall drawing preview */}
          {wallStart && wallPreview && (
            <g>
              <line x1={wallStart.x} y1={wallStart.y} x2={wallPreview.x} y2={wallPreview.y}
                stroke="var(--primary)" strokeWidth={4} strokeLinecap="round"
                strokeDasharray="6 3" opacity={0.7} />
              <circle cx={wallStart.x} cy={wallStart.y} r={4} fill="var(--primary)" opacity={0.8} />
              <text x={(wallStart.x + wallPreview.x) / 2} y={(wallStart.y + wallPreview.y) / 2 - 8}
                textAnchor="middle" fill="var(--primary)" fontSize={7} fontWeight="700"
                className="pointer-events-none select-none">
                {Math.round(dist(wallStart.x, wallStart.y, wallPreview.x, wallPreview.y))}
              </text>
            </g>
          )}

          {/* Walls */}
          {floor.walls.map((wall) => (
            <line
              key={wall.id}
              x1={wall.x1}
              y1={wall.y1}
              x2={wall.x2}
              y2={wall.y2}
              stroke={selectedId === wall.id ? "#3b82f6" : wall.color}
              strokeWidth={wall.thickness}
              strokeLinecap="round"
              className={tool === "select" || tool === "erase" ? "cursor-pointer" : "cursor-crosshair"}
              onMouseDown={(e) => onItemDown(e, "wall", wall.id, { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2, x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 })}
            />
          ))}

          {/* Rooms */}
          {floor.rooms.map((room) => {
            const style = ROOM_STYLES[room.type] ?? ROOM_STYLES.classroom;
            const isSelected = selectedId === room.id;
            return (
              <g key={room.id} onMouseDown={(e) => onItemDown(e, "room", room.id, room)}>
                <rect
                  x={room.x}
                  y={room.y}
                  width={room.w}
                  height={room.h}
                  fill={isSelected ? "#dbeafe" : style.fill}
                  stroke={isSelected ? "#3b82f6" : style.stroke}
                  strokeWidth={isSelected ? 2 : 1.5}
                  rx="3"
                  className={cn("transition-all", tool === "select" ? "cursor-move" : tool === "erase" ? "cursor-pointer" : "cursor-crosshair")}
                />
                <text
                  x={room.x + room.w / 2}
                  y={room.y + room.h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={style.text}
                  fontSize="10"
                  fontWeight="600"
                  pointerEvents="none"
                >
                  {room.name}
                </text>
                <text
                  x={room.x + room.w / 2}
                  y={room.y + room.h / 2 + 12}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={style.text}
                  fontSize="7"
                  opacity="0.6"
                  pointerEvents="none"
                >
                  {room.type}
                </text>
                {/* Selection outline & resize handles — rendered after room body so they're clickable on top */}
                {isSelected && (
                  <>
                    <rect x={room.x - 3} y={room.y - 3} width={room.w + 6} height={room.h + 6} rx={2}
                      fill="none" stroke="#3b82f6" strokeWidth={2.5} pointerEvents="none" />
                    {["nw", "ne", "sw", "se"].map((corner) => {
                      const hs = 7;
                      const hx = corner.includes("e") ? room.x + room.w - hs / 2 : room.x - hs / 2;
                      const hy = corner.includes("s") ? room.y + room.h - hs / 2 : room.y - hs / 2;
                      return (
                        <rect key={corner} x={hx} y={hy} width={hs} height={hs} rx={1.5}
                          fill="white" stroke="#3b82f6" strokeWidth={2}
                          style={{ cursor: `${corner}-resize` }}
                          onMouseDown={(e) => onResizeStart(e, room, corner)} />
                      );
                    })}
                  </>
                )}
              </g>
            );
          })}

          {/* Doors */}
          {floor.doors.map((door) => (
            <g key={door.id} onMouseDown={(e) => onItemDown(e, "door", door.id, door)}>
              <rect
                x={door.x}
                y={door.y}
                width={door.width}
                height={4}
                fill={selectedId === door.id ? "#3b82f6" : door.color}
                rx="1"
                className={tool === "select" ? "cursor-move" : tool === "erase" ? "cursor-pointer" : "cursor-crosshair"}
              />
              {/* Door swing arc */}
              {door.direction === "left" && (
                <path d={`M ${door.x + door.width} ${door.y + 2} A ${door.width} ${door.width} 0 0 0 ${door.x} ${door.y + 2 - door.width}`}
                  fill="none" stroke={door.color} strokeWidth="1" strokeDasharray="3 2" opacity="0.4" />
              )}
            </g>
          ))}

          {/* Windows */}
          {floor.windows.map((win) => (
            <g key={win.id} onMouseDown={(e) => onItemDown(e, "window", win.id, win)}>
              <rect
                x={win.x}
                y={win.y}
                width={win.width}
                height={win.height}
                fill={selectedId === win.id ? "#3b82f6" : win.color}
                opacity="0.6"
                rx="1"
                className={tool === "select" ? "cursor-move" : tool === "erase" ? "cursor-pointer" : "cursor-crosshair"}
              />
              <line
                x1={win.x + 2}
                y1={win.y + win.height / 2}
                x2={win.x + win.width - 2}
                y2={win.y + win.height / 2}
                stroke="white"
                strokeWidth="1.5"
                opacity="0.8"
              />
            </g>
          ))}

          {/* Stairs */}
          {floor.stairs.map((stairs) => (
            <g key={stairs.id} onMouseDown={(e) => onItemDown(e, "stairs", stairs.id, stairs)}>
              <rect
                x={stairs.x}
                y={stairs.y}
                width={stairs.width}
                height={stairs.height}
                fill="#f3f4f6"
                stroke={selectedId === stairs.id ? "#3b82f6" : "#9ca3af"}
                strokeWidth={selectedId ? 2 : 1.5}
                rx="2"
                className={tool === "select" ? "cursor-move" : tool === "erase" ? "cursor-pointer" : "cursor-crosshair"}
              />
              {/* Stair lines */}
              {Array.from({ length: 5 }).map((_, i) => (
                <line key={i}
                  x1={stairs.x + 4}
                  y1={stairs.y + 4 + i * (stairs.height - 8) / 5}
                  x2={stairs.x + stairs.width - 4}
                  y2={stairs.y + 4 + i * (stairs.height - 8) / 5}
                  stroke="#9ca3af"
                  strokeWidth="1"
                  opacity="0.5"
                />
              ))}
              <text x={stairs.x + stairs.width / 2} y={stairs.y + stairs.height / 2}
                textAnchor="middle" dominantBaseline="middle" fill="#374151" fontSize="7" fontWeight="700">
                S
              </text>
            </g>
          ))}

          {/* Elevators */}
          {floor.elevators.map((el) => (
            <g key={el.id} onMouseDown={(e) => onItemDown(e, "elevator", el.id, el)}>
              <rect
                x={el.x}
                y={el.y}
                width={el.width}
                height={el.height}
                fill="#f0fdf4"
                stroke={selectedId === el.id ? "#3b82f6" : "#86efac"}
                strokeWidth={selectedId ? 2 : 1.5}
                rx="2"
                className={tool === "select" ? "cursor-move" : tool === "erase" ? "cursor-pointer" : "cursor-crosshair"}
              />
              {/* Door slit */}
              <line x1={el.x + el.width / 2} y1={el.y + 2}
                x2={el.x + el.width / 2} y2={el.y + el.height - 2}
                stroke="#86efac" strokeWidth="1.5" />
              <text x={el.x + el.width / 2} y={el.y + el.height / 2}
                textAnchor="middle" dominantBaseline="middle" fill="#14532d" fontSize="7" fontWeight="700">
                E
              </text>
            </g>
          ))}

          {/* Furniture */}
          {floor.furniture.map((item) => (
            <g key={item.id} onMouseDown={(e) => onItemDown(e, "furniture", item.id, item)}>
              <rect
                x={item.x}
                y={item.y}
                width={item.width}
                height={item.height}
                fill={selectedId === item.id ? "#c4b5fd" : item.color}
                stroke={selectedId === item.id ? "#7c3aed" : item.color + "80"}
                strokeWidth={selectedId ? 2 : 1}
                rx="2"
                className={cn("transition-all", tool === "select" ? "cursor-move" : tool === "erase" ? "cursor-pointer" : "cursor-crosshair")}
                style={{ transform: `rotate(${item.rotation}deg)` }}
              />
              <text x={item.x + item.width / 2} y={item.y + item.height / 2}
                textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="6" fontWeight="600">
                {item.name.charAt(0)}
              </text>
            </g>
          ))}

          {/* Labels */}
          {floor.labels.map((label) => (
            <g key={label.id} onMouseDown={(e) => onItemDown(e, "label", label.id, label)}>
              <text
                x={label.x}
                y={label.y}
                fill={selectedId === label.id ? "#3b82f6" : label.color}
                fontSize={label.fontSize}
                fontWeight="700"
                className={tool === "select" ? "cursor-move" : tool === "erase" ? "cursor-pointer" : "cursor-crosshair"}
                style={{ transform: `rotate(${label.rotation}deg)` }}
              >
                {label.text}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* ── Properties Panel ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showPanel && selectedId && floor && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="border-l border-border bg-card overflow-y-auto shrink-0"
          >
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">Properties</h3>
                <button onClick={() => setShowPanel(false)} className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:bg-muted transition-all">
                  <PanelRightClose className="h-4 w-4" />
                </button>
              </div>

              {/* Room properties */}
              {(() => {
                const room = floor.rooms.find((r) => r.id === selectedId);
                if (!room) return null;
                return (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Name</label>
                      <input type="text" value={room.name}
                        onChange={(e) => updateFloor({ rooms: floor.rooms.map((r) => r.id === room.id ? { ...r, name: e.target.value } : r) })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold mt-1 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Type</label>
                      <select value={room.type}
                        onChange={(e) => updateFloor({ rooms: floor.rooms.map((r) => r.id === room.id ? { ...r, type: e.target.value } : r) })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold mt-1 focus:outline-none focus:ring-2 focus:ring-primary/30">
                        {Object.keys(ROOM_STYLES).map((t) => (
                          <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">X</label>
                        <input type="number" value={room.x}
                          onChange={(e) => updateFloor({ rooms: floor.rooms.map((r) => r.id === room.id ? { ...r, x: Number(e.target.value) } : r) })}
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold mt-0.5 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Y</label>
                        <input type="number" value={room.y}
                          onChange={(e) => updateFloor({ rooms: floor.rooms.map((r) => r.id === room.id ? { ...r, y: Number(e.target.value) } : r) })}
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold mt-0.5 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">W</label>
                        <input type="number" value={room.w}
                          onChange={(e) => updateFloor({ rooms: floor.rooms.map((r) => r.id === room.id ? { ...r, w: Math.max(20, Number(e.target.value)) } : r) })}
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold mt-0.5 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">H</label>
                        <input type="number" value={room.h}
                          onChange={(e) => updateFloor({ rooms: floor.rooms.map((r) => r.id === room.id ? { ...r, h: Math.max(20, Number(e.target.value)) } : r) })}
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold mt-0.5 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                    </div>
                    <button
                      onClick={() => { updateFloor({ rooms: floor.rooms.filter((r) => r.id !== selectedId) }); setSelectedId(null); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Room
                    </button>
                  </div>
                );
              })()}

              {/* Label properties */}
              {(() => {
                const label = floor.labels.find((l) => l.id === selectedId);
                if (!label) return null;
                return (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Text</label>
                      <input type="text" value={label.text}
                        onChange={(e) => updateFloor({ labels: floor.labels.map((l) => l.id === label.id ? { ...l, text: e.target.value } : l) })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold mt-1 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Font Size</label>
                        <input type="number" value={label.fontSize}
                          onChange={(e) => updateFloor({ labels: floor.labels.map((l) => l.id === label.id ? { ...l, fontSize: Number(e.target.value) } : l) })}
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold mt-0.5 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Rotation</label>
                        <input type="number" value={label.rotation}
                          onChange={(e) => updateFloor({ labels: floor.labels.map((l) => l.id === label.id ? { ...l, rotation: Number(e.target.value) } : l) })}
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold mt-0.5 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                    </div>
                    <button
                      onClick={() => { updateFloor({ labels: floor.labels.filter((l) => l.id !== selectedId) }); setSelectedId(null); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Label
                    </button>
                  </div>
                );
              })()}

              {/* Furniture properties */}
              {(() => {
                const item = floor.furniture.find((f) => f.id === selectedId);
                if (!item) return null;
                return (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Name</label>
                      <input type="text" value={item.name}
                        onChange={(e) => updateFloor({ furniture: floor.furniture.map((f) => f.id === item.id ? { ...f, name: e.target.value } : f) })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold mt-1 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">W</label>
                        <input type="number" value={item.width} onChange={(e) => updateFloor({ furniture: floor.furniture.map((f) => f.id === item.id ? { ...f, width: Number(e.target.value) } : f) })}
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold mt-0.5 focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
                      <div><label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">H</label>
                        <input type="number" value={item.height} onChange={(e) => updateFloor({ furniture: floor.furniture.map((f) => f.id === item.id ? { ...f, height: Number(e.target.value) } : f) })}
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold mt-0.5 focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
                    </div>

                    {/* Quick-preset color palette */}
                    <div>
                      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <PaintBucket className="h-3 w-3" />
                        Color
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {FURNITURE_COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => updateFloor({ furniture: floor.furniture.map((f) => f.id === item.id ? { ...f, color: c } : f) })}
                            className={cn(
                              "w-6 h-6 rounded-lg border transition-all hover:scale-110 hover:shadow-md",
                              item.color.toLowerCase() === c.toLowerCase()
                                ? "border-foreground scale-110 ring-2 ring-foreground/20 shadow-md"
                                : c === "#000000"
                                  ? "border-border/40"
                                  : "border-transparent"
                            )}
                            style={{ backgroundColor: c }}
                            title={c}
                          />
                        ))}
                        {/* Current color indicator */}
                        <div className="w-6 h-6 rounded-lg border border-dashed border-border flex items-center justify-center" title={`Current: ${item.color}`}>
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => { updateFloor({ furniture: floor.furniture.filter((f) => f.id !== selectedId) }); setSelectedId(null); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                );
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
