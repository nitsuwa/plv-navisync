import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft, Globe, Map, CheckCircle2, Undo2, Redo2, X,
  HelpCircle, AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignEndVertical,
  AlignVerticalJustifyCenter, Grid3X3, Magnet, ZoomIn, ZoomOut, Maximize2, Settings2,
  MousePointer2, Square, MapPin, GitBranch, Trash2, Hand, Keyboard, AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useCanvasControls, isSpacePressed } from "./useCanvasControls";
import { Canvas } from "./Canvas";
import { HierarchyPanel } from "./HierarchyPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { RoutesPanel } from "./RoutesPanel";
import { SaveScreen } from "./SaveScreen";
import { LAYERS, BUILDING_COLORS, LAYER_TOOLS, PATH_COLORS } from "./constants";
import { genId } from "./constants";
import { useToast } from "../../hooks/useToast";
import { ValidationErrorsDialog } from "./ValidationErrorsDialog";
import type { ValidationIssue } from "./ValidationErrorsDialog";
import { ContextMenu } from "./ContextMenu";
import { MapBuilderTutorial, hasSeenTutorial } from "./MapBuilderTutorial";
import { EditorPublishDialog } from "./EditorPublishDialog";
import { EditorBackDialog } from "./EditorBackDialog";
import type {
  Campus, CampusBuilding, CampusMarker, CampusSelection,
  SimpleTool, EditorLayer, RubberBand, CampusRoute, CampusPath,
} from "./types";

// ── Per-layer marker configuration ──
const LAYER_MARKER_CONFIG: Record<string, { name: string; type: string; color: string }> = {
  campus: { name: "Point of Interest", type: "poi", color: "#0e2a6e" },
  navigation: { name: "Waypoint", type: "waypoint", color: "#16a34a" },
  accessibility: { name: "Ramp", type: "ramp", color: "#2563eb" },
  emergency: { name: "Emergency Exit", type: "exit", color: "#dc2626" },
  events: { name: "Event Marker", type: "event", color: "#d97706" },
};

// ── Per-layer path configuration ──
const LAYER_PATH_CONFIG: Record<string, { type: string; color: string; width: number }> = {
  campus: { type: "footpath", color: "#94a3b8", width: 3 },
  navigation: { type: "route", color: "#16a34a", width: 4 },
  accessibility: { type: "accessible", color: "#2563eb", width: 3 },
  emergency: { type: "emergency", color: "#dc2626", width: 3 },
  events: { type: "event-path", color: "#d97706", width: 3 },
};

interface CampusEditorProps {
  campus: Campus;
  onBack: () => void;
  onUpdate: (c: Campus) => void;
  onPublish: (c: Campus) => void;
  onOpenFloor: (buildingId: string, floorId: string) => void;
  onAddBuilding: () => void;
  onOpenCanvasSettings?: () => void;
  /** Timestamp of the last save (used to sync savedSnapshotRef with external saves) */
  lastSavedAt?: string;
}

export function CampusEditor({ campus, onBack, onUpdate, onPublish, onOpenFloor, onAddBuilding, onOpenCanvasSettings }: CampusEditorProps) {
  const [tool, setTool] = useState<SimpleTool>("select");
  const [selected, setSelected] = useState<CampusSelection | null>(null);
  const [drawingPath, setDP] = useState<{ x: number; y: number }[]>([]);
  const [saveScreen, setSaveScreen] = useState<{ open: boolean; state: "saving" | "success" | "error" }>({ open: false, state: "saving" });
  const [layer, setLayer] = useState<EditorLayer>("campus");
  // ── Dirty state: snapshot of last-saved campus ──
  const savedSnapshotRef = useRef<string>(JSON.stringify(campus));
  const prevLastSavedAt = useRef<string | undefined>(campus.updatedAt);

  // Sync saved snapshot when lastSavedAt changes (indicating an external save)
  useEffect(() => {
    if (campus.updatedAt !== prevLastSavedAt.current) {
      savedSnapshotRef.current = JSON.stringify(campus);
      prevLastSavedAt.current = campus.updatedAt;
    }
  }, [campus.updatedAt, campus]);

  const isDirty = JSON.stringify(campus) !== savedSnapshotRef.current;
  // ── Has draft changes that need publishing (saved but not yet published) ──
  const hasDraftChanges = campus.publishStatus === "published" && !!campus.updatedAt && !!campus.publishedAt && campus.updatedAt > campus.publishedAt;
  // ── Publish confirmation dialog ──
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  // ── Unsaved changes back dialog ──
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  // ── Save state controlled by SaveScreen ──
  const saving = saveScreen.open && saveScreen.state === "saving";
  // ── Processing guard — prevents duplicate save/publish clicks ──
  const [isProcessing, setIsProcessing] = useState(false);
  // ── Track previous tool for Space hold-to-pan ──
  const prevToolRef = useRef<SimpleTool | null>(null);
  const [snapGrid, setSnapGrid] = useState(true);
  const [edgeSnap, setEdgeSnap] = useState(true);
  // ── Drag-to-create building ──
  const [buildingDrag, setBuildingDrag] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  // ── Route state ──
  const [selRouteId, setSelRouteId] = useState<string | null>(null);
  // ── Multi-selection ──
  const [multiSelected, setMultiSelected] = useState<string[]>([]);
  const [rubberBand, setRubberBand] = useState<RubberBand | null>(null);
  const [showAlignTools, setShowAlignTools] = useState(false);
  // ── Overlap validation — track which buildings overlap others ──
  const [overlappingBuildings, setOverlappingBuildings] = useState<Set<string>>(new Set());
  // ── Alignment guides ──
  const [guides, setGuides] = useState<{ type: "h" | "v"; pos: number }[]>([]);
  // ── Rename dialog ──
  const [renameDialog, setRenameDialog] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // ── Context menu ──
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: "building" | "marker" | "path"; id: string } | null>(null);
  // ── Erase/delete confirmation ──
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "building" | "marker" | "path"; id: string; name: string } | null>(null);
  // ── Batch delete confirmation ──
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState<{ buildingIds: string[]; markerIds: string[] } | null>(null);
  // ── Validation dialog ──
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationIssue[]>([]);
  // ── Track invalid building IDs for canvas highlighting ──
  const [invalidBuildings, setInvalidBuildings] = useState<Set<string>>(new Set());
  // ── Save button error highlight ──
  const [saveBtnError, setSaveBtnError] = useState(false);
  // ── Cursor coords for status bar ──
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [resizing, setResizing] = useState<{
    id: string; corner: string; sx: number; sy: number;
    ox: number; oy: number; ow: number; oh: number;
  } | null>(null);
  // ── Clear guides when switching tools or layers ──
  useEffect(() => {
    setGuides([]);
  }, [tool, layer]);

  // ── Hierarchy selection also clears multi-selection for sync ──
  const handleHierarchySelect = useCallback((sel: CampusSelection | null) => {
    setMultiSelected([]);
    setShowAlignTools(false);
    setSelected(sel);
  }, []);

  // ── Shake animation for validation failures ──
  const [shake, setShake] = useState(0);
  const editorBodyRef = useRef<HTMLDivElement>(null);

  // Trigger shake animation via direct DOM manipulation (reliable re-triggering)
  useEffect(() => {
    if (shake > 0 && editorBodyRef.current) {
      const el = editorBodyRef.current;
      el.classList.remove("animate-shake");
      void el.offsetWidth; // force reflow
      el.classList.add("animate-shake");
    }
  }, [shake]);

  // ── Pure validation — no side effects ──
  const validateCampus = useCallback((): ValidationIssue[] => {
    const errors: ValidationIssue[] = [];
    const seenIds = new Set<string>();

    if (!campus.name || campus.name.trim() === "") {
      errors.push({ type: "missing_campus_name", message: "Please enter a name for the campus." });
    }
    const bldgs = campus.buildings;
    for (const b of bldgs) {
      if (!b.name || b.name === "New Building") {
        const key = `${b.id}-missing_name`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          errors.push({
            type: "missing_name",
            message: `Please enter a name for Building "${b.code}".`,
            buildingId: b.id,
          });
        }
      }
      if (!b.code || b.code === "NEW") {
        const key = `${b.id}-missing_code`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          errors.push({
            type: "missing_code",
            message: `Please assign a building code to "${b.name}".`,
            buildingId: b.id,
          });
        }
      }
      if (b.x < 0 || b.y < 0 || b.x + b.width > campus.canvasW || b.y + b.height > campus.canvasH) {
        const key = `${b.id}-boundary`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          errors.push({
            type: "boundary",
            message: `The building "${b.code}" extends beyond the campus boundary. Move or resize it so it fits within the map.`,
            buildingId: b.id,
          });
        }
      }
      if (b.floors.length === 0) {
        const key = `${b.id}-no_floors`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          errors.push({
            type: "no_floors",
            message: `Please add at least one floor to Building "${b.code}".`,
            buildingId: b.id,
          });
        }
      }
    }
    if (overlappingBuildings.size > 0) {
      for (const id of overlappingBuildings) {
        const b = bldgs.find((x) => x.id === id);
        if (!b) continue;
        const key = `${id}-overlap`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          errors.push({
            type: "overlap",
            message: `Building "${b.code}" overlaps with another building. Adjust its position to resolve the overlap.`,
            buildingId: id,
          });
        }
      }
    }
    return errors;
  }, [campus.name, campus.buildings, campus.canvasW, campus.canvasH, overlappingBuildings]);

  // ── Real-time validation error count ──
  const errorCount = useMemo(() => validateCampus().length, [validateCampus]);

  // ── Sync invalid building IDs from validation errors ──
  useEffect(() => {
    const errors = validateCampus();
    const invalidIds = new Set<string>();
    for (const err of errors) {
      if (err.buildingId) invalidIds.add(err.buildingId);
    }
    setInvalidBuildings(invalidIds);
  }, [validateCampus]);

  // ── Tutorial ──
  const [showTutorial, setShowTutorial] = useState(!hasSeenTutorial());
  const toast = useToast();

  // ── Handle back navigation with unsaved/pending changes check ──
  const handleBack = useCallback(() => {
    if (isDirty) {
      // Unsaved changes — show confirmation
      setShowBackConfirm(true);
    } else if (hasDraftChanges || (campus.publishStatus === "published" && !isDirty && !campus.publishedAt)) {
      // No unsaved changes, but has unpublished saved changes — show info
      setShowBackConfirm(true);
    } else {
      onBack();
    }
  }, [isDirty, hasDraftChanges, campus.publishStatus, campus.publishedAt, onBack]);

  // ── Warn on tab close / browser refresh with unsaved changes ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        // Legacy support: setting returnValue is required by some browsers
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const { zoom, pan, panning, svgRef, containerRef, getPoint, startPan, movePan, endPan, resetView, zoomIn, zoomOut, zoomToBuilding, handleMiddleMouseDown } =
    useCanvasControls(campus.canvasW, campus.canvasH);

  const SNAP_DIST = 12;
  // How strongly the building is pulled toward snap targets (0=none, 1=instant)
  // A value around 0.3-0.4 gives a smooth magnetic feel
  const SNAP_LERP = 0.35;
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

  // ── Overlap detection ───────────────────────────────────────────────────────
  const computeOverlaps = useCallback((bldgs: CampusBuilding[]): Set<string> => {
    const overlapping = new Set<string>();
    for (let i = 0; i < bldgs.length; i++) {
      for (let j = i + 1; j < bldgs.length; j++) {
        const a = bldgs[i];
        const b = bldgs[j];
        if (
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y
        ) {
          overlapping.add(a.id);
          overlapping.add(b.id);
        }
      }
    }
    return overlapping;
  }, []);

  // Recompute overlaps whenever buildings change
  useEffect(() => {
    setOverlappingBuildings(computeOverlaps(buildings));
  }, [buildings, computeOverlaps]);

  // ── SVG event handlers ──
  const handleSvgDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // Hold Spacebar + drag: pan (like Figma/Photoshop)
    if (isSpacePressed()) {
      e.preventDefault();
      startPan(e);
      return;
    }
    // Middle-click: always pan (works everywhere, game-like)
    handleMiddleMouseDown(e);
    if (panning.current) return;

    const target = e.target as SVGElement;
    const isBg = target === svgRef.current || target.dataset.bg === "true";

    // Select & erase tools only work on empty background (elements handle their own clicks)
    if ((tool === "select" || tool === "erase") && !isBg) return;

    if (tool === "pan") {
      // Only pan on empty background — let items handle selection
      if (isBg) {
        startPan(e);
        setSelected(null);
      }
      return;
    }

    if (tool === "select") {
      const pt = getPoint(e, campus.canvasW, campus.canvasH);
      setRubberBand({ sx: pt.x, sy: pt.y, cx: pt.x, cy: pt.y });
      if (!e.shiftKey) { setMultiSelected([]); setSelected(null); setGuides([]); }
      return;
    }
    if (tool === "erase") { startPan(e); setSelected(null); return; }

    const pt = getPoint(e, campus.canvasW, campus.canvasH);
    const clampedPt = {
      x: Math.max(0, Math.min(campus.canvasW, Math.round(pt.x))),
      y: Math.max(0, Math.min(campus.canvasH, Math.round(pt.y))),
    };
    if (tool === "marker" || tool === "room") {
      const cfg = LAYER_MARKER_CONFIG[layer] ?? LAYER_MARKER_CONFIG.campus;
      const nm: CampusMarker = {
        id: genId("mk"),
        name: tool === "room" ? (layer === "accessibility" ? "Elevator" : cfg.name) : cfg.name,
        type: tool === "room" ? "elevator" : cfg.type,
        x: clampedPt.x, y: clampedPt.y,
        color: tool === "room" ? "#7c3aed" : cfg.color,
      };
      updMarkers([...markers, nm]); setSelected({ type: "marker", id: nm.id }); setTool("select");
    } else if (tool === "building") {
      setBuildingDrag({ sx: clampedPt.x, sy: clampedPt.y, cx: clampedPt.x, cy: clampedPt.y });
    } else if (tool === "path") {
      setDP((p) => [...p, { x: Math.round(pt.x), y: Math.round(pt.y) }]);
    }
  };

  const handleSvgMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tool === "pan") {
      movePan(e);
      return;
    }

    const pt = getPoint(e, campus.canvasW, campus.canvasH);
    setCursorPos({ x: Math.round(pt.x), y: Math.round(pt.y) });

    // Building drag-to-create preview
    if (buildingDrag) {
      setBuildingDrag({ ...buildingDrag, cx: snap(pt.x), cy: snap(pt.y) });
      return;
    }

    // Rubber-band update
    if (rubberBand) {
      setRubberBand({ ...rubberBand, cx: pt.x, cy: pt.y });
      return;
    }

    movePan(e);
    const drag = dragging.current;
    if (!drag) return;
    if (drag.type === "building") {
      const b = buildings.find((b) => b.id === drag.id)!;
      // Calculate raw cursor position and snap target
      const rawX = drag.ox + (pt.x - drag.sx);
      const rawY = drag.oy + (pt.y - drag.sy);
      const targetX = snap(rawX);
      const targetY = snap(rawY);
      const targetB = edgeSnapBuilding({ ...b, x: targetX, y: targetY }, buildings);
      // Only lerp when snap pulls > 1px (ignores float-to-int rounding)
      // When snap is off, building follows cursor instantly with no lag
      const isSnapped = Math.abs(targetB.x - rawX) > 1 || Math.abs(targetB.y - rawY) > 1;
      const lerpedB = {
        ...b,
        x: isSnapped ? b.x + (targetB.x - b.x) * SNAP_LERP : targetB.x,
        y: isSnapped ? b.y + (targetB.y - b.y) * SNAP_LERP : targetB.y,
      };
      updBuildings(buildings.map((bld) => (bld.id === drag.id ? lerpedB : bld)));
      // Alignment guides
      const guidesList: { type: "h" | "v"; pos: number }[] = [];
      for (const o of buildings) {
        if (o.id === drag.id) continue;
        if (Math.abs(targetB.x - o.x) < 6) guidesList.push({ type: "v", pos: o.x });
        if (Math.abs(targetB.x + targetB.width - o.x - o.width) < 6) guidesList.push({ type: "v", pos: o.x + o.width });
        if (Math.abs(targetB.y - o.y) < 6) guidesList.push({ type: "h", pos: o.y });
        if (Math.abs(targetB.y + targetB.height - o.y - o.height) < 6) guidesList.push({ type: "h", pos: o.y + o.height });
        if (Math.abs(targetB.x + targetB.width / 2 - o.x - o.width / 2) < 6) guidesList.push({ type: "v", pos: o.x + o.width / 2 });
        if (Math.abs(targetB.y + targetB.height / 2 - o.y - o.height / 2) < 6) guidesList.push({ type: "h", pos: o.y + o.height / 2 });
      }
      // Check overlaps during drag
      const movedBldgs = buildings.map((bld) => (bld.id === drag.id ? targetB : bld));
      const overlaps = computeOverlaps(movedBldgs);
      setOverlappingBuildings(overlaps);
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

    // Finalize rubber-band selection
    if (rubberBand) {
      const rx = Math.min(rubberBand.sx, rubberBand.cx);
      const ry = Math.min(rubberBand.sy, rubberBand.cy);
      const rw = Math.abs(rubberBand.cx - rubberBand.sx);
      const rh = Math.abs(rubberBand.cy - rubberBand.sy);
      if (rw > 5 || rh > 5) {
        // Only capture if dragged more than 5px (avoid accidental clicks)
        const captured: string[] = [];
        for (const b of buildings) {
          if (
            b.x >= rx && b.y >= ry &&
            b.x + b.width <= rx + rw &&
            b.y + b.height <= ry + rh
          ) {
            captured.push(b.id);
          }
        }
        for (const m of markers) {
          if (m.x >= rx && m.y >= ry && m.x <= rx + rw && m.y <= ry + rh) {
            captured.push(m.id);
          }
        }
        setMultiSelected(captured);
        if (captured.length > 1) setShowAlignTools(true);
        if (captured.length === 0) setSelected(null);
      }
      setRubberBand(null);
      return;
    }

    if (resizing) { setResizing(null); return; }      // Finalize building drag-to-create
    if (buildingDrag) {
      const rx = Math.min(buildingDrag.sx, buildingDrag.cx);
      const ry = Math.min(buildingDrag.sy, buildingDrag.cy);
      const rw = Math.max(Math.abs(buildingDrag.cx - buildingDrag.sx), 40);
      const rh = Math.max(Math.abs(buildingDrag.cy - buildingDrag.sy), 30);
      const nb: CampusBuilding = {
        id: genId("bld"), name: "New Building", code: "NEW", category: "Academic", description: "",
        x: Math.round(Math.max(0, Math.min(campus.canvasW - rw, rx))),
        y: Math.round(Math.max(0, Math.min(campus.canvasH - rh, ry))),
        width: Math.round(rw), height: Math.round(rh),
        color: BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)],
        expanded: false,
        floors: [{ id: genId("fl"), number: 1, label: "Ground Floor", rooms: [], paths: [] }],
      };
      // updBuildings called via upd which pushes history
      updBuildings([...buildings, nb]);
      setSelected({ type: "building", id: nb.id });
      setTool("select");
      setBuildingDrag(null);
      setGuides([]);
      // Check for overlaps after creation
      const newOverlaps = computeOverlaps([...buildings, nb]);
      if (newOverlaps.has(nb.id)) {
        setShake((n) => n + 1);
        toast.warning("Building overlaps another", "Adjust the position to avoid overlapping.");
      } else {
        toast.success("Building created", "Edit properties in the right panel.");
      }
    }

    // ── Always clear alignment guides on mouse release ──
    setGuides([]);
  };
  const handleSvgUp = () => { endPan(); dragging.current = null; setGuides([]); };
  const handleDblClick = () => {
    if (tool === "path" && drawingPath.length >= 2) {
      const cfg = LAYER_PATH_CONFIG[layer] ?? LAYER_PATH_CONFIG.campus;
      updPaths([...paths, { id: genId("p"), points: drawingPath, type: cfg.type, color: cfg.color, width: cfg.width }]);
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
    // Spacebar held: pan instead of interacting with items
    if (isSpacePressed()) {
      startPan(e);
      return;
    }
    if (tool === "erase") {
      const item = type === "building" ? buildings.find((b) => b.id === id) : markers.find((m) => m.id === id);
      if (item) {
        setDeleteConfirm({
          type,
          id,
          name: type === "building" ? (item as CampusBuilding).code + " - " + (item as CampusBuilding).name : (item as CampusMarker).name,
        });
      }
      return;
    }
    if (tool === "pan") {
      // In pan mode: select item but don't start dragging
      setMultiSelected([]);
      setShowAlignTools(false);
      setSelected({ type, id });
      setGuides([]);
      return;
    }
    if (tool !== "select") return;
    if (e.shiftKey) {
      // Shift+click: toggle in multi-selection
      setMultiSelected((prev) => {
        const already = prev.includes(id);
        const next = already ? prev.filter((x) => x !== id) : [...prev, id];
        setShowAlignTools(next.length > 1);
        return next;
      });
      return;
    }
    setMultiSelected([]);
    setShowAlignTools(false);
    setSelected({ type, id });
    setGuides([]);
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

  // ── Floor manager helpers (delegated to HierarchyPanel) ──

  const onPathClick = (id: string) => {
    if (tool === "erase") {
      const p = paths.find((x) => x.id === id);
      if (p) setDeleteConfirm({ type: "path", id, name: "Path" });
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
          toast.success("Building Duplicated", `${b.code} has been copied.`);
          break;
        }
        case "delete":
          setDeleteConfirm({ type: "building", id, name: `${b.code} - ${b.name}` });
          break;
        case "lock":
          pushHistory();
          onUpdateBuilding(id, { locked: !b.locked });
          toast.success(b.locked ? "Building Unlocked" : "Building Locked", b.locked ? `${b.name} can now be moved.` : `${b.name} can no longer be moved.`);
          break;
        case "hide":
          pushHistory();
          onUpdateBuilding(id, { visible: !(b.visible ?? true) });
          toast.success(b.visible ?? true ? "Building Hidden" : "Building Visible", b.visible ?? true ? `${b.code} is now hidden on the map.` : `${b.code} is now visible on the map.`);
          break;
        case "bring-forward":
        case "send-backward":
          toast.info(`${action} not available in this version`, "This feature will be added in a future update.");
          break;
      }
    } else if (type === "marker") {
      if (action === "delete") {
        const m = markers.find((x) => x.id === id);
        if (m) setDeleteConfirm({ type: "marker", id, name: m.name });
      }
    } else if (type === "path") {
      if (action === "delete") {
        setDeleteConfirm({ type: "path", id, name: "Path" });
      }
    }
  }, [contextMenu, buildings, markers, onUpdateBuilding]);

  // ── Review Issues: select first invalid building and zoom to it ──
  const handleReviewIssues = useCallback((firstIssue: ValidationIssue) => {
    setValidationDialogOpen(false);
    if (firstIssue.buildingId) {
      const b = buildings.find((x) => x.id === firstIssue.buildingId);
      if (b) {
        setSelected({ type: "building", id: b.id });
        zoomToBuilding(b.x, b.y, b.width, b.height);
      }
    }
  }, [buildings, zoomToBuilding]);

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
    if (h.idx <= 0) { toast.info("Nothing to undo", "No more actions in history."); return; }
    const newIdx = h.idx - 1;
    historyRef.current = { ...h, idx: newIdx };
    onUpdate(h.snapshots[newIdx]);
  }, [onUpdate, toast]);

  const redoEdit = useCallback(() => {
    const h = historyRef.current;
    if (h.idx >= h.snapshots.length - 1) { toast.info("Nothing to redo", "No more actions to redo."); return; }
    const newIdx = h.idx + 1;
    historyRef.current = { ...h, idx: newIdx };
    onUpdate(h.snapshots[newIdx]);
  }, [onUpdate, toast]);

  // ── Keyboard shortcuts (disabled during tutorial) ──
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (showTutorial) return;
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undoEdit(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redoEdit(); return; }
      // Batch delete multi-selected items — show confirmation dialog
      if ((e.key === "Delete" || e.key === "Backspace") && multiSelected.length > 0) {
        e.preventDefault();
        const bIds = buildings.filter((b) => multiSelected.includes(b.id)).map((b) => b.id);
        const mIds = markers.filter((m) => multiSelected.includes(m.id)).map((m) => m.id);
        setBatchDeleteConfirm({ buildingIds: bIds, markerIds: mIds });
        return;
      }
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
      // Ctrl+A: select all buildings
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        setMultiSelected(buildings.map((b) => b.id));
        if (buildings.length > 1) setShowAlignTools(true);
      }
      if (e.key === "Escape") {
        setDP([]);
        if (tool === "path") setTool("select");
        setSelected(null);
        setMultiSelected([]);
        setShowAlignTools(false);
        setGuides([]);
      }
      if (e.key === "v" || e.key === "V") setTool("select");
      if (e.code === "Space") {
        e.preventDefault();
        // Hold-to-pan: save previous tool, activate pan temporarily
        if (tool !== "pan") {
          prevToolRef.current = tool;
          setTool("pan");
        }
      }
      if (e.key === "m" || e.key === "M") setTool("marker");
      if (e.key === "b" || e.key === "B") setTool("building");
      if (e.key === "p" || e.key === "P") setTool("path");
      if (e.key === "e" || e.key === "E") setTool("erase");
      if (e.key === "r" || e.key === "R") setTool("room");
      if (e.key === "l" || e.key === "L") setTool("room");
      if (e.key === "x" || e.key === "X") setTool("erase");
      if (e.key === "a" || e.key === "A") setTool("building");
      if (e.key === "0") resetView();
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); toast.success("Changes saved"); }
      if ((e.ctrlKey || e.metaKey) && e.key === "g") { e.preventDefault(); setSnapGrid((v) => !v); }
      // Ctrl+D: duplicate selected building
      if ((e.ctrlKey || e.metaKey) && e.key === "d" && selected?.type === "building") {
        e.preventDefault();
        const b = buildings.find((x) => x.id === selected.id);
        if (!b) return;
        pushHistory();
        const nb: CampusBuilding = {
          ...b,
          id: genId("bld"),
          name: `${b.name} (copy)`,
          x: b.x + 25,
          y: b.y + 25,
        };
        updBuildings([...buildings, nb]);
        setSelected({ type: "building", id: nb.id });
        toast.success("Building Duplicated", `${b.code} has been copied.`);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [selected, tool, buildings, markers, paths, undoEdit, redoEdit, showTutorial]);

  // ── Space keyup: restore previous tool when space is released (hold-to-pan) ──
  useEffect(() => {
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && prevToolRef.current !== null) {
        const prev = prevToolRef.current;
        prevToolRef.current = null;
        setTool(prev);
      }
    };
    window.addEventListener("keyup", up);
    return () => window.removeEventListener("keyup", up);
  }, []);

  // Route tracking
  const routes = campus.routes ?? [];
  const selRoute = selRouteId ? routes.find((r) => r.id === selRouteId) : selected?.type === "route" ? routes.find((r) => r.id === selected.id) : undefined;

  const onUpdateRoute = (id: string, changes: Partial<CampusRoute>) => {
    upd({ routes: routes.map((r) => (r.id === id ? { ...r, ...changes } : r)) });
  };

  const onDeleteRoute = (id: string) => {
    upd({ routes: routes.filter((r) => r.id !== id) });
    setSelRouteId(null);
  };

  // If we have multi-selected items, clear single selection for property panel
  const effectiveSelected = multiSelected.length > 0 ? null : selected;
  const selBldg = effectiveSelected?.type === "building" ? buildings.find((b) => b.id === effectiveSelected.id) : undefined;
  const selMkr = effectiveSelected?.type === "marker" ? markers.find((m) => m.id === effectiveSelected.id) : undefined;
  const cursor = isSpacePressed()
    ? panning.current ? "grabbing" : "grab"
    : tool === "erase"
      ? "not-allowed"
      : tool === "pan"
        ? "grab"
        : panning.current
          ? "grabbing"
          : tool === "path" || tool === "building" || tool === "marker" || tool === "room"
            ? "crosshair"
            : "default";

  const activeLayer = LAYERS.find((l) => l.id === layer)!;
  const activeTools = LAYER_TOOLS[layer] ?? LAYER_TOOLS.campus;

  // ── Tool config for compact palette ──
  const toolConfig: { id: SimpleTool; icon: React.ElementType; label: string; shortcut: string }[] = [
    { id: "select",   icon: MousePointer2, label: "Select",   shortcut: "V" },
    { id: "pan",      icon: Hand,          label: "Pan",      shortcut: "Space" },
    { id: "marker",   icon: MapPin,        label: "Marker",   shortcut: "M" },
    { id: "building", icon: Square,        label: "Build",    shortcut: "B" },
    { id: "path",     icon: GitBranch,     label: "Path",     shortcut: "P" },
    { id: "erase",    icon: Trash2,        label: "Erase",    shortcut: "E" },
  ];

  return (
    <div className="flex flex-col w-full flex-1" style={{ minHeight: 0 }}>
      <div
        ref={editorBodyRef}
        className={`flex flex-col w-full flex-1${shake > 0 ? " animate-shake" : ""}`}
        style={{ minHeight: 0 }}
      >
      {/* ═══════════════════════════════════════════════════════════════════
          TOP BAR: Compact Figma-style header
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="shrink-0 bg-card border-b border-border" style={campus.themeColor ? { borderBottomColor: campus.themeColor, borderBottomWidth: '2px' } : undefined}>
        {/* Row 1: Main toolbar */}
        <div className="flex items-center h-10 px-3 gap-1.5">
          {/* Back + campus name */}
          <button onClick={handleBack}
            className="flex items-center gap-1 h-7 px-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all text-[11px] font-semibold shrink-0 group"
            title="Back to campus list"
          >
            <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span className="hidden sm:inline">Campuses</span>
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <span className="text-sm font-extrabold text-foreground truncate max-w-[160px] flex items-center gap-1.5" style={{ fontFamily: "var(--font-sans)" }}>
            {campus.themeColor && (
              <span className="w-4 h-4 rounded shrink-0 inline-block" style={{ backgroundColor: campus.themeColor }} />
            )}
            {campus.name}
          </span>
          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 flex items-center gap-1",
            campus.publishStatus === "published"
              ? isDirty
                ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-400"
                : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30 text-green-700 dark:text-green-400"
              : campus.publishedAt
                ? "bg-muted border-border text-muted-foreground"
                : "bg-slate-50 dark:bg-slate-800/20 border-slate-200 dark:border-slate-700/30 text-slate-500 dark:text-slate-400"
          )}>
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0",
              campus.publishStatus === "published"
                ? isDirty ? "bg-amber-500" : "bg-green-500"
                : campus.publishedAt ? "bg-muted-foreground" : "bg-slate-400"
            )} />
            {campus.publishStatus === "published"
              ? isDirty ? "Unpublished Changes" : "Published"
              : campus.publishedAt
                ? "Draft"
                : "Never Published"}
          </span>

          {/* Drawing path indicator */}
          {drawingPath.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 h-6 rounded-md border text-[10px] font-semibold ml-1 shrink-0"
              style={{ background: "color-mix(in srgb,var(--accent) 10%,transparent)", borderColor: "color-mix(in srgb,var(--accent) 30%,transparent)", color: "var(--accent)" }}>
              {drawingPath.length} pts
              <button onClick={() => setDP([])} className="hover:opacity-70"><X className="h-2.5 w-2.5" /></button>
            </div>
          )}

          <div className="flex-1" />

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5">
            <button onClick={undoEdit}
              className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              title="Undo (Ctrl+Z)">
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={redoEdit}
              className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              title="Redo (Ctrl+Shift+Z)">
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Grid snap toggle */}
          <button
            onClick={() => setSnapGrid(v => !v)}
            className={cn(
              "flex items-center justify-center h-7 w-7 rounded-md transition-all",
              snapGrid ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            title={`Grid snap ${snapGrid ? 'ON' : 'OFF'} (Ctrl+G)`}
          >
            <Grid3X3 className="h-3.5 w-3.5" />
          </button>

          {/* Edge snap toggle */}
          <button
            onClick={() => setEdgeSnap(v => !v)}
            className={cn(
              "flex items-center justify-center h-7 w-7 rounded-md transition-all",
              edgeSnap ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            title={`Edge snap ${edgeSnap ? 'ON' : 'OFF'}`}
          >
            <Magnet className="h-3.5 w-3.5" />
          </button>

          {/* View controls */}
          <div className="w-px h-5 bg-border mx-1" />
          <button onClick={zoomIn}
            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            title="Zoom in">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button onClick={resetView}
            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            title="Reset view (0)">
            <Maximize2 className="h-3 w-3" />
          </button>
          <button onClick={zoomOut}
            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            title="Zoom out">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="text-[10px] font-mono text-muted-foreground/50 w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>

          <div className="flex-1" />

          {/* Right actions */}
          {onOpenCanvasSettings && (
            <button
              onClick={onOpenCanvasSettings}
              className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              title="Canvas Settings — adjust dimensions, grid, units, and appearance"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setShowTutorial(true)}
            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            title="Show tutorial"
          >
            <Keyboard className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => {
              const errors = validateCampus();
              if (errors.length > 0) {
                setShake((n) => n + 1);
                setSaveBtnError(true);
                setTimeout(() => setSaveBtnError(false), 600);
                setValidationErrors(errors);
                setValidationDialogOpen(true);
                return;
              }
              setIsProcessing(true);
              setSaveScreen({ open: true, state: "saving" });
              setTimeout(() => {
                try {
                  const now = new Date().toISOString().slice(0, 10);
                  // When saving a published campus that has changes,
                  // keep publishStatus as "published" but don't update publishedAt
                  // so we know there are draft changes waiting for publish
                  const saved = {
                    ...campus,
                    updatedAt: now,
                    // If campus was published, keep it published (admin saves draft changes)
                    // The draft changes won't go live until Publish is clicked
                  };
                  onUpdate(saved);
                  savedSnapshotRef.current = JSON.stringify(saved);
                  setSaveScreen({ open: true, state: "success" });
                } catch {
                  setSaveScreen({ open: true, state: "error" });
                }
                setIsProcessing(false);
              }, 1500);
            }}
            disabled={saving || isProcessing || !isDirty}
            className={cn(
              "flex items-center gap-1 h-7 px-2.5 rounded-md border text-[10px] font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed",
              saveBtnError ? "border-destructive text-destructive bg-destructive/10" : isDirty ? "border-primary text-primary bg-primary/10" : "border-border text-foreground hover:bg-muted"
            )}
          >
            {saving ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Saving Draft</>
            ) : (
              <><Map className="h-3 w-3" /> {isDirty ? "Save Draft" : "Saved"}</>
            )}
          </button>

          {/* Publish button — follows CMS workflow:
            * Draft (never published): disabled until saved, enabled after save
            * Published (no changes): disabled
            * Published (unsaved): disabled (must save first)
            * Published (saved draft waiting): enabled
          */}
          <button
            onClick={() => {
              if (isProcessing) return;
              const errors = validateCampus();
              if (errors.length > 0) {
                setShake((n) => n + 1);
                setSaveBtnError(true);
                setTimeout(() => setSaveBtnError(false), 600);
                setValidationErrors(errors);
                setValidationDialogOpen(true);
                return;
              }
              setShowPublishConfirm(true);
            }}
            disabled={
              isProcessing ||
              isDirty ||
              // Published with no pending draft changes: disabled (nothing new to publish)
              (!isDirty && campus.publishStatus === "published" && !hasDraftChanges && campus.updatedAt === campus.publishedAt) ||
              // Draft that has never been saved: disabled
              (!isDirty && campus.publishStatus === "draft" && !campus.publishedAt)
            }
            title={
              isDirty
                ? "Save your draft first before publishing"
                : campus.publishStatus === "published" && !hasDraftChanges && campus.updatedAt === campus.publishedAt
                  ? "Already published — make changes and save to enable publishing"
                  : campus.publishStatus === "draft" && !campus.publishedAt
                    ? "Save as draft first, then publish"
                    : "Publish the current draft to make it live"
            }
            className={cn(
              "flex items-center gap-1 h-7 px-2.5 rounded-md text-[10px] font-extrabold transition-all shadow-sm",
              isProcessing
                ? "bg-primary/70 text-primary-foreground/70 cursor-not-allowed"
                : isDirty
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : !isDirty && campus.publishStatus === "published" && !hasDraftChanges && campus.updatedAt === campus.publishedAt
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {isProcessing ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Publishing</>
            ) : (
              <><Globe className="h-3 w-3" /> Publish</>
            )}
          </button>
        </div>

        {/* ── Layer bar (Row 2) — animated with smooth transitions ── */}
        <motion.div layout className="flex items-center gap-1 px-3 pb-1.5 overflow-x-auto no-scrollbar">
          {LAYERS.map((l) => {
            const Icon = l.icon;
            const isActive = layer === l.id;
            return (
              <motion.button
                key={l.id}
                layout
                onClick={() => setLayer(l.id)}
                className={cn(
                  "relative flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold shrink-0 whitespace-nowrap",
                  !isActive && "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
                animate={{
                  background: isActive ? l.accent : "transparent",
                  color: isActive ? l.color : "var(--muted-foreground)",
                  scale: isActive ? 1 : 1,
                }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                title={l.hint}
              >
                {/* Active indicator bar — smoothly slides between layers */}
                {isActive && (
                  <motion.div
                    layoutId="active-layer-bg"
                    className="absolute inset-0 rounded-md"
                    style={{
                      background: l.accent,
                      boxShadow: `0 0 0 1px ${l.color}40`,
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}

                {/* Icon with color transition */}
                <motion.div
                  className="relative z-10 flex items-center gap-1.5"
                  animate={{ color: isActive ? l.color : "var(--muted-foreground)" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  {l.label}
                </motion.div>
              </motion.button>
            );
          })}
          {layer !== "campus" && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="text-[9px] text-muted-foreground/40 ml-auto italic"
            >
              Click objects on the canvas to edit
            </motion.span>
          )}
        </motion.div>
      </div>

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

      {/* ── Main editor area — animated on layer change, preserves camera & selection ── */}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={`editor-${layer}`}
          layout
          initial={{ opacity: 0, x: layer === "campus" ? -6 : 6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: layer === "campus" ? 6 : -6 }}
          transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-1 overflow-hidden min-h-0 relative"
        >
        {/* ── Left: Hierarchy Panel ── */}
        <HierarchyPanel
          campus={campus}
          selected={selected}
          onSelect={handleHierarchySelect}
          onOpenFloor={onOpenFloor}
          onAddBuilding={onAddBuilding}
          onUpdateBuilding={onUpdateBuilding}
          onUpdate={(c) => { pushHistory(); onUpdate({ ...campus, ...c }); }}
          pushHistory={pushHistory}
          toast={toast}
        />

        {/* ── SVG Canvas ── */}
        <Canvas
          campus={campus}
          tool={tool}
          layer={layer}
          selected={selected}
          multiSelected={multiSelected}
          rubberBand={rubberBand}
          activeTools={activeTools}
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
          overlappingBuildings={overlappingBuildings}
          invalidBuildings={invalidBuildings}
          onCanvasDown={handleSvgDown}
          onCanvasMove={handleSvgMoveResize}
          onCanvasUp={handleSvgUpResize}
          onCanvasDblClick={handleDblClick}
          onItemDown={onItemDown}
          onItemContextMenu={handleContextMenu}
          onResizeStart={handleResizeStart}
          onBuildingDoubleClick={handleBuildingDoubleClick}
          onPathClick={onPathClick}
          onSelect={setSelected}
          onResetView={resetView}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onSetTool={setTool}
          onToggleSnap={() => setSnapGrid((v) => !v)}
        />

        {/* ── Alignment toolbar (multi-select) ── */}
        <AnimatePresence>
          {showAlignTools && multiSelected.length > 1 && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 p-1 rounded-xl border border-border shadow-lg"
              style={{ background: "var(--card)" }}
            >
              {[
                { icon: AlignLeft, label: "Align Left", action: "left" },
                { icon: AlignCenter, label: "Align Center", action: "center-h" },
                { icon: AlignRight, label: "Align Right", action: "right" },
                { icon: AlignStartVertical, label: "Align Top", action: "top" },
                { icon: AlignVerticalJustifyCenter, label: "Align Middle", action: "center-v" },
                { icon: AlignEndVertical, label: "Align Bottom", action: "bottom" },
              ].map(({ icon: Icon, label, action }) => (
                <motion.button
                  key={action}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    pushHistory();
                    const selBuildings = buildings.filter((b) => multiSelected.includes(b.id));
                    if (selBuildings.length < 2) return;
                    const ref = selBuildings[0];
                    const updated = buildings.map((b) => {
                      if (!multiSelected.includes(b.id)) return b;
                      let nx = b.x, ny = b.y;
                      switch (action) {
                        case "left": nx = ref.x; break;
                        case "center-h": nx = ref.x + ref.width / 2 - b.width / 2; break;
                        case "right": nx = ref.x + ref.width - b.width; break;
                        case "top": ny = ref.y; break;
                        case "center-v": ny = ref.y + ref.height / 2 - b.height / 2; break;
                        case "bottom": ny = ref.y + ref.height - b.height; break;
                      }
                      return { ...b, x: snap(nx), y: snap(ny) };
                    });
                    updBuildings(updated);
                    toast.success(`Aligned ${multiSelected.length} items`);
                  }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                  title={label}
                >
                  <Icon className="h-3.5 w-3.5" />
                </motion.button>
              ))}
              <div className="w-px h-5 bg-border" />
              <span className="text-[10px] font-mono text-muted-foreground px-1">{multiSelected.length}</span>
              <button
                onClick={() => { setMultiSelected([]); setShowAlignTools(false); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                title="Clear selection"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Routes Panel (Navigation layer) ── */}
        {layer === "navigation" && (
          <RoutesPanel
            routes={routes}
            selectedRouteId={selRouteId}
            onSelectRoute={(id) => { setSelRouteId(id); setSelected({ type: "route", id }); }}
            onDeleteRoute={onDeleteRoute}
            onUpdateRoute={onUpdateRoute}
          />
        )}

        {/* ── Right: Properties Panel ── */}
        <PropertiesPanel
          layer={layer}
          selected={selected}
          selBldg={selBldg}
          selMkr={selMkr}
          selRoute={selRoute}
          onUpdateBuilding={onUpdateBuilding}
          onUpdateMarker={onUpdateMarker}
          onUpdateRoute={onUpdateRoute}
          onDeleteBuilding={onDeleteBuilding}
          onDeleteMarker={onDeleteMarker}
          onDeleteRoute={onDeleteRoute}
          onClose={() => { setSelected(null); setSelRouteId(null); }}
        />
      </motion.div>
      </AnimatePresence>

      {/* ── Publish confirmation dialog ── */}
      <EditorPublishDialog
        open={showPublishConfirm}
        onClose={() => setShowPublishConfirm(false)}
        onPublish={() => {
          setShowPublishConfirm(false);
          setIsProcessing(true);
          onPublish(campus);
        }}
      />

      {/* ── Unsaved changes back dialog ── */}
      <EditorBackDialog
        open={showBackConfirm}
        isDirty={isDirty}
        publishStatus={campus.publishStatus}
        onClose={() => setShowBackConfirm(false)}
        onSaveAndBack={() => {
          setShowBackConfirm(false);
          const now = new Date().toISOString().slice(0, 10);
          const saved = { ...campus, updatedAt: now };
          onUpdate(saved);
          savedSnapshotRef.current = JSON.stringify(saved);
          setTimeout(() => onBack(), 100);
        }}
        onBack={() => {
          setShowBackConfirm(false);
          onBack();
        }}
      />

      {/* Tutorial overlay */}
      <MapBuilderTutorial
        open={showTutorial}
        onClose={() => setShowTutorial(false)}
        onSetTool={setTool}
      />

      {/* Batch delete confirmation dialog */}
      <AnimatePresence>
        {batchDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
            onClick={() => setBatchDeleteConfirm(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-sm overflow-hidden rounded-2xl border shadow-2xl"
              style={{ background: "var(--card)", borderColor: "var(--destructive)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center px-6 pt-6 pb-2 text-center">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                  style={{ background: "color-mix(in srgb, var(--destructive) 12%, transparent)" }}>
                  <Trash2 className="h-6 w-6" style={{ color: "var(--destructive)" }} />
                </div>
                <h3 className="text-base font-extrabold text-foreground">Delete {batchDeleteConfirm.buildingIds.length + batchDeleteConfirm.markerIds.length} Items?</h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed max-w-[260px]">
                  {batchDeleteConfirm.buildingIds.length > 0 && (
                    <>{batchDeleteConfirm.buildingIds.length} building{batchDeleteConfirm.buildingIds.length > 1 ? "s" : ""}{batchDeleteConfirm.markerIds.length > 0 ? " and " : ""}</>
                  )}
                  {batchDeleteConfirm.markerIds.length > 0 && (
                    <>{batchDeleteConfirm.markerIds.length} marker{batchDeleteConfirm.markerIds.length > 1 ? "s" : ""}</>
                  )}
                   will be permanently deleted. This action cannot be undone.
                </p>
              </div>
              <div className="flex gap-2.5 px-6 pb-6 pt-3">
                <button
                  onClick={() => setBatchDeleteConfirm(null)}
                  className="flex-1 h-10 rounded-xl border text-xs font-bold text-foreground hover:bg-muted transition-colors"
                  style={{ borderColor: "var(--border)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!batchDeleteConfirm) return;
                    pushHistory();
                    const { buildingIds, markerIds } = batchDeleteConfirm;
                    upd({
                      buildings: buildings.filter((b) => !buildingIds.includes(b.id)),
                      markers: markers.filter((m) => !markerIds.includes(m.id)),
                    });
                    setMultiSelected([]);
                    setShowAlignTools(false);
                    setBatchDeleteConfirm(null);
                  }}
                  className="flex-1 h-10 rounded-xl text-xs font-extrabold text-white transition-colors shadow-sm hover:opacity-90"
                  style={{ background: "var(--destructive)" }}
                >
                  Delete All
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Erase confirmation dialog */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-sm overflow-hidden rounded-2xl border shadow-2xl"
              style={{ background: "var(--card)", borderColor: "var(--destructive)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center px-6 pt-6 pb-2 text-center">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                  style={{ background: "color-mix(in srgb, var(--destructive) 12%, transparent)" }}>
                  <Trash2 className="h-6 w-6" style={{ color: "var(--destructive)" }} />
                </div>
                <h3 className="text-base font-extrabold text-foreground">Delete {deleteConfirm.type === "path" ? "Path" : deleteConfirm.type === "marker" ? "Marker" : "Building"}?</h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed max-w-[260px]">
                  {deleteConfirm.type === "building"
                    ? `Are you sure you want to delete "${deleteConfirm.name}"? This will also remove all its floors and rooms. This action cannot be undone.`
                    : `Are you sure you want to delete "${deleteConfirm.name}"? This action cannot be undone.`
                  }
                </p>
              </div>
              <div className="flex gap-2.5 px-6 pb-6 pt-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 h-10 rounded-xl border text-xs font-bold text-foreground hover:bg-muted transition-colors"
                  style={{ borderColor: "var(--border)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!deleteConfirm) return;
                    pushHistory();
                    if (deleteConfirm.type === "building") {
                      updBuildings(buildings.filter((b) => b.id !== deleteConfirm.id));
                    } else if (deleteConfirm.type === "marker") {
                      updMarkers(markers.filter((m) => m.id !== deleteConfirm.id));
                    } else {
                      updPaths(paths.filter((p) => p.id !== deleteConfirm.id));
                    }
                    setSelected(null);
                    setDeleteConfirm(null);
                  }}
                  className="flex-1 h-10 rounded-xl text-xs font-extrabold text-white transition-colors shadow-sm hover:opacity-90"
                  style={{ background: "var(--destructive)" }}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* ═══════════════════════════════════════════════════════════════════
          STATUS BAR: Figma/VS Code-style footer
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="h-7 shrink-0 border-t border-border bg-card flex items-center px-3 gap-3">
        {/* Zoom level */}
        <div className="flex items-center gap-1.5">
          <ZoomIn className="h-3 w-3 text-muted-foreground/50" />
          <span className="text-[10px] font-mono text-muted-foreground/70 tabular-nums font-medium">{Math.round(zoom * 100)}%</span>
          <span className="text-[8px] font-mono text-muted-foreground/30 hidden sm:inline">⌨ Ctrl+Scroll</span>
        </div>

        <div className="w-px h-3 bg-border" />

        {/* Canvas dimensions */}
        <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums">{campus.canvasW} × {campus.canvasH}</span>

        <div className="w-px h-3 bg-border" />

        {/* Cursor position */}
        {cursorPos ? (
          <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums">
            X: {cursorPos.x}  Y: {cursorPos.y}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/30">—</span>
        )}

        <div className="w-px h-3 bg-border" />

        {/* Snap status */}
        <div className="flex items-center gap-2">
          <div className={cn("flex items-center gap-1", snapGrid ? "text-primary/70" : "text-muted-foreground/30")}>
            <Grid3X3 className="h-2.5 w-2.5" />
            <span className="text-[9px] font-medium">Grid</span>
          </div>
          <div className={cn("flex items-center gap-1", edgeSnap ? "text-primary/70" : "text-muted-foreground/30")}>
            <Magnet className="h-2.5 w-2.5" />
            <span className="text-[9px] font-medium">Snap</span>
          </div>
        </div>

        <div className="w-px h-3 bg-border" />

        {/* Active tool */}
        <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
          <MousePointer2 className="h-2.5 w-2.5" />
          {toolConfig.find(t => t.id === tool)?.label ?? tool}
        </span>

        <div className="w-px h-3 bg-border" />

        {/* Layer indicator */}
        <div className="flex items-center gap-1" style={{ color: activeLayer.color }}>
          <div className="w-2 h-2 rounded-full" style={{ background: activeLayer.color }} />
          <span className="text-[9px] font-semibold">{activeLayer.label}</span>
        </div>

        {/* Real-time error count */}
        {errorCount > 0 && (
          <>
            <div className="w-px h-3 bg-border" />
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm" style={{ background: "color-mix(in srgb, var(--destructive) 10%, transparent)" }}>
              <AlertTriangle className="h-2.5 w-2.5 shrink-0" style={{ color: "var(--destructive)" }} />
              <span className="text-[9px] font-extrabold" style={{ color: "var(--destructive)" }}>
                {errorCount}
              </span>
            </div>
          </>
        )}

        <div className="flex-1" />

        {/* Building / marker / path counts */}
        <span className="text-[9px] text-muted-foreground/40 flex items-center gap-2">
          <Square className="h-2.5 w-2.5" />
          {buildings.length} bldg{buildings.length !== 1 ? 's' : ''}
          <MapPin className="h-2.5 w-2.5 ml-1" />
          {markers.length} mrk
          <GitBranch className="h-2.5 w-2.5 ml-1" />
          {paths.length} path{paths.length !== 1 ? 's' : ''}
        </span>

        <div className="w-px h-3 bg-border" />

        {/* Help */}
        <button
          onClick={() => setShowTutorial(true)}
          className="flex items-center gap-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          title="Keyboard shortcuts"
        >
          <Keyboard className="h-2.5 w-2.5" />
          <span className="text-[9px] hidden sm:inline">Shortcuts</span>
        </button>
      </div>

      {/* Save screen overlay */}
      <SaveScreen
        open={saveScreen.open}
        state={saveScreen.state}
        campusName={campus.name}
        onClose={() => setSaveScreen({ open: false, state: "saving" })}
        onRetry={() => {
          setSaveScreen({ open: true, state: "saving" });
          setTimeout(() => {
            try {
              onUpdate({ ...campus, updatedAt: new Date().toISOString().slice(0, 10) });
              setSaveScreen({ open: true, state: "success" });
            } catch {
              setSaveScreen({ open: true, state: "error" });
            }
          }, 1500);
        }}        />

      {/* ── Validation Errors Dialog ── */}
      <ValidationErrorsDialog
        open={validationDialogOpen}
        errors={validationErrors}
        onClose={() => setValidationDialogOpen(false)}
        onReviewIssues={handleReviewIssues}
      />
    </div>
    </div>
  );
}
