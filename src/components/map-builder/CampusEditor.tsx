import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft, Globe, Map as MapIcon, CheckCircle2, Undo2, Redo2, X,
  AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignEndVertical,
  AlignVerticalJustifyCenter, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
  Grid3X3, Magnet, ZoomIn, ZoomOut, Maximize2, Settings2,
  MousePointer2, Square, MapPin, GitBranch, Trash2, Hand, Keyboard, AlertTriangle,
  Loader2, HelpCircle, ChevronLeft, Navigation, Eye, EyeOff,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useCanvasControls, isSpacePressed } from "./useCanvasControls";
import { Canvas } from "./Canvas";
import { HierarchyPanel } from "./HierarchyPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { RoutesPanel } from "./RoutesPanel";
import { SaveScreen } from "./SaveScreen";
import { LAYERS, LAYER_TOOLS, BUILDING_COLORS } from "./constants";
import { genId } from "./constants";
import { useToast } from "../../hooks/useToast";
import type { ValidationIssue } from "./ValidationErrorsDialog";
import { ContextMenu } from "./ContextMenu";
import { PrePublishDialog } from "./PrePublishDialog";
import { TestNavigationPanel } from "./TestNavigationPanel";
import { ShortcutCheatSheet } from "./ShortcutCheatSheet";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";
import { IssuesPopover } from "./IssuesPopover";
import type {
  Campus, CampusBuilding, CampusMarker, CampusSelection,
  SimpleTool, EditorLayer, RubberBand, CampusRoute, CampusPath,
  CampusDecorAsset, BuildingTypeDescriptor, CampusEntrance, NavigationNode, NavigationEdge, FloorSelection,
} from "./types";
import { BUILDING_TYPE_MAP, DECOR_ASSET_MAP } from "./constants";
import { ToolbarTooltip } from "./ToolbarTooltip";
import { validateCampusData, computeBuildingOverlaps } from "../../lib/campusValidation";
import { computeLiveValidationIssues, validationIssuesForCampusSelection, validationIssuesForBuilding } from "../../lib/liveValidation";
import { validationIssuesToItems } from "./ObjectIssueSection";
import { resolveIssueTarget, issueKey, floorSelectionForTarget, resolveIssueLocateTarget, polylineMidpoint } from "../../lib/issueLocate";
import type { IssueTarget } from "./ValidationErrorsDialog";
import { computeBuildingPlacement, resetTransientToolState, pointInBuilding, polylineCrossesObstacle, polylineCrossesPlacedObject } from "../../lib/editorPlacement";
import { computeGroupTranslation, groupBBoxAfterTranslation, computeGroupAlignmentGuides, snapRectToVisibleBounds } from "../../lib/campusGroupMove";
import {
  createNavNode, createNavEdge, findDuplicateNavEdge, isSelfEdge, removeNavNode, findNavNodeAtPoint,
  findEntranceNavNode, navGraphSelectionIdsInRect, syncEntranceNodePositions, pruneOrphanedEntranceNodes,
  outdoorNavNodes, outdoorNavEdges, findNavEdgeAtPoint, nearestPointOnEdgePolyline,
  translateSelectedNavGraph, navGroupSelectionBounds, applyBulkRoutingAction,
} from "../../lib/navigationGraph";
import type { GroupMoveMember } from "../../lib/campusGroupMove";
import { reorderOutdoorStack } from "../../lib/campusStack";
import type { LayerOrderAction } from "../../lib/campusLayerOrder";
import { duplicateDecorAsset } from "../../lib/decorAsset";
import { decorRenderScale, decorWorldSize } from "../../lib/decorVisual";
import { outdoorGroupSelectionBounds, outdoorSelectionIdsInRect, pathSelectionBounds, selectionRectFromPoints } from "../../lib/campusSelection";
import { arrangeSelectedOutdoorObjects, selectedOutdoorCount, type OutdoorArrangementAction } from "../../lib/campusArrangement";
import { defaultEntrance, normalizeBuildingEntrances, promotePrimaryEntrance, pointerToEntranceAttachment, updateBuildingEntrance, entranceWorldPosition, findEntranceAtPoint, entranceDisplayName } from "../../lib/buildingEntrances";
import { navEdgePolylineDistance, orthogonalBendsFor, translateOrthogonalSegment, translateStraightSegment, normalizeBendPoints, edgePolylinePoints, navAlignSnap } from "../../lib/indoorNavigationGraph";
import {
  doorNodeForEdge,
  entranceIndoorLinkStatus,
  findEntranceTransitionForDoor,
  indoorDoorOptionsForEntrance,
  linkEntranceToIndoorDoor,
  reconcileEntranceTransitions,
  removeEntranceIndoorConnection,
} from "../../lib/entranceTransitions";

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
  campus: { type: "walkway", color: "#94a3b8", width: 10 },
  navigation: { type: "route", color: "#16a34a", width: 4 },
  accessibility: { type: "accessible", color: "#2563eb", width: 3 },
  emergency: { type: "emergency", color: "#dc2626", width: 3 },
  events: { type: "event-path", color: "#d97706", width: 3 },
};

const GROUND_PAINT_TYPES: { value: CampusDecorAsset["groundType"]; label: string }[] = [
  { value: "grass", label: "Grass" },
  { value: "planted", label: "Planted Area" },
  { value: "plaza", label: "Paved / Plaza" },
  { value: "field", label: "Open Field" },
];
const GROUND_BRUSH_SIZES = [1, 2, 3, 5];
const PATH_PAINT_TYPES: { value: CampusPath["type"]; label: string; color: string; defaultWidth: number }[] = [
  { value: "walkway", label: "Walkway", color: "#94a3b8", defaultWidth: 12 },
  { value: "road", label: "Road / Driveway", color: "#cbd5e1", defaultWidth: 22 },
  { value: "accessible", label: "Accessible Path", color: "#10b981", defaultWidth: 14 },
];
type PaintRect = { x: number; y: number; width: number; height: number };
type PathStrokePreview = { points: { x: number; y: number }[]; width: number; type: CampusPath["type"]; color: string; snapKind?: PathSnapTarget["kind"] };
type GroundPatchRect = PaintRect & { asset: CampusDecorAsset };

const pathPaintTypeConfig = (type: CampusPath["type"]) =>
  PATH_PAINT_TYPES.find((cfg) => cfg.value === type) ?? PATH_PAINT_TYPES[0];

/**
 * B5 Phase 6.8: normalize a candidate bend list against the FULL polyline
 * (start → bends → end). A manually pinned corner that ends up collinear with
 * the start/end, a regenerated auto-L corner within a couple units of a pinned
 * one, or a zero-length segment all collapse into clean geometry — one visual
 * corner = one canonical bendPoint. Endpoints are never removed; a legitimate
 * turn is never lost.
 */
const normalizedEdgeBends = (
  start: { x: number; y: number },
  bends: { x: number; y: number }[],
  end: { x: number; y: number }
): { x: number; y: number }[] => {
  const full = normalizeBendPoints([
    { x: Math.round(start.x), y: Math.round(start.y) },
    ...bends.map((bp) => ({ x: Math.round(bp.x), y: Math.round(bp.y) })),
    { x: Math.round(end.x), y: Math.round(end.y) },
  ]);
  return full.length >= 3 ? full.slice(1, -1) : [];
};

const distanceToSegment = (point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
};

/**
 * B5 Phase 6.9 — Floor-parity Connect pin geometry for Outdoor navigation.
 * Mirrors FloorEditor's `navPinGeometryFor` (no walls/doors): the click pins
 * the FULL shape the preview showed — the orthogonal corner resolved from the
 * current anchor PLUS the click point itself (or just the click point on a
 * straight continuation). The click point immediately becomes the new
 * continuation anchor, so the next preview starts from it. The caller applies
 * obstacle validation separately (buildings / solid assets), exactly like the
 * indoor wall check.
 */
const outdoorConnectPinGeometryFor = (
  rawPt: { x: number; y: number },
  last: { x: number; y: number },
  nodes: { x: number; y: number }[],
  bounds: { width: number; height: number }
): { pins: { x: number; y: number }[]; snapped: boolean; guides: { type: "h" | "v"; pos: number }[] } => {
  const align = navAlignSnap(rawPt, nodes, 8);
  const snapPt = { x: align.x, y: align.y };
  const cornerSnap = orthogonalBendsFor(last, snapPt, undefined, undefined, bounds);
  const pinsSnap = cornerSnap.length > 0 ? [...cornerSnap, snapPt] : [snapPt];
  if (align.x === rawPt.x && align.y === rawPt.y) {
    return { pins: pinsSnap, snapped: false, guides: [] };
  }
  return { pins: pinsSnap, snapped: true, guides: align.guides };
};

const simplifyPathStroke = (points: { x: number; y: number }[], tolerance = 8): { x: number; y: number }[] => {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = distanceToSegment(points[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }
  if (maxDistance <= tolerance) return [first, last];
  const left = simplifyPathStroke(points.slice(0, index + 1), tolerance);
  const right = simplifyPathStroke(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
};

const rectsOverlap = (a: PaintRect, b: PaintRect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

const subtractRect = (source: PaintRect, cutter: PaintRect): PaintRect[] => {
  if (!rectsOverlap(source, cutter)) return [source];
  const ix1 = Math.max(source.x, cutter.x);
  const iy1 = Math.max(source.y, cutter.y);
  const ix2 = Math.min(source.x + source.width, cutter.x + cutter.width);
  const iy2 = Math.min(source.y + source.height, cutter.y + cutter.height);
  const pieces: PaintRect[] = [
    { x: source.x, y: source.y, width: source.width, height: iy1 - source.y },
    { x: source.x, y: iy2, width: source.width, height: source.y + source.height - iy2 },
    { x: source.x, y: iy1, width: ix1 - source.x, height: iy2 - iy1 },
    { x: ix2, y: iy1, width: source.x + source.width - ix2, height: iy2 - iy1 },
  ];
  return pieces.filter((piece) => piece.width > 0 && piece.height > 0);
};

const canMergeGroundRects = (a: GroundPatchRect, b: GroundPatchRect) => {
  if ((a.asset.groundType ?? "grass") !== (b.asset.groundType ?? "grass")) return false;
  if ((a.asset.locked ?? false) || (b.asset.locked ?? false)) return false;
  if ((a.asset.visible ?? true) !== (b.asset.visible ?? true)) return false;
  const sameColumns = a.x === b.x && a.width === b.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
  const sameRows = a.y === b.y && a.height === b.height && a.x <= b.x + b.width && b.x <= a.x + a.width;
  return sameColumns || sameRows;
};

const normalizeGroundPaintAssets = (assets: CampusDecorAsset[]): CampusDecorAsset[] => {
  const otherAssets = assets.filter((asset) => asset.type !== "ground-area");
  let groundRects: GroundPatchRect[] = assets
    .filter((asset) => asset.type === "ground-area")
    .map((asset) => {
      const template = DECOR_ASSET_MAP[asset.type];
      const width = Math.max(1, Math.round(asset.width ?? template?.defaultWidth ?? 1));
      const height = Math.max(1, Math.round(asset.height ?? template?.defaultHeight ?? 1));
      return {
        asset,
        x: Math.round(asset.x - width / 2),
        y: Math.round(asset.y - height / 2),
        width,
        height,
      };
    })
    .filter((rect) => rect.width > 0 && rect.height > 0);

  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < groundRects.length; i += 1) {
      for (let j = i + 1; j < groundRects.length; j += 1) {
        const a = groundRects[i];
        const b = groundRects[j];
        if (!canMergeGroundRects(a, b)) continue;
        const x1 = Math.min(a.x, b.x);
        const y1 = Math.min(a.y, b.y);
        const x2 = Math.max(a.x + a.width, b.x + b.width);
        const y2 = Math.max(a.y + a.height, b.y + b.height);
        groundRects.splice(j, 1);
        groundRects[i] = {
          asset: a.asset,
          x: x1,
          y: y1,
          width: x2 - x1,
          height: y2 - y1,
        };
        changed = true;
        break outer;
      }
    }
  }

  const normalizedGround = groundRects.map((rect) => ({
    ...rect.asset,
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }));
  return [...normalizedGround, ...otherAssets];
};

const subtractGroundPaintAssets = (assets: CampusDecorAsset[], cutters: PaintRect[]): CampusDecorAsset[] => {
  if (cutters.length === 0) return assets;
  const next: CampusDecorAsset[] = [];
  for (const asset of assets) {
    if (asset.type !== "ground-area" || asset.locked) {
      next.push(asset);
      continue;
    }
    const template = DECOR_ASSET_MAP[asset.type];
    const width = Math.max(1, Math.round(asset.width ?? template?.defaultWidth ?? 1));
    const height = Math.max(1, Math.round(asset.height ?? template?.defaultHeight ?? 1));
    let pieces: PaintRect[] = [{ x: Math.round(asset.x - width / 2), y: Math.round(asset.y - height / 2), width, height }];
    for (const cutter of cutters) {
      pieces = pieces.flatMap((piece) => subtractRect(piece, cutter));
    }
    pieces.forEach((piece, index) => {
      next.push({
        ...asset,
        id: index === 0 ? asset.id : genId("dec"),
        x: Math.round(piece.x + piece.width / 2),
        y: Math.round(piece.y + piece.height / 2),
        width: Math.round(piece.width),
        height: Math.round(piece.height),
      });
    });
  }
  return normalizeGroundPaintAssets(next);
};

const cleanPathStrokePoints = (points: { x: number; y: number }[], width: number) => {
  const simplified = simplifyPathStroke(points, Math.max(14, width * 0.9))
    .map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) }))
    .filter((point, index, all) => index === 0 || Math.hypot(point.x - all[index - 1].x, point.y - all[index - 1].y) >= 8);
  if (simplified.length <= 1) return simplified;
  return simplified.map((point, index, all) => {
    if (index === 0) return point;
    const prev = all[index - 1];
    const dx = point.x - prev.x;
    const dy = point.y - prev.y;
    if (Math.abs(dy) <= 12) return { x: point.x, y: prev.y };
    if (Math.abs(dx) <= 12) return { x: prev.x, y: point.y };
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (Math.abs(absDx - absDy) <= 10) {
      const d = Math.round((absDx + absDy) / 2);
      return { x: prev.x + Math.sign(dx) * d, y: prev.y + Math.sign(dy) * d };
    }
    return point;
  });
};

/** Normalize an angle in degrees to [0, 360) — never -360/360/720 */
const normalizeDeg = (deg: number) => ((deg % 360) + 360) % 360;
const pointToSegmentDistance = (point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(point.x - px, point.y - py);
};
const closestPointOnSegment = (point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0) return { point: { x: a.x, y: a.y }, t: 0, distance: Math.hypot(point.x - a.x, point.y - a.y) };
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
  const projected = { x: Math.round(a.x + t * dx), y: Math.round(a.y + t * dy) };
  return { point: projected, t, distance: Math.hypot(point.x - projected.x, point.y - projected.y) };
};
const constrainTo45Degrees = (start: { x: number; y: number }, rawEnd: { x: number; y: number }, canvasW: number, canvasH: number) => {
  const dx = rawEnd.x - start.x;
  const dy = rawEnd.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0) return rawEnd;
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return {
    x: Math.max(0, Math.min(canvasW, Math.round(start.x + Math.cos(angle) * length))),
    y: Math.max(0, Math.min(canvasH, Math.round(start.y + Math.sin(angle) * length))),
  };
};
type PathSnapTarget = {
  point: { x: number; y: number };
  distance: number;
  pathId: string;
  kind: "endpoint" | "bend" | "segment";
  pointIndex?: number;
  segmentIndex?: number;
  t?: number;
};

interface CampusEditorProps {
  campus: Campus;
  onBack: () => void;
  onUpdate: (c: Campus) => void;
  onSave?: (c: Campus) => Promise<Campus>;
  onPublish: (c: Campus) => void;
  publishingEnabled?: boolean;
  onOpenFloor: (buildingId: string, floorId: string, initialSelection?: FloorSelection) => void;
  onAddBuilding: () => void;
  onOpenCanvasSettings?: () => void;
  /** Timestamp of the last save (used to sync savedSnapshotRef with external saves) */
  lastSavedAt?: string;
  /**
   * JSON snapshot of the last-saved campus (page-level baseline). The editor
   * unmounts while the Floor Editor is open, so on remount it must compare
   * against the last PERSISTED campus — not the current one — or Floor Editor
   * changes would never enable the outer Save button.
   */
  savedSnapshot?: string;
}

export function CampusEditor({ campus, onBack, onUpdate, onSave, onPublish, publishingEnabled = true, onOpenFloor, onAddBuilding, onOpenCanvasSettings, savedSnapshot }: CampusEditorProps) {
  const campusRef = useRef(campus);
  useEffect(() => { campusRef.current = campus; }, [campus]);
  const [tool, setTool] = useState<SimpleTool>("select");
  const [selected, setSelected] = useState<CampusSelection | null>(null);
  const [drawingPath, setDP] = useState<{ x: number; y: number }[]>([]);
  // ── B5 Phase 1: navigation-layer Path tool = edge authoring. navConnectStart
  // is the node the admin is connecting FROM; navPreview is the live pointer
  // position (or hovered node) shown as a dashed preview before the edge commits.
  const [navConnectStart, setNavConnectStart] = useState<string | null>(null);
  const [navConnectBends, setNavConnectBends] = useState<{ x: number; y: number }[]>([]);
  const [navPreview, setNavPreview] = useState<{ x: number; y: number } | null>(null);
  // ── B5 Phase 6.9: the FULL proposed pin shape for the current pointer (the
  // exact geometry a click would pin) — the preview renders this so what the
  // user sees before clicking is what commits (Floor-parity preview == commit).
  const [navPreviewPins, setNavPreviewPins] = useState<{ x: number; y: number }[]>([]);
  // ── B5 Phase 6.1: edge snap preview for waypoint-on-edge insertion ──
  const [waypointEdgeSnap, setWaypointEdgeSnap] = useState<{ edgeId: string; nearest: { x: number; y: number } } | null>(null);
  // ── B5 Phase 6.2: outdoor Connect blocked preview ──
  const [connectBlocked, setConnectBlocked] = useState(false);
  // ── B5 Phase 1.6: entrance target the Add Waypoint / Connect Path tools are
  // currently hovering (highlighted as a special routing target).
  const [navEntranceHover, setNavEntranceHover] = useState<{ buildingId: string; entranceId: string; x: number; y: number } | null>(null);
  const [saveScreen, setSaveScreen] = useState<{ open: boolean; state: "saving" | "success" | "error" }>({ open: false, state: "saving" });
  const [layer, setLayer] = useState<EditorLayer>("campus");
  // ── Dirty state: snapshot of last-saved campus ──
  // The page supplies the persisted baseline so a remount after editing floors
  // (when this editor is unmounted) still detects the Floor Editor changes.
  // Without the prop we fall back to the current campus (legacy behavior), which
  // silently masks pre-existing floor edits — warn in dev so a forgotten entry
  // point surfaces instead of hiding itself.
  if (!savedSnapshot && import.meta.env.DEV && import.meta.env.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.warn("[CampusEditor] savedSnapshot prop missing — dirty baseline defaults to the current campus.");
  }
  const savedSnapshotRef = useRef<string>(savedSnapshot ?? JSON.stringify(campus));
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
  // ── Unsaved changes guard (back/exit prompts + beforeunload) lives with
  // the shared useUnsavedChangesGuard hook below (defined after runSave).
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
  const [showGroupOutline, setShowGroupOutline] = useState(true);
  const [pathGroupScale, setPathGroupScale] = useState<{
    corner: "nw" | "ne" | "sw" | "se";
    bounds: { x: number; y: number; width: number; height: number };
    starts: { id: string; points: { x: number; y: number }[] }[];
  } | null>(null);
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

  // ── B5 Final: temporary "locate on map" focus flash — pulses the target
  // object after an issue is clicked, then fades automatically. ──
  const [locateFlash, setLocateFlash] = useState<{ selectionType: string; id: string; world: { x: number; y: number } } | null>(null);
  useEffect(() => {
    if (!locateFlash) return;
    const t = window.setTimeout(() => setLocateFlash(null), 2600);
    return () => window.clearTimeout(t);
  }, [locateFlash]);
  // ── Track invalid building IDs for canvas highlighting ──
  const [invalidBuildings, setInvalidBuildings] = useState<Set<string>>(new Set());
  // ── Save button error highlight ──
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
  // B5 Phase 5.13 — Frozen bounds during path-group rotation so the outline
  // doesn't awkwardly resize/reshape during the rotate drag.
  const [pathGroupRotationBounds, setPathGroupRotationBounds] = useState<{ x: number; y: number; width: number; height: number; cx: number; cy: number; angle: number } | null>(null);
  // ── Decor asset rotation state ──
  const decorRotating = useRef<{ id: string; cx: number; cy: number; prevAngle: number; rotation: number } | null>(null);
  const [decorRotatingId, setDecorRotatingId] = useState<string | null>(null);
  // ── Decor asset resize state (uniform scale via corners, rotation-aware) ──
  const decorResizing = useRef<{ id: string; corner: string; sx: number; sy: number; scale: number; hw: number; hh: number; rot: number; width?: number; height?: number; kind?: "ground" | "decor" } | null>(null);
  const [decorResizingId, setDecorResizingId] = useState<string | null>(null);
  // ── Hierarchy panel toggle ──
  const [hierarchyOpen, setHierarchyOpen] = useState(true);
  // ── Test navigation panel (Navigation layer) ──
  const [testNavOpen, setTestNavOpen] = useState(false);
  // ── Route highlighted by the test-navigation panel (drawn on the canvas) ──
  const [highlightedRoute, setHighlightedRoute] = useState<{ waypoints: { x: number; y: number }[]; color: string } | null>(null);
  // ── Keyboard shortcut cheat sheet ──
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [showCampusNavOverlay, setShowCampusNavOverlay] = useState(false);
  const [groundPaintType, setGroundPaintType] = useState<CampusDecorAsset["groundType"]>("grass");
  const [groundBrushSize, setGroundBrushSize] = useState(3);
  const [groundBrushPreview, setGroundBrushPreview] = useState<PaintRect | null>(null);
  const groundPaintGesture = useRef<PaintRect | null>(null);
  const [groundEraseSize, setGroundEraseSize] = useState(1);
  const [groundErasePreview, setGroundErasePreview] = useState<PaintRect | null>(null);
  const groundEraseGesture = useRef<PaintRect[]>([]);
  const [pathPaintType, setPathPaintType] = useState<CampusPath["type"]>("walkway");
  const [pathPaintWidth, setPathPaintWidth] = useState(12);
  const [pathPaintPreview, setPathPaintPreview] = useState<PathStrokePreview | null>(null);
  const pathPaintStroke = useRef<{ points: { x: number; y: number }[]; moved: boolean } | null>(null);
  const pathExtendRef = useRef<{ pathId: string; atStart: boolean } | null>(null);
  const [selectedPathPoint, setSelectedPathPoint] = useState<{ pathId: string; pointIndex: number } | null>(null);
  // ── B5 Phase 5.12 — Canva-style path network editing ──
  // A clicked network member selects the WHOLE network; double-clicking a member
  // enters MEMBER EDIT MODE (individual points/width editable, group intact).
  const [pathMemberEditId, setPathMemberEditId] = useState<string | null>(null);
  // Path-group/network rotation gesture (points are rotated around the group
  // center; ONE history entry on pointer-up; Shift snaps to 15°).
  const pathGroupRotating = useRef<{
    cx: number;
    cy: number;
    prevAngle: number;
    rotation: number;
    starts: { id: string; points: { x: number; y: number }[] }[];
  } | null>(null);

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

  // ── Live validation issues for the toolbar popover + dialogs ──
  // Derived from the CURRENT campus on every render-relevant change (B5 Final:
  // never an accumulated/stale list). This is the SAME canonical derivation the
  // Floor Editor consumes (src/lib/liveValidation.ts), so the global Issues
  // control and each Floor Editor's Issues panel always agree. Deduplicated so
  // repeated validation runs cannot show the same logical issue twice.
  const validationIssues = useMemo(
    () => computeLiveValidationIssues(campus, overlappingBuildings),
    [campus, overlappingBuildings]
  );

  // ── Real-time validation error count (derived from the live issue list) ──
  const errorCount = validationIssues.length;

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

  const { zoom, pan, panning, svgRef, containerRef, getPoint, startPan, movePan, endPan, resetView, zoomIn, zoomOut, zoomToFit, zoomToBuilding, handleMiddleMouseDown, handleWheel } =
    useCanvasControls(cw, ch);

  const SNAP_DIST = 12;
  const snap = useCallback((v: number) => (snapGrid ? Math.round(v / 20) * 20 : Math.round(v)), [snapGrid]);

  /** Edge-snap a building position to nearby buildings (visible AABB aware). */
  const edgeSnapBuilding = useCallback(
    (b: CampusBuilding, all: CampusBuilding[]): CampusBuilding => {
      if (!edgeSnap) return b;
      const refs = all
        .filter((o) => o.id !== b.id)
        .map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height, rotation: o.rotation ?? 0 }));
      const snapped = snapRectToVisibleBounds(
        { x: b.x, y: b.y, width: b.width, height: b.height, rotation: b.rotation ?? 0 },
        refs,
        SNAP_DIST,
      );
      return { ...b, x: snapped.x, y: snapped.y };
    },
    [edgeSnap]
  );
  const dragging = useRef<{
    type: "building" | "marker" | "decorAsset" | "entrance" | "navNode" | "path" | "pathPoint" | "pathWidth" | "navEdgeBend";
    id: string;
    buildingId?: string;
    pointIndex?: number;
    segmentIndex?: number;
    startWidth?: number;
    startDistance?: number;
    handlePoint?: { x: number; y: number };
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    points?: { x: number; y: number }[];
  } | null>(null);
  const dragGroupStartRef = useRef<GroupMoveMember[] | null>(null);
  const pathGroupOriginRef = useRef<Map<string, { x: number; y: number }[]> | null>(null);
  // ── B5 Phase 1.6: rigid nav-node group drag — snapshots the original
  // positions of every multi-selected waypoint at gesture start so dragging
  // one moves the whole selection without distorting internal spacing.
  const navGroupOriginRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  // B5 correction: immutable drag-start snapshot of the selected nav graph's
  // INTERNAL edge bends (edges whose BOTH endpoints are in the moving set).
  // Every mousemove applies the TOTAL delta to these ORIGINALS — never to
  // already-translated geometry — so the group tracks the cursor 1:1 (also
  // under zoom/pan) and its exact shape is preserved (no frame compounding,
  // no bend re-normalization).
  const navGroupEdgeOriginsRef = useRef<Map<string, { x: number; y: number }[]> | null>(null);
  // B5 Phase 6.4: Connect-local redo stack for temporary bends.
  // B5 Phase 6.9: stores CLICK GROUPS (the whole corner+point a single click
  // pinned) so Ctrl+Z/Ctrl+Y move entire clicks — matching Floor Editor.
  const connectRedoStackRef = useRef<{ x: number; y: number }[][]>([]);
  // B5 Phase 6.9: how many pins EACH empty-space click appended (Floor-parity
  // group-based local undo — Ctrl+Z removes the whole click, not one bend).
  const navConnectBendGroupsRef = useRef<number[]>([]);
  // B5 Phase 6.5: outdoor edge segment drag (orthogonal, matches Floor Editor)
  const navSegDragRef = useRef<{
    edgeId: string; segIndex: number; ox: number; oy: number;
    origBends: { x: number; y: number }[]; origPts: { x: number; y: number }[];
    isHorizontal: boolean;
  } | null>(null);
  // B5 Phase 6.8: warn ONCE per segment-drag gesture when the proposed geometry
  // would push the path through a building/solid obstacle.
  const navSegDragWarnedRef = useRef(false);

  const buildings = campus.buildings;
  const markers = campus.markers;
  const paths = campus.paths;
  const decorAssets = campus.decorAssets ?? [];
  const navNodes = campus.navNodes ?? [];
  const navEdges = campus.navEdges ?? [];

  // ── B7 Phase 1: restrained on-canvas issue markers ──
  // ONE small badge per affected CAMPUS object (building, entrance, nav node,
  // nav edge) derived from the SAME canonical issue list as the global Issues
  // control. The worst severity per object wins; warnings stay amber, errors
  // stay red; the badge is pointer-events-none (never intercepts canvas
  // interactions) and disappears immediately when the issue is fixed.
  const campusIssueMarkers = useMemo(() => {
    const markers = new Map<string, { severity: "error" | "warning"; selectionType: string; id: string }>();
    for (const issue of validationIssues) {
      const target = resolveIssueTarget(issue);
      if (!target || target.scope !== "campus") continue;
      if (target.selectionType !== "building" && target.selectionType !== "entrance" && target.selectionType !== "navNode" && target.selectionType !== "navEdge") continue;
      if (issue.severity === "info") continue;
      const key = `${target.selectionType}:${target.id}`;
      const existing = markers.get(key);
      if (!existing || (issue.severity === "error" && existing.severity !== "error")) {
        markers.set(key, { severity: issue.severity, selectionType: target.selectionType, id: target.id });
      }
    }
    return markers;
  }, [validationIssues]);

  // World-space anchor of a campus issue marker (rendered object center).
  const campusMarkerAnchor = useCallback((selectionType: string, id: string): { x: number; y: number } | null => {
    switch (selectionType) {
      case "building": {
        const b = buildings.find((x) => x.id === id);
        return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
      }
      case "entrance": {
        const parent = buildings.find((bldg) => (bldg.entrances ?? []).some((en) => en.id === id));
        const entrance = parent?.entrances?.find((en) => en.id === id);
        if (!parent || !entrance) return null;
        const pos = entranceWorldPosition(parent, entrance);
        return { x: pos.x, y: pos.y };
      }
      case "navNode": {
        const n = navNodes.find((x) => x.id === id);
        return n ? { x: n.x, y: n.y } : null;
      }
      case "navEdge": {
        const e = navEdges.find((x) => x.id === id);
        const a = e ? navNodes.find((n) => n.id === e.startNodeId) : undefined;
        const b = e ? navNodes.find((n) => n.id === e.endNodeId) : undefined;
        if (!e || !a || !b) return null;
        return polylineMidpoint([{ x: a.x, y: a.y }, ...(e.bendPoints ?? []), { x: b.x, y: b.y }]);
      }
      default:
        return null;
    }
  }, [buildings, navNodes, navEdges]);

  // Resolved marker layer (world-space anchors) handed to the Canvas so it
  // renders the badges inside its own SVG/transform — never a second overlay
  // SVG that could drift or be picked up as "the canvas".
  // B7 correction: navNode/navEdge markers are hidden when the editor is in
  // campus/design mode (the nav layer is not visible then). The issue itself
  // remains in the global Issues list — only the on-canvas marker is gated.
  const campusMarkerLayer = useMemo(() => {
    const resolved: { key: string; x: number; y: number; severity: "error" | "warning" }[] = [];
    const navVisible = layer === "navigation";
    for (const { severity, selectionType, id } of campusIssueMarkers.values()) {
      // Hide nav-only markers when the Navigation layer is not active
      if (!navVisible && (selectionType === "navNode" || selectionType === "navEdge")) continue;
      const anchor = campusMarkerAnchor(selectionType, id);
      if (!anchor) continue;
      resolved.push({ key: `${selectionType}:${id}`, x: anchor.x, y: anchor.y, severity });
    }
    return resolved;
  }, [campusIssueMarkers, campusMarkerAnchor, layer]);
  // B5 Phase 2.9 — navigation scope isolation. Indoor floor navigation shares
  // the campus nav arrays (scoped by buildingId+floorId) but belongs ONLY to
  // its floor's editor. The outdoor canvas derives a render/read-only outdoor
  // subset here, so indoor floor nodes/edges NEVER enter the outdoor editor.
  // State mutations (appends/removals/sync) keep using the FULL arrays so the
  // indoor graph is never dropped or rewritten by outdoor edits.
  const outdoorNodes = useMemo(() => outdoorNavNodes(navNodes), [navNodes]);
  const outdoorEdges = useMemo(() => outdoorNavEdges(navEdges, outdoorNodes), [navEdges, outdoorNodes]);
  // B5 Phase 6.10 + placement-reality fix: live invalid-state for outdoor
  // edges blocked by ANY placed object (buildings + every non-background decor
  // asset) — so placing a bench/fountain/flower bed/trash bin/gazebo etc. on a
  // nav line immediately turns that edge red, in the Campus overlay AND the
  // Navigation layer. Recomputed live on every placement/move/delete.
  const outdoorBlockedEdgeIds = useMemo(() => {
    const blocked = new Set<string>();
    for (const e of outdoorEdges) {
      const a = outdoorNodes.find((n) => n.id === e.startNodeId);
      const b = outdoorNodes.find((n) => n.id === e.endNodeId);
      if (!a || !b) continue;
      const pts = [
        { x: a.x, y: a.y },
        ...(e.bendPoints ?? []).map((p) => ({ x: p.x, y: p.y })),
        { x: b.x, y: b.y },
      ];
      if (polylineCrossesPlacedObject(pts, buildings, decorAssets)) blocked.add(e.id);
    }
    return blocked;
  }, [outdoorEdges, outdoorNodes, buildings, decorAssets]);

  const upd = (c: Partial<Campus>) => { pushHistory(); onUpdate({ ...campus, ...c }); };
  // B5 Phase 1.8: any building mutation re-syncs entrance-linked nav nodes so
  // they always match the resolved world position of their linked B3 entrance
  // (no manual navigation repair after a building move/resize/rotate).
  const updBuildings = (b: CampusBuilding[]) => upd({ buildings: b, navNodes: syncEntranceNodePositions(b, navNodes) });
  const updMarkers = (m: CampusMarker[]) => upd({ markers: m });
  const updPaths = (p: typeof paths) => upd({ paths: p });

  const pathAlignmentForSegment = useCallback((start: { x: number; y: number }, rawEnd: { x: number; y: number }) => {
    const dx = rawEnd.x - start.x;
    const dy = rawEnd.y - start.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const guidesList: { type: "h" | "v"; pos: number }[] = [];
    let point = rawEnd;
    if (absDy <= SNAP_DIST) {
      point = { x: rawEnd.x, y: start.y };
      guidesList.push({ type: "h", pos: start.y });
    } else if (absDx <= SNAP_DIST) {
      point = { x: start.x, y: rawEnd.y };
      guidesList.push({ type: "v", pos: start.x });
    } else if (Math.abs(absDx - absDy) <= SNAP_DIST) {
      const d = Math.round((absDx + absDy) / 2);
      point = { x: start.x + Math.sign(dx || 1) * d, y: start.y + Math.sign(dy || 1) * d };
      guidesList.push({ type: "h", pos: point.y }, { type: "v", pos: point.x });
    }
    return { point: { x: Math.max(0, Math.min(cw, Math.round(point.x))), y: Math.max(0, Math.min(ch, Math.round(point.y))) }, guides: guidesList };
  }, [SNAP_DIST, ch, cw]);

  const pathSnapTargetForPoint = useCallback((point: { x: number; y: number }, excludePathId?: string, excludePoint?: { x: number; y: number }): PathSnapTarget | null => {
    let bestPoint: PathSnapTarget | null = null;
    let bestSegment: PathSnapTarget | null = null;
    for (const path of paths) {
      if (path.id === excludePathId || path.visible === false) continue;
      const threshold = Math.max(12, pathPaintWidth / 2 + 8, (path.width ?? 6) / 2 + 8);
      path.points.forEach((candidate, index) => {
        if (excludePoint && candidate.x === excludePoint.x && candidate.y === excludePoint.y) return;
        const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
        if (distance <= threshold && (!bestPoint || distance < bestPoint.distance)) {
          bestPoint = {
            point: { x: candidate.x, y: candidate.y },
            distance,
            pathId: path.id,
            kind: index === 0 || index === path.points.length - 1 ? "endpoint" : "bend",
            pointIndex: index,
          };
        }
      });
      for (let index = 0; index < path.points.length - 1; index += 1) {
        const projection = closestPointOnSegment(point, path.points[index], path.points[index + 1]);
        if (projection.t <= 0.02 || projection.t >= 0.98) continue;
        if (projection.distance <= threshold && (!bestSegment || projection.distance < bestSegment.distance)) {
          bestSegment = {
            point: projection.point,
            distance: projection.distance,
            pathId: path.id,
            kind: "segment",
            segmentIndex: index,
            t: projection.t,
          };
        }
      }
    }
    return bestPoint ?? bestSegment;
  }, [pathPaintWidth, paths]);

  const insertPathJunctionPoint = useCallback((sourcePaths: CampusPath[], target: PathSnapTarget | null) => {
    if (!target || target.kind !== "segment" || target.segmentIndex === undefined) return sourcePaths;
    return sourcePaths.map((path) => {
      if (path.id !== target.pathId) return path;
      const existing = path.points.some((point) => point.x === target.point.x && point.y === target.point.y);
      if (existing) return path;
      return {
        ...path,
        points: [
          ...path.points.slice(0, target.segmentIndex + 1),
          target.point,
          ...path.points.slice(target.segmentIndex + 1),
        ],
      };
    });
  }, []);

  const pathPointKey = (point: { x: number; y: number }) => `${Number(point.x.toFixed(3))}:${Number(point.y.toFixed(3))}`;
  const pathPointIsDisconnected = (path: CampusPath, key: string) => (path.disconnectedJunctionKeys ?? []).includes(key);

  const connectedPathGroups = useMemo(() => {
    const visiblePaths = paths.filter((path) => path.visible !== false);
    const byId = new globalThis.Map(visiblePaths.map((path) => [path.id, path]));
    const adjacency = new globalThis.Map<string, Set<string>>();
    visiblePaths.forEach((path) => adjacency.set(path.id, new Set()));
    const byPoint = new globalThis.Map<string, string[]>();
    const byNetwork = new globalThis.Map<string, string[]>();
    visiblePaths.forEach((path) => {
      path.points.forEach((point) => {
        const key = pathPointKey(point);
        if (pathPointIsDisconnected(path, key)) return;
        byPoint.set(key, [...(byPoint.get(key) ?? []), path.id]);
      });
      if (path.pathNetworkId) byNetwork.set(path.pathNetworkId, [...(byNetwork.get(path.pathNetworkId) ?? []), path.id]);
    });
    [...byPoint.values(), ...byNetwork.values()].forEach((ids) => {
      ids.forEach((id) => ids.forEach((otherId) => {
        if (id !== otherId) adjacency.get(id)?.add(otherId);
      }));
    });
    const groups = new globalThis.Map<string, string[]>();
    const idToGroup = new globalThis.Map<string, string>();
    const visited = new Set<string>();
    for (const path of visiblePaths) {
      if (visited.has(path.id)) continue;
      const stack = [path.id];
      const ids: string[] = [];
      visited.add(path.id);
      while (stack.length > 0) {
        const id = stack.pop()!;
        ids.push(id);
        adjacency.get(id)?.forEach((nextId) => {
          if (!visited.has(nextId) && byId.has(nextId)) {
            visited.add(nextId);
            stack.push(nextId);
          }
        });
      }
      const explicitNetworkId = ids.map((id) => byId.get(id)?.pathNetworkId).find(Boolean);
      const groupId = explicitNetworkId ?? (ids.length > 1 ? `derived:${ids.slice().sort().join("|")}` : path.id);
      groups.set(groupId, ids);
      ids.forEach((id) => idToGroup.set(id, groupId));
    }
    return { groups, idToGroup };
  }, [paths]);

  const pathNetworkIdsForPath = useCallback((pathId: string) => {
    const path = paths.find((candidate) => candidate.id === pathId);
    if (!path?.pathNetworkId) return [pathId];
    return paths.filter((candidate) => candidate.pathNetworkId === path.pathNetworkId).map((candidate) => candidate.id);
  }, [paths]);

  const assignPathNetwork = useCallback((sourcePaths: CampusPath[], ids: string[], requestedId?: string) => {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length < 2) return sourcePaths;
    const existingId = requestedId
      ?? sourcePaths.find((path) => uniqueIds.includes(path.id) && path.pathNetworkId)?.pathNetworkId
      ?? genId("pnet");
    return sourcePaths.map((path) => uniqueIds.includes(path.id) ? { ...path, pathNetworkId: existingId } : path);
  }, []);

  // B5 Phase 5.14 — merge two path networks into ONE when a physical junction
  // is created between paths from different networks (or an ungrouped path joins
  // a network). All members of both networks get the canonical network id.
  const mergePathNetworksForJunction = useCallback((sourcePaths: CampusPath[], pathAId: string, pathBId: string) => {
    const pathA = sourcePaths.find((p) => p.id === pathAId);
    const pathB = sourcePaths.find((p) => p.id === pathBId);
    if (!pathA || !pathB) return sourcePaths;
    const netA = pathA.pathNetworkId;
    const netB = pathB.pathNetworkId;
    if (!netA && !netB) {
      // Neither has a network — create new and assign both
      const newNet = genId("pnet");
      return sourcePaths.map((p) => (p.id === pathAId || p.id === pathBId) ? { ...p, pathNetworkId: newNet } : p);
    }
    if (netA && !netB) {
      // B joins A's network
      return sourcePaths.map((p) => p.id === pathBId ? { ...p, pathNetworkId: netA } : p);
    }
    if (!netA && netB) {
      // A joins B's network
      return sourcePaths.map((p) => p.id === pathAId ? { ...p, pathNetworkId: netB } : p);
    }
    if (netA === netB) return sourcePaths; // already same network
    // Both have different networks — merge into A's network
    return sourcePaths.map((p) => p.pathNetworkId === netB ? { ...p, pathNetworkId: netA } : p);
  }, []);

  const pathPointIsJunction = useCallback((pathId: string, pointIndex: number) => {
    const path = paths.find((p) => p.id === pathId);
    const point = path?.points[pointIndex];
    if (!path || !point) return false;
    const key = pathPointKey(point);
    let count = 0;
    for (const candidatePath of paths) {
      for (let index = 0; index < candidatePath.points.length; index += 1) {
        if (candidatePath.id === pathId && index === pointIndex) continue;
        if (pathPointIsDisconnected(path, key) || pathPointIsDisconnected(candidatePath, key)) continue;
        if (pathPointKey(candidatePath.points[index]) === key) count += 1;
      }
    }
    return count > 0;
  }, [paths]);

  const segmentEndpointForPointer = useCallback((start: { x: number; y: number }, rawPoint: { x: number; y: number }, excludePathId?: string, allowSelfTargets = false, constrain45 = false) => {
    const rawTarget = pathSnapTargetForPoint(rawPoint, allowSelfTargets ? undefined : excludePathId, start);
    if (rawTarget) {
      return {
        point: rawTarget.point,
        guides: [
          { type: "v" as const, pos: rawTarget.point.x },
          { type: "h" as const, pos: rawTarget.point.y },
        ],
        target: rawTarget,
      };
    }
    const aligned = constrain45
      ? { point: constrainTo45Degrees(start, rawPoint, cw, ch), guides: [] as { type: "h" | "v"; pos: number }[] }
      : pathAlignmentForSegment(start, rawPoint);
    const target = pathSnapTargetForPoint(aligned.point, allowSelfTargets ? undefined : excludePathId, start);
    if (!target) return { point: aligned.point, guides: aligned.guides, target: null };
    return {
      point: target.point,
      guides: [
        ...aligned.guides,
        { type: "v" as const, pos: target.point.x },
        { type: "h" as const, pos: target.point.y },
      ],
      target,
    };
  }, [ch, cw, pathAlignmentForSegment, pathSnapTargetForPoint]);

  const groundBrushRectForSize = useCallback((pt: { x: number; y: number }, brushSize: number): PaintRect => {
    const cell = campus.gridSize ?? 20;
    const size = Math.max(1, brushSize) * cell;
    const x = Math.max(0, Math.min(cw - size, Math.round((pt.x - size / 2) / cell) * cell));
    const y = Math.max(0, Math.min(ch - size, Math.round((pt.y - size / 2) / cell) * cell));
    return { x, y, width: size, height: size };
  }, [campus.gridSize, ch, cw]);

  const groundBrushRect = useCallback((pt: { x: number; y: number }): PaintRect => {
    return groundBrushRectForSize(pt, groundBrushSize);
  }, [groundBrushRectForSize, groundBrushSize]);

  const groundEraseRect = useCallback((pt: { x: number; y: number }): PaintRect => {
    return groundBrushRectForSize(pt, groundEraseSize);
  }, [groundBrushRectForSize, groundEraseSize]);

  const mergePaintRects = useCallback((a: PaintRect, b: PaintRect): PaintRect => {
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.width, b.x + b.width);
    const y2 = Math.max(a.y + a.height, b.y + b.height);
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }, []);

  const commitGroundPaintGesture = useCallback(() => {
    const rect = groundPaintGesture.current;
    groundPaintGesture.current = null;
    if (!rect) return;
    const patch: CampusDecorAsset = {
      id: genId("dec"),
      type: "ground-area",
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      groundType: groundPaintType,
      zOrder: -1000,
      visible: true,
      locked: false,
    };
    const next = { ...campus, decorAssets: normalizeGroundPaintAssets([...decorAssets, patch]) };
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "decorAsset", id: patch.id });
    setMultiSelected([]);
    setGroundBrushPreview(null);
    toast.success("Ground painted", `${GROUND_PAINT_TYPES.find((type) => type.value === groundPaintType)?.label ?? "Ground"} patch added.`);
  }, [campus, decorAssets, groundPaintType, onUpdate, toast]);

  const commitGroundEraseGesture = useCallback(() => {
    const cutters = groundEraseGesture.current;
    groundEraseGesture.current = [];
    setGroundErasePreview(null);
    if (cutters.length === 0) return;
    const nextDecorAssets = subtractGroundPaintAssets(decorAssets, cutters);
    if (JSON.stringify(nextDecorAssets) === JSON.stringify(decorAssets)) return;
    const next = { ...campus, decorAssets: nextDecorAssets };
    onUpdate(next);
    pushHistory(next);
    setSelected(null);
    setMultiSelected([]);
    toast.success("Ground erased", "Only unlocked painted terrain inside the eraser footprint was removed.");
  }, [campus, decorAssets, onUpdate, toast]);

  const commitPathPaintStroke = useCallback(() => {
    const stroke = pathPaintStroke.current;
    const extension = pathExtendRef.current;
    pathPaintStroke.current = null;
    pathExtendRef.current = null;
    setPathPaintPreview(null);
    if (!stroke || stroke.points.length < 2 || !stroke.moved) return;
    const start = stroke.points[0];
    const end = stroke.points[stroke.points.length - 1];
    if (!start || !end || (start.x === end.x && start.y === end.y)) return;
    const cfg = pathPaintTypeConfig(pathPaintType);
    if (extension) {
      const targetPath = paths.find((path) => path.id === extension.pathId);
      if (!targetPath) return;
      const snapTarget = pathSnapTargetForPoint(end, undefined, start);
      const finalEnd = snapTarget?.point ?? end;
      if (start.x === finalEnd.x && start.y === finalEnd.y) return;
      const extendedPaths = paths.map((path) => {
        if (path.id !== extension.pathId) return path;
        const nextPoints = extension.atStart
          ? [finalEnd, ...path.points]
          : [...path.points, finalEnd];
        return { ...path, points: nextPoints };
      });
      const adjustedSnapTarget = snapTarget?.kind === "segment" && snapTarget.pathId === extension.pathId && extension.atStart && snapTarget.segmentIndex !== undefined
        ? { ...snapTarget, segmentIndex: snapTarget.segmentIndex + 1 }
        : snapTarget;
      const withJunction = insertPathJunctionPoint(extendedPaths, adjustedSnapTarget);
      // B5 Phase 5.14: use mergePathNetworksForJunction to handle cross-network merging
      const nextPaths = snapTarget?.pathId
        ? mergePathNetworksForJunction(withJunction, extension.pathId, snapTarget.pathId)
        : withJunction;
      const next = { ...campus, paths: nextPaths };
      onUpdate(next);
      pushHistory(next);
      setSelected({ type: "path", id: extension.pathId });
      setMultiSelected([]);
      toast.success("Pathway extended", "One segment added.");
      return;
    }
    const snapTarget = pathSnapTargetForPoint(end);
    const finalEnd = snapTarget?.point ?? end;
    if (start.x === finalEnd.x && start.y === finalEnd.y) return;
    const newPath: CampusPath = {
      id: genId("p"),
      name: pathPaintType === "road" ? "Road" : pathPaintType === "accessible" ? "Accessible Path" : "Walkway",
      points: [start, finalEnd],
      type: pathPaintType,
      color: cfg.color,
      width: pathPaintWidth,
      pathNetworkId: snapTarget?.pathId ? (paths.find((path) => path.id === snapTarget.pathId)?.pathNetworkId ?? genId("pnet")) : undefined,
      visible: true,
      locked: false,
    };
    const withJunction = insertPathJunctionPoint(paths, snapTarget);
    const withNewPath = [...withJunction, newPath];
    // B5 Phase 5.14: use mergePathNetworksForJunction for proper cross-network merging
    const nextPaths = snapTarget?.pathId
      ? mergePathNetworksForJunction(withNewPath, newPath.id, snapTarget.pathId)
      : withNewPath;
    const next = { ...campus, paths: nextPaths };
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "path", id: newPath.id });
    setMultiSelected([]);
    setAnimatingPathId(newPath.id);
    setTimeout(() => setAnimatingPathId((cur) => (cur === newPath.id ? null : cur)), 900);
    toast.success("Pathway created", "2 editable points created.");
  }, [assignPathNetwork, campus, insertPathJunctionPoint, onUpdate, pathPaintType, pathPaintWidth, pathSnapTargetForPoint, paths, toast]);

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
      if (sel.includes(b.id)) members.push({ kind: "building", id: b.id, x: b.x, y: b.y, width: b.width, height: b.height, rotation: b.rotation ?? 0 });
    }
    for (const da of decorAssets) {
      if (!sel.includes(da.id)) continue;
      const t = DECOR_ASSET_MAP[da.type];
      if (!t) continue;
      const size = decorWorldSize(t, da.scale);
      members.push({ kind: "decorAsset", id: da.id, x: da.x, y: da.y, width: size.width, height: size.height });
    }
    for (const path of paths) {
      if (!sel.includes(path.id) || path.locked || path.visible === false) continue;
      const bounds = pathSelectionBounds(path, { includeHidden: true });
      if (bounds) members.push({ kind: "path", id: path.id, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
    }
    return members.length >= 2 ? members : null;
  };

  const selectionForId = useCallback((id: string): CampusSelection | null => {
    if (buildings.some((b) => b.id === id)) return { type: "building", id };
    for (const b of buildings) {
      if ((b.entrances ?? []).some((entrance) => entrance.id === id)) return { type: "entrance", id, buildingId: b.id };
    }
    if (markers.some((m) => m.id === id)) return { type: "marker", id };
    if (decorAssets.some((da) => da.id === id)) return { type: "decorAsset", id };
    if (paths.some((p) => p.id === id)) return { type: "path", id };
    if (outdoorNodes.some((n) => n.id === id)) return { type: "navNode", id };
    if (outdoorEdges.some((e) => e.id === id)) return { type: "navEdge", id };
    return null;
  }, [buildings, markers, decorAssets, paths, outdoorNodes, outdoorEdges]);

  const selectedOutdoorObjectCount = useMemo(
    () => selectedOutdoorCount(buildings, decorAssets, multiSelected, DECOR_ASSET_MAP)
      + paths.filter((path) => multiSelected.includes(path.id)).length,
    [buildings, decorAssets, multiSelected, paths]
  );
  const multiSelectedPaths = useMemo(() => paths.filter((path) => multiSelected.includes(path.id)), [multiSelected, paths]);

  const navAlignmentForPoint = useCallback((point: { x: number; y: number }, excludeId?: string, connectedIds?: Set<string>) => {
    const pathCandidates = paths.flatMap((path) => path.points.map((pathPoint) => ({ id: `${path.id}:${pathPoint.x}:${pathPoint.y}`, x: pathPoint.x, y: pathPoint.y })));
    const candidates = [
      ...outdoorNodes.filter((node) => node.id !== excludeId),
      ...pathCandidates,
    ];
    const result = navAlignSnap(point, candidates, SNAP_DIST, connectedIds);
    return { point: { x: result.x, y: result.y }, guides: result.guides };
  }, [outdoorNodes, paths]);

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
      // B5 Phase 5.12 — clicking empty canvas while editing one path inside its
      // network exits member edit back to the WHOLE-NETWORK selection (no
      // ungrouping, group bounds + rotation stay visible).
      if (pathMemberEditId) {
        setPathMemberEditId(null);
        setSelectedPathPoint(null);
        return;
      }
      // In Navigation mode Select touches only graph elements, but empty-space
      // drags still start a marquee that captures waypoints + connections.
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
      // B5 Phase 1: in the Navigation layer the Marker tool becomes the
      // Waypoint tool — it creates a real NavigationNode (selectable, movable,
      // deletable, undoable) instead of a decorative CampusMarker.
      if (layer === "navigation") {
        // B5 Phase 1.6: clicking a building entrance creates/reuses an
        // entrance-linked waypoint instead of a generic point underneath it.
        const entranceHit = findEntranceAtPoint(buildings, clampedPt);
        if (entranceHit) {
          const existing = findEntranceNavNode(outdoorNodes, entranceHit.buildingId, entranceHit.entranceId);
          if (existing) {
            // B5 Phase 1.8: no duplicate node, no mutation — select the
            // existing entrance-linked waypoint + give clear feedback.
            setSelected({ type: "navNode", id: existing.id });
            setTool("select");
            toast.info("Entrance already connected to the navigation network", "The existing entrance waypoint is selected.");
            return;
          }
          const ee = buildEntranceNode(entranceHit.buildingId, entranceHit.entranceId, entranceHit.x, entranceHit.y);
          if (ee) {
            const next = { ...campus, navNodes: [...navNodes, ee] };
            onUpdate(next); pushHistory(next);
            setSelected({ type: "navNode", id: ee.id });
            setTool("select");
            return;
          }
        }
        // B5 Phase 1.6: outdoor waypoints belong to outdoor navigable space —
        // arbitrary points inside a building footprint are rejected with clear
        // feedback instead of silently creating a node under the roof.
        if (buildings.some((b) => pointInBuilding(b, clampedPt))) {
          toast.warning("Connect through a building entrance", "Outdoor waypoints belong outside buildings — click the building's entrance instead.");
          return;
        }
        const pathSnap = pathSnapTargetForPoint(clampedPt);
        const aligned = pathSnap
          ? { point: pathSnap.point, guides: [{ type: "v" as const, pos: pathSnap.point.x }, { type: "h" as const, pos: pathSnap.point.y }] }
          : navAlignmentForPoint(clampedPt);
        setGuides(aligned.guides);
        const cfg = LAYER_MARKER_CONFIG.navigation;
        const nn = createNavNode({ id: genId("nn"), x: aligned.point.x, y: aligned.point.y, campusId: campus.id, name: "Waypoint", type: "outdoor", color: cfg.color });
        // B5 Phase 6.4: detect edge insertion using RAW cursor position (not aligned)
        const clickNodeMap = Object.fromEntries(outdoorNodes.map((n) => [n.id, { x: n.x, y: n.y }]));
        const clickEdgeHit = findNavEdgeAtPoint(outdoorEdges, clickNodeMap, clampedPt);
        if (clickEdgeHit) {
          const targetEdge = navEdges.find((e) => e.id === clickEdgeHit.edge.id);
          if (targetEdge) {
            const insertPt = clickEdgeHit.nearest;
            const insertNode = createNavNode({ id: nn.id, x: insertPt.x, y: insertPt.y, campusId: campus.id, name: "Waypoint", type: "outdoor", color: cfg.color });
            const splitResult = splitNavEdge(targetEdge, insertNode, navNodes);
            if (splitResult) {
              const nextEdges = navEdges.filter((e) => e.id !== targetEdge.id);
              nextEdges.push(...splitResult.newEdges);
              const next = { ...campus, navNodes: [...navNodes, insertNode], navEdges: nextEdges };
              onUpdate(next);
              pushHistory(next);
              setSelected({ type: "navNode", id: insertNode.id });
              setWaypointEdgeSnap(null);
              setTool("select");
              toast.success("Waypoint inserted", "Edge split into two connections.");
              return;
            }
          }
        }
        const next = { ...campus, navNodes: [...navNodes, nn] };
        onUpdate(next);
        pushHistory(next);
        setSelected({ type: "navNode", id: nn.id });
        setTool("select");
        return;
      }
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
      // B5 Phase 1: in the Navigation layer the Path tool authors edges between
      // waypoints. Clicks on existing waypoints are routed through onItemDown
      // (nodes stop propagation), so THIS branch only receives empty-canvas
      // clicks: first click creates the start waypoint, second click creates a
      // destination waypoint and connects them in ONE history action.
      if (layer === "navigation") {
        // B5 Phase 6.8: NODE TARGET PRIORITY — a canonical waypoint/entrance
        // node under the click ALWAYS wins (start selection or direct commit)
        // over empty-space bend placement, path/edge snaps, alignment guides,
        // and building-body rejection. This also makes destination clicks
        // reliable: the same NAV_NODE_HIT_THRESHOLD the preview snaps to now
        // resolves the node on click, so a click near a node can never fall
        // through to pinning a stray bend beside it.
        const nodeHit = findNavNodeAtPoint(outdoorNodes, clampedPt);
        if (nodeHit) {
          onNavNodeClick(nodeHit.id);
          return;
        }
        // B5 Phase 1.7 ordering fix: entrance targets are checked BEFORE the
        // building-body rejection. Entrances sit exactly on the building edge
        // and pointInBuilding uses inclusive bounds, so a wrong order would
        // reject every entrance click with "Connect through a building
        // entrance". Entrance first, building-body rejection second — the same
        // order the Add Waypoint branch already uses.
        const entranceHit = findEntranceAtPoint(buildings, clampedPt);
        if (!entranceHit && buildings.some((b) => pointInBuilding(b, clampedPt))) {
          toast.warning("Connect through a building entrance", "Outdoor paths run outside buildings — connect to the building's entrance instead.");
          return;
        }
        if (!navConnectStart) {
          if (entranceHit) {
            const startId = ensureEntranceNavNode(entranceHit.buildingId, entranceHit.entranceId, entranceHit.x, entranceHit.y);
            if (!startId) return;
            const start = outdoorNodes.find((n) => n.id === startId);
            setNavConnectStart(startId);
            setNavPreview(start ? { x: start.x, y: start.y } : { x: entranceHit.x, y: entranceHit.y });
            setSelected({ type: "navNode", id: startId });
            return;
          }
          toast.info("Select a starting waypoint or entrance", "Use Waypoint to place a new point first.");
          setNavPreview({ x: clampedPt.x, y: clampedPt.y });
        } else {
          if (entranceHit) {
            // B5 Phase 1.7: route through the canonical entrance-edge helper —
            // it creates/reuses ONE entrance-linked node and commits node+edge
            // in a single history action with correct distance. The previous
            // ensureEntranceNavNode + commitNavEdge sequence read a stale
            // navNodes closure and could commit an edge to a node that was not
            // in the same state snapshot (dangling reference / distance 0).
            commitNavEdgeWithEntrance(navConnectStart, entranceHit.buildingId, entranceHit.entranceId, entranceHit.x, entranceHit.y);
            return;
          }
          // B5 Phase 6.9 (Floor parity): ONE empty-space click pins the FULL
          // segment shape the preview shows — the orthogonal corner resolved
          // from the current anchor/latest bend PLUS the click point itself (or
          // just the click point on a straight continuation). The click point
          // immediately becomes the new continuation anchor, so the NEXT
          // preview starts from it — a click can never drop back onto the
          // source/old diagonal. No NavigationNode is ever created from an
          // empty Connect click.
          pinConnectBend(clampedPt, e.shiftKey);
        }
        return;
      }
      const start = clampedPt;
      const cfg = pathPaintTypeConfig(pathPaintType);
      pathPaintStroke.current = { points: [start], moved: false };
      setPathPaintPreview({ points: [start], width: pathPaintWidth, type: pathPaintType, color: cfg.color });
      setSelected(null);
      setMultiSelected([]);
      e.preventDefault();
    }
  };

  // ── B5 Phase 1: shared navigation-edge authoring helpers ───────────────────
  // One gesture = ONE history action: node+edge pairs commit together through a
  // single upd call, and every surface (node click, empty-canvas click) routes
  // through these so the rules can never diverge.
  const outdoorEdgeDistance = useCallback((startId: string, endId: string, bends: { x: number; y: number }[] = [], nodes: NavigationNode[] = outdoorNodes) => {
    const start = nodes.find((n) => n.id === startId);
    const end = nodes.find((n) => n.id === endId);
    if (!start || !end) return 0;
    const pts = [start, ...bends, end];
    return Math.round(pts.slice(1).reduce((sum, point, index) => {
      const prev = pts[index];
      return sum + Math.hypot(point.x - prev.x, point.y - prev.y);
    }, 0));
  }, [outdoorNodes]);

  // B5 Phase 6.9 (Floor parity): ONE empty-space click during an ACTIVE
  // connection pins the FULL segment shape the preview shows — the orthogonal
  // corner resolved from the current anchor/latest bend PLUS the click point
  // itself (or just the click point on a straight continuation). The click
  // point becomes the new continuation anchor. Recorded as a click GROUP so
  // temporary Ctrl+Z removes the whole click in one step. Obstacle-crossing
  // pins are rejected with a warning (the Connect stays active to reposition).
  const pinConnectBend = (rawPt: { x: number; y: number }, shiftKey: boolean) => {
    const startNode = outdoorNodes.find((n) => n.id === navConnectStart);
    if (!startNode) return;
    const last = navConnectBends.length > 0
      ? navConnectBends[navConnectBends.length - 1]
      : { x: startNode.x, y: startNode.y };
    let target = { x: Math.round(rawPt.x), y: Math.round(rawPt.y) };
    if (shiftKey) {
      // Shift: constrain to horizontal/vertical relative to the current anchor.
      const dx = Math.abs(target.x - last.x);
      const dy = Math.abs(target.y - last.y);
      target = dx >= dy ? { x: target.x, y: last.y } : { x: last.x, y: target.y };
    }
    const geo = outdoorConnectPinGeometryFor(target, last, outdoorNodes, { width: cw, height: ch });
    const pins = geo.pins;
    const lastPin = pins[pins.length - 1];
    if (Math.hypot(lastPin.x - last.x, lastPin.y - last.y) < 2) return; // ignore micro-clicks
    // Every pinned segment is obstacle-validated (buildings + solid assets).
    if (polylineCrossesObstacle([last, ...pins], buildings, decorAssets)) {
      toast.warning("Connection blocked", "The connection crosses a building or obstacle.");
      return;
    }
    if (geo.snapped) setGuides(geo.guides);
    // Dedupe against the previous pin, then record how many points THIS click
    // actually appended so temporary Ctrl+Z removes the whole click at once.
    const out = [...navConnectBends];
    let appended = 0;
    for (const p of pins) {
      const lp = out[out.length - 1];
      if (lp && Math.abs(lp.x - p.x) <= 2 && Math.abs(lp.y - p.y) <= 2) continue;
      out.push(p);
      appended++;
    }
    if (appended === 0) return;
    navConnectBendGroupsRef.current.push(appended);
    setNavConnectBends(out);
    setNavPreview(lastPin);
    setNavPreviewPins([]);
    // B5 Phase 6.4: a new bend invalidates the Connect-local redo stack.
    connectRedoStackRef.current = [];
  };

  const commitNavEdge = useCallback((startId: string, endId: string): boolean => {
    const clearConnect = () => {
      setNavConnectStart(null);
      setNavConnectBends([]);
      setNavPreview(null);
      setNavPreviewPins([]);
      navConnectBendGroupsRef.current = [];
      connectRedoStackRef.current = [];
      setNavEntranceHover(null);
    };
    if (isSelfEdge(startId, endId)) {
      toast.warning("Cannot connect a waypoint to itself", "Pick a different destination waypoint.");
      clearConnect();
      return false;
    }
    // B5 Phase 6.2: reject edges that cross building/obstacle footprints
    const startNode = outdoorNodes.find((n) => n.id === startId);
    const endNode = outdoorNodes.find((n) => n.id === endId);
    if (startNode && endNode) {
      // Compute the full orthogonal polyline for collision check
      const anchor = navConnectBends.length > 0 ? navConnectBends[navConnectBends.length - 1] : { x: startNode.x, y: startNode.y };
      const tail = orthogonalBendsFor(anchor, { x: endNode.x, y: endNode.y }, undefined, undefined);
      const fullBends = [...navConnectBends, ...tail];
      const pts = [
        { x: startNode.x, y: startNode.y },
        ...fullBends,
        { x: endNode.x, y: endNode.y },
      ];
      if (polylineCrossesObstacle(pts, buildings, decorAssets)) {
        toast.warning("Connection blocked", "The connection crosses an obstacle.");
        return false;
      }
    }
    const dup = findDuplicateNavEdge(outdoorEdges, startId, endId);
    if (dup) {
      toast.warning("Those points are already connected", "Select the existing connection to edit it.");
      clearConnect();
      return false;
    }
    // B5 Phase 6.5: generate orthogonal final segment like Floor Editor
    const anchor = navConnectBends.length > 0 ? navConnectBends[navConnectBends.length - 1] : { x: startNode!.x, y: startNode!.y };
    const tail = orthogonalBendsFor(anchor, { x: endNode!.x, y: endNode!.y }, undefined, undefined);
    // B5 Phase 6.8: normalize the FULL polyline — a manually pinned corner that
    // lands on the same line as the regenerated auto-L corner (or the endpoints)
    // collapses into ONE clean bend: no stacked/near-overlapping handles, no
    // micro segments, no redundant collinear points. Simple 90° routes always
    // commit exactly ONE bendPoint.
    const allBends = normalizedEdgeBends(startNode!, [...navConnectBends, ...tail], endNode!);
    const polyline = allBends.length > 0
      ? [{ x: startNode!.x, y: startNode!.y }, ...allBends, { x: endNode!.x, y: endNode!.y }]
      : null;
    const edge = {
      ...createNavEdge({ id: genId("ne"), startNodeId: startId, endNodeId: endId, nodes: outdoorNodes }),
      ...(allBends.length > 0 && polyline ? { bendPoints: allBends, distance: navEdgePolylineDistance(polyline) } : {}),
    };
    const next = { ...campus, navEdges: [...navEdges, edge] };
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "navEdge", id: edge.id });
    clearConnect();
    toast.success("Connection created", `Waypoints connected (${edge.distance} units).`);
    // pushHistory is intentionally omitted from deps: it accepts an explicit
    // post-change state and only touches the stable historyRef, so the first-render
    // closure stays correct (and referencing it here would hit the TDZ since it
    // is declared later in the component body).
    return true;
  }, [campus, navConnectBends, navEdges, outdoorEdgeDistance, outdoorEdges, outdoorNodes, onUpdate, toast]);

  // ── B5 Phase 1.6: entrance-linked waypoint helpers ────────────────────────
  // Outdoor navigation enters buildings through entrances. Clicking an
  // entrance (Add Waypoint or Connect Path) creates/reuses ONE canonical node
  // of type "entrance" linked to that entrance (buildingId + entranceId) at
  // its resolved world position — never a generic point underneath, never a
  // duplicate per click.
  const buildEntranceNode = useCallback((buildingId: string, entranceId: string, x: number, y: number): NavigationNode | null => {
    const parent = buildings.find((b) => b.id === buildingId);
    const entrance = parent?.entrances?.find((en) => en.id === entranceId);
    if (!parent || !entrance) return null;
    return createNavNode({
      id: genId("nn"), x, y, campusId: campus.id,
      buildingId: parent.id, entranceId: entrance.id,
      name: entranceDisplayName(entrance, (parent.entrances ?? []).findIndex((en) => en.id === entrance.id)),
      type: "entrance", accessible: entrance.accessible !== false,
      color: LAYER_MARKER_CONFIG.navigation.color,
    });
  }, [buildings, campus.id]);

  // ── B5 Phase 6.1: edge split for waypoint-on-edge insertion ──
  /** Split an edge A-B by inserting waypoint W at the snapped position. */
  const splitNavEdge = useCallback((
    edge: NavigationEdge,
    waypoint: NavigationNode,
    allNodes: NavigationNode[],
  ): { newEdges: NavigationEdge[] } | null => {
    const nodeMap: Record<string, { x: number; y: number }> = Object.fromEntries(allNodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    const startNode = nodeMap[edge.startNodeId];
    const endNode = nodeMap[edge.endNodeId];
    if (!startNode || !endNode) return null;
    const allPoints = [
      { x: startNode.x, y: startNode.y },
      ...(edge.bendPoints ?? []),
      { x: endNode.x, y: endNode.y },
    ];
    const nearest = nearestPointOnEdgePolyline(edge, nodeMap, { x: waypoint.x, y: waypoint.y });
    if (!nearest) return null;
    // Split at the segment boundary closest to the insertion point
    const splitIdx = nearest.segIndex;
    // Points before the split segment + waypoint position. The split waypoint
    // must be the END of the "before" edge — the previous code sliced
    // [0, splitIdx+1) which DROPPED the waypoint, producing a zero-length
    // A→W edge (distance 0) that rendered stuck on the old diagonal.
    const beforePoints = [...allPoints.slice(0, splitIdx + 1), { x: waypoint.x, y: waypoint.y }];
    // Waypoint position + points after the split segment
    const afterPoints = [{ x: waypoint.x, y: waypoint.y }, ...allPoints.slice(splitIdx + 1)];
    const edgeBendBefore = beforePoints.length > 2 ? beforePoints.slice(1, -1) : [];
    const edgeBendAfter = afterPoints.length > 2 ? afterPoints.slice(1, -1) : [];
    const distBefore = navEdgePolylineDistance(beforePoints);
    const distAfter = navEdgePolylineDistance(afterPoints);
    const edgeBefore: NavigationEdge = {
      ...edge,
      id: genId("ne"),
      startNodeId: edge.startNodeId,
      endNodeId: waypoint.id,
      bendPoints: edgeBendBefore,
      distance: distBefore,
    };
    const edgeAfter: NavigationEdge = {
      ...edge,
      id: genId("ne"),
      startNodeId: waypoint.id,
      endNodeId: edge.endNodeId,
      bendPoints: edgeBendAfter,
      distance: distAfter,
    };
    return { newEdges: [edgeBefore, edgeAfter] };
  }, []);

  /** Reuse an existing entrance node or create one (node creation = one history action). */
  const ensureEntranceNavNode = useCallback((buildingId: string, entranceId: string, x: number, y: number): string | null => {
    const existing = findEntranceNavNode(outdoorNodes, buildingId, entranceId);
    if (existing) return existing.id;
    const nn = buildEntranceNode(buildingId, entranceId, x, y);
    if (!nn) return null;
    const next = { ...campus, navNodes: [...navNodes, nn] };
    onUpdate(next);
    pushHistory(next);
    return nn.id;
  }, [buildEntranceNode, campus, navNodes, outdoorNodes, onUpdate]);

  /** Edge commit where the destination may be a (possibly new) entrance node — ONE history action for node+edge. */
  const commitNavEdgeWithEntrance = useCallback((startId: string, buildingId: string, entranceId: string, x: number, y: number) => {
    const existing = findEntranceNavNode(outdoorNodes, buildingId, entranceId);
    if (existing) {
      commitNavEdge(startId, existing.id);
      return;
    }
    const nn = buildEntranceNode(buildingId, entranceId, x, y);
    if (!nn) return;
    if (isSelfEdge(startId, nn.id)) return;
    // B5 Phase 6.3: reject edges that cross building footprints
    const startNode = outdoorNodes.find((n) => n.id === startId);
    if (startNode) {
      const pts = [
        { x: startNode.x, y: startNode.y },
        ...(navConnectBends.length > 0 ? navConnectBends : []),
        { x: nn.x, y: nn.y },
      ];
      if (polylineCrossesObstacle(pts, buildings, decorAssets)) {
        toast.warning("Connection blocked", "The connection crosses a building footprint.");
        return;
      }
    }
    const dup = findDuplicateNavEdge(outdoorEdges, startId, nn.id);
    if (dup) {
      toast.warning("Those points are already connected", "Select the existing connection to edit it.");
      setNavConnectStart(null);
      setNavConnectBends([]);
      setNavPreview(null);
      setNavPreviewPins([]);
      navConnectBendGroupsRef.current = [];
      connectRedoStackRef.current = [];
      setNavEntranceHover(null);
      return;
    }
    // B5 Phase 6.8: normalize pinned bends for the entrance path too.
    const startNode0 = outdoorNodes.find((n) => n.id === startId);
    const bends = normalizedEdgeBends(startNode0 ?? { x, y }, navConnectBends, nn);
    const nextNodeSet = [...navNodes, nn];
    const edge = {
      ...createNavEdge({ id: genId("ne"), startNodeId: startId, endNodeId: nn.id, nodes: nextNodeSet }),
      ...(bends.length > 0 ? { bendPoints: bends, distance: outdoorEdgeDistance(startId, nn.id, bends, nextNodeSet) } : {}),
    };
    const next = { ...campus, navNodes: nextNodeSet, navEdges: [...navEdges, edge] };
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "navEdge", id: edge.id });
    setNavConnectStart(null);
    setNavConnectBends([]);
    setNavPreview(null);
    setNavPreviewPins([]);
    navConnectBendGroupsRef.current = [];
    connectRedoStackRef.current = [];
    setNavEntranceHover(null);
    toast.success("Connection created", `Connected to ${nn.name} (${edge.distance} units).`);
  }, [buildEntranceNode, campus, commitNavEdge, findDuplicateNavEdge, isSelfEdge, navConnectBends, navEdges, navNodes, onUpdate, outdoorEdgeDistance, outdoorEdges, outdoorNodes, toast]);

  // ── B5 Phase 1.7: shared navigation multi-delete ──
  // ONE history action: remove the selected nodes (with every edge touching
  // them, so no dangling references) plus any selected edges that survive the
  // node cleanup. Used by the keyboard Delete shortcut AND the panel's
  // "Delete Selected" so the behavior can never diverge.
  const deleteNavSelection = useCallback((nodeIds: string[], edgeIds: string[]) => {
    const nodeSet = new Set(nodeIds);
    const edgeSet = new Set(edgeIds);
    const nextNodes = (campus.navNodes ?? []).filter((n) => !nodeSet.has(n.id));
    const nextEdges = (campus.navEdges ?? []).filter(
      (e) => !edgeSet.has(e.id) && !nodeSet.has(e.startNodeId) && !nodeSet.has(e.endNodeId)
    );
    const next: Campus = { ...campus, navNodes: nextNodes, navEdges: nextEdges };
    pushHistory();
    onUpdate(next);
    setMultiSelected([]);
    setSelected(null);
    setShowAlignTools(false);
    const removed = nodeIds.length + edgeIds.length;
    toast.success("Deleted", `Removed ${removed} graph element${removed !== 1 ? "s" : ""}.`);
    // pushHistory intentionally omitted from deps — see commitNavEdge note:
    // it is declared later in the body (TDZ) and only touches the stable
    // historyRef, so the first-render closure stays correct.
  }, [campus, onUpdate, toast]);

  // Path tool clicked an EXISTING waypoint (node clicks stop propagation, so
  // this is the only path into edge authoring from a node).
  const onNavNodeClick = useCallback((nodeId: string) => {
    if (!navConnectStart) {
      const n = outdoorNodes.find((x) => x.id === nodeId);
      setNavConnectStart(nodeId);
      setNavPreview(n ? { x: n.x, y: n.y } : null);
      setNavPreviewPins([]);
      connectRedoStackRef.current = [];
      navConnectBendGroupsRef.current = [];
      setSelected({ type: "navNode", id: nodeId });
      return;
    }
    // B5 Phase 6.9 (Floor parity): the tool returns to Select ONLY on a
    // successful commit — a rejected one (self-edge / obstacle / duplicate)
    // keeps Connect active so the admin can reposition.
    const committed = commitNavEdge(navConnectStart, nodeId);
    if (committed) setTool("select");
  }, [commitNavEdge, navConnectStart, outdoorNodes]);

  const handleSvgMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tool === "pan") {
      movePan(e);
      return;
    }

    const pt = getPoint(e, cw, ch);
    setCursorPos({ x: Math.round(pt.x), y: Math.round(pt.y) });

    if ((tool === "path" && layer !== "navigation") || pathExtendRef.current) {
      const stroke = pathPaintStroke.current;
      const rawPoint = {
        x: Math.max(0, Math.min(cw, Math.round(pt.x))),
        y: Math.max(0, Math.min(ch, Math.round(pt.y))),
      };
      const cfg = pathPaintTypeConfig(pathPaintType);
      if (!stroke) {
        setPathPaintPreview({ points: [rawPoint], width: pathPaintWidth, type: pathPaintType, color: cfg.color });
      } else {
        const start = stroke.points[0];
        const endpoint = segmentEndpointForPointer(start, rawPoint, pathExtendRef.current?.pathId, !!pathExtendRef.current, e.shiftKey);
        stroke.points = [start, endpoint.point];
        stroke.moved = stroke.moved || Math.hypot(endpoint.point.x - start.x, endpoint.point.y - start.y) >= 8;
        setGuides(endpoint.guides);
        setPathPaintPreview({ points: stroke.points, width: pathPaintWidth, type: pathPaintType, color: cfg.color, snapKind: endpoint.target?.kind });
      }
      return;
    }

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

    // B5 Phase 1.6: entrance hover target — Add Waypoint and Connect Path both
    // recognize building entrances as special routing targets. Hovering one
    // highlights it and (for Connect Path) snaps the live preview to the
    // entrance's resolved world position so the click commits an exact point.
    if (layer === "navigation" && (tool === "path" || tool === "marker")) {
      const entranceHit = findEntranceAtPoint(buildings, pt);
      setNavEntranceHover(entranceHit
        ? { buildingId: entranceHit.buildingId, entranceId: entranceHit.entranceId, x: entranceHit.x, y: entranceHit.y }
        : null);
      // Navigation edge-authoring live preview (Path tool, navigation layer).
      // Always follows the pointer — even before the first click — so an
      // empty-space hover shows the would-be waypoint node. Snaps to a hovered
      // waypoint or entrance so the committed coordinate is exact, never an
      // unsnapped pointer coordinate.
      if (tool === "path") {
        const hit = findNavNodeAtPoint(outdoorNodes, pt);
        const aligned = navAlignmentForPoint({ x: Math.max(0, Math.min(cw, Math.round(pt.x))), y: Math.max(0, Math.min(ch, Math.round(pt.y))) });
        setGuides(hit || entranceHit ? [] : aligned.guides);
        if (navConnectStart) {
          // B5 Phase 6.9 (Floor parity): the preview must show EXACTLY what a
          // click would pin/commit — the SAME pin-geometry helper the click
          // uses resolves the proposed shape (alignment-snapped corner + point),
          // so geometry AND validity can never diverge between preview and
          // commit. Node / entrance targets resolve the plain auto-L instead.
          const startNode = outdoorNodes.find((n) => n.id === navConnectStart);
          const anchor = navConnectBends.length > 0
            ? navConnectBends[navConnectBends.length - 1]
            : startNode ? { x: startNode.x, y: startNode.y } : null;
          if (anchor) {
            let proposed: { x: number; y: number }[];
            if (hit) {
              proposed = [...orthogonalBendsFor(anchor, { x: hit.x, y: hit.y }, undefined, undefined), { x: hit.x, y: hit.y }];
            } else if (entranceHit) {
              proposed = [...orthogonalBendsFor(anchor, { x: entranceHit.x, y: entranceHit.y }, undefined, undefined), { x: entranceHit.x, y: entranceHit.y }];
            } else {
              let target = aligned.point;
              // B5 Phase 6.3: Shift H/V constraint for Connect preview
              if (e.shiftKey) {
                const dx = Math.abs(target.x - anchor.x);
                const dy = Math.abs(target.y - anchor.y);
                target = dx >= dy ? { x: target.x, y: anchor.y } : { x: anchor.x, y: target.y };
              }
              proposed = outdoorConnectPinGeometryFor(target, anchor, outdoorNodes, { width: cw, height: ch }).pins;
            }
            setNavPreviewPins(proposed);
            setNavPreview(proposed[proposed.length - 1]);
            // B5 Phase 6.2: detect building/asset collision for Connect preview
            setConnectBlocked(polylineCrossesObstacle([anchor, ...proposed], buildings, decorAssets));
          }
        } else {
          // No source yet: keep the pre-start ghost pointer preview.
          const previewPt = hit
            ? { x: hit.x, y: hit.y }
            : entranceHit
              ? { x: entranceHit.x, y: entranceHit.y }
              : aligned.point;
          setNavPreviewPins([]);
          setNavPreview(previewPt);
          setConnectBlocked(false);
        }
      } else if (tool === "marker") {
        const basePoint = { x: Math.max(0, Math.min(cw, Math.round(pt.x))), y: Math.max(0, Math.min(ch, Math.round(pt.y))) };
        const pathSnap = pathSnapTargetForPoint(basePoint);
        const aligned = pathSnap
          ? { point: pathSnap.point, guides: [{ type: "v" as const, pos: pathSnap.point.x }, { type: "h" as const, pos: pathSnap.point.y }] }
          : navAlignmentForPoint(basePoint);
        setGuides(entranceHit ? [] : aligned.guides);
        // B5 Phase 6.1: detect waypoint-on-edge snap for insertion
        const nodeMap = Object.fromEntries(outdoorNodes.map((n) => [n.id, { x: n.x, y: n.y }]));
        const edgeHit = findNavEdgeAtPoint(outdoorEdges, nodeMap, aligned.point);
        setWaypointEdgeSnap(edgeHit && !entranceHit ? { edgeId: edgeHit.edge.id, nearest: { x: edgeHit.nearest.x, y: edgeHit.nearest.y } } : null);
      }
    } else if (!dragging.current) {
      setGuides([]);
    }

    movePan(e);

    // B5 Phase 6.7: outdoor edge segment drag must be checked BEFORE dragging.current
    // because navSegDragRef is set by onNavEdgeSelect, not by the dragging ref
    if (navSegDragRef.current) {
      const segDrag = navSegDragRef.current;
      const segEdge = navEdges.find((ed) => ed.id === segDrag.edgeId);
      if (!segEdge) { navSegDragRef.current = null; return; }
      const delta = segDrag.isHorizontal
        ? Math.round(pt.y) - segDrag.oy
        : Math.round(pt.x) - segDrag.ox;
      if (delta !== 0) gestureChangedRef.current = true;
      if (delta === 0) return;
      // B5 Phase 6.8: straight (bend-less) edges build a Floor-style U-dog-leg
      // from the immutable drag-start endpoints (A/B stay fixed); bent edges
      // translate the segment as before. Geometry is clamped, then normalized
      // against the full polyline (endpoints fixed) so no redundant corners or
      // micro-segments survive a drag.
      let nextBends: { x: number; y: number }[];
      const a0 = segDrag.origPts[0];
      const b0 = segDrag.origPts[segDrag.origPts.length - 1];
      if (!segEdge.bendPoints || segEdge.bendPoints.length === 0) {
        nextBends = normalizedEdgeBends(
          a0,
          translateStraightSegment(a0, b0, delta, segDrag.isHorizontal)
            .map((bp) => ({ x: Math.max(0, Math.min(cw, Math.round(bp.x))), y: Math.max(0, Math.min(ch, Math.round(bp.y))) })),
          b0
        );
      } else {
        nextBends = normalizedEdgeBends(
          a0,
          translateOrthogonalSegment(segDrag.origPts, segDrag.origBends, segDrag.segIndex, delta, segDrag.isHorizontal)
            .map((bp) => ({ x: Math.max(0, Math.min(cw, Math.round(bp.x))), y: Math.max(0, Math.min(ch, Math.round(bp.y))) })),
          b0
        );
      }
      // B5 Phase 6.8: never push a segment through a building/solid obstacle —
      // skip (one warning per gesture) when the NEW polyline crosses something
      // the ORIGINAL did not (the original is assumed clear at authoring time).
      const candidateEdge = { ...segEdge, bendPoints: nextBends.length > 0 ? nextBends : undefined };
      const candPts = edgePolylinePoints(candidateEdge, outdoorNodes);
      const origPts = edgePolylinePoints(segEdge, outdoorNodes);
      if (candPts && origPts && polylineCrossesObstacle(candPts, buildings, decorAssets) && !polylineCrossesObstacle(origPts, buildings, decorAssets)) {
        if (!navSegDragWarnedRef.current) {
          navSegDragWarnedRef.current = true;
          toast.warning("Connection blocked", "This segment would cross a building or obstacle.");
        }
        return;
      }
      gestureHistoryPushed.current = false;
      onUpdate({
        ...campus,
        navEdges: navEdges.map((ed) => ed.id === segDrag.edgeId
          ? { ...ed, bendPoints: nextBends.length > 0 ? nextBends : undefined, distance: outdoorEdgeDistance(ed.startNodeId, ed.endNodeId, nextBends) }
          : ed),
      });
      return;
    }

    const drag = dragging.current;
    if (!drag) return;

    if (drag.type === "entrance" && drag.buildingId) {
      const parent = buildings.find((b) => b.id === drag.buildingId);
      if (!parent || parent.locked) return;
      const attachment = pointerToEntranceAttachment(parent, pt);
      const nextBuildings = buildings.map((b) =>
        b.id === parent.id
          ? { ...b, entrances: (b.entrances ?? []).map((entrance) => entrance.id === drag.id ? { ...entrance, ...attachment } : entrance) }
          : b
      );
      gestureChangedRef.current = true;
      onUpdate({
        ...campus,
        buildings: nextBuildings,
        // B5 Phase 1.8: repositioning an entrance moves its linked nav node
        // in the SAME gesture — the node follows the resolved entrance position.
        navNodes: syncEntranceNodePositions(nextBuildings, navNodes),
      });
      return;
    }

    // ── Group drag: the whole selected group of buildings + decorative assets
    // moves rigidly as one unit (grid-snapped on the anchor, edge-snapped on the
    // group bbox, clamped to the canvas). Internal spacing is never distorted. ──
    const group = dragGroupStartRef.current;
    if (group) {
      const groupIds = new Set(group.map((m) => m.id));
      const otherBuildings = buildings
        .filter((b) => !groupIds.has(b.id))
        .map((b) => ({ x: b.x, y: b.y, width: b.width, height: b.height, rotation: b.rotation ?? 0 }));
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
        navNodes: syncEntranceNodePositions(nextBuildings, navNodes),
        paths: paths.map((path) => {
          const start = startById.get(path.id);
          const originPoints = pathGroupOriginRef.current?.get(path.id) ?? path.points;
          return start?.kind === "path"
            ? { ...path, points: originPoints.map((point) => ({ x: snap(point.x + dx), y: snap(point.y + dy) })) }
            : path;
        }),
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
    if (drag.type === "path") {
      const dx = pt.x - drag.sx;
      const dy = pt.y - drag.sy;
      const startPoints = drag.points ?? [];
      gestureChangedRef.current = true;
      const selectedPathIds = new Set(multiSelected.filter((id) => paths.some((path) => path.id === id)));
      const externalJunctionKeys = new Set<string>();
      if (selectedPathIds.size <= 1) {
        const movingPath = paths.find((p) => p.id === drag.id);
        movingPath?.points.forEach((point) => {
          const key = pathPointKey(point);
          if (paths.some((candidate) => candidate.id !== drag.id && candidate.points.some((candidatePoint) => pathPointKey(candidatePoint) === key))) {
            externalJunctionKeys.add(key);
          }
        });
      }
      onUpdate({
        ...campus,
        paths: paths.map((p) => p.id === drag.id
          ? { ...p, points: startPoints.map((point) => {
              const nextPoint = { x: snap(point.x + dx), y: snap(point.y + dy) };
              return externalJunctionKeys.has(pathPointKey(point)) ? { x: nextPoint.x + 0.001, y: nextPoint.y } : nextPoint;
            }) }
          : p),
      });
      return;
    }
    if (drag.type === "pathPoint") {
      const path = paths.find((p) => p.id === drag.id);
      if (!path || path.locked) return;
      const rawPoint = { x: Math.max(0, Math.min(cw, snap(pt.x))), y: Math.max(0, Math.min(ch, snap(pt.y))) };
      const neighbors = [
        drag.pointIndex !== undefined ? path.points[drag.pointIndex - 1] : undefined,
        drag.pointIndex !== undefined ? path.points[drag.pointIndex + 1] : undefined,
      ].filter(Boolean) as { x: number; y: number }[];
      const alignedOptions = neighbors.map((neighbor) => e.shiftKey
        ? { point: constrainTo45Degrees(neighbor, rawPoint, cw, ch), guides: [] as { type: "h" | "v"; pos: number }[] }
        : pathAlignmentForSegment(neighbor, rawPoint));
      const aligned = alignedOptions.reduce(
        (best, option) => {
          const dist = Math.hypot(option.point.x - rawPoint.x, option.point.y - rawPoint.y);
          return dist < best.distance ? { point: option.point, guides: option.guides, distance: dist } : best;
        },
        { point: rawPoint, guides: [] as { type: "h" | "v"; pos: number }[], distance: Number.POSITIVE_INFINITY }
      );
      const target = pathSnapTargetForPoint(aligned.point, path.id);
      const nextPoint = target?.point ?? aligned.point;
      setGuides(target
        ? [{ type: "v", pos: target.point.x }, { type: "h", pos: target.point.y }]
        : aligned.guides);
      gestureChangedRef.current = true;
      const oldPoint = drag.pointIndex !== undefined ? path.points[drag.pointIndex] : undefined;
      const oldKey = oldPoint ? pathPointKey(oldPoint) : "";
      const moveLinkedJunction = drag.pointIndex !== undefined && pathPointIsJunction(path.id, drag.pointIndex);
      // B5 Phase 5.14: when snapping to a segment (T-junction), insert the
      // junction point in the target path, and merge networks.
      let nextPaths = paths.map((p) => ({
        ...p,
        points: p.points.map((point, index) => {
          if (moveLinkedJunction && pathPointKey(point) === oldKey) return nextPoint;
          if (p.id === drag.id && index === drag.pointIndex) return nextPoint;
          return point;
        }),
      }));
      if (target?.kind === "segment" && target.pathId && target.segmentIndex !== undefined) {
        // Insert junction point into the target path if not already present
        nextPaths = insertPathJunctionPoint(nextPaths, target);
      }
      if (target?.pathId && target.pathId !== drag.id) {
        // Merge networks between the moved path and the snap target
        nextPaths = mergePathNetworksForJunction(nextPaths, drag.id, target.pathId);
      }
      onUpdate({ ...campus, paths: nextPaths });
      return;
    }
    // B5 Phase 1: waypoint drag — same one-gesture/one-history pattern as
    // markers, clamped to the canvas and grid-snapped.
    if (drag.type === "pathWidth") {
      const path = paths.find((p) => p.id === drag.id);
      const index = drag.segmentIndex ?? 0;
      const a = path?.points[index];
      const b = path?.points[index + 1];
      if (!path || path.locked || !a || !b) return;
      const currentDistance = pointToSegmentDistance(pt, a, b);
      const startDistance = drag.startDistance ?? currentDistance;
      const startWidth = drag.startWidth ?? path.width;
      const nextWidth = Math.max(3, Math.min(32, Math.round(startWidth + (currentDistance - startDistance) * 2)));
      if (nextWidth === path.width) return;
      gestureChangedRef.current = true;
      onUpdate({
        ...campus,
        paths: paths.map((p) => p.id === drag.id ? { ...p, width: nextWidth } : p),
      });
      return;
    }
    if (drag.type === "navEdgeBend") {
      const edge = navEdges.find((ed) => ed.id === drag.id);
      if (!edge || drag.pointIndex === undefined) return;
      const bends = [...(edge.bendPoints ?? [])];
      if (!bends[drag.pointIndex]) return;
      // B5 Phase 6.9: Floor Editor parity — NO grid snap on bend drags. Shift
      // = strict H/V axis constraint; otherwise a near-axis snap tolerance
      // keeps segments exactly horizontal/vertical; then always-on alignment
      // guides to the edge's own endpoints/other bends (never grid-snapped).
      let nx = Math.max(0, Math.min(cw, Math.round(pt.x)));
      let ny = Math.max(0, Math.min(ch, Math.round(pt.y)));
      if (e.shiftKey) {
        const dx = nx - (drag.ox ?? nx);
        const dy = ny - (drag.oy ?? ny);
        if (Math.abs(dx) >= Math.abs(dy)) ny = drag.oy ?? ny;
        else nx = drag.ox ?? nx;
      } else {
        const aNode = outdoorNodes.find((n) => n.id === edge.startNodeId);
        const bNode = outdoorNodes.find((n) => n.id === edge.endNodeId);
        const prev = drag.pointIndex > 0 && bends[drag.pointIndex - 1]
          ? bends[drag.pointIndex - 1]
          : aNode ? { x: aNode.x, y: aNode.y } : null;
        const next = drag.pointIndex < bends.length - 1 && bends[drag.pointIndex + 1]
          ? bends[drag.pointIndex + 1]
          : bNode ? { x: bNode.x, y: bNode.y } : null;
        const tol = 4;
        if (prev) {
          if (Math.abs(nx - prev.x) <= tol) nx = prev.x;
          if (Math.abs(ny - prev.y) <= tol) ny = prev.y;
        }
        if (next) {
          if (Math.abs(nx - next.x) <= tol) nx = next.x;
          if (Math.abs(ny - next.y) <= tol) ny = next.y;
        }
      }
      {
        const aNode = outdoorNodes.find((n) => n.id === edge.startNodeId);
        const bNode = outdoorNodes.find((n) => n.id === edge.endNodeId);
        const others = [
          ...(aNode ? [{ x: aNode.x, y: aNode.y }] : []),
          ...(bNode ? [{ x: bNode.x, y: bNode.y }] : []),
          ...bends.filter((_, i) => i !== drag.pointIndex),
        ];
        const snapAlign = navAlignSnap({ x: nx, y: ny }, others);
        nx = snapAlign.x;
        ny = snapAlign.y;
        setGuides(snapAlign.guides);
      }
      bends[drag.pointIndex] = { x: nx, y: ny };
      gestureChangedRef.current = true;
      onUpdate({
        ...campus,
        navEdges: navEdges.map((ed) => ed.id === edge.id
          ? {
              ...ed,
              bendPoints: normalizeBendPoints(bends),
              distance: outdoorEdgeDistance(ed.startNodeId, ed.endNodeId, bends),
            }
          : ed),
      });
      return;
    }
    if (drag.type === "navNode") {
      const node = outdoorNodes.find((n) => n.id === drag.id);
      if (!node) return;
      // B5 Phase 1.8: entrance-linked nodes are derived geometry — never moved
      // independently (onItemDown already blocks the drag start; this guard
      // also protects stale drags).
      if (node.entranceId) return;
      // B5 Phase 1.6: dragging a waypoint that is part of a multi-selection
      // moves the whole selected node group rigidly (connected edges follow
      // automatically because edge geometry is derived from node positions).
      const navGroup = navGroupOriginRef.current;
      if (navGroup && navGroup.has(drag.id)) {
        // B5 correction: TRUE 1:1 RIGID TRANSLATION. Every frame computes the
        // TOTAL delta from the drag-start world pointer and applies it to the
        // IMMUTABLE snapshot (node origins + internal edge bend origins) —
        // never to already-translated geometry, so nothing compounds, the
        // group stays under the cursor under any zoom/pan, and the selected
        // graph's shape is identical before/after (same vector for every node
        // and every internally-owned bend; no re-orthogonalization).
        // Shift constrains the WHOLE group delta to the dominant axis (one
        // shared vector for every node/bend).
        let rawDx = pt.x - drag.sx;
        let rawDy = pt.y - drag.sy;
        if (e.shiftKey) {
          if (Math.abs(rawDx) >= Math.abs(rawDy)) rawDy = 0;
          else rawDx = 0;
        }
        const dx = Math.round(rawDx);
        const dy = Math.round(rawDy);
        gestureChangedRef.current = true;
        const edgeBendOrigins = navGroupEdgeOriginsRef.current;
        onUpdate({
          ...campus,
          navNodes: navNodes.map((n) => {
            const origin = navGroup.get(n.id);
            return origin
              ? { ...n, x: Math.max(0, Math.min(cw, Math.round(origin.x + dx))), y: Math.max(0, Math.min(ch, Math.round(origin.y + dy))) }
              : n;
          }),
          navEdges: edgeBendOrigins && edgeBendOrigins.size > 0
            ? navEdges.map((e) => {
                const originBends = edgeBendOrigins.get(e.id);
                if (!originBends || originBends.length === 0) return e;
                return { ...e, bendPoints: originBends.map((b) => ({ x: b.x + dx, y: b.y + dy })) };
              })
            : navEdges,
        });
        return;
      }
      // B5 Phase 6.9/6.10: Floor Editor parity — nav node drags are NOT
      // grid-snapped. Plain round + clamp, with always-on alignment guides to
      // other nodes/paths. B5 Phase 6.10: connected-node priority alignment
      // + Shift H/V constraint.
      const rawX = Math.max(0, Math.min(cw, Math.round(drag.ox + (pt.x - drag.sx))));
      const rawY = Math.max(0, Math.min(ch, Math.round(drag.oy + (pt.y - drag.sy))));
      // B5 Phase 6.10: Shift constrains to the dominant axis relative to
      // drag start — cooperate with alignment guides.
      const rawDx = pt.x - drag.sx;
      const rawDy = pt.y - drag.sy;
      const useShift = e.shiftKey;
      let finalX = rawX;
      let finalY = rawY;
      if (useShift) {
        if (Math.abs(rawDx) >= Math.abs(rawDy)) {
          finalY = Math.max(0, Math.min(ch, Math.round(drag.oy)));
        } else {
          finalX = Math.max(0, Math.min(cw, Math.round(drag.ox)));
        }
      }
      // B5 Phase 6.10: connected-node priority — collect IDs of nodes
      // directly connected to the dragged node by any edge.
      const connectedIds = new Set<string>();
      for (const e of navEdges) {
        if (e.type === "floor_transition" || e.type === "entrance_transition") continue;
        if (e.startNodeId === drag.id) connectedIds.add(e.endNodeId);
        if (e.endNodeId === drag.id) connectedIds.add(e.startNodeId);
      }
      const aligned = navAlignmentForPoint({ x: finalX, y: finalY }, drag.id, connectedIds);
      setGuides(aligned.guides);
      gestureChangedRef.current = true;
      onUpdate({
        ...campus,
        navNodes: navNodes.map((n) =>
          n.id === drag.id
            ? { ...n, x: aligned.point.x, y: aligned.point.y }
            : n
        ),
      });
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
      // Snap + guides from the SAME visible-bounds result (rotation-aware):
      // a single alignment pass drives both the snapped position and the
      // guide lines, so the guide always matches the committed position.
      const refsForSnap = buildings
        .filter((o) => o.id !== drag.id)
        .map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height, rotation: o.rotation ?? 0 }));
      const snapResult = snapRectToVisibleBounds(
        { x: targetX, y: targetY, width: b.width, height: b.height, rotation: b.rotation ?? 0 },
        refsForSnap,
        SNAP_DIST,
      );
      const targetB = edgeSnapBuilding({ ...b, x: snapResult.x, y: snapResult.y }, buildings);
      gestureChangedRef.current = true;
      const nextBuildings = buildings.map((bld) => (bld.id === drag.id ? { ...bld, x: targetB.x, y: targetB.y } : bld));
      onUpdate({
        ...campus,
        buildings: nextBuildings,
        navNodes: syncEntranceNodePositions(nextBuildings, navNodes),
      });
      // Alignment guides — same visible-bounds result that drove the snap.
      const guidesList: { type: "h" | "v"; pos: number }[] = snapResult.guides;
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
    // B5 Phase 1.7: campus geometry is context-only in Navigation mode — resize
    // handles are never interactive while authoring the route graph.
    if (layer === "navigation") return;
    const pt = getPoint(e, cw, ch);
    gestureHistoryPushed.current = false;
    setResizing({ id: b.id, corner, sx: pt.x, sy: pt.y, ox: b.x, oy: b.y, ow: b.width, oh: b.height });
  };

  // ── Rotation handler ──
  const handleRotateStart = useCallback((e: React.MouseEvent, b: CampusBuilding) => {
    e.stopPropagation();
    // B5 Phase 1.7: campus geometry is context-only in Navigation mode.
    if (layer === "navigation") return;
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
  }, [getPoint, cw, ch, layer]);

  // ── Decor asset rotation handler ──
  const handleDecorRotateStart = useCallback((e: React.MouseEvent, da: CampusDecorAsset) => {
    e.stopPropagation();
    if (da.locked) return;
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
    if (da.locked) return;
    const template = DECOR_ASSET_MAP[da.type];
    if (!template) return;
    const pt = getPoint(e, cw, ch);
    const s = decorRenderScale(da.scale);
    gestureHistoryPushed.current = false;
    const isGround = da.type === "ground-area";
    decorResizing.current = {
      id: da.id, corner,
      sx: pt.x, sy: pt.y,
      scale: da.scale ?? 1,
      hw: ((isGround ? da.width : undefined) ?? template.defaultWidth * s) / 2,
      hh: ((isGround ? da.height : undefined) ?? template.defaultHeight * s) / 2,
      rot: da.rotation ?? 0,
      width: (isGround ? da.width : undefined) ?? template.defaultWidth * s,
      height: (isGround ? da.height : undefined) ?? template.defaultHeight * s,
      kind: isGround ? "ground" : "decor",
    };
    setDecorResizingId(da.id);
  }, [getPoint, cw, ch]);

  const handleSvgMoveResize = (e: React.MouseEvent) => {
    // ── B5 Phase 5.12 — path-network/group rotation: rotates the actual point
    // geometry around the group center (Shift = 15° snap), one history entry.
    if (pathGroupRotating.current) {
      const pt = getPoint(e, cw, ch);
      const g = pathGroupRotating.current;
      const currentAngle = Math.atan2(pt.y - g.cy, pt.x - g.cx) * (180 / Math.PI);
      let delta = currentAngle - g.prevAngle;
      if (delta > 180) delta -= 360;
      else if (delta < -180) delta += 360;
      const accumulated = g.rotation + delta;
      const angle = e.shiftKey ? Math.round(accumulated / 15) * 15 : accumulated;
      pathGroupRotating.current = { ...pathGroupRotating.current, prevAngle: currentAngle, rotation: accumulated };
      const rad = (angle * Math.PI) / 180;
      const cosR = Math.cos(rad);
      const sinR = Math.sin(rad);
      const starts = new globalThis.Map(g.starts.map((path) => [path.id, path.points]));
      const rotatePt = (point: { x: number; y: number }) => ({
        x: Math.max(0, Math.min(cw, Math.round(g.cx + (point.x - g.cx) * cosR - (point.y - g.cy) * sinR))),
        y: Math.max(0, Math.min(ch, Math.round(g.cy + (point.x - g.cx) * sinR + (point.y - g.cy) * cosR))),
      });
      gestureChangedRef.current = true;
      beginGestureHistory();
      onUpdate({
        ...campus,
        paths: paths.map((path) => starts.has(path.id)
          ? { ...path, points: (starts.get(path.id) ?? path.points).map(rotatePt) }
          : path),
      });
      setRotatingAngle(angle);
      // B5 Phase 5.14: update the rotated frame's angle so Canvas renders
      // the selection outline with SVG transform.
      setPathGroupRotationBounds((prev) => prev ? { ...prev, angle } : null);
      return;
    }
    if (pathGroupScale) {
      const pt = getPoint(e, cw, ch);
      const b = pathGroupScale.bounds;
      const fixedX = pathGroupScale.corner.includes("w") ? b.x + b.width : b.x;
      const fixedY = pathGroupScale.corner.includes("n") ? b.y + b.height : b.y;
      const startHandleX = pathGroupScale.corner.includes("e") ? b.x + b.width : b.x;
      const startHandleY = pathGroupScale.corner.includes("s") ? b.y + b.height : b.y;
      const sx = Math.max(0.1, Math.abs(pt.x - fixedX) / Math.max(1, Math.abs(startHandleX - fixedX)));
      const sy = Math.max(0.1, Math.abs(pt.y - fixedY) / Math.max(1, Math.abs(startHandleY - fixedY)));
      const scalePoint = (point: { x: number; y: number }) => ({
        x: Math.max(0, Math.min(cw, Math.round(fixedX + (point.x - fixedX) * sx))),
        y: Math.max(0, Math.min(ch, Math.round(fixedY + (point.y - fixedY) * sy))),
      });
      const starts = new globalThis.Map(pathGroupScale.starts.map((path) => [path.id, path.points]));
      gestureChangedRef.current = true;
      onUpdate({
        ...campus,
        paths: paths.map((path) => starts.has(path.id)
          ? { ...path, points: (starts.get(path.id) ?? path.points).map(scalePoint) }
          : path),
      });
      return;
    }
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
      if (rs.kind === "ground") {
        const startW = rs.width ?? rs.hw * 2;
        const startH = rs.height ?? rs.hh * 2;
        let nextW = startW;
        let nextH = startH;
        if (rs.corner.includes("e")) nextW = startW + localDx;
        if (rs.corner.includes("w")) nextW = startW - localDx;
        if (rs.corner.includes("s")) nextH = startH + localDy;
        if (rs.corner.includes("n")) nextH = startH - localDy;
        nextW = Math.max(30, Math.min(cw, snap(nextW)));
        nextH = Math.max(24, Math.min(ch, snap(nextH)));
        beginGestureHistory();
        onUpdate({ ...campus, decorAssets: decorAssets.map((d) => (d.id === rs.id ? { ...d, width: nextW, height: nextH, scale: undefined } : d)) });
        return;
      }
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
        const nextBuildings = buildings.map(bld => bld.id === id ? { ...bld, rotation: snapped } : bld);
        beginGestureHistory();
        onUpdate({
          ...campus,
          buildings: nextBuildings,
          // B5 Phase 1.8: rotating a building moves its entrances → the linked
          // nav nodes follow in the same gesture.
          navNodes: syncEntranceNodePositions(nextBuildings, navNodes),
        });
        setRotatingAngle(snapped);
      }
      return;
    }
    if (!resizing) { handleSvgMove(e); return; }
    const pt = getPoint(e, cw, ch);
    const ddx = pt.x - resizing.sx;
    const ddy = pt.y - resizing.sy;
    const nextBuildings = buildings.map((b) => {
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
    });
    beginGestureHistory();
    onUpdate({
      ...campus,
      buildings: nextBuildings,
      // B5 Phase 1.8: resizing a building moves its entrances → the linked nav
      // nodes follow in the same gesture.
      navNodes: syncEntranceNodePositions(nextBuildings, navNodes),
    });
  };

  const handleSvgUpResize = () => {
    if (pathGroupScale) {
      if (gestureChangedRef.current) pushHistory();
      gestureChangedRef.current = false;
      setPathGroupScale(null);
      return;
    }
    // Finalize path-network/group rotation (one beginGestureHistory snapshot
    // was pushed on the first move — pointer-up adds nothing more).
    if (pathGroupRotating.current) {
      gestureHistoryPushed.current = false;
      pathGroupRotating.current = null;
      setPathGroupRotationBounds(null);
      setRotatingAngle(0);
      return;
    }
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
    // B5 Phase 6.5: finalize outdoor edge segment drag — one undo entry
    if (navSegDragRef.current) {
      if (gestureChangedRef.current) pushHistory();
      gestureChangedRef.current = false;
      gestureHistoryPushed.current = false;
      navSegDragRef.current = null;
    }
    // Commit exactly ONE post-gesture undo snapshot for item drags (single or
    // group) so undo restores the pre-gesture state and redo re-applies the
    // complete gesture. The pre-gesture state is still the previous history
    // tip, so a drag adds exactly one new entry — never one per object/move.
    const dragCommitted = gestureChangedRef.current;
    endPan();
    dragging.current = null;
    dragGroupStartRef.current = null;
    navGroupOriginRef.current = null;
    navGroupEdgeOriginsRef.current = null;
    if (resizing) setResizing(null);

    if (groundPaintGesture.current) {
      commitGroundPaintGesture();
      gestureChangedRef.current = false;
      gestureHistoryPushed.current = false;
      return;
    }

    if (groundEraseGesture.current.length > 0) {
      commitGroundEraseGesture();
      gestureChangedRef.current = false;
      gestureHistoryPushed.current = false;
      return;
    }

    if (pathPaintStroke.current) {
      commitPathPaintStroke();
      gestureChangedRef.current = false;
      gestureHistoryPushed.current = false;
      return;
    }

    // Finalize rubber-band selection
    if (rubberBand) {
      const rect = selectionRectFromPoints(rubberBand.sx, rubberBand.sy, rubberBand.cx, rubberBand.cy);
      const rw = rect.width;
      const rh = rect.height;
      if (rw > 5 || rh > 5) {
        // Only capture if dragged more than 5px (avoid accidental clicks).
        // In Navigation mode the marquee selects graph elements (nodes whose
        // center falls in the band + edges whose segment crosses it); campus
        // geometry is never captured. Elsewhere buildings + decorative assets
        // share one selectable-bounds helper (rotated AABB, rendered size).
        const captured = layer === "navigation"
          ? (() => {
              // B5 Phase 2.9: the marquee captures ONLY outdoor-scope graph
              // elements — indoor floor nodes/edges can never be rubber-band
              // selected from the outdoor editor.
              const { nodeIds, edgeIds } = navGraphSelectionIdsInRect(rect, outdoorNodes, outdoorEdges);
              return [...nodeIds, ...edgeIds];
            })()
          : outdoorSelectionIdsInRect(rect, buildings, decorAssets, DECOR_ASSET_MAP, paths, { includeHidden: true });
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
  const handleSvgUp = () => { endPan(); dragging.current = null; dragGroupStartRef.current = null; pathGroupOriginRef.current = null; navGroupOriginRef.current = null; navGroupEdgeOriginsRef.current = null; pathGroupRotating.current = null; setPathGroupRotationBounds(null); setPathGroupScale(null); setRotatingAngle(0); setGuides([]); gestureHistoryPushed.current = false; };

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
    pathGroupOriginRef.current = null;
    navGroupOriginRef.current = null;
    navGroupEdgeOriginsRef.current = null;
    navSegDragRef.current = null;
    pathGroupRotating.current = null;
    setPathGroupRotationBounds(null);
    setPathGroupScale(null);
    if (resizing) setResizing(null);
    if (rotating.current) { rotating.current = null; setRotatingId(null); setRotatingAngle(0); }
    if (decorRotating.current) { decorRotating.current = null; setDecorRotatingId(null); setRotatingAngle(0); }
    if (decorResizing.current) { decorResizing.current = null; setDecorResizingId(null); }
    setBuildingDrag(null);
    setRubberBand(null);
    groundPaintGesture.current = null;
    groundEraseGesture.current = [];
    pathPaintStroke.current = null;
    pathExtendRef.current = null;
    setGroundBrushPreview(null);
    setGroundErasePreview(null);
    setPathPaintPreview(null);
    setGuides([]);
    setNavEntranceHover(null);
    setWaypointEdgeSnap(null);
    setConnectBlocked(false);
    gestureHistoryPushed.current = false;
  };

  // ── Tool switching — clears stale drawing/preview state so switching tools
  // never leaves an unfinished path preview, building drag, or rubber band ──
  const switchTool = useCallback((t: SimpleTool) => {
    const reset = resetTransientToolState();
    setTool(t);
    setDP(reset.drawingPath);
    setNavConnectStart(null);
    setNavConnectBends([]);
    setNavPreview(null);
    setNavPreviewPins([]);
    navConnectBendGroupsRef.current = [];
    connectRedoStackRef.current = [];
    setNavEntranceHover(null);
    navGroupOriginRef.current = null;
    navGroupEdgeOriginsRef.current = null;
    pathGroupOriginRef.current = null;
    pathGroupRotating.current = null;
    setPathGroupRotationBounds(null);
    groundPaintGesture.current = null;
    groundEraseGesture.current = [];
    pathPaintStroke.current = null;
    pathExtendRef.current = null;
    setGroundBrushPreview(null);
    setGroundErasePreview(null);
    setPathPaintPreview(null);
    setBuildingDrag(reset.buildingDrag);
    setRubberBand(reset.rubberBand);
    setGuides(reset.guides);
    if (t !== "building") setSelectedBuildingType(null);
    if (t !== "select") { setPathMemberEditId(null); setSelectedPathPoint(null); }
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
    setPathMemberEditId(null);
    setSelectedPathPoint(null);
    setDP(reset.drawingPath);
    setNavConnectStart(null);
    setNavConnectBends([]);
    setNavPreview(null);
    setNavPreviewPins([]);
    navConnectBendGroupsRef.current = [];
    connectRedoStackRef.current = [];
    setNavEntranceHover(null);
    navGroupOriginRef.current = null;
    navGroupEdgeOriginsRef.current = null;
    pathGroupOriginRef.current = null;
    pathGroupRotating.current = null;
    setPathGroupRotationBounds(null);
    groundPaintGesture.current = null;
    groundEraseGesture.current = [];
    pathPaintStroke.current = null;
    pathExtendRef.current = null;
    setGroundBrushPreview(null);
    setGroundErasePreview(null);
    setPathPaintPreview(null);
    setBuildingDrag(reset.buildingDrag);
    setRubberBand(reset.rubberBand);
    setGuides(reset.guides);
    setSelectedBuildingType(reset.selectedBuildingType);
    setHighlightedRoute(null);
  }, []);

  const handleDblClick = () => {
    if (tool === "path" && layer !== "navigation" && drawingPath.length >= 2) {
      const cfg = LAYER_PATH_CONFIG[layer] ?? LAYER_PATH_CONFIG.campus;
      const start = drawingPath[0];
      const end = drawingPath[drawingPath.length - 1];
      // Check both endpoints for snap targets to auto-inherit network membership
      const endSnap = pathSnapTargetForPoint(end);
      const startSnap = !endSnap ? pathSnapTargetForPoint(start) : null;
      const snapTarget = endSnap ?? startSnap;
      const networkId = snapTarget?.pathId ? (paths.find((p) => p.id === snapTarget.pathId)?.pathNetworkId ?? genId("pnet")) : undefined;
      const newPath: CampusPath = {
        id: genId("p"),
        name: cfg.type === "road" ? "Road" : cfg.type === "accessible" ? "Accessible Path" : "Walkway",
        points: drawingPath,
        type: cfg.type,
        color: cfg.color,
        width: cfg.width,
        pathNetworkId: networkId,
        visible: true,
        locked: false,
      };
      const withJunction = insertPathJunctionPoint(paths, snapTarget);
      const withNewPath = [...withJunction, newPath];
      // B5 Phase 5.14: use mergePathNetworksForJunction for proper cross-network merging
      const nextPaths = snapTarget?.pathId
        ? mergePathNetworksForJunction(withNewPath, newPath.id, snapTarget.pathId)
        : withNewPath;
      updPaths(nextPaths);
      setDP([]); setTool("select");
      // Play the draw-in animation for the just-completed path
      setAnimatingPathId(newPath.id);
      setTimeout(() => setAnimatingPathId((cur) => (cur === newPath.id ? null : cur)), 900);
      toast.success("Pathway created", `${drawingPath.length} point${drawingPath.length !== 1 ? "s" : ""} drawn.`);
    }
  };

  const handleBuildingDoubleClick = useCallback((id: string) => {
    // Navigation mode treats campus geometry as context only — double-click
    // rename stays on the Campus layer.
    if (layer === "navigation") return;
    const b = buildings.find((x) => x.id === id);
    if (!b) return;
    setSelected({ type: "building", id });
    setRenameDialog({ id, name: b.name });
    setRenameValue(b.name);
  }, [buildings, layer]);

  // ── B5 correction: immutable drag-start snapshot for nav graph groups ──
  // Captures the ORIGINAL free-node positions plus the ORIGINAL bendPoints of
  // every INTERNAL edge (both endpoints in the moving set). The drag handler
  // applies one total delta to these originals every frame — the group tracks
  // the cursor 1:1 and keeps its exact shape.
  const snapshotNavGroup = useCallback((ids: string[]) => {
    const freeNodes = navNodes.filter((n) => ids.includes(n.id) && !n.entranceId);
    navGroupOriginRef.current = freeNodes.length >= 2
      ? new globalThis.Map(freeNodes.map((n) => [n.id, { x: n.x, y: n.y }]))
      : null;
    const movingIds = new Set(freeNodes.map((n) => n.id));
    navGroupEdgeOriginsRef.current = movingIds.size >= 2
      ? new globalThis.Map(
          navEdges
            .filter((e) => movingIds.has(e.startNodeId) && movingIds.has(e.endNodeId))
            .map((e) => [e.id, (e.bendPoints ?? []).map((b) => ({ x: b.x, y: b.y }))])
        )
      : null;
  }, [navEdges, navNodes]);

  const onItemDown = (e: React.MouseEvent, type: "building" | "marker" | "decorAsset" | "navNode", id: string, ox: number, oy: number) => {
    e.stopPropagation();
    // Spacebar held: pan instead of interacting with items
    if (isSpacePressed()) {
      startPan(e);
      return;
    }
    // B5 Phase 1: navigation-layer Path tool connects waypoints by clicking
    // them — node clicks never reach handleSvgDown (they stop propagation).
    if (tool === "path" && layer === "navigation" && type === "navNode") {
      onNavNodeClick(id);
      return;
    }
    // B5 Phase 1.6: in the Navigation layer, clicking a building BODY with the
    // Waypoint or Connect Path tools is rejected with clear feedback — outdoor
    // waypoints belong outside buildings; routes enter through entrances.
    if (layer === "navigation" && (tool === "marker" || tool === "path") && type === "building") {
      toast.warning("Connect through a building entrance", "Outdoor waypoints belong outside buildings — click the building's entrance instead.");
      return;
    }
    if (tool === "erase") {
      // In Navigation mode the Remove tool only touches graph elements — campus
      // geometry is protected from accidental deletion while authoring routes.
      if (layer === "navigation" && type !== "navNode") return;
      if (type === "navNode") {
        // Waypoint erase: deterministic connected-edge cleanup + clear feedback
        // (never leaves dangling edge references).
        const node = navNodes.find((n) => n.id === id);
        if (!node) return;
        const connected = navEdges.filter((e) => e.startNodeId === id || e.endNodeId === id).length;
        const next = removeNavNode(navNodes, navEdges, id);
        const nextCampus = { ...campus, navNodes: next.nodes, navEdges: next.edges };
        onUpdate(nextCampus);
        pushHistory(nextCampus);
        setSelected(null);
        toast.success("Waypoint deleted", connected > 0 ? `Removed ${connected} connected connection${connected !== 1 ? "s" : ""}.` : undefined);
        return;
      }
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
    // In the Navigation layer, Select interacts ONLY with graph elements —
    // campus geometry stays visible as context but is never selected or
    // dragged while the admin is building routes.
    // B5 Phase 6.2: entrances are selectable in Navigation mode (read-only)
    if (tool === "select" && layer === "navigation" && type !== "navNode" && type !== "entrance") return;
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
      // B5 Phase 1.8: an entrance-linked node can never be the drag anchor —
      // selection is kept but the gesture is not armed (no mutation/history).
      if (type === "navNode" && navNodes.find((n) => n.id === id)?.entranceId) {
        toast.info("Entrance waypoints follow their building entrance", "Move the building or its entrance to reposition it.");
        return;
      }
      const pt = getPoint(e, cw, ch);
      gestureHistoryPushed.current = false;
      gestureChangedRef.current = false;
      dragging.current = { type, id, sx: pt.x, sy: pt.y, ox, oy };
      dragGroupStartRef.current = buildDragGroup({ type, id }, multiSelected);
      pathGroupOriginRef.current = dragGroupStartRef.current?.some((member) => member.kind === "path")
        ? new globalThis.Map(paths.filter((path) => multiSelected.includes(path.id)).map((path) => [path.id, structuredClone(path.points)]))
        : null;
      // B5 Phase 1.6: waypoint multi-selection drags as one rigid group.
      // B5 correction: capture ONE immutable snapshot (free node origins +
      // internal edge bend origins) so every frame computes from originals.
      if (type === "navNode") {
        snapshotNavGroup(multiSelected);
      }
      return;
    }
    setMultiSelected([]);
    setShowAlignTools(false);
    setSelected({ type, id });
    setGuides([]);
    // B5 Phase 1.8: an entrance-linked node is selectable/inspectable/connectable
    // but never independently draggable — it follows its building entrance.
    if (type === "navNode" && navNodes.find((n) => n.id === id)?.entranceId) {
      toast.info("Entrance waypoints follow their building entrance", "Move the building or its entrance to reposition it.");
      return;
    }
    // B5 Phase 6.2: entrance is selectable in Navigation mode but not draggable
    if (layer === "navigation" && type === "entrance") {
      toast.info("Entrance navigation info", "Building entrances cannot be moved in Navigation mode.");
      return;
    }
    const pt = getPoint(e, cw, ch);
    gestureHistoryPushed.current = false;
    gestureChangedRef.current = false;
    dragging.current = { type, id, sx: pt.x, sy: pt.y, ox, oy };
    dragGroupStartRef.current = null;
    pathGroupOriginRef.current = null;
  };

  const onGroupSurfaceDown = useCallback((e: React.MouseEvent) => {
    if (tool !== "select" || e.shiftKey || multiSelected.length < 2) return;
    const pt = getPoint(e, cw, ch);

    // ── B5 correction: Navigation layer — the multi-selected nav graph
    // group's outline interior is a REAL drag surface. Pointerdown on empty
    // space INSIDE the group bounds starts the SAME rigid group drag as
    // grabbing a member waypoint (identical snapshot pipeline — only the
    // pointerdown origin differs). It must NOT clear selection / rubber-band.
    if (layer === "navigation") {
      const freeIds = multiSelected.filter((id) => {
        const n = navNodes.find((x) => x.id === id);
        return Boolean(n && !n.entranceId);
      });
      if (freeIds.length < 2) return;
      const anchor = navNodes.find((n) => n.id === freeIds[0]);
      if (!anchor) return;
      e.stopPropagation();
      e.preventDefault();
      setSelected({ type: "navNode", id: anchor.id });
      setShowAlignTools(false);
      setSelectedPathPoint(null);
      setPathMemberEditId(null);
      setGuides([]);
      gestureHistoryPushed.current = false;
      gestureChangedRef.current = false;
      dragging.current = { type: "navNode", id: anchor.id, sx: pt.x, sy: pt.y, ox: anchor.x, oy: anchor.y };
      snapshotNavGroup(freeIds);
      return;
    }

    const anchorId = multiSelected.find((id) => {
      const building = buildings.find((b) => b.id === id);
      if (building) return !building.locked;
      const path = paths.find((p) => p.id === id);
      if (path) return !path.locked;
      return decorAssets.some((asset) => asset.id === id);
    });
    if (!anchorId) return;
    const anchorSelection = selectionForId(anchorId);
    if (!anchorSelection || (anchorSelection.type !== "building" && anchorSelection.type !== "decorAsset" && anchorSelection.type !== "path")) return;
    const group = buildDragGroup({ type: anchorSelection.type, id: anchorId }, multiSelected);
    if (!group) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(null);
    setShowAlignTools(true);
    setGuides([]);
    gestureHistoryPushed.current = false;
    gestureChangedRef.current = false;
    dragging.current = { type: anchorSelection.type, id: anchorId, sx: pt.x, sy: pt.y, ox: pt.x, oy: pt.y };
    dragGroupStartRef.current = group;
    pathGroupOriginRef.current = group.some((member) => member.kind === "path")
      ? new globalThis.Map(paths.filter((path) => multiSelected.includes(path.id)).map((path) => [path.id, structuredClone(path.points)]))
      : null;
    navGroupOriginRef.current = null;
    navGroupEdgeOriginsRef.current = null;
  }, [buildings, cw, ch, decorAssets, getPoint, layer, multiSelected, navEdges, navNodes, paths, selectionForId, snapshotNavGroup, tool]);

  const onPathGroupScaleStart = useCallback((e: React.MouseEvent, corner: "nw" | "ne" | "sw" | "se", bounds: { x: number; y: number; width: number; height: number }) => {
    if (layer === "navigation" || tool !== "select" || multiSelectedPaths.length < 2) return;
    e.stopPropagation();
    e.preventDefault();
    gestureChangedRef.current = false;
    gestureHistoryPushed.current = false;
    setPathGroupScale({
      corner,
      bounds,
      starts: multiSelectedPaths.map((path) => ({ id: path.id, points: structuredClone(path.points) })),
    });
  }, [layer, multiSelectedPaths, tool]);

  // B5 Phase 5.12 — Path Network / path-only group rotation. The gesture rotates
  // all selected pathway POINT GEOMETRY around the group center (persisted as
  // resulting coordinates, never an SVG transform) with ONE history entry on
  // pointer-up; Shift snaps to 15° increments.
  const onPathGroupRotateStart = useCallback((e: React.MouseEvent, center: { x: number; y: number }) => {
    if (layer === "navigation" || tool !== "select" || multiSelectedPaths.length < 2) return;
    e.stopPropagation();
    e.preventDefault();
    const pt = getPoint(e, cw, ch);
    gestureChangedRef.current = false;
    gestureHistoryPushed.current = false;
    pathGroupRotating.current = {
      cx: center.x,
      cy: center.y,
      prevAngle: Math.atan2(pt.y - center.y, pt.x - center.x) * (180 / Math.PI),
      rotation: 0,
      starts: multiSelectedPaths.map((path) => ({ id: path.id, points: structuredClone(path.points) })),
    };
    // B5 Phase 5.13 — Freeze the group outline at its pre-rotation bounds so
    // the dashed outline doesn't awkwardly resize/reshape during rotation.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const path of multiSelectedPaths) {
      for (const pt of path.points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }
    }
    if (minX < Infinity) {
      setPathGroupRotationBounds({ x: minX, y: minY, width: maxX - minX, height: maxY - minY, cx: center.x, cy: center.y, angle: 0 });
    }
    setRotatingAngle(0);
  }, [cw, ch, getPoint, layer, multiSelectedPaths, tool]);

  const onEntranceDown = (e: React.MouseEvent, buildingId: string, entranceId: string, ox: number, oy: number) => {
    e.stopPropagation();
    const parent = buildings.find((b) => b.id === buildingId);
    if (!parent) return;
    // B5 Phase 1.6: in the Navigation layer an entrance is a routing TARGET —
    // Add Waypoint and Connect Path both create/reuse the entrance-linked node
    // instead of selecting/dragging the entrance geometry.
    if (layer === "navigation" && (tool === "marker" || tool === "path")) {
      const pos = entranceWorldPosition(parent, parent.entrances?.find((en) => en.id === entranceId) ?? { edge: "bottom", offset: 0.5 });
      if (tool === "marker") {
        const existing = findEntranceNavNode(navNodes, buildingId, entranceId);
        if (existing) {
          // B5 Phase 1.8: no duplicate node, no mutation — select the existing
          // entrance-linked waypoint + give clear feedback.
          setSelected({ type: "navNode", id: existing.id });
          setTool("select");
          toast.info("Entrance already connected to the navigation network", "The existing entrance waypoint is selected.");
          return;
        }
        const ee = buildEntranceNode(buildingId, entranceId, pos.x, pos.y);
        if (ee) {
          const next = { ...campus, navNodes: [...navNodes, ee] };
          onUpdate(next); pushHistory(next);
          setSelected({ type: "navNode", id: ee.id });
          setTool("select");
        }
        return;
      }
      // Connect Path tool on an entrance.
      const entranceNodeId = findEntranceNavNode(navNodes, buildingId, entranceId)?.id;
      if (!navConnectStart) {
        const startId = entranceNodeId ?? ensureEntranceNavNode(buildingId, entranceId, pos.x, pos.y);
        if (!startId) return;
        const start = navNodes.find((n) => n.id === startId);
        setNavConnectStart(startId);
        setNavPreview(start ? { x: start.x, y: start.y } : { x: pos.x, y: pos.y });
        setSelected({ type: "navNode", id: startId });
      } else if (entranceNodeId) {
        commitNavEdge(navConnectStart, entranceNodeId);
      } else {
        commitNavEdgeWithEntrance(navConnectStart, buildingId, entranceId, pos.x, pos.y);
      }
      return;
    }
    // B5 Phase 1.7: in Navigation mode an entrance is CONTEXT-ONLY unless the
    // admin is explicitly targeting it with Add Waypoint / Connect Path (handled
    // above). Select tool in Navigation mode selects the entrance (read-only).
    if (layer === "navigation") {
      if (tool === "select") {
        setSelected({ type: "entrance", id: entranceId, buildingId });
        setMultiSelected([]);
        setShowAlignTools(false);
      }
      return;
    }
    setMultiSelected([]);
    setShowAlignTools(false);
    setSelected({ type: "entrance", id: entranceId, buildingId });
    setGuides([]);
    if (parent.locked) {
      return;
    }
    if (tool === "erase") {
      onDeleteEntrance(buildingId, entranceId);
      return;
    }
    if (tool !== "select") return;
    const pt = getPoint(e, cw, ch);
    gestureHistoryPushed.current = false;
    gestureChangedRef.current = false;
    dragging.current = { type: "entrance", id: entranceId, buildingId, sx: pt.x, sy: pt.y, ox, oy };
    dragGroupStartRef.current = null;
  };



  const onUpdateBuilding = (id: string, changes: Partial<CampusBuilding>) => {
    updBuildings(buildings.map((b) => (b.id === id ? { ...b, ...changes } : b)));
  };

  const onAddEntrance = (buildingId: string) => {
    const currentCampus = campusRef.current;
    const currentBuildings = currentCampus.buildings;
    const parent = currentBuildings.find((b) => b.id === buildingId);
    if (!parent || parent.locked) return;
    const entrance = defaultEntrance(parent, genId("ent"));
    const next: Campus = {
      ...currentCampus,
      buildings: currentBuildings.map((b) => b.id === buildingId ? { ...b, entrances: [...(b.entrances ?? []), entrance] } : b),
    };
    campusRef.current = next;
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "entrance", id: entrance.id, buildingId });
    toast.success("Entrance added", "Drag it along the building perimeter to reposition it.");
  };

  const onSelectEntrance = (buildingId: string, entranceId: string) => {
    setMultiSelected([]);
    setShowAlignTools(false);
    setSelected({ type: "entrance", id: entranceId, buildingId });
    setGuides([]);
  };

  const onUpdateEntrance = (buildingId: string, entranceId: string, changes: Partial<CampusEntrance>) => {
    const currentCampus = campusRef.current;
    const currentBuildings = currentCampus.buildings;
    const parent = currentBuildings.find((b) => b.id === buildingId);
    if (!parent || parent.locked) return;
    let changed = false;
    const nextBuildings = currentBuildings.map((b) => {
      if (b.id !== buildingId) return b;
      const result = updateBuildingEntrance(b, entranceId, changes);
      changed = result.changed;
      return result.building;
    });
    if (!changed) return;
    // B5 Phase 1.8: an entrance reposition/update moves its linked nav node in
    // the SAME mutation — the node follows the resolved entrance position.
    const next: Campus = reconcileEntranceTransitions({
      ...currentCampus,
      buildings: nextBuildings,
      navNodes: syncEntranceNodePositions(nextBuildings, currentCampus.navNodes ?? []),
    });
    campusRef.current = next;
    onUpdate(next);
    pushHistory(next);
  };

  const onDeleteEntrance = (buildingId: string, entranceId: string) => {
    const currentCampus = campusRef.current;
    const currentBuildings = currentCampus.buildings;
    const parent = currentBuildings.find((b) => b.id === buildingId);
    if (!parent || parent.locked) return;
    const nextBuildings = currentBuildings.map((b) => {
      if (b.id !== buildingId) return b;
      const remaining = normalizeBuildingEntrances(b).filter((entrance) => entrance.id !== entranceId);
      return { ...b, entrances: promotePrimaryEntrance(remaining) };
    });
    // B5 Phase 1.8: deleting an entrance also removes its linked nav node +
    // connected edges in the SAME mutation — no stale entranceId references.
    const { nodes, edges } = pruneOrphanedEntranceNodes(
      nextBuildings, currentCampus.navNodes ?? [], currentCampus.navEdges ?? []
    );
    const next: Campus = {
      ...currentCampus,
      buildings: nextBuildings,
      navNodes: nodes,
      navEdges: edges,
    };
    campusRef.current = next;
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "building", id: buildingId });
  };

  const onUpdateMarker = (id: string, changes: Partial<CampusMarker>) => {
    updMarkers(markers.map((m) => (m.id === id ? { ...m, ...changes } : m)));
  };

  const onUpdatePath = (id: string, changes: Partial<CampusPath>) => {
    const typeDefaults = changes.type === "road"
      ? { color: "#cbd5e1", width: 18 }
      : changes.type === "accessible"
        ? { color: "#a7f3d0", width: 10 }
        : changes.type === "walkway"
          ? { color: "#94a3b8", width: 10 }
          : {};
    const next: Campus = {
      ...campus,
      paths: paths.map((p) => p.id === id ? { ...p, ...typeDefaults, ...changes } : p),
    };
    onUpdate(next);
    pushHistory(next);
  };

  const onDeletePath = (id: string) => {
    const next: Campus = { ...campus, paths: paths.filter((p) => p.id !== id) };
    onUpdate(next);
    pushHistory(next);
    setSelected(null);
    setSelectedPathPoint(null);
    setPathMemberEditId(null);
  };

  const onDeleteBuilding = (id: string) => {
    // B5 Phase 1.8: deleting a building also removes its entrance-linked nav
    // nodes + connected edges in the SAME mutation (no stale references).
    const nextBuildings = buildings.filter((b) => b.id !== id);
    const { nodes, edges } = pruneOrphanedEntranceNodes(nextBuildings, navNodes, navEdges);
    pushHistory();
    onUpdate({ ...campus, buildings: nextBuildings, navNodes: nodes, navEdges: edges });
    setSelected(null);
  };
  const onDeleteMarker = (id: string) => { updMarkers(markers.filter((m) => m.id !== id)); setSelected(null); };

  // ── Floor manager helpers (delegated to HierarchyPanel) ──

  const onPathClick = (id: string) => {
    // Campus walkways are context-only in Navigation mode — never selected or
    // removed while authoring the graph.
    if (layer === "navigation") return;
    if (tool === "erase") {
      const p = paths.find((x) => x.id === id);
      if (p) setDeleteConfirm({ type: "path", id, name: "Path" });
    } else if (tool === "select") {
      // B5 Phase 5.12 — Canva-style network selection:
      // - while editing one member, clicking another member switches edit focus;
      // - clicking any member of an explicit Path Network selects the WHOLE
      //   network (no individual point controls) — double-click enters member edit.
      const path = paths.find((x) => x.id === id);
      const networkMembers = path?.pathNetworkId
        ? paths.filter((candidate) => candidate.pathNetworkId === path.pathNetworkId)
        : [];
      if (pathMemberEditId && pathMemberEditId !== id) {
        setSelected({ type: "path", id });
        setSelectedPathPoint(null);
        setPathMemberEditId(id);
        return;
      }
      if (networkMembers.length > 1) {
        setSelected({ type: "path", id });
        setMultiSelected(networkMembers.map((member) => member.id));
        setShowAlignTools(true);
        setSelectedPathPoint(null);
        setPathMemberEditId(null);
        return;
      }
      setSelected({ type: "path", id });
      setMultiSelected([]);
      setShowAlignTools(false);
      setSelectedPathPoint(null);
      setPathMemberEditId(null);
    }
  };

  // B5 Phase 5.12 — double-click a network member to enter MEMBER EDIT MODE:
  // the group relationship stays intact (multi-selection keeps the network ids
  // so group drag/rotation still work) while this path's points become editable.
  const onPathDblClick = useCallback((id: string) => {
    if (layer === "navigation" || tool !== "select") return;
    const path = paths.find((p) => p.id === id);
    if (!path || path.locked) return;
    const networkMembers = path.pathNetworkId
      ? paths.filter((candidate) => candidate.pathNetworkId === path.pathNetworkId)
      : [];
    if (networkMembers.length < 2) return;
    setSelected({ type: "path", id });
    setSelectedPathPoint(null);
    setPathMemberEditId(id);
    setMultiSelected(networkMembers.map((member) => member.id));
    setShowAlignTools(true);
  }, [layer, paths, tool]);

  const onPathDown = useCallback((e: React.MouseEvent, id: string) => {
    if (layer === "navigation") return;
    const path = paths.find((p) => p.id === id);
    if (!path || path.locked) return;
    if (tool !== "select") return;
    const networkIds = pathNetworkIdsForPath(id);
    if (e.shiftKey) {
      const base = multiSelected.length > 0 ? multiSelected : selected ? [selected.id] : [];
      const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      setShowAlignTools(next.length > 1);
      if (next.length > 1) {
        setMultiSelected(next);
        setSelected({ type: "path", id });
      } else if (next.length === 1) {
        setMultiSelected([]);
        setSelected(selectionForId(next[0]));
      } else {
        setMultiSelected([]);
        setSelected(null);
      }
      setSelectedPathPoint(null);
      setGuides([]);
      return;
    }
    const pt = getPoint(e as React.MouseEvent<SVGSVGElement>, cw, ch);
    gestureHistoryPushed.current = false;
    gestureChangedRef.current = false;
    dragging.current = { type: "path", id, sx: pt.x, sy: pt.y, ox: 0, oy: 0, points: structuredClone(path.points) };
    const activeGroupIds = networkIds.length > 1 ? networkIds : multiSelected;
    if (activeGroupIds.includes(id)) {
      dragGroupStartRef.current = buildDragGroup({ type: "path", id }, activeGroupIds);
      pathGroupOriginRef.current = dragGroupStartRef.current?.some((member) => member.kind === "path")
        ? new globalThis.Map(paths.filter((candidate) => activeGroupIds.includes(candidate.id)).map((candidate) => [candidate.id, structuredClone(candidate.points)]))
        : null;
      if (networkIds.length > 1) {
        setMultiSelected(networkIds);
        setShowAlignTools(true);
      }
    } else {
      setMultiSelected([]);
      setShowAlignTools(false);
      dragGroupStartRef.current = null;
      pathGroupOriginRef.current = null;
    }
    setSelected({ type: "path", id });
    setSelectedPathPoint(null);
  }, [buildDragGroup, cw, ch, getPoint, layer, multiSelected, pathNetworkIdsForPath, paths, selected, selectionForId, tool]);

  const onPathPointDown = useCallback((e: React.MouseEvent, id: string, pointIndex: number) => {
    e.stopPropagation();
    if (layer === "navigation") return;
    const path = paths.find((p) => p.id === id);
    if (!path || path.locked) return;
    const pt = getPoint(e as React.MouseEvent<SVGSVGElement>, cw, ch);
    gestureHistoryPushed.current = false;
    gestureChangedRef.current = false;
    dragging.current = { type: "pathPoint", id, pointIndex, sx: pt.x, sy: pt.y, ox: 0, oy: 0 };
    setSelected({ type: "path", id });
    setSelectedPathPoint({ pathId: id, pointIndex });
  }, [cw, ch, getPoint, layer, paths]);

  const onPathExtendStart = useCallback((e: React.MouseEvent, id: string, pointIndex: number) => {
    e.stopPropagation();
    e.preventDefault();
    if (layer === "navigation") return;
    const path = paths.find((p) => p.id === id);
    const start = path?.points[pointIndex];
    if (!path || path.locked || !start || (pointIndex !== 0 && pointIndex !== path.points.length - 1)) return;
    const cfg = pathPaintTypeConfig(path.type);
    pathExtendRef.current = { pathId: id, atStart: pointIndex === 0 };
    pathPaintStroke.current = { points: [start], moved: false };
    setPathPaintType(path.type);
    setPathPaintWidth(path.width);
    setPathPaintPreview({ points: [start], width: path.width, type: path.type, color: cfg.color });
    setSelected({ type: "path", id });
    setSelectedPathPoint({ pathId: id, pointIndex });
    setMultiSelected([]);
    setGuides([]);
  }, [layer, paths]);

  const onPathWidthDown = useCallback((e: React.MouseEvent, id: string, segmentIndex: number, handlePoint: { x: number; y: number }) => {
    e.stopPropagation();
    if (layer === "navigation") return;
    const path = paths.find((p) => p.id === id);
    const a = path?.points[segmentIndex];
    const b = path?.points[segmentIndex + 1];
    if (!path || path.locked || !a || !b) return;
    const pt = getPoint(e as React.MouseEvent<SVGSVGElement>, cw, ch);
    gestureHistoryPushed.current = false;
    gestureChangedRef.current = false;
    dragging.current = {
      type: "pathWidth",
      id,
      segmentIndex,
      sx: pt.x,
      sy: pt.y,
      ox: 0,
      oy: 0,
      startWidth: path.width,
      startDistance: pointToSegmentDistance(handlePoint, a, b),
      handlePoint,
    };
    setSelected({ type: "path", id });
  }, [cw, ch, getPoint, layer, paths]);

  const onPathAddPoint = (id: string, pointIndex: number, point: { x: number; y: number }) => {
    const path = paths.find((p) => p.id === id);
    if (!path || path.locked) return;
    const next = {
      ...campus,
      paths: paths.map((p) => p.id === id ? { ...p, points: [...p.points.slice(0, pointIndex), point, ...p.points.slice(pointIndex)] } : p),
    };
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "path", id });
    setSelectedPathPoint({ pathId: id, pointIndex });
  };

  const selectedPathPointCanBeRemoved = () => {
    if (!selectedPathPoint) return false;
    const path = paths.find((p) => p.id === selectedPathPoint.pathId);
    if (!path || path.locked) return false;
    const index = selectedPathPoint.pointIndex;
    const first = path.points[0];
    const last = path.points[path.points.length - 1];
    const isClosed = !!first && !!last && path.points.length > 2 && pathPointKey(first) === pathPointKey(last);
    if (index <= 0 || index >= path.points.length - 1) return false;
    return isClosed ? path.points.length > 4 : path.points.length > 2;
  };

  const onRemoveSelectedPathPoint = () => {
    if (!selectedPathPoint || !selectedPathPointCanBeRemoved()) return;
    const path = paths.find((p) => p.id === selectedPathPoint.pathId);
    if (!path) return;
    const nextPoints = path.points.filter((_, index) => index !== selectedPathPoint.pointIndex);
    const next: Campus = {
      ...campus,
      paths: paths.map((p) => p.id === path.id ? { ...p, points: nextPoints } : p),
    };
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "path", id: path.id });
    setSelectedPathPoint(null);
  };

  const onAddPathBend = (pathId: string) => {
    const path = paths.find((p) => p.id === pathId);
    if (!path || path.locked || path.points.length < 2) return;
    const preferredIndex = selectedPathPoint?.pathId === pathId && selectedPathPoint.pointIndex < path.points.length - 1
      ? selectedPathPoint.pointIndex
      : undefined;
    const segmentIndex = preferredIndex ?? path.points.slice(0, -1).reduce((best, point, index) => {
      const nextPoint = path.points[index + 1];
      const len = Math.hypot(nextPoint.x - point.x, nextPoint.y - point.y);
      return len > best.len ? { index, len } : best;
    }, { index: 0, len: -1 }).index;
    const a = path.points[segmentIndex];
    const b = path.points[segmentIndex + 1];
    if (!a || !b) return;
    const point = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
    const next: Campus = {
      ...campus,
      paths: paths.map((p) => p.id === pathId
        ? { ...p, points: [...p.points.slice(0, segmentIndex + 1), point, ...p.points.slice(segmentIndex + 1)] }
        : p),
    };
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "path", id: pathId });
    setSelectedPathPoint({ pathId, pointIndex: segmentIndex + 1 });
  };

  const onDisconnectSelectedPathPoint = () => {
    if (!selectedPathPoint || !pathPointIsJunction(selectedPathPoint.pathId, selectedPathPoint.pointIndex)) return;
    const path = paths.find((p) => p.id === selectedPathPoint.pathId);
    const point = path?.points[selectedPathPoint.pointIndex];
    if (!path || path.locked || !point) return;
    const key = pathPointKey(point);
    const next: Campus = {
      ...campus,
      paths: paths.map((p) => p.id === path.id
        ? { ...p, disconnectedJunctionKeys: Array.from(new Set([...(p.disconnectedJunctionKeys ?? []), key])) }
        : p),
    };
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "path", id: path.id });
    setSelectedPathPoint(selectedPathPoint);
  };

  const ensureOutdoorNavNodeAt = useCallback((point: { x: number; y: number }, nodeSet: NavigationNode[]) => {
    const existing = nodeSet.find((node) =>
      (node.type === "outdoor" || node.type === "entrance") &&
      Math.hypot(node.x - point.x, node.y - point.y) <= 1
    );
    if (existing) return { node: existing, nodes: nodeSet, created: false };
    const node = createNavNode({
      id: genId("nn"),
      x: Math.round(point.x),
      y: Math.round(point.y),
      campusId: campus.id,
      name: "Waypoint",
      type: "outdoor",
      color: LAYER_MARKER_CONFIG.navigation.color,
    });
    return { node, nodes: [...nodeSet, node], created: true };
  }, [campus.id]);

  const onAddWaypointAtSelectedPathPoint = () => {
    if (!selectedPathPoint) return;
    const point = paths.find((p) => p.id === selectedPathPoint.pathId)?.points[selectedPathPoint.pointIndex];
    if (!point) return;
    const ensured = ensureOutdoorNavNodeAt(point, navNodes);
    if (!ensured.created) {
      setSelected({ type: "navNode", id: ensured.node.id });
      toast.info("Waypoint already exists", "Selected the existing navigation waypoint at this pathway point.");
      return;
    }
    const next: Campus = { ...campus, navNodes: ensured.nodes };
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "navNode", id: ensured.node.id });
    setMultiSelected([]);
    toast.success("Waypoint added", "Snapped to the selected pathway point.");
  };

  const onAddPathToNavigation = (pathId: string) => {
    onAddPathsToNavigation([pathId]);
  };

  const onAddPathsToNavigation = (pathIds: string[]) => {
    const pathSet = paths.filter((p) => pathIds.includes(p.id) && p.points.length >= 2);
    if (pathSet.length === 0) return;
    let nextNodes = [...navNodes];
    let nextEdges = [...navEdges];
    let createdNodes = 0;
    let createdEdges = 0;

    for (const path of pathSet) {
      const nodeIds: string[] = [];
      for (const point of path.points) {
        const ensured = ensureOutdoorNavNodeAt(point, nextNodes);
        if (ensured.created) createdNodes += 1;
        nextNodes = ensured.nodes;
        nodeIds.push(ensured.node.id);
      }

      for (let index = 0; index < nodeIds.length - 1; index += 1) {
        const startNodeId = nodeIds[index];
        const endNodeId = nodeIds[index + 1];
        if (!startNodeId || !endNodeId || isSelfEdge(startNodeId, endNodeId)) continue;
        if (findDuplicateNavEdge(nextEdges, startNodeId, endNodeId)) continue;
        const edge = createNavEdge({ id: genId("ne"), startNodeId, endNodeId, nodes: nextNodes });
        nextEdges = [...nextEdges, edge];
        createdEdges += 1;
      }
    }

    if (createdNodes === 0 && createdEdges === 0) {
      toast.info(pathSet.length > 1 ? "Network already in navigation" : "Pathway already in navigation", "All pathway waypoints and connections already exist.");
      return;
    }
    const next: Campus = { ...campus, navNodes: nextNodes, navEdges: nextEdges };
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "path", id: pathSet[0].id });
    setMultiSelected(pathSet.length > 1 ? pathSet.map((path) => path.id) : []);
    toast.success(pathSet.length > 1 ? "Network added to navigation" : "Path added to navigation", `${createdNodes} waypoint${createdNodes === 1 ? "" : "s"} and ${createdEdges} connection${createdEdges === 1 ? "" : "s"} added.`);
  };

  const onGroupPaths = (ids: string[]) => {
    const pathIds = ids.filter((id) => paths.some((path) => path.id === id));
    if (pathIds.length < 2) return;
    const networkId = paths.find((path) => pathIds.includes(path.id) && path.pathNetworkId)?.pathNetworkId ?? genId("pnet");
    const next: Campus = { ...campus, paths: assignPathNetwork(paths, pathIds, networkId) };
    onUpdate(next);
    pushHistory(next);
    setMultiSelected(pathIds);
    setSelected({ type: "path", id: pathIds[0] });
    setShowAlignTools(true);
  };

  const onUngroupPaths = (ids: string[]) => {
    const pathIds = new Set(ids);
    if (pathIds.size === 0) return;
    const next: Campus = {
      ...campus,
      paths: paths.map((path) => pathIds.has(path.id) ? { ...path, pathNetworkId: undefined } : path),
    };
    onUpdate(next);
    pushHistory(next);
    setMultiSelected([]);
    setShowAlignTools(false);
    setSelected(ids[0] ? { type: "path", id: ids[0] } : null);
  };

  const onNavEdgeBendDown = useCallback((e: React.MouseEvent, id: string, bendIndex: number) => {
    e.stopPropagation();
    const edge = navEdges.find((ed) => ed.id === id);
    const bend = edge?.bendPoints?.[bendIndex];
    if (!edge || !bend) return;
    gestureHistoryPushed.current = false;
    gestureChangedRef.current = false;
    dragging.current = { type: "navEdgeBend", id, pointIndex: bendIndex, sx: bend.x, sy: bend.y, ox: bend.x, oy: bend.y };
    setSelected({ type: "navEdge", id });
  }, [navEdges]);

  /**
   * B5 Phase 6.8: Add Bend — insert a USEFUL control point on the given segment
   * (Floor Editor parity): axis-aligned segments get an orthogonal U-dog-leg
   * (two corner bends) so the new bend survives normalization and can actually
   * be reshaped; legacy diagonal segments get a perpendicular V point. A plain
   * collinear midpoint is never inserted (it would be normalized away). The
   * candidate side is obstacle-safe and stays inside the canvas. One history
   * action; the result is always normalized (no near-duplicate bends).
   */
  const onNavEdgeAddBend = (id: string, bendIndex: number, _point: { x: number; y: number }) => {
    const edge = navEdges.find((ed) => ed.id === id);
    const start = navNodes.find((n) => n.id === edge?.startNodeId);
    const end = navNodes.find((n) => n.id === edge?.endNodeId);
    if (!edge || !start || !end) return;
    const pts = [{ x: start.x, y: start.y }, ...(edge.bendPoints ?? []), { x: end.x, y: end.y }];
    const idx = Math.max(0, Math.min(bendIndex, pts.length - 2));
    const a = pts[idx];
    const b = pts[idx + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < 2) return;
    const mx = Math.round((a.x + b.x) / 2);
    const my = Math.round((a.y + b.y) / 2);
    const offset = Math.max(10, Math.min(24, Math.round(segLen / 4)));
    const horizontal = a.y === b.y;
    const vertical = a.x === b.x;
    const candidates: { x: number; y: number }[][] = horizontal
      ? [
          [{ x: mx, y: my }, { x: mx, y: my + offset }, { x: b.x, y: my + offset }],
          [{ x: mx, y: my }, { x: mx, y: my - offset }, { x: b.x, y: my - offset }],
        ]
      : vertical
        ? [
            [{ x: mx, y: my }, { x: mx + offset, y: my }, { x: mx + offset, y: b.y }],
            [{ x: mx, y: my }, { x: mx - offset, y: my }, { x: mx - offset, y: b.y }],
          ]
        : (() => {
            const perp = { x: -(b.y - a.y), y: b.x - a.x };
            const plen = Math.hypot(perp.x, perp.y) || 1;
            return [
              [{ x: Math.round(mx + (perp.x / plen) * offset), y: Math.round(my + (perp.y / plen) * offset) }],
              [{ x: Math.round(mx - (perp.x / plen) * offset), y: Math.round(my - (perp.y / plen) * offset) }],
            ];
          })();
    const inCanvas = (p: { x: number; y: number }) => p.x >= 0 && p.y >= 0 && p.x <= cw && p.y <= ch;
    const origClear = !polylineCrossesObstacle(pts, buildings, decorAssets);
    let chosen: { x: number; y: number }[] | null = null;
    for (const cand of candidates) {
      const nextPts = [...pts.slice(0, idx + 1), ...cand, ...pts.slice(idx + 1)];
      const crosses = polylineCrossesObstacle(nextPts, buildings, decorAssets);
      if (cand.every(inCanvas) && (!origClear || !crosses)) { chosen = cand; break; }
    }
    if (!chosen) {
      toast.warning("Path blocked", "No clear side is available for the new bend — move the geometry manually.");
      return;
    }
    const allBends = normalizedEdgeBends(
      pts[0],
      [...pts.slice(1, idx + 1), ...chosen, ...pts.slice(idx + 1, -1)],
      pts[pts.length - 1]
    );
    const next: Campus = {
      ...campus,
      navEdges: navEdges.map((ed) => ed.id === id
        ? { ...ed, bendPoints: allBends.length > 0 ? allBends : undefined, distance: outdoorEdgeDistance(ed.startNodeId, ed.endNodeId, allBends) }
        : ed),
    };
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "navEdge", id });
  };

  const onNavEdgeRemoveBend = (id: string, bendIndex?: number) => {
    const edge = navEdges.find((ed) => ed.id === id);
    if (!edge || !edge.bendPoints || edge.bendPoints.length === 0) return;
    const index = bendIndex ?? edge.bendPoints.length - 1;
    if (index < 0 || index >= edge.bendPoints.length) return;
    // B5 Phase 6.8: normalize the survivor list against the full polyline — the
    // neighbors of a removed bend can become collinear (with each other OR with
    // an endpoint), so redundant bends must not linger.
    const startN = navNodes.find((n) => n.id === edge.startNodeId);
    const endN = navNodes.find((n) => n.id === edge.endNodeId);
    const bends = startN && endN
      ? normalizedEdgeBends(startN, edge.bendPoints.filter((_, i) => i !== index), endN)
      : edge.bendPoints.filter((_, i) => i !== index);
    const next: Campus = {
      ...campus,
      navEdges: navEdges.map((ed) => ed.id === id
        ? {
            ...ed,
            bendPoints: bends.length > 0 ? bends : undefined,
            distance: outdoorEdgeDistance(ed.startNodeId, ed.endNodeId, bends),
          }
        : ed),
    };
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "navEdge", id });
  };

  /**
   * B5 Phase 6.8: Straighten — remove ALL bends, but NEVER silently route the
   * direct A→B line through a building or solid obstacle: the candidate is
   * validated first and rejected with clear feedback (one history action).
   */
  const onStraightenNavEdge = (id: string) => {
    const edge = navEdges.find((ed) => ed.id === id);
    const a = navNodes.find((n) => n.id === edge?.startNodeId);
    const b = navNodes.find((n) => n.id === edge?.endNodeId);
    if (!edge || !a || !b) return;
    const direct = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
    if (polylineCrossesObstacle(direct, buildings, decorAssets)) {
      toast.warning("Can't straighten", "The direct path crosses a building or obstacle — keep a bend.");
      return;
    }
    const next: Campus = {
      ...campus,
      navEdges: navEdges.map((ed) => ed.id === id
        ? { ...ed, bendPoints: undefined, distance: Math.round(Math.hypot(b.x - a.x, b.y - a.y)) }
        : ed),
    };
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "navEdge", id });
  };

  // ── Context menu ──
  const handleContextMenu = useCallback((e: React.MouseEvent, type: "building" | "marker" | "path" | "decorAsset" | "navNode", id: string) => {
    e.preventDefault();
    e.stopPropagation();
    // B5 Phase 1: right-click cancels an in-progress navigation edge so a
    // dangling connect state can never survive a context action (same rule as
    // Escape / tool switch — never leaves an orphan edge).
    if (tool === "path" && layer === "navigation") {
    setNavConnectStart(null);
    setNavConnectBends([]);
    setNavPreview(null);
    setNavPreviewPins([]);
    navConnectBendGroupsRef.current = [];
    connectRedoStackRef.current = [];
    }
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
    setSelected({ type, id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, layer]);

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
          const nbId = genId("bld");
          const nb: CampusBuilding = {
            ...b,
            id: nbId,
            name: `${b.name} (copy)`,
            x: b.x + 20,
            y: b.y + 20,
            entrances: normalizeBuildingEntrances(b).map((entrance) => ({ ...entrance, id: genId("ent"), buildingId: nbId })),
          };
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

  // ── Issue locate dispatcher (B5 Final + correction) ────────────────────
  // One handler for every locatable issue, driven by the structured
  // IssueTarget attached by the validators (never message-text parsing).
  // Indoor issues hop into the Floor Editor ONLY when the building AND floor
  // still exist in the current campus (resolveIssueLocateTarget validates
  // against the live draft); stale references degrade to a selected nav node
  // or a non-destructive toast — never a dead editor route.
  const handleLocateIssue = useCallback((issue: ValidationIssue) => {
    const resolution = resolveIssueLocateTarget(issue, campus);
    if (resolution.kind === "unlocatable") {
      toast.info("This issue refers to an object or floor that no longer exists", "The editor was not changed. Repair or remove the leftover reference.");
      return;
    }
    // ── Floor scope → open the Floor Editor at the right building/floor ──
    // resolveIssueLocateTarget already verified both exist in this campus.
    if (resolution.kind === "floor") {
      const target = resolution.target;
      const floorSel = floorSelectionForTarget(target);
      onOpenFloor(target.buildingId!, target.floorId!, floorSel ?? undefined);
      return;
    }

    const target = resolution.target;

    // ── Stale physical reference (floor/building gone) ──
    // The nav node itself still exists with usable coordinates. Surface it in
    // Campus Navigation (Waypoint properties open so it can be removed or
    // relinked) and warn that its floor is gone — never open the dead floor.
    if (resolution.kind === "staleNavNode") {
      const node = resolution.node;
      if (layer !== "navigation") switchLayer("navigation");
      setMultiSelected([]);
      setShowAlignTools(false);
      setSelectedPathPoint(null);
      setPathMemberEditId(null);
      setSelected({ type: "navNode", id: node.id });
      toast.warning(
        "Referenced floor no longer exists",
        `This waypoint belongs to a building or floor that was removed. Select it to remove or relink it.`
      );
      return;
    }

    // ── Campus scope → switch layer + select + focus + open properties ──
    const nextLayer: EditorLayer = target.mode === "navigation" ? "navigation" : "campus";
    if (layer !== nextLayer) switchLayer(nextLayer);
    setMultiSelected([]);
    setShowAlignTools(false);
    setSelectedPathPoint(null);
    setPathMemberEditId(null);

    switch (target.selectionType) {
      case "navNode": {
        const n = navNodes.find((x) => x.id === target.id);
        if (!n) return;
        setSelected({ type: "navNode", id: n.id });
        zoomToFit(Math.max(0, n.x - 80), Math.max(0, n.y - 80), 160, 160, 48);
        setLocateFlash({ selectionType: target.selectionType, id: n.id, world: { x: n.x, y: n.y } });
        return;
      }
      case "navEdge": {
        const e = navEdges.find((x) => x.id === target.id);
        if (!e) return;
        setSelected({ type: "navEdge", id: e.id });
        const a = navNodes.find((x) => x.id === e.startNodeId);
        const b = navNodes.find((x) => x.id === e.endNodeId);
        if (a && b) {
          // B7 Phase 1: flash the midpoint measured ALONG the rendered
          // polyline (polylineMidpoint), not the bounding-box center which
          // can sit off a bent edge.
          const pts = [{ x: a.x, y: a.y }, ...(e.bendPoints ?? []), { x: b.x, y: b.y }];
          const mid = polylineMidpoint(pts);
          const xs = pts.map((p) => p.x);
          const ys = pts.map((p) => p.y);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          zoomToFit(minX - 40, minY - 40, maxX - minX + 80, maxY - minY + 80, 40);
          setLocateFlash({ selectionType: target.selectionType, id: e.id, world: { x: mid.x, y: mid.y } });
        }
        return;
      }
      case "entrance": {
        const parent = buildings.find((bldg) => (bldg.entrances ?? []).some((en) => en.id === target.id));
        if (!parent) return;
        const entrance = (parent.entrances ?? []).find((en) => en.id === target.id);
        if (!entrance) return;
        setSelected({ type: "entrance", id: target.id, buildingId: parent.id });
        const pos = entranceWorldPosition(parent, entrance);
        if (pos) {
          zoomToFit(pos.x - 60, pos.y - 60, 120, 120, 40);
          setLocateFlash({ selectionType: target.selectionType, id: target.id, world: { x: pos.x, y: pos.y } });
        }
        return;
      }
      case "building":
      default: {
        const b = buildings.find((x) => x.id === target.id);
        if (!b) return;
        setSelected({ type: "building", id: b.id });
        zoomToBuilding(b.x, b.y, b.width, b.height);
        setLocateFlash({ selectionType: target.selectionType, id: b.id, world: { x: b.x + b.width / 2, y: b.y + b.height / 2 } });
        return;
      }
    }
  }, [buildings, campus, layer, navEdges, navNodes, onOpenFloor, switchLayer, toast, zoomToBuilding, zoomToFit]);

  // ── Review Issues (dialog + publish gate): same locate behavior ──
  const handleReviewIssues = useCallback((firstIssue: ValidationIssue) => {
    handleLocateIssue(firstIssue);
  }, [handleLocateIssue]);

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
  // saveErrorRef records the human-readable failure message so the unsaved-
  // changes guard can surface it inside the modal (state would be stale in
  // the same async tick; a ref is read reliably right after runSave resolves).
  const saveErrorRef = useRef<string | null>(null);
  const runSave = useCallback(async (): Promise<boolean> => {
    // Match the toolbar button's disabled semantics: nothing to save / already saving.
    if (isProcessing || !isDirty) {
      toast.success("Already saved", "All changes are up to date.");
      return true;
    }
    // B7 Phase 2: SAVE DRAFT must never be blocked by map validation. A draft
    // is allowed to be incomplete — validation issues stay visible but never
    // stop the administrator from preserving unfinished work. Only genuine
    // persistence failures (below) can prevent a save.
    setIsProcessing(true);
    saveErrorRef.current = null;
    setSaveScreen({ open: true, state: "saving" });
    try {
      const candidate = { ...campus, updatedAt: new Date().toISOString() };
      const saved = onSave ? await onSave(candidate) : candidate;
      onUpdate(saved);
      savedSnapshotRef.current = JSON.stringify(saved);
      setSaveScreen({ open: true, state: "success" });
      setIsProcessing(false);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The database rejected the save.";
      setSaveScreen({ open: true, state: "error" });
      saveErrorRef.current = message;
      toast.error("Could not save map", message);
      setIsProcessing(false);
      return false;
    }
  }, [campus, onUpdate, onSave, isDirty, isProcessing, toast]);

  // ── Shared unsaved-changes guard (back/exit prompts + native beforeunload) ──
  // The guard's onSave needs to surface runSave's failure message inside the
  // modal; setError is resolved via a ref to keep declaration order clean.
  const unsavedGuardSetErrorRef = useRef<(message: string | null) => void>(() => {});
  const unsavedGuard = useUnsavedChangesGuard({
    isDirty,
    onSave: async () => {
      const ok = await runSave();
      if (!ok) unsavedGuardSetErrorRef.current(saveErrorRef.current ?? "Save failed. Your changes were not saved.");
      return ok;
    },
    onDiscard: () => {
      // Discard restores the last saved snapshot (includes floor edits), then
      // the guard resumes the pending navigation.
      if (isDirty) {
        try {
          const saved = JSON.parse(savedSnapshotRef.current) as Campus;
          onUpdate(saved);
        } catch { /* baseline unavailable — keep current state */ }
      }
    },
  });
  unsavedGuardSetErrorRef.current = unsavedGuard.setError;
  const { guard } = unsavedGuard;

  // ── Back navigation — same guard path as every other exit action ──
  const handleBack = useCallback(() => {
    guard(() => onBack(), {
      // No unsaved changes, but unpublished saved changes — show info state.
      force: hasDraftChanges || (campus.publishStatus === "published" && !isDirty && !campus.publishedAt),
    });
  }, [guard, onBack, hasDraftChanges, campus.publishStatus, campus.publishedAt, isDirty]);

  // ── Open a floor (leaving the Campus editor for the Floor editor) ──
  const requestOpenFloor = useCallback((buildingId: string, floorId: string, initialSelection?: FloorSelection) => {
    guard(() => onOpenFloor(buildingId, floorId, initialSelection));
  }, [guard, onOpenFloor]);

  // ── B5 Phase 2.1: copy / paste / duplicate (editor-local clipboards) ───────
  const outdoorClipboardRef = useRef<{ type: string; id: string }[] | null>(null);
  const outdoorNavClipboardRef = useRef<{ nodes: NavigationNode[]; edges: NavigationEdge[] } | null>(null);
  const pasteOffsetRef = useRef(25);

  const copyOutdoorSelection = useCallback(() => {
    const ids: { type: string; id: string }[] = [];
    if (multiSelected.length > 0) {
      for (const id of multiSelected) {
        if (buildings.some((b) => b.id === id)) ids.push({ type: "building", id });
        else if (markers.some((m) => m.id === id)) ids.push({ type: "marker", id });
        else if (decorAssets.some((d) => d.id === id)) ids.push({ type: "decorAsset", id });
        else if (paths.some((p) => p.id === id)) ids.push({ type: "path", id });
      }
    } else if (selected) {
      if (["building", "marker", "decorAsset", "path"].includes(selected.type)) {
        ids.push({ type: selected.type, id: selected.id });
      }
    }
    if (ids.length === 0) {
      toast.info("Nothing to copy", "Select a building, point of interest, or decorative asset first (Ctrl+C).");
      return;
    }
    outdoorClipboardRef.current = ids;
    pasteOffsetRef.current = 25;
    toast.success("Copied", `${ids.length} object${ids.length !== 1 ? "s" : ""} copied (Ctrl+V to paste).`);
  }, [buildings, markers, decorAssets, paths, multiSelected, selected, toast]);

  const pasteOutdoorSelection = useCallback(() => {
    if (!outdoorClipboardRef.current || outdoorClipboardRef.current.length === 0) {
      toast.info("Nothing to paste", "Copy an object first (Ctrl+C).");
      return;
    }
    const offset = pasteOffsetRef.current;
    pasteOffsetRef.current += 25;
    const nextBuildings = [...buildings];
    const nextMarkers = [...markers];
    const nextPaths = [...paths];
    const nextDecor = [...decorAssets];
    const newIds: string[] = [];
    for (const sel of outdoorClipboardRef.current) {
      if (sel.type === "building") {
        const b = buildings.find((x) => x.id === sel.id);
        if (!b) continue;
        const nbId = genId("bld");
        const nb: CampusBuilding = {
          ...b,
          id: nbId,
          name: `${b.name} (copy)`,
          x: Math.round(Math.max(0, Math.min(cw - b.width, b.x + offset))),
          y: Math.round(Math.max(0, Math.min(ch - b.height, b.y + offset))),
          entrances: normalizeBuildingEntrances(b).map((entrance) => ({ ...entrance, id: genId("ent"), buildingId: nbId })),
        };
        nextBuildings.push(nb);
        newIds.push(nbId);
      } else if (sel.type === "marker") {
        const m = markers.find((x) => x.id === sel.id);
        if (!m) continue;
        const nm = { ...m, id: genId("mk"), x: Math.round(m.x + offset), y: Math.round(m.y + offset) };
        nextMarkers.push(nm);
        newIds.push(nm.id);
      } else if (sel.type === "decorAsset") {
        const d = decorAssets.find((x) => x.id === sel.id);
        if (!d) continue;
        const copy = duplicateDecorAsset(d, genId("dec"), offset, offset);
        nextDecor.push(copy);
        newIds.push(copy.id);
      } else if (sel.type === "path") {
        const p = paths.find((x) => x.id === sel.id);
        if (!p) continue;
        const np = { ...p, id: genId("pth"), points: (p.points ?? []).map((pt) => ({ x: Math.round(pt.x + offset), y: Math.round(pt.y + offset) })) };
        nextPaths.push(np);
        newIds.push(np.id);
      }
    }
    if (newIds.length === 0) {
      toast.info("Nothing to paste", "The copied object no longer exists on this campus.");
      return;
    }
    pushHistory();
    onUpdate({ ...campus, buildings: nextBuildings, markers: nextMarkers, paths: nextPaths, decorAssets: nextDecor });
    setSelected(null);
    setMultiSelected(newIds);
    toast.success("Pasted", `${newIds.length} object${newIds.length !== 1 ? "s" : ""} pasted with fresh IDs.`);
  }, [buildings, markers, paths, decorAssets, campus, cw, ch, onUpdate, pushHistory, toast]);

  const duplicateOutdoorSelection = useCallback(() => {
    if (selected?.type === "building") {
      const b = buildings.find((x) => x.id === selected.id);
      if (!b) return;
      pushHistory();
      const nbId = genId("bld");
      const nb: CampusBuilding = {
        ...b,
        id: nbId,
        name: `${b.name} (copy)`,
        x: b.x + 25,
        y: b.y + 25,
        entrances: normalizeBuildingEntrances(b).map((entrance) => ({ ...entrance, id: genId("ent"), buildingId: nbId })),
      };
      updBuildings([...buildings, nb]);
      setSelected({ type: "building", id: nb.id });
      toast.success("Building Duplicated", `${b.code} has been copied.`);
      return;
    }
    const ids: { type: string; id: string }[] = [];
    if (multiSelected.length > 0) {
      for (const id of multiSelected) {
        if (buildings.some((x) => x.id === id)) ids.push({ type: "building", id });
        else if (markers.some((x) => x.id === id)) ids.push({ type: "marker", id });
        else if (decorAssets.some((x) => x.id === id)) ids.push({ type: "decorAsset", id });
        else if (paths.some((x) => x.id === id)) ids.push({ type: "path", id });
      }
    } else if (selected && ["marker", "decorAsset", "path"].includes(selected.type)) {
      ids.push({ type: selected.type, id: selected.id });
    }
    if (ids.length === 0) {
      toast.info("Nothing to duplicate", "Select an object to duplicate (Ctrl+D).");
      return;
    }
    outdoorClipboardRef.current = ids;
    pasteOutdoorSelection();
  }, [selected, multiSelected, buildings, markers, decorAssets, paths, cw, ch, navNodes, updBuildings, campus, onUpdate, pushHistory, toast, pasteOutdoorSelection]);

  // Outdoor Navigation (layer) copy/paste — free nodes + edges between them;
  // entrance-linked nodes are DERIVED geometry and are never duplicated.
  const navOutdoorSelectionGraph = useCallback(() => {
    const selNode = selected?.type === "navNode" ? selected.id : null;
    let nodeIds: string[] = [];
    if (selNode) nodeIds = multiSelected.length > 0 ? [...new Set([...multiSelected, selNode])] : [selNode];
    else nodeIds = multiSelected.filter((id) => navNodes.some((n) => n.id === id));
    const selectedNodes = navNodes.filter((n) => nodeIds.includes(n.id));
    const freeNodes = selectedNodes.filter((n) => !n.entranceId);
    const linkedCount = selectedNodes.length - freeNodes.length;
    const freeIds = new Set(freeNodes.map((n) => n.id));
    const edges = navEdges.filter((e) => freeIds.has(e.startNodeId) && freeIds.has(e.endNodeId));
    return { nodes: freeNodes, edges, linkedCount };
  }, [multiSelected, navEdges, navNodes, selected]);

  const copyOutdoorNavSelection = useCallback(() => {
    const { nodes, edges, linkedCount } = navOutdoorSelectionGraph();
    if (nodes.length === 0) {
      toast.info("Nothing to copy", "Select free waypoints first (Ctrl+C).");
      return;
    }
    outdoorNavClipboardRef.current = { nodes: structuredClone(nodes), edges: structuredClone(edges) };
    pasteOffsetRef.current = 25;
    if (linkedCount > 0) {
      toast.info("Entrance waypoints not copied", `${linkedCount} entrance waypoint${linkedCount !== 1 ? "s" : ""} follow their building entrance and cannot be copied.`);
    } else {
      toast.success("Copied", `${nodes.length} waypoint${nodes.length !== 1 ? "s" : ""} copied (Ctrl+V to paste).`);
    }
  }, [navOutdoorSelectionGraph, toast]);

  const pasteOutdoorNavSelection = useCallback(() => {
    if (!outdoorNavClipboardRef.current || outdoorNavClipboardRef.current.nodes.length === 0) {
      toast.info("Nothing to paste", "Copy waypoints first (Ctrl+C).");
      return;
    }
    const { nodes, edges } = outdoorNavClipboardRef.current;
    const offset = pasteOffsetRef.current;
    pasteOffsetRef.current += 25;
    const idMap = new globalThis.Map<string, string>();
    const nextNodes: NavigationNode[] = nodes.map((n) => {
      const newId = genId("nn");
      idMap.set(n.id, newId);
      return { ...n, id: newId, x: Math.round(n.x + offset), y: Math.round(n.y + offset) };
    });
    const nodeById = new globalThis.Map(nextNodes.map((n) => [n.id, n]));
    const nextEdges: NavigationEdge[] = edges
      .filter((e) => idMap.has(e.startNodeId) && idMap.has(e.endNodeId))
      .map((e) => {
        const a = nodeById.get(idMap.get(e.startNodeId)!);
        const b = nodeById.get(idMap.get(e.endNodeId)!);
        return { ...e, id: genId("ne"), startNodeId: a!.id, endNodeId: b!.id, distance: Math.round(Math.hypot(b!.x - a!.x, b!.y - a!.y)) };
      });
    const nextCampus = { ...campus, navNodes: [...navNodes, ...nextNodes], navEdges: [...navEdges, ...nextEdges] };
    onUpdate(nextCampus);
    pushHistory(nextCampus);
    setSelected({ type: "navNode", id: nextNodes[nextNodes.length - 1].id });
    setMultiSelected(nextNodes.map((n) => n.id));
    toast.success("Waypoints pasted", `${nextNodes.length} waypoint${nextNodes.length !== 1 ? "s" : ""} pasted with fresh connections.`);
  }, [campus, navNodes, navEdges, onUpdate, pushHistory, toast]);

  const duplicateOutdoorNavSelection = useCallback(() => {
    const { nodes, edges, linkedCount } = navOutdoorSelectionGraph();
    if (nodes.length === 0) {
      toast.info("Nothing to duplicate", "Select free waypoints first (Ctrl+D).");
      return;
    }
    if (linkedCount > 0) {
      toast.info("Entrance waypoints excluded", `${linkedCount} entrance waypoint${linkedCount !== 1 ? "s" : ""} follow their building entrance and cannot be duplicated.`);
    }
    outdoorNavClipboardRef.current = { nodes: structuredClone(nodes), edges: structuredClone(edges) };
    pasteOffsetRef.current = 25;
    pasteOutdoorNavSelection();
  }, [navOutdoorSelectionGraph, pasteOutdoorNavSelection, toast]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      // B5 Phase 1.7: Delete/Backspace must never fire graph deletion while the
      // user is typing in an input, textarea, native select, or contenteditable
      // (inline editors).
      const el = document.activeElement as HTMLElement | null;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.tagName === "SELECT" || el?.isContentEditable) return;
      // B5 Phase 6.4/6.9: Connect-local undo/redo for temporary bends (before
      // global undo). B5 Phase 6.9 (Floor parity): Ctrl+Z removes the LAST
      // temporary CLICK GROUP (the whole corner+click a single click pinned), or
      // cancels the whole unfinished connection when no bends exist yet — never
      // a stray half-bend, and never global history while Connect is active.
      if ((e.ctrlKey || e.metaKey) && navConnectStart) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          const group = navConnectBendGroupsRef.current.pop() ?? 0;
          if (group > 0) {
            const removed = navConnectBends.slice(-group);
            setNavConnectBends((b) => b.slice(0, Math.max(0, b.length - group)));
            connectRedoStackRef.current = [...connectRedoStackRef.current, removed];
          } else {
            setNavConnectStart(null);
            setNavPreview(null);
            setNavPreviewPins([]);
            setNavConnectBends([]);
            navConnectBendGroupsRef.current = [];
            setConnectBlocked(false);
          }
          return;
        }
        if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
          e.preventDefault();
          if (connectRedoStackRef.current.length > 0) {
            const restored = connectRedoStackRef.current[connectRedoStackRef.current.length - 1];
            connectRedoStackRef.current = connectRedoStackRef.current.slice(0, -1);
            setNavConnectBends((b) => [...b, ...restored]);
            navConnectBendGroupsRef.current.push(restored.length);
          }
          return;
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undoEdit(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redoEdit(); return; }
      if ((e.key === "Enter") && tool === "path" && layer !== "navigation" && drawingPath.length >= 2) {
        e.preventDefault();
        handleDblClick();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && navConnectStart && navConnectBends.length > 0) {
        e.preventDefault();
        // Floor-parity group accounting: removing one bend via Delete also
        // removes one slot from the last click group (and lands in redo).
        const removed = navConnectBends[navConnectBends.length - 1];
        setNavConnectBends((bends) => bends.slice(0, -1));
        const lastGroup = navConnectBendGroupsRef.current.pop() ?? 1;
        if (lastGroup > 1) navConnectBendGroupsRef.current.push(lastGroup - 1);
        connectRedoStackRef.current = [...connectRedoStackRef.current, [removed]];
        return;
      }
      // Batch delete multi-selected items — show confirmation dialog
      if ((e.key === "Delete" || e.key === "Backspace") && multiSelected.length > 0) {
        e.preventDefault();
        // B5 Phase 1.7: navigation multi-selection deletes nodes/edges in ONE
        // history action (connected edges of deleted nodes are removed — never
        // a dangling reference). Graph deletion is deliberate, so it proceeds
        // directly like the panel's Delete Selected.
        const navNodeIds = navNodes.filter((n) => multiSelected.includes(n.id)).map((n) => n.id);
        const navEdgeIds = navEdges.filter((e2) => multiSelected.includes(e2.id)).map((e2) => e2.id);
        if (navNodeIds.length > 0 || navEdgeIds.length > 0) {
          deleteNavSelection(navNodeIds, navEdgeIds);
          return;
        }
        const bIds = buildings.filter((b) => multiSelected.includes(b.id)).map((b) => b.id);
        const mIds = markers.filter((m) => multiSelected.includes(m.id)).map((m) => m.id);
        const daIds = decorAssets.filter((d) => multiSelected.includes(d.id)).map((d) => d.id);
        const pathIds = paths.filter((p) => multiSelected.includes(p.id)).map((p) => p.id);
        if (pathIds.length > 0 && bIds.length === 0 && mIds.length === 0 && daIds.length === 0) {
          const next: Campus = { ...campus, paths: paths.filter((p) => !pathIds.includes(p.id)) };
          onUpdate(next);
          pushHistory(next);
          setMultiSelected([]);
          setSelected(null);
          setSelectedPathPoint(null);
          setPathMemberEditId(null);
          setShowAlignTools(false);
          return;
        }
        setBatchDeleteConfirm({ buildingIds: bIds, markerIds: mIds, decorAssetIds: daIds });
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        if (selected.type === "building") {
          const b = buildings.find((x) => x.id === selected.id);
          if (b?.locked) return;
          // B5 Phase 1.8: building delete also prunes its entrance-linked nav
          // nodes + edges in the same single history action.
          onDeleteBuilding(selected.id);
        } else if (selected.type === "marker") { updMarkers(markers.filter((m) => m.id !== selected.id)); pushHistory(); }
        else if (selected.type === "path") {
          if (selectedPathPoint?.pathId === selected.id && pathPointIsJunction(selected.id, selectedPathPoint.pointIndex)) {
            toast.info("Use Disconnect Junction", "Delete does not remove connected paths from a selected junction.");
            return;
          }
          if (selectedPathPoint?.pathId === selected.id && selectedPathPointCanBeRemoved()) {
            onRemoveSelectedPathPoint();
            return;
          }
          updPaths(paths.filter((p) => p.id !== selected.id));
          pushHistory();
        }
        else if (selected.type === "entrance") {
          const parent = buildings.find((b) => b.id === selected.buildingId);
          if (parent?.locked) return;
          onDeleteEntrance(selected.buildingId, selected.id);
        }
        else if (selected.type === "decorAsset") {
          const da = decorAssets.find((d) => d.id === selected.id);
          const template = da ? DECOR_ASSET_MAP[da.type] : undefined;
          setDeleteConfirm({ type: "decorAsset", id: selected.id, name: template?.label ?? da?.type ?? "Asset" });
        }
        else if (selected.type === "navNode") {
          // Single waypoint delete: deterministic connected-edge cleanup.
          const next = removeNavNode(navNodes, navEdges, selected.id);
          const nextCampus = { ...campus, navNodes: next.nodes, navEdges: next.edges };
          onUpdate(nextCampus);
          pushHistory(nextCampus);
        }
        else if (selected.type === "navEdge") {
          // Single edge delete — never leaves a dangling reference.
          const nextCampus = { ...campus, navEdges: navEdges.filter((e2) => e2.id !== selected.id) };
          onUpdate(nextCampus);
          pushHistory(nextCampus);
        }
        setSelected(null);
        setSelectedPathPoint(null);
        setPathMemberEditId(null);
      }
      // Ctrl+A: select all buildings
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        setMultiSelected(buildings.map((b) => b.id));
        if (buildings.length > 1) setShowAlignTools(true);
        return; // Don't fall through to the single-letter "a" → building tool
      }
      if (e.key === "Escape") {
        // B5 Phase 5.12 — Escape while editing one path inside its network
        // returns to the WHOLE-NETWORK selection (group stays intact).
        if (pathMemberEditId) {
          setPathMemberEditId(null);
          setSelectedPathPoint(null);
          return;
        }
        setDP([]);
        groundPaintGesture.current = null;
        groundEraseGesture.current = [];
        pathPaintStroke.current = null;
        pathExtendRef.current = null;
        setGroundBrushPreview(null);
        setGroundErasePreview(null);
        setPathPaintPreview(null);
        // Cancel an in-progress navigation edge (never leaves an orphan edge).
        setNavConnectStart(null);
        setNavConnectBends([]);
        setNavPreview(null);
        setNavPreviewPins([]);
        navConnectBendGroupsRef.current = [];
        connectRedoStackRef.current = [];
        if (tool === "path") switchTool("select");
        setSelected(null);
        setSelectedPathPoint(null);
        setMultiSelected([]);
        setShowAlignTools(false);
        setGuides([]);
        setSelectedBuildingType(null);
        setBuildingDrag(null);
        setRubberBand(null);
      }
      // Single-letter tool shortcuts must NOT fire while Ctrl/Cmd is held
      if (!e.ctrlKey && !e.metaKey) {
        // Tool shortcuts are LAYER-AWARE: a shortcut only activates a tool the
        // active layer actually exposes (e.g. B does nothing in Navigation mode,
        // and the removed accessibility-layer R/L elevator tool is now inert).
        const canUseTool = (id: SimpleTool) => (LAYER_TOOLS[layer] ?? LAYER_TOOLS.campus).some((t) => t.id === id);
        if (e.key === "v" || e.key === "V") switchTool("select");
        if (e.code === "Space") {
          e.preventDefault();
          // Hold-to-pan: save previous tool, activate pan temporarily
          if (tool !== "pan") {
            prevToolRef.current = tool;
            setTool("pan");
          }
        }
        if (e.key === "m" || e.key === "M") { if (canUseTool("marker")) switchTool("marker"); }
        if (e.key === "b" || e.key === "B") { if (canUseTool("building")) switchTool("building"); }
        if (e.key === "p" || e.key === "P") { if (canUseTool("path")) switchTool("path"); }
        if (e.key === "e" || e.key === "E") { if (canUseTool("erase")) switchTool("erase"); }
        if (e.key === "x" || e.key === "X") { if (canUseTool("erase")) switchTool("erase"); }
        if (e.key === "a" || e.key === "A") { if (canUseTool("building")) switchTool("building"); }
        if (e.key === "0") resetView();
        // Layer switching: 1=Campus, 2=Navigation, 3=Events
        // (Accessibility and Emergency are routing properties of the
        // Navigation layer, not separate editing modes.)
        if (e.key >= "1" && e.key <= "3") {
          const layerByKey: Record<string, EditorLayer> = {
            "1": "campus", "2": "navigation", "3": "events",
          };
          switchLayer(layerByKey[e.key]);
        }
        // ? — keyboard shortcut cheat sheet
        if (e.key === "?") {
          e.preventDefault();
          setShowCheatSheet(true);
        }
        // Arrow keys: nudge the selected item (1px, Shift=10px). B5 Final:
        // extended to outdoor nav nodes, decor assets, paths, and multi-select
        // groups. Rapid nudges batch into ONE undo step (500 ms burst window).
        const step = e.shiftKey ? 10 : 1;
        let dx = 0, dy = 0;
        if (e.key === "ArrowLeft") dx = -step;
        else if (e.key === "ArrowRight") dx = step;
        else if (e.key === "ArrowUp") dy = -step;
        else if (e.key === "ArrowDown") dy = step;
        if ((dx || dy) && (selected || multiSelected.length > 0)) {
          // ── Multi-select group nudge ──
          if (multiSelected.length > 0) {
            const isAnyLocked = multiSelected.some((id) => {
              const b = buildings.find((x) => x.id === id);
              const d = decorAssets.find((x) => x.id === id);
              const p = paths.find((x) => x.id === id);
              return b?.locked || d?.locked || p?.locked;
            });
            if (isAnyLocked) return;
            e.preventDefault();
            const now = Date.now();
            const isNewBurst = now - lastNudgeRef.current > 500;
            lastNudgeRef.current = now;
            if (isNewBurst) pushHistory();
            const nextBuildings = buildings.map((x) => multiSelected.includes(x.id) ? { ...x, x: x.x + dx, y: x.y + dy } : x);
            // B5 correction: the nudge path uses the SAME graph-group
            // translation as the mouse drag — selected free waypoints AND the
            // bends of edges whose both endpoints move translate together.
            const syncedNavNodes = syncEntranceNodePositions(nextBuildings, navNodes);
            const movingNavNodeIds = new Set(
              multiSelected.filter((id) => {
                const n = syncedNavNodes.find((x) => x.id === id);
                return Boolean(n && !n.entranceId);
              })
            );
            const { nodes: movedNavNodes, edges: movedNavEdges } = translateSelectedNavGraph(
              syncedNavNodes,
              navEdges,
              movingNavNodeIds,
              dx,
              dy,
            );
            onUpdate({
              ...campus,
              buildings: nextBuildings,
              navNodes: movedNavNodes.map((n) =>
                movingNavNodeIds.has(n.id)
                  ? { ...n, x: Math.max(0, Math.min(cw, n.x)), y: Math.max(0, Math.min(ch, n.y)) }
                  : n
              ),
              navEdges: movedNavEdges,
              markers: markers.map((m) => multiSelected.includes(m.id) ? { ...m, x: m.x + dx, y: m.y + dy } : m),
              decorAssets: decorAssets.map((d) => multiSelected.includes(d.id) ? { ...d, x: d.x + dx, y: d.y + dy } : d),
              paths: paths.map((p) => multiSelected.includes(p.id) ? { ...p, points: p.points.map((pt) => ({ ...pt, x: pt.x + dx, y: pt.y + dy })) } : p),
            });
            return;
          }
          if (!selected) return;
          // ── Single-object nudge ──
          const isLocked = (sel: typeof selected) => {
            if (!sel) return false;
            if (sel.type === "building") return Boolean(buildings.find((x) => x.id === sel.id)?.locked);
            if (sel.type === "decorAsset") return Boolean(decorAssets.find((x) => x.id === sel.id)?.locked);
            if (sel.type === "path") return Boolean(paths.find((x) => x.id === sel.id)?.locked);
            return false;
          };
          if (isLocked(selected)) return;
          e.preventDefault();
          const now = Date.now();
          const isNewBurst = now - lastNudgeRef.current > 500;
          lastNudgeRef.current = now;
          if (isNewBurst) pushHistory();
          if (selected.type === "building") {
            const nextBuildings = buildings.map((x) => x.id === selected.id ? { ...x, x: x.x + dx, y: x.y + dy } : x);
            onUpdate({ ...campus, buildings: nextBuildings, navNodes: syncEntranceNodePositions(nextBuildings, navNodes) });
          } else if (selected.type === "marker") {
            onUpdate({ ...campus, markers: markers.map((m) => m.id === selected.id ? { ...m, x: m.x + dx, y: m.y + dy } : m) });
          } else if (selected.type === "decorAsset") {
            onUpdate({ ...campus, decorAssets: decorAssets.map((d) => d.id === selected.id ? { ...d, x: d.x + dx, y: d.y + dy } : d) });
          } else if (selected.type === "path") {
            onUpdate({
              ...campus,
              paths: paths.map((p) => p.id === selected.id ? { ...p, points: p.points.map((pt) => ({ ...pt, x: pt.x + dx, y: pt.y + dy })) } : p),
            });
          } else if (selected.type === "navNode") {
            const n = outdoorNodes.find((x) => x.id === selected.id);
            if (!n || n.entranceId) return;
            onUpdate({
              ...campus,
              navNodes: navNodes.map((x) => x.id === selected.id
                ? { ...x, x: Math.max(0, Math.min(cw, x.x + dx)), y: Math.max(0, Math.min(ch, x.y + dy)) }
                : x),
            });
          }
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); runSave(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "g") { e.preventDefault(); setSnapGrid((v) => !v); }
      // B5 Phase 2.1: copy / paste / duplicate — fresh IDs + relationship remaps,
      // native text behavior preserved by the editable-target guard at the top.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        if (layer === "navigation") copyOutdoorNavSelection(); else copyOutdoorSelection();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        if (layer === "navigation") pasteOutdoorNavSelection(); else pasteOutdoorSelection();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (layer === "navigation") { duplicateOutdoorNavSelection(); return; }
        duplicateOutdoorSelection();
        return;
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [selected, selectedPathPoint, tool, layer, buildings, markers, paths, multiSelected, navNodes, navEdges, decorAssets, outdoorNodes, cw, ch, syncEntranceNodePositions, deleteNavSelection, removeNavNode, onDeleteBuilding, undoEdit, redoEdit, runSave, pushHistory, campus, onUpdate, switchTool, switchLayer, copyOutdoorSelection, pasteOutdoorSelection, duplicateOutdoorSelection, copyOutdoorNavSelection, pasteOutdoorNavSelection, duplicateOutdoorNavSelection, pathMemberEditId]);

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
  const selEntranceParent = effectiveSelected?.type === "entrance" ? buildings.find((b) => b.id === effectiveSelected.buildingId) : undefined;
  const selEntrance = effectiveSelected?.type === "entrance" ? selEntranceParent?.entrances?.find((entrance) => entrance.id === effectiveSelected.id) : undefined;
  const selectedEntranceLinkStatus = selEntrance && selEntranceParent
    ? entranceIndoorLinkStatus(campus, selEntranceParent.id, selEntrance.id)
    : undefined;
  const selectedEntranceDoorOptions = selEntrance && selEntranceParent
    ? indoorDoorOptionsForEntrance(campus, selEntranceParent.id, selEntrance.id)
    : [];
  const selMkr = effectiveSelected?.type === "marker" ? markers.find((m) => m.id === effectiveSelected.id) : undefined;
  const selDecorAsset = effectiveSelected?.type === "decorAsset" ? (campus.decorAssets ?? []).find((d) => d.id === effectiveSelected.id) : undefined;

  // ── B7 Phase 2: contextual issue guidance for the SELECTED object ──
  // Same canonical live list as the global Issues control + on-canvas markers:
  // selecting an object that has a marker explains exactly what is wrong.
  // For a BUILDING the list aggregates the building's own issues PLUS every
  // descendant floor issue, each prefixed with its floor label so the admin
  // knows which floor needs attention without opening it.
  const selectedIssueItems = useMemo(() => {
    if (!effectiveSelected) return [];
    const type = effectiveSelected.type;
    if (type !== "building" && type !== "entrance" && type !== "navNode" && type !== "navEdge") return [];
    let issues: ValidationIssue[];
    if (type === "building") {
      issues = validationIssuesForBuilding(validationIssues, effectiveSelected.id);
    } else {
      issues = validationIssuesForCampusSelection(validationIssues, type, effectiveSelected.id);
    }
    const building = type === "building" ? buildings.find((b) => b.id === effectiveSelected.id) : undefined;
    const items = validationIssuesToItems(issues);
    // Prefix floor-scoped rows with the floor label ("Floor 2 — …") so the
    // building panel identifies WHICH floor the issue belongs to.
    if (building) {
      for (const item of items) {
        const issue = issues.find((x) => issueKey(x) === item.key);
        if (!issue) continue;
        const target = resolveIssueTarget(issue);
        if (target?.scope === "floor" && target.floorId) {
          const floor = building.floors.find((f) => f.id === target.floorId);
          if (floor) {
            const prefix = floor.label || `Floor ${floor.number}`;
            item.message = `${prefix} — ${item.message}`;
          }
        }
      }
    }
    return items;
  }, [effectiveSelected, validationIssues, buildings]);
  const connectEntranceToIndoorDoor = useCallback((buildingId: string, entranceId: string, doorNodeId: string) => {
    const existing = findEntranceTransitionForDoor(campus.navNodes ?? [], campus.navEdges ?? [], doorNodeId);
    const existingDoor = existing ? doorNodeForEdge(existing, campus.navNodes ?? []) : undefined;
    const existingEntrance = existing ? (campus.navNodes ?? []).find((n) =>
      (n.id === existing.startNodeId || n.id === existing.endNodeId) && n.entranceId && !n.floorId
    ) : undefined;
    if (existingDoor?.id === doorNodeId && existingEntrance && (existingEntrance.buildingId !== buildingId || existingEntrance.entranceId !== entranceId)) {
      toast.warning("Door already connected", "Choose a different indoor door or remove the existing entrance connection first.");
      return;
    }
    const next = linkEntranceToIndoorDoor(campus, buildingId, entranceId, doorNodeId, genId);
    if (next === campus) {
      toast.warning("Choose an entry-floor door", "Outdoor entrances can only connect to navigation-linked doors on the building entry floor.");
      return;
    }
    pushHistory();
    onUpdate(next);
    toast.success("Indoor connection saved", "The entrance now links to the selected indoor door.");
  }, [campus, onUpdate, pushHistory, toast]);

  const removeEntranceConnection = useCallback((buildingId: string, entranceId: string) => {
    const next = removeEntranceIndoorConnection(campus, buildingId, entranceId);
    if (next === campus) return;
    pushHistory();
    onUpdate(next);
    toast.success("Indoor connection removed", "The entrance, door, and local navigation node were preserved.");
  }, [campus, onUpdate, pushHistory, toast]);

  const viewEntranceIndoorDoor = useCallback((buildingId: string, floorId: string, doorId: string) => {
    onOpenFloor(buildingId, floorId, { type: "door", id: doorId });
  }, [onOpenFloor]);
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

  // ── Tool config for compact palette — contextual per active layer ──
  // Each layer exposes only the tools that genuinely apply to it (e.g.
  // Navigation = Select/Pan/Add Waypoint/Connect Path/Remove; no campus
  // building or Marker tools, and no navigation tools on the Campus layer).
  const layerTools = LAYER_TOOLS[layer] ?? LAYER_TOOLS.campus;
  const toolConfig: { id: SimpleTool; icon: React.ElementType; label: string; shortcut: string; hint: string }[] =
    layerTools.map((t) => ({ id: t.id as SimpleTool, icon: t.icon, label: t.label, shortcut: t.key, hint: t.hint }));

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

            {/* Navigation edge-authoring status (B5 Phase 1) */}
            {layer === "navigation" && tool === "path" && (
              <div data-testid="nav-path-status"
                className="flex items-center gap-1 px-2 h-5 rounded-md border text-[9px] font-semibold shrink-0"
                style={{ background: "color-mix(in srgb,#16a34a 10%,transparent)", borderColor: "color-mix(in srgb,#16a34a 30%,transparent)", color: "#16a34a" }}>
                {navConnectStart ? "Click destination · Shift for H/V · Esc to cancel" : "Select or place start point"}
                {navConnectStart && (
                  <button onClick={() => {
                    setNavConnectStart(null);
                    setNavPreview(null);
                    setNavPreviewPins([]);
                    setNavConnectBends([]);
                    navConnectBendGroupsRef.current = [];
                    connectRedoStackRef.current = [];
                    setConnectBlocked(false);
                  }} className="hover:opacity-70" aria-label="Cancel connection">
                    <X className="h-2 w-2" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Center: Tool palette (main tools, highlighted, perfectly centered) ── */}
          <div className="flex items-center justify-center">
            <div data-testid="editor-toolbar" className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg" style={{ background: "color-mix(in srgb, var(--muted) 30%, transparent)" }}>
              {toolConfig.map((t) => (
                <ToolbarTooltip key={t.id} tool={t.id} label={t.label} shortcut={t.shortcut} hint={t.hint} isActive={tool === t.id}>
                  <button
                    aria-label={t.label}
                    title={t.label}
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
                  isDirty ? "border-primary text-primary bg-primary/10" : "border-border text-foreground hover:bg-muted"
                )}
              >
                {saving ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Saving</>
                ) : (
                  <><MapIcon className="h-3 w-3" /> {isDirty ? "Save" : "Saved"}</>
                )}
              </button>

              <button
                onClick={() => {
                  if (isProcessing) return;
                  // B7 Phase 2: PUBLISH gating lives in PrePublishDialog, which
                  // consumes the canonical live validation list and blocks on
                  // errors / requires explicit warning confirmation there —
                  // severity is the source of truth, never a type hard-code.
                  setShowPublishConfirm(true);
                }}
                disabled={
                  !publishingEnabled || isProcessing || isDirty ||
                  (!isDirty && campus.publishStatus === "published" && !hasDraftChanges && campus.updatedAt === campus.publishedAt)
                }
                title={
                  !publishingEnabled
                    ? "Publishing becomes available in A6"
                    : isDirty
                    ? "Save your draft first before publishing"
                    : campus.publishStatus === "published" && !hasDraftChanges && campus.updatedAt === campus.publishedAt
                      ? "Already published — make changes and save to enable publishing"
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
          {layer === "campus" && (
            <button
              type="button"
              onClick={() => setShowCampusNavOverlay((v) => !v)}
              aria-pressed={showCampusNavOverlay}
              className={cn(
                "ml-1 flex items-center justify-center h-6 w-6 rounded-md border transition-all shrink-0",
                showCampusNavOverlay
                  ? "border-green-500/40 bg-green-500/10 text-green-600"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}
              title={showCampusNavOverlay ? "Hide navigation overlay" : "Show navigation overlay"}
            >
              {showCampusNavOverlay ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
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

      {/* ── Main editor area — stays mounted across layer switches ──
          IMPORTANT: this subtree must NOT be remounted on layer change. A
          per-layer key + AnimatePresence used to remount it, and when the
          exiting layer's editor unmounted its <svg ref={svgRef}> cleanup set
          the shared svgRef to null — silently breaking every subsequent
          pointer→world conversion (waypoints placed at x=0,y=0 in the real
          browser). switchLayer already resets all transient tool state. */}
        <div className="flex flex-1 overflow-hidden min-h-0 relative">
        {/* ── Left: Hierarchy Panel (collapsible) ── */}
        <div className="flex items-stretch">
          <div
            className="transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden shrink-0"
            style={{
              width: hierarchyOpen ? 224 : 0,
              opacity: hierarchyOpen ? 1 : 0,
            }}
          >
            <div className="w-56 h-full bg-card border-r border-border flex flex-col">
              <>
                {tool === "path" && layer !== "navigation" && (
                  <div data-testid="paint-controls" className="border-b border-border p-2 space-y-2">
                    <div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">
                      <GitBranch className="h-3 w-3" />
                      Pathway Segment
                      <HelpCircle
                        className="h-3 w-3"
                        aria-label="Pathway authoring help"
                        title="Drag to create a straight path. Alignment guides help with horizontal, vertical and diagonal placement. Hold Shift to constrain to 45-degree angles. Select endpoints to extend or join paths."
                      />
                    </div>
                    <p className="text-[10px] leading-snug text-muted-foreground">
                      Drag to create a straight path. Guides help alignment. Hold Shift for 45-degree angles. Select endpoints to extend or join paths.
                    </p>
                    <div className="space-y-1">
                      {PATH_PAINT_TYPES.map((type) => (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => {
                            setPathPaintType(type.value);
                            setPathPaintWidth(type.defaultWidth);
                          }}
                          aria-pressed={pathPaintType === type.value}
                          className={cn(
                            "w-full rounded-md border px-2 py-1 text-left text-[10px] font-bold",
                            pathPaintType === type.value ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          )}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[9px] font-bold text-muted-foreground">
                        <span>Width</span>
                        <span>{pathPaintWidth}</span>
                      </div>
                      <input
                        aria-label="Pathway width"
                        type="range"
                        min={6}
                        max={36}
                        step={2}
                        value={pathPaintWidth}
                        onChange={(e) => setPathPaintWidth(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                    </div>
                  </div>
                )}
                <div className="min-h-0 flex-1" data-testid={layer === "navigation" ? "navigation-hierarchy-sidebar" : undefined}>
                  <HierarchyPanel
                    campus={campus}
                    selected={selected}
                    onSelect={handleHierarchySelect}
                    onOpenFloor={requestOpenFloor}
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
                    decorAssetCount={(campus.decorAssets ?? []).filter((asset) => asset.type !== "ground-area").length}
                    assetsEnabled={layer !== "navigation"}
                  />
                </div>
              </>
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
          selectedPathPoint={selectedPathPoint}
          showGroupOutline={showGroupOutline}
          rubberBand={rubberBand}
          drawingPath={drawingPath}
          pathPaintPreview={pathPaintPreview}
          navNodes={outdoorNodes}
          navEdges={outdoorEdges}
          showNavigationOverlay={layer === "campus" && showCampusNavOverlay}
          navConnectStartId={navConnectStart}
          navPreview={navPreview}
          navConnectBends={navConnectBends}
          navPreviewPins={navPreviewPins}
          navEntranceHover={navEntranceHover}
          connectBlocked={connectBlocked}
          navBlockedEdgeIds={outdoorBlockedEdgeIds}
          edgeSnapPreview={waypointEdgeSnap}
          onGroupSurfaceDown={onGroupSurfaceDown}
          onPathGroupScaleStart={onPathGroupScaleStart}
          onPathGroupRotateStart={onPathGroupRotateStart}
          pathGroupRotationActive={!!pathGroupRotating.current}
          pathGroupRotationBounds={pathGroupRotationBounds}
          pathMemberEditId={pathMemberEditId}
          onNavEdgeSelect={(e, id) => {
            e.stopPropagation();
            if (tool !== "select") return;
            // B5 Phase 1.6: Shift-click toggles an edge's membership in the
            // multi-selection (same semantics as waypoint shift-click).
            if (e.shiftKey) {
              const base = multiSelected.length > 0 ? multiSelected : selected ? [selected.id] : [];
              const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
              setShowAlignTools(next.length > 1);
              if (next.length > 1) {
                setMultiSelected(next);
                setSelected({ type: "navEdge", id });
              } else if (next.length === 1) {
                setMultiSelected([]);
                setSelected(selectionForId(next[0]));
              } else {
                setMultiSelected([]);
                setSelected(null);
              }
              setGuides([]);
              return;
            }            setSelected({ type: "navEdge", id });
            setMultiSelected([]);
            // B5 Phase 6.8: Floor-parity SEGMENT DRAG — pointerdown on the LINE of
            // the ALREADY-selected edge arms an orthogonal segment drag. Straight
            // axis-aligned edges arm too (the drag builds a U-dog-leg), so the
            // user never has to hunt for a bend handle first. Legacy diagonal
            // segments are not draggable (never auto-rewritten).
            { const isAlreadySel = selected?.type === "navEdge" && selected.id === id;
            if (isAlreadySel && tool === "select") {
              const edge = navEdges.find((ed) => ed.id === id);
              if (edge) {
                const pt = getPoint(e, cw, ch);
                // Build full polyline from node positions + bends
                const startN = outdoorNodes.find((n) => n.id === edge.startNodeId);
                const endN = outdoorNodes.find((n) => n.id === edge.endNodeId);
                if (startN && endN) {
                  const segPts = [{ x: startN.x, y: startN.y }, ...(edge.bendPoints ?? []), { x: endN.x, y: endN.y }];
                  let best = 0; let bestD = Infinity;
                  for (let i = 0; i < segPts.length - 1; i++) {
                    const d = distanceToSegment(pt, segPts[i], segPts[i + 1]);
                    if (d < bestD) { bestD = d; best = i; }
                  }
                  const p0 = segPts[best]; const p1 = segPts[best + 1];
                  if (p0.x === p1.x || p0.y === p1.y) {
                    gestureHistoryPushed.current = false;
                    gestureChangedRef.current = false;
                    navSegDragWarnedRef.current = false;
                    navSegDragRef.current = {
                      edgeId: id, segIndex: best, ox: pt.x, oy: pt.y,
                      origBends: [...(edge.bendPoints ?? [])], origPts: segPts,
                      isHorizontal: p0.y === p1.y,
                    };
                  }
                }
              }
            } }


          }}
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
          onPathDown={onPathDown}
          onPathPointDown={onPathPointDown}
          onPathExtendStart={onPathExtendStart}
          onPathAddPoint={onPathAddPoint}
          onPathWidthDown={onPathWidthDown}
          onNavEdgeBendDown={onNavEdgeBendDown}
          onNavEdgeAddBend={onNavEdgeAddBend}
          onEntranceDown={onEntranceDown}
          onItemContextMenu={handleContextMenu}
          onResizeStart={handleResizeStart}
          onRotateStart={handleRotateStart}
          onDecorRotateStart={handleDecorRotateStart}
          onDecorResizeStart={handleDecorResizeStart}
          decorRotatingId={decorRotatingId}
          decorResizingId={decorResizingId}
          onBuildingDoubleClick={handleBuildingDoubleClick}
          onPathClick={onPathClick}
          onPathDblClick={onPathDblClick}
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
          issueMarkers={campusMarkerLayer}
        />

        {/* B7 Correction: locate flash overlay removed — locate behavior now
            relies on object selection, Properties sidebar, and contextual
            "Needs attention" section for a precise, non-misaligned result. */}
        {null}

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
              <button
                onClick={() => setShowGroupOutline((value) => !value)}
                className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center transition-all",
                  showGroupOutline
                    ? "bg-primary/10 text-primary hover:bg-primary/15"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                title={showGroupOutline ? "Hide group outline" : "Show group outline"}
                aria-label={showGroupOutline ? "Hide group outline" : "Show group outline"}
                aria-pressed={showGroupOutline}
              >
                <Square className="h-3.5 w-3.5" />
              </button>
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
          issueItems={selectedIssueItems}
          selBldg={selBldg}
          selEntrance={selEntrance}
          selEntranceParent={selEntranceParent}
          selMkr={selMkr}
          selPath={selected?.type === "path" ? paths.find((p) => p.id === selected.id) : undefined}
          allPaths={paths}
          selectedPathPoint={selectedPathPoint}
          selectedPathPointIsJunction={!!selectedPathPoint && pathPointIsJunction(selectedPathPoint.pathId, selectedPathPoint.pointIndex)}
          selectedPathPointCanBeRemoved={selectedPathPointCanBeRemoved()}
          selRoute={selRoute}
          allBuildings={buildings}
          allNavNodes={campus.navNodes ?? []}
          allNavEdges={campus.navEdges ?? []}
          entranceLinkStatus={selectedEntranceLinkStatus}
          entranceDoorOptions={selectedEntranceDoorOptions}
          selNavNode={selected?.type === 'navNode' ? (campus.navNodes ?? []).find(n => n.id === selected.id) : undefined}
          selNavEdge={selected?.type === 'navEdge' ? (campus.navEdges ?? []).find(e => e.id === selected.id) : undefined}
          navEdgeBlocked={selected?.type === 'navEdge' ? outdoorBlockedEdgeIds.has(selected.id) : undefined}
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
            const nextBuildings = buildings.filter(b => !ids.includes(b.id));
            const { nodes, edges } = pruneOrphanedEntranceNodes(nextBuildings, navNodes, navEdges);
            const next: Campus = {
              ...campus,
              buildings: nextBuildings,
              navNodes: nodes,
              navEdges: edges,
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
          onAddEntrance={onAddEntrance}
          onSelectEntrance={onSelectEntrance}
          onUpdateEntrance={onUpdateEntrance}
          onDeleteEntrance={onDeleteEntrance}
          onConnectEntranceToDoor={connectEntranceToIndoorDoor}
          onRemoveEntranceConnection={removeEntranceConnection}
          onViewEntranceIndoorDoor={viewEntranceIndoorDoor}
          onUpdateMarker={onUpdateMarker}
          onUpdatePath={onUpdatePath}
          onAddPathBend={onAddPathBend}
          onRemoveSelectedPathPoint={onRemoveSelectedPathPoint}
          onDisconnectSelectedPathPoint={onDisconnectSelectedPathPoint}
          onAddWaypointAtSelectedPathPoint={onAddWaypointAtSelectedPathPoint}
          onAddPathToNavigation={onAddPathToNavigation}
          onAddPathNetworkToNavigation={onAddPathsToNavigation}
          onGroupPaths={onGroupPaths}
          onUngroupPaths={onUngroupPaths}
          pathMemberEditing={!!pathMemberEditId}
          onExitPathMemberEdit={() => setPathMemberEditId(null)}
          onDeletePath={onDeletePath}
          onUpdateRoute={onUpdateRoute}
          onUpdateNavNode={(id, changes) => {
            pushHistory();
            onUpdate({ ...campus, navNodes: (campus.navNodes ?? []).map(n => n.id === id ? { ...n, ...changes } : n) });
          }}
          onDeleteNavNode={(id) => {
            // Deterministic connected-edge cleanup — never leave dangling edges.
            const connected = navEdges.filter((e) => e.startNodeId === id || e.endNodeId === id).length;
            const next = removeNavNode(navNodes, navEdges, id);
            pushHistory();
            onUpdate({ ...campus, navNodes: next.nodes, navEdges: next.edges });
            setSelected(null);
            if (connected > 0) {
              toast.success("Waypoint deleted", `Removed ${connected} connected connection${connected !== 1 ? "s" : ""}.`);
            }
          }}
          onUpdateNavEdge={(id, changes) => {
            pushHistory();
            onUpdate({ ...campus, navEdges: (campus.navEdges ?? []).map(e => e.id === id ? { ...e, ...changes } : e) });
          }}
          onBatchUpdatePaths={(ids, changes) => {
            const next: Campus = { ...campus, paths: paths.map((path) => ids.includes(path.id) ? { ...path, ...changes } : path) };
            onUpdate(next);
            pushHistory(next);
          }}
          onBatchDeletePaths={(ids) => {
            const next: Campus = { ...campus, paths: paths.filter((path) => !ids.includes(path.id)) };
            onUpdate(next);
            pushHistory(next);
            setMultiSelected([]);
            setSelected(null);
            setShowAlignTools(false);
          }}
          onAddNavEdgeBend={(id) => {
            const edge = navEdges.find((e) => e.id === id);
            const start = navNodes.find((n) => n.id === edge?.startNodeId);
            const end = navNodes.find((n) => n.id === edge?.endNodeId);
            if (!edge || !start || !end) return;
            const points = [{ x: start.x, y: start.y }, ...(edge.bendPoints ?? []), { x: end.x, y: end.y }];
            const segmentIndex = Math.max(0, Math.floor((points.length - 1) / 2));
            const a = points[segmentIndex];
            const b = points[segmentIndex + 1] ?? a;
            onNavEdgeAddBend(id, segmentIndex, { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) });
          }}
          onRemoveNavEdgeBend={(id) => onNavEdgeRemoveBend(id)}
          onStraightenNavEdge={(id) => onStraightenNavEdge(id)}
          onBatchUpdateNavEdges={(ids, action) => {
            // B5 final fix: bulk-routing buttons are SEMANTIC actions — a
            // positive/negative classification reopens the connections
            // (closed=false) instead of merging one field onto a stale state.
            // ONE history entry for the whole batch.
            const next = { ...campus, navEdges: applyBulkRoutingAction(campus.navEdges ?? [], ids, action) };
            onUpdate(next);
            pushHistory(next);
          }}
          onDeleteNavSelection={(nodeIds, edgeIds) => deleteNavSelection(nodeIds, edgeIds)}
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
        </div>

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

      {/* ── Shared unsaved-changes dialog (portal: covers the FULL viewport) ── */}
      <UnsavedChangesDialog
        open={unsavedGuard.open}
        isDirty={isDirty}
        saving={unsavedGuard.saving}
        error={unsavedGuard.error}
        description={
          unsavedGuard.pendingDescription ??
          `Your latest edits haven't been saved yet.${campus.publishStatus === "published" ? " The live map is still showing the previous published version." : ""}`
        }
        onCancel={unsavedGuard.cancel}
        onSave={unsavedGuard.saveAndContinue}
        onDiscard={unsavedGuard.discard}
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


    </div>
    </div>
  );
}
