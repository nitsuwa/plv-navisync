import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";import { ArrowLeft, Globe, Building2, Map, Layers, CheckCircle2, Undo2, Redo2, X,
  ChevronRight, ChevronDown, FolderOpen, Plus, Navigation, Accessibility, Flame, Star,
  Save, Pencil, Trash2, Copy, GripVertical, HelpCircle,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useCanvasControls } from "./useCanvasControls";
import { Canvas } from "./Canvas";
import { PropertiesPanel } from "./PropertiesPanel";
import { TOOLS, PATH_COLORS, LAYERS, BUILDING_COLORS } from "./constants";
import { genId } from "./constants";
import { useToast } from "../../hooks/useToast";
import { ContextMenu } from "./ContextMenu";
import { MapBuilderTutorial, hasSeenTutorial } from "./MapBuilderTutorial";
import type { Campus, CampusBuilding, CampusMarker, CampusSelection, SimpleTool, EditorLayer, FloorPlan } from "./types";

interface CampusEditorProps {
  campus: Campus;
  onBack: () => void;
  onUpdate: (c: Campus) => void;
  onPublish: (c: Campus) => void;
  onOpenFloor: (buildingId: string, floorId: string) => void;
  onAddBuilding: () => void;
}

export function CampusEditor({ campus, onBack, onUpdate, onPublish, onOpenFloor, onAddBuilding }: CampusEditorProps) {
  const [tool, setTool] = useState<SimpleTool>("select");
  const [selected, setSelected] = useState<CampusSelection | null>(null);
  const [drawingPath, setDP] = useState<{ x: number; y: number }[]>([]);
  const [saved, setSaved] = useState(false);
  const [published, setPublished] = useState(false);
  const [layer, setLayer] = useState<EditorLayer>("campus");
  const [saving, setSaving] = useState(false);
  const [snapGrid, setSnapGrid] = useState(true);
  const [edgeSnap, setEdgeSnap] = useState(true);
  // ── Drag-to-create building ──
  const [buildingDrag, setBuildingDrag] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  // ── Context menu ──
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: "building" | "marker" | "path"; id: string } | null>(null);
  // ── Alignment guides ──
  const [guides, setGuides] = useState<{ type: "h" | "v"; pos: number }[]>([]);
  // ── Rename dialog ──
  const [renameDialog, setRenameDialog] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // ── Drag reorder ──
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragItemRef = useRef<number | null>(null);
  // ── Cursor coords for status bar ──
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [resizing, setResizing] = useState<{
    id: string; corner: string; sx: number; sy: number;
    ox: number; oy: number; ow: number; oh: number;
  } | null>(null);
  // ── Tutorial ──
  const [showTutorial, setShowTutorial] = useState(!hasSeenTutorial());
  const toast = useToast();

  const { zoom, pan, panning, svgRef, containerRef, getPoint, startPan, movePan, endPan, resetView, zoomIn, zoomOut } =
    useCanvasControls(campus.canvasW, campus.canvasH);

  const SNAP_DIST = 12;
  const snap = useCallback((v: number) => (snapGrid ? Math.round(v / 20) * 20 : Math.round(v)), [snapGrid]);

  /** Edge-snap a building position to nearby buildings */
  const edgeSnapBuilding = useCallback(
    (b: CampusBuilding, all: CampusBuilding[]): CampusBuilding => {
      if (!edgeSnap) return b;
      let rx = b.x, ry = b.y;
      const snapVal = (val: number, target: number) =>
        Math.abs(val - target) <= SNAP_DIST ? target : val;
      for (const o of all) {
        if (o.id === b.id) continue;
        rx = snapVal(rx, o.x);
        rx = snapVal(rx, o.x + o.width);
        rx = snapVal(rx + b.width, o.x) - b.width;
        rx = snapVal(rx + b.width, o.x + o.width) - b.width;
        ry = snapVal(ry, o.y);
        ry = snapVal(ry, o.y + o.height);
        ry = snapVal(ry + b.height, o.y) - b.height;
        ry = snapVal(ry + b.height, o.y + o.height) - b.height;
      }
      return { ...b, x: rx, y: ry };
    },
    [edgeSnap]
  );
  const dragging = useRef<{ type: "building" | "marker"; id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);

  const buildings = campus.buildings;
  const markers = campus.markers;
  const paths = campus.paths;

  const upd = (c: Partial<Campus>) => { pushHistory(); onUpdate({ ...campus, ...c }); };
  const updBuildings = (b: CampusBuilding[]) => upd({ buildings: b });
  const updMarkers = (m: CampusMarker[]) => upd({ markers: m });
  const updPaths = (p: typeof paths) => upd({ paths: p });

  // ── SVG event handlers ──
  const handleSvgDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const target = e.target as SVGElement;
    const isBg = target === svgRef.current || target.dataset.bg === "true";
    if (!isBg) return;
    if (tool === "select" || tool === "erase") { startPan(e); setSelected(null); return; }
    const pt = getPoint(e, campus.canvasW, campus.canvasH);
    if (tool === "marker") {
      const nm: CampusMarker = { id: genId("mk"), name: "New Marker", type: "custom", x: Math.round(pt.x), y: Math.round(pt.y), color: "#0e2a6e" };
      updMarkers([...markers, nm]); setSelected({ type: "marker", id: nm.id }); setTool("select");
    } else if (tool === "building") {
      // Start drag-to-create with preview
      setBuildingDrag({ sx: pt.x, sy: pt.y, cx: pt.x, cy: pt.y });
    } else if (tool === "path") {
      setDP((p) => [...p, { x: Math.round(pt.x), y: Math.round(pt.y) }]);
    }
  };

  const handleSvgMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const pt = getPoint(e, campus.canvasW, campus.canvasH);
    setCursorPos({ x: Math.round(pt.x), y: Math.round(pt.y) });

    // Building drag-to-create preview
    if (buildingDrag) {
      setBuildingDrag({ ...buildingDrag, cx: snap(pt.x), cy: snap(pt.y) });
      return;
    }

    movePan(e);
    const drag = dragging.current;
    if (!drag) return;
    if (drag.type === "building") {
      const moved = { x: snap(drag.ox + (pt.x - drag.sx)), y: snap(drag.oy + (pt.y - drag.sy)) };
      const newB = edgeSnapBuilding({ ...buildings.find((b) => b.id === drag.id)!, ...moved }, buildings);
      updBuildings(buildings.map((b) => (b.id === drag.id ? newB : b)));
      // Alignment guides
      const guidesList: { type: "h" | "v"; pos: number }[] = [];
      for (const o of buildings) {
        if (o.id === drag.id) continue;
        if (Math.abs(newB.x - o.x) < 6) guidesList.push({ type: "v", pos: o.x });
        if (Math.abs(newB.x + newB.width - o.x - o.width) < 6) guidesList.push({ type: "v", pos: o.x + o.width });
        if (Math.abs(newB.y - o.y) < 6) guidesList.push({ type: "h", pos: o.y });
        if (Math.abs(newB.y + newB.height - o.y - o.height) < 6) guidesList.push({ type: "h", pos: o.y + o.height });
        if (Math.abs(newB.x + newB.width / 2 - o.x - o.width / 2) < 6) guidesList.push({ type: "v", pos: o.x + o.width / 2 });
        if (Math.abs(newB.y + newB.height / 2 - o.y - o.height / 2) < 6) guidesList.push({ type: "h", pos: o.y + o.height / 2 });
      }
      setGuides(guidesList);
    } else
      updMarkers(markers.map((m) => (m.id === drag.id ? { ...m, x: snap(drag.ox + (pt.x - drag.sx)), y: snap(drag.oy + (pt.y - drag.sy)) } : m)));
  };

  const handleResizeStart = (e: React.MouseEvent, b: CampusBuilding, corner: string) => {
    e.stopPropagation();
    setResizing({ id: b.id, corner, sx: e.clientX, sy: e.clientY, ox: b.x, oy: b.y, ow: b.width, oh: b.height });
  };

  const handleSvgMoveResize = (e: React.MouseEvent) => {
    if (!resizing) { handleSvgMove(e); return; }
    const dx = e.clientX - resizing.sx;
    const dy = e.clientY - resizing.sy;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = (campus.canvasW / rect.width) / zoom;
    const ddx = snap(dx * scale), ddy = snap(dy * scale);
    updBuildings(
      buildings.map((b) => {
        if (b.id !== resizing.id) return b;
        let nx = resizing.ox, ny = resizing.oy, nw = resizing.ow, nh = resizing.oh;
        if (resizing.corner.includes("e")) nw = Math.max(40, resizing.ow + ddx);
        if (resizing.corner.includes("w")) { nx = resizing.ox + ddx; nw = Math.max(40, resizing.ow - ddx); }
        if (resizing.corner.includes("s")) nh = Math.max(30, resizing.oh + ddy);
        if (resizing.corner.includes("n")) { ny = resizing.oy + ddy; nh = Math.max(30, resizing.oh - ddy); }
        return { ...b, x: nx, y: ny, width: nw, height: nh };
      })
    );
  };

  const handleSvgUpResize = () => {
    endPan();
    dragging.current = null;
    if (resizing) setResizing(null);
    // Finalize building drag-to-create
    if (buildingDrag) {
      pushHistory();
      const rx = Math.min(buildingDrag.sx, buildingDrag.cx);
      const ry = Math.min(buildingDrag.sy, buildingDrag.cy);
      const rw = Math.max(Math.abs(buildingDrag.cx - buildingDrag.sx), 40);
      const rh = Math.max(Math.abs(buildingDrag.cy - buildingDrag.sy), 30);
      const nb: CampusBuilding = {
        id: genId("bld"), name: "New Building", code: "NEW", category: "Academic", description: "",
        x: Math.round(rx), y: Math.round(ry), width: Math.round(rw), height: Math.round(rh),
        color: BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)],
        expanded: false,
        floors: [{ id: genId("fl"), number: 1, label: "Ground Floor", rooms: [], paths: [] }],
      };
      updBuildings([...buildings, nb]);
      setSelected({ type: "building", id: nb.id });
      setTool("select");
      setBuildingDrag(null);
      setGuides([]);
      toast.success("Building created", "Edit properties in the right panel.");
    }
  };
  const handleSvgUp = () => { endPan(); dragging.current = null; setGuides([]); };
  const handleDblClick = () => {
    if (tool === "path" && drawingPath.length >= 2) {
      updPaths([...paths, { id: genId("p"), points: drawingPath, type: "footpath", color: PATH_COLORS.footpath, width: 4 }]);
      setDP([]); setTool("select");
    }
  };

  const handleBuildingDoubleClick = useCallback((id: string) => {
    const b = buildings.find((x) => x.id === id);
    if (!b) return;
    setSelected({ type: "building", id });
    setRenameDialog({ id, name: b.name });
    setRenameValue(b.name);
  }, [buildings]);

  const onItemDown = (e: React.MouseEvent, type: "building" | "marker", id: string, ox: number, oy: number) => {
    e.stopPropagation();
    if (tool === "erase") {
      if (type === "building") updBuildings(buildings.filter((b) => b.id !== id));
      else updMarkers(markers.filter((m) => m.id !== id));
      setSelected(null); return;
    }
    if (tool !== "select") return;
    setSelected({ type, id });
    const pt = getPoint(e, campus.canvasW, campus.canvasH);
    dragging.current = { type, id, sx: pt.x, sy: pt.y, ox, oy };
  };



  const onUpdateBuilding = (id: string, changes: Partial<CampusBuilding>) => {
    updBuildings(buildings.map((b) => (b.id === id ? { ...b, ...changes } : b)));
  };

  const onUpdateMarker = (id: string, changes: Partial<CampusMarker>) => {
    updMarkers(markers.map((m) => (m.id === id ? { ...m, ...changes } : m)));
  };

  const onDeleteBuilding = (id: string) => { updBuildings(buildings.filter((b) => b.id !== id)); setSelected(null); };
  const onDeleteMarker = (id: string) => { updMarkers(markers.filter((m) => m.id !== id)); setSelected(null); };

  // ── Floor manager helpers ──
  const renameFloor = (buildingId: string, floorId: string) => {
    const b = buildings.find((x) => x.id === buildingId);
    if (!b) return;
    const floor = b.floors.find((f) => f.id === floorId);
    if (!floor) return;
    const newLabel = window.prompt("Floor label:", floor.label);
    if (newLabel && newLabel.trim()) {
      pushHistory();
      updBuildings(buildings.map((x) =>
        x.id === buildingId
          ? { ...x, floors: x.floors.map((f) => f.id === floorId ? { ...f, label: newLabel.trim() } : f) }
          : x
      ));
    }
  };

  const duplicateFloor = (buildingId: string, floorId: string) => {
    const b = buildings.find((x) => x.id === buildingId);
    if (!b) return;
    const floor = b.floors.find((f) => f.id === floorId);
    if (!floor) return;
    pushHistory();
    const newFloor: FloorPlan = {
      ...structuredClone(floor),
      id: genId("fl"),
      number: Math.max(...b.floors.map((f) => f.number), 0) + 1,
      label: `${floor.label} (copy)`,
    };
    updBuildings(buildings.map((x) =>
      x.id === buildingId ? { ...x, floors: [...x.floors, newFloor] } : x
    ));
    toast.success("Floor duplicated");
  };

  const deleteFloor = (buildingId: string, floorId: string) => {
    const b = buildings.find((x) => x.id === buildingId);
    if (!b) return;
    if (b.floors.length <= 1) {
      toast.error("Cannot delete", "Building must have at least one floor.");
      return;
    }
    pushHistory();
    updBuildings(buildings.map((x) =>
      x.id === buildingId
        ? { ...x, floors: x.floors.filter((f) => f.id !== floorId) }
        : x
    ));
    toast.success("Floor deleted");
  };

  const onPathClick = (id: string) => {
    if (tool === "erase") {
      updPaths(paths.filter((p) => p.id !== id));
      setSelected(null);
    } else if (tool === "select") {
      setSelected({ type: "path", id });
    }
  };

  // ── Context menu ──
  const handleContextMenu = useCallback((e: React.MouseEvent, type: "building" | "marker" | "path", id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
    setSelected({ type, id });
  }, []);

  const handleContextAction = useCallback((action: string) => {
    if (!contextMenu) return;
    const { type, id } = contextMenu;
    if (type === "building") {
      const b = buildings.find((x) => x.id === id);
      if (!b) return;
      switch (action) {
        case "rename": {
          setRenameDialog({ id, name: b.name });
          setRenameValue(b.name);
          break;
        }
        case "duplicate": {
          pushHistory();
          const nb: CampusBuilding = { ...b, id: genId("bld"), name: `${b.name} (copy)`, x: b.x + 20, y: b.y + 20 };
          updBuildings([...buildings, nb]);
          setSelected({ type: "building", id: nb.id });
          toast.success(`Duplicated ${b.code}`);
          break;
        }
        case "delete":
          onDeleteBuilding(id);
          toast.info("Building deleted");
          break;
        case "lock":
          pushHistory();
          onUpdateBuilding(id, { locked: !b.locked });
          toast.success(b.locked ? "Building unlocked" : "Building locked");
          break;
        case "hide":
          pushHistory();
          onUpdateBuilding(id, { visible: !(b.visible ?? true) });
          toast.success(b.visible ?? true ? "Building hidden" : "Building visible");
          break;
        case "bring-forward":
        case "send-backward":
          toast.info(`${action} not available in this version`);
          break;
      }
    } else if (type === "marker") {
      if (action === "delete") { onDeleteMarker(id); toast.info("Marker deleted"); }
    }
  }, [contextMenu, buildings, onUpdateBuilding, onDeleteBuilding, onDeleteMarker]);

  // ── Undo/Redo history ──
  const historyRef = useRef<{ snapshots: Campus[]; idx: number }>({
    snapshots: [structuredClone(campus)],
    idx: 0,
  });

  const pushHistory = useCallback(() => {
    const h = historyRef.current;
    const pruned = h.snapshots.slice(0, h.idx + 1);
    pruned.push(structuredClone(campus));
    if (pruned.length > 30) pruned.shift();
    historyRef.current = { snapshots: pruned, idx: pruned.length - 1 };
  }, [campus]);

  const undoEdit = useCallback(() => {
    const h = historyRef.current;
    if (h.idx <= 0) return;
    const newIdx = h.idx - 1;
    historyRef.current = { ...h, idx: newIdx };
    onUpdate(h.snapshots[newIdx]);
  }, [onUpdate]);

  const redoEdit = useCallback(() => {
    const h = historyRef.current;
    if (h.idx >= h.snapshots.length - 1) return;
    const newIdx = h.idx + 1;
    historyRef.current = { ...h, idx: newIdx };
    onUpdate(h.snapshots[newIdx]);
  }, [onUpdate]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undoEdit(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redoEdit(); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        if (selected.type === "building") {
          const b = buildings.find((x) => x.id === selected.id);
          if (b?.locked) return;
          updBuildings(buildings.filter((x) => x.id !== selected.id));
          pushHistory();
        } else if (selected.type === "marker") { updMarkers(markers.filter((m) => m.id !== selected.id)); pushHistory(); }
        else if (selected.type === "path") { updPaths(paths.filter((p) => p.id !== selected.id)); pushHistory(); }
        setSelected(null);
      }
      if (e.key === "Escape") { setDP([]); if (tool === "path") setTool("select"); }
      if (e.key === "v" || e.key === "V") setTool("select");
      if (e.key === "m" || e.key === "M") setTool("marker");
      if (e.key === "b" || e.key === "B") setTool("building");
      if (e.key === "p" || e.key === "P") setTool("path");
      if (e.key === "e" || e.key === "E") setTool("erase");
      if (e.key === "0") resetView();
      if ((e.ctrlKey || e.metaKey) && e.key === "g") { e.preventDefault(); setSnapGrid((v) => !v); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [selected, tool, buildings, markers, paths, undoEdit, redoEdit]);

  const selBldg = selected?.type === "building" ? buildings.find((b) => b.id === selected.id) : undefined;
  const selMkr = selected?.type === "marker" ? markers.find((m) => m.id === selected.id) : undefined;
  const cursor = tool === "erase"
    ? "not-allowed"
    : panning.current
      ? "grabbing"
      : tool === "path" || tool === "building" || tool === "marker"
        ? "crosshair"
        : "default";

  const activeLayer = LAYERS.find((l) => l.id === layer)!;

  return (
    <div className="flex flex-col w-full flex-1" style={{ minHeight: 0 }}>
      {/* ── Header toolbar ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="h-12 border-b border-border bg-card flex items-center px-4 gap-2 shrink-0"
      >
        <button onClick={onBack} className="flex items-center gap-1.5 h-7 px-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all text-xs font-semibold shrink-0">
          <ArrowLeft className="h-3.5 w-3.5" /> Campuses
        </button>
        <div className="w-px h-4 bg-border" />
        <span className="text-sm font-extrabold text-foreground truncate max-w-[200px]" style={{ fontFamily: "var(--font-sans)" }}>
          {campus.name}
        </span>
        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0",
          campus.publishStatus === "published"
            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30 text-green-700 dark:text-green-400"
            : "bg-muted border-border text-muted-foreground"
        )}>
          {campus.publishStatus === "published" ? "Published" : "Draft"}
        </span>
        {drawingPath.length > 0 && (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full border text-[11px] font-semibold ml-1"
            style={{ background: "color-mix(in srgb,var(--accent) 10%,transparent)", borderColor: "color-mix(in srgb,var(--accent) 30%,transparent)", color: "var(--accent)" }}>
            {drawingPath.length} points
            <button onClick={() => setDP([])}><X className="h-3 w-3" /></button>
          </div>
        )}
        <div className="flex-1" />

        {/* Save */}
        <button onClick={() => {
          setSaving(true);
          setTimeout(() => {
            onUpdate({ ...campus, updatedAt: new Date().toISOString().slice(0, 10) });
            setSaving(false); setSaved(true);
            toast.success("Draft saved", `${campus.name} changes saved as draft.`);
            setTimeout(() => setSaved(false), 2000);
          }, 700);
        }} disabled={saving}
          className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors disabled:opacity-60">
          {saving ? <div className="w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" /> :
            saved ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Map className="h-3.5 w-3.5" />}
          {saving ? "Saving..." : saved ? "Saved" : "Save draft"}
        </button>

        {/* Undo */}
        <button onClick={undoEdit} className="flex items-center justify-center h-8 w-8 rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Undo (Ctrl+Z)">
          <Undo2 className="h-3.5 w-3.5" />
        </button>

        {/* Redo */}
        <button onClick={redoEdit} className="flex items-center justify-center h-8 w-8 rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Redo (Ctrl+Y)">
          <Redo2 className="h-3.5 w-3.5" />
        </button>

        <div className="w-px h-5 bg-border" />

        {/* Tutorial replay */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowTutorial(true)}
          className="flex items-center justify-center h-8 w-8 rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Show tutorial"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </motion.button>

        {/* Publish */}
        <button onClick={() => {
          onPublish(campus);
        }} className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 transition-colors shadow-sm">
          {published ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
          {published ? "Published" : "Publish"}
        </button>
      </motion.div>

      {/* ── Layer bar ── */}
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        transition={{ duration: 0.25, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="shrink-0 border-b border-border overflow-hidden"
        style={{ background: "var(--card)" }}
      >
        <div className="flex items-center gap-0 overflow-x-auto no-scrollbar px-3 pt-1">
          {LAYERS.map((l) => {
            const Icon = l.icon;
            const isActive = layer === l.id;
            return (
              <button key={l.id} onClick={() => setLayer(l.id)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-all border-b-2 shrink-0 whitespace-nowrap"
                style={{ borderBottomColor: isActive ? l.color : "transparent", color: isActive ? l.color : "var(--muted-foreground)", background: isActive ? l.accent : "transparent" }}>
                <Icon className="h-3.5 w-3.5 shrink-0" /> {l.label}
              </button>
            );
          })}
        </div>
        <div className="px-4 py-1.5 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: activeLayer.color }} />
          <span className="text-[10px] text-muted-foreground">{activeLayer.hint}</span>
          {layer !== "campus" && (
            <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: activeLayer.accent, color: activeLayer.color }}>
              {layer.charAt(0).toUpperCase() + layer.slice(1)} Layer Active
            </span>
          )}
        </div>
      </motion.div>

      {/* ── Context menu ── */}
      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            type={contextMenu.type}
            onClose={() => setContextMenu(null)}
            onAction={handleContextAction}
          />
        )}
      </AnimatePresence>

      {/* ── Main editor area ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-1 overflow-hidden min-h-0 relative"
      >
        {/* ── Left: Hierarchy Panel ── */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
          className="w-56 border-r border-border bg-card flex flex-col overflow-hidden shrink-0"
        >
          <div className="px-3 py-2.5 border-b border-border">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Hierarchy</span>
          </div>
          <div
            className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth py-1.5"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOverIndex(buildings.length);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const fromIdx = dragItemRef.current;
              if (fromIdx !== null && fromIdx !== buildings.length) {
                const reordered = [...buildings];
                const [moved] = reordered.splice(fromIdx, 1);
                reordered.push(moved);
                pushHistory();
                updBuildings(reordered);
                toast.success("Building reordered");
              }
              dragItemRef.current = null;
              setDragOverIndex(null);
            }}
            onDragLeave={(e) => {
              // Only reset if leaving the container entirely (not entering a child)
              if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverIndex(null);
              }
            }}
          >
            <div className="flex items-center gap-2 px-3 py-1.5">
              <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs font-bold text-foreground truncate">{campus.name}</span>
            </div>
            {buildings.map((b, idx) => (
              <div key={b.id}>
                {/* Drop indicator above item */}
                {dragOverIndex === idx && (
                  <div className="h-0.5 bg-primary mx-5 rounded-full my-0.5" />
                )}
                {/* Building row */}
                <div
                  draggable
                  onDragStart={(e) => {
                    dragItemRef.current = idx;
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", b.id);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverIndex(idx);
                  }}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromIdx = dragItemRef.current;
                    if (fromIdx !== null && fromIdx !== idx) {
                      const reordered = [...buildings];
                      const [moved] = reordered.splice(fromIdx, 1);
                      reordered.splice(idx, 0, moved);
                      pushHistory();
                      updBuildings(reordered);
                      toast.success("Building reordered");
                    }
                    dragItemRef.current = null;
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    dragItemRef.current = null;
                    setDragOverIndex(null);
                  }}
                  className={cn(
                    "flex items-center gap-0.5 pl-1 pr-2 py-1.5 cursor-pointer group hover:bg-muted/50 transition-colors",
                    selected?.type === "building" && selected.id === b.id ? "bg-primary/8 text-primary" : "",
                    dragItemRef.current === idx ? "opacity-40" : ""
                  )}
                  onClick={() => {
                    onUpdate({ ...campus, buildings: buildings.map((x) => x.id === b.id ? { ...x, expanded: !x.expanded } : x) });
                    setSelected({ type: "building", id: b.id });
                  }}
                >
                  {/* Grip handle */}
                  <span className="opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing text-muted-foreground shrink-0" title="Drag to reorder">
                    <GripVertical className="h-3 w-3" />
                  </span>
                  {b.expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> :
                    <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                  <Building2 className="h-3 w-3 shrink-0" style={{ color: b.color }} />
                  <span className="text-xs font-semibold truncate flex-1 ml-0.5 text-foreground">{b.code}</span>
                  <span className="text-[9px] text-muted-foreground shrink-0">{b.floors.length}F</span>
                </div>
                {b.expanded && (
                  <div className="pl-10">
                    {b.floors.map((f) => (
                      <div key={f.id} className="group flex items-center">
                        <button onClick={() => onOpenFloor(b.id, f.id)}
                          className="flex-1 flex items-center gap-2 px-2 py-1 hover:bg-muted/50 transition-colors text-left min-w-0">
                          <Layers className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors truncate flex-1">{f.label}</span>
                          <span className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100">{f.rooms.length}R</span>
                        </button>
                        {/* Floor manager actions */}
                        <button onClick={(e) => { e.stopPropagation(); renameFloor(b.id, f.id); }}
                          className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0" title="Rename">
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); duplicateFloor(b.id, f.id); }}
                          className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0" title="Duplicate">
                          <Copy className="h-2.5 w-2.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deleteFloor(b.id, f.id); }}
                          className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0" title="Delete">
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => {
                      const nextNum = Math.max(...b.floors.map((f) => f.number), 0) + 1;
                      const newFloor: FloorPlan = { id: genId("fl"), number: nextNum, label: `Floor ${nextNum}`, rooms: [], paths: [] };
                      updBuildings(buildings.map((x) => x.id === b.id ? { ...x, floors: [...x.floors, newFloor] } : x));
                    }} className="w-full flex items-center gap-2 px-2 py-1 text-primary/70 hover:text-primary transition-colors">
                      <Plus className="h-3 w-3 shrink-0" /> <span className="text-[11px] font-semibold">Add Floor</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
            {/* Drop indicator at the end */}
            {dragOverIndex === buildings.length && (
              <div className="h-0.5 bg-primary mx-5 rounded-full my-0.5" />
            )}
            <button onClick={onAddBuilding} className="flex items-center gap-2 pl-5 pr-3 py-1.5 text-primary/70 hover:text-primary transition-colors w-full">
              <Plus className="h-3.5 w-3.5 shrink-0" /> <span className="text-xs font-semibold">Add Building</span>
            </button>
          </div>
        </motion.div>

        {/* ── SVG Canvas ── */}
        <Canvas
          campus={campus}
          tool={tool}
          layer={layer}
          selected={selected}
          drawingPath={drawingPath}
          snapGrid={snapGrid}
          zoom={zoom}
          pan={pan}
          svgRef={svgRef}
          containerRef={containerRef}
          cursor={cursor}
          buildingDrag={buildingDrag}
          guides={guides}
          cursorPos={cursorPos}
          onCanvasDown={handleSvgDown}
          onCanvasMove={handleSvgMoveResize}
          onCanvasUp={handleSvgUpResize}
          onCanvasDblClick={handleDblClick}
          onItemDown={onItemDown}
          onItemContextMenu={handleContextMenu}
          onBuildingDoubleClick={handleBuildingDoubleClick}
          onPathClick={onPathClick}
          onSelect={setSelected}
          onResetView={resetView}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onSetTool={setTool}
          onToggleSnap={() => setSnapGrid((v) => !v)}
        />

        {/* ── Right: Properties Panel ── */}
        <PropertiesPanel
          selected={selected}
          selBldg={selBldg}
          selMkr={selMkr}
          onUpdateBuilding={onUpdateBuilding}
          onUpdateMarker={onUpdateMarker}
          onDeleteBuilding={onDeleteBuilding}
          onDeleteMarker={onDeleteMarker}
          onClose={() => setSelected(null)}
        />
      </motion.div>

      {/* Tutorial overlay */}
      <MapBuilderTutorial
        open={showTutorial}
        onClose={() => setShowTutorial(false)}
        onSetTool={setTool}
      />

      {/* Rename dialog */}
      <AnimatePresence>
        {renameDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
            onClick={() => setRenameDialog(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-extrabold text-foreground">Rename Building</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Enter a new name for this building.</p>
            </div>
            <div className="px-5 py-4">
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (renameValue.trim() && renameValue !== renameDialog.name) {
                      pushHistory();
                      onUpdateBuilding(renameDialog.id, { name: renameValue.trim() });
                      toast.success("Building renamed");
                    }
                    setRenameDialog(null);
                  }
                  if (e.key === "Escape") setRenameDialog(null);
                }}
                placeholder="Building name"
                className="w-full h-10 px-3 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setRenameDialog(null)}
                className="flex-1 h-9 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (renameValue.trim() && renameValue !== renameDialog.name) {
                    pushHistory();
                    onUpdateBuilding(renameDialog.id, { name: renameValue.trim() });
                    toast.success("Building renamed");
                  }
                  setRenameDialog(null);
                }}
                disabled={!renameValue.trim()}
                className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 transition-colors disabled:opacity-40 shadow-sm"
              >
                Rename
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
