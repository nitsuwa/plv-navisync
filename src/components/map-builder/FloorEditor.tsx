import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft, ChevronRight, CheckCircle2, Save, X, ZoomIn, ZoomOut, Undo2, Redo2,
  Grid3X3, Layers, Paintbrush, Sofa, SeparatorHorizontal, MoveVertical,
  DoorOpen, Binary, Text, Ruler, PanelRightClose, Navigation, LandPlot,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useCanvasControls, isSpacePressed } from "./useCanvasControls";
import { useFloorHistory } from "./useFloorHistory";
import {
  ROOM_TYPES, ROOM_MAP, FLOOR_STRUCTURE_TOOLS, FLOOR_INTERIOR_TOOLS,
  FURNITURE_CATEGORIES, WALL_COLORS, genId,
} from "./constants";
import { FloorPropertiesPanel } from "./FloorPropertiesPanel";
import { ContextMenu } from "./ContextMenu";
import { useToast } from "../../hooks/useToast";
import type {
  Campus, FloorPlan, FloorRoom, FloorPath,
  FloorWall, FloorDoor, FloorWindow, FloorFurniture,
  FloorStairs, FloorRamp, FloorElevatorItem, FloorLabel,
  FloorSelection, SimpleTool, FloorEditorMode,
  RoomResizeState, FloorUndoEntry,
} from "./types";

// ── Constants ───────────────────────────────────────────────────────────────

const FP_W = 580;
const FP_H = 380;
const SNAP_THRESHOLD = 8;
const WALL_SNAP_ANGLE = 45; // degrees — snap to 45° angles when drawing walls

// ── Snap helpers ────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Snap a value to the grid */
function snapToGrid(v: number, grid: number) {
  return Math.round(v / grid) * grid;
}

/** Snap a wall angle to the nearest 15° increment */
function snapAngleDeg(deg: number, increment: number = 15): number {
  return Math.round(deg / increment) * increment;
}

/** Distance between two points */
function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// ── Props ───────────────────────────────────────────────────────────────────

interface FloorEditorProps {
  campus: Campus;
  buildingId: string;
  floorId: string;
  onBack: () => void;
  onSwitchFloor: (floorId: string) => void;
  onUpdate: (c: Campus) => void;
  onSave?: (c: Campus) => Promise<Campus>;
}

// ── Component ───────────────────────────────────────────────────────────────

export function FloorEditor({ campus, buildingId, floorId, onBack, onSwitchFloor, onUpdate, onSave }: FloorEditorProps) {
  const building = campus.buildings.find((b) => b.id === buildingId)!;
  const floor = building?.floors.find((f) => f.id === floorId)!;

  // ── Core state ──
  const [mode, setMode] = useState<FloorEditorMode>("structure");
  const [tool, setTool] = useState<SimpleTool>("select");
  const [selected, setSelected] = useState<FloorSelection | null>(null);
  const [multiSelected, setMultiSelected] = useState<string[]>([]);
  const [snapOn, setSnapOn] = useState(true);
  const [wallSnap, setWallSnap] = useState(true);
  // ── Drawing state ──
  const [wallStart, setWallStart] = useState<{ x: number; y: number } | null>(null);
  // ── Context menu ──
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: "wall"; id: string } | null>(null);
  // ── Wall endpoint dragging ──
  const wallEndpointDrag = useRef<{ wallId: string; endpoint: "x1" | "x2"; origin: FloorWall } | null>(null);
  const [wallPreview, setWallPreview] = useState<{ x: number; y: number } | null>(null);
  const [roomDrag, setRoomDrag] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const [drawingPath, setDP] = useState<{ x: number; y: number }[]>([]);
  // ── Sidebar ──
  const [sidebarCategory, setSidebarCategory] = useState<string | null>(null);
  const [showProperties, setShowProperties] = useState(false);
  // ── Furniture placement ──
  const [furnitureTemplate, setFurnitureTemplate] = useState<{ type: string; name: string; width: number; height: number; color: string } | null>(null);
  // ── Saving ──
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const toast = useToast();

  // ── Floor data ──
  const rooms = floor.rooms;
  const fpaths = floor.paths;
  const walls = floor.walls ?? [];
  const doors = floor.doors ?? [];
  const windows = floor.windows ?? [];
  const furniture = floor.furniture ?? [];
  const stairs = floor.stairs ?? [];
  const ramps = floor.ramps ?? [];
  const elevators = floor.elevators ?? [];
  const labels = floor.labels ?? [];

  // ── Canvas controls ──
  const { zoom, pan, panning, svgRef, containerRef, getPoint, startPan, movePan, endPan, resetView, zoomIn, zoomOut } =
    useCanvasControls(FP_W, FP_H);

  // ── Data refs for drag operations ──
  const dragging = useRef<{ type: string; ids: string[]; origins: any[]; sx: number; sy: number } | null>(null);
  const resizing = useRef<RoomResizeState | null>(null);
  // ── Gesture history: during a drag we suppress per-frame history pushes and
  //    commit exactly ONE undo entry (the POST-gesture state) on pointer release,
  //    so undo restores the pre-gesture state and redo re-applies the gesture. ──
  const suppressHistoryRef = useRef(false);
  const gestureMoved = useRef(false);

  // ── History (full floor state so undo/redo restores every element type) ──
  const floorSnapshot = (): FloorUndoEntry => ({
    rooms, paths: fpaths, walls, doors, windows, furniture, stairs, ramps, elevators, labels,
  });
  const { pushHistory, undo, redo, resetHistory, canUndo, canRedo } = useFloorHistory(floorSnapshot());

  useEffect(() => { resetHistory(floorSnapshot()); }, [floorId]);

  const buildFloorUpdates = useCallback(
    (updates: Partial<FloorPlan>) => {
      const updatedCampus = {
        ...campus,
        buildings: campus.buildings.map((b) =>
          b.id === buildingId
            ? {
                ...b,
                floors: b.floors.map((f) =>
                  f.id === floorId
                    ? {
                        ...f,
                        rooms: updates.rooms ?? f.rooms,
                        paths: updates.paths ?? f.paths,
                        walls: updates.walls ?? f.walls ?? [],
                        doors: updates.doors ?? f.doors ?? [],
                        windows: updates.windows ?? f.windows ?? [],
                        furniture: updates.furniture ?? f.furniture ?? [],
                        stairs: updates.stairs ?? f.stairs ?? [],
                        ramps: updates.ramps ?? f.ramps ?? [],
                        elevators: updates.elevators ?? f.elevators ?? [],
                        labels: updates.labels ?? f.labels ?? [],
                      }
                    : f
                ),
              }
            : b
        ),
      };
      onUpdate(updatedCampus);
      return updatedCampus;
    },
    [campus, buildingId, floorId, onUpdate]
  );

  const updFloor = useCallback(
    (newRooms: FloorRoom[], newPaths: FloorPath[], newWalls?: FloorWall[], newDoors?: FloorDoor[], newWindows?: FloorWindow[],
     newFurniture?: FloorFurniture[], newStairs?: FloorStairs[], newElevators?: FloorElevatorItem[], newLabels?: FloorLabel[], newRamps?: FloorRamp[]) => {
      const next: FloorUndoEntry = {
        rooms: newRooms, paths: newPaths,
        walls: newWalls ?? walls, doors: newDoors ?? doors,
        windows: newWindows ?? windows, furniture: newFurniture ?? furniture,
        stairs: newStairs ?? stairs, elevators: newElevators ?? elevators, labels: newLabels ?? labels,
        ramps: newRamps ?? ramps,
      };
      // Record the POST-change state as the new history tip (unless we are in the
      // middle of a drag gesture — that commit happens once on pointer release).
      if (!suppressHistoryRef.current) pushHistory(next);
      buildFloorUpdates(next);
    },
    [buildFloorUpdates, walls, doors, windows, furniture, stairs, elevators, labels, pushHistory]
  );

  // Apply a history entry to the floor (shared by toolbar buttons + shortcuts).
  // History pushes are suppressed while applying so undo/redo never record
  // themselves as a new edit.
  const applyEntry = useCallback((entry: FloorUndoEntry | null) => {
    if (!entry) return;
    suppressHistoryRef.current = true;
    updFloor(entry.rooms, entry.paths, entry.walls, entry.doors, entry.windows,
      entry.furniture, entry.stairs, entry.elevators, entry.labels, entry.ramps);
    suppressHistoryRef.current = false;
  }, [updFloor]);

  // ── Toggle navigation connection for a room ──
  const onToggleNavConnection = useCallback((room: FloorRoom) => {
    if (room.navConnection) {
      // Disconnect — remove the nav connection
      const { navConnection: _, ...rest } = room;
      updFloor(
        rooms.map((r) => r.id === room.id ? rest : r),
        fpaths
      );
      toast.info("Navigation disconnected", `${room.name} is no longer a navigation destination.`);
    } else {
      // Connect — auto-detect door position
      const cx = FP_W / 2;
      const cy = FP_H / 2;
      const edges = [
        { x: room.x + room.w / 2, y: room.y },             // top
        { x: room.x + room.w / 2, y: room.y + room.h },    // bottom
        { x: room.x,              y: room.y + room.h / 2 }, // left
        { x: room.x + room.w,     y: room.y + room.h / 2 }, // right
      ];
      let bestDist = Infinity;
      let best = edges[0];
      for (const pt of edges) {
        const d = Math.sqrt((pt.x - cx) ** 2 + (pt.y - cy) ** 2);
        if (d < bestDist) { bestDist = d; best = pt; }
      }
      const connected: FloorRoom = { ...room, navConnection: { x: Math.round(best.x), y: Math.round(best.y) } };
      updFloor(
        rooms.map((r) => r.id === room.id ? connected : r),
        fpaths
      );
      toast.success("Connected to Navigation", `${room.name} is now a reachable destination.`);
    }
  }, [rooms, fpaths, updFloor, pushHistory, toast]);

  // ── Save ──
  const handleSave = async () => {
    setSaving(true);
    try {
      const candidate = buildFloorUpdates({});
      const savedCampus = onSave ? await onSave(candidate) : candidate;
      onUpdate(savedCampus);
      setSaving(false);
      setSaved(true);
      toast.success("Floor saved", `${floor.label} changes saved successfully.`);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setSaving(false);
      toast.error("Could not save floor", error instanceof Error ? error.message : "The database rejected the save.");
    }
  };

  // ── SVG Mouse handlers ──

  const handleSvgDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isSpacePressed()) { e.preventDefault(); startPan(e); return; }
    const target = e.target as SVGElement;
    // "Empty canvas" = the svg itself or anything inside the decorative
    // background group (outer rect, grid lines, floor-area rects). Item <g>s are
    // siblings of that group, so object clicks never match and never deselect.
    const isBg = target === svgRef.current || target.dataset.bg === "true"
      || target.closest?.('[data-bg="true"]') != null;

    if (tool === "pan") { if (isBg) startPan(e); return; }
    if (tool === "select" || tool === "erase") {
      if (isBg && !e.shiftKey) setSelected(null);
      if (isBg) startPan(e);
      return;
    }

    const pt = getPoint(e, FP_W, FP_H);
    const s = (v: number) => snapOn ? snapToGrid(v, 10) : Math.round(v);
    const clamped = { x: clamp(s(pt.x), 0, FP_W), y: clamp(s(pt.y), 0, FP_H) };

    if (tool === "wall") {
      if (!wallStart) {
        setWallStart(clamped);
      } else {
        // Complete the wall
        const endPt = wallPreview ?? clamped;
        const newWall: FloorWall = {
          id: genId("wl"),
          x1: wallStart.x, y1: wallStart.y,
          x2: endPt.x, y2: endPt.y,
          thickness: 4, color: "#64748b", material: "concrete",
        };
        updFloor(rooms, fpaths, [...walls, newWall]);
        setWallStart(null);
        setWallPreview(null);
      }
      return;
    }

    if (tool === "room") {
      setRoomDrag({ sx: clamped.x, sy: clamped.y, cx: clamped.x, cy: clamped.y });
      return;
    }

    if (tool === "door") {
      const newDoor: FloorDoor = {
        id: genId("dr"), x: clamped.x, y: clamped.y,
        width: 8, direction: "left", color: "#d97706",
      };
      updFloor(rooms, fpaths, walls, [...doors, newDoor]);
      setSelected({ type: "door", id: newDoor.id });
      return;
    }

    if (tool === "window") {
      const newWindow: FloorWindow = {
        id: genId("wn"), x: clamped.x, y: clamped.y,
        width: 12, height: 4, color: "#7dd3fc",
      };
      updFloor(rooms, fpaths, walls, doors, [...windows, newWindow]);
      setSelected({ type: "window", id: newWindow.id });
      return;
    }

    if (tool === "stairs" || tool === "ramp") {
      setRoomDrag({ sx: clamped.x, sy: clamped.y, cx: clamped.x, cy: clamped.y });
      return;
    }

    if (tool === "elevator") {
      setRoomDrag({ sx: clamped.x, sy: clamped.y, cx: clamped.x, cy: clamped.y });
      return;
    }

    if (tool === "furniture" && furnitureTemplate) {
      const newItem: FloorFurniture = {
        id: genId("fn"),
        type: furnitureTemplate.type,
        name: furnitureTemplate.name,
        category: FURNITURE_CATEGORIES.find((c) => c.items.some((i) => i.type === furnitureTemplate.type))?.id ?? "seating",
        x: clamped.x - furnitureTemplate.width / 2,
        y: clamped.y - furnitureTemplate.height / 2,
        width: furnitureTemplate.width,
        height: furnitureTemplate.height,
        rotation: 0,
        color: furnitureTemplate.color,
      };
      updFloor(rooms, fpaths, walls, doors, windows, [...furniture, newItem]);
      setSelected({ type: "furniture", id: newItem.id });
      setTool("select");
      return;
    }

    if (tool === "text") {
      const newLabel: FloorLabel = {
        id: genId("lb"), x: clamped.x, y: clamped.y,
        text: "Label", fontSize: 12, color: "#374151", rotation: 0,
      };
      updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, [...labels, newLabel]);
      setSelected({ type: "label", id: newLabel.id });
      setTool("select");
      return;
    }

    if (tool === "path") {
      setDP((p) => [...p, { x: Math.round(pt.x), y: Math.round(pt.y) }]);
      return;
    }
  };

  const handleSvgMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const pt = getPoint(e, FP_W, FP_H);
    setCursorPos({ x: Math.round(pt.x), y: Math.round(pt.y) });

    // Wall drawing preview with angle snapping
    if (wallStart && tool === "wall") {
      const s = (v: number) => snapOn ? snapToGrid(v, 5) : Math.round(v);
      let ex = s(pt.x), ey = s(pt.y);
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
      setWallPreview({ x: clamp(ex, 0, FP_W), y: clamp(ey, 0, FP_H) });
      return;
    }

    // Wall endpoint drag
    if (wallEndpointDrag.current) {
      const ep = wallEndpointDrag.current;
      const s = (v: number) => snapOn ? snapToGrid(v, 5) : Math.round(v);
      let newX = s(pt.x);
      let newY = s(pt.y);
      // 45° angle snap (same as wall drawing) — pivot around the FIXED endpoint
      if (!e.shiftKey) {
        const fixedX = ep.endpoint === "x1" ? ep.origin.x2 : ep.origin.x1;
        const fixedY = ep.endpoint === "x1" ? ep.origin.y2 : ep.origin.y1;
        const dx = newX - fixedX;
        const dy = newY - fixedY;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        const snappedAngle = snapAngleDeg(angle, WALL_SNAP_ANGLE);
        const len = Math.sqrt(dx * dx + dy * dy);
        newX = fixedX + Math.cos(snappedAngle * (Math.PI / 180)) * len;
        newY = fixedY + Math.sin(snappedAngle * (Math.PI / 180)) * len;
      }
      const clampedX = clamp(Math.round(newX), 0, FP_W);
      const clampedY = clamp(Math.round(newY), 0, FP_H);
      const originPt = ep.endpoint === "x1" ? { x: ep.origin.x1, y: ep.origin.y1 } : { x: ep.origin.x2, y: ep.origin.y2 };
      if (originPt.x !== clampedX || originPt.y !== clampedY) gestureMoved.current = true;
      // Update the wall endpoint in real time
      updFloor(rooms, fpaths,
        walls.map((w) => {
          if (w.id !== ep.wallId) return w;
          if (ep.endpoint === "x1") return { ...w, x1: clampedX, y1: clampedY };
          return { ...w, x2: clampedX, y2: clampedY };
        })
      );
      return;
    }

    // Room/stairs/elevator drag preview
    if (roomDrag && (tool === "room" || tool === "stairs" || tool === "elevator")) {
      const s = (v: number) => snapOn ? snapToGrid(v, 10) : Math.round(v);
      setRoomDrag({ ...roomDrag, cx: s(pt.x), cy: s(pt.y) });
      return;
    }

    movePan(e);
    if (!dragging.current) return;
    const drag = dragging.current;
    const dx = Math.round(pt.x - drag.sx);
    const dy = Math.round(pt.y - drag.sy);
    // Walls are endpoint-based (x1/y1/x2/y2) — never write NaN x/y onto them.
    // The generic { x, y } translate polluted wall objects with NaN coordinates,
    // which later serialized as JSON null and broke the map_elements NOT NULL x.
    const moved = drag.origins.map((orig: any) =>
      drag.type === "wall"
        ? { ...orig, x1: orig.x1 + dx, y1: orig.y1 + dy, x2: orig.x2 + dx, y2: orig.y2 + dy }
        : { ...orig, x: orig.x + dx, y: orig.y + dy }
    );
    if (dx !== 0 || dy !== 0) gestureMoved.current = true;
    // Apply to rooms
    if (drag.type === "room") {
      updFloor(
        rooms.map((r) => { const idx = drag.ids.indexOf(r.id); return idx >= 0 ? moved[idx] : r; }),
        fpaths
      );
    } else if (drag.type === "wall") {
      updFloor(rooms, fpaths,
        walls.map((w) => { const idx = drag.ids.indexOf(w.id); return idx >= 0 ? moved[idx] : w; })
      );
    } else if (drag.type === "door") {
      updFloor(rooms, fpaths, walls,
        doors.map((d) => { const idx = drag.ids.indexOf(d.id); return idx >= 0 ? moved[idx] : d; })
      );
    } else if (drag.type === "furniture") {
      updFloor(rooms, fpaths, walls, doors, windows,
        furniture.map((f) => { const idx = drag.ids.indexOf(f.id); return idx >= 0 ? moved[idx] : f; })
      );
    }
  };

  const handleSvgUp = () => {
    endPan();
    // Commit exactly ONE history entry per completed gesture: the POST-gesture
    // state (per-frame pushes were suppressed during the drag). Undo therefore
    // restores the pre-gesture snapshot and redo re-applies the gesture.
    if (gestureMoved.current) {
      pushHistory(floorSnapshot()); /* post-gesture commit */
    }
    suppressHistoryRef.current = false;
    gestureMoved.current = false;
    wallEndpointDrag.current = null;
    dragging.current = null;
    if (resizing.current) { resizing.current = null; return; }

    // Finalize room/stairs/elevator creation
    if (roomDrag && tool === "room") {
      const rx = Math.min(roomDrag.sx, roomDrag.cx);
      const ry = Math.min(roomDrag.sy, roomDrag.cy);
      const rw = Math.max(Math.abs(roomDrag.cx - roomDrag.sx), 20);
      const rh = Math.max(Math.abs(roomDrag.cy - roomDrag.sy), 15);
      const newRoom: FloorRoom = {
        id: genId("rm"), name: "Room",
        type: "classroom", x: Math.round(rx), y: Math.round(ry),
        w: Math.round(rw), h: Math.round(rh),
        floorId,
        buildingId,
      };
      updFloor([...rooms, newRoom], fpaths);
      setSelected({ type: "room", id: newRoom.id });
      setTool("select");
      setRoomDrag(null);
      toast.success("Room created", "Edit properties in the right panel.");
      return;
    }

    if (roomDrag && tool === "stairs") {
      const rx = Math.min(roomDrag.sx, roomDrag.cx);
      const ry = Math.min(roomDrag.sy, roomDrag.cy);
      const rw = Math.max(Math.abs(roomDrag.cx - roomDrag.sx), 16);
      const rh = Math.max(Math.abs(roomDrag.cy - roomDrag.sy), 12);
      // Auto-generate a sharedId so this stair can be linked across floors
      const stairSharedId = `shared_stair_${buildingId}_${(        stairs.filter(s => s.label === 'Stairs').length + 1)}`;
      const newStairs: FloorStairs = {
        id: genId("st"), x: Math.round(rx), y: Math.round(ry),
        width: Math.round(rw), height: Math.round(rh),
        direction: "both", label: "Stairs",
        sharedId: stairSharedId,
      };
      updFloor(rooms, fpaths, walls, doors, windows, furniture, [...stairs, newStairs]);
      setSelected({ type: "stairs", id: newStairs.id });
      setTool("select");
      setRoomDrag(null);
      return;
    }

    if (roomDrag && tool === "ramp") {
      const rx = Math.min(roomDrag.sx, roomDrag.cx);
      const ry = Math.min(roomDrag.sy, roomDrag.cy);
      const rw = Math.max(Math.abs(roomDrag.cx - roomDrag.sx), 16);
      const rh = Math.max(Math.abs(roomDrag.cy - roomDrag.sy), 12);
      const rampSharedId = `shared_ramp_${buildingId}_${(ramps.filter(r => r.label === 'Ramp').length + 1)}`;
      const newRamp: FloorRamp = {
        id: genId("rmp"), x: Math.round(rx), y: Math.round(ry),
        width: Math.round(rw), height: Math.round(rh),
        label: "Ramp", direction: "both",
        sharedId: rampSharedId,
        handrails: true,
        slope: "gentle",
        accessible: true,
      };
      updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels, [...ramps, newRamp]);
      setSelected({ type: "ramp", id: newRamp.id });
      setTool("select");
      setRoomDrag(null);
      return;
    }

    if (roomDrag && tool === "elevator") {
      const rx = Math.min(roomDrag.sx, roomDrag.cx);
      const ry = Math.min(roomDrag.sy, roomDrag.cy);
      const rw = Math.max(Math.abs(roomDrag.cx - roomDrag.sx), 14);
      const rh = Math.max(Math.abs(roomDrag.cy - roomDrag.sy), 14);
      // Auto-generate a sharedId so this elevator can be linked across floors
      const elevatorSharedId = `shared_el_${buildingId}_${(elevators.filter(e => e.label === 'Elevator').length + 1)}`;
      const newElevator: FloorElevatorItem = {
        id: genId("ev"), x: Math.round(rx), y: Math.round(ry),
        width: Math.round(rw), height: Math.round(rh),
        doorWidth: 6, label: "Elevator",
        sharedId: elevatorSharedId,
        accessible: true, // Elevators are always accessible
      };
      updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, [...elevators, newElevator]);
      setSelected({ type: "elevator", id: newElevator.id });
      setTool("select");
      setRoomDrag(null);
      return;
    }

    setRoomDrag(null);
  };

  const handleDblClick = () => {
    if (drawingPath.length >= 2) {
      updFloor(rooms, [...fpaths, { id: genId("fp"), points: drawingPath, type: "footpath", color: "#94a3b8", width: 3 }]);
      setDP([]);
      setTool("select");
    }
  };

  // ── Item mouse handlers ──

  const onItemDown = (e: React.MouseEvent, type: string, id: string, item: any) => {
    e.stopPropagation();
    if (isSpacePressed()) { startPan(e); return; }
    if (tool === "erase") {
      if (type === "room") updFloor(rooms.filter((r: FloorRoom) => r.id !== id), fpaths);
      else if (type === "wall") updFloor(rooms, fpaths, walls.filter((w: FloorWall) => w.id !== id));
      else if (type === "door") updFloor(rooms, fpaths, walls, doors.filter((d: FloorDoor) => d.id !== id));
      else if (type === "window") updFloor(rooms, fpaths, walls, doors, windows.filter((w: FloorWindow) => w.id !== id));
      else if (type === "furniture") updFloor(rooms, fpaths, walls, doors, windows, furniture.filter((f: FloorFurniture) => f.id !== id));
      else if (type === "stairs") updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs.filter((s: FloorStairs) => s.id !== id));
      else if (type === "elevator") updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators.filter((e: FloorElevatorItem) => e.id !== id));
      else if (type === "ramp") updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, ramps.filter((r: FloorRamp) => r.id !== id));
      else if (type === "label") updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels.filter((l: FloorLabel) => l.id !== id));
      setSelected(null);
      return;
    }
    if (tool !== "select") return;
    const sel: FloorSelection = { type: type as any, id };
    setSelected(sel);
    const pt = getPoint(e, FP_W, FP_H);
    // Suppress per-frame history pushes during the drag; ONE post-gesture entry
    // is committed on pointer release (handleSvgUp).
    suppressHistoryRef.current = true;
    gestureMoved.current = false;
    dragging.current = { type, ids: [id], origins: [{ ...item }], sx: pt.x, sy: pt.y };
  };

  const onResizeStart = (e: React.MouseEvent, room: FloorRoom, corner: string) => {
    e.stopPropagation();
    if (tool !== "select") return;
    resizing.current = { id: room.id, corner, sx: e.clientX, sy: e.clientY, ox: room.x, oy: room.y, ow: room.w, oh: room.h };
  };

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); applyEntry(undo()); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); applyEntry(redo()); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        const { type, id } = selected;
        if (type === "room") updFloor(rooms.filter((r) => r.id !== id), fpaths);
        else if (type === "wall") updFloor(rooms, fpaths, walls.filter((w) => w.id !== id));
        else if (type === "door") updFloor(rooms, fpaths, walls, doors.filter((d) => d.id !== id));
        else if (type === "window") updFloor(rooms, fpaths, walls, doors, windows.filter((w) => w.id !== id));
        else if (type === "furniture") updFloor(rooms, fpaths, walls, doors, windows, furniture.filter((f) => f.id !== id));
        else if (type === "stairs") updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs.filter((s) => s.id !== id));
        else if (type === "elevator") updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators.filter((e) => e.id !== id));
        else if (type === "ramp") updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, ramps.filter((r) => r.id !== id));
        else if (type === "label") updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels.filter((l) => l.id !== id));
        setSelected(null);
        return;
      }
      if (e.key === "Escape") { setWallStart(null); setWallPreview(null); setDP([]); setSelected(null); suppressHistoryRef.current = false; gestureMoved.current = false; dragging.current = null; if (tool === "path") setTool("select"); }
      if (e.key === "v" || e.key === "V") setTool("select");
      if (e.key === "w" || e.key === "W") setTool("wall");
      if (e.key === "r" || e.key === "R") setTool("room");
      if (e.key === "d" || e.key === "D") setTool("door");
      if (e.key === "i" || e.key === "I") setTool("window");
      if (e.key === "s" || e.key === "S") setTool("stairs");
      if (e.key === "l" || e.key === "L") setTool("elevator");
      if (e.key === "t" || e.key === "T") setTool("text");
      if (e.key === "p" || e.key === "P") setTool("path");
      if (e.key === "e" || e.key === "E") setTool("erase");
      if (e.key === "f" || e.key === "F") setTool("furniture");
      if (e.key === "h" || e.key === "H") setTool("pan");
      if (e.key === "0") resetView();
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [selected, tool, rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels, undo, redo, applyEntry, pushHistory]);

  // ── Cursor ──
  const cursor = isSpacePressed()
    ? panning.current ? "grabbing" : "grab"
    : tool === "erase" ? "not-allowed"
    : tool === "pan" ? "grab"
    : panning.current ? "grabbing"
    : (tool === "wall" || tool === "room" || tool === "path" || tool === "door" || tool === "window" || tool === "stairs" || tool === "ramp" || tool === "elevator" || tool === "furniture" || tool === "text")
      ? "crosshair"
      : "default";

  // ── Active tools based on mode ──
  const activeTools = mode === "structure" ? FLOOR_STRUCTURE_TOOLS : FLOOR_INTERIOR_TOOLS;

  // ── Selected item for properties panel ──
  const selItem = selected ? (
    selected.type === "room" ? rooms.find((r) => r.id === selected.id)
    : selected.type === "wall" ? walls.find((w) => w.id === selected.id)
    : selected.type === "door" ? doors.find((d) => d.id === selected.id)
    : selected.type === "window" ? windows.find((w) => w.id === selected.id)
    : selected.type === "furniture" ? furniture.find((f) => f.id === selected.id)
    : selected.type === "stairs" ? stairs.find((s) => s.id === selected.id)
    : selected.type === "ramp" ? ramps.find((r) => r.id === selected.id)
    : selected.type === "elevator" ? elevators.find((e) => e.id === selected.id)
    : selected.type === "label" ? labels.find((l) => l.id === selected.id)
    : undefined
  ) : undefined;

  const allItemsCount = rooms.length + walls.length + doors.length + windows.length +
    furniture.length + stairs.length + ramps.length + elevators.length + labels.length + fpaths.length;

  // ── Empty state check ──
  const isEmpty = allItemsCount === 0;

  // ── Context menu action handler ──
  const handleFloorContextAction = useCallback((action: string) => {
    if (!contextMenu) return;
    const { type, id } = contextMenu;
    if (type === "wall") {
      if (action === "delete") {
        updFloor(rooms, fpaths, walls.filter((w) => w.id !== id));
        setSelected(null);
        toast.info("Wall deleted", "The wall has been removed.");
      }
    }
    setContextMenu(null);
  }, [contextMenu, rooms, fpaths, walls, updFloor, pushHistory, toast, setSelected]);

  return (
    <div className="flex flex-col w-full flex-1" style={{ minHeight: 0 }}>
      {/* ═══════════════════════════════════════════════════════════════════
          TOP TOOLBAR
          ═══════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="shrink-0 bg-card border-b border-border"
      >
        <div className="flex items-center h-10 px-2 gap-1">
          {/* Breadcrumb */}
          <button onClick={onBack} className="flex items-center gap-1 h-7 px-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all text-[11px] font-semibold shrink-0 group">
            <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span className="hidden sm:inline">{campus.name}</span>
          </button>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          <span className="text-[11px] text-muted-foreground font-semibold shrink-0">{building.code}</span>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          <span className="text-xs font-extrabold text-foreground truncate max-w-[120px]">{floor.label}</span>
          <span className="text-[9px] text-muted-foreground/50 ml-1 font-medium shrink-0">
            ({allItemsCount} item{allItemsCount !== 1 ? "s" : ""})
          </span>

          {/* Floor tabs */}
          <div className="flex items-center gap-0.5 ml-2 overflow-x-auto no-scrollbar">
            {building.floors.map((f) => (
              <button key={f.id}
                className={cn("shrink-0 h-6 px-2 rounded-md text-[10px] font-extrabold transition-all",
                  f.id === floorId ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
                onClick={() => onSwitchFloor(f.id)}>
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Mode toggle */}
          <div className="flex items-center p-0.5 rounded-lg border border-border bg-muted/30 mr-1">
            <button onClick={() => setMode("structure")}
              className={cn("flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-extrabold transition-all",
                mode === "structure" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <SeparatorHorizontal className="h-3 w-3" />
              <span className="hidden sm:inline">Structure</span>
            </button>
            <button onClick={() => setMode("interior")}
              className={cn("flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-extrabold transition-all",
                mode === "interior" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <Sofa className="h-3 w-3" />
              <span className="hidden sm:inline">Interior</span>
            </button>
          </div>

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Tool palette */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border bg-muted/30">
            {activeTools.slice(0, mode === "structure" ? 5 : 4).map((t) => {
              const Icon = t.icon;
              const isActive = tool === t.id;
              return (
                <button key={t.id} onClick={() => { setTool(t.id); setWallStart(null); setDP([]); }}
                  title={`${t.label} (${t.key})`}
                  className={cn("flex items-center justify-center h-6 w-6 rounded-md text-[10px] font-bold transition-all",
                    isActive && t.id === "erase" ? "bg-destructive text-destructive-foreground shadow-sm"
                    : isActive ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
                  <Icon className="h-3 w-3" />
                </button>
              );
            })}
            {/* Overflow toggle for remaining tools */}
            {activeTools.length > (mode === "structure" ? 5 : 4) && (
              <span className="text-[9px] text-muted-foreground px-0.5">+{activeTools.length - (mode === "structure" ? 5 : 4)}</span>
            )}
          </div>

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Undo/Redo */}
          <button onClick={() => applyEntry(undo())} disabled={!canUndo}
            className={cn("flex items-center justify-center h-7 w-7 rounded-md transition-all",
              canUndo ? "text-muted-foreground hover:text-foreground hover:bg-muted" : "text-muted-foreground/40 cursor-not-allowed")}
            title="Undo (Ctrl+Z)">
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => applyEntry(redo())} disabled={!canRedo}
            className={cn("flex items-center justify-center h-7 w-7 rounded-md transition-all",
              canRedo ? "text-muted-foreground hover:text-foreground hover:bg-muted" : "text-muted-foreground/40 cursor-not-allowed")}
            title="Redo (Ctrl+Y)">
            <Redo2 className="h-3.5 w-3.5" />
          </button>

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Snap toggle */}
          <button onClick={() => setSnapOn((v) => !v)}
            className={cn("flex items-center justify-center h-7 px-2 rounded-md text-[10px] font-bold transition-all border",
              snapOn ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted")}>
            <Grid3X3 className="h-3 w-3 mr-1" />
            Grid
          </button>

          {/* Properties toggle */}
          <button onClick={() => setShowProperties((v) => !v)}
            className={cn("flex items-center justify-center h-7 w-7 rounded-md transition-all",
              showProperties ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
            title="Toggle Properties Panel">
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>

          {/* Save */}
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1 h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-[10px] font-extrabold hover:bg-primary/90 transition-all disabled:opacity-60 shadow-sm">
            {saving ? <div className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" /> :
              saved ? <CheckCircle2 className="h-3 w-3" /> : <Save className="h-3 w-3" />}
            {saving ? "Saving..." : saved ? "Saved" : "Save"}
          </button>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN BODY
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* ── LEFT SIDEBAR ── */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="w-52 border-r border-border bg-card flex flex-col overflow-hidden shrink-0"
        >
          {mode === "structure" ? (
            <>
              {/* Structure sidebar */}
              <div className="px-3 py-2.5 border-b border-border">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Structure</p>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth py-1.5">
                {/* Wall tool quick access */}
                <button onClick={() => setTool("wall")}
                  className={cn("w-full flex items-center gap-2.5 pl-3 pr-2 py-2 transition-colors text-left",
                    tool === "wall" ? "bg-primary/8 border-l-2 border-primary" : "hover:bg-muted/50 border-l-2 border-transparent")}>
                  <SeparatorHorizontal className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">Draw Wall</span>
                </button>
                {/* Room types */}
                <div className="px-3 mt-1 mb-1">
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Rooms</span>
                </div>
                {ROOM_TYPES.map((rt) => (
                  <button key={rt.type} onClick={() => { setTool("room"); setSidebarCategory(rt.type); }}
                    className={cn("w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5 transition-colors text-left",
                      tool === "room" && sidebarCategory === rt.type ? "bg-primary/8 border-l-2 border-primary" : "hover:bg-muted/50 border-l-2 border-transparent")}>
                    <div className="w-4 h-4 rounded shrink-0 border" style={{ background: rt.fill, borderColor: rt.stroke }} />
                    <span className="text-xs font-medium truncate text-foreground">{rt.label}</span>
                  </button>
                ))}
                {/* Doors & Windows */}
                <div className="px-3 mt-2 mb-1">
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Openings</span>
                </div>
                <button onClick={() => setTool("door")}
                  className={cn("w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5 transition-colors text-left",
                    tool === "door" ? "bg-primary/8 border-l-2 border-primary" : "hover:bg-muted/50 border-l-2 border-transparent")}>
                  <DoorOpen className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-medium text-foreground">Door</span>
                </button>
                <button onClick={() => setTool("window")}
                  className={cn("w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5 transition-colors text-left",
                    tool === "window" ? "bg-primary/8 border-l-2 border-primary" : "hover:bg-muted/50 border-l-2 border-transparent")}>
                  <LandPlot className="h-4 w-4 text-cyan-500" />
                  <span className="text-xs font-medium text-foreground">Window</span>
                </button>
                {/* Vertical circulation */}
                <div className="px-3 mt-2 mb-1">
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Circulation</span>
                </div>
                <button onClick={() => setTool("stairs")}
                  className={cn("w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5 transition-colors text-left",
                    tool === "stairs" ? "bg-primary/8 border-l-2 border-primary" : "hover:bg-muted/50 border-l-2 border-transparent")}>
                  <MoveVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">Stairs</span>
                </button>
                <button onClick={() => setTool("ramp")}
                  className={cn("w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5 transition-colors text-left",
                    tool === "ramp" ? "bg-primary/8 border-l-2 border-primary" : "hover:bg-muted/50 border-l-2 border-transparent")}>
                  <Navigation className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs font-medium text-foreground">Ramp</span>
                </button>
                <button onClick={() => setTool("elevator")}
                  className={cn("w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5 transition-colors text-left",
                    tool === "elevator" ? "bg-primary/8 border-l-2 border-primary" : "hover:bg-muted/50 border-l-2 border-transparent")}>
                  <Binary className="h-4 w-4 text-purple-500" />
                  <span className="text-xs font-medium text-foreground">Elevator</span>
                </button>
                {/* Labels */}
                <div className="px-3 mt-2 mb-1">
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Annotations</span>
                </div>
                <button onClick={() => setTool("text")}
                  className={cn("w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5 transition-colors text-left",
                    tool === "text" ? "bg-primary/8 border-l-2 border-primary" : "hover:bg-muted/50 border-l-2 border-transparent")}>
                  <Text className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs font-medium text-foreground">Text Label</span>
                </button>
                <button onClick={() => setTool("measure")}
                  className={cn("w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5 transition-colors text-left",
                    tool === "measure" ? "bg-primary/8 border-l-2 border-primary" : "hover:bg-muted/50 border-l-2 border-transparent")}>
                  <Ruler className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">Measure</span>
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Interior sidebar — Furniture categories */}
              <div className="px-3 py-2.5 border-b border-border">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Furniture</p>
              </div>
              <div className="px-3 py-2 border-b border-border">
                <div className="relative">
                  <input placeholder="Search furniture..." readOnly
                    className="w-full h-7 pl-2 pr-2 rounded-lg bg-muted/50 text-xs text-foreground placeholder:text-muted-foreground/60 border border-transparent focus:outline-none focus:border-primary/30 transition-all" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth py-1.5">
                {FURNITURE_CATEGORIES.map((cat) => (
                  <div key={cat.id}>
                    <button onClick={() => setSidebarCategory(sidebarCategory === cat.id ? null : cat.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted/50 transition-colors text-left">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex-1">{cat.label}</span>
                      <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform", sidebarCategory === cat.id && "rotate-90")} />
                    </button>
                    {sidebarCategory === cat.id && (
                      <div className="py-0.5">
                        {cat.items.map((item) => (
                          <button key={item.type} onClick={() => { setFurnitureTemplate(item); setTool("furniture"); }}
                            className={cn("w-full flex items-center gap-2 pl-5 pr-2 py-1.5 transition-colors text-left rounded-sm",
                              furnitureTemplate?.type === item.type ? "bg-primary/8" : "hover:bg-muted/50")}>
                            <div className="w-4 h-4 rounded shrink-0 border" style={{ background: item.color, borderColor: item.color }} />
                            <span className="text-[11px] font-medium truncate text-foreground">{item.name}</span>
                            <span className="text-[9px] text-muted-foreground ml-auto">{item.width}×{item.height}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>

        {/* ── CANVAS ── */}
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 overflow-hidden relative"
          style={{ background: "#b0ada8" }}
        >
          <svg ref={svgRef}
            viewBox={`0 0 ${FP_W} ${FP_H}`}
            className="w-full h-full"
            style={{ cursor, userSelect: "none" }}
            onMouseDown={handleSvgDown}
            onMouseMove={handleSvgMove}
            onMouseUp={handleSvgUp}
            onMouseLeave={handleSvgUp}
            onDoubleClick={handleDblClick}
            onContextMenu={(e) => { e.preventDefault(); if (contextMenu) setContextMenu(null); }}
          >
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {/* Decorative background layer: the outer rect, grid lines and
                  floor-area rects are all inside a single data-bg group so a click
                  on ANY empty canvas space (not just the outer margin) clears the
                  current selection. Item <g>s are siblings of this group. */}
              <g data-bg="true">
                <rect width={FP_W} height={FP_H} fill="#b0ada8" />
                {/* Grid lines */}
                {Array.from({ length: Math.ceil(FP_W / 20) }, (_, i) => (
                  <line key={`gv${i}`} x1={i * 20} y1={0} x2={i * 20} y2={FP_H} stroke="rgba(0,0,0,0.04)" strokeWidth={0.5} />
                ))}
                {Array.from({ length: Math.ceil(FP_H / 20) }, (_, i) => (
                  <line key={`gh${i}`} x1={0} y1={i * 20} x2={FP_W} y2={i * 20} stroke="rgba(0,0,0,0.04)" strokeWidth={0.5} />
                ))}
                {/* Floor area */}
                <rect x={8} y={8} width={FP_W - 16} height={FP_H - 16} rx={2} fill="#e0dcd6" stroke="#706d68" strokeWidth={5} />
                <rect x={13} y={13} width={FP_W - 26} height={FP_H - 26} fill="#cdc9c3" />
              </g>

              {/* ═══ WALLS ═══ */}
              {walls.map((wall) => {
                const isSel = selected?.type === "wall" && selected.id === wall.id;
                return (
                  <g key={wall.id}
                    onMouseDown={(e) => onItemDown(e, "wall", wall.id, wall)}
                    onContextMenu={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      setContextMenu({ x: e.clientX, y: e.clientY, type: "wall", id: wall.id });
                    }}
                    style={{ cursor: tool === "select" ? "pointer" : cursor }}>
                    {/* Selection glow */}
                    {isSel && (
                      <line data-testid="selection-glow" x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2}
                        stroke="var(--accent)" strokeWidth={wall.thickness + 6} opacity={0.3}
                        strokeLinecap="round" />
                    )}
                    {/* Wall body */}
                    <line x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2}
                      stroke={wall.color} strokeWidth={wall.thickness}
                      strokeLinecap="round" strokeLinejoin="round" />
                    {/* Selection handles */}
                    {isSel && (
                      <>
                        {/* Endpoint 1 — draggable */}
                        <circle data-testid="wall-endpoint-handle" cx={wall.x1} cy={wall.y1} r={6} fill="white" stroke="var(--accent)" strokeWidth={2}
                          style={{ cursor: tool === "select" ? "move" : cursor }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            if (tool !== "select") return;
                            suppressHistoryRef.current = true;
                            gestureMoved.current = false;
                            wallEndpointDrag.current = { wallId: wall.id, endpoint: "x1", origin: { ...wall } };
                          }} />
                        {/* Endpoint 2 — draggable */}
                        <circle data-testid="wall-endpoint-handle" cx={wall.x2} cy={wall.y2} r={6} fill="white" stroke="var(--accent)" strokeWidth={2}
                          style={{ cursor: tool === "select" ? "move" : cursor }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            if (tool !== "select") return;
                            suppressHistoryRef.current = true;
                            gestureMoved.current = false;
                            wallEndpointDrag.current = { wallId: wall.id, endpoint: "x2", origin: { ...wall } };
                          }} />
                        {/* Length label */}
                        <text x={(wall.x1 + wall.x2) / 2} y={(wall.y1 + wall.y2) / 2 - 10}
                          textAnchor="middle" fill="#706d68" fontSize={6} fontWeight="600"
                          className="pointer-events-none select-none">
                          {Math.round(dist(wall.x1, wall.y1, wall.x2, wall.y2))}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}

              {/* ═══ WALL ENDPOINT DRAG PREVIEW ═══ */}
              {(() => {
                const ep = wallEndpointDrag.current;
                if (!ep) return null;
                const wall = walls.find(w => w.id === ep.wallId);
                if (!wall) return null;
                return (
                  <circle
                    cx={wall[ep.endpoint === "x1" ? "x1" : "x2"]}
                    cy={wall[ep.endpoint === "x1" ? "y1" : "y2"]}
                    r={8} fill="var(--accent)" opacity={0.4}
                    className="pointer-events-none"
                  />
                );
              })()}

              {/* ═══ DOORS ═══ */}
              {doors.map((door) => {
                const isSel = selected?.type === "door" && selected.id === door.id;
                return (
                  <g key={door.id} onMouseDown={(e) => onItemDown(e, "door", door.id, door)}
                    style={{ cursor: tool === "select" ? "pointer" : cursor }}>
                    {/* Door rectangle */}
                    <rect x={door.x - door.width / 2} y={door.y - 2} width={door.width} height={4} rx={1}
                      fill={isSel ? "var(--accent)" : door.color}
                      stroke={door.color} strokeWidth={1} />
                    {/* Swing arc indicator */}
                    {door.direction !== "sliding" && (
                      <path d={door.direction === "left"
                        ? `M ${door.x} ${door.y} A ${door.width} ${door.width} 0 0 0 ${door.x - door.width} ${door.y}`
                        : `M ${door.x} ${door.y} A ${door.width} ${door.width} 0 0 1 ${door.x + door.width} ${door.y}`}
                        fill="none" stroke={door.color} strokeWidth={1} opacity={0.5} />
                    )}
                    {door.locked && (
                      <text x={door.x} y={door.y + 3} textAnchor="middle" fill="white" fontSize={5} fontWeight="bold">🔒</text>
                    )}
                  </g>
                );
              })}

              {/* ═══ WINDOWS ═══ */}
              {windows.map((win) => {
                const isSel = selected?.type === "window" && selected.id === win.id;
                return (
                  <g key={win.id} onMouseDown={(e) => onItemDown(e, "window", win.id, win)}
                    style={{ cursor: tool === "select" ? "pointer" : cursor }}>
                    <rect x={win.x} y={win.y} width={win.width} height={win.height}
                      fill={isSel ? "rgba(14,42,110,0.2)" : win.color}
                      stroke={isSel ? "var(--accent)" : "#38bdf8"} strokeWidth={1} rx={1} />
                    {/* Window divider lines */}
                    <line x1={win.x + win.width / 2} y1={win.y} x2={win.x + win.width / 2} y2={win.y + win.height}
                      stroke="#38bdf8" strokeWidth={0.5} opacity={0.6} />
                  </g>
                );
              })}

              {/* ═══ ROOMS ═══ */}
              {rooms.map((room) => {
                const rt = ROOM_MAP[room.type] ?? ROOM_MAP.classroom;
                const isSel = selected?.type === "room" && selected.id === room.id;
                return (
                  <g key={room.id} onMouseDown={(e) => onItemDown(e, "room", room.id, room)}
                    style={{ cursor: tool === "select" ? "move" : cursor }}>
                    {isSel && (
                      <>
                        <rect x={room.x - 3} y={room.y - 3} width={room.w + 6} height={room.h + 6} rx={2}
                          fill="none" stroke="var(--accent)" strokeWidth={2.5} />
                        {/* Resize handles */}
                        {["nw", "ne", "sw", "se"].map((corner) => {
                          const hs = 7;
                          const hx = corner.includes("e") ? room.x + room.w - hs / 2 : room.x - hs / 2;
                          const hy = corner.includes("s") ? room.y + room.h - hs / 2 : room.y - hs / 2;
                          return (
                            <rect key={corner} x={hx} y={hy} width={hs} height={hs} rx={1.5}
                              fill="white" stroke="var(--accent)" strokeWidth={2}
                              style={{ cursor: "nwse-resize" }}
                              onMouseDown={(e) => onResizeStart(e, room, corner)} />
                          );
                        })}
                      </>
                    )}
                    <rect x={room.x} y={room.y} width={room.w} height={room.h} rx={1}
                      fill={isSel ? "rgba(14,42,110,0.15)" : rt.fill}
                      stroke={isSel ? "var(--accent)" : rt.stroke}
                      strokeWidth={isSel ? 2 : 1} />
                    <line x1={room.x + 1} y1={room.y + 1} x2={room.x + room.w - 1} y2={room.y + 1}
                      stroke="rgba(0,0,0,0.06)" strokeWidth={1.5} />
                    {room.w >= 40 && room.h >= 18 && (
                      <text x={room.x + room.w / 2} y={room.y + room.h / 2 + 3} textAnchor="middle"
                        fill={rt.text} fontSize={Math.min(room.w > 90 ? 8 : 6.5, 9)} fontWeight="600"
                        className="pointer-events-none select-none">
                        {room.name.length > 14 ? room.name.slice(0, 13) + "..." : room.name}
                      </text>
                    )}
                    {isSel && room.w > 60 && room.h > 24 && (
                      <text x={room.x + room.w / 2} y={room.y + room.h + 10} textAnchor="middle"
                        fill="#706d68" fontSize={6} fontWeight="500" className="pointer-events-none select-none">
                        {room.w}×{room.h}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* ═══ FURNITURE ═══ */}
              {furniture.map((fi) => {
                const isSel = selected?.type === "furniture" && selected.id === fi.id;
                const cx = fi.x + fi.width / 2;
                const cy = fi.y + fi.height / 2;
                return (
                  <g key={fi.id} onMouseDown={(e) => onItemDown(e, "furniture", fi.id, fi)}
                    style={{ cursor: tool === "select" ? "move" : cursor }}>
                    {isSel && (
                      <rect x={fi.x - 2} y={fi.y - 2} width={fi.width + 4} height={fi.height + 4} rx={1}
                        fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="3 2" />
                    )}
                    <g transform={`rotate(${fi.rotation}, ${cx}, ${cy})`}>
                      <rect x={fi.x} y={fi.y} width={fi.width} height={fi.height} rx={1.5}
                        fill={fi.color} stroke={isSel ? "var(--accent)" : "rgba(0,0,0,0.15)"}
                        strokeWidth={isSel ? 1.5 : 0.5} opacity={0.85} />
                      {fi.width >= 8 && fi.height >= 6 && (
                        <text x={cx} y={cy + 2} textAnchor="middle"
                          fill="rgba(255,255,255,0.9)" fontSize={Math.min(fi.width, fi.height) > 14 ? 5 : 4}
                          fontWeight="600" className="pointer-events-none select-none">
                          {fi.name.length > 8 ? fi.name.slice(0, 7) + "." : fi.name}
                        </text>
                      )}
                    </g>
                  </g>
                );
              })}

              {/* ═══ RAMPS ═══ */}
              {ramps.map((rp) => {
                const isSel = selected?.type === "ramp" && selected.id === rp.id;
                return (
                  <g key={rp.id} onMouseDown={(e) => onItemDown(e, "ramp", rp.id, { ...rp, x: rp.x, y: rp.y })}
                    style={{ cursor: tool === "select" ? "move" : cursor }}>
                    <rect x={rp.x} y={rp.y} width={rp.width} height={rp.height} rx={1}
                      fill={isSel ? "rgba(5,150,105,0.25)" : "#ecfdf5"}
                      stroke={isSel ? "var(--accent)" : "#6ee7b7"} strokeWidth={isSel ? 2 : 1} />
                    {/* Ramp slope lines */}
                    <line x1={rp.x + 3} y1={rp.y + rp.height - 3} x2={rp.x + rp.width - 3} y2={rp.y + 3}
                      stroke={isSel ? "var(--accent)" : "#34d399"} strokeWidth={1.5} opacity={0.7} />
                    <line x1={rp.x + 3} y1={rp.y + rp.height - 6} x2={rp.x + rp.width - 3} y2={rp.y + 6}
                      stroke={isSel ? "var(--accent)" : "#34d399"} strokeWidth={1} opacity={0.4} />
                    {/* Handrail indicators */}
                    {rp.handrails && (
                      <>
                        <line x1={rp.x + 2} y1={rp.y + 2} x2={rp.x + rp.width - 2} y2={rp.y + 2}
                          stroke="#059669" strokeWidth={1} opacity={0.5} />
                        <line x1={rp.x + 2} y1={rp.y + rp.height - 2} x2={rp.x + rp.width - 2} y2={rp.y + rp.height - 2}
                          stroke="#059669" strokeWidth={1} opacity={0.5} />
                      </>
                    )}
                    {rp.width >= 20 && (
                      <text x={rp.x + rp.width / 2} y={rp.y + rp.height / 2 + 2}
                        textAnchor="middle" fill="#065f46" fontSize={6} fontWeight="700"
                        className="pointer-events-none select-none">
                        ♿
                      </text>
                    )}
                  </g>
                );
              })}

              {/* ═══ STAIRS ═══ */}
              {stairs.map((st) => {
                const isSel = selected?.type === "stairs" && selected.id === st.id;
                return (
                  <g key={st.id} onMouseDown={(e) => onItemDown(e, "stairs", st.id, st)}
                    style={{ cursor: tool === "select" ? "move" : cursor }}>
                    <rect x={st.x} y={st.y} width={st.width} height={st.height} rx={1}
                      fill={isSel ? "rgba(14,42,110,0.2)" : "#f3f4f6"}
                      stroke={isSel ? "var(--accent)" : "#9ca3af"} strokeWidth={isSel ? 2 : 1} />
                    {/* Stair tread lines */}
                    {Array.from({ length: Math.min(6, Math.floor(st.width / 10)) }, (_, i) => (
                      <line key={i} x1={st.x + (st.width / (Math.min(6, Math.floor(st.width / 10)) + 1)) * (i + 1)}
                        y1={st.y} x2={st.x + (st.width / (Math.min(6, Math.floor(st.width / 10)) + 1)) * (i + 1)}
                        y2={st.y + st.height} stroke="#9ca3af" strokeWidth={0.5} />
                    ))}
                    <text x={st.x + st.width / 2} y={st.y + st.height / 2 + 2}
                      textAnchor="middle" fill="#6b7280" fontSize={6} fontWeight="600"
                      className="pointer-events-none select-none">
                      {st.direction === "up" ? "↑" : st.direction === "down" ? "↓" : "↕"}
                    </text>
                  </g>
                );
              })}

              {/* ═══ ELEVATORS ═══ */}
              {elevators.map((el) => {
                const isSel = selected?.type === "elevator" && selected.id === el.id;
                return (
                  <g key={el.id} onMouseDown={(e) => onItemDown(e, "elevator", el.id, el)}
                    style={{ cursor: tool === "select" ? "move" : cursor }}>
                    <rect x={el.x} y={el.y} width={el.width} height={el.height} rx={1}
                      fill={isSel ? "rgba(14,42,110,0.2)" : "#f0fdf4"}
                      stroke={isSel ? "var(--accent)" : "#86efac"} strokeWidth={isSel ? 2 : 1} />
                    {/* Elevator door */}
                    <rect x={el.x + el.width / 2 - el.doorWidth / 2} y={el.y + el.height - 3}
                      width={el.doorWidth} height={3} fill="#86efac" rx={0.5} />
                    <text x={el.x + el.width / 2} y={el.y + el.height / 2 + 2}
                      textAnchor="middle" fill="#14532d" fontSize={7} fontWeight="700"
                      className="pointer-events-none select-none">E</text>
                  </g>
                );
              })}

              {/* ═══ INTERNAL PATHS ═══ */}
              {fpaths.map((p) => {
                const pts = p.points.map((pt) => `${pt.x},${pt.y}`).join(" ");
                const isSel = selected?.type === "path" && selected.id === p.id;
                return (
                  <g key={p.id} onClick={(e) => { e.stopPropagation(); if (tool === "erase") { updFloor(rooms, fpaths.filter((x) => x.id !== p.id)); } else setSelected({ type: "path", id: p.id }); }}
                    style={{ cursor: tool === "erase" ? "not-allowed" : "pointer" }}>
                    {isSel && <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={p.width + 4} strokeLinecap="round" opacity={0.4} />}
                    <polyline points={pts} fill="none" stroke={p.color} strokeWidth={p.width} strokeLinecap="round" opacity={0.8} />
                  </g>
                );
              })}

              {/* ═══ LABELS ═══ */}
              {labels.map((lb) => {
                const isSel = selected?.type === "label" && selected.id === lb.id;
                return (
                  <g key={lb.id} onMouseDown={(e) => onItemDown(e, "label", lb.id, lb)}
                    style={{ cursor: tool === "select" ? "move" : cursor }}>
                    {isSel && (
                      <rect x={lb.x - 4} y={lb.y - lb.fontSize - 2} width={lb.text.length * lb.fontSize * 0.6 + 8}
                        height={lb.fontSize + 6} rx={2}
                        fill="none" stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 2" />
                    )}
                    <g transform={`rotate(${lb.rotation}, ${lb.x}, ${lb.y})`}>
                      <text x={lb.x} y={lb.y} fill={lb.color} fontSize={lb.fontSize} fontWeight="600"
                        className="pointer-events-none select-none">
                        {lb.text}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* ═══ NAVIGATION CONNECTIONS ═══ */}
              {rooms.filter(r => r.navConnection).map((room) => {
                const nc = room.navConnection!;
                const cx = FP_W / 2;
                const cy = FP_H / 2;
                return (
                  <g key={`nav-${room.id}`} className="pointer-events-none">
                    {/* Dashed line from nav node toward floor center (representing corridor connection) */}
                    <line x1={nc.x} y1={nc.y} x2={cx} y2={cy}
                      stroke="#16a34a" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.4} />
                    {/* Glow ring */}
                    <circle cx={nc.x} cy={nc.y} r={9}
                      fill="none" stroke="#16a34a" strokeWidth={3} opacity={0.25} />
                    {/* Solid node */}
                    <circle cx={nc.x} cy={nc.y} r={5}
                      fill="#16a34a" stroke="white" strokeWidth={2} />
                    {/* Direction indicator — small arrow pointing outward from room toward corridor */}
                    <text x={nc.x} y={nc.y + 1.5} textAnchor="middle" fill="white"
                      fontSize={6} fontWeight="900" className="select-none">
                      {(nc.x < room.x + room.w / 2) ? "◀" : (nc.x > room.x + room.w / 2) ? "▶" : (nc.y < room.y + room.h / 2) ? "▲" : "▼"}
                    </text>
                  </g>
                );
              })}

              {/* ═══ DRAWING PREVIEWS ═══ */}
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
              {/* Room/stairs/elevator drag preview */}
              {roomDrag && (tool === "room" || tool === "stairs" || tool === "elevator") && (() => {
                const rx = Math.min(roomDrag.sx, roomDrag.cx);
                const ry = Math.min(roomDrag.sy, roomDrag.cy);
                const rw = Math.abs(roomDrag.cx - roomDrag.sx);
                const rh = Math.abs(roomDrag.cy - roomDrag.sy);
                const color = tool === "stairs" ? "#9ca3af" : tool === "elevator" ? "#86efac" : "var(--primary)";
                return (
                  <rect x={rx} y={ry} width={rw} height={rh} rx={2}
                    fill={color} fillOpacity={0.1}
                    stroke={color} strokeWidth={2} strokeDasharray="6 3" />
                );
              })()}
              {/* Drawing path */}
              {drawingPath.length > 0 && (
                <g>
                  {drawingPath.length > 1 && <polyline points={drawingPath.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none" stroke="var(--primary)" strokeWidth={3} strokeLinecap="round" strokeDasharray="8 4" opacity={0.9} />}
                  {drawingPath.map((pt, i) => <circle key={i} cx={pt.x} cy={pt.y} r={4} fill="var(--primary)" opacity={0.9} />)}
                </g>
              )}

              {/* Compass */}
              <g transform="translate(20, 20)" opacity={0.5}>
                <circle cx={0} cy={0} r={12} fill="none" stroke="#706d68" strokeWidth={1.5} />
                <polygon points="0,-10 -3,2 0,-1 3,2" fill="#dc2626" />
                <text x={0} y={-13} textAnchor="middle" fill="#706d68" fontSize={5} fontWeight="800">N</text>
              </g>
            </g>
          </svg>

          {/* Empty state overlay */}
          {isEmpty && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-muted flex items-center justify-center">
                  <Layers className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="text-xs font-bold text-muted-foreground">This floor is empty</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  {mode === "structure"
                    ? "Select a tool from the sidebar to start building"
                    : "Select a furniture category and place items"}
                </p>
              </div>
            </div>
          )}

          {/* Furniture tooltip — shows when furniture tool is active */}
          {tool === "furniture" && furnitureTemplate && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
              <div className="px-3 py-1.5 rounded-lg border shadow-sm bg-card text-[11px] font-semibold text-foreground flex items-center gap-2">
                <Paintbrush className="h-3 w-3 text-primary" />
                Placing: {furnitureTemplate.name}
                <button onClick={() => { setFurnitureTemplate(null); setTool("select"); }}
                  className="ml-1 text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          {/* Wall drawing hint */}
          {tool === "wall" && wallStart && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
              <div className="px-3 py-1.5 rounded-lg border shadow-sm bg-card text-[11px] font-semibold text-foreground">
                Click again to finish wall · Esc to cancel
              </div>
            </div>
          )}

          {/* Status bar overlay */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-10 pointer-events-none">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border/60 text-[10px] font-mono"
                style={{ background: "color-mix(in srgb,var(--card) 85%,transparent)", backdropFilter: "blur(8px)" }}>
                <span className="font-bold">{allItemsCount}</span>
                <span className="opacity-50">items</span>
              </div>
              {cursorPos && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border/60 text-[9px] font-mono"
                  style={{ background: "color-mix(in srgb,var(--card) 85%,transparent)", backdropFilter: "blur(8px)" }}>
                  X:{cursorPos.x} Y:{cursorPos.y}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground/70 tabular-nums">{Math.round(zoom * 100)}%</span>
              <span className="w-px h-3 bg-border" />
              <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums">{FP_W} × {FP_H}</span>
              <span className="w-px h-3 bg-border" />
              <span className="text-[10px] font-medium text-muted-foreground">{mode === "structure" ? "Structure" : "Interior"} Mode</span>
            </div>
          </div>

          {/* Zoom controls */}
          <div className="absolute bottom-10 right-3 z-20 flex items-center gap-1 p-1 rounded-xl border border-border shadow-md bg-card">
            <button onClick={zoomOut} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="w-10 text-center text-[10px] font-mono font-bold text-foreground tabular-nums">{Math.round(zoom * 100)}%</span>
            <button onClick={zoomIn} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>

        {/* ── PROPERTIES PANEL ── */}
        {showProperties && (
          <FloorPropertiesPanel
            selected={selected}
            mode={mode}
            rooms={rooms}
            walls={walls}
            doors={doors}
            windows={windows}
            furniture={furniture}
            stairs={stairs}
            ramps={ramps}
            elevators={elevators}
            labels={labels}
            onUpdateRoom={(id, ch) => { updFloor(rooms.map((r) => r.id === id ? { ...r, ...ch } : r), fpaths); }}
            onUpdateWall={(id, ch) => { updFloor(rooms, fpaths, walls.map((w) => w.id === id ? { ...w, ...ch } : w)); }}
            onUpdateDoor={(id, ch) => { updFloor(rooms, fpaths, walls, doors.map((d) => d.id === id ? { ...d, ...ch } : d)); }}
            onUpdateWindow={(id, ch) => { updFloor(rooms, fpaths, walls, doors, windows.map((w) => w.id === id ? { ...w, ...ch } : w)); }}
            onUpdateFurniture={(id, ch) => { updFloor(rooms, fpaths, walls, doors, windows, furniture.map((f) => f.id === id ? { ...f, ...ch } : f)); }}
            onUpdateStairs={(id, ch) => { updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs.map((s) => s.id === id ? { ...s, ...ch } : s)); }}
            onUpdateRamp={(id, ch) => { updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels, ramps.map((r) => r.id === id ? { ...r, ...ch } : r)); }}
            onUpdateElevator={(id, ch) => { updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators.map((e) => e.id === id ? { ...e, ...ch } : e)); }}
            onUpdateLabel={(id, ch) => { updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels.map((l) => l.id === id ? { ...l, ...ch } : l)); }}
            onToggleNavConnection={onToggleNavConnection}
            onDeleteSelected={() => {
              if (!selected) return;
              const { type, id } = selected;
              if (type === "room") updFloor(rooms.filter((r) => r.id !== id), fpaths);
              else if (type === "wall") updFloor(rooms, fpaths, walls.filter((w) => w.id !== id));
              else if (type === "door") updFloor(rooms, fpaths, walls, doors.filter((d) => d.id !== id));
              else if (type === "window") updFloor(rooms, fpaths, walls, doors, windows.filter((w) => w.id !== id));
              else if (type === "furniture") updFloor(rooms, fpaths, walls, doors, windows, furniture.filter((f) => f.id !== id));
              else if (type === "stairs") updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs.filter((s) => s.id !== id));
              else if (type === "elevator") updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators.filter((e) => e.id !== id));
              else if (type === "label") updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels.filter((l) => l.id !== id));
              setSelected(null);
            }}
            onClose={() => setShowProperties(false)}
          />
        )}

        {/* ── CONTEXT MENU ── */}
        <AnimatePresence>
          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              type={contextMenu.type}
              onClose={() => setContextMenu(null)}
              onAction={handleFloorContextAction}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
