import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft, Globe, Map, CheckCircle2, Undo2, Redo2, X,
  AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignEndVertical,
  AlignVerticalJustifyCenter, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
  Grid3X3, Magnet, ZoomIn, ZoomOut, Maximize2, Settings2,
  MousePointer2, Square, MapPin, GitBranch, Trash2, Hand, Keyboard, AlertTriangle,
  Loader2, HelpCircle, ChevronLeft, Navigation,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useCanvasControls, isSpacePressed } from "./useCanvasControls";
import { Canvas } from "./Canvas";
import { HierarchyPanel } from "./HierarchyPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { RoutesPanel } from "./RoutesPanel";
import { SaveScreen } from "./SaveScreen";
import { LAYERS, BUILDING_COLORS } from "./constants";
import { genId } from "./constants";
import { useToast } from "../../hooks/useToast";
import { ValidationErrorsDialog } from "./ValidationErrorsDialog";
import type { ValidationIssue } from "./ValidationErrorsDialog";
import { ContextMenu } from "./ContextMenu";
import { PrePublishDialog } from "./PrePublishDialog";
import { TestNavigationPanel } from "./TestNavigationPanel";
import { ShortcutCheatSheet } from "./ShortcutCheatSheet";
import { EditorBackDialog } from "./EditorBackDialog";
import { IssuesPopover } from "./IssuesPopover";
import type {
  Campus, CampusBuilding, CampusMarker, CampusSelection,
  SimpleTool, EditorLayer, RubberBand, CampusRoute, CampusPath,
  CampusDecorAsset, BuildingTypeDescriptor,
} from "./types";
import { BUILDING_TYPE_MAP, DECOR_ASSET_MAP } from "./constants";
import { ToolbarTooltip } from "./ToolbarTooltip";
import { validateCampusData, computeBuildingOverlaps } from "../../lib/campusValidation";
import { computeBuildingPlacement, resetTransientToolState } from "../../lib/editorPlacement";
import { computeGroupTranslation, groupBBoxAfterTranslation, computeGroupAlignmentGuides } from "../../lib/campusGroupMove";
import type { GroupMoveMember } from "../../lib/campusGroupMove";
import { reorderOutdoorStack } from "../../lib/campusStack";
import type { LayerOrderAction } from "../../lib/campusLayerOrder";
import { duplicateDecorAsset } from "../../lib/decorAsset";
import { decorRenderScale, decorWorldSize } from "../../lib/decorVisual";
import { outdoorSelectionIdsInRect, selectionRectFromPoints } from "../../lib/campusSelection";
import { arrangeSelectedOutdoorObjects, selectedOutdoorCount, type OutdoorArrangementAction } from "../../lib/campusArrangement";

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

/** Normalize an angle in degrees to [0, 360) — never -360/360/720 */
const normalizeDeg = (deg: number) => ((deg % 360) + 360) % 360;

interface CampusEditorProps {
  campus: Campus;
  onBack: () => void;
  onUpdate: (c: Campus) => void;
  onSave?: (c: Campus) => Promise<Campus>;
  onPublish: (c: Campus) => void;
  publishingEnabled?: boolean;
  onOpenFloor: (buildingId: string, floorId: string) => void;
  onAddBuilding: () => void;
  onOpenCanvasSettings?: () => void;
  /** Timestamp of the last save (used to sync savedSnapshotRef with external saves) */
  lastSavedAt?: string;
}

export function CampusEditor({ campus, onBack, onUpdate, onSave, onPublish, publishingEnabled = true, onOpenFloor, onAddBuilding, onOpenCanvasSettings }: CampusEditorProps) {
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
  // ── Building type placement mode ──
  const [selectedBuildingType, setSelectedBuildingType] = useState<BuildingTypeDescriptor | null>(null);
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: "building" | "marker" | "path" | "decorAsset"; id: string } | null>(null);
  // ── Erase/delete confirmation ──
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "building" | "marker" | "path" | "decorAsset"; id: string; name: string } | null>(null);
  // ── Batch delete confirmation ──
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState<{ buildingIds: string[]; markerIds: string[]; decorAssetIds: string[] } | null>(null);
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
  // ── Rotation state ──
  // Stores the previous mouse angle + accumulated rotation so spinning across the
  // ±180° atan2 wrap boundary stays smooth (never jumps to ±360° stored values).
  const rotating = useRef<{ id: string; cx: number; cy: number; prevAngle: number; rotation: number } | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rotatingAngle, setRotatingAngle] = useState(0);
  // ── Decor asset rotation state ──
  const decorRotating = useRef<{ id: string; cx: number; cy: number; prevAngle: number; rotation: number } | null>(null);
  const [decorRotatingId, setDecorRotatingId] = useState<string | null>(null);
  // ── Decor asset resize state (uniform scale via corners, rotation-aware) ──
  const decorResizing = useRef<{ id: string; corner: string; sx: number; sy: number; scale: number; hw: number; hh: number; rot: number } | null>(null);
  const [decorResizingId, setDecorResizingId] = useState<string | null>(null);
  // ── Hierarchy panel toggle ──
  const [hierarchyOpen, setHierarchyOpen] = useState(true);
  // ── Test navigation panel (Navigation layer) ──
  const [testNavOpen, setTestNavOpen] = useState(false);
  // ── Route highlighted by the test-navigation panel (drawn on the canvas) ──
  const [highlightedRoute, setHighlightedRoute] = useState<{ waypoints: { x: number; y: number }[]; color: string } | null>(null);
  // ── Keyboard shortcut cheat sheet ──
  const [showCheatSheet, setShowCheatSheet] = useState(false);

  // ── Normalized canvas dimensions ──
  // The DB contract guarantees canvas_width/height > 0, but a freshly-created
  // in-memory campus (e.g. right after the canvas setup wizard) can transiently
  // carry 0/undefined. Every geometry path below reads these safe values so
  // placement can never silently collapse toward the top-left corner (0,0).
  const cw = campus.canvasW > 0 ? campus.canvasW : 900;
  const ch = campus.canvasH > 0 ? campus.canvasH : 680;
  // ── Path draw-in animation: id of the just-completed path ──
  const [animatingPathId, setAnimatingPathId] = useState<string | null>(null);
  // ── Arrow-key nudge batching (groups rapid nudges into one undo step) ──
  const lastNudgeRef = useRef(0);
  // ── Clear guides + test-route highlight when switching tools or layers ──
  useEffect(() => {
    setGuides([]);
    setHighlightedRoute(null);
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

  // ── Pure validation — no side effects (logic lives in src/lib/campusValidation.ts) ──
  const validateCampus = useCallback((): ValidationIssue[] => {
    // Narrow deps mirror the original inline implementation: the checks only
    // read name/buildings/canvasW/canvasH, so the memo must not re-create on
    // unrelated campus mutations (markers, paths, navNodes, …).
    return validateCampusData(campus, overlappingBuildings);
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

  const { zoom, pan, panning, svgRef, containerRef, getPoint, startPan, movePan, endPan, resetView, zoomIn, zoomOut, zoomToBuilding, handleMiddleMouseDown, handleWheel } =
    useCanvasControls(cw, ch);

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
  const dragging = useRef<{ type: "building" | "marker" | "decorAsset"; id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const dragGroupStartRef = useRef<GroupMoveMember[] | null>(null);

  const buildings = campus.buildings;
  const markers = campus.markers;
  const paths = campus.paths;
  const decorAssets = campus.decorAssets ?? [];

  const upd = (c: Partial<Campus>) => { pushHistory(); onUpdate({ ...campus, ...c }); };
  const updBuildings = (b: CampusBuilding[]) => upd({ buildings: b });
  const updMarkers = (m: CampusMarker[]) => upd({ markers: m });
  const updPaths = (p: typeof paths) => upd({ paths: p });

  // ── Overlap detection (handles rotated buildings via rotated AABB) ──────────
  const computeOverlaps = useCallback((bldgs: CampusBuilding[]): Set<string> => {
    return computeBuildingOverlaps(bldgs);
  }, []);

  // Recompute overlaps whenever buildings change
  useEffect(() => {
    setOverlappingBuildings(computeOverlaps(buildings));
  }, [buildings, computeOverlaps]);

  // ── Build the rigid group-drag member list ──
  // When the grabbed object is part of the current multi-selection, the whole
  // selection of buildings + decorative assets moves as one unit. Locked
  // buildings are excluded; markers/paths/nav items are never part of the group.
  const buildDragGroup = (drag: { type: string; id: string }, sel: string[]): GroupMoveMember[] | null => {
    if (!sel.includes(drag.id)) return null;
    const members: GroupMoveMember[] = [];
    for (const b of buildings) {
      if (b.locked) continue;
      if (sel.includes(b.id)) members.push({ kind: "building", id: b.id, x: b.x, y: b.y, width: b.width, height: b.height });
    }
    for (const da of decorAssets) {
      if (!sel.includes(da.id)) continue;
      const t = DECOR_ASSET_MAP[da.type];
      if (!t) continue;
      const size = decorWorldSize(t, da.scale);
      members.push({ kind: "decorAsset", id: da.id, x: da.x, y: da.y, width: size.width, height: size.height });
    }
    return members.length >= 2 ? members : null;
  };

  const selectionForId = useCallback((id: string): CampusSelection | null => {
    if (buildings.some((b) => b.id === id)) return { type: "building", id };
    if (markers.some((m) => m.id === id)) return { type: "marker", id };
    if (decorAssets.some((da) => da.id === id)) return { type: "decorAsset", id };
    return null;
  }, [buildings, markers, decorAssets]);

  const selectedOutdoorObjectCount = useMemo(
    () => selectedOutdoorCount(buildings, decorAssets, multiSelected, DECOR_ASSET_MAP),
    [buildings, decorAssets, multiSelected]
  );

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
      const pt = getPoint(e, cw, ch);
      setRubberBand({ sx: pt.x, sy: pt.y, cx: pt.x, cy: pt.y });
      if (!e.shiftKey) { setMultiSelected([]); setSelected(null); setGuides([]); }
      return;
    }
    if (tool === "erase") { startPan(e); setSelected(null); return; }

    const pt = getPoint(e, cw, ch);
    const clampedPt = {
      x: Math.max(0, Math.min(cw, Math.round(pt.x))),
      y: Math.max(0, Math.min(ch, Math.round(pt.y))),
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
      // If a building type is selected from the palette, place it directly
      if (selectedBuildingType) {
        const nb: CampusBuilding = {
          id: genId("bld"),
          name: selectedBuildingType.label,
          code: selectedBuildingType.label.slice(0, 3).toUpperCase(),
          category: selectedBuildingType.category,
          description: selectedBuildingType.description,
          x: Math.round(Math.max(0, Math.min(cw - selectedBuildingType.defaultWidth, clampedPt.x - selectedBuildingType.defaultWidth / 2))),
          y: Math.round(Math.max(0, Math.min(ch - selectedBuildingType.defaultHeight, clampedPt.y - selectedBuildingType.defaultHeight / 2))),
          width: selectedBuildingType.defaultWidth,
          height: selectedBuildingType.defaultHeight,
          color: selectedBuildingType.color,
          expanded: false,
          floors: [{ id: genId("fl"), number: 1, label: "Ground Floor", rooms: [], paths: [] }],
        };
        updBuildings([...buildings, nb]);
        setSelected({ type: "building", id: nb.id });
        setSelectedBuildingType(null);
        setTool("select");
        const newOverlaps = computeOverlaps([...buildings, nb]);
        if (newOverlaps.has(nb.id)) {
          setShake((n) => n + 1);
          toast.warning("Building overlaps another", "Adjust the position to avoid overlapping.");
        } else {
          toast.success("Building placed", `${nb.name} — edit properties in the right panel.`);
        }
        return;
      }
      // Otherwise, drag-to-create mode
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

    const pt = getPoint(e, cw, ch);
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

    // ── Group drag: the whole selected group of buildings + decorative assets
    // moves rigidly as one unit (grid-snapped on the anchor, edge-snapped on the
    // group bbox, clamped to the canvas). Internal spacing is never distorted. ──
    const group = dragGroupStartRef.current;
    if (group) {
      const groupIds = new Set(group.map((m) => m.id));
      const otherBuildings = buildings
        .filter((b) => !groupIds.has(b.id))
        .map((b) => ({ x: b.x, y: b.y, width: b.width, height: b.height }));
      const { dx, dy } = computeGroupTranslation({
        members: group,
        draggedId: drag.id,
        rawDx: pt.x - drag.sx,
        rawDy: pt.y - drag.sy,
        canvasW: cw,
        canvasH: ch,
        snapGrid,
        otherBuildings,
        edgeSnap,
      });
      if (dx === 0 && dy === 0) return;
      gestureChangedRef.current = true;
      const startById = new globalThis.Map(group.map((m) => [m.id, m]));
      const nextBuildings = buildings.map((b) => {
        const start = startById.get(b.id);
        return start?.kind === "building" ? { ...b, x: start.x + dx, y: start.y + dy } : b;
      });
      onUpdate({
        ...campus,
        buildings: nextBuildings,
        decorAssets: decorAssets.map((da) => {
          const start = startById.get(da.id);
          return start?.kind === "decorAsset" ? { ...da, x: start.x + dx, y: start.y + dy } : da;
        }),
      });
      const bbox = groupBBoxAfterTranslation(group, dx, dy);
      setOverlappingBuildings(computeOverlaps(nextBuildings));
      setGuides(computeGroupAlignmentGuides(bbox.x, bbox.y, bbox.width, bbox.height, otherBuildings));
      return;
    }

    if (drag.type === "decorAsset") {
      const updatedAssets = decorAssets.map((da) =>
        da.id === drag.id
          ? { ...da, x: snap(drag.ox + (pt.x - drag.sx)), y: snap(drag.oy + (pt.y - drag.sy)) }
          : da
      );
      gestureChangedRef.current = true;
      onUpdate({ ...campus, decorAssets: updatedAssets });
      return;
    }
    if (drag.type === "building") {
      const b = buildings.find((b) => b.id === drag.id)!;
      // Direct 1:1 tracking: the building follows the cursor with the grab
      // offset preserved, snapping instantly to grid/edges (no easing lag,
      // so the grabbed point stays put under the cursor).
      const rawX = drag.ox + (pt.x - drag.sx);
      const rawY = drag.oy + (pt.y - drag.sy);
      const targetX = snap(rawX);
      const targetY = snap(rawY);
      const targetB = edgeSnapBuilding({ ...b, x: targetX, y: targetY }, buildings);
      gestureChangedRef.current = true;
      onUpdate({
        ...campus,
        buildings: buildings.map((bld) => (bld.id === drag.id ? { ...bld, x: targetB.x, y: targetB.y } : bld)),
      });
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
    } else {
      gestureChangedRef.current = true;
      onUpdate({
        ...campus,
        markers: markers.map((m) => (m.id === drag.id ? { ...m, x: snap(drag.ox + (pt.x - drag.sx)), y: snap(drag.oy + (pt.y - drag.sy)) } : m)),
      });
    }
  };

  const handleResizeStart = (e: React.MouseEvent, b: CampusBuilding, corner: string) => {
    e.stopPropagation();
    const pt = getPoint(e, cw, ch);
    gestureHistoryPushed.current = false;
    setResizing({ id: b.id, corner, sx: pt.x, sy: pt.y, ox: b.x, oy: b.y, ow: b.width, oh: b.height });
  };

  // ── Rotation handler ──
  const handleRotateStart = useCallback((e: React.MouseEvent, b: CampusBuilding) => {
    e.stopPropagation();
    const pt = getPoint(e, cw, ch);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    // Track the previous mouse angle + normalized accumulated rotation so that
    // spinning across the ±180° atan2 wrap stays smooth (no ±360° jumps).
    const startAngle = Math.atan2(pt.y - cy, pt.x - cx) * (180 / Math.PI);
    const startRot = normalizeDeg(b.rotation ?? 0);
    gestureHistoryPushed.current = false;
    rotating.current = { id: b.id, cx, cy, prevAngle: startAngle, rotation: startRot };
    setRotatingId(b.id);
    setRotatingAngle(startRot);
  }, [getPoint, cw, ch]);

  // ── Decor asset rotation handler ──
  const handleDecorRotateStart = useCallback((e: React.MouseEvent, da: CampusDecorAsset) => {
    e.stopPropagation();
    const pt = getPoint(e, cw, ch);
    const startAngle = Math.atan2(pt.y - da.y, pt.x - da.x) * (180 / Math.PI);
    const startRot = normalizeDeg(da.rotation ?? 0);
    gestureHistoryPushed.current = false;
    decorRotating.current = { id: da.id, cx: da.x, cy: da.y, prevAngle: startAngle, rotation: startRot };
    setDecorRotatingId(da.id);
    setRotatingAngle(startRot);
  }, [getPoint, cw, ch]);

  // ── Decor asset resize handler (uniform scale via corners, rotation-aware) ──
  const handleDecorResizeStart = useCallback((e: React.MouseEvent, da: CampusDecorAsset, corner: string) => {
    e.stopPropagation();
    const template = DECOR_ASSET_MAP[da.type];
    if (!template) return;
    const pt = getPoint(e, cw, ch);
    const s = decorRenderScale(da.scale);
    gestureHistoryPushed.current = false;
    decorResizing.current = {
      id: da.id, corner,
      sx: pt.x, sy: pt.y,
      scale: da.scale ?? 1,
      hw: (template.defaultWidth / 2) * s,
      hh: (template.defaultHeight / 2) * s,
      rot: da.rotation ?? 0,
    };
    setDecorResizingId(da.id);
  }, [getPoint, cw, ch]);

  const handleSvgMoveResize = (e: React.MouseEvent) => {
    // ── Handle active decor rotation first ──
    if (decorRotating.current) {
      const pt = getPoint(e, cw, ch);
      const { id, cx, cy, prevAngle, rotation } = decorRotating.current;
      const currentAngle = Math.atan2(pt.y - cy, pt.x - cx) * (180 / Math.PI);
      // Shortest-path delta across the ±180° atan2 wrap boundary
      let delta = currentAngle - prevAngle;
      if (delta > 180) delta -= 360;
      else if (delta < -180) delta += 360;
      // Accumulate, keep in [0, 360) so it never stores -360°/720°, snap to 5°
      const accumulated = normalizeDeg(rotation + delta);
      const snapped = normalizeDeg(Math.round(accumulated / 5) * 5);
      decorRotating.current = { ...decorRotating.current, prevAngle: currentAngle, rotation: accumulated };
      const da = decorAssets.find((d) => d.id === id);
      if (da) {
        beginGestureHistory();
        onUpdate({ ...campus, decorAssets: decorAssets.map((d) => (d.id === id ? { ...d, rotation: snapped } : d)) });
        setRotatingAngle(snapped);
      }
      return;
    }
    // ── Handle active decor resize (uniform scale, rotation-aware R(-θ)) ──
    if (decorResizing.current) {
      const pt = getPoint(e, cw, ch);
      const rs = decorResizing.current;
      const ddx = pt.x - rs.sx;
      const ddy = pt.y - rs.sy;
      const rotRad = (rs.rot * Math.PI) / 180;
      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);
      // Rotate the world delta into the asset's LOCAL frame (R(-θ)) so the
      // grabbed corner follows the cursor along the asset's actual (rotated) axes
      const localDx = ddx * cosR + ddy * sinR;
      const localDy = -ddx * sinR + ddy * cosR;
      // Uniform scale factor along the dragged corner's axes (anchored at center)
      let fx = 1, fy = 1;
      if (rs.corner.includes("e")) fx = rs.hw > 0 ? (rs.hw + localDx) / rs.hw : 1;
      if (rs.corner.includes("w")) fx = rs.hw > 0 ? (rs.hw - localDx) / rs.hw : 1;
      if (rs.corner.includes("s")) fy = rs.hh > 0 ? (rs.hh + localDy) / rs.hh : 1;
      if (rs.corner.includes("n")) fy = rs.hh > 0 ? (rs.hh - localDy) / rs.hh : 1;
      const factor = Math.max(fx, fy, 0.05);
      const newScale = Math.max(0.1, Math.min(12, rs.scale * factor));
      beginGestureHistory();
      onUpdate({ ...campus, decorAssets: decorAssets.map((d) => (d.id === rs.id ? { ...d, scale: newScale } : d)) });
      return;
    }
    // Handle active rotation first
    if (rotating.current) {
      const pt = getPoint(e, cw, ch);
      const { id, cx, cy, prevAngle, rotation } = rotating.current;
      const currentAngle = Math.atan2(pt.y - cy, pt.x - cx) * (180 / Math.PI);
      // Shortest-path delta across the ±180° atan2 wrap boundary
      let delta = currentAngle - prevAngle;
      if (delta > 180) delta -= 360;
      else if (delta < -180) delta += 360;
      // Accumulate, keep in [0, 360) so it never stores -360°/720°, snap to 5°
      const accumulated = normalizeDeg(rotation + delta);
      const snapped = normalizeDeg(Math.round(accumulated / 5) * 5);
      rotating.current = { ...rotating.current, prevAngle: currentAngle, rotation: accumulated };
      const b = buildings.find(bld => bld.id === id);
      if (b) {
        beginGestureHistory();
        onUpdate({ ...campus, buildings: buildings.map(bld => bld.id === id ? { ...bld, rotation: snapped } : bld) });
        setRotatingAngle(snapped);
      }
      return;
    }
    if (!resizing) { handleSvgMove(e); return; }
    const pt = getPoint(e, cw, ch);
    const ddx = pt.x - resizing.sx;
    const ddy = pt.y - resizing.sy;
    beginGestureHistory();
    onUpdate({
      ...campus,
      buildings: buildings.map((b) => {
        if (b.id !== resizing.id) return b;
        const rotVal = b.rotation ?? 0;
        const rotRad = (rotVal * Math.PI) / 180;
        const cosR = Math.cos(rotRad);
        const sinR = Math.sin(rotRad);
        // Rotate the world-space mouse delta into the building's LOCAL frame (R(-θ)),
        // so the grabbed corner follows the cursor along the building's actual
        // (rotated) axes — not its 0° orientation.
        const localDx = ddx * cosR + ddy * sinR;
        const localDy = -ddx * sinR + ddy * cosR;
        const sDx = snap(localDx);
        const sDy = snap(localDy);
        // Apply the local deltas to width/height (e/w → width, s/n → height)
        let nw = resizing.ow, nh = resizing.oh;
        if (resizing.corner.includes("e")) nw = resizing.ow + sDx;
        if (resizing.corner.includes("w")) nw = resizing.ow - sDx;
        if (resizing.corner.includes("s")) nh = resizing.oh + sDy;
        if (resizing.corner.includes("n")) nh = resizing.oh - sDy;
        nw = Math.max(40, nw);
        nh = Math.max(30, nh);
        const dW = nw - resizing.ow;
        const dH = nh - resizing.oh;
        // Keep the edge/corner OPPOSITE the dragged handle visually fixed:
        // fx/fy point from the center toward the fixed corner in LOCAL space.
        const fx = resizing.corner.includes("w") ? 1 : resizing.corner.includes("e") ? -1 : 0;
        const fy = resizing.corner.includes("n") ? 1 : resizing.corner.includes("s") ? -1 : 0;
        // The fixed local corner shifts as w/h change, so the center must move by
        // R(θ)·(F_old − F_new) to keep that corner stationary on screen.
        const dcx = -fx * (dW / 2) * cosR + fy * (dH / 2) * sinR;
        const dcy = -fx * (dW / 2) * sinR - fy * (dH / 2) * cosR;
        // Rebuild top-left from the compensated center
        const nx = resizing.ox + resizing.ow / 2 + dcx - nw / 2;
        const ny = resizing.oy + resizing.oh / 2 + dcy - nh / 2;
        return { ...b, x: Math.round(nx), y: Math.round(ny), width: nw, height: nh };
      })
    });
  };

  const handleSvgUpResize = () => {
    // Finalize decor rotation
    if (decorRotating.current) {
      gestureHistoryPushed.current = false;
      decorRotating.current = null;
      setDecorRotatingId(null);
      setRotatingAngle(0);
      return;
    }
    // Finalize decor resize
    if (decorResizing.current) {
      gestureHistoryPushed.current = false;
      decorResizing.current = null;
      setDecorResizingId(null);
      return;
    }
    // Finalize rotation
    if (rotating.current) {
      gestureHistoryPushed.current = false;
      rotating.current = null;
      setRotatingId(null);
      setRotatingAngle(0);
      return;
    }
    // Commit exactly ONE post-gesture undo snapshot for item drags (single or
    // group) so undo restores the pre-gesture state and redo re-applies the
    // complete gesture. The pre-gesture state is still the previous history
    // tip, so a drag adds exactly one new entry — never one per object/move.
    const dragCommitted = gestureChangedRef.current;
    endPan();
    dragging.current = null;
    dragGroupStartRef.current = null;
    if (resizing) setResizing(null);

    // Finalize rubber-band selection
    if (rubberBand) {
      const rect = selectionRectFromPoints(rubberBand.sx, rubberBand.sy, rubberBand.cx, rubberBand.cy);
      const rw = rect.width;
      const rh = rect.height;
      if (rw > 5 || rh > 5) {
        // Only capture if dragged more than 5px (avoid accidental clicks).
        // Buildings and decorative assets share one selectable-bounds helper:
        // rotated building AABB, decor rendered size/rotation, and hidden
        // objects excluded. Intersections make selection forgiving when the
        // band crosses the visible object.
        const captured = outdoorSelectionIdsInRect(rect, buildings, decorAssets, DECOR_ASSET_MAP, { includeHidden: true });
        if (captured.length > 1) {
          setMultiSelected(captured);
          setSelected(null);
          setShowAlignTools(true);
        } else if (captured.length === 1) {
          setMultiSelected([]);
          setSelected(selectionForId(captured[0]));
          setShowAlignTools(false);
        } else {
          setMultiSelected([]);
          setSelected(null);
          setShowAlignTools(false);
        }
      }
      setRubberBand(null);
      return;
    }

    if (resizing) { setResizing(null); return; }      // Finalize building drag-to-create
    if (buildingDrag) {
      // Shared geometry with the canvas preview (computeBuildingPlacement), so
      // the final building is always exactly where/whatever the preview showed.
      const rect = computeBuildingPlacement(
        buildingDrag.sx, buildingDrag.sy, buildingDrag.cx, buildingDrag.cy,
        cw, ch
      );
      const nb: CampusBuilding = {
        id: genId("bld"), name: "New Building", code: "NEW", category: "Academic", description: "",
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
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
    if (dragCommitted) pushHistory();
    gestureChangedRef.current = false;
    gestureHistoryPushed.current = false;
  };
  const handleSvgUp = () => { endPan(); dragging.current = null; dragGroupStartRef.current = null; setGuides([]); gestureHistoryPushed.current = false; };

  // ── Mouse leaves the canvas mid-gesture: CANCEL placement/drawing instead of
  // finalizing it. (onMouseLeave previously ran the same handler as mouseup, so
  // a drag that exited the canvas — e.g. toward the top-left — could commit a
  // building at an unintended spot without the user ever releasing the button.) ──
  const handleSvgLeave = () => {
    // If an item drag was in progress when the pointer left the canvas, the
    // movement was already applied — record it so undo can restore it.
    if (gestureChangedRef.current) pushHistory();
    gestureChangedRef.current = false;
    endPan();
    dragging.current = null;
    dragGroupStartRef.current = null;
    if (resizing) setResizing(null);
    if (rotating.current) { rotating.current = null; setRotatingId(null); setRotatingAngle(0); }
    if (decorRotating.current) { decorRotating.current = null; setDecorRotatingId(null); setRotatingAngle(0); }
    if (decorResizing.current) { decorResizing.current = null; setDecorResizingId(null); }
    setBuildingDrag(null);
    setRubberBand(null);
    setGuides([]);
    gestureHistoryPushed.current = false;
  };

  // ── Tool switching — clears stale drawing/preview state so switching tools
  // never leaves an unfinished path preview, building drag, or rubber band ──
  const switchTool = useCallback((t: SimpleTool) => {
    const reset = resetTransientToolState();
    setTool(t);
    setDP(reset.drawingPath);
    setBuildingDrag(reset.buildingDrag);
    setRubberBand(reset.rubberBand);
    setGuides(reset.guides);
    if (t !== "building") setSelectedBuildingType(null);
  }, []);

  // ── Layer switching — clears ALL transient tool state and returns to the
  // select tool so an incompatible active tool can never leak between
  // Campus / Navigation / Accessibility / Emergency / Events ──
  const switchLayer = useCallback((next: EditorLayer) => {
    const reset = resetTransientToolState();
    setLayer(next);
    setTool("select");
    setSelected(null);
    setMultiSelected([]);
    setShowAlignTools(false);
    setDP(reset.drawingPath);
    setBuildingDrag(reset.buildingDrag);
    setRubberBand(reset.rubberBand);
    setGuides(reset.guides);
    setSelectedBuildingType(reset.selectedBuildingType);
    setHighlightedRoute(null);
  }, []);

  const handleDblClick = () => {
    if (tool === "path" && drawingPath.length >= 2) {
      const cfg = LAYER_PATH_CONFIG[layer] ?? LAYER_PATH_CONFIG.campus;
      const newPath = { id: genId("p"), points: drawingPath, type: cfg.type, color: cfg.color, width: cfg.width };
      updPaths([...paths, newPath]);
      setDP([]); setTool("select");
      // Play the draw-in animation for the just-completed path
      setAnimatingPathId(newPath.id);
      setTimeout(() => setAnimatingPathId((cur) => (cur === newPath.id ? null : cur)), 900);
      toast.success("Path created", `${drawingPath.length} waypoint${drawingPath.length !== 1 ? "s" : ""} connected.`);
    }
  };

  const handleBuildingDoubleClick = useCallback((id: string) => {
    const b = buildings.find((x) => x.id === id);
    if (!b) return;
    setSelected({ type: "building", id });
    setRenameDialog({ id, name: b.name });
    setRenameValue(b.name);
  }, [buildings]);

  const onItemDown = (e: React.MouseEvent, type: "building" | "marker" | "decorAsset", id: string, ox: number, oy: number) => {
    e.stopPropagation();
    // Spacebar held: pan instead of interacting with items
    if (isSpacePressed()) {
      startPan(e);
      return;
    }
    if (tool === "erase") {
      if (type === "decorAsset") {
        const da = decorAssets.find((d) => d.id === id);
        if (da) {
          const template = DECOR_ASSET_MAP[da.type];
          setDeleteConfirm({ type: "decorAsset", id, name: template?.label ?? da.type });
        }
        return;
      }
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
      // Shift+click toggles membership against the currently visible
      // selection. If one object was selected normally, include it before
      // adding the shifted object so the visual state and drag group agree.
      const base = multiSelected.length > 0
        ? multiSelected
        : selected
          ? [selected.id]
          : [];
      const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      setShowAlignTools(next.length > 1);
      if (next.length > 1) {
        setMultiSelected(next);
        setSelected({ type, id });
      } else if (next.length === 1) {
        setMultiSelected([]);
        setSelected(selectionForId(next[0]));
      } else {
        setMultiSelected([]);
        setSelected(null);
      }
      setGuides([]);
      return;
    }
    // Clicking an object that is already part of the current multi-selection
    // keeps the group: dragging it moves the entire selection (Figma-style).
    // Clicking an unselected object collapses to single-object editing.
    if (multiSelected.includes(id)) {
      setSelected({ type, id });
      setGuides([]);
      const pt = getPoint(e, cw, ch);
      gestureHistoryPushed.current = false;
      gestureChangedRef.current = false;
      dragging.current = { type, id, sx: pt.x, sy: pt.y, ox, oy };
      dragGroupStartRef.current = buildDragGroup({ type, id }, multiSelected);
      return;
    }
    setMultiSelected([]);
    setShowAlignTools(false);
    setSelected({ type, id });
    setGuides([]);
    const pt = getPoint(e, cw, ch);
    gestureHistoryPushed.current = false;
    gestureChangedRef.current = false;
    dragging.current = { type, id, sx: pt.x, sy: pt.y, ox, oy };
    dragGroupStartRef.current = null;
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
  const handleContextMenu = useCallback((e: React.MouseEvent, type: "building" | "marker" | "path" | "decorAsset", id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
    setSelected({ type, id });
  }, []);

  // ── Undo/Redo history (declared before layer ordering + context actions) ──
  const historyRef = useRef<{ snapshots: Campus[]; idx: number }>({
    snapshots: [structuredClone(campus)],
    idx: 0,
  });

  const pushHistory = useCallback((state?: Campus) => {
    const h = historyRef.current;
    const pruned = h.snapshots.slice(0, h.idx + 1);
    // Snapshot the CURRENT state by default. Discrete actions may pass the
    // POST-change state explicitly so the invariant snapshots[idx] === current
    // holds and undo/redo always land on real states (never a duplicate).
    pruned.push(structuredClone(state ?? campus));
    if (pruned.length > 30) pruned.shift();
    historyRef.current = { snapshots: pruned, idx: pruned.length - 1 };
  }, [campus]);

  // ── Decor asset property edits (B2 Phase 3) ──
  // Every committed change is exactly ONE undoable state via the corrected
  // post-state history pattern (onUpdate(next) + pushHistory(next)).
  const onUpdateDecorAsset = useCallback((id: string, changes: Partial<CampusDecorAsset>) => {
    const next = { ...campus, decorAssets: (campus.decorAssets ?? []).map((d) => (d.id === id ? { ...d, ...changes } : d)) };
    onUpdate(next);
    pushHistory(next);
  }, [campus, onUpdate, pushHistory]);

  const onDeleteDecorAsset = useCallback((id: string) => {
    const next = { ...campus, decorAssets: (campus.decorAssets ?? []).filter((d) => d.id !== id) };
    onUpdate(next);
    pushHistory(next);
    setSelected(null);
  }, [campus, onUpdate, pushHistory]);

  const handleArrangeSelection = useCallback((action: OutdoorArrangementAction) => {
    const result = arrangeSelectedOutdoorObjects(buildings, decorAssets, multiSelected, action, DECOR_ASSET_MAP);
    if (!result.changed) {
      toast.info("Nothing to arrange", "The selected objects are already in that position.");
      return;
    }
    const next: Campus = {
      ...campus,
      buildings: result.buildings,
      ...(campus.decorAssets !== undefined ? { decorAssets: result.decorAssets } : {}),
    };
    onUpdate(next);
    pushHistory(next);
    toast.success(
      action.startsWith("distribute") ? "Objects distributed" : "Objects aligned",
      `${selectedOutdoorObjectCount} selected item${selectedOutdoorObjectCount === 1 ? "" : "s"} updated.`
    );
  }, [buildings, decorAssets, multiSelected, campus, onUpdate, pushHistory, selectedOutdoorObjectCount, toast]);

  const onDuplicateDecorAsset = useCallback((id: string) => {
    const cur = campus.decorAssets ?? [];
    const src = cur.find((d) => d.id === id);
    if (!src) return;
    const copy = duplicateDecorAsset(src, genId("dec"));
    const next = { ...campus, decorAssets: [...cur, copy] };
    onUpdate(next);
    pushHistory(next);
    setMultiSelected([]);
    setShowAlignTools(false);
    setSelected({ type: "decorAsset", id: copy.id });
    toast.success("Asset Duplicated", "A copy has been placed nearby.");
  }, [campus, onUpdate, pushHistory, toast]);

  // ── Layer ordering (B2): bring forward / send backward / bring to front / send to back ──
  // Cross-type: buildings and decorative assets share ONE visual stack (a
  // lightweight optional `zOrder` field on each object — no migration; legacy
  // campuses default to buildings-below-decor exactly as before). The whole
  // action is ONE undo snapshot; no-op calls create no history entry.
  // `ids` is optional: when provided (context menu), only those ids reorder;
  // otherwise the current selection (multi-selection > single) is used.
  const handleLayerOrder = useCallback((action: LayerOrderAction, ids?: Set<string>) => {
    const sel = ids ?? new Set<string>(
      multiSelected.length > 0
        ? multiSelected
        : selected?.type === "building" || selected?.type === "decorAsset"
          ? [selected.id]
          : []
    );
    if (sel.size === 0) return;
    const res = reorderOutdoorStack(buildings, campus.decorAssets ?? [], sel, action);
    if (!res.changed) {
      toast.info("Nothing to reorder", "The selection is already at that position.");
      return;
    }
    // ONE history entry per successful action: the post-change state is pushed
    // explicitly so undo restores the previous ordering and redo re-applies it
    // (the same pattern the gesture path uses, avoiding duplicate snapshots).
    const next: Campus = {
      ...campus,
      buildings: res.buildings,
      // Only touch decorAssets when the campus already had them — never
      // introduce an empty array on campuses without decorative assets.
      ...(campus.decorAssets !== undefined ? { decorAssets: res.decorAssets } : {}),
    };
    onUpdate(next);
    pushHistory(next);
  }, [campus, buildings, multiSelected, selected, pushHistory, onUpdate, toast]);

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
        case "bring-to-front":
        case "send-to-back":
          // Context-menu ordering acts on the right-clicked building only.
          handleLayerOrder(
            action === "bring-to-front" ? "front"
              : action === "send-to-back" ? "back"
                : action === "bring-forward" ? "forward"
                  : "backward",
            new Set([id])
          );
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
    } else if (type === "decorAsset") {
      if (action === "duplicate") {
        onDuplicateDecorAsset(id);
      } else if (action === "delete") {
        const da = (campus.decorAssets ?? []).find((x) => x.id === id);
        const template = da ? DECOR_ASSET_MAP[da.type] : undefined;
        setDeleteConfirm({ type: "decorAsset", id, name: da?.name || template?.label || "Asset" });
      } else if (action === "bring-forward" || action === "send-backward" || action === "bring-to-front" || action === "send-to-back") {
        // Right-click ordering invokes the SAME implementation as the
        // PropertiesPanel controls — never a separate code path.
        handleLayerOrder(
          action === "bring-to-front" ? "front"
            : action === "send-to-back" ? "back"
              : action === "bring-forward" ? "forward"
                : "backward",
          new Set([id])
        );
      }
    }
  }, [contextMenu, buildings, markers, onUpdateBuilding, handleLayerOrder, campus, onDuplicateDecorAsset]);

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

  // ── Gesture history: push exactly ONE undo snapshot per drag/resize/rotate gesture ──
  // (Previously every mousemove pushed a full structuredClone of the campus, which
  // added input latency and filled undo history with per-frame garbage states.)
  const gestureHistoryPushed = useRef(false);
  // True while an item-drag gesture (single or group) has actually applied a
  // movement. Used to commit exactly ONE post-gesture undo snapshot on pointer
  // release (or leave), so undo restores the pre-gesture state and redo
  // re-applies the complete gesture.
  const gestureChangedRef = useRef(false);
  const beginGestureHistory = useCallback(() => {
    if (!gestureHistoryPushed.current) {
      gestureHistoryPushed.current = true;
      pushHistory();
    }
  }, [pushHistory]);

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

  // ── Undo/redo availability (for disabled buttons + tooltips) ──
  const undoSteps = historyRef.current.idx;
  const redoSteps = historyRef.current.snapshots.length - 1 - historyRef.current.idx;
  const canUndo = undoSteps > 0;
  const canRedo = redoSteps > 0;

  // ── Save draft: shared by the toolbar button, Ctrl+S, and the retry screen ──
  const runSave = useCallback(async () => {
    // Match the toolbar button's disabled semantics: nothing to save / already saving
    if (isProcessing || !isDirty) {
      toast.success("Already saved", "All changes are up to date.");
      return;
    }
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
    try {
        const candidate = { ...campus, updatedAt: new Date().toISOString() };
        const saved = onSave ? await onSave(candidate) : candidate;
        onUpdate(saved);
        savedSnapshotRef.current = JSON.stringify(saved);
        setSaveScreen({ open: true, state: "success" });
      } catch (error) {
        setSaveScreen({ open: true, state: "error" });
        toast.error("Could not save map", error instanceof Error ? error.message : "The database rejected the save.");
      }
      setIsProcessing(false);
  }, [campus, validateCampus, onUpdate, onSave, isDirty, isProcessing, toast]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "SELECT") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undoEdit(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redoEdit(); return; }
      // Batch delete multi-selected items — show confirmation dialog
      if ((e.key === "Delete" || e.key === "Backspace") && multiSelected.length > 0) {
        e.preventDefault();
        const bIds = buildings.filter((b) => multiSelected.includes(b.id)).map((b) => b.id);
        const mIds = markers.filter((m) => multiSelected.includes(m.id)).map((m) => m.id);
        const daIds = decorAssets.filter((d) => multiSelected.includes(d.id)).map((d) => d.id);
        setBatchDeleteConfirm({ buildingIds: bIds, markerIds: mIds, decorAssetIds: daIds });
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
        else if (selected.type === "decorAsset") {
          const da = decorAssets.find((d) => d.id === selected.id);
          const template = da ? DECOR_ASSET_MAP[da.type] : undefined;
          setDeleteConfirm({ type: "decorAsset", id: selected.id, name: template?.label ?? da?.type ?? "Asset" });
        }
        setSelected(null);
      }
      // Ctrl+A: select all buildings
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        setMultiSelected(buildings.map((b) => b.id));
        if (buildings.length > 1) setShowAlignTools(true);
        return; // Don't fall through to the single-letter "a" → building tool
      }
      if (e.key === "Escape") {
        setDP([]);
        if (tool === "path") switchTool("select");
        setSelected(null);
        setMultiSelected([]);
        setShowAlignTools(false);
        setGuides([]);
        setSelectedBuildingType(null);
        setBuildingDrag(null);
        setRubberBand(null);
      }
      // Single-letter tool shortcuts must NOT fire while Ctrl/Cmd is held
      if (!e.ctrlKey && !e.metaKey) {
        if (e.key === "v" || e.key === "V") switchTool("select");
        if (e.code === "Space") {
          e.preventDefault();
          // Hold-to-pan: save previous tool, activate pan temporarily
          if (tool !== "pan") {
            prevToolRef.current = tool;
            setTool("pan");
          }
        }
        if (e.key === "m" || e.key === "M") switchTool("marker");
        if (e.key === "b" || e.key === "B") switchTool("building");
        if (e.key === "p" || e.key === "P") switchTool("path");
        if (e.key === "e" || e.key === "E") switchTool("erase");
        if (e.key === "r" || e.key === "R") switchTool("room");
        if (e.key === "l" || e.key === "L") switchTool("room");
        if (e.key === "x" || e.key === "X") switchTool("erase");
        if (e.key === "a" || e.key === "A") switchTool("building");
        if (e.key === "0") resetView();
        // Layer switching: 1=Campus, 2=Navigation, 3=Accessibility, 4=Emergency, 5=Events
        if (e.key >= "1" && e.key <= "5") {
          const layerByKey: Record<string, EditorLayer> = {
            "1": "campus", "2": "navigation", "3": "accessibility", "4": "emergency", "5": "events",
          };
          switchLayer(layerByKey[e.key]);
        }
        // ? — keyboard shortcut cheat sheet
        if (e.key === "?") {
          e.preventDefault();
          setShowCheatSheet(true);
        }
        // Arrow keys: nudge the selected item (1px, Shift=10px)
        if (selected && (selected.type === "building" || selected.type === "marker")) {
          const step = e.shiftKey ? 10 : 1;
          let dx = 0, dy = 0;
          if (e.key === "ArrowLeft") dx = -step;
          else if (e.key === "ArrowRight") dx = step;
          else if (e.key === "ArrowUp") dy = -step;
          else if (e.key === "ArrowDown") dy = step;
          if (dx || dy) {
            e.preventDefault();
            // Batch rapid nudges into a single undo step
            const now = Date.now();
            const isNewBurst = now - lastNudgeRef.current > 500;
            lastNudgeRef.current = now;
            if (selected.type === "building") {
              const b = buildings.find((x) => x.id === selected.id);
              if (b?.locked) return;
              if (isNewBurst) pushHistory();
              onUpdate({ ...campus, buildings: buildings.map((x) => x.id === selected.id ? { ...x, x: x.x + dx, y: x.y + dy } : x) });
            } else {
              if (isNewBurst) pushHistory();
              onUpdate({ ...campus, markers: markers.map((m) => m.id === selected.id ? { ...m, x: m.x + dx, y: m.y + dy } : m) });
            }
          }
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); runSave(); }
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
  }, [selected, tool, buildings, markers, paths, undoEdit, redoEdit, runSave, pushHistory, campus, onUpdate, switchTool, switchLayer]);

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

  // ── Decorative asset handlers ──
  const handlePlaceDecorAsset = useCallback((asset: CampusDecorAsset) => {
    pushHistory();
    onUpdate({ ...campus, decorAssets: [...decorAssets, asset] });
    toast.success("Asset placed", `Drag to reposition on the canvas.`);
  }, [campus, decorAssets, pushHistory, onUpdate, toast]);

  // If we have multi-selected items, clear single selection for property panel
  const effectiveSelected = multiSelected.length > 0 ? null : selected;
  const selBldg = effectiveSelected?.type === "building" ? buildings.find((b) => b.id === effectiveSelected.id) : undefined;
  const selMkr = effectiveSelected?.type === "marker" ? markers.find((m) => m.id === effectiveSelected.id) : undefined;
  const selDecorAsset = effectiveSelected?.type === "decorAsset" ? (campus.decorAssets ?? []).find((d) => d.id === effectiveSelected.id) : undefined;
  const cursor = rotatingId || decorRotatingId
    ? "grabbing"
    : isSpacePressed()
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

  // ── Tool config for compact palette ──
  const toolConfig: { id: SimpleTool; icon: React.ElementType; label: string; shortcut: string }[] = [
    { id: "select",   icon: MousePointer2, label: "Select",   shortcut: "V" },
    { id: "pan",      icon: Hand,          label: "Pan",      shortcut: "Space" },
    { id: "marker",   icon: MapPin,        label: "Marker",   shortcut: "M" },
    { id: "building", icon: Square,        label: "Build",    shortcut: "B" },
    { id: "path",     icon: GitBranch,     label: "Path",     shortcut: "P" },
    { id: "erase",    icon: Trash2,        label: "Erase",    shortcut: "E" },
  ];

  // ── Validation issues for the bottom issues popover ──
  const validationIssues = useMemo(() => {
    const errs = validateCampus();
    // Add severity to each issue
    return errs.map(e => ({
      ...e,
      severity: (e.type === "overlap" || e.type === "boundary" || e.type === "missing_campus_name" ? "error" :
                 e.type === "missing_name" || e.type === "missing_code" || e.type === "no_floors" ? "warning" :
                 "info") as "error" | "warning" | "info",
    }));
  }, [validateCampus]);

  return (
    <div className="flex flex-col w-full flex-1" style={{ minHeight: 0 }}>
      <div
        ref={editorBodyRef}
        className={`flex flex-col w-full flex-1${shake > 0 ? " animate-shake" : ""}`}
        style={{ minHeight: 0 }}
      >
      {/* ═══════════════════════════════════════════════════════════════════
          TOP BAR: Clean centered tool palette
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="shrink-0 bg-card border-b border-border" style={campus.themeColor ? { borderBottomColor: campus.themeColor, borderBottomWidth: '2px' } : undefined}>
        {/* Row 1: Clean toolbar — balanced left/right with perfectly centered tools */}
        <div className="flex items-center h-10 px-2 gap-0.5">
          {/* ── Left section (flex-1 to balance right section) ── */}
          <div className="flex-1 flex items-center gap-0.5 min-w-0">
            <button onClick={handleBack}
              className="flex items-center justify-center h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0 group"
              title="Back to campus list"
            >
              <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
            </button>
            <span className="text-sm font-extrabold text-foreground truncate max-w-[100px] flex items-center gap-1" style={{ fontFamily: "var(--font-sans)" }}>
              {campus.themeColor && (
                <span className="w-3 h-3 rounded shrink-0 inline-block" style={{ backgroundColor: campus.themeColor }} />
              )}
              {campus.name}
            </span>
            <span className={cn("text-[8px] font-bold px-1 py-0.5 rounded-md border shrink-0 hidden sm:flex items-center gap-1",
              campus.publishStatus === "published"
                ? isDirty
                  ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-400"
                  : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30 text-green-700 dark:text-green-400"
                : campus.publishedAt
                  ? "bg-muted border-border text-muted-foreground"
                  : "bg-slate-50 dark:bg-slate-800/20 border-slate-200 dark:border-slate-700/30 text-slate-500 dark:text-slate-400"
            )}>
              <span className={cn("w-1 h-1 rounded-full shrink-0",
                campus.publishStatus === "published"
                  ? isDirty ? "bg-amber-500" : "bg-green-500"
                  : campus.publishedAt ? "bg-muted-foreground" : "bg-slate-400"
              )} />
              {campus.publishStatus === "published"
                ? isDirty ? "Changes" : "Live"
                : campus.publishedAt ? "Draft" : "New"}
            </span>

            {/* Drawing path indicator */}
            {drawingPath.length > 0 && (
              <div className="flex items-center gap-1 px-1.5 h-5 rounded-md border text-[9px] font-semibold shrink-0"
                style={{ background: "color-mix(in srgb,var(--accent) 10%,transparent)", borderColor: "color-mix(in srgb,var(--accent) 30%,transparent)", color: "var(--accent)" }}>
                {drawingPath.length} pts
                <button onClick={() => setDP([])} className="hover:opacity-70"><X className="h-2 w-2" /></button>
              </div>
            )}
          </div>

          {/* ── Center: Tool palette (main tools, highlighted, perfectly centered) ── */}
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg" style={{ background: "color-mix(in srgb, var(--muted) 30%, transparent)" }}>
              {toolConfig.map((t) => (
                <ToolbarTooltip key={t.id} tool={t.id} isActive={tool === t.id}>
                  <button
                    onClick={() => switchTool(t.id)}
                    className={cn(
                      "flex items-center justify-center h-8 w-8 rounded-md transition-all",
                      tool === t.id
                        ? t.id === "erase"
                          ? "bg-destructive text-destructive-foreground shadow-sm scale-105"
                          : "bg-primary text-primary-foreground shadow-sm scale-105"
                        : t.id === "erase"
                          ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <t.icon className="h-4 w-4" />
                  </button>
                </ToolbarTooltip>
              ))}
            </div>
          </div>

          {/* ── Right section (flex-1 to balance left, with secondary controls) ── */}
          <div className="flex-1 flex items-center justify-end gap-0.5 min-w-0">
            {/* Undo / Redo — disabled at history bounds with step-count tooltips */}
            <div className="flex items-center gap-0.5">
              <button onClick={undoEdit}
                disabled={!canUndo}
                className={cn(
                  "flex items-center justify-center h-7 w-7 rounded-md transition-all",
                  canUndo ? "text-muted-foreground hover:text-foreground hover:bg-muted" : "text-muted-foreground/30 cursor-not-allowed"
                )}
                title={canUndo ? `Undo (Ctrl+Z) — ${undoSteps} step${undoSteps !== 1 ? "s" : ""} available` : "Nothing to undo"}>
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={redoEdit}
                disabled={!canRedo}
                className={cn(
                  "flex items-center justify-center h-7 w-7 rounded-md transition-all",
                  canRedo ? "text-muted-foreground hover:text-foreground hover:bg-muted" : "text-muted-foreground/30 cursor-not-allowed"
                )}
                title={canRedo ? `Redo (Ctrl+Shift+Z) — ${redoSteps} step${redoSteps !== 1 ? "s" : ""} available` : "Nothing to redo"}>
                <Redo2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Snap & zoom controls */}
            <div className="hidden md:flex items-center gap-0.5">
              <div className="w-px h-4 bg-border mx-0.5" />
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
              <div className="w-px h-4 bg-border mx-0.5" />
              <button onClick={zoomIn}
                className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                title="Zoom in">
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <span className="text-[9px] font-mono text-muted-foreground/50 w-8 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
              <button onClick={zoomOut}
                className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                title="Zoom out">
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <button onClick={resetView}
                className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                title="Reset view (0)">
                <Maximize2 className="h-3 w-3" />
              </button>
            </div>

            {onOpenCanvasSettings && (
              <button
                onClick={onOpenCanvasSettings}
                className="hidden md:flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                title="Canvas Settings"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setShowCheatSheet(true)}
              className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              title="Keyboard shortcuts (?)"
              aria-label="Keyboard shortcuts"
            >
              <Keyboard className="h-3.5 w-3.5" />
            </button>

            <div className="flex items-center gap-1 ml-0.5">
              <button
                onClick={runSave}
                disabled={saving || isProcessing || !isDirty}
                className={cn(
                  "flex items-center gap-1 h-7 px-2 rounded-md border text-[9px] font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                  saveBtnError ? "border-destructive text-destructive bg-destructive/10" : isDirty ? "border-primary text-primary bg-primary/10" : "border-border text-foreground hover:bg-muted"
                )}
              >
                {saving ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Saving</>
                ) : (
                  <><Map className="h-3 w-3" /> {isDirty ? "Save" : "Saved"}</>
                )}
              </button>

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
                  !publishingEnabled || isProcessing || isDirty ||
                  (!isDirty && campus.publishStatus === "published" && !hasDraftChanges && campus.updatedAt === campus.publishedAt) ||
                  (!isDirty && campus.publishStatus === "draft" && !campus.publishedAt)
                }
                title={
                  !publishingEnabled
                    ? "Publishing becomes available in A6"
                    : isDirty
                    ? "Save your draft first before publishing"
                    : campus.publishStatus === "published" && !hasDraftChanges && campus.updatedAt === campus.publishedAt
                      ? "Already published — make changes and save to enable publishing"
                      : campus.publishStatus === "draft" && !campus.publishedAt
                        ? "Save as draft first, then publish"
                        : "Publish the current draft to make it live"
                }
                className={cn(
                  "flex items-center gap-1 h-7 px-2 rounded-md text-[9px] font-extrabold transition-all shadow-sm",
                  !publishingEnabled
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : isProcessing
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
          </div>
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
                onClick={() => switchLayer(l.id)}
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
        {/* ── Left: Hierarchy Panel (collapsible) ── */}
        <div className="flex items-stretch">
          <div
            className="transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden shrink-0"
            style={{
              width: hierarchyOpen ? 224 : 0,
              opacity: hierarchyOpen ? 1 : 0,
            }}
          >
            <div className="w-56 h-full">
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
                onSelectBuildingType={(type) => {
                  setSelectedBuildingType(type);
                  setTool("building");
                  toast.info(`Selected: ${type.label}`, "Click the canvas to place.");
                }}
                activeBuildingType={selectedBuildingType?.id}
                onPlaceDecorAsset={handlePlaceDecorAsset}
                decorAssetCount={(campus.decorAssets ?? []).length}
              />
            </div>
          </div>
          {/* Toggle button — thin vertical strip on the canvas edge */}
          <button
            onClick={() => setHierarchyOpen((v) => !v)}
            className="flex items-center justify-center w-5 h-10 my-auto rounded-r-md border border-l-0 border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-all z-20 shrink-0"
            title={hierarchyOpen ? "Collapse panel" : "Show panel"}
          >
            <ChevronLeft className={cn("h-3.5 w-3.5 transition-transform duration-300", hierarchyOpen ? "" : "rotate-180")} />
          </button>
        </div>

        {/* ── SVG Canvas ── */}
        <div className="flex-1 relative flex min-w-0">
        <Canvas
          campus={campus}
          tool={tool}
          layer={layer}
          selected={selected}
          multiSelected={multiSelected}
          rubberBand={rubberBand}
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
          rotatingId={rotatingId}
          rotatingAngle={rotatingAngle}
          resizingId={resizing?.id ?? null}
          onCanvasMove={handleSvgMoveResize}
          onCanvasUp={handleSvgUpResize}
          onCanvasLeave={handleSvgLeave}
          onCanvasDblClick={handleDblClick}
          onItemDown={onItemDown}
          onItemContextMenu={handleContextMenu}
          onResizeStart={handleResizeStart}
          onRotateStart={handleRotateStart}
          onDecorRotateStart={handleDecorRotateStart}
          onDecorResizeStart={handleDecorResizeStart}
          decorRotatingId={decorRotatingId}
          decorResizingId={decorResizingId}
          onBuildingDoubleClick={handleBuildingDoubleClick}
          onPathClick={onPathClick}
          onSelect={setSelected}
          onResetView={resetView}
          onDropAsset={(asset) => {
            pushHistory();
            onUpdate({ ...campus, decorAssets: [...decorAssets, asset] });
            toast.success("Asset placed", `${DECOR_ASSET_MAP[asset.type]?.label || asset.type} dropped on canvas.`);
          }}
          onDropBuilding={(type, x, y) => {
            const bldgType = BUILDING_TYPE_MAP[type];
            if (!bldgType) return;
            const nb: CampusBuilding = {
              id: genId("bld"),
              name: bldgType.label,
              code: bldgType.label.slice(0, 3).toUpperCase(),
              category: bldgType.category,
              description: bldgType.description,
              x: Math.round(Math.max(0, Math.min(cw - bldgType.defaultWidth, x - bldgType.defaultWidth / 2))),
              y: Math.round(Math.max(0, Math.min(ch - bldgType.defaultHeight, y - bldgType.defaultHeight / 2))),
              width: bldgType.defaultWidth,
              height: bldgType.defaultHeight,
              color: bldgType.color,
              expanded: false,
              floors: [{ id: genId("fl"), number: 1, label: "Ground Floor", rooms: [], paths: [] }],
            };
            pushHistory();
            updBuildings([...buildings, nb]);
            setSelected({ type: "building", id: nb.id });
            toast.success("Building placed", `${bldgType.label} dropped on canvas.`);
          }}
          canvasW={cw}
          canvasH={ch}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onSetTool={setTool}
          onToggleSnap={() => setSnapGrid((v) => !v)}
          onWheel={handleWheel}
          highlightedRoute={highlightedRoute}
          animatingPathId={animatingPathId}
        />

        {/* ── Test Navigation panel (Navigation layer) — slides up over the canvas only ── */}
        <AnimatePresence>
          {layer === "navigation" && testNavOpen && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: "spring", stiffness: 350, damping: 32 }}
              className="absolute bottom-0 left-0 right-0 z-40 max-h-[45%] overflow-y-auto scrollbar-show-on-hover"
              style={{ background: "var(--card)", boxShadow: "0 -8px 30px rgba(0,0,0,0.12)" }}
            >
              <TestNavigationPanel
                campus={campus}
                onHighlightRoute={(route) => setHighlightedRoute(route)}
                onFocusNode={(nodeId) => {
                  const n = (campus.navNodes ?? []).find((x) => x.id === nodeId);
                  if (n) zoomToBuilding(n.x - 30, n.y - 30, 60, 60);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
        </div>

        {/* ── Alignment toolbar (multi-select) ── */}
        <AnimatePresence>
          {showAlignTools && selectedOutdoorObjectCount > 1 && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 p-1 rounded-xl border border-border shadow-lg"
              style={{ background: "var(--card)" }}
            >
              {[
                { icon: AlignLeft, label: "Align Left", action: "align-left" },
                { icon: AlignCenter, label: "Align Horizontal Center", action: "align-center-h" },
                { icon: AlignRight, label: "Align Right", action: "align-right" },
                { icon: AlignStartVertical, label: "Align Top", action: "align-top" },
                { icon: AlignVerticalJustifyCenter, label: "Align Vertical Center", action: "align-center-v" },
                { icon: AlignEndVertical, label: "Align Bottom", action: "align-bottom" },
              ].map(({ icon: Icon, label, action }) => (
                <motion.button
                  key={action}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleArrangeSelection(action as OutdoorArrangementAction)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                  title={label}
                  aria-label={label}
                >
                  <Icon className="h-3.5 w-3.5" />
                </motion.button>
              ))}
              {selectedOutdoorObjectCount >= 3 && (
                <>
                  <div className="w-px h-5 bg-border" />
                  {[
                    { icon: AlignHorizontalDistributeCenter, label: "Distribute Horizontally", action: "distribute-h" },
                    { icon: AlignVerticalDistributeCenter, label: "Distribute Vertically", action: "distribute-v" },
                  ].map(({ icon: Icon, label, action }) => (
                    <motion.button
                      key={action}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleArrangeSelection(action as OutdoorArrangementAction)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                      title={label}
                      aria-label={label}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </motion.button>
                  ))}
                </>
              )}
              <div className="w-px h-5 bg-border" />
              <span className="text-[10px] font-mono text-muted-foreground px-1" aria-label={`${selectedOutdoorObjectCount} selected outdoor objects`}>
                {selectedOutdoorObjectCount}
              </span>
              <button
                onClick={() => { setMultiSelected([]); setSelected(null); setShowAlignTools(false); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                title="Clear selection"
                aria-label="Clear selection"
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
          allBuildings={buildings}
          allNavNodes={campus.navNodes ?? []}
          allNavEdges={campus.navEdges ?? []}
          selNavNode={selected?.type === 'navNode' ? (campus.navNodes ?? []).find(n => n.id === selected.id) : undefined}
          selNavEdge={selected?.type === 'navEdge' ? (campus.navEdges ?? []).find(e => e.id === selected.id) : undefined}
          selEventOverlay={selected?.type === 'event' ? (campus.eventOverlays ?? []).find(ev => ev.id === selected.id) : undefined}
          selDecorAsset={selDecorAsset}
          allDecorAssets={campus.decorAssets ?? []}
          onUpdateDecorAsset={onUpdateDecorAsset}
          onDeleteDecorAsset={onDeleteDecorAsset}
          onDuplicateDecorAsset={onDuplicateDecorAsset}
          multiSelected={multiSelected}
          multiSelectedBuildings={buildings.filter(b => multiSelected.includes(b.id))}
          selectedOutdoorCount={selectedOutdoorObjectCount}
          onBatchUpdateBuildings={(ids, changes) => {
            pushHistory();
            updBuildings(buildings.map(b => ids.includes(b.id) ? { ...b, ...changes } : b));
          }}
          onBatchDeleteBuildings={(ids) => {
            pushHistory();
            const next: Campus = {
              ...campus,
              buildings: buildings.filter(b => !ids.includes(b.id)),
              ...(campus.decorAssets !== undefined
                ? { decorAssets: (campus.decorAssets ?? []).filter((d) => !ids.includes(d.id)) }
                : {}),
            };
            onUpdate(next);
            setMultiSelected([]);
            setSelected(null);
          }}
          onClearMultiSelect={() => { setMultiSelected([]); setShowAlignTools(false); }}
          onLayerOrder={handleLayerOrder}
          onUpdateBuilding={onUpdateBuilding}
          onUpdateMarker={onUpdateMarker}
          onUpdateRoute={onUpdateRoute}
          onUpdateNavNode={(id, changes) => {
            pushHistory();
            onUpdate({ ...campus, navNodes: (campus.navNodes ?? []).map(n => n.id === id ? { ...n, ...changes } : n) });
          }}
          onDeleteNavNode={(id) => {
            pushHistory();
            onUpdate({ ...campus, navNodes: (campus.navNodes ?? []).filter(n => n.id !== id) });
            setSelected(null);
          }}
          onUpdateNavEdge={(id, changes) => {
            pushHistory();
            onUpdate({ ...campus, navEdges: (campus.navEdges ?? []).map(e => e.id === id ? { ...e, ...changes } : e) });
          }}
          onDeleteNavEdge={(id) => {
            pushHistory();
            onUpdate({ ...campus, navEdges: (campus.navEdges ?? []).filter(e => e.id !== id) });
            setSelected(null);
          }}
          onUpdateEventOverlay={(id, changes) => {
            pushHistory();
            onUpdate({ ...campus, eventOverlays: (campus.eventOverlays ?? []).map(ev => ev.id === id ? { ...ev, ...changes } : ev) });
          }}
          onDeleteEventOverlay={(id) => {
            pushHistory();
            onUpdate({ ...campus, eventOverlays: (campus.eventOverlays ?? []).filter(ev => ev.id !== id) });
            setSelected(null);
          }}
          onDeleteBuilding={onDeleteBuilding}
          onDeleteMarker={onDeleteMarker}
          onDeleteRoute={onDeleteRoute}
          onClose={() => { setSelected(null); setSelRouteId(null); }}
        />
      </motion.div>
      </AnimatePresence>

      {/* ── Publish confirmation dialog — grouped validation with real issue data ── */}
      <PrePublishDialog
        open={showPublishConfirm}
        campus={campus}
        errors={validationIssues}
        onClose={() => setShowPublishConfirm(false)}
        onPublish={() => {
          setShowPublishConfirm(false);
          setIsProcessing(true);
          onPublish(campus);
        }}
        onReviewIssue={(issue) => {
          // Close the publish gate so the user can fix the issue on the canvas
          setShowPublishConfirm(false);
          handleReviewIssues(issue);
        }}
        isPublishing={isProcessing}
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
          // Discard unsaved changes: restore the last saved snapshot
          if (isDirty) {
            try {
              const saved = JSON.parse(savedSnapshotRef.current) as Campus;
              onUpdate(saved);
            } catch {}
          }
          onBack();
        }}
      />

      {/* Keyboard shortcut cheat sheet (? / toolbar help button) */}
      <ShortcutCheatSheet
        open={showCheatSheet}
        onClose={() => setShowCheatSheet(false)}
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
                <h3 className="text-base font-extrabold text-foreground">Delete {batchDeleteConfirm.buildingIds.length + batchDeleteConfirm.markerIds.length + batchDeleteConfirm.decorAssetIds.length} Items?</h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed max-w-[260px]">
                  {batchDeleteConfirm.buildingIds.length > 0 && (
                    <>{batchDeleteConfirm.buildingIds.length} building{batchDeleteConfirm.buildingIds.length > 1 ? "s" : ""}{batchDeleteConfirm.markerIds.length + batchDeleteConfirm.decorAssetIds.length > 0 ? ", " : ""}</>
                  )}
                  {batchDeleteConfirm.markerIds.length > 0 && (
                    <>{batchDeleteConfirm.markerIds.length} marker{batchDeleteConfirm.markerIds.length > 1 ? "s" : ""}{batchDeleteConfirm.decorAssetIds.length > 0 ? ", " : ""}</>
                  )}
                  {batchDeleteConfirm.decorAssetIds.length > 0 && (
                    <>{batchDeleteConfirm.decorAssetIds.length} decor asset{batchDeleteConfirm.decorAssetIds.length > 1 ? "s" : ""}</>
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
                    const { buildingIds, markerIds, decorAssetIds } = batchDeleteConfirm;
                    upd({
                      buildings: buildings.filter((b) => !buildingIds.includes(b.id)),
                      markers: markers.filter((m) => !markerIds.includes(m.id)),
                      decorAssets: decorAssets.filter((d) => !decorAssetIds.includes(d.id)),
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
                <h3 className="text-base font-extrabold text-foreground">Delete {deleteConfirm.type === "path" ? "Path" : deleteConfirm.type === "marker" ? "Marker" : deleteConfirm.type === "decorAsset" ? "Asset" : "Building"}?</h3>
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
                    if (deleteConfirm.type === "decorAsset") {
                      // Post-state history: exactly one correct undo/redo entry.
                      const next = { ...campus, decorAssets: decorAssets.filter((da) => da.id !== deleteConfirm.id) };
                      onUpdate(next);
                      pushHistory(next);
                    } else {
                      pushHistory();
                      if (deleteConfirm.type === "building") {
                        updBuildings(buildings.filter((b) => b.id !== deleteConfirm.id));
                      } else if (deleteConfirm.type === "marker") {
                        updMarkers(markers.filter((m) => m.id !== deleteConfirm.id));
                      } else {
                        updPaths(paths.filter((p) => p.id !== deleteConfirm.id));
                      }
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
        <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums">{cw} × {ch}</span>

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

        {/* Layer indicator */}
        <div className="flex items-center gap-1" style={{ color: activeLayer.color }}>
          <div className="w-2 h-2 rounded-full" style={{ background: activeLayer.color }} />
          <span className="text-[9px] font-semibold">{activeLayer.label}</span>
        </div>

        {/* Real-time error count — IssuesPopover with hover */}
        {errorCount > 0 ? (
          <IssuesPopover
            issues={validationIssues}
            onIssueClick={(issue) => {
              handleReviewIssues(issue);
            }}
          />
        ) : (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm" style={{ background: "color-mix(in srgb, #22c55e 8%, transparent)" }}>
            <CheckCircle2 className="h-2.5 w-2.5 shrink-0" style={{ color: "#22c55e" }} />
            <span className="text-[9px] font-extrabold" style={{ color: "#22c55e" }}>OK</span>
          </div>
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

        {/* Test Navigation toggle (Navigation layer) */}
        {layer === "navigation" && (
          <button
            onClick={() => setTestNavOpen((v) => !v)}
            className={cn(
              "flex items-center gap-1 transition-colors",
              testNavOpen ? "text-blue-500" : "text-muted-foreground/40 hover:text-muted-foreground"
            )}
            title="Test navigation routes on this campus"
          >
            <Navigation className="h-2.5 w-2.5" />
            <span className="text-[9px] hidden sm:inline">Test Nav</span>
          </button>
        )}

        {/* Help */}
        <button
          onClick={() => setShowCheatSheet(true)}
          className="flex items-center gap-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          title="Keyboard shortcuts (?)"
        >
          <Keyboard className="h-2.5 w-2.5" />
          <span className="text-[9px] hidden sm:inline">Shortcuts</span>
        </button>
      </div>

      {/* Save screen overlay — retry reuses the shared save flow */}
      <SaveScreen
        open={saveScreen.open}
        state={saveScreen.state}
        campusName={campus.name}
        onClose={() => setSaveScreen({ open: false, state: "saving" })}
        onRetry={runSave}
      />

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
