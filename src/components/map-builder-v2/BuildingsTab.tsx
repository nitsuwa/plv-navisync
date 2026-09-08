import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MousePointer2, Hand, Square, Trash2, Copy, RotateCcw, Maximize2,
  Undo2, Redo2, Pencil, Lock, EyeOff,
  Plus, MapPin, Building2, Palette, Type, ChevronDown, ChevronUp,
  Layers3, Grid3X3, AlignCenter, AlignStartVertical, ZoomIn, ZoomOut,
  PanelRightOpen, PanelRightClose, Settings2, DoorOpen, GitBranch,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { genId, BUILDING_COLORS } from "../map-builder/constants";
import { useToast } from "../../hooks/useToast";
import type { Campus, CampusBuilding, SimpleTool } from "../map-builder/types";
import { nextBuildingCopyIdentity } from "../../lib/buildingDefaults";
import { duplicateFloorForBuilding } from "../../lib/floorPlanNormalization";

// ── Props ────────────────────────────────────────────────────────────────────

interface BuildingsTabProps {
  campus: Campus;
  onUpdate: (campus: Campus) => void;
  onOpenFloorPlan: (buildingId: string, floorId: string) => void;
}

// ── Tool definitions ─────────────────────────────────────────────────────────

interface ToolDef {
  id: SimpleTool;
  icon: React.ElementType;
  label: string;
  key: string;
}

const TOOLS: ToolDef[] = [
  { id: "select",   icon: MousePointer2, label: "Select",   key: "V" },
  { id: "pan",      icon: Hand,          label: "Pan",      key: "H" },
  { id: "building", icon: Building2,     label: "Building", key: "B" },
  { id: "marker",   icon: MapPin,        label: "Marker",   key: "M" },
  { id: "path",     icon: GitBranch,     label: "Path",     key: "P" },
  { id: "erase",    icon: Trash2,        label: "Erase",    key: "E" },
];

// ══════════════════════════════════════════════════════════════════════════════

export function BuildingsTab({ campus, onUpdate, onOpenFloorPlan }: BuildingsTabProps) {
  const [tool, setTool] = useState<SimpleTool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [dragging, setDragging] = useState<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; corner: string; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number } | null>(null);
  const [drawingPath, setDrawingPath] = useState<{ x: number; y: number }[]>([]);
  const [buildingDrag, setBuildingDrag] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: "building" | "marker"; id: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const prevToolRef = useRef<SimpleTool | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const toast = useToast();

  // ── Undo/Redo history (30 levels) ────────────────────────────────────────
  const MAX_HISTORY = 30;
  const historyRef = useRef<{ snapshots: string[]; idx: number }>({
    snapshots: [JSON.stringify(campus)],
    idx: 0,
  });

  const pushHistory = useCallback(() => {
    const h = historyRef.current;
    const pruned = h.snapshots.slice(0, h.idx + 1);
    const serialized = JSON.stringify(campus);
    // Avoid duplicate snapshots (e.g. after undo, then immediate mutation)
    if (pruned[pruned.length - 1] === serialized) return;
    pruned.push(serialized);
    if (pruned.length > MAX_HISTORY) pruned.shift();
    historyRef.current = { snapshots: pruned, idx: pruned.length - 1 };
  }, [campus]);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.idx <= 0) {
      toast.info("Nothing to undo", "No more actions in history.");
      return;
    }
    const newIdx = h.idx - 1;
    historyRef.current = { ...h, idx: newIdx };
    const restored = JSON.parse(h.snapshots[newIdx]) as Campus;
    onUpdate(restored);
  }, [onUpdate, toast]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.idx >= h.snapshots.length - 1) {
      toast.info("Nothing to redo", "No more actions to redo.");
      return;
    }
    const newIdx = h.idx + 1;
    historyRef.current = { ...h, idx: newIdx };
    const restored = JSON.parse(h.snapshots[newIdx]) as Campus;
    onUpdate(restored);
  }, [onUpdate, toast]);

  // Reset history when switching to a different campus
  const prevCampusIdRef = useRef(campus.id);
  useEffect(() => {
    if (campus.id !== prevCampusIdRef.current) {
      prevCampusIdRef.current = campus.id;
      historyRef.current = { snapshots: [JSON.stringify(campus)], idx: 0 };
    }
  }, [campus.id, campus]);

  const buildings = campus.buildings;
  const markers = campus.markers;
  const paths = campus.paths;
  const selectedBuilding = selectedId ? buildings.find((b) => b.id === selectedId) ?? null : null;
  const selectedMarker = selectedId ? markers.find((m) => m.id === selectedId) ?? null : null;
  const selection = selectedBuilding ?? selectedMarker;

  const SNAP = 20;
  const snap = (v: number) => snapToGrid ? Math.round(v / SNAP) * SNAP : Math.round(v);

  // ── Get SVG point from mouse event ─────────────────────────────────────────
  const getPoint = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = campus.canvasW / rect.width;
    const scaleY = campus.canvasH / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX / zoom - pan.x / zoom,
      y: (e.clientY - rect.top) * scaleY / zoom - pan.y / zoom,
    };
  }, [campus.canvasW, campus.canvasH, zoom, pan]);

  // ── SVG Mouse handlers ──────────────────────────────────────────────────────
  const handleSvgDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Middle-click: always pan
    if (e.button === 1) {
      setPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    // Pan tool: left-click starts pan
    if (tool === "pan") {
      setPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    const pt = getPoint(e);
    const target = e.target as SVGElement;
    const isBg = target === svgRef.current || target.dataset.bg === "true";

    if (tool === "select" && isBg) {
      setSelectedId(null);
      return;
    }

    if (tool === "building") {
      const clampedPt = {
        x: Math.max(0, Math.min(campus.canvasW, snap(pt.x))),
        y: Math.max(0, Math.min(campus.canvasH, snap(pt.y))),
      };
      setBuildingDrag({ sx: clampedPt.x, sy: clampedPt.y, cx: clampedPt.x, cy: clampedPt.y });
      return;
    }

    if (tool === "marker") {
      const clampedPt = {
        x: Math.max(0, Math.min(campus.canvasW, snap(pt.x))),
        y: Math.max(0, Math.min(campus.canvasH, snap(pt.y))),
      };
      const newMarker = {
        id: genId("mk"),
        name: "Point of Interest",
        type: "poi",
        x: clampedPt.x,
        y: clampedPt.y,
        color: "#0e2a6e",
      };
      pushHistory();
      onUpdate({ ...campus, markers: [...campus.markers, newMarker] });
      setSelectedId(newMarker.id);
      setTool("select");
      return;
    }

    if (tool === "path") {
      const pt2 = getPoint(e);
      setDrawingPath((p) => [...p, { x: snap(pt2.x), y: snap(pt2.y) }]);
      return;
    }
  }, [tool, getPoint, campus, snap, onUpdate, pushHistory]);

  const handleSvgMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pt = getPoint(e);
    setCursorPos({ x: Math.round(pt.x), y: Math.round(pt.y) });

    if (panning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }

    if (buildingDrag) {
      setBuildingDrag({ ...buildingDrag, cx: snap(pt.x), cy: snap(pt.y) });
      return;
    }

    if (dragging) {
      const b = buildings.find((b) => b.id === dragging.id);
      if (!b) return;
      const newX = snap(dragging.ox + (pt.x - dragging.sx));
      const newY = snap(dragging.oy + (pt.y - dragging.sy));
      const updated = buildings.map((bld) =>
        bld.id === dragging.id ? { ...bld, x: newX, y: newY } : bld
      );
      onUpdate({ ...campus, buildings: updated });
      return;
    }

    if (resizing) {
      const dx = pt.x - resizing.sx;
      const dy = pt.y - resizing.sy;
      let nx = resizing.ox, ny = resizing.oy, nw = resizing.ow, nh = resizing.oh;
      if (resizing.corner.includes("e")) nw = Math.max(40, resizing.ow + dx);
      if (resizing.corner.includes("w")) { nx = resizing.ox + dx; nw = Math.max(40, resizing.ow - dx); }
      if (resizing.corner.includes("s")) nh = Math.max(30, resizing.oh + dy);
      if (resizing.corner.includes("n")) { ny = resizing.oy + dy; nh = Math.max(30, resizing.oh - dy); }
      const updated = buildings.map((bld) =>
        bld.id === resizing.id ? { ...bld, x: snap(nx), y: snap(ny), width: snap(nw), height: snap(nh) } : bld
      );
      onUpdate({ ...campus, buildings: updated });
    }
  }, [getPoint, panning, panStart, buildingDrag, dragging, resizing, buildings, campus, snap, onUpdate]);

  const handleSvgUp = useCallback(() => {
    if (buildingDrag) {
      const w = Math.abs(buildingDrag.cx - buildingDrag.sx);
      const h = Math.abs(buildingDrag.cy - buildingDrag.sy);
      if (w > 20 && h > 20) {
        const bld: CampusBuilding = {
          id: genId("bld"),
          name: "New Building",
          code: "NEW",
          category: "Academic",
          description: "",
          x: Math.min(buildingDrag.sx, buildingDrag.cx),
          y: Math.min(buildingDrag.sy, buildingDrag.cy),
          width: w,
          height: h,
          color: BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)],
          floors: [{
            id: genId("fl"),
            number: 1,
            label: "Ground Floor",
            rooms: [],
            paths: [],
            walls: [],
            doors: [],
            windows: [],
            furniture: [],
            stairs: [],
            elevators: [],
            labels: [],
          }],
        };
        pushHistory();
        onUpdate({ ...campus, buildings: [...campus.buildings, bld] });
        setSelectedId(bld.id);
        toast.success("Building added", "Double-click to edit properties.");
      }
      setBuildingDrag(null);
    }

    if (drawingPath.length >= 2) {
      const newPath = {
        id: genId("pt"),
        points: drawingPath,
        type: "footpath",
        color: "#94a3b8",
        width: 3,
      };
      pushHistory();
      onUpdate({ ...campus, paths: [...campus.paths, newPath] });
      setDrawingPath([]);
      return;
    }

    setDragging(null);
    setResizing(null);
    setPanning(false);
  }, [buildingDrag, drawingPath, campus, onUpdate, toast]);

  // ── Building click handler ──────────────────────────────────────────────────
  const handleBuildingClick = useCallback((e: React.MouseEvent, buildingId: string) => {
    e.stopPropagation();
    const b = buildings.find((x) => x.id === buildingId);
    if (b?.locked) return;
    if (tool === "select") {
      setSelectedId(buildingId);
    } else if (tool === "erase") {
      pushHistory();
      const updated = buildings.filter((b) => b.id !== buildingId);
      onUpdate({ ...campus, buildings: updated });
      if (selectedId === buildingId) setSelectedId(null);
      toast.success("Building removed");
    }
  }, [tool, buildings, campus, onUpdate, selectedId, toast]);

  const handleBuildingDragStart = useCallback((e: React.MouseEvent, buildingId: string) => {
    if (tool !== "select") return;
    e.stopPropagation();
    const b = buildings.find((b) => b.id === buildingId);
    if (!b || b.locked) return;
    const pt = getPoint(e);
    pushHistory();
    setDragging({ id: buildingId, sx: pt.x, sy: pt.y, ox: b.x, oy: b.y });
    setSelectedId(buildingId);
  }, [tool, buildings, getPoint, pushHistory]);

  const handleResizeStart = useCallback((e: React.MouseEvent, buildingId: string, corner: string) => {
    e.stopPropagation();
    const b = buildings.find((b) => b.id === buildingId);
    if (!b || b.locked) return;
    const pt = getPoint(e);
    pushHistory();
    setResizing({ id: buildingId, corner, sx: pt.x, sy: pt.y, ox: b.x, oy: b.y, ow: b.width, oh: b.height });
  }, [buildings, getPoint, pushHistory]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Undo/Redo (must come first to intercept Ctrl+Z before lowercase 'z')
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }

      // Space key — hold-to-pan (like Figma/Photoshop)
      if (e.code === "Space" && !e.repeat && tool !== "pan") {
        e.preventDefault();
        prevToolRef.current = tool;
        setTool("pan");
        return;
      }

      switch (e.key.toLowerCase()) {
        case "v": setTool("select"); break;
        case "h": setTool("pan"); break;
        case "b": setTool("building"); break;
        case "m": setTool("marker"); break;
        case "p": setTool("path"); break;
        case "e": setTool("erase"); break;
        case "delete":
        case "backspace":
          if (selectedId) {
            const isBldg = buildings.some((b) => b.id === selectedId);
            if (isBldg) {
              const b = buildings.find((x) => x.id === selectedId);
              if (b?.locked) break;
            }
            pushHistory();
            if (isBldg) {
              onUpdate({ ...campus, buildings: buildings.filter((b) => b.id !== selectedId) });
            } else {
              onUpdate({ ...campus, markers: markers.filter((m) => m.id !== selectedId) });
            }
            setSelectedId(null);
          }
          break;
        case "+":
        case "=":
          setZoom((z) => Math.min(3, z + 0.1));
          break;
        case "-":
          setZoom((z) => Math.max(0.2, z - 0.1));
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, buildings, markers, campus, onUpdate, pushHistory, undo, redo, tool]);

  // ── Space keyup: restore previous tool when Space is released (hold-to-pan) ──
  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && prevToolRef.current !== null) {
        e.preventDefault();
        const prev = prevToolRef.current;
        prevToolRef.current = null;
        setTool(prev);
      }
    };
    window.addEventListener("keyup", handleKeyUp);
    return () => window.removeEventListener("keyup", handleKeyUp);
  }, []);

  // ── Update building property ────────────────────────────────────────────────
  const updateBuilding = useCallback((id: string, updates: Partial<CampusBuilding>) => {
    const updated = buildings.map((b) => (b.id === id ? { ...b, ...updates } : b));
    pushHistory();
    onUpdate({ ...campus, buildings: updated });
  }, [buildings, campus, onUpdate, pushHistory]);

  const deleteBuilding = useCallback((id: string) => {
    pushHistory();
    onUpdate({ ...campus, buildings: buildings.filter((b) => b.id !== id) });
    setSelectedId(null);
    toast.success("Building deleted");
  }, [buildings, campus, onUpdate, toast, pushHistory]);

  const duplicateBuilding = useCallback((id: string) => {
    const source = buildings.find((b) => b.id === id);
    if (!source) return;
    const copyId = genId("bld");
    const identity = nextBuildingCopyIdentity(source, buildings, [], copyId);
    const clone: CampusBuilding = {
      ...structuredClone(source),
      id: copyId,
      name: identity.name,
      code: identity.code,
      x: source.x + 30,
      y: source.y + 30,
      floors: (source.floors ?? []).map((floor) => duplicateFloorForBuilding(floor, {
        id: genId("fl"), buildingId: copyId, number: floor.number, label: floor.label,
      })),
    };
    pushHistory();
    onUpdate({ ...campus, buildings: [...buildings, clone] });
    setSelectedId(clone.id);
    toast.success("Building duplicated");
  }, [buildings, campus, onUpdate, toast, pushHistory]);

  // ── Context menu action handler ────────────────────────────────────────────
  const handleContextAction = useCallback((action: string) => {
    if (!contextMenu) return;
    const { type, id } = contextMenu;

    if (type === "building") {
      const b = buildings.find((x) => x.id === id);
      if (!b) return;
      switch (action) {
        case "rename": setSelectedId(id); setShowPanel(true); break;
        case "duplicate": duplicateBuilding(id); break;
        case "lock": updateBuilding(id, { locked: !b.locked }); break;
        case "hide": updateBuilding(id, { visible: !(b.visible ?? true) }); break;
        case "delete": deleteBuilding(id); break;
      }
    } else if (type === "marker") {
      if (action === "rename") { setSelectedId(id); setShowPanel(true); }
      else if (action === "delete") {
        pushHistory();
        onUpdate({ ...campus, markers: markers.filter((m) => m.id !== id) });
        setSelectedId(null);
      }
    }
    setContextMenu(null);
  }, [contextMenu, buildings, markers, campus, onUpdate, duplicateBuilding, updateBuilding, deleteBuilding, pushHistory]);

  // ── Close context menu on click outside or Escape ──────────────────────────
  useEffect(() => {
    if (!contextMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    // Delay to avoid the right-click event itself closing the menu
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    window.addEventListener("keydown", handleEsc);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [contextMenu]);

  // ── Finalize path drawing on double-click ───────────────────────────────────
  const handleSvgDoubleClick = useCallback(() => {
    if (drawingPath.length >= 2) {
      const newPath = {
        id: genId("pt"),
        points: drawingPath,
        type: "footpath",
        color: "#94a3b8",
        width: 3,
      };
      pushHistory();
      onUpdate({ ...campus, paths: [...campus.paths, newPath] });
      setDrawingPath([]);
    }
  }, [drawingPath, campus, onUpdate, pushHistory]);

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* ── Main canvas area ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 relative bg-[#f8f9fc] dark:bg-[#0f1117]">
        {/* Floating toolbar */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1.5 rounded-xl bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border border-border/60 shadow-lg shadow-black/5">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            const isActive = tool === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                title={`${t.label} (${t.key})`}
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
          <div className="w-px h-6 bg-border mx-1" />
          <button
            onClick={undo}
            title="Undo (Ctrl+Z)"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={redo}
            title="Redo (Ctrl+Shift+Z)"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <div className="w-px h-6 bg-border mx-1" />
          <button
            onClick={() => setSnapToGrid(!snapToGrid)}
            title="Snap to Grid"
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-lg transition-all",
              snapToGrid ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setZoom(1)}
            title="Reset Zoom"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted transition-all"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        {/* Zoom controls */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1.5 rounded-xl bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border border-border/60 shadow-lg">
          <button onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))} className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:bg-muted transition-all">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="text-[11px] font-bold text-foreground min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(3, z + 0.1))} className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:bg-muted transition-all">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* SVG Canvas */}
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${campus.canvasW} ${campus.canvasH}`}
          preserveAspectRatio="xMidYMid meet"
          style={{
            cursor: tool === "pan" ? (panning ? "grabbing" : "grab") : tool === "erase" ? "not-allowed" : tool === "select" ? "default" : "crosshair",
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: "center center",
          }}
          onMouseDown={handleSvgDown}
          onMouseMove={handleSvgMove}
          onMouseUp={handleSvgUp}
          onDoubleClick={handleSvgDoubleClick}
        >
          {/* Background */}
          <rect
            data-bg="true"
            width={campus.canvasW}
            height={campus.canvasH}
            fill="var(--background)"
            stroke="var(--border)"
            strokeWidth="1"
            rx="0"
          />

          {/* Grid */}
          {snapToGrid && (
            <defs>
              <pattern id="grid" width={SNAP} height={SNAP} patternUnits="userSpaceOnUse">
                <path d={`M ${SNAP} 0 L 0 0 0 ${SNAP}`} fill="none" stroke="var(--border)" strokeWidth="0.5" opacity="0.3" />
              </pattern>
            </defs>
          )}
          {snapToGrid && <rect width={campus.canvasW} height={campus.canvasH} fill="url(#grid)" />}

          {/* Paths */}
          {paths.map((path) => (
            <polyline
              key={path.id}
              points={path.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={path.color}
              strokeWidth={path.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.6}
            />
          ))}

          {/* Drawing path preview */}
          {drawingPath.length > 0 && (
            <polyline
              points={drawingPath.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={2}
              strokeDasharray="6 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Building drag preview */}
          {buildingDrag && (
            <rect
              x={Math.min(buildingDrag.sx, buildingDrag.cx)}
              y={Math.min(buildingDrag.sy, buildingDrag.cy)}
              width={Math.abs(buildingDrag.cx - buildingDrag.sx)}
              height={Math.abs(buildingDrag.cy - buildingDrag.sy)}
              fill="rgba(59,130,246,0.08)"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeDasharray="6 3"
              rx="4"
            />
          )}

          {/* Buildings */}
          {buildings.map((b) => {
            const isSelected = selectedId === b.id;
            const isLocked = b.locked ?? false;
            const isVisible = b.visible ?? true;
            const opacity = isVisible ? (isLocked ? 0.85 : 1) : 0.25;
            if (!isVisible && !isSelected) return null;
            return (
              <g key={b.id} style={{ opacity }}>
                {/* Building shadow */}
                {isVisible && (
                  <rect
                    x={b.x + 3}
                    y={b.y + 3}
                    width={b.width}
                    height={b.height}
                    rx="6"
                    fill="rgba(0,0,0,0.06)"
                    className="dark:fill-white/5"
                  />
                )}
                {/* Building body */}
                <rect
                  x={b.x}
                  y={b.y}
                  width={b.width}
                  height={b.height}
                  rx="6"
                  fill={b.color + "15"}
                  stroke={isSelected ? "#3b82f6" : b.color}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  className={cn(
                    "transition-all duration-150",
                    isSelected && "drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]"
                  )}
                  onContextMenu={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    setContextMenu({ x: e.clientX, y: e.clientY, type: "building", id: b.id });
                    setSelectedId(b.id);
                  }}
                  style={{
                    cursor: isLocked ? "default" : tool === "pan" ? (panning ? "grabbing" : "grab") : tool === "select" ? "move" : tool === "erase" ? "pointer" : "default",
                    strokeDasharray: !isVisible ? "6 4" : undefined,
                  }}
                  onClick={(e) => handleBuildingClick(e, b.id)}
                  onMouseDown={(e) => handleBuildingDragStart(e, b.id)}
                />
                {/* Lock badge */}
                {isLocked && (
                  <g>
                    <rect x={b.x + b.width - 18} y={b.y + 4} width={14} height={12} rx={2} fill="rgba(255,255,255,0.9)" />
                    <text x={b.x + b.width - 11} y={b.y + 13} textAnchor="middle" fill="#92400e" fontSize={9} fontWeight="900" pointerEvents="none" className="select-none">🔒</text>
                  </g>
                )}
                {/* Hidden badge */}
                {!isVisible && (
                  <g>
                    <rect x={b.x + b.width - 18} y={b.y + 4} width={14} height={12} rx={2} fill="rgba(255,255,255,0.85)" />
                    <text x={b.x + b.width - 11} y={b.y + 13} textAnchor="middle" fill="#6b7280" fontSize={8} fontWeight="900" pointerEvents="none" className="select-none">👁</text>
                  </g>
                )}
                {/* Building label */}
                <text
                  x={b.x + b.width / 2}
                  y={b.y + b.height / 2 - 4}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isSelected ? "#1e40af" : "#334155"}
                  className="dark:fill-gray-300"
                  fontSize="11"
                  fontWeight="700"
                  fontFamily="var(--font-body)"
                  pointerEvents="none"
                >
                  {b.code}
                </text>
                <text
                  x={b.x + b.width / 2}
                  y={b.y + b.height / 2 + 12}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#64748b"
                  className="dark:fill-gray-500"
                  fontSize="8"
                  fontFamily="var(--font-body)"
                  pointerEvents="none"
                >
                  {b.floors.length} floor{b.floors.length !== 1 ? "s" : ""}
                </text>
                {/* Resize handles (only show for unlocked, visible buildings) */}
                {isSelected && !isLocked && isVisible && (
                  <>
                    {["nw", "ne", "sw", "se"].map((corner) => {
                      const hx = corner.includes("e") ? b.x + b.width : b.x;
                      const hy = corner.includes("s") ? b.y + b.height : b.y;
                      return (
                        <rect
                          key={corner}
                          x={hx - 5}
                          y={hy - 5}
                          width={10}
                          height={10}
                          rx="2"
                          fill="white"
                          stroke="#3b82f6"
                          strokeWidth="2"
                          style={{
                            cursor: corner === "nw" ? "nw-resize" : corner === "ne" ? "ne-resize" : corner === "sw" ? "sw-resize" : "se-resize",
                            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.15))",
                          }}
                          onMouseDown={(e) => handleResizeStart(e, b.id, corner)}
                        />
                      );
                    })}
                    {/* Edge handles */}
                    {["n", "s", "e", "w"].map((edge) => {
                      const ex = edge === "e" ? b.x + b.width : edge === "w" ? b.x : b.x + b.width / 2;
                      const ey = edge === "s" ? b.y + b.height : edge === "n" ? b.y : b.y + b.height / 2;
                      return (
                        <rect
                          key={edge}
                          x={ex - 4}
                          y={ey - 4}
                          width={8}
                          height={8}
                          rx="2"
                          fill="white"
                          stroke="#3b82f6"
                          strokeWidth="1.5"
                          style={{
                            cursor: edge === "n" || edge === "s" ? "ns-resize" : "ew-resize",
                            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.15))",
                          }}
                          onMouseDown={(e) => handleResizeStart(e, b.id, edge)}
                        />
                      );
                    })}
                  </>
                )}
              </g>
            );
          })}

          {/* Markers */}
          {markers.map((m) => (
            <g key={m.id} onContextMenu={(e) => {
              e.preventDefault(); e.stopPropagation();
              setContextMenu({ x: e.clientX, y: e.clientY, type: "marker", id: m.id });
              setSelectedId(m.id);
            }}>
              <circle
                cx={m.x}
                cy={m.y}
                r={6}
                fill={m.color}
                stroke="white"
                strokeWidth="2"
                className="cursor-pointer drop-shadow-sm"
                onClick={() => {
                  if (tool === "erase") {
                    pushHistory();
                    onUpdate({ ...campus, markers: markers.filter((mk) => mk.id !== m.id) });
                  } else {
                    setSelectedId(m.id);
                  }
                }}
              />
              <text
                x={m.x}
                y={m.y - 10}
                textAnchor="middle"
                fill="#475569"
                className="dark:fill-gray-400"
                fontSize="9"
                fontWeight="600"
                pointerEvents="none"
              >
                {m.name}
              </text>
            </g>
          ))}

          {/* Cursor crosshair */}
          {tool !== "select" && tool !== "pan" && (
            <line x1={cursorPos.x - 8} y1={cursorPos.y} x2={cursorPos.x + 8} y2={cursorPos.y} stroke="#3b82f6" strokeWidth="1" opacity="0.5" />
          )}
        </svg>
      </div>

      {/* ── Floating Properties Panel ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showPanel && selection && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="border-l border-border bg-card overflow-y-auto shrink-0"
          >
            <div className="p-4 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedBuilding ? selectedBuilding.color : selectedMarker?.color ?? '#6366f1' }} />
                  <h3 className="text-sm font-bold text-foreground">{selectedBuilding ? 'Building' : 'Marker'} Properties</h3>
                </div>
                <button
                  onClick={() => setShowPanel(false)}
                  className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:bg-muted transition-all"
                >
                  <PanelRightClose className="h-4 w-4" />
                </button>
              </div>

              {/* Name */}
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Name</label>
                <input
                  type="text"
                  value={selectedBuilding ? selectedBuilding.name : selectedMarker?.name ?? ''}
                  onChange={(e) => {
                    if (selectedBuilding) updateBuilding(selectedBuilding.id, { name: e.target.value });
                    else if (selectedMarker) { pushHistory(); onUpdate({ ...campus, markers: markers.map((m) => m.id === selectedMarker.id ? { ...m, name: e.target.value } : m) }); }
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>

              {selectedBuilding && (
                <>
              {/* Code */}
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Code</label>
                <input
                  type="text"
                  value={selectedBuilding.code}
                  onChange={(e) => updateBuilding(selectedBuilding.id, { code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Category</label>
                <select
                  value={selectedBuilding.category}
                  onChange={(e) => updateBuilding(selectedBuilding.id, { category: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                >
                  {["Academic", "Administrative", "Library", "Laboratory", "Sports", "Dormitory", "Medical", "Canteen", "Security", "Other"].map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Color */}
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Color</label>
                <div className="flex flex-wrap gap-1.5">
                  {BUILDING_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => updateBuilding(selectedBuilding.id, { color })}
                      className={cn(
                        "w-7 h-7 rounded-lg border-2 transition-all",
                        selectedBuilding.color === color
                          ? "border-foreground scale-110 shadow-sm"
                          : "border-transparent hover:scale-105"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Description</label>
                <textarea
                  value={selectedBuilding.description}
                  onChange={(e) => updateBuilding(selectedBuilding.id, { description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
                />
              </div>

              {/* Position info */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">X</label>
                  <input
                    type="number"
                    value={Math.round(selectedBuilding.x)}
                    onChange={(e) => updateBuilding(selectedBuilding.id, { x: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Y</label>
                  <input
                    type="number"
                    value={Math.round(selectedBuilding.y)}
                    onChange={(e) => updateBuilding(selectedBuilding.id, { y: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </div>
              </div>

              {/* Floor count */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50">
                <div>
                  <p className="text-xs font-bold text-foreground">Floors</p>
                  <p className="text-[10px] text-muted-foreground">{selectedBuilding.floors.length} floor{selectedBuilding.floors.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const floors = [...selectedBuilding.floors];
                      if (floors.length > 1) {
                        floors.pop();
                        updateBuilding(selectedBuilding.id, { floors });
                      }
                    }}
                    disabled={selectedBuilding.floors.length <= 1}
                    className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30 transition-all"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-sm font-bold text-foreground min-w-[16px] text-center">{selectedBuilding.floors.length}</span>
                  <button
                    onClick={() => {
                      const floors = [...selectedBuilding.floors];
                      floors.push({
                        id: genId("fl"),
                        label: `Floor ${floors.length + 1}`,
                        number: floors.length + 1,
                        rooms: [],
                        paths: [],
                        walls: [],
                        doors: [],
                        windows: [],
                        furniture: [],
                        stairs: [],
                        elevators: [],
                        labels: [],
                      });
                      updateBuilding(selectedBuilding.id, { floors });
                    }}
                    className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:bg-muted transition-all"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Floor plans list */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Floor Plans</label>
                {selectedBuilding.floors.map((floor) => (
                  <button
                    key={floor.id}
                    onClick={() => onOpenFloorPlan(selectedBuilding.id, floor.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/60 border border-border/50 transition-all text-left group"
                  >
                    <Layers3 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{floor.label}</p>
                      <p className="text-[9px] text-muted-foreground">{floor.rooms.length} rooms</p>
                    </div>
                    <DoorOpen className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all" />
                  </button>
                ))}
              </div>

              {/* Status badges */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateBuilding(selectedBuilding.id, { locked: !selectedBuilding.locked })}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    selectedBuilding.locked
                      ? "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                      : "text-muted-foreground hover:bg-muted border border-transparent"
                  )}
                >
                  <Lock className={cn("h-3.5 w-3.5", selectedBuilding.locked && "fill-amber-500/20")} />
                  {selectedBuilding.locked ? "Locked" : "Lock"}
                </button>
                <button
                  onClick={() => updateBuilding(selectedBuilding.id, { visible: !(selectedBuilding.visible ?? true) })}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    !(selectedBuilding.visible ?? true)
                      ? "bg-muted text-muted-foreground border border-border"
                      : "text-muted-foreground hover:bg-muted border border-transparent"
                  )}
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  {selectedBuilding.visible ?? true ? "Hide" : "Hidden"}
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <button
                  onClick={() => duplicateBuilding(selectedBuilding.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-muted-foreground hover:bg-muted transition-all"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Duplicate
                </button>
                <button
                  onClick={() => {
                    const rotation = ((selectedBuilding.rotation ?? 0) + 90) % 360;
                    updateBuilding(selectedBuilding.id, { rotation });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-muted-foreground hover:bg-muted transition-all"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Rotate
                </button>
                <div className="flex-1" />
                {!selectedBuilding.locked && (
                  <button
                    onClick={() => deleteBuilding(selectedBuilding.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </div>
                </>
              )}

              {/* ── Marker Properties ── */}
              {selectedMarker && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">X</label>
                      <input type="number" value={Math.round(selectedMarker.x)}
                        onChange={(e) => { pushHistory(); onUpdate({ ...campus, markers: markers.map((m) => m.id === selectedMarker.id ? { ...m, x: Number(e.target.value) } : m) }); }}
                        className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Y</label>
                      <input type="number" value={Math.round(selectedMarker.y)}
                        onChange={(e) => { pushHistory(); onUpdate({ ...campus, markers: markers.map((m) => m.id === selectedMarker.id ? { ...m, y: Number(e.target.value) } : m) }); }}
                        className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Color</label>
                    <div className="flex flex-wrap gap-1.5">
                      {["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed", "#db2777", "#0891b2"].map((color) => (
                        <button key={color}
                          onClick={() => { pushHistory(); onUpdate({ ...campus, markers: markers.map((m) => m.id === selectedMarker.id ? { ...m, color } : m) }); }}
                          className={cn("w-6 h-6 rounded-lg border-2 transition-all",
                            selectedMarker.color === color ? "border-foreground scale-110" : "border-transparent hover:scale-105")}
                          style={{ backgroundColor: color }} />
                      ))}
                    </div>
                  </div>
                  <button onClick={() => {
                    pushHistory();
                    onUpdate({ ...campus, markers: markers.filter((m) => m.id !== selectedMarker.id) });
                    setSelectedId(null);
                  }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all">
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Marker
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Context menu overlay ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            key="context-menu"
            ref={contextMenuRef}
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -4 }}
            transition={{ type: "spring", stiffness: 350, damping: 25, mass: 0.8 }}
            className="fixed z-[100]"
            style={{ left: Math.min(contextMenu.x, window.innerWidth - 180), top: Math.min(contextMenu.y, window.innerHeight - 220) }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden py-1 min-w-[168px]">
            {(() => {
              const isBuilding = contextMenu.type === "building";
              const b = isBuilding ? buildings.find((x) => x.id === contextMenu.id) : null;
              const items = isBuilding
                ? [
                    { action: "rename", label: "Rename", icon: Pencil },
                    { action: "duplicate", label: "Duplicate", icon: Copy },
                    { action: "lock", label: b?.locked ? "Unlock" : "Lock", icon: Lock },
                    { action: "hide", label: (b?.visible ?? true) ? "Hide" : "Show", icon: EyeOff },
                    { action: "divider" },
                    { action: "delete", label: "Delete", icon: Trash2, danger: true },
                  ]
                : [
                    { action: "rename", label: "Rename", icon: Pencil },
                    { action: "divider" },
                    { action: "delete", label: "Delete", icon: Trash2, danger: true },
                  ];
              return items.map((item, i) =>
                item.action === "divider" ? (
                  <div key={i} className="h-px bg-border my-1" />
                ) : (
                  <motion.button
                    key={item.action}
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleContextAction(item.action)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-semibold transition-colors text-left",
                      (item as any).danger
                        ? "text-destructive hover:bg-destructive/10"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    <item.icon className="h-3.5 w-3.5 shrink-0" />
                    {item.label}
                  </motion.button>
                )
              );
            })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toggle panel button ────────────────────────────────────────────────── */}
      {!showPanel && selection && (
        <button
          onClick={() => setShowPanel(true)}
          className="absolute right-4 top-20 z-20 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border border-border/60 shadow-lg text-xs font-bold text-foreground hover:bg-muted transition-all"
        >
          <PanelRightOpen className="h-4 w-4" />
          Properties
        </button>
      )}
    </div>
  );
}
