import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft, ChevronRight, CheckCircle2, Save, X, ZoomIn, ZoomOut, Maximize2,
  Undo2, Redo2, Info, Settings2,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useCanvasControls } from "./useCanvasControls";
import { useFloorHistory } from "./useFloorHistory";
import { ROOM_TYPES, ROOM_MAP, FLOOR_TOOLS } from "./constants";
import { genId } from "./constants";
import { useToast } from "../../hooks/useToast";
import { Combobox } from "../ui/Combobox";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { Campus, FloorRoom, FloorPath, FloorSelection, SimpleTool, RoomResizeState } from "./types";

// ── Snap & collision helpers ────────────────────────────────────────────────

const SNAP_THRESHOLD = 10;

/** Snap a single value to a target if within threshold */
function snapTo(val: number, target: number, threshold: number): number {
  return Math.abs(val - target) <= threshold ? target : val;
}

/** Apply wall snapping: snap dragged room's edges to nearby room edges */
function applyWallSnap(
  room: FloorRoom,
  others: FloorRoom[],
  threshold: number = SNAP_THRESHOLD,
): FloorRoom {
  let rx = room.x, ry = room.y, rw = room.w, rh = room.h;
  for (const o of others) {
    // Horizontal edges
    rx = snapTo(rx, o.x, threshold);
    rx = snapTo(rx, o.x + o.w, threshold);
    rx = snapTo(rx + rw, o.x, threshold) - rw;
    rx = snapTo(rx + rw, o.x + o.w, threshold) - rw;
    // Vertical edges
    ry = snapTo(ry, o.y, threshold);
    ry = snapTo(ry, o.y + o.h, threshold);
    ry = snapTo(ry + rh, o.y, threshold) - rh;
    ry = snapTo(ry + rh, o.y + o.h, threshold) - rh;
  }
  return { ...room, x: rx, y: ry };
}

// ── Component ───────────────────────────────────────────────────────────────

interface FloorEditorProps {
  campus: Campus;
  buildingId: string;
  floorId: string;
  onBack: () => void;
  onSwitchFloor: (floorId: string) => void;
  onUpdate: (c: Campus) => void;
}

const CANVAS_W = 580;
const CANVAS_H = 380;

export function FloorEditor({ campus, buildingId, floorId, onBack, onSwitchFloor, onUpdate }: FloorEditorProps) {
  const building = campus.buildings.find((b) => b.id === buildingId)!;
  const floor = building?.floors.find((f) => f.id === floorId)!;

  const [tool, setTool] = useState<SimpleTool>("select");
  const [selected, setSelected] = useState<string[]>([]);
  const [roomType, setRoomType] = useState("classroom");
  const [drawingPath, setDP] = useState<{ x: number; y: number }[]>([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roomTab, setRoomTab] = useState<"basic" | "advanced">("basic");
  const [wallSnap, setWallSnap] = useState(true);
  // ── Drag-to-create room ──
  const [roomDrag, setRoomDrag] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteRoom, setPendingDeleteRoom] = useState<string | null>(null);

  const toast = useToast();

  const FP_W = CANVAS_W;
  const FP_H = CANVAS_H;
  const { zoom, pan, panning, svgRef, containerRef, getPoint, startPan, movePan, endPan, resetView, zoomIn, zoomOut } =
    useCanvasControls(FP_W, FP_H);

  const dragging = useRef<{ ids: string[]; origins: FloorRoom[]; sx: number; sy: number } | null>(null);
  const resizing = useRef<RoomResizeState | null>(null);
  const [rotating, setRotating] = useState<{ id: string; cx: number; cy: number; startAngle: number; origRotation: number } | null>(null);

  const rooms = floor.rooms;
  const fpaths = floor.paths;

  const { pushHistory, undo, redo, resetHistory } = useFloorHistory(rooms, fpaths);

  // Reset history when floor changes
  useEffect(() => { resetHistory(rooms, fpaths); }, [floorId]);

  const updFloor = useCallback(
    (newRooms: FloorRoom[], newPaths: FloorPath[]) => {
      onUpdate({
        ...campus,
        buildings: campus.buildings.map((b) =>
          b.id === buildingId
            ? { ...b, floors: b.floors.map((f) => (f.id === floorId ? { ...f, rooms: newRooms, paths: newPaths } : f)) }
            : b
        ),
      });
    },
    [campus, buildingId, floorId, onUpdate]
  );

  // ── SVG event handlers ──

  const handleSvgDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const target = e.target as SVGElement;
    const isBg = target === svgRef.current || target.dataset.bg === "true";
    if (!isBg) return;
    if (tool === "select" || tool === "erase") {
      if (!e.shiftKey) setSelected([]);
      startPan(e);
      return;
    }
    const pt = getPoint(e, FP_W, FP_H);
    if (tool === "room") {
      // Start drag-to-create with preview
      setRoomDrag({ sx: pt.x, sy: pt.y, cx: pt.x, cy: pt.y });
    } else if (tool === "path") {
      setDP((p) => [...p, { x: Math.round(pt.x), y: Math.round(pt.y) }]);
    }
  };

  const handleDbl = () => {
    if (tool === "path" && drawingPath.length >= 2) {
      pushHistory(rooms, fpaths);
      updFloor(rooms, [...fpaths, { id: genId("fp"), points: drawingPath, type: "footpath", color: "#94a3b8", width: 3 }]);
      setDP([]);
      setTool("select");
    }
  };

  // ── Room mouse handlers ──

  const onRoomDown = (e: React.MouseEvent, id: string, room: FloorRoom) => {
    e.stopPropagation();
    if (tool === "erase") {
      pushHistory(rooms, fpaths);
      updFloor(rooms.filter((r) => r.id !== id), fpaths);
      setSelected([]);
      return;
    }
    if (tool !== "select") return;
    let newSelected: string[];
    if (e.shiftKey) {
      newSelected = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
    } else {
      newSelected = [id];
    }
    setSelected(newSelected);
    const pt = getPoint(e, FP_W, FP_H);
    dragging.current = {
      ids: newSelected,
      origins: newSelected.map((sid) => ({ ...rooms.find((r) => r.id === sid)! })),
      sx: pt.x,
      sy: pt.y,
    };
  };

  // ── Resize handlers ──

  const onResizeStart = (e: React.MouseEvent, room: FloorRoom, corner: string) => {
    e.stopPropagation();
    if (tool !== "select" || !selected.includes(room.id) || selected.length > 1) return;
    pushHistory(rooms, fpaths);
    resizing.current = {
      id: room.id, corner,
      sx: e.clientX, sy: e.clientY,
      ox: room.x, oy: room.y, ow: room.w, oh: room.h,
    };
  };

  const handleSvgMoveResize = (e: React.MouseEvent) => {
    if (resizing.current) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scale = (FP_W / rect.width) / zoom;
      const dx = Math.round((e.clientX - resizing.current.sx) * scale);
      const dy = Math.round((e.clientY - resizing.current.sy) * scale);
      const { corner, ox, oy, ow, oh } = resizing.current;
      updFloor(
        rooms.map((r) => {
          if (r.id !== resizing.current!.id) return r;
          let nx = ox, ny = oy, nw = ow, nh = oh;
          if (corner.includes("e")) nw = Math.max(20, ow + dx);
          if (corner.includes("w")) { nx = ox + dx; nw = Math.max(20, ow - dx); }
          if (corner.includes("s")) nh = Math.max(15, oh + dy);
          if (corner.includes("n")) { ny = oy + dy; nh = Math.max(15, oh - dy); }
          return { ...r, x: nx, y: ny, w: nw, h: nh };
        }),
        fpaths
      );
    } else if (roomDrag) {
      // Room drag-to-create preview
      const pt = getPoint(e, FP_W, FP_H);
      const snapVal = (v: number) => wallSnap ? Math.round(v / 10) * 10 : Math.round(v);
      setRoomDrag({ ...roomDrag, cx: snapVal(pt.x), cy: snapVal(pt.y) });
    } else {
      movePan(e);
      const drag = dragging.current;
      if (!drag) return;
      const pt = getPoint(e, FP_W, FP_H);
      const dx = Math.round(pt.x - drag.sx);
      const dy = Math.round(pt.y - drag.sy);
      const moved = drag.origins.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy }));
      const snapped = wallSnap
        ? moved.map((r) => applyWallSnap(r, rooms.filter((o) => !drag.ids.includes(o.id)), SNAP_THRESHOLD))
        : moved;
      updFloor(
        rooms.map((r) => {
          const idx = drag.ids.indexOf(r.id);
          return idx >= 0 ? snapped[idx] : r;
        }),
        fpaths
      );
    }
  };

  const handleSvgUpResize = () => {
    endPan();
    dragging.current = null;
    resizing.current = null;
    // Finalize room drag-to-create
    if (roomDrag) {
      pushHistory(rooms, fpaths);
      const rx = Math.min(roomDrag.sx, roomDrag.cx);
      const ry = Math.min(roomDrag.sy, roomDrag.cy);
      const rw = Math.max(Math.abs(roomDrag.cx - roomDrag.sx), 30);
      const rh = Math.max(Math.abs(roomDrag.cy - roomDrag.sy), 20);
      const rm: FloorRoom = {
        id: genId("rm"), name: `${ROOM_MAP[roomType]?.label ?? "Room"}`,
        type: roomType, x: Math.round(rx), y: Math.round(ry), w: Math.round(rw), h: Math.round(rh),
      };
      const snapped = wallSnap ? applyWallSnap(rm, rooms, SNAP_THRESHOLD) : rm;
      updFloor([...rooms, snapped], fpaths);
      setSelected([snapped.id]);
      setTool("select");
      setRoomDrag(null);
      toast.success("Room created", "Edit properties in the right panel.");
    }
  };

  // ── Rotation handler (stub — rotation available in Properties Panel) ──

  // ── Keyboard shortcuts ──

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const entry = undo();
        if (entry) { updFloor(entry.rooms, entry.paths); setSelected([]); }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        const entry = redo();
        if (entry) { updFloor(entry.rooms, entry.paths); setSelected([]); }
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected.length > 0) {
        pushHistory(rooms, fpaths);
        updFloor(rooms.filter((r) => !selected.includes(r.id)), fpaths);
        setSelected([]);
        return;
      }
      if (e.key === "Escape") { setDP([]); setSelected([]); if (tool === "path") setTool("select"); }
      if (e.key === "v" || e.key === "V") setTool("select");
      if (e.key === "r" || e.key === "R") setTool("room");
      if (e.key === "p" || e.key === "P") setTool("path");
      if (e.key === "e" || e.key === "E") setTool("erase");
      if (e.key === "0") resetView();
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [selected, tool, rooms, fpaths, undo, redo]);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      onUpdate(campus);
      setSaving(false);
      setSaved(true);
      toast.success("Floor saved", `${floor.label} changes saved successfully.`);
      setTimeout(() => setSaved(false), 2000);
    }, 400);
  };

  const selRoom = selected.length === 1 ? rooms.find((r) => r.id === selected[0]) : undefined;
  const cursor = tool === "erase"
    ? "not-allowed"
    : panning.current
      ? "grabbing"
      : tool === "room" || tool === "path"
        ? "crosshair"
        : "default";

  return (
    <div className="flex flex-col w-full flex-1" style={{ minHeight: 0 }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="h-12 border-b border-border bg-card flex items-center px-4 gap-2 shrink-0"
      >
        <button onClick={onBack} className="flex items-center gap-1.5 h-7 px-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all text-xs font-semibold shrink-0">
          <ArrowLeft className="h-3.5 w-3.5" /> {campus.name}
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground shrink-0">{building.code}</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm font-extrabold text-foreground">{floor.label}</span>
        {/* Floor tabs */}
        <div className="flex items-center gap-1 ml-3 overflow-x-auto no-scrollbar">
          {building.floors.map((f) => (
            <button key={f.id}
              className={cn("shrink-0 h-7 px-2.5 rounded-lg text-[11px] font-extrabold transition-all",
                f.id === floorId ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-secondary")}
              onClick={() => onSwitchFloor(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground ml-1 shrink-0">
          {rooms.length} room{rooms.length !== 1 ? "s" : ""}
        </span>
        <div className="flex-1" />

        {/* Undo/Redo */}
        <button onClick={() => { const entry = undo(); if (entry) { updFloor(entry.rooms, entry.paths); setSelected([]); } }}
          className="flex items-center justify-center h-8 w-8 rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Undo (Ctrl+Z)">
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => { const entry = redo(); if (entry) { updFloor(entry.rooms, entry.paths); setSelected([]); } }}
          className="flex items-center justify-center h-8 w-8 rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Redo (Ctrl+Y)">
          <Redo2 className="h-3.5 w-3.5" />
        </button>

        <div className="w-px h-5 bg-border" />

        {/* Wall snap toggle */}
        <button onClick={() => setWallSnap((v) => !v)}
          className={cn("h-8 px-2.5 rounded-xl text-[11px] font-bold border transition-colors",
            wallSnap ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
          Snap
        </button>

        {/* Save */}
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 transition-colors disabled:opacity-60">
          {saving ? <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" /> :
            saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? "Saving..." : saved ? "Saved" : "Save Floor"}
        </button>
      </motion.div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left: Room types palette */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="w-48 border-r border-border bg-card flex flex-col overflow-hidden shrink-0"
        >
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Room Types</p>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth py-1.5">
            {ROOM_TYPES.map((rt) => (
              <button key={rt.type} onClick={() => { setRoomType(rt.type); setTool("room"); }}
                className={cn("w-full flex items-center gap-2.5 pl-3 pr-2 py-2 transition-colors text-left",
                  tool === "room" && roomType === rt.type ? "bg-primary/8 border-l-2 border-primary" : "hover:bg-muted/50 border-l-2 border-transparent")}>
                <div className="w-5 h-5 rounded shrink-0 border" style={{ background: rt.fill, borderColor: rt.stroke }} />
                <span className="text-xs font-medium truncate text-foreground">{rt.label}</span>
              </button>
            ))}
          </div>
          {/* Floor tools */}
          <div className="border-t border-border p-2">
            <p className="text-[9px] font-extrabold uppercase tracking-widest mb-1.5 px-1 text-muted-foreground">Tools</p>
            <div className="flex gap-1">
              {FLOOR_TOOLS.map((t) => (
                <button key={t.id} onClick={() => { setTool(t.id); setDP([]); }} title={`${t.label} (${t.key})`}
                  className={cn("flex-1 h-8 rounded-lg flex items-center justify-center transition-all",
                    tool === t.id && t.id === "erase" ? "bg-destructive text-destructive-foreground" :
                    tool === t.id ? "bg-primary text-primary-foreground" :
                    "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  <t.icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Floor plan canvas */}
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 overflow-hidden relative"
          style={{ background: "#b0ada8" }}
        >
          <svg ref={svgRef} viewBox={`0 0 ${FP_W} ${FP_H}`} className="w-full h-full"
            style={{ cursor, userSelect: "none" }}
            onMouseDown={handleSvgDown} onMouseMove={handleSvgMoveResize}
            onMouseUp={handleSvgUpResize} onMouseLeave={handleSvgUpResize}
            onDoubleClick={handleDbl}>
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {/* Architectural background */}
              <rect data-bg="true" width={FP_W} height={FP_H} fill="#b0ada8" />
              {[...Array(30)].map((_, i) => <line key={`gv${i}`} x1={i * 20} y1={0} x2={i * 20} y2={FP_H} stroke="rgba(0,0,0,0.05)" strokeWidth={0.5} />)}
              {[...Array(20)].map((_, i) => <line key={`gh${i}`} x1={0} y1={i * 20} x2={FP_W} y2={i * 20} stroke="rgba(0,0,0,0.05)" strokeWidth={0.5} />)}
              <rect x={8} y={8} width={FP_W - 16} height={FP_H - 16} rx={2} fill="#e0dcd6" stroke="#706d68" strokeWidth={5} />
              <rect x={13} y={13} width={FP_W - 26} height={FP_H - 26} fill="#cdc9c3" />

              {/* Room drag preview */}
              {roomDrag && (() => {
                const rx = Math.min(roomDrag.sx, roomDrag.cx);
                const ry = Math.min(roomDrag.sy, roomDrag.cy);
                const rw = Math.abs(roomDrag.cx - roomDrag.sx);
                const rh = Math.abs(roomDrag.cy - roomDrag.sy);
                return (
                  <g>
                    <rect x={rx} y={ry} width={rw} height={rh} rx={2}
                      fill="var(--primary)" fillOpacity={0.1}
                      stroke="var(--primary)" strokeWidth={2} strokeDasharray="6 3" />
                    <text x={rx + rw / 2} y={ry + rh / 2 + 3} textAnchor="middle"
                      fill="var(--primary)" fontSize={9} fontWeight="600"
                      className="pointer-events-none select-none">
                      {rw}×{rh}
                    </text>
                  </g>
                );
              })()}

              {/* Drawing path */}
              {drawingPath.length > 0 && (
                <g>
                  {drawingPath.length > 1 && <polyline points={drawingPath.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--primary)" strokeWidth={3} strokeLinecap="round" strokeDasharray="8 4" opacity={0.9} />}
                  {drawingPath.map((pt, i) => <circle key={i} cx={pt.x} cy={pt.y} r={4} fill="var(--primary)" opacity={0.9} />)}
                </g>
              )}

              {/* Internal paths */}
              {fpaths.map((p) => {
                const pts = p.points.map((pt) => `${pt.x},${pt.y}`).join(" ");
                const isSel = selected.length === 1 && selected[0] === p.id;
                return (
                  <g key={p.id} onClick={(e) => { e.stopPropagation(); if (tool === "erase") { pushHistory(rooms, fpaths); updFloor(rooms, fpaths.filter((x) => x.id !== p.id)); setSelected([]); } else setSelected([p.id]); }}
                    style={{ cursor: tool === "erase" ? "not-allowed" : "pointer" }}>
                    {isSel && <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={p.width + 4} strokeLinecap="round" strokeLinejoin="round" opacity={0.4} />}
                    <polyline points={pts} fill="none" stroke={p.color} strokeWidth={p.width} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
                  </g>
                );
              })}

              {/* Rooms */}
              {rooms.map((room) => {
                const rt = ROOM_MAP[room.type] ?? ROOM_MAP.classroom;
                const isSel = selected.includes(room.id);
                const isMulti = selected.length > 1;
                return (
                  <g key={room.id} onMouseDown={(e) => onRoomDown(e, room.id, room)}
                    style={{ cursor: tool === "select" && !isMulti ? "move" : cursor }}>
                    {/* Selection highlight */}
                    {isSel && !isMulti && (
                      <>
                        <rect x={room.x - 3} y={room.y - 3} width={room.w + 6} height={room.h + 6} rx={2}
                          fill="none" stroke="var(--accent)" strokeWidth={2.5} />
                        {/* Resize handles (corners) */}
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
                        {/* Edge resize handles */}
                        {["n", "s", "e", "w"].map((corner) => {
                          const hs = 6;
                          const hx = corner === "e" ? room.x + room.w - hs / 2 : corner === "w" ? room.x - hs / 2 : room.x + room.w / 2 - hs / 2;
                          const hy = corner === "s" ? room.y + room.h - hs / 2 : corner === "n" ? room.y - hs / 2 : room.y + room.h / 2 - hs / 2;
                          const edgeW = corner === "n" || corner === "s" ? room.w : hs;
                          const edgeH = corner === "e" || corner === "w" ? room.h : hs;
                          return (
                            <rect key={corner} x={hx} y={hy} width={edgeW} height={edgeH}
                              fill="transparent" stroke="none"
                              style={{ cursor: corner === "n" || corner === "s" ? "ns-resize" : "ew-resize" }}
                              onMouseDown={(e) => onResizeStart(e, room, corner)} />
                          );
                        })}

                      </>
                    )}
                    {/* Multi-select highlight */}
                    {isSel && isMulti && (
                      <rect x={room.x - 2} y={room.y - 2} width={room.w + 4} height={room.h + 4} rx={1}
                        fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 2" opacity={0.7} />
                    )}
                    {/* Room body */}
                    <rect x={room.x} y={room.y} width={room.w} height={room.h} rx={1}
                      fill={isSel ? "rgba(14,42,110,0.15)" : rt.fill}
                      stroke={isSel ? "var(--accent)" : rt.stroke}
                      strokeWidth={isSel ? 2 : 1} />
                    {/* Room interior lighting line */}
                    <line x1={room.x + 1} y1={room.y + 1} x2={room.x + room.w - 1} y2={room.y + 1}
                      stroke="rgba(0,0,0,0.06)" strokeWidth={1.5} />
                    {/* Room label */}
                    {(room.w >= 40 && room.h >= 18) && (
                      <text x={room.x + room.w / 2} y={room.y + room.h / 2 + 3} textAnchor="middle"
                        fill={rt.text} fontSize={Math.min(room.w > 90 ? 8 : 6.5, 9)} fontWeight="600"
                        className="pointer-events-none select-none">
                        {room.name.length > 14 ? room.name.slice(0, 13) + "..." : room.name}
                      </text>
                    )}
                    {/* Dimension text (shown on hover/selected) */}
                    {isSel && room.w > 60 && room.h > 24 && (
                      <text x={room.x + room.w / 2} y={room.y + room.h + 10} textAnchor="middle"
                        fill="#706d68" fontSize={6} fontWeight="500"
                        className="pointer-events-none select-none">
                        {room.w}×{room.h}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Compass */}
              <g transform={`translate(${FP_W - 20},20)`}>
                <circle r={11} fill="white" stroke="#8a8580" strokeWidth={1} />
                <text textAnchor="middle" y={-2} fontSize={7} fontWeight="900" fill="#1e40af">N</text>
                <line y1={0} y2={-8} stroke="#1e40af" strokeWidth={2} strokeLinecap="round" />
              </g>

              {/* Floor label */}
              <text x={FP_W / 2} y={FP_H - 5} textAnchor="middle" fontSize={7} fontWeight="600" fill="#7a7672" opacity={0.8} className="select-none pointer-events-none">
                {floor.label} — {building.code} · {rooms.length} rooms · {fpaths.length} paths
              </text>
            </g>
          </svg>

          {/* Zoom controls */}
          <div className="absolute bottom-10 right-3 z-20 flex items-center gap-1 p-1 rounded-xl border border-border shadow-lg" style={{ background: "var(--card)" }}>
            <button onClick={zoomOut} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all"><ZoomOut className="h-4 w-4" /></button>
            <span className="w-12 text-center text-xs font-mono font-bold text-foreground">{Math.round(zoom * 100)}%</span>
            <button onClick={zoomIn} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all"><ZoomIn className="h-4 w-4" /></button>
            <div className="w-px h-5 mx-0.5" style={{ background: "var(--border)" }} />
            <button onClick={resetView} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all"><Maximize2 className="h-4 w-4" /></button>
          </div>

          {/* Status bar */}
          <div className="absolute bottom-3 left-3 right-[130px] pointer-events-none">
            <div className="flex items-center justify-between">
              <span className="text-[11px] px-3 py-1 rounded-full border border-border/60 font-medium"
                style={{ background: "color-mix(in srgb,var(--card) 85%,transparent)", backdropFilter: "blur(8px)", color: "var(--muted-foreground)", fontFamily: "var(--font-body)" }}>
                {roomDrag
                  ? `Drag to size the ${ROOM_MAP[roomType]?.label ?? roomType} room`
                  : selected.length > 1
                    ? `${selected.length} rooms selected`
                    : tool === "room"
                      ? `Click & drag to draw a ${ROOM_MAP[roomType]?.label ?? roomType} room`
                      : tool === "path"
                        ? `Click waypoints · Double-click to finish · Esc to cancel`
                        : selected.length === 0
                          ? "Click to select · Shift+click to multi-select · Drag to move · Del to delete"
                          : "Drag to move · Shift+click to multi-select"}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                {wallSnap ? "Snap ON" : "Snap OFF"}
              </span>
            </div>
          </div>

          {/* Room properties panel */}
          <div className="absolute top-0 right-0 bottom-0 z-30 flex flex-col border-l border-border shadow-2xl overflow-hidden"
            style={{
              width: 228, background: "var(--card)",
              transform: selRoom || selected.length > 1 ? "translateX(0)" : "translateX(100%)",
              transition: "transform 0.22s cubic-bezier(0.16,1,0.3,1)",
            }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <span className="text-xs font-extrabold uppercase tracking-wide text-foreground">
                {selected.length > 1 ? `${selected.length} Rooms` : selRoom ? "Room" : "Properties"}
              </span>
              <button onClick={() => setSelected([])}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Tab bar for single room selection */}
            {selRoom && (
              <div className="flex border-b border-border shrink-0">
                {[
                  { id: "basic" as const, label: "Basic", icon: Info },
                  { id: "advanced" as const, label: "Advanced", icon: Settings2 },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = roomTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setRoomTab(tab.id)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold transition-all relative",
                        isActive
                          ? "text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {tab.label}
                      {isActive && (
                        <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth p-4 space-y-3">
              {selected.length > 1 && (
                <div className="text-xs text-muted-foreground px-2 py-3 text-center">
                  {selected.length} rooms selected. Drag to move them together.
                </div>
              )}
              {selRoom && (
                <>
                  {/* ═══ BASIC ═══ */}
                  {roomTab === "basic" && (
                    <>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Info className="h-3 w-3 text-primary" />
                        <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Room Info</span>
                      </div>
                      <div>
                        <label htmlFor="room-name" className="block text-[10px] font-bold uppercase tracking-wide mb-1 text-muted-foreground">Room Name</label>
                        <input id="room-name" value={selRoom.name}
                          onChange={(e) => { pushHistory(rooms, fpaths); updFloor(rooms.map((r) => r.id === selRoom.id ? { ...r, name: e.target.value } : r), fpaths); }}
                          className="w-full h-8 px-2.5 rounded-lg border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wide mb-1 text-muted-foreground">Type</label>
                        <Combobox
                          value={selRoom.type}
                          onChange={(v) => { pushHistory(rooms, fpaths); updFloor(rooms.map((r) => r.id === selRoom.id ? { ...r, type: v } : r), fpaths); }}
                          options={ROOM_TYPES.map((rt) => ({ value: rt.type, label: rt.label, color: rt.fill }))}
                          placeholder="Select type"
                          searchPlaceholder="Search room types..."
                        />
                      </div>
                      <div>
                        <label htmlFor="room-description" className="block text-[10px] font-bold uppercase tracking-wide mb-1 text-muted-foreground">Description</label>
                        <textarea id="room-description" value={selRoom.description ?? ""} rows={2}
                          onChange={(e) => { pushHistory(rooms, fpaths); updFloor(rooms.map((r) => r.id === selRoom.id ? { ...r, description: e.target.value } : r), fpaths); }}
                          placeholder="Optional room description..."
                          className="w-full px-2.5 py-2 rounded-lg border border-border bg-input-background text-foreground text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/20" />
                      </div>
                    </>
                  )}

                  {/* ═══ ADVANCED ═══ */}
                  {roomTab === "advanced" && (
                    <>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Settings2 className="h-3 w-3 text-primary" />
                        <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Position & Size</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[["x", "X"], ["y", "Y"]].map(([k, l]) => (
                          <div key={k}>
                            <label htmlFor={`room-${k}`} className="block text-[10px] font-bold uppercase tracking-wide mb-1 text-muted-foreground">{l}</label>
                            <input id={`room-${k}`} type="number" value={(selRoom as any)[k]}
                              onChange={(e) => { pushHistory(rooms, fpaths); updFloor(rooms.map((r) => r.id === selRoom.id ? { ...r, [k]: parseInt(e.target.value) || 0 } : r), fpaths); }}
                              className="w-full h-8 px-2 rounded-lg border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20" />
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[["w", "Width"], ["h", "Height"]].map(([k, l]) => (
                          <div key={k}>
                            <label className="block text-[10px] font-bold uppercase tracking-wide mb-1 text-muted-foreground">{l}</label>
                            <input type="number" min={20} value={(selRoom as any)[k]}
                              onChange={(e) => { pushHistory(rooms, fpaths); updFloor(rooms.map((r) => r.id === selRoom.id ? { ...r, [k]: parseInt(e.target.value) || 40 } : r), fpaths); }}
                              className="w-full h-8 px-2 rounded-lg border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20" />
                          </div>
                        ))}
                      </div>
                      <div className="pt-3 border-t border-border">
                        <button onClick={() => { setPendingDeleteRoom(selRoom.id); setShowDeleteConfirm(true); }}
                          className="w-full h-8 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                          Delete Room
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

        </motion.div>
      </div>

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Room"
        message={`Are you sure you want to delete "${rooms.find((r) => r.id === pendingDeleteRoom)?.name ?? "this room"}"? This action cannot be undone.`}
        confirmLabel="Delete Room"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (pendingDeleteRoom) {
            const deletedName = rooms.find((r) => r.id === pendingDeleteRoom)?.name ?? "Room";
            pushHistory(rooms, fpaths);
            updFloor(rooms.filter((r) => r.id !== pendingDeleteRoom), fpaths);
            setSelected([]);
            toast.success("Room deleted", `${deletedName} has been removed.`);
          }
          setShowDeleteConfirm(false);
          setPendingDeleteRoom(null);
        }}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setPendingDeleteRoom(null);
        }}
      />
    </div>
  );
}
