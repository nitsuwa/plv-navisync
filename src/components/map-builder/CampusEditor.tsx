import { Fragment, useState, useRef, useCallback, useEffect, useMemo, type ElementType } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft, Globe, Map as MapIcon, CheckCircle2, Undo2, Redo2, X,
  AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignEndVertical,
  AlignVerticalJustifyCenter, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
  Grid3X3, Magnet, ZoomIn, ZoomOut, Maximize2, Settings2,
  MousePointer2, Square, MapPin, GitBranch, Trash2, Hand, Keyboard, AlertTriangle,
  Loader2, HelpCircle, ChevronLeft, Eye, EyeOff, Route, Waypoints, Star,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useCanvasControls, isSpacePressed } from "./useCanvasControls";
import { Canvas } from "./Canvas";
import { HierarchyPanel } from "./HierarchyPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { exteriorEmergencyStairSafeOffsetRange, exteriorEmergencyStairVisualDimensions } from "./ReadonlyOutdoorVisuals";
import { RoutesPanel } from "./RoutesPanel";
import { SaveScreen } from "./SaveScreen";
import { LAYER_TOOLS, BUILDING_COLORS } from "./constants";
import { genId } from "./constants";
import { useToast } from "../../hooks/useToast";
import type { ValidationIssue } from "./ValidationErrorsDialog";
import { ContextMenu } from "./ContextMenu";
import { PrePublishDialog } from "./PrePublishDialog";
import { TestNavigationPanel, useTestRouteSession, type TestRouteHighlight, type TestRouteTransitionMarker } from "./TestNavigationPanel";
import { ShortcutCheatSheet } from "./ShortcutCheatSheet";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";
import { IssuesPopover } from "./IssuesPopover";
import type {
  Campus, CampusBuilding, CampusMarker, CampusSelection,
  SimpleTool, EditorLayer, RubberBand, CampusRoute, CampusPath,
  CampusDecorAsset, BuildingTypeDescriptor, CampusEntrance, NavigationNode, NavigationEdge, FloorSelection, ExteriorEmergencyStair,
} from "./types";
import { BUILDING_TYPE_MAP, DECOR_ASSET_MAP, getRotatedAABB, groundTypeForDecorType, isDecorAreaType } from "./constants";
import { ToolbarTooltip } from "./ToolbarTooltip";
import { validateCampusData, computeBuildingOverlaps } from "../../lib/campusValidation";
import { nextBuildingCopyIdentity, nextDefaultBuildingIdentity, type BuildingIdentity } from "../../lib/buildingDefaults";
import { computeLiveValidationIssues, validationIssuesForCampusSelection, validationIssuesForBuilding } from "../../lib/liveValidation";
import { validationIssuesToItems } from "./ObjectIssueSection";
import { resolveIssueTarget, issueKey, floorSelectionForTarget, resolveIssueLocateTarget, polylineMidpoint } from "../../lib/issueLocate";
import type { IssueTarget } from "./ValidationErrorsDialog";
import { computeBuildingPlacement, resetTransientToolState, pointInBuilding, polylineCrossesBuilding, polylineCrossesObstacle, polylineCrossesObstacleAfterSourceDeparture, type OutdoorSourceDeparture } from "../../lib/editorPlacement";
import { computeGroupTranslation, groupBBoxAfterTranslation, computeGroupAlignmentGuides, snapRectToVisibleBounds, computeGroupResizeBounds, resizeGroupMembers, clampMemberTranslation, memberVisibleBounds, type GroupResizeCorner, type GroupResizeBounds } from "../../lib/campusGroupMove";
import {
  createNavNode, createNavEdge, findDuplicateNavEdge, isSelfEdge, removeNavNode, findNavNodeAtPoint,
  findEntranceNavNode, navGraphSelectionIdsInRect, syncEntranceNodePositions, pruneOrphanedEntranceNodes,
  outdoorNavNodes, outdoorNavEdges, findNavEdgeAtPoint, nearestPointOnEdgePolyline, NAV_NODE_HIT_THRESHOLD,
  translateSelectedNavGraph, navGroupSelectionBounds, applyBulkRoutingAction,
} from "../../lib/navigationGraph";
import type { GroupMoveMember } from "../../lib/campusGroupMove";
import { reorderOutdoorStack } from "../../lib/campusStack";
import type { LayerOrderAction } from "../../lib/campusLayerOrder";
import { duplicateDecorAsset } from "../../lib/decorAsset";
import { decorRenderScale, decorWorldSize } from "../../lib/decorVisual";
import { outdoorGroupSelectionBounds, outdoorSelectionIdsInRect, pathSelectionBounds, selectionRectFromPoints } from "../../lib/campusSelection";
import { arrangeSelectedOutdoorObjects, selectedOutdoorCount, type OutdoorArrangementAction } from "../../lib/campusArrangement";
import { alignEntranceAttachment, defaultEntrance, normalizeBuildingEntrances, promotePrimaryEntrance, updateBuildingEntrance, entranceWorldPosition, findEntranceAtPoint, entranceDisplayName } from "../../lib/buildingEntrances";
import { createDefaultFloor, duplicateFloorForBuilding } from "../../lib/floorPlanNormalization";
import { navEdgePolylineDistance, orthogonalBendsFor, translateOrthogonalSegment, translateStraightSegment, normalizeBendPoints, edgePolylinePoints, navAlignSnap } from "../../lib/indoorNavigationGraph";
import {
  doorNodeForEdge,
  entranceOutdoorLinkStatus,
  entranceIndoorLinkStatus,
  entryFloorForBuilding,
  findEntranceTransitionForDoor,
  findEntranceOutdoorConnection,
  indoorDoorOptionsForEntrance,
  linkEntranceToIndoorDoor,
  reconcileEntranceTransitions,
  reconcileEntranceOutdoorConnections,
  removeEntranceOutdoorConnection,
  removeEntranceIndoorConnection,
  reconcileEntranceDoors,
} from "../../lib/entranceTransitions";
import { entranceConnectorDistance, entranceConnectorGeometry } from "../../lib/entranceConnector";
import {
  canonicalExteriorEmergencyStairsForBuilding,
  defaultExteriorEmergencyStairAttachment,
  exteriorEmergencyStairEdgeForPointer,
  exteriorEmergencyStairOffsetForPointer,
  exteriorEmergencyStairWallSpansOverlap,
  exteriorEmergencyStairWorldPosition,
  pruneOrphanedExteriorEmergencyStairNodes,
  syncExteriorEmergencyStairGraph,
} from "../../lib/exteriorEmergencyStairs";
import { convertPathwaysToNavigation, pathwayHasLegacyNavigationChain, pathwayHasOwnedNavigation, reconcilePathwayNavigation } from "../../lib/campusPathNavigation";
import {
  isPathwayGeneratedEdge,
  isPathwayGeneratedNode,
  movePathMemberPreservingJunctions,
  pathNetworkNavigationStatus,
  pathNetworkSelectionIds,
} from "../../lib/campusPathNetwork";
import { alignCampusGateAnchor, campusGateSize, isCampusGate, syncCampusGateNavigation } from "../../lib/campusGates";
import { campusContentBounds, resizeCampusCanvasFromHandle, campusObjectSafeBounds, CAMPUS_OBJECT_SAFE_INSET, type CanvasResizeHandle } from "../../lib/campusCanvas";
import { collectOutdoorClipboardSelection, isFreeOutdoorWaypoint, type OutdoorClipboardEntry } from "../../lib/outdoorClipboard";

/** Uniformly reduce a rendered rectangle only when its transformed bounds
 * cannot fit inside the physical canvas safe frame. */
const fitDecorSizeToCanvas = (
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  canvasW: number,
  canvasH: number,
  inset = CAMPUS_OBJECT_SAFE_INSET,
) => {
  const safe = campusObjectSafeBounds(canvasW, canvasH, inset);
  const aabb = getRotatedAABB(x - width / 2, y - height / 2, width, height, rotation);
  const centerAvailableW = Math.max(1, 2 * Math.min(x - safe.minX, safe.maxX - x));
  const centerAvailableH = Math.max(1, 2 * Math.min(y - safe.minY, safe.maxY - y));
  const factor = Math.min(
    1,
    centerAvailableW / Math.max(1, aabb.width),
    centerAvailableH / Math.max(1, aabb.height),
  );
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)), factor };
};

const constrainDecorAssetToCanvas = (asset: CampusDecorAsset, canvasW: number, canvasH: number) => {
  const template = DECOR_ASSET_MAP[asset.type];
  if (!template) return asset;
  const area = isDecorAreaType(asset.type);
  const size = area
    ? { width: Math.max(1, asset.width ?? template.defaultWidth), height: Math.max(1, asset.height ?? template.defaultHeight) }
    : decorWorldSize(template, asset.scale);
  const delta = clampMemberTranslation(
    { kind: "decorAsset", id: asset.id, x: asset.x, y: asset.y, width: size.width, height: size.height, rotation: asset.rotation ?? 0 },
    0,
    0,
    canvasW,
    canvasH,
    CAMPUS_OBJECT_SAFE_INSET,
  );
  return { ...asset, x: Math.round(asset.x + delta.dx), y: Math.round(asset.y + delta.dy) };
};

/** Keep an ordinary physical building's rendered bounds inside the small
 * authoring frame.  Property-panel edits use this same rule as pointer drags
 * so a numeric position/size change cannot bypass the canvas boundary. */
const constrainBuildingToCanvas = (building: CampusBuilding, canvasW: number, canvasH: number) => {
  const fitted = fitDecorSizeToCanvas(
    building.x + building.width / 2,
    building.y + building.height / 2,
    building.width,
    building.height,
    building.rotation ?? 0,
    canvasW,
    canvasH,
  );
  const sized = fitted.factor < 1
    ? {
        ...building,
        width: Math.max(20, fitted.width),
        height: Math.max(20, fitted.height),
        x: Math.round(building.x + (building.width - fitted.width) / 2),
        y: Math.round(building.y + (building.height - fitted.height) / 2),
      }
    : building;
  const delta = clampMemberTranslation(
    { kind: "building", id: sized.id, x: sized.x, y: sized.y, width: sized.width, height: sized.height, rotation: sized.rotation ?? 0 },
    0,
    0,
    canvasW,
    canvasH,
    CAMPUS_OBJECT_SAFE_INSET,
  );
  return { ...sized, x: Math.round(sized.x + delta.dx), y: Math.round(sized.y + delta.dy) };
};

const fitBuildingRectToCanvas = (rect: { x: number; y: number; width: number; height: number; rotation?: number }, canvasW: number, canvasH: number) => {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const fitted = fitDecorSizeToCanvas(centerX, centerY, rect.width, rect.height, rect.rotation ?? 0, canvasW, canvasH);
  if (fitted.factor >= 1) return rect;
  return {
    ...rect,
    width: Math.max(20, fitted.width),
    height: Math.max(20, fitted.height),
    x: Math.round(centerX - fitted.width / 2),
    y: Math.round(centerY - fitted.height / 2),
  };
};

// ── Per-layer marker configuration ──
const LAYER_MARKER_CONFIG: Record<string, { name: string; type: string; color: string }> = {
  campus: { name: "Point of Interest", type: "poi", color: "#0e2a6e" },
  navigation: { name: "Walking Point", type: "waypoint", color: "#16a34a" },
  accessibility: { name: "Ramp", type: "ramp", color: "#2563eb" },
  emergency: { name: "Emergency Exit", type: "exit", color: "#dc2626" },
  events: { name: "Event Marker", type: "event", color: "#d97706" },
};

type UnifiedCampusTool = {
  key: string;
  id: SimpleTool;
  icon: ElementType;
  label: string;
  shortcut: string;
  hint: string;
  domain: "shared" | "physical" | "navigation" | "context";
  dividerBefore?: boolean;
};

/**
 * Fingerprint only the Building-owned Exterior Emergency Stair graph pieces.
 * The Campus editor can receive a legacy/hydrated campus where generated
 * landing/discharge nodes have not yet been reconciled; keeping this narrow
 * avoids turning an unrelated canvas edit into a dirty-state write.
 */
function exteriorEmergencyGraphFingerprint(campus: Campus): string {
  const stairIds = new Set(
    (campus.buildings ?? []).flatMap((building) =>
      canonicalExteriorEmergencyStairsForBuilding(building).map((stair) => stair.id),
    ),
  );
  const nodes = (campus.navNodes ?? [])
    .filter((node) => !!node.exteriorEmergencyStairId && stairIds.has(node.exteriorEmergencyStairId))
    .map((node) => [node.id, node.buildingId, node.floorId, node.stairId, node.exteriorEmergencyStairId, node.x, node.y]);
  const edges = (campus.navEdges ?? [])
    .filter((edge) => nodes.some(([id]) => id === edge.startNodeId || id === edge.endNodeId))
    .map((edge) => [edge.id, edge.startNodeId, edge.endNodeId, edge.type, edge.closed, edge.emergencySafe]);
  const owners = (campus.buildings ?? []).flatMap((building) =>
    canonicalExteriorEmergencyStairsForBuilding(building).map((stair) => [
      building.id,
      stair.id,
      stair.sharedId,
      stair.outdoorNodeId,
      stair.servedFloorIds,
      stair.occurrenceNodeIds,
      stair.floorConnectionSnapshots,
    ]),
  );
  return JSON.stringify({ owners, nodes, edges });
}

const UNIFIED_CAMPUS_TOOLS: UnifiedCampusTool[] = [
  { key: "select", id: "select", icon: MousePointer2, label: "Select", shortcut: "V", hint: "Select, move, resize, and edit items on the canvas.", domain: "shared" },
  { key: "pan", id: "pan", icon: Hand, label: "Pan", shortcut: "Space", hint: "Move around the campus canvas without changing any objects.", domain: "shared" },
  { key: "building", id: "building", icon: Square, label: "Building", shortcut: "B", hint: "Add a building footprint, then configure its name, floors, entrances, and other details.", domain: "physical", dividerBefore: true },
  { key: "pathway", id: "path", icon: Route, label: "Pathway", shortcut: "P", hint: "Draw a campus pathway, then use it to build the walking network.", domain: "physical" },
  { key: "walking-point", id: "marker", icon: MapPin, label: "Walking Point", shortcut: "M", hint: "Add a Walking Point when physical pathways do not provide the routing point you need.", domain: "navigation", dividerBefore: true },
  { key: "connect", id: "connect", icon: Waypoints, label: "Connect", shortcut: "P", hint: "Connect Walking Points and entrances for routes that need a manual connection.", domain: "navigation" },
  { key: "remove-navigation", id: "erase", icon: Trash2, label: "Remove", shortcut: "E", hint: "Remove Walking Points or Walking Paths from the navigation network.", domain: "navigation" },
];

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
  { value: "parking", label: "Parking" },
  { value: "field", label: "Open Field" },
];
const GROUND_BRUSH_SIZES = [1, 2, 3, 5];
const PATH_PAINT_TYPES: { value: CampusPath["type"]; label: string; color: string; defaultWidth: number }[] = [
  { value: "walkway", label: "Walkway", color: "#b4535a", defaultWidth: 12 },
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

/**
 * Preserve the authored Connect draft exactly.  `normalizedEdgeBends` is
 * intentionally allowed to remove collinear middle points for ordinary
 * generated edges, but that is not valid for an in-progress Connect draft:
 * every click (including a click which happens to land on the same axis as
 * the next pointer position) is an intentional bend.  Only consecutive
 * duplicate/zero-length points and endpoint duplicates are removed here.
 */
const preserveAuthoredConnectBends = (
  start: { x: number; y: number },
  bends: { x: number; y: number }[],
  end: { x: number; y: number },
): { x: number; y: number }[] => {
  const roundedStart = { x: Math.round(start.x), y: Math.round(start.y) };
  const roundedEnd = { x: Math.round(end.x), y: Math.round(end.y) };
  const out: { x: number; y: number }[] = [];
  for (const bend of bends) {
    const point = { x: Math.round(bend.x), y: Math.round(bend.y) };
    const previous = out[out.length - 1];
    if (previous && Math.abs(previous.x - point.x) <= 2 && Math.abs(previous.y - point.y) <= 2) continue;
    if (Math.abs(point.x - roundedStart.x) <= 2 && Math.abs(point.y - roundedStart.y) <= 2) continue;
    if (Math.abs(point.x - roundedEnd.x) <= 2 && Math.abs(point.y - roundedEnd.y) <= 2) continue;
    out.push(point);
  }
  return out;
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
  const otherAssets = assets.filter((asset) => asset.type !== "ground-area" || (asset.surfaceCells?.length ?? 0) > 0);
  let groundRects: GroundPatchRect[] = assets
    .filter((asset) => asset.type === "ground-area" && !(asset.surfaceCells?.length ?? 0))
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
    if (asset.type !== "ground-area" || asset.locked || (asset.surfaceCells?.length ?? 0) > 0) {
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
  // Keep the true projection. Physical Pathway/manual-path connection points
  // must lie on the selected segment; rounding a diagonal projection can move
  // the inserted vertex visibly off the line.
  const projected = { x: a.x + t * dx, y: a.y + t * dy };
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
  /** Open the read-only Student Preview; the page handles Save & Preview. */
  onPreviewStudent?: (c: Campus, isDirty: boolean) => void | Promise<void>;
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

export function CampusEditor({ campus, onBack, onUpdate, onSave, onPublish, onPreviewStudent, publishingEnabled = true, onOpenFloor, onAddBuilding, onOpenCanvasSettings, savedSnapshot }: CampusEditorProps) {
  const campusRef = useRef(campus);
  useEffect(() => { campusRef.current = campus; }, [campus]);
  // `save_campus_structure` retires removed Buildings as archived rows. Their
  // campus/code uniqueness key remains occupied, so keep every generated
  // default identity reserved until this campus editor session ends.
  const defaultBuildingReservationsRef = useRef<{ campusId: string; values: BuildingIdentity[] } | null>(null);
  if (defaultBuildingReservationsRef.current?.campusId !== campus.id) {
    defaultBuildingReservationsRef.current = {
      campusId: campus.id,
      values: (campus.buildings ?? []).map(({ name, code }) => ({ name, code })),
    };
  }
  const [tool, setTool] = useState<SimpleTool>("select");
  const [selected, setSelected] = useState<CampusSelection | null>(null);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [propertiesDismissed, setPropertiesDismissed] = useState(false);
  const [hoveredPathId, setHoveredPathId] = useState<string | null>(null);
  const [drawingPath, setDP] = useState<{ x: number; y: number }[]>([]);
  // ── B5 Phase 1: navigation-layer Path tool = edge authoring. navConnectStart
  // is the node the admin is connecting FROM; navPreview is the live pointer
  // position (or hovered node) shown as a dashed preview before the edge commits.
  const [navConnectStart, setNavConnectStart] = useState<string | null>(null);
  const [navConnectBends, setNavConnectBends] = useState<{ x: number; y: number }[]>([]);
  const [navPreview, setNavPreview] = useState<{ x: number; y: number } | null>(null);
  // Connect preview is transient UI. Keep the latest pointer result in refs and
  // flush it at most once per animation frame so a busy Outdoor canvas does not
  // rerender the entire editor for every mouse event.
  const connectPreviewFrameRef = useRef<number | null>(null);
  const connectPreviewPendingRef = useRef<{
    point: { x: number; y: number } | null;
    pins: { x: number; y: number }[];
    blocked: boolean;
  } | null>(null);
  const connectPreviewFrameKindRef = useRef<"raf" | "timeout" | null>(null);
  const cancelConnectPreviewFrame = useCallback(() => {
    const frame = connectPreviewFrameRef.current;
    if (frame !== null) {
      if (connectPreviewFrameKindRef.current === "raf" && typeof window !== "undefined") {
        window.cancelAnimationFrame(frame);
      } else if (typeof window !== "undefined") {
        window.clearTimeout(frame);
      }
      connectPreviewFrameRef.current = null;
      connectPreviewFrameKindRef.current = null;
    }
    connectPreviewPendingRef.current = null;
  }, []);
  const queueConnectPreview = useCallback((
    point: { x: number; y: number } | null,
    pins: { x: number; y: number }[] = [],
    blocked = false,
  ) => {
    connectPreviewPendingRef.current = { point, pins, blocked };
    if (connectPreviewFrameRef.current !== null || typeof window === "undefined") return;
    const flush = () => {
      connectPreviewFrameRef.current = null;
      connectPreviewFrameKindRef.current = null;
      const pending = connectPreviewPendingRef.current;
      if (!pending) return;
      setNavPreview(pending.point);
      setNavPreviewPins(pending.pins);
      setConnectBlocked(pending.blocked);
    };
    if (typeof window.requestAnimationFrame === "function") {
      connectPreviewFrameKindRef.current = "raf";
      connectPreviewFrameRef.current = window.requestAnimationFrame(flush);
    } else {
      connectPreviewFrameKindRef.current = "timeout";
      connectPreviewFrameRef.current = window.setTimeout(flush, 0);
    }
  }, []);
  useEffect(() => () => cancelConnectPreviewFrame(), [cancelConnectPreviewFrame]);
  // ── B5 Phase 6.9: the FULL proposed pin shape for the current pointer (the
  // exact geometry a click would pin) — the preview renders this so what the
  // user sees before clicking is what commits (Floor-parity preview == commit).
  const [navPreviewPins, setNavPreviewPins] = useState<{ x: number; y: number }[]>([]);
  // ── B5 Phase 6.1: edge snap preview for waypoint-on-edge insertion ──
  const [waypointEdgeSnap, setWaypointEdgeSnap] = useState<{
    edgeId: string;
    nearest: { x: number; y: number };
    /** Entrance-managed connectors are read-only; expose guidance instead of insertion. */
    helper?: string;
  } | null>(null);
  // Connect-path hover captures the exact manual edge segment + projection so
  // the outdoor mouseup commits the same target the user saw, rather than
  // resolving a fresh nearest endpoint after the pointer has moved slightly.
  const [navPathTargetHover, setNavPathTargetHover] = useState<{
    edgeId: string;
    segmentIndex: number;
    point: { x: number; y: number };
  } | null>(null);
  // ── B5 Phase 6.2: outdoor Connect blocked preview ──
  const [connectBlocked, setConnectBlocked] = useState(false);
  // ── B5 Phase 1.6: entrance target the Add Waypoint / Connect Path tools are
  // currently hovering (highlighted as a special routing target).
  const [navEntranceHover, setNavEntranceHover] = useState<{ buildingId: string; entranceId: string; x: number; y: number } | null>(null);
  // Keep the Connect guidance toast scoped to one armed operation. Repeated
  // clicks on the same Entrance action must not stack identical toasts.
  const connectGuidanceShownRef = useRef(false);
  const [saveScreen, setSaveScreen] = useState<{ open: boolean; state: "saving" | "success" | "error" }>({ open: false, state: "saving" });
  const [layer, setLayer] = useState<EditorLayer>("campus");
  useEffect(() => {
    if (tool !== "connect" || layer !== "navigation" || !navConnectStart) {
      setNavPathTargetHover(null);
    }
  }, [layer, navConnectStart, tool]);
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
  const [canvasSettingsPopoverOpen, setCanvasSettingsPopoverOpen] = useState(false);
  const [canvasSettingsPopoverPosition, setCanvasSettingsPopoverPosition] = useState({ left: 8, top: 8 });
  const canvasSettingsTriggerRef = useRef<HTMLDivElement>(null);
  const canvasSettingsPopoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!canvasSettingsPopoverOpen) return;
    const closeForOutsidePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!canvasSettingsTriggerRef.current?.contains(target) && !canvasSettingsPopoverRef.current?.contains(target)) setCanvasSettingsPopoverOpen(false);
    };
    const closeForEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCanvasSettingsPopoverOpen(false);
    };
    document.addEventListener("mousedown", closeForOutsidePointer);
    document.addEventListener("keydown", closeForEscape);
    return () => {
      document.removeEventListener("mousedown", closeForOutsidePointer);
      document.removeEventListener("keydown", closeForEscape);
    };
  }, [canvasSettingsPopoverOpen]);
  // ── Drag-to-create building ──
  const [buildingDrag, setBuildingDrag] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  // ── Building type placement mode ──
  const [selectedBuildingType, setSelectedBuildingType] = useState<BuildingTypeDescriptor | null>(null);
  // ── Route state ──
  const [selRouteId, setSelRouteId] = useState<string | null>(null);
  // ── Multi-selection ──
  const [multiSelected, setMultiSelected] = useState<string[]>([]);
  useEffect(() => {
    setPropertiesDismissed(false);
    setPropertiesOpen(Boolean(selected || multiSelected.length > 0));
  }, [selected?.type, selected?.id, multiSelected.join("|")]);
  const inspectorVisible = !propertiesDismissed && (propertiesOpen || Boolean(selected || multiSelected.length > 0));
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
  const [exteriorStairPreview, setExteriorStairPreview] = useState<{
    buildingId: string;
    stairId: string;
    edge: "top" | "right" | "bottom" | "left";
    offset: number;
    valid: boolean;
  } | null>(null);
  // Physical outdoor multi-selection resize.  The immutable member snapshot
  // lets every pointer frame derive from the same group bounds and keeps the
  // gesture to one history action on release.
  const groupResizing = useRef<{
    corner: GroupResizeCorner;
    bounds: GroupResizeBounds;
    members: GroupMoveMember[];
    decorScales: Record<string, number>;
  } | null>(null);
  // ── Rename dialog ──
  const [renameDialog, setRenameDialog] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // ── Context menu ──
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: "building" | "marker" | "path" | "decorAsset" | "navNode"; id: string } | null>(null);
  // Generated junctions can belong to several physical Pathways. Alt-click
  // presents an explicit owner choice instead of guessing from coordinates.
  const [pathChoiceMenu, setPathChoiceMenu] = useState<{ x: number; y: number; pathIds: string[]; nodeIds?: string[] } | null>(null);
  // ── Erase/delete confirmation ──
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "building" | "marker" | "path" | "decorAsset"; id: string; name: string } | null>(null);
  // Building Entrances own a generated Ground-floor Door. Keep their
  // cross-editor deletion behind the same custom confirmation affordance as
  // other canonical infrastructure, rather than deleting only one side.
  const [entranceDeleteConfirm, setEntranceDeleteConfirm] = useState<{ buildingId: string; entranceId: string; name: string } | null>(null);
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
  const decorResizing = useRef<{ id: string; corner: string; sx: number; sy: number; ox: number; oy: number; scale: number; hw: number; hh: number; rot: number; width?: number; height?: number; kind?: "ground" | "decor" } | null>(null);
  const [decorResizingId, setDecorResizingId] = useState<string | null>(null);
  // ── Hierarchy panel toggle ──
  const [hierarchyOpen, setHierarchyOpen] = useState(true);
  const testRouteSessionContext = useTestRouteSession();
  const { navigationEnabled, setNavigationEnabled } = testRouteSessionContext;
  // ── Test navigation panel (Navigation layer) ──
  const [testNavOpen, setLocalTestNavOpen] = useState(testRouteSessionContext.open);
  const setTestNavOpen = useCallback((open: boolean) => {
    setLocalTestNavOpen(open);
    testRouteSessionContext.setOpen(open);
  }, [testRouteSessionContext.setOpen]);
  useEffect(() => {
    setLocalTestNavOpen(testRouteSessionContext.open);
  }, [testRouteSessionContext.open]);
  const [testRouteCompact, setTestRouteCompact] = useState(() => Boolean(
    testRouteSessionContext.session?.manualCollapsed
      || (testRouteSessionContext.session?.hasCalculatedRoute && !testRouteSessionContext.session.manualExpanded),
  ));
  const [testRoutePickKind, setTestRoutePickKind] = useState<"start" | "destination" | null>(null);
  const [testRouteMapPick, setTestRouteMapPick] = useState<{ kind: "start" | "destination"; value: string } | null>(null);
  const [testRoutePickHover, setTestRoutePickHover] = useState<{ type: "building" | "entrance" | "gate"; id: string } | null>(null);
  const routePreview = Boolean(testRouteSessionContext.session?.previewRoute && testRouteSessionContext.session?.result);
  // Route Preview is presentation-only. Keep the navigation session available
  // for route rendering, but cancel any in-progress authoring gesture so hidden
  // graph objects cannot retain stale hit targets while preview is active.
  useEffect(() => {
    if (!routePreview) return;
    setTool("select");
    connectGuidanceShownRef.current = false;
    setNavConnectStart(null);
    setNavConnectBends([]);
    setNavPreview(null);
    setNavPreviewPins([]);
    setNavEntranceHover(null);
    setWaypointEdgeSnap(null);
    setConnectBlocked(false);
    setGuides([]);
    setSelected(null);
    setMultiSelected([]);
    setTestRoutePickKind(null);
    setTestRoutePickHover(null);
  }, [routePreview]);
  // ── Routes sidebar panel — NOT auto-opened; user must explicitly toggle ──
  const [showRoutesPanel, setShowRoutesPanel] = useState(false);
  // ── Route highlighted by the test-navigation panel (drawn on the canvas) ──
  const [highlightedRoute, setHighlightedRoute] = useState<TestRouteHighlight | null>(null);
  // The page-level session is the only source of truth for route presentation.
  // If a responsive Test Route host unmounts or the session is cleared, remove
  // any host-local overlay on the same render cycle instead of waiting for the
  // panel's local state effect to catch up.
  useEffect(() => {
    if (!testNavOpen || !testRouteSessionContext.session?.result) setHighlightedRoute(null);
  }, [testNavOpen, testRouteSessionContext.session?.result]);
  // ── Keyboard shortcut cheat sheet ──
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  // Navigation is a visibility/editing overlay on the Campus workspace. The
  // internal layer still identifies which tool domain owns canvas gestures.
  // Navigation visibility is a campus-scoped editor preference. Campus and
  // Floor editors remount while moving through the builder, so keeping this
  // in the existing provider preserves it without saving UI state to campus.
  // Test Route temporarily forces visibility but never overwrites preference.
  const [localNavigationEnabled, setLocalNavigationEnabled] = useState(navigationEnabled || testNavOpen);
  const showCampusNavOverlay = localNavigationEnabled || navigationEnabled || testNavOpen || routePreview;
  const setShowCampusNavOverlay = useCallback((enabled: boolean) => {
    // Test Route temporarily forces the navigation layer on, but it must not
    // block an explicit request to turn Navigation off.  Allowing the off
    // transition through here lets the toolbar close the route session and
    // clear the overlay atomically.
    if (enabled && (testNavOpen || routePreview)) return;
    setLocalNavigationEnabled(enabled);
    setNavigationEnabled(enabled);
  }, [routePreview, setNavigationEnabled, testNavOpen]);
  useEffect(() => {
    // Test Route is a consumer of Navigation visibility, not its owner.  Do
    // not overwrite the editor's navigation preference when the route panel
    // closes; only an explicit Navigation toggle may change that preference.
    if (navigationEnabled) setLocalNavigationEnabled(true);
  }, [navigationEnabled]);
  useEffect(() => {
    setLayer(navigationEnabled || localNavigationEnabled || testNavOpen ? "navigation" : "campus");
  }, [localNavigationEnabled, navigationEnabled, testNavOpen]);
  const [groundPaintType, setGroundPaintType] = useState<CampusDecorAsset["groundType"]>("grass");
  const [groundBrushSize, setGroundBrushSize] = useState(3);
  const [groundBrushPreview, setGroundBrushPreview] = useState<PaintRect | null>(null);
  const groundPaintGesture = useRef<PaintRect | null>(null);
  const [groundEraseSize, setGroundEraseSize] = useState(1);
  const [groundErasePreview, setGroundErasePreview] = useState<PaintRect | null>(null);
  const groundEraseGesture = useRef<PaintRect[]>([]);
  const [armedDecorAssetType, setArmedDecorAssetType] = useState<CampusDecorAsset["type"] | null>(null);
  // Session-scoped authoring preferences: newly placed objects inherit the
  // last size used for that asset type without changing existing objects or
  // persistence shape.
  const lastDecorScalesRef = useRef<Record<string, number>>({});
  const lastMarkerSizesRef = useRef<Record<string, { width: number; height: number }>>({});
  const markerResizing = useRef<{ id: string; corner: string; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number } | null>(null);
  const [markerResizingId, setMarkerResizingId] = useState<string | null>(null);
  const [canvasResizeMode, setCanvasResizeMode] = useState(false);
  const [canvasResizePreview, setCanvasResizePreview] = useState<{ width: number; height: number } | null>(null);
  const [pendingCanvasResize, setPendingCanvasResize] = useState<{ width: number; height: number } | null>(null);
  // The canonical dimensions at the beginning of a resize transaction. All
  // edge drags before Apply are accumulated against the current draft, while
  // Cancel can still restore this exact baseline without touching campus data.
  const canvasResizeOriginalRef = useRef<{ width: number; height: number } | null>(null);
  const canvasResizeRef = useRef<{ handle: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"; startW: number; startH: number; clientX: number; clientY: number } | null>(null);
  const [pathPaintType, setPathPaintType] = useState<CampusPath["type"]>("walkway");
  const [pathPaintWidth, setPathPaintWidth] = useState(12);
  const [pathSettingsOpen, setPathSettingsOpen] = useState(false);
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
  const pendingCanvasResizeClips = useMemo(() => {
    const proposed = pendingCanvasResize ?? canvasResizePreview;
    if (!proposed) return false;
    const bounds = campusContentBounds(campus);
    return bounds.minX < 0 || bounds.minY < 0
      || bounds.maxX > proposed.width
      || bounds.maxY > proposed.height;
  }, [campus, canvasResizePreview, pendingCanvasResize]);
  // ── Path draw-in animation: id of the just-completed path ──
  const [animatingPathId, setAnimatingPathId] = useState<string | null>(null);
  // ── Arrow-key nudge batching (groups rapid nudges into one undo step) ──
  const lastNudgeRef = useRef(0);
  // ── Clear guides + test-route highlight when switching tools or layers ──
  useEffect(() => {
    setGuides([]);
  }, [tool, layer]);
  useEffect(() => {
    if (tool === "connect" && layer === "navigation") return;
    cancelConnectPreviewFrame();
    connectPreviewPendingRef.current = null;
  }, [cancelConnectPreviewFrame, layer, tool]);

  // ── Hierarchy selection also clears multi-selection for sync ──
  const handleHierarchySelect = useCallback((sel: CampusSelection | null) => {
    setMultiSelected([]);
    setShowAlignTools(false);
    setSelected(sel);
    setPropertiesDismissed(false);
    setPropertiesOpen(Boolean(sel));
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
    // Emergency readiness also reads the live outdoor markers and graph. Keep
    // those references in the callback dependencies so adding a Campus Gate
    // or connecting a discharge immediately clears the corresponding issue.
    return validateCampusData(campus, overlappingBuildings, campus.features?.emergencyRoutes === true);
  }, [campus, overlappingBuildings]);

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

  const showConnectGuidance = useCallback(() => {
    if (connectGuidanceShownRef.current) return;
    connectGuidanceShownRef.current = true;
    toast.info("Select a Walking Point or Pathway", "Click an existing Walking Point or a physical Pathway segment to connect this Entrance.");
  }, [toast]);

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
    type: "building" | "marker" | "decorAsset" | "entrance" | "navNode" | "path" | "pathPoint" | "pathPointInsert" | "pathWidth" | "navEdgeBend" | "generatedPathPoint";
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
    /** Explicit physical vertices controlled by a generated-point proxy drag. */
    generatedVertexRefs?: { pathId: string; pointIndex: number }[];
    /** Canonical generated node being proxy-dragged, for self-reference exclusion. */
    generatedNodeId?: string;
  } | null>(null);
  // A generated Walking Point remains selected as a nav object for a click,
  // but becomes a physical-vertex gesture only after the normal drag threshold
  // is crossed. This keeps inspection clicks from mutating the Pathway.
  const generatedPointProxyRef = useRef<{
    nodeId: string;
    sx: number;
    sy: number;
    refs: { pathId: string; pointIndex: number }[];
  } | null>(null);
  const dragGroupStartRef = useRef<GroupMoveMember[] | null>(null);
  const pathGroupOriginRef = useRef<Map<string, { x: number; y: number }[]> | null>(null);
  const suppressPathClickRef = useRef<string | null>(null);
  // A node drag can finish over a physical Pathway.  SVG may still deliver the
  // release/click to that Pathway after the node gesture has been consumed;
  // suppress that one synthetic click so a drag can never fall through to
  // pathway selection/split authoring.
  const suppressNextPathClickRef = useRef(false);
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
  const exteriorStairDragging = useRef<{
    buildingId: string;
    stairId: string;
    edge: "top" | "right" | "bottom" | "left";
    previewEdge: "top" | "right" | "bottom" | "left";
    startEdge: "top" | "right" | "bottom" | "left";
    startOffset: number;
    currentEdge: "top" | "right" | "bottom" | "left";
    currentOffset: number;
  } | null>(null);

  const buildings = campus.buildings;
  const markers = campus.markers;
  const paths = campus.paths;
  const decorAssets = campus.decorAssets ?? [];
  const navNodes = campus.navNodes ?? [];
  const navEdges = campus.navEdges ?? [];

  // Runtime hydration can leave a Building-owned stair visible while its
  // generated landing/discharge graph has not yet been reconciled. Repair
  // only that narrow derived graph seam so Test Route and the Outdoor canvas
  // consume the same live nodes; ordinary campus edits are not touched.
  const exteriorGraphSignature = useMemo(() => exteriorEmergencyGraphFingerprint(campus), [campus]);
  const exteriorGraphSyncRef = useRef<string | null>(null);
  useEffect(() => {
    if (exteriorGraphSyncRef.current === exteriorGraphSignature) return;
    exteriorGraphSyncRef.current = exteriorGraphSignature;
    if (!(campus.buildings ?? []).some((building) => canonicalExteriorEmergencyStairsForBuilding(building).length > 0)) return;
    const synced = syncExteriorEmergencyStairGraph(campus);
    if (exteriorEmergencyGraphFingerprint(synced) !== exteriorGraphSignature) onUpdate(synced);
  }, [campus, exteriorGraphSignature, onUpdate]);

  // Building Entrances own their Ground-floor Door relationship. Reconcile
  // legacy/hydrated campuses as well as newly-authored Entrances so the live
  // Outdoor and Floor editors consume one canonical bridge without requiring
  // a manual Door picker step.
  const entranceDoorSignature = useMemo(() => JSON.stringify((campus.buildings ?? []).map((building) => ({
    id: building.id,
    entrances: (building.entrances ?? []).map((entrance) => ({ id: entrance.id, edge: entrance.edge, offset: entrance.offset, type: entrance.type, name: entrance.name, accessible: entrance.accessible })),
    floors: (building.floors ?? []).map((floor) => ({ id: floor.id, canvasW: floor.canvasW, canvasH: floor.canvasH, doors: (floor.doors ?? []).map((door) => ({ id: door.id, buildingEntranceId: door.buildingEntranceId, x: door.x, y: door.y, label: door.label })) })),
  }))), [campus.buildings]);
  const entranceDoorSyncRef = useRef<string | null>(null);
  useEffect(() => {
    if (entranceDoorSyncRef.current === entranceDoorSignature) return;
    entranceDoorSyncRef.current = entranceDoorSignature;
    const reconciled = reconcileEntranceDoors(campus, genId);
    if (reconciled !== campus) onUpdate(reconciled);
  }, [campus, entranceDoorSignature, onUpdate]);

  // ── B7 Phase 1: restrained on-canvas issue markers ──
  // ONE small badge per affected CAMPUS object (building, entrance, nav node,
  // nav edge) derived from the SAME canonical issue list as the global Issues
  // control. The worst severity per object wins; warnings stay amber, errors
  // stay red; the badge is pointer-events-none (never intercepts canvas
  // interactions) and disappears immediately when the issue is fixed.
  const campusIssueMarkers = useMemo(() => {
    const markers = new Map<string, { severity: "error" | "warning"; selectionType: string; id: string }>();
    for (const issue of validationIssues) {
      // Disconnected-component findings describe a campus/network state, not
      // a defect owned by one arbitrary representative node. They remain in
      // the Issues summary but must never become a per-node canvas badge.
      if (issue.type === "nav_disconnected_component") continue;
      const target = resolveIssueTarget(issue);
      if (!target || target.scope !== "campus") continue;
      // B8: buildings already render their own per-building badge inside the
      // Canvas rotation group — exclude from the global issueMarkers layer to
      // avoid a duplicate warning indicator.
      if (target.selectionType === "building") continue;
      if (target.selectionType !== "entrance" && target.selectionType !== "navNode" && target.selectionType !== "navEdge") continue;
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
  // Reuse one stable node-coordinate lookup for hit testing.  Connect hover
  // runs every animation frame; rebuilding this map per pointer event makes a
  // populated Outdoor canvas needlessly expensive.
  const outdoorNodeMap = useMemo<Record<string, { x: number; y: number }>>(
    () => Object.fromEntries(outdoorNodes.map((node) => [node.id, { x: node.x, y: node.y }])),
    [outdoorNodes],
  );
  // Outdoor route blockers are deliberately conservative: only physical
  // Building footprints are structural obstacles. Decorative campus assets
  // remain visible but do not silently become navigation barriers.
  const outdoorBlockedEdgeIds = useMemo(() => {
    const blocked = new Set<string>();
    for (const e of outdoorEdges) {
      // The canonical Entrance connector is the one legitimate path through a
      // Building boundary. Its own geometry/bridge validation remains
      // authoritative, so do not mark it blocked merely because it reaches the
      // footprint aperture.
      const a = outdoorNodes.find((n) => n.id === e.startNodeId);
      const b = outdoorNodes.find((n) => n.id === e.endNodeId);
      if (!a || !b) continue;
      if (e.type === "entrance_transition"
        || (!!a.entranceId && !a.floorId)
        || (!!b.entranceId && !b.floorId)) continue;
      const pts = [
        { x: a.x, y: a.y },
        ...(isPathwayGeneratedEdge(e) ? [] : (e.bendPoints ?? []).map((p) => ({ x: p.x, y: p.y }))),
        { x: b.x, y: b.y },
      ];
      if (polylineCrossesBuilding(pts, buildings)) blocked.add(e.id);
    }
    return blocked;
  }, [outdoorEdges, outdoorNodes, buildings]);

  // Every pathway mutation passes through the same provenance-aware
  // reconciliation boundary. This keeps generated navigation aligned even
  // when the overlay is hidden, while manual/linked navigation remains intact.
  const upd = (c: Partial<Campus>) => {
    const next = reconcilePathwayNavigation({ ...campus, ...c }, genId);
    pushHistory();
    onUpdate(next);
  };
  // B5 Phase 1.8: any building mutation re-syncs entrance-linked nav nodes so
  // they always match the resolved world position of their linked B3 entrance
  // (no manual navigation repair after a building move/resize/rotate).
  const updBuildings = (b: CampusBuilding[]) => {
    const withEntranceDoors = reconcileEntranceDoors({
      ...campus,
      buildings: b,
      navNodes,
      navEdges,
    }, genId);
    const synced = syncExteriorEmergencyStairGraph({
      ...campus,
      buildings: withEntranceDoors.buildings,
      navNodes: syncEntranceNodePositions(withEntranceDoors.buildings, withEntranceDoors.navNodes ?? navNodes),
      navEdges: withEntranceDoors.navEdges ?? navEdges,
    });
    upd({ buildings: synced.buildings, navNodes: synced.navNodes, navEdges: synced.navEdges });
  };
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

  const pathSnapTargetForPoint = useCallback((point: { x: number; y: number }, excludePathId?: string, excludePoint?: { x: number; y: number }, onlyPathId?: string): PathSnapTarget | null => {
    let bestPoint: PathSnapTarget | null = null;
    let bestSegment: PathSnapTarget | null = null;
    for (const path of paths) {
      if (path.id === excludePathId || path.visible === false || (onlyPathId && path.id !== onlyPathId)) continue;
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
    // A segment projection is the more precise target whenever the pointer is
    // actually over the line. Do not let an endpoint merely inside the broad
    // path hit radius steal a midpoint click from the selected segment.
    if (bestPoint && bestSegment) return (bestSegment as PathSnapTarget).distance <= (bestPoint as PathSnapTarget).distance ? bestSegment : bestPoint;
    return bestPoint ?? bestSegment;
  }, [pathPaintWidth, paths]);

  const insertPathJunctionPoint = useCallback((sourcePaths: CampusPath[], target: PathSnapTarget | null) => {
    if (!target || target.kind !== "segment" || target.segmentIndex === undefined) return sourcePaths;
    return sourcePaths.map((path) => {
      if (path.id !== target.pathId) return path;
      const existing = path.points.some((point) => point.x === target.point.x && point.y === target.point.y);
      if (existing) return path;
      const vertexIds = path.navigationVertexIds?.length === path.points.length
        ? [...path.navigationVertexIds.slice(0, target.segmentIndex! + 1), genId("pv"), ...path.navigationVertexIds.slice(target.segmentIndex! + 1)]
        : undefined;
      return {
        ...path,
        points: [
          ...path.points.slice(0, target.segmentIndex! + 1),
          target.point,
          ...path.points.slice(target.segmentIndex! + 1),
        ],
        ...(vertexIds ? { navigationVertexIds: vertexIds } : {}),
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
    return pathNetworkSelectionIds(paths, pathId, "network");
  }, [paths]);

  const exitPathMemberEditToNetwork = useCallback(() => {
    const memberId = pathMemberEditId;
    setPathMemberEditId(null);
    setSelectedPathPoint(null);
    if (!memberId) return;
    const networkIds = pathNetworkSelectionIds(paths, memberId, "network");
    setSelected({ type: "path", id: memberId });
    setMultiSelected(networkIds.length > 1 ? networkIds : []);
    setShowAlignTools(networkIds.length > 1);
  }, [pathMemberEditId, paths]);

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
      // A bend/vertex is not a junction merely because the same Pathway has a
      // duplicate coordinate.  Junction status is reserved for a shared point
      // owned by two distinct physical Pathways.
      if (candidatePath.id === pathId) continue;
      for (let index = 0; index < candidatePath.points.length; index += 1) {
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
        const existingVertexIds = path.navigationVertexIds?.length === path.points.length ? [...path.navigationVertexIds] : undefined;
        const nextVertexIds = existingVertexIds
          ? (extension.atStart ? [genId("pv"), ...existingVertexIds] : [...existingVertexIds, genId("pv")])
          : undefined;
        return { ...path, points: nextPoints, ...(nextVertexIds ? { navigationVertexIds: nextVertexIds } : {}) };
      });
      const adjustedSnapTarget = snapTarget?.kind === "segment" && snapTarget.pathId === extension.pathId && extension.atStart && snapTarget.segmentIndex !== undefined
        ? { ...snapTarget, segmentIndex: snapTarget.segmentIndex + 1 }
        : snapTarget;
      const withJunction = insertPathJunctionPoint(extendedPaths, adjustedSnapTarget);
      // B5 Phase 5.14: use mergePathNetworksForJunction to handle cross-network merging
      const nextPaths = snapTarget?.pathId
        ? mergePathNetworksForJunction(withJunction, extension.pathId, snapTarget.pathId)
        : withJunction;
      const next = reconcilePathwayNavigation({ ...campus, paths: nextPaths }, genId);
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
    setTool("select");
    setPathSettingsOpen(false);
    setTestRoutePickKind(null);
    setTestRoutePickHover(null);
    setTestRouteMapPick(null);
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

  /** Visible physical-object references used by campus alignment. Navigation
   * Pathways and generated graph nodes are intentionally excluded. */
  const physicalAlignmentRefs = useCallback((excludedIds: ReadonlySet<string> = new Set()) => {
    const refs: { x: number; y: number; width: number; height: number }[] = [];
    const add = (member: GroupMoveMember) => {
      if (excludedIds.has(member.id)) return;
      const bounds = memberVisibleBounds(member);
      refs.push({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
    };
    for (const building of buildings) {
      if (building.visible === false) continue;
      add({ kind: "building", id: building.id, x: building.x, y: building.y, width: building.width, height: building.height, rotation: building.rotation ?? 0 });
    }
    for (const asset of decorAssets) {
      if (asset.visible === false) continue;
      const descriptor = DECOR_ASSET_MAP[asset.type];
      if (!descriptor) continue;
      const size = isDecorAreaType(asset.type)
        ? { width: Math.max(1, asset.width ?? descriptor.defaultWidth), height: Math.max(1, asset.height ?? descriptor.defaultHeight) }
        : decorWorldSize(descriptor, asset.scale);
      add({ kind: "decorAsset", id: asset.id, x: asset.x, y: asset.y, width: size.width, height: size.height, rotation: asset.rotation ?? 0 });
    }
    for (const marker of markers) {
      if (!isCampusGate(marker) || (marker as CampusMarker & { visible?: boolean }).visible === false) continue;
      const size = campusGateSize(marker);
      add({ kind: "marker", id: marker.id, x: marker.x, y: marker.y, width: size.width, height: size.height });
    }
    return refs;
  }, [buildings, decorAssets, markers]);

  // ── Build the rigid group-drag member list ──
  // When the grabbed object is part of the current multi-selection, the whole
  // selection of buildings + decorative assets + functional Campus Gates moves
  // as one unit. Locked buildings are excluded; generated nav anchors remain
  // graph infrastructure and are never part of the physical group.
  const buildDragGroup = (drag: { type: string; id: string }, sel: string[]): GroupMoveMember[] | null => {
    if (!sel.includes(drag.id)) return null;
    const members: GroupMoveMember[] = [];
    for (const b of buildings) {
      if (b.locked) continue;
      if (sel.includes(b.id)) members.push({ kind: "building", id: b.id, x: b.x, y: b.y, width: b.width, height: b.height, rotation: b.rotation ?? 0 });
    }
    for (const da of decorAssets) {
      if (!sel.includes(da.id) || da.locked) continue;
      const t = DECOR_ASSET_MAP[da.type];
      if (!t) continue;
      // Ground/area assets carry their authored dimensions independently of
      // the palette template.  Use those real bounds for a group drag so the
      // rigid canvas clamp cannot stop a decor group early (or make movement
      // appear to snap toward the middle of the canvas).
      const size = isDecorAreaType(da.type)
        ? {
            width: Math.max(1, da.width ?? decorWorldSize(t, da.scale).width),
            height: Math.max(1, da.height ?? decorWorldSize(t, da.scale).height),
          }
        : decorWorldSize(t, da.scale);
      members.push({ kind: "decorAsset", id: da.id, x: da.x, y: da.y, width: size.width, height: size.height, rotation: da.rotation ?? 0 });
    }
    for (const marker of markers) {
      if (!sel.includes(marker.id) || !isCampusGate(marker)) continue;
      const size = campusGateSize(marker);
      members.push({ kind: "marker", id: marker.id, x: marker.x, y: marker.y, width: size.width, height: size.height });
    }
    // Pathways keep their dedicated network transform semantics. A mixed
    // physical + Pathway selection must never enter the generic physical group
    // gesture; path-only selections continue through their existing path-group
    // controls below.
    if (members.length === 0) {
      for (const path of paths) {
        if (!sel.includes(path.id) || path.locked) continue;
        const bounds = pathSelectionBounds(path, { includeHidden: true });
        if (bounds) members.push({ kind: "path", id: path.id, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
      }
    }
    return members.length >= 2 ? members : null;
  };

  const selectionForId = useCallback((id: string): CampusSelection | null => {
    if (buildings.some((b) => b.id === id)) return { type: "building", id };
    for (const b of buildings) {
      if ((b.entrances ?? []).some((entrance) => entrance.id === id)) return { type: "entrance", id, buildingId: b.id };
    }
    if (markers.some((m) => isCampusGate(m) && m.id === id)) return { type: "gate", id };
    if (markers.some((m) => m.id === id)) return { type: "marker", id };
    if (decorAssets.some((da) => da.id === id)) return { type: "decorAsset", id };
    if (paths.some((p) => p.id === id)) return { type: "path", id };
    if (outdoorNodes.some((n) => n.id === id)) return { type: "navNode", id };
    if (outdoorEdges.some((e) => e.id === id)) return { type: "navEdge", id };
    return null;
  }, [buildings, markers, decorAssets, paths, outdoorNodes, outdoorEdges]);

  const selectedOutdoorObjectCount = useMemo(
    () => selectedOutdoorCount(buildings, decorAssets, multiSelected, DECOR_ASSET_MAP)
      + paths.filter((path) => multiSelected.includes(path.id)).length
      + markers.filter((marker) => isCampusGate(marker) && multiSelected.includes(marker.id)).length,
    [buildings, decorAssets, markers, multiSelected, paths]
  );
  const multiSelectedPaths = useMemo(() => paths.filter((path) => multiSelected.includes(path.id)), [multiSelected, paths]);

  const navAlignmentForPoint = useCallback((point: { x: number; y: number }, excludeId?: string, connectedIds?: Set<string>) => {
    const pathCandidates = paths.flatMap((path) => path.points.map((pathPoint) => ({ id: `${path.id}:${pathPoint.x}:${pathPoint.y}`, x: pathPoint.x, y: pathPoint.y })));
    // Entrances are semantic navigation anchors even though their canonical
    // graph nodes are intentionally hidden behind the Entrance marker.  Keep
    // them in the same lightweight alignment reference set so outdoor Walking
    // Points and Pathway vertices can line up with an Entrance without creating
    // connectivity from visual alignment alone.
    const entranceCandidates = buildings.flatMap((building) => (building.entrances ?? []).map((entrance) => {
      const position = entranceWorldPosition(building, entrance);
      return { id: `entrance:${building.id}:${entrance.id}`, x: position.x, y: position.y };
    }));
    const candidates = [
      ...outdoorNodes.filter((node) => node.id !== excludeId),
      ...pathCandidates,
      ...entranceCandidates,
    ];
    const result = navAlignSnap(point, candidates, SNAP_DIST, connectedIds);
    return { point: { x: result.x, y: result.y }, guides: result.guides };
  }, [buildings, outdoorNodes, paths]);

  // ── SVG event handlers ──
  const handleSvgDown = (e: React.MouseEvent<SVGSVGElement>) => {
    setPathChoiceMenu(null);
    if (tool === "connect" && layer === "navigation") cancelConnectPreviewFrame();
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
        exitPathMemberEditToNetwork();
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
    if (tool === "gate") {
      if (layer !== "campus") {
        toast.info("Campus Gate", "Switch to the Campus layer to place a gate.");
        return;
      }
      placeCampusGate(clampedPt.x, clampedPt.y);
      return;
    }
    if (tool === "decor") {
      const descriptor = armedDecorAssetType ? DECOR_ASSET_MAP[armedDecorAssetType] : undefined;
      if (layer !== "campus" || !descriptor) return;
      const areaAsset = isDecorAreaType(armedDecorAssetType);
      const asset: CampusDecorAsset = {
        id: genId("dec"),
        type: armedDecorAssetType,
        x: clampedPt.x,
        y: clampedPt.y,
        rotation: 0,
        ...(areaAsset
          ? {
              width: descriptor.defaultWidth,
              height: descriptor.defaultHeight,
              groundType: groundTypeForDecorType(armedDecorAssetType),
              zOrder: -1000,
            }
          : { scale: lastDecorScalesRef.current[armedDecorAssetType] ?? 0.82 }),
        visible: true,
        locked: false,
      };
      const boundedAsset = constrainDecorAssetToCanvas(asset, cw, ch);
      const next = { ...campus, decorAssets: [...(campus.decorAssets ?? []), boundedAsset] };
      campusRef.current = next;
      onUpdate(next);
      pushHistory(next);
      setSelected({ type: "decorAsset", id: boundedAsset.id });
      setArmedDecorAssetType(null);
      setTool("select");
      toast.success("Asset placed", `${descriptor.label} added to the campus.`);
      return;
    }
    if (tool === "marker" || tool === "room") {
      // B5 Phase 1: in the Navigation layer the Marker tool becomes the
      // Waypoint tool — it creates a real NavigationNode (selectable, movable,
      // deletable, undoable) instead of a decorative CampusMarker.
      if (layer === "navigation") {
        // The physical Entrance is already the canonical visible navigation
        // anchor. Resolve its hit region before checking graph nodes so the
        // hidden Entrance node or a legacy overlapping manual point can never
        // receive a new placement click first.
        const entranceElement = target.closest?.("[data-testid='entrance-hit-priority'], [data-entrance-id]");
        const nearBuilding = buildings.some((building) => {
          const padding = 24;
          return clampedPt.x >= building.x - padding
            && clampedPt.x <= building.x + building.width + padding
            && clampedPt.y >= building.y - padding
            && clampedPt.y <= building.y + building.height + padding;
        });
        const entranceHit = entranceElement || nearBuilding
          ? findEntranceAtPoint(buildings, clampedPt)
          : undefined;
        if (entranceHit) {
          setSelected({ type: "entrance", id: entranceHit.entranceId, buildingId: entranceHit.buildingId });
          setMultiSelected([]);
          setTool("select");
          setNavEntranceHover(null);
          setWaypointEdgeSnap(null);
          setConnectBlocked(false);
          setConnectBlocked(false);
          toast.info("Entrance is already a navigation connection point", "Use this Entrance directly for navigation connections.");
          return;
        }
        // Reuse an existing canonical node instead of stacking another point
        // at the same hit target. Provenance stays explicit: a generated point
        // remains Pathway-owned, while a manual point remains manual.
        const existingNodeHit = findNavNodeAtPoint(outdoorNodes, clampedPt);
        if (existingNodeHit) {
          setSelected({ type: "navNode", id: existingNodeHit.id });
          setMultiSelected([]);
          setTool("select");
          setNavEntranceHover(null);
          setWaypointEdgeSnap(null);
          if (existingNodeHit.generatedFromPathVertices?.length) {
            toast.info("Generated Walking Point", "This point follows its physical Pathway. Drag to adjust the Pathway vertex.");
          } else {
            toast.info("Walking Point already exists", "The existing manual Walking Point is selected.");
          }
          return;
        }
        // B5 Phase 1.6: outdoor waypoints belong to outdoor navigable space —
        // arbitrary points inside a building footprint are rejected with clear
        // feedback instead of silently creating a node under the roof.
        if (buildings.some((b) => pointInBuilding(b, clampedPt))) {
          toast.warning("Connect through a building entrance", "Outdoor walking points belong outside buildings — click the building's entrance instead.");
          return;
        }
        const pathSnap = pathSnapTargetForPoint(clampedPt);
        const aligned = pathSnap
          ? { point: pathSnap.point, guides: [{ type: "v" as const, pos: pathSnap.point.x }, { type: "h" as const, pos: pathSnap.point.y }] }
          : navAlignmentForPoint(clampedPt);
        setGuides(aligned.guides);
        const cfg = LAYER_MARKER_CONFIG.navigation;
        const nn = createNavNode({ id: genId("nn"), x: aligned.point.x, y: aligned.point.y, campusId: campus.id, name: "Walking Point", type: "outdoor", color: cfg.color });
        // B5 Phase 6.4: detect edge insertion using RAW cursor position (not aligned)
        const clickEdgeHit = findNavEdgeAtPoint(outdoorEdges, outdoorNodeMap, clampedPt);
        if (clickEdgeHit) {
          const targetEdge = navEdges.find((e) => e.id === clickEdgeHit.edge.id);
          if (targetEdge) {
            // Entrance bridges are auto-routed from the Entrance and must never
            // be split by the generic Walking Point insertion tool.  Keep the
            // tool active so the admin can branch from the target Walking Point
            // instead, and explain the special ownership rule immediately.
            if (isEntranceManagedNavEdge(targetEdge)) {
              setWaypointEdgeSnap(null);
              toast.info(
                "Entrance connection is auto-routed",
                "Branch from its Walking Point instead.",
              );
              return;
            }
            if (isPathwayGeneratedEdge(targetEdge)) {
              const target = generatedEdgePathSegment(targetEdge, clampedPt);
              if (target) {
                // Walking Point on a generated edge is an explicit
                // source-of-truth operation: insert one physical vertex and
                // let reconciliation create/reuse the generated node/chain.
                onPathAddPoint(target.path.id, target.segmentIndex + 1, target.point);
                setWaypointEdgeSnap(null);
                setTool("select");
                toast.success("Connection point added", "A physical Pathway vertex and generated Walking Point were created.");
                return;
              }
              toast.info("Pathway connection point unavailable", "Move onto a generated Pathway segment to add a connection point.");
              setWaypointEdgeSnap(null);
              return;
            }
            const insertPt = clickEdgeHit.nearest;
            const insertNodeBase = createNavNode({ id: nn.id, x: insertPt.x, y: insertPt.y, campusId: campus.id, name: "Walking Point", type: "outdoor", color: cfg.color });
            const insertNode = { ...insertNodeBase, x: insertPt.x, y: insertPt.y };
            const splitResult = splitNavEdge(targetEdge, insertNode, navNodes, clickEdgeHit.nearest.segIndex);
            if (splitResult) {
              const nextEdges = navEdges.filter((e) => e.id !== targetEdge.id);
              nextEdges.push(...splitResult.newEdges);
              const next = { ...campus, navNodes: [...navNodes, insertNode], navEdges: nextEdges };
              onUpdate(next);
              pushHistory(next);
              setSelected({ type: "navNode", id: insertNode.id });
              setWaypointEdgeSnap(null);
              setTool("select");
              toast.success("Walking Point inserted", "Edge split into two connections.");
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
        const buildingId = genId("bld");
        const identity = nextDefaultBuildingIdentity(buildings, defaultBuildingReservationsRef.current?.values);
        defaultBuildingReservationsRef.current?.values.push(identity);
        const rawBuilding: CampusBuilding = {
          id: buildingId,
          name: identity.name,
          code: identity.code,
          category: selectedBuildingType.category,
          description: selectedBuildingType.description,
          x: Math.round(clampedPt.x - selectedBuildingType.defaultWidth / 2),
          y: Math.round(clampedPt.y - selectedBuildingType.defaultHeight / 2),
          width: selectedBuildingType.defaultWidth,
          height: selectedBuildingType.defaultHeight,
          color: selectedBuildingType.color,
          expanded: false,
          floors: [createDefaultFloor({ id: genId("fl"), buildingId, number: 1 })],
        };
        const fittedBuilding = fitBuildingRectToCanvas(rawBuilding, cw, ch);
        const placementDelta = clampMemberTranslation(
          { kind: "building", id: fittedBuilding.id, x: fittedBuilding.x, y: fittedBuilding.y, width: fittedBuilding.width, height: fittedBuilding.height },
          0,
          0,
          cw,
          ch,
          CAMPUS_OBJECT_SAFE_INSET,
        );
        const nb: CampusBuilding = { ...fittedBuilding, x: Math.round(fittedBuilding.x + placementDelta.dx), y: Math.round(fittedBuilding.y + placementDelta.dy) };
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
    } else if (tool === "path" || (tool === "connect" && layer === "navigation")) {
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
        // A physical Pathway segment is a first-class Connect target. Reuse the
        // source-of-truth vertex/reconciliation helper, then commit the
        // connector in one logical update/history action.
        const physicalPathId = target.closest?.("[data-testid='campus-path']")?.getAttribute("data-path-id");
        if (physicalPathId) {
          const physicalPath = paths.find((path) => path.id === physicalPathId);
          if (physicalPath) {
            const pathTarget = pathSnapTargetForPoint(clampedPt, undefined, undefined, physicalPath.id);
            if (navConnectStart && pathTarget?.pathId === physicalPath.id && pathTarget.kind === "segment") {
              connectPathwaySegment(pathTarget);
            } else if (navConnectStart) {
              toast.info("Pathway connection point unavailable", "Click directly on a Pathway segment.");
            }
            return;
          }
        }
        // An empty-canvas click should not build a node map or scan every
        // authored edge. Only inspect an edge when SVG hit-testing identifies
        // the click as landing on an actual edge element.
        const edgeElement = target.closest?.("[data-testid='nav-edge']");
        if (edgeElement) {
          const edgeHit = findNavEdgeAtPoint(
            outdoorEdges,
            outdoorNodeMap,
            clampedPt,
          );
          const generatedHitEdge = edgeHit ? navEdges.find((edge) => edge.id === edgeHit.edge.id) : undefined;
          if (edgeHit && isPathwayGeneratedEdge(generatedHitEdge)) {
            const generatedTarget = generatedHitEdge ? generatedEdgePathSegment(generatedHitEdge, clampedPt) : null;
            if (navConnectStart && generatedTarget) {
              connectPathwaySegment({
                point: generatedTarget.point,
                distance: generatedTarget.distance,
                pathId: generatedTarget.path.id,
                kind: "segment",
                segmentIndex: generatedTarget.segmentIndex,
              });
            } else {
              toast.info("Pathway connection point unavailable", "Click directly on a Pathway segment.");
            }
            return;
          }
          if (edgeHit && generatedHitEdge && navConnectStart) {
            if (generatedHitEdge.type === "floor_transition" || generatedHitEdge.type === "entrance_transition") {
              toast.info("This connection is managed automatically", "Choose an outdoor Walking Network segment.");
              return;
            }
            const capturedTarget = navPathTargetHover?.edgeId === generatedHitEdge.id
              ? navPathTargetHover
              : undefined;
            connectManualNavSegment(
              generatedHitEdge,
              capturedTarget?.point ?? edgeHit.nearest,
              capturedTarget?.segmentIndex ?? edgeHit.nearest.segIndex,
            );
            return;
          }
          }
        // B5 Phase 1.7 ordering fix: entrance targets are checked BEFORE the
        // building-body rejection. Entrances sit exactly on the building edge
        // and pointInBuilding uses inclusive bounds, so a wrong order would
        // reject every entrance click with "Connect through a building
        // entrance". Entrance first, building-body rejection second — the same
        // order the Add Waypoint branch already uses.
        const entranceElement = target.closest?.("[data-testid='entrance-hit-priority'], [data-entrance-id]");
        const nearBuilding = buildings.some((building) => {
          const padding = 24;
          return clampedPt.x >= building.x - padding
            && clampedPt.x <= building.x + building.width + padding
            && clampedPt.y >= building.y - padding
            && clampedPt.y <= building.y + building.height + padding;
        });
        const entranceHit = entranceElement || nearBuilding
          ? findEntranceAtPoint(buildings, clampedPt)
          : undefined;
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
            setNavEntranceHover(null);
            setNavPathTargetHover(null);
            setConnectBlocked(false);
            return;
          }
          toast.info("Select a starting walking point or entrance", "Use Walking Point to place a new point first.");
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
          // segment shape the preview shows — the orthogonal corner resolved
          // from the current anchor/latest bend PLUS the click point itself (or
          // just the click point on a straight continuation). The click point
          // immediately becomes the new continuation anchor, so the NEXT
          // preview starts from it — a click can never drop back onto the
          // source/old diagonal. No NavigationNode is ever created from an
          // empty Connect click.
          // Floor Editor parity: an empty click while a Connect source is
          // armed pins an orthogonal bend/waypoint and keeps the connection
          // active. The pin helper validates every segment against real
          // obstacles, preserves alignment snapping, and never creates a
          // generic node or mutates topology until a destination is clicked.
          pinConnectBend(clampedPt, e.shiftKey);
          return;
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

  /** Rebuild authored outdoor edge geometry from the CURRENT node positions.
   * Endpoint-like bends from the drag-start snapshot are stale once a waypoint
   * moves, so remove only those bends before normalizing and recomputing cost.
   * Generated/semantic bridge edges are reconciled by their owning helpers and
   * are intentionally left untouched here. */
  const rebuildOutdoorEdgeGeometry = useCallback((
    edge: NavigationEdge,
    nodes: NavigationNode[],
    staleEndpoints: { x: number; y: number }[] = [],
  ): NavigationEdge => {
    if (edge.generatedFromPathIds?.length || edge.type === "entrance_transition" || edge.type === "floor_transition" || edge.type === "cross_floor" || edge.type === "room_door") return edge;
    const startNode = nodes.find((node) => node.id === edge.startNodeId);
    const endNode = nodes.find((node) => node.id === edge.endNodeId);
    if (startNode?.entranceId || endNode?.entranceId) return edge;
    // A Pathway vertex is a canonical attachment target.  Its external edge
    // may contain authored Connect bends (including Ground Discharge and
    // ordinary outdoor endpoints), so moving the vertex must not feed that
    // edge through the generic normalizer.  Keep the bend list byte-for-byte
    // stable and refresh only the endpoint-derived cost.
    if (startNode?.generatedFromPathVertices?.length || endNode?.generatedFromPathVertices?.length) {
      const points = [
        startNode ?? { x: 0, y: 0 },
        ...(edge.bendPoints ?? []),
        endNode ?? { x: 0, y: 0 },
      ];
      return {
        ...edge,
        distance: navEdgePolylineDistance(points),
      };
    }
    const points = edgePolylinePoints(edge, nodes);
    if (!points || points.length < 2) return edge;
    const start = points[0];
    const end = points[points.length - 1];
    const near = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 3) => Math.hypot(a.x - b.x, a.y - b.y) <= eps;
    const bends = normalizeBendPoints(
      points.slice(1, -1).filter((point) =>
        !near(point, start) && !near(point, end)
        && !staleEndpoints.some((old) => !near(old, start) && !near(old, end) && near(point, old))
      ),
    );
    return {
      ...edge,
      bendPoints: bends.length > 0 ? bends : undefined,
      distance: navEdgePolylineDistance([start, ...bends, end]),
    };
  }, []);

  // Entrance bridges use one geometry resolver for live preview, commit, and
  // later target movement. The physical Entrance side supplies the outward
  // first leg; the helper then chooses the shortest valid orthogonal route.
  const entranceConnectorForNodes = useCallback((startNode: NavigationNode, endNode: NavigationNode) => {
    const entranceNode = startNode.entranceId && !startNode.floorId ? startNode : endNode.entranceId && !endNode.floorId ? endNode : undefined;
    if (!entranceNode?.buildingId || !entranceNode.entranceId) return null;
    const building = buildings.find((candidate) => candidate.id === entranceNode.buildingId);
    const entrance = building?.entrances?.find((candidate) => candidate.id === entranceNode.entranceId);
    if (!building || !entrance) return null;
    const target = entranceNode.id === startNode.id ? endNode : startNode;
    const geometry = entranceConnectorGeometry(building, entrance, target, buildings, decorAssets);
    if (geometry.blocked) return { blocked: true, bends: [], distance: 0 };
    const points = entranceNode.id === startNode.id ? geometry.points : [...geometry.points].reverse();
    return { blocked: false, bends: points.slice(1, -1), distance: entranceConnectorDistance(points) };
  }, [buildings, decorAssets]);

  /** Resolve the narrow source-owned perimeter exception used by Outdoor
   * Connect. Generated entrance/stair anchors carry the owning building ID;
   * their physical record supplies the perimeter side. */
  const connectSourceDepartureFor = useCallback((node: NavigationNode | undefined): OutdoorSourceDeparture | undefined => {
    if (!node?.buildingId) return undefined;
    const building = buildings.find((candidate) => candidate.id === node.buildingId);
    if (!building) return undefined;
    if (node.entranceId && !node.floorId) {
      const entrance = building.entrances?.find((candidate) => candidate.id === node.entranceId);
      return entrance ? { buildingId: building.id, edge: entrance.edge } : { buildingId: building.id };
    }
    if (node.exteriorEmergencyStairId && !node.floorId) {
      const stair = canonicalExteriorEmergencyStairsForBuilding(building)
        .find((candidate) => candidate.id === node.exteriorEmergencyStairId);
      return stair ? { buildingId: building.id, edge: stair.attachment.edge } : { buildingId: building.id };
    }
    return undefined;
  }, [buildings]);

  /**
   * Resolve one canonical Outdoor Connect candidate.  The preview and every
   * commit path consume this same result; no second orthogonalization is
   * allowed to change authored draft geometry at commit time.
   */
  const outdoorConnectCandidateFor = useCallback((
    startNode: NavigationNode,
    targetPoint: { x: number; y: number },
    targetNode?: NavigationNode,
  ) => {
    const target = { x: Math.round(targetPoint.x), y: Math.round(targetPoint.y) };
    const entranceGeometry = entranceConnectorForNodes(
      startNode,
      targetNode ?? {
        id: "connect-preview-target",
        name: "Connect target",
        type: "outdoor",
        x: target.x,
        y: target.y,
      },
    );
    const hasPinnedDraft = navConnectBends.length > 0;
    const anchor = hasPinnedDraft
      ? navConnectBends[navConnectBends.length - 1]
      : { x: startNode.x, y: startNode.y };
    const tail = orthogonalBendsFor(anchor, target, undefined, undefined);
    const rawBends = entranceGeometry && !hasPinnedDraft
      ? entranceGeometry.bends
      : [...navConnectBends, ...tail];
    // Keep every explicit Connect bend authoritative.  The preview and the
    // commit must see the same list; normalizing collinear points here would
    // silently erase a user click when the next pointer position happens to be
    // on the same axis.
    const bends = preserveAuthoredConnectBends(startNode, rawBends, target);
    const points = [{ x: startNode.x, y: startNode.y }, ...bends, target];
    const blocked = entranceGeometry?.blocked === true && !hasPinnedDraft
      ? true
      : polylineCrossesObstacleAfterSourceDeparture(
        points,
        buildings,
        decorAssets,
        connectSourceDepartureFor(startNode),
      );
    return { target, bends, points, blocked, entranceGeometry };
  }, [buildings, connectSourceDepartureFor, decorAssets, entranceConnectorForNodes, navConnectBends]);

  /** Resolve exactly the geometry a Connect click will pin. Entrance-owned
   * sources use the same outward-stub helper as final commit; ordinary points
   * retain the existing Floor-parity orthogonal pin behavior. */
  const connectPinGeometryFor = useCallback((
    startNode: NavigationNode,
    target: { x: number; y: number },
    anchor: { x: number; y: number },
    shiftKey = false,
  ): { pins: { x: number; y: number }[]; snapped: boolean; guides: { type: "h" | "v"; pos: number }[]; blocked: boolean } => {
    let resolvedTarget = { x: Math.round(target.x), y: Math.round(target.y) };
    if (shiftKey) {
      const dx = Math.abs(resolvedTarget.x - anchor.x);
      const dy = Math.abs(resolvedTarget.y - anchor.y);
      resolvedTarget = dx >= dy
        ? { x: resolvedTarget.x, y: anchor.y }
        : { x: anchor.x, y: resolvedTarget.y };
    }
    const sourceDeparture = connectSourceDepartureFor(startNode);
    const startsAtSource = Math.hypot(anchor.x - startNode.x, anchor.y - startNode.y) <= 1;
    if (sourceDeparture && startNode.entranceId && !startNode.floorId && startsAtSource && !shiftKey) {
      const building = buildings.find((candidate) => candidate.id === sourceDeparture.buildingId);
      const entrance = building?.entrances?.find((candidate) => candidate.id === startNode.entranceId);
      if (building && entrance) {
        const connector = entranceConnectorGeometry(building, entrance, resolvedTarget, buildings, decorAssets);
        return { pins: connector.points.slice(1), snapped: false, guides: [], blocked: connector.blocked };
      }
    }
    const geo = outdoorConnectPinGeometryFor(resolvedTarget, anchor, outdoorNodes, { width: cw, height: ch });
    const points = [{ x: startNode.x, y: startNode.y }, ...navConnectBends, ...geo.pins];
    const blocked = polylineCrossesObstacleAfterSourceDeparture(points, buildings, decorAssets, sourceDeparture);
    return { ...geo, blocked };
  }, [buildings, cw, ch, connectSourceDepartureFor, decorAssets, navConnectBends, outdoorNodes]);

  const isEntranceManagedNavEdge = useCallback((edge: NavigationEdge | undefined) => {
    if (!edge || edge.type === "entrance_transition") return false;
    return [edge.startNodeId, edge.endNodeId]
      .map((nodeId) => navNodes.find((node) => node.id === nodeId))
      .some((node) => !!node?.entranceId && !node.floorId);
  }, [navNodes]);

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
    const geo = connectPinGeometryFor(startNode, rawPt, last, shiftKey);
    const pins = geo.pins;
    const lastPin = pins[pins.length - 1];
    if (Math.hypot(lastPin.x - last.x, lastPin.y - last.y) < 2) return; // ignore micro-clicks
    // Every pinned segment is obstacle-validated (buildings + solid assets).
    if (geo.blocked) {
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

  const commitNavEdge = useCallback((startId: string, endId: string, _previewPins: { x: number; y: number }[] = []): boolean => {
    const clearConnect = () => {
      cancelConnectPreviewFrame();
      connectGuidanceShownRef.current = false;
      setNavConnectStart(null);
      setNavConnectBends([]);
      setNavPreview(null);
      setNavPreviewPins([]);
      navConnectBendGroupsRef.current = [];
      connectRedoStackRef.current = [];
      setNavEntranceHover(null);
      setWaypointEdgeSnap(null);
      setConnectBlocked(false);
    };
    if (isSelfEdge(startId, endId)) {
      toast.warning("Cannot connect a walking point to itself", "Pick a different destination walking point.");
      clearConnect();
      return false;
    }
    // Commit against the latest canonical campus snapshot.  Generated Stair
    // Exit nodes can be reconciled between the first and second click (for
    // example after hydration or a physical-stair move); using render-time
    // arrays here can otherwise append an edge to a stale node ID and publish
    // a success toast for a dangling, non-renderable connector.
    const liveCampus = campusRef.current;
    const sourceBeforeSync = (liveCampus.navNodes ?? []).find((node) => node.id === startId)
      ?? outdoorNodes.find((node) => node.id === startId);
    const generatedStairSource = Boolean(sourceBeforeSync?.exteriorEmergencyStairId && !sourceBeforeSync.floorId);
    const graphCampus = generatedStairSource
      ? syncExteriorEmergencyStairGraph(liveCampus)
      : liveCampus;
    const graphNodes = outdoorNavNodes(graphCampus.navNodes);
    const startNode = graphNodes.find((node) => node.id === startId)
      ?? (generatedStairSource
        ? graphNodes.find((node) => node.exteriorEmergencyStairId === sourceBeforeSync?.exteriorEmergencyStairId
          && !node.floorId
          && (!sourceBeforeSync?.buildingId || node.buildingId === sourceBeforeSync.buildingId))
        : undefined);
    const endNode = graphNodes.find((node) => node.id === endId);
    if (!startNode || !endNode || isSelfEdge(startNode.id, endNode.id)) {
      toast.warning("Connection could not be saved", "Choose two live Walking Network points.");
      clearConnect();
      return false;
    }
    const candidate = outdoorConnectCandidateFor(startNode, endNode, endNode);
    if (candidate.blocked) {
      toast.warning("Connection blocked", "The connection crosses a building or obstacle.");
      return false;
    }
    const dup = findDuplicateNavEdge(graphCampus.navEdges ?? [], startNode.id, endNode.id);
    if (dup) {
      toast.warning("Those points are already connected", "Select the existing connection to edit it.");
      clearConnect();
      return false;
    }
    const allBends = candidate.bends;
    const polyline = candidate.points;
    const edge = {
      ...createNavEdge({ id: genId("ne"), startNodeId: startNode.id, endNodeId: endNode.id, nodes: graphNodes }),
      accessible: (startNode?.entranceId ? startNode.accessible : endNode?.entranceId ? endNode.accessible : true) !== false,
      ...(allBends.length > 0 && polyline ? { bendPoints: allBends, distance: navEdgePolylineDistance(polyline) } : {}),
    };
    // An Entrance has one normal outdoor bridge.  Reconnecting it replaces
    // only its previous outdoor connector; the Entrance node, target Walking
    // Point, and every unrelated network edge remain intact.
    const entranceNode = startNode?.entranceId && !startNode.floorId
      ? startNode
      : endNode?.entranceId && !endNode.floorId
        ? endNode
        : undefined;
    const withoutPreviousEntranceConnection = entranceNode?.buildingId && entranceNode.entranceId
      ? removeEntranceOutdoorConnection(graphCampus, entranceNode.buildingId, entranceNode.entranceId)
      : graphCampus;
    const next: Campus = {
      ...withoutPreviousEntranceConnection,
      navEdges: [...(withoutPreviousEntranceConnection.navEdges ?? []), edge],
    };
    const committedEdge = next.navEdges.find((candidate) => candidate.id === edge.id);
    const committedStart = next.navNodes?.some((node) => node.id === edge.startNodeId);
    const committedEnd = next.navNodes?.some((node) => node.id === edge.endNodeId);
    if (!committedEdge || !committedStart || !committedEnd) {
      toast.warning("Connection could not be saved", "The Stair Exit and destination point are no longer available.");
      clearConnect();
      return false;
    }
    campusRef.current = next;
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "navEdge", id: edge.id });
    setPathMemberEditId(null);
    clearConnect();
    const sourceLabel = startNode.exteriorEmergencyStairId && !startNode.floorId
      ? "Stair Exit"
      : startNode.name || "Walking Point";
    toast.success("Connection created", `${sourceLabel} connected to ${endNode.name || "Walking Point"}.`);
    // pushHistory is intentionally omitted from deps: it accepts an explicit
    // post-change state and only touches the stable historyRef, so the first-render
    // closure stays correct (and referencing it here would hit the TDZ since it
    // is declared later in the component body).
    return true;
  }, [buildings, cancelConnectPreviewFrame, decorAssets, findDuplicateNavEdge, onUpdate, outdoorConnectCandidateFor, toast]);

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
    preferredSegmentIndex?: number,
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
    const splitIdx = Number.isInteger(preferredSegmentIndex)
      && preferredSegmentIndex! >= 0
      && preferredSegmentIndex! < allPoints.length - 1
      ? preferredSegmentIndex!
      : nearest.segIndex;
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
    const inheritedJunctionIds = [
      ...(edge.pathJunctionIds ?? []),
      ...(edge.pathJunctionId ? [edge.pathJunctionId] : []),
      ...(waypoint.pathJunction ? [waypoint.id] : []),
    ].filter((id, index, all) => all.indexOf(id) === index);
    const junctionMetadata = waypoint.pathJunction
      ? {
          pathJunctionId: waypoint.id,
          pathJunctionParent: true,
          pathJunctionIds: inheritedJunctionIds,
        }
      : {};
    const edgeBefore: NavigationEdge = {
      ...edge,
      id: genId("ne"),
      startNodeId: edge.startNodeId,
      endNodeId: waypoint.id,
      bendPoints: edgeBendBefore,
      distance: distBefore,
      ...junctionMetadata,
    };
    const edgeAfter: NavigationEdge = {
      ...edge,
      id: genId("ne"),
      startNodeId: waypoint.id,
      endNodeId: edge.endNodeId,
      bendPoints: edgeBendAfter,
      distance: distAfter,
      ...junctionMetadata,
    };
    return { newEdges: [edgeBefore, edgeAfter] };
  }, []);

  /** Resolve a generated edge back to the physical Pathway segment it owns. */
  const generatedEdgePathSegment = useCallback((edge: NavigationEdge, point: { x: number; y: number }) => {
    if (!edge.generatedFromPathIds?.length) return null;
    const candidates: { path: CampusPath; segmentIndex: number; point: { x: number; y: number }; distance: number }[] = [];
    for (const pathId of edge.generatedFromPathIds) {
      const path = paths.find((candidate) => candidate.id === pathId);
      if (!path || !path.navigationVertexIds || path.navigationVertexIds.length !== path.points.length) continue;
      const nodeIdForVertex = new Map<string, string>();
      for (const node of outdoorNodes) {
        for (const ref of node.generatedFromPathVertices ?? []) {
          if (ref.pathId === path.id) nodeIdForVertex.set(ref.vertexId, node.id);
        }
      }
      for (let index = 0; index < path.points.length - 1; index += 1) {
        const startNodeId = nodeIdForVertex.get(path.navigationVertexIds[index]);
        const endNodeId = nodeIdForVertex.get(path.navigationVertexIds[index + 1]);
        if (!startNodeId || !endNodeId) continue;
        const samePair = (edge.startNodeId === startNodeId && edge.endNodeId === endNodeId)
          || (edge.startNodeId === endNodeId && edge.endNodeId === startNodeId);
        if (!samePair) continue;
        const projected = closestPointOnSegment(point, path.points[index], path.points[index + 1]);
        candidates.push({ path, segmentIndex: index, point: projected.point, distance: projected.distance });
      }
    }
    return candidates.sort((a, b) => a.distance - b.distance)[0] ?? null;
  }, [outdoorNodes, paths]);

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
    const candidate = startNode
      ? outdoorConnectCandidateFor(startNode, { x: nn.x, y: nn.y }, nn)
      : null;
    if (!candidate || candidate.blocked) {
      toast.warning("Connection blocked", "The connection crosses an obstacle.");
      return;
    }
    const dup = findDuplicateNavEdge(outdoorEdges, startId, nn.id);
    if (dup) {
      toast.warning("Those points are already connected", "Select the existing connection to edit it.");
      connectGuidanceShownRef.current = false;
      setNavConnectStart(null);
      setNavConnectBends([]);
      setNavPreview(null);
      setNavPreviewPins([]);
      navConnectBendGroupsRef.current = [];
      connectRedoStackRef.current = [];
      setNavEntranceHover(null);
      return;
    }
    // Use the exact same candidate consumed by the live preview.  In
    // particular, do not run a second entrance/orthogonalization pass here:
    // that used to move committed bends away from the geometry the user saw.
    const bends = candidate.bends;
    const points = candidate.points;
    const nextNodeSet = [...navNodes, nn];
    const edge = {
      ...createNavEdge({ id: genId("ne"), startNodeId: startId, endNodeId: nn.id, nodes: nextNodeSet }),
      accessible: nn.accessible !== false,
      ...(bends.length > 0 ? { bendPoints: bends, distance: navEdgePolylineDistance(points) } : {}),
    };
    const next = { ...campus, navNodes: nextNodeSet, navEdges: [...navEdges, edge] };
    // Never report success for a candidate that is not present in the exact
    // snapshot about to be published.  This guards the new Entrance-target
    // branch as well as generated Stair/Discharge sources from a stale or
    // failed edge insertion.
    const committedEdge = next.navEdges.find((candidate) => candidate.id === edge.id);
    const committedEndpoints = committedEdge
      && next.navNodes.some((node) => node.id === committedEdge.startNodeId)
      && next.navNodes.some((node) => node.id === committedEdge.endNodeId);
    if (!committedEdge || !committedEndpoints) {
      toast.warning("Connection could not be saved", "The destination endpoint is no longer available.");
      return;
    }
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "navEdge", id: edge.id });
    cancelConnectPreviewFrame();
    connectGuidanceShownRef.current = false;
    setNavConnectStart(null);
    setNavConnectBends([]);
    setNavPreview(null);
    setNavPreviewPins([]);
    navConnectBendGroupsRef.current = [];
    connectRedoStackRef.current = [];
    setWaypointEdgeSnap(null);
    setConnectBlocked(false);
    setNavEntranceHover(null);
    toast.success("Connection created", `Connected to ${nn.name} (${edge.distance} units).`);
  }, [buildEntranceNode, cancelConnectPreviewFrame, campus, commitNavEdge, findDuplicateNavEdge, isSelfEdge, navEdges, navNodes, onUpdate, outdoorConnectCandidateFor, outdoorEdges, outdoorNodes, toast]);

  // ── B5 Phase 1.7: shared navigation multi-delete ──
  // ONE history action: remove the selected nodes (with every edge touching
  // them, so no dangling references) plus any selected edges that survive the
  // node cleanup. Used by the keyboard Delete shortcut AND the panel's
  // "Delete Selected" so the behavior can never diverge.
  /** Remove a canonical connector junction without rebuilding unrelated graph
   * geometry. A simple degree-2, non-owned junction is collapsed into one
   * edge; branching, generated, or infrastructure-owned junctions are kept. */
  const removePathJunction = useCallback((id: string): boolean => {
    const node = (campus.navNodes ?? []).find((candidate) => candidate.id === id);
    if (!node?.pathJunction) return false;
    const incident = (campus.navEdges ?? []).filter((edge) => edge.startNodeId === id || edge.endNodeId === id);
    // The junction itself is the ownership boundary.  An edge touching an
    // Entrance-owned endpoint does not make an otherwise unowned inline
    // junction undeletable; this is what lets a simple E–J–P connector be
    // collapsed safely.  Pathway-generated edges remain protected because
    // their physical Pathway owns the segment/node lifecycle.
    const owned = Boolean(node.entranceId || node.gateId || node.exteriorEmergencyStairId || node.buildingId)
      || incident.some((edge) => edge.generatedFromPathIds?.length);
    if (owned || incident.length !== 2) {
      toast.warning("Junction is in use", "Remove or reconnect its branches before deleting this junction.");
      return true;
    }
    const [first, second] = incident;
    const compatible = first.type === second.type
      && first.bidirectional === second.bidirectional
      && first.accessible === second.accessible
      && first.emergencySafe === second.emergencySafe
      && first.closed === second.closed;
    if (!compatible) {
      toast.warning("Junction cannot be merged", "Its connected paths use different routing settings.");
      return true;
    }
    const firstOther = first.startNodeId === id ? first.endNodeId : first.startNodeId;
    const secondOther = second.startNodeId === id ? second.endNodeId : second.startNodeId;
    if (firstOther === secondOther || (campus.navEdges ?? []).some((edge) =>
      !incident.includes(edge)
      && ((edge.startNodeId === firstOther && edge.endNodeId === secondOther)
        || (edge.startNodeId === secondOther && edge.endNodeId === firstOther)))) {
      toast.warning("Junction cannot be merged", "A connection already exists between its neighboring points.");
      return true;
    }
    const firstPoints = edgePolylinePoints(first, outdoorNodes);
    const secondPoints = edgePolylinePoints(second, outdoorNodes);
    if (!firstPoints || !secondPoints || firstPoints.length < 2 || secondPoints.length < 2) {
      toast.warning("Junction cannot be merged", "The connected path geometry is incomplete.");
      return true;
    }
    const orientToJunction = (edge: NavigationEdge, points: { x: number; y: number }[]) =>
      edge.endNodeId === id ? points : [...points].reverse();
    const mergedPoints = [...orientToJunction(first, firstPoints), ...orientToJunction(second, secondPoints).slice(1)];
    const inheritedJunctionIds = [...new Set([
      ...(first.pathJunctionIds ?? []), ...(second.pathJunctionIds ?? []),
      ...(first.pathJunctionId ? [first.pathJunctionId] : []), ...(second.pathJunctionId ? [second.pathJunctionId] : []),
    ])].filter((junctionId) => junctionId !== id);
    const merged: NavigationEdge = {
      ...first,
      startNodeId: firstOther,
      endNodeId: secondOther,
      bendPoints: normalizeBendPoints(mergedPoints.slice(1, -1)),
      distance: navEdgePolylineDistance(mergedPoints),
      pathJunctionId: inheritedJunctionIds[inheritedJunctionIds.length - 1],
      pathJunctionParent: inheritedJunctionIds.length > 0 ? true : undefined,
      pathJunctionIds: inheritedJunctionIds.length > 0 ? inheritedJunctionIds : undefined,
    };
    const next: Campus = {
      ...campus,
      navNodes: (campus.navNodes ?? []).filter((candidate) => candidate.id !== id),
      navEdges: (campus.navEdges ?? []).filter((edge) => !incident.includes(edge)).concat(merged),
    };
    campusRef.current = next;
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "navEdge", id: merged.id });
    setSelectedPathPoint(null);
    toast.success("Junction removed", "The adjacent walking path was merged.");
    return true;
  }, [campus, isEntranceManagedNavEdge, onUpdate, outdoorNodes, toast]);

  const deleteNavSelection = useCallback((nodeIds: string[], edgeIds: string[]) => {
    const requestedJunctions = nodeIds.filter((id) => (campus.navNodes ?? []).some((node) => node.id === id && node.pathJunction));
    if (requestedJunctions.length > 0) {
      if (requestedJunctions.length === 1 && nodeIds.length === 1 && edgeIds.length === 0) {
        removePathJunction(requestedJunctions[0]);
      } else {
        toast.warning("Junction selected", "Remove or reconnect junction branches separately to keep the network safe.");
      }
      return;
    }
    const nodeSet = new Set(nodeIds.filter((id) => {
      const node = (campus.navNodes ?? []).find((candidate) => candidate.id === id);
      return !isPathwayGeneratedNode(node) && !node?.pathJunction && !node?.gateId && !(node?.exteriorEmergencyStairId && !node.floorId);
    }));
    const edgeSet = new Set(edgeIds.filter((id) => {
      const edge = (campus.navEdges ?? []).find((candidate) => candidate.id === id);
      return !isPathwayGeneratedEdge(edge) && !isEntranceManagedNavEdge(edge);
    }));
    const managedCount = nodeIds.length + edgeIds.length - nodeSet.size - edgeSet.size;
    if (nodeSet.size === 0 && edgeSet.size === 0) {
      toast.info("Generated navigation is managed automatically", "Edit the owning physical object instead of deleting its generated anchor.");
      return;
    }
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
    const removed = nodeSet.size + edgeSet.size;
    toast.success("Deleted", `Removed ${removed} graph element${removed !== 1 ? "s" : ""}.`);
    if (managedCount > 0) toast.info("Managed navigation preserved", `${managedCount} Pathway-generated item${managedCount === 1 ? " was" : "s were"} kept.`);
    // pushHistory intentionally omitted from deps — see commitNavEdge note:
    // it is declared later in the body (TDZ) and only touches the stable
    // historyRef, so the first-render closure stays correct.
  }, [campus, isEntranceManagedNavEdge, onUpdate, removePathJunction, toast]);

  // Path tool clicked an EXISTING waypoint (node clicks stop propagation, so
  // this is the only path into edge authoring from a node).
  const onNavNodeClick = useCallback((nodeId: string) => {
    cancelConnectPreviewFrame();
    if (!navConnectStart) {
      const n = outdoorNodes.find((x) => x.id === nodeId);
      setNavConnectStart(nodeId);
      setNavPreview(n ? { x: n.x, y: n.y } : null);
      setNavPreviewPins([]);
      setNavEntranceHover(null);
      setNavPathTargetHover(null);
      setConnectBlocked(false);
      connectRedoStackRef.current = [];
      navConnectBendGroupsRef.current = [];
      if (n?.entranceId && n.buildingId && !n.floorId) {
        // Treat a click on the Entrance's canonical graph anchor exactly like
        // the Properties "Connect to Walking Network" action. The node remains
        // the internal source while the physical Entrance stays selected.
        setSelected({ type: "entrance", id: n.entranceId, buildingId: n.buildingId });
        showConnectGuidance();
      } else {
        setSelected({ type: "navNode", id: nodeId });
      }
      return;
    }
    // B5 Phase 6.9 (Floor parity): the tool returns to Select ONLY on a
    // successful commit — a rejected one (self-edge / obstacle / duplicate)
    // keeps Connect active so the admin can reposition.
    const committed = commitNavEdge(navConnectStart, nodeId, navPreviewPins);
    if (committed) setTool("select");
  }, [cancelConnectPreviewFrame, commitNavEdge, navConnectStart, navPreviewPins, outdoorNodes, showConnectGuidance]);

  const handleSvgMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tool === "pan") {
      movePan(e);
      return;
    }

    const pt = getPoint(e, cw, ch);
    // Cursor coordinates are useful in ordinary authoring, but they are not
    // part of Connect's transient preview. Avoid a component-wide state write
    // for every pointer event while the lightweight Connect loop is active.
    if (!(tool === "connect" && layer === "navigation")) {
      setCursorPos({ x: Math.round(pt.x), y: Math.round(pt.y) });
    }

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
    if (layer === "navigation" && (tool === "connect" || tool === "marker")) {
      // Outdoor Connect is intentionally a preview-only pointer loop. Resolve
      // the nearest existing target, then defer all routing/obstacle/pathway
      // work to the click handlers below. This early branch keeps the legacy
      // marker preview untouched while preventing Connect hover from doing a
      // full alignment + geometry + obstacle pass on every mouse event.
      if (tool === "connect") {
        const rawPoint = { x: Math.max(0, Math.min(cw, Math.round(pt.x))), y: Math.max(0, Math.min(ch, Math.round(pt.y))) };
        const hit = findNavNodeAtPoint(outdoorNodes, rawPoint);
        const targetElement = e.target as SVGElement;
        const hoveredPathElement = targetElement.closest?.("[data-testid='campus-path']");
        const hoveredPathId = hoveredPathElement?.getAttribute("data-path-id");
        const hoveredPathTarget = !hit && hoveredPathId
          ? pathSnapTargetForPoint(rawPoint, undefined, undefined, hoveredPathId)
          : null;
        // A manual Walking Network edge has its own transparent hit surface.
        // Resolve only that hovered edge (rather than scanning the entire graph)
        // so the preview snaps to the exact point that a line click will split.
        const hoveredEdgeElement = targetElement.closest?.("[data-testid='nav-edge']");
        const hoveredEdgeId = hoveredEdgeElement?.getAttribute("data-testid") === "nav-edge"
          ? hoveredEdgeElement.getAttribute("data-edge-id")
          : null;
        const hoveredEdge = hoveredEdgeId
          ? outdoorEdges.find((edge) => edge.id === hoveredEdgeId)
          : undefined;
        const hoveredEdgeTarget = !hit && !hoveredPathTarget && hoveredEdge
          ? nearestPointOnEdgePolyline(
              hoveredEdge,
              outdoorNodeMap,
              rawPoint,
            )
          : null;
        if (navConnectStart && hoveredEdgeTarget && hoveredEdge) {
          setNavPathTargetHover({
            edgeId: hoveredEdge.id,
            segmentIndex: hoveredEdgeTarget.segIndex,
            point: { x: hoveredEdgeTarget.x, y: hoveredEdgeTarget.y },
          });
        } else {
          setNavPathTargetHover(null);
        }
        // The transparent Entrance hit layer is the only place that can yield
        // an Entrance target. Keep a cheap expanded-footprint fallback for
        // trackpads/tests that dispatch the move on the SVG root, but avoid
        // scanning every Building/Entrance when the pointer is far from one.
        const entranceElement = targetElement.closest?.("[data-testid='entrance-hit-priority'], [data-entrance-id]");
        const nearBuilding = buildings.some((building) => {
          const padding = 24;
          return rawPoint.x >= building.x - padding
            && rawPoint.x <= building.x + building.width + padding
            && rawPoint.y >= building.y - padding
            && rawPoint.y <= building.y + building.height + padding;
        });
        const entranceHit = !hit && !hoveredPathTarget && (entranceElement || nearBuilding)
          ? findEntranceAtPoint(buildings, rawPoint)
          : undefined;
        const nextEntranceHover = entranceHit
          ? { buildingId: entranceHit.buildingId, entranceId: entranceHit.entranceId, x: entranceHit.x, y: entranceHit.y }
          : null;
        const sameEntranceHover = navEntranceHover?.buildingId === nextEntranceHover?.buildingId
          && navEntranceHover?.entranceId === nextEntranceHover?.entranceId;
        if (!sameEntranceHover) setNavEntranceHover(nextEntranceHover);
        const targetPoint = hit
          ? { x: hit.x, y: hit.y }
          : hoveredPathTarget
            ? hoveredPathTarget.point
            : hoveredEdgeTarget
              ? { x: hoveredEdgeTarget.x, y: hoveredEdgeTarget.y }
            : entranceHit
              ? { x: entranceHit.x, y: entranceHit.y }
              : null;
        const startNode = navConnectStart
          ? outdoorNodes.find((node) => node.id === navConnectStart)
          : undefined;
        const previewTarget = targetPoint ?? rawPoint;
        // Keep Entrance-as-destination previews on the same canonical
        // connector branch as commitNavEdgeWithEntrance. The physical hit
        // surface has no NavigationNode ID yet, so provide only its semantic
        // identity; no node is created until a valid target click commits.
        const entrancePreviewNode = entranceHit
          ? {
              id: `connect-preview-entrance:${entranceHit.buildingId}:${entranceHit.entranceId}`,
              name: "Connect target",
              type: "entrance" as const,
              x: entranceHit.x,
              y: entranceHit.y,
              buildingId: entranceHit.buildingId,
              entranceId: entranceHit.entranceId,
              accessible: true,
            } satisfies NavigationNode
          : undefined;
        // Keep hover work presentation-only. A cheap endpoint-in-footprint check
        // provides useful red feedback for an obviously blocked target while the
        // authoritative connector/obstacle validation still runs on click.
        const obviousBuildingBlock = Boolean(
          startNode
          && !entranceHit
          && buildings.some((building) => {
            const padding = 1;
            if (previewTarget.x < building.x - padding
              || previewTarget.x > building.x + building.width + padding
              || previewTarget.y < building.y - padding
              || previewTarget.y > building.y + building.height + padding) return false;
            return pointInBuilding(building, previewTarget);
          }),
        );
        // Match Floor Editor's live Connect affordance: a dashed orthogonal
        // preview plus a ghost endpoint follows the cursor, but this is never
        // persisted until a valid click reaches the commit handlers.
        const previewCandidate = startNode
          ? outdoorConnectCandidateFor(
              startNode,
              previewTarget,
              hit ?? entrancePreviewNode,
            )
          : null;
        const previewPins = previewCandidate?.bends ?? [];
        queueConnectPreview(
          previewCandidate?.target ?? previewTarget,
          previewPins,
          obviousBuildingBlock || Boolean(previewCandidate?.blocked),
        );
        if (guides.length > 0) setGuides([]);
        movePan(e);
        return;
      }
      const entranceHit = findEntranceAtPoint(buildings, pt);
      setNavEntranceHover(entranceHit
        ? { buildingId: entranceHit.buildingId, entranceId: entranceHit.entranceId, x: entranceHit.x, y: entranceHit.y }
        : null);
      // Navigation edge-authoring live preview (Path tool, navigation layer).
      // Always follows the pointer — even before the first click — so an
      // empty-space hover shows the would-be waypoint node. Snaps to a hovered
      // waypoint or entrance so the committed coordinate is exact, never an
      // unsnapped pointer coordinate.
      if (tool === "connect") {
        const hit = findNavNodeAtPoint(outdoorNodes, pt);
        const rawAlignedPoint = { x: Math.max(0, Math.min(cw, Math.round(pt.x))), y: Math.max(0, Math.min(ch, Math.round(pt.y))) };
        const aligned = navAlignmentForPoint(rawAlignedPoint);
        const hoveredPathId = (e.target as SVGElement).closest?.("[data-testid='campus-path']")?.getAttribute("data-path-id");
        const hoveredPathTarget = hoveredPathId ? pathSnapTargetForPoint(rawAlignedPoint) : null;
        // A hovered existing node/Entrance is still a valid Connect target;
        // show the explicit start↔target center guide instead of suppressing
        // guides just because the target has an identity.
        const connectStartNode = navConnectStart ? outdoorNodes.find((node) => node.id === navConnectStart) : undefined;
        const explicitTarget = hit ?? (entranceHit ? { x: entranceHit.x, y: entranceHit.y } : null);
        const targetGuides = connectStartNode && explicitTarget
          ? navAlignSnap(
              { x: explicitTarget.x, y: explicitTarget.y },
              [{ x: connectStartNode.x, y: connectStartNode.y, id: connectStartNode.id }],
              SNAP_DIST,
              new Set([connectStartNode.id]),
            ).guides
          : [];
        setGuides(targetGuides.length > 0 ? targetGuides : aligned.guides);
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
            let smartBlocked = false;
            let usesEntranceGeometry = false;
            const hitEntranceNode = hit?.entranceId && !hit.floorId ? hit : undefined;
            if (hit && (hitEntranceNode || startNode?.entranceId)) {
              const smart = entranceConnectorForNodes(startNode!, hit);
              if (smart) {
                proposed = [...smart.bends, { x: hit.x, y: hit.y }];
                smartBlocked = smart.blocked;
                usesEntranceGeometry = true;
              } else {
                proposed = [...orthogonalBendsFor(anchor, { x: hit.x, y: hit.y }, undefined, undefined), { x: hit.x, y: hit.y }];
              }
            } else if (entranceHit) {
              const parent = buildings.find((building) => building.id === entranceHit.buildingId);
              const entrance = parent?.entrances?.find((item) => item.id === entranceHit.entranceId);
              const smart = parent && entrance
                // The helper is anchored at the hovered destination Entrance;
                // resolve a route from that boundary to the current source and
                // reverse it for the source-to-destination preview.
                ? entranceConnectorGeometry(parent, entrance, { x: startNode?.x ?? entranceHit.x, y: startNode?.y ?? entranceHit.y }, buildings, decorAssets)
                : null;
              if (smart && startNode) {
                const points = [...smart.points].reverse();
                proposed = [...points.slice(1, -1), { x: entranceHit.x, y: entranceHit.y }];
                smartBlocked = smart.blocked;
                usesEntranceGeometry = true;
              } else {
                proposed = [...orthogonalBendsFor(anchor, { x: entranceHit.x, y: entranceHit.y }, undefined, undefined), { x: entranceHit.x, y: entranceHit.y }];
              }
            } else if (hoveredPathTarget && hoveredPathTarget.pathId === hoveredPathId && hoveredPathTarget.kind === "segment") {
              const parent = startNode?.entranceId
                ? buildings.find((building) => building.id === startNode.buildingId)
                : undefined;
              const entrance = parent?.entrances?.find((item) => item.id === startNode?.entranceId);
              const smart = parent && entrance
                ? entranceConnectorGeometry(parent, entrance, hoveredPathTarget.point, buildings, decorAssets)
                : null;
              if (smart && startNode) {
                proposed = [...smart.bends, hoveredPathTarget.point];
                smartBlocked = smart.blocked;
                usesEntranceGeometry = true;
              } else {
                proposed = [hoveredPathTarget.point];
              }
            } else {
              // With a source armed, an empty hover is not a pending waypoint
              // target. Keep the canvas clear until the pointer reaches an
              // existing node, Entrance, or physical Pathway segment.
              setNavPreview(null);
              setNavPreviewPins([]);
              setConnectBlocked(false);
              return;
            }
            setNavPreviewPins(proposed);
            setNavPreview(proposed[proposed.length - 1]);
            // B5 Phase 6.2: detect building/asset collision for Connect preview
            setConnectBlocked(smartBlocked || (!usesEntranceGeometry && polylineCrossesObstacle([anchor, ...proposed], buildings, decorAssets)));
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
        const edgeHit = findNavEdgeAtPoint(outdoorEdges, outdoorNodeMap, aligned.point);
        const hitEdge = edgeHit ? navEdges.find((edge) => edge.id === edgeHit.edge.id) : undefined;
        if (edgeHit && !entranceHit) {
          setWaypointEdgeSnap({
            edgeId: edgeHit.edge.id,
            nearest: { x: edgeHit.nearest.x, y: edgeHit.nearest.y },
            helper: isEntranceManagedNavEdge(hitEdge)
              ? "Entrance connection is auto-routed. Branch from its Walking Point instead."
              : undefined,
          });
        } else {
          setWaypointEdgeSnap(null);
        }
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
      if (isPathwayGeneratedEdge(segEdge)) { navSegDragRef.current = null; return; }
      let delta = segDrag.isHorizontal
        ? Math.round(pt.y) - segDrag.oy
        : Math.round(pt.x) - segDrag.ox;
      // Manual and Entrance-connector segment drags stay orthogonal but can
      // line up with nearby Walking Points, neighboring bends, or the segment's
      // own endpoints. Pathway-generated geometry remains managed elsewhere.
      const segmentStart = segDrag.origPts[segDrag.segIndex];
      const segmentEnd = segDrag.origPts[segDrag.segIndex + 1];
      if (segmentStart && segmentEnd) {
        const endpointIds = new Set([segEdge.startNodeId, segEdge.endNodeId]);
        const references = [
          ...outdoorNodes
            .filter((node) => !endpointIds.has(node.id))
            .map((node) => ({ x: node.x, y: node.y, id: node.id })),
          ...segDrag.origPts.map((point, index) => ({ ...point, id: `edge-point:${segDrag.edgeId}:${index}` })),
        ].filter((reference) =>
          !((reference.x === segmentStart.x && reference.y === segmentStart.y)
            || (reference.x === segmentEnd.x && reference.y === segmentEnd.y))
        );
        const axisTarget = segDrag.isHorizontal
          ? { x: segmentStart.x, y: segmentStart.y + delta }
          : { x: segmentStart.x + delta, y: segmentStart.y };
        const aligned = navAlignSnap(axisTarget, references, SNAP_DIST);
        const axisGuide = aligned.guides.find((guide) => guide.type === (segDrag.isHorizontal ? "h" : "v"));
        if (axisGuide) {
          delta = segDrag.isHorizontal ? axisGuide.pos - segmentStart.y : axisGuide.pos - segmentStart.x;
          setGuides([axisGuide]);
        } else {
          setGuides([]);
        }
      }
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

    // A midpoint handle inserts the new vertex immediately, then upgrades to
    // the normal Pathway-point drag pipeline only after a real pointer move.
    // This keeps a click useful while allowing diagonal segments to be edited
    // in one continuous insert-and-drag gesture.
    if (dragging.current?.type === "pathPointInsert") {
      const pending = dragging.current;
      if (Math.hypot(pt.x - pending.sx, pt.y - pending.sy) < 3) return;
      dragging.current = { ...pending, type: "pathPoint" };
    }

    // Generated Walking Points are physical-vertex proxies. Keep the initial
    // pointer-down as an inspection selection, then enter the existing
    // Pathway vertex pipeline only after a real drag threshold is crossed.
    const pendingGeneratedPoint = generatedPointProxyRef.current;
    if (pendingGeneratedPoint && dragging.current?.type === "generatedPathPoint") {
      const moved = Math.hypot(pt.x - pendingGeneratedPoint.sx, pt.y - pendingGeneratedPoint.sy);
      if (moved < 3) return;
      const primary = pendingGeneratedPoint.refs[0];
      const owner = primary ? paths.find((path) => path.id === primary.pathId) : undefined;
      if (!primary || !owner || owner.locked) {
        generatedPointProxyRef.current = null;
        dragging.current = null;
        return;
      }
      // Reuse the physical point-drag branch below. The explicit refs preserve
      // shared-junction ownership without coordinate-based adoption.
      dragging.current = {
        type: "pathPoint",
        id: primary.pathId,
        pointIndex: primary.pointIndex,
        sx: pendingGeneratedPoint.sx,
        sy: pendingGeneratedPoint.sy,
        ox: owner.points[primary.pointIndex]?.x ?? owner.points[0]?.x ?? 0,
        oy: owner.points[primary.pointIndex]?.y ?? owner.points[0]?.y ?? 0,
        generatedVertexRefs: pendingGeneratedPoint.refs,
        generatedNodeId: pendingGeneratedPoint.nodeId,
      };
      generatedPointProxyRef.current = null;
      setSelected({ type: "path", id: primary.pathId });
      setSelectedPathPoint({ pathId: primary.pathId, pointIndex: primary.pointIndex });
    }

    const drag = dragging.current;
    if (!drag) return;

    if (drag.type === "entrance" && drag.buildingId) {
      const parent = buildings.find((b) => b.id === drag.buildingId);
      if (!parent || parent.locked) return;
      // Keep Entrances attached to the perimeter while giving them the same
      // axis-alignment assistance as navigation points. References are only
      // used for an explicit, small snap during this drag; no connectivity is
      // inferred from coincident coordinates.
      const entranceReferences = [
        ...outdoorNodes
          .filter((node) => !(node.entranceId === drag.id && node.buildingId === parent.id))
          .map((node) => ({ id: node.id, x: node.x, y: node.y })),
        ...paths.flatMap((path) => path.points.map((point, index) => ({ id: `${path.id}:${index}`, ...point }))),
        ...(parent.entrances ?? [])
          .filter((entrance) => entrance.id !== drag.id)
          .map((entrance) => {
            const position = entranceWorldPosition(parent, entrance);
            return { id: `entrance:${entrance.id}`, x: position.x, y: position.y };
          }),
      ];
      const aligned = alignEntranceAttachment(parent, pt, entranceReferences, SNAP_DIST);
      const attachment = aligned.attachment;
      setGuides(aligned.guides);
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
      const otherPhysicalObjects = physicalAlignmentRefs(groupIds);
      const groupUsesBuildingSnap = group.some((member) => member.kind === "building" || member.kind === "marker");
      let { dx, dy } = computeGroupTranslation({
        members: group,
        draggedId: drag.id,
        rawDx: pt.x - drag.sx,
        rawDy: pt.y - drag.sy,
        canvasW: cw,
        canvasH: ch,
        snapGrid,
        // Edge/axis snapping uses the same physical-object references for
        // buildings, gates, areas and decor. Pathways are never references.
        otherBuildings: otherPhysicalObjects,
        // A physical group (including decor-only groups) snaps as one rigid
        // bounds box. This lets a bank of Scanner Rows align to a Building or
        // Gate edge without independently moving its members. Pathway-only
        // groups never reach this generic branch.
        edgeSnap,
        // A lone Campus Gate is allowed to sit on the campus perimeter; the
        // inset is for ordinary physical members only. Mixed groups still use
        // the rigid inset required by their non-Gate members.
        boundsInset: group.some((member) => member.kind !== "path" && member.kind !== "marker") ? CAMPUS_OBJECT_SAFE_INSET : 0,
      });
      // Decor-only groups use the same rigid edge snap as other physical
      // groups; additionally, scanner/decor rows get precise semantic axis
      // alignment by snapping the group center to a nearby physical center.
      // This is a rigid translation and never includes Pathways/navigation.
      if (!groupUsesBuildingSnap && otherPhysicalObjects.length > 0) {
        const movedBox = groupBBoxAfterTranslation(group, dx, dy);
        const centerX = movedBox.x + movedBox.width / 2;
        const centerY = movedBox.y + movedBox.height / 2;
        let bestX: { distance: number; target: number } | null = null;
        let bestY: { distance: number; target: number } | null = null;
        for (const reference of otherPhysicalObjects) {
          const targetX = reference.x + reference.width / 2;
          const targetY = reference.y + reference.height / 2;
          const xDistance = Math.abs(targetX - centerX);
          const yDistance = Math.abs(targetY - centerY);
          if (xDistance <= SNAP_DIST && (!bestX || xDistance < bestX.distance)) bestX = { distance: xDistance, target: targetX };
          if (yDistance <= SNAP_DIST && (!bestY || yDistance < bestY.distance)) bestY = { distance: yDistance, target: targetY };
        }
        if (bestX) dx += bestX.target - centerX;
        if (bestY) dy += bestY.target - centerY;
      }
      if (dx === 0 && dy === 0) return;
      gestureChangedRef.current = true;
      const startById = new globalThis.Map(group.map((m) => [m.id, m]));
      const nextBuildings = buildings.map((b) => {
        const start = startById.get(b.id);
        return start?.kind === "building" ? { ...b, x: start.x + dx, y: start.y + dy } : b;
      });
      const nextMarkers = markers.map((marker) => {
        const start = startById.get(marker.id);
        return start?.kind === "marker" ? { ...marker, x: start.x + dx, y: start.y + dy } : marker;
      });
      const groupTouchesGraphOwner = group.some((member) => member.kind !== "decorAsset");
      const groupedCampusBase = {
        ...campus,
        buildings: nextBuildings,
        markers: nextMarkers,
        // Pure decor groups are graph-neutral: preserve the navigation arrays
        // byte-for-byte instead of running the graph synchronizers as a side
        // effect of a visual-only gesture. Building, gate, and Pathway groups
        // still use their established owner-specific synchronization below.
        navNodes: groupTouchesGraphOwner ? syncEntranceNodePositions(nextBuildings, navNodes) : navNodes,
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
      };
      const groupedCampus = groupTouchesGraphOwner
        ? syncCampusGateNavigation(groupedCampusBase)
        : groupedCampusBase;
      const nextCampus = groupTouchesGraphOwner
        ? reconcilePathwayNavigation(syncExteriorEmergencyStairGraph({
            ...groupedCampus,
          }), genId, { preserveAuthoredGeometry: group.some((member) => member.kind === "path") })
        : groupedCampus;
      // Keep the ref in lockstep with rapid pointer moves.  React may batch
      // parent updates until the next frame; the next gesture frame must still
      // see the authoritative snapshot used by reconciliation.
      campusRef.current = nextCampus;
      onUpdate(nextCampus);
      const bbox = groupBBoxAfterTranslation(group, dx, dy);
      setOverlappingBuildings(computeOverlaps(nextBuildings));
      setGuides(computeGroupAlignmentGuides(bbox.x, bbox.y, bbox.width, bbox.height, otherPhysicalObjects, SNAP_DIST));
      return;
    }

    if (drag.type === "decorAsset") {
      const movingAsset = decorAssets.find((asset) => asset.id === drag.id);
      if (!movingAsset) return;
      const template = DECOR_ASSET_MAP[movingAsset.type];
      if (!template) return;
      const isArea = isDecorAreaType(movingAsset.type);
      const size = isArea
        ? { width: Math.max(1, movingAsset.width ?? template.defaultWidth), height: Math.max(1, movingAsset.height ?? template.defaultHeight) }
        : decorWorldSize(template, movingAsset.scale);
      const rawDx = snap(drag.ox + (pt.x - drag.sx)) - movingAsset.x;
      const rawDy = snap(drag.oy + (pt.y - drag.sy)) - movingAsset.y;
      const visible = memberVisibleBounds({ kind: "decorAsset", id: movingAsset.id, x: movingAsset.x, y: movingAsset.y, width: size.width, height: size.height, rotation: movingAsset.rotation ?? 0 });
      // Snap the transformed visible bounds, then convert that one local
      // translation back to the asset's center. This keeps guides and the
      // committed movement in lock-step at every zoom level.
      const aligned = snapRectToVisibleBounds(
        { x: visible.x + rawDx, y: visible.y + rawDy, width: visible.width, height: visible.height },
        physicalAlignmentRefs(new Set([movingAsset.id])),
        SNAP_DIST,
      );
      setGuides(aligned.guides);
      const bounded = clampMemberTranslation(
        { kind: "decorAsset", id: movingAsset.id, x: movingAsset.x, y: movingAsset.y, width: size.width, height: size.height, rotation: movingAsset.rotation ?? 0 },
        rawDx + (aligned.x - (visible.x + rawDx)),
        rawDy + (aligned.y - (visible.y + rawDy)),
        cw,
        ch,
        CAMPUS_OBJECT_SAFE_INSET,
      );
      const updatedAssets = decorAssets.map((da) => da.id === drag.id
        ? { ...da, x: movingAsset.x + bounded.dx, y: movingAsset.y + bounded.dy }
        : da);
      gestureChangedRef.current = true;
      onUpdate({ ...campus, decorAssets: updatedAssets });
      return;
    }
    if (drag.type === "path") {
      const dx = pt.x - drag.sx;
      const dy = pt.y - drag.sy;
      // A pointer-down/up with no meaningful translation is selection only.
      // Do not reconcile the graph, rewrite edge geometry, or create history
      // for a zero-movement Pathway interaction.
      if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;
      const startPoints = drag.points ?? [];
      gestureChangedRef.current = true;
      if (pathMemberEditId === drag.id && pathGroupOriginRef.current) {
        const nextCampus = reconcilePathwayNavigation({
          ...campus,
          paths: movePathMemberPreservingJunctions(
            paths,
            drag.id,
            pathGroupOriginRef.current,
            dx,
            dy,
            snap,
          ),
        }, genId, { preserveAuthoredGeometry: true });
        campusRef.current = nextCampus;
        onUpdate(nextCampus);
        return;
      }
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
      const nextCampus = reconcilePathwayNavigation({
        ...campus,
        paths: paths.map((p) => p.id === drag.id
          ? { ...p, points: startPoints.map((point) => {
              const nextPoint = { x: snap(point.x + dx), y: snap(point.y + dy) };
              return externalJunctionKeys.has(pathPointKey(point)) ? { x: nextPoint.x + 0.001, y: nextPoint.y } : nextPoint;
            }) }
          : p),
      }, genId, { preserveAuthoredGeometry: true });
      campusRef.current = nextCampus;
      onUpdate(nextCampus);
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
      const aligned = alignedOptions.reduce<{ point: { x: number; y: number }; guides: { type: "h" | "v"; pos: number }[]; distance: number }>(
        (best, option) => {
          const dist = Math.hypot(option.point.x - rawPoint.x, option.point.y - rawPoint.y);
          return dist < best.distance ? { point: option.point, guides: option.guides, distance: dist } : best;
        },
        { point: rawPoint, guides: [] as { type: "h" | "v"; pos: number }[], distance: Number.POSITIVE_INFINITY }
      );
       // Moving an existing Pathway vertex is a geometry edit only.  It must
       // never adopt another Pathway segment or create a junction as a side
       // effect of crossing/landing on that segment.  The explicit Walking
       // Point tool remains the only operation that inserts/splits a path.
       const topologyPoint = aligned.point;
      const generatedNode = drag.generatedNodeId ? outdoorNodes.find((node) => node.id === drag.generatedNodeId) : undefined;
      const connectedIds = generatedNode
        ? new Set(navEdges.flatMap((edge) => {
            if (edge.startNodeId === generatedNode.id) return [edge.endNodeId];
            if (edge.endNodeId === generatedNode.id) return [edge.startNodeId];
            return [];
          }))
        : undefined;
       const navAligned = navAlignSnap(topologyPoint, outdoorNodes.filter((node) => node.id !== drag.generatedNodeId), SNAP_DIST, connectedIds);
       const nextPoint = { x: navAligned.x, y: navAligned.y };
       setGuides(navAligned.guides.length > 0 ? navAligned.guides : aligned.guides);
      gestureChangedRef.current = true;
      const oldPoint = drag.pointIndex !== undefined ? path.points[drag.pointIndex] : undefined;
      const oldKey = oldPoint ? pathPointKey(oldPoint) : "";
      const moveLinkedJunction = drag.pointIndex !== undefined && pathPointIsJunction(path.id, drag.pointIndex);
      const explicitProxyRefs = drag.generatedVertexRefs;
      const proxyRefKeys = explicitProxyRefs
        ? new Set(explicitProxyRefs.map((ref) => `${ref.pathId}:${ref.pointIndex}`))
        : null;
       const nextPaths = paths.map((p) => ({
         ...p,
        points: p.points.map((point, index) => {
          // Proxy drags carry explicit provenance refs for every physical
          // vertex represented by the canonical generated node. This is the
          // shared-junction path; never widen it to nearby coordinate matches.
          if (proxyRefKeys?.has(`${p.id}:${index}`)) return nextPoint;
          if (!proxyRefKeys && moveLinkedJunction && pathPointKey(point) === oldKey) return nextPoint;
          if (p.id === drag.id && index === drag.pointIndex) return nextPoint;
          return point;
        }),
       }));
       const reconciled = reconcilePathwayNavigation({ ...campus, paths: nextPaths }, genId, { preserveAuthoredGeometry: true });
       // Reconcile moves generated nodes, but independently-authored branch
       // edges incident to that node still need their bends/cost rebuilt from
       // the new endpoint.  Keep the edge IDs/metadata; only replace stale
       // endpoint geometry.
       const movedNodeIds = new Set<string>();
       if (drag.generatedNodeId) movedNodeIds.add(drag.generatedNodeId);
       const movedRefKeys = new Set((explicitProxyRefs ?? []).map((ref) => `${ref.pathId}:${ref.pointIndex}`));
       const movedVertexId = drag.pointIndex !== undefined ? path.navigationVertexIds?.[drag.pointIndex] : undefined;
       reconciled.navNodes?.forEach((node) => {
         if ((node.generatedFromPathVertices ?? []).some((ref) =>
           movedRefKeys.has(`${ref.pathId}:${path.navigationVertexIds?.indexOf(ref.vertexId) ?? -1}`)
           || (movedVertexId && ref.pathId === path.id && ref.vertexId === movedVertexId)
         )) movedNodeIds.add(node.id);
       });
       const rebuiltEdges = (reconciled.navEdges ?? []).map((edge) =>
         movedNodeIds.has(edge.startNodeId) || movedNodeIds.has(edge.endNodeId)
           ? rebuildOutdoorEdgeGeometry(edge, reconciled.navNodes ?? [], oldPoint ? [{ x: oldPoint.x, y: oldPoint.y }] : [])
           : edge
       );
       const nextCampus = { ...reconciled, navEdges: rebuiltEdges };
       campusRef.current = nextCampus;
       onUpdate(nextCampus);
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
      onUpdate(reconcilePathwayNavigation({
        ...campus,
        paths: paths.map((p) => p.id === drag.id ? { ...p, width: nextWidth } : p),
      }, genId));
      return;
    }
    if (drag.type === "navEdgeBend") {
      const edge = navEdges.find((ed) => ed.id === drag.id);
      if (!edge || drag.pointIndex === undefined) return;
      if (isPathwayGeneratedEdge(edge)) return;
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
          ...(aNode ? [{ x: aNode.x, y: aNode.y, id: edge.startNodeId }] : []),
          ...(bNode ? [{ x: bNode.x, y: bNode.y, id: edge.endNodeId }] : []),
          ...bends.filter((_, i) => i !== drag.pointIndex),
          ...outdoorNodes
            .filter((node) => node.id !== edge.startNodeId && node.id !== edge.endNodeId)
            .map((node) => ({ x: node.x, y: node.y, id: node.id })),
        ];
        const snapAlign = navAlignSnap(
          { x: nx, y: ny },
          others,
          SNAP_DIST,
          new Set([edge.startNodeId, edge.endNodeId]),
        );
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
      if (node.exteriorEmergencyStairId && !node.floorId) return;
      if (node.gateId) return;
      if (node.generatedFromPathVertices?.length) return;
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
         const movedNodeIds = new Set(navGroup.keys());
         const nextNodes = navNodes.map((n) => {
           const origin = navGroup.get(n.id);
           return origin
             ? { ...n, x: Math.max(0, Math.min(cw, Math.round(origin.x + dx))), y: Math.max(0, Math.min(ch, Math.round(origin.y + dy))) }
             : n;
         });
         const nextEdges = navEdges.map((edge) => {
           const originBends = edgeBendOrigins?.get(edge.id);
           const translated = originBends && originBends.length > 0
             ? { ...edge, bendPoints: originBends.map((b) => ({ x: b.x + dx, y: b.y + dy })) }
             : edge;
           if (!movedNodeIds.has(edge.startNodeId) && !movedNodeIds.has(edge.endNodeId)) return translated;
           const stalePositions = [edge.startNodeId, edge.endNodeId]
             .map((id) => navGroup.get(id))
             .filter(Boolean) as { x: number; y: number }[];
           return rebuildOutdoorEdgeGeometry(translated, nextNodes, stalePositions);
         });
         onUpdate(reconcileEntranceOutdoorConnections({
           ...campus,
           navNodes: nextNodes,
           navEdges: nextEdges,
         }));
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
       const nextNodes = navNodes.map((n) =>
         n.id === drag.id
           ? { ...n, x: aligned.point.x, y: aligned.point.y }
           : n
       );
       const stalePosition = { x: drag.ox, y: drag.oy };
       const nextEdges = navEdges.map((edge) => {
         if (edge.startNodeId !== drag.id && edge.endNodeId !== drag.id) return edge;
         return rebuildOutdoorEdgeGeometry(edge, nextNodes, [stalePosition]);
       });
       onUpdate(reconcileEntranceOutdoorConnections({
         ...campus,
         navNodes: nextNodes,
         navEdges: nextEdges,
       }));
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
      const refsForSnap = physicalAlignmentRefs(new Set([drag.id]));
      const snapResult = snapRectToVisibleBounds(
        { x: targetX, y: targetY, width: b.width, height: b.height, rotation: b.rotation ?? 0 },
        refsForSnap,
        SNAP_DIST,
      );
      const snappedBuilding = edgeSnapBuilding({ ...b, x: snapResult.x, y: snapResult.y }, buildings);
      const boundedBuildingDelta = clampMemberTranslation(
        { kind: "building", id: b.id, x: b.x, y: b.y, width: b.width, height: b.height, rotation: b.rotation ?? 0 },
        snappedBuilding.x - b.x,
        snappedBuilding.y - b.y,
        cw,
        ch,
        CAMPUS_OBJECT_SAFE_INSET,
      );
      const targetB = { ...snappedBuilding, x: b.x + boundedBuildingDelta.dx, y: b.y + boundedBuildingDelta.dy };
      gestureChangedRef.current = true;
      const nextBuildings = buildings.map((bld) => (bld.id === drag.id ? { ...bld, x: targetB.x, y: targetB.y } : bld));
      onUpdate(syncExteriorEmergencyStairGraph({
        ...campus,
        buildings: nextBuildings,
        navNodes: syncEntranceNodePositions(nextBuildings, navNodes),
      }));
      // Alignment guides — same visible-bounds result that drove the snap.
      const guidesList: { type: "h" | "v"; pos: number }[] = snapResult.guides;
      // Check overlaps during drag
      const movedBldgs = buildings.map((bld) => (bld.id === drag.id ? targetB : bld));
      const overlaps = computeOverlaps(movedBldgs);
      setOverlappingBuildings(overlaps);
      setGuides(guidesList);
    } else {
      gestureChangedRef.current = true;
      const movingMarker = markers.find((marker) => marker.id === drag.id);
      const markerSize = movingMarker
        ? { width: movingMarker.width ?? 24, height: movingMarker.height ?? 24 }
        : { width: 24, height: 24 };
      let rawMarker: { dx: number; dy: number };
      if (movingMarker && isCampusGate(movingMarker)) {
        // A Campus Gate's marker position is the canonical navigation-anchor
        // position (syncCampusGateNavigation keeps the linked node in lock
        // step).  Align only this proposed local transform to the actual
        // connected outdoor target; never move the Pathway or rebuild the
        // surrounding graph.  The tolerance is in world/canvas units, so it
        // remains predictable at every editor zoom level.
        const proposed = {
          x: snap(drag.ox + (pt.x - drag.sx)),
          y: snap(drag.oy + (pt.y - drag.sy)),
        };
        const gateNodeId = movingMarker.navNodeId
          ?? navNodes.find((node) => node.gateId === movingMarker.id)?.id;
        const connectedTargets = gateNodeId
          ? navEdges
            .filter((edge) => edge.type !== "floor_transition" && edge.type !== "entrance_transition")
            .flatMap((edge) => {
              if (edge.startNodeId === gateNodeId) return [edge.endNodeId];
              if (edge.endNodeId === gateNodeId) return [edge.startNodeId];
              return [];
            })
            .map((id) => navNodes.find((node) => node.id === id))
            .filter((node): node is NavigationNode => !!node && !node.floorId && node.id !== gateNodeId)
            .sort((a, b) => Math.hypot(a.x - proposed.x, a.y - proposed.y) - Math.hypot(b.x - proposed.x, b.y - proposed.y))
          : [];
        const aligned = alignCampusGateAnchor(proposed, connectedTargets[0], SNAP_DIST);
        setGuides(aligned.guides);
        rawMarker = { dx: aligned.point.x - movingMarker.x, dy: aligned.point.y - movingMarker.y };
      } else {
        setGuides([]);
        rawMarker = movingMarker
          ? clampMemberTranslation(
              { kind: "marker", id: movingMarker.id, x: movingMarker.x, y: movingMarker.y, width: markerSize.width, height: markerSize.height },
              snap(drag.ox + (pt.x - drag.sx)) - movingMarker.x,
              snap(drag.oy + (pt.y - drag.sy)) - movingMarker.y,
              cw,
              ch,
              CAMPUS_OBJECT_SAFE_INSET,
            )
            : { dx: 0, dy: 0 };
      }
      const nextMarkers = markers.map((m) => (m.id === drag.id
        ? { ...m, x: movingMarker ? movingMarker.x + rawMarker.dx : m.x, y: movingMarker ? movingMarker.y + rawMarker.dy : m.y }
        : m));
      const moved = nextMarkers.find((marker) => marker.id === drag.id);
      const nextCampus = { ...campus, markers: nextMarkers };
      onUpdate(moved && isCampusGate(moved) ? syncCampusGateNavigation(nextCampus, genId) : nextCampus);
    }
  };

  const handleResizeStart = (e: React.MouseEvent, b: CampusBuilding, corner: string) => {
    e.stopPropagation();
    // B8 Phase 1: unified editor — resize works in all layers.
    const pt = getPoint(e, cw, ch);
    gestureHistoryPushed.current = false;
    setResizing({ id: b.id, corner, sx: pt.x, sy: pt.y, ox: b.x, oy: b.y, ow: b.width, oh: b.height });
  };

  const handleMarkerResizeStart = useCallback((e: React.MouseEvent, marker: CampusMarker, corner: string) => {
    if (!isCampusGate(marker) || tool !== "select") return;
    e.preventDefault();
    e.stopPropagation();
    const pt = getPoint(e, cw, ch);
    const size = campusGateSize(marker);
    gestureHistoryPushed.current = false;
    gestureChangedRef.current = false;
    markerResizing.current = { id: marker.id, corner, sx: pt.x, sy: pt.y, ox: marker.x, oy: marker.y, ow: size.width, oh: size.height };
    setMarkerResizingId(marker.id);
  }, [cw, ch, getPoint, tool]);

  // ── Rotation handler ──
  const handleRotateStart = useCallback((e: React.MouseEvent, b: CampusBuilding) => {
    e.stopPropagation();
    // B8 Phase 1: unified editor — rotation works in all layers.
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
    const isGround = isDecorAreaType(da.type);
    decorResizing.current = {
      id: da.id, corner,
      sx: pt.x, sy: pt.y,
      ox: da.x, oy: da.y,
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

  const handleCanvasResizeStart = useCallback((e: React.MouseEvent, handle: CanvasResizeHandle) => {
    if (!canvasResizeMode || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const base = pendingCanvasResize ?? canvasResizePreview ?? { width: cw, height: ch };
    if (!canvasResizeOriginalRef.current) {
      canvasResizeOriginalRef.current = { width: cw, height: ch };
    }
    // A second edge drag continues from the previous proposal instead of
    // jumping back to the last saved canvas dimensions.
    setPendingCanvasResize(null);
    canvasResizeRef.current = {
      handle,
      startW: base.width,
      startH: base.height,
      clientX: e.clientX,
      clientY: e.clientY,
    };
    setCanvasResizePreview(base);
  }, [canvasResizeMode, cw, ch, canvasResizePreview, pendingCanvasResize]);

  const handleSvgMoveResize = (e: React.MouseEvent) => {
    if (canvasResizeRef.current) {
      const gesture = canvasResizeRef.current;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const scale = Math.max(0.0001, Math.min(rect.width / gesture.startW, rect.height / gesture.startH));
      const next = resizeCampusCanvasFromHandle(
        { width: gesture.startW, height: gesture.startH },
        gesture.handle,
        { x: (e.clientX - gesture.clientX) / scale, y: (e.clientY - gesture.clientY) / scale },
        campus.gridSize ?? 20,
      );
      setCanvasResizePreview(next);
      return;
    }
    // ── B5 Phase 5.12 — path-network/group rotation: rotates the actual point
    // geometry around the group center (Shift = 15° snap), one history entry.
    if (markerResizing.current) {
      const gesture = markerResizing.current;
      const pt = getPoint(e, cw, ch);
      const grid = Math.max(1, campus.gridSize ?? 20);
      const snapDelta = (value: number) => snapGrid ? Math.round(value / grid) * grid : Math.round(value);
      let nw = gesture.ow;
      let nh = gesture.oh;
      if (gesture.corner.includes("e")) nw = gesture.ow + snapDelta(pt.x - gesture.sx);
      if (gesture.corner.includes("w")) nw = gesture.ow - snapDelta(pt.x - gesture.sx);
      if (gesture.corner.includes("s")) nh = gesture.oh + snapDelta(pt.y - gesture.sy);
      if (gesture.corner.includes("n")) nh = gesture.oh - snapDelta(pt.y - gesture.sy);
      nw = Math.max(24, nw);
      nh = Math.max(22, nh);
      const dW = nw - gesture.ow;
      const dH = nh - gesture.oh;
      const cx = gesture.ox + (gesture.corner.includes("e") ? dW / 2 : gesture.corner.includes("w") ? -dW / 2 : 0);
      const cy = gesture.oy + (gesture.corner.includes("s") ? dH / 2 : gesture.corner.includes("n") ? -dH / 2 : 0);
      const nextMarkers = markers.map((marker) => marker.id === gesture.id
        ? { ...marker, x: Math.max(0, Math.min(cw, Math.round(cx))), y: Math.max(0, Math.min(ch, Math.round(cy))), width: Math.round(nw), height: Math.round(nh) }
        : marker);
      const next = syncCampusGateNavigation({ ...campus, markers: nextMarkers }, genId);
      gestureChangedRef.current = true;
      campusRef.current = next;
      onUpdate(next);
      return;
    }
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
      onUpdate(reconcilePathwayNavigation({
        ...campus,
        paths: paths.map((path) => starts.has(path.id)
          ? { ...path, points: (starts.get(path.id) ?? path.points).map(rotatePt) }
          : path),
      }, genId, { preserveAuthoredGeometry: true }));
      setRotatingAngle(angle);
      // B5 Phase 5.14: update the rotated frame's angle so Canvas renders
      // the selection outline with SVG transform.
      setPathGroupRotationBounds((prev) => prev ? { ...prev, angle } : null);
      return;
    }
    if (groupResizing.current) {
      const gesture = groupResizing.current;
      const pt = getPoint(e, cw, ch);
      const nextBounds = computeGroupResizeBounds(gesture.bounds, gesture.corner, pt, cw, ch, snapGrid, campus.gridSize ?? 20, 20, CAMPUS_OBJECT_SAFE_INSET);
      const resizedMembers = resizeGroupMembers(gesture.members, gesture.bounds, nextBounds);
      const startById = new globalThis.Map(gesture.members.map((member) => [member.id, member]));
      const resizedById = new globalThis.Map(resizedMembers.map((member) => [member.id, member]));
      const currentCampus = campusRef.current;
      const nextBuildings = currentCampus.buildings.map((building) => {
        const start = startById.get(building.id);
        const next = resizedById.get(building.id);
        return start?.kind === "building" && next
          ? { ...building, x: Math.round(next.x), y: Math.round(next.y), width: Math.max(20, Math.round(next.width)), height: Math.max(20, Math.round(next.height)) }
          : building;
      });
      const nextDecorAssets = (currentCampus.decorAssets ?? []).map((asset) => {
        const start = startById.get(asset.id);
        const next = resizedById.get(asset.id);
        if (start?.kind !== "decorAsset" || !next) return asset;
        const factor = Math.sqrt(Math.abs(next.width * next.height) / Math.max(1, start.width * start.height));
        return isDecorAreaType(asset.type)
          ? { ...asset, x: Math.round(next.x), y: Math.round(next.y), width: Math.max(30, Math.round(next.width)), height: Math.max(24, Math.round(next.height)), scale: undefined }
          : { ...asset, x: Math.round(next.x), y: Math.round(next.y), scale: Math.max(0.1, Math.min(12, (gesture.decorScales[asset.id] ?? 1) * factor)) };
      });
      const nextMarkers = (currentCampus.markers ?? []).map((marker) => {
        const start = startById.get(marker.id);
        const next = resizedById.get(marker.id);
        return start?.kind === "marker" && next
          ? { ...marker, x: Math.round(next.x), y: Math.round(next.y), width: Math.max(24, Math.round(next.width)), height: Math.max(22, Math.round(next.height)) }
          : marker;
      });
      const groupTouchesGraphOwner = gesture.members.some((member) => member.kind !== "decorAsset");
      const nextBase = {
        ...currentCampus,
        buildings: nextBuildings,
        decorAssets: nextDecorAssets,
        markers: nextMarkers,
        // Resizing a pure visual selection must not invoke any navigation
        // reconciliation. Building/gate members retain their established
        // owner-specific synchronization, while decor-only groups remain
        // graph-neutral and preserve nav arrays verbatim.
        navNodes: groupTouchesGraphOwner
          ? syncEntranceNodePositions(nextBuildings, currentCampus.navNodes ?? [])
          : currentCampus.navNodes,
      };
      const next = groupTouchesGraphOwner
        ? syncCampusGateNavigation(syncExteriorEmergencyStairGraph(nextBase))
        : nextBase;
      gestureChangedRef.current = true;
      beginGestureHistory();
      campusRef.current = next;
      onUpdate(next);
      setGuides([]);
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
      onUpdate(reconcilePathwayNavigation({
        ...campus,
        paths: paths.map((path) => starts.has(path.id)
          ? { ...path, points: (starts.get(path.id) ?? path.points).map(scalePoint) }
          : path),
      }, genId, { preserveAuthoredGeometry: true }));
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
        const template = DECOR_ASSET_MAP[da.type];
        const size = template
          ? (isDecorAreaType(da.type)
              ? { width: da.width ?? template.defaultWidth, height: da.height ?? template.defaultHeight }
              : decorWorldSize(template, da.scale))
          : { width: 1, height: 1 };
        const boundedRotation = clampMemberTranslation(
          { kind: "decorAsset", id: da.id, x: da.x, y: da.y, width: size.width, height: size.height, rotation: snapped },
          0,
          0,
          cw,
          ch,
          CAMPUS_OBJECT_SAFE_INSET,
        );
        beginGestureHistory();
        gestureChangedRef.current = true;
        onUpdate({ ...campus, decorAssets: decorAssets.map((d) => (d.id === id ? { ...d, rotation: snapped, x: Math.round(d.x + boundedRotation.dx), y: Math.round(d.y + boundedRotation.dy) } : d)) });
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
        // Area handles use the same opposite-edge anchor as buildings.  Keep
        // the untouched corner/edge fixed instead of changing only width and
        // height around the old center (which made west/north drags feel like
        // the object was snapping back toward the middle).
        const dW = nextW - startW;
        const dH = nextH - startH;
        const localShiftX = rs.corner.includes("e") ? dW / 2 : rs.corner.includes("w") ? -dW / 2 : 0;
        const localShiftY = rs.corner.includes("s") ? dH / 2 : rs.corner.includes("n") ? -dH / 2 : 0;
        const nextCenter = {
          x: rs.ox + localShiftX * cosR - localShiftY * sinR,
          y: rs.oy + localShiftX * sinR + localShiftY * cosR,
        };
        const fitted = fitDecorSizeToCanvas(nextCenter.x, nextCenter.y, nextW, nextH, rs.rot, cw, ch);
        nextW = Math.max(30, Math.min(nextW, fitted.width));
        nextH = Math.max(24, Math.min(nextH, fitted.height));
        const bounded = clampMemberTranslation(
          { kind: "decorAsset", id: rs.id, x: nextCenter.x, y: nextCenter.y, width: nextW, height: nextH, rotation: rs.rot },
          0,
          0,
          cw,
          ch,
          CAMPUS_OBJECT_SAFE_INSET,
        );
        beginGestureHistory();
        gestureChangedRef.current = true;
        const currentCampus = campusRef.current;
        const currentDecorAssets = currentCampus.decorAssets ?? [];
        const next = {
          ...currentCampus,
          decorAssets: currentDecorAssets.map((d) => (d.id === rs.id
            ? { ...d, x: Math.round(nextCenter.x + bounded.dx), y: Math.round(nextCenter.y + bounded.dy), width: nextW, height: nextH, scale: undefined }
            : d)),
        };
        campusRef.current = next;
        onUpdate(next);
        return;
      }
      // Uniform scale factor along the dragged corner's axes (anchored at center)
      let fx = 1, fy = 1;
      if (rs.corner.includes("e")) fx = rs.hw > 0 ? (rs.hw + localDx) / rs.hw : 1;
      if (rs.corner.includes("w")) fx = rs.hw > 0 ? (rs.hw - localDx) / rs.hw : 1;
      if (rs.corner.includes("s")) fy = rs.hh > 0 ? (rs.hh + localDy) / rs.hh : 1;
      if (rs.corner.includes("n")) fy = rs.hh > 0 ? (rs.hh - localDy) / rs.hh : 1;
      const factor = Math.max(fx, fy, 0.05);
      let newScale = Math.max(0.1, Math.min(12, rs.scale * factor));
      const currentAsset = campusRef.current.decorAssets?.find((asset) => asset.id === rs.id);
      if (currentAsset) {
        // Resolve the descriptor from the live asset rather than the resize
        // start closure.  The latter owns the initial half-extents only; the
        // old code referenced its local `template` variable here, which is not
        // in scope during pointer-move and caused the handle gesture to abort
        // before publishing a resized asset.
        const currentTemplate = DECOR_ASSET_MAP[currentAsset.type];
        if (currentTemplate) {
          const requested = decorWorldSize(currentTemplate, newScale);
          const fitted = fitDecorSizeToCanvas(currentAsset.x, currentAsset.y, requested.width, requested.height, currentAsset.rotation ?? 0, cw, ch);
          newScale = Math.max(0.1, Math.min(newScale, newScale * fitted.factor));
        }
      }
      beginGestureHistory();
      gestureChangedRef.current = true;
      // Use the live campus snapshot for every pointer sample.  React may not
      // have committed the previous onUpdate yet, so the render-time
      // `campus`/`decorAssets` closure can otherwise rewind a multi-frame drag
      // to the first sample even though the handle itself remains visible.
      const currentCampus = campusRef.current;
      const currentDecorAssets = currentCampus.decorAssets ?? [];
      const next = {
        ...currentCampus,
        decorAssets: currentDecorAssets.map((d) => (d.id === rs.id ? { ...d, scale: newScale } : d)),
      };
      campusRef.current = next;
      onUpdate(next);
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
        const boundedRotation = clampMemberTranslation(
          { kind: "building", id: b.id, x: b.x, y: b.y, width: b.width, height: b.height, rotation: snapped },
          0,
          0,
          cw,
          ch,
          CAMPUS_OBJECT_SAFE_INSET,
        );
        const nextBuildings = buildings.map(bld => bld.id === id
          ? { ...bld, rotation: snapped, x: Math.round(bld.x + boundedRotation.dx), y: Math.round(bld.y + boundedRotation.dy) }
          : bld);
        beginGestureHistory();
        onUpdate(syncExteriorEmergencyStairGraph({
          ...campus,
          buildings: nextBuildings,
          // B5 Phase 1.8: rotating a building moves its entrances → the linked
          // nav nodes follow in the same gesture.
          navNodes: syncEntranceNodePositions(nextBuildings, navNodes),
        }));
        setRotatingAngle(snapped);
      }
      return;
    }
    if (exteriorStairDragging.current) {
      const gesture = exteriorStairDragging.current;
      const building = buildings.find((candidate) => candidate.id === gesture.buildingId);
      const owner = building ? canonicalExteriorEmergencyStairsForBuilding(building).find((stair) => stair.id === gesture.stairId) : undefined;
      if (!building || !owner) return;
      const pt = getPoint(e, cw, ch);
      const rotation = ((building.rotation ?? 0) * Math.PI) / 180;
      const cosR = Math.cos(rotation);
      const sinR = Math.sin(rotation);
      const dx = pt.x - (building.x + building.width / 2);
      const dy = pt.y - (building.y + building.height / 2);
      const localPoint = {
        x: dx * cosR + dy * sinR + building.width / 2,
        y: -dx * sinR + dy * cosR + building.height / 2,
      };
      const edge = exteriorEmergencyStairEdgeForPointer(localPoint, { width: building.width, height: building.height }, gesture.previewEdge);
      // Keep the preview side sticky even when the candidate is invalid.  If
      // hysteresis were seeded from the last committed edge on every frame,
      // pointer samples around a corner could alternate between two sides.
      gesture.previewEdge = edge;
      const rawOffset = exteriorEmergencyStairOffsetForPointer(localPoint, { width: building.width, height: building.height }, edge);
      const wallSpan = edge === "top" || edge === "bottom" ? building.width : building.height;
      const visual = exteriorEmergencyStairVisualDimensions(owner);
      const candidateSpan = (edge === "top" || edge === "bottom" ? visual.width : visual.height) + 12;
      const range = exteriorEmergencyStairSafeOffsetRange(edge, wallSpan, owner.width, owner.height, owner.visualSize);
      const sameEdgeEntrances = (building.entrances ?? []).filter((entrance) => entrance.edge === edge);
      const sameEdgeStairs = canonicalExteriorEmergencyStairsForBuilding(building).filter((stair) => stair.id !== owner.id && stair.attachment.edge === edge);
      let offset = Math.max(range.min, Math.min(range.max, rawOffset));
      // The discharge is a derived navigation anchor, so a physical stair
      // drag must use the same alignment helper as free Navigation nodes.  The
      // directly connected outdoor node(s) are passed as the priority set;
      // only the wall-axis coordinate is applied back to the canonical offset.
      // Rotated buildings keep their existing wall-reference snapping because
      // their world-space edge is not axis-aligned.
      const dischargeNode = navNodes.find((node) => node.exteriorEmergencyStairId === owner.id
        && !node.floorId
        && (!node.buildingId || node.buildingId === building.id));
      let navOffsetSnap: { offset: number; guide: { type: "h" | "v"; pos: number } } | null = null;
      const rotationDeg = ((building.rotation ?? 0) % 360 + 360) % 360;
      if (dischargeNode && [0, 90, 180, 270].some((angle) => Math.abs(rotationDeg - angle) < 0.001)) {
        const connectedIds = new Set<string>();
        for (const edgeRecord of navEdges) {
          if (edgeRecord.startNodeId === dischargeNode.id) connectedIds.add(edgeRecord.endNodeId);
          else if (edgeRecord.endNodeId === dischargeNode.id) connectedIds.add(edgeRecord.startNodeId);
        }
        const candidateOwner = { ...owner, attachment: { ...owner.attachment, edge, offset } };
        const candidateWorld = exteriorEmergencyStairWorldPosition(building, candidateOwner);
        const aligned = navAlignmentForPoint(candidateWorld, dischargeNode.id, connectedIds);
        const alongAxis = edge === "top" || edge === "bottom" ? "v" : "h";
        const axisGuide = aligned.guides.find((guide) => guide.type === alongAxis);
        const axisDistance = axisGuide
          ? alongAxis === "v" ? Math.abs(axisGuide.pos - candidateWorld.x) : Math.abs(axisGuide.pos - candidateWorld.y)
          : Number.POSITIVE_INFINITY;
        if (axisGuide && axisDistance <= SNAP_DIST) {
          const rotation = ((building.rotation ?? 0) * Math.PI) / 180;
          const dx = aligned.point.x - (building.x + building.width / 2);
          const dy = aligned.point.y - (building.y + building.height / 2);
          const localX = dx * Math.cos(rotation) + dy * Math.sin(rotation) + building.width / 2;
          const localY = -dx * Math.sin(rotation) + dy * Math.cos(rotation) + building.height / 2;
          const localAlong = edge === "top" || edge === "bottom" ? localX : localY;
          const snappedOffset = Math.max(range.min, Math.min(range.max, localAlong / Math.max(1, wallSpan)));
          if (Math.abs(snappedOffset - offset) * wallSpan <= SNAP_DIST + 0.001) {
            offset = snappedOffset;
            navOffsetSnap = { offset, guide: axisGuide };
          }
        }
      }
      const targets = [0.5, ...sameEdgeEntrances.map((entrance) => Number.isFinite(Number(entrance.offset)) ? Number(entrance.offset) : 0.5), ...sameEdgeStairs.map((stair) => Number.isFinite(Number(stair.attachment.offset)) ? Number(stair.attachment.offset) : 0.5)];
      const nearest = targets
        .map((target) => ({ target: Math.max(range.min, Math.min(range.max, target)), distance: Math.abs(target - offset) * wallSpan }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (!navOffsetSnap && nearest && nearest.distance <= SNAP_DIST) offset = nearest.target;
      offset = Math.round(offset * 1000) / 1000;
      const collidesWithEntrance = sameEdgeEntrances.some((entrance) => {
        const entranceSpan = 24;
        return exteriorEmergencyStairWallSpansOverlap(offset, candidateSpan, Number.isFinite(Number(entrance.offset)) ? Number(entrance.offset) : 0.5, entranceSpan, wallSpan, 4);
      });
      const collidesWithStair = sameEdgeStairs.some((stair) => {
        const otherVisual = exteriorEmergencyStairVisualDimensions(stair);
        const otherSpan = (edge === "top" || edge === "bottom" ? otherVisual.width : otherVisual.height) + 12;
        return exteriorEmergencyStairWallSpansOverlap(offset, candidateSpan, Number.isFinite(Number(stair.attachment.offset)) ? Number(stair.attachment.offset) : 0.5, otherSpan, wallSpan, 4);
      });
      const valid = !collidesWithEntrance && !collidesWithStair;
      const guideTarget = nearest && nearest.distance <= SNAP_DIST ? nearest.target : null;
      if (navOffsetSnap) {
        setGuides([navOffsetSnap.guide]);
      } else if (guideTarget !== null && (building.rotation ?? 0) % 90 === 0) {
        const localGuide = edge === "top" || edge === "bottom" ? { x: guideTarget * building.width, y: 0 } : { x: 0, y: guideTarget * building.height };
        const worldGuide = {
          x: building.x + localGuide.x * cosR - localGuide.y * sinR,
          y: building.y + localGuide.x * sinR + localGuide.y * cosR,
        };
        setGuides([edge === "top" || edge === "bottom" ? { type: "v", pos: worldGuide.x } : { type: "h", pos: worldGuide.y }]);
      } else {
        setGuides([]);
      }
      setExteriorStairPreview({ buildingId: building.id, stairId: owner.id, edge, offset, valid });
      if (valid && (edge !== gesture.currentEdge || offset !== gesture.currentOffset)) {
        const nextBuildings = buildings.map((candidate) => candidate.id !== building.id
          ? candidate
          : {
              ...candidate,
              exteriorEmergencyStairs: canonicalExteriorEmergencyStairsForBuilding(candidate).map((stair) => stair.id === owner.id
                ? { ...stair, attachment: { ...stair.attachment, edge, offset } }
                : stair),
            });
        beginGestureHistory();
        onUpdate(syncExteriorEmergencyStairGraph({ ...campus, buildings: nextBuildings, navNodes: syncEntranceNodePositions(nextBuildings, navNodes) }));
        gesture.currentEdge = edge;
        gesture.currentOffset = offset;
        gesture.edge = edge;
        gestureChangedRef.current = edge !== gesture.startEdge || offset !== gesture.startOffset;
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
      const candidate = { ...b, x: Math.round(nx), y: Math.round(ny), width: nw, height: nh };
      const fitted = fitDecorSizeToCanvas(
        candidate.x + candidate.width / 2,
        candidate.y + candidate.height / 2,
        candidate.width,
        candidate.height,
        candidate.rotation ?? 0,
        cw,
        ch,
      );
      const sized = fitted.factor < 1
        ? {
            ...candidate,
            width: Math.max(40, Math.round(candidate.width * fitted.factor)),
            height: Math.max(30, Math.round(candidate.height * fitted.factor)),
            x: Math.round(candidate.x + (candidate.width - candidate.width * fitted.factor) / 2),
            y: Math.round(candidate.y + (candidate.height - candidate.height * fitted.factor) / 2),
          }
        : candidate;
      const bounded = clampMemberTranslation(
        { kind: "building", id: sized.id, x: sized.x, y: sized.y, width: sized.width, height: sized.height, rotation: sized.rotation ?? 0 },
        0,
        0,
        cw,
        ch,
        CAMPUS_OBJECT_SAFE_INSET,
      );
      return { ...sized, x: Math.round(sized.x + bounded.dx), y: Math.round(sized.y + bounded.dy) };
    });
    beginGestureHistory();
    onUpdate(syncExteriorEmergencyStairGraph({
      ...campus,
      buildings: nextBuildings,
      // B5 Phase 1.8: resizing a building moves its entrances → the linked nav
      // nodes follow in the same gesture.
      navNodes: syncEntranceNodePositions(nextBuildings, navNodes),
    }));
  };

  const handleSvgUpResize = () => {
    if (canvasResizeRef.current) {
      const gesture = canvasResizeRef.current;
      const preview = canvasResizePreview;
      canvasResizeRef.current = null;
      if (preview && (preview.width !== gesture.startW || preview.height !== gesture.startH)) {
        // Pointer-up ends the gesture, not the resize transaction.  Keep the
        // proposed dimensions rendered (and handles visible) until the admin
        // explicitly confirms Apply or Cancel.  This prevents an accidental
        // drag from immediately mutating canonical canvas dimensions.
        setPendingCanvasResize({ width: preview.width, height: preview.height });
      } else {
        // Resize Canvas is an explicit mode. A click without movement must
        // not make the handles disappear or silently exit the mode.
        setCanvasResizePreview(pendingCanvasResize ?? null);
      }
      setGuides([]);
      return;
    }
    if (groupResizing.current) {
      if (gestureChangedRef.current) pushHistory(campusRef.current);
      groupResizing.current = null;
      setGuides([]);
      gestureChangedRef.current = false;
      gestureHistoryPushed.current = false;
      return;
    }
    if (markerResizing.current) {
      const resizedGate = campusRef.current.markers?.find((marker) => marker.id === markerResizing.current?.id);
      if (resizedGate && isCampusGate(resizedGate)) {
        const size = campusGateSize(resizedGate);
        lastMarkerSizesRef.current["campus-gate"] = size;
      }
      if (gestureChangedRef.current) pushHistory();
      markerResizing.current = null;
      setMarkerResizingId(null);
      setGuides([]);
      gestureChangedRef.current = false;
      gestureHistoryPushed.current = false;
      return;
    }
    if (exteriorStairDragging.current) {
      if (gestureChangedRef.current) pushHistory();
      if (exteriorStairPreview && !exteriorStairPreview.valid) {
        toast.warning("Cannot place exterior stair here", "The wall space is occupied; the previous placement was kept.");
      }
      exteriorStairDragging.current = null;
      setExteriorStairPreview(null);
      setGuides([]);
      gestureChangedRef.current = false;
      gestureHistoryPushed.current = false;
      return;
    }
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
      if (gestureChangedRef.current) pushHistory(campusRef.current);
      gestureHistoryPushed.current = false;
      gestureChangedRef.current = false;
      decorRotating.current = null;
      setDecorRotatingId(null);
      setRotatingAngle(0);
      return;
    }
    // Finalize decor resize
    if (decorResizing.current) {
      const resizedAsset = campusRef.current.decorAssets?.find((asset) => asset.id === decorResizing.current?.id);
      if (resizedAsset && !isDecorAreaType(resizedAsset.type) && Number.isFinite(resizedAsset.scale)) {
        lastDecorScalesRef.current[resizedAsset.type] = resizedAsset.scale as number;
      }
      if (gestureChangedRef.current) pushHistory(campusRef.current);
      gestureHistoryPushed.current = false;
      gestureChangedRef.current = false;
      decorResizing.current = null;
      setDecorResizingId(null);
      return;
    }
    // Finalize rotation
    if (rotating.current) {
      if (gestureChangedRef.current) pushHistory(campusRef.current);
      gestureHistoryPushed.current = false;
      gestureChangedRef.current = false;
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
    // A segment-handle click has already published the inserted vertex so the
    // canvas can render it during the gesture, but it has not yet entered
    // history. Record that click (or the complete insert+move) exactly once.
    const insertedPathBend = dragging.current?.type === "pathPointInsert";
    // Commit exactly ONE post-gesture undo snapshot for item drags (single or
    // group) so undo restores the pre-gesture state and redo re-applies the
    // complete gesture. The pre-gesture state is still the previous history
    // tip, so a drag adds exactly one new entry — never one per object/move.
    const dragCommitted = gestureChangedRef.current;
    if (insertedPathBend && !dragCommitted) pushHistory(campusRef.current);
    const draggedPathId = dragging.current?.type === "path" ? dragging.current.id : null;
    const consumedNavigationDrag = dragCommitted && (dragging.current?.type === "navNode" || dragging.current?.type === "generatedPathPoint" || dragging.current?.type === "pathPoint");
    if (consumedNavigationDrag) {
      suppressNextPathClickRef.current = true;
      window.setTimeout(() => { suppressNextPathClickRef.current = false; }, 0);
    }
    if (dragCommitted && draggedPathId && pathMemberEditId === draggedPathId) {
      suppressPathClickRef.current = draggedPathId;
      window.setTimeout(() => {
        if (suppressPathClickRef.current === draggedPathId) suppressPathClickRef.current = null;
      }, 0);
    }
    endPan();
    dragging.current = null;
    generatedPointProxyRef.current = null;
    dragGroupStartRef.current = null;
    pathGroupOriginRef.current = null;
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
          : outdoorSelectionIdsInRect(rect, buildings, decorAssets, DECOR_ASSET_MAP, paths, { includeHidden: true }, markers);
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

    if (resizing) {
      if (gestureChangedRef.current) pushHistory(campusRef.current);
      gestureHistoryPushed.current = false;
      gestureChangedRef.current = false;
      setResizing(null);
      return;
    }      // Finalize building drag-to-create
    if (buildingDrag) {
      // Shared geometry with the canvas preview (computeBuildingPlacement), so
      // the final building is always exactly where/whatever the preview showed.
      const rawRect = computeBuildingPlacement(
        buildingDrag.sx, buildingDrag.sy, buildingDrag.cx, buildingDrag.cy,
        cw, ch
      );
      const fittedRect = fitBuildingRectToCanvas(rawRect, cw, ch);
      const fittedDelta = clampMemberTranslation(
        { kind: "building", id: "placement", x: fittedRect.x, y: fittedRect.y, width: fittedRect.width, height: fittedRect.height },
        0,
        0,
        cw,
        ch,
        CAMPUS_OBJECT_SAFE_INSET,
      );
      const rect = { ...fittedRect, x: fittedRect.x + fittedDelta.dx, y: fittedRect.y + fittedDelta.dy };
      const buildingId = genId("bld");
      const identity = nextDefaultBuildingIdentity(buildings, defaultBuildingReservationsRef.current?.values);
      defaultBuildingReservationsRef.current?.values.push(identity);
      const nb: CampusBuilding = {
        id: buildingId, name: identity.name, code: identity.code, category: "Academic", description: "",
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        color: BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)],
        expanded: false,
        floors: [createDefaultFloor({ id: genId("fl"), buildingId, number: 1 })],
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
  const handleSvgUp = () => { endPan(); dragging.current = null; generatedPointProxyRef.current = null; dragGroupStartRef.current = null; groupResizing.current = null; markerResizing.current = null; setMarkerResizingId(null); pathGroupOriginRef.current = null; navGroupOriginRef.current = null; navGroupEdgeOriginsRef.current = null; pathGroupRotating.current = null; setPathGroupRotationBounds(null); setPathGroupScale(null); setRotatingAngle(0); setGuides([]); gestureHistoryPushed.current = false; };

  // ── Mouse leaves the canvas mid-gesture: CANCEL placement/drawing instead of
  // finalizing it. (onMouseLeave previously ran the same handler as mouseup, so
  // a drag that exited the canvas — e.g. toward the top-left — could commit a
  // building at an unintended spot without the user ever releasing the button.) ──
  const handleSvgLeave = () => {
    if (canvasResizeRef.current) {
      const gesture = canvasResizeRef.current;
      const preview = canvasResizePreview;
      canvasResizeRef.current = null;
      // Leaving the SVG while dragging a boundary ends only that resize
      // gesture. Keep Resize Canvas mode and the last proposal alive so a
      // handle at the edge cannot disappear when the pointer crosses the
      // canvas boundary before mouse-up.
      if (preview && (preview.width !== gesture.startW || preview.height !== gesture.startH)) {
        setPendingCanvasResize({ width: preview.width, height: preview.height });
      } else {
        setCanvasResizePreview(pendingCanvasResize ?? null);
      }
      setGuides([]);
      return;
    }
    if (markerResizing.current) {
      if (gestureChangedRef.current) pushHistory();
      markerResizing.current = null;
      setMarkerResizingId(null);
      gestureChangedRef.current = false;
      gestureHistoryPushed.current = false;
      setGuides([]);
      return;
    }
    if (exteriorStairDragging.current) {
      if (gestureChangedRef.current) pushHistory();
      exteriorStairDragging.current = null;
      setExteriorStairPreview(null);
      setGuides([]);
      gestureChangedRef.current = false;
      gestureHistoryPushed.current = false;
      return;
    }
    if (groupResizing.current) {
      if (gestureChangedRef.current) pushHistory(campusRef.current);
      groupResizing.current = null;
      gestureChangedRef.current = false;
      gestureHistoryPushed.current = false;
      setGuides([]);
      return;
    }
    // If an item drag was in progress when the pointer left the canvas, the
    // movement was already applied — record it so undo can restore it. A
    // midpoint-handle click has also already published its inserted vertex;
    // make that click undoable even when the pointer leaves without moving.
    const insertedPathBend = dragging.current?.type === "pathPointInsert";
    if (gestureChangedRef.current || insertedPathBend) pushHistory(campusRef.current);
    gestureChangedRef.current = false;
    endPan();
    dragging.current = null;
    generatedPointProxyRef.current = null;
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
    // Keep an armed asset placement available when the pointer briefly leaves
    // the canvas; the next pointer move can resume the translucent preview.
    // Tool/layer changes and Escape explicitly clear this state.
    pathPaintStroke.current = null;
    pathExtendRef.current = null;
    setGroundBrushPreview(null);
    setGroundErasePreview(null);
    setPathPaintPreview(null);
    setGuides([]);
    // Leaving the canvas ends only the transient preview. Keep the armed
    // Entrance/Walking Point source so re-entering the canvas resumes Connect,
    // but never leave a stale ghost endpoint behind while the pointer is out.
    if (tool === "connect" && layer === "navigation") {
      cancelConnectPreviewFrame();
      setNavPreview(null);
      setNavPreviewPins([]);
    }
    setNavEntranceHover(null);
    setWaypointEdgeSnap(null);
    setConnectBlocked(false);
    gestureHistoryPushed.current = false;
  };

  // ── Tool switching — clears stale drawing/preview state so switching tools
  // never leaves an unfinished path preview, building drag, or rubber band ──
  const switchTool = useCallback((t: SimpleTool) => {
    canvasResizeRef.current = null;
    markerResizing.current = null;
    setMarkerResizingId(null);
    setCanvasResizePreview(null);
    setPendingCanvasResize(null);
    canvasResizeOriginalRef.current = null;
    setCanvasResizeMode(false);
    const reset = resetTransientToolState();
    if (t !== "connect") connectGuidanceShownRef.current = false;
    setTool(t);
    setTestRoutePickKind(null);
    setTestRoutePickHover(null);
    setTestRouteMapPick(null);
    setPathSettingsOpen(false);
    setDP(reset.drawingPath);
    setNavConnectStart(null);
    setNavConnectBends([]);
    setNavPreview(null);
    setNavPreviewPins([]);
    navConnectBendGroupsRef.current = [];
    connectRedoStackRef.current = [];
    setWaypointEdgeSnap(null);
    setConnectBlocked(false);
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
    if (t !== "decor") setArmedDecorAssetType(null);
    if (t !== "building") setSelectedBuildingType(null);
    if (t !== "select") { setPathMemberEditId(null); setSelectedPathPoint(null); }
  }, []);

  // ── Layer switching — clears ALL transient tool state and returns to the
  // select tool so an incompatible active tool can never leak between
  // Campus / Navigation / Accessibility / Emergency / Events ──
  const switchLayer = useCallback((next: EditorLayer, preservePathMemberEdit = false) => {
    canvasResizeRef.current = null;
    markerResizing.current = null;
    setMarkerResizingId(null);
    setCanvasResizePreview(null);
    setPendingCanvasResize(null);
    canvasResizeOriginalRef.current = null;
    setCanvasResizeMode(false);
    const reset = resetTransientToolState();
    connectGuidanceShownRef.current = false;
    setLayer(next);
    setPathSettingsOpen(false);
    setTestRoutePickKind(null);
    setTestRoutePickHover(null);
    setTestRouteMapPick(null);
    setTool("select");
    setArmedDecorAssetType(null);
    if (!preservePathMemberEdit) {
      setSelected(null);
      setMultiSelected([]);
      setShowAlignTools(false);
      setPathMemberEditId(null);
      setSelectedPathPoint(null);
    } else {
      // Navigation visibility is presentation-only. Keep the active physical
      // member and its edit handles intact while the overlay is toggled.
      setMultiSelected([]);
      setShowAlignTools(false);
    }
    setDP(reset.drawingPath);
    setNavConnectStart(null);
    setNavConnectBends([]);
    setNavPreview(null);
    setNavPreviewPins([]);
    navConnectBendGroupsRef.current = [];
    connectRedoStackRef.current = [];
    setWaypointEdgeSnap(null);
    setConnectBlocked(false);
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
    setShowRoutesPanel(false);
  }, []);

  // Test Route owns a temporary navigation-visibility session. A context
  // remount must not leave the route panel without its graph overlay.
  useEffect(() => {
    if (!testNavOpen) return;
    if (!showCampusNavOverlay) setShowCampusNavOverlay(true);
    if (layer === "events") switchLayer("navigation");
  }, [layer, showCampusNavOverlay, switchLayer, testNavOpen]);

  // Floor Editor and Campus Editor share the navigation-visibility preference,
  // but each editor owns its layer/tool state.  When returning from an active
  // Floor Navigation session, the Campus editor used to remount on the Campus
  // layer while the overlay was already visible, leaving graph hit targets in
  // the non-editable overlay branch.  Promote that one handoff to the real
  // Navigation layer exactly once; later user layer changes remain explicit.
  const navigationHandoffRef = useRef(false);
  useEffect(() => {
    // Re-arm this bridge after navigation is disabled so a later Floor ->
    // Outdoor return in the same mounted editor can promote the layer again.
    if (!navigationEnabled && !testNavOpen) {
      navigationHandoffRef.current = false;
      return;
    }
    if (navigationHandoffRef.current || testNavOpen || layer !== "campus") return;
    navigationHandoffRef.current = true;
    switchLayer("navigation");
  }, [layer, navigationEnabled, switchLayer, testNavOpen]);

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
      setDP([]); setTool("select"); setPathSettingsOpen(false);
      // Play the draw-in animation for the just-completed path
      setAnimatingPathId(newPath.id);
      setTimeout(() => setAnimatingPathId((cur) => (cur === newPath.id ? null : cur)), 900);
      toast.success("Pathway created", `${drawingPath.length} point${drawingPath.length !== 1 ? "s" : ""} drawn.`);
    }
  };

  // ── B5 correction: immutable drag-start snapshot for nav graph groups ──
  // Captures the ORIGINAL free-node positions plus the ORIGINAL bendPoints of
  // every INTERNAL edge (both endpoints in the moving set). The drag handler
  // applies one total delta to these originals every frame — the group tracks
  // the cursor 1:1 and keeps its exact shape.
  const snapshotNavGroup = useCallback((ids: string[]) => {
    const freeNodes = navNodes.filter((n) => ids.includes(n.id) && !n.entranceId && !n.gateId && !n.generatedFromPathVertices?.length && !(n.exteriorEmergencyStairId && !n.floorId));
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

  const onItemDown = (e: React.MouseEvent, type: "building" | "marker" | "gate" | "decorAsset" | "navNode", id: string, ox: number, oy: number) => {
    e.stopPropagation();
    setPathChoiceMenu(null);
    if (testRoutePickKind) {
      if (type === "building") {
        setTestRouteMapPick({ kind: testRoutePickKind, value: `building:${id}` });
        setTestRoutePickKind(null);
        setTestRoutePickHover(null);
        toast.success("Location selected", "Test Route endpoint set.");
      } else if (type === "gate") {
        const gate = markers.find((marker) => marker.id === id && isCampusGate(marker));
        const gateNode = gate
          ? navNodes.find((node) => node.id === gate.navNodeId || node.gateId === gate.id)
          : undefined;
        if (gateNode) {
          setTestRouteMapPick({ kind: testRoutePickKind, value: `node:${gateNode.id}` });
          setTestRoutePickKind(null);
          setTestRoutePickHover(null);
          toast.success("Campus Gate selected", "Test Route endpoint set.");
        } else {
          toast.info("Campus Gate is not ready", "Connect this gate to the Outdoor Walking Network first.");
        }
      } else if (type === "navNode") {
        const node = navNodes.find((candidate) => candidate.id === id);
        if (node?.exteriorEmergencyStairId && !node.floorId) {
          // The generated Ground discharge is infrastructure, not a semantic
          // Pick-a-Location endpoint.  Keep the click a deliberate no-op so a
          // half-selected value can never leak into Test Route state.
          toast.info("Generated Stair Exit", "This discharge anchor is navigation infrastructure, not a named route location.");
        } else if (node?.gateId) {
          // The navigation graph is rendered above the physical marker, so a
          // pick click can land on the Gate's derived anchor first. Resolve it
          // back to the same physical gate endpoint instead of treating the
          // anchor as an anonymous Walking Point.
          const gate = campus.markers?.find((marker) => isCampusGate(marker) && marker.id === node.gateId);
          if (gate) {
            setTestRouteMapPick({ kind: testRoutePickKind, value: `node:${node.id}` });
            setTestRoutePickKind(null);
            setTestRoutePickHover(null);
            toast.success("Campus Gate selected", `${gate.name || "Campus Gate"} set as the Test Route endpoint.`);
          } else {
            toast.info("Campus Gate is unavailable", "This generated anchor no longer has a physical Gate owner.");
          }
        } else if (node?.entranceId && node.buildingId) {
          setTestRouteMapPick({ kind: testRoutePickKind, value: `building:${node.buildingId}` });
          setTestRoutePickKind(null);
          setTestRoutePickHover(null);
          toast.success("Location selected", "Test Route endpoint set.");
        } else {
          toast.info("Choose a named location", "Walking Points are available through the searchable location list.");
        }
      } else {
        toast.info("Choose a building, entrance, or gate", "Select a valid route location on the map.");
      }
      return;
    }
    // Spacebar held: pan instead of interacting with items
    if (isSpacePressed()) {
      startPan(e);
      return;
    }
    // B5 Phase 1: navigation-layer Path tool connects waypoints by clicking
    // them — node clicks never reach handleSvgDown (they stop propagation).
    if (tool === "connect" && layer === "navigation" && type === "navNode") {
      const clickedNode = navNodes.find((node) => node.id === id);
      const overlappingNodeIds = clickedNode
        ? outdoorNodes
            .filter((node) => node.id === id || Math.hypot(node.x - clickedNode.x, node.y - clickedNode.y) <= 2)
            .map((node) => node.id)
        : [id];
      if (overlappingNodeIds.length > 1) {
        setPathChoiceMenu({ x: e.clientX, y: e.clientY, pathIds: [], nodeIds: overlappingNodeIds });
        return;
      }
      onNavNodeClick(id);
      return;
    }
    // Walking Point reuses an existing canonical node instead of stacking a
    // second point. Generated points remain Pathway-owned; manual points stay
    // ordinary reusable anchors.
    if (tool === "marker" && layer === "navigation" && type === "navNode") {
      const node = navNodes.find((candidate) => candidate.id === id);
      if (!node) return;
      if (node.exteriorEmergencyStairId && !node.floorId) {
        setSelected({ type: "navNode", id });
        setMultiSelected([]);
        setTool("select");
        toast.info("Generated Stair Exit", "Use Connect to attach the Ground discharge to the Outdoor Walking Network.");
        return;
      }
      if (node.entranceId && node.buildingId && !node.floorId) {
        setSelected({ type: "entrance", id: node.entranceId, buildingId: node.buildingId });
        setMultiSelected([]);
        setTool("select");
        setNavEntranceHover(null);
        setWaypointEdgeSnap(null);
        setConnectBlocked(false);
        toast.info("Entrance is already a navigation connection point", "Use this Entrance directly for navigation connections.");
        return;
      }
      const overlappingNodeIds = outdoorNodes
        .filter((candidate) => Math.hypot(candidate.x - node.x, candidate.y - node.y) <= 2)
        .map((candidate) => candidate.id);
      if (overlappingNodeIds.length > 1) {
        setPathChoiceMenu({ x: e.clientX, y: e.clientY, pathIds: [], nodeIds: overlappingNodeIds });
        return;
      }
      setSelected({ type: "navNode", id });
      setMultiSelected([]);
      setTool("select");
      if (node.generatedFromPathVertices?.length) {
        toast.info("Generated Walking Point", "This point follows its physical Pathway. Drag to adjust the Pathway vertex.");
      } else {
        toast.info("Walking Point already exists", "The existing manual Walking Point is selected.");
      }
      return;
    }
    // Entrance anchors are graph identities, not a second admin-visible
    // Walking Point. In normal Navigation Select, route the hit back to the
    // physical Entrance so its properties stay reachable without hiding the
    // overlay. Connect/marker modes intentionally keep their target behavior.
    if (tool === "select" && layer === "navigation" && type === "navNode") {
      const node = navNodes.find((candidate) => candidate.id === id);
      if (node?.exteriorEmergencyStairId && !node.floorId) {
        setSelected({ type: "navNode", id });
        setMultiSelected([]);
        setShowAlignTools(false);
        setGuides([]);
        toast.info("Generated Stair Exit", "This generated discharge follows the physical Exterior Emergency Stair and cannot be dragged independently.");
        return;
      }
      if (node?.gateId) {
        setSelected({ type: "navNode", id });
        setMultiSelected([]);
        setShowAlignTools(false);
        setGuides([]);
        toast.info("Campus Gate anchor", "This navigation anchor follows the physical Campus Gate and cannot be dragged independently.");
        return;
      }
      if (node?.entranceId && node.buildingId && !node.floorId) {
        onEntranceDown(e, node.buildingId, node.entranceId, node.x, node.y);
        return;
      }
    }
    // Overlap rule: a normal click on an exposed node selects the node. Alt is
    // handled here (the node stops propagation), so it reliably reaches the
    // explicit generated-path provenance rather than a coordinate guess.
    if (tool === "select" && type === "navNode") {
      const node = navNodes.find((candidate) => candidate.id === id);
      const ownedPathIds = [...new Set((node?.generatedFromPathVertices ?? [])
        .map((ref) => ref.pathId)
        .filter((pathId) => paths.some((path) => path.id === pathId)))];
      if (e.altKey) {
        if (ownedPathIds.length === 1) {
          onPathDown(e, ownedPathIds[0]);
          return;
        }
        if (ownedPathIds.length > 1) {
          setPathChoiceMenu({ x: e.clientX, y: e.clientY, pathIds: ownedPathIds });
          return;
        }
      }
      // Once a physical Pathway is selected, its own vertex handles/body have
      // priority over an overlapping generated node. Route directly to the
      // proven vertex index so editing cannot silently target another Pathway.
      if (pathMemberEditId && selected?.type === "path" && selected.id === pathMemberEditId && ownedPathIds.includes(selected.id)) {
        const selectedPath = paths.find((path) => path.id === selected.id);
        const ownedRef = node?.generatedFromPathVertices?.find((ref) => ref.pathId === selected.id);
        const vertexIndex = (ownedRef && selectedPath?.navigationVertexIds?.indexOf(ownedRef.vertexId)) ?? -1;
        if (selectedPath && vertexIndex >= 0) {
          onPathPointDown(e, selectedPath.id, vertexIndex);
          return;
        }
        onPathDown(e, selected.id);
        return;
      }
      if (node?.generatedFromPathVertices?.length) {
        const refs = node.generatedFromPathVertices
          .map((ref) => {
            const owner = paths.find((path) => path.id === ref.pathId);
            const pointIndex = owner?.navigationVertexIds?.indexOf(ref.vertexId) ?? -1;
            return owner && pointIndex >= 0 ? { pathId: owner.id, pointIndex, locked: !!owner.locked } : null;
          })
          .filter(Boolean) as { pathId: string; pointIndex: number; locked: boolean }[];
        const proxyRefs = refs.map(({ pathId, pointIndex }) => ({ pathId, pointIndex }));
        const pt = getPoint(e, cw, ch);
        setSelected({ type: "navNode", id });
        setMultiSelected([]);
        setShowAlignTools(false);
        setSelectedPathPoint(null);
        gestureHistoryPushed.current = false;
        gestureChangedRef.current = false;
        const canProxyDrag = proxyRefs.length > 0
          && proxyRefs.length === node.generatedFromPathVertices.length
          && refs.every((ref) => !ref.locked);
        generatedPointProxyRef.current = canProxyDrag
          ? { nodeId: id, sx: pt.x, sy: pt.y, refs: proxyRefs }
          : null;
        dragging.current = { type: "generatedPathPoint", id, sx: pt.x, sy: pt.y, ox: node.x, oy: node.y };
        return;
      }
    }
    // B5 Phase 1.6: in the Navigation layer, clicking a building BODY with the
    // Waypoint or Connect Path tools is rejected with clear feedback — outdoor
    // waypoints belong outside buildings; routes enter through entrances.
    if (layer === "navigation" && (tool === "marker" || tool === "connect") && type === "building") {
      toast.warning("Connect through a building entrance", "Outdoor walking points belong outside buildings — click the building's entrance instead.");
      return;
    }
    if (tool === "erase") {
      // Navigation Remove is deliberately scoped to the walking network so a
      // visible campus object can never be deleted by the nav-focused tool.
      if (layer === "navigation" && type !== "navNode") {
        return;
      }
      if (type === "navNode") {
        // Waypoint erase: deterministic connected-edge cleanup + clear feedback
        // (never leaves dangling edge references).
        const node = navNodes.find((n) => n.id === id);
        if (!node) return;
        if (node.pathJunction) {
          removePathJunction(id);
          return;
        }
        if (node.exteriorEmergencyStairId && !node.floorId) {
          toast.info("Generated Stair Exit is locked", "Move or remove the Building-owned Exterior Emergency Stair instead.");
          return;
        }
        if (node.generatedFromPathVertices?.length) {
          onRemoveGeneratedPathwayPoint(id);
          return;
        }
        const connected = navEdges.filter((e) => e.startNodeId === id || e.endNodeId === id).length;
        const next = removeNavNode(navNodes, navEdges, id);
        const nextCampus = { ...campus, navNodes: next.nodes, navEdges: next.edges };
        onUpdate(nextCampus);
        pushHistory(nextCampus);
        setSelected(null);
        toast.success("Walking Point deleted", connected > 0 ? `Removed ${connected} connected connection${connected !== 1 ? "s" : ""}.` : undefined);
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
          type: type === "gate" ? "marker" : type,
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
    // B8 Phase 1: unified editor — select tool works on all objects in all layers.
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
      // Cross-domain guard: physical and navigation items cannot be mixed
      // in the same multi-selection group. If the user shift-clicks across
      // domains, clear the current selection and start fresh with just the
      // new item.
      const isPhysicalType = (t: string) => t === "building" || t === "decorAsset" || t === "entrance" || t === "marker" || t === "gate";
      const isPathType = (t: string) => t === "path";
      const isNavType = (t: string) => t === "navNode" || t === "navEdge";
      if (base.length > 0 && !base.includes(id)) {
        const baseSelection = selectionForId(base[0]);
        const currentDomain = baseSelection && isPhysicalType(baseSelection.type) ? "physical" : baseSelection && isPathType(baseSelection.type) ? "path" : baseSelection && isNavType(baseSelection.type) ? "nav" : null;
        const clickedDomain = isPhysicalType(type) ? "physical" : isPathType(type) ? "path" : isNavType(type) ? "nav" : null;
        if (currentDomain && clickedDomain && currentDomain !== clickedDomain) {
          // Cross-domain shift-click: clear existing selection, select only the new item
          setMultiSelected([]);
          setSelected({ type, id });
          setShowAlignTools(false);
          setGuides([]);
          return;
        }
      }
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
      if (type === "navNode" && navNodes.find((n) => n.id === id)?.exteriorEmergencyStairId) {
        toast.info("Generated Stair Exit is locked", "Move the physical Exterior Emergency Stair to reposition its discharge anchor.");
        return;
      }
      if (type === "navNode" && navNodes.find((n) => n.id === id)?.entranceId) {
        toast.info("Entrance walking points follow their building entrance", "Move the building or its entrance to reposition it.");
        return;
      }
      if (type === "navNode" && navNodes.find((n) => n.id === id)?.generatedFromPathVertices?.length) {
        toast.info("Generated Walking Point", "This point follows its physical Pathway. Drag to adjust the Pathway vertex.");
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
    if (type === "navNode" && navNodes.find((n) => n.id === id)?.exteriorEmergencyStairId) {
      toast.info("Generated Stair Exit is locked", "Move the physical Exterior Emergency Stair to reposition its discharge anchor.");
      return;
    }
    if (type === "navNode" && navNodes.find((n) => n.id === id)?.entranceId) {
      toast.info("Entrance waypoints follow their building entrance", "Move the building or its entrance to reposition it.");
      return;
    }
    if (type === "navNode" && navNodes.find((n) => n.id === id)?.generatedFromPathVertices?.length) {
      toast.info("Generated Walking Point", "This point follows its physical Pathway. Drag to adjust the Pathway vertex.");
      return;
    }
    // Unified editor: entrances are draggable in all layers with Select/Pan tools.
    // Only block with active nav authoring tools (marker/path/erase for nav).
    if (layer === "navigation" && type === "entrance" && (tool === "marker" || tool === "connect")) {
      toast.info("Entrance navigation info", "Use the Select tool to move building entrances.");
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

    // ── B8 Phase 1: unified editor — nav group drag works when selected
    // objects are nav nodes (regardless of layer).
    const hasNavNodes = multiSelected.some((id) => navNodes.some((n) => n.id === id));
    if (hasNavNodes) {
      const freeIds = multiSelected.filter((id) => {
        const n = navNodes.find((x) => x.id === id);
        return Boolean(n && !n.entranceId && !n.generatedFromPathVertices?.length && !(n.exteriorEmergencyStairId && !n.floorId));
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
      const marker = markers.find((candidate) => candidate.id === id);
      if (marker) return isCampusGate(marker);
      const asset = decorAssets.find((candidate) => candidate.id === id);
      return Boolean(asset && !asset.locked);
    });
    if (!anchorId) return;
    const anchorSelection = selectionForId(anchorId);
    if (!anchorSelection || (anchorSelection.type !== "building" && anchorSelection.type !== "decorAsset" && anchorSelection.type !== "path" && anchorSelection.type !== "gate" && anchorSelection.type !== "marker")) return;
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
  }, [buildings, cw, ch, decorAssets, getPoint, layer, markers, multiSelected, navEdges, navNodes, paths, selectionForId, snapshotNavGroup, tool]);

  const onPathGroupScaleStart = useCallback((e: React.MouseEvent, corner: "nw" | "ne" | "sw" | "se", bounds: { x: number; y: number; width: number; height: number }) => {
    if (tool !== "select" || multiSelectedPaths.length < 2) return;
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

  const onGroupResizeStart = useCallback((
    e: React.MouseEvent,
    corner: GroupResizeCorner,
    bounds: GroupResizeBounds,
  ) => {
    if (tool !== "select" || multiSelected.length < 2) return;
    // Physical group resize deliberately excludes Pathway geometry. Pathways
    // retain their dedicated network transform semantics and must never be
    // distorted as a side effect of resizing a mixed selection.
    if (multiSelected.some((id) => paths.some((path) => path.id === id))) return;
    const members = buildDragGroup({ type: "decorAsset", id: multiSelected[0] }, multiSelected)
      ?.filter((member) => member.kind !== "path") ?? [];
    if (members.length < 2) return;
    e.preventDefault();
    e.stopPropagation();
    gestureChangedRef.current = false;
    gestureHistoryPushed.current = false;
    groupResizing.current = { corner, bounds, members, decorScales: Object.fromEntries((campusRef.current.decorAssets ?? []).map((asset) => [asset.id, asset.scale ?? 1])) };
  }, [buildDragGroup, multiSelected, paths, tool]);

  // B5 Phase 5.12 — Path Network / path-only group rotation. The gesture rotates
  // all selected pathway POINT GEOMETRY around the group center (persisted as
  // resulting coordinates, never an SVG transform) with ONE history entry on
  // pointer-up; Shift snaps to 15° increments.
  const onPathGroupRotateStart = useCallback((e: React.MouseEvent, center: { x: number; y: number }) => {
    if (tool !== "select" || multiSelectedPaths.length < 2) return;
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
    if (testRoutePickKind) {
      // Outdoor Pick on Map is semantic and Building-first. Clicking an
      // entrance footprint commits its parent Building; direct Entrance
      // diagnostics remain available from Search/Advanced locations.
      setTestRouteMapPick({ kind: testRoutePickKind, value: `building:${buildingId}` });
      setTestRoutePickKind(null);
      setTestRoutePickHover(null);
      toast.success("Location selected", "Building endpoint set.");
      return;
    }
    const parent = buildings.find((b) => b.id === buildingId);
    if (!parent) return;
    // B5 Phase 1.6: in the Navigation layer an entrance is a routing TARGET —
    // Add Waypoint and Connect Path both create/reuse the entrance-linked node
    // instead of selecting/dragging the entrance geometry.
    if (layer === "navigation" && (tool === "marker" || tool === "connect")) {
      const pos = entranceWorldPosition(parent, parent.entrances?.find((en) => en.id === entranceId) ?? { edge: "bottom", offset: 0.5 });
      if (tool === "marker") {
        setSelected({ type: "entrance", id: entranceId, buildingId });
        setTool("select");
        // A rejected Walking Point placement must not leave the Entrance's
        // temporary target cue active after the tool has exited.
        setNavEntranceHover(null);
        setWaypointEdgeSnap(null);
        setConnectBlocked(false);
        toast.info("Entrance is already a navigation connection point", "Use this Entrance directly for navigation connections.");
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
        setNavPreviewPins([]);
        navConnectBendGroupsRef.current = [];
        setNavEntranceHover(null);
        // Keep the physical Entrance selected, matching the Properties action;
        // its canonical graph node remains the internal Connect source.
        setSelected({ type: "entrance", id: entranceId, buildingId });
        showConnectGuidance();
      } else if (entranceNodeId) {
        commitNavEdge(navConnectStart, entranceNodeId);
      } else {
        commitNavEdgeWithEntrance(navConnectStart, buildingId, entranceId, pos.x, pos.y);
      }
      return;
    }
    // Navigation Remove never deletes a physical entrance. Select/Pan continue
    // through the normal Campus interaction path so entrances remain editable
    // while the walking network is visible.
    if (layer === "navigation" && tool === "erase") {
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
    const geometryChanged = changes.x !== undefined || changes.y !== undefined
      || changes.width !== undefined || changes.height !== undefined || changes.rotation !== undefined;
    const nextBuildings = buildings.map((building) => {
      if (building.id !== id) return building;
      const next = { ...building, ...changes };
      return geometryChanged ? constrainBuildingToCanvas(next, cw, ch) : next;
    });
    const graphAffectingChange = geometryChanged
      || changes.entrances !== undefined
      || changes.exteriorEmergencyStairs !== undefined;
    if (graphAffectingChange) {
      updBuildings(nextBuildings);
      return;
    }
    // Names, colors, visibility, and lock state are ordinary Building/UI
    // properties. They must not re-run Entrance/Pathway reconciliation: a
    // hierarchy interaction or a visibility toggle is not a graph edit.
    const next = { ...campus, buildings: nextBuildings };
    campusRef.current = next;
    onUpdate(next);
    pushHistory(next);
  };

  const onAddExteriorEmergencyStair = (buildingId: string) => {
    const current = campusRef.current;
    const building = current.buildings.find((candidate) => candidate.id === buildingId);
    if (!building || building.locked) return;
    const existing = canonicalExteriorEmergencyStairsForBuilding(building);
    if (existing.length > 0 || (building.exteriorEmergencyStairs?.length ?? 0) > 0) {
      toast.warning("Exterior Emergency Stair already configured", "A Building can have only one Exterior Emergency Stair.");
      return;
    }
    const attachment = defaultExteriorEmergencyStairAttachment(building);
    if (!attachment) {
      toast.warning("Exterior Emergency Stair could not be placed", "Every Building side has occupied wall space for the required stair landing.");
      return;
    }
    const id = genId("exst");
    const stair = {
      id,
      buildingId,
      label: "Emergency Stair 1",
      state: "open" as const,
      width: 28,
      height: 42,
      attachment,
      servedFloorIds: building.floors.map((floor) => floor.id),
      sharedId: id,
      emergencySafe: true,
      visible: true,
    };
    const nextBuildings = current.buildings.map((candidate) => candidate.id === buildingId
      ? { ...candidate, exteriorEmergencyStairs: [...(candidate.exteriorEmergencyStairs ?? []), stair] }
      : candidate);
    const next = syncExteriorEmergencyStairGraph({
      ...current,
      buildings: nextBuildings,
      navNodes: syncEntranceNodePositions(nextBuildings, current.navNodes ?? []),
      navEdges: current.navEdges ?? [],
    });
    pushHistory(next);
    onUpdate(next);
    setSelected({ type: "building", id: buildingId });
    toast.success("Exterior Emergency Stair added", "Configure served Floors in the building properties.");
  };

  const onUpdateExteriorEmergencyStair = (buildingId: string, stairId: string, changes: Partial<ExteriorEmergencyStair>) => {
    const current = campusRef.current;
    let placementBlocked = false;
    const nextBuildings = current.buildings.map((building) => building.id !== buildingId ? building : {
      ...building,
      exteriorEmergencyStairs: canonicalExteriorEmergencyStairsForBuilding(building).map((stair) => {
        if (stair.id !== stairId) return stair;
        const next = { ...stair, ...changes, attachment: { ...stair.attachment, ...(changes.attachment ?? {}) } };
        const span = next.attachment.edge === "top" || next.attachment.edge === "bottom" ? building.width : building.height;
        const range = exteriorEmergencyStairSafeOffsetRange(next.attachment.edge, span, next.width, next.height, next.visualSize);
        const rawOffset = Number(next.attachment.offset);
        const normalizedOffset = Number.isFinite(rawOffset) ? rawOffset : 0.5;
        const offset = Math.max(range.min, Math.min(range.max, normalizedOffset));
        const visual = exteriorEmergencyStairVisualDimensions(next);
        const candidateSpan = (next.attachment.edge === "top" || next.attachment.edge === "bottom" ? visual.width : visual.height) + 12;
        const blocked = (building.entrances ?? []).some((entrance) => entrance.edge === next.attachment.edge
          && exteriorEmergencyStairWallSpansOverlap(offset, candidateSpan, Number.isFinite(Number(entrance.offset)) ? Number(entrance.offset) : 0.5, 24, span, 4))
          || canonicalExteriorEmergencyStairsForBuilding(building).some((other) => other.id !== stairId && other.attachment.edge === next.attachment.edge
            && exteriorEmergencyStairWallSpansOverlap(offset, candidateSpan, Number.isFinite(Number(other.attachment.offset)) ? Number(other.attachment.offset) : 0.5,
              (next.attachment.edge === "top" || next.attachment.edge === "bottom"
                ? exteriorEmergencyStairVisualDimensions(other).width
                : exteriorEmergencyStairVisualDimensions(other).height) + 12, span, 4));
        if (blocked && (changes.attachment || changes.width !== undefined || changes.height !== undefined || changes.visualSize !== undefined)) placementBlocked = true;
        return { ...next, attachment: { ...next.attachment, offset } };
      }),
    });
    if (placementBlocked) {
      toast.warning("Cannot place exterior stair here", "The wall space is occupied; the previous placement was kept.");
      return;
    }
    const next = syncExteriorEmergencyStairGraph({
      ...current,
      buildings: nextBuildings,
      navNodes: syncEntranceNodePositions(nextBuildings, current.navNodes ?? []),
      navEdges: current.navEdges ?? [],
    });
    pushHistory(next);
    onUpdate(next);
  };

  const onDeleteExteriorEmergencyStair = (buildingId: string, stairId: string) => {
    const current = campusRef.current;
    const nextBuildings = current.buildings.map((building) => building.id !== buildingId ? building : {
      ...building,
      exteriorEmergencyStairs: canonicalExteriorEmergencyStairsForBuilding(building).filter((stair) => stair.id !== stairId),
    });
    const next = syncExteriorEmergencyStairGraph({
      ...current,
      buildings: nextBuildings,
      navNodes: syncEntranceNodePositions(nextBuildings, current.navNodes ?? []),
      navEdges: current.navEdges ?? [],
    });
    pushHistory(next);
    onUpdate(next);
    toast.info("Exterior Emergency Stair removed", "Its generated floor landings and transition anchors were removed.");
  };

  const onAddEntrance = (buildingId: string) => {
    const currentCampus = campusRef.current;
    const currentBuildings = currentCampus.buildings;
    const parent = currentBuildings.find((b) => b.id === buildingId);
    if (!parent || parent.locked) return;
    const entrance = defaultEntrance(parent, genId("ent"));
    const next: Campus = reconcileEntranceDoors({
      ...currentCampus,
      buildings: currentBuildings.map((b) => b.id === buildingId ? { ...b, entrances: [...(b.entrances ?? []), entrance] } : b),
    }, genId);
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
    if (tool === "connect" && layer === "navigation") {
      cancelConnectPreviewFrame();
      setNavPreview(null);
      setNavPreviewPins([]);
      setConnectBlocked(false);
    }
    setNavEntranceHover(null);
    setWaypointEdgeSnap(null);
    setConnectBlocked(false);
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
    const next: Campus = reconcileEntranceDoors(reconcileEntranceTransitions({
      ...currentCampus,
      buildings: nextBuildings,
      navNodes: syncEntranceNodePositions(nextBuildings, currentCampus.navNodes ?? []),
    }), genId);
    const reconciled = reconcileEntranceOutdoorConnections(next);
    campusRef.current = reconciled;
    onUpdate(reconciled);
    pushHistory(reconciled);
  };

  const removeEntranceNow = useCallback((buildingId: string, entranceId: string) => {
    const currentCampus = campusRef.current;
    const currentBuildings = currentCampus.buildings;
    const parent = currentBuildings.find((b) => b.id === buildingId);
    if (!parent || parent.locked) return;
    const nextBuildings = currentBuildings.map((b) => {
      if (b.id !== buildingId) return b;
      const remaining = normalizeBuildingEntrances(b).filter((entrance) => entrance.id !== entranceId);
      return { ...b, entrances: promotePrimaryEntrance(remaining) };
    });
    const reconciledBuildings = reconcileEntranceDoors({ ...currentCampus, buildings: nextBuildings }, genId);
    // B5 Phase 1.8: deleting an entrance also removes its linked nav node +
    // connected edges in the SAME mutation — no stale entranceId references.
    const { nodes, edges } = pruneOrphanedEntranceNodes(
      reconciledBuildings.buildings, reconciledBuildings.navNodes ?? currentCampus.navNodes ?? [], reconciledBuildings.navEdges ?? currentCampus.navEdges ?? []
    );
    const next: Campus = {
      ...reconciledBuildings,
      navNodes: nodes,
      navEdges: edges,
    };
    campusRef.current = next;
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "building", id: buildingId });
  // `pushHistory` is declared later in this component.  It is resolved when
  // the confirmed action runs, so do not evaluate the still-uninitialised
  // binding while React is building this callback's dependency array.
  }, [genId, onUpdate]);

  const onDeleteEntrance = useCallback((buildingId: string, entranceId: string) => {
    const parent = campusRef.current.buildings.find((building) => building.id === buildingId);
    const entrance = parent?.entrances?.find((candidate) => candidate.id === entranceId);
    if (!parent || parent.locked || !entrance) return;
    setEntranceDeleteConfirm({
      buildingId,
      entranceId,
      name: entrance.name?.trim() || "Building Entrance",
    });
  }, []);

  const onUpdateMarker = (id: string, changes: Partial<CampusMarker>) => {
    const nextMarkers = markers.map((m) => (m.id === id ? { ...m, ...changes } : m));
    const nextGate = nextMarkers.find((marker) => marker.id === id);
    if (nextGate && isCampusGate(nextGate)) {
      const synced = syncCampusGateNavigation({ ...campus, markers: nextMarkers }, genId);
      upd({ markers: synced.markers, navNodes: synced.navNodes, navEdges: synced.navEdges });
      return;
    }
    updMarkers(nextMarkers);
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
    const reconciled = reconcilePathwayNavigation(next, genId, { preserveAuthoredGeometry: true });
    onUpdate(reconciled);
    pushHistory(reconciled);
  };

  const onDeletePath = (id: string) => {
    const next: Campus = { ...campus, paths: paths.filter((p) => p.id !== id) };
    const reconciled = reconcilePathwayNavigation(next, genId, { preserveAuthoredGeometry: true });
    onUpdate(reconciled);
    pushHistory(reconciled);
    setSelected(null);
    setSelectedPathPoint(null);
    setPathMemberEditId(null);
  };

  const onDeleteBuilding = (id: string) => {
    // Building removal must prune every Building-owned derived navigation
    // object, not just entrance anchors.  Exterior Emergency Stair landings
    // and the Ground discharge are generated from the Building and otherwise
    // remain as orphaned outdoor waypoints after the physical owner is gone.
    const currentCampus = campusRef.current;
    // Hydrate the current canonical stair graph before filtering the owner.
    // Legacy generated nodes may not carry buildingId yet; synchronization
    // stamps them with the live Building/stair identity so the subsequent
    // prune cannot leave an orphan or accidentally remove another Building's
    // same-id stair occurrence.
    const canonicalCampus = syncExteriorEmergencyStairGraph(currentCampus);
    const nextBuildings = canonicalCampus.buildings.filter((b) => b.id !== id);
    const entrancePruned = pruneOrphanedEntranceNodes(
      nextBuildings, canonicalCampus.navNodes ?? [], canonicalCampus.navEdges ?? [],
    );
    const stairPruned = pruneOrphanedExteriorEmergencyStairNodes(
      nextBuildings, entrancePruned.nodes, entrancePruned.edges,
    );
    const next: Campus = {
      ...canonicalCampus,
      buildings: nextBuildings,
      navNodes: stairPruned.nodes,
      navEdges: stairPruned.edges,
    };
    campusRef.current = next;
    pushHistory(next);
    onUpdate(next);
    setSelected(null);
  };
  const onDeleteMarker = (id: string) => {
    const nextMarkers = markers.filter((m) => m.id !== id);
    const removed = markers.find((marker) => marker.id === id);
    if (removed && isCampusGate(removed)) {
      const synced = syncCampusGateNavigation({ ...campus, markers: nextMarkers }, genId);
      onUpdate(synced);
      pushHistory(synced);
    } else {
      updMarkers(nextMarkers);
    }
    setSelected(null);
  };

  // ── Floor manager helpers (delegated to HierarchyPanel) ──

  const onPathClick = (id: string) => {
    if (suppressNextPathClickRef.current) {
      suppressNextPathClickRef.current = false;
      return;
    }
    if (suppressPathClickRef.current === id) {
      suppressPathClickRef.current = null;
      return;
    }
    // B8 Phase 1: unified editor — paths are selectable in all layers.
    if (tool === "erase") {
      const p = paths.find((x) => x.id === id);
      if (p) setDeleteConfirm({ type: "path", id, name: "Path" });
    } else if (tool === "select") {
      // B5 Phase 5.12 — Canva-style network selection:
      // - while editing one member, clicking another member switches edit focus;
      // - clicking any member of an explicit Path Network selects the WHOLE
      //   network first; the next normal click (or double-click) enters member edit.
      const path = paths.find((x) => x.id === id);
      const networkMembers = path?.pathNetworkId
        ? paths.filter((candidate) => candidate.pathNetworkId === path.pathNetworkId)
        : [];
      if (pathMemberEditId && pathMemberEditId !== id) {
        setSelected({ type: "path", id });
        setMultiSelected([]);
        setShowAlignTools(false);
        setSelectedPathPoint(null);
        setPathMemberEditId(id);
        return;
      }
      if (pathMemberEditId === id) {
        setSelected({ type: "path", id });
        setMultiSelected([]);
        setShowAlignTools(false);
        setSelectedPathPoint(null);
        return;
      }
      // A path-network click is intentionally two-stage: the first click
      // selects the convenient network group, while the next normal click on
      // any member drills into that member. Keep this transition explicit so
      // the group-selection branch below cannot immediately reconstruct the
      // network and discard member-edit state.
      const networkAlreadySelected = networkMembers.length > 1 &&
        multiSelected.length === networkMembers.length &&
        networkMembers.every((member) => multiSelected.includes(member.id));
      if (networkAlreadySelected) {
        setSelected({ type: "path", id });
        setMultiSelected([]);
        setShowAlignTools(false);
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
  // the group relationship stays intact while only this path becomes the active
  // physical object. Network transforms return when member edit is exited.
  const onPathDblClick = useCallback((id: string) => {
    if (tool !== "select") return;
    const path = paths.find((p) => p.id === id);
    if (!path || path.locked) return;
    const networkMembers = path.pathNetworkId
      ? paths.filter((candidate) => candidate.pathNetworkId === path.pathNetworkId)
      : [];
    if (networkMembers.length < 2) return;
    setSelected({ type: "path", id });
    setSelectedPathPoint(null);
    setPathMemberEditId(id);
    setMultiSelected([]);
    setShowAlignTools(false);
  }, [layer, paths, tool]);

  const onPathDown = useCallback((e: React.MouseEvent, id: string) => {
    setPathChoiceMenu(null);
    // B8 Phase 1: unified editor — paths selectable in all layers.
    const path = paths.find((p) => p.id === id);
    if (!path || path.locked) return;
    if (tool !== "select") return;
    const editingThisMember = pathMemberEditId === id;
    const networkIds = pathNetworkIdsForPath(id);
    // The group is selected by the first click. On the next pointer-down,
    // enter member mode before arming the drag so a click-drag cannot briefly
    // arm the network transform and move every member together.
    const networkAlreadySelected = !editingThisMember && networkIds.length > 1 &&
      multiSelected.length === networkIds.length &&
      networkIds.every((memberId) => multiSelected.includes(memberId));
    const memberEditActive = editingThisMember || networkAlreadySelected;
    if (networkAlreadySelected) {
      setPathMemberEditId(id);
      setMultiSelected([]);
      setShowAlignTools(false);
    }
    if (e.shiftKey) {
      const base = multiSelected.length > 0 ? multiSelected : selected ? [selected.id] : [];
      // Cross-domain guard: physical and navigation items cannot be mixed
      const baseSelection = base.length > 0 ? selectionForId(base[0]) : null;
      const isNavSelection = baseSelection?.type === "navNode" || baseSelection?.type === "navEdge";
      if (base.length > 0 && !base.includes(id) && isNavSelection) {
        setMultiSelected([]);
        setSelected({ type: "path", id });
        setShowAlignTools(false);
        setSelectedPathPoint(null);
        setGuides([]);
        return;
      }
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
    const activeGroupIds = memberEditActive ? [id] : networkIds.length > 1 ? networkIds : multiSelected;
    if (memberEditActive) {
      dragGroupStartRef.current = null;
      pathGroupOriginRef.current = new globalThis.Map(paths.map((candidate) => [candidate.id, structuredClone(candidate.points)]));
      setMultiSelected([]);
      setShowAlignTools(false);
    } else if (activeGroupIds.includes(id)) {
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
  }, [buildDragGroup, cw, ch, getPoint, layer, multiSelected, pathMemberEditId, pathNetworkIdsForPath, paths, selected, selectionForId, tool]);

  const onPathPointDown = useCallback((e: React.MouseEvent, id: string, pointIndex: number) => {
    e.stopPropagation();
    setPathChoiceMenu(null);
    // B8 Phase 1: unified editor — path points editable in all layers.
    const path = paths.find((p) => p.id === id);
    if (!path || path.locked) return;
    if (path.pathNetworkId && paths.filter((candidate) => candidate.pathNetworkId === path.pathNetworkId).length > 1 && pathMemberEditId !== id) return;
    const pt = getPoint(e as React.MouseEvent<SVGSVGElement>, cw, ch);
    gestureHistoryPushed.current = false;
    gestureChangedRef.current = false;
    dragging.current = { type: "pathPoint", id, pointIndex, sx: pt.x, sy: pt.y, ox: 0, oy: 0 };
    setSelected({ type: "path", id });
    setSelectedPathPoint({ pathId: id, pointIndex });
  }, [cw, ch, getPoint, layer, pathMemberEditId, paths]);

  const onPathExtendStart = useCallback((e: React.MouseEvent, id: string, pointIndex: number) => {
    e.stopPropagation();
    e.preventDefault();
    // B8 Phase 1: unified editor — path extend works in all layers.
    const path = paths.find((p) => p.id === id);
    const start = path?.points[pointIndex];
    if (!path || path.locked || !start || (pointIndex !== 0 && pointIndex !== path.points.length - 1)) return;
    if (path.pathNetworkId && paths.filter((candidate) => candidate.pathNetworkId === path.pathNetworkId).length > 1 && pathMemberEditId !== id) return;
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
  }, [layer, pathMemberEditId, paths]);

  const onPathWidthDown = useCallback((e: React.MouseEvent, id: string, segmentIndex: number, handlePoint: { x: number; y: number }) => {
    e.stopPropagation();
    // B8 Phase 1: unified editor — path width editable in all layers.
    const path = paths.find((p) => p.id === id);
    const a = path?.points[segmentIndex];
    const b = path?.points[segmentIndex + 1];
    if (!path || path.locked || !a || !b) return;
    if (path.pathNetworkId && paths.filter((candidate) => candidate.pathNetworkId === path.pathNetworkId).length > 1 && pathMemberEditId !== id) return;
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
  }, [cw, ch, getPoint, layer, pathMemberEditId, paths]);

  const onPathAddPoint = (id: string, pointIndex: number, point: { x: number; y: number }) => {
    const path = paths.find((p) => p.id === id);
    if (!path || path.locked) return;
    const vertexIds = path.navigationVertexIds?.length === path.points.length
      ? [...path.navigationVertexIds.slice(0, pointIndex), genId("pv"), ...path.navigationVertexIds.slice(pointIndex)]
      : undefined;
    const next = {
      ...campus,
      paths: paths.map((p) => p.id === id ? {
        ...p,
        points: [...p.points.slice(0, pointIndex), point, ...p.points.slice(pointIndex)],
        ...(vertexIds ? { navigationVertexIds: vertexIds } : {}),
      } : p),
    };
    const reconciled = reconcilePathwayNavigation(next, genId, { preserveAuthoredGeometry: true });
    onUpdate(reconciled);
    pushHistory(reconciled);
    setSelected({ type: "path", id });
    setSelectedPathPoint({ pathId: id, pointIndex });
  };

  /** Insert a Pathway vertex from the segment handle and keep the pointer
   * gesture active so dragging the handle immediately positions that bend.
   * The insertion is published without a separate history entry; pointer-up
   * records the complete insert+move as one edit. A simple click still leaves
   * the midpoint in place and is recorded on pointer-up. */
  const onPathAddPointDragStart = useCallback((e: React.MouseEvent, id: string, pointIndex: number, point: { x: number; y: number }) => {
    e.stopPropagation();
    e.preventDefault();
    const path = paths.find((candidate) => candidate.id === id);
    if (!path || path.locked || pointIndex <= 0 || pointIndex >= path.points.length) return;
    if (path.pathNetworkId && paths.filter((candidate) => candidate.pathNetworkId === path.pathNetworkId).length > 1 && pathMemberEditId !== id) return;
    const vertexIds = path.navigationVertexIds?.length === path.points.length
      ? [...path.navigationVertexIds.slice(0, pointIndex), genId("pv"), ...path.navigationVertexIds.slice(pointIndex)]
      : undefined;
    const next: Campus = {
      ...campus,
      paths: paths.map((candidate) => candidate.id === id
        ? {
            ...candidate,
            points: [...candidate.points.slice(0, pointIndex), point, ...candidate.points.slice(pointIndex)],
            ...(vertexIds ? { navigationVertexIds: vertexIds } : {}),
          }
        : candidate),
    };
    const reconciled = reconcilePathwayNavigation(next, genId, { preserveAuthoredGeometry: true });
    campusRef.current = reconciled;
    onUpdate(reconciled);
    setSelected({ type: "path", id });
    setSelectedPathPoint({ pathId: id, pointIndex });
    gestureChangedRef.current = false;
    gestureHistoryPushed.current = false;
    dragging.current = {
      type: "pathPointInsert",
      id,
      pointIndex,
      sx: point.x,
      sy: point.y,
      ox: point.x,
      oy: point.y,
      points: structuredClone(path.points),
    };
  }, [campus, genId, onUpdate, pathMemberEditId, paths]);

  /**
   * Connect an active authoring gesture directly to a physical Pathway
   * segment. The Pathway remains the source of truth: insert one persisted
   * vertex, reconcile its generated node/edges, and append the authored
   * connector in the same campus snapshot/history entry.
   */
  const connectPathwaySegment = useCallback((target: PathSnapTarget): boolean => {
    if (!navConnectStart || target.kind !== "segment" || target.segmentIndex === undefined) return false;
    // Use the ref-backed campus snapshot for this discrete commit.  A pointer
    // gesture can finish in the same tick as a parent update; the render
    // closure may still contain the preceding graph while the ref already
    // contains the latest canonical node IDs.
    const currentCampus = campusRef.current;
    const path = (currentCampus.paths ?? []).find((candidate) => candidate.id === target.pathId);
    if (!path || path.locked) return false;
    const pointIndex = target.segmentIndex + 1;
    // The preview rounds the prospective junction once. Reuse that exact
    // coordinate for the physical Pathway insertion so commit cannot jump by
    // a pixel (or re-project a diagonal segment differently).
    const committedTarget: PathSnapTarget = {
      ...target,
      point: { x: Math.round(target.point.x), y: Math.round(target.point.y) },
    };
    // A generated Stair Exit node can be present in a legacy/hydrated campus
    // before the post-mount graph reconciliation has persisted its canonical
    // outdoorNodeId.  Synchronize that owner before inserting the Pathway
    // vertex so the connector is authored against the final discharge ID,
    // rather than a transient node that the reconciliation effect will later
    // replace and discard.
    const sourceNode = (currentCampus.navNodes ?? []).find((node) => node.id === navConnectStart);
    const isGeneratedStairDischarge = Boolean(sourceNode?.exteriorEmergencyStairId && !sourceNode.floorId);
    const graphCampus = isGeneratedStairDischarge
      ? syncExteriorEmergencyStairGraph(currentCampus)
      : currentCampus;
    const graphPath = graphCampus.paths.find((candidate) => candidate.id === target.pathId) ?? path;
    // A visible physical Pathway is a valid target even before its generated
    // navigation ownership has been initialized. Reuse the canonical
    // conversion helper first, then insert exactly one clicked vertex.
    const preparedCampus = pathwayHasOwnedNavigation(graphPath)
      ? graphCampus
      : convertPathwaysToNavigation(graphCampus, [graphPath.id], genId).campus;
    const preparedPaths = preparedCampus.paths ?? [];
    const nextPaths = insertPathJunctionPoint(preparedPaths, committedTarget);
    const reconciled = reconcilePathwayNavigation({ ...preparedCampus, paths: nextPaths }, genId, { preserveAuthoredGeometry: true });
    const updatedPath = reconciled.paths.find((candidate) => candidate.id === target.pathId);
    const vertexId = updatedPath?.navigationVertexIds?.[pointIndex];
    const endNode = vertexId
      ? (reconciled.navNodes ?? []).find((node) => node.generatedFromPathVertices?.some((ref) => ref.pathId === target.pathId && ref.vertexId === vertexId))
      : undefined;
    // Resolve the canonical node from the reconciled snapshot.  The fallback
    // by Stair identity handles the one-time legacy ID migration above while
    // keeping the generated discharge derived/non-draggable.
    const startNode = reconciled.navNodes.find((node) => node.id === navConnectStart)
      ?? (sourceNode?.exteriorEmergencyStairId && !sourceNode.floorId
        ? reconciled.navNodes.find((node) => node.exteriorEmergencyStairId === sourceNode.exteriorEmergencyStairId
          && !node.floorId
          && (!sourceNode.buildingId || node.buildingId === sourceNode.buildingId))
        : undefined);
    if (!startNode || !endNode || isSelfEdge(startNode.id, endNode.id)) return false;

    const clearConnect = () => {
      cancelConnectPreviewFrame();
      connectGuidanceShownRef.current = false;
      setNavConnectStart(null);
      setNavConnectBends([]);
      setNavPreview(null);
      setNavPreviewPins([]);
      navConnectBendGroupsRef.current = [];
      connectRedoStackRef.current = [];
      setNavEntranceHover(null);
      setWaypointEdgeSnap(null);
      setConnectBlocked(false);
    };

    if (findDuplicateNavEdge(reconciled.navEdges ?? [], startNode.id, endNode.id)) {
      toast.warning("Those points are already connected", "Select the existing connection to edit it.");
      clearConnect();
      return false;
    }

    const candidate = outdoorConnectCandidateFor(startNode, { x: endNode.x, y: endNode.y }, endNode);
    if (candidate.blocked) {
      toast.warning("Connection blocked", "The connection crosses a building or obstacle.");
      return false;
    }
    const allBends = candidate.bends;
    const polyline = candidate.points;
    const edge = {
      ...createNavEdge({ id: genId("ne"), startNodeId: startNode.id, endNodeId: endNode.id, nodes: reconciled.navNodes }),
      accessible: (startNode.entranceId ? startNode.accessible : endNode.entranceId ? endNode.accessible : true) !== false,
       ...(allBends.length > 0 ? { bendPoints: allBends, distance: navEdgePolylineDistance(polyline) } : {}),
    };
    const entranceNode = startNode.entranceId && !startNode.floorId
      ? startNode
      : endNode.entranceId && !endNode.floorId
        ? endNode
        : undefined;
    const withoutPreviousEntranceConnection = entranceNode?.buildingId && entranceNode.entranceId
      ? removeEntranceOutdoorConnection(reconciled, entranceNode.buildingId, entranceNode.entranceId)
      : reconciled;
    const next: Campus = {
      ...withoutPreviousEntranceConnection,
      navEdges: [...(withoutPreviousEntranceConnection.navEdges ?? []), edge],
    };
    // `reconciled` is already the final physical-Pathway reconciliation.  Add
    // the authored Stair connector only after the canonical junction has been
    // resolved, then publish that exact snapshot.  Running a second Pathway
    // reconciliation after adding the connector can re-canonicalize a shared
    // generated junction while the connector still points at the prior ID;
    // the resulting dangling edge is filtered from the outdoor render and
    // readiness graph even though the midpoint mutation succeeded.
    const committedCampus = next;
    const committedEdge = committedCampus.navEdges?.find((candidate) =>
      (candidate.startNodeId === startNode.id && candidate.endNodeId === endNode.id)
      || (candidate.startNodeId === endNode.id && candidate.endNodeId === startNode.id),
    );
    const committedStart = committedCampus.navNodes?.some((node) => node.id === startNode.id);
    const committedEnd = committedCampus.navNodes?.some((node) => node.id === endNode.id);
    if (!committedEdge || !committedStart || !committedEnd) {
      toast.warning("Connection could not be saved", "The Stair Exit and Pathway junction could not be reconciled.");
      return false;
    }
    campusRef.current = committedCampus;
    onUpdate(committedCampus);
    pushHistory(committedCampus);
    setSelected({ type: "navEdge", id: committedEdge.id });
    setSelectedPathPoint({ pathId: committedTarget.pathId, pointIndex });
    // Connect owns the navigation authoring surface.  Leaving a prior
    // Pathway member-edit scope active can intentionally hide its generated
    // junctions/edges, making a successful Stair connector appear to vanish
    // until Undo.  Exit that physical edit scope after this atomic commit so
    // the newly-created junction and connector render immediately.
    setPathMemberEditId(null);
    clearConnect();
    const sourceLabel = startNode.exteriorEmergencyStairId && !startNode.floorId
      ? "Stair Exit"
      : startNode.name || "Walking Point";
    toast.success("Connection created", `${sourceLabel} connected to ${path.name || "Walkway"}.`);
    return true;
  }, [cancelConnectPreviewFrame, findDuplicateNavEdge, insertPathJunctionPoint, navConnectStart, onUpdate, outdoorConnectCandidateFor, toast]);

  /**
   * Split a visible, authored Walking Network edge at the click position and
   * use the new canonical point as the Entrance's replacement target. The
   * physical Pathway branch above remains the source of truth for generated
   * segments; this helper is only for ordinary manual outdoor edges.
   */
  const connectManualNavSegment = useCallback((
    targetEdge: NavigationEdge,
    nearest: { x: number; y: number },
    preferredSegmentIndex?: number,
  ): boolean => {
    const clearConnect = () => {
      cancelConnectPreviewFrame();
      connectGuidanceShownRef.current = false;
      setNavConnectStart(null);
      setNavConnectBends([]);
      setNavPreview(null);
      setNavPreviewPins([]);
      navConnectBendGroupsRef.current = [];
      connectRedoStackRef.current = [];
      setNavEntranceHover(null);
      setWaypointEdgeSnap(null);
      setConnectBlocked(false);
    };
    if (!navConnectStart) return false;
    // Commit from the latest canonical campus snapshot.  A generated Stair
    // Exit discharge is derived infrastructure and may have been reconciled
    // after the Connect gesture began; resolving against render-time arrays
    // can otherwise leave a successful midpoint insertion with a connector
    // pointing at an obsolete discharge node.
    const liveCampus = campusRef.current;
    const sourceBeforeSync = (liveCampus.navNodes ?? []).find((node) => node.id === navConnectStart)
      ?? outdoorNodes.find((node) => node.id === navConnectStart);
    const generatedStairSource = Boolean(sourceBeforeSync?.exteriorEmergencyStairId && !sourceBeforeSync.floorId);
    const graphCampus = generatedStairSource
      ? syncExteriorEmergencyStairGraph(liveCampus)
      : liveCampus;
    const graphNodes = outdoorNavNodes(graphCampus.navNodes);
    const startNode = graphNodes.find((node) => node.id === navConnectStart)
      ?? (generatedStairSource
        ? graphNodes.find((node) => node.exteriorEmergencyStairId === sourceBeforeSync?.exteriorEmergencyStairId
          && !node.floorId
          && (!sourceBeforeSync?.buildingId || node.buildingId === sourceBeforeSync.buildingId))
        : undefined);
    const liveTargetEdge = graphCampus.navEdges?.find((edge) => edge.id === targetEdge.id) ?? targetEdge;
    if (!startNode || isPathwayGeneratedEdge(liveTargetEdge)
      || liveTargetEdge.type === "entrance_transition" || liveTargetEdge.type === "floor_transition") {
      clearConnect();
      return false;
    }
    // The hover projection is authoritative. Preserve it for diagonal and
    // bent segments instead of rounding back toward an endpoint on commit.
    const clickPoint = { x: nearest.x, y: nearest.y };
    const edgeStart = graphNodes.find((node) => node.id === liveTargetEdge.startNodeId);
    const edgeEnd = graphNodes.find((node) => node.id === liveTargetEdge.endNodeId);
    if (!edgeStart || !edgeEnd) return false;
    if (Math.hypot(clickPoint.x - edgeStart.x, clickPoint.y - edgeStart.y) <= NAV_NODE_HIT_THRESHOLD
      || Math.hypot(clickPoint.x - edgeEnd.x, clickPoint.y - edgeEnd.y) <= NAV_NODE_HIT_THRESHOLD) {
      toast.info("Choose a point along the Walking Network", "Click between the existing Walking Points to insert a connection point.");
      return false;
    }

    const insertNodeBase = createNavNode({
      id: genId("nn"),
      x: clickPoint.x,
      y: clickPoint.y,
      campusId: graphCampus.id,
      name: "Walking Point",
      type: "outdoor",
      color: LAYER_MARKER_CONFIG.navigation.color,
    });
    // A connector-segment target is a real graph junction, not a loose
    // Walking Point. Keep this provenance explicit so split edges and later
    // editor actions treat the point as one canonical attachment.
    const insertNode = { ...insertNodeBase, x: clickPoint.x, y: clickPoint.y, pathJunction: true };
    // Resolve the connector from the same candidate used by the live preview.
    // This keeps Stair/Discharge and ordinary manual sources on one commit
    // path and prevents a second orthogonalization from changing the line.
    const candidate = outdoorConnectCandidateFor(startNode, clickPoint, insertNode);
    if (candidate.blocked) {
      toast.warning("Connection blocked", "The connection crosses a building or obstacle.");
      return false;
    }
    const connectorBends = candidate.bends;
    const connectorPoints = candidate.points;
    const splitResult = splitNavEdge(liveTargetEdge, insertNode, graphNodes, preferredSegmentIndex);
    if (!splitResult) return false;

    const entranceNode = startNode.entranceId && !startNode.floorId
      ? startNode
      : insertNode.entranceId && !insertNode.floorId
        ? insertNode
        : undefined;
    const withoutPreviousEntranceConnection = entranceNode?.buildingId && entranceNode.entranceId
      ? removeEntranceOutdoorConnection(graphCampus, entranceNode.buildingId, entranceNode.entranceId)
      : graphCampus;
    const splitEdges = splitResult.newEdges.filter((edge) => edge.id !== liveTargetEdge.id);
    const connectorEdge = {
      ...createNavEdge({ id: genId("ne"), startNodeId: startNode.id, endNodeId: insertNode.id, nodes: [...graphNodes, insertNode] }),
      accessible: startNode.accessible !== false,
      ...(connectorBends.length > 0 ? { bendPoints: connectorBends, distance: navEdgePolylineDistance(connectorPoints) } : {}),
    };
    const retainedEdges = (withoutPreviousEntranceConnection.navEdges ?? []).filter((edge) => edge.id !== liveTargetEdge.id);
    const next: Campus = {
      ...withoutPreviousEntranceConnection,
      navNodes: [...(withoutPreviousEntranceConnection.navNodes ?? []), insertNode],
      navEdges: [...retainedEdges, ...splitEdges, connectorEdge],
    };
    const committedConnector = next.navEdges.find((edge) => edge.id === connectorEdge.id);
    const committedInsert = next.navNodes?.some((node) => node.id === insertNode.id);
    const connectorEndpointsLive = committedConnector
      && next.navNodes?.some((node) => node.id === committedConnector.startNodeId)
      && next.navNodes?.some((node) => node.id === committedConnector.endNodeId);
    if (!committedConnector || !committedInsert || !connectorEndpointsLive) {
      toast.warning("Connection could not be saved", "The Walking Network junction could not be reconciled.");
      clearConnect();
      return false;
    }
    campusRef.current = next;
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "navNode", id: insertNode.id });
    setSelectedPathPoint(null);
    cancelConnectPreviewFrame();
    connectGuidanceShownRef.current = false;
    setNavConnectStart(null);
    setNavConnectBends([]);
    setNavPreview(null);
    setNavPreviewPins([]);
    navConnectBendGroupsRef.current = [];
    connectRedoStackRef.current = [];
    setNavEntranceHover(null);
    setWaypointEdgeSnap(null);
    setConnectBlocked(false);
    setPathMemberEditId(null);
    const sourceLabel = startNode.exteriorEmergencyStairId && !startNode.floorId
      ? "Stair Exit"
      : startNode.name || "Walking Point";
    toast.success("Connection created", `${sourceLabel} connected to Walking Network.`);
    return true;
  }, [cancelConnectPreviewFrame, findDuplicateNavEdge, navConnectStart, onUpdate, outdoorConnectCandidateFor, outdoorNodes, splitNavEdge, toast]);

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
    const nextVertexIds = path.navigationVertexIds?.length === path.points.length
      ? path.navigationVertexIds.filter((_, index) => index !== selectedPathPoint.pointIndex)
      : undefined;
    const next: Campus = {
      ...campus,
      paths: paths.map((p) => p.id === path.id ? { ...p, points: nextPoints, ...(nextVertexIds ? { navigationVertexIds: nextVertexIds } : {}) } : p),
    };
    const reconciled = reconcilePathwayNavigation(next, genId, { preserveAuthoredGeometry: true });
    onUpdate(reconciled);
    pushHistory(reconciled);
    setSelected({ type: "path", id: path.id });
    setSelectedPathPoint(null);
  };

  /**
   * Remove an explicit physical Pathway vertex that owns a generated outdoor
   * node.  Generated navigation objects are never deleted directly: the
   * Pathway remains the source of truth and reconciliation rebuilds only the
   * affected generated nodes/edges.  Shared/junction vertices are protected
   * because removing one would silently damage another Pathway or bridge.
   */
  const onRemoveGeneratedPathwayPoint = useCallback((nodeId: string) => {
    const node = navNodes.find((candidate) => candidate.id === nodeId);
    const refs = node?.generatedFromPathVertices ?? [];
    if (!node || refs.length === 0) return false;
    if (refs.length !== 1) {
      toast.warning("Pathway point is shared", "This point connects multiple Pathways. Edit the connected Pathways first.");
      return false;
    }
    const ref = refs[0];
    const path = paths.find((candidate) => candidate.id === ref.pathId);
    const vertexIds = path?.navigationVertexIds;
    const pointIndex = vertexIds && vertexIds.length === path?.points.length ? vertexIds.indexOf(ref.vertexId) : -1;
    if (!path || !vertexIds || pointIndex < 0 || path.locked) {
      toast.warning("Pathway point cannot be removed", path?.locked ? "Unlock the physical Pathway first." : "The physical Pathway vertex identity is unavailable.");
      return false;
    }
    const first = path.points[0];
    const last = path.points[path.points.length - 1];
    const closed = Boolean(first && last && path.points.length > 2 && pathPointKey(first) === pathPointKey(last));
    const isSharedJunction = pathPointIsJunction(path.id, pointIndex)
      || navEdges.some((edge) => {
        if (edge.startNodeId !== nodeId && edge.endNodeId !== nodeId) return false;
        return edge.type === "entrance_transition" || !edge.generatedFromPathIds?.includes(path.id);
      });
    if (isSharedJunction || closed && (pointIndex === 0 || pointIndex === path.points.length - 1)) {
      toast.warning("Pathway point is shared", "This point connects multiple Pathways or a building bridge. Edit the connected Pathways first.");
      return false;
    }
    if (path.points.length <= 2) {
      toast.info("Pathway needs two points", "Add another Pathway vertex before removing this point.");
      return false;
    }
    const nextPoints = path.points.filter((_, index) => index !== pointIndex);
    if (nextPoints.length < 2) {
      toast.info("Pathway needs two points", "A Pathway must keep at least two points.");
      return false;
    }
    const nextVertexIds = vertexIds.filter((_, index) => index !== pointIndex);
    const next: Campus = {
      ...campus,
      paths: paths.map((candidate) => candidate.id === path.id
        ? { ...candidate, points: nextPoints, navigationVertexIds: nextVertexIds }
        : candidate),
    };
    const reconciled = reconcilePathwayNavigation(next, genId, { preserveAuthoredGeometry: true });
    onUpdate(reconciled);
    pushHistory(reconciled);
    setSelected({ type: "path", id: path.id });
    setSelectedPathPoint(null);
    toast.success("Pathway point removed", "The generated walking network was reconciled from the physical Pathway.");
    return true;
    // pushHistory is intentionally omitted: evaluating it here would hit the
    // component's later history callback declaration during render.
  }, [campus, navEdges, navNodes, onUpdate, pathPointIsJunction, paths, toast]);

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
        ? {
            ...p,
            points: [...p.points.slice(0, segmentIndex + 1), point, ...p.points.slice(segmentIndex + 1)],
            ...(p.navigationVertexIds?.length === p.points.length
              ? { navigationVertexIds: [...p.navigationVertexIds.slice(0, segmentIndex + 1), genId("pv"), ...p.navigationVertexIds.slice(segmentIndex + 1)] }
              : {}),
          }
        : p),
    };
    const reconciled = reconcilePathwayNavigation(next, genId, { preserveAuthoredGeometry: true });
    onUpdate(reconciled);
    pushHistory(reconciled);
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
    const reconciled = reconcilePathwayNavigation(next, genId);
    onUpdate(reconciled);
    pushHistory(reconciled);
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
      name: "Walking Point",
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
      toast.info("Walking Point already exists", "Selected the existing Walking Point at this pathway point.");
      return;
    }
    const next: Campus = { ...campus, navNodes: ensured.nodes };
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "navNode", id: ensured.node.id });
    setMultiSelected([]);
    toast.success("Walking Point added", "Snapped to the selected pathway point.");
  };

  const onAddPathToNavigation = (pathId: string) => {
    onAddPathsToNavigation([pathId]);
  };

  const onAddPathsToNavigation = (pathIds: string[]) => {
    const requestedPaths = paths.filter((p) => pathIds.includes(p.id) && p.points.length >= 2);
    const missingIds = new Set(pathNetworkNavigationStatus(requestedPaths, navNodes, navEdges).missingPathIds);
    const pathSet = requestedPaths.filter((path) => missingIds.has(path.id));
    if (requestedPaths.length > 0 && pathSet.length === 0) {
      toast.info(requestedPaths.length > 1 ? "Network already in navigation" : "Pathway already in navigation", "The generated walking network already follows this pathway.");
      return;
    }
    if (pathSet.length === 0) return;
    const result = convertPathwaysToNavigation(campus, pathSet.map((path) => path.id), genId);
    if (result.legacyPathIds.length > 0 && result.createdNodes === 0 && result.createdEdges === 0) {
      toast.info("Legacy navigation needs reconnecting", "Existing walking data was preserved; this pathway needs an explicit rebuild before it can follow geometry changes.");
      return;
    }
    const next: Campus = result.campus;
    const reconciled = reconcilePathwayNavigation(next, genId);
    onUpdate(reconciled);
    pushHistory(reconciled);
    setSelected({ type: "path", id: requestedPaths[0].id });
    setMultiSelected(requestedPaths.length > 1 ? requestedPaths.map((path) => path.id) : []);
    const addedDetail = result.createdNodes === 0 && result.createdEdges === 0
      ? `${pathSet.length} missing Pathway${pathSet.length === 1 ? "" : "s"} linked to the existing generated network.`
      : `${result.createdNodes} Walking Point${result.createdNodes === 1 ? "" : "s"} and ${result.createdEdges} walking path${result.createdEdges === 1 ? "" : "s"} added.`;
    toast.success(requestedPaths.length > 1 ? "Network navigation updated" : "Path added to navigation", addedDetail);
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
    if (!edge || !bend || isPathwayGeneratedEdge(edge)) return;
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
    if (!edge || !start || !end || isPathwayGeneratedEdge(edge)) return;
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
    if (!edge || isPathwayGeneratedEdge(edge) || !edge.bendPoints || edge.bendPoints.length === 0) return;
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
    if (!edge || !a || !b || isPathwayGeneratedEdge(edge)) return;
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
    if (tool === "connect" && layer === "navigation") {
    setNavConnectStart(null);
    setNavConnectBends([]);
    setNavPreview(null);
    setNavPreviewPins([]);
    navConnectBendGroupsRef.current = [];
    connectRedoStackRef.current = [];
    }
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
    setSelected({ type, id } as CampusSelection);
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
  const placeCampusGate = useCallback((x: number, y: number) => {
    const live = campusRef.current;
    const width = live.canvasW > 0 ? live.canvasW : 900;
    const height = live.canvasH > 0 ? live.canvasH : 680;
    const gate: CampusMarker = {
      id: genId("gate"), name: "Campus Gate", type: "gate", purpose: "general",
      ...campusGateSize(lastMarkerSizesRef.current["campus-gate"]),
      x: Math.max(0, Math.min(width, Math.round(x))), y: Math.max(0, Math.min(height, Math.round(y))), color: "#2563eb",
    };
    const next = syncCampusGateNavigation({ ...live, markers: [...(live.markers ?? []), gate] }, genId);
    campusRef.current = next;
    onUpdate(next);
    pushHistory(next);
    setSelected({ type: "gate", id: gate.id });
    setTool("select");
    toast.success("Campus Gate created", "Edit its name and emergency purpose in the properties panel.");
  }, [onUpdate, pushHistory, toast]);

  const onUpdateDecorAsset = useCallback((id: string, changes: Partial<CampusDecorAsset>) => {
    const nextAssets = (campus.decorAssets ?? []).map((asset) => {
      if (asset.id !== id) return asset;
      const proposed = { ...asset, ...changes };
      const geometryChanged = changes.x !== undefined || changes.y !== undefined
        || changes.width !== undefined || changes.height !== undefined || changes.scale !== undefined || changes.rotation !== undefined || changes.type !== undefined;
      if (!geometryChanged) return proposed;
      const template = DECOR_ASSET_MAP[proposed.type];
      if (!template) return proposed;
      const area = isDecorAreaType(proposed.type);
      const size = area
        ? { width: Math.max(1, proposed.width ?? template.defaultWidth), height: Math.max(1, proposed.height ?? template.defaultHeight) }
        : decorWorldSize(template, proposed.scale);
      let boundedProposed = proposed;
      if (area && (changes.width !== undefined || changes.height !== undefined || changes.type !== undefined)) {
        const fitted = fitDecorSizeToCanvas(proposed.x, proposed.y, size.width, size.height, proposed.rotation ?? 0, cw, ch);
        boundedProposed = {
          ...boundedProposed,
          width: Math.max(30, fitted.width),
          height: Math.max(24, fitted.height),
          x: Math.round(proposed.x),
          y: Math.round(proposed.y),
          scale: undefined,
        };
      } else if (!area && changes.scale !== undefined) {
        const fitted = fitDecorSizeToCanvas(proposed.x, proposed.y, size.width, size.height, proposed.rotation ?? 0, cw, ch);
        if (fitted.factor < 1) boundedProposed = { ...boundedProposed, scale: (proposed.scale ?? 1) * fitted.factor };
      }
      const delta = clampMemberTranslation(
        { kind: "decorAsset", id: boundedProposed.id, x: boundedProposed.x, y: boundedProposed.y, width: area ? boundedProposed.width ?? size.width : decorWorldSize(template, boundedProposed.scale).width, height: area ? boundedProposed.height ?? size.height : decorWorldSize(template, boundedProposed.scale).height, rotation: boundedProposed.rotation ?? 0 },
        0,
        0,
        cw,
        ch,
        CAMPUS_OBJECT_SAFE_INSET,
      );
      return { ...boundedProposed, x: Math.round(boundedProposed.x + delta.dx), y: Math.round(boundedProposed.y + delta.dy) };
    });
    const next = { ...campus, decorAssets: nextAssets };
    onUpdate(next);
    pushHistory(next);
  }, [campus, cw, ch, onUpdate, pushHistory]);

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
          const identity = nextBuildingCopyIdentity(b, buildings, defaultBuildingReservationsRef.current?.values, nbId);
          defaultBuildingReservationsRef.current?.values.push(identity);
          const entranceIdMap = new Map((b.entrances ?? []).map((entrance) => [entrance.id, genId("ent")]));
          const clonedFloors = (b.floors ?? []).map((floor) => duplicateFloorForBuilding(floor, {
            id: genId("fl"), buildingId: nbId, number: floor.number, label: floor.label,
          }));
          const clonedEntrances = normalizeBuildingEntrances(b).map((entrance) => ({
            ...entrance,
            id: entranceIdMap.get(entrance.id) ?? genId("ent"),
            buildingId: nbId,
          }));
          const nb: CampusBuilding = {
            ...b,
            id: nbId,
            name: identity.name,
            code: identity.code,
            x: b.x + 20,
            y: b.y + 20,
            entrances: clonedEntrances,
            floors: clonedFloors,
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
        // Ordinary decorative assets delete directly; the reusable confirmation
        // dialog remains reserved for buildings and other destructive actions.
        const next = { ...campus, decorAssets: (campus.decorAssets ?? []).filter((asset) => asset.id !== id) };
        onUpdate(next);
        pushHistory(next);
        setSelected(null);
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
  }, [contextMenu, buildings, markers, onUpdateBuilding, handleLayerOrder, campus, onDuplicateDecorAsset, onUpdate, pushHistory]);

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

  const handleExteriorEmergencyStairFloorNavigate = useCallback((buildingId: string, floorId: string, stairId: string) => {
    const building = campusRef.current.buildings.find((candidate) => candidate.id === buildingId);
    const floor = building?.floors.find((candidate) => candidate.id === floorId);
    const occurrence = floor?.stairs.find((candidate) => candidate.exteriorEmergencyStairId === stairId);
    if (!building || !floor || !occurrence) return;
    requestOpenFloor(buildingId, floorId, { type: "stairs", id: occurrence.id });
  }, [requestOpenFloor]);

  // A Building double-click is an explicit enter action, never an inline
  // rename shortcut. Rename remains available from Properties/hierarchy.
  const handleBuildingDoubleClick = useCallback((id: string) => {
    const building = buildings.find((candidate) => candidate.id === id);
    if (!building) return;
    setSelected({ type: "building", id });
    const floor = entryFloorForBuilding(building)
      ?? [...building.floors].sort((a, b) => (a.number ?? 0) - (b.number ?? 0))[0];
    if (floor) {
      requestOpenFloor(building.id, floor.id);
    } else {
      toast.info("Building has no floors", "Add a floor in Building Properties before entering this building.");
    }
  }, [buildings, requestOpenFloor, toast]);

  // A route-origin focus request can survive the Campus -> Floor unmount.  If
  // the origin is outdoor, consume it here after the campus canvas is ready;
  // floor-owned requests are consumed by the target FloorEditor instead.
  useEffect(() => {
    const request = testRouteSessionContext.session?.pendingFocus;
    if (!request || request.context.kind !== "outdoor") return;
    const node = outdoorNodes.find((candidate) => candidate.id === request.nodeId);
    if (!node) return;
    const timer = window.setTimeout(() => {
      if (node.entranceId && node.buildingId) {
        setSelected({ type: "entrance", id: node.entranceId, buildingId: node.buildingId });
      }
      // Keep route-origin focus legible without an overly tight camera crop.
      zoomToBuilding(node.x - 110, node.y - 90, 220, 180);
      const current = testRouteSessionContext.session;
      if (current?.pendingFocus?.nodeId === request.nodeId) {
        testRouteSessionContext.setSession({ ...current, pendingFocus: undefined });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [outdoorNodes, setSelected, testRouteSessionContext.session, testRouteSessionContext.setSession, zoomToBuilding]);

  const handleTestRouteTransition = useCallback((marker: TestRouteTransitionMarker) => {
    if (marker.targetContext.kind === "floor" && marker.targetContext.buildingId && marker.targetContext.floorId) {
      const targetNode = marker.targetNodeId
        ? (campus.navNodes ?? []).find((node) => node.id === marker.targetNodeId)
        : undefined;
      const initialSelection: FloorSelection | undefined = targetNode?.elevatorId
        ? { type: "elevator", id: targetNode.elevatorId }
        : targetNode?.stairId
          ? { type: "stairs", id: targetNode.stairId }
          : targetNode?.doorId
            ? { type: "door", id: targetNode.doorId }
            : undefined;
      requestOpenFloor(marker.targetContext.buildingId, marker.targetContext.floorId, initialSelection);
      return;
    }
    if (marker.targetContext.kind === "outdoor" && marker.targetNodeId) {
      const current = testRouteSessionContext.session;
      if (current) {
        testRouteSessionContext.setSession({
          ...current,
          pendingFocus: { nodeId: marker.targetNodeId, context: marker.targetContext },
        });
      }
      handleBack();
    }
  }, [campus.navNodes, handleBack, requestOpenFloor, testRouteSessionContext]);

  // ── B5 Phase 2.1: copy / paste / duplicate (editor-local clipboards) ───────
  const outdoorClipboardRef = useRef<OutdoorClipboardEntry[] | null>(null);
  const outdoorNavClipboardRef = useRef<{ nodes: NavigationNode[]; edges: NavigationEdge[] } | null>(null);
  const pasteOffsetRef = useRef(25);

  const copyOutdoorSelection = useCallback(() => {
    const { entries, excluded } = collectOutdoorClipboardSelection(multiSelected, selected, buildings, markers, decorAssets);
    if (entries.length === 0) {
      toast.info(
        excluded[0] ? "Item not copied" : "Nothing to copy",
        excluded[0] ?? "Select a building, point of interest, or decorative asset first (Ctrl+C).",
      );
      return;
    }
    outdoorClipboardRef.current = entries;
    pasteOffsetRef.current = 25;
    if (excluded.length > 0) {
      toast.info("Some items not copied", excluded[0]);
    }
    toast.success("Copied", `${entries.length} object${entries.length !== 1 ? "s" : ""} copied (Ctrl+V to paste).`);
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
    const nextDecor = [...decorAssets];
    const newIds: string[] = [];
    for (const sel of outdoorClipboardRef.current) {
      if (sel.type === "building") {
        const b = buildings.find((x) => x.id === sel.id);
        if (!b) continue;
        const nbId = genId("bld");
        const identity = nextBuildingCopyIdentity(b, buildings, defaultBuildingReservationsRef.current?.values, nbId);
        defaultBuildingReservationsRef.current?.values.push(identity);
        const entranceIdMap = new Map((b.entrances ?? []).map((entrance) => [entrance.id, genId("ent")]));
        const clonedFloors = (b.floors ?? []).map((floor) => duplicateFloorForBuilding(floor, {
          id: genId("fl"), buildingId: nbId, number: floor.number, label: floor.label,
        }));
        const clonedEntrances = normalizeBuildingEntrances(b).map((entrance) => ({
          ...entrance,
          id: entranceIdMap.get(entrance.id) ?? genId("ent"),
          buildingId: nbId,
        }));
        const nb: CampusBuilding = {
          ...b,
          id: nbId,
          name: identity.name,
          code: identity.code,
          x: Math.round(Math.max(0, Math.min(cw - b.width, b.x + offset))),
          y: Math.round(Math.max(0, Math.min(ch - b.height, b.y + offset))),
          entrances: clonedEntrances,
          floors: clonedFloors,
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
      }
    }
    if (newIds.length === 0) {
      toast.info("Nothing to paste", "The copied object no longer exists on this campus.");
      return;
    }
    pushHistory();
    onUpdate({ ...campus, buildings: nextBuildings, markers: nextMarkers, paths, decorAssets: nextDecor });
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
      const identity = nextBuildingCopyIdentity(b, buildings, defaultBuildingReservationsRef.current?.values, nbId);
      defaultBuildingReservationsRef.current?.values.push(identity);
      const entranceIdMap = new Map((b.entrances ?? []).map((entrance) => [entrance.id, genId("ent")]));
      const clonedFloors = (b.floors ?? []).map((floor) => duplicateFloorForBuilding(floor, {
        id: genId("fl"), buildingId: nbId, number: floor.number, label: floor.label,
      }));
      const clonedEntrances = normalizeBuildingEntrances(b).map((entrance) => ({
        ...entrance,
        id: entranceIdMap.get(entrance.id) ?? genId("ent"),
        buildingId: nbId,
      }));
      const nb: CampusBuilding = {
        ...b,
        id: nbId,
        name: identity.name,
        code: identity.code,
        x: b.x + 25,
        y: b.y + 25,
        entrances: clonedEntrances,
        floors: clonedFloors,
      };
      updBuildings([...buildings, nb]);
      setSelected({ type: "building", id: nb.id });
      toast.success("Building Duplicated", `${b.code} has been copied.`);
      return;
    }
    const { entries, excluded } = collectOutdoorClipboardSelection(multiSelected, selected, buildings, markers, decorAssets);
    if (entries.length === 0) {
      toast.info("Item not duplicated", excluded[0] ?? "Select an object to duplicate (Ctrl+D).");
      return;
    }
    outdoorClipboardRef.current = entries;
    if (excluded.length > 0) toast.info("Some items not duplicated", excluded[0]);
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
    const freeNodes = selectedNodes.filter(isFreeOutdoorWaypoint);
    const linkedCount = selectedNodes.length - freeNodes.length;
    const freeIds = new Set(freeNodes.map((n) => n.id));
    const edges = navEdges.filter((e) => freeIds.has(e.startNodeId) && freeIds.has(e.endNodeId));
    return { nodes: freeNodes, edges, linkedCount };
  }, [multiSelected, navEdges, navNodes, selected]);

  const copyOutdoorNavSelection = useCallback(() => {
    const { nodes, edges, linkedCount } = navOutdoorSelectionGraph();
    if (nodes.length === 0) {
      toast.info(
        linkedCount > 0 ? "Managed waypoint not copied" : "Nothing to copy",
        linkedCount > 0
          ? "This waypoint is owned by a building, gate, pathway, or indoor object and cannot be copied."
          : "Select a free outdoor waypoint first (Ctrl+C).",
      );
      return;
    }
    outdoorNavClipboardRef.current = { nodes: structuredClone(nodes), edges: structuredClone(edges) };
    pasteOffsetRef.current = 25;
    if (linkedCount > 0) {
      toast.info("Managed walking points not copied", `${linkedCount} entrance or pathway-generated point${linkedCount !== 1 ? "s" : ""} follow their owner and cannot be copied.`);
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
      toast.info(
        linkedCount > 0 ? "Managed waypoint not duplicated" : "Nothing to duplicate",
        linkedCount > 0
          ? "This waypoint is owned by a building, gate, pathway, or indoor object and cannot be duplicated."
          : "Select a free outdoor waypoint first (Ctrl+D).",
      );
      return;
    }
    if (linkedCount > 0) {
      toast.info("Managed walking points excluded", `${linkedCount} entrance or pathway-generated point${linkedCount !== 1 ? "s" : ""} follow their owner and cannot be duplicated.`);
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
            connectGuidanceShownRef.current = false;
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
          const reconciled = reconcilePathwayNavigation(next, genId, { preserveAuthoredGeometry: true });
          onUpdate(reconciled);
          pushHistory(reconciled);
          setMultiSelected([]);
          setSelected(null);
          setSelectedPathPoint(null);
          setPathMemberEditId(null);
          setShowAlignTools(false);
          return;
        }
        if (bIds.length === 0 && mIds.length === 0 && pathIds.length === 0 && daIds.length > 0) {
          const next = { ...campus, decorAssets: decorAssets.filter((asset) => !daIds.includes(asset.id)) };
          onUpdate(next);
          pushHistory(next);
          setMultiSelected([]);
          setSelected(null);
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
        } else if (selected.type === "marker" || selected.type === "gate") {
          onDeleteMarker(selected.id);
        }
        else if (selected.type === "path") {
          if (selectedPathPoint?.pathId === selected.id && pathPointIsJunction(selected.id, selectedPathPoint.pointIndex)) {
            toast.info("Disconnect Pathways first", "This shared point keeps its Pathways connected until you separate them.");
            return;
          }
          if (selectedPathPoint?.pathId === selected.id && selectedPathPointCanBeRemoved()) {
            onRemoveSelectedPathPoint();
            return;
          }
          onDeletePath(selected.id);
        }
        else if (selected.type === "entrance") {
          const parent = buildings.find((b) => b.id === selected.buildingId);
          if (parent?.locked) return;
          onDeleteEntrance(selected.buildingId, selected.id);
        }
        else if (selected.type === "decorAsset") {
          // Routine decorative assets are low-risk editor content: remove them
          // immediately and retain the normal history snapshot for undo.
          const next = { ...campus, decorAssets: decorAssets.filter((da) => da.id !== selected.id) };
          onUpdate(next);
          pushHistory(next);
        }
        else if (selected.type === "navNode") {
          const selectedNode = navNodes.find((node) => node.id === selected.id);
          if (selectedNode?.pathJunction) {
            removePathJunction(selected.id);
            return;
          }
          if (selectedNode?.roomId || selectedNode?.doorId || selectedNode?.entranceId || selectedNode?.stairId || selectedNode?.elevatorId || selectedNode?.rampId || selectedNode?.gateId) {
            toast.info("Navigation anchor", "Edit or remove navigation from the owning Room, Door, Entrance, or circulation object.");
            return;
          }
          // Single waypoint delete: deterministic connected-edge cleanup.
          if (selectedNode?.generatedFromPathVertices?.length) {
            onRemoveGeneratedPathwayPoint(selected.id);
            return;
          }
          const next = removeNavNode(navNodes, navEdges, selected.id);
          const nextCampus = { ...campus, navNodes: next.nodes, navEdges: next.edges };
          onUpdate(nextCampus);
          pushHistory(nextCampus);
        }
        else if (selected.type === "navEdge") {
          if (isPathwayGeneratedEdge(navEdges.find((edge) => edge.id === selected.id))) {
            toast.info("Pathway walking path is managed automatically", "Edit or delete the owning physical Pathway instead.");
            return;
          }
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
        const editableIds = buildings.filter((b) => !b.locked).map((b) => b.id);
        setMultiSelected(editableIds);
        if (editableIds.length > 1) setShowAlignTools(true);
        return; // Don't fall through to the single-letter "a" → building tool
      }
      if (e.key === "Escape") {
        if (pendingCanvasResize) {
          setPendingCanvasResize(null);
          setCanvasResizePreview(null);
          canvasResizeOriginalRef.current = null;
          setCanvasResizeMode(false);
          return;
        }
    if (canvasResizeRef.current || canvasResizeMode) {
          canvasResizeRef.current = null;
          setCanvasResizePreview(null);
          setPendingCanvasResize(null);
          canvasResizeOriginalRef.current = null;
          setCanvasResizeMode(false);
          setGuides([]);
          return;
        }
        if (groupResizing.current) {
          groupResizing.current = null;
          setGuides([]);
          gestureChangedRef.current = false;
          gestureHistoryPushed.current = false;
          return;
        }
        if (markerResizing.current) {
          markerResizing.current = null;
          setMarkerResizingId(null);
          setGuides([]);
          return;
        }
        setTestRoutePickKind(null);
        setTestRouteMapPick(null);
        setTestRoutePickHover(null);
        // B5 Phase 5.12 — Escape while editing one path inside its network
        // returns to the WHOLE-NETWORK selection (group stays intact).
        if (pathMemberEditId) {
          exitPathMemberEditToNetwork();
          return;
        }
        setDP([]);
        groundPaintGesture.current = null;
        groundEraseGesture.current = [];
        pathPaintStroke.current = null;
        setArmedDecorAssetType(null);
        pathExtendRef.current = null;
        setGroundBrushPreview(null);
        setGroundErasePreview(null);
        setPathPaintPreview(null);
        // Cancel an in-progress navigation edge (never leaves an orphan edge).
        connectGuidanceShownRef.current = false;
        setNavConnectStart(null);
        setNavConnectBends([]);
        setNavPreview(null);
        setNavPreviewPins([]);
        navConnectBendGroupsRef.current = [];
        connectRedoStackRef.current = [];
        if (tool === "connect") switchTool("select");
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
        if (e.key === "p" || e.key === "P") {
          if (layer === "navigation") {
            switchTool("connect");
          } else if (canUseTool("path")) {
            switchTool("path");
            if (layer === "campus") setPathSettingsOpen(true);
          }
        }
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
            // Arrow-key nudges use the same rigid safe-frame clamp as pointer
            // group drags. Compute one delta from the combined visible bounds.
            const nudgeMembers = buildDragGroup({ type: "nudge", id: multiSelected[0] }, multiSelected) ?? [];
            let nudgeDx = dx;
            let nudgeDy = dy;
            if (nudgeMembers.length > 0 && nudgeMembers.some((member) => member.kind !== "path" && member.kind !== "marker")) {
              const nudgeBounds = groupBBoxAfterTranslation(nudgeMembers, 0, 0);
              const inset = CAMPUS_OBJECT_SAFE_INSET;
              nudgeDx = Math.max(inset - nudgeBounds.x, Math.min(cw - inset - (nudgeBounds.x + nudgeBounds.width), nudgeDx));
              nudgeDy = Math.max(inset - nudgeBounds.y, Math.min(ch - inset - (nudgeBounds.y + nudgeBounds.height), nudgeDy));
            }
            if (nudgeDx === 0 && nudgeDy === 0) return;
            const nextBuildings = buildings.map((x) => multiSelected.includes(x.id) ? { ...x, x: x.x + nudgeDx, y: x.y + nudgeDy } : x);
            // B5 correction: the nudge path uses the SAME graph-group
            // translation as the mouse drag — selected free waypoints AND the
            // bends of edges whose both endpoints move translate together.
            const syncedNavNodes = syncEntranceNodePositions(nextBuildings, navNodes);
            const movingNavNodeIds = new Set(
              multiSelected.filter((id) => {
                const n = syncedNavNodes.find((x) => x.id === id);
                return Boolean(n && !n.entranceId && !(n.exteriorEmergencyStairId && !n.floorId));
              })
            );
            const { nodes: movedNavNodes, edges: movedNavEdges } = translateSelectedNavGraph(
              syncedNavNodes,
              navEdges,
              movingNavNodeIds,
              nudgeDx,
              nudgeDy,
            );
            const nudgedCampus = syncCampusGateNavigation({
              ...campus,
              buildings: nextBuildings,
              navNodes: movedNavNodes.map((n) =>
                movingNavNodeIds.has(n.id)
                  ? { ...n, x: Math.max(0, Math.min(cw, n.x)), y: Math.max(0, Math.min(ch, n.y)) }
                  : n
              ),
              navEdges: movedNavEdges,
              markers: markers.map((m) => multiSelected.includes(m.id) ? { ...m, x: m.x + nudgeDx, y: m.y + nudgeDy } : m),
              decorAssets: decorAssets.map((d) => multiSelected.includes(d.id) ? { ...d, x: d.x + nudgeDx, y: d.y + nudgeDy } : d),
              paths: paths.map((p) => multiSelected.includes(p.id) ? { ...p, points: p.points.map((pt) => ({ x: pt.x + nudgeDx, y: pt.y + nudgeDy })) } : p),
            }, genId);
            onUpdate(reconcilePathwayNavigation(syncExteriorEmergencyStairGraph(nudgedCampus), genId, {
              preserveAuthoredGeometry: multiSelected.some((id) => paths.some((path) => path.id === id)),
            }));
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
            const currentBuilding = buildings.find((x) => x.id === selected.id);
            const bounded = currentBuilding
              ? clampMemberTranslation({ kind: "building", id: currentBuilding.id, x: currentBuilding.x, y: currentBuilding.y, width: currentBuilding.width, height: currentBuilding.height, rotation: currentBuilding.rotation ?? 0 }, dx, dy, cw, ch, CAMPUS_OBJECT_SAFE_INSET)
              : { dx, dy };
            const nextBuildings = buildings.map((x) => x.id === selected.id ? { ...x, x: x.x + bounded.dx, y: x.y + bounded.dy } : x);
            onUpdate(syncExteriorEmergencyStairGraph({ ...campus, buildings: nextBuildings, navNodes: syncEntranceNodePositions(nextBuildings, navNodes), navEdges }));
          } else if (selected.type === "marker" || selected.type === "gate") {
            const currentMarker = markers.find((m) => m.id === selected.id);
            const bounded = currentMarker && !isCampusGate(currentMarker)
              ? clampMemberTranslation({ kind: "marker", id: currentMarker.id, x: currentMarker.x, y: currentMarker.y, width: currentMarker.width ?? 24, height: currentMarker.height ?? 24 }, dx, dy, cw, ch, CAMPUS_OBJECT_SAFE_INSET)
              : { dx, dy };
            const nextMarkers = markers.map((m) => m.id === selected.id ? { ...m, x: m.x + bounded.dx, y: m.y + bounded.dy } : m);
            const moved = nextMarkers.find((marker) => marker.id === selected.id);
            onUpdate(moved && isCampusGate(moved)
              ? syncCampusGateNavigation({ ...campus, markers: nextMarkers }, genId)
              : { ...campus, markers: nextMarkers });
          } else if (selected.type === "decorAsset") {
            const currentAsset = decorAssets.find((d) => d.id === selected.id);
            if (currentAsset) {
              const template = DECOR_ASSET_MAP[currentAsset.type];
              const size = template
                ? (isDecorAreaType(currentAsset.type)
                    ? { width: currentAsset.width ?? template.defaultWidth, height: currentAsset.height ?? template.defaultHeight }
                    : decorWorldSize(template, currentAsset.scale))
                : { width: 1, height: 1 };
              const bounded = clampMemberTranslation({ kind: "decorAsset", id: currentAsset.id, x: currentAsset.x, y: currentAsset.y, width: size.width, height: size.height, rotation: currentAsset.rotation ?? 0 }, dx, dy, cw, ch, CAMPUS_OBJECT_SAFE_INSET);
              onUpdate({ ...campus, decorAssets: decorAssets.map((d) => d.id === selected.id ? { ...d, x: d.x + bounded.dx, y: d.y + bounded.dy } : d) });
            }
          } else if (selected.type === "path") {
            onUpdate(reconcilePathwayNavigation({
              ...campus,
              paths: paths.map((p) => p.id === selected.id ? { ...p, points: p.points.map((pt) => ({ ...pt, x: pt.x + dx, y: pt.y + dy })) } : p),
            }, genId, { preserveAuthoredGeometry: true }));
          } else if (selected.type === "navNode") {
            const n = outdoorNodes.find((x) => x.id === selected.id);
            if (!n || n.entranceId || n.gateId || n.generatedFromPathVertices?.length || (n.exteriorEmergencyStairId && !n.floorId)) return;
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
        // B8 Phase 1: duplicate nav selection when a nav node is selected.
        if (selected?.type === "navNode" || multiSelected.some((id) => navNodes.some((n) => n.id === id))) { duplicateOutdoorNavSelection(); return; }
        duplicateOutdoorSelection();
        return;
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [selected, selectedPathPoint, tool, layer, buildings, markers, paths, multiSelected, navNodes, navEdges, decorAssets, outdoorNodes, cw, ch, canvasResizeMode, pendingCanvasResize, syncEntranceNodePositions, deleteNavSelection, removeNavNode, removePathJunction, onDeleteBuilding, undoEdit, redoEdit, runSave, pushHistory, campus, onUpdate, switchTool, switchLayer, copyOutdoorSelection, pasteOutdoorSelection, duplicateOutdoorSelection, copyOutdoorNavSelection, pasteOutdoorNavSelection, duplicateOutdoorNavSelection, pathMemberEditId, exitPathMemberEditToNetwork]);

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
    const normalizedAsset = isDecorAreaType(asset.type)
      ? { ...asset, width: asset.width ?? DECOR_ASSET_MAP[asset.type]?.defaultWidth, height: asset.height ?? DECOR_ASSET_MAP[asset.type]?.defaultHeight, groundType: asset.groundType ?? groundTypeForDecorType(asset.type), zOrder: -1000 }
      : { ...asset, scale: asset.scale ?? lastDecorScalesRef.current[asset.type] ?? 0.82 };
    const placedAsset = constrainDecorAssetToCanvas(normalizedAsset, cw, ch);
    pushHistory();
    onUpdate({ ...campus, decorAssets: [...decorAssets, placedAsset] });
    toast.success("Asset placed", `Drag to reposition on the canvas.`);
  }, [campus, cw, ch, decorAssets, pushHistory, onUpdate, toast]);

  // If we have multi-selected items, clear single selection for property panel
  const effectiveSelected = multiSelected.length > 0 ? null : selected;
  const selBldg = effectiveSelected?.type === "building" ? buildings.find((b) => b.id === effectiveSelected.id) : undefined;
  const selEntranceParent = effectiveSelected?.type === "entrance" ? buildings.find((b) => b.id === effectiveSelected.buildingId) : undefined;
  const selEntrance = effectiveSelected?.type === "entrance" ? selEntranceParent?.entrances?.find((entrance) => entrance.id === effectiveSelected.id) : undefined;
  const selectedEntranceLinkStatus = selEntrance && selEntranceParent
    ? entranceIndoorLinkStatus(campus, selEntranceParent.id, selEntrance.id)
    : undefined;
  const selectedEntranceOutdoorStatus = selEntrance && selEntranceParent
    ? entranceOutdoorLinkStatus(campus, selEntranceParent.id, selEntrance.id)
    : undefined;
  const selectedEntranceDoorOptions = selEntrance && selEntranceParent
    ? indoorDoorOptionsForEntrance(campus, selEntranceParent.id, selEntrance.id)
    : [];
  const selPath = effectiveSelected?.type === "path" ? paths.find((path) => path.id === effectiveSelected.id) : undefined;
  const pathNavigationLegacy = !!selPath && pathwayHasLegacyNavigationChain(selPath, navNodes, navEdges);
  const selMkr = (effectiveSelected?.type === "marker" || effectiveSelected?.type === "gate")
    ? markers.find((m) => m.id === effectiveSelected.id)
    : undefined;
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
    // A generated Ground Stair Exit has a dedicated inspector readiness row.
    // Do not also feed its generic graph validator rows into ObjectIssueSection:
    // that would repeat the same missing outdoor connection in several cards.
    if (type === "navNode") {
      const node = navNodes.find((candidate) => candidate.id === effectiveSelected.id);
      if (node?.exteriorEmergencyStairId && !node.floorId) return [];
    }
    let issues: ValidationIssue[];
    if (type === "building") {
      // A blocked indoor connection belongs to the specific Walking Path, not
      // to the containing Building. Keep the global issue targeted to that
      // edge so Building Properties never shows an unlocatable warning.
      issues = validationIssuesForBuilding(validationIssues, effectiveSelected.id)
        .filter((issue) => issue.type !== "nav_edge_blocked_by_obstacle");
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
  }, [effectiveSelected, validationIssues, buildings, navNodes]);
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

  const disconnectEntranceFromWalkingNetwork = useCallback((buildingId: string, entranceId: string) => {
    const next = removeEntranceOutdoorConnection(campus, buildingId, entranceId);
    if (next === campus) return;
    pushHistory();
    onUpdate(next);
    toast.success("Outdoor connection removed", "The Entrance and indoor Door connection were preserved.");
  }, [campus, onUpdate, pushHistory, toast]);

  const selectEntranceWalkingConnection = useCallback((buildingId: string, entranceId: string) => {
    const edge = findEntranceOutdoorConnection(campus.navNodes ?? [], campus.navEdges ?? [], buildingId, entranceId);
    if (!edge) return;
    setMultiSelected([]);
    setSelected({ type: "navEdge", id: edge.id });
    setLayer("navigation");
    setShowCampusNavOverlay(true);
  }, [campus.navEdges, campus.navNodes]);

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
            : tool === "path" || tool === "connect" || tool === "building" || tool === "marker" || tool === "room" || tool === "gate" || tool === "decor"
              ? "crosshair"
              : "default";

  const isUnifiedCampusWorkspace = layer === "campus" || layer === "navigation";
  const navigationVisible = showCampusNavOverlay && layer !== "events";

  // ── Tool config for compact palette — contextual per active layer ──
  // Campus + Navigation share this one canonical rail. LAYER_TOOLS remains
  // available for legacy shortcuts and the separate Events workspace, but is
  // never rendered alongside the unified Campus tool list.
  const layerTools = LAYER_TOOLS[layer] ?? LAYER_TOOLS.campus;
  const toolConfig: UnifiedCampusTool[] = isUnifiedCampusWorkspace
    ? UNIFIED_CAMPUS_TOOLS
    : layerTools.map((t) => ({
        key: `${layer}-${t.id}`,
        id: t.id as SimpleTool,
        icon: t.icon,
        label: t.label,
        shortcut: t.key,
        hint: t.hint,
        domain: "context" as const,
      }));

  const activateToolbarTool = (descriptor: UnifiedCampusTool) => {
    if (descriptor.domain === "navigation") {
      const wasHidden = !navigationVisible;
      if (layer !== "navigation") switchLayer("navigation", Boolean(pathMemberEditId));
      switchTool(descriptor.id);
      if (wasHidden) {
        setShowCampusNavOverlay(true);
        toast.info("Navigation shown", "Walking Points and walking paths are now visible.");
      }
      return;
    }
    if (descriptor.domain === "physical") {
      if (layer !== "campus") switchLayer("campus");
      switchTool(descriptor.id);
      setPathSettingsOpen(descriptor.key === "pathway");
      return;
    }
    if (descriptor.domain === "shared") {
      const targetLayer: EditorLayer = navigationVisible ? "navigation" : "campus";
      if (layer !== targetLayer) switchLayer(targetLayer);
    }
    switchTool(descriptor.id);
  };

  const toggleCampusNavigation = () => {
    const preservePathEdit = Boolean(pathMemberEditId && selected?.type === "path" && selected.id === pathMemberEditId);
    if (navigationVisible) {
      setShowCampusNavOverlay(false);
      // Navigation owns the Test Route overlay.  Turning it off from either
      // editor therefore closes the panel/session and clears every transient
      // pick/preview value instead of leaving a stale route layer behind.
      if (testNavOpen || routePreview) {
        setTestNavOpen(false);
        setHighlightedRoute(null);
        testRouteSessionContext.setSession(null);
        setTestRouteCompact(false);
        setTestRoutePickKind(null);
        setTestRoutePickHover(null);
        setTestRouteMapPick(null);
      }
      if (layer === "navigation") switchLayer("campus", preservePathEdit);
      else switchTool("select");
      return;
    }
    setShowCampusNavOverlay(true);
    if (layer !== "navigation") switchLayer("navigation", preservePathEdit);
    else switchTool("select");
    toast.info("Navigation shown", "Walking Points and walking paths are now visible.");
  };

  const connectEntranceToWalkingNetwork = useCallback((buildingId: string, entranceId: string) => {
    const parent = buildings.find((building) => building.id === buildingId);
    const entrance = parent?.entrances?.find((item) => item.id === entranceId);
    if (!parent || !entrance) return;
    const position = entranceWorldPosition(parent, entrance);
    cancelConnectPreviewFrame();

    // Reuse the existing safe entrance-node + Connect workflow. This does not
    // infer nearby Pathways or create an automatic proximity edge.
    if (layer !== "navigation") switchLayer("navigation");
    switchTool("connect");
    setShowCampusNavOverlay(true);
    const nodeId = ensureEntranceNavNode(buildingId, entranceId, position.x, position.y);
    if (!nodeId) return;
    setNavConnectStart(nodeId);
    setNavPreview({ x: position.x, y: position.y });
    setNavPreviewPins([]);
    navConnectBendGroupsRef.current = [];
    // Keep the physical Entrance as the active object while Connect mode is
    // armed. The canonical graph node is an internal anchor, not a competing
    // Walking Point that should take over Entrance Properties.
    setSelected({ type: "entrance", id: entranceId, buildingId });
    setNavEntranceHover(null);
    showConnectGuidance();
  }, [buildings, cancelConnectPreviewFrame, ensureEntranceNavNode, layer, showConnectGuidance, switchLayer, switchTool]);

  const toggleTestRoute = () => {
    if (testNavOpen) {
      setTestNavOpen(false);
      setHighlightedRoute(null);
      testRouteSessionContext.setSession(null);
      setTestRouteCompact(false);
      setTestRoutePickKind(null);
      setTestRoutePickHover(null);
      setTestRouteMapPick(null);
      return;
    }
    const wasHidden = !navigationVisible;
    if (layer !== "navigation") switchLayer("navigation");
    switchTool("select");
    setTestNavOpen(true);
    if (wasHidden) toast.info("Navigation shown", "Walking Points and walking paths are now visible.");
  };

  const toolbarToolIsActive = (descriptor: UnifiedCampusTool) => {
    if (tool !== descriptor.id) return false;
    if (descriptor.domain === "physical") return layer === "campus";
    if (descriptor.domain === "navigation") return layer === "navigation";
    return true;
  };

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
      <div className="editor-toolbar-container shrink-0 bg-card border-b border-border" style={campus.themeColor ? { borderBottomColor: campus.themeColor, borderBottomWidth: '2px' } : undefined}>
        {/* Row 1: grouped toolbar — keep the editing palette centered while
            reserving predictable breathing room for lifecycle actions. */}
        <div
          className="editor-toolbar-shell relative grid h-16 min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] items-center gap-1 overflow-visible px-2 sm:gap-2 sm:px-4"
          data-testid="campus-editor-header"
        >
          {/* ── Left section — campus context, capped width for center alignment ── */}
          <div data-testid="campus-toolbar-left" className="flex min-w-0 max-w-full items-center gap-1 overflow-hidden overscroll-contain">
            <ToolbarTooltip tool="back" label="Back" shortcut="" hint="Return to the campus list.">
              <button onClick={handleBack}
                aria-label="Back to campus list"
                title="Back to campus list"
                className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0 group"
              >
                <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
              </button>
            </ToolbarTooltip>
            <span className="text-sm font-extrabold text-foreground truncate max-w-[100px] flex items-center gap-1" style={{ fontFamily: "var(--font-sans)" }}>
              {campus.themeColor && (
                <span className="w-3 h-3 rounded shrink-0 inline-block" style={{ backgroundColor: campus.themeColor }} />
              )}
              {campus.name}
            </span>
            <span className={cn("text-[8px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 hidden sm:flex items-center gap-1",
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

            <ToolbarTooltip tool="events" label="Events" shortcut="" hint="Manage campus events and temporary restrictions.">
              <button
                type="button"
                onClick={() => switchLayer(layer === "events" ? "campus" : "events")}
                aria-label="Events"
                aria-pressed={layer === "events"}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-bold transition-colors duration-200",
                  layer === "events"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    : "border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Star className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Events</span>
              </button>
            </ToolbarTooltip>

            {/* Drawing path indicator */}
            {drawingPath.length > 0 && (
              <div className="flex items-center gap-1 px-1.5 h-5 rounded-md border text-[9px] font-semibold shrink-0"
                style={{ background: "color-mix(in srgb,var(--accent) 10%,transparent)", borderColor: "color-mix(in srgb,var(--accent) 30%,transparent)", color: "var(--accent)" }}>
                {drawingPath.length} pts
                <button onClick={() => setDP([])} className="hover:opacity-70"><X className="h-2 w-2" /></button>
              </div>
            )}

          </div>

          {/* ── Center: Tool palette — visually centered over canvas ── */}
          <div data-testid="campus-toolbar-center" className="relative flex h-full min-w-0 max-w-full items-center justify-center overflow-hidden">
            <div
              data-testid="editor-toolbar"
                className="mx-auto flex min-w-0 max-w-full items-center gap-0.5 overflow-hidden whitespace-nowrap rounded-xl border border-border/70 bg-muted/40 px-1.5 py-1 shadow-sm sm:gap-1 sm:px-2 lg:px-3 lg:py-1.5"
            >
              {toolConfig.map((t) => {
                const isActive = toolbarToolIsActive(t);
                const isMutedNavigationTool = t.domain === "navigation" && !navigationVisible;
                return (
                  <Fragment key={t.key}>
                    {t.dividerBefore && <div className="mx-1.5 h-5 w-px shrink-0 bg-border/70" />}
                    <div className="relative flex shrink-0">
                      <ToolbarTooltip tool={t.id} label={t.label} shortcut={t.shortcut} hint={t.hint} isActive={isActive}>
                        <button
                          aria-label={t.label}
                          onClick={() => activateToolbarTool(t)}
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-md transition-colors duration-200 sm:h-[30px] sm:w-[30px] lg:h-[34px] lg:w-[34px]",
                            isActive
                              ? t.id === "erase"
                                ? "bg-destructive text-destructive-foreground shadow-sm"
                                : "bg-primary text-primary-foreground shadow-sm"
                              : t.id === "erase"
                                ? isMutedNavigationTool
                                  ? "text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
                                  : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                : isMutedNavigationTool
                                  ? "text-muted-foreground/50 hover:bg-muted hover:text-foreground"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <t.icon className="h-[15px] w-[15px]" />
                        </button>
                      </ToolbarTooltip>

                      {t.key === "pathway" && (
                        <AnimatePresence>
                          {pathSettingsOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -4, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -4, scale: 0.98 }}
                              transition={{ duration: 0.16, ease: "easeOut" }}
                              className="pointer-events-auto absolute left-1/2 top-full z-50 mt-2 w-64 max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-xl"
                              onMouseDown={(event) => event.stopPropagation()}
                            >
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-foreground">Pathway</span>
                                <button
                                  type="button"
                                  onClick={() => setPathSettingsOpen(false)}
                                  aria-label="Close Pathway settings"
                                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>

                              <div className="space-y-2.5">
                                <div>
                                  <div className="mb-1 text-[9px] font-bold text-muted-foreground">Type</div>
                                  <div className="grid grid-cols-3 gap-1">
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
                                          "min-h-8 rounded-md border px-1.5 py-1 text-[9px] font-bold leading-tight transition-colors",
                                          pathPaintType === type.value
                                            ? "border-primary/40 bg-primary/10 text-primary"
                                            : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                                        )}
                                      >
                                        {type.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div>
                                  <div className="mb-1 flex items-center justify-between text-[9px] font-bold text-muted-foreground">
                                    <span>Width</span>
                                    <span className="tabular-nums text-foreground">{pathPaintWidth}</span>
                                  </div>
                                  <input
                                    aria-label="Pathway width"
                                    type="range"
                                    min={6}
                                    max={36}
                                    step={2}
                                    value={pathPaintWidth}
                                    onChange={(event) => setPathPaintWidth(Number(event.target.value))}
                                    className="w-full accent-primary"
                                  />
                                </div>

                                <div className="flex items-start gap-1.5 border-t border-border/60 pt-2 text-[9px] leading-snug text-muted-foreground">
                                  <Route className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                                  <span>Drag on the canvas to draw a path.</span>
                                  <HelpCircle
                                    className="mt-0.5 h-3 w-3 shrink-0"
                                  />
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      )}
                    </div>
                  </Fragment>
                );
              })}
              {isUnifiedCampusWorkspace && (
                <>
                  <ToolbarTooltip
                    tool="navigationVisibility"
                    label={navigationVisible ? "Hide Navigation" : "Show Navigation"}
                    shortcut=""
                    hint={navigationVisible ? "Hide the walking network and return focus to the physical campus." : "Show and edit Walking Points and Walking Paths."}
                    isActive={navigationVisible}
                  >
                    <button
                      type="button"
                      onClick={toggleCampusNavigation}
                      aria-label={navigationVisible ? "Hide the walking network" : "Show and edit the walking network"}
                      aria-pressed={navigationVisible}
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-md border transition-colors duration-200 sm:h-[30px] sm:w-[30px] lg:h-[34px] lg:w-[34px]",
                        navigationVisible
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm"
                          : "border-border/60 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {navigationVisible ? <EyeOff className="h-[15px] w-[15px]" /> : <Eye className="h-[15px] w-[15px]" />}
                    </button>
                  </ToolbarTooltip>
                  <div className="mx-1.5 h-5 w-px shrink-0 bg-border/70" />
                  <ToolbarTooltip
                    tool="path"
                    label="Test Route"
                    shortcut=""
                    hint="Choose a start and destination to check whether the walking network can produce a valid route."
                    isActive={testNavOpen}
                  >
                    <button
                      aria-label="Test Route"
                      onClick={toggleTestRoute}
                      aria-pressed={testNavOpen}
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-md border transition-colors duration-200 sm:h-[30px] sm:w-[30px] lg:h-[34px] lg:w-[34px]",
                        testNavOpen
                          ? "border-blue-500/40 bg-blue-500/15 text-blue-600 dark:text-blue-400 shadow-sm"
                          : navigationVisible
                            ? "border-border/70 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                            : "border-border/60 text-muted-foreground/50 hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400"
                      )}
                    >
                      <Route className="h-[15px] w-[15px]" />
                    </button>
                  </ToolbarTooltip>
                </>
              )}
            </div>

            <AnimatePresence>
              {navigationVisible && layer === "navigation" && tool === "connect" && (
                <motion.div
                  key={navConnectStart ? "connect-destination-hint" : "connect-start-hint"}
                  data-testid="nav-path-status"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="pointer-events-none absolute left-1/2 top-1/2 z-50 mt-[29px] -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-[10px] font-semibold text-popover-foreground shadow-md"
                >
                  {navConnectStart
                    ? "Now select a destination Walking Point or Pathway. Esc to cancel."
                    : "Select or place a start point."}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Right section — grouped: history | view | editor | save/publish ── */}
          <div data-testid="campus-toolbar-right" className="flex min-h-0 min-w-0 max-w-full items-center justify-self-end gap-1 overflow-visible whitespace-nowrap pr-0.5 sm:gap-1.5 sm:pr-1">
            {/* Undo / Redo — disabled at history bounds with step-count tooltips */}
            <div className="flex items-center gap-0.5">
              <ToolbarTooltip tool="undo" label="Undo" shortcut="Ctrl + Z" hint="Reverse your most recent editor change.">
                <button onClick={undoEdit}
                  aria-label="Undo"
                  title={canUndo ? "Undo" : undefined}
                  disabled={!canUndo}
                  className={cn(
                    "flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-md transition-all",
                    canUndo ? "text-muted-foreground hover:text-foreground hover:bg-muted" : "text-muted-foreground/30 cursor-not-allowed"
                  )}>
                  <Undo2 className="h-4 w-4" />
                </button>
              </ToolbarTooltip>
              <ToolbarTooltip tool="redo" label="Redo" shortcut="Ctrl + Shift + Z" hint="Restore the most recently undone change.">
                <button onClick={redoEdit}
                  aria-label="Redo"
                  title={canRedo ? "Redo" : undefined}
                  disabled={!canRedo}
                  className={cn(
                    "flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-md transition-all",
                    canRedo ? "text-muted-foreground hover:text-foreground hover:bg-muted" : "text-muted-foreground/30 cursor-not-allowed"
                  )}>
                  <Redo2 className="h-4 w-4" />
                </button>
              </ToolbarTooltip>
            </div>

            {/* Snap & zoom controls */}
            <div data-toolbar-secondary-divider className="w-px h-5 bg-border mx-0.5 shrink-0" />
            <div className="hidden xl:flex items-center gap-0.5" data-toolbar-secondary>
              <ToolbarTooltip tool="gridSnap" label="Grid Snap" shortcut="Ctrl + G" hint={snapGrid ? "Objects snap to the canvas grid while you place or move them." : "Grid snapping is off. Objects can move freely."}>
                <button
                  onClick={() => setSnapGrid(v => !v)}
                  aria-label="Grid Snap"
                  aria-pressed={snapGrid}
                  className={cn(
                    "flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-md transition-all",
                    snapGrid ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Grid3X3 className="h-4 w-4" />
                </button>
              </ToolbarTooltip>
              <ToolbarTooltip tool="edgeSnap" label="Edge Snap" shortcut="" hint={edgeSnap ? "Helps align objects and path points with nearby edges." : "Edge snapping is off."}>
                <button
                  onClick={() => setEdgeSnap(v => !v)}
                  aria-label="Edge Snap"
                  aria-pressed={edgeSnap}
                  className={cn(
                    "flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-md transition-all",
                    edgeSnap ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Magnet className="h-4 w-4" />
                </button>
              </ToolbarTooltip>
              <div className="w-px h-5 bg-border mx-0.5" />
              <ToolbarTooltip tool="zoomIn" label="Zoom In" shortcut="" hint="Zoom closer into the canvas.">
                <button onClick={zoomIn}
                  aria-label="Zoom In"
                  className="flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                  <ZoomIn className="h-4 w-4" />
                </button>
              </ToolbarTooltip>
              <span className="text-[9px] font-mono text-muted-foreground/50 w-8 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
              <ToolbarTooltip tool="zoomOut" label="Zoom Out" shortcut="" hint="Zoom farther out from the canvas.">
                <button onClick={zoomOut}
                  aria-label="Zoom Out"
                  className="flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                  <ZoomOut className="h-4 w-4" />
                </button>
              </ToolbarTooltip>
              <ToolbarTooltip tool="resetView" label="Reset View" shortcut="0" hint="Return the canvas to its default zoom and position.">
                <button onClick={resetView}
                  aria-label="Reset View"
                  className="flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </ToolbarTooltip>
            </div>

            <div data-toolbar-secondary-divider className="w-px h-5 bg-border mx-0.5 shrink-0" />
            <div ref={canvasSettingsTriggerRef} className="relative flex shrink-0">
              <ToolbarTooltip tool="canvasSettings" label="Canvas Settings" shortcut="" hint="Adjust canvas display and editing preferences.">
                <button
                  type="button"
                  onClick={() => {
                    if (canvasSettingsPopoverOpen) {
                      setCanvasSettingsPopoverOpen(false);
                      return;
                    }
                    const rect = canvasSettingsTriggerRef.current?.getBoundingClientRect();
                    const width = 224;
                    const height = 286;
                    setCanvasSettingsPopoverPosition({
                      left: Math.max(8, Math.min((rect?.right ?? width + 8) - width, window.innerWidth - width - 8)),
                      top: Math.max(8, Math.min((rect?.bottom ?? 0) + 8, window.innerHeight - height - 8)),
                    });
                    setCanvasSettingsPopoverOpen(true);
                  }}
                  aria-label="Canvas Settings"
                  aria-expanded={canvasSettingsPopoverOpen}
                  aria-haspopup="dialog"
                  data-testid="canvas-settings-trigger"
                  className={cn(
                    "flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-md transition-all",
                    canvasSettingsPopoverOpen ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <Settings2 className="h-4 w-4" />
                </button>
              </ToolbarTooltip>
            </div>
            {canvasSettingsPopoverOpen && createPortal(
                <div
                  ref={canvasSettingsPopoverRef}
                  role="dialog"
                  aria-label="Canvas Settings"
                  data-testid="canvas-settings-popover"
                  className="fixed z-[100] w-56 overflow-hidden rounded-xl border border-border/70 bg-popover shadow-xl"
                  style={{ left: canvasSettingsPopoverPosition.left, top: canvasSettingsPopoverPosition.top }}
                >
                  <div className="border-b border-border/60 px-3 py-2">
                    <p className="text-[10px] font-extrabold uppercase tracking-wide text-foreground">Canvas Settings</p>
                    <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">Display and placement preferences</p>
                  </div>
                  <div className="space-y-2 p-2.5">
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/45 px-2 py-1.5">
                      <span className="text-[10px] font-semibold text-foreground">Grid snap</span>
                      <button type="button" onClick={() => setSnapGrid((value) => !value)} aria-pressed={snapGrid} className={cn("rounded-md border px-2 py-1 text-[9px] font-bold transition-colors", snapGrid ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>{snapGrid ? "On" : "Off"}</button>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/45 px-2 py-1.5">
                      <span className="text-[10px] font-semibold text-foreground">Edge snap</span>
                      <button type="button" onClick={() => setEdgeSnap((value) => !value)} aria-pressed={edgeSnap} className={cn("rounded-md border px-2 py-1 text-[9px] font-bold transition-colors", edgeSnap ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>{edgeSnap ? "On" : "Off"}</button>
                    </div>
                    <div className="rounded-lg bg-muted/45 px-2 py-1.5">
                      <div className="mb-1.5 flex items-center justify-between"><span className="text-[10px] font-semibold text-foreground">Grid size</span><span className="text-[9px] tabular-nums text-muted-foreground">{campus.gridSize ?? 20}</span></div>
                      <div className="grid grid-cols-3 gap-1">{[10, 20, 40].map((size) => <button key={size} type="button" onClick={() => onUpdate({ ...campus, gridSize: size })} className={cn("h-6 rounded-md border text-[9px] font-bold transition-colors", (campus.gridSize ?? 20) === size ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background/60 text-muted-foreground hover:bg-muted")}>{size}</button>)}</div>
                    </div>
                    <button type="button" onClick={() => {
                      if (canvasResizeMode) {
                        canvasResizeRef.current = null;
                        canvasResizeOriginalRef.current = null;
                        setPendingCanvasResize(null);
                        setCanvasResizePreview(null);
                        setCanvasResizeMode(false);
                        setGuides([]);
                      } else {
                        canvasResizeOriginalRef.current = { width: cw, height: ch };
                        setCanvasResizeMode(true);
                      }
                      setCanvasSettingsPopoverOpen(false);
                    }} className={cn("flex h-7 w-full items-center justify-center rounded-md border text-[9px] font-bold transition-colors", canvasResizeMode ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground")}>
                      {canvasResizeMode ? "Exit canvas resize" : "Resize on canvas"}
                    </button>
                    {onOpenCanvasSettings && <button type="button" onClick={() => { setCanvasSettingsPopoverOpen(false); onOpenCanvasSettings(); }} className="flex h-7 w-full items-center justify-center rounded-md border border-border text-[9px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">More canvas settings…</button>}
                  </div>
                </div>
              , document.body)}
            <ToolbarTooltip tool="keyboardShortcuts" label="Keyboard Shortcuts" shortcut="?" hint="View the available keyboard controls for the Map Builder.">
              <button
                onClick={() => setShowCheatSheet(true)}
                className="flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                aria-label="Keyboard shortcuts"
              >
                <Keyboard className="h-4 w-4" />
              </button>
            </ToolbarTooltip>

            <div className="w-px h-5 bg-border mx-0.5 shrink-0" />
            <div className="flex items-center gap-1 sm:gap-2">
              <ToolbarTooltip
                tool="save"
                label="Save"
                shortcut="Ctrl + S"
                hint={isDirty ? "Save your current draft changes." : "Your current draft is saved."}
              >
                <button
                  onClick={runSave}
                  aria-label="Save"
                  disabled={saving || isProcessing || !isDirty}
                  className={cn(
                    "flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-md border text-[10px] font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0",
                    isDirty ? "border-primary text-primary bg-primary/10" : "border-border text-foreground hover:bg-muted"
                  )}
                >
                  {saving ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="hidden sm:inline">Saving</span></>
                  ) : (
                    <><MapIcon className="h-3.5 w-3.5" /> <span data-toolbar-lifecycle-label className="hidden xl:inline">{isDirty ? "Save" : "Saved"}</span></>
                  )}
                </button>
              </ToolbarTooltip>

              <ToolbarTooltip
                tool="reviewPublish"
                label="Review & Publish"
                shortcut=""
                hint={
                  !publishingEnabled
                    ? "Publishing is currently unavailable."
                    : onPreviewStudent
                    ? isDirty
                      ? "Save and review the student view before publishing."
                      : "Review the saved campus as students will see it before publishing."
                    : isDirty
                    ? "Save your latest changes before publishing."
                    : campus.publishStatus === "published" && !hasDraftChanges && campus.updatedAt === campus.publishedAt
                      ? "Make and save a new change before publishing again."
                    : "Review the saved campus as students will see it, then publish it."
                }
              >
                <button
                  onClick={() => {
                    if (isProcessing) return;
                    if (onPreviewStudent) {
                      onPreviewStudent(campus, isDirty);
                      return;
                    }
                    // B7 Phase 2: PUBLISH gating lives in PrePublishDialog, which
                    // consumes the canonical live validation list and blocks on
                    // errors / requires explicit warning confirmation there —
                    // severity is the source of truth, never a type hard-code.
                    setShowPublishConfirm(true);
                  }}
                  aria-label="Review & Publish"
                  disabled={
                    !publishingEnabled || isProcessing || (isDirty && !onPreviewStudent) ||
                    (!onPreviewStudent && !isDirty && campus.publishStatus === "published" && !hasDraftChanges && campus.updatedAt === campus.publishedAt)
                  }
                  className={cn(
                    "flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-md text-[10px] font-extrabold transition-all shadow-sm shrink-0",
                    !publishingEnabled
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : isProcessing
                      ? "bg-primary/70 text-primary-foreground/70 cursor-not-allowed"
                      : isDirty && !onPreviewStudent
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : !onPreviewStudent && !isDirty && campus.publishStatus === "published" && !hasDraftChanges && campus.updatedAt === campus.publishedAt
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : "bg-primary text-primary-foreground hover:bg-primary/90"
                  )}
                >
                  {isProcessing ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span className="hidden sm:inline">Publishing</span></>
                  ) : (
                    <><Globe className="h-3.5 w-3.5" /> <span data-toolbar-lifecycle-label className="hidden lg:inline">Review &amp; Publish</span><span data-toolbar-lifecycle-label className="hidden sm:inline lg:hidden">Review</span></>
                  )}
                </button>
              </ToolbarTooltip>
            </div>
          </div>
        </div>

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
      <AnimatePresence>
        {pathChoiceMenu && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.16 }}
            className="fixed z-[120] min-w-[190px] rounded-xl border border-border bg-card p-1.5 shadow-xl"
            style={{ left: pathChoiceMenu.x, top: pathChoiceMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="px-2 py-1 text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">{pathChoiceMenu.nodeIds ? "Select Walking Point" : "Select Pathway"}</div>
            {pathChoiceMenu.nodeIds ? pathChoiceMenu.nodeIds.map((nodeId) => {
              const node = outdoorNodes.find((candidate) => candidate.id === nodeId);
              if (!node) return null;
              const label = node.generatedFromPathVertices?.length ? "Generated Walking Point" : (node.name || "Walking Point");
              return (
                <button
                  key={nodeId}
                  type="button"
                  className="flex w-full items-center rounded-lg px-2 py-2 text-left text-[10px] font-semibold text-foreground hover:bg-muted"
                  onClick={() => {
                    if (tool === "connect") {
                      onNavNodeClick(nodeId);
                    } else {
                      setSelected({ type: "navNode", id: nodeId });
                      setMultiSelected([]);
                      setTool("select");
                    }
                    setPathChoiceMenu(null);
                  }}
                >
                  {label}
                </button>
              );
            }) : pathChoiceMenu.pathIds.map((pathId) => (
              <button
                key={pathId}
                type="button"
                className="flex w-full items-center rounded-lg px-2 py-2 text-left text-[10px] font-semibold text-foreground hover:bg-muted"
                onClick={() => {
                  setMultiSelected([]);
                  setShowAlignTools(false);
                  setSelectedPathPoint(null);
                  setPathMemberEditId(null);
                  setSelected({ type: "path", id: pathId });
                  setPathChoiceMenu(null);
                }}
              >
                {paths.find((path) => path.id === pathId)?.name ?? "Pathway"}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

        <div className="flex flex-1 overflow-hidden min-h-0 h-full relative">
        {/* ── Left: Hierarchy Panel (collapsible) ── */}
        <div className="flex h-full min-h-0 items-stretch">
          <div
            className="h-full min-h-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden shrink-0"
            style={{
              width: hierarchyOpen ? 224 : 0,
              opacity: hierarchyOpen ? 1 : 0,
            }}
          >
            <div className="w-56 h-full min-h-0 bg-card border-r border-border flex flex-col">
              <div className="h-full min-h-0 flex-1" data-testid={layer === "navigation" ? "navigation-hierarchy-sidebar" : undefined}>
                  <HierarchyPanel
                    campus={campus}
                    selected={selected}
                    onSelect={handleHierarchySelect}
                    onOpenFloor={requestOpenFloor}
                    onAddBuilding={onAddBuilding}
                    onDeleteBuilding={onDeleteBuilding}
                    onUpdateBuilding={onUpdateBuilding}
                    // Hierarchy operations (including floor/room structure
                    // edits) are not Pathway geometry edits. Publish the
                    // requested domain fields verbatim so a UI interaction
                    // cannot trigger a global outdoor graph reconciliation.
                    onUpdate={(c) => { const next = { ...campus, ...c }; pushHistory(next); onUpdate(next); }}
                    pushHistory={pushHistory}
                    toast={toast}
                    onSelectBuildingType={(type) => {
                      setArmedDecorAssetType(null);
                      setSelectedBuildingType(type);
                      setTool("building");
                      toast.info(`Selected: ${type.label}`, "Click the canvas to place.");
                    }}
                    activeBuildingType={selectedBuildingType?.id}
                    buildingIdentityReservations={defaultBuildingReservationsRef.current?.values}
                    onReserveBuildingIdentity={(identity) => { defaultBuildingReservationsRef.current?.values.push(identity); }}
                    onPlaceDecorAsset={handlePlaceDecorAsset}
                    onArmDecorAsset={(assetType) => {
                      if (layer !== "campus") switchLayer("campus");
                      setSelectedBuildingType(null);
                      setArmedDecorAssetType(assetType);
                      setCursorPos(null);
                      switchTool("decor");
                      toast.info("Asset ready", "Move over the canvas and click to place it.");
                    }}
                    activeDecorAssetType={armedDecorAssetType}
                    onSelectCampusGate={() => {
                      setArmedDecorAssetType(null);
                      if (layer !== "campus") switchLayer("campus");
                      switchTool("gate");
                      toast.info("Campus Gate", "Click the campus canvas to place the gate.");
                    }}
                    activeCampusGatePlacement={tool === "gate" && layer === "campus"}
                    decorAssetCount={(campus.decorAssets ?? []).filter((asset) => asset.type !== "ground-area").length}
                    assetsEnabled={true}
                  />
              </div>
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
          showNavigationOverlay={navigationVisible}
          navConnectStartId={navConnectStart}
          navPreview={navPreview}
          navConnectBends={navConnectBends}
          navPreviewPins={navPreviewPins}
          armedDecorAssetType={armedDecorAssetType}
          armedCampusGatePlacement={tool === "gate" && layer === "campus"}
          navPathTargetHover={navPathTargetHover}
          navEntranceHover={navEntranceHover}
          connectBlocked={connectBlocked}
          navBlockedEdgeIds={outdoorBlockedEdgeIds}
          edgeSnapPreview={waypointEdgeSnap}
          onGroupSurfaceDown={onGroupSurfaceDown}
          onGroupResizeStart={onGroupResizeStart}
          onPathGroupScaleStart={onPathGroupScaleStart}
          onPathGroupRotateStart={onPathGroupRotateStart}
          pathGroupRotationActive={!!pathGroupRotating.current}
          pathGroupRotationBounds={pathGroupRotationBounds}
          pathMemberEditId={pathMemberEditId}
          hoveredPathId={hoveredPathId}
          onPathHover={setHoveredPathId}
          onNavEdgeSelect={(e, id) => {
            e.stopPropagation();
            if (tool === "erase") {
              deleteNavSelection([], [id]);
              return;
            }
            if (tool !== "select") return;
            // Entrance markers are the physical owner of their boundary
            // endpoint.  The navigation edge has a deliberately generous hit
            // target, so resolve a click that is genuinely on the marker back
            // to the Entrance before selecting the connector itself.  Clicking
            // farther along the line still selects the editable connector.
            const clickedEdge = navEdges.find((edge) => edge.id === id);
            const pointer = getPoint(e, cw, ch);
            const entranceEndpoint = clickedEdge
              ? [clickedEdge.startNodeId, clickedEdge.endNodeId]
                .map((nodeId) => outdoorNodes.find((node) => node.id === nodeId))
                .find((node) => {
                  if (!node?.entranceId || node.floorId) return false;
                  const building = buildings.find((candidate) => (candidate.entrances ?? []).some((entrance) => entrance.id === node.entranceId));
                  const entrance = building?.entrances?.find((candidate) => candidate.id === node.entranceId);
                  if (!building || !entrance) return false;
                  const position = entranceWorldPosition(building, entrance);
                  return Math.hypot(pointer.x - position.x, pointer.y - position.y) <= 16;
                })
              : undefined;
            if (entranceEndpoint?.entranceId) {
              const building = buildings.find((candidate) => (candidate.entrances ?? []).some((entrance) => entrance.id === entranceEndpoint.entranceId));
              if (building) {
                setSelected({ type: "entrance", id: entranceEndpoint.entranceId, buildingId: building.id });
                setMultiSelected([]);
                setGuides([]);
                return;
              }
            }
            // B5 Phase 1.6: Shift-click toggles an edge's membership in the
            // multi-selection (same semantics as waypoint shift-click).
            if (e.shiftKey) {
              const base = multiSelected.length > 0 ? multiSelected : selected ? [selected.id] : [];
              const baseSelection = base.length > 0 ? selectionForId(base[0]) : null;
              const baseIsPhysical = baseSelection?.type === "building"
                || baseSelection?.type === "path"
                || baseSelection?.type === "decorAsset"
                || baseSelection?.type === "entrance"
                || baseSelection?.type === "marker";
              if (base.length > 0 && !base.includes(id) && baseIsPhysical) {
                setMultiSelected([]);
                setSelected({ type: "navEdge", id });
                setShowAlignTools(false);
                setGuides([]);
                return;
              }
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
              if (edge && !isPathwayGeneratedEdge(edge)) {
                const pt = getPoint(e, cw, ch);
                // Build full polyline from node positions + bends. Managed
                // Entrance connectors are editable geometry; Pathway-generated
                // edges remain protected by the guard above.
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
          buildingPlacementPreview={selectedBuildingType}
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
          onPathAddPointDragStart={onPathAddPointDragStart}
          onPathWidthDown={onPathWidthDown}
          onNavEdgeBendDown={onNavEdgeBendDown}
          onNavEdgeAddBend={onNavEdgeAddBend}
          onEntranceDown={onEntranceDown}
          exteriorEmergencyStairPreview={exteriorStairPreview}
          onExteriorEmergencyStairDown={(e, buildingId, stairId) => {
            e.stopPropagation();
            if (tool !== "select") return;
            setMultiSelected([]);
            setSelected({ type: "building", id: buildingId });
            setPropertiesDismissed(false);
            setPropertiesOpen(true);
      const ownerBuilding = campusRef.current.buildings.find((candidate) => candidate.id === buildingId);
      const owner = ownerBuilding ? canonicalExteriorEmergencyStairsForBuilding(ownerBuilding).find((stair) => stair.id === stairId) : undefined;
            if (owner) {
              exteriorStairDragging.current = {
                buildingId,
                stairId,
                edge: owner.attachment.edge,
                previewEdge: owner.attachment.edge,
                startEdge: owner.attachment.edge,
                startOffset: owner.attachment.offset,
                currentEdge: owner.attachment.edge,
                currentOffset: owner.attachment.offset,
              };
              gestureChangedRef.current = false;
              gestureHistoryPushed.current = false;
              setExteriorStairPreview(null);
              setGuides([]);
            }
          }}
          onExteriorEmergencyStairFloorNavigate={handleExteriorEmergencyStairFloorNavigate}
          onItemContextMenu={handleContextMenu}
          onResizeStart={handleResizeStart}
          onMarkerResizeStart={handleMarkerResizeStart}
          onRotateStart={handleRotateStart}
          onDecorRotateStart={handleDecorRotateStart}
          onDecorResizeStart={handleDecorResizeStart}
          decorRotatingId={decorRotatingId}
          decorResizingId={decorResizingId}
          markerResizingId={markerResizingId}
          onBuildingDoubleClick={handleBuildingDoubleClick}
          onPathClick={onPathClick}
          onPathDblClick={onPathDblClick}
          onSelect={(selection) => { setSelected(selection); setPropertiesDismissed(false); setPropertiesOpen(Boolean(selection)); }}
          onResetView={resetView}
          onDropAsset={(asset) => {
            const normalizedAsset = isDecorAreaType(asset.type)
              ? { ...asset, width: asset.width ?? DECOR_ASSET_MAP[asset.type]?.defaultWidth, height: asset.height ?? DECOR_ASSET_MAP[asset.type]?.defaultHeight, groundType: asset.groundType ?? groundTypeForDecorType(asset.type), zOrder: -1000 }
              : { ...asset, scale: lastDecorScalesRef.current[asset.type] ?? 0.82 };
            const placedAsset = constrainDecorAssetToCanvas(normalizedAsset, cw, ch);
            pushHistory();
            onUpdate({ ...campus, decorAssets: [...decorAssets, placedAsset] });
            toast.success("Asset placed", `${DECOR_ASSET_MAP[placedAsset.type]?.label || placedAsset.type} dropped on canvas.`);
          }}
          onDropCampusGate={(x, y) => placeCampusGate(x, y)}
          onDropBuilding={(type, x, y) => {
            const bldgType = BUILDING_TYPE_MAP[type];
            if (!bldgType) return;
            const buildingId = genId("bld");
            const identity = nextDefaultBuildingIdentity(buildings, defaultBuildingReservationsRef.current?.values);
            defaultBuildingReservationsRef.current?.values.push(identity);
            const rawBuilding: CampusBuilding = {
              id: buildingId,
              name: identity.name,
              code: identity.code,
              category: bldgType.category,
              description: bldgType.description,
              x: Math.round(x - bldgType.defaultWidth / 2),
              y: Math.round(y - bldgType.defaultHeight / 2),
              width: bldgType.defaultWidth,
              height: bldgType.defaultHeight,
              color: bldgType.color,
              expanded: false,
              floors: [createDefaultFloor({ id: genId("fl"), buildingId, number: 1 })],
            };
            const fittedBuilding = fitBuildingRectToCanvas(rawBuilding, cw, ch);
            const placementDelta = clampMemberTranslation(
              { kind: "building", id: fittedBuilding.id, x: fittedBuilding.x, y: fittedBuilding.y, width: fittedBuilding.width, height: fittedBuilding.height },
              0,
              0,
              cw,
              ch,
              CAMPUS_OBJECT_SAFE_INSET,
            );
            const nb: CampusBuilding = { ...fittedBuilding, x: Math.round(fittedBuilding.x + placementDelta.dx), y: Math.round(fittedBuilding.y + placementDelta.dy) };
            pushHistory();
            updBuildings([...buildings, nb]);
            setSelected({ type: "building", id: nb.id });
            toast.success("Building placed", `${bldgType.label} dropped on canvas.`);
          }}
          canvasW={canvasResizePreview?.width ?? cw}
          canvasH={canvasResizePreview?.height ?? ch}
          canvasResizeMode={canvasResizeMode}
          canvasResizeInvalid={pendingCanvasResizeClips}
          onCanvasResizeStart={handleCanvasResizeStart}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onSetTool={setTool}
          onToggleSnap={() => setSnapGrid((v) => !v)}
          onWheel={handleWheel}
          highlightedRoute={highlightedRoute}
          routePreview={routePreview}
          onRouteTransitionClick={handleTestRouteTransition}
          testRoutePickKind={testRoutePickKind}
          testRoutePickHover={testRoutePickHover}
          onTestRoutePickHover={setTestRoutePickHover}
          animatingPathId={animatingPathId}
          issueMarkers={routePreview ? [] : campusMarkerLayer}
        />

        {pendingCanvasResize && createPortal(
          <div className="pointer-events-none fixed inset-0 z-[140]" data-testid="canvas-resize-confirmation">
            <div className="pointer-events-auto absolute bottom-5 left-1/2 w-[min(92vw,380px)] -translate-x-1/2 rounded-2xl border border-amber-200 bg-card/95 p-4 shadow-2xl backdrop-blur dark:border-amber-800/40">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600"><AlertTriangle className="h-4 w-4" /></div>
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold text-foreground">Resize canvas?</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Review the proposed canvas size before applying. Nothing will be moved or deleted.</p>
                  {pendingCanvasResizeClips
                    ? <p className="mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Some authored content extends beyond this size. Increase the canvas or fit content before applying.</p>
                    : <p className="mt-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">All authored content fits inside this proposed canvas.</p>}
                  <p className="mt-1 text-[10px] font-mono text-muted-foreground/70">{pendingCanvasResize.width} × {pendingCanvasResize.height}px</p>
                </div>
              </div>
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={() => { setPendingCanvasResize(null); setCanvasResizePreview(null); canvasResizeOriginalRef.current = null; canvasResizeRef.current = null; setCanvasResizeMode(true); setGuides([]); }} className="flex-1 rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted">Cancel</button>
                <button type="button" disabled={pendingCanvasResizeClips} onClick={() => { if (pendingCanvasResizeClips) return; const next = { ...campus, canvasW: pendingCanvasResize.width, canvasH: pendingCanvasResize.height }; campusRef.current = next; onUpdate(next); pushHistory(next); setPendingCanvasResize(null); setCanvasResizePreview(null); canvasResizeOriginalRef.current = null; setCanvasResizeMode(true); }} className="flex-1 rounded-xl bg-primary px-3 py-2 text-xs font-extrabold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45">{pendingCanvasResizeClips ? "Resize blocked" : "Apply resize"}</button>
              </div>
            </div>
          </div>,
          document.body,
        )}

        {/* B7 Correction: locate flash overlay removed — locate behavior now
            relies on object selection, Properties sidebar, and contextual
            "Needs attention" section for a precise, non-misaligned result. */}
        {null}

        {/* PART 3: Test Route — floating utility card over the canvas.
            Always positioned absolute so it never steals canvas layout space.
            Right offset dynamically accounts for the Properties sidebar (248px) when open. */}
        <AnimatePresence initial={false}>
          {navigationVisible && testNavOpen && (
            <>
              {testRoutePickKind && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 rounded-full border border-violet-300 bg-card/95 px-3 py-1.5 text-[10px] font-bold text-violet-700 shadow-lg pointer-events-none">
                  {testRoutePickKind === "start" ? "Select a starting location · Esc to cancel" : "Select a destination · Esc to cancel"}
                </div>
              )}
              {/* Desktop: floating card — absolute inside the canvas wrapper */}
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 350, damping: 32 }}
                className={cn(
                  "absolute top-3 z-30 hidden lg:block",
                  testRouteCompact
                    ? "h-auto max-h-none w-[420px] overflow-visible"
                    : "h-[min(620px,calc(100%-24px))] max-h-[calc(100%-24px)] w-80 overflow-hidden rounded-xl border border-border",
                )}
                style={{
                  background: testRouteCompact ? "transparent" : "var(--card)",
                  boxShadow: testRouteCompact ? "none" : "0 8px 30px rgba(0,0,0,0.12)",
                  left: "auto",
                  bottom: "auto",
                  right: inspectorVisible ? "260px" : "12px",
                  transformOrigin: "top right",
                  width: testRouteCompact ? "min(420px, calc(100% - 24px))" : "320px",
                  height: testRouteCompact ? "auto" : undefined,
                  transition: "right 180ms cubic-bezier(0.16, 1, 0.3, 1), width 160ms cubic-bezier(0.16, 1, 0.3, 1), height 160ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                <TestNavigationPanel
                  campus={campus}
                  onHighlightRoute={(route) => setHighlightedRoute(route)}
                  inspectorVisible={inspectorVisible}
                  onCompactModeChange={setTestRouteCompact}
                  onPickOnMap={(kind) => { setTestRoutePickKind(kind); setTestRoutePickHover(null); }}
                  // The desktop variant is the sole map-pick result consumer;
                  // the responsive mobile view hydrates from the shared session.
                  mapPickResult={testRouteMapPick}
                  onMapPickResultConsumed={() => setTestRouteMapPick(null)}
                  currentContext={{ kind: "outdoor" }}
                  onFocusNode={(nodeId) => {
                    const n = (campus.navNodes ?? []).find((x) => x.id === nodeId);
                    if (n) zoomToBuilding(n.x - 30, n.y - 30, 60, 60);
                  }}
                  onRouteStartFocus={(nodeId, context) => {
                    if (context.kind === "floor" && context.buildingId && context.floorId) {
                      requestOpenFloor(context.buildingId, context.floorId);
                      return;
                    }
                    const n = (campus.navNodes ?? []).find((x) => x.id === nodeId);
                    if (n) zoomToBuilding(n.x - 110, n.y - 90, 220, 180);
                  }}
                  onClose={() => { setTestNavOpen(false); testRouteSessionContext.setSession(null); setTestRouteCompact(false); setHighlightedRoute(null); setTestRoutePickKind(null); setTestRoutePickHover(null); setTestRouteMapPick(null); }}
                />
              </motion.div>
              {/* Narrow: bottom-sheet overlay */}
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40 }}
                transition={{ type: "spring", stiffness: 350, damping: 32 }}
                className={cn(
                    "absolute z-40 lg:hidden",
                  testRouteCompact
                    ? "top-3 right-3 bottom-auto left-auto h-auto w-[380px] max-w-[calc(100%-24px)] overflow-visible"
                    : "bottom-0 left-0 right-0 h-[50%] overflow-hidden rounded-t-xl border-t border-border",
                )}
                style={{
                  background: testRouteCompact ? "transparent" : "var(--card)",
                  boxShadow: testRouteCompact ? "none" : "0 -4px 20px rgba(0,0,0,0.12)",
                  transition: "height 160ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                <TestNavigationPanel
                  campus={campus}
                  onHighlightRoute={(route) => setHighlightedRoute(route)}
                  onCompactModeChange={setTestRouteCompact}
                  onPickOnMap={(kind) => { setTestRoutePickKind(kind); setTestRoutePickHover(null); }}
                  mapPickResult={null}
                  currentContext={{ kind: "outdoor" }}
                  onFocusNode={(nodeId) => {
                    const n = (campus.navNodes ?? []).find((x) => x.id === nodeId);
                    if (n) zoomToBuilding(n.x - 30, n.y - 30, 60, 60);
                  }}
                  onRouteStartFocus={(nodeId, context) => {
                    if (context.kind === "floor" && context.buildingId && context.floorId) {
                      requestOpenFloor(context.buildingId, context.floorId);
                      return;
                    }
                    const n = (campus.navNodes ?? []).find((x) => x.id === nodeId);
                    if (n) zoomToBuilding(n.x - 110, n.y - 90, 220, 180);
                  }}
                  onClose={() => { setTestNavOpen(false); testRouteSessionContext.setSession(null); setTestRouteCompact(false); setHighlightedRoute(null); setTestRoutePickKind(null); setTestRoutePickHover(null); setTestRouteMapPick(null); }}
                />
              </motion.div>
            </>
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

        {/* ── Routes Panel (Navigation layer) — only when explicitly opened ── */}
        {layer === "navigation" && showRoutesPanel && (
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
          open={inspectorVisible}
          selected={selected}
          issueItems={selectedIssueItems}
          selBldg={selBldg}
          selEntrance={selEntrance}
          selEntranceParent={selEntranceParent}
          selMkr={selMkr}
          selPath={selPath}
          pathNavigationLegacy={pathNavigationLegacy}
          allPaths={paths}
          selectedPathPoint={selectedPathPoint}
          selectedPathPointIsJunction={!!selectedPathPoint && pathPointIsJunction(selectedPathPoint.pathId, selectedPathPoint.pointIndex)}
          selectedPathPointCanBeRemoved={selectedPathPointCanBeRemoved()}
          selRoute={selRoute}
          allBuildings={buildings}
          allNavNodes={campus.navNodes ?? []}
          allNavEdges={campus.navEdges ?? []}
          entranceLinkStatus={selectedEntranceLinkStatus}
          entranceOutdoorLinkStatus={selectedEntranceOutdoorStatus}
          entranceDoorOptions={selectedEntranceDoorOptions}
          selNavNode={selected?.type === 'navNode' ? (campus.navNodes ?? []).find(n => n.id === selected.id) : undefined}
          selNavEdge={selected?.type === 'navEdge' ? (campus.navEdges ?? []).find(e => e.id === selected.id) : undefined}
          navEdgeBlocked={selected?.type === 'navEdge' ? outdoorBlockedEdgeIds.has(selected.id) : undefined}
          selEventOverlay={selected?.type === 'eventOverlay' ? (campus.eventOverlays ?? []).find(ev => ev.id === selected.id) : undefined}
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
            const currentCampus = campusRef.current;
            const canonicalCampus = syncExteriorEmergencyStairGraph(currentCampus);
            const nextBuildings = canonicalCampus.buildings.filter(b => !ids.includes(b.id));
            const entrancePruned = pruneOrphanedEntranceNodes(
              nextBuildings, canonicalCampus.navNodes ?? [], canonicalCampus.navEdges ?? [],
            );
            const stairPruned = pruneOrphanedExteriorEmergencyStairNodes(
              nextBuildings, entrancePruned.nodes, entrancePruned.edges,
            );
            const next: Campus = {
              ...canonicalCampus,
              buildings: nextBuildings,
              navNodes: stairPruned.nodes,
              navEdges: stairPruned.edges,
              ...(currentCampus.decorAssets !== undefined
                ? { decorAssets: (currentCampus.decorAssets ?? []).filter((d) => !ids.includes(d.id)) }
                : {}),
            };
            campusRef.current = next;
            pushHistory(next);
            onUpdate(next);
            setMultiSelected([]);
            setSelected(null);
          }}
          onClearMultiSelect={() => { setMultiSelected([]); setShowAlignTools(false); }}
          onLayerOrder={handleLayerOrder}
          onUpdateBuilding={onUpdateBuilding}
          onAddExteriorEmergencyStair={onAddExteriorEmergencyStair}
          onUpdateExteriorEmergencyStair={onUpdateExteriorEmergencyStair}
          onDeleteExteriorEmergencyStair={onDeleteExteriorEmergencyStair}
          onAddEntrance={onAddEntrance}
          onSelectEntrance={onSelectEntrance}
          onUpdateEntrance={onUpdateEntrance}
          onDeleteEntrance={onDeleteEntrance}
          onConnectEntranceToDoor={connectEntranceToIndoorDoor}
          onConnectEntranceToWalkingNetwork={connectEntranceToWalkingNetwork}
          onDisconnectEntranceFromWalkingNetwork={disconnectEntranceFromWalkingNetwork}
          onSelectEntranceWalkingConnection={selectEntranceWalkingConnection}
          onRemoveEntranceConnection={removeEntranceConnection}
          onViewEntranceIndoorDoor={viewEntranceIndoorDoor}
          onUpdateMarker={onUpdateMarker}
          onUpdatePath={onUpdatePath}
          onSelectPath={(pathId) => {
            const networkIds = pathNetworkSelectionIds(paths, pathId, "network");
            setMultiSelected([]);
            setShowAlignTools(false);
            setSelectedPathPoint(null);
            setPathMemberEditId(networkIds.length > 1 ? pathId : null);
            setSelected({ type: "path", id: pathId });
          }}
          hoveredPathId={hoveredPathId}
          onPathHover={setHoveredPathId}
          onAddPathBend={onAddPathBend}
          onRemoveSelectedPathPoint={onRemoveSelectedPathPoint}
          onDisconnectSelectedPathPoint={onDisconnectSelectedPathPoint}
          onAddWaypointAtSelectedPathPoint={onAddWaypointAtSelectedPathPoint}
          onAddPathToNavigation={onAddPathToNavigation}
          onAddPathNetworkToNavigation={onAddPathsToNavigation}
          onGroupPaths={onGroupPaths}
          onUngroupPaths={onUngroupPaths}
          pathMemberEditing={!!pathMemberEditId}
          onExitPathMemberEdit={exitPathMemberEditToNetwork}
          onDeletePath={onDeletePath}
          onUpdateRoute={onUpdateRoute}
          onUpdateNavNode={(id, changes) => {
            const node = navNodes.find((candidate) => candidate.id === id);
            if ((node?.exteriorEmergencyStairId && !node.floorId || node?.gateId) && (changes.x !== undefined || changes.y !== undefined)) {
              toast.info(node?.gateId ? "Campus Gate anchor is locked" : "Generated Stair Exit is locked", node?.gateId
                ? "Move the physical Campus Gate to reposition its navigation anchor."
                : "Move the physical Exterior Emergency Stair to reposition its discharge anchor.");
              return;
            }
            if (node?.generatedFromPathVertices?.length && (changes.x !== undefined || changes.y !== undefined)) {
              toast.info("Pathway walking point is managed automatically", "Edit the physical Pathway vertex instead.");
              return;
            }
            pushHistory();
            onUpdate({ ...campus, navNodes: (campus.navNodes ?? []).map(n => n.id === id ? { ...n, ...changes } : n) });
          }}
          onDeleteNavNode={(id) => {
            const node = navNodes.find((candidate) => candidate.id === id);
            if (node?.pathJunction) {
              removePathJunction(id);
              return;
            }
            if (node?.exteriorEmergencyStairId && !node.floorId) {
              toast.info("Generated Stair Exit is managed automatically", "Remove the Building-owned Exterior Emergency Stair instead.");
              return;
            }
            if (node?.roomId || node?.doorId || node?.entranceId || node?.stairId || node?.elevatorId || node?.rampId || node?.gateId) {
              toast.info("Navigation anchor", "Edit or remove navigation from the owning Room, Door, Entrance, or circulation object.");
              return;
            }
            if (node?.generatedFromPathVertices?.length) {
              onRemoveGeneratedPathwayPoint(id);
              return;
            }
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
            const edge = (campus.navEdges ?? []).find((candidate) => candidate.id === id);
            let safeChanges = changes;
            if (isEntranceManagedNavEdge(edge)) {
              // Entrance connectors remain managed topology (their canonical
              // endpoints and single-connector ownership cannot be edited),
              // but their authored bend geometry is normal editor geometry.
              // Keep bendPoints/distance updates so selected connectors can be
              // reshaped without turning them into generic Walking Paths.
              const { startNodeId: _startNodeId, endNodeId: _endNodeId, type: _type, ...geometryChanges } = changes;
              safeChanges = geometryChanges;
            } else if (isPathwayGeneratedEdge(edge)) {
              const { bendPoints: _bendPoints, distance: _distance, startNodeId, endNodeId, ...routingChanges } = changes;
              const exactReverse = Boolean(edge && startNodeId === edge.endNodeId && endNodeId === edge.startNodeId);
              safeChanges = exactReverse
                ? { ...routingChanges, startNodeId, endNodeId }
                : routingChanges;
            }
            pushHistory();
            onUpdate(reconcilePathwayNavigation({
              ...campus,
              navEdges: (campus.navEdges ?? []).map(e => e.id === id ? { ...e, ...safeChanges } : e),
            }, genId));
          }}
          onBatchUpdatePaths={(ids, changes) => {
            const next: Campus = { ...campus, paths: paths.map((path) => ids.includes(path.id) ? { ...path, ...changes } : path) };
            const reconciled = reconcilePathwayNavigation(next, genId, { preserveAuthoredGeometry: true });
            onUpdate(reconciled);
            pushHistory(reconciled);
          }}
          onBatchDeletePaths={(ids) => {
            const next: Campus = { ...campus, paths: paths.filter((path) => !ids.includes(path.id)) };
            const reconciled = reconcilePathwayNavigation(next, genId, { preserveAuthoredGeometry: true });
            onUpdate(reconciled);
            pushHistory(reconciled);
            setMultiSelected([]);
            setSelected(null);
            setShowAlignTools(false);
          }}
          onAddNavEdgeBend={(id) => {
            const edge = navEdges.find((e) => e.id === id);
            const start = navNodes.find((n) => n.id === edge?.startNodeId);
            const end = navNodes.find((n) => n.id === edge?.endNodeId);
            if (!edge || !start || !end || isPathwayGeneratedEdge(edge)) return;
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
            const edge = navEdges.find((candidate) => candidate.id === id);
            if (isEntranceManagedNavEdge(edge)) {
              toast.info("Entrance connector is managed automatically", "Use Disconnect in Entrance Properties instead.");
              return;
            }
            if (isPathwayGeneratedEdge(edge)) {
              toast.info("Pathway walking path is managed automatically", "Edit or delete the owning physical Pathway instead.");
              return;
            }
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
          onClose={() => { setPropertiesDismissed(true); setPropertiesOpen(false); setSelRouteId(null); }}
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
        variant="campus"
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
                    const { buildingIds, markerIds, decorAssetIds } = batchDeleteConfirm;
                    const currentCampus = campusRef.current;
                    const canonicalCampus = syncExteriorEmergencyStairGraph(currentCampus);
                    const remainingBuildings = canonicalCampus.buildings.filter((building) => !buildingIds.includes(building.id));
                    const entrancePruned = pruneOrphanedEntranceNodes(
                      remainingBuildings, canonicalCampus.navNodes ?? [], canonicalCampus.navEdges ?? [],
                    );
                    const stairPruned = pruneOrphanedExteriorEmergencyStairNodes(
                      remainingBuildings, entrancePruned.nodes, entrancePruned.edges,
                    );
                    const nextWithoutGateSync: Campus = {
                      ...canonicalCampus,
                      buildings: remainingBuildings,
                      markers: currentCampus.markers.filter((marker) => !markerIds.includes(marker.id)),
                      decorAssets: (currentCampus.decorAssets ?? []).filter((asset) => !decorAssetIds.includes(asset.id)),
                      navNodes: stairPruned.nodes,
                      navEdges: stairPruned.edges,
                    };
                    // Batch marker removal must use the same canonical gate
                    // reconciliation as single-marker deletion; otherwise a
                    // selected Campus Gate leaves its derived anchor behind.
                    const next = syncCampusGateNavigation(nextWithoutGateSync, genId);
                    campusRef.current = next;
                    onUpdate(next);
                    pushHistory(next);
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
                    } else if (deleteConfirm.type === "building") {
                      // Route context-menu deletion through the same canonical
                      // owner cleanup as the Properties and Hierarchy panels.
                      onDeleteBuilding(deleteConfirm.id);
                    } else {
                      if (deleteConfirm.type === "marker") {
                        // Keep marker deletion on the canonical owner path so
                        // Campus Gates also release their derived navigation
                        // anchor and owned edges.  Using updMarkers directly
                        // here left a gate node orphaned after context-menu
                        // deletion even though Properties/keyboard deletion
                        // already used onDeleteMarker.
                        onDeleteMarker(deleteConfirm.id);
                      } else {
                        pushHistory();
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

      <ConfirmDialog
        open={!!entranceDeleteConfirm}
        title="Remove Building Entrance?"
        message={entranceDeleteConfirm
          ? `Removing “${entranceDeleteConfirm.name}” also removes its generated Ground-floor Door, navigation bridge, and owned connections.`
          : "Remove this Building Entrance and its linked Door?"}
        confirmLabel="Remove Entrance"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (!entranceDeleteConfirm) return;
          const pending = entranceDeleteConfirm;
          setEntranceDeleteConfirm(null);
          removeEntranceNow(pending.buildingId, pending.entranceId);
        }}
        onCancel={() => setEntranceDeleteConfirm(null)}
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

      {/* ═══════════════════════════════════════════════════════════════════
          STATUS BAR: Figma/VS Code-style footer
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="h-7 shrink-0 border-t border-border bg-card flex items-center px-3 gap-2 min-w-0 overflow-hidden">
        {/* Zoom level */}
        <div className="flex items-center gap-1.5 shrink-0">
          <ZoomIn className="h-3 w-3 text-muted-foreground/50" />
          <span className="text-[10px] font-mono text-muted-foreground/70 tabular-nums font-medium">{Math.round(zoom * 100)}%</span>
        </div>

        <div className="w-px h-3 bg-border shrink-0" />

        {/* Canvas dimensions — hidden on very narrow */}
        <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums shrink-0 hidden md:inline">{cw} × {ch}</span>

        <div className="w-px h-3 bg-border shrink-0 hidden md:block" />

        {/* Cursor position — hidden on narrow */}
        {cursorPos ? (
          <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums shrink-0 hidden sm:inline">
            X: {cursorPos.x}  Y: {cursorPos.y}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/30 shrink-0 hidden sm:inline">—</span>
        )}

        <div className="w-px h-3 bg-border shrink-0 hidden sm:block" />

        {/* Real-time error count — IssuesPopover with hover */}
        {errorCount > 0 ? (
          <IssuesPopover
            issues={validationIssues}
            onIssueClick={(issue) => {
              handleReviewIssues(issue);
            }}
          />
        ) : (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm shrink-0" style={{ background: "color-mix(in srgb, #22c55e 8%, transparent)" }}>
            <CheckCircle2 className="h-2.5 w-2.5 shrink-0" style={{ color: "#22c55e" }} />
            <span className="text-[9px] font-extrabold" style={{ color: "#22c55e" }}>OK</span>
          </div>
        )}

        <div className="flex-1 min-w-0" />

        {/* Building / marker / path counts — hidden on narrow */}
        <span className="text-[9px] text-muted-foreground/40 flex items-center gap-2 shrink-0 hidden lg:flex">
          <Square className="h-2.5 w-2.5" />
          {buildings.length} bldg{buildings.length !== 1 ? 's' : ''}
          <MapPin className="h-2.5 w-2.5 ml-1" />
          {markers.length} mrk
          <GitBranch className="h-2.5 w-2.5 ml-1" />
          {paths.length} path{paths.length !== 1 ? 's' : ''}
        </span>

        {/* Routes panel toggle (Navigation layer) — explicit action to open routes sidebar */}
        {layer === "navigation" && (
          <>
            <div className="w-px h-3 bg-border shrink-0" />
            <button
              onClick={() => setShowRoutesPanel((v) => !v)}
              className={cn(
                "flex items-center gap-1 transition-colors shrink-0",
                showRoutesPanel ? "text-green-600" : "text-muted-foreground/40 hover:text-muted-foreground"
              )}
              title={showRoutesPanel ? "Hide routes panel" : "Show routes panel"}
            >
              <Route className="h-2.5 w-2.5" />
              <span className="text-[9px] hidden sm:inline">Routes</span>
            </button>
          </>
        )}
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
